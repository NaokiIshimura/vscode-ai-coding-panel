import * as vscode from 'vscode';
import { CommandDependencies } from './types';

/**
 * Register terminal-related commands
 */
export function registerTerminalCommands(
    context: vscode.ExtensionContext,
    deps: CommandDependencies
): void {
    const { terminalProvider } = deps;

    // Create a new terminal
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.terminalNew', () => {
            terminalProvider.newTerminal();
        })
    );

    // Clear the terminal
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.terminalClear', () => {
            terminalProvider.clearTerminal();
        })
    );

    // Kill the terminal
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.terminalKill', () => {
            terminalProvider.killTerminal();
        })
    );

    // Open the terminal
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openTerminal', async () => {
            // Move focus to the Terminal View
            await vscode.commands.executeCommand('aiCodingSidebarTerminal.focus');
        })
    );

    // Git: check out a branch
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

    // Git: check out the default branch
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.checkoutDefaultBranch', async () => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }

            // Get the default branch (main or master)
            const terminal = vscode.window.createTerminal('Get Default Branch');
            terminal.sendText('git symbolic-ref refs/remotes/origin/HEAD | sed \'s@^refs/remotes/origin/@@\'');
            terminal.dispose();

            // Let the user choose
            const selected = await vscode.window.showQuickPick(['main', 'master'], {
                placeHolder: 'Select default branch'
            });

            if (selected) {
                const command = `git checkout ${selected} && git pull`;
                await terminalProvider.sendCommand(command);
            }
        })
    );

    // Git: pull
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
