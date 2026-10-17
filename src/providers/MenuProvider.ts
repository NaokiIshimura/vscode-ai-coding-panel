import * as vscode from 'vscode';
import { MenuItem } from './items/MenuItem';

export class MenuProvider implements vscode.TreeDataProvider<MenuItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MenuItem | undefined | null | void> = new vscode.EventEmitter<MenuItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MenuItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private _rootItems: MenuItem[] | undefined;

    constructor() { }

    refresh(): void {
        // The menu is static, but discard the cache so it can be rebuilt
        this._rootItems = undefined;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: MenuItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MenuItem): MenuItem[] {
        if (element) {
            // Child level: return the children of the parent item
            return element.children || [];
        }

        // Root level: return the menu items (built and cached on first call only)
        if (!this._rootItems) {
            this._rootItems = this._buildRootItems();
        }

        return this._rootItems;
    }

    /**
     * Build the root-level menu items
     *
     * Global / Workspace are Expanded. With Collapsed, each time a parent is opened
     * a separate getChildren() call (a round trip to the extension host) occurs, so
     * batch them into a single fetch on first expansion to reduce waits
     * Only Usage Guide is collapsed by default, since it has many items and is rarely used
     */
    private _buildRootItems(): MenuItem[] {
        return [
            // Usage Guide (parent item)
            new MenuItem(
                'Usage Guide',
                'How to use this extension',
                undefined,
                new vscode.ThemeIcon('book'),
                [
                    new MenuItem(
                        'Quick Start',
                        'Basic usage and workflow overview',
                        {
                            command: 'aiCodingSidebar.openGettingStarted',
                            title: 'Open Quick Start'
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
                // Usage Guide has many items and is rarely used, so it is collapsed by default
                vscode.TreeItemCollapsibleState.Collapsed
            ),
            // Global (parent item)
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
                    ),
                    new MenuItem(
                        'Customize Editor Templates',
                        'Customize template for file creation shared across workspaces',
                        {
                            command: 'aiCodingSidebar.setupGlobalTemplate',
                            title: 'Customize Editor Templates'
                        },
                        new vscode.ThemeIcon('file-text')
                    ),
                    new MenuItem(
                        'Customize Prompt Templates',
                        'Customize prompt templates shared across workspaces',
                        {
                            command: 'aiCodingSidebar.setupGlobalPromptTemplates',
                            title: 'Customize Prompt Templates'
                        },
                        new vscode.ThemeIcon('symbol-snippet')
                    )
                ],
                vscode.TreeItemCollapsibleState.Expanded
            ),
            // Workspace (parent item)
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
                        'Customize Editor Templates',
                        'Customize template for file creation',
                        {
                            command: 'aiCodingSidebar.setupTemplate',
                            title: 'Customize Editor Templates'
                        },
                        new vscode.ThemeIcon('file-text')
                    ),
                    new MenuItem(
                        'Customize Prompt Templates',
                        'Customize prompt templates inserted from the Editor view',
                        {
                            command: 'aiCodingSidebar.setupPromptTemplates',
                            title: 'Customize Prompt Templates'
                        },
                        new vscode.ThemeIcon('symbol-snippet')
                    )
                ],
                vscode.TreeItemCollapsibleState.Expanded
            )
        ];
    }
}
