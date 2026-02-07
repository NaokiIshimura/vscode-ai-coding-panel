import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import * as path from 'path';

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

// テンプレートを設定するヘルパー関数
export async function setupTemplate(context: vscode.ExtensionContext, workspaceRoot: string): Promise<void> {
    const templatesDir = path.join(workspaceRoot, '.vscode', 'ai-coding-panel', 'templates');
    const templateFiles = ['task.md', 'spec.md', 'prompt.md'];

    try {
        // .vscode/ai-coding-panel/templatesディレクトリを作成（存在しない場合）
        if (!await fileExists(templatesDir)) {
            await fsPromises.mkdir(templatesDir, { recursive: true });
        }

        // 各テンプレートファイルを作成（存在しない場合のみ）
        for (const templateFile of templateFiles) {
            const templatePath = path.join(templatesDir, templateFile);
            if (!await fileExists(templatePath)) {
                // 拡張機能内のtemplatesから読み込む
                const extensionTemplatePath = path.join(context.extensionPath, 'templates', templateFile);
                if (!await fileExists(extensionTemplatePath)) {
                    throw new Error(`Template file not found: ${extensionTemplatePath}`);
                }
                const templateContent = await fsPromises.readFile(extensionTemplatePath, 'utf8');
                await fsPromises.writeFile(templatePath, templateContent, 'utf8');
            }
        }

        // templatesディレクトリを開く（最初のテンプレートファイルを表示）
        const firstTemplatePath = path.join(templatesDir, templateFiles[0]);
        const document = await vscode.workspace.openTextDocument(firstTemplatePath);
        await vscode.window.showTextDocument(document);

        // templatesフォルダをエクスプローラーで表示
        vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(templatesDir));

        vscode.window.showInformationMessage(`Template files created: ${templateFiles.join(', ')}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create template files: ${error}`);
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
