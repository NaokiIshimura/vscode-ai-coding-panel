import * as vscode from 'vscode';
import * as path from 'path';
import { CommandDependencies } from './types';

/**
 * プロンプトテンプレート関連のコマンドを登録
 */
export function registerTemplatesCommands(
    context: vscode.ExtensionContext,
    deps: CommandDependencies
): void {
    const { editorProvider, promptTemplateService } = deps;

    // プロンプトテンプレートをEditor Viewへ挿入するコマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.insertPromptTemplate', async () => {
            await editorProvider.insertPromptTemplate();
        })
    );

    // 同梱のプロンプトテンプレートをワークスペースへコピーするコマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.setupPromptTemplates', async () => {
            try {
                const templatesDir = await promptTemplateService.setupWorkspaceTemplates();
                if (!templatesDir) {
                    vscode.window.showErrorMessage('No workspace is open');
                    return;
                }

                const templates = await promptTemplateService.listTemplates();

                // 先頭のテンプレートを開いて編集できるようにする
                if (templates.length > 0) {
                    const document = await vscode.workspace.openTextDocument(templates[0].filePath);
                    await vscode.window.showTextDocument(document);
                }

                vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(templatesDir));

                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                const displayPath = workspaceRoot
                    ? path.relative(workspaceRoot, templatesDir)
                    : templatesDir;
                vscode.window.showInformationMessage(`Prompt templates are ready: ${displayPath}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create prompt templates: ${error}`);
            }
        })
    );
}
