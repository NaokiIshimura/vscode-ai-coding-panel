import * as vscode from 'vscode';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PlansProvider } from './PlansProvider';
import { TemplateService, SendCommandType, SESSION_METADATA_FILE_NAME, isValidSessionId } from '../services/TemplateService';
import { PromptTemplateService, PromptTemplateTarget } from '../services/PromptTemplateService';
import { openInIntegratedBrowser } from '../utils/browserUtils';

// Forward declaration for TerminalProvider to avoid circular dependency
export interface ITerminalProvider {
    focus(): void;
    sendCommand(command: string, addNewline?: boolean, filePath?: string, commandType?: 'run' | 'plan' | 'spec'): Promise<void>;
    isClaudeCodeRunning?(): boolean;
    /**
     * Create a new tab and send the command
     * @returns true if sent (false if the tab could not be created, e.g. because the tab limit was reached)
     */
    sendCommandInNewTab?(command: string, filePath?: string, commandType?: 'run' | 'plan' | 'spec'): Promise<boolean>;
}

/**
 * Command to send, and the command to resume that session
 */
interface ResumeSession {
    /** Command prefix with --session-id added */
    commandPrefix: string;
    /** Resume command to record in the sent history (undefined if the session ID could not be added) */
    resumeCommand?: string;
}

/**
 * Claude CLI options that conflict with specifying a session
 * If any of them is already specified, --session-id is not added
 */
const RESUME_CONFLICTING_OPTIONS = /(^|\s)(--session-id|--resume|-r|--continue|-c|--fork-session)(\s|=|$)/;

/**
 * Determine whether the command prefix launches claude
 * Paths are also covered (e.g. /usr/local/bin/claude)
 */
const CLAUDE_EXECUTABLE_PATTERN = /^(\S*[/\\])?claude(\s|$)/;

/**
 * Type of output instruction sent to the running Claude Code (output md / output memory buttons)
 */
export type SessionPromptType = 'md' | 'memory';

/**
 * Setting key and default value for each output instruction
 * Must not contain line breaks because it is sent as text to the Claude Code input field
 */
const SESSION_PROMPTS: Record<SessionPromptType, { settingKey: string; defaultPrompt: string }> = {
    md: {
        settingKey: 'editor.outputMdPrompt',
        defaultPrompt: 'Record the current status of this task as a Markdown file. Save it as a timestamped file (format: YYYY_MMDD_HHMM_SS_status.md) in ${dirPath}. State what is done, what is left, and why each decision was made.'
    },
    memory: {
        settingKey: 'editor.outputMemoryPrompt',
        defaultPrompt: 'Record the reusable knowledge from this session as a Markdown file. Save it as a timestamped file (format: YYYY_MMDD_HHMM_SS_memory.md) in ${dirPath}. Include user preferences, project conventions, and pitfalls you hit with the reason for each. Do not repeat what is already recorded in the repository.'
    }
};

/**
 * Heading for the output md instruction appended to the body sent by Run
 * Placed before the instruction as a Markdown heading so it can be told apart from the instructions in the body
 */
export const OUTPUT_MD_HEADING = '# output md';

/**
 * Append the output md instruction with its heading to the end of the body sent by Run, separated by a blank line (when Quick Run is disabled)
 * Return the body as is if the instruction is empty (to avoid appending only the heading)
 */
export function appendOutputMdPrompt(content: string, prompt: string): string {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
        return content;
    }
    const section = `${OUTPUT_MD_HEADING}\n${trimmedPrompt}`;
    const trimmedContent = content.trim();
    return trimmedContent ? `${trimmedContent}\n\n${section}` : section;
}

export class EditorProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'markdownEditor';
    private _view?: vscode.WebviewView;
    private _currentFilePath?: string;
    private _currentContent?: string;
    private _pendingContent?: string;
    private _isDirty: boolean = false;
    // PlansProvider reference for file details display (legacy name, same as _plansProvider)
    private _detailsProvider?: PlansProvider;
    // PlansProvider reference for directory navigation and file operations
    private _plansProvider?: PlansProvider;
    private _terminalProvider?: ITerminalProvider;
    private _pendingFileToRestore?: string;
    private _disposables: vscode.Disposable[] = [];
    private templateService: TemplateService;
    private promptTemplateService?: PromptTemplateService;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        templateService?: TemplateService,
        promptTemplateService?: PromptTemplateService,
    ) {
        this.templateService = templateService ?? new TemplateService();
        this.promptTemplateService = promptTemplateService;
        // Watch for active editor changes
        this._disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                this._checkAndUpdateReadOnlyState(editor);
            })
        );

        // Watch for tab group changes (detect tabs being opened, closed, or moved)
        this._disposables.push(
            vscode.window.tabGroups.onDidChangeTabs(event => {
                this._checkAndUpdateReadOnlyState(undefined);
            })
        );

        // Watch for file saves and update the Editor View
        this._disposables.push(
            vscode.workspace.onDidSaveTextDocument(async (document) => {
                // Check whether the saved file matches the file currently open in the Editor View
                if (this._currentFilePath && document.uri.fsPath === this._currentFilePath) {
                    try {
                        // Reload the file content
                        const content = await fs.promises.readFile(this._currentFilePath, 'utf8');

                        // Update only if the content has changed
                        if (content !== this._currentContent) {
                            this._currentContent = content;
                            this._pendingContent = undefined;
                            this._isDirty = false;

                            const displayPath = path.basename(this._currentFilePath);
                            const isOpenInEditor = this._isFileOpenInTab(this._currentFilePath);

                            // Send the updated content to the Webview
                            if (this._view) {
                                this._view.webview.postMessage({
                                    type: 'showContent',
                                    filePath: displayPath,
                                    content: content,
                                    isReadOnly: isOpenInEditor
                                });
                            }
                        }
                    } catch (error) {
                        console.error(`Failed to reload file after save: ${error}`);
                    }
                }
            })
        );
    }

    /**
     * Check whether the file is open in a VS Code tab
     */
    private _isFileOpenInTab(filePath: string): boolean {
        // Check all tab groups
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (tab.input instanceof vscode.TabInputText) {
                    if (tab.input.uri.fsPath === filePath) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * Safely escape a value embedded in a command template
     *
     * Templates are expected to wrap the value in double quotes (e.g. `${commandPrefix} "${editorContent}"`),
     * so double quotes are also added around the return value to close that quote once,
     * protect the value itself with single quotes, and then reopen the quote.
     * The shell concatenates adjacent quoted strings, so the result is still treated as a single argument.
     *
     * Inside double quotes ` $ \ are expanded, and interactive shells even perform ! history expansion,
     * so unless the value is protected with single quotes, Markdown code fences and the like break the command.
     */
    private _escapeShellArgument(arg: string): string {
        // Replace inner single quotes with '\'' and wrap the whole value in single quotes, then in double quotes
        return `"'${arg.replace(/'/g, "'\\''")}'"`;
    }

    /**
     * Get a command template from the settings
     *
     * To avoid losing the settings of users who set a value on the old key,
     * inherit the old key's value only when the new key is not set
     *
     * @param config The aiCodingSidebar configuration
     * @param section New setting key (under aiCodingSidebar)
     * @param deprecatedSection Old setting key (under aiCodingSidebar)
     * @param defaultValue Default value used when neither key is set
     */
    private _getCommandTemplate(
        config: vscode.WorkspaceConfiguration,
        section: string,
        deprecatedSection: string,
        defaultValue: string
    ): string {
        const current = config.inspect<string>(section);
        const isConfigured = current?.workspaceFolderValue !== undefined
            || current?.workspaceValue !== undefined
            || current?.globalValue !== undefined;

        if (!isConfigured) {
            const deprecated = config.inspect<string>(deprecatedSection);
            const deprecatedValue = deprecated?.workspaceFolderValue
                ?? deprecated?.workspaceValue
                ?? deprecated?.globalValue;
            if (deprecatedValue !== undefined) {
                return deprecatedValue;
            }
        }

        return config.get<string>(section, defaultValue);
    }

    /**
     * Add --session-id to the command prefix so that the Claude Code session can be resumed later
     *
     * In the following cases no session ID is added and the prefix is returned as is
     * - The setting to record resume commands is turned off
     * - The prefix is not claude, or a session is already specified
     * - Claude Code is running (the text is treated as input text, not a command, so no new session starts)
     *
     * @param commandPrefix Command prefix obtained from the settings
     * @returns The prefix to use for sending, and the resume command to record
     */
    private _prepareResumeSession(commandPrefix: string): ResumeSession {
        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
        // Resume information is recorded in metadata.md, so this does not depend on the sent history setting (recordSendTimestamp)
        if (!config.get<boolean>('editor.recordResumeCommand', true)) {
            return { commandPrefix };
        }

        const trimmed = commandPrefix.trim();
        if (!CLAUDE_EXECUTABLE_PATTERN.test(trimmed) || RESUME_CONFLICTING_OPTIONS.test(trimmed)) {
            return { commandPrefix };
        }

        if (this._terminalProvider?.isClaudeCodeRunning?.()) {
            return { commandPrefix };
        }

        const sessionId = randomUUID();
        // Use the same executable as the prefix for the resume command
        const executable = trimmed.split(/\s+/)[0];

        return {
            commandPrefix: `${trimmed} --session-id ${sessionId}`,
            resumeCommand: `${executable} --resume ${sessionId}`
        };
    }

    /**
     * Append the Spec / Plan / Run sent history to the current file
     *
     * The command is still sent even if appending fails, so errors are only logged
     * @param commandType Type of the command being sent
     * @param resumeCommand Command to resume the session being sent
     */
    private async _appendSendHistory(commandType: SendCommandType, resumeCommand?: string): Promise<void> {
        if (!this._currentFilePath) {
            // Run without an open file is not recorded
            return;
        }

        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
        if (!config.get<boolean>('editor.recordSendTimestamp', true)) {
            return;
        }

        const filePath = this._currentFilePath;
        const dateTime = this.templateService.formatDateTime();

        try {
            if (this._isFileOpenInTab(filePath)) {
                // When the file is open in a VS Code tab, writing directly to disk conflicts with
                // unsaved changes in the standard editor, so rewrite it through the document
                const document = await vscode.workspace.openTextDocument(filePath);
                const wasDirty = document.isDirty;
                const original = document.getText();
                const updated = this.templateService.appendSendHistoryLine(original, commandType, dateTime, resumeCommand);

                const edit = new vscode.WorkspaceEdit();
                edit.replace(
                    document.uri,
                    new vscode.Range(document.positionAt(0), document.positionAt(original.length)),
                    updated
                );

                const applied = await vscode.workspace.applyEdit(edit);
                if (!applied) {
                    console.error('Failed to append send history: applyEdit was rejected');
                    return;
                }

                this._applySendHistory(updated);

                // Save only if there were no unsaved changes beforehand (do not commit in-progress edits without the user's consent)
                if (!wasDirty) {
                    await document.save();
                }
            } else {
                // Re-read the content on disk so that the result of the preceding save is treated as authoritative
                const original = await fsPromises.readFile(filePath, 'utf8');
                const updated = this.templateService.appendSendHistoryLine(original, commandType, dateTime, resumeCommand);
                await fsPromises.writeFile(filePath, updated, 'utf8');
                this._applySendHistory(updated);
            }
        } catch (error) {
            console.error(`Failed to append send history: ${error}`);
        }
    }

    /**
     * Append the resume information of the sent session to metadata.md in the same directory as the sent file
     *
     * Resume Session in the Plans View reads the session to resume from this file.
     * The command is still sent even if appending fails, so errors are only logged
     * @param commandType Type of the command being sent
     * @param resumeCommand Command to resume the session being sent (nothing is recorded if absent)
     */
    private async _appendSessionMetadata(commandType: SendCommandType, resumeCommand?: string): Promise<void> {
        if (!this._currentFilePath || !resumeCommand) {
            return;
        }

        const metadataPath = path.join(path.dirname(this._currentFilePath), SESSION_METADATA_FILE_NAME);
        if (path.resolve(metadataPath) === path.resolve(this._currentFilePath)) {
            // Do not record when metadata.md itself is sent, because it would conflict with appending the sent history
            return;
        }

        const fileName = path.basename(this._currentFilePath);
        const dateTime = this.templateService.formatDateTime();
        const append = (content: string) =>
            this.templateService.appendSessionMetadataLine(content, commandType, dateTime, fileName, resumeCommand);

        try {
            if (this._isFileOpenInTab(metadataPath)) {
                // When the file is open in a VS Code tab, rewrite it through the document to avoid conflicting with unsaved changes
                const document = await vscode.workspace.openTextDocument(metadataPath);
                const wasDirty = document.isDirty;
                const original = document.getText();

                const edit = new vscode.WorkspaceEdit();
                edit.replace(
                    document.uri,
                    new vscode.Range(document.positionAt(0), document.positionAt(original.length)),
                    append(original)
                );

                if (!await vscode.workspace.applyEdit(edit)) {
                    console.error('Failed to append session metadata: applyEdit was rejected');
                    return;
                }

                // Save only if there were no unsaved changes beforehand (do not commit in-progress edits without the user's consent)
                if (!wasDirty) {
                    await document.save();
                }
            } else {
                let original = '';
                try {
                    original = await fsPromises.readFile(metadataPath, 'utf8');
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                        throw error;
                    }
                }
                await fsPromises.writeFile(metadataPath, append(original), 'utf8');
            }
        } catch (error) {
            console.error(`Failed to append session metadata: ${error}`);
        }
    }

    /**
     * Apply the result of appending the sent history to the held state and to the Webview
     *
     * Without updating the Webview, the Editor View content stays stale,
     * and the history lines are lost on the next save
     */
    private _applySendHistory(content: string): void {
        this._currentContent = content;
        this._pendingContent = undefined;
        this._isDirty = false;

        this._view?.webview.postMessage({
            type: 'updateContent',
            content: content
        });
    }

    private _checkAndUpdateReadOnlyState(editor: vscode.TextEditor | undefined) {
        if (!this._view || !this._currentFilePath) {
            return;
        }

        // Check whether the file is open in any tab (even if the tab is not active)
        const isOpenInEditor = this._isFileOpenInTab(this._currentFilePath);

        // Update the read-only state in the webview
        this._view.webview.postMessage({
            type: 'setReadOnlyState',
            isReadOnly: isOpenInEditor
        });
    }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);

        // Receive messages from the Webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'webviewReady':
                    // When the Webview is ready, restore the pending file
                    if (this._pendingFileToRestore) {
                        await this.showFile(this._pendingFileToRestore);
                        this._pendingFileToRestore = undefined;
                    }
                    break;
                case 'save':
                    const hadFilePath = !!this._currentFilePath;
                    const savedPath = await this._saveCurrentContent(data.content);
                    if (savedPath) {
                        if (!hadFilePath) {
                            // For a new file, show the file name
                            const fileName = path.basename(savedPath);
                            vscode.window.showInformationMessage(`File saved: ${fileName}`);
                        } else {
                            // Overwrite the existing file
                            vscode.window.showInformationMessage('File saved successfully');
                        }
                    }
                    break;
                case 'contentChanged':
                    // The editor content has changed
                    this._pendingContent = data.content;
                    const isDirty = data.content !== this._currentContent;
                    if (this._isDirty !== isDirty) {
                        this._isDirty = isDirty;
                    }
                    break;
                case 'createMarkdownFile':
                    // Cmd+M / Ctrl+M pressed - execute create markdown file command
                    vscode.commands.executeCommand('aiCodingSidebar.createMarkdownFile');
                    break;
                case 'requestPromptTemplates':
                    // prompts button - send the template list so it is shown in the menu
                    await this._sendPromptTemplates();
                    break;
                case 'insertPromptTemplate':
                    // Insert the template selected in the menu at the cursor position
                    await this._insertPromptTemplateById(data.templateId);
                    break;
                case 'createPromptTemplate':
                    // "Add template" at the bottom of the menu - create a new template and open it
                    await this._createPromptTemplate();
                    break;
                case 'showWarning':
                    vscode.window.showWarningMessage(data.message);
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
                case 'planTask':
                    // Plan button clicked - save file if needed, then send plan command to terminal
                    // If the file has not been created or saved yet, save it first
                    if (data.content && data.content.trim()) {
                        const planSavedPath = await this._saveCurrentContent(data.content);
                        if (!planSavedPath) {
                            return; // Save failed
                        }
                    }

                    if (this._currentFilePath) {
                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        let relativeFilePath: string;

                        if (workspaceRoot) {
                            // Calculate relative path from workspace root
                            relativeFilePath = path.relative(workspaceRoot, this._currentFilePath);
                        } else {
                            // If no workspace, use the full path
                            relativeFilePath = this._currentFilePath;
                        }

                        // Get the plan command template from settings
                        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
                        const commandPrefix = config.get<string>('editor.commandPrefix', 'claude');
                        const commandTemplate = this._getCommandTemplate(config, 'editor.runPlanCommand', 'editor.planCommand',
                            '${commandPrefix} "Review the file at ${filePath} and create an implementation plan. Save it as a timestamped file (format: YYYY_MMDD_HHMM_SS_plan.md) in the same directory as ${filePath}."');

                        // Add a session ID so that the Claude Code session can be resumed later
                        const resumeSession = this._prepareResumeSession(commandPrefix);

                        // Replace placeholders with safely escaped values
                        const escapedPath = this._escapeShellArgument(relativeFilePath.trim());
                        let command = commandTemplate.replace(/\$\{commandPrefix\}/g, resumeSession.commandPrefix);
                        command = command.replace(/\$\{filePath\}/g, escapedPath);

                        // Append the date/time and resume command to the file as a record of the send
                        await this._appendSendHistory('plan', resumeSession.resumeCommand);
                        await this._appendSessionMetadata('plan', resumeSession.resumeCommand);

                        // Send command to Terminal view
                        if (this._terminalProvider) {
                            this._terminalProvider.focus();
                            await this._terminalProvider.sendCommand(command, true, this._currentFilePath, 'plan');
                        }
                    }
                    break;
                case 'specTask':
                    // Spec button clicked - save file if needed, then send spec command to terminal
                    // If the file has not been created or saved yet, save it first
                    if (data.content && data.content.trim()) {
                        const specSavedPath = await this._saveCurrentContent(data.content);
                        if (!specSavedPath) {
                            return; // Save failed
                        }
                    }

                    if (this._currentFilePath) {
                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        let relativeFilePath: string;

                        if (workspaceRoot) {
                            // Calculate relative path from workspace root
                            relativeFilePath = path.relative(workspaceRoot, this._currentFilePath);
                        } else {
                            // If no workspace, use the full path
                            relativeFilePath = this._currentFilePath;
                        }

                        // Get the spec command template from settings
                        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
                        const commandPrefix = config.get<string>('editor.commandPrefix', 'claude');
                        const commandTemplate = this._getCommandTemplate(config, 'editor.runSpecCommand', 'editor.specCommand',
                            '${commandPrefix} "Review the file at ${filePath} and create specification documents. Save them as timestamped files (format: YYYY_MMDD_HHMM_SS_requirements.md, YYYY_MMDD_HHMM_SS_design.md, YYYY_MMDD_HHMM_SS_tasks.md) in the same directory as ${filePath}."');

                        // Add a session ID so that the Claude Code session can be resumed later
                        const resumeSession = this._prepareResumeSession(commandPrefix);

                        // Replace placeholders with safely escaped values
                        const escapedPath = this._escapeShellArgument(relativeFilePath.trim());
                        let command = commandTemplate.replace(/\$\{commandPrefix\}/g, resumeSession.commandPrefix);
                        command = command.replace(/\$\{filePath\}/g, escapedPath);

                        // Append the date/time and resume command to the file as a record of the send
                        await this._appendSendHistory('spec', resumeSession.resumeCommand);
                        await this._appendSessionMetadata('spec', resumeSession.resumeCommand);

                        // Send command to Terminal view
                        if (this._terminalProvider) {
                            this._terminalProvider.focus();
                            await this._terminalProvider.sendCommand(command, true, this._currentFilePath, 'spec');
                        }
                    }
                    break;
                case 'outputMd':
                    await this.sendSessionPrompt('md');
                    break;
                case 'outputMemory':
                    await this.sendSessionPrompt('memory');
                    break;
                case 'runTask':
                    // Run button clicked - save file if needed, then send command to terminal
                    await this._runTask(data.content, data.editorContent);
                    break;
                case 'openInVSCode':
                    // Edit button clicked - save if needed, then open in VS Code editor
                    if (!this._currentFilePath) {
                        vscode.window.showWarningMessage('No file is currently open.');
                        return;
                    }

                    // Save file first if content is provided (unsaved changes)
                    if (data.content) {
                        try {
                            await fs.promises.writeFile(this._currentFilePath, data.content, 'utf8');
                            this._currentContent = data.content;
                            this._pendingContent = undefined;
                            this._isDirty = false;
                            // Update dirty state in webview
                            this._view?.webview.postMessage({
                                type: 'updateDirtyState',
                                isDirty: false
                            });
                        } catch (error) {
                            vscode.window.showErrorMessage(`Failed to save file: ${error}`);
                            return;
                        }
                    }

                    // Open file in VS Code editor
                    try {
                        const document = await vscode.workspace.openTextDocument(this._currentFilePath);
                        await vscode.window.showTextDocument(document, {
                            preview: false,
                            preserveFocus: false
                        });
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to open file in editor: ${error}`);
                    }
                    break;
                case 'focusTabInVSCode':
                    // Readonly editor clicked - focus the tab in VS Code
                    if (!this._currentFilePath) {
                        return;
                    }

                    // Find and focus the tab
                    try {
                        // Check all tab groups to find the tab for the file
                        for (const group of vscode.window.tabGroups.all) {
                            for (const tab of group.tabs) {
                                if (tab.input instanceof vscode.TabInputText) {
                                    if (tab.input.uri.fsPath === this._currentFilePath) {
                                        // Once the tab is found, open its document and focus it
                                        const document = await vscode.workspace.openTextDocument(this._currentFilePath);
                                        await vscode.window.showTextDocument(document, {
                                            preview: false,
                                            preserveFocus: false,
                                            viewColumn: group.viewColumn
                                        });
                                        return;
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`Failed to focus tab in VS Code: ${error}`);
                    }
                    break;
            }
        });

        // Restore previously opened file if exists
        // Store file path to restore after webview is ready
        if (this._currentFilePath) {
            this._pendingFileToRestore = this._currentFilePath;
        }

        // Listen to webview disposal
        this._disposables.push(
            webviewView.onDidDispose(async () => {
                // Save changes when webview is disposed
                if (this._currentFilePath && this._isDirty && this._pendingContent) {
                    try {
                        await fs.promises.writeFile(this._currentFilePath, this._pendingContent, 'utf8');
                        this._currentContent = this._pendingContent;
                        this._isDirty = false;
                    } catch (error) {
                        console.error(`Failed to auto-save file on dispose: ${error}`);
                    }
                }
                this._view = undefined;
            })
        );

        // Listen to visibility changes
        this._disposables.push(
            webviewView.onDidChangeVisibility(async () => {
                if (webviewView.visible && this._currentFilePath) {
                    // Restore current file when view becomes visible
                    try {
                        // Re-read the file content to ensure we have the latest version
                        const content = await fs.promises.readFile(this._currentFilePath, 'utf8');
                        this._currentContent = content;
                        this._pendingContent = undefined;
                        this._isDirty = false;

                        const displayPath = path.basename(this._currentFilePath);
                        const isOpenInEditor = this._isFileOpenInTab(this._currentFilePath);

                        this._view?.webview.postMessage({
                            type: 'showContent',
                            filePath: displayPath,
                            content: content,
                            isReadOnly: isOpenInEditor
                        });
                    } catch (error) {
                        console.error(`Failed to restore file: ${error}`);
                    }
                } else if (!webviewView.visible && this._currentFilePath && this._isDirty && this._pendingContent) {
                    // Save changes when view becomes hidden
                    try {
                        await fs.promises.writeFile(this._currentFilePath, this._pendingContent, 'utf8');
                        this._currentContent = this._pendingContent;
                        this._isDirty = false;
                    } catch (error) {
                        console.error(`Failed to auto-save file: ${error}`);
                    }
                }
            })
        );
    }

    /**
     * Run the Run command
     * If a file is open, save it if needed before sending the command;
     * if there is no file, embed the editor content directly into the command
     */
    private async _runTask(content?: string | null, editorContent?: string): Promise<void> {
        if (this._currentFilePath) {
            // Save file first if content is provided
            if (content) {
                try {
                    await fs.promises.writeFile(this._currentFilePath, content, 'utf8');
                    this._currentContent = content;
                    this._pendingContent = undefined;
                    this._isDirty = false;
                    // Update dirty state in webview
                    this._view?.webview.postMessage({
                        type: 'updateDirtyState',
                        isDirty: false
                    });
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to save file: ${error}`);
                    return;
                }
            }

            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            let relativeFilePath: string;

            if (workspaceRoot) {
                // Calculate relative path from workspace root
                relativeFilePath = path.relative(workspaceRoot, this._currentFilePath);
            } else {
                // If no workspace, use the full path
                relativeFilePath = this._currentFilePath;
            }

            // Get the run command template from settings
            const config = vscode.workspace.getConfiguration('aiCodingSidebar');
            const commandPrefix = config.get<string>('editor.commandPrefix', 'claude');
            const commandTemplate = config.get<string>('editor.runCommand', '${commandPrefix} "${editorContent}"');

            // Add a session ID so that the Claude Code session can be resumed later
            const resumeSession = this._prepareResumeSession(commandPrefix);

            // Use the content before the sent history is appended (the content shown in the editor) for ${editorContent}
            const latestContent = this._pendingContent ?? this._currentContent ?? '';

            // Append the output md instruction to the end of the body so that the status is output after the task completes
            // When Quick Run is enabled, do not append it, so the task runs quickly without outputting the status
            // Included only in the command being sent; not written to the file or the editor content
            const runContent = config.get<boolean>('editor.quickRun', false)
                ? latestContent
                : appendOutputMdPrompt(latestContent, this._buildSessionPrompt('md', relativeFilePath.trim()));

            // Replace placeholders with safely escaped values
            // Replace ${editorContent} last (so that ${...} contained in the content is not expanded)
            const escapedPath = this._escapeShellArgument(relativeFilePath.trim());
            const escapedContent = this._escapeShellArgument(runContent.trim());
            let command = commandTemplate.replace(/\$\{commandPrefix\}/g, resumeSession.commandPrefix);
            command = command.replace(/\$\{filePath\}/g, escapedPath);
            command = command.replace(/\$\{editorContent\}/g, escapedContent);

            // Append the date/time and resume command to the file as a record of the send
            await this._appendSendHistory('run', resumeSession.resumeCommand);
            await this._appendSessionMetadata('run', resumeSession.resumeCommand);

            // Send command to Terminal view
            if (this._terminalProvider) {
                this._terminalProvider.focus();
                await this._terminalProvider.sendCommand(command, true, this._currentFilePath, 'run');
            }
        } else if (editorContent && editorContent.trim()) {
            // No file open - use the editor content directly
            const config = vscode.workspace.getConfiguration('aiCodingSidebar');
            const commandPrefix = config.get<string>('editor.commandPrefix', 'claude');
            const commandTemplate = config.get<string>('editor.runCommandWithoutFile', '${commandPrefix} "${editorContent}"');

            // Replace placeholders with safely escaped values
            const escapedContent = this._escapeShellArgument(editorContent.trim());
            let command = commandTemplate.replace(/\$\{commandPrefix\}/g, commandPrefix);
            command = command.replace(/\$\{editorContent\}/g, escapedContent);

            // Send command to Terminal view
            if (this._terminalProvider) {
                this._terminalProvider.focus();
                await this._terminalProvider.sendCommand(command);
            }
        } else {
            vscode.window.showWarningMessage('Please enter some text in the editor to run a task.');
        }
    }

    /**
     * Run the Run command from outside the Editor View (e.g. Terminal View shortcuts)
     * Runs with the same content as the Editor View Run button / Cmd+R (including unsaved edits)
     */
    public async runTask(): Promise<void> {
        const latestContent = this._pendingContent ?? this._currentContent;

        if (this._currentFilePath) {
            // Pass the content to save only when there are unsaved changes (do not save while the file is open in a VS Code tab)
            const isReadOnly = this._isFileOpenInTab(this._currentFilePath);
            const unsavedContent = this._isDirty && !isReadOnly ? latestContent : undefined;
            await this._runTask(unsavedContent);
        } else {
            await this._runTask(undefined, latestContent ?? '');
        }
    }

    /**
     * Show a file in the Editor View
     * @param filePath Path of the file to show
     * @param options focusEditor: move focus to the editor (textarea) after showing the file
     */
    public async showFile(filePath: string, options?: { focusEditor?: boolean }) {
        // Save current file if it has unsaved changes before switching
        if (this._currentFilePath && this._isDirty && this._pendingContent && this._currentFilePath !== filePath) {
            try {
                await fs.promises.writeFile(this._currentFilePath, this._pendingContent, 'utf8');
                this._currentContent = this._pendingContent;
                this._isDirty = false;
            } catch (error) {
                console.error(`Failed to auto-save file before switching: ${error}`);
            }
        }

        this._currentFilePath = filePath;

        // Check whether the file is open in any tab
        const isOpenInEditor = this._isFileOpenInTab(filePath);

        if (isOpenInEditor) {
            vscode.window.showWarningMessage('This file is open in the editor. Markdown Editor will be read-only.');
        }

        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            this._currentContent = content;
            this._pendingContent = undefined;
            this._isDirty = false;

            // Show only the file name
            const displayPath = path.basename(filePath);

            if (this._view) {
                this._view.webview.postMessage({
                    type: 'showContent',
                    filePath: displayPath,
                    content: content,
                    isReadOnly: isOpenInEditor,
                    focusEditor: options?.focusEditor === true
                });
                this._view.show?.(true);
            }

            // Refresh the Markdown List to update the "editing" label
            if (this._detailsProvider) {
                this._detailsProvider.refresh();
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to read file: ${error}`);
        }
    }

    /**
     * Send an output instruction (output md / output memory) to the running Claude Code
     * Does not start a new session; sends it as an additional instruction to the session started by Run / Plan / Spec
     */
    public async sendSessionPrompt(type: SessionPromptType): Promise<void> {
        // Do not send when Claude Code is not running, because the instruction would be executed as a command in the shell
        // Providers that do not implement isClaudeCodeRunning are also treated as "not running" (the opposite of the Run commands)
        if (!this._terminalProvider?.isClaudeCodeRunning?.()) {
            vscode.window.showWarningMessage('Claude Code is not running in the Terminal view. Start a session with Run / Plan / Spec first.');
            return;
        }

        // The output goes to the directory of the open file, so do not send when no file is open
        if (!this._currentFilePath) {
            vscode.window.showWarningMessage('No file is open. Open a prompt file to decide where to output.');
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const relativeFilePath = workspaceRoot
            ? path.relative(workspaceRoot, this._currentFilePath)
            : this._currentFilePath;

        // The text is written to the input field without going through the shell, so _escapeShellArgument() is not used
        // (wrapping it in quotes would leave the quotes in the prompt as is)
        const prompt = this._buildSessionPrompt(type, relativeFilePath);

        // Do not pass filePath / commandType (to avoid overwriting the tab-file association and the tab icon)
        this._terminalProvider.focus();
        await this._terminalProvider.sendCommand(prompt, true);
    }

    /**
     * Get the output instruction (output md / output memory) text from the settings and expand its placeholders
     * @param relativeFilePath Path of the open file relative to the workspace root
     */
    private _buildSessionPrompt(type: SessionPromptType, relativeFilePath: string): string {
        const { settingKey, defaultPrompt } = SESSION_PROMPTS[type];
        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
        const template = config.get<string>(settingKey, defaultPrompt);

        return template
            .replace(/\$\{filePath\}/g, relativeFilePath)
            .replace(/\$\{dirPath\}/g, path.dirname(relativeFilePath));
    }

    /**
     * Resume a recorded Claude Code session (Resume Session in the Plans View)
     *
     * The recorded string is not sent as is; the resume command is rebuilt from the session ID.
     * If Claude Code is running in the active tab, resume in a new tab so the command is not treated as input text
     *
     * @param sessionId ID of the session to resume (UUID format)
     * @param filePath File that started the session (used for the tab association)
     * @param commandType Type of the command that started the session (used for the tab icon)
     * @returns true if the resume command was sent
     */
    public async resumeSession(sessionId: string, filePath?: string, commandType?: SendCommandType): Promise<boolean> {
        if (!isValidSessionId(sessionId) || !this._terminalProvider) {
            return false;
        }

        const command = this._buildResumeCommand(sessionId);

        if (this._terminalProvider.isClaudeCodeRunning?.()) {
            // Providers that cannot create a new tab do not send, so the command is not fed into the running session
            if (!this._terminalProvider.sendCommandInNewTab) {
                vscode.window.showWarningMessage('Claude Code is running in the Terminal view. Exit it before resuming another session.');
                return false;
            }
            this._terminalProvider.focus();
            return this._terminalProvider.sendCommandInNewTab(command, filePath, commandType);
        }

        this._terminalProvider.focus();
        await this._terminalProvider.sendCommand(command, true, filePath, commandType);
        return true;
    }

    /**
     * Build the command to resume a session
     *
     * Uses the current command prefix so that settings such as the permission mode also apply when resuming.
     * Uses claude if the prefix does not launch claude or conflicts with specifying a session
     */
    private _buildResumeCommand(sessionId: string): string {
        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
        const prefix = config.get<string>('editor.commandPrefix', 'claude').trim();
        const usablePrefix = CLAUDE_EXECUTABLE_PATTERN.test(prefix) && !RESUME_CONFLICTING_OPTIONS.test(prefix)
            ? prefix
            : 'claude';

        return `${usablePrefix} --resume ${sessionId}`;
    }

    public getCurrentFilePath(): string | undefined {
        return this._currentFilePath;
    }

    public setDetailsProvider(provider: PlansProvider): void {
        this._detailsProvider = provider;
    }

    public setPlansProvider(provider: PlansProvider): void {
        this._plansProvider = provider;
    }

    public setTerminalProvider(provider: ITerminalProvider): void {
        this._terminalProvider = provider;
    }

    public async clearFile(): Promise<void> {
        // Save current file if it has unsaved changes before clearing
        if (this._currentFilePath && this._isDirty && this._pendingContent) {
            try {
                await fs.promises.writeFile(this._currentFilePath, this._pendingContent, 'utf8');
                this._currentContent = this._pendingContent;
                this._isDirty = false;
            } catch (error) {
                console.error(`Failed to auto-save file before clearing: ${error}`);
            }
        }

        this._currentFilePath = undefined;
        this._currentContent = undefined;
        this._pendingContent = undefined;
        this._isDirty = false;

        if (this._view) {
            this._view.webview.postMessage({
                type: 'clearContent'
            });
        }
    }

    /**
     * Set the prompt template service
     */
    public setPromptTemplateService(service: PromptTemplateService): void {
        this.promptTemplateService = service;
    }

    /**
     * Build the template list sent to the Webview
     *
     * Shown in the menu inside the Editor View when the button is pressed.
     * The body is kept on the extension side, and the selection is received by ID
     */
    private async _sendPromptTemplates(): Promise<void> {
        if (!this.promptTemplateService) {
            vscode.window.showWarningMessage('Prompt templates are not available');
            return;
        }

        // While the file is being edited in a VS Code tab the Editor View is read-only, so inserted text would not be saved
        if (this._isCurrentFileReadOnly()) {
            vscode.window.showWarningMessage(
                'This file is being edited in VS Code. Close the tab to insert a template here.'
            );
            return;
        }

        const templates = await this.promptTemplateService.listTemplates();
        if (templates.length === 0) {
            await this._showNoPromptTemplateGuidance();
            return;
        }

        // Do not include the body in the message (it is re-read on the extension side when inserting)
        this._view?.webview.postMessage({
            type: 'showPromptTemplates',
            templates: templates.map(template => ({
                id: template.id,
                label: template.label,
                description: template.description
            }))
        });
    }

    /**
     * Insert the template selected in the menu inside the Editor View
     * @param templateId ID of the template (file name without extension)
     */
    private async _insertPromptTemplateById(templateId?: string): Promise<void> {
        if (!this.promptTemplateService || !templateId) {
            return;
        }

        // Re-read because the file may have changed after the menu was shown
        const templates = await this.promptTemplateService.listTemplates();
        const template = templates.find(entry => entry.id === templateId);
        if (!template) {
            vscode.window.showWarningMessage(`Prompt template not found: ${templateId}`);
            return;
        }

        this._insertPromptTemplateText(
            this.promptTemplateService.renderTemplate(template, this._currentFilePath)
        );
    }

    /**
     * Select a prompt template with QuickPick and insert it at the cursor position
     *
     * The Editor View button uses the menu instead,
     * so this is used when run from outside the view, such as the Command Palette
     */
    public async insertPromptTemplate(): Promise<void> {
        if (!this.promptTemplateService) {
            vscode.window.showWarningMessage('Prompt templates are not available');
            return;
        }

        // While the file is being edited in a VS Code tab the Editor View is read-only, so inserted text would not be saved
        if (this._isCurrentFileReadOnly()) {
            vscode.window.showWarningMessage(
                'This file is being edited in VS Code. Close the tab to insert a template here.'
            );
            return;
        }

        const templates = await this.promptTemplateService.listTemplates();
        if (templates.length === 0) {
            await this._showNoPromptTemplateGuidance();
            return;
        }

        const picked = await vscode.window.showQuickPick(
            templates.map(template => ({
                label: template.label,
                description: template.description,
                template: template
            })),
            {
                placeHolder: 'Select a prompt template',
                matchOnDescription: true
            }
        );

        if (!picked) {
            return;
        }

        this._insertPromptTemplateText(
            this.promptTemplateService.renderTemplate(picked.template, this._currentFilePath)
        );
    }

    /**
     * Create a new prompt template and open it in the VS Code editor
     *
     * Called from "Add template" at the bottom of the menu
     */
    private async _createPromptTemplate(): Promise<void> {
        if (!this.promptTemplateService) {
            vscode.window.showWarningMessage('Prompt templates are not available');
            return;
        }

        // Collisions with existing files are checked per destination, so decide the destination before asking for the name
        const target = await this._pickPromptTemplateTarget();
        if (!target) {
            return;
        }

        const name = await vscode.window.showInputBox({
            title: target === 'global' ? 'New Global Prompt Template' : 'New Prompt Template',
            prompt: 'Enter a name for the new prompt template',
            placeHolder: 'refactor',
            validateInput: value => this.promptTemplateService?.validateTemplateName(value, target)
        });

        if (!name) {
            return;
        }

        try {
            const filePath = target === 'global'
                ? await this.promptTemplateService.createGlobalTemplate(name)
                : await this.promptTemplateService.createWorkspaceTemplate(name);
            // Let the user edit the body in the standard VS Code editor
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create prompt template: ${error}`);
        }
    }

    /**
     * Decide where to create the prompt template
     *
     * If there is only one option, use it without asking
     */
    private async _pickPromptTemplateTarget(): Promise<PromptTemplateTarget | undefined> {
        const service = this.promptTemplateService;
        if (!service) {
            return undefined;
        }

        const hasWorkspace = !!service.getWorkspaceTemplatesDir();
        const hasGlobal = !!service.getGlobalTemplatesDir();

        if (!hasWorkspace && !hasGlobal) {
            vscode.window.showErrorMessage('No location is available for prompt templates');
            return undefined;
        }

        if (!hasWorkspace) {
            return 'global';
        }

        if (!hasGlobal) {
            return 'workspace';
        }

        const picked = await vscode.window.showQuickPick(
            [
                {
                    label: '$(root-folder) Workspace',
                    description: 'Available only in this workspace',
                    target: 'workspace' as PromptTemplateTarget
                },
                {
                    label: '$(globe) Global',
                    description: 'Available in every workspace',
                    target: 'global' as PromptTemplateTarget
                }
            ],
            { placeHolder: 'Where do you want to create the prompt template?' }
        );

        return picked?.target;
    }

    /**
     * Whether the current file is read-only (being edited in a VS Code tab)
     */
    private _isCurrentFileReadOnly(): boolean {
        return !!this._currentFilePath && this._isFileOpenInTab(this._currentFilePath);
    }

    /**
     * Show guidance when there are no templates
     */
    private async _showNoPromptTemplateGuidance(): Promise<void> {
        const createAction = 'Create Templates';
        const selection = await vscode.window.showInformationMessage(
            'No prompt template was found.',
            createAction
        );
        if (selection === createAction) {
            await vscode.commands.executeCommand('aiCodingSidebar.setupPromptTemplates');
        }
    }

    /**
     * Insert a template with its variables replaced into the editor
     * The insertion itself goes through the same `insertText` message as insertPaths()
     */
    private _insertPromptTemplateText(text: string): void {
        if (!this._view) {
            vscode.window.showWarningMessage('Editor view is not available');
            return;
        }

        this._view.webview.postMessage({
            type: 'insertText',
            text: text
        });

        // Focus the Editor view
        this._view.show?.(true);
    }

    /**
     * Insert multiple paths into the editor
     * @param paths Array of paths to insert
     */
    public insertPaths(paths: string[]): void {
        if (!this._view) {
            vscode.window.showWarningMessage('Editor view is not available');
            return;
        }

        const pathText = paths.join('\n');
        this._view.webview.postMessage({
            type: 'insertText',
            text: pathText
        });

        // Focus the Editor view
        this._view.show?.(true);
    }

    /**
     * Save pending changes synchronously (for deactivation)
     */
    public saveSync(): void {
        if (this._currentFilePath && this._isDirty && this._pendingContent) {
            try {
                fs.writeFileSync(this._currentFilePath, this._pendingContent, 'utf8');
                this._currentContent = this._pendingContent;
                this._isDirty = false;
            } catch (error) {
                console.error(`Failed to save file on deactivation: ${error}`);
            }
        }
    }

    /**
     * Common file save logic
     * @param content Content to save
     * @returns The file path on success, null on failure
     */
    private async _saveCurrentContent(content: string): Promise<string | null> {
        if (this._currentFilePath) {
            // Priority 1: overwrite the existing file
            try {
                await fs.promises.writeFile(this._currentFilePath, content, 'utf8');
                this._currentContent = content;
                this._pendingContent = undefined;
                this._isDirty = false;
                // Clear the unsaved state after saving
                this._view?.webview.postMessage({
                    type: 'updateDirtyState',
                    isDirty: false
                });
                return this._currentFilePath;
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to save file: ${error}`);
                return null;
            }
        } else if (content && content.trim()) {
            // No file open - save as a new file
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                vscode.window.showErrorMessage('No workspace folder is open');
                return null;
            }

            let savePath: string;

            // Priority 2: directory open in the Docs view
            const docsCurrentPath = this._detailsProvider?.getCurrentPath();
            // Priority 3: directory selected in the Tasks view
            const tasksRootPath = this._plansProvider?.getRootPath();

            if (docsCurrentPath) {
                savePath = docsCurrentPath;
            } else if (tasksRootPath) {
                savePath = tasksRootPath;
            } else {
                // Priority 4: default path
                const config = vscode.workspace.getConfiguration('aiCodingSidebar');
                const defaultRelativePath = config.get<string>('plans.defaultRelativePath', '.claude/plans');
                savePath = path.join(workspaceRoot, defaultRelativePath);
            }

            // Create the directory if it does not exist
            await fs.promises.mkdir(savePath, { recursive: true });

            // Generate a timestamped file name (YYYY_MMDD_HHMM_SS format)
            const timestamp = this.templateService.generateTimestamp();
            const fileName = `${timestamp}_PROMPT.md`;
            const filePath = path.join(savePath, fileName);

            try {
                // Create the metadata footer
                const relativeDirPath = workspaceRoot ? path.relative(workspaceRoot, savePath) : savePath;
                const datetime = this.templateService.formatDateTime();
                const footer = `\n\n---\n\nworking dir: ${relativeDirPath}\nprompt file: ${fileName}\ndatetime   : ${datetime}\n`;

                // Append the footer to the end of the content
                const contentWithFooter = content + footer;

                await fs.promises.writeFile(filePath, contentWithFooter, 'utf8');

                // Open the saved file in the editor
                this._currentFilePath = filePath;
                this._currentContent = contentWithFooter;
                this._pendingContent = undefined;
                this._isDirty = false;

                // Reflect the file path in the Webview (show only the file name)
                const displayPath = path.basename(filePath);
                this._view?.webview.postMessage({
                    type: 'showContent',
                    content: contentWithFooter,
                    filePath: displayPath,
                    isReadOnly: false
                });

                // Refresh the tree view
                this._plansProvider?.refresh();
                this._detailsProvider?.refresh();

                // Move to the saved directory and select the file
                // Note: a 100ms delay is set to wait until the tree view DOM update finishes after refresh()
                setTimeout(async () => {
                    // Show the directory in the Tasks view
                    await this._plansProvider?.revealDirectory(savePath);
                    // Select the file in the Tasks view
                    // An update is needed if the active folder is different
                    const currentActivePath = this._detailsProvider?.getCurrentPath();
                    if (currentActivePath !== savePath) {
                        // Change the active folder
                        this._detailsProvider?.setActiveFolder(savePath);
                        // Open the file again
                        await this.showFile(filePath);
                    }
                    await this._detailsProvider?.revealFile(filePath);
                }, 100);

                return filePath;
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to save file: ${error}`);
                return null;
            }
        } else {
            vscode.window.showWarningMessage('Please enter some text before saving.');
            return null;
        }
    }

    /**
     * Dispose the provider and save any pending changes
     */
    public dispose(): void {
        // Save pending changes synchronously
        this.saveSync();

        // Dispose all subscriptions
        for (const disposable of this._disposables) {
            disposable.dispose();
        }
        this._disposables = [];
    }

    private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        // Get the URIs of external resources
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'editor', 'style.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'editor', 'main.js'));
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'codicons', 'codicon.css'));
        const templatePath = vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'editor', 'index.html');

        // Load the HTML template (async)
        const htmlTemplate = await fsPromises.readFile(templatePath.fsPath, 'utf8');

        // Replace template variables
        return htmlTemplate
            .replace(/\{\{cspSource\}\}/g, webview.cspSource)
            .replace(/\{\{styleUri\}\}/g, styleUri.toString())
            .replace(/\{\{scriptUri\}\}/g, scriptUri.toString())
            .replace(/\{\{codiconsUri\}\}/g, codiconsUri.toString());
    }
}
