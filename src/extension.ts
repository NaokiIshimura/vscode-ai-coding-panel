import * as vscode from 'vscode';
import * as path from 'path';

// サービスクラスのインポート
import { FileOperationService } from './services/FileOperationService';
import { TemplateService } from './services/TemplateService';
import { FileWatcherService } from './services/FileWatcherService';

// コマンド登録のインポート
import { registerAllCommands } from './commands';

// プロバイダーのインポート
import { PlansProvider, MenuProvider, EditorProvider, TerminalProvider } from './providers';

export function activate(context: vscode.ExtensionContext) {
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
    const plansProvider = new PlansProvider(fileWatcherService, context.extensionUri);
    const editorProvider = new EditorProvider(context.extensionUri);

    // EditorProviderをPlansProviderに設定
    plansProvider.setEditorProvider(editorProvider);
    // PlansProviderをEditorProviderに設定
    editorProvider.setDetailsProvider(plansProvider);
    editorProvider.setPlansProvider(plansProvider);

    // Terminal Providerを作成（EditorProviderに設定するため先に作成）
    const terminalProvider = new TerminalProvider(context.extensionUri);
    editorProvider.setTerminalProvider(terminalProvider);
    terminalProvider.setEditorProvider(editorProvider);
    terminalProvider.setPlansProvider(plansProvider);

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

        await plansProvider.setRootPath(targetPath, relativePath);
    };

    // ビューを登録
    context.subscriptions.push(
        vscode.window.createTreeView('workspaceSettings', {
            treeDataProvider: menuProvider,
            showCollapseAll: false
        })
    );

    // Plans Viewを登録
    // 可視性の監視とクリック時の処理はPlansProvider内部で行う
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            PlansProvider.viewType,
            plansProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

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

    // ビューを有効化
    vscode.commands.executeCommand('setContext', 'aiCodingSidebarView:enabled', true);

    // 全てのコマンドを登録
    const commandDeps = {
        plansProvider,
        editorProvider,
        terminalProvider,
        fileOperationService,
        templateService
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

export function deactivate() { }
