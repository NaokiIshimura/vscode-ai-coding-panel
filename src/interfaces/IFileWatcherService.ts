import * as vscode from 'vscode';

/**
 * Listener type for file change events
 */
export type FileChangeListener = (uri: vscode.Uri) => void;

/**
 * Interface for the file watcher service
 */
export interface IFileWatcherService extends vscode.Disposable {
    /**
     * Register a file change listener
     * @param id Listener identifier
     * @param listener Callback invoked when a file changes
     */
    registerListener(id: string, listener: FileChangeListener): void;

    /**
     * Unregister a listener
     * @param id Listener identifier
     */
    unregisterListener(id: string): void;

    /**
     * Enable a specific listener
     * @param id Listener identifier
     */
    enableListener(id: string): void;

    /**
     * Disable a specific listener
     * @param id Listener identifier
     */
    disableListener(id: string): void;

    /**
     * Enable all listeners
     */
    enableAllListeners(): void;

    /**
     * Disable all listeners
     */
    disableAllListeners(): void;

    /**
     * Check whether the watcher is active
     */
    isWatcherActive(): boolean;
}
