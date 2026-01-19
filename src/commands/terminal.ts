import * as vscode from 'vscode';
import { CommandDependencies } from './types';

/**
 * ターミナル関連のコマンドを登録
 */
export function registerTerminalCommands(
    context: vscode.ExtensionContext,
    deps: CommandDependencies
): void {
    const { terminalProvider } = deps;

    // 新しいターミナルを作成
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.terminalNew', () => {
            terminalProvider.newTerminal();
        })
    );

    // ターミナルをクリア
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.terminalClear', () => {
            terminalProvider.clearTerminal();
        })
    );

    // ターミナルを終了
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.terminalKill', () => {
            terminalProvider.killTerminal();
        })
    );

    // ターミナルを開く
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openTerminal', async () => {
            // Terminal Viewにフォーカスを移動
            await vscode.commands.executeCommand('aiCodingSidebarTerminal.focus');
        })
    );

    // Git: ブランチをチェックアウト
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.checkoutBranch', async () => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }

            const branchName = await vscode.window.showInputBox({
                prompt: 'Enter branch name to checkout',
                placeHolder: 'feature/my-feature'
            });

            if (branchName) {
                const command = `git checkout ${branchName}`;
                await terminalProvider.sendCommand(command);
            }
        })
    );

    // Git: デフォルトブランチをチェックアウト
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.checkoutDefaultBranch', async () => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }

            // デフォルトブランチを取得（main or master）
            const terminal = vscode.window.createTerminal('Get Default Branch');
            terminal.sendText('git symbolic-ref refs/remotes/origin/HEAD | sed \'s@^refs/remotes/origin/@@\'');
            terminal.dispose();

            // ユーザーに選択させる
            const selected = await vscode.window.showQuickPick(['main', 'master'], {
                placeHolder: 'Select default branch'
            });

            if (selected) {
                const command = `git checkout ${selected} && git pull`;
                await terminalProvider.sendCommand(command);
            }
        })
    );

    // Git: プル
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.gitPull', async () => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }

            const command = 'git pull';
            await terminalProvider.sendCommand(command);
        })
    );
}
