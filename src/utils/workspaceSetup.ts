import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { TEMPLATE_FILE_NAMES, WORKSPACE_TEMPLATES_RELATIVE_PATH } from './templateUtils';
import { getGlobalTemplatesDir, openGlobalTemplatesRoot } from './globalTemplatePaths';

// Helper that checks whether a file exists
async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fsPromises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// Helper that sets up settings.json
export async function setupSettingsJson(workspaceRoot: string): Promise<void> {
    const vscodeDir = path.join(workspaceRoot, '.vscode');
    const settingsPath = path.join(vscodeDir, 'settings.json');

    try {
        // Create the .vscode directory (if it does not exist)
        if (!await fileExists(vscodeDir)) {
            await fsPromises.mkdir(vscodeDir, { recursive: true });
        }

        let settings: any = {};

        // Read the existing settings.json
        if (await fileExists(settingsPath)) {
            try {
                const content = await fsPromises.readFile(settingsPath, 'utf8');
                settings = JSON.parse(content);
            } catch (error) {
                console.error('Failed to parse settings.json:', error);
            }
        }

        // Add the default settings
        if (!settings.hasOwnProperty('aiCodingSidebar.plans.defaultRelativePath')) {
            settings['aiCodingSidebar.plans.defaultRelativePath'] = '.claude';
        }

        // Write settings.json
        const settingsContent = JSON.stringify(settings, null, 2);
        await fsPromises.writeFile(settingsPath, settingsContent, 'utf8');

        // Open the file
        const document = await vscode.workspace.openTextDocument(settingsPath);
        await vscode.window.showTextDocument(document);

        vscode.window.showInformationMessage('Created/updated settings.json');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create settings.json: ${error}`);
    }
}

/**
 * Copy the bundled templates to the specified directory
 * Existing files are not overwritten
 *
 * The files to copy are derived from TEMPLATE_FILE_NAMES in templateUtils,
 * so adding a template type cannot cause it to be left out of the copy
 */
export async function copyBundledTemplates(
    context: vscode.ExtensionContext,
    destinationDir: string
): Promise<void> {
    if (!await fileExists(destinationDir)) {
        await fsPromises.mkdir(destinationDir, { recursive: true });
    }

    for (const templateFile of TEMPLATE_FILE_NAMES) {
        const templatePath = path.join(destinationDir, templateFile);
        if (await fileExists(templatePath)) {
            continue;
        }

        // Read from the templates bundled in the extension
        const extensionTemplatePath = path.join(context.extensionPath, 'templates', templateFile);
        if (!await fileExists(extensionTemplatePath)) {
            throw new Error(`Template file not found: ${extensionTemplatePath}`);
        }
        const templateContent = await fsPromises.readFile(extensionTemplatePath, 'utf8');
        await fsPromises.writeFile(templatePath, templateContent, 'utf8');
    }
}

/**
 * Open the first of the copied templates
 *
 * Used only for the workspace side. The global side does not open any particular file on its own,
 * and only shows the directory in the OS file manager
 */
async function openFirstTemplate(templatesDir: string): Promise<void> {
    const firstTemplatePath = path.join(templatesDir, TEMPLATE_FILE_NAMES[0]);
    const document = await vscode.workspace.openTextDocument(firstTemplatePath);
    await vscode.window.showTextDocument(document);
}

// Helper that sets up the templates
export async function setupTemplate(context: vscode.ExtensionContext, workspaceRoot: string): Promise<void> {
    const templatesDir = path.join(workspaceRoot, WORKSPACE_TEMPLATES_RELATIVE_PATH);

    try {
        await copyBundledTemplates(context, templatesDir);
        await openFirstTemplate(templatesDir);

        // Reveal the templates folder in the Explorer
        vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(templatesDir));

        vscode.window.showInformationMessage(`Template files created: ${TEMPLATE_FILE_NAMES.join(', ')}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create template files: ${error}`);
    }
}

/**
 * Helper that sets up the global templates
 *
 * Can run even when no workspace is open.
 * Which of the 4 files the user wants to edit varies,
 * so no particular file is opened in the editor; the global location is opened in a new window instead
 */
export async function setupGlobalTemplate(context: vscode.ExtensionContext): Promise<void> {
    const templatesDir = getGlobalTemplatesDir(context);
    if (!templatesDir) {
        vscode.window.showErrorMessage('Global template directory is not available');
        return;
    }

    try {
        await copyBundledTemplates(context, templatesDir);

        // Show the notification first because focus moves to the new window
        vscode.window.showInformationMessage(`Global template files are ready: ${templatesDir}`);

        await openGlobalTemplatesRoot(context);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create global template files: ${error}`);
    }
}

// Helper that sets up the .claude folder
export async function setupClaudeFolder(workspaceRoot: string): Promise<void> {
    try {
        // Create the .claude folder (if it does not exist)
        const claudeDir = path.join(workspaceRoot, '.claude');
        if (!await fileExists(claudeDir)) {
            await fsPromises.mkdir(claudeDir, { recursive: true });
        }

        // Also update settings.json
        await setupSettingsJson(workspaceRoot);

        // Apply the settings
        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
        await config.update('plans.defaultRelativePath', '.claude', vscode.ConfigurationTarget.Workspace);

        vscode.window.showInformationMessage('Created .claude folder and updated settings');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to configure .claude folder: ${error}`);
    }
}
