import * as vscode from 'vscode';

/**
 * 統合ブラウザ（Simple Browser）を開く際のデフォルトURL
 * about:blank を指定すると空のタブが開く
 */
export const DEFAULT_BROWSER_URL = 'about:blank';

/**
 * スキームが省略されたURLにhttp://を補完する
 * about:blank のようなスキーム付きURLはそのまま返す
 */
export function normalizeUrl(url: string): string {
    if (!url) {
        return DEFAULT_BROWSER_URL;
    }
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) ? url : `http://${url}`;
}

/**
 * VSCode組み込みのSimple BrowserでURLを開く
 * URLを渡さないとSimple Browser側で入力を求められるため、必ず渡す
 */
export async function openInIntegratedBrowser(url: string): Promise<void> {
    try {
        await vscode.commands.executeCommand('simpleBrowser.show', normalizeUrl(url.trim()));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to open the integrated browser: ${message}`);
    }
}
