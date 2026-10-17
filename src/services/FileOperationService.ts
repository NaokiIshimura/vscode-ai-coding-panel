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
 * File operation service implementation
 */
export class FileOperationService implements IFileOperationService {
    public onProgress?: (progress: OperationProgress) => void;

    /**
     * Create a file
     */
    async createFile(filePath: string, content: string = ''): Promise<FileOperationResult> {
        try {
            // Validate the path
            if (!this.validatePath(filePath)) {
                throw FileOperationError.invalidPath(filePath);
            }

            // Check whether it already exists
            if (await this.exists(filePath)) {
                throw FileOperationError.alreadyExists(filePath);
            }

            // Create the directory (if it does not exist)
            const dir = path.dirname(filePath);
            if (!(await this.exists(dir))) {
                await fsp.mkdir(dir, { recursive: true });
            }

            // Create the file
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
     * Create a directory
     */
    async createDirectory(dirPath: string): Promise<FileOperationResult> {
        try {
            // Validate the path
            if (!this.validatePath(dirPath)) {
                throw FileOperationError.invalidPath(dirPath);
            }

            // Check whether it already exists
            if (await this.exists(dirPath)) {
                throw FileOperationError.alreadyExists(dirPath);
            }

            // Create the directory
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
     * Read a file
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
     * Write to a file
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
     * Delete a file
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
     * Delete a directory
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
     * Rename a file/folder
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
     * Copy a file
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
                // Create the directory (if it does not exist)
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
     * Copy a directory recursively
     */
    private async copyDirectory(sourcePath: string, destPath: string): Promise<FileOperationResult> {
        try {
            // Create the destination directory
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
     * Move a file
     */
    async moveFile(sourcePath: string, destPath: string): Promise<FileOperationResult> {
        try {
            if (!await this.exists(sourcePath)) {
                throw FileOperationError.notFound(sourcePath);
            }

            // Create the directory (if it does not exist)
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
     * Delete multiple files
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
     * Copy multiple files
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
     * Move multiple files
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
     * Get file statistics
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
     * Get file permissions
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
     * Check whether a file/folder exists
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
     * Validate a path
     */
    validatePath(filePath: string): boolean {
        try {
            // Check that it is an absolute path
            if (!path.isAbsolute(filePath)) {
                return false;
            }

            // Check for invalid characters
            const baseName = path.basename(filePath);
            return this.validateFileName(baseName);
        } catch {
            return false;
        }
    }

    /**
     * Validate a file name
     */
    validateFileName(name: string): boolean {
        // Check for an empty string
        if (!name || name.trim() === '') {
            return false;
        }

        // Check for invalid characters (common to Windows/Mac/Linux)
        const invalidChars = /[<>:"|?*\\/]/;
        if (invalidChars.test(name)) {
            return false;
        }

        // Check for reserved names (Windows)
        const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
        const upperName = name.toUpperCase();
        if (reservedNames.includes(upperName)) {
            return false;
        }

        return true;
    }

    /**
     * Get the file list
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

            // Sort directories first, then files, by name
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
