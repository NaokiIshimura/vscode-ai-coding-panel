import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { getGlobalTemplatesDir } from './globalTemplatePaths';
import { TemplateSourceSettings, readTemplateSourceSettings } from './templateSourceSettings';

/**
 * Template types
 *
 * The file names to copy (TEMPLATE_FILE_NAMES) are derived from this.
 * Managing the array and the type separately leads to missed updates (the quick_start omission in v1.1.20).
 */
export const TEMPLATE_TYPES = ['task', 'spec', 'prompt', 'quick_start'] as const;

// Template type
export type TemplateType = typeof TEMPLATE_TYPES[number];

/** File names of the bundled templates (same order as TEMPLATE_TYPES) */
export const TEMPLATE_FILE_NAMES: readonly string[] = TEMPLATE_TYPES.map(type => `${type}.md`);

/** Workspace template location (relative to the workspace root) */
export const WORKSPACE_TEMPLATES_RELATIVE_PATH = path.join('.vscode', 'ai-coding-panel', 'templates');

// Helper that checks whether a file exists
async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fsPromises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Return the template search locations in priority order
 *
 * 1. Workspace
 * 2. Global
 * 3. Bundled with the extension
 *
 * 1 and 2 can each be disabled in the settings.
 * The bundled one is always added as a candidate (disabling it would make file creation itself impossible)
 */
function buildCandidatePaths(
    context: vscode.ExtensionContext,
    templateFileName: string,
    settings: TemplateSourceSettings
): string[] {
    const candidates: string[] = [];

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (settings.workspaceTemplates && workspaceRoot) {
        candidates.push(path.join(workspaceRoot, WORKSPACE_TEMPLATES_RELATIVE_PATH, templateFileName));
    }

    const globalTemplatesDir = getGlobalTemplatesDir(context);
    if (settings.globalTemplates && globalTemplatesDir) {
        candidates.push(path.join(globalTemplatesDir, templateFileName));
    }

    candidates.push(path.join(context.extensionPath, 'templates', templateFileName));

    return candidates;
}

/**
 * Load a template and substitute its variables
 *
 * @param settings Template source settings. Reads the current settings if omitted (lets tests substitute them)
 */
export async function loadTemplate(
    context: vscode.ExtensionContext,
    variables: { [key: string]: string },
    templateType: TemplateType = 'prompt',
    settings: TemplateSourceSettings = readTemplateSourceSettings()
): Promise<string> {
    const templateFileName = `${templateType}.md`;
    const candidates = buildCandidatePaths(context, templateFileName, settings);

    let templatePath: string | undefined;
    for (const candidate of candidates) {
        if (await fileExists(candidate)) {
            templatePath = candidate;
            break;
        }
    }

    if (!templatePath) {
        // If not found, include the path of the last candidate (the bundled one) in the error
        throw new Error(`Template file not found: ${candidates[candidates.length - 1]}`);
    }

    let content = await fsPromises.readFile(templatePath, 'utf8');

    // Substitute variables
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        content = content.replace(regex, value);
    }

    return content;
}
