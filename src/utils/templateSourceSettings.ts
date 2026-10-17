import * as vscode from 'vscode';

/**
 * Whether each template source is enabled
 *
 * The settings are `disableXxx` (disable flags), but here they
 * are inverted and stored in positive form: **true = load**.
 * This keeps callers' conditions free of double negatives.
 */
export interface TemplateSourceSettings {
    /** Whether to load the workspace file templates (.vscode/ai-coding-panel/templates) */
    workspaceTemplates: boolean;
    /** Whether to load the global file templates (<global>/templates) */
    globalTemplates: boolean;
    /** Whether to load the workspace snippets (editor.promptTemplatesPath) */
    workspacePromptTemplates: boolean;
    /** Whether to load the global snippets (<global>/prompts) */
    globalPromptTemplates: boolean;
}

/**
 * Function that reads the settings
 * Exported as a type so tests can substitute it
 */
export type TemplateSourceSettingsReader = () => TemplateSourceSettings;

/** Setting keys (under `aiCodingSidebar`) */
const SETTING_KEYS = {
    workspaceTemplates: 'editor.disableWorkspaceEditorTemplates',
    globalTemplates: 'editor.disableGlobalEditorTemplates',
    workspacePromptTemplates: 'editor.disableWorkspacePromptTemplates',
    globalPromptTemplates: 'editor.disableGlobalPromptTemplates'
} as const;

/**
 * Get the template source settings
 *
 * Not cached: the settings are read on every call,
 * so changes take effect without reloading the extension
 */
export function readTemplateSourceSettings(): TemplateSourceSettings {
    const config = vscode.workspace.getConfiguration('aiCodingSidebar');

    // Invert because the settings are disable flags
    const isEnabled = (key: string): boolean => !config.get<boolean>(key, false);

    return {
        workspaceTemplates: isEnabled(SETTING_KEYS.workspaceTemplates),
        globalTemplates: isEnabled(SETTING_KEYS.globalTemplates),
        workspacePromptTemplates: isEnabled(SETTING_KEYS.workspacePromptTemplates),
        globalPromptTemplates: isEnabled(SETTING_KEYS.globalPromptTemplates)
    };
}
