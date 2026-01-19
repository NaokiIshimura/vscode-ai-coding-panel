import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// サービスクラスのインポート
import { FileOperationService } from './services/FileOperationService';
import { TemplateService } from './services/TemplateService';
import { FileWatcherService } from './services/FileWatcherService';

// コマンド登録のインポート
import { registerAllCommands } from './commands';

// プロバイダーのインポート
import { PlansProvider, MenuProvider, EditorProvider, TerminalProvider, FileItem } from './providers';

// ユーティリティのインポート
import { setupSettingsJson, setupTemplate, setupClaudeFolder } from './utils/workspaceSetup';
import { loadTemplate } from './utils/templateUtils';

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Coding Panel activated');

    // サービスクラスの初期化
    const fileOperationService = new FileOperationService();
    const templateService = new TemplateService(context);

    // 共通のファイルウォッチャーサービスを作成
    const fileWatcherService = new FileWatcherService();
    context.subscriptions.push(fileWatcherService);

    // ステータスバーアイテムを作成
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(gear) AI Coding Panel Settings";
    statusBarItem.tooltip = "AI Coding Panel extension workspace settings";
    statusBarItem.command = "aiCodingSidebar.setupWorkspace";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // TreeDataProviderを作成
    const menuProvider = new MenuProvider();
    const plansProvider = new PlansProvider(fileWatcherService);
    const editorProvider = new EditorProvider(context.extensionUri);

    // EditorProviderをPlansProviderに設定
    plansProvider.setEditorProvider(editorProvider);
    // PlansProviderをEditorProviderに設定
    editorProvider.setDetailsProvider(plansProvider);
    editorProvider.setPlansProvider(plansProvider);

    // Terminal Providerを作成（EditorProviderに設定するため先に作成）
    const terminalProvider = new TerminalProvider(context.extensionUri);
    editorProvider.setTerminalProvider(terminalProvider);

    // プロジェクトルートを設定
    const initializeWithWorkspaceRoot = async () => {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

        // 設定から相対パスを取得
        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
        const defaultRelativePath = config.get<string>('plans.defaultRelativePath');

        let targetPath: string;
        let relativePath: string | undefined;

        if (defaultRelativePath && defaultRelativePath.trim()) {
            // 相対パスを絶対パスに変換
            relativePath = defaultRelativePath.trim();
            targetPath = path.resolve(workspaceRoot, relativePath);
        } else {
            // ワークスペースルートを使用
            targetPath = workspaceRoot;
            relativePath = undefined;
        }

        plansProvider.setRootPath(targetPath, relativePath);
    };

    // ビューを登録
    const menuView = vscode.window.createTreeView('workspaceSettings', {
        treeDataProvider: menuProvider,
        showCollapseAll: false
    });

    const treeView = vscode.window.createTreeView('aiCodingSidebarExplorer', {
        treeDataProvider: plansProvider,
        showCollapseAll: true,
        canSelectMany: false,
        dragAndDropController: plansProvider
    });

    // TreeViewをProviderに設定
    plansProvider.setTreeView(treeView);

    // 初期状態でリスナーを有効化
    plansProvider.handleVisibilityChange(treeView.visible);

    // ビューの可視性変更を監視
    treeView.onDidChangeVisibility(() => {
        plansProvider.handleVisibilityChange(treeView.visible);
    });

    // Markdown Editor Viewを登録
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            EditorProvider.viewType,
            editorProvider
        )
    );

    // Terminal Viewを登録
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            TerminalProvider.viewType,
            terminalProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

    // 初期化を実行
    initializeWithWorkspaceRoot();


    // 初期化後にルートフォルダを選択状態にする
    setTimeout(async () => {
        const currentRootPath = plansProvider.getRootPath();
        if (currentRootPath) {
            await selectInitialFolder(treeView, currentRootPath);
        }
    }, 500);

    // フォルダ/ファイル選択時の処理
    treeView.onDidChangeSelection(async (e) => {
        if (e.selection.length > 0) {
            const selectedItem = e.selection[0];
            plansProvider.setSelectedItem(selectedItem);

            // ファイルの場合（Markdownファイル）
            if (!selectedItem.isDirectory && selectedItem.filePath.endsWith('.md')) {
                // ファイル名がYYYY_MMDD_HHMM_SS_(PROMPT|TASK|SPEC).md形式の場合はMarkdown Editorで開く
                const fileName = path.basename(selectedItem.filePath);
                const timestampPattern = /^\d{4}_\d{4}_\d{4}_\d{2}_(PROMPT|TASK|SPEC)\.md$/;

                if (timestampPattern.test(fileName)) {
                    // タイムスタンプ形式の場合はMarkdown Editorで開く
                    await editorProvider.showFile(selectedItem.filePath);
                } else {
                    // それ以外は通常のエディタで開く
                    const fileUri = vscode.Uri.file(selectedItem.filePath);
                    await vscode.commands.executeCommand('vscode.open', fileUri);
                }
            }
        }
    });

    // ビューを有効化
    vscode.commands.executeCommand('setContext', 'aiCodingSidebarView:enabled', true);

    // 全てのコマンドを登録
    const commandDeps = {
        plansProvider,
        editorProvider,
        terminalProvider,
        fileOperationService,
        templateService,
        treeView
    };
    registerAllCommands(context, commandDeps);

    // プロバイダーのリソースクリーンアップを登録
    context.subscriptions.push({
        dispose: () => {
            plansProvider.dispose();
            editorProvider.dispose();
        }
    });
}

// 初期フォルダを選択する関数
async function selectInitialFolder(treeView: vscode.TreeView<FileItem>, rootPath: string): Promise<void> {
    try {
        // プロジェクトルートのFileItemを作成
        const rootItem = new FileItem(
            path.basename(rootPath),
            vscode.TreeItemCollapsibleState.Expanded,
            rootPath,
            true,
            0,
            new Date(),
            new Date()
        );

        // ルートフォルダを選択状態にする
        await treeView.reveal(rootItem, { select: true, focus: false, expand: true });
    } catch (error) {
        console.log('Failed to select initial folder:', error);
    }
}

export function deactivate() { }
