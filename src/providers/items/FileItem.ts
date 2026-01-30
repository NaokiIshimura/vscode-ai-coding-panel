import * as vscode from 'vscode';
import * as path from 'path';
import { formatFileSize } from '../../utils/fileUtils';

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

        // アイコンを設定（設定が有効な場合のみ）
        if (showFileIcons && this.contextValue !== 'header') {
            if (isDirectory) {
                this.iconPath = new vscode.ThemeIcon('folder');
            } else {
                // ファイル種類に応じたアイコンを設定
                this.iconPath = this.getFileIcon(label);
            }
        }

        // ツールチップを設定
        const sizeText = isDirectory ? 'Directory' : formatFileSize(size);
        this.tooltip = `${label}\nType: ${sizeText}\nCreated: ${created.toLocaleString('en-US')}\nLast modified: ${modified.toLocaleString('en-US')}`;

        // ファイルの場合はクリックで開く（Markdownファイル以外）
        // Markdownファイルは Markdown Editor で開くため、vscode.open コマンドを設定しない
        if (!isDirectory && !label.endsWith('.md')) {
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [this.resourceUri]
            };
        }
    }

    /**
     * ファイル種類に応じたアイコンを取得
     */
    private getFileIcon(fileName: string): vscode.ThemeIcon {
        const ext = path.extname(fileName).toLowerCase();

        // Markdownファイルの場合、Editor View対象ファイルかどうかで分ける
        if (ext === '.md') {
            const editorTargetPattern = /(?:TASK|PROMPT|SPEC)\.md$/i;
            // Editor View対象ファイル（TASK/PROMPT/SPEC）はeditアイコン
            if (editorTargetPattern.test(fileName)) {
                return new vscode.ThemeIcon('edit');
            }
            // それ以外はmarkdownアイコン（通常のエディタで開く）
            return new vscode.ThemeIcon('markdown');
        }

        // 拡張子に応じてアイコンを選択
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

        return new vscode.ThemeIcon(iconMap[ext] || 'file');
    }
}
