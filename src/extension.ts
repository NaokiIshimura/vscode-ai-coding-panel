import * as vscode from 'vscode';
import * as path from 'path';

// Service class imports
import { FileOperationService } from './services/FileOperationService';
import { TemplateService } from './services/TemplateService';
import { PromptTemplateService } from './services/PromptTemplateService';
import { FileWatcherService } from './services/FileWatcherService';

// Command registration imports
import { registerAllCommands } from './commands';

// Provider imports
import { PlansProvider, MenuProvider, EditorProvider, TerminalProvider } from './providers';

export function activate(context: vscode.ExtensionContext) {
    // Initialize service classes
    const fileOperationService = new FileOperationService();
    const templateService = new TemplateService(context);
    const promptTemplateService = new PromptTemplateService(context, templateService);

    // Create the shared file watcher service
    const fileWatcherService = new FileWatcherService();
    context.subscriptions.push(fileWatcherService);

    // Create the status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(gear) AI Coding Panel Settings";
    statusBarItem.tooltip = "AI Coding Panel extension workspace settings";
    statusBarItem.command = "aiCodingSidebar.setupWorkspace";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Create the TreeDataProvider
    const menuProvider = new MenuProvider();
    const plansProvider = new PlansProvider(fileWatcherService, context.extensionUri);
    const editorProvider = new EditorProvider(context.extensionUri, templateService, promptTemplateService);

    // Set the EditorProvider on the PlansProvider
    plansProvider.setEditorProvider(editorProvider);
    // Set the PlansProvider on the EditorProvider
    editorProvider.setDetailsProvider(plansProvider);
    editorProvider.setPlansProvider(plansProvider);

    // Create the Terminal Provider (created first so it can be set on the EditorProvider)
    const terminalProvider = new TerminalProvider(context.extensionUri);
    editorProvider.setTerminalProvider(terminalProvider);
    terminalProvider.setEditorProvider(editorProvider);
    terminalProvider.setPlansProvider(plansProvider);

    // Set the project root
    const initializeWithWorkspaceRoot = async () => {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

        // Get the relative path from settings
        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
        const defaultRelativePath = config.get<string>('plans.defaultRelativePath');

        let targetPath: string;
        let relativePath: string | undefined;

        if (defaultRelativePath && defaultRelativePath.trim()) {
            // Convert the relative path to an absolute path
            relativePath = defaultRelativePath.trim();
            targetPath = path.resolve(workspaceRoot, relativePath);
        } else {
            // Use the workspace root
            targetPath = workspaceRoot;
            relativePath = undefined;
        }

        await plansProvider.setRootPath(targetPath, relativePath);
    };

    // Register the views
    context.subscriptions.push(
        vscode.window.createTreeView('workspaceSettings', {
            treeDataProvider: menuProvider,
            showCollapseAll: false
        })
    );

    // Register the Plans View
    // Visibility monitoring and click handling are done inside PlansProvider
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

    // Register the Markdown Editor View
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            EditorProvider.viewType,
            editorProvider
        )
    );

    // Register the Terminal View
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

    // Run initialization
    initializeWithWorkspaceRoot();

    // Enable the views
    vscode.commands.executeCommand('setContext', 'aiCodingSidebarView:enabled', true);

    // Register all commands
    const commandDeps = {
        plansProvider,
        editorProvider,
        terminalProvider,
        fileOperationService,
        templateService,
        promptTemplateService
    };
    registerAllCommands(context, commandDeps);

    // Register resource cleanup for the providers
    context.subscriptions.push({
        dispose: () => {
            plansProvider.dispose();
            editorProvider.dispose();
        }
    });
}

export function deactivate() { }
