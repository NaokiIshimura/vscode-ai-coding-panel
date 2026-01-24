import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CommandDependencies } from './types';
import { FileItem } from '../providers';
import { loadTemplate } from '../utils/templateUtils';
import { ConfigurationProvider } from '../services/ConfigurationProvider';

/**
 * Plans関連のコマンドを登録
 */
export function registerPlansCommands(
    context: vscode.ExtensionContext,
    deps: CommandDependencies
): void {
    const { plansProvider, editorProvider, fileOperationService, treeView } = deps;
    const configProvider = new ConfigurationProvider();

    // 1. refresh - ビューの更新
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.refresh', () => {
            plansProvider.refresh();
        })
    );

    // 2. showInPanel - 下ペイン表示（互換性のために残す）
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.showInPanel', async (item: FileItem) => {
            if (item && item.isDirectory) {
                plansProvider.setActiveFolder(item.filePath);
            }
        })
    );

    // 3. openFolder - フォルダを開く（互換性のために残す）
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.openFolder', async (folderPath: string) => {
            plansProvider.setActiveFolder(folderPath);
        })
    );

    // 4. goToParent - 親フォルダへ移動
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.goToParent', async () => {
            const currentPath = plansProvider.getRootPath();
            if (currentPath) {
                const parentPath = path.dirname(currentPath);

                // プロジェクトルートより上には移動しない
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (workspaceRoot && parentPath.startsWith(workspaceRoot) && parentPath !== currentPath) {
                    await plansProvider.setRootPath(parentPath);
                } else {
                    vscode.window.showInformationMessage('No parent folder available');
                }
            }
        })
    );

    // 5. setRelativePath - 相対パスの設定
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.setRelativePath', async () => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const currentPath = plansProvider.getRootPath() || workspaceRoot;

            // 現在のパスから相対パスを計算
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
                    // 空文字または'.'の場合はワークスペースルート
                    targetPath = workspaceRoot;
                } else {
                    // 相対パスを絶対パスに変換
                    targetPath = path.resolve(workspaceRoot, trimmedPath);
                }

                // パスの存在確認（エラーでも続行）
                let pathExists = false;
                let isDirectory = false;

                try {
                    const stat = fs.statSync(targetPath);
                    pathExists = true;
                    isDirectory = stat.isDirectory();
                } catch (error) {
                    // パスが存在しない場合でも続行
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

                // パスを設定（存在しなくても設定）
                await plansProvider.setRootPath(targetPath);

                // 設定に保存するかユーザーに確認
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

                // 設定したフォルダを選択状態にする（存在する場合のみ）
                if (pathExists) {
                    setTimeout(async () => {
                        await selectInitialFolder(treeView, targetPath);
                    }, 300);
                }
            }
        })
    );

    // 6. createFolder - フォルダ作成
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.createFolder', async (item?: FileItem) => {
            let targetPath: string;

            // 優先順位に従って作成先を決定
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

            // フォルダ名をユーザーに入力してもらう
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

    // 7. addDirectory - ディレクトリ追加（右クリックメニュー用）
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

                plansProvider.refresh();
                await plansProvider.revealDirectory(folderPath);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
            }
        })
    );

    // 8. newDirectory - 新規ディレクトリ＋TASKファイル作成
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

                // TASKファイルを作成
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

    // 9. renameDirectory - ディレクトリ名変更
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.renameDirectory', async (item?: FileItem) => {
            if (!item || !item.isDirectory) {
                vscode.window.showErrorMessage('No directory is selected');
                return;
            }
            await vscode.commands.executeCommand('aiCodingSidebar.rename', item);
        })
    );

    // 10. deleteDirectory - ディレクトリ削除
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.deleteDirectory', async (item?: FileItem) => {
            if (!item || !item.isDirectory) {
                vscode.window.showErrorMessage('No directory is selected');
                return;
            }
            await vscode.commands.executeCommand('aiCodingSidebar.delete', item);
        })
    );

    // 11. archiveDirectory - ディレクトリアーカイブ
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

            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }

            const defaultRelativePath = configProvider.getDefaultRelativePath();
            if (!defaultRelativePath) {
                vscode.window.showErrorMessage('Default task path is not configured');
                return;
            }

            const defaultTasksPath = path.join(workspaceRoot, defaultRelativePath);
            const archivedDirPath = path.join(defaultTasksPath, 'archived');
            const originalName = path.basename(targetPath);

            try {
                if (!fs.existsSync(archivedDirPath)) {
                    const result = await fileOperationService.createDirectory(archivedDirPath);
                    if (!result.success) {
                        throw result.error || new Error('Failed to create archived directory');
                    }
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create archived directory: ${error}`);
                return;
            }

            let destPath = path.join(archivedDirPath, originalName);
            let finalName = originalName;
            let hasConflict = false;

            if (fs.existsSync(destPath)) {
                hasConflict = true;
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const hour = String(now.getHours()).padStart(2, '0');
                const minute = String(now.getMinutes()).padStart(2, '0');
                const second = String(now.getSeconds()).padStart(2, '0');
                const timestamp = `${year}${month}${day}_${hour}${minute}${second}`;
                finalName = `${originalName}_${timestamp}`;
                destPath = path.join(archivedDirPath, finalName);
            }

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

    // 12. createDefaultPath - デフォルトパスの作成
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.createDefaultPath', async (targetPath: string, relativePath?: string) => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace is open');
                return;
            }

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

            try {
                fs.mkdirSync(targetPath, { recursive: true });

                const displayPath = relativePath || path.relative(workspaceRoot, targetPath);
                vscode.window.showInformationMessage(`Created directory: ${displayPath}`);

                await plansProvider.setRootPath(targetPath, relativePath);

                setTimeout(async () => {
                    await selectInitialFolder(treeView, targetPath);
                }, 300);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create directory: ${error}`);
            }
        })
    );

    // 13. navigateToDirectory - ディレクトリ移動
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingSidebar.navigateToDirectory', (targetPath: string) => {
            if (targetPath) {
                plansProvider.navigateToDirectory(targetPath);
            }
        })
    );
}

/**
 * 初期フォルダを選択する関数
 */
async function selectInitialFolder(treeView: vscode.TreeView<FileItem>, rootPath: string): Promise<void> {
    try {
        const rootItem = new FileItem(
            path.basename(rootPath),
            vscode.TreeItemCollapsibleState.Expanded,
            rootPath,
            true,
            0,
            new Date(),
            new Date()
        );

        await treeView.reveal(rootItem, { select: true, focus: false, expand: true });
    } catch (error) {
        console.log('Failed to select initial folder:', error);
    }
}
