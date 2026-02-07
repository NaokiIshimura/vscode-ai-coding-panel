import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import { TerminalService } from '../services/TerminalService';
import { ITerminalService } from '../interfaces/ITerminalService';

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
    isClaudeCodeRunning: boolean;  // Claude Codeセッションが起動しているか
    isProcessing?: boolean;         // Claude Codeが処理中か
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

    // 出力監視の状態管理
    private _outputMonitor = new Map<string, {
        lastOutputTime: number;
        processingTimeout?: NodeJS.Timeout;
    }>();

    // プロセスチェック用の単一インターバル（全タブ共通）
    private _processCheckInterval?: NodeJS.Timeout;
    // 現在のプロセスチェック間隔（ms）
    private _currentCheckIntervalMs: number = TerminalProvider.PROCESS_CHECK_INTERVAL_ACTIVE;
    // WebViewの可視性状態
    private _isWebviewVisible: boolean = true;

    // プロセス名追跡（タブごと）
    private _lastProcessNames = new Map<string, string>();

    // Disposable管理
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

        // Webview再生成時は全セッションを終了してリセット
        if (this._tabs.length > 0) {
            this._cleanupAllSessions();
        }

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);

        // WebViewの可視性変更イベントを監視
        this._disposables.push(
            webviewView.onDidChangeVisibility(() => {
                if (!webviewView.visible) {
                    // 非表示になる前にスクロール状態を保存
                    this._onWebviewBecameHidden();
                } else {
                    // 表示時にスクロール位置を復元
                    this._onWebviewBecameVisible();
                }
            })
        );

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
                    this.handleShortcut(data.command as string, data.startsClaudeCode as boolean);
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
                case 'reconnect':
                    await this._reconnectTab(data.tabId);
                    break;
            }
        });

        // WebViewが破棄されたときにセッションを終了
        this._disposables.push(
            webviewView.onDidDispose(() => {
                this._cleanup();
            })
        );
    }

    /**
     * WebViewが非表示になる前の処理
     * - 現在のスクロール状態を保存
     * - プロセスチェックを停止
     */
    private _onWebviewBecameHidden(): void {
        this._isWebviewVisible = false;

        // プロセスチェックを停止
        this._stopAllProcessChecks();

        if (!this._view) {
            return;
        }

        // WebViewに現在のスクロール状態を保存するよう指示
        this._view.webview.postMessage({
            type: 'saveScrollPositions'
        });
    }

    /**
     * WebViewが表示状態になった時の処理
     * - スクロール位置を復元
     * - アクティブタブにフォーカス
     * - プロセスチェックを再開
     */
    private _onWebviewBecameVisible(): void {
        this._isWebviewVisible = true;

        // プロセスチェックを再開（タブが存在する場合）
        if (this._tabs.length > 0) {
            this._restartProcessCheckInterval();
        }

        if (!this._view) {
            return;
        }

        // WebViewにスクロール位置復元を指示（少し遅延させてDOM更新を待つ）
        setTimeout(() => {
            this._view?.webview.postMessage({
                type: 'restoreScrollPositions'
            });
        }, 50);

        // アクティブタブにフォーカス（さらに遅延させてスクロール復元後に実行）
        setTimeout(() => {
            this._view?.webview.postMessage({
                type: 'focus'
            });
        }, 200);
    }

    private static readonly MAX_TABS = 5;

    // プロセスチェック間隔の定数
    private static readonly PROCESS_CHECK_INTERVAL_ACTIVE = 1500;  // Claude Code起動中: 1.5秒
    private static readonly PROCESS_CHECK_INTERVAL_IDLE = 3000;    // 全タブ未起動: 3秒

    // エスケープシーケンス除去用の事前コンパイル済み正規表現
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
                isClaudeCodeRunning: false,
                isProcessing: false
            };
            this._tabs.push(tab);

            // 出力リスナーを設定
            this._setupSessionOutput(tab);

            // 出力監視を設定
            this._setupOutputMonitoring(tab);

            // プロセスベースのClaude Code検知を開始
            this._startProcessCheck(tab);

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

        // プロセスチェックを停止
        this._stopProcessCheck(tab);

        // 出力監視をクリーンアップ（processingTimeoutのクリアとMapエントリ削除）
        this._cleanupOutputMonitoring(tabId);

        // 出力リスナーを解除
        const disposable = this._outputDisposables.get(tabId);
        if (disposable) {
            disposable.dispose();
            this._outputDisposables.delete(tabId);
        }

        // プロセス名追跡エントリを削除
        this._lastProcessNames.delete(tabId);

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
        // プロセスチェックを停止
        this._stopAllProcessChecks();

        // すべての出力リスナーを解除
        this._outputDisposables.forEach(disposable => disposable.dispose());
        this._outputDisposables.clear();

        // 出力監視のクリーンアップ
        this._tabs.forEach(tab => {
            this._cleanupOutputMonitoring(tab.id);
        });
        this._outputMonitor.clear();

        // プロセス名追跡をクリア
        this._lastProcessNames.clear();

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
                // Claude Code起動中はペーストモードで送信して実行
                if (tab.isClaudeCodeRunning) {
                    // ペーストモードでコマンドを送信
                    // \x1b[200~ = ペースト開始、\x1b[201~ = ペースト終了
                    this._terminalService.write(tab.sessionId, '\x1b[200~' + command + '\x1b[201~');
                    // 短い遅延の後にEnterを送信して実行
                    setTimeout(() => {
                        this._terminalService.write(tab.sessionId, '\r');
                    }, 20);
                } else {
                    // シェル状態: コマンド + 改行を送信
                    const commandToSend = addNewline ? command + '\n' : command;
                    this._terminalService.write(tab.sessionId, commandToSend);
                }

                // Claude Codeコマンドの場合、即座に処理中状態にする
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
     * ショートカットコマンドを処理
     * @param command 実行するコマンド
     * @param startsClaudeCode Claude Codeを起動するコマンドかどうか
     */
    public handleShortcut(command: string, startsClaudeCode: boolean): void {
        if (!command) {
            return;
        }

        if (this._activeTabId) {
            const tab = this._tabs.find(t => t.id === this._activeTabId);
            if (tab) {
                if (tab.isClaudeCodeRunning) {
                    // Claude Code起動中: ペーストモードでコマンドを送信
                    // \x1b[200~ = ペースト開始、\x1b[201~ = ペースト終了
                    this._terminalService.write(tab.sessionId, '\x1b[200~' + command + '\x1b[201~');
                    // 短い遅延の後にEnterを送信して実行
                    setTimeout(() => {
                        this._terminalService.write(tab.sessionId, '\r');
                    }, 20);
                } else {
                    // シェル: コマンド + 改行を送信
                    this._terminalService.write(tab.sessionId, command + '\n');

                    // 状態を更新
                    if (startsClaudeCode) {
                        tab.isClaudeCodeRunning = true;
                        tab.isProcessing = true;
                        // WebViewに状態を通知
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

        return result;
    }

    /**
     * すべてのセッションをクリーンアップ
     */
    private _cleanupAllSessions(): void {
        // 各タブのクリーンアップ
        for (const tab of this._tabs) {
            // 出力監視をクリーンアップ
            this._cleanupOutputMonitoring(tab.id);

            // セッションを終了
            this._terminalService.killSession(tab.sessionId);

            // 出力リスナーを削除
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
     * エスケープシーケンスと制御文字を除去する
     */
    private _stripEscapeSequences(data: string): string {
        return data
            .replace(TerminalProvider.RE_CSI, '')
            .replace(TerminalProvider.RE_OSC, '')
            .replace(TerminalProvider.RE_CONTROL, '');
    }

    /**
     * セッションの出力リスナーを設定
     */
    private _setupSessionOutput(tab: TerminalTab): void {
        const disposable = this._terminalService.onOutput(tab.sessionId, (data) => {
            // WebViewに出力を転送
            this._view?.webview.postMessage({
                type: 'output',
                tabId: tab.id,
                data: data
            });

            // エスケープシーケンスを1回だけ除去し、クリーン済みデータを渡す
            const cleanData = this._stripEscapeSequences(data);

            // Claude Code状態検知
            this._detectClaudeCodeState(tab, cleanData);

            // 処理完了検知（タイムアウトベース）
            this._handleProcessingTimeout(tab, cleanData);
        });

        this._outputDisposables.set(tab.id, disposable);
    }

    /**
     * 出力の処理（Codexの指摘P2に対応: 適応的タイムアウト）
     * @param cleanData エスケープシーケンス除去済みのデータ
     */
    private _handleProcessingTimeout(tab: TerminalTab, cleanData: string): void {
        const monitor = this._outputMonitor.get(tab.id);
        if (!monitor) {
            return;
        }

        const trimmedData = cleanData.trim();

        // 無視すべき出力パターン（フォーカス変更などのノイズ）
        const isNoise = trimmedData.length === 0 || // 空出力
                        /^[\r\n\s]+$/.test(trimmedData) || // 改行・空白のみ
                        /^[T]+$/.test(trimmedData) || // "T"のみ（制御文字の残骸）
                        /^[\u2800-\u28FF\u2500-\u257F\u25A0-\u25FF]+$/.test(trimmedData) || // ボックス描画文字やブロック要素のみ
                        /^[░▒▓█◯◉●○◐◑◒◓]+$/.test(trimmedData) || // プログレスバーなどのグラフィック文字のみ
                        /^\[░+\]\s*\d+%$/.test(trimmedData) || // プログレスバー形式
                        /^❯\s*$/.test(trimmedData); // プロンプトのみ

        if (isNoise) {
            return;
        }

        // Claude Code起動中かつ処理中でない場合、処理中にする
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

        // 既存のタイムアウトをクリア
        if (monitor.processingTimeout) {
            clearTimeout(monitor.processingTimeout);
        }

        // 2秒間意味のある出力がなければ処理完了とみなす
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
     * フォールバック: パターンマッチングによる検知
     * @param cleanData エスケープシーケンス除去済みのデータ
     */
    private _detectClaudeCodeState(tab: TerminalTab, cleanData: string): void {
        // Claude Code起動検知
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

        // Claude Code終了検知（シェルプロンプトの検出）
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
     * タブのセッションを再接続
     */
    private async _reconnectTab(tabId: string): Promise<void> {
        const tab = this._tabs.find(t => t.id === tabId);
        if (!tab) {
            return;
        }

        try {
            // 出力監視をクリーンアップ
            this._cleanupOutputMonitoring(tab.id);

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
            tab.isClaudeCodeRunning = false;
            tab.isProcessing = false;

            // 出力リスナーを設定
            this._setupSessionOutput(tab);

            // 出力監視を設定
            this._setupOutputMonitoring(tab);

            // プロセスベースのClaude Code検知を再開
            this._startProcessCheck(tab);

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
     * プロセス監視の初期化チェック
     */
    /**
     * 出力監視のセットアップ
     */
    private _setupOutputMonitoring(tab: TerminalTab): void {
        this._outputMonitor.set(tab.id, {
            lastOutputTime: Date.now()
        });
    }

    /**
     * 出力監視のクリーンアップ
     */
    private _cleanupOutputMonitoring(tabId: string): void {
        const monitor = this._outputMonitor.get(tabId);
        if (monitor?.processingTimeout) {
            clearTimeout(monitor.processingTimeout);
        }
        this._outputMonitor.delete(tabId);
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

    /**
     * プロセスチェックを開始（単一インターバルで全タブをチェック）
     * タブが追加された時に呼び出される
     */
    private _startProcessCheck(_tab: TerminalTab): void {
        // 既にインターバルが動作中で、WebViewが表示中なら初回チェックのみ実行
        if (this._processCheckInterval && this._isWebviewVisible) {
            this._checkClaudeCodeProcess(_tab);
            return;
        }

        // WebViewが非表示の場合はインターバルを開始しない
        if (!this._isWebviewVisible) {
            return;
        }

        // インターバルを開始
        this._restartProcessCheckInterval();

        // 初回チェックを即座に実行
        this._checkClaudeCodeProcess(_tab);
    }

    /**
     * プロセスチェックのインターバルを（再）起動
     */
    private _restartProcessCheckInterval(): void {
        // 既存のインターバルを停止
        this._stopAllProcessChecks();

        // タブが0件の場合はインターバルを開始しない
        if (this._tabs.length === 0) {
            return;
        }

        // WebViewが非表示の場合はインターバルを開始しない
        if (!this._isWebviewVisible) {
            return;
        }

        // 適応的な間隔を決定
        const interval = this._determineCheckInterval();
        this._currentCheckIntervalMs = interval;

        // 全タブを一括チェックするインターバルを設定
        this._processCheckInterval = setInterval(async () => {
            await this._checkAllTabsProcess();
        }, interval);
    }

    /**
     * 適応的なチェック間隔を決定
     * Claude Codeが起動中のタブがある場合: 1.5秒
     * 全タブで未起動の場合: 3秒
     */
    private _determineCheckInterval(): number {
        const hasClaudeCodeRunning = this._tabs.some(tab => tab.isClaudeCodeRunning);
        return hasClaudeCodeRunning
            ? TerminalProvider.PROCESS_CHECK_INTERVAL_ACTIVE
            : TerminalProvider.PROCESS_CHECK_INTERVAL_IDLE;
    }

    /**
     * 全タブのプロセスチェックを実行
     */
    private async _checkAllTabsProcess(): Promise<void> {
        for (const tab of this._tabs) {
            if (!tab.isClosed) {
                await this._checkClaudeCodeProcess(tab);
            }
        }

        // チェック後に間隔を再評価（状態が変化した場合のみ再起動）
        const newInterval = this._determineCheckInterval();
        if (newInterval !== this._currentCheckIntervalMs) {
            this._restartProcessCheckInterval();
        }
    }

    /**
     * プロセスチェックを停止（タブ削除時の互換性のために残す）
     */
    private _stopProcessCheck(_tab: TerminalTab): void {
        // タブが残っていない場合のみインターバルを停止
        // （_closeTab内で呼ばれるが、タブ削除前なのでlength-1で判定）
        if (this._tabs.length <= 1) {
            this._stopAllProcessChecks();
        }
    }

    /**
     * 全プロセスチェックのインターバルを停止
     */
    private _stopAllProcessChecks(): void {
        if (this._processCheckInterval) {
            clearInterval(this._processCheckInterval);
            this._processCheckInterval = undefined;
        }
    }

    /**
     * Claude Codeプロセスの状態をチェックして更新
     * getProcessTree()を使用して1回のpsコマンドでClaude Code検知とフォアグラウンドプロセス名の両方を取得
     */
    private async _checkClaudeCodeProcess(tab: TerminalTab): Promise<void> {
        try {
            // 1回のpsコマンドでClaude Code検知とフォアグラウンドプロセス名の両方を取得
            const result = await this._terminalService.getProcessTree(tab.sessionId);

            // Claude Code状態が変わった場合のみ更新
            if (tab.isClaudeCodeRunning !== result.isClaudeCodeRunning) {
                tab.isClaudeCodeRunning = result.isClaudeCodeRunning;

                // Claude Codeが終了した場合、処理中状態もリセット
                if (!result.isClaudeCodeRunning) {
                    tab.isProcessing = false;
                }

                // WebViewに状態を通知
                this._view?.webview.postMessage({
                    type: 'claudeCodeStateChanged',
                    tabId: tab.id,
                    isRunning: result.isClaudeCodeRunning,
                    isProcessing: tab.isProcessing || false
                });
            }

            // フォアグラウンドプロセス名を取得してタブ名を更新
            this._updateTabNameFromProcessTree(tab, result.foregroundProcess);
        } catch (error) {
            console.error(`[TerminalProvider] Error checking Claude Code process:`, error);
        }
    }

    /**
     * getProcessTree()の結果からタブ名を更新
     */
    private _updateTabNameFromProcessTree(tab: TerminalTab, processName: string | null): void {
        const lastProcessName = this._lastProcessNames.get(tab.id);
        if (processName && processName !== lastProcessName) {
            this._lastProcessNames.set(tab.id, processName);
            this._updateTabNameWithProcess(tab.id, processName);
        } else if (!processName && lastProcessName) {
            // プロセスが終了した場合、シェル名に戻す
            this._lastProcessNames.delete(tab.id);
            this._updateTabNameWithProcess(tab.id, tab.shellName);
        }
    }

    /**
     * タブ名をプロセス名で更新
     */
    private _updateTabNameWithProcess(tabId: string, processName: string): void {
        const tab = this._tabs.find(t => t.id === tabId);
        if (!tab) {
            return;
        }

        // プロセス名に応じたタブ名を生成
        const displayName = this._getDisplayName(processName);

        // WebViewにタブ名更新を通知
        this._view?.webview.postMessage({
            type: 'updateTabName',
            tabId: tabId,
            processName: displayName
        });
    }

    /**
     * プロセス名から表示名を生成
     */
    private _getDisplayName(processName: string): string {
        // プロセス名のクリーンアップ
        // 例: "/usr/bin/vim" -> "vim", "bash" -> "bash"
        const baseName = processName.split('/').pop() || processName;
        return baseName;
    }

    dispose(): void {
        this._cleanup();
        this._terminalService.dispose();

        // プロセスチェックを停止（_cleanupでも停止されるが念のため）
        this._stopAllProcessChecks();

        // プロセス名追跡をクリア
        this._lastProcessNames.clear();

        // Disposableを解放
        for (const disposable of this._disposables) {
            disposable.dispose();
        }
        this._disposables = [];
    }
}
