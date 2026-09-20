import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { TEMPLATE_FILE_NAMES, WORKSPACE_TEMPLATES_RELATIVE_PATH } from './templateUtils';
import { getGlobalTemplatesDir, openGlobalTemplatesRoot } from './globalTemplatePaths';

// ファイルが存在するかチェックするヘルパー関数
async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fsPromises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// settings.jsonを設定するヘルパー関数
export async function setupSettingsJson(workspaceRoot: string): Promise<void> {
    const vscodeDir = path.join(workspaceRoot, '.vscode');
    const settingsPath = path.join(vscodeDir, 'settings.json');

    try {
        // .vscodeディレクトリを作成（存在しない場合）
        if (!await fileExists(vscodeDir)) {
            await fsPromises.mkdir(vscodeDir, { recursive: true });
        }

        let settings: any = {};

        // 既存のsettings.jsonを読み込み
        if (await fileExists(settingsPath)) {
            try {
                const content = await fsPromises.readFile(settingsPath, 'utf8');
                settings = JSON.parse(content);
            } catch (error) {
                console.error('Failed to parse settings.json:', error);
            }
        }

        // デフォルト設定を追加
        if (!settings.hasOwnProperty('aiCodingSidebar.plans.defaultRelativePath')) {
            settings['aiCodingSidebar.plans.defaultRelativePath'] = '.claude';
        }

        // settings.jsonに書き込み
        const settingsContent = JSON.stringify(settings, null, 2);
        await fsPromises.writeFile(settingsPath, settingsContent, 'utf8');

        // ファイルを開く
        const document = await vscode.workspace.openTextDocument(settingsPath);
        await vscode.window.showTextDocument(document);

        vscode.window.showInformationMessage('Created/updated settings.json');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create settings.json: ${error}`);
    }
}

/**
 * 同梱テンプレートを指定ディレクトリへコピーする
 * 既に存在するファイルは上書きしない
 *
 * コピー対象は templateUtils の TEMPLATE_FILE_NAMES から導出しているため、
 * テンプレート種別を追加した際のコピー漏れが起きない
 */
export async function copyBundledTemplates(
    context: vscode.ExtensionContext,
    destinationDir: string
): Promise<void> {
    if (!await fileExists(destinationDir)) {
        await fsPromises.mkdir(destinationDir, { recursive: true });
    }

    for (const templateFile of TEMPLATE_FILE_NAMES) {
        const templatePath = path.join(destinationDir, templateFile);
        if (await fileExists(templatePath)) {
            continue;
        }

        // 拡張機能内のtemplatesから読み込む
        const extensionTemplatePath = path.join(context.extensionPath, 'templates', templateFile);
        if (!await fileExists(extensionTemplatePath)) {
            throw new Error(`Template file not found: ${extensionTemplatePath}`);
        }
        const templateContent = await fsPromises.readFile(extensionTemplatePath, 'utf8');
        await fsPromises.writeFile(templatePath, templateContent, 'utf8');
    }
}

/**
 * コピーしたテンプレートの先頭ファイルを開く
 *
 * ワークスペース側のみで使う。グローバル側は特定のファイルを勝手に開かず、
 * OSのファイラーでディレクトリを表示するだけにしている
 */
async function openFirstTemplate(templatesDir: string): Promise<void> {
    const firstTemplatePath = path.join(templatesDir, TEMPLATE_FILE_NAMES[0]);
    const document = await vscode.workspace.openTextDocument(firstTemplatePath);
    await vscode.window.showTextDocument(document);
}

// テンプレートを設定するヘルパー関数
export async function setupTemplate(context: vscode.ExtensionContext, workspaceRoot: string): Promise<void> {
    const templatesDir = path.join(workspaceRoot, WORKSPACE_TEMPLATES_RELATIVE_PATH);

    try {
        await copyBundledTemplates(context, templatesDir);
        await openFirstTemplate(templatesDir);

        // templatesフォルダをエクスプローラーで表示
        vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(templatesDir));

        vscode.window.showInformationMessage(`Template files created: ${TEMPLATE_FILE_NAMES.join(', ')}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create template files: ${error}`);
    }
}

/**
 * グローバルのテンプレートを設定するヘルパー関数
 *
 * ワークスペースが開かれていなくても実行できる。
 * 4ファイルのうちどれを編集したいかは利用者によるため、
 * 特定のファイルをエディタで開かずグローバル配置先を新しいウィンドウで開く
 */
export async function setupGlobalTemplate(context: vscode.ExtensionContext): Promise<void> {
    const templatesDir = getGlobalTemplatesDir(context);
    if (!templatesDir) {
        vscode.window.showErrorMessage('Global template directory is not available');
        return;
    }

    try {
        await copyBundledTemplates(context, templatesDir);

        // 新しいウィンドウへフォーカスが移るため、通知を先に出す
        vscode.window.showInformationMessage(`Global template files are ready: ${templatesDir}`);

        await openGlobalTemplatesRoot(context);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create global template files: ${error}`);
    }
}

// .claudeフォルダを設定するヘルパー関数
export async function setupClaudeFolder(workspaceRoot: string): Promise<void> {
    try {
        // .claudeフォルダを作成（存在しない場合）
        const claudeDir = path.join(workspaceRoot, '.claude');
        if (!await fileExists(claudeDir)) {
            await fsPromises.mkdir(claudeDir, { recursive: true });
        }

        // settings.jsonも更新
        await setupSettingsJson(workspaceRoot);

        // 設定を適用
        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
        await config.update('plans.defaultRelativePath', '.claude', vscode.ConfigurationTarget.Workspace);

        vscode.window.showInformationMessage('Created .claude folder and updated settings');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to configure .claude folder: ${error}`);
    }
}
