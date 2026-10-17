import * as vscode from 'vscode';
import { DisplayOptions, SortField, SortOrder, ViewMode } from '../types';

/**
 * Configuration provider
 */
export class ConfigurationProvider {
    private readonly configSection = 'aiCodingSidebar';

    /**
     * Get the configuration
     */
    private getConfiguration(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(this.configSection);
    }

    /**
     * Get the command prefix
     */
    getCommandPrefix(): string {
        return this.getConfiguration().get<string>('editor.commandPrefix', 'claude');
    }

    /**
     * Get the default relative path
     */
    getDefaultRelativePath(): string {
        return this.getConfiguration().get<string>('plans.defaultRelativePath', '');
    }

    /**
     * Set the default relative path
     */
    async setDefaultRelativePath(path: string): Promise<void> {
        await this.getConfiguration().update(
            'plans.defaultRelativePath',
            path,
            vscode.ConfigurationTarget.Workspace
        );
    }

    /**
     * Get the display options
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
     * Get the sort key
     */
    getSortBy(): SortField {
        return this.getConfiguration().get<SortField>('sortBy', SortField.Name);
    }

    /**
     * Set the sort key
     */
    async setSortBy(sortBy: SortField): Promise<void> {
        await this.getConfiguration().update(
            'sortBy',
            sortBy,
            vscode.ConfigurationTarget.Workspace
        );
    }

    /**
     * Get the sort direction
     */
    getSortOrder(): SortOrder {
        return this.getConfiguration().get<SortOrder>('sortOrder', SortOrder.Ascending);
    }

    /**
     * Set the sort direction
     */
    async setSortOrder(sortOrder: SortOrder): Promise<void> {
        await this.getConfiguration().update(
            'sortOrder',
            sortOrder,
            vscode.ConfigurationTarget.Workspace
        );
    }

    /**
     * Get the show-hidden-files setting
     */
    getShowHidden(): boolean {
        return this.getConfiguration().get<boolean>('showHidden', false);
    }

    /**
     * Set the show-hidden-files setting
     */
    async setShowHidden(showHidden: boolean): Promise<void> {
        await this.getConfiguration().update(
            'showHidden',
            showHidden,
            vscode.ConfigurationTarget.Workspace
        );
    }

    /**
     * Get the view mode
     */
    getViewMode(): ViewMode {
        return this.getConfiguration().get<ViewMode>('viewMode', ViewMode.Tree);
    }

    /**
     * Set the view mode
     */
    async setViewMode(viewMode: ViewMode): Promise<void> {
        await this.getConfiguration().update(
            'viewMode',
            viewMode,
            vscode.ConfigurationTarget.Workspace
        );
    }

    /**
     * Get the auto-refresh setting
     */
    getAutoRefresh(): boolean {
        return this.getConfiguration().get<boolean>('autoRefresh', true);
    }

    /**
     * Set the auto-refresh setting
     */
    async setAutoRefresh(autoRefresh: boolean): Promise<void> {
        await this.getConfiguration().update(
            'autoRefresh',
            autoRefresh,
            vscode.ConfigurationTarget.Workspace
        );
    }

    /**
     * Get the show-file-icons setting
     */
    getShowFileIcons(): boolean {
        return this.getConfiguration().get<boolean>('showFileIcons', true);
    }

    /**
     * Set the show-file-icons setting
     */
    async setShowFileIcons(showFileIcons: boolean): Promise<void> {
        await this.getConfiguration().update(
            'showFileIcons',
            showFileIcons,
            vscode.ConfigurationTarget.Workspace
        );
    }

    /**
     * Watch for configuration changes
     */
    onConfigurationChanged(callback: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(this.configSection)) {
                callback(e);
            }
        });
    }

    /**
     * Reset all settings
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
