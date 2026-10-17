import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';

/**
 * テンプレート変数
 */
export interface TemplateVariables {
    datetime: string;
    filename: string;
    timestamp: string;
    filepath: string;
    dirpath: string;
}

/**
 * Editor Viewから送信するコマンドの種別
 */
export type SendCommandType = 'run' | 'plan' | 'spec';

/**
 * 送信履歴セクションの見出し
 */
export const SENT_HISTORY_HEADING = '## sent history';

/**
 * 送信履歴行のラベル（幅を揃えて日時の開始位置を合わせる）
 */
const SEND_HISTORY_LABELS: Record<SendCommandType, string> = {
    run: 'run ',
    plan: 'plan',
    spec: 'spec'
};

/**
 * 送信履歴行で日時とresumeコマンドを区切る文字列
 */
const SEND_HISTORY_SEPARATOR = '|';

/**
 * セッション情報を記録するファイル名（タスクディレクトリ直下に置く）
 */
export const SESSION_METADATA_FILE_NAME = 'metadata.md';

/**
 * セッション情報ファイルの見出し
 */
const SESSION_METADATA_TITLE = '# metadata';

/**
 * セッション情報ファイルのセッション一覧セクションの見出し
 */
export const SESSION_METADATA_HEADING = '## sessions';

/**
 * セッション情報の1行
 * 例: - 2026/10/17 18:54:39 | run  | 2026_1017_1854_39_PROMPT.md | claude --resume <uuid>
 */
const SESSION_METADATA_LINE_PATTERN = /^-\s+[^|]+\|\s*(run|plan|spec)\s*\|\s*([^|]+?)\s*\|\s*\S+\s+--resume\s+(\S+)\s*$/;

/**
 * セッションID（Claude CodeのUUID）
 */
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * セッションIDとして受け付ける形式（UUID）かどうかを判定する
 */
export function isValidSessionId(sessionId: string): boolean {
    return SESSION_ID_PATTERN.test(sessionId);
}

/**
 * セッション情報ファイルから読み取った再開対象のセッション
 */
export interface SessionMetadataEntry {
    /** 送信したコマンドの種別 */
    commandType: SendCommandType;
    /** 送信したファイル名（セッション情報ファイルと同じディレクトリ） */
    fileName: string;
    /** 再開するセッションのID */
    sessionId: string;
}

/**
 * 見出しで始まるセクションの範囲を探す
 *
 * 見出しは行全体の完全一致で判定し、次の見出しまたは水平線（---）の手前までをセクションとみなす
 * @returns 見出しの行番号と、セクション終端（含まない）の行番号
 */
function findSectionRange(lines: string[], heading: string): { headingIndex: number; endIndex: number } | undefined {
    const headingIndex = lines.findIndex(line => line.trim() === heading);
    if (headingIndex === -1) {
        return undefined;
    }

    let endIndex = lines.length;
    for (let i = headingIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/^#{1,6}\s/.test(line) || line === '---') {
            endIndex = i;
            break;
        }
    }

    return { headingIndex, endIndex };
}

/**
 * セクション内の最後の内容行の直後へ1行挿入する
 */
function insertLineIntoSection(lines: string[], range: { headingIndex: number; endIndex: number }, line: string): string {
    // 末尾の空行を飛ばし、セクション内の最後の内容行の直後へ挿入する
    let insertIndex = range.endIndex;
    while (insertIndex > range.headingIndex + 1 && lines[insertIndex - 1].trim() === '') {
        insertIndex--;
    }

    lines.splice(insertIndex, 0, line);
    return lines.join('\n');
}

/**
 * テンプレート生成サービス
 */
export class TemplateService {
    constructor(private context?: vscode.ExtensionContext) {}

    /**
     * 日本時間のタイムスタンプを生成（YYYY_MMDD_HHMM_SS形式）
     */
    generateTimestamp(): string {
        const now = new Date();
        const year = String(now.getFullYear());
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');

        return `${year}_${month}${day}_${hour}${minute}_${second}`;
    }

    /**
     * 日付時刻を文字列として生成（YYYY/MM/DD HH:MM:SS形式）
     * ファイル名用のタイムスタンプと同一時刻を使いたい場合は日時を渡す
     */
    formatDateTime(date?: Date): string {
        const now = date ?? new Date();
        const year = String(now.getFullYear());
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');

        return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
    }

    /**
     * テンプレート変数を生成
     */
    generateTemplateVariables(
        targetPath: string,
        fileName: string,
        timestamp: string
    ): TemplateVariables {
        const filePath = path.join(targetPath, fileName);
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const relativeFilePath = workspaceRoot ? path.relative(workspaceRoot, filePath) : filePath;
        const relativeDirPath = workspaceRoot ? path.relative(workspaceRoot, targetPath) : targetPath;

        return {
            datetime: this.formatDateTime(),
            filename: fileName,
            timestamp: timestamp,
            filepath: relativeFilePath,
            dirpath: relativeDirPath
        };
    }

    /**
     * テンプレートをロードして変数を置換
     */
    async loadTemplate(variables: TemplateVariables, templateType: 'prompt' | 'task' | 'spec'): Promise<string> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceRoot) {
            return this.getDefaultTemplate(variables, templateType);
        }

        // ワークスペース内のテンプレートファイルパス
        const templateFileName = `${templateType}.md`;
        const workspaceTemplatePath = path.join(workspaceRoot, '.vscode', 'templates', templateFileName);

        // ワークスペース内にテンプレートが存在する場合はそれを使用
        try {
            await fsPromises.access(workspaceTemplatePath);
            const templateContent = await fsPromises.readFile(workspaceTemplatePath, 'utf8');
            return this.replaceVariables(templateContent, variables);
        } catch (error) {
            // ファイルが存在しない場合は次のステップへ
        }

        // 拡張機能のテンプレートフォルダ内のテンプレートを使用
        if (this.context) {
            const extensionTemplatePath = path.join(this.context.extensionPath, 'templates', templateFileName);

            try {
                await fsPromises.access(extensionTemplatePath);
                const templateContent = await fsPromises.readFile(extensionTemplatePath, 'utf8');
                return this.replaceVariables(templateContent, variables);
            } catch (error) {
                // ファイルが存在しない場合は次のステップへ
            }
        }

        // テンプレートが見つからない場合はデフォルトテンプレートを使用
        return this.getDefaultTemplate(variables, templateType);
    }

    /**
     * デフォルトテンプレートを取得
     */
    private getDefaultTemplate(variables: TemplateVariables, templateType: string): string {
        const header = `---
working dir: ${variables.dirpath}
${templateType} file: ${variables.filename}
datetime   : ${variables.datetime}
---

`;

        return header;
    }

    /**
     * 任意の文字列に対してテンプレート変数を置換する
     * プロンプトテンプレートの挿入など、テンプレートファイル以外の内容にも使う
     */
    renderVariables(content: string, variables: TemplateVariables): string {
        return this.replaceVariables(content, variables);
    }

    /**
     * テンプレート内の変数を置換
     */
    private replaceVariables(template: string, variables: TemplateVariables): string {
        return template
            .replace(/\{\{datetime\}\}/g, variables.datetime)
            .replace(/\{\{filename\}\}/g, variables.filename)
            .replace(/\{\{timestamp\}\}/g, variables.timestamp)
            .replace(/\{\{filepath\}\}/g, variables.filepath)
            .replace(/\{\{dirpath\}\}/g, variables.dirpath);
    }

    /**
     * PROMPTファイル用のファイル名を生成
     */
    generatePromptFileName(): string {
        const timestamp = this.generateTimestamp();
        return `${timestamp}_PROMPT.md`;
    }

    /**
     * TASKファイル用のファイル名を生成
     */
    generateTaskFileName(): string {
        const timestamp = this.generateTimestamp();
        return `${timestamp}_TASK.md`;
    }

    /**
     * SPECファイル用のファイル名を生成
     */
    generateSpecFileName(): string {
        const timestamp = this.generateTimestamp();
        return `${timestamp}_SPEC.md`;
    }

    /**
     * QUICK_STARTファイル用のファイル名を生成
     */
    generateQuickStartFileName(): string {
        const timestamp = this.generateTimestamp();
        return `${timestamp}_QUICK_START.md`;
    }

    /**
     * 指定ディレクトリ配下にタイムスタンプ名のディレクトリを作成する際、
     * 同名ディレクトリが既に存在する場合は連番サフィックス（_2, _3, ...）を付与して
     * 衝突しないディレクトリパスを生成する
     */
    async generateUniqueDirectoryPath(parentPath: string): Promise<{ path: string; name: string }> {
        const baseName = this.generateTimestamp();
        let name = baseName;
        let dirPath = path.join(parentPath, name);
        let suffix = 2;

        while (await this.pathExists(dirPath)) {
            name = `${baseName}_${suffix}`;
            dirPath = path.join(parentPath, name);
            suffix++;
        }

        return { path: dirPath, name };
    }

    /**
     * Spec / Plan / Run の送信履歴行を内容へ追記する
     *
     * 末尾の「## sent history」セクションへ1行追加する。
     * セクションが無い場合は末尾に新規作成する。
     *
     * @param content 追記対象の内容
     * @param commandType 送信したコマンドの種別
     * @param dateTime 記録する日時（formatDateTime()の戻り値）
     * @param resumeCommand 送信したセッションを再開するコマンド（例: claude --resume <uuid>）
     * @returns 追記後の内容
     */
    appendSendHistoryLine(
        content: string,
        commandType: SendCommandType,
        dateTime: string,
        resumeCommand?: string
    ): string {
        const suffix = resumeCommand ? ` ${SEND_HISTORY_SEPARATOR} ${resumeCommand}` : '';
        const historyLine = `- ${SEND_HISTORY_LABELS[commandType]}: ${dateTime}${suffix}`;
        const lines = content.split('\n');
        // 見出しは行全体の完全一致で判定する（本文中の類似表記へ追記しないため）
        const range = findSectionRange(lines, SENT_HISTORY_HEADING);

        if (!range) {
            // セクションが無い場合は末尾に新規作成する
            const body = content.replace(/\s+$/, '');
            const prefix = body ? `${body}\n\n` : '';
            return `${prefix}${SENT_HISTORY_HEADING}\n${historyLine}\n`;
        }

        return insertLineIntoSection(lines, range, historyLine);
    }

    /**
     * セッション情報ファイル（metadata.md）の内容へセッションを1行追記する
     *
     * 「## sessions」セクションの末尾へ追加する。内容が空の場合は見出しごと作成し、
     * セクションが無い場合は末尾に新規作成する。
     *
     * @param content 追記対象の内容（ファイルが無い場合は空文字）
     * @param commandType 送信したコマンドの種別
     * @param dateTime 記録する日時（formatDateTime()の戻り値）
     * @param fileName 送信したファイル名
     * @param resumeCommand 送信したセッションを再開するコマンド（例: claude --resume <uuid>）
     * @returns 追記後の内容
     */
    appendSessionMetadataLine(
        content: string,
        commandType: SendCommandType,
        dateTime: string,
        fileName: string,
        resumeCommand: string
    ): string {
        const sep = SEND_HISTORY_SEPARATOR;
        const line = `- ${dateTime} ${sep} ${SEND_HISTORY_LABELS[commandType]} ${sep} ${fileName} ${sep} ${resumeCommand}`;
        const body = content.replace(/\s+$/, '');

        if (!body) {
            return `${SESSION_METADATA_TITLE}\n\n${SESSION_METADATA_HEADING}\n${line}\n`;
        }

        const lines = content.split('\n');
        const range = findSectionRange(lines, SESSION_METADATA_HEADING);
        if (!range) {
            return `${body}\n\n${SESSION_METADATA_HEADING}\n${line}\n`;
        }

        return insertLineIntoSection(lines, range, line);
    }

    /**
     * セッション情報ファイル（metadata.md）の内容から最新のセッションを取得する
     *
     * 「## sessions」セクションの最後の有効な行を返す。
     * ファイルは手で編集できるため、セッションIDはUUID形式のもののみ受け付ける
     * （記録された文字列をそのままシェルへ送らないため）
     *
     * @param content セッション情報ファイルの内容
     * @returns 最新のセッション。有効な行が無い場合はundefined
     */
    findLatestSessionMetadata(content: string): SessionMetadataEntry | undefined {
        const lines = content.split('\n');
        const range = findSectionRange(lines, SESSION_METADATA_HEADING);
        if (!range) {
            return undefined;
        }

        for (let i = range.endIndex - 1; i > range.headingIndex; i--) {
            const match = SESSION_METADATA_LINE_PATTERN.exec(lines[i].trim());
            if (match && isValidSessionId(match[3])) {
                return {
                    commandType: match[1] as SendCommandType,
                    fileName: match[2],
                    sessionId: match[3]
                };
            }
        }

        return undefined;
    }

    /**
     * パスが存在するかどうかを確認
     */
    private async pathExists(targetPath: string): Promise<boolean> {
        try {
            await fsPromises.access(targetPath);
            return true;
        } catch {
            return false;
        }
    }
}
