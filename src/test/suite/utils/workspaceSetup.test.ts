import * as assert from 'assert';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { setupSettingsJson, setupTemplate, setupGlobalTemplate, setupClaudeFolder } from '../../../utils/workspaceSetup';

suite('workspaceSetup Test Suite', () => {
	const testWorkspaceRoot = path.join(__dirname, '../../fixtures/testWorkspace');

	// Create the test workspace before the tests
	suiteSetup(() => {
		if (!fs.existsSync(testWorkspaceRoot)) {
			fs.mkdirSync(testWorkspaceRoot, { recursive: true });
		}
	});

	// Clean up after each test
	teardown(() => {
		// Remove the .vscode directory (with retries to handle file locks on Windows)
		const vscodeDir = path.join(testWorkspaceRoot, '.vscode');
		if (fs.existsSync(vscodeDir)) {
			try {
				fs.rmSync(vscodeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			} catch (error) {
				// On Windows the File Watcher holds a lock, so allow the removal to fail
				if (process.platform === 'win32') {
					console.warn(`Warning: Could not remove ${vscodeDir}:`, error);
				} else {
					throw error;
				}
			}
		}

		// Remove the .claude directory
		const claudeDir = path.join(testWorkspaceRoot, '.claude');
		if (fs.existsSync(claudeDir)) {
			try {
				fs.rmSync(claudeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			} catch (error) {
				// On Windows the File Watcher holds a lock, so allow the removal to fail
				if (process.platform === 'win32') {
					console.warn(`Warning: Could not remove ${claudeDir}:`, error);
				} else {
					throw error;
				}
			}
		}
	});

	// Remove the test workspace after the tests
	suiteTeardown(() => {
		if (fs.existsSync(testWorkspaceRoot)) {
			try {
				fs.rmSync(testWorkspaceRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			} catch (error) {
				// On Windows the File Watcher holds a lock, so allow the removal to fail
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
			// Create existing settings
			const vscodeDir = path.join(testWorkspaceRoot, '.vscode');
			fs.mkdirSync(vscodeDir, { recursive: true });

			const settingsPath = path.join(vscodeDir, 'settings.json');
			const existingSettings = {
				'editor.fontSize': 14,
				'editor.tabSize': 2
			};
			fs.writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2), 'utf8');

			// Run setupSettingsJson
			await setupSettingsJson(testWorkspaceRoot);

			// Read the settings
			const content = fs.readFileSync(settingsPath, 'utf8');
			const settings = JSON.parse(content);

			// Check that the existing settings are kept
			assert.strictEqual(settings['editor.fontSize'], 14);
			assert.strictEqual(settings['editor.tabSize'], 2);

			// Check that the new settings are added
			assert.ok(settings.hasOwnProperty('aiCodingSidebar.plans.defaultRelativePath'));
		});

		test('Should handle malformed settings.json gracefully', async () => {
			// Create an invalid JSON file
			const vscodeDir = path.join(testWorkspaceRoot, '.vscode');
			fs.mkdirSync(vscodeDir, { recursive: true });

			const settingsPath = path.join(vscodeDir, 'settings.json');
			fs.writeFileSync(settingsPath, 'invalid json content', 'utf8');

			// Run setupSettingsJson (verify that it does not throw)
			await setupSettingsJson(testWorkspaceRoot);

			// Verify that the settings file is rewritten as valid JSON
			const content = fs.readFileSync(settingsPath, 'utf8');
			assert.doesNotThrow(() => JSON.parse(content));
		});
	});

	suite('setupTemplate', () => {
		test('Should create templates directory', async () => {
			// Use a test fixture directory (to protect the actual project files)
			const testExtensionPath = path.join(__dirname, '../../fixtures/testExtension');
			const extensionTemplatesDir = path.join(testExtensionPath, 'templates');

			// Create a mock extension context
			const context = {
				extensionPath: testExtensionPath
			} as vscode.ExtensionContext;

			// Create the test template directory and files
			if (!fs.existsSync(extensionTemplatesDir)) {
				fs.mkdirSync(extensionTemplatesDir, { recursive: true });
			}
			fs.writeFileSync(path.join(extensionTemplatesDir, 'task.md'), '# Task Template', 'utf8');
			fs.writeFileSync(path.join(extensionTemplatesDir, 'spec.md'), '# Spec Template', 'utf8');
			fs.writeFileSync(path.join(extensionTemplatesDir, 'prompt.md'), '# Prompt Template', 'utf8');
			fs.writeFileSync(path.join(extensionTemplatesDir, 'quick_start.md'), '# Quick Start Template', 'utf8');

			try {
				await setupTemplate(context, testWorkspaceRoot);

				const templatesDir = path.join(testWorkspaceRoot, '.vscode', 'ai-coding-panel', 'templates');
				assert.ok(fs.existsSync(templatesDir));

				// Verify that all 4 template files are copied
				for (const templateFile of ['task.md', 'spec.md', 'prompt.md', 'quick_start.md']) {
					assert.ok(
						fs.existsSync(path.join(templatesDir, templateFile)),
						`Template file not copied: ${templateFile}`
					);
				}
			} finally {
				// Clean up only the test directory (the actual project files are protected)
				if (fs.existsSync(testExtensionPath)) {
					try {
						fs.rmSync(testExtensionPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
					} catch (error) {
						// On Windows the File Watcher holds a lock, so allow the removal to fail
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

	suite('setupGlobalTemplate', () => {
		// Treat a temporary directory as extensionPath to replace the bundled templates
		const withGlobalFixture = async (
			run: (context: vscode.ExtensionContext, globalTemplatesDir: string) => Promise<void>
		): Promise<void> => {
			const testExtensionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'global-template-ext-'));
			const globalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'global-template-root-'));

			try {
				const extensionTemplatesDir = path.join(testExtensionPath, 'templates');
				fs.mkdirSync(extensionTemplatesDir, { recursive: true });
				fs.writeFileSync(path.join(extensionTemplatesDir, 'task.md'), '# Task Template', 'utf8');
				fs.writeFileSync(path.join(extensionTemplatesDir, 'spec.md'), '# Spec Template', 'utf8');
				fs.writeFileSync(path.join(extensionTemplatesDir, 'prompt.md'), '# Prompt Template', 'utf8');
				fs.writeFileSync(path.join(extensionTemplatesDir, 'quick_start.md'), '# Quick Start Template', 'utf8');

				const context = {
					extensionPath: testExtensionPath,
					globalStorageUri: vscode.Uri.file(globalRoot)
				} as unknown as vscode.ExtensionContext;

				await run(context, path.join(globalRoot, 'templates'));
			} finally {
				for (const dir of [testExtensionPath, globalRoot]) {
					try {
						fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
					} catch (error) {
						if (process.platform === 'win32') {
							console.warn(`Warning: Could not remove ${dir}:`, error);
						} else {
							throw error;
						}
					}
				}
			}
		};

		test('Should copy all template files into the global directory', async function () {
			const configured = vscode.workspace
				.getConfiguration('aiCodingSidebar')
				.get<string>('globalTemplatesPath', '');
			if (configured && configured.trim()) {
				// Skipped when the destination is overridden by the settings
				this.skip();
				return;
			}

			await withGlobalFixture(async (context, globalTemplatesDir) => {
				await setupGlobalTemplate(context);

				assert.ok(fs.existsSync(globalTemplatesDir));

				for (const templateFile of ['task.md', 'spec.md', 'prompt.md', 'quick_start.md']) {
					assert.ok(
						fs.existsSync(path.join(globalTemplatesDir, templateFile)),
						`Template file not copied: ${templateFile}`
					);
				}
			});
		});

		test('Should not overwrite an existing template file', async function () {
			const configured = vscode.workspace
				.getConfiguration('aiCodingSidebar')
				.get<string>('globalTemplatesPath', '');
			if (configured && configured.trim()) {
				this.skip();
				return;
			}

			await withGlobalFixture(async (context, globalTemplatesDir) => {
				fs.mkdirSync(globalTemplatesDir, { recursive: true });
				fs.writeFileSync(path.join(globalTemplatesDir, 'task.md'), '# Customized', 'utf8');

				await setupGlobalTemplate(context);

				assert.strictEqual(
					fs.readFileSync(path.join(globalTemplatesDir, 'task.md'), 'utf8'),
					'# Customized'
				);
				// The other files are copied
				assert.ok(fs.existsSync(path.join(globalTemplatesDir, 'prompt.md')));
			});
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
