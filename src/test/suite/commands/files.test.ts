import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Files Commands Test Suite', () => {
	test('createMarkdownFile command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.createMarkdownFile'));
	});

	test('createTaskFile command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.createTaskFile'));
	});

	test('createSpecFile command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.createSpecFile'));
	});

	test('createFile command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.createFile'));
	});

	test('createFolder command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.createFolder'));
	});

	test('rename command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.rename'));
	});

	test('delete command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.delete'));
	});

	test('copyRelativePath command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.copyRelativePath'));
	});

	test('openInEditor command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.openInEditor'));
	});

	test('insertPathToEditor command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.insertPathToEditor'));
	});

	test('insertPathToTerminal command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.insertPathToTerminal'));
	});
});
