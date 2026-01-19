import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CommandDependencies } from './types';
import { FileItem } from '../providers';
import { loadTemplate } from '../utils/templateUtils';

/**
 * ファイル操作関連のコマンドを登録
 */
export function registerFilesCommands(
    context: vscode.ExtensionContext,
    deps: CommandDependencies
): void {
    const { plansProvider, editorProvider, terminalProvider, fileOperationService } = deps;

    // 1. createMarkdownFile - PROMPTファイル作成
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.createMarkdownFile', async (item?: FileItem) => {
            let targetPath: string;

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

            const now = new Date();
            const year = String(now.getFullYear());
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hour = String(now.getHours()).padStart(2, '0');
            const minute = String(now.getMinutes()).padStart(2, '0');
            const second = String(now.getSeconds()).padStart(2, '0');

            const timestamp = `${year}_${month}${day}_${hour}${minute}_${second}`;
            const fileName = `${timestamp}_PROMPT.md`;
            const filePath = path.join(targetPath, fileName);

            try {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                const relativeFilePath = workspaceRoot ? path.relative(workspaceRoot, filePath) : filePath;
                const relativeDirPath = workspaceRoot ? path.relative(workspaceRoot, targetPath) : targetPath;

                const variables = {
                    datetime: now.toLocaleString(),
                    filename: fileName,
                    timestamp: timestamp,
                    filepath: relativeFilePath,
                    dirpath: relativeDirPath
                };

                const content = loadTemplate(context, variables, 'prompt');
                const result = await fileOperationService.createFile(filePath, content);

                if (result.success) {
                    plansProvider.refresh();
                    await editorProvider.showFile(filePath);
                    await vscode.commands.executeCommand('markdownEditor.focus');
                    vscode.window.showInformationMessage(`Created markdown file ${fileName}`);
                } else {
                    throw result.error || new Error('Failed to create file');
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create markdown file: ${error}`);
            }
        })
    );

    // 2. createTaskFile - TASKファイル作成
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.createTaskFile', async (item?: FileItem) => {
            let targetPath: string;

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

            const now = new Date();
            const year = String(now.getFullYear());
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hour = String(now.getHours()).padStart(2, '0');
            const minute = String(now.getMinutes()).padStart(2, '0');
            const second = String(now.getSeconds()).padStart(2, '0');

            const timestamp = `${year}_${month}${day}_${hour}${minute}_${second}`;
            const fileName = `${timestamp}_TASK.md`;
            const filePath = path.join(targetPath, fileName);

            try {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                const relativeFilePath = workspaceRoot ? path.relative(workspaceRoot, filePath) : filePath;
                const relativeDirPath = workspaceRoot ? path.relative(workspaceRoot, targetPath) : targetPath;

                const variables = {
                    datetime: now.toLocaleString(),
                    filename: fileName,
                    timestamp: timestamp,
                    filepath: relativeFilePath,
                    dirpath: relativeDirPath
                };

                const content = loadTemplate(context, variables, 'task');
                const result = await fileOperationService.createFile(filePath, content);

                if (result.success) {
                    plansProvider.refresh();
                    await editorProvider.showFile(filePath);
                    await vscode.commands.executeCommand('markdownEditor.focus');
                    vscode.window.showInformationMessage(`Created task file ${fileName}`);
                } else {
                    throw result.error || new Error('Failed to create file');
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create task file: ${error}`);
            }
        })
    );

    // 3. createSpecFile - SPECファイル作成
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.createSpecFile', async (item?: FileItem) => {
            let targetPath: string;

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

            const now = new Date();
            const year = String(now.getFullYear());
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hour = String(now.getHours()).padStart(2, '0');
            const minute = String(now.getMinutes()).padStart(2, '0');
            const second = String(now.getSeconds()).padStart(2, '0');

            const timestamp = `${year}_${month}${day}_${hour}${minute}_${second}`;
            const fileName = `${timestamp}_SPEC.md`;
            const filePath = path.join(targetPath, fileName);

            try {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                const relativeFilePath = workspaceRoot ? path.relative(workspaceRoot, filePath) : filePath;
                const relativeDirPath = workspaceRoot ? path.relative(workspaceRoot, targetPath) : targetPath;

                const variables = {
                    datetime: now.toLocaleString(),
                    filename: fileName,
                    timestamp: timestamp,
                    filepath: relativeFilePath,
                    dirpath: relativeDirPath
                };

                const content = loadTemplate(context, variables, 'spec');
                const result = await fileOperationService.createFile(filePath, content);

                if (result.success) {
                    plansProvider.refresh();
                    await editorProvider.showFile(filePath);
                    await vscode.commands.executeCommand('markdownEditor.focus');
                    vscode.window.showInformationMessage(`Created spec file ${fileName}`);
                } else {
                    throw result.error || new Error('Failed to create file');
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create spec file: ${error}`);
            }
        })
    );

    // 4. createFile - 任意のファイル作成
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.createFile', async (item?: FileItem) => {
            let targetDirectory: string | undefined;

            if (item) {
                targetDirectory = item.isDirectory ? item.filePath : path.dirname(item.filePath);
            } else {
                targetDirectory = plansProvider.getCurrentPath()
                    || plansProvider.getRootPath()
                    || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            }

            if (!targetDirectory) {
                vscode.window.showErrorMessage('Failed to identify folder for file creation');
                return;
            }

            try {
                if (!fs.existsSync(targetDirectory) || !fs.statSync(targetDirectory).isDirectory()) {
                    vscode.window.showErrorMessage('Cannot access target folder');
                    return;
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Cannot access target folder: ${error}`);
                return;
            }

            const fileName = await vscode.window.showInputBox({
                prompt: 'Enter new file name',
                placeHolder: 'example.txt',
                validateInput: (value: string) => {
                    const trimmed = value.trim();

                    if (!trimmed) {
                        return 'Please enter a file name';
                    }

                    if (trimmed.includes('/') || trimmed.includes('\\')) {
                        return 'Cannot specify path with folders';
                    }

                    if (!fileOperationService.validateFileName(trimmed)) {
                        return 'Contains invalid characters';
                    }

                    const candidatePath = path.join(targetDirectory!, trimmed);
                    if (fs.existsSync(candidatePath)) {
                        return `File "${trimmed}" already exists`;
                    }

                    return null;
                }
            });

            if (!fileName) {
                return;
            }

            const trimmedFileName = fileName.trim();
            const newFilePath = path.join(targetDirectory, trimmedFileName);

            try {
                const result = await fileOperationService.createFile(newFilePath);

                if (result.success) {
                    plansProvider.refresh();

                    const document = await vscode.workspace.openTextDocument(newFilePath);
                    await vscode.window.showTextDocument(document);

                    vscode.window.showInformationMessage(`Created file "${trimmedFileName}"`);
                } else {
                    throw result.error || new Error('Failed to create file');
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create file: ${error}`);
            }
        })
    );

    // 5. rename - ファイル/ディレクトリ名変更
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.rename', async (item: FileItem) => {
            if (!item) {
                vscode.window.showErrorMessage('No item is selected');
                return;
            }

            const oldName = path.basename(item.filePath);
            const dirPath = path.dirname(item.filePath);

            const newName = await vscode.window.showInputBox({
                prompt: 'Enter new name',
                value: oldName,
                validateInput: (value) => {
                    if (!value || value.trim() === '') {
                        return 'Please enter a name';
                    }
                    if (value.match(/[<>:"|?*\/\\]/)) {
                        return 'Contains invalid characters: < > : " | ? * / \\';
                    }
                    if (value === oldName) {
                        return 'Same name';
                    }
                    return null;
                }
            });

            if (!newName) {
                return;
            }

            const newPath = path.join(dirPath, newName);

            try {
                const result = await fileOperationService.renameFile(item.filePath, newPath);

                if (result.success) {
                    if (item.isDirectory) {
                        plansProvider.setActiveFolder(newPath, true);
                    } else {
                        plansProvider.refresh();
                    }

                    vscode.window.showInformationMessage(`Renamed ${oldName} to ${newName}`);
                } else {
                    throw result.error || new Error('Failed to rename');
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to rename: ${error}`);
            }
        })
    );

    // 6. delete - ファイル/ディレクトリ削除
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.delete', async (item: FileItem) => {
            if (!item) {
                vscode.window.showErrorMessage('No item is selected');
                return;
            }

            const itemName = path.basename(item.filePath);
            const itemType = item.isDirectory ? 'folder' : 'file';

            const answer = await vscode.window.showWarningMessage(
                `Are you sure you want to delete ${itemType} "${itemName}"?\nThis action cannot be undone.`,
                'Yes',
                'No'
            );

            if (answer !== 'Yes') {
                return;
            }

            try {
                const result = await fileOperationService.deleteFiles([item.filePath]);

                if (result[0].success) {
                    let treeUpdated = false;

                    if (item.isDirectory) {
                        const rootPath = plansProvider.getRootPath();
                        if (rootPath) {
                            if (item.filePath === rootPath) {
                                plansProvider.resetActiveFolder();
                                treeUpdated = true;
                            } else {
                                const parentPath = path.dirname(item.filePath);
                                if (parentPath && parentPath.startsWith(rootPath) && fs.existsSync(parentPath)) {
                                    plansProvider.setActiveFolder(parentPath, true);
                                    treeUpdated = true;
                                } else {
                                    plansProvider.resetActiveFolder();
                                    treeUpdated = true;
                                }
                            }
                        } else {
                            plansProvider.resetActiveFolder();
                            treeUpdated = true;
                        }
                    }

                    if (!treeUpdated) {
                        plansProvider.refresh();
                    }

                    vscode.window.showInformationMessage(`Deleted ${itemType} "${itemName}"`);
                } else {
                    throw result[0].error || new Error('Failed to delete');
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to delete: ${error}`);
            }
        })
    );

    // 7. copyRelativePath - 相対パスをコピー
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.copyRelativePath', async (item?: FileItem | vscode.Uri) => {
            if (!item) {
                vscode.window.showErrorMessage('No file or folder is selected');
                return;
            }

            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const filePath = item instanceof vscode.Uri ? item.fsPath : (item as FileItem).filePath;
            const relativePath = path.relative(workspaceRoot, filePath);

            await vscode.env.clipboard.writeText(relativePath);
            vscode.window.showInformationMessage(`Copied relative path: ${relativePath}`);
        })
    );

    // 8. copyRelativePathFromEditor - Editorから相対パスをコピー
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.copyRelativePathFromEditor', async () => {
            const currentFilePath = editorProvider.getCurrentFilePath();

            if (!currentFilePath) {
                vscode.window.showErrorMessage('No file is currently open in Markdown Editor');
                return;
            }

            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const relativePath = path.relative(workspaceRoot, currentFilePath);

            await vscode.env.clipboard.writeText(relativePath);
            vscode.window.showInformationMessage(`Copied relative path: ${relativePath}`);
        })
    );

    // 9. openInEditor - VSCodeエディタで開く
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openInEditor', async (item?: FileItem) => {
            if (!item) {
                vscode.window.showErrorMessage('No file is selected');
                return;
            }

            if (!item.isDirectory) {
                const fileUri = vscode.Uri.file(item.filePath);
                await vscode.commands.executeCommand('vscode.open', fileUri);
            }
        })
    );

    // 10. insertPathToEditor - Editorにパスを挿入
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.insertPathToEditor', async (item?: FileItem, selectedItems?: FileItem[]) => {
            const items = selectedItems && selectedItems.length > 0 ? selectedItems : (item ? [item] : []);

            if (items.length === 0) {
                vscode.window.showErrorMessage('No file or folder is selected');
                return;
            }

            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const relativePaths = items.map(i => path.relative(workspaceRoot, i.filePath));

            editorProvider.insertPaths(relativePaths);
        })
    );

    // 11. insertPathToTerminal - Terminalにパスを挿入
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.insertPathToTerminal', async (item?: FileItem, selectedItems?: FileItem[]) => {
            const items = selectedItems && selectedItems.length > 0 ? selectedItems : (item ? [item] : []);

            if (items.length === 0) {
                vscode.window.showErrorMessage('No file or folder is selected');
                return;
            }

            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const relativePaths = items.map(i => path.relative(workspaceRoot, i.filePath));

            await terminalProvider.insertPaths(relativePaths);
        })
    );

    // 12. newSpec - 新規ディレクトリ＋SPECファイル作成
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.newSpec', async (_item?: FileItem) => {
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
                const config = vscode.workspace.getConfiguration('aiCodingSidebar');
                const defaultRelativePath = config.get<string>('plans.defaultRelativePath');
                if (!defaultRelativePath || defaultRelativePath.trim() === '') {
                    vscode.window.showErrorMessage('Default relative path is not configured');
                    return;
                }
                targetPath = path.join(workspaceRoot, defaultRelativePath);
            }

            const folderName = await vscode.window.showInputBox({
                prompt: 'Enter new folder name',
                placeHolder: 'Folder name',
                validateInput: (value) => {
                    if (!value || value.trim() === '') {
                        return 'Please enter a folder name';
                    }
                    if (value.match(/[<>:"|?*\/\\]/)) {
                        return 'Contains invalid characters: < > : " | ? * / \\';
                    }
                    const folderPath = path.join(targetPath, value.trim());
                    if (fs.existsSync(folderPath)) {
                        return `Folder "${value.trim()}" already exists`;
                    }
                    return null;
                }
            });

            if (!folderName || folderName.trim() === '') {
                return;
            }

            const trimmedFolderName = folderName.trim();
            const folderPath = path.join(targetPath, trimmedFolderName);

            try {
                fs.mkdirSync(folderPath, { recursive: true });
                vscode.window.showInformationMessage(`Created folder "${trimmedFolderName}"`);

                plansProvider.navigateToDirectory(folderPath);

                const now = new Date();
                const year = String(now.getFullYear());
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const hour = String(now.getHours()).padStart(2, '0');
                const minute = String(now.getMinutes()).padStart(2, '0');
                const second = String(now.getSeconds()).padStart(2, '0');

                const timestamp = `${year}_${month}${day}_${hour}${minute}_${second}`;
                const fileName = `${timestamp}_SPEC.md`;
                const filePath = path.join(folderPath, fileName);

                const relativeFilePath = workspaceRoot ? path.relative(workspaceRoot, filePath) : filePath;
                const relativeDirPath = workspaceRoot ? path.relative(workspaceRoot, folderPath) : folderPath;

                const variables = {
                    datetime: now.toLocaleString(),
                    filename: fileName,
                    timestamp: timestamp,
                    filepath: relativeFilePath,
                    dirpath: relativeDirPath
                };

                const content = loadTemplate(context, variables, 'spec');
                const result = await fileOperationService.createFile(filePath, content);

                if (result.success) {
                    plansProvider.refresh();
                    await new Promise(resolve => setTimeout(resolve, 300));
                    await editorProvider.showFile(filePath);
                    vscode.window.showInformationMessage(`Created spec file ${fileName} in "${trimmedFolderName}"`);
                } else {
                    vscode.window.showWarningMessage(`Folder created but failed to create spec file: ${result.error}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
            }
        })
    );
}
