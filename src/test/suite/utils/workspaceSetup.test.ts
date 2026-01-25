import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { setupSettingsJson, setupTemplate, setupClaudeFolder } from '../../../utils/workspaceSetup';

suite('workspaceSetup Test Suite', () => {
	const testWorkspaceRoot = path.join(__dirname, '../../fixtures/testWorkspace');

	// テスト前にテストワークスペースを作成
	suiteSetup(() => {
		if (!fs.existsSync(testWorkspaceRoot)) {
			fs.mkdirSync(testWorkspaceRoot, { recursive: true });
		}
	});

	// 各テスト後にクリーンアップ
	teardown(() => {
		// .vscodeディレクトリを削除（Windowsでのファイルロック対策としてリトライを追加）
		const vscodeDir = path.join(testWorkspaceRoot, '.vscode');
		if (fs.existsSync(vscodeDir)) {
			try {
				fs.rmSync(vscodeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			} catch (error) {
				// Windows環境ではFile Watcherがロックしているため、削除失敗を許容
				if (process.platform === 'win32') {
					console.warn(`Warning: Could not remove ${vscodeDir}:`, error);
				} else {
					throw error;
				}
			}
		}

		// .claudeディレクトリを削除
		const claudeDir = path.join(testWorkspaceRoot, '.claude');
		if (fs.existsSync(claudeDir)) {
			try {
				fs.rmSync(claudeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			} catch (error) {
				// Windows環境ではFile Watcherがロックしているため、削除失敗を許容
				if (process.platform === 'win32') {
					console.warn(`Warning: Could not remove ${claudeDir}:`, error);
				} else {
					throw error;
				}
			}
		}
	});

	// テスト後にテストワークスペースを削除
	suiteTeardown(() => {
		if (fs.existsSync(testWorkspaceRoot)) {
			try {
				fs.rmSync(testWorkspaceRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			} catch (error) {
				// Windows環境ではFile Watcherがロックしているため、削除失敗を許容
				if (process.platform === 'win32') {
					console.warn(`Warning: Could not remove ${testWorkspaceRoot}:`, error);
				} else {
					throw error;
				}
			}
		}
	});

	suite('setupSettingsJson', () => {
		test('Should create .vscode directory if not exists', async () => {
			await setupSettingsJson(testWorkspaceRoot);

			const vscodeDir = path.join(testWorkspaceRoot, '.vscode');
			assert.ok(fs.existsSync(vscodeDir));
		});

		test('Should create settings.json with default configuration', async () => {
			await setupSettingsJson(testWorkspaceRoot);

			const settingsPath = path.join(testWorkspaceRoot, '.vscode', 'settings.json');
			assert.ok(fs.existsSync(settingsPath));

			const content = fs.readFileSync(settingsPath, 'utf8');
			const settings = JSON.parse(content);

			assert.ok(settings.hasOwnProperty('aiCodingSidebar.plans.defaultRelativePath'));
			assert.strictEqual(settings['aiCodingSidebar.plans.defaultRelativePath'], '.claude');
		});

		test('Should preserve existing settings when updating', async () => {
			// 既存の設定を作成
			const vscodeDir = path.join(testWorkspaceRoot, '.vscode');
			fs.mkdirSync(vscodeDir, { recursive: true });

			const settingsPath = path.join(vscodeDir, 'settings.json');
			const existingSettings = {
				'editor.fontSize': 14,
				'editor.tabSize': 2
			};
			fs.writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2), 'utf8');

			// setupSettingsJsonを実行
			await setupSettingsJson(testWorkspaceRoot);

			// 設定を読み込み
			const content = fs.readFileSync(settingsPath, 'utf8');
			const settings = JSON.parse(content);

			// 既存の設定が保持されているか確認
			assert.strictEqual(settings['editor.fontSize'], 14);
			assert.strictEqual(settings['editor.tabSize'], 2);

			// 新しい設定が追加されているか確認
			assert.ok(settings.hasOwnProperty('aiCodingSidebar.plans.defaultRelativePath'));
		});

		test('Should handle malformed settings.json gracefully', async () => {
			// 不正なJSONファイルを作成
			const vscodeDir = path.join(testWorkspaceRoot, '.vscode');
			fs.mkdirSync(vscodeDir, { recursive: true });

			const settingsPath = path.join(vscodeDir, 'settings.json');
			fs.writeFileSync(settingsPath, 'invalid json content', 'utf8');

			// setupSettingsJsonを実行（エラーをスローしないことを確認）
			await setupSettingsJson(testWorkspaceRoot);

			// 設定ファイルが正しいJSON形式で書き直されていることを確認
			const content = fs.readFileSync(settingsPath, 'utf8');
			assert.doesNotThrow(() => JSON.parse(content));
		});
	});

	suite('setupTemplate', () => {
		test('Should create templates directory', async () => {
			// テスト用のフィクスチャディレクトリを使用（実際のプロジェクトファイルを保護）
			const testExtensionPath = path.join(__dirname, '../../fixtures/testExtension');
			const extensionTemplatesDir = path.join(testExtensionPath, 'templates');

			// モックの拡張機能コンテキストを作成
			const context = {
				extensionPath: testExtensionPath
			} as vscode.ExtensionContext;

			// テスト用のテンプレートディレクトリとファイルを作成
			if (!fs.existsSync(extensionTemplatesDir)) {
				fs.mkdirSync(extensionTemplatesDir, { recursive: true });
			}
			fs.writeFileSync(path.join(extensionTemplatesDir, 'task.md'), '# Task Template', 'utf8');
			fs.writeFileSync(path.join(extensionTemplatesDir, 'spec.md'), '# Spec Template', 'utf8');
			fs.writeFileSync(path.join(extensionTemplatesDir, 'prompt.md'), '# Prompt Template', 'utf8');

			try {
				await setupTemplate(context, testWorkspaceRoot);

				const templatesDir = path.join(testWorkspaceRoot, '.vscode', 'ai-coding-panel', 'templates');
				assert.ok(fs.existsSync(templatesDir));
			} finally {
				// テスト用ディレクトリのみをクリーンアップ（実際のプロジェクトファイルは保護）
				if (fs.existsSync(testExtensionPath)) {
					try {
						fs.rmSync(testExtensionPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
					} catch (error) {
						// Windows環境ではFile Watcherがロックしているため、削除失敗を許容
						if (process.platform === 'win32') {
							console.warn(`Warning: Could not remove ${testExtensionPath}:`, error);
						} else {
							throw error;
						}
					}
				}
			}
		});
	});

	suite('setupClaudeFolder', () => {
		test('Should create .claude directory', async () => {
			await setupClaudeFolder(testWorkspaceRoot);

			const claudeDir = path.join(testWorkspaceRoot, '.claude');
			assert.ok(fs.existsSync(claudeDir));
		});

		test('Should create settings.json with .claude configuration', async () => {
			await setupClaudeFolder(testWorkspaceRoot);

			const settingsPath = path.join(testWorkspaceRoot, '.vscode', 'settings.json');
			assert.ok(fs.existsSync(settingsPath));

			const content = fs.readFileSync(settingsPath, 'utf8');
			const settings = JSON.parse(content);

			assert.ok(settings.hasOwnProperty('aiCodingSidebar.plans.defaultRelativePath'));
			assert.strictEqual(settings['aiCodingSidebar.plans.defaultRelativePath'], '.claude');
		});
	});
});
