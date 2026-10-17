import * as vscode from 'vscode';

/**
 * Default URL used when opening the integrated browser (Simple Browser)
 * about:blank opens an empty tab
 */
export const DEFAULT_BROWSER_URL = 'about:blank';

/**
 * Prepend http:// to a URL that omits the scheme
 * URLs that already have a scheme, such as about:blank, are returned as is
 */
export function normalizeUrl(url: string): string {
    if (!url) {
        return DEFAULT_BROWSER_URL;
    }
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) ? url : `http://${url}`;
}

/**
 * Open a URL in VS Code's built-in Simple Browser
 * Always pass a URL; without one, Simple Browser prompts the user for it
 */
export async function openInIntegratedBrowser(url: string): Promise<void> {
    try {
        await vscode.commands.executeCommand('simpleBrowser.show', normalizeUrl(url.trim()));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to open the integrated browser: ${message}`);
    }
}
