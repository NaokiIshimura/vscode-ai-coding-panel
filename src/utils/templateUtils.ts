import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { getGlobalTemplatesDir } from './globalTemplatePaths';

/**
 * テンプレート種別
 *
 * コピー対象のファイル名（TEMPLATE_FILE_NAMES）はここから導出する。
 * 配列と型を別々に管理すると同期漏れが起きるため（v1.1.20のquick_start漏れ）。
 */
export const TEMPLATE_TYPES = ['task', 'spec', 'prompt', 'quick_start'] as const;

// テンプレート種別
export type TemplateType = typeof TEMPLATE_TYPES[number];

/** 同梱テンプレートのファイル名一覧（TEMPLATE_TYPESと同順） */
export const TEMPLATE_FILE_NAMES: readonly string[] = TEMPLATE_TYPES.map(type => `${type}.md`);

/** ワークスペース側のテンプレート配置先（ワークスペースルートからの相対） */
export const WORKSPACE_TEMPLATES_RELATIVE_PATH = path.join('.vscode', 'ai-coding-panel', 'templates');

// ファイルが存在するかチェックするヘルパー関数
async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fsPromises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * テンプレートの探索先を優先順に並べて返す
 *
 * 1. ワークスペース
 * 2. グローバル
 * 3. 拡張機能の同梱分
 */
function buildCandidatePaths(context: vscode.ExtensionContext, templateFileName: string): string[] {
    const candidates: string[] = [];

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
        candidates.push(path.join(workspaceRoot, WORKSPACE_TEMPLATES_RELATIVE_PATH, templateFileName));
    }

    const globalTemplatesDir = getGlobalTemplatesDir(context);
    if (globalTemplatesDir) {
        candidates.push(path.join(globalTemplatesDir, templateFileName));
    }

    candidates.push(path.join(context.extensionPath, 'templates', templateFileName));

    return candidates;
}

// テンプレートを読み込んで変数を置換する関数
export async function loadTemplate(
    context: vscode.ExtensionContext,
    variables: { [key: string]: string },
    templateType: TemplateType = 'prompt'
): Promise<string> {
    const templateFileName = `${templateType}.md`;
    const candidates = buildCandidatePaths(context, templateFileName);

    let templatePath: string | undefined;
    for (const candidate of candidates) {
        if (await fileExists(candidate)) {
            templatePath = candidate;
            break;
        }
    }

    if (!templatePath) {
        // 見つからなかった場合は最終候補（同梱分）のパスをエラーに含める
        throw new Error(`Template file not found: ${candidates[candidates.length - 1]}`);
    }

    let content = await fsPromises.readFile(templatePath, 'utf8');

    // 変数を置換
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        content = content.replace(regex, value);
    }

    return content;
}
