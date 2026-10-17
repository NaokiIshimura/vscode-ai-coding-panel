import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import { TerminalService } from '../services/TerminalService';
import { ITerminalService } from '../interfaces/ITerminalService';
import { openInIntegratedBrowser } from '../utils/browserUtils';

// Forward declaration for EditorProvider to avoid circular dependency
export interface IEditorProvider {
    showFile(filePath: string): Promise<void>;
    runTask(): Promise<void>;
}

// Forward declaration for PlansProvider to avoid circular dependency
export interface IPlansProvider {
    setActiveFolder(folderPath: string | undefined, force?: boolean): void;
}

// Terminal Tab interface
export interface TerminalTab {
    id: string;
    sessionId: string;
    shellName: string;
    isClaudeCodeRunning: boolean;  // Whether a Claude Code session is running
    isProcessing?: boolean;         // Whether Claude Code is processing
    isClosed?: boolean;
    commandType?: 'run' | 'plan' | 'spec';
}

export class TerminalProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'terminalView';
    private _view?: vscode.WebviewView;
    private _terminalService: ITerminalService;
    private _tabs: TerminalTab[] = [];
    private _activeTabId?: string;
    private _outputDisposables: Map<string, vscode.Disposable> = new Map();
    private _tabCounter: number = 0;
    private _tabFileMap: Map<string, string> = new Map(); // tabId -> filePath
    private _editorProvider?: IEditorProvider;
    private _plansProvider?: IPlansProvider;

    // State of output monitoring
    private _outputMonitor = new Map<string, {
        lastOutputTime: number;
        processingTimeout?: NodeJS.Timeout;
    }>();

    // Single interval for process checks (shared by all tabs)
    private _processCheckInterval?: NodeJS.Timeout;
    // Current process check interval (ms)
    private _currentCheckIntervalMs: number = TerminalProvider.PROCESS_CHECK_INTERVAL_ACTIVE;
    // Visibility state of the WebView
    private _isWebviewVisible: boolean = true;

    // Process name tracking (per tab)
    private _lastProcessNames = new Map<string, string>();

    // Disposable management
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        terminalService?: ITerminalService,
    ) {
        this._terminalService = terminalService ?? new TerminalService();
        this._setupSessionExitHandler();
    }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        // When the WebView is recreated, kill all sessions and reset
        if (this._tabs.length > 0) {
            this._cleanupAllSessions();
        }

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);

        // Watch WebView visibility change events
        this._disposables.push(
            webviewView.onDidChangeVisibility(() => {
                if (!webviewView.visible) {
                    // Save the scroll state before becoming hidden
                    this._onWebviewBecameHidden();
                } else {
                    // Restore the scroll position when shown
                    this._onWebviewBecameVisible();
                }
            })
        );

        // Receive messages from the WebView
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'ready':
                    // Create the first tab once the WebView is ready
                    await this._createTab();
                    break;
                case 'input':
                    // Send user input to the PTY
                    if (data.tabId) {
                        const tab = this._tabs.find(t => t.id === data.tabId);
                        if (tab) {
                            this._terminalService.write(tab.sessionId, data.data);
                        }
                    }
                    break;
                case 'resize':
                    // Terminal size change
                    if (data.tabId) {
                        const tab = this._tabs.find(t => t.id === data.tabId);
                        if (tab) {
                            this._terminalService.resize(tab.sessionId, data.cols, data.rows);
                        }
                    }
                    break;
                case 'openUrl':
                    // Open the URL in the default browser
                    if (data.url) {
                        vscode.env.openExternal(vscode.Uri.parse(data.url));
                    }
                    break;
                case 'openUrlInIntegratedBrowser':
                    // Open the URL in the integrated browser (Simple Browser)
                    if (data.url) {
                        await openInIntegratedBrowser(data.url as string);
                    }
                    break;
                case 'openFile':
                    // Open the file in the editor
                    if (data.path) {
                        const filePath = data.path;
                        const line = data.line;

                        // Convert a relative path to an absolute path
                        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                        const absolutePath = path.isAbsolute(filePath)
                            ? filePath
                            : path.join(workspaceFolder?.uri.fsPath || '', filePath);

                        try {
                            const uri = vscode.Uri.file(absolutePath);
                            vscode.workspace.fs.stat(uri).then(async () => {
                                const document = await vscode.workspace.openTextDocument(uri);
                                const editor = await vscode.window.showTextDocument(document);

                                if (line) {
                                    const position = new vscode.Position(line - 1, 0);
                                    editor.selection = new vscode.Selection(position, position);
                                    editor.revealRange(new vscode.Range(position, position));
                                }
                            });
                        } catch {
                            // Do nothing if the file does not exist
                        }
                    }
                    break;
                case 'createTab':
                    await this._createTab();
                    break;
                case 'activateTab':
                    await this._activateTab(data.tabId);
                    break;
                case 'clearTerminal':
                    this.clearTerminal();
                    break;
                case 'killTerminal':
                    this.killTerminal();
                    break;
                case 'sendShortcut':
                    this.handleShortcut(
                        data.command as string,
                        data.startsClaudeCode as boolean,
                        data.execute === undefined ? true : (data.execute as boolean)
                    );
                    break;
                case 'resetClaudeCodeState':
                    if (this._activeTabId) {
                        const tab = this._tabs.find(t => t.id === this._activeTabId);
                        if (tab) {
                            tab.isClaudeCodeRunning = false;
                            tab.isProcessing = false;
                            this._view?.webview.postMessage({
                                type: 'claudeCodeStateChanged',
                                tabId: tab.id,
                                isRunning: false,
                                isProcessing: false
                            });
                        }
                    }
                    break;
                case 'setClaudeCodeRunning':
                    {
                        const tabId = data.tabId as string;
                        const isRunning = data.isRunning as boolean;
                        const tab = this._tabs.find(t => t.id === tabId);
                        if (tab) {
                            tab.isClaudeCodeRunning = isRunning;
                            tab.isProcessing = isRunning;
                            this._view?.webview.postMessage({
                                type: 'claudeCodeStateChanged',
                                tabId: tab.id,
                                isRunning: isRunning,
                                isProcessing: isRunning
                            });
                        }
                    }
                    break;
                case 'runEditorTask':
                    // Cmd+R / Ctrl+R was pressed - run the Editor View Run command
                    await this._editorProvider?.runTask();
                    break;
                case 'reconnect':
                    await this._reconnectTab(data.tabId);
                    break;
            }
        });

        // Kill sessions when the WebView is disposed
        this._disposables.push(
            webviewView.onDidDispose(() => {
                this._cleanup();
            })
        );
    }

    /**
     * Handling before the WebView becomes hidden
     * - Save the current scroll state
     * - Stop process checks
     */
    private _onWebviewBecameHidden(): void {
        this._isWebviewVisible = false;

        // Stop process checks
        this._stopAllProcessChecks();

        if (!this._view) {
            return;
        }

        // Tell the WebView to save the current scroll state
        this._view.webview.postMessage({
            type: 'saveScrollPositions'
        });
    }

    /**
     * Handling when the WebView becomes visible
     * - Restore the scroll position
     * - Focus the active tab
     * - Resume process checks
     */
    private _onWebviewBecameVisible(): void {
        this._isWebviewVisible = true;

        // Resume process checks (if any tabs exist)
        if (this._tabs.length > 0) {
            this._restartProcessCheckInterval();
        }

        if (!this._view) {
            return;
        }

        // Tell the WebView to restore the scroll position (with a short delay to wait for the DOM update)
        setTimeout(() => {
            this._view?.webview.postMessage({
                type: 'restoreScrollPositions'
            });
        }, 50);

        // Focus the active tab (delayed further so it runs after the scroll restore)
        setTimeout(() => {
            this._view?.webview.postMessage({
                type: 'focus'
            });
        }, 200);
    }

    private static readonly MAX_TABS = 5;

    // Process check interval constants
    private static readonly PROCESS_CHECK_INTERVAL_ACTIVE = 1500;  // Claude Code running: 1.5 seconds
    private static readonly PROCESS_CHECK_INTERVAL_IDLE = 3000;    // Not running in any tab: 3 seconds

    // Precompiled regular expressions for stripping escape sequences
    private static readonly RE_CSI = /\x1b\[[\?0-9;]*[a-zA-Z]/g;
    private static readonly RE_OSC = /\x1b\].*?(\x07|\x1b\\)/g;
    private static readonly RE_CONTROL = /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g;

    private async _createTab(): Promise<void> {
        if (!this._terminalService.isAvailable()) {
            this._view?.webview.postMessage({
                type: 'error',
                message: this._terminalService.getUnavailableReason()
            });
            return;
        }

        // Check the tab limit
        if (this._tabs.length >= TerminalProvider.MAX_TABS) {
            vscode.window.showWarningMessage(`Maximum ${TerminalProvider.MAX_TABS} terminal tabs allowed.`);
            return;
        }

        try {
            // Get the workspace root
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

            // Get the shell name
            const config = vscode.workspace.getConfiguration('aiCodingSidebar');
            let shellPath = config.get<string>('terminal.shell') || process.env.SHELL || '/bin/bash';

            // Check that the shell path exists and fall back if not
            try {
                await fs.access(shellPath);
            } catch (error) {
                console.warn(`Configured shell not found: ${shellPath}, falling back to /bin/bash`);
                shellPath = '/bin/bash';
                try {
                    await fs.access(shellPath);
                } catch (fallbackError) {
                    throw new Error(`No valid shell found. Tried: ${config.get<string>('terminal.shell')}, ${process.env.SHELL}, /bin/bash`);
                }
            }

            const shellName = path.basename(shellPath);

            // Create a new session
            const sessionId = await this._terminalService.createSession(workspaceRoot);

            // Create the tab
            const tabId = `tab-${++this._tabCounter}`;
            const tab: TerminalTab = {
                id: tabId,
                sessionId: sessionId,
                shellName: shellName,
                isClaudeCodeRunning: false,
                isProcessing: false
            };
            this._tabs.push(tab);

            // Set up the output listener
            this._setupSessionOutput(tab);

            // Set up output monitoring
            this._setupOutputMonitoring(tab);

            // Start process-based Claude Code detection
            this._startProcessCheck(tab);

            // Notify tab creation
            this._view?.webview.postMessage({
                type: 'tabCreated',
                tabId: tabId,
                shellName: shellName,
                tabIndex: this._tabs.length
            });

            // Activate the new tab
            await this._activateTab(tabId);

            // Update the button visibility
            this._updateNewTabButtonVisibility();
        } catch (error) {
            console.error('Failed to create terminal tab:', error);
            this._view?.webview.postMessage({
                type: 'error',
                message: `Failed to create terminal: ${error}`
            });
        }
    }

    private async _activateTab(tabId: string): Promise<void> {
        const tab = this._tabs.find(t => t.id === tabId);
        if (tab) {
            this._activeTabId = tabId;
            this._view?.webview.postMessage({
                type: 'tabActivated',
                tabId: tabId
            });

            // If the tab has an associated file, open it in the Editor View
            await this._openAssociatedFile(tabId);
        }
    }

    /**
     * Open the file associated with the tab in the Editor View and move the Plans View to its parent directory
     *
     * If the directory has been renamed, resolve the new path and update the association too
     */
    private async _openAssociatedFile(tabId: string): Promise<void> {
        const associatedFilePath = this._tabFileMap.get(tabId);
        if (!associatedFilePath || !this._editorProvider) {
            return;
        }

        const resolvedFilePath = await this._resolveAssociatedFilePath(associatedFilePath);
        if (!resolvedFilePath) {
            // Opening a file that cannot be tracked causes an error in the Editor View, so drop the association
            this._tabFileMap.delete(tabId);
            return;
        }

        if (resolvedFilePath !== associatedFilePath) {
            this._tabFileMap.set(tabId, resolvedFilePath);
        }

        await this._editorProvider.showFile(resolvedFilePath);

        // Switch the Plans View directory as well
        if (this._plansProvider) {
            const parentDir = path.dirname(resolvedFilePath);
            this._plansProvider.setActiveFolder(parentDir, false);
        }
    }

    /**
     * Resolve the current path of the associated file
     *
     * The Quick Start template tells the AI agent to rename the directory to match the task (v1.0.20).
     * Only the directory is renamed and the file name stays the same, so
     * look for a file with the same name in the sibling directories of the original directory and use that path
     *
     * @returns The resolved path, or undefined if not found
     */
    private async _resolveAssociatedFilePath(filePath: string): Promise<string | undefined> {
        if (await this._pathExists(filePath)) {
            return filePath;
        }

        const fileName = path.basename(filePath);
        const parentPath = path.dirname(path.dirname(filePath));

        let siblingNames: string[];
        try {
            siblingNames = await fs.readdir(parentPath);
        } catch {
            return undefined;
        }

        for (const siblingName of siblingNames) {
            const candidatePath = path.join(parentPath, siblingName, fileName);
            if (await this._pathExists(candidatePath)) {
                return candidatePath;
            }
        }

        return undefined;
    }

    private async _pathExists(targetPath: string): Promise<boolean> {
        try {
            await fs.access(targetPath);
            return true;
        } catch {
            return false;
        }
    }

    private _updateNewTabButtonVisibility(): void {
        // Hide the button when the tab count has reached the maximum
        const shouldHideButton = this._tabs.length >= TerminalProvider.MAX_TABS;
        this._view?.webview.postMessage({
            type: 'updateNewTabButtonVisibility',
            visible: !shouldHideButton
        });
    }

    private _closeTab(tabId: string): void {
        const tabIndex = this._tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return;

        const tab = this._tabs[tabIndex];

        // Stop process checks
        this._stopProcessCheck(tab);

        // Clean up output monitoring (clear processingTimeout and delete the Map entry)
        this._cleanupOutputMonitoring(tabId);

        // Dispose of the output listener
        const disposable = this._outputDisposables.get(tabId);
        if (disposable) {
            disposable.dispose();
            this._outputDisposables.delete(tabId);
        }

        // Delete the process name tracking entry
        this._lastProcessNames.delete(tabId);

        // Kill the session
        this._terminalService.killSession(tab.sessionId);

        // Delete the file path entry associated with the tab
        this._tabFileMap.delete(tabId);

        // Remove the tab
        this._tabs.splice(tabIndex, 1);

        // Notify tab removal
        this._view?.webview.postMessage({
            type: 'tabClosed',
            tabId: tabId
        });

        // If the active tab was closed, activate another tab
        if (this._activeTabId === tabId) {
            if (this._tabs.length > 0) {
                // Activate the previous tab or the last tab
                const newActiveIndex = Math.min(tabIndex, this._tabs.length - 1);
                void this._activateTab(this._tabs[newActiveIndex].id);
            } else {
                this._activeTabId = undefined;
                // When no tabs remain, create one automatically
                this._createTab();
            }
        }

        // Update the button visibility
        this._updateNewTabButtonVisibility();
    }

    private _cleanup(): void {
        // Stop process checks
        this._stopAllProcessChecks();

        // Dispose of all output listeners
        this._outputDisposables.forEach(disposable => disposable.dispose());
        this._outputDisposables.clear();

        // Clean up output monitoring
        this._tabs.forEach(tab => {
            this._cleanupOutputMonitoring(tab.id);
        });
        this._outputMonitor.clear();

        // Clear process name tracking
        this._lastProcessNames.clear();

        // Kill all sessions
        this._tabs.forEach(tab => {
            this._terminalService.killSession(tab.sessionId);
        });
        this._tabs = [];
        this._activeTabId = undefined;
        this._tabFileMap.clear();
    }

    public clearTerminal(): void {
        if (this._activeTabId) {
            this._view?.webview.postMessage({ type: 'clear', tabId: this._activeTabId });
        }
    }

    public killTerminal(): void {
        // Close only the active tab
        if (this._activeTabId) {
            this._closeTab(this._activeTabId);
        }
    }

    public async newTerminal(): Promise<void> {
        await this._createTab();
    }

    /**
     * Return whether Claude Code is running in the active tab
     *
     * While it is running, the content of sendCommand() is treated as input text instead of being run as a command, so
     * this is used to decide whether a new session will start
     */
    public isClaudeCodeRunning(): boolean {
        if (!this._activeTabId) {
            return false;
        }
        const tab = this._tabs.find(t => t.id === this._activeTabId);
        return tab?.isClaudeCodeRunning ?? false;
    }

    /**
     * Send a command to the terminal
     * @param command Command to run
     * @param addNewline Whether to append a newline (default: true; automatically false while Claude Code is running)
     * @param filePath Path of the file the command was sent from (optional)
     * @param commandType Command type (optional)
     */
    public async sendCommand(command: string, addNewline: boolean = true, filePath?: string, commandType?: 'run' | 'plan' | 'spec'): Promise<void> {
        // Create a tab if there is none
        if (this._tabs.length === 0) {
            await this._createTab();
        }

        // Send to the active tab
        if (this._activeTabId) {
            const tab = this._tabs.find(t => t.id === this._activeTabId);
            if (tab) {
                // While Claude Code is running, send the command text and then send Enter separately
                if (tab.isClaudeCodeRunning) {
                    this._terminalService.write(tab.sessionId, command);
                    setTimeout(() => {
                        this._terminalService.write(tab.sessionId, '\r');
                    }, 100);
                } else {
                    // Shell state: send the command + newline
                    const commandToSend = addNewline ? command + '\n' : command;
                    this._terminalService.write(tab.sessionId, commandToSend);
                }

                // For a Claude Code command, switch to the processing state immediately
                if (command.trim().startsWith('claude')) {
                    tab.isClaudeCodeRunning = true;
                    tab.isProcessing = true;
                    this._view?.webview.postMessage({
                        type: 'claudeCodeStateChanged',
                        tabId: tab.id,
                        isRunning: true,
                        isProcessing: true
                    });
                }

                // If a file path was given, associate it with the active tab
                if (filePath) {
                    this._tabFileMap.set(this._activeTabId, filePath);
                }

                // If commandType was given, store it on the tab and update the UI
                if (commandType) {
                    tab.commandType = commandType;
                    this._view?.webview.postMessage({
                        type: 'updateTabCommandType',
                        tabId: this._activeTabId,
                        commandType: commandType
                    });
                }
            }
        }
    }

    /**
     * Create a new tab and send the command to it
     *
     * Used when Claude Code is running in the active tab, so the command is run in a new shell
     * instead of being sent as input text
     * @returns true if sent (false if the tab could not be created, e.g. because the tab limit was reached)
     */
    public async sendCommandInNewTab(command: string, filePath?: string, commandType?: 'run' | 'plan' | 'spec'): Promise<boolean> {
        const tabCount = this._tabs.length;
        await this._createTab();

        // _createTab() does not report failure, so check whether the tab count increased to tell if it was created
        if (this._tabs.length === tabCount) {
            return false;
        }

        await this.sendCommand(command, true, filePath, commandType);
        return true;
    }

    /**
     * Handle a shortcut command
     * @param command Command to run
     * @param startsClaudeCode Whether the command starts Claude Code
     * @param execute Whether to send a newline and run the command (insert only if false)
     */
    public handleShortcut(command: string, startsClaudeCode: boolean, execute: boolean = true): void {
        if (!command) {
            return;
        }

        if (this._activeTabId) {
            const tab = this._tabs.find(t => t.id === this._activeTabId);
            if (tab) {
                if (!execute) {
                    // Insert only: do not send a newline and do not change the Claude Code running state
                    this._terminalService.write(tab.sessionId, command);
                } else if (tab.isClaudeCodeRunning) {
                    // Claude Code running: send the command text and then send Enter separately
                    this._terminalService.write(tab.sessionId, command);
                    setTimeout(() => {
                        this._terminalService.write(tab.sessionId, '\r');
                    }, 100);
                } else {
                    // Shell: send the command + newline
                    this._terminalService.write(tab.sessionId, command + '\n');

                    // Update the state
                    if (startsClaudeCode) {
                        tab.isClaudeCodeRunning = true;
                        tab.isProcessing = true;
                        // Notify the WebView of the state
                        this._view?.webview.postMessage({
                            type: 'claudeCodeStateChanged',
                            tabId: tab.id,
                            isRunning: true,
                            isProcessing: true
                        });
                    }
                }
            }
        }
    }

    /**
     * Insert multiple paths into the terminal (no newline)
     * @param paths Array of paths to insert
     */
    public async insertPaths(paths: string[]): Promise<void> {
        // Create a tab if there is none
        if (this._tabs.length === 0) {
            await this._createTab();
        }

        // Send to the active tab
        if (this._activeTabId) {
            const tab = this._tabs.find(t => t.id === this._activeTabId);
            if (tab) {
                const pathText = paths.join(' ');
                this._terminalService.write(tab.sessionId, pathText);
            }
        }

        // Focus the Terminal View
        this.focus();
    }

    /**
     * Focus the Terminal View
     */
    public focus(): void {
        if (this._view) {
            // Move focus with preserveFocus: false
            this._view.show(false);
            // Focus xterm inside the WebView
            this._view.webview.postMessage({ type: 'focus' });
        }
    }

    private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        // Get the local resource URIs for xterm.js
        const xtermCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'xterm', 'xterm.css'));
        const xtermJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'xterm', 'xterm.js'));
        const xtermFitUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'xterm', 'xterm-addon-fit.js'));
        const xtermUnicode11Uri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'xterm', 'xterm-addon-unicode11.js'));

        // Get the URIs of external resources
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'terminal', 'style.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'terminal', 'main.js'));
        const templatePath = vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'terminal', 'index.html');

        // Get the settings
        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
        const fontSize = config.get<number>('terminal.fontSize', 12);
        const fontFamily = config.get<string>('terminal.fontFamily', 'monospace');
        const cursorStyle = config.get<string>('terminal.cursorStyle', 'block');
        const cursorBlink = config.get<boolean>('terminal.cursorBlink', true);
        const scrollback = config.get<number>('terminal.scrollback', 1000);

        // Build the terminal settings as a JSON string and HTML-escape it
        // HTML escaping is required because it is embedded in a data attribute
        const configObj = {
            fontSize,
            fontFamily,
            cursorStyle,
            cursorBlink,
            scrollback
        };
        const configJson = JSON.stringify(configObj);
        // HTML escape (for embedding in a data attribute)
        const terminalConfig = configJson
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Load the HTML template
        const htmlTemplate = await fs.readFile(templatePath.fsPath, 'utf8');

        // Replace the template variables
        const result = htmlTemplate
            .replace(/\{\{cspSource\}\}/g, webview.cspSource)
            .replace(/\{\{xtermCssUri\}\}/g, xtermCssUri.toString())
            .replace(/\{\{styleUri\}\}/g, styleUri.toString())
            .replace(/\{\{xtermJsUri\}\}/g, xtermJsUri.toString())
            .replace(/\{\{xtermFitUri\}\}/g, xtermFitUri.toString())
            .replace(/\{\{xtermUnicode11Uri\}\}/g, xtermUnicode11Uri.toString())
            .replace(/\{\{terminalConfig\}\}/g, terminalConfig)
            .replace(/\{\{scriptUri\}\}/g, scriptUri.toString());

        return result;
    }

    /**
     * Clean up all sessions
     */
    private _cleanupAllSessions(): void {
        // Clean up each tab
        for (const tab of this._tabs) {
            // Clean up output monitoring
            this._cleanupOutputMonitoring(tab.id);

            // Kill the session
            this._terminalService.killSession(tab.sessionId);

            // Remove the output listener
            const disposable = this._outputDisposables.get(tab.id);
            if (disposable) {
                disposable.dispose();
            }
        }

        this._outputDisposables.clear();
        this._tabs = [];
        this._activeTabId = undefined;
        this._tabFileMap.clear();
    }

    /**
     * Strip escape sequences and control characters
     */
    private _stripEscapeSequences(data: string): string {
        return data
            .replace(TerminalProvider.RE_CSI, '')
            .replace(TerminalProvider.RE_OSC, '')
            .replace(TerminalProvider.RE_CONTROL, '');
    }

    /**
     * Set up the output listener for the session
     */
    private _setupSessionOutput(tab: TerminalTab): void {
        const disposable = this._terminalService.onOutput(tab.sessionId, (data) => {
            // Forward output to the WebView
            this._view?.webview.postMessage({
                type: 'output',
                tabId: tab.id,
                data: data
            });

            // Strip escape sequences only once and pass the cleaned data on
            const cleanData = this._stripEscapeSequences(data);

            // Claude Code state detection
            this._detectClaudeCodeState(tab, cleanData);

            // Detect processing completion (timeout based)
            this._handleProcessingTimeout(tab, cleanData);
        });

        this._outputDisposables.set(tab.id, disposable);
    }

    /**
     * Handle output (addresses Codex review item P2: adaptive timeout)
     * @param cleanData Data with escape sequences already stripped
     */
    private _handleProcessingTimeout(tab: TerminalTab, cleanData: string): void {
        const monitor = this._outputMonitor.get(tab.id);
        if (!monitor) {
            return;
        }

        const trimmedData = cleanData.trim();

        // Output patterns to ignore (noise such as focus changes)
        const isNoise = trimmedData.length === 0 || // Empty output
                        /^[\r\n\s]+$/.test(trimmedData) || // Only newlines/whitespace
                        /^[T]+$/.test(trimmedData) || // Only "T" (leftover from control characters)
                        /^[\u2800-\u28FF\u2500-\u257F\u25A0-\u25FF]+$/.test(trimmedData) || // Only box-drawing characters or block elements
                        /^[░▒▓█◯◉●○◐◑◒◓]+$/.test(trimmedData) || // Only graphic characters such as progress bars
                        /^\[░+\]\s*\d+%$/.test(trimmedData) || // Progress bar format
                        /^❯\s*$/.test(trimmedData); // Prompt only

        if (isNoise) {
            return;
        }

        // If Claude Code is running and not processing, switch to processing
        if (tab.isClaudeCodeRunning && !tab.isProcessing) {
            tab.isProcessing = true;
            this._view?.webview.postMessage({
                type: 'claudeCodeStateChanged',
                tabId: tab.id,
                isRunning: true,
                isProcessing: true
            });
        }

        monitor.lastOutputTime = Date.now();

        // Clear the existing timeout
        if (monitor.processingTimeout) {
            clearTimeout(monitor.processingTimeout);
        }

        // Treat processing as complete if there is no meaningful output for 2 seconds
        monitor.processingTimeout = setTimeout(() => {
            if (tab.isClaudeCodeRunning && tab.isProcessing) {
                tab.isProcessing = false;

                this._view?.webview.postMessage({
                    type: 'claudeCodeStateChanged',
                    tabId: tab.id,
                    isRunning: true,
                    isProcessing: false
                });
            }
        }, 2000);
    }

    /**
     * Fallback: detection by pattern matching
     * @param cleanData Data with escape sequences already stripped
     */
    private _detectClaudeCodeState(tab: TerminalTab, cleanData: string): void {
        // Detect Claude Code startup
        if (!tab.isClaudeCodeRunning) {
            const claudeStartPatterns = [
                /claude>\s*$/,
                /╭─/,
                /Entering interactive mode/i,
                /Type \/help/i,
                /Claude Code.*❯/,
                /❯\s*$/,
                /Claude Code/
            ];

            for (const pattern of claudeStartPatterns) {
                if (pattern.test(cleanData)) {
                    tab.isClaudeCodeRunning = true;
                    tab.isProcessing = true;

                    this._view?.webview.postMessage({
                        type: 'claudeCodeStateChanged',
                        tabId: tab.id,
                        isRunning: true,
                        isProcessing: true
                    });
                    break;
                }
            }
        }

        // Detect Claude Code exit (by detecting the shell prompt)
        if (tab.isClaudeCodeRunning) {
            const lines = cleanData.split('\n').filter(line => line.trim().length > 0);
            const recentLines = lines.slice(-10);
            const userPromptPattern = /[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+/;

            for (const line of recentLines) {
                if (userPromptPattern.test(line)) {
                    tab.isClaudeCodeRunning = false;
                    tab.isProcessing = false;

                    this._view?.webview.postMessage({
                        type: 'claudeCodeStateChanged',
                        tabId: tab.id,
                        isRunning: false,
                        isProcessing: false
                    });
                    break;
                }
            }
        }
    }

    /**
     * Reconnect the tab's session
     */
    private async _reconnectTab(tabId: string): Promise<void> {
        const tab = this._tabs.find(t => t.id === tabId);
        if (!tab) {
            return;
        }

        try {
            // Clean up output monitoring
            this._cleanupOutputMonitoring(tab.id);

            // Remove the old output listener
            const oldDisposable = this._outputDisposables.get(tab.id);
            if (oldDisposable) {
                oldDisposable.dispose();
                this._outputDisposables.delete(tab.id);
            }

            // Create a new session
            const newSessionId = await this._terminalService.createSession();
            tab.sessionId = newSessionId;
            tab.isClosed = false;
            tab.isClaudeCodeRunning = false;
            tab.isProcessing = false;

            // Set up the output listener
            this._setupSessionOutput(tab);

            // Set up output monitoring
            this._setupOutputMonitoring(tab);

            // Resume process-based Claude Code detection
            this._startProcessCheck(tab);

            // Notify the WebView that reconnection is complete
            this._view?.webview.postMessage({
                type: 'sessionReconnected',
                tabId: tab.id
            });
        } catch (error) {
            console.error('Failed to reconnect terminal session:', error);
            this._view?.webview.postMessage({
                type: 'error',
                message: 'Failed to reconnect terminal session'
            });
        }
    }

    /**
     * Set up the session exit handler
     */
    private _setupSessionExitHandler(): void {
        this._terminalService.onSessionExit((sessionId, exitCode, signal) => {
            const tab = this._tabs.find(t => t.sessionId === sessionId);
            if (tab) {
                tab.isClosed = true;
                tab.isClaudeCodeRunning = false;

                // Notify the WebView of the exit
                this._view?.webview.postMessage({
                    type: 'sessionClosed',
                    tabId: tab.id,
                    exitCode,
                    signal
                });
            }
        });
    }

    /**
     * Initialization check for process monitoring
     */
    /**
     * Set up output monitoring
     */
    private _setupOutputMonitoring(tab: TerminalTab): void {
        this._outputMonitor.set(tab.id, {
            lastOutputTime: Date.now()
        });
    }

    /**
     * Clean up output monitoring
     */
    private _cleanupOutputMonitoring(tabId: string): void {
        const monitor = this._outputMonitor.get(tabId);
        if (monitor?.processingTimeout) {
            clearTimeout(monitor.processingTimeout);
        }
        this._outputMonitor.delete(tabId);
    }

    /**
     * Set the EditorProvider
     */
    public setEditorProvider(provider: IEditorProvider): void {
        this._editorProvider = provider;
    }

    /**
     * Set the PlansProvider
     */
    public setPlansProvider(provider: IPlansProvider): void {
        this._plansProvider = provider;
    }

    /**
     * Start process checks (a single interval checks all tabs)
     * Called when a tab is added
     */
    private _startProcessCheck(_tab: TerminalTab): void {
        // If the interval is already running and the WebView is visible, only run the initial check
        if (this._processCheckInterval && this._isWebviewVisible) {
            this._checkClaudeCodeProcess(_tab);
            return;
        }

        // Do not start the interval while the WebView is hidden
        if (!this._isWebviewVisible) {
            return;
        }

        // Start the interval
        this._restartProcessCheckInterval();

        // Run the initial check immediately
        this._checkClaudeCodeProcess(_tab);
    }

    /**
     * (Re)start the process check interval
     */
    private _restartProcessCheckInterval(): void {
        // Stop the existing interval
        this._stopAllProcessChecks();

        // Do not start the interval when there are no tabs
        if (this._tabs.length === 0) {
            return;
        }

        // Do not start the interval while the WebView is hidden
        if (!this._isWebviewVisible) {
            return;
        }

        // Determine the adaptive interval
        const interval = this._determineCheckInterval();
        this._currentCheckIntervalMs = interval;

        // Set the interval that checks all tabs at once
        this._processCheckInterval = setInterval(async () => {
            await this._checkAllTabsProcess();
        }, interval);
    }

    /**
     * Determine the adaptive check interval
     * If any tab is running Claude Code: 1.5 seconds
     * If no tab is running it: 3 seconds
     */
    private _determineCheckInterval(): number {
        const hasClaudeCodeRunning = this._tabs.some(tab => tab.isClaudeCodeRunning);
        return hasClaudeCodeRunning
            ? TerminalProvider.PROCESS_CHECK_INTERVAL_ACTIVE
            : TerminalProvider.PROCESS_CHECK_INTERVAL_IDLE;
    }

    /**
     * Run the process check for all tabs
     */
    private async _checkAllTabsProcess(): Promise<void> {
        for (const tab of this._tabs) {
            if (!tab.isClosed) {
                await this._checkClaudeCodeProcess(tab);
            }
        }

        // Re-evaluate the interval after the check (restart only if the state changed)
        const newInterval = this._determineCheckInterval();
        if (newInterval !== this._currentCheckIntervalMs) {
            this._restartProcessCheckInterval();
        }
    }

    /**
     * Stop process checks (kept for compatibility when removing tabs)
     */
    private _stopProcessCheck(_tab: TerminalTab): void {
        // Stop the interval only when no tabs remain
        // (Called from _closeTab before the tab is removed, so judge by length - 1)
        if (this._tabs.length <= 1) {
            this._stopAllProcessChecks();
        }
    }

    /**
     * Stop the interval for all process checks
     */
    private _stopAllProcessChecks(): void {
        if (this._processCheckInterval) {
            clearInterval(this._processCheckInterval);
            this._processCheckInterval = undefined;
        }
    }

    /**
     * Check and update the state of the Claude Code process
     * Uses getProcessTree() to get both the Claude Code detection and the foreground process name with a single ps command
     */
    private async _checkClaudeCodeProcess(tab: TerminalTab): Promise<void> {
        try {
            // Get both the Claude Code detection and the foreground process name with a single ps command
            const result = await this._terminalService.getProcessTree(tab.sessionId);

            // Update only if the Claude Code state changed
            if (tab.isClaudeCodeRunning !== result.isClaudeCodeRunning) {
                tab.isClaudeCodeRunning = result.isClaudeCodeRunning;

                // If Claude Code exited, also reset the processing state
                if (!result.isClaudeCodeRunning) {
                    tab.isProcessing = false;
                }

                // Notify the WebView of the state
                this._view?.webview.postMessage({
                    type: 'claudeCodeStateChanged',
                    tabId: tab.id,
                    isRunning: result.isClaudeCodeRunning,
                    isProcessing: tab.isProcessing || false
                });
            }

            // Get the foreground process name and update the tab name
            this._updateTabNameFromProcessTree(tab, result.foregroundProcess);
        } catch (error) {
            console.error(`[TerminalProvider] Error checking Claude Code process:`, error);
        }
    }

    /**
     * Update the tab name from the result of getProcessTree()
     */
    private _updateTabNameFromProcessTree(tab: TerminalTab, processName: string | null): void {
        const lastProcessName = this._lastProcessNames.get(tab.id);
        if (processName && processName !== lastProcessName) {
            this._lastProcessNames.set(tab.id, processName);
            this._updateTabNameWithProcess(tab.id, processName);
        } else if (!processName && lastProcessName) {
            // If the process exited, revert to the shell name
            this._lastProcessNames.delete(tab.id);
            this._updateTabNameWithProcess(tab.id, tab.shellName);
        }
    }

    /**
     * Update the tab name with the process name
     */
    private _updateTabNameWithProcess(tabId: string, processName: string): void {
        const tab = this._tabs.find(t => t.id === tabId);
        if (!tab) {
            return;
        }

        // Build the tab name from the process name
        const displayName = this._getDisplayName(processName);

        // Notify the WebView of the tab name update
        this._view?.webview.postMessage({
            type: 'updateTabName',
            tabId: tabId,
            processName: displayName
        });
    }

    /**
     * Build the display name from the process name
     */
    private _getDisplayName(processName: string): string {
        // Clean up the process name
        // e.g. "/usr/bin/vim" -> "vim", "bash" -> "bash"
        const baseName = processName.split('/').pop() || processName;
        return baseName;
    }

    dispose(): void {
        this._cleanup();
        this._terminalService.dispose();

        // Stop process checks (_cleanup also stops them, but do it here just in case)
        this._stopAllProcessChecks();

        // Clear process name tracking
        this._lastProcessNames.clear();

        // Dispose of the Disposables
        for (const disposable of this._disposables) {
            disposable.dispose();
        }
        this._disposables = [];
    }
}
