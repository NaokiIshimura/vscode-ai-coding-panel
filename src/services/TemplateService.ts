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
     */
    formatDateTime(): string {
        const now = new Date();
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
}
