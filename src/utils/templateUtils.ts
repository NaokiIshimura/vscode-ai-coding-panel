import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import * as path from 'path';

// テンプレート種別
export type TemplateType = 'prompt' | 'task' | 'spec';

// ファイルが存在するかチェックするヘルパー関数
async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fsPromises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// テンプレートを読み込んで変数を置換する関数
export async function loadTemplate(
    context: vscode.ExtensionContext,
    variables: { [key: string]: string },
    templateType: TemplateType = 'prompt'
): Promise<string> {
    let templatePath: string;
    const templateFileName = `${templateType}.md`;

    // 1. ワークスペースの.vscode/ai-coding-panel/templates/[templateType].mdを優先
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
        const vscodeTemplatePath = path.join(workspaceRoot, '.vscode', 'ai-coding-panel', 'templates', templateFileName);
        if (await fileExists(vscodeTemplatePath)) {
            templatePath = vscodeTemplatePath;
        } else {
            // 2. 拡張機能内の[templateType].mdをフォールバック
            templatePath = path.join(context.extensionPath, 'templates', templateFileName);
        }
    } else {
        templatePath = path.join(context.extensionPath, 'templates', templateFileName);
    }

    if (!await fileExists(templatePath)) {
        throw new Error(`Template file not found: ${templatePath}`);
    }

    let content = await fsPromises.readFile(templatePath, 'utf8');

    // 変数を置換
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        content = content.replace(regex, value);
    }

    return content;
}
