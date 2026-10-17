import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { CommandDependencies } from './types';
import { FileItem } from '../providers';
import { loadTemplate } from '../utils/templateUtils';
import { ConfigurationProvider } from '../services/ConfigurationProvider';
import { FileOperationService } from '../services/FileOperationService';
import { TemplateService } from '../services/TemplateService';

/**
 * Register Plans-related commands
 */
export function registerPlansCommands(
    context: vscode.ExtensionContext,
    deps: CommandDependencies
): void {
    const { plansProvider, editorProvider, fileOperationService } = deps;
    const configProvider = new ConfigurationProvider();

    // 1. refresh - refresh the view
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.refresh', () => {
            plansProvider.refresh();
        })
    );

    // 2. showInPanel - show in the lower pane (kept for compatibility)
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.showInPanel', async (item: FileItem) => {
            if (item && item.isDirectory) {
                plansProvider.setActiveFolder(item.filePath);
            }
        })
    );

    // 3. openFolder - open a folder (kept for compatibility)
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openFolder', async (folderPath: string) => {
            plansProvider.setActiveFolder(folderPath);
        })
    );

    // 4. goToParent - move to the parent folder
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.goToParent', async () => {
            const currentPath = plansProvider.getRootPath();
            if (currentPath) {
                const parentPath = path.dirname(currentPath);

                // Do not move above the project root
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (workspaceRoot && parentPath.startsWith(workspaceRoot) && parentPath !== currentPath) {
                    await plansProvider.setRootPath(parentPath);
                } else {
                    vscode.window.showInformationMessage('No parent folder available');
                }
            }
        })
    );

    // 5. setRelativePath - set the relative path
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.setRelativePath', async () => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const currentPath = plansProvider.getRootPath() || workspaceRoot;

            // Compute the relative path from the current path
            const currentRelativePath = path.relative(workspaceRoot, currentPath);
            const displayPath = currentRelativePath === '' ? '.' : currentRelativePath;

            const inputPath = await vscode.window.showInputBox({
                prompt: `Enter relative path from workspace root (${path.basename(workspaceRoot)})`,
                value: displayPath,
                placeHolder: 'src, docs/api, .claude, . (root)'
            });

            if (inputPath !== undefined) {
                const trimmedPath = inputPath.trim();
                let targetPath: string;

                if (trimmedPath === '' || trimmedPath === '.') {
                    // An empty string or '.' means the workspace root
                    targetPath = workspaceRoot;
                } else {
                    // Convert the relative path to an absolute path
                    targetPath = path.resolve(workspaceRoot, trimmedPath);
                }

                // Check that the path exists (continue even on error)
                let pathExists = false;
                let isDirectory = false;

                try {
                    const stat = await fsPromises.stat(targetPath);
                    pathExists = true;
                    isDirectory = stat.isDirectory();
                } catch (error) {
                    // Continue even if the path does not exist
                    pathExists = false;
                }

                if (pathExists && !isDirectory) {
                    vscode.window.showErrorMessage(`Specified path is not a directory: ${targetPath}`);
                    return;
                }

                if (!pathExists) {
                    const continueChoice = await vscode.window.showWarningMessage(
                        `Specified path not found:\nRelative path: ${trimmedPath}\nAbsolute path: ${targetPath}\n\nContinue anyway?`,
                        'Yes',
                        'No'
                    );

                    if (continueChoice !== 'Yes') {
                        return;
                    }
                }

                // Set the path (even if it does not exist)
                await plansProvider.setRootPath(targetPath);

                // Ask the user whether to save it to settings
                const relativePathToSave = trimmedPath === '' || trimmedPath === '.' ? '' : trimmedPath;
                const saveChoice = await vscode.window.showInformationMessage(
                    `Save relative path "${relativePathToSave || '.'}" to settings?`,
                    'Yes',
                    'No'
                );

                if (saveChoice === 'Yes') {
                    const config = vscode.workspace.getConfiguration('aiCodingSidebar');
                    await config.update('plans.defaultRelativePath', relativePathToSave, vscode.ConfigurationTarget.Workspace);
                    vscode.window.showInformationMessage('Saved to settings');
                }

                // Select the configured folder (only if it exists)
                if (pathExists) {
                    await plansProvider.revealDirectory(targetPath);
                }
            }
        })
    );

    // 6. createFolder - create a folder
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.createFolder', async (item?: FileItem) => {
            let targetPath: string;

            // Decide where to create it by priority
            if (item) {
                if (item.isDirectory) {
                    targetPath = item.filePath;
                } else {
                    targetPath = path.dirname(item.filePath);
                }
            } else {
                const currentPath = plansProvider.getCurrentPath();
                if (!currentPath) {
                    vscode.window.showErrorMessage('No folder is open');
                    return;
                }
                targetPath = currentPath;
            }

            // Ask the user for the folder name
            const folderName = await vscode.window.showInputBox({
                prompt: 'Enter new folder name',
                placeHolder: 'Folder name',
                validateInput: async (value) => {
                    if (!value || value.trim() === '') {
                        return 'Please enter a folder name';
                    }
                    if (value.match(/[<>:"|?*\/\\]/)) {
                        return 'Contains invalid characters: < > : " | ? * / \\';
                    }
                    const folderPath = path.join(targetPath, value.trim());
                    try {
                        await fsPromises.access(folderPath);
                        return `Folder "${value.trim()}" already exists`;
                    } catch {
                        return null;
                    }
                }
            });

            if (!folderName || folderName.trim() === '') {
                return;
            }

            const trimmedFolderName = folderName.trim();
            const folderPath = path.join(targetPath, trimmedFolderName);

            try {
                const result = await fileOperationService.createDirectory(folderPath);

                if (result.success) {
                    plansProvider.refresh();
                    vscode.window.showInformationMessage(`Created folder "${trimmedFolderName}"`);
                } else {
                    throw result.error || new Error('Failed to create folder');
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
            }
        })
    );

    // 7. addDirectory - add a directory (for the context menu)
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.addDirectory', async (item?: FileItem) => {
            let targetItem = item;

            if (!targetItem) {
                targetItem = plansProvider.getSelectedItem();
            }

            let targetPath: string;
            if (targetItem && targetItem.isDirectory) {
                targetPath = targetItem.filePath;
            } else {
                const currentPath = plansProvider.getRootPath();
                if (!currentPath) {
                    vscode.window.showErrorMessage('No folder is open');
                    return;
                }
                targetPath = currentPath;
            }

            const folderName = await vscode.window.showInputBox({
                prompt: 'Enter new folder name',
                placeHolder: 'Folder name',
                validateInput: async (value) => {
                    if (!value || value.trim() === '') {
                        return 'Please enter a folder name';
                    }
                    if (value.match(/[<>:"|?*\/\\]/)) {
                        return 'Contains invalid characters: < > : " | ? * / \\';
                    }
                    const folderPath = path.join(targetPath, value.trim());
                    try {
                        await fsPromises.access(folderPath);
                        return `Folder "${value.trim()}" already exists`;
                    } catch {
                        return null;
                    }
                }
            });

            if (!folderName || folderName.trim() === '') {
                return;
            }

            const trimmedFolderName = folderName.trim();
            const folderPath = path.join(targetPath, trimmedFolderName);

            try {
                await fsPromises.mkdir(folderPath, { recursive: true });
                vscode.window.showInformationMessage(`Created folder "${trimmedFolderName}"`);

                plansProvider.refresh();
                await plansProvider.revealDirectory(folderPath);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
            }
        })
    );

    // 8. newDirectory - create a new directory and TASK file
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.newDirectory', async (_item?: FileItem) => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder is open');
                return;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const currentPath = plansProvider.getCurrentPath();
            let targetPath: string;

            if (currentPath) {
                targetPath = currentPath;
            } else {
                const defaultRelativePath = configProvider.getDefaultRelativePath();
                if (!defaultRelativePath || defaultRelativePath.trim() === '') {
                    vscode.window.showErrorMessage('Default relative path is not configured');
                    return;
                }
                targetPath = path.join(workspaceRoot, defaultRelativePath);
            }

            const folderName = await vscode.window.showInputBox({
                prompt: 'Enter new folder name',
                placeHolder: 'Folder name',
                validateInput: async (value) => {
                    if (!value || value.trim() === '') {
                        return 'Please enter a folder name';
                    }
                    if (value.match(/[<>:"|?*\/\\]/)) {
                        return 'Contains invalid characters: < > : " | ? * / \\';
                    }
                    const folderPath = path.join(targetPath, value.trim());
                    try {
                        await fsPromises.access(folderPath);
                        return `Folder "${value.trim()}" already exists`;
                    } catch {
                        return null;
                    }
                }
            });

            if (!folderName || folderName.trim() === '') {
                return;
            }

            const trimmedFolderName = folderName.trim();
            const folderPath = path.join(targetPath, trimmedFolderName);

            try {
                await fsPromises.mkdir(folderPath, { recursive: true });
                vscode.window.showInformationMessage(`Created folder "${trimmedFolderName}"`);

                plansProvider.navigateToDirectory(folderPath);

                // Create the TASK file
                const now = new Date();
                const year = String(now.getFullYear());
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const hour = String(now.getHours()).padStart(2, '0');
                const minute = String(now.getMinutes()).padStart(2, '0');
                const second = String(now.getSeconds()).padStart(2, '0');

                const timestamp = `${year}_${month}${day}_${hour}${minute}_${second}`;
                const fileName = `${timestamp}_TASK.md`;
                const filePath = path.join(folderPath, fileName);

                const relativeFilePath = workspaceRoot ? path.relative(workspaceRoot, filePath) : filePath;
                const relativeDirPath = workspaceRoot ? path.relative(workspaceRoot, folderPath) : folderPath;

                const variables = {
                    datetime: deps.templateService.formatDateTime(now),
                    filename: fileName,
                    timestamp: timestamp,
                    filepath: relativeFilePath,
                    dirpath: relativeDirPath
                };

                const content = await loadTemplate(context, variables, 'task');
                const result = await fileOperationService.createFile(filePath, content);

                if (result.success) {
                    plansProvider.refresh();
                    await new Promise(resolve => setTimeout(resolve, 300));
                    await editorProvider.showFile(filePath);
                    vscode.window.showInformationMessage(`Created markdown file ${fileName} in "${trimmedFolderName}"`);
                } else {
                    vscode.window.showWarningMessage(`Folder created but failed to create markdown file: ${result.error}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
            }
        })
    );

    // 9. renameDirectory - rename a directory
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.renameDirectory', async (item?: FileItem) => {
            if (!item || !item.isDirectory) {
                vscode.window.showErrorMessage('No directory is selected');
                return;
            }
            await vscode.commands.executeCommand('aiCodingSidebar.rename', item);
        })
    );

    // 10. deleteDirectory - delete a directory
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.deleteDirectory', async (item?: FileItem) => {
            if (!item || !item.isDirectory) {
                vscode.window.showErrorMessage('No directory is selected');
                return;
            }
            await vscode.commands.executeCommand('aiCodingSidebar.delete', item);
        })
    );

    // 11. archiveDirectory - archive a directory
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.archiveDirectory', async (item?: FileItem) => {
            let targetPath: string;
            let isCurrentDirectory = false;

            if (item && item.isDirectory) {
                targetPath = item.filePath;
                if (item.contextValue === 'pathDisplayNonRoot') {
                    isCurrentDirectory = true;
                }
            } else {
                const activePath = plansProvider.getActiveFolderPath();
                const rootPath = plansProvider.getRootPath();
                if (!activePath || activePath === rootPath) {
                    vscode.window.showErrorMessage('Cannot archive root directory');
                    return;
                }
                targetPath = activePath;
                isCurrentDirectory = true;
            }

            const archivedDirPath = await ensureArchivedDirectory(configProvider, fileOperationService);
            if (!archivedDirPath) {
                return;
            }

            const originalName = path.basename(targetPath);
            const { destPath, finalName, hasConflict } =
                await resolveArchiveDestination(archivedDirPath, originalName, true);

            try {
                const result = await fileOperationService.moveFile(targetPath, destPath);
                if (!result.success) {
                    throw result.error || new Error('Failed to move directory');
                }

                if (isCurrentDirectory) {
                    const rootPath = plansProvider.getRootPath();
                    if (rootPath) {
                        plansProvider.navigateToDirectory(rootPath);
                    }
                }

                plansProvider.refresh();

                if (hasConflict) {
                    vscode.window.showInformationMessage(
                        `Directory archived (renamed to "${finalName}" due to conflict)`
                    );
                } else {
                    vscode.window.showInformationMessage(
                        `Directory "${originalName}" archived`
                    );
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to archive directory: ${error}`);
            }
        })
    );

    // 12. archiveFile - archive a file
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.archiveFile', async (item?: FileItem) => {
            if (!item || item.isDirectory) {
                vscode.window.showErrorMessage('No file is selected');
                return;
            }

            const archivedDirPath = await ensureArchivedDirectory(configProvider, fileOperationService);
            if (!archivedDirPath) {
                return;
            }

            const targetPath = item.filePath;
            const originalName = path.basename(targetPath);
            const { destPath, finalName, hasConflict } =
                await resolveArchiveDestination(archivedDirPath, originalName, false);

            try {
                const result = await fileOperationService.moveFile(targetPath, destPath);
                if (!result.success) {
                    throw result.error || new Error('Failed to move file');
                }

                // Clear the display if the file open in the Editor View was archived
                if (editorProvider.getCurrentFilePath() === targetPath) {
                    await editorProvider.clearFile();
                }

                plansProvider.refresh();

                if (hasConflict) {
                    vscode.window.showInformationMessage(
                        `File archived (renamed to "${finalName}" due to conflict)`
                    );
                } else {
                    vscode.window.showInformationMessage(
                        `File "${originalName}" archived`
                    );
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to archive file: ${error}`);
            }
        })
    );

    // 13. createDefaultPath - create the default path and the initial prompt file
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.createDefaultPath', async (targetPath: string, relativePath?: string) => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

            try {
                // Create the directory
                await fsPromises.mkdir(targetPath, { recursive: true });

                const displayPath = relativePath || path.relative(workspaceRoot, targetPath);
                vscode.window.showInformationMessage(`Created directory: ${displayPath}`);

                await plansProvider.setRootPath(targetPath, relativePath);

                // Create the initial prompt file
                const templateService = new TemplateService(context);
                const fileName = templateService.generatePromptFileName();
                const filePath = path.join(targetPath, fileName);

                try {
                    // Load the template file
                    const templatePath = path.join(context.extensionPath, 'resources', 'templates', 'initial_prompt.md');
                    let content: string;

                    try {
                        content = await fsPromises.readFile(templatePath, 'utf8');
                    } catch (templateError) {
                        // Use the default text if the template file is not found
                        content = 'Write your prompt in this editor.\n\nClick one of the buttons below to send your prompt to the terminal:\n- **Run**: Execute the prompt immediately\n- **Plan**: Create an implementation plan\n- **Spec**: Generate a specification document\n';
                    }

                    // Create the file
                    const result = await fileOperationService.createFile(filePath, content);

                    if (result.success) {
                        // Update the PlansProvider
                        plansProvider.refresh();

                        // Wait briefly, then open and select the file
                        await new Promise(resolve => setTimeout(resolve, 300));

                        // Open the file in the EditorProvider
                        await editorProvider.showFile(filePath);

                        // Select the file in the PlansProvider
                        await plansProvider.revealFile(filePath);

                        vscode.window.showInformationMessage(`Created initial prompt file: ${fileName}`);
                    } else {
                        vscode.window.showWarningMessage(`Directory created but failed to create initial prompt file: ${result.error}`);
                    }
                } catch (fileError) {
                    console.error('Failed to create initial prompt file:', fileError);
                    vscode.window.showWarningMessage(`Directory created but failed to create initial prompt file: ${fileError}`);
                }

            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create directory: ${error}`);
            }
        })
    );

    // 14. quickStart - create a directory and QUICK_START.md without specifying a task name
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.quickStart', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder is open');
                return;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;

            // If the root directory has not been created ("Create directory" is shown),
            // first run the same process as "Create directory", then continue with Quick Start
            if (plansProvider.isRootPathNotFound()) {
                await vscode.commands.executeCommand(
                    'aiCodingSidebar.createDefaultPath',
                    plansProvider.getRootPath(),
                    plansProvider.getConfiguredRelativePath()
                );
                if (plansProvider.isRootPathNotFound()) {
                    return;
                }
            }

            const rootPath = plansProvider.getRootPath();
            let targetPath: string;

            if (rootPath) {
                targetPath = rootPath;
            } else {
                const defaultRelativePath = configProvider.getDefaultRelativePath();
                if (!defaultRelativePath || defaultRelativePath.trim() === '') {
                    vscode.window.showErrorMessage('Default relative path is not configured');
                    return;
                }
                targetPath = path.join(workspaceRoot, defaultRelativePath);
            }

            const templateService = new TemplateService(context);

            try {
                const { path: folderPath } = await templateService.generateUniqueDirectoryPath(targetPath);
                await fsPromises.mkdir(folderPath, { recursive: true });

                plansProvider.navigateToDirectory(folderPath);

                const fileName = templateService.generateQuickStartFileName();
                const filePath = path.join(folderPath, fileName);

                const relativeFilePath = path.relative(workspaceRoot, filePath);
                const relativeDirPath = path.relative(workspaceRoot, folderPath);

                const variables = {
                    datetime: templateService.formatDateTime(),
                    filename: fileName,
                    timestamp: templateService.generateTimestamp(),
                    filepath: relativeFilePath,
                    dirpath: relativeDirPath
                };

                const content = await loadTemplate(context, variables, 'quick_start');
                const result = await fileOperationService.createFile(filePath, content);

                if (result.success) {
                    plansProvider.refresh();
                    await new Promise(resolve => setTimeout(resolve, 300));
                    await editorProvider.showFile(filePath);
                    await plansProvider.revealFile(filePath);
                    vscode.window.showInformationMessage(`Created quick start file "${fileName}"`);
                } else {
                    vscode.window.showWarningMessage(`Directory created but failed to create quick start file: ${result.error}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create quick start directory: ${error}`);
            }
        })
    );

    // 15. navigateToDirectory - navigate to a directory
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.navigateToDirectory', (targetPath: string) => {
            if (targetPath) {
                plansProvider.navigateToDirectory(targetPath);
            }
        })
    );

    // 16. resumeSession - resume the latest session recorded in metadata.md of the displayed directory
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.resumeSession', async () => {
            const session = await plansProvider.findLatestResumeSession();
            if (!session) {
                vscode.window.showWarningMessage('No resumable session found in this directory.');
                return;
            }

            // If the file that started the session still exists, open it and associate it with the tab (resume even if it is gone)
            const sessionFilePath = path.join(session.dirPath, path.basename(session.fileName));
            let filePath: string | undefined;
            try {
                await fsPromises.access(sessionFilePath);
                filePath = sessionFilePath;
            } catch {
                filePath = undefined;
            }

            if (filePath) {
                await editorProvider.showFile(filePath);
                await plansProvider.revealFile(filePath);
            }

            await editorProvider.resumeSession(session.sessionId, filePath, session.commandType);
        })
    );
}

/**
 * Get the archive directory (<plans>/archived)
 * Create it if it does not exist; on failure show an error message and return undefined
 */
async function ensureArchivedDirectory(
    configProvider: ConfigurationProvider,
    fileOperationService: FileOperationService
): Promise<string | undefined> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        vscode.window.showErrorMessage('No workspace is open');
        return undefined;
    }

    const defaultRelativePath = configProvider.getDefaultRelativePath();
    if (!defaultRelativePath) {
        vscode.window.showErrorMessage('Default task path is not configured');
        return undefined;
    }

    const archivedDirPath = path.join(workspaceRoot, defaultRelativePath, 'archived');

    try {
        try {
            await fsPromises.access(archivedDirPath);
        } catch {
            const result = await fileOperationService.createDirectory(archivedDirPath);
            if (!result.success) {
                throw result.error || new Error('Failed to create archived directory');
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create archived directory: ${error}`);
        return undefined;
    }

    return archivedDirPath;
}

/**
 * Decide the archive destination path
 * If the same name already exists, append a timestamp to avoid the collision
 * (appended at the end for directories, before the extension for files)
 */
async function resolveArchiveDestination(
    archivedDirPath: string,
    originalName: string,
    isDirectory: boolean
): Promise<{ destPath: string; finalName: string; hasConflict: boolean }> {
    const destPath = path.join(archivedDirPath, originalName);

    let destExists = false;
    try {
        await fsPromises.access(destPath);
        destExists = true;
    } catch {
        destExists = false;
    }

    if (!destExists) {
        return { destPath, finalName: originalName, hasConflict: false };
    }

    const timestamp = formatArchiveTimestamp(new Date());
    const extension = isDirectory ? '' : path.extname(originalName);
    const baseName = extension ? path.basename(originalName, extension) : originalName;
    const finalName = `${baseName}_${timestamp}${extension}`;

    return {
        destPath: path.join(archivedDirPath, finalName),
        finalName,
        hasConflict: true
    };
}

/**
 * Generate the timestamp (YYYYMMDD_HHmmss) used to avoid archive name collisions
 */
function formatArchiveTimestamp(now: Date): string {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hour}${minute}${second}`;
}
