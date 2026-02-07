import * as vscode from 'vscode';
import { IFileWatcherService, FileChangeListener } from '../interfaces/IFileWatcherService';

/**
 * リスナー情報
 */
interface ListenerInfo {
    listener: FileChangeListener;
    enabled: boolean;
}

/**
 * ファイルウォッチャーサービスの実装
 * 複数のプロバイダーで共有される単一のファイルウォッチャーを管理
 * 監視範囲はPlans View管理対象ディレクトリ（defaultRelativePath）に限定
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
     * 設定値からウォッチパターンを生成
     */
    private getWatchPatternFromConfig(): string {
        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
        const defaultRelativePath = config.get<string>('plans.defaultRelativePath', '.claude/plans');

        if (defaultRelativePath && defaultRelativePath.trim()) {
            return `${defaultRelativePath.trim()}/**/*`;
        }

        // 設定値が空の場合はフォールバック
        return '.claude/plans/**/*';
    }

    /**
     * ウォッチャーを初期化
     */
    private initializeWatcher(): void {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders[0];
        const pattern = this.getWatchPatternFromConfig();
        this.currentWatchPattern = pattern;

        // Plans View管理対象ディレクトリのみを監視
        const watchPattern = new vscode.RelativePattern(workspaceFolder, pattern);
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern);

        // ファイル変更イベントをリスナーに通知
        this.disposables.push(
            this.fileWatcher.onDidChange((uri) => this.notifyListeners(uri)),
            this.fileWatcher.onDidCreate((uri) => this.notifyListeners(uri)),
            this.fileWatcher.onDidDelete((uri) => this.notifyListeners(uri))
        );
    }

    /**
     * 設定変更を監視し、ウォッチパターンが変わった場合にウォッチャーを再作成
     */
    private setupConfigurationWatcher(): void {
        this.configChangeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('aiCodingSidebar.plans.defaultRelativePath')) {
                const newPattern = this.getWatchPatternFromConfig();
                if (newPattern !== this.currentWatchPattern) {
                    this.recreateWatcher();
                }
            }
        });
    }

    /**
     * ウォッチャーを破棄して再作成
     */
    private recreateWatcher(): void {
        // 既存のウォッチャーとDisposableを破棄
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
        }
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        // 新しいウォッチャーを作成
        this.initializeWatcher();
    }

    /**
     * 登録されたリスナーに変更を通知
     */
    private notifyListeners(uri: vscode.Uri): void {
        // 有効なリスナーのみに通知
        this.listeners.forEach((info) => {
            if (info.enabled) {
                info.listener(uri);
            }
        });
    }

    /**
     * ファイル変更リスナーを登録
     */
    registerListener(id: string, listener: FileChangeListener): void {
        this.listeners.set(id, {
            listener,
            enabled: false // デフォルトは無効
        });
    }

    /**
     * リスナーの登録を解除
     */
    unregisterListener(id: string): void {
        this.listeners.delete(id);
    }

    /**
     * 特定のリスナーを有効化
     */
    enableListener(id: string): void {
        const listenerInfo = this.listeners.get(id);
        if (listenerInfo) {
            listenerInfo.enabled = true;
        }
    }

    /**
     * 特定のリスナーを無効化
     */
    disableListener(id: string): void {
        const listenerInfo = this.listeners.get(id);
        if (listenerInfo) {
            listenerInfo.enabled = false;
        }
    }

    /**
     * すべてのリスナーを有効化
     */
    enableAllListeners(): void {
        this.listeners.forEach((info) => {
            info.enabled = true;
        });
    }

    /**
     * すべてのリスナーを無効化
     */
    disableAllListeners(): void {
        this.listeners.forEach((info) => {
            info.enabled = false;
        });
    }

    /**
     * ウォッチャーが有効かどうかを確認
     */
    isWatcherActive(): boolean {
        return Array.from(this.listeners.values()).some(info => info.enabled);
    }

    /**
     * リソースを破棄
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
