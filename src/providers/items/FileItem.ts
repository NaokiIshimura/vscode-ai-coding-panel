import * as vscode from 'vscode';
import * as path from 'path';
import { formatFileSize } from '../../utils/fileUtils';

/**
 * Get the icon name (codicon name) for the file type
 * Shared so that ThemeIcon and the Webview codicons can use the same name
 */
export function getFileIconName(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();

    // For Markdown files, distinguish whether the file is an Editor View target
    if (ext === '.md') {
        const editorTargetPattern = /(?:TASK|PROMPT|SPEC|QUICK_START)\.md$/i;
        // Editor View target files (TASK/PROMPT/SPEC/QUICK_START) use the edit icon
        if (editorTargetPattern.test(fileName)) {
            return 'edit';
        }
        // Others use the markdown icon (opened in the regular editor)
        return 'markdown';
    }

    // Choose the icon by file extension
    const iconMap: { [key: string]: string } = {
        '.ts': 'symbol-method',
        '.tsx': 'symbol-method',
        '.js': 'symbol-function',
        '.jsx': 'symbol-function',
        '.json': 'json',
        '.txt': 'file-text',
        '.py': 'symbol-class',
        '.java': 'symbol-class',
        '.cpp': 'symbol-class',
        '.c': 'symbol-class',
        '.h': 'symbol-class',
        '.css': 'symbol-color',
        '.scss': 'symbol-color',
        '.html': 'symbol-misc',
        '.xml': 'symbol-misc',
        '.yml': 'settings-gear',
        '.yaml': 'settings-gear',
        '.sh': 'terminal',
        '.bat': 'terminal',
        '.png': 'file-media',
        '.jpg': 'file-media',
        '.jpeg': 'file-media',
        '.gif': 'file-media',
        '.svg': 'file-media',
        '.pdf': 'file-pdf',
        '.zip': 'file-zip',
        '.git': 'git-branch',
        '.gitignore': 'git-branch'
    };

    return iconMap[ext] || 'file';
}

export class FileItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly filePath: string,
        public readonly isDirectory: boolean,
        public readonly size: number,
        public readonly modified: Date,
        public readonly created: Date,
        showFileIcons: boolean = true
    ) {
        super(label, collapsibleState);

        this.resourceUri = vscode.Uri.file(filePath);
        this.id = filePath;
        this.contextValue = isDirectory ? 'directory' : 'file';

        // Set the icon (only when the setting is enabled)
        if (showFileIcons && this.contextValue !== 'header') {
            if (isDirectory) {
                this.iconPath = new vscode.ThemeIcon('folder');
            } else {
                // Set the icon for the file type
                this.iconPath = this.getFileIcon(label);
            }
        }

        // Set the tooltip
        const sizeText = isDirectory ? 'Directory' : formatFileSize(size);
        this.tooltip = `${label}\nType: ${sizeText}\nCreated: ${created.toLocaleString('en-US')}\nLast modified: ${modified.toLocaleString('en-US')}`;

        // Open files on click (except Markdown files)
        // Markdown files are opened in the Markdown Editor, so the vscode.open command is not set
        if (!isDirectory && !label.endsWith('.md')) {
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [this.resourceUri]
            };
        }
    }

    /**
     * Get the icon for the file type
     */
    private getFileIcon(fileName: string): vscode.ThemeIcon {
        return new vscode.ThemeIcon(getFileIconName(fileName));
    }
}
