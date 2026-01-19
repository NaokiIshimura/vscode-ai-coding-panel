import * as vscode from 'vscode';
import { CommandDependencies } from './types';
import { registerSettingsCommands } from './settings';
import { registerDocumentationCommands } from './documentation';
import { registerTerminalCommands } from './terminal';
import { registerPlansCommands } from './plans';
import { registerFilesCommands } from './files';

/**
 * 全てのコマンドを登録
 */
export function registerAllCommands(
    context: vscode.ExtensionContext,
    deps: CommandDependencies
): void {
    // 設定関連のコマンドを登録
    registerSettingsCommands(context, deps);

    // ドキュメント関連のコマンドを登録
    registerDocumentationCommands(context, deps);

    // ターミナル関連のコマンドを登録
    registerTerminalCommands(context, deps);

    // Plans関連のコマンドを登録
    registerPlansCommands(context, deps);

    // ファイル操作関連のコマンドを登録
    registerFilesCommands(context, deps);
}
