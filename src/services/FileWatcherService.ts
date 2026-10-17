import * as vscode from 'vscode';
import { IFileWatcherService, FileChangeListener } from '../interfaces/IFileWatcherService';

/**
 * Listener information
 */
interface ListenerInfo {
    listener: FileChangeListener;
    enabled: boolean;
}

/**
 * File watcher service implementation
 * Manages a single file watcher shared by multiple providers
 * The watch scope is limited to the directory managed by Plans View (defaultRelativePath)
 */
export class FileWatcherService implements IFileWatcherService {
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private listeners: Map<string, ListenerInfo> = new Map();
    private disposables: vscode.Disposable[] = [];
    private configChangeDisposable: vscode.Disposable | undefined;
    private currentWatchPattern: string | undefined;

    constructor() {
        this.initializeWatcher();
        this.setupConfigurationWatcher();
    }

    /**
     * Get the relative path to watch from the settings
     */
    private getDefaultRelativePath(): string {
        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
        const defaultRelativePath = config.get<string>('plans.defaultRelativePath', '.claude/plans');
        return (defaultRelativePath && defaultRelativePath.trim()) ? defaultRelativePath.trim() : '.claude/plans';
    }

    /**
     * Initialize the watchers
     */
    private initializeWatcher(): void {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders[0];
        const defaultRelativePath = this.getDefaultRelativePath();
        this.currentWatchPattern = defaultRelativePath;

        // Use the watched directory's URI as the base to improve event detection accuracy
        const plansUri = vscode.Uri.joinPath(workspaceFolder.uri, defaultRelativePath);
        const watchPattern = new vscode.RelativePattern(plansUri, '**/*');
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern);

        // FileSystemWatcher: OS-native file system events
        this.disposables.push(
            this.fileWatcher.onDidChange((uri) => this.notifyListeners(uri)),
            this.fileWatcher.onDidCreate((uri) => this.notifyListeners(uri)),
            this.fileWatcher.onDidDelete((uri) => this.notifyListeners(uri))
        );

        // workspace API: VS Code file events (supplements FileSystemWatcher)
        const plansPath = plansUri.fsPath;
        this.disposables.push(
            vscode.workspace.onDidCreateFiles((e) => {
                e.files.forEach(uri => {
                    if (uri.fsPath.startsWith(plansPath)) {
                        this.notifyListeners(uri);
                    }
                });
            }),
            vscode.workspace.onDidDeleteFiles((e) => {
                e.files.forEach(uri => {
                    if (uri.fsPath.startsWith(plansPath)) {
                        this.notifyListeners(uri);
                    }
                });
            }),
            vscode.workspace.onDidRenameFiles((e) => {
                e.files.forEach(({ oldUri, newUri }) => {
                    if (oldUri.fsPath.startsWith(plansPath) || newUri.fsPath.startsWith(plansPath)) {
                        this.notifyListeners(newUri);
                    }
                });
            })
        );
    }

    /**
     * Watch for configuration changes and recreate the watchers when the watched path changes
     */
    private setupConfigurationWatcher(): void {
        this.configChangeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('aiCodingSidebar.plans.defaultRelativePath')) {
                const newPath = this.getDefaultRelativePath();
                if (newPath !== this.currentWatchPattern) {
                    this.recreateWatcher();
                }
            }
        });
    }

    /**
     * Dispose and recreate the watchers
     */
    private recreateWatcher(): void {
        // Dispose the existing watchers and Disposables
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
        }
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        // Create new watchers
        this.initializeWatcher();
    }

    /**
     * Notify registered listeners of a change
     */
    private notifyListeners(uri: vscode.Uri): void {
        // Notify only enabled listeners
        this.listeners.forEach((info) => {
            if (info.enabled) {
                info.listener(uri);
            }
        });
    }

    /**
     * Register a file change listener
     */
    registerListener(id: string, listener: FileChangeListener): void {
        this.listeners.set(id, {
            listener,
            enabled: false // Disabled by default
        });
    }

    /**
     * Unregister a listener
     */
    unregisterListener(id: string): void {
        this.listeners.delete(id);
    }

    /**
     * Enable a specific listener
     */
    enableListener(id: string): void {
        const listenerInfo = this.listeners.get(id);
        if (listenerInfo) {
            listenerInfo.enabled = true;
        }
    }

    /**
     * Disable a specific listener
     */
    disableListener(id: string): void {
        const listenerInfo = this.listeners.get(id);
        if (listenerInfo) {
            listenerInfo.enabled = false;
        }
    }

    /**
     * Enable all listeners
     */
    enableAllListeners(): void {
        this.listeners.forEach((info) => {
            info.enabled = true;
        });
    }

    /**
     * Disable all listeners
     */
    disableAllListeners(): void {
        this.listeners.forEach((info) => {
            info.enabled = false;
        });
    }

    /**
     * Check whether the watcher is active
     */
    isWatcherActive(): boolean {
        return Array.from(this.listeners.values()).some(info => info.enabled);
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
        }

        if (this.configChangeDisposable) {
            this.configChangeDisposable.dispose();
            this.configChangeDisposable = undefined;
        }

        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.listeners.clear();
    }
}
