import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileItem } from './items/FileItem';
import { FileInfo } from '../utils/fileUtils';
import { FileWatcherService } from '../services/FileWatcherService';

// Forward declaration for EditorProvider to avoid circular dependency
export interface IEditorProvider {
    getCurrentFilePath(): string | undefined;
    clearFile(): Promise<void>;
    showFile(filePath: string): Promise<void>;
}

export class PlansProvider implements vscode.TreeDataProvider<FileItem>, vscode.TreeDragAndDropController<FileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | null | void> = new vscode.EventEmitter<FileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private rootPath: string | undefined;
    private projectRootPath: string | undefined;
    private treeView: vscode.TreeView<FileItem> | undefined;
    private selectedItem: FileItem | undefined;
    private itemCache: Map<string, FileItem[]> = new Map();
    private activeFolderPath: string | undefined;
    private refreshDebounceTimer: NodeJS.Timeout | undefined;
    private readonly listenerId = 'ai-coding-sidebar';
    private fileWatcherService: FileWatcherService | undefined;
    private pathNotFound: boolean = false;
    private configuredRelativePath: string | undefined;
    private _isInitialLoad: boolean = true;
    private editorProvider: IEditorProvider | undefined;
    private configChangeDisposable: vscode.Disposable | undefined;

    // Drag & Drop support
    readonly dragMimeTypes = ['application/vnd.code.tree.aiCodingSidebarExplorer'];
    readonly dropMimeTypes = ['application/vnd.code.tree.aiCodingSidebarExplorer', 'text/uri-list'];

    constructor(fileWatcherService?: FileWatcherService) {
        this.fileWatcherService = fileWatcherService;
        // プロジェクトルートパスを取得
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.projectRootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
        // リスナーを事前に登録
        if (this.fileWatcherService) {
            this.fileWatcherService.registerListener(this.listenerId, (uri) => {
                this.debouncedRefresh(uri.fsPath);
            });
        }
        // 設定変更を監視してタイトルと表示を更新
        this.configChangeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('aiCodingSidebar.plans.sortBy') ||
                e.affectsConfiguration('aiCodingSidebar.plans.sortOrder')) {
                this.refresh();
            }
        });
    }

    setEditorProvider(provider: IEditorProvider): void {
        this.editorProvider = provider;
    }

    setTreeView(treeView: vscode.TreeView<FileItem>): void {
        this.treeView = treeView;
    }

    setRootPath(rootPath: string, relativePath?: string): void {
        this.rootPath = rootPath;
        this.activeFolderPath = rootPath;
        this.configuredRelativePath = relativePath;

        // パスの存在確認
        try {
            const stat = fs.statSync(rootPath);
            if (!stat.isDirectory()) {
                this.pathNotFound = true;
            } else {
                this.pathNotFound = false;
            }
        } catch (error) {
            this.pathNotFound = true;
        }

        this.updateTitle();
        this.setupFileWatcher();
        this.refresh();
    }

    getConfiguredRelativePath(): string | undefined {
        return this.configuredRelativePath;
    }

    private setupFileWatcher(): void {
        // リスナーはコンストラクタで登録済み
        // この関数は互換性のために残す
    }

    /**
     * ビューの可視性に応じてファイルウォッチャーを制御
     */
    handleVisibilityChange(visible: boolean): void {
        if (!this.fileWatcherService) {
            return;
        }

        if (visible) {
            this.fileWatcherService.enableListener(this.listenerId);
        } else {
            this.fileWatcherService.disableListener(this.listenerId);
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
    }

    private updateTitle(): void {
        if (this.treeView) {
            // タイトルは「PLANS」固定
            this.treeView.title = 'PLANS';
        }
    }

    getCurrentPath(): string | undefined {
        return this.activeFolderPath || this.rootPath;
    }

    /**
     * Plans Viewで指定されたファイルを選択状態にする
     */
    async revealFile(filePath: string): Promise<void> {
        if (!this.treeView || !this.rootPath) {
            return;
        }

        try {
            // ファイルが存在するか確認
            if (!fs.existsSync(filePath)) {
                return;
            }

            // ファイルが現在のrootPath配下にあるか確認
            if (!filePath.startsWith(this.rootPath)) {
                return;
            }

            const parentDir = path.dirname(filePath);
            // キャッシュから該当するFileItemを探す
            let fileItems = this.itemCache.get(parentDir);

            // キャッシュになければ、getChildrenを呼んで取得
            if (!fileItems) {
                const parentItem = new FileItem(
                    path.basename(parentDir),
                    vscode.TreeItemCollapsibleState.Expanded,
                    parentDir,
                    true,
                    0,
                    new Date(),
                    new Date()
                );
                await this.getChildren(parentItem);
                fileItems = this.itemCache.get(parentDir);
            }

            if (!fileItems) {
                return;
            }

            // ファイルパスが一致するFileItemを探す
            const fileItem = fileItems.find(item => item.filePath === filePath);

            if (!fileItem) {
                return;
            }

            // ファイルを選択状態にする（focus: falseで他のビューへの影響を最小化）
            await this.treeView.reveal(fileItem, { select: true, focus: false, expand: false });
        } catch (error) {
            console.error('Failed to reveal file:', error);
        }
    }

    // Drag & Drop handlers
    handleDrag(source: readonly FileItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
        dataTransfer.set('application/vnd.code.tree.aiCodingSidebarExplorer', new vscode.DataTransferItem(source));
    }

    handleDrop(target: FileItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
        // ターゲットディレクトリの決定
        let targetDir: string;
        if (!target) {
            // ビューのルートにドロップされた場合は、現在開いているフォルダを使用
            targetDir = this.activeFolderPath || this.rootPath!;
        } else if (target.isDirectory) {
            // フォルダにドロップされた場合
            targetDir = target.filePath;
        } else {
            // ファイルにドロップされた場合は、その親ディレクトリにコピー
            targetDir = path.dirname(target.filePath);
        }

        // 外部からのファイルドロップをチェック（text/uri-list）
        const uriListItem = dataTransfer.get('text/uri-list');
        if (uriListItem) {
            uriListItem.asString().then(uriList => {
                const uris = uriList.split('\n').filter(uri => uri.trim() !== '');
                this.copyExternalFiles(uris, targetDir);
            });
            return;
        }

        // ツリービュー内からのドラッグ&ドロップ
        const transferItem = dataTransfer.get('application/vnd.code.tree.aiCodingSidebarExplorer');
        if (!transferItem) {
            return;
        }

        const sourceItems = transferItem.value as readonly FileItem[];
        if (!sourceItems || sourceItems.length === 0) {
            return;
        }

        // ファイルのコピー処理
        this.copyFiles(sourceItems, targetDir);
    }

    /**
     * 外部からドロップされたファイルをコピー
     */
    private async copyExternalFiles(uris: string[], targetDir: string): Promise<void> {
        const copiedFiles: string[] = [];

        for (const uriStr of uris) {
            try {
                const uri = vscode.Uri.parse(uriStr);
                if (uri.scheme !== 'file') {
                    continue;
                }

                const sourcePath = uri.fsPath;
                const fileName = path.basename(sourcePath);
                const targetPath = path.join(targetDir, fileName);

                // 同じパスへのコピーは無視
                if (sourcePath === targetPath) {
                    continue;
                }

                // ファイルが既に存在するかチェック
                let fileExists = false;
                try {
                    await fs.promises.access(targetPath);
                    fileExists = true;
                } catch {
                    fileExists = false;
                }

                if (fileExists) {
                    const answer = await vscode.window.showWarningMessage(
                        `${fileName} already exists. Overwrite?`,
                        'Overwrite',
                        'Skip'
                    );
                    if (answer !== 'Overwrite') {
                        continue;
                    }
                }

                // ファイルをコピー
                await fs.promises.copyFile(sourcePath, targetPath);
                copiedFiles.push(fileName);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to copy file: ${error}`);
            }
        }

        // コピー成功メッセージを表示
        if (copiedFiles.length > 0) {
            const message = copiedFiles.length === 1
                ? `Copied: ${copiedFiles[0]}`
                : `Copied ${copiedFiles.length} files`;
            vscode.window.showInformationMessage(message);
        }

        // ビューを更新
        this.refresh();
    }

    /**
     * ツリービュー内のファイルをコピー
     */
    private async copyFiles(sourceItems: readonly FileItem[], targetDir: string): Promise<void> {
        const copiedFiles: string[] = [];

        for (const item of sourceItems) {
            const sourcePath = item.filePath;
            const fileName = path.basename(sourcePath);
            const targetPath = path.join(targetDir, fileName);

            // 同じパスへのコピーは無視
            if (sourcePath === targetPath) {
                continue;
            }

            try {
                // ファイルが既に存在するかチェック
                let fileExists = false;
                try {
                    await fs.promises.access(targetPath);
                    fileExists = true;
                } catch {
                    fileExists = false;
                }

                if (fileExists) {
                    const answer = await vscode.window.showWarningMessage(
                        `${fileName} already exists. Overwrite?`,
                        'Overwrite',
                        'Skip'
                    );
                    if (answer !== 'Overwrite') {
                        continue;
                    }
                }

                // ファイルをコピー
                await fs.promises.copyFile(sourcePath, targetPath);
                copiedFiles.push(fileName);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to copy ${fileName}: ${error}`);
            }
        }

        // コピー成功メッセージを表示
        if (copiedFiles.length > 0) {
            const message = copiedFiles.length === 1
                ? `Copied: ${copiedFiles[0]}`
                : `Copied ${copiedFiles.length} files`;
            vscode.window.showInformationMessage(message);
        }

        // ビューを更新
        this.refresh();
    }

    getRootPath(): string | undefined {
        return this.rootPath;
    }

    getActiveFolderPath(): string | undefined {
        return this.activeFolderPath;
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
        this._onDidChangeTreeData.fire();
    }

    private debouncedRefresh(targetPath?: string): void {
        if (this.refreshDebounceTimer) {
            clearTimeout(this.refreshDebounceTimer);
        }
        this.refreshDebounceTimer = setTimeout(() => {
            this.refresh(targetPath);
        }, 1500);
    }

    getTreeItem(element: FileItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: FileItem): Promise<FileItem[]> {
        // フラットリスト表示のため、elementは常にundefined
        // 子要素として呼ばれた場合は空を返す（ツリー展開しない）
        if (element) {
            return [];
        }

        // Show loader on initial load
        if (this._isInitialLoad) {
            this._isInitialLoad = false;
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (!this.rootPath) {
            return [];
        }

        // パスが存在しない場合は、作成ボタンを表示
        if (this.pathNotFound) {
            const createButton = new FileItem(
                `Create directory: ${this.configuredRelativePath || this.rootPath}`,
                vscode.TreeItemCollapsibleState.None,
                this.rootPath,
                false,
                0,
                new Date(),
                new Date()
            );
            createButton.contextValue = 'createDirectoryButton';
            createButton.iconPath = new vscode.ThemeIcon('new-folder');
            createButton.command = {
                command: 'aiCodingSidebar.createDefaultPath',
                title: 'Create Directory',
                arguments: [this.rootPath, this.configuredRelativePath]
            };
            createButton.tooltip = `Click to create directory: ${this.configuredRelativePath || this.rootPath}`;
            return [createButton];
        }

        // 現在表示するディレクトリパス
        const currentPath = this.activeFolderPath || this.rootPath;
        const items: FileItem[] = [];

        // パス表示アイテム（最上部に表示）
        // ルートディレクトリの場合のみプロジェクトルートからのパスを表示
        let displayPath: string;
        if (currentPath === this.rootPath && this.projectRootPath) {
            displayPath = path.relative(this.projectRootPath, this.rootPath);
        } else {
            displayPath = path.relative(this.rootPath, currentPath);
        }
        const pathItem = new FileItem(
            displayPath || '.',
            vscode.TreeItemCollapsibleState.None,
            currentPath,
            true,
            0,
            new Date(),
            new Date()
        );
        // ルートディレクトリ以外の場合はarchiveボタンを表示するためにcontextValueを変更
        pathItem.contextValue = currentPath === this.rootPath ? 'pathDisplay' : 'pathDisplayNonRoot';
        pathItem.iconPath = new vscode.ThemeIcon('folder-opened');
        pathItem.tooltip = currentPath;
        items.push(pathItem);

        // 親ディレクトリへ戻るアイテム（ルートより上には戻れない）
        if (currentPath !== this.rootPath) {
            const parentPath = path.dirname(currentPath);
            const parentItem = new FileItem(
                '..',
                vscode.TreeItemCollapsibleState.None,
                parentPath,
                true,
                0,
                new Date(),
                new Date()
            );
            parentItem.contextValue = 'parentDirectory';
            parentItem.iconPath = new vscode.ThemeIcon('arrow-up');
            parentItem.command = {
                command: 'aiCodingSidebar.navigateToDirectory',
                title: 'Go to Parent Directory',
                arguments: [parentPath]
            };
            parentItem.tooltip = 'Go to parent directory';
            items.push(parentItem);
        }

        // キャッシュに存在する場合は返す
        if (this.itemCache.has(currentPath)) {
            const cachedItems = this.itemCache.get(currentPath)!;
            return [...items, ...cachedItems];
        }

        try {
            const files = this.getFilesInDirectory(currentPath);
            const currentFilePath = this.editorProvider?.getCurrentFilePath();
            const fileItems = files.map(file => {
                const isDirectory = file.isDirectory;

                // フラットリスト表示のため、すべてCollapsibleState.None
                const item = new FileItem(
                    file.name,
                    vscode.TreeItemCollapsibleState.None,
                    file.path,
                    isDirectory,
                    file.size,
                    file.modified,
                    file.created
                );

                // ディレクトリの場合、クリックでディレクトリ移動
                if (isDirectory) {
                    // ルートパスのディレクトリの場合、作成日を右側に表示
                    if (currentPath === this.rootPath) {
                        item.description = this.formatCreatedDate(file.created);
                    }
                    item.command = {
                        command: 'aiCodingSidebar.navigateToDirectory',
                        title: 'Navigate to Directory',
                        arguments: [file.path]
                    };
                } else {
                    // 現在Markdown Editorで編集中のファイルに「editing」表記を追加し、ファイル名を太字で表示
                    if (currentFilePath && file.path === currentFilePath) {
                        item.description = 'editing';
                        // TreeItemLabelのhighlightsを使用してファイル名全体を太字にする
                        (item as vscode.TreeItem).label = {
                            label: file.name,
                            highlights: [[0, file.name.length]]
                        };
                    }
                }

                return item;
            });

            // キャッシュに保存
            this.itemCache.set(currentPath, fileItems);
            return [...items, ...fileItems];
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to read directory: ${error}`);
            return items;
        }
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
        void this.revealActiveFolder();
    }

    /**
     * 指定されたディレクトリ内から対象ファイル（TASK.md、PROMPT.md、SPEC.md）を検索し、
     * 最も古いファイルのパスを返す
     */
    private findOldestTargetFile(dirPath: string): string | undefined {
        try {
            const files = this.getFilesInDirectory(dirPath);

            // 対象ファイルのパターン（大文字小文字を区別しない）
            const targetPatterns = ['TASK.MD', 'PROMPT.MD', 'SPEC.MD'];

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
     * 指定されたディレクトリに移動する（フラットリスト表示用）
     */
    async navigateToDirectory(targetPath: string): Promise<void> {
        if (!targetPath || !fs.existsSync(targetPath)) {
            return;
        }

        // rootPath の範囲内かチェック
        if (this.rootPath && !targetPath.startsWith(this.rootPath)) {
            return;
        }

        // ディレクトリ移動時にEditorのファイル選択をクリア（自動保存含む）
        await this.editorProvider?.clearFile();

        this.activeFolderPath = targetPath;
        this.updateTitle();
        this.refresh();

        // 対象ファイル（TASK.md、PROMPT.md、SPEC.md）を検索して自動選択
        if (this.editorProvider) {
            const oldestFile = this.findOldestTargetFile(targetPath);
            if (oldestFile) {
                await this.editorProvider.showFile(oldestFile);
            }
        }
    }

    async getParent(element: FileItem): Promise<FileItem | undefined> {
        if (!element || !element.isDirectory || !this.rootPath) {
            return undefined;
        }

        // rootItem自体の親はundefined
        if (element.filePath === this.rootPath) {
            return undefined;
        }

        const parentPath = path.dirname(element.filePath);

        if (!parentPath || parentPath === element.filePath) {
            return undefined;
        }

        // 親がrootPathの場合、rootPath自体を表すFileItemを返す
        if (parentPath === this.rootPath) {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            let displayName: string;

            if (workspaceRoot) {
                const relativePath = path.relative(workspaceRoot, this.rootPath);
                displayName = relativePath === '' ? path.basename(this.rootPath) : relativePath;
            } else {
                displayName = path.basename(this.rootPath);
            }

            return new FileItem(
                displayName,
                vscode.TreeItemCollapsibleState.Expanded,
                this.rootPath,
                true,
                0,
                new Date(),
                new Date()
            );
        }

        if (!parentPath.startsWith(this.rootPath)) {
            return undefined;
        }

        try {
            const stat = fs.statSync(parentPath);
            return new FileItem(
                path.basename(parentPath),
                vscode.TreeItemCollapsibleState.Collapsed,
                parentPath,
                true,
                0,
                stat.mtime,
                stat.birthtime
            );
        } catch (error) {
            console.error('Failed to get parent folder:', error);
            return undefined;
        }
    }

    private async revealActiveFolder(): Promise<void> {
        if (!this.treeView || !this.activeFolderPath) {
            return;
        }

        try {
            const stat = fs.statSync(this.activeFolderPath);
            const item = new FileItem(
                path.basename(this.activeFolderPath),
                this.activeFolderPath === this.rootPath
                    ? vscode.TreeItemCollapsibleState.Expanded
                    : vscode.TreeItemCollapsibleState.Collapsed,
                this.activeFolderPath,
                stat.isDirectory(),
                stat.isDirectory() ? 0 : stat.size,
                stat.mtime,
                stat.birthtime
            );

            await this.treeView.reveal(item, { select: true, focus: false, expand: true });
        } catch (error) {
            console.error('Failed to show folder selection:', error);
        }
    }

    resetActiveFolder(): void {
        if (!this.rootPath) {
            this.setActiveFolder(undefined, true);
            return;
        }

        this.setActiveFolder(this.rootPath, true);
    }

    async revealDirectory(directoryPath: string): Promise<void> {
        if (!this.treeView) {
            return;
        }

        try {
            const stat = fs.statSync(directoryPath);
            if (!stat.isDirectory()) {
                return;
            }

            const item = new FileItem(
                path.basename(directoryPath),
                vscode.TreeItemCollapsibleState.Collapsed,
                directoryPath,
                true,
                0,
                stat.mtime,
                stat.birthtime
            );

            await this.treeView.reveal(item, { select: true, focus: false, expand: false });
        } catch (error) {
            console.error('Failed to reveal directory:', error);
        }
    }

    private formatCreatedDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private getFilesInDirectory(dirPath: string): FileInfo[] {
        const directories: FileInfo[] = [];
        const files: FileInfo[] = [];

        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                const stat = fs.statSync(fullPath);

                if (entry.isDirectory()) {
                    directories.push({
                        name: entry.name,
                        path: fullPath,
                        isDirectory: true,
                        size: 0,
                        modified: stat.mtime,
                        created: stat.birthtime
                    });
                } else {
                    files.push({
                        name: entry.name,
                        path: fullPath,
                        isDirectory: false,
                        size: stat.size,
                        modified: stat.mtime,
                        created: stat.birthtime
                    });
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
