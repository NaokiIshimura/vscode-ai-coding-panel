import * as vscode from 'vscode';
import { setupSettingsJson, setupTemplate, setupGlobalTemplate, setupClaudeFolder } from '../utils/workspaceSetup';
import { CommandDependencies } from './types';

/**
 * Register settings-related commands
 */
export function registerSettingsCommands(
    context: vscode.ExtensionContext,
    _deps: CommandDependencies
): void {
    // Command to open settings
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openSettings', async () => {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'aiCodingSidebar');
        })
    );

    // Command to open Plans settings
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openPlansSettings', async () => {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'aiCodingSidebar.plans');
        })
    );

    // Command to open Editor settings
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openEditorSettings', async () => {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'aiCodingSidebar.editor');
        })
    );

    // Command to open Terminal settings
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openTerminalSettings', async () => {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'aiCodingSidebar.terminal');
        })
    );

    // Command to open user settings
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openUserSettings', async () => {
            try {
                await vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    'aiCodingSidebar'
                );
            } catch (error) {
                vscode.window.showErrorMessage('Failed to open user settings');
            }
        })
    );

    // Command to open workspace settings
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openWorkspaceSettings', async () => {
            try {
                await vscode.commands.executeCommand(
                    'workbench.action.openWorkspaceSettings',
                    'aiCodingSidebar'
                );
            } catch (error) {
                vscode.window.showErrorMessage('Failed to open workspace settings');
            }
        })
    );

    // Workspace setup command
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.setupWorkspace', async () => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

            // Show setup options
            const options = [
                {
                    label: '$(gear) Create/Edit settings.json',
                    description: 'Create or edit workspace settings file',
                    action: 'settings'
                },
                {
                    label: '$(file-text) Customize Template',
                    description: 'Customize template for file creation',
                    action: 'template'
                },
                {
                    label: '$(folder) Configure .claude Folder',
                    description: 'Set defaultRelativePath to .claude',
                    action: 'claude'
                }
            ];

            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select an item to configure'
            });

            if (!selected) {
                return;
            }

            switch (selected.action) {
                case 'settings':
                    await setupSettingsJson(workspaceRoot);
                    break;
                case 'template':
                    await setupTemplate(context, workspaceRoot);
                    break;
                case 'claude':
                    await setupClaudeFolder(workspaceRoot);
                    break;
            }
        })
    );

    // Template setup command
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.setupTemplate', async () => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            await setupTemplate(context, workspaceRoot);
        })
    );

    // Global template setup command
    // Works even when no workspace is open
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.setupGlobalTemplate', async () => {
            await setupGlobalTemplate(context);
        })
    );
}
