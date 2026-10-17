import * as vscode from 'vscode';
import { CommandDependencies } from './types';
import { registerSettingsCommands } from './settings';
import { registerDocumentationCommands } from './documentation';
import { registerTerminalCommands } from './terminal';
import { registerBrowserCommands } from './browser';
import { registerPlansCommands } from './plans';
import { registerFilesCommands } from './files';
import { registerTemplatesCommands } from './templates';

/**
 * Register all commands
 */
export function registerAllCommands(
    context: vscode.ExtensionContext,
    deps: CommandDependencies
): void {
    // Register settings-related commands
    registerSettingsCommands(context, deps);

    // Register documentation-related commands
    registerDocumentationCommands(context, deps);

    // Register terminal-related commands
    registerTerminalCommands(context, deps);

    // Register browser-related commands
    registerBrowserCommands(context, deps);

    // Register Plans-related commands
    registerPlansCommands(context, deps);

    // Register file operation commands
    registerFilesCommands(context, deps);

    // Register prompt template commands
    registerTemplatesCommands(context, deps);
}
