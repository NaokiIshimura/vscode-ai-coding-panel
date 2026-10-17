import * as vscode from 'vscode';
import { CommandDependencies } from './types';
import { DEFAULT_BROWSER_URL, openInIntegratedBrowser } from '../utils/browserUtils';

/**
 * Register browser-related commands
 */
export function registerBrowserCommands(
    context: vscode.ExtensionContext,
    _deps: CommandDependencies
): void {
    // Open the integrated browser
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openIntegratedBrowser', async () => {
            const configuredUrl = vscode.workspace
                .getConfiguration('aiCodingSidebar')
                .get<string>('browser.defaultUrl', DEFAULT_BROWSER_URL);

            await openInIntegratedBrowser(configuredUrl || DEFAULT_BROWSER_URL);
        })
    );
}
