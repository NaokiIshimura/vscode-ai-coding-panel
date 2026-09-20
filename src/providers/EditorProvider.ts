import * as vscode from 'vscode';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { PlansProvider } from './PlansProvider';
import { TemplateService, SendCommandType } from '../services/TemplateService';
import { PromptTemplateService, PromptTemplateTarget } from '../services/PromptTemplateService';
import { openInIntegratedBrowser } from '../utils/browserUtils';

// Forward declaration for TerminalProvider to avoid circular dependency
export interface ITerminalProvider {
    focus(): void;
    sendCommand(command: string, addNewline?: boolean, filePath?: string, commandType?: 'run' | 'plan' | 'spec'): Promise<void>;
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
        // アクティブエディタの変更を監視
        this._disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                this._checkAndUpdateReadOnlyState(editor);
            })
        );

        // タブグループの変更を監視（タブの開閉、移動を検知）
        this._disposables.push(
            vscode.window.tabGroups.onDidChangeTabs(event => {
                this._checkAndUpdateReadOnlyState(undefined);
            })
        );

        // ファイル保存を監視してEditor Viewを更新
        this._disposables.push(
            vscode.workspace.onDidSaveTextDocument(async (document) => {
                // 保存されたファイルが現在Editor Viewで開いているファイルと一致するか確認
                if (this._currentFilePath && document.uri.fsPath === this._currentFilePath) {
                    try {
                        // ファイル内容を再読み込み
                        const content = await fs.promises.readFile(this._currentFilePath, 'utf8');

                        // 内容が変更されている場合のみ更新
                        if (content !== this._currentContent) {
                            this._currentContent = content;
                            this._pendingContent = undefined;
                            this._isDirty = false;

                            const displayPath = path.basename(this._currentFilePath);
                            const isOpenInEditor = this._isFileOpenInTab(this._currentFilePath);

                            // Webviewに更新内容を送信
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
     * ファイルがVS Codeのタブで開かれているかチェック
     */
    private _isFileOpenInTab(filePath: string): boolean {
        // すべてのタブグループをチェック
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
     * シェルコマンドの引数を安全にエスケープ
     * シングルクォートで囲み、内部のシングルクォートをエスケープ
     */
    private _escapeShellArgument(arg: string): string {
        // シングルクォートで囲み、内部のシングルクォートを '\'' に置換
        return `'${arg.replace(/'/g, "'\\''")}'`;
    }

    /**
     * Spec / Plan / Run の送信履歴を現在のファイルへ追記する
     *
     * 追記に失敗してもコマンドの送信は継続するため、エラーは記録のみ行う
     * @param commandType 送信するコマンドの種別
     */
    private async _appendSendHistory(commandType: SendCommandType): Promise<void> {
        if (!this._currentFilePath) {
            // ファイル未オープン時のRunは記録対象外
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
                // VS Codeのタブで開いている場合、ディスクへ直接書き込むと標準エディタの
                // 未保存の変更と競合するため、ドキュメント経由で書き換える
                const document = await vscode.workspace.openTextDocument(filePath);
                const wasDirty = document.isDirty;
                const original = document.getText();
                const updated = this.templateService.appendSendHistoryLine(original, commandType, dateTime);

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

                // 元々未保存の変更が無かった場合のみ保存する（編集中の状態を勝手に確定させない）
                if (!wasDirty) {
                    await document.save();
                }
            } else {
                // 直前の保存結果を正とするため、ディスク上の内容を読み直す
                const original = await fsPromises.readFile(filePath, 'utf8');
                const updated = this.templateService.appendSendHistoryLine(original, commandType, dateTime);
                await fsPromises.writeFile(filePath, updated, 'utf8');
                this._applySendHistory(updated);
            }
        } catch (error) {
            console.error(`Failed to append send history: ${error}`);
        }
    }

    /**
     * 送信履歴の追記結果を保持中の状態とWebviewへ反映する
     *
     * Webviewへ反映しないとEditor Viewの内容が古いままとなり、
     * 次の保存操作で履歴行が失われる
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

        // すべてのタブでファイルが開かれているかチェック（アクティブでなくてもタブが開いていれば）
        const isOpenInEditor = this._isFileOpenInTab(this._currentFilePath);

        // webviewに読み取り専用状態を更新
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

        // Webviewからのメッセージを受信
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'webviewReady':
                    // Webviewの準備が完了したら、保留中のファイルを復元
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
                            // 新規ファイル作成の場合はファイル名を表示
                            const fileName = path.basename(savedPath);
                            vscode.window.showInformationMessage(`File saved: ${fileName}`);
                        } else {
                            // 既存ファイルの上書き保存
                            vscode.window.showInformationMessage('File saved successfully');
                        }
                    }
                    break;
                case 'contentChanged':
                    // エディタの内容が変更された
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
                    // promptsボタン - テンプレート一覧をメニューで表示するため送信
                    await this._sendPromptTemplates();
                    break;
                case 'insertPromptTemplate':
                    // メニューで選択されたテンプレートをカーソル位置へ挿入
                    await this._insertPromptTemplateById(data.templateId);
                    break;
                case 'createPromptTemplate':
                    // メニューヘッダーの[+]ボタン - テンプレートを新規作成して開く
                    await this._createPromptTemplate();
                    break;
                case 'showWarning':
                    vscode.window.showWarningMessage(data.message);
                    break;
                case 'openUrl':
                    // URLを標準ブラウザで開く
                    if (data.url) {
                        vscode.env.openExternal(vscode.Uri.parse(data.url));
                    }
                    break;
                case 'openUrlInIntegratedBrowser':
                    // URLを統合ブラウザ（Simple Browser）で開く
                    if (data.url) {
                        await openInIntegratedBrowser(data.url as string);
                    }
                    break;
                case 'planTask':
                    // Plan button clicked - save file if needed, then send plan command to terminal
                    // ファイルが未作成 or 未保存の場合、先に保存
                    if (data.content && data.content.trim()) {
                        const planSavedPath = await this._saveCurrentContent(data.content);
                        if (!planSavedPath) {
                            return; // 保存失敗
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
                        const commandTemplate = config.get<string>('editor.planCommand', '${commandPrefix} "Review the file at ${filePath} and create an implementation plan. Save it as a timestamped file (format: YYYY_MMDD_HHMM_SS_plan.md) in the same directory as ${filePath}."');

                        // Replace placeholders with safely escaped values
                        const escapedPath = this._escapeShellArgument(relativeFilePath.trim());
                        let command = commandTemplate.replace(/\$\{commandPrefix\}/g, commandPrefix);
                        command = command.replace(/\$\{filePath\}/g, escapedPath);

                        // 送信した記録としてファイルへ日時を追記する
                        await this._appendSendHistory('plan');

                        // Send command to Terminal view
                        if (this._terminalProvider) {
                            this._terminalProvider.focus();
                            await this._terminalProvider.sendCommand(command, true, this._currentFilePath, 'plan');
                        }
                    }
                    break;
                case 'specTask':
                    // Spec button clicked - save file if needed, then send spec command to terminal
                    // ファイルが未作成 or 未保存の場合、先に保存
                    if (data.content && data.content.trim()) {
                        const specSavedPath = await this._saveCurrentContent(data.content);
                        if (!specSavedPath) {
                            return; // 保存失敗
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
                        const commandTemplate = config.get<string>('editor.specCommand', '${commandPrefix} "Review the file at ${filePath} and create specification documents. Save them as timestamped files (format: YYYY_MMDD_HHMM_SS_requirements.md, YYYY_MMDD_HHMM_SS_design.md, YYYY_MMDD_HHMM_SS_tasks.md) in the same directory as ${filePath}."');

                        // Replace placeholders with safely escaped values
                        const escapedPath = this._escapeShellArgument(relativeFilePath.trim());
                        let command = commandTemplate.replace(/\$\{commandPrefix\}/g, commandPrefix);
                        command = command.replace(/\$\{filePath\}/g, escapedPath);

                        // 送信した記録としてファイルへ日時を追記する
                        await this._appendSendHistory('spec');

                        // Send command to Terminal view
                        if (this._terminalProvider) {
                            this._terminalProvider.focus();
                            await this._terminalProvider.sendCommand(command, true, this._currentFilePath, 'spec');
                        }
                    }
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
                        // すべてのタブグループをチェックして、該当ファイルのタブを見つける
                        for (const group of vscode.window.tabGroups.all) {
                            for (const tab of group.tabs) {
                                if (tab.input instanceof vscode.TabInputText) {
                                    if (tab.input.uri.fsPath === this._currentFilePath) {
                                        // タブが見つかったら、そのドキュメントを開いてフォーカス
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
     * Runコマンドを実行する
     * ファイルが開いている場合は必要に応じて保存してからコマンドを送信し、
     * ファイルが無い場合はエディタの内容をそのままコマンドに埋め込む
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
            const commandTemplate = config.get<string>('editor.runCommand', '${commandPrefix} "Execute the instructions described in the file at ${filePath}"');

            // Replace placeholders with safely escaped values
            const escapedPath = this._escapeShellArgument(relativeFilePath.trim());
            let command = commandTemplate.replace(/\$\{commandPrefix\}/g, commandPrefix);
            command = command.replace(/\$\{filePath\}/g, escapedPath);

            // 送信した記録としてファイルへ日時を追記する
            await this._appendSendHistory('run');

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
     * Editor View以外（Terminal Viewのショートカット等）からRunコマンドを実行する
     * Editor ViewのRunボタン・Cmd+Rと同じ内容（未保存の編集内容を含む）で実行する
     */
    public async runTask(): Promise<void> {
        const latestContent = this._pendingContent ?? this._currentContent;

        if (this._currentFilePath) {
            // 未保存の変更がある場合のみ保存対象として渡す（VS Codeのタブで開いている間は保存しない）
            const isReadOnly = this._isFileOpenInTab(this._currentFilePath);
            const unsavedContent = this._isDirty && !isReadOnly ? latestContent : undefined;
            await this._runTask(unsavedContent);
        } else {
            await this._runTask(undefined, latestContent ?? '');
        }
    }

    /**
     * ファイルをEditor Viewに表示する
     * @param filePath 表示するファイルのパス
     * @param options focusEditor: 表示後にエディタ（テキストエリア）へフォーカスを移す
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

        // すべてのタブでファイルが開かれているかチェック
        const isOpenInEditor = this._isFileOpenInTab(filePath);

        if (isOpenInEditor) {
            vscode.window.showWarningMessage('This file is open in the editor. Markdown Editor will be read-only.');
        }

        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            this._currentContent = content;
            this._pendingContent = undefined;
            this._isDirty = false;

            // ファイル名のみを表示
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

            // Markdown Listをリフレッシュして「editing」表記を更新
            if (this._detailsProvider) {
                this._detailsProvider.refresh();
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to read file: ${error}`);
        }
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
     * プロンプトテンプレートサービスを設定
     */
    public setPromptTemplateService(service: PromptTemplateService): void {
        this.promptTemplateService = service;
    }

    /**
     * Webviewへ送るテンプレート一覧を作成する
     *
     * ボタン押下時にEditor View内のメニューへ表示する。
     * 本文は拡張側で保持し、選択結果はIDで受け取る
     */
    private async _sendPromptTemplates(): Promise<void> {
        if (!this.promptTemplateService) {
            vscode.window.showWarningMessage('Prompt templates are not available');
            return;
        }

        // VS Codeのタブで編集中はEditor Viewが読み取り専用のため、挿入しても保存されない
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

        // 本文はメッセージに含めない（挿入時に拡張側で読み直す）
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
     * Editor View内のメニューで選択されたテンプレートを挿入する
     * @param templateId テンプレートのID（拡張子を除いたファイル名）
     */
    private async _insertPromptTemplateById(templateId?: string): Promise<void> {
        if (!this.promptTemplateService || !templateId) {
            return;
        }

        // メニュー表示後にファイルが変化している場合があるため読み直す
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
     * プロンプトテンプレートをQuickPickで選択してカーソル位置へ挿入する
     *
     * Editor Viewのボタンからはメニュー表示を使うため、
     * こちらはコマンドパレットなどビュー外からの実行で使う
     */
    public async insertPromptTemplate(): Promise<void> {
        if (!this.promptTemplateService) {
            vscode.window.showWarningMessage('Prompt templates are not available');
            return;
        }

        // VS Codeのタブで編集中はEditor Viewが読み取り専用のため、挿入しても保存されない
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
     * プロンプトテンプレートを新規作成してVS Codeのエディタで開く
     *
     * メニューヘッダーの[+]ボタンから呼ばれる
     */
    private async _createPromptTemplate(): Promise<void> {
        if (!this.promptTemplateService) {
            vscode.window.showWarningMessage('Prompt templates are not available');
            return;
        }

        // 既存ファイルとの衝突判定は作成先ごとに行うため、名前入力より先に作成先を決める
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
            // 本文はVS Codeの標準エディタで編集してもらう
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create prompt template: ${error}`);
        }
    }

    /**
     * プロンプトテンプレートの作成先を決める
     *
     * 選択肢が1つしかない場合は確認を挟まずそれを使う
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
     * 現在のファイルが読み取り専用（VS Codeのタブで編集中）かどうか
     */
    private _isCurrentFileReadOnly(): boolean {
        return !!this._currentFilePath && this._isFileOpenInTab(this._currentFilePath);
    }

    /**
     * テンプレートが1件も無い場合の案内を表示する
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
     * 変数置換済みのテンプレートをエディタへ挿入する
     * 挿入自体はinsertPaths()と同じ`insertText`メッセージ経由で行う
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

        // Editorビューをフォーカス
        this._view.show?.(true);
    }

    /**
     * 複数のパスをエディタに挿入
     * @param paths 挿入するパスの配列
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

        // Editorビューをフォーカス
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
     * ファイル保存の共通処理
     * @param content 保存する内容
     * @returns 保存成功時はファイルパス、失敗時はnull
     */
    private async _saveCurrentContent(content: string): Promise<string | null> {
        if (this._currentFilePath) {
            // 優先度1: 既存ファイルへの上書き保存
            try {
                await fs.promises.writeFile(this._currentFilePath, content, 'utf8');
                this._currentContent = content;
                this._pendingContent = undefined;
                this._isDirty = false;
                // 保存後に未保存状態をクリア
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
            // ファイル未開時 - 新規ファイルとして保存
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                vscode.window.showErrorMessage('No workspace folder is open');
                return null;
            }

            let savePath: string;

            // 優先度2: Docs viewで開いているディレクトリ
            const docsCurrentPath = this._detailsProvider?.getCurrentPath();
            // 優先度3: Tasks viewで選択しているディレクトリ
            const tasksRootPath = this._plansProvider?.getRootPath();

            if (docsCurrentPath) {
                savePath = docsCurrentPath;
            } else if (tasksRootPath) {
                savePath = tasksRootPath;
            } else {
                // 優先度4: デフォルトパス
                const config = vscode.workspace.getConfiguration('aiCodingSidebar');
                const defaultRelativePath = config.get<string>('plans.defaultRelativePath', '.claude/plans');
                savePath = path.join(workspaceRoot, defaultRelativePath);
            }

            // ディレクトリが存在しない場合は作成
            await fs.promises.mkdir(savePath, { recursive: true });

            // タイムスタンプ付きファイル名を生成 (YYYY_MMDD_HHMM_SS形式)
            const timestamp = this.templateService.generateTimestamp();
            const fileName = `${timestamp}_PROMPT.md`;
            const filePath = path.join(savePath, fileName);

            try {
                // メタ情報フッターを作成
                const relativeDirPath = workspaceRoot ? path.relative(workspaceRoot, savePath) : savePath;
                const datetime = this.templateService.formatDateTime();
                const footer = `\n\n---\n\nworking dir: ${relativeDirPath}\nprompt file: ${fileName}\ndatetime   : ${datetime}\n`;

                // コンテンツの末尾にフッターを追加
                const contentWithFooter = content + footer;

                await fs.promises.writeFile(filePath, contentWithFooter, 'utf8');

                // 保存したファイルをエディタで開く
                this._currentFilePath = filePath;
                this._currentContent = contentWithFooter;
                this._pendingContent = undefined;
                this._isDirty = false;

                // ファイルパスをWebviewに反映（ファイル名のみ表示）
                const displayPath = path.basename(filePath);
                this._view?.webview.postMessage({
                    type: 'showContent',
                    content: contentWithFooter,
                    filePath: displayPath,
                    isReadOnly: false
                });

                // ツリービューを更新
                this._plansProvider?.refresh();
                this._detailsProvider?.refresh();

                // 保存したディレクトリに移動してファイルを選択
                // Note: refresh()後にツリービューのDOM更新が完了するまで待機するため、100msの遅延を設定
                setTimeout(async () => {
                    // Tasks viewでディレクトリを表示
                    await this._plansProvider?.revealDirectory(savePath);
                    // Tasks viewでファイルを選択
                    // アクティブフォルダが異なる場合は更新が必要
                    const currentActivePath = this._detailsProvider?.getCurrentPath();
                    if (currentActivePath !== savePath) {
                        // アクティブフォルダを変更
                        this._detailsProvider?.setActiveFolder(savePath);
                        // ファイルを再度開く
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
        // 外部リソースのURIを取得
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'editor', 'style.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'editor', 'main.js'));
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'codicons', 'codicon.css'));
        const templatePath = vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'editor', 'index.html');

        // HTMLテンプレートを読み込み（非同期化）
        const htmlTemplate = await fsPromises.readFile(templatePath.fsPath, 'utf8');

        // テンプレート変数を置換
        return htmlTemplate
            .replace(/\{\{cspSource\}\}/g, webview.cspSource)
            .replace(/\{\{styleUri\}\}/g, styleUri.toString())
            .replace(/\{\{scriptUri\}\}/g, scriptUri.toString())
            .replace(/\{\{codiconsUri\}\}/g, codiconsUri.toString());
    }
}
