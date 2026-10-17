import * as vscode from 'vscode';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { FileItem, getFileIconName } from './items/FileItem';
import { FileInfo } from '../utils/fileUtils';
import { FileWatcherService } from '../services/FileWatcherService';
import { TemplateService, SESSION_METADATA_FILE_NAME, SessionMetadataEntry } from '../services/TemplateService';

// Forward declaration for EditorProvider to avoid circular dependency
export interface IEditorProvider {
    getCurrentFilePath(): string | undefined;
    clearFile(): Promise<void>;
    showFile(filePath: string): Promise<void>;
}

/**
 * Data for one row sent to the Webview
 */
export interface PlansViewItem {
    kind: 'path' | 'parent' | 'directory' | 'file' | 'createDirectory' | 'searchHeader';
    label: string;
    description?: string;
    filePath: string;
    icon: string;
    tooltip?: string;
    isEditing?: boolean;
    contextValue: string;
    /** Excerpt of the line in the body that matched the search */
    matchPreview?: string;
}

/** Maximum number of search results */
export const MAX_SEARCH_RESULTS = 200;

/** Maximum size of a file whose body is searched (1MB) */
export const MAX_SEARCH_FILE_SIZE = 1024 * 1024;

/** Maximum number of characters in a body excerpt */
const MATCH_PREVIEW_LENGTH = 120;

/**
 * Timestamped Editor View target file (YYYY_MMDD_HHMM_SS_<TYPE>.md)
 * Captures: year / month / day / hour / minute / second / name without the timestamp
 */
const TIMESTAMPED_TARGET_FILE_PATTERN = /^(\d{4})_(\d{2})(\d{2})_(\d{2})(\d{2})_(\d{2})_((?:PROMPT|TASK|SPEC|QUICK_START)\.md)$/;

/**
 * Split a timestamped file name into its creation date/time and the name without the timestamp
 * Returns undefined if it does not match the format or is not a valid date/time
 */
export function parseTimestampedFileName(fileName: string): { date: Date; shortName: string } | undefined {
    const match = TIMESTAMPED_TARGET_FILE_PATTERN.exec(fileName);
    if (!match) {
        return undefined;
    }

    const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
    const date = new Date(year, month - 1, day, hour, minute, second);
    // Date rolls over values like 2026_1340_..., so check that the result matches the original values
    if (date.getMonth() !== month - 1 || date.getDate() !== day
        || date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second) {
        return undefined;
    }

    return { date, shortName: match[7] };
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
    private _searchQuery: string | undefined;
    // Number of the latest render request. If a new render starts during an await, the stale result is not sent
    private _renderToken: number = 0;

    constructor(fileWatcherService?: FileWatcherService, extensionUri?: vscode.Uri) {
        this.fileWatcherService = fileWatcherService;
        this._extensionUri = extensionUri;
        // Get the project root path
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.projectRootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
        // Register the listener up front and enable it immediately
        if (this.fileWatcherService) {
            this.fileWatcherService.registerListener(this.listenerId, () => {
                // On notification from FileWatcher, clear the whole cache so the change is reliably reflected
                this.debouncedRefresh();
            });
            // Keep the listener always enabled (regardless of view visibility)
            this.fileWatcherService.enableListener(this.listenerId);
        }
        // Watch for configuration changes and update the display
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
     * Handle messages from the Webview
     */
    private async _handleMessage(message: any): Promise<void> {
        switch (message?.type) {
            case 'ready':
                await this._render();
                break;
            case 'quickStart':
                await vscode.commands.executeCommand('aiCodingSidebar.quickStart');
                break;
            case 'resumeSession':
                await vscode.commands.executeCommand('aiCodingSidebar.resumeSession');
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
            case 'search':
                this.setSearchQuery(message.query);
                break;
            case 'clearSearch':
                this.setSearchQuery(undefined);
                break;
        }
    }

    /**
     * Handle a row click
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
                // When opening from search results, navigate to the file's directory before opening it
                // (navigation auto-displays a different file, so reopen the target afterwards)
                if (this.isSearching()) {
                    await this.navigateToDirectory(path.dirname(filePath));
                    await this.revealFile(filePath);
                }
                this.selectedItem = await this._createFileItem(filePath, false);
                await this._openFile(filePath);
                break;
            case 'path':
                this.selectedItem = await this._createFileItem(filePath, true);
                break;
        }
    }

    /**
     * Open the file in the appropriate view
     * Timestamped PROMPT/TASK/SPEC/QUICK_START files are opened in the Markdown Editor
     */
    private async _openFile(filePath: string): Promise<void> {
        const fileName = path.basename(filePath);

        if (TIMESTAMPED_TARGET_FILE_PATTERN.test(fileName) && this.editorProvider) {
            await this.editorProvider.showFile(filePath);
            return;
        }

        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
    }

    /**
     * Execute the command selected from the context menu
     * Existing commands take a FileItem argument, so restore one from the path and pass it
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
     * Restore a FileItem from a path (used for command calls and keeping the selection)
     * contextValue is carried over because archiveDirectory checks for 'pathDisplayNonRoot'
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
            // If it cannot be retrieved, keep the default value
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
     * Send the latest list to the Webview
     */
    private async _render(): Promise<void> {
        if (!this._view) {
            return;
        }

        const token = ++this._renderToken;

        try {
            const items = this.isSearching()
                ? await this.search(this._searchQuery!)
                : await this.buildItems();
            if (token !== this._renderToken) {
                return;
            }
            await this._view.webview.postMessage({
                type: 'update',
                items,
                selectedPath: this.selectedItem?.filePath
            });
        } catch (error) {
            if (token !== this._renderToken) {
                return;
            }
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
    // Building the list
    // ---------------------------------------------------------------------

    /**
     * Build the list of display items for the current directory
     */
    async buildItems(): Promise<PlansViewItem[]> {
        if (!this.rootPath) {
            return [];
        }

        // If the path does not exist, show the create button
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

        // Directory path to display
        let currentPath = this.activeFolderPath || this.rootPath;

        // If the displayed directory was deleted or moved by an external cause
        // (such as a rename by an AI agent), follow and display the renamed directory
        // (if the rename target cannot be identified, go up to the nearest existing ancestor directory)
        if (currentPath !== this.rootPath && !(await this.pathExists(currentPath))) {
            this.itemCache.delete(currentPath);
            const renamedPath = await this.resolveRenamedDirectory(currentPath);
            const fallbackPath = renamedPath ?? await this.resolveExistingAncestor(currentPath);
            this.activeFolderPath = fallbackPath === this.rootPath ? undefined : fallbackPath;
            currentPath = fallbackPath;
        }

        const items: PlansViewItem[] = [];

        // Path display item (shown at the top)
        // Show the path from the project root only for the root directory
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
            // Outside the root directory, change contextValue so that archive and other actions are shown
            contextValue: currentPath === this.rootPath ? 'pathDisplay' : 'pathDisplayNonRoot'
        });

        // Item to go back to the parent directory (cannot go above the root)
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

        // Return from the cache if present
        const cachedItems = this.itemCache.get(currentPath);
        if (cachedItems) {
            return [...items, ...cachedItems];
        }

        const files = await this.getFilesInDirectory(currentPath);
        const currentFilePath = this.editorProvider?.getCurrentFilePath();

        const isRoot = currentPath === this.rootPath;

        const fileItems: PlansViewItem[] = files.map(file => {
            if (file.isDirectory) {
                // Directories always show the date/time before the directory name
                return {
                    kind: 'directory',
                    label: `${this.formatDateTimePrefix(file.created)} ${file.name}`,
                    filePath: file.path,
                    icon: 'folder',
                    tooltip: file.path,
                    contextValue: 'directory'
                } as PlansViewItem;
            }

            const isEditing = !!currentFilePath && file.path === currentFilePath;

            return {
                kind: 'file',
                // Files show the date/time only outside the root directory (timestamped files are always shortened)
                label: this.formatFileLabel(file, !isRoot),
                description: isEditing ? 'editing' : undefined,
                filePath: file.path,
                icon: getFileIconName(file.name),
                tooltip: file.path,
                isEditing,
                contextValue: 'file'
            } as PlansViewItem;
        });

        // Save to the cache
        this.itemCache.set(currentPath, fileItems);
        return [...items, ...fileItems];
    }

    // ---------------------------------------------------------------------
    // Search
    // ---------------------------------------------------------------------

    /**
     * Whether a search is active (no search while the root directory does not exist)
     */
    isSearching(): boolean {
        return !!this._searchQuery && !this.pathNotFound;
    }

    getSearchQuery(): string | undefined {
        return this._searchQuery;
    }

    /**
     * Set the search query and re-render the list. An empty string or undefined ends the search
     */
    setSearchQuery(query: string | undefined): void {
        const normalized = typeof query === 'string' ? query.trim() : '';
        const next = normalized || undefined;
        if (next === this._searchQuery) {
            return;
        }
        this._searchQuery = next;
        void this._render();
    }

    /**
     * End the search and also clear the Webview input (e.g. on directory navigation)
     */
    private _clearSearch(): void {
        if (!this._searchQuery) {
            return;
        }
        this._searchQuery = undefined;
        void this._view?.webview.postMessage({ type: 'searchCleared' });
    }

    /**
     * Recursively search under the root directory and return the list of display items
     * - Matches entries whose name or body (.md only) contains each whitespace-separated term (case-insensitive)
     * - Hidden directories/files (starting with .) and symbolic links are not followed
     * - A searchHeader row showing the result count is placed first
     */
    async search(query: string): Promise<PlansViewItem[]> {
        const terms = query.trim().toLowerCase().split(/\s+/).filter(term => term.length > 0);
        if (!this.rootPath || terms.length === 0) {
            return [];
        }

        const directories: FileInfo[] = [];
        const files: FileInfo[] = [];
        const previews = new Map<string, string>();
        let truncated = false;

        const walk = async (dirPath: string): Promise<void> => {
            let entries: fs.Dirent[];
            try {
                entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
            } catch {
                return;
            }

            for (const entry of entries) {
                if (directories.length + files.length >= MAX_SEARCH_RESULTS) {
                    truncated = true;
                    return;
                }
                if (entry.name.startsWith('.') || entry.isSymbolicLink()) {
                    continue;
                }

                const fullPath = path.join(dirPath, entry.name);
                const isDirectory = entry.isDirectory();
                if (!isDirectory && !entry.isFile()) {
                    continue;
                }

                let stat: fs.Stats;
                try {
                    stat = await fsPromises.stat(fullPath);
                } catch {
                    continue;
                }

                const name = entry.name.toLowerCase();
                const remaining = terms.filter(term => !name.includes(term));
                let matched = remaining.length === 0;

                // Look for terms not matched by the name in the body
                if (!matched && !isDirectory && name.endsWith('.md') && stat.size <= MAX_SEARCH_FILE_SIZE) {
                    const preview = await this.findContentMatch(fullPath, remaining);
                    if (preview !== undefined) {
                        matched = true;
                        previews.set(fullPath, preview);
                    }
                }

                if (matched) {
                    const info: FileInfo = {
                        name: entry.name,
                        path: fullPath,
                        isDirectory,
                        size: isDirectory ? 0 : stat.size,
                        modified: stat.mtime,
                        created: stat.birthtime
                    };
                    (isDirectory ? directories : files).push(info);
                }

                if (isDirectory) {
                    await walk(fullPath);
                    if (truncated) {
                        return;
                    }
                }
            }
        };

        await walk(this.rootPath);

        this.sortFileInfos(directories);
        this.sortFileInfos(files);

        const rootPath = this.rootPath;
        const currentFilePath = this.editorProvider?.getCurrentFilePath();
        const count = directories.length + files.length;
        const countLabel = truncated ? `${count}+ results` : `${count} result${count === 1 ? '' : 's'}`;

        const items: PlansViewItem[] = [{
            kind: 'searchHeader',
            label: `${countLabel} for "${query.trim()}"`,
            filePath: '',
            icon: 'search',
            tooltip: truncated ? `Showing the first ${MAX_SEARCH_RESULTS} results` : undefined,
            contextValue: 'searchHeader'
        }];

        for (const info of [...directories, ...files]) {
            const relativeDir = path.relative(rootPath, path.dirname(info.path));
            const preview = previews.get(info.path);

            if (info.isDirectory) {
                items.push({
                    kind: 'directory',
                    label: info.name,
                    description: relativeDir || undefined,
                    filePath: info.path,
                    icon: 'folder',
                    tooltip: info.path,
                    contextValue: 'directory'
                });
                continue;
            }

            const isEditing = !!currentFilePath && info.path === currentFilePath;
            items.push({
                kind: 'file',
                label: this.formatFileLabel(info, false),
                description: [isEditing ? 'editing' : undefined, relativeDir || undefined].filter(Boolean).join(' · ') || undefined,
                filePath: info.path,
                icon: getFileIconName(info.name),
                tooltip: preview ? `${info.path}\n${preview}` : info.path,
                isEditing,
                contextValue: 'file',
                matchPreview: preview
            });
        }

        return items;
    }

    /**
     * Check whether the file body contains all terms and, if so, return an excerpt of the first matching line
     */
    private async findContentMatch(filePath: string, terms: readonly string[]): Promise<string | undefined> {
        let content: string;
        try {
            content = await fsPromises.readFile(filePath, 'utf8');
        } catch {
            return undefined;
        }

        const lowerContent = content.toLowerCase();
        if (!terms.every(term => lowerContent.includes(term))) {
            return undefined;
        }

        const line = content.split(/\r?\n/).find(text => {
            const lowerLine = text.toLowerCase();
            return terms.some(term => lowerLine.includes(term));
        }) ?? '';
        const trimmed = line.trim();
        return trimmed.length > MATCH_PREVIEW_LENGTH
            ? `${trimmed.slice(0, MATCH_PREVIEW_LENGTH)}…`
            : trimmed;
    }

    // ---------------------------------------------------------------------
    // Public API (used by commands and other providers)
    // ---------------------------------------------------------------------

    setEditorProvider(provider: IEditorProvider): void {
        this.editorProvider = provider;
    }

    async setRootPath(rootPath: string, relativePath?: string): Promise<void> {
        this.rootPath = rootPath;
        this.activeFolderPath = rootPath;
        this.configuredRelativePath = relativePath;
        this._clearSearch();

        // Check that the path exists
        try {
            const stat = await fsPromises.stat(rootPath);
            this.pathNotFound = !stat.isDirectory();
        } catch (error) {
            this.pathNotFound = true;
        }

        this.refresh();
    }

    /**
     * Whether the root directory does not exist and the "Create directory" row is shown
     */
    isRootPathNotFound(): boolean {
        return this.pathNotFound;
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

    /**
     * Get the last recorded session from metadata.md of the displayed directory
     * @returns The session and the directory containing metadata.md, or undefined if not found
     */
    async findLatestResumeSession(): Promise<(SessionMetadataEntry & { dirPath: string }) | undefined> {
        const dirPath = this.getCurrentPath();
        if (!dirPath || this.pathNotFound) {
            return undefined;
        }

        let content: string;
        try {
            content = await fsPromises.readFile(path.join(dirPath, SESSION_METADATA_FILE_NAME), 'utf8');
        } catch {
            return undefined;
        }

        const entry = new TemplateService().findLatestSessionMetadata(content);
        return entry ? { ...entry, dirPath } : undefined;
    }

    setSelectedItem(item: FileItem | undefined): void {
        this.selectedItem = item;
    }

    getSelectedItem(): FileItem | undefined {
        return this.selectedItem;
    }

    refresh(targetPath?: string): void {
        if (targetPath) {
            // Clear the cache only for the given path and its parent directory
            this.itemCache.delete(targetPath);
            const parentPath = path.dirname(targetPath);
            if (parentPath && parentPath !== targetPath) {
                this.itemCache.delete(parentPath);
            }
        } else {
            // Clear the whole cache only on a full refresh
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
     * Navigate to the given directory (for the flat list display)
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

        // Check that it is within rootPath
        if (this.rootPath && !targetPath.startsWith(this.rootPath)) {
            return;
        }

        // Clear the Editor file selection on directory navigation (including auto-save)
        await this.editorProvider?.clearFile();

        // End the search so the destination list is shown
        this._clearSearch();

        this.activeFolderPath = targetPath;
        this.selectedItem = undefined;
        this.refresh();
        // Reset the destination directory snapshot (so the next poll compares correctly)
        this._lastDirFileCount = -1;
        this._lastDirModTime = 0;

        // Find and auto-select a target file (TASK.md, PROMPT.md, SPEC.md, QUICK_START.md)
        // The root directory serves as the task list, so no auto-select or auto-display there
        if (this.editorProvider && !this._isRootDirectory(targetPath)) {
            const oldestFile = await this.findOldestTargetFile(targetPath);
            if (oldestFile) {
                await this.editorProvider.showFile(oldestFile);
                await this.revealFile(oldestFile);
            }
        }
    }

    /**
     * Determine whether the given path is the root directory
     */
    private _isRootDirectory(targetPath: string): boolean {
        if (!this.rootPath) {
            return false;
        }

        return path.resolve(targetPath) === path.resolve(this.rootPath);
    }

    /**
     * Select the given file in the Plans View
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

        // Check that the file is under the current rootPath
        if (!filePath.startsWith(this.rootPath)) {
            return;
        }

        this.selectedItem = await this._createFileItem(filePath, false);
        await this._view?.webview.postMessage({ type: 'select', filePath });
    }

    /**
     * Select the given directory in the Plans View
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
     * Control polling based on view visibility
     */
    handleVisibilityChange(visible: boolean): void {
        if (visible) {
            // Refresh when the view becomes visible again to reflect the latest state
            this.refresh();
            // Start polling to catch events missed by FileWatcher
            this._startPolling();
        } else {
            // Stop polling while the view is hidden to free resources
            // Keep the FileWatcher listener enabled
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
     * Handle a drop from the Webview
     * If targetPath is not given (drop on empty space or a file row), target the currently displayed directory
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
            // text/uri-list is newline-separated; lines starting with '#' are comments
            const uris = uriList
                .split(/\r?\n/)
                .map(uri => uri.trim())
                .filter(uri => uri !== '' && !uri.startsWith('#'));
            await this.copyExternalFiles(uris, targetDir);
        }
    }

    /**
     * Write out file contents sent from the Webview
     * For drops from external apps the Webview cannot get absolute paths, so receive and save the contents
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
            // Do not join a Webview-supplied name as is (in case it contains path separators)
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
     * Decide the drop target directory
     * If the drop target is a file, use its parent directory
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
     * Copy files dropped from outside
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
                // Ignore URIs that cannot be parsed
            }
        }

        await this.copyFiles(sourcePaths, targetDir);
    }

    /**
     * Copy the files at the given paths to the target directory
     */
    private async copyFiles(sourcePaths: readonly string[], targetDir: string): Promise<void> {
        const copiedFiles: string[] = [];

        for (const sourcePath of sourcePaths) {
            const fileName = path.basename(sourcePath);
            const targetPath = path.join(targetDir, fileName);

            // Ignore copies to the same path
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
     * Confirm overwriting and return whether writing is allowed
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
     * Show the copy result and update the view
     */
    private showCopyResult(copiedFiles: readonly string[]): void {
        if (copiedFiles.length > 0) {
            const message = copiedFiles.length === 1
                ? `Copied: ${copiedFiles[0]}`
                : `Copied ${copiedFiles.length} files`;
            vscode.window.showInformationMessage(message);
        }

        // Update the view
        this.refresh();
    }

    // ---------------------------------------------------------------------
    // Internal utilities
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
     * Start polling (runs only while the Plans View is visible)
     * Check the directory every 3 seconds to catch events missed by FileWatcher
     */
    private _startPolling(): void {
        this._stopPolling();
        // Reset the snapshot when polling starts
        this._lastDirFileCount = -1;
        this._lastDirModTime = 0;
        this._pollingTimer = setInterval(() => {
            void this._pollDirectory();
        }, 3000);
    }

    /**
     * Stop polling
     */
    private _stopPolling(): void {
        if (this._pollingTimer) {
            clearInterval(this._pollingTimer);
            this._pollingTimer = undefined;
        }
    }

    /**
     * Lightweight check for directory changes; refresh if anything changed
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
            // Skip if, for example, the directory was deleted
        }
    }

    /**
     * Check whether the path exists
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
     * If the given path does not exist, return the nearest existing ancestor directory (bounded below by rootPath)
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
     * Infer whether a vanished directory (oldPath) was renamed under the same parent directory
     * Using this project's naming convention (a timestamp prefixed to directory and file names),
     * if a sibling directory contains a file whose name starts with oldPath's directory name,
     * treat it as the renamed directory and return it
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
                // Ignore unreadable directories and check the next one
            }
        }

        return undefined;
    }

    /**
     * Search the given directory for target files (TASK.md, PROMPT.md, SPEC.md, QUICK_START.md)
     * and return the path of the oldest one
     */
    private async findOldestTargetFile(dirPath: string): Promise<string | undefined> {
        try {
            const files = await this.getFilesInDirectory(dirPath);

            // Target file pattern (case-insensitive)
            const targetPatterns = ['TASK.MD', 'PROMPT.MD', 'SPEC.MD', 'QUICK_START.MD'];

            // Filter the target files
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

            // Sort by creation time (ascending) and take the oldest file
            targetFiles.sort((a, b) => a.created.getTime() - b.created.getTime());

            return targetFiles[0].path;
        } catch (error) {
            console.error('Failed to find oldest target file:', error);
            return undefined;
        }
    }

    /**
     * Build the label for a file row
     * Timestamped files are shortened by replacing the timestamp with a date/time prefix
     * (e.g. 2026_1011_0206_17_QUICK_START.md -> [02:06] QUICK_START.md). The date/time is taken from the file name
     * Other files get a creation date/time prefix only when withPrefix is true
     */
    private formatFileLabel(file: FileInfo, withPrefix: boolean): string {
        const parsed = parseTimestampedFileName(file.name);
        if (parsed) {
            return `${this.formatDateTimePrefix(parsed.date)} ${parsed.shortName}`;
        }
        return withPrefix ? `${this.formatDateTimePrefix(file.created)} ${file.name}` : file.name;
    }

    /**
     * Format date/time prefix for directory and non-root file display
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

            // Run stat calls in parallel
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
                        // Skip when stat fails
                        return null;
                    }
                })
            );

            // Exclude nulls (stat failures) and split into directories and files
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

            // Sort both directories and files
            this.sortFileInfos(directories);
            this.sortFileInfos(files);

            // Return directories first, then files
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

    /**
     * Sort according to the settings (plans.sortBy / plans.sortOrder)
     */
    private sortFileInfos(items: FileInfo[]): void {
        const config = vscode.workspace.getConfiguration('aiCodingSidebar.plans');
        const sortBy = config.get<string>('sortBy', 'created');
        const sortOrder = config.get<string>('sortOrder', 'ascending');

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
    }
}
