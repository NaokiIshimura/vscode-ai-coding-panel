import * as vscode from 'vscode';
import { PlansProvider, EditorProvider, TerminalProvider } from '../providers';
import { FileOperationService } from '../services/FileOperationService';
import { TemplateService } from '../services/TemplateService';

/**
 * コマンド登録時に必要な依存関係
 */
export interface CommandDependencies {
    plansProvider: PlansProvider;
    editorProvider: EditorProvider;
    terminalProvider: TerminalProvider;
    fileOperationService: FileOperationService;
    templateService: TemplateService;
    treeView: vscode.TreeView<any>;
}
