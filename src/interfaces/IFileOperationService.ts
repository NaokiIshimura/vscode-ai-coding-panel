import { FileOperationResult, FileStats, OperationProgress } from '../types';

/**
 * Interface for the file operation service
 */
export interface IFileOperationService {
    // Basic CRUD operations
    createFile(path: string, content?: string): Promise<FileOperationResult>;
    createDirectory(path: string): Promise<FileOperationResult>;
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<FileOperationResult>;
    deleteFile(path: string): Promise<FileOperationResult>;
    deleteDirectory(path: string, recursive?: boolean): Promise<FileOperationResult>;
    renameFile(oldPath: string, newPath: string): Promise<FileOperationResult>;
    copyFile(sourcePath: string, destPath: string): Promise<FileOperationResult>;
    moveFile(sourcePath: string, destPath: string): Promise<FileOperationResult>;

    // Batch operations
    deleteFiles(paths: string[]): Promise<FileOperationResult[]>;
    copyFiles(sources: string[], destDir: string): Promise<FileOperationResult[]>;
    moveFiles(sources: string[], destDir: string): Promise<FileOperationResult[]>;

    // File information
    getStats(path: string): Promise<FileStats>;
    exists(path: string): Promise<boolean>;

    // Validation
    validatePath(path: string): boolean;
    validateFileName(name: string): boolean;

    // Event emitter for progress reporting
    onProgress?: (progress: OperationProgress) => void;
}
