import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { IFileOperationService } from '../interfaces/IFileOperationService';
import {
    FileOperationResult,
    FileStats,
    FilePermissions,
    OperationProgress,
    FileOperationError
} from '../types';
import { FileInfo } from '../utils/fileUtils';

/**
 * ファイル操作サービスの実装
 */
export class FileOperationService implements IFileOperationService {
    public onProgress?: (progress: OperationProgress) => void;

    /**
     * ファイルを作成
     */
    async createFile(filePath: string, content: string = ''): Promise<FileOperationResult> {
        try {
            // パスの検証
            if (!this.validatePath(filePath)) {
                throw FileOperationError.invalidPath(filePath);
            }

            // 既に存在するかチェック
            if (await this.exists(filePath)) {
                throw FileOperationError.alreadyExists(filePath);
            }

            // ディレクトリを作成（存在しない場合）
            const dir = path.dirname(filePath);
            if (!(await this.exists(dir))) {
                await fsp.mkdir(dir, { recursive: true });
            }

            // ファイルを作成
            await fsp.writeFile(filePath, content, 'utf8');

            return {
                success: true,
                message: `File created: ${path.basename(filePath)}`
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                message: `Failed to create file: ${error}`
            };
        }
    }

    /**
     * ディレクトリを作成
     */
    async createDirectory(dirPath: string): Promise<FileOperationResult> {
        try {
            // パスの検証
            if (!this.validatePath(dirPath)) {
                throw FileOperationError.invalidPath(dirPath);
            }

            // 既に存在するかチェック
            if (await this.exists(dirPath)) {
                throw FileOperationError.alreadyExists(dirPath);
            }

            // ディレクトリを作成
            await fsp.mkdir(dirPath, { recursive: true });

            return {
                success: true,
                message: `Folder created: ${path.basename(dirPath)}`
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                message: `Failed to create folder: ${error}`
            };
        }
    }

    /**
     * ファイルを読み込み
     */
    async readFile(filePath: string): Promise<string> {
        try {
            if (!await this.exists(filePath)) {
                throw FileOperationError.notFound(filePath);
            }
            return await fsp.readFile(filePath, 'utf8');
        } catch (error) {
            throw error;
        }
    }

    /**
     * ファイルに書き込み
     */
    async writeFile(filePath: string, content: string): Promise<FileOperationResult> {
        try {
            if (!this.validatePath(filePath)) {
                throw FileOperationError.invalidPath(filePath);
            }

            await fsp.writeFile(filePath, content, 'utf8');

            return {
                success: true,
                message: `File saved: ${path.basename(filePath)}`
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                message: `Failed to save file: ${error}`
            };
        }
    }

    /**
     * ファイルを削除
     */
    async deleteFile(filePath: string): Promise<FileOperationResult> {
        try {
            if (!await this.exists(filePath)) {
                throw FileOperationError.notFound(filePath);
            }

            await fsp.unlink(filePath);

            return {
                success: true,
                message: `File deleted: ${path.basename(filePath)}`
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                message: `Failed to delete file: ${error}`
            };
        }
    }

    /**
     * ディレクトリを削除
     */
    async deleteDirectory(dirPath: string, recursive: boolean = true): Promise<FileOperationResult> {
        try {
            if (!await this.exists(dirPath)) {
                throw FileOperationError.notFound(dirPath);
            }

            await fsp.rm(dirPath, { recursive, force: true });

            return {
                success: true,
                message: `Folder deleted: ${path.basename(dirPath)}`
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                message: `Failed to delete folder: ${error}`
            };
        }
    }

    /**
     * ファイル/フォルダをリネーム
     */
    async renameFile(oldPath: string, newPath: string): Promise<FileOperationResult> {
        try {
            if (!await this.exists(oldPath)) {
                throw FileOperationError.notFound(oldPath);
            }

            if (await this.exists(newPath)) {
                throw FileOperationError.alreadyExists(newPath);
            }

            await fsp.rename(oldPath, newPath);

            return {
                success: true,
                message: `Renamed to: ${path.basename(newPath)}`
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                message: `Failed to rename: ${error}`
            };
        }
    }

    /**
     * ファイルをコピー
     */
    async copyFile(sourcePath: string, destPath: string): Promise<FileOperationResult> {
        try {
            if (!await this.exists(sourcePath)) {
                throw FileOperationError.notFound(sourcePath);
            }

            const stats = await this.getStats(sourcePath);

            if (stats.isDirectory) {
                return await this.copyDirectory(sourcePath, destPath);
            } else {
                // ディレクトリを作成（存在しない場合）
                const dir = path.dirname(destPath);
                if (!(await this.exists(dir))) {
                    await fsp.mkdir(dir, { recursive: true });
                }

                await fsp.copyFile(sourcePath, destPath);
            }

            return {
                success: true,
                message: `Copied: ${path.basename(destPath)}`
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                message: `Failed to copy: ${error}`
            };
        }
    }

    /**
     * ディレクトリを再帰的にコピー
     */
    private async copyDirectory(sourcePath: string, destPath: string): Promise<FileOperationResult> {
        try {
            // コピー先ディレクトリを作成
            await fsp.mkdir(destPath, { recursive: true });

            const entries = await fsp.readdir(sourcePath, { withFileTypes: true });

            for (const entry of entries) {
                const srcPath = path.join(sourcePath, entry.name);
                const dstPath = path.join(destPath, entry.name);

                if (entry.isDirectory()) {
                    await this.copyDirectory(srcPath, dstPath);
                } else {
                    await fsp.copyFile(srcPath, dstPath);
                }
            }

            return {
                success: true,
                message: `Folder copied: ${path.basename(destPath)}`
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                message: `Failed to copy folder: ${error}`
            };
        }
    }

    /**
     * ファイルを移動
     */
    async moveFile(sourcePath: string, destPath: string): Promise<FileOperationResult> {
        try {
            if (!await this.exists(sourcePath)) {
                throw FileOperationError.notFound(sourcePath);
            }

            // ディレクトリを作成（存在しない場合）
            const dir = path.dirname(destPath);
            if (!(await this.exists(dir))) {
                await fsp.mkdir(dir, { recursive: true });
            }

            await fsp.rename(sourcePath, destPath);

            return {
                success: true,
                message: `Moved: ${path.basename(destPath)}`
            };
        } catch (error) {
            return {
                success: false,
                error: error as Error,
                message: `Failed to move: ${error}`
            };
        }
    }

    /**
     * 複数ファイルを削除
     */
    async deleteFiles(paths: string[]): Promise<FileOperationResult[]> {
        const results: FileOperationResult[] = [];
        const total = paths.length;

        for (let i = 0; i < paths.length; i++) {
            const filePath = paths[i];
            const stats = await this.getStats(filePath);

            if (this.onProgress) {
                this.onProgress({
                    total,
                    completed: i,
                    current: path.basename(filePath),
                    percentage: (i / total) * 100
                });
            }

            let result: FileOperationResult;
            if (stats.isDirectory) {
                result = await this.deleteDirectory(filePath);
            } else {
                result = await this.deleteFile(filePath);
            }

            results.push(result);
        }

        if (this.onProgress) {
            this.onProgress({
                total,
                completed: total,
                percentage: 100
            });
        }

        return results;
    }

    /**
     * 複数ファイルをコピー
     */
    async copyFiles(sources: string[], destDir: string): Promise<FileOperationResult[]> {
        const results: FileOperationResult[] = [];
        const total = sources.length;

        for (let i = 0; i < sources.length; i++) {
            const sourcePath = sources[i];
            const fileName = path.basename(sourcePath);
            const destPath = path.join(destDir, fileName);

            if (this.onProgress) {
                this.onProgress({
                    total,
                    completed: i,
                    current: fileName,
                    percentage: (i / total) * 100
                });
            }

            const result = await this.copyFile(sourcePath, destPath);
            results.push(result);
        }

        if (this.onProgress) {
            this.onProgress({
                total,
                completed: total,
                percentage: 100
            });
        }

        return results;
    }

    /**
     * 複数ファイルを移動
     */
    async moveFiles(sources: string[], destDir: string): Promise<FileOperationResult[]> {
        const results: FileOperationResult[] = [];
        const total = sources.length;

        for (let i = 0; i < sources.length; i++) {
            const sourcePath = sources[i];
            const fileName = path.basename(sourcePath);
            const destPath = path.join(destDir, fileName);

            if (this.onProgress) {
                this.onProgress({
                    total,
                    completed: i,
                    current: fileName,
                    percentage: (i / total) * 100
                });
            }

            const result = await this.moveFile(sourcePath, destPath);
            results.push(result);
        }

        if (this.onProgress) {
            this.onProgress({
                total,
                completed: total,
                percentage: 100
            });
        }

        return results;
    }

    /**
     * ファイル統計情報を取得
     */
    async getStats(filePath: string): Promise<FileStats> {
        try {
            const stats = await fsp.stat(filePath);
            const permissions = await this.getPermissions(filePath);

            return {
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                accessed: stats.atime,
                isDirectory: stats.isDirectory(),
                isFile: stats.isFile(),
                permissions
            };
        } catch (error) {
            throw FileOperationError.notFound(filePath);
        }
    }

    /**
     * ファイル権限を取得
     */
    private async getPermissions(filePath: string): Promise<FilePermissions> {
        try {
            await fsp.access(filePath, fs.constants.R_OK);
            const readable = true;

            let writable = false;
            try {
                await fsp.access(filePath, fs.constants.W_OK);
                writable = true;
            } catch {}

            let executable = false;
            try {
                await fsp.access(filePath, fs.constants.X_OK);
                executable = true;
            } catch {}

            return { readable, writable, executable };
        } catch {
            return { readable: false, writable: false, executable: false };
        }
    }

    /**
     * ファイル/フォルダが存在するかチェック
     */
    async exists(filePath: string): Promise<boolean> {
        try {
            await fsp.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * パスを検証
     */
    validatePath(filePath: string): boolean {
        try {
            // 絶対パスかチェック
            if (!path.isAbsolute(filePath)) {
                return false;
            }

            // 不正な文字をチェック
            const baseName = path.basename(filePath);
            return this.validateFileName(baseName);
        } catch {
            return false;
        }
    }

    /**
     * ファイル名を検証
     */
    validateFileName(name: string): boolean {
        // 空文字チェック
        if (!name || name.trim() === '') {
            return false;
        }

        // 不正な文字をチェック（Windows/Mac/Linux共通）
        const invalidChars = /[<>:"|?*\\/]/;
        if (invalidChars.test(name)) {
            return false;
        }

        // 予約語チェック（Windows）
        const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
        const upperName = name.toUpperCase();
        if (reservedNames.includes(upperName)) {
            return false;
        }

        return true;
    }

    /**
     * ファイル一覧を取得
     */
    async getFileList(dirPath: string): Promise<FileInfo[]> {
        const files: FileInfo[] = [];

        try {
            const entries = await fsp.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                const stat = await fsp.stat(fullPath);

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
}
