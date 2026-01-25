import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('nacn.ai-coding-sidebar'));
	});

	test('Extension should activate', async () => {
		const ext = vscode.extensions.getExtension('nacn.ai-coding-sidebar');
		assert.ok(ext);
		await ext!.activate();
		assert.strictEqual(ext!.isActive, true);
	});

	test('All commands should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		const expectedCommands = [
			'aiCodingSidebar.refresh',
			'aiCodingSidebar.showInPanel',
			'aiCodingSidebar.openFolder',
			'aiCodingSidebar.goToParent',
			'aiCodingSidebar.setRelativePath',
			'aiCodingSidebar.openSettings',
			'aiCodingSidebar.createMarkdownFile',
			'aiCodingSidebar.createTaskFile',
			'aiCodingSidebar.createSpecFile',
			'aiCodingSidebar.openTerminal',
		];

		expectedCommands.forEach(cmd => {
			assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
		});
	});

	test('Settings commands should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		const settingsCommands = [
			'aiCodingSidebar.openSettings',
			'aiCodingSidebar.openPlansSettings',
			'aiCodingSidebar.openEditorSettings',
			'aiCodingSidebar.openTerminalSettings',
			'aiCodingSidebar.openUserSettings',
			'aiCodingSidebar.openWorkspaceSettings',
		];

		settingsCommands.forEach(cmd => {
			assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
		});
	});

	test('Documentation commands should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		const docCommands = [
			'aiCodingSidebar.openDocumentation',
			'aiCodingSidebar.openGettingStarted',
			'aiCodingSidebar.openPlansViewGuide',
			'aiCodingSidebar.openEditorViewGuide',
			'aiCodingSidebar.openTerminalViewGuide',
			'aiCodingSidebar.openKeyboardShortcuts',
		];

		docCommands.forEach(cmd => {
			assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
		});
	});

	test('File operation commands should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		const fileCommands = [
			'aiCodingSidebar.createMarkdownFile',
			'aiCodingSidebar.createTaskFile',
			'aiCodingSidebar.createSpecFile',
			'aiCodingSidebar.createFile',
			'aiCodingSidebar.createFolder',
			'aiCodingSidebar.rename',
			'aiCodingSidebar.delete',
			'aiCodingSidebar.copyRelativePath',
			'aiCodingSidebar.openInEditor',
			'aiCodingSidebar.insertPathToEditor',
			'aiCodingSidebar.insertPathToTerminal',
		];

		fileCommands.forEach(cmd => {
			assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
		});
	});

	test('Terminal commands should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		const terminalCommands = [
			'aiCodingSidebar.openTerminal',
			'aiCodingSidebar.terminalClear',
			'aiCodingSidebar.terminalKill',
			'aiCodingSidebar.terminalNew',
		];

		terminalCommands.forEach(cmd => {
			assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
		});
	});

	test('Plans commands should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		const plansCommands = [
			'aiCodingSidebar.refresh',
			'aiCodingSidebar.showInPanel',
			'aiCodingSidebar.openFolder',
			'aiCodingSidebar.goToParent',
			'aiCodingSidebar.setRelativePath',
			'aiCodingSidebar.navigateToDirectory',
			'aiCodingSidebar.createDefaultPath',
			'aiCodingSidebar.archiveDirectory',
		];

		plansCommands.forEach(cmd => {
			assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
		});
	});
});

suite('End-to-End Test Suite', () => {
	test('Extension should load and activate successfully', async () => {
		const ext = vscode.extensions.getExtension('nacn.ai-coding-sidebar');
		assert.ok(ext, 'Extension should be installed');

		await ext!.activate();
		assert.strictEqual(ext!.isActive, true, 'Extension should activate');
	});

	test('Extension should register all providers', async () => {
		const ext = vscode.extensions.getExtension('nacn.ai-coding-sidebar');
		await ext!.activate();

		// プロバイダーが登録されていることを確認
		// WebViewプロバイダーの確認は難しいため、コマンドの存在で代用
		const commands = await vscode.commands.getCommands(true);

		// Plans View関連のコマンドが登録されている
		assert.ok(commands.includes('aiCodingSidebar.refresh'));

		// Editor View関連のコマンドが登録されている（暗黙的にプロバイダーも登録されている）
		assert.ok(commands.includes('aiCodingSidebar.createMarkdownFile'));

		// Terminal View関連のコマンドが登録されている
		assert.ok(commands.includes('aiCodingSidebar.openTerminal'));
	});

	test('Extension should load configuration', async () => {
		const ext = vscode.extensions.getExtension('nacn.ai-coding-sidebar');
		await ext!.activate();

		// 設定値を取得
		const config = vscode.workspace.getConfiguration('aiCodingSidebar');

		// デフォルト値が存在することを確認
		const defaultPath = config.get('plans.defaultRelativePath');
		assert.ok(defaultPath !== undefined, 'Default path configuration should exist');
	});

	test('Commands should execute without errors', async () => {
		const ext = vscode.extensions.getExtension('nacn.ai-coding-sidebar');
		await ext!.activate();

		// 一部のコマンドを実行してエラーが発生しないことを確認
		// 注: WebViewが初期化されていないため、一部のコマンドは効果がない場合がある

		// refreshコマンドを実行
		await assert.doesNotReject(async () => {
			await vscode.commands.executeCommand('aiCodingSidebar.refresh');
		}, 'Refresh command should not throw error');
	});
});
