import * as vscode from 'vscode';
import * as path from 'path';
import { TerminalService } from '../services/TerminalService';

// Forward declaration for EditorProvider to avoid circular dependency
export interface IEditorProvider {
    showFile(filePath: string): Promise<void>;
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
    isClaudeCodeRunning: boolean;
    isClosed?: boolean;
    commandType?: 'run' | 'plan' | 'spec';
}

export class TerminalProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'terminalView';
    private _view?: vscode.WebviewView;
    private _terminalService: TerminalService;
    private _tabs: TerminalTab[] = [];
    private _activeTabId?: string;
    private _outputDisposables: Map<string, vscode.Disposable> = new Map();
    private _tabCounter: number = 0;
    private _tabFileMap: Map<string, string> = new Map(); // tabId -> filePath
    private _editorProvider?: IEditorProvider;
    private _plansProvider?: IPlansProvider;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) {
        this._terminalService = new TerminalService();
        this._setupSessionExitHandler();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        // Webview再生成時は全セッションを終了してリセット
        if (this._tabs.length > 0) {
            this._cleanupAllSessions();
        }

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Webviewからのメッセージを受信
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'ready':
                    // WebViewの準備が完了したら最初のタブを作成
                    await this._createTab();
                    break;
                case 'input':
                    // ユーザー入力をPTYに送信
                    if (data.tabId) {
                        const tab = this._tabs.find(t => t.id === data.tabId);
                        if (tab) {
                            this._terminalService.write(tab.sessionId, data.data);
                        }
                    }
                    break;
                case 'resize':
                    // ターミナルサイズの変更
                    if (data.tabId) {
                        const tab = this._tabs.find(t => t.id === data.tabId);
                        if (tab) {
                            this._terminalService.resize(tab.sessionId, data.cols, data.rows);
                        }
                    }
                    break;
                case 'openUrl':
                    // URLをブラウザで開く
                    if (data.url) {
                        vscode.env.openExternal(vscode.Uri.parse(data.url));
                    }
                    break;
                case 'openFile':
                    // ファイルをエディタで開く
                    if (data.path) {
                        const filePath = data.path;
                        const line = data.line;

                        // 相対パスを絶対パスに変換
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
                            // ファイルが存在しない場合は何もしない
                        }
                    }
                    break;
                case 'createTab':
                    await this._createTab();
                    break;
                case 'activateTab':
                    this._activateTab(data.tabId);
                    break;
                case 'clearTerminal':
                    this.clearTerminal();
                    break;
                case 'killTerminal':
                    this.killTerminal();
                    break;
                case 'sendShortcut':
                    {
                        const command = data.command as string;
                        const startsClaudeCode = data.startsClaudeCode as boolean;

                        if (!command) {
                            break;
                        }

                        if (this._activeTabId) {
                            const tab = this._tabs.find(t => t.id === this._activeTabId);
                            if (tab) {
                                if (tab.isClaudeCodeRunning) {
                                    // Claude Code起動中: コマンドのみ送信（Enterなし）
                                    this._terminalService.write(tab.sessionId, command);
                                } else {
                                    // シェル: コマンド + 改行を送信
                                    this._terminalService.write(tab.sessionId, command + '\n');

                                    // 状態を更新
                                    if (startsClaudeCode) {
                                        tab.isClaudeCodeRunning = true;
                                        // WebViewに状態を通知
                                        this._view?.webview.postMessage({
                                            type: 'claudeCodeStateChanged',
                                            tabId: tab.id,
                                            isRunning: true
                                        });
                                    }
                                }
                            }
                        }
                    }
                    break;
                case 'resetClaudeCodeState':
                    if (this._activeTabId) {
                        const tab = this._tabs.find(t => t.id === this._activeTabId);
                        if (tab) {
                            tab.isClaudeCodeRunning = false;
                            this._view?.webview.postMessage({
                                type: 'claudeCodeStateChanged',
                                tabId: tab.id,
                                isRunning: false
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
                            this._view?.webview.postMessage({
                                type: 'claudeCodeStateChanged',
                                tabId: tab.id,
                                isRunning: isRunning
                            });
                        }
                    }
                    break;
                case 'reconnect':
                    await this._reconnectTab(data.tabId);
                    break;
            }
        });

        // WebViewが破棄されたときにセッションを終了
        webviewView.onDidDispose(() => {
            this._cleanup();
        });
    }

    private static readonly MAX_TABS = 5;

    private async _createTab(): Promise<void> {
        if (!this._terminalService.isAvailable()) {
            this._view?.webview.postMessage({
                type: 'error',
                message: this._terminalService.getUnavailableReason()
            });
            return;
        }

        // タブ数の上限チェック
        if (this._tabs.length >= TerminalProvider.MAX_TABS) {
            vscode.window.showWarningMessage(`Maximum ${TerminalProvider.MAX_TABS} terminal tabs allowed.`);
            return;
        }

        try {
            // ワークスペースルートを取得
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

            // シェル名を取得
            const config = vscode.workspace.getConfiguration('aiCodingSidebar');
            const shellPath = config.get<string>('terminal.shell') || process.env.SHELL || '/bin/bash';
            const shellName = path.basename(shellPath);

            // 新しいセッションを作成
            const sessionId = await this._terminalService.createSession(workspaceRoot);

            // タブを作成
            const tabId = `tab-${++this._tabCounter}`;
            const tab: TerminalTab = {
                id: tabId,
                sessionId: sessionId,
                shellName: shellName,
                isClaudeCodeRunning: false
            };
            this._tabs.push(tab);

            // 出力リスナーを設定
            this._setupSessionOutput(tab);

            // タブ作成を通知
            this._view?.webview.postMessage({
                type: 'tabCreated',
                tabId: tabId,
                shellName: shellName,
                tabIndex: this._tabs.length
            });

            // 新しいタブをアクティブ化
            this._activateTab(tabId);

            // ボタンの表示状態を更新
            this._updateNewTabButtonVisibility();
        } catch (error) {
            console.error('Failed to create terminal tab:', error);
            this._view?.webview.postMessage({
                type: 'error',
                message: `Failed to create terminal: ${error}`
            });
        }
    }

    private _activateTab(tabId: string): void {
        const tab = this._tabs.find(t => t.id === tabId);
        if (tab) {
            this._activeTabId = tabId;
            this._view?.webview.postMessage({
                type: 'tabActivated',
                tabId: tabId
            });

            // タブに関連するファイルがあればEditorViewで開く
            const associatedFilePath = this._tabFileMap.get(tabId);
            if (associatedFilePath && this._editorProvider) {
                this._editorProvider.showFile(associatedFilePath);

                // Plans Viewのディレクトリも切り替える
                if (this._plansProvider) {
                    const parentDir = path.dirname(associatedFilePath);
                    this._plansProvider.setActiveFolder(parentDir, false);
                }
            }
        }
    }

    private _updateNewTabButtonVisibility(): void {
        // タブ数が最大数に達している場合、ボタンを非表示にする
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

        // 出力リスナーを解除
        const disposable = this._outputDisposables.get(tabId);
        if (disposable) {
            disposable.dispose();
            this._outputDisposables.delete(tabId);
        }

        // セッションを終了
        this._terminalService.killSession(tab.sessionId);

        // タブに関連するファイルパスのエントリを削除
        this._tabFileMap.delete(tabId);

        // タブを削除
        this._tabs.splice(tabIndex, 1);

        // タブ削除を通知
        this._view?.webview.postMessage({
            type: 'tabClosed',
            tabId: tabId
        });

        // アクティブタブが閉じられた場合、別のタブをアクティブ化
        if (this._activeTabId === tabId) {
            if (this._tabs.length > 0) {
                // 前のタブか最後のタブをアクティブ化
                const newActiveIndex = Math.min(tabIndex, this._tabs.length - 1);
                this._activateTab(this._tabs[newActiveIndex].id);
            } else {
                this._activeTabId = undefined;
                // タブが0件になったら自動で1件作成
                this._createTab();
            }
        }

        // ボタンの表示状態を更新
        this._updateNewTabButtonVisibility();
    }

    private _cleanup(): void {
        // すべての出力リスナーを解除
        this._outputDisposables.forEach(disposable => disposable.dispose());
        this._outputDisposables.clear();

        // すべてのセッションを終了
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
        // アクティブタブのみを閉じる
        if (this._activeTabId) {
            this._closeTab(this._activeTabId);
        }
    }

    public async newTerminal(): Promise<void> {
        await this._createTab();
    }

    /**
     * ターミナルにコマンドを送信
     * @param command 実行するコマンド
     * @param addNewline 改行を追加するかどうか（デフォルト: true、Claude Code起動中は自動的にfalse）
     * @param filePath コマンドを送信したファイルのパス（オプション）
     * @param commandType コマンドの種類（オプション）
     */
    public async sendCommand(command: string, addNewline: boolean = true, filePath?: string, commandType?: 'run' | 'plan' | 'spec'): Promise<void> {
        // タブがない場合は作成
        if (this._tabs.length === 0) {
            await this._createTab();
        }

        // アクティブタブに送信
        if (this._activeTabId) {
            const tab = this._tabs.find(t => t.id === this._activeTabId);
            if (tab) {
                // Claude Code起動中は改行を追加しない
                const shouldAddNewline = addNewline && !tab.isClaudeCodeRunning;
                const commandToSend = shouldAddNewline ? command + '\n' : command;
                this._terminalService.write(tab.sessionId, commandToSend);

                // ファイルパスが渡された場合、アクティブタブと関連付ける
                if (filePath) {
                    this._tabFileMap.set(this._activeTabId, filePath);
                }

                // commandTypeが渡された場合、タブに保存してUIを更新
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
     * 複数のパスをターミナルに挿入（改行なし）
     * @param paths 挿入するパスの配列
     */
    public async insertPaths(paths: string[]): Promise<void> {
        // タブがない場合は作成
        if (this._tabs.length === 0) {
            await this._createTab();
        }

        // アクティブタブに送信
        if (this._activeTabId) {
            const tab = this._tabs.find(t => t.id === this._activeTabId);
            if (tab) {
                const pathText = paths.join(' ');
                this._terminalService.write(tab.sessionId, pathText);
            }
        }

        // Terminalビューをフォーカス
        this.focus();
    }

    /**
     * ターミナルビューをフォーカス
     */
    public focus(): void {
        if (this._view) {
            // preserveFocus: false でフォーカスを移動
            this._view.show(false);
            // Webview内のxtermにフォーカスを当てる
            this._view.webview.postMessage({ type: 'focus' });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // xterm.jsのローカルリソースURIを取得
        const xtermCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'xterm', 'xterm.css'));
        const xtermJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'xterm', 'xterm.js'));
        const xtermFitUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'xterm', 'xterm-addon-fit.js'));
        const xtermWebLinksUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'xterm', 'xterm-addon-web-links.js'));
        const xtermUnicode11Uri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'xterm', 'xterm-addon-unicode11.js'));

        // 設定を取得
        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
        const fontSize = config.get<number>('terminal.fontSize', 12);
        const fontFamily = config.get<string>('terminal.fontFamily', 'monospace');
        const cursorStyle = config.get<string>('terminal.cursorStyle', 'block');
        const cursorBlink = config.get<boolean>('terminal.cursorBlink', true);
        const scrollback = config.get<number>('terminal.scrollback', 1000);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
    <title>Terminal</title>
    <link rel="stylesheet" href="${xtermCssUri}">
    <style>
        html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            width: 100%;
            overflow: hidden;
            background: var(--vscode-terminal-background, #1e1e1e);
            position: relative;
            box-sizing: border-box;
            border: 1px solid transparent;
        }
        body.focused {
            border-color: var(--vscode-focusBorder);
        }
        #header {
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 12px;
            color: var(--vscode-foreground);
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
        }
        .header-row-1 {
            height: 33px;
            padding: 0 4px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-sizing: border-box;
        }
        .header-row-2 {
            padding: 4px 8px;
            display: flex;
            gap: 4px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .shortcut-group {
            display: flex;
            gap: 4px;
        }
        .shortcut-group.hidden {
            display: none;
        }
        .shortcut-button {
            padding: 2px 8px;
            font-size: 11px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        .shortcut-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .shortcut-button.toggle-button {
            padding: 2px 6px;
            margin-left: 4px;
            opacity: 0.6;
        }
        .shortcut-button.toggle-button:hover {
            opacity: 1;
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .tab-bar {
            display: flex;
            align-items: center;
            gap: 2px;
            flex: 1;
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: none;
        }
        .tab-bar::-webkit-scrollbar {
            display: none;
        }
        .tab {
            display: flex;
            align-items: center;
            padding: 4px 8px;
            background-color: transparent;
            border: none;
            border-radius: 4px 4px 0 0;
            cursor: pointer;
            white-space: nowrap;
            color: var(--vscode-foreground);
            opacity: 0.7;
            font-size: 11px;
        }
        .tab:hover {
            opacity: 1;
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        .tab.active {
            opacity: 1;
            background-color: var(--vscode-terminal-background, #1e1e1e);
        }
        .tab-title {
        }
        .close-tab-button {
            padding: 2px 8px;
            font-size: 11px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            margin-left: auto;
        }
        .close-tab-button:hover {
            background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
        }
        .close-tab-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .new-tab-button {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            padding: 0;
            background: none;
            border: none;
            border-radius: 4px;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 16px;
            flex-shrink: 0;
        }
        .new-tab-button:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        .header-actions {
            display: flex;
            align-items: center;
            gap: 4px;
            flex-shrink: 0;
            margin-left: 8px;
        }
        .header-button {
            padding: 2px 6px;
            font-size: 11px;
            background-color: transparent;
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-button-border, transparent);
            border-radius: 2px;
            cursor: pointer;
        }
        .header-button:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        .header-button.danger:hover {
            background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
        }
        #terminals-container {
            height: calc(100% - 33px - 29px);
            width: 100%;
            position: relative;
            overflow: hidden;
        }
        #terminal-overlay {
            position: absolute;
            top: 62px;
            left: 0;
            right: 0;
            bottom: 0;
            pointer-events: none;
            z-index: 9999;
        }
        .terminal-wrapper {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: none;
            background: var(--vscode-terminal-background, #1e1e1e);
        }
        .terminal-wrapper.active {
            display: block;
        }
        .terminal-wrapper .xterm {
            position: relative;
            z-index: 1;
        }
        #error-message {
            color: var(--vscode-errorForeground, #f44747);
            padding: 10px;
            display: none;
        }
        .xterm {
            height: 100%;
            width: 100%;
        }
        .xterm-viewport, .xterm-screen {
            width: 100% !important;
        }
        .scroll-to-bottom-button {
            position: absolute;
            bottom: 16px;
            right: 16px;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background-color: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #ffffff);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            pointer-events: auto;
            opacity: 1;
            transition: opacity 0.2s, transform 0.2s;
        }
        .scroll-to-bottom-button:hover {
            transform: scale(1.1);
            background-color: var(--vscode-button-hoverBackground, #1177bb);
        }
        .scroll-to-bottom-button.hidden {
            opacity: 0;
            pointer-events: none;
        }
    </style>
</head>
<body>
    <div id="header">
        <div class="header-row-1">
            <div class="tab-bar" id="tab-bar">
                <button class="new-tab-button" id="new-tab-button" title="New Terminal">+</button>
            </div>
            <div class="header-actions">
                <button class="header-button" id="clear-button" title="Clear Terminal">Clear</button>
                <button class="header-button danger" id="kill-button" title="Close Terminal">Close</button>
            </div>
        </div>
        <div class="header-row-2" id="shortcut-bar">
            <div class="shortcut-group" id="shortcuts-not-running">
                <button class="shortcut-button" id="btn-claude">claude</button>
                <button class="shortcut-button" id="btn-claude-c">claude -c</button>
                <button class="shortcut-button" id="btn-claude-r">claude -r</button>
                <button class="shortcut-button toggle-button" id="toggle-shortcuts-1" title="Switch to Claude Code commands">⇆</button>
            </div>
            <div class="shortcut-group hidden" id="shortcuts-running">
                <button class="shortcut-button" id="btn-compact">/compact</button>
                <button class="shortcut-button" id="btn-clear">/clear</button>
                <button class="shortcut-button toggle-button" id="toggle-shortcuts-2" title="Switch to shell commands">⇆</button>
            </div>
        </div>
    </div>
    <div id="error-message"></div>
    <div id="terminals-container"></div>
    <div id="terminal-overlay">
        <button class="scroll-to-bottom-button hidden" id="scroll-to-bottom-btn" title="Scroll to bottom">↓</button>
    </div>
    <script src="${xtermJsUri}"></script>
    <script src="${xtermFitUri}"></script>
    <script src="${xtermWebLinksUri}"></script>
    <script src="${xtermUnicode11Uri}"></script>
    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            const tabBar = document.getElementById('tab-bar');
            const terminalsContainer = document.getElementById('terminals-container');
            const errorMessage = document.getElementById('error-message');
            const scrollToBottomBtn = document.getElementById('scroll-to-bottom-btn');

            // タブとターミナルの管理
            const tabs = new Map(); // tabId -> { tabEl, wrapperEl, term, fitAddon }
            let activeTabId = null;

            // リサイズデバウンス用タイマー
            const resizeTimers = new Map(); // tabId -> timeout

            // Claude Code起動状態の管理
            const claudeCodeState = new Map(); // tabId -> boolean

            // スクロール位置の状態管理（最下部にいるかどうか）
            const isAtBottomState = new Map(); // tabId -> boolean

            // 最下部判定のヘルパー関数
            function isTerminalAtBottom(term) {
                const buffer = term.buffer.active;
                const baseY = buffer.baseY;
                const viewportY = buffer.viewportY;
                // baseY === viewportY の場合、最下部にいる
                return baseY === viewportY;
            }

            // ショートカットバーの表示切り替え
            function updateShortcutBar(isClaudeCodeRunning) {
                console.log('[DEBUG WebView] updateShortcutBar called - isClaudeCodeRunning: ' + isClaudeCodeRunning);
                const notRunning = document.getElementById('shortcuts-not-running');
                const running = document.getElementById('shortcuts-running');
                if (isClaudeCodeRunning) {
                    notRunning.classList.add('hidden');
                    running.classList.remove('hidden');
                    console.log('[DEBUG WebView] Showing Claude Code shortcuts (/compact, /clear)');
                } else {
                    notRunning.classList.remove('hidden');
                    running.classList.add('hidden');
                    console.log('[DEBUG WebView] Showing shell shortcuts (claude, claude -c, claude -r)');
                }
            }

            // CSS変数から色を取得するヘルパー関数
            function getCssVar(name, fallback) {
                const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
                return value || fallback;
            }

            // ターミナル設定
            const terminalConfig = {
                fontSize: ${fontSize},
                fontFamily: '${fontFamily}',
                cursorStyle: '${cursorStyle}',
                cursorBlink: ${cursorBlink},
                scrollback: ${scrollback}
            };

            // 新しいタブを作成
            function createTab(tabId, shellName, tabIndex) {
                // タブ要素を作成
                const tabEl = document.createElement('div');
                tabEl.className = 'tab';
                tabEl.dataset.tabId = tabId;
                tabEl.innerHTML = \`
                    <span class="tab-title">\${shellName}</span>
                \`;

                // タブクリックでアクティブ化
                tabEl.addEventListener('click', () => {
                    vscode.postMessage({ type: 'activateTab', tabId: tabId });
                });

                // +ボタンの前にタブを挿入
                const newTabButton = document.getElementById('new-tab-button');
                tabBar.insertBefore(tabEl, newTabButton);

                // ターミナルラッパーを作成（activeで作成してサイズ計算を可能に）
                const wrapperEl = document.createElement('div');
                wrapperEl.className = 'terminal-wrapper active';
                wrapperEl.dataset.tabId = tabId;
                terminalsContainer.appendChild(wrapperEl);

                // xtermインスタンスを作成
                const term = new Terminal({
                    ...terminalConfig,
                    theme: {
                        background: getCssVar('--vscode-terminal-background', '#1e1e1e'),
                        foreground: getCssVar('--vscode-terminal-foreground', '#cccccc'),
                        cursor: getCssVar('--vscode-terminalCursor-foreground', '#ffffff'),
                        cursorAccent: getCssVar('--vscode-terminalCursor-background', '#000000'),
                        selectionBackground: getCssVar('--vscode-terminal-selectionBackground', '#264f78')
                    }
                });

                // Fit Addonをロード
                const fitAddon = new FitAddon.FitAddon();
                term.loadAddon(fitAddon);

                // Unicode11 Addonをロード（日本語などのCJK文字の幅を正しく計算）
                try {
                    if (typeof Unicode11Addon !== 'undefined' && Unicode11Addon.Unicode11Addon) {
                        const unicode11Addon = new Unicode11Addon.Unicode11Addon();
                        term.loadAddon(unicode11Addon);
                        term.unicode.activeVersion = '11';
                    }
                } catch (e) {
                    console.warn('Failed to load Unicode11 addon:', e);
                }

                // Web Links Addonをロード
                const webLinksAddon = new WebLinksAddon.WebLinksAddon((event, uri) => {
                    event.preventDefault();
                    vscode.postMessage({ type: 'openUrl', url: uri });
                });
                term.loadAddon(webLinksAddon);

                // ターミナルを開く
                term.open(wrapperEl);

                // スクロール位置を監視してボタンの表示/非表示を切り替え
                function updateScrollButtonVisibility(targetTabId) {
                    const tabInfo = tabs.get(targetTabId);
                    if (!tabInfo) return;

                    // 最下部にいるかどうかを判定
                    const atBottom = isTerminalAtBottom(tabInfo.term);

                    // スクロール位置の状態を更新（全タブの状態を更新）
                    isAtBottomState.set(targetTabId, atBottom);

                    // アクティブタブの場合のみボタンの表示/非表示を更新
                    if (activeTabId === targetTabId) {
                        const buffer = tabInfo.term.buffer.active;
                        const baseY = buffer.baseY;
                        const hasScrollback = baseY > 0;

                        if (hasScrollback && !atBottom) {
                            scrollToBottomBtn.classList.remove('hidden');
                        } else {
                            scrollToBottomBtn.classList.add('hidden');
                        }
                    }
                }

                // xterm.jsのonScrollイベントを監視
                term.onScroll(() => {
                    updateScrollButtonVisibility(tabId);
                });

                // xterm-viewportのネイティブスクロールイベントも監視（DOM構築後に設定）
                requestAnimationFrame(() => {
                    const viewport = wrapperEl.querySelector('.xterm-viewport');
                    if (viewport) {
                        viewport.addEventListener('scroll', () => {
                            updateScrollButtonVisibility(tabId);
                        }, { passive: true });
                    }
                });

                // カスタムリンクプロバイダー（ファイルパス用）
                term.registerLinkProvider({
                    provideLinks: (bufferLineNumber, callback) => {
                        const line = term.buffer.active.getLine(bufferLineNumber - 1);
                        if (!line) {
                            callback(undefined);
                            return;
                        }
                        const text = line.translateToString();
                        const links = [];

                        const filePattern = /(?:^|[\\s'":([])(\\.?\\/|\\.\\.?\\/|\\/)?([a-zA-Z0-9_.\\-]+\\/)*[a-zA-Z0-9_.\\-]+\\.[a-zA-Z0-9]+(?::(\\d+))?/g;
                        let match;

                        while ((match = filePattern.exec(text)) !== null) {
                            const fullMatch = match[0];
                            const delimMatch = fullMatch.match(/^[\\s'":([]/);
                            const startIndex = match.index + (delimMatch ? delimMatch[0].length : 0);
                            const pathWithLine = delimMatch ? fullMatch.slice(delimMatch[0].length) : fullMatch;

                            const lineMatch = pathWithLine.match(/:(\\d+)$/);
                            const filePath = lineMatch ? pathWithLine.replace(/:(\\d+)$/, '') : pathWithLine;
                            const lineNumber = lineMatch ? parseInt(lineMatch[1]) : undefined;

                            links.push({
                                range: {
                                    start: { x: startIndex + 1, y: bufferLineNumber },
                                    end: { x: startIndex + pathWithLine.length + 1, y: bufferLineNumber }
                                },
                                text: pathWithLine,
                                activate: () => {
                                    vscode.postMessage({
                                        type: 'openFile',
                                        path: filePath,
                                        line: lineNumber
                                    });
                                }
                            });
                        }

                        callback(links.length > 0 ? links : undefined);
                    }
                });

                // ユーザー入力をExtensionに送信
                term.onData(data => {
                    vscode.postMessage({ type: 'input', tabId: tabId, data: data });
                });

                // タブ情報を保存
                const tabInfo = {
                    tabEl: tabEl,
                    wrapperEl: wrapperEl,
                    term: term,
                    fitAddon: fitAddon
                };
                tabs.set(tabId, tabInfo);

                // スクロール位置の初期状態を設定（最下部にいる状態）
                isAtBottomState.set(tabId, true);

                // リサイズを監視（デバウンス付き）
                const resizeObserver = new ResizeObserver(() => {
                    if (wrapperEl.classList.contains('active')) {
                        // 既存のタイマーをクリア
                        const existingTimer = resizeTimers.get(tabId);
                        if (existingTimer) {
                            clearTimeout(existingTimer);
                        }

                        // デバウンス: 200ms後に実行
                        const timer = setTimeout(() => {
                            // リサイズ前に最下部にいたかどうかを確認
                            const wasAtBottom = isAtBottomState.get(tabId);

                            try {
                                fitAddon.fit();
                                vscode.postMessage({
                                    type: 'resize',
                                    tabId: tabId,
                                    cols: term.cols,
                                    rows: term.rows
                                });

                                // 最下部にいた場合は自動的に追従
                                // fitの処理が完了してからスクロールするため、2回のrequestAnimationFrameを使用
                                if (wasAtBottom) {
                                    requestAnimationFrame(() => {
                                        requestAnimationFrame(() => {
                                            term.scrollToBottom();
                                            // 確実に最下部にいることを記録
                                            isAtBottomState.set(tabId, true);
                                        });
                                    });
                                }
                            } catch (e) {
                                console.error('Resize error:', e);
                            }

                            resizeTimers.delete(tabId);
                        }, 200);

                        resizeTimers.set(tabId, timer);
                    }
                });
                resizeObserver.observe(wrapperEl);

                return tabInfo;
            }

            // タブをアクティブ化
            function activateTab(tabId) {
                console.log('[DEBUG WebView] activateTab called - tabId: ' + tabId);
                const tabInfo = tabs.get(tabId);
                if (!tabInfo) return;

                // すべてのタブを非アクティブ化
                tabs.forEach((info, id) => {
                    info.tabEl.classList.remove('active');
                    info.wrapperEl.classList.remove('active');
                });

                // 指定タブをアクティブ化
                tabInfo.tabEl.classList.add('active');
                tabInfo.wrapperEl.classList.add('active');
                activeTabId = tabId;

                // ショートカットバーの状態を更新
                const isClaudeCodeRunning = claudeCodeState.get(tabId) || false;
                console.log('[DEBUG WebView] activateTab - tabId: ' + tabId + ', isClaudeCodeRunning: ' + isClaudeCodeRunning);
                updateShortcutBar(isClaudeCodeRunning);

                // スクロールボタンの表示状態を更新
                const buffer = tabInfo.term.buffer.active;
                const hasScrollback = buffer.baseY > 0;
                const isScrolledUp = buffer.viewportY < buffer.baseY;
                if (hasScrollback && isScrolledUp) {
                    scrollToBottomBtn.classList.remove('hidden');
                } else {
                    scrollToBottomBtn.classList.add('hidden');
                }

                // フィット調整とリサイズ通知（DOMレンダリング後に実行）
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        tabInfo.fitAddon.fit();
                        vscode.postMessage({
                            type: 'resize',
                            tabId: tabId,
                            cols: tabInfo.term.cols,
                            rows: tabInfo.term.rows
                        });
                        tabInfo.term.focus();
                    });
                });
            }

            // タブを閉じる
            function closeTab(tabId) {
                const tabInfo = tabs.get(tabId);
                if (!tabInfo) return;

                tabInfo.tabEl.remove();
                tabInfo.wrapperEl.remove();
                tabInfo.term.dispose();
                tabs.delete(tabId);

                // スクロール位置の状態をクリア
                isAtBottomState.delete(tabId);
            }

            // Extensionからのメッセージを処理
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.type) {
                    case 'tabCreated':
                        createTab(message.tabId, message.shellName, message.tabIndex);
                        errorMessage.style.display = 'none';
                        break;
                    case 'tabActivated':
                        activateTab(message.tabId);
                        break;
                    case 'tabClosed':
                        closeTab(message.tabId);
                        break;
                    case 'output':
                        {
                            const tabInfo = tabs.get(message.tabId);
                            if (tabInfo) {
                                // 出力前に最下部にいたかどうかを確認
                                const wasAtBottom = isAtBottomState.get(message.tabId);

                                // write()のコールバックを使用して、書き込み完了後にスクロール
                                tabInfo.term.write(message.data, () => {
                                    // 最下部にいた場合は自動的に追従
                                    if (wasAtBottom) {
                                        // DOM更新を確実に待つため、2回のrequestAnimationFrameを使用
                                        requestAnimationFrame(() => {
                                            requestAnimationFrame(() => {
                                                tabInfo.term.scrollToBottom();
                                                // 確実に最下部にいることを記録
                                                isAtBottomState.set(message.tabId, true);
                                            });
                                        });
                                    }
                                });
                            }
                        }
                        break;
                    case 'clear':
                        {
                            const tabInfo = tabs.get(message.tabId);
                            if (tabInfo) {
                                tabInfo.term.clear();
                            }
                        }
                        break;
                    case 'error':
                        errorMessage.textContent = message.message;
                        errorMessage.style.display = 'block';
                        break;
                    case 'focus':
                        if (activeTabId) {
                            const tabInfo = tabs.get(activeTabId);
                            if (tabInfo) {
                                tabInfo.term.focus();
                            }
                        }
                        break;
                    case 'claudeCodeStateChanged':
                        {
                            console.log('[DEBUG WebView] Received claudeCodeStateChanged - tabId: ' + message.tabId + ', isRunning: ' + message.isRunning + ', activeTabId: ' + activeTabId);
                            claudeCodeState.set(message.tabId, message.isRunning);
                            if (message.tabId === activeTabId) {
                                console.log('[DEBUG WebView] This is the active tab, updating shortcut bar');
                                updateShortcutBar(message.isRunning);
                            } else {
                                console.log('[DEBUG WebView] This is not the active tab, state saved but not updating UI');
                            }
                        }
                        break;
                    case 'updateNewTabButtonVisibility':
                        {
                            const newTabButton = document.getElementById('new-tab-button');
                            if (newTabButton) {
                                if (message.visible) {
                                    newTabButton.style.display = 'flex';
                                } else {
                                    newTabButton.style.display = 'none';
                                }
                            }
                        }
                        break;
                    case 'sessionClosed':
                        {
                            const tabInfo = tabs.get(message.tabId);
                            if (tabInfo) {
                                // ターミナルに終了メッセージを表示
                                tabInfo.term.write('\\r\\n\\x1b[31m[Session closed - Exit code: ' + message.exitCode + ']\\x1b[0m\\r\\n');

                                // 再接続ボタンを表示
                                const tabElement = document.querySelector('[data-tab-id="' + message.tabId + '"]');
                                if (tabElement) {
                                    const reconnectBtn = document.createElement('button');
                                    reconnectBtn.className = 'reconnect-button';
                                    reconnectBtn.textContent = 'Reconnect';
                                    reconnectBtn.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 10px 20px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; z-index: 1000;';
                                    reconnectBtn.onclick = () => {
                                        vscode.postMessage({ type: 'reconnect', tabId: message.tabId });
                                        reconnectBtn.remove();
                                    };
                                    tabElement.appendChild(reconnectBtn);
                                }
                            }
                        }
                        break;
                    case 'sessionReconnected':
                        {
                            const tabInfo = tabs.get(message.tabId);
                            if (tabInfo) {
                                // ターミナルに再接続メッセージを表示
                                tabInfo.term.write('\\r\\n\\x1b[32m[Session reconnected]\\x1b[0m\\r\\n');
                            }
                        }
                        break;
                    case 'updateTabCommandType':
                        {
                            const tabElement = document.querySelector('[data-tab-id="' + message.tabId + '"]');
                            if (tabElement) {
                                const titleSpan = tabElement.querySelector('.tab-title');
                                if (titleSpan) {
                                    // コマンドタイプに応じたアイコンを取得
                                    let icon = '';
                                    if (message.commandType === 'run') {
                                        icon = '▶️ ';
                                    } else if (message.commandType === 'plan') {
                                        icon = '📝 ';
                                    } else if (message.commandType === 'spec') {
                                        icon = '📑 ';
                                    }

                                    // shellNameを取得（既存のテキストからアイコンを除去）
                                    const currentText = titleSpan.textContent || '';
                                    const shellName = currentText.replace(/^[▶️📝📑]\s+/, '');

                                    // アイコン付きでタイトルを更新
                                    titleSpan.textContent = icon + shellName;
                                }
                            }
                        }
                        break;
                }
            });

            // ヘッダーボタンのイベントハンドラ
            document.getElementById('new-tab-button')?.addEventListener('click', () => {
                vscode.postMessage({ type: 'createTab' });
            });
            document.getElementById('clear-button')?.addEventListener('click', () => {
                vscode.postMessage({ type: 'clearTerminal' });
            });
            document.getElementById('kill-button')?.addEventListener('click', () => {
                vscode.postMessage({ type: 'killTerminal' });
            });

            // ショートカットボタンのイベントハンドラ
            function sendShortcut(command, startsClaudeCode) {
                if (!activeTabId) return;

                const tabInfo = tabs.get(activeTabId);
                if (tabInfo) {
                    tabInfo.term.focus();
                }

                // Extension側でコマンド送信を処理
                vscode.postMessage({
                    type: 'sendShortcut',
                    command: command,
                    startsClaudeCode: startsClaudeCode
                });
            }

            document.getElementById('btn-claude')?.addEventListener('click', () => sendShortcut('claude', true));
            document.getElementById('btn-claude-c')?.addEventListener('click', () => sendShortcut('claude -c', true));
            document.getElementById('btn-claude-r')?.addEventListener('click', () => sendShortcut('claude -r', true));
            document.getElementById('btn-compact')?.addEventListener('click', () => sendShortcut('/compact', false));
            document.getElementById('btn-clear')?.addEventListener('click', () => sendShortcut('/clear', false));

            // トグルボタンのイベントハンドラ（ショートカット表示の切り替え）
            function toggleShortcuts() {
                if (!activeTabId) return;
                const isClaudeRunning = claudeCodeState.get(activeTabId) || false;
                // 状態を反転
                const newState = !isClaudeRunning;
                claudeCodeState.set(activeTabId, newState);
                updateShortcutBar(newState);
                // Extension側にも状態を通知
                vscode.postMessage({ type: 'setClaudeCodeRunning', tabId: activeTabId, isRunning: newState });
            }
            document.getElementById('toggle-shortcuts-1')?.addEventListener('click', toggleShortcuts);
            document.getElementById('toggle-shortcuts-2')?.addEventListener('click', toggleShortcuts);

            // スクロールボタンのイベントハンドラ
            scrollToBottomBtn?.addEventListener('click', () => {
                if (activeTabId) {
                    const tabInfo = tabs.get(activeTabId);
                    if (tabInfo) {
                        tabInfo.term.scrollToBottom();
                        // 最下部に移動したので状態を更新
                        isAtBottomState.set(activeTabId, true);
                        scrollToBottomBtn.classList.add('hidden');
                        tabInfo.term.focus();
                    }
                }
            });

            // Focus/blur handlers for visual focus indicator
            window.addEventListener('focus', () => {
                document.body.classList.add('focused');
            });
            window.addEventListener('blur', () => {
                document.body.classList.remove('focused');
            });

            // 準備完了を通知
            vscode.postMessage({ type: 'ready' });
        })();
    </script>
</body>
</html>`;
    }

    /**
     * すべてのセッションをクリーンアップ
     */
    private _cleanupAllSessions(): void {
        for (const tab of this._tabs) {
            this._terminalService.killSession(tab.sessionId);
            const disposable = this._outputDisposables.get(tab.sessionId);
            if (disposable) {
                disposable.dispose();
            }
        }
        this._outputDisposables.clear();
        this._tabs = [];
        this._activeTabId = undefined;
    }

    /**
     * セッションの出力リスナーを設定
     */
    private _setupSessionOutput(tab: TerminalTab): void {
        const disposable = this._terminalService.onOutput(tab.sessionId, (data) => {
            this._view?.webview.postMessage({
                type: 'output',
                tabId: tab.id,
                data: data
            });

            // エスケープシーケンスを除去してクリーンなテキストを取得
            const cleanData = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

            // Claude Code起動検知
            if (!tab.isClaudeCodeRunning) {
                const claudeStartPatterns = [
                    /claude>\s*$/,
                    /╭─/,
                    /Entering interactive mode/i,
                    /Type \/help/i
                ];
                for (const pattern of claudeStartPatterns) {
                    if (pattern.test(cleanData)) {
                        tab.isClaudeCodeRunning = true;
                        this._view?.webview.postMessage({
                            type: 'claudeCodeStateChanged',
                            tabId: tab.id,
                            isRunning: true
                        });
                        break;
                    }
                }
            }

            // Claude Code終了検知
            if (tab.isClaudeCodeRunning) {
                const shellPromptPattern = /[$%#]\s*$/;
                const claudeCodePatterns = ['claude', '❯', '╭', '╰', '─', '│'];
                const containsClaudePattern = claudeCodePatterns.some(pattern => cleanData.includes(pattern));

                if (shellPromptPattern.test(cleanData) && !containsClaudePattern) {
                    tab.isClaudeCodeRunning = false;
                    this._view?.webview.postMessage({
                        type: 'claudeCodeStateChanged',
                        tabId: tab.id,
                        isRunning: false
                    });
                }
            }
        });

        this._outputDisposables.set(tab.id, disposable);
    }

    /**
     * タブのセッションを再接続
     */
    private async _reconnectTab(tabId: string): Promise<void> {
        const tab = this._tabs.find(t => t.id === tabId);
        if (!tab) {
            return;
        }

        try {
            // 古い出力リスナーを削除
            const oldDisposable = this._outputDisposables.get(tab.id);
            if (oldDisposable) {
                oldDisposable.dispose();
                this._outputDisposables.delete(tab.id);
            }

            // 新しいセッションを作成
            const newSessionId = await this._terminalService.createSession();
            tab.sessionId = newSessionId;
            tab.isClosed = false;

            // 出力リスナーを設定
            this._setupSessionOutput(tab);

            // Webviewに再接続完了を通知
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
     * セッション終了ハンドラを設定
     */
    private _setupSessionExitHandler(): void {
        this._terminalService.onSessionExit((sessionId, exitCode, signal) => {
            const tab = this._tabs.find(t => t.sessionId === sessionId);
            if (tab) {
                console.log(`Session ${sessionId} for tab ${tab.id} exited with code ${exitCode}`);
                tab.isClosed = true;
                tab.isClaudeCodeRunning = false;

                // Webviewに終了を通知
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
     * EditorProviderを設定
     */
    public setEditorProvider(provider: IEditorProvider): void {
        this._editorProvider = provider;
    }

    /**
     * PlansProviderを設定
     */
    public setPlansProvider(provider: IPlansProvider): void {
        this._plansProvider = provider;
    }

    dispose(): void {
        this._cleanup();
        this._terminalService.dispose();
    }
}
