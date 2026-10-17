import * as vscode from 'vscode';
import * as path from 'path';
import { CommandDependencies } from './types';

/**
 * Register documentation-related commands
 */
export function registerDocumentationCommands(
    context: vscode.ExtensionContext,
    _deps: CommandDependencies
): void {
    // Command to open the documentation
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openDocumentation', () => {
            vscode.env.openExternal(vscode.Uri.parse('https://github.com/NaokiIshimura/vscode-ai-coding-sidebar'));
        })
    );

    // Command to open Quick Start
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openGettingStarted', async () => {
            const extensionPath = context.extensionPath;
            const guidePath = path.join(extensionPath, 'docs', 'quick-start.md');
            const uri = vscode.Uri.file(guidePath);
            await vscode.commands.executeCommand('markdown.showPreview', uri);
        })
    );

    // Command to open the Plans View Guide
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openPlansViewGuide', async () => {
            const extensionPath = context.extensionPath;
            const guidePath = path.join(extensionPath, 'docs', 'plans-view.md');
            const uri = vscode.Uri.file(guidePath);
            await vscode.commands.executeCommand('markdown.showPreview', uri);
        })
    );

    // Command to open the Editor View Guide
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openEditorViewGuide', async () => {
            const extensionPath = context.extensionPath;
            const guidePath = path.join(extensionPath, 'docs', 'editor-view.md');
            const uri = vscode.Uri.file(guidePath);
            await vscode.commands.executeCommand('markdown.showPreview', uri);
        })
    );

    // Command to open the Terminal View Guide
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openTerminalViewGuide', async () => {
            const extensionPath = context.extensionPath;
            const guidePath = path.join(extensionPath, 'docs', 'terminal-view.md');
            const uri = vscode.Uri.file(guidePath);
            await vscode.commands.executeCommand('markdown.showPreview', uri);
        })
    );

    // Command to open Keyboard Shortcuts
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openKeyboardShortcuts', async () => {
            const extensionPath = context.extensionPath;
            const guidePath = path.join(extensionPath, 'docs', 'keyboard-shortcuts.md');
            const uri = vscode.Uri.file(guidePath);
            await vscode.commands.executeCommand('markdown.showPreview', uri);
        })
    );
}
