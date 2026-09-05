import * as vscode from 'vscode';
import { MenuItem } from './items/MenuItem';

export class MenuProvider implements vscode.TreeDataProvider<MenuItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MenuItem | undefined | null | void> = new vscode.EventEmitter<MenuItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MenuItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private _rootItems: MenuItem[] | undefined;

    constructor() { }

    refresh(): void {
        // メニュー構成は静的だが、再構築できるようキャッシュを破棄する
        this._rootItems = undefined;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: MenuItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MenuItem): MenuItem[] {
        if (element) {
            // 子レベル: 親項目の子要素を返す
            return element.children || [];
        }

        // ルートレベル: メニュー項目を返す（初回のみ構築してキャッシュ）
        if (!this._rootItems) {
            this._rootItems = this._buildRootItems();
        }

        return this._rootItems;
    }

    /**
     * ルートレベルのメニュー項目を構築
     */
    private _buildRootItems(): MenuItem[] {
        return [
            // Usage Guide（親項目）
            new MenuItem(
                'Usage Guide',
                'How to use this extension',
                undefined,
                new vscode.ThemeIcon('book'),
                [
                    new MenuItem(
                        'Getting Started',
                        'Basic usage and workflow overview',
                        {
                            command: 'aiCodingSidebar.openGettingStarted',
                            title: 'Open Getting Started'
                        },
                        new vscode.ThemeIcon('rocket')
                    ),
                    new MenuItem(
                        'Plans View',
                        'File browsing and management guide',
                        {
                            command: 'aiCodingSidebar.openPlansViewGuide',
                            title: 'Open Plans View Guide'
                        },
                        new vscode.ThemeIcon('list-tree')
                    ),
                    new MenuItem(
                        'Editor View',
                        'Markdown editing and Run/Plan commands',
                        {
                            command: 'aiCodingSidebar.openEditorViewGuide',
                            title: 'Open Editor View Guide'
                        },
                        new vscode.ThemeIcon('edit')
                    ),
                    new MenuItem(
                        'Terminal View',
                        'Terminal tabs and configuration',
                        {
                            command: 'aiCodingSidebar.openTerminalViewGuide',
                            title: 'Open Terminal View Guide'
                        },
                        new vscode.ThemeIcon('terminal')
                    ),
                    new MenuItem(
                        'Keyboard Shortcuts',
                        'All keyboard shortcuts reference',
                        {
                            command: 'aiCodingSidebar.openKeyboardShortcuts',
                            title: 'Open Keyboard Shortcuts'
                        },
                        new vscode.ThemeIcon('keyboard')
                    ),
                    new MenuItem(
                        'Documentation',
                        'View full documentation on GitHub',
                        {
                            command: 'aiCodingSidebar.openDocumentation',
                            title: 'Open Documentation'
                        },
                        new vscode.ThemeIcon('link-external')
                    )
                ],
                vscode.TreeItemCollapsibleState.Collapsed
            ),
            // グローバル（親項目）
            new MenuItem(
                'Global',
                'User-level settings',
                undefined,
                new vscode.ThemeIcon('account'),
                [
                    new MenuItem(
                        'Open User Settings',
                        'Open AI Coding Panel user settings',
                        {
                            command: 'aiCodingSidebar.openUserSettings',
                            title: 'Open User Settings'
                        },
                        new vscode.ThemeIcon('settings-gear')
                    )
                ],
                vscode.TreeItemCollapsibleState.Collapsed
            ),
            // ワークスペース（親項目）
            new MenuItem(
                'Workspace',
                'Workspace-level settings',
                undefined,
                new vscode.ThemeIcon('folder-opened'),
                [
                    new MenuItem(
                        'Open Workspace Settings',
                        'Open AI Coding Panel workspace settings',
                        {
                            command: 'aiCodingSidebar.openWorkspaceSettings',
                            title: 'Open Workspace Settings'
                        },
                        new vscode.ThemeIcon('settings-gear')
                    ),
                    new MenuItem(
                        'Customize Template',
                        'Customize template for file creation',
                        {
                            command: 'aiCodingSidebar.setupTemplate',
                            title: 'Customize Template'
                        },
                        new vscode.ThemeIcon('file-text')
                    )
                ],
                vscode.TreeItemCollapsibleState.Collapsed
            ),
            // Quick actions（親項目）
            new MenuItem(
                'Quick actions',
                'Convenient actions for development',
                undefined,
                new vscode.ThemeIcon('zap'),
                [
                    new MenuItem(
                        'Open Terminal',
                        'Open integrated terminal in VSCode',
                        {
                            command: 'aiCodingSidebar.openTerminal',
                            title: 'Open Terminal'
                        },
                        new vscode.ThemeIcon('terminal')
                    ),
                    new MenuItem(
                        'Checkout Default Branch',
                        'Switch to the default branch (main/master)',
                        {
                            command: 'aiCodingSidebar.checkoutDefaultBranch',
                            title: 'Checkout Default Branch'
                        },
                        new vscode.ThemeIcon('git-branch')
                    ),
                    new MenuItem(
                        'Git Pull',
                        'Pull the latest changes from remote',
                        {
                            command: 'aiCodingSidebar.gitPull',
                            title: 'Git Pull'
                        },
                        new vscode.ThemeIcon('arrow-down')
                    ),
                    new MenuItem(
                        'Open Integrated Browser',
                        'Open the VSCode integrated browser',
                        {
                            command: 'aiCodingSidebar.openIntegratedBrowser',
                            title: 'Open Integrated Browser'
                        },
                        new vscode.ThemeIcon('globe')
                    ),
                    new MenuItem(
                        'Duplicate Workspace in New Window',
                        'Open a copy of this workspace in a new window',
                        {
                            command: 'workbench.action.duplicateWorkspaceInNewWindow',
                            title: 'Duplicate Workspace in New Window'
                        },
                        new vscode.ThemeIcon('multiple-windows')
                    )
                ],
                vscode.TreeItemCollapsibleState.Expanded
            )
        ];
    }
}
