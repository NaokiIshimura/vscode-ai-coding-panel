import * as fs from 'fs';
import * as path from 'path';

// ファイル情報の型定義
export interface FileInfo {
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    modified: Date;
    created: Date;
}

// ファイルサイズをフォーマットする関数
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * ファイル一覧を取得する関数
 * @deprecated Use FileOperationService.getFileList() instead
 */
export async function getFileList(dirPath: string): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const stat = fs.statSync(fullPath);

            files.push({
                name: entry.name,
                path: fullPath,
                isDirectory: entry.isDirectory(),
                size: entry.isFile() ? stat.size : 0,
                modified: stat.mtime,
                created: stat.birthtime
            });
        }

        // ディレクトリを先に、その後ファイルを名前順でソート
        files.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) { return -1; }
            if (!a.isDirectory && b.isDirectory) { return 1; }
            return a.name.localeCompare(b.name);
        });

    } catch (error) {
        throw new Error(`Failed to read directory: ${error}`);
    }

    return files;
}
