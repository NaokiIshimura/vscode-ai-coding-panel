import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
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

    public async resolveWebviewView(
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

        webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);

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
            let shellPath = config.get<string>('terminal.shell') || process.env.SHELL || '/bin/bash';

            // シェルパスの存在確認とフォールバック
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

    private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        // xterm.jsのローカルリソースURIを取得
        const xtermCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'xterm', 'xterm.css'));
        const xtermJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'xterm', 'xterm.js'));
        const xtermFitUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'xterm', 'xterm-addon-fit.js'));
        const xtermWebLinksUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'xterm', 'xterm-addon-web-links.js'));
        const xtermUnicode11Uri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'xterm', 'xterm-addon-unicode11.js'));

        // 外部リソースのURIを取得
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'terminal', 'style.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'terminal', 'main.js'));
        const templatePath = vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'terminal', 'index.html');

        // 設定を取得
        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
        const fontSize = config.get<number>('terminal.fontSize', 12);
        const fontFamily = config.get<string>('terminal.fontFamily', 'monospace');
        const cursorStyle = config.get<string>('terminal.cursorStyle', 'block');
        const cursorBlink = config.get<boolean>('terminal.cursorBlink', true);
        const scrollback = config.get<number>('terminal.scrollback', 1000);

        // デバッグ: 設定値をログ出力
        console.log('[TerminalProvider] Terminal config:', { fontSize, fontFamily, cursorStyle, cursorBlink, scrollback });

        // ターミナル設定をJSON文字列として生成し、HTMLエスケープ
        // data属性に埋め込むため、HTMLエスケープが必要
        const configObj = {
            fontSize,
            fontFamily,
            cursorStyle,
            cursorBlink,
            scrollback
        };
        const configJson = JSON.stringify(configObj);
        // HTMLエスケープ（data属性に埋め込むため）
        const terminalConfig = configJson
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // HTMLテンプレートを読み込み
        const htmlTemplate = await fs.readFile(templatePath.fsPath, 'utf8');

        // テンプレート変数を置換
        const result = htmlTemplate
            .replace(/\{\{cspSource\}\}/g, webview.cspSource)
            .replace(/\{\{xtermCssUri\}\}/g, xtermCssUri.toString())
            .replace(/\{\{styleUri\}\}/g, styleUri.toString())
            .replace(/\{\{xtermJsUri\}\}/g, xtermJsUri.toString())
            .replace(/\{\{xtermFitUri\}\}/g, xtermFitUri.toString())
            .replace(/\{\{xtermWebLinksUri\}\}/g, xtermWebLinksUri.toString())
            .replace(/\{\{xtermUnicode11Uri\}\}/g, xtermUnicode11Uri.toString())
            .replace(/\{\{terminalConfig\}\}/g, terminalConfig)
            .replace(/\{\{scriptUri\}\}/g, scriptUri.toString());

        // デバッグ: terminalConfig部分を抽出してログ出力
        const configMatch = result.match(/data-terminal-config="([^"]*)"/);
        if (configMatch) {
            console.log('[TerminalProvider] Generated terminalConfig in HTML data attribute:', configMatch[1]);
        }

        return result;
    }

    /**
     * すべてのセッションをクリーンアップ
     */
    private _cleanupAllSessions(): void {
        for (const tab of this._tabs) {
            this._terminalService.killSession(tab.sessionId);
            const disposable = this._outputDisposables.get(tab.id);
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
