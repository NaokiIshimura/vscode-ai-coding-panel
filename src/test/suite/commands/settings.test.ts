import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Settings Commands Test Suite', () => {
	test('openSettings command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.openSettings'));
	});

	test('openPlansSettings command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.openPlansSettings'));
	});

	test('openEditorSettings command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.openEditorSettings'));
	});

	test('openTerminalSettings command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.openTerminalSettings'));
	});

	test('openUserSettings command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.openUserSettings'));
	});

	test('openWorkspaceSettings command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.openWorkspaceSettings'));
	});
});
