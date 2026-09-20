import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

/**
 * グローバル配置先の配下に置くサブディレクトリ
 * ワークスペース側（.vscode/ai-coding-panel/{templates,prompts}）と同じ構成にしている
 */
const TEMPLATES_SUBDIR = 'templates';
const PROMPT_TEMPLATES_SUBDIR = 'prompts';

/** 設定キー */
const GLOBAL_TEMPLATES_PATH_SETTING = 'globalTemplatesPath';

/**
 * グローバルテンプレートのルートディレクトリを取得
 *
 * 設定`aiCodingSidebar.globalTemplatesPath`が空の場合は、
 * 拡張機能のグローバルストレージ（`context.globalStorageUri`）を使う。
 *
 * `globalStorageUri`のディレクトリはVS Codeが自動作成しないため、
 * 書き込む側で必ず`mkdir(recursive: true)`すること。
 *
 * @returns 解決できない場合はundefined（`globalStorageUri`を持たないcontextを想定）
 */
export function getGlobalRootDir(context: vscode.ExtensionContext): string | undefined {
    const configured = readConfiguredPath();
    if (configured) {
        return configured;
    }

    // テスト等で globalStorageUri を持たないcontextが渡された場合はグローバル配置先を無効にする
    return context.globalStorageUri?.fsPath;
}

/**
 * グローバルのテンプレート（ファイル雛形）ディレクトリを取得
 */
export function getGlobalTemplatesDir(context: vscode.ExtensionContext): string | undefined {
    const root = getGlobalRootDir(context);
    return root ? path.join(root, TEMPLATES_SUBDIR) : undefined;
}

/**
 * グローバルのプロンプトテンプレート（スニペット）ディレクトリを取得
 */
export function getGlobalPromptTemplatesDir(context: vscode.ExtensionContext): string | undefined {
    const root = getGlobalRootDir(context);
    return root ? path.join(root, PROMPT_TEMPLATES_SUBDIR) : undefined;
}

/**
 * グローバル配置先のルートをVS Codeの新しいウィンドウで開く
 *
 * `templates/`と`prompts/`の双方を1つのウィンドウで扱えるよう、
 * サブディレクトリではなくルートを開く。
 *
 * ワークスペース外のパスはVS Codeのエクスプローラーに表示できないため、
 * 現在のウィンドウで見せる手段が無い。`forceNewWindow`で別ウィンドウとして開く
 * （省略すると現在のウィンドウが閉じて開き直しになる）
 */
export async function openGlobalTemplatesRoot(context: vscode.ExtensionContext): Promise<void> {
    const root = getGlobalRootDir(context);
    if (!root) {
        return;
    }

    await vscode.commands.executeCommand(
        'vscode.openFolder',
        vscode.Uri.file(root),
        { forceNewWindow: true }
    );
}

/**
 * 設定値のパスを解決する
 *
 * グローバル配置先はワークスペースに依存させないため、
 * 相対パスはワークスペースルートではなくホームディレクトリ基準で解決し、
 * `~`も展開する
 *
 * @param configured 設定値（未設定・空文字の場合はundefinedを返す）
 */
export function resolveConfiguredGlobalPath(configured: string | undefined): string | undefined {
    const trimmed = configured?.trim();

    if (!trimmed) {
        return undefined;
    }

    if (trimmed === '~') {
        return os.homedir();
    }

    if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
        return path.join(os.homedir(), trimmed.slice(2));
    }

    return path.isAbsolute(trimmed)
        ? trimmed
        : path.join(os.homedir(), trimmed);
}

/**
 * 設定値を読み取ってパスを解決する
 */
function readConfiguredPath(): string | undefined {
    const configured = vscode.workspace
        .getConfiguration('aiCodingSidebar')
        .get<string>(GLOBAL_TEMPLATES_PATH_SETTING, '');

    return resolveConfiguredGlobalPath(configured);
}
