import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Documentation Commands Test Suite', () => {
	test('openDocumentation command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.openDocumentation'));
	});

	test('openGettingStarted command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.openGettingStarted'));
	});

	test('openPlansViewGuide command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.openPlansViewGuide'));
	});

	test('openEditorViewGuide command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.openEditorViewGuide'));
	});

	test('openTerminalViewGuide command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.openTerminalViewGuide'));
	});

	test('openKeyboardShortcuts command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('aiCodingSidebar.openKeyboardShortcuts'));
	});
});
