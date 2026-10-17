/**
 * Type definitions and error classes
 */

// File operation result
export interface FileOperationResult {
    success: boolean;
    message?: string;
    error?: Error;
}

// File statistics
export interface FileStats {
    size: number;
    created: Date;
    modified: Date;
    accessed: Date;
    isDirectory: boolean;
    isFile: boolean;
    permissions?: FilePermissions;
}

// File permissions
export interface FilePermissions {
    readable: boolean;
    writable: boolean;
    executable: boolean;
}

// Display options
export interface DisplayOptions {
    sortBy: SortField;
    sortOrder: SortOrder;
    showHidden: boolean;
    viewMode: ViewMode;
}

export enum SortField {
    Name = 'name',
    Size = 'size',
    Modified = 'modified',
    Created = 'created',
    Type = 'type'
}

export enum SortOrder {
    Ascending = 'ascending',
    Descending = 'descending'
}

export enum ViewMode {
    List = 'list',
    Tree = 'tree'
}

// Operation progress
export interface OperationProgress {
    total: number;
    completed: number;
    current?: string;
    percentage: number;
}

// Error types
export enum FileOperationErrorType {
    NotFound = 'NOT_FOUND',
    PermissionDenied = 'PERMISSION_DENIED',
    AlreadyExists = 'ALREADY_EXISTS',
    InvalidPath = 'INVALID_PATH',
    InvalidName = 'INVALID_NAME',
    OperationFailed = 'OPERATION_FAILED',
    Unknown = 'UNKNOWN'
}

// Custom error class
export class FileOperationError extends Error {
    constructor(
        public type: FileOperationErrorType,
        message: string,
        public originalError?: Error
    ) {
        super(message);
        this.name = 'FileOperationError';
    }

    static notFound(path: string): FileOperationError {
        return new FileOperationError(
            FileOperationErrorType.NotFound,
            `File or folder not found: ${path}`
        );
    }

    static permissionDenied(path: string): FileOperationError {
        return new FileOperationError(
            FileOperationErrorType.PermissionDenied,
            `Permission denied: ${path}`
        );
    }

    static alreadyExists(path: string): FileOperationError {
        return new FileOperationError(
            FileOperationErrorType.AlreadyExists,
            `File or folder already exists: ${path}`
        );
    }

    static invalidPath(path: string): FileOperationError {
        return new FileOperationError(
            FileOperationErrorType.InvalidPath,
            `Invalid path: ${path}`
        );
    }

    static invalidName(name: string): FileOperationError {
        return new FileOperationError(
            FileOperationErrorType.InvalidName,
            `Invalid file name: ${name}`
        );
    }
}
