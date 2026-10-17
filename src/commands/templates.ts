import * as vscode from 'vscode';
import * as path from 'path';
import { CommandDependencies } from './types';
import { openGlobalTemplatesRoot } from '../utils/globalTemplatePaths';

/**
 * Register prompt template commands
 */
export function registerTemplatesCommands(
    context: vscode.ExtensionContext,
    deps: CommandDependencies
): void {
    const { editorProvider, promptTemplateService } = deps;

    // Command to insert a prompt template into the Editor View
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.insertPromptTemplate', async () => {
            await editorProvider.insertPromptTemplate();
        })
    );

    // Command to copy the bundled prompt templates to the workspace
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.setupPromptTemplates', async () => {
            try {
                const templatesDir = await promptTemplateService.setupWorkspaceTemplates();
                if (!templatesDir) {
                    vscode.window.showErrorMessage('No workspace is open');
                    return;
                }

                const templates = await promptTemplateService.listTemplates();

                // Open the first template so it can be edited
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

    // Command to copy the bundled prompt templates to the global location
    // Works even when no workspace is open
    // Which template to edit depends on the user, so
    // do not open a specific file in the editor; open the global location in a new window instead
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.setupGlobalPromptTemplates', async () => {
            try {
                const templatesDir = await promptTemplateService.setupGlobalTemplates();
                if (!templatesDir) {
                    vscode.window.showErrorMessage('Global template directory is not available');
                    return;
                }

                // Focus moves to the new window, so show the notification first
                vscode.window.showInformationMessage(`Global prompt templates are ready: ${templatesDir}`);

                await openGlobalTemplatesRoot(context);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create global prompt templates: ${error}`);
            }
        })
    );
}
