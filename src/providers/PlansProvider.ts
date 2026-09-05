import * as vscode from 'vscode';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { FileItem, getFileIconName } from './items/FileItem';
import { FileInfo } from '../utils/fileUtils';
import { FileWatcherService } from '../services/FileWatcherService';

// Forward declaration for EditorProvider to avoid circular dependency
export interface IEditorProvider {
    getCurrentFilePath(): string | undefined;
    clearFile(): Promise<void>;
    showFile(filePath: string): Promise<void>;
}

/**
 * Webviewへ送信する1行分のデータ
 */
export interface PlansViewItem {
    kind: 'path' | 'parent' | 'directory' | 'file' | 'createDirectory';
    label: string;
    description?: string;
    filePath: string;
    icon: string;
    tooltip?: string;
    isEditing?: boolean;
    contextValue: string;
}

export class PlansProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'aiCodingSidebarExplorer';

    private _view: vscode.WebviewView | undefined;
    private _extensionUri: vscode.Uri | undefined;

    private rootPath: string | undefined;
    private projectRootPath: string | undefined;
    private selectedItem: FileItem | undefined;
    private itemCache: Map<string, PlansViewItem[]> = new Map();
    private activeFolderPath: string | undefined;
    private refreshDebounceTimer: NodeJS.Timeout | undefined;
    private readonly listenerId = 'ai-coding-sidebar';
    private fileWatcherService: FileWatcherService | undefined;
    private pathNotFound: boolean = false;
    private configuredRelativePath: string | undefined;
    private editorProvider: IEditorProvider | undefined;
    private configChangeDisposable: vscode.Disposable | undefined;
    private _disposables: vscode.Disposable[] = [];
    private _pollingTimer: NodeJS.Timeout | undefined;
    private _lastDirFileCount: number = -1;
    private _lastDirModTime: number = 0;

    constructor(fileWatcherService?: FileWatcherService, extensionUri?: vscode.Uri) {
        this.fileWatcherService = fileWatcherService;
        this._extensionUri = extensionUri;
        // プロジェクトルートパスを取得
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.projectRootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
        // リスナーを事前に登録し、即座に有効化
        if (this.fileWatcherService) {
            this.fileWatcherService.registerListener(this.listenerId, () => {
                // FileWatcherからの通知時はキャッシュを全クリアして確実に反映
                this.debouncedRefresh();
            });
            // リスナーを常に有効にする（ビューの可視性に関わらず）
            this.fileWatcherService.enableListener(this.listenerId);
        }
        // 設定変更を監視して表示を更新
        this.configChangeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('aiCodingSidebar.plans.sortBy') ||
                e.affectsConfiguration('aiCodingSidebar.plans.sortOrder')) {
                this.refresh();
            }
        });
    }

    // ---------------------------------------------------------------------
    // WebviewViewProvider
    // ---------------------------------------------------------------------

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: this._extensionUri ? [this._extensionUri] : undefined
        };

        webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);

        this._disposables.push(
            webviewView.webview.onDidReceiveMessage(async (message) => {
                await this._handleMessage(message);
            })
        );

        this._disposables.push(
            webviewView.onDidChangeVisibility(() => {
                this.handleVisibilityChange(webviewView.visible);
            })
        );

        this.handleVisibilityChange(webviewView.visible);
    }

    /**
     * Webviewからのメッセージを処理する
     */
    private async _handleMessage(message: any): Promise<void> {
        switch (message?.type) {
            case 'ready':
                await this._render();
                break;
            case 'quickStart':
                await vscode.commands.executeCommand('aiCodingSidebar.quickStart');
                break;
            case 'itemClick':
                await this._handleItemClick(message.kind, message.filePath);
                break;
            case 'command':
                await this._executeItemCommand(
                    message.commandId,
                    message.filePath,
                    message.isDirectory,
                    message.label,
                    message.contextValue
                );
                break;
            case 'drop':
                await this._handleDrop(message.targetPath, message.sources, message.uriList);
                break;
            case 'dropFiles':
                await this._handleDroppedFileContents(
                    message.targetPath,
                    message.files,
                    message.skippedDirectories,
                    message.skippedFiles
                );
                break;
            case 'dropUnsupported':
                vscode.window.showWarningMessage('Could not read the dropped item.');
                break;
        }
    }

    /**
     * 行がクリックされたときの処理
     */
    private async _handleItemClick(kind: string, filePath: string): Promise<void> {
        switch (kind) {
            case 'createDirectory':
                await vscode.commands.executeCommand(
                    'aiCodingSidebar.createDefaultPath',
                    this.rootPath,
                    this.configuredRelativePath
                );
                break;
            case 'directory':
            case 'parent':
                await this.navigateToDirectory(filePath);
                break;
            case 'file':
                this.selectedItem = await this._createFileItem(filePath, false);
                await this._openFile(filePath);
                break;
            case 'path':
                this.selectedItem = await this._createFileItem(filePath, true);
                break;
        }
    }

    /**
     * ファイルを適切なビューで開く
     * タイムスタンプ形式のPROMPT/TASK/SPEC/QUICK_STARTはMarkdown Editorで開く
     */
    private async _openFile(filePath: string): Promise<void> {
        const fileName = path.basename(filePath);
        const timestampPattern = /^\d{4}_\d{4}_\d{4}_\d{2}_(PROMPT|TASK|SPEC|QUICK_START)\.md$/;

        if (timestampPattern.test(fileName) && this.editorProvider) {
            await this.editorProvider.showFile(filePath);
            return;
        }

        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
    }

    /**
     * コンテキストメニューから選択されたコマンドを実行する
     * 既存コマンドはFileItemを引数に取るため、パスから復元して渡す
     */
    private async _executeItemCommand(
        commandId: string,
        filePath: string,
        isDirectory: boolean,
        label: string,
        contextValue?: string
    ): Promise<void> {
        if (!commandId || !filePath) {
            return;
        }

        try {
            const item = await this._createFileItem(filePath, isDirectory, label, contextValue);
            await vscode.commands.executeCommand(commandId, item);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to execute command: ${error}`);
        }
    }

    /**
     * パスからFileItemを復元する（コマンド呼び出し・選択状態の保持に使用）
     * contextValueは archiveDirectory が 'pathDisplayNonRoot' を判定するため引き継ぐ
     */
    private async _createFileItem(
        filePath: string,
        isDirectory: boolean,
        label?: string,
        contextValue?: string
    ): Promise<FileItem> {
        let size = 0;
        let modified = new Date();
        let created = new Date();

        try {
            const stat = await fsPromises.stat(filePath);
            isDirectory = stat.isDirectory();
            size = isDirectory ? 0 : stat.size;
            modified = stat.mtime;
            created = stat.birthtime;
        } catch {
            // 取得できない場合は既定値のまま扱う
        }

        const item = new FileItem(
            label ?? path.basename(filePath),
            vscode.TreeItemCollapsibleState.None,
            filePath,
            isDirectory,
            size,
            modified,
            created
        );

        if (contextValue) {
            item.contextValue = contextValue;
        }

        return item;
    }

    /**
     * Webviewへ最新の一覧を送信する
     */
    private async _render(): Promise<void> {
        if (!this._view) {
            return;
        }

        try {
            const items = await this.buildItems();
            await this._view.webview.postMessage({
                type: 'update',
                items,
                selectedPath: this.selectedItem?.filePath
            });
        } catch (error) {
            await this._view.webview.postMessage({
                type: 'update',
                items: [],
                message: `Failed to read directory: ${error}`
            });
        }
    }

    private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        if (!this._extensionUri) {
            return '<!DOCTYPE html><html><body></body></html>';
        }

        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'plans', 'style.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'plans', 'main.js'));
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'codicons', 'codicon.css'));
        const templatePath = vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview', 'plans', 'index.html');

        const htmlTemplate = await fsPromises.readFile(templatePath.fsPath, 'utf8');

        return htmlTemplate
            .replace(/\{\{cspSource\}\}/g, webview.cspSource)
            .replace(/\{\{styleUri\}\}/g, styleUri.toString())
            .replace(/\{\{scriptUri\}\}/g, scriptUri.toString())
            .replace(/\{\{codiconsUri\}\}/g, codiconsUri.toString());
    }

    // ---------------------------------------------------------------------
    // 一覧の構築
    // ---------------------------------------------------------------------

    /**
     * 現在のディレクトリに対応する表示アイテム一覧を構築する
     */
    async buildItems(): Promise<PlansViewItem[]> {
        if (!this.rootPath) {
            return [];
        }

        // パスが存在しない場合は、作成ボタンを表示
        if (this.pathNotFound) {
            return [{
                kind: 'createDirectory',
                label: `Create directory: ${this.configuredRelativePath || this.rootPath}`,
                filePath: this.rootPath,
                icon: 'new-folder',
                tooltip: `Click to create directory: ${this.configuredRelativePath || this.rootPath}`,
                contextValue: 'createDirectoryButton'
            }];
        }

        // 現在表示するディレクトリパス
        let currentPath = this.activeFolderPath || this.rootPath;

        // 表示中のディレクトリが外部要因（AIエージェントによるリネーム等）で
        // 削除・移動されている場合、リネーム後のディレクトリを追跡して表示する
        // （リネーム先が特定できない場合は、存在する祖先ディレクトリまで遡って表示する）
        if (currentPath !== this.rootPath && !(await this.pathExists(currentPath))) {
            this.itemCache.delete(currentPath);
            const renamedPath = await this.resolveRenamedDirectory(currentPath);
            const fallbackPath = renamedPath ?? await this.resolveExistingAncestor(currentPath);
            this.activeFolderPath = fallbackPath === this.rootPath ? undefined : fallbackPath;
            currentPath = fallbackPath;
        }

        const items: PlansViewItem[] = [];

        // パス表示アイテム（最上部に表示）
        // ルートディレクトリの場合のみプロジェクトルートからのパスを表示
        let displayPath: string;
        if (currentPath === this.rootPath && this.projectRootPath) {
            displayPath = path.relative(this.projectRootPath, this.rootPath);
        } else {
            displayPath = path.relative(this.rootPath, currentPath);
        }
        items.push({
            kind: 'path',
            label: displayPath || '.',
            filePath: currentPath,
            icon: 'folder-opened',
            tooltip: currentPath,
            // ルートディレクトリ以外の場合はarchive等を出すためcontextValueを変更
            contextValue: currentPath === this.rootPath ? 'pathDisplay' : 'pathDisplayNonRoot'
        });

        // 親ディレクトリへ戻るアイテム（ルートより上には戻れない）
        if (currentPath !== this.rootPath) {
            items.push({
                kind: 'parent',
                label: '..',
                filePath: path.dirname(currentPath),
                icon: 'arrow-up',
                tooltip: 'Go to parent directory',
                contextValue: 'parentDirectory'
            });
        }

        // キャッシュに存在する場合は返す
        const cachedItems = this.itemCache.get(currentPath);
        if (cachedItems) {
            return [...items, ...cachedItems];
        }

        const files = await this.getFilesInDirectory(currentPath);
        const currentFilePath = this.editorProvider?.getCurrentFilePath();

        const fileItems: PlansViewItem[] = files.map(file => {
            if (file.isDirectory) {
                // ルートパスのディレクトリの場合、日付/時間をファイル名の前に表示
                const label = currentPath === this.rootPath
                    ? `${this.formatDateTimePrefix(file.created)} ${file.name}`
                    : file.name;

                return {
                    kind: 'directory',
                    label,
                    filePath: file.path,
                    icon: 'folder',
                    tooltip: file.path,
                    contextValue: 'directory'
                } as PlansViewItem;
            }

            const isEditing = !!currentFilePath && file.path === currentFilePath;

            return {
                kind: 'file',
                label: file.name,
                description: isEditing ? 'editing' : undefined,
                filePath: file.path,
                icon: getFileIconName(file.name),
                tooltip: file.path,
                isEditing,
                contextValue: 'file'
            } as PlansViewItem;
        });

        // キャッシュに保存
        this.itemCache.set(currentPath, fileItems);
        return [...items, ...fileItems];
    }

    // ---------------------------------------------------------------------
    // 公開API（コマンド・他プロバイダーから利用）
    // ---------------------------------------------------------------------

    setEditorProvider(provider: IEditorProvider): void {
        this.editorProvider = provider;
    }

    async setRootPath(rootPath: string, relativePath?: string): Promise<void> {
        this.rootPath = rootPath;
        this.activeFolderPath = rootPath;
        this.configuredRelativePath = relativePath;

        // パスの存在確認
        try {
            const stat = await fsPromises.stat(rootPath);
            this.pathNotFound = !stat.isDirectory();
        } catch (error) {
            this.pathNotFound = true;
        }

        this.refresh();
    }

    getConfiguredRelativePath(): string | undefined {
        return this.configuredRelativePath;
    }

    getRootPath(): string | undefined {
        return this.rootPath;
    }

    getActiveFolderPath(): string | undefined {
        return this.activeFolderPath;
    }

    getCurrentPath(): string | undefined {
        return this.activeFolderPath || this.rootPath;
    }

    setSelectedItem(item: FileItem | undefined): void {
        this.selectedItem = item;
    }

    getSelectedItem(): FileItem | undefined {
        return this.selectedItem;
    }

    refresh(targetPath?: string): void {
        if (targetPath) {
            // 特定のパスとその親ディレクトリのキャッシュのみクリア
            this.itemCache.delete(targetPath);
            const parentPath = path.dirname(targetPath);
            if (parentPath && parentPath !== targetPath) {
                this.itemCache.delete(parentPath);
            }
        } else {
            // 全体更新の場合のみ全キャッシュをクリア
            this.itemCache.clear();
        }
        void this._render();
    }

    setActiveFolder(folderPath: string | undefined, force: boolean = false): void {
        if (folderPath && this.rootPath && !folderPath.startsWith(this.rootPath)) {
            return;
        }

        if (!force && this.activeFolderPath === folderPath) {
            return;
        }

        this.activeFolderPath = folderPath;
        this.refresh();
    }

    resetActiveFolder(): void {
        if (!this.rootPath) {
            this.setActiveFolder(undefined, true);
            return;
        }

        this.setActiveFolder(this.rootPath, true);
    }

    /**
     * 指定されたディレクトリに移動する（フラットリスト表示用）
     */
    async navigateToDirectory(targetPath: string): Promise<void> {
        if (!targetPath) {
            return;
        }

        try {
            await fsPromises.access(targetPath);
        } catch {
            return;
        }

        // rootPath の範囲内かチェック
        if (this.rootPath && !targetPath.startsWith(this.rootPath)) {
            return;
        }

        // ディレクトリ移動時にEditorのファイル選択をクリア（自動保存含む）
        await this.editorProvider?.clearFile();

        this.activeFolderPath = targetPath;
        this.selectedItem = undefined;
        this.refresh();
        // 移動先ディレクトリのスナップショットをリセット（次のポーリングで正しく比較できるようにする）
        this._lastDirFileCount = -1;
        this._lastDirModTime = 0;

        // 対象ファイル（TASK.md、PROMPT.md、SPEC.md、QUICK_START.md）を検索して自動選択
        // rootディレクトリはタスク一覧の役割のため、自動選択・自動表示は行わない
        if (this.editorProvider && !this._isRootDirectory(targetPath)) {
            const oldestFile = await this.findOldestTargetFile(targetPath);
            if (oldestFile) {
                await this.editorProvider.showFile(oldestFile);
                await this.revealFile(oldestFile);
            }
        }
    }

    /**
     * 指定されたパスがrootディレクトリかどうかを判定する
     */
    private _isRootDirectory(targetPath: string): boolean {
        if (!this.rootPath) {
            return false;
        }

        return path.resolve(targetPath) === path.resolve(this.rootPath);
    }

    /**
     * Plans Viewで指定されたファイルを選択状態にする
     */
    async revealFile(filePath: string): Promise<void> {
        if (!this.rootPath) {
            return;
        }

        try {
            await fsPromises.access(filePath);
        } catch {
            return;
        }

        // ファイルが現在のrootPath配下にあるか確認
        if (!filePath.startsWith(this.rootPath)) {
            return;
        }

        this.selectedItem = await this._createFileItem(filePath, false);
        await this._view?.webview.postMessage({ type: 'select', filePath });
    }

    /**
     * Plans Viewで指定されたディレクトリを選択状態にする
     */
    async revealDirectory(directoryPath: string): Promise<void> {
        try {
            const stat = await fsPromises.stat(directoryPath);
            if (!stat.isDirectory()) {
                return;
            }
        } catch (error) {
            console.error('Failed to reveal directory:', error);
            return;
        }

        this.selectedItem = await this._createFileItem(directoryPath, true);
        await this._view?.webview.postMessage({ type: 'select', filePath: directoryPath });
    }

    /**
     * ビューの可視性に応じてポーリングを制御
     */
    handleVisibilityChange(visible: boolean): void {
        if (visible) {
            // ビュー復帰時にリフレッシュして最新の状態を反映
            this.refresh();
            // ポーリングを開始してFileWatcherが見逃したイベントを補完
            this._startPolling();
        } else {
            // ビュー非表示時はポーリングを停止してリソースを解放
            // FileWatcherのリスナーは有効のまま維持する
            this._stopPolling();
        }
    }

    dispose(): void {
        if (this.fileWatcherService) {
            this.fileWatcherService.unregisterListener(this.listenerId);
        }
        if (this.refreshDebounceTimer) {
            clearTimeout(this.refreshDebounceTimer);
            this.refreshDebounceTimer = undefined;
        }
        if (this.configChangeDisposable) {
            this.configChangeDisposable.dispose();
            this.configChangeDisposable = undefined;
        }
        for (const disposable of this._disposables) {
            disposable.dispose();
        }
        this._disposables = [];
        this._stopPolling();
    }

    // ---------------------------------------------------------------------
    // Drag & Drop
    // ---------------------------------------------------------------------

    /**
     * Webviewからのドロップを処理する
     * targetPathが未指定の場合（空白領域やファイル行へのドロップ）は現在表示中のディレクトリを対象にする
     */
    private async _handleDrop(targetPath?: string, sources?: string[], uriList?: string): Promise<void> {
        const targetDir = await this._resolveDropTargetDir(targetPath);
        if (!targetDir) {
            return;
        }

        if (sources && sources.length > 0) {
            await this.copyFiles(sources, targetDir);
            return;
        }

        if (uriList) {
            // text/uri-listは改行区切りで、'#'始まりの行はコメント
            const uris = uriList
                .split(/\r?\n/)
                .map(uri => uri.trim())
                .filter(uri => uri !== '' && !uri.startsWith('#'));
            await this.copyExternalFiles(uris, targetDir);
        }
    }

    /**
     * Webviewから送られたファイルの内容を書き出す
     * 外部アプリからのドロップではWebviewが絶対パスを取得できないため、内容を受け取って保存する
     */
    private async _handleDroppedFileContents(
        targetPath: string | undefined,
        files: Array<{ name?: string; data?: string }> | undefined,
        skippedDirectories?: string[],
        skippedFiles?: string[]
    ): Promise<void> {
        if (skippedDirectories && skippedDirectories.length > 0) {
            vscode.window.showWarningMessage(
                `Dropping a folder is not supported: ${skippedDirectories.join(', ')}`
            );
        }

        if (skippedFiles && skippedFiles.length > 0) {
            vscode.window.showWarningMessage(
                `Could not read dropped file: ${skippedFiles.join(', ')}`
            );
        }

        if (!files || files.length === 0) {
            return;
        }

        const targetDir = await this._resolveDropTargetDir(targetPath);
        if (!targetDir) {
            return;
        }

        const copiedFiles: string[] = [];

        for (const file of files) {
            // Webview由来の名前をそのまま結合しない（パス区切りを含む場合に備える）
            const fileName = path.basename(file.name || '');
            if (!fileName || fileName === '.' || fileName === '..') {
                continue;
            }

            const destination = path.join(targetDir, fileName);

            try {
                if (!(await this.confirmOverwrite(destination, fileName))) {
                    continue;
                }

                await fs.promises.writeFile(destination, Buffer.from(file.data || '', 'base64'));
                copiedFiles.push(fileName);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to copy ${fileName}: ${error}`);
            }
        }

        this.showCopyResult(copiedFiles);
    }

    /**
     * ドロップ先のディレクトリを決定する
     * ドロップ先がファイルの場合はその親ディレクトリを対象にする
     */
    private async _resolveDropTargetDir(targetPath?: string): Promise<string | undefined> {
        const dropPath = targetPath || this.getCurrentPath();
        if (!dropPath) {
            return undefined;
        }

        try {
            const stat = await fsPromises.stat(dropPath);
            return stat.isDirectory() ? dropPath : path.dirname(dropPath);
        } catch {
            return undefined;
        }
    }

    /**
     * 外部からドロップされたファイルをコピー
     */
    private async copyExternalFiles(uris: string[], targetDir: string): Promise<void> {
        const sourcePaths: string[] = [];

        for (const uriStr of uris) {
            try {
                const uri = vscode.Uri.parse(uriStr.trim());
                if (uri.scheme !== 'file') {
                    continue;
                }
                sourcePaths.push(uri.fsPath);
            } catch {
                // パースできないURIは無視
            }
        }

        await this.copyFiles(sourcePaths, targetDir);
    }

    /**
     * 指定されたパスのファイルを対象ディレクトリへコピー
     */
    private async copyFiles(sourcePaths: readonly string[], targetDir: string): Promise<void> {
        const copiedFiles: string[] = [];

        for (const sourcePath of sourcePaths) {
            const fileName = path.basename(sourcePath);
            const targetPath = path.join(targetDir, fileName);

            // 同じパスへのコピーは無視
            if (sourcePath === targetPath) {
                continue;
            }

            try {
                if (!(await this.confirmOverwrite(targetPath, fileName))) {
                    continue;
                }

                await fs.promises.copyFile(sourcePath, targetPath);
                copiedFiles.push(fileName);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to copy ${fileName}: ${error}`);
            }
        }

        this.showCopyResult(copiedFiles);
    }

    /**
     * 上書き確認を行い、書き込んでよいかを返す
     */
    private async confirmOverwrite(targetPath: string, fileName: string): Promise<boolean> {
        let fileExists = false;
        try {
            await fs.promises.access(targetPath);
            fileExists = true;
        } catch {
            fileExists = false;
        }

        if (!fileExists) {
            return true;
        }

        const answer = await vscode.window.showWarningMessage(
            `${fileName} already exists. Overwrite?`,
            'Overwrite',
            'Skip'
        );
        return answer === 'Overwrite';
    }

    /**
     * コピー結果を表示してビューを更新する
     */
    private showCopyResult(copiedFiles: readonly string[]): void {
        if (copiedFiles.length > 0) {
            const message = copiedFiles.length === 1
                ? `Copied: ${copiedFiles[0]}`
                : `Copied ${copiedFiles.length} files`;
            vscode.window.showInformationMessage(message);
        }

        // ビューを更新
        this.refresh();
    }

    // ---------------------------------------------------------------------
    // 内部ユーティリティ
    // ---------------------------------------------------------------------

    private debouncedRefresh(targetPath?: string): void {
        if (this.refreshDebounceTimer) {
            clearTimeout(this.refreshDebounceTimer);
        }
        // Debounce time set to 500ms to balance responsiveness and performance
        this.refreshDebounceTimer = setTimeout(() => {
            this.refresh(targetPath);
        }, 500);
    }

    /**
     * ポーリングを開始する（Plans View表示中のみ動作）
     * FileWatcherが見逃したイベントを補完するため、3秒ごとにディレクトリを確認する
     */
    private _startPolling(): void {
        this._stopPolling();
        // ポーリング開始時にスナップショットをリセット
        this._lastDirFileCount = -1;
        this._lastDirModTime = 0;
        this._pollingTimer = setInterval(() => {
            void this._pollDirectory();
        }, 3000);
    }

    /**
     * ポーリングを停止する
     */
    private _stopPolling(): void {
        if (this._pollingTimer) {
            clearInterval(this._pollingTimer);
            this._pollingTimer = undefined;
        }
    }

    /**
     * ディレクトリの変化を軽量チェックし、変化があればリフレッシュする
     */
    private async _pollDirectory(): Promise<void> {
        const currentPath = this.activeFolderPath || this.rootPath;
        if (!currentPath) {
            return;
        }

        try {
            const [stat, entries] = await Promise.all([
                fsPromises.stat(currentPath),
                fsPromises.readdir(currentPath)
            ]);
            const fileCount = entries.length;
            const modTime = stat.mtime.getTime();

            if (this._lastDirFileCount !== fileCount || this._lastDirModTime !== modTime) {
                this._lastDirFileCount = fileCount;
                this._lastDirModTime = modTime;
                this.refresh();
            }
        } catch {
            // ディレクトリが削除された場合などはスキップ
        }
    }

    /**
     * パスが存在するかどうかを確認
     */
    private async pathExists(targetPath: string): Promise<boolean> {
        try {
            await fsPromises.access(targetPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 指定されたパスが存在しない場合、存在する祖先ディレクトリ（rootPathを下限とする）を返す
     */
    private async resolveExistingAncestor(targetPath: string): Promise<string> {
        if (!this.rootPath) {
            return targetPath;
        }

        let candidate = targetPath;
        while (candidate !== this.rootPath && candidate.length >= this.rootPath.length) {
            const parent = path.dirname(candidate);
            if (parent === candidate) {
                break;
            }
            candidate = parent;
            if (candidate === this.rootPath || await this.pathExists(candidate)) {
                return candidate;
            }
        }

        return this.rootPath;
    }

    /**
     * 消失したディレクトリ（oldPath）が、同じ親ディレクトリ配下でリネームされたものかどうかを推定する。
     * このプロジェクトのファイル命名規則（タイムスタンプをディレクトリ名・ファイル名の先頭に付与する）を利用し、
     * 兄弟ディレクトリの中に「oldPathのディレクトリ名で始まるファイル」を含むものがあれば、
     * リネーム後のディレクトリとみなして返す
     */
    private async resolveRenamedDirectory(oldPath: string): Promise<string | undefined> {
        const parentPath = path.dirname(oldPath);
        const oldName = path.basename(oldPath);

        let siblingNames: string[];
        try {
            siblingNames = await fsPromises.readdir(parentPath);
        } catch {
            return undefined;
        }

        for (const siblingName of siblingNames) {
            const siblingPath = path.join(parentPath, siblingName);
            try {
                const stat = await fsPromises.stat(siblingPath);
                if (!stat.isDirectory()) {
                    continue;
                }
                const childNames = await fsPromises.readdir(siblingPath);
                if (childNames.some(name => name.startsWith(oldName))) {
                    return siblingPath;
                }
            } catch {
                // 読み取れないディレクトリは無視して次を確認
            }
        }

        return undefined;
    }

    /**
     * 指定されたディレクトリ内から対象ファイル（TASK.md、PROMPT.md、SPEC.md、QUICK_START.md）を検索し、
     * 最も古いファイルのパスを返す
     */
    private async findOldestTargetFile(dirPath: string): Promise<string | undefined> {
        try {
            const files = await this.getFilesInDirectory(dirPath);

            // 対象ファイルのパターン（大文字小文字を区別しない）
            const targetPatterns = ['TASK.MD', 'PROMPT.MD', 'SPEC.MD', 'QUICK_START.MD'];

            // 対象ファイルをフィルタリング
            const targetFiles = files.filter(file => {
                if (file.isDirectory) {
                    return false;
                }
                const upperName = file.name.toUpperCase();
                return targetPatterns.some(pattern => upperName.endsWith(pattern));
            });

            if (targetFiles.length === 0) {
                return undefined;
            }

            // 作成日時でソート（昇順）して最も古いファイルを取得
            targetFiles.sort((a, b) => a.created.getTime() - b.created.getTime());

            return targetFiles[0].path;
        } catch (error) {
            console.error('Failed to find oldest target file:', error);
            return undefined;
        }
    }

    /**
     * Format date/time prefix for root directory display
     * Today: [HH:MM], otherwise: [MM/DD]
     */
    private formatDateTimePrefix(date: Date): string {
        const now = new Date();
        const isToday = date.getFullYear() === now.getFullYear()
            && date.getMonth() === now.getMonth()
            && date.getDate() === now.getDate();

        if (isToday) {
            const hour = String(date.getHours()).padStart(2, '0');
            const minute = String(date.getMinutes()).padStart(2, '0');
            return `[${hour}:${minute}]`;
        } else {
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `[${month}/${day}]`;
        }
    }

    private async getFilesInDirectory(dirPath: string): Promise<FileInfo[]> {
        const directories: FileInfo[] = [];
        const files: FileInfo[] = [];

        try {
            const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });

            // stat呼び出しを並列化
            const fileInfoResults = await Promise.all(
                entries.map(async (entry): Promise<FileInfo | null> => {
                    const fullPath = path.join(dirPath, entry.name);
                    try {
                        const stat = await fsPromises.stat(fullPath);

                        if (entry.isDirectory()) {
                            return {
                                name: entry.name,
                                path: fullPath,
                                isDirectory: true,
                                size: 0,
                                modified: stat.mtime,
                                created: stat.birthtime
                            };
                        } else {
                            return {
                                name: entry.name,
                                path: fullPath,
                                isDirectory: false,
                                size: stat.size,
                                modified: stat.mtime,
                                created: stat.birthtime
                            };
                        }
                    } catch {
                        // stat失敗時はスキップ
                        return null;
                    }
                })
            );

            // null（stat失敗）を除外し、ディレクトリとファイルに分類
            for (const info of fileInfoResults) {
                if (info === null) {
                    continue;
                }
                if (info.isDirectory) {
                    directories.push(info);
                } else {
                    files.push(info);
                }
            }

            // ソート設定を取得
            const config = vscode.workspace.getConfiguration('aiCodingSidebar.plans');
            const sortBy = config.get<string>('sortBy', 'created');
            const sortOrder = config.get<string>('sortOrder', 'ascending');

            // ソート処理を関数化
            const sortItems = (items: FileInfo[]) => {
                items.sort((a, b) => {
                    let comparison = 0;

                    switch (sortBy) {
                        case 'name':
                            comparison = a.name.localeCompare(b.name);
                            break;
                        case 'created':
                            comparison = a.created.getTime() - b.created.getTime();
                            break;
                        case 'modified':
                            comparison = a.modified.getTime() - b.modified.getTime();
                            break;
                        default:
                            comparison = a.created.getTime() - b.created.getTime();
                    }

                    return sortOrder === 'descending' ? -comparison : comparison;
                });
            };

            // ディレクトリとファイルの両方をソート
            sortItems(directories);
            sortItems(files);

            // ディレクトリを先に、その後ファイルを返す
            return [...directories, ...files];

        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err && err.code === 'ENOENT') {
                return [];
            }

            const message = err && err.message ? err.message : String(error);
            throw new Error(`Failed to read directory: ${message}`);
        }
    }
}
