import * as vscode from 'vscode';
import { CommandDependencies } from './types';

/**
 * 統合ブラウザ（Simple Browser）を開く際のデフォルトURL
 * about:blank を指定すると空のタブが開く
 */
const DEFAULT_BROWSER_URL = 'about:blank';

/**
 * ブラウザ関連のコマンドを登録
 */
export function registerBrowserCommands(
    context: vscode.ExtensionContext,
    _deps: CommandDependencies
): void {
    // 統合ブラウザを開く
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openIntegratedBrowser', async () => {
            const configuredUrl = vscode.workspace
                .getConfiguration('aiCodingSidebar')
                .get<string>('browser.defaultUrl', DEFAULT_BROWSER_URL);

            const url = normalizeUrl((configuredUrl || DEFAULT_BROWSER_URL).trim());

            try {
                // VSCode組み込みのSimple Browserで開く
                // URLを渡さないとSimple Browser側で入力を求められるため、必ず渡す
                await vscode.commands.executeCommand('simpleBrowser.show', url);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Failed to open the integrated browser: ${message}`);
            }
        })
    );
}

/**
 * スキームが省略されたURLにhttp://を補完する
 * about:blank のようなスキーム付きURLはそのまま返す
 */
function normalizeUrl(url: string): string {
    if (!url) {
        return DEFAULT_BROWSER_URL;
    }
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) ? url : `http://${url}`;
}
