import * as vscode from 'vscode';
import * as path from 'path';
import { CommandDependencies } from './types';

/**
 * ドキュメント関連のコマンドを登録
 */
export function registerDocumentationCommands(
    context: vscode.ExtensionContext,
    _deps: CommandDependencies
): void {
    // ドキュメントを開くコマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openDocumentation', () => {
            vscode.env.openExternal(vscode.Uri.parse('https://github.com/NaokiIshimura/vscode-ai-coding-sidebar'));
        })
    );

    // Getting Startedを開くコマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openGettingStarted', async () => {
            const extensionPath = context.extensionPath;
            const guidePath = path.join(extensionPath, 'docs', 'getting-started.md');
            const uri = vscode.Uri.file(guidePath);
            await vscode.commands.executeCommand('markdown.showPreview', uri);
        })
    );

    // Plans View Guideを開くコマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openPlansViewGuide', async () => {
            const extensionPath = context.extensionPath;
            const guidePath = path.join(extensionPath, 'docs', 'plans-view.md');
            const uri = vscode.Uri.file(guidePath);
            await vscode.commands.executeCommand('markdown.showPreview', uri);
        })
    );

    // Editor View Guideを開くコマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openEditorViewGuide', async () => {
            const extensionPath = context.extensionPath;
            const guidePath = path.join(extensionPath, 'docs', 'editor-view.md');
            const uri = vscode.Uri.file(guidePath);
            await vscode.commands.executeCommand('markdown.showPreview', uri);
        })
    );

    // Terminal View Guideを開くコマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openTerminalViewGuide', async () => {
            const extensionPath = context.extensionPath;
            const guidePath = path.join(extensionPath, 'docs', 'terminal-view.md');
            const uri = vscode.Uri.file(guidePath);
            await vscode.commands.executeCommand('markdown.showPreview', uri);
        })
    );

    // Keyboard Shortcutsを開くコマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openKeyboardShortcuts', async () => {
            const extensionPath = context.extensionPath;
            const guidePath = path.join(extensionPath, 'docs', 'keyboard-shortcuts.md');
            const uri = vscode.Uri.file(guidePath);
            await vscode.commands.executeCommand('markdown.showPreview', uri);
        })
    );
}
