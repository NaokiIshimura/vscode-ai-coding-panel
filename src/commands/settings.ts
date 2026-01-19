import * as vscode from 'vscode';
import { setupSettingsJson, setupTemplate, setupClaudeFolder } from '../utils/workspaceSetup';
import { CommandDependencies } from './types';

/**
 * 設定関連のコマンドを登録
 */
export function registerSettingsCommands(
    context: vscode.ExtensionContext,
    _deps: CommandDependencies
): void {
    // 設定を開くコマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openSettings', async () => {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'aiCodingSidebar');
        })
    );

    // Plans設定を開くコマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openPlansSettings', async () => {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'aiCodingSidebar.plans');
        })
    );

    // Editor設定を開くコマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openEditorSettings', async () => {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'aiCodingSidebar.editor');
        })
    );

    // Terminal設定を開くコマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openTerminalSettings', async () => {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'aiCodingSidebar.terminal');
        })
    );

    // ユーザー設定を開くコマンド
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

    // ワークスペース設定を開くコマンド
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

    // ワークスペース設定コマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.setupWorkspace', async () => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

            // 設定オプションを表示
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

    // テンプレート設定コマンド
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
}
