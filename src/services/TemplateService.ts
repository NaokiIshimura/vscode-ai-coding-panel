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
     * @returns 追記後の内容
     */
    appendSendHistoryLine(content: string, commandType: SendCommandType, dateTime: string): string {
        const historyLine = `- ${SEND_HISTORY_LABELS[commandType]}: ${dateTime}`;
        const lines = content.split('\n');
        // 見出しは行全体の完全一致で判定する（本文中の類似表記へ追記しないため）
        const headingIndex = lines.findIndex(line => line.trim() === SENT_HISTORY_HEADING);

        if (headingIndex === -1) {
            // セクションが無い場合は末尾に新規作成する
            const body = content.replace(/\s+$/, '');
            const prefix = body ? `${body}\n\n` : '';
            return `${prefix}${SENT_HISTORY_HEADING}\n${historyLine}\n`;
        }

        // セクションの終端（次の見出し、または水平線）を探す
        let endIndex = lines.length;
        for (let i = headingIndex + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (/^#{1,6}\s/.test(line) || line === '---') {
                endIndex = i;
                break;
            }
        }

        // 末尾の空行を飛ばし、セクション内の最後の内容行の直後へ挿入する
        let insertIndex = endIndex;
        while (insertIndex > headingIndex + 1 && lines[insertIndex - 1].trim() === '') {
            insertIndex--;
        }

        lines.splice(insertIndex, 0, historyLine);
        return lines.join('\n');
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
