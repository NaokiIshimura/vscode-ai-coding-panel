import * as vscode from 'vscode';
import * as path from 'path';
import { CommandDependencies } from './types';
import { openGlobalTemplatesRoot } from '../utils/globalTemplatePaths';

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

    // 同梱のプロンプトテンプレートをグローバルへコピーするコマンド
    // ワークスペース未オープンでも実行できる
    // どのテンプレートを編集したいかは利用者によるため、
    // 特定のファイルをエディタで開かずグローバル配置先を新しいウィンドウで開く
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.setupGlobalPromptTemplates', async () => {
            try {
                const templatesDir = await promptTemplateService.setupGlobalTemplates();
                if (!templatesDir) {
                    vscode.window.showErrorMessage('Global template directory is not available');
                    return;
                }

                // 新しいウィンドウへフォーカスが移るため、通知を先に出す
                vscode.window.showInformationMessage(`Global prompt templates are ready: ${templatesDir}`);

                await openGlobalTemplatesRoot(context);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create global prompt templates: ${error}`);
            }
        })
    );
}
