import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

/**
 * Subdirectories placed under the global location
 * Same layout as the workspace side (.vscode/ai-coding-panel/{templates,prompts})
 */
const TEMPLATES_SUBDIR = 'templates';
const PROMPT_TEMPLATES_SUBDIR = 'prompts';

/** Setting key */
const GLOBAL_TEMPLATES_PATH_SETTING = 'globalTemplatesPath';

/**
 * Get the root directory for global templates
 *
 * If the setting `aiCodingSidebar.globalTemplatesPath` is empty,
 * the extension's global storage (`context.globalStorageUri`) is used.
 *
 * VS Code does not create the `globalStorageUri` directory automatically,
 * so writers must always call `mkdir(recursive: true)`.
 *
 * @returns undefined if it cannot be resolved (for a context without `globalStorageUri`)
 */
export function getGlobalRootDir(context: vscode.ExtensionContext): string | undefined {
    const configured = readConfiguredPath();
    if (configured) {
        return configured;
    }

    // Disable the global location when given a context without globalStorageUri (e.g. in tests)
    return context.globalStorageUri?.fsPath;
}

/**
 * Get the global template (file template) directory
 */
export function getGlobalTemplatesDir(context: vscode.ExtensionContext): string | undefined {
    const root = getGlobalRootDir(context);
    return root ? path.join(root, TEMPLATES_SUBDIR) : undefined;
}

/**
 * Get the global prompt template (snippet) directory
 */
export function getGlobalPromptTemplatesDir(context: vscode.ExtensionContext): string | undefined {
    const root = getGlobalRootDir(context);
    return root ? path.join(root, PROMPT_TEMPLATES_SUBDIR) : undefined;
}

/**
 * Open the root of the global location in a new VS Code window
 *
 * Opens the root rather than a subdirectory so that both `templates/`
 * and `prompts/` can be handled in one window.
 *
 * Paths outside the workspace cannot be shown in VS Code's Explorer,
 * so there is no way to show them in the current window. Open them in a separate window with `forceNewWindow`
 * (if omitted, the current window is closed and reopened)
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
 * Resolve the configured path
 *
 * The global location must not depend on the workspace, so
 * relative paths are resolved against the home directory, not the workspace root,
 * and `~` is expanded
 *
 * @param configured Configured value (returns undefined if unset or empty)
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
 * Read the setting and resolve the path
 */
function readConfiguredPath(): string | undefined {
    const configured = vscode.workspace
        .getConfiguration('aiCodingSidebar')
        .get<string>(GLOBAL_TEMPLATES_PATH_SETTING, '');

    return resolveConfiguredGlobalPath(configured);
}
