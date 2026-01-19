/**
 * 型定義とエラークラス
 */

// ファイル操作の結果
export interface FileOperationResult {
    success: boolean;
    message?: string;
    error?: Error;
}

// ファイル統計情報
export interface FileStats {
    size: number;
    created: Date;
    modified: Date;
    accessed: Date;
    isDirectory: boolean;
    isFile: boolean;
    permissions?: FilePermissions;
}

// ファイル権限
export interface FilePermissions {
    readable: boolean;
    writable: boolean;
    executable: boolean;
}

// 表示オプション
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

// 操作の進捗状況
export interface OperationProgress {
    total: number;
    completed: number;
    current?: string;
    percentage: number;
}

// エラータイプ
export enum FileOperationErrorType {
    NotFound = 'NOT_FOUND',
    PermissionDenied = 'PERMISSION_DENIED',
    AlreadyExists = 'ALREADY_EXISTS',
    InvalidPath = 'INVALID_PATH',
    InvalidName = 'INVALID_NAME',
    OperationFailed = 'OPERATION_FAILED',
    Unknown = 'UNKNOWN'
}

// カスタムエラークラス
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
            `ファイルまたはフォルダが見つかりません: ${path}`
        );
    }

    static permissionDenied(path: string): FileOperationError {
        return new FileOperationError(
            FileOperationErrorType.PermissionDenied,
            `アクセスが拒否されました: ${path}`
        );
    }

    static alreadyExists(path: string): FileOperationError {
        return new FileOperationError(
            FileOperationErrorType.AlreadyExists,
            `ファイルまたはフォルダは既に存在します: ${path}`
        );
    }

    static invalidPath(path: string): FileOperationError {
        return new FileOperationError(
            FileOperationErrorType.InvalidPath,
            `無効なパスです: ${path}`
        );
    }

    static invalidName(name: string): FileOperationError {
        return new FileOperationError(
            FileOperationErrorType.InvalidName,
            `無効なファイル名です: ${name}`
        );
    }
}
