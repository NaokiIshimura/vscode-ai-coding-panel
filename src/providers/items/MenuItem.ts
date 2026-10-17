import * as vscode from 'vscode';

// Workspace settings item class
export class MenuItem extends vscode.TreeItem {
    public readonly children?: MenuItem[];

    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly command?: vscode.Command,
        public readonly icon?: vscode.ThemeIcon,
        children?: MenuItem[],
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState ?? (children ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None));
        this.tooltip = description;
        this.iconPath = icon;
        this.children = children;
    }
}
