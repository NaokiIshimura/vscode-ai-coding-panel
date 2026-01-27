import * as vscode from 'vscode';
import { DisplayOptions, SortField, SortOrder, ViewMode } from '../types';

/**
 * 設定プロバイダー
 */
export class ConfigurationProvider {
    private readonly configSection = 'aiCodingSidebar';

    /**
     * 設定を取得
     */
    private getConfiguration(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(this.configSection);
    }

    /**
     * コマンドプレフィックスを取得
     */
    getCommandPrefix(): string {
        return this.getConfiguration().get<string>('editor.commandPrefix', 'claude --model opus');
    }

    /**
     * デフォルト相対パスを取得
     */
    getDefaultRelativePath(): string {
        return this.getConfiguration().get<string>('plans.defaultRelativePath', '');
    }

    /**
     * デフォルト相対パスを設定
     */
    async setDefaultRelativePath(path: string): Promise<void> {
        await this.getConfiguration().update(
            'plans.defaultRelativePath',
            path,
            vscode.ConfigurationTarget.Workspace
        );
    }

    /**
     * 表示オプションを取得
     */
    getDisplayOptions(): DisplayOptions {
        const config = this.getConfiguration();

        return {
            sortBy: config.get<SortField>('sortBy', SortField.Name),
            sortOrder: config.get<SortOrder>('sortOrder', SortOrder.Ascending),
            showHidden: config.get<boolean>('showHidden', false),
            viewMode: config.get<ViewMode>('viewMode', ViewMode.Tree)
        };
    }

    /**
     * ソート順を取得
     */
    getSortBy(): SortField {
        return this.getConfiguration().get<SortField>('sortBy', SortField.Name);
    }

    /**
     * ソート順を設定
     */
    async setSortBy(sortBy: SortField): Promise<void> {
        await this.getConfiguration().update(
            'sortBy',
            sortBy,
            vscode.ConfigurationTarget.Workspace
        );
    }

    /**
     * ソート方向を取得
     */
    getSortOrder(): SortOrder {
        return this.getConfiguration().get<SortOrder>('sortOrder', SortOrder.Ascending);
    }

    /**
     * ソート方向を設定
     */
    async setSortOrder(sortOrder: SortOrder): Promise<void> {
        await this.getConfiguration().update(
            'sortOrder',
            sortOrder,
            vscode.ConfigurationTarget.Workspace
        );
    }

    /**
     * 隠しファイル表示設定を取得
     */
    getShowHidden(): boolean {
        return this.getConfiguration().get<boolean>('showHidden', false);
    }

    /**
     * 隠しファイル表示設定を設定
     */
    async setShowHidden(showHidden: boolean): Promise<void> {
        await this.getConfiguration().update(
            'showHidden',
            showHidden,
            vscode.ConfigurationTarget.Workspace
        );
    }

    /**
     * 表示モードを取得
     */
    getViewMode(): ViewMode {
        return this.getConfiguration().get<ViewMode>('viewMode', ViewMode.Tree);
    }

    /**
     * 表示モードを設定
     */
    async setViewMode(viewMode: ViewMode): Promise<void> {
        await this.getConfiguration().update(
            'viewMode',
            viewMode,
            vscode.ConfigurationTarget.Workspace
        );
    }

    /**
     * 自動更新設定を取得
     */
    getAutoRefresh(): boolean {
        return this.getConfiguration().get<boolean>('autoRefresh', true);
    }

    /**
     * 自動更新設定を設定
     */
    async setAutoRefresh(autoRefresh: boolean): Promise<void> {
        await this.getConfiguration().update(
            'autoRefresh',
            autoRefresh,
            vscode.ConfigurationTarget.Workspace
        );
    }

    /**
     * ファイルアイコン表示設定を取得
     */
    getShowFileIcons(): boolean {
        return this.getConfiguration().get<boolean>('showFileIcons', true);
    }

    /**
     * ファイルアイコン表示設定を設定
     */
    async setShowFileIcons(showFileIcons: boolean): Promise<void> {
        await this.getConfiguration().update(
            'showFileIcons',
            showFileIcons,
            vscode.ConfigurationTarget.Workspace
        );
    }

    /**
     * 設定変更を監視
     */
    onConfigurationChanged(callback: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(this.configSection)) {
                callback(e);
            }
        });
    }

    /**
     * すべての設定をリセット
     */
    async resetAllSettings(): Promise<void> {
        const config = this.getConfiguration();
        const keys = [
            'plans.defaultRelativePath',
            'sortBy',
            'sortOrder',
            'showHidden',
            'viewMode',
            'autoRefresh',
            'showFileIcons'
        ];

        for (const key of keys) {
            await config.update(key, undefined, vscode.ConfigurationTarget.Workspace);
        }
    }
}
