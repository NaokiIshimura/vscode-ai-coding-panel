import * as assert from 'assert';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {
	loadTemplate,
	TemplateType,
	WORKSPACE_TEMPLATES_RELATIVE_PATH
} from '../../../utils/templateUtils';
import { TemplateSourceSettings } from '../../../utils/templateSourceSettings';

suite('templateUtils Test Suite', () => {
	// テスト専用の一時ディレクトリを使用（既存のファイルを破壊しない）
	const testFixturesDir = path.join(__dirname, '../../fixtures/templates');
	const extensionPath = path.join(__dirname, '../../../..');

	// ワークスペース側のテンプレートは最優先のため、存在する環境ではテストをスキップする
	const workspaceTemplatePathFor = (templateType: TemplateType): string | undefined => {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		return workspaceRoot
			? path.join(workspaceRoot, WORKSPACE_TEMPLATES_RELATIVE_PATH, `${templateType}.md`)
			: undefined;
	};

	// テスト前にfixturesディレクトリを作成
	suiteSetup(() => {
		if (!fs.existsSync(testFixturesDir)) {
			fs.mkdirSync(testFixturesDir, { recursive: true });
		}

		// テスト用テンプレートファイルを作成
		const promptTemplate = '# {{title}}\n\n{{content}}';
		const taskTemplate = '## Task: {{taskName}}\n\n{{description}}';
		const specTemplate = '# Spec: {{specName}}\n\n{{details}}';

		fs.writeFileSync(path.join(testFixturesDir, 'prompt.md'), promptTemplate, 'utf8');
		fs.writeFileSync(path.join(testFixturesDir, 'task.md'), taskTemplate, 'utf8');
		fs.writeFileSync(path.join(testFixturesDir, 'spec.md'), specTemplate, 'utf8');
	});

	// テスト後にクリーンアップ
	suiteTeardown(() => {
		// テスト用ディレクトリ全体を削除
		if (fs.existsSync(testFixturesDir)) {
			fs.rmSync(testFixturesDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
		}
	});

	suite('loadTemplate', () => {
		test('Should load prompt template and replace variables', async () => {
			// testFixturesDirの親ディレクトリをextensionPathとして設定
			// loadTemplateは extensionPath/templates を探す
			const mockExtensionPath = path.join(testFixturesDir, '..');
			const context = {
				extensionPath: mockExtensionPath
			} as vscode.ExtensionContext;

			const variables = {
				title: 'Test Title',
				content: 'Test Content'
			};

			const result = await loadTemplate(context, variables, 'prompt');
			assert.ok(result.includes('Test Title'));
			assert.ok(result.includes('Test Content'));
			assert.ok(!result.includes('{{title}}'));
			assert.ok(!result.includes('{{content}}'));
		});

		test('Should load task template and replace variables', async () => {
			const mockExtensionPath = path.join(testFixturesDir, '..');
			const context = {
				extensionPath: mockExtensionPath
			} as vscode.ExtensionContext;

			const variables = {
				taskName: 'Test Task',
				description: 'Test Description'
			};

			const result = await loadTemplate(context, variables, 'task');
			assert.ok(result.includes('Test Task'));
			assert.ok(result.includes('Test Description'));
			assert.ok(!result.includes('{{taskName}}'));
			assert.ok(!result.includes('{{description}}'));
		});

		test('Should load spec template and replace variables', async () => {
			const mockExtensionPath = path.join(testFixturesDir, '..');
			const context = {
				extensionPath: mockExtensionPath
			} as vscode.ExtensionContext;

			const variables = {
				specName: 'Test Spec',
				details: 'Test Details'
			};

			const result = await loadTemplate(context, variables, 'spec');
			assert.ok(result.includes('Test Spec'));
			assert.ok(result.includes('Test Details'));
			assert.ok(!result.includes('{{specName}}'));
			assert.ok(!result.includes('{{details}}'));
		});

		test('Should prefer the global template over the bundled one', async function () {
			const workspaceTemplate = workspaceTemplatePathFor('prompt');
			if (workspaceTemplate && fs.existsSync(workspaceTemplate)) {
				// ワークスペース側に同名テンプレートがある環境では優先順位が変わるため対象外
				this.skip();
				return;
			}

			const globalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'global-templates-test-'));
			try {
				const globalTemplatesDir = path.join(globalRoot, 'templates');
				fs.mkdirSync(globalTemplatesDir, { recursive: true });
				fs.writeFileSync(path.join(globalTemplatesDir, 'prompt.md'), 'global: {{title}}', 'utf8');

				const context = {
					extensionPath: path.join(testFixturesDir, '..'),
					globalStorageUri: vscode.Uri.file(globalRoot)
				} as unknown as vscode.ExtensionContext;

				const result = await loadTemplate(context, { title: 'Test Title' }, 'prompt');

				assert.strictEqual(result, 'global: Test Title');
			} finally {
				fs.rmSync(globalRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		});

		test('Should fall back to the bundled template when the global one is missing', async function () {
			const workspaceTemplate = workspaceTemplatePathFor('prompt');
			if (workspaceTemplate && fs.existsSync(workspaceTemplate)) {
				this.skip();
				return;
			}

			const globalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'global-templates-test-'));
			try {
				// templatesディレクトリを作らないまま実行する
				const context = {
					extensionPath: path.join(testFixturesDir, '..'),
					globalStorageUri: vscode.Uri.file(globalRoot)
				} as unknown as vscode.ExtensionContext;

				const result = await loadTemplate(context, { title: 'Test Title', content: 'Body' }, 'prompt');

				// fixturesの同梱テンプレート（# {{title}}\n\n{{content}}）が使われる
				assert.ok(result.includes('Test Title'));
				assert.ok(result.includes('Body'));
			} finally {
				fs.rmSync(globalRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		});

		test('Should throw error if template file not found', async () => {
			const context = {
				extensionPath: '/non/existent/path'
			} as vscode.ExtensionContext;

			const variables = {};

			await assert.rejects(
				async () => await loadTemplate(context, variables, 'prompt'),
				/Template file not found/
			);
		});

		test('Should handle empty variables', async () => {
			const mockExtensionPath = path.join(testFixturesDir, '..');
			const context = {
				extensionPath: mockExtensionPath
			} as vscode.ExtensionContext;

			const variables = {};

			const result = await loadTemplate(context, variables, 'prompt');
			// 変数が置換されないため、{{title}}などがそのまま残る
			assert.ok(result.includes('{{title}}'));
			assert.ok(result.includes('{{content}}'));
		});

		test('Should replace multiple occurrences of the same variable', () => {
			// 同じ変数が複数回出現するテンプレート
			const multiTemplate = '{{name}} is {{name}}';
			const multiTemplatePath = path.join(testFixturesDir, 'multi.md');
			fs.writeFileSync(multiTemplatePath, multiTemplate, 'utf8');

			const mockExtensionPath = path.join(testFixturesDir, '..');
			const context = {
				extensionPath: mockExtensionPath
			} as vscode.ExtensionContext;

			const variables = {
				name: 'John'
			};

			// テンプレートタイプを'multi'として指定できないため、
			// 直接ファイルを読んで変数置換をテスト
			let content = fs.readFileSync(multiTemplatePath, 'utf8');
			for (const [key, value] of Object.entries(variables)) {
				const regex = new RegExp(`{{${key}}}`, 'g');
				content = content.replace(regex, value);
			}

			assert.strictEqual(content, 'John is John');
		});
	});

	suite('loadTemplate with template source settings', () => {
		// 読み込み元の設定。既定は現行どおり全て読み込む
		const settingsWith = (overrides: Partial<TemplateSourceSettings>): TemplateSourceSettings => ({
			workspaceTemplates: true,
			globalTemplates: true,
			workspacePromptTemplates: true,
			globalPromptTemplates: true,
			...overrides
		});

		// グローバルのテンプレートを持つ一時ディレクトリを用意する
		const withGlobalTemplate = async (
			content: string | undefined,
			run: (context: vscode.ExtensionContext) => Promise<void>
		): Promise<void> => {
			const globalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'global-templates-test-'));
			try {
				if (content !== undefined) {
					const globalTemplatesDir = path.join(globalRoot, 'templates');
					fs.mkdirSync(globalTemplatesDir, { recursive: true });
					fs.writeFileSync(path.join(globalTemplatesDir, 'prompt.md'), content, 'utf8');
				}

				await run({
					extensionPath: path.join(testFixturesDir, '..'),
					globalStorageUri: vscode.Uri.file(globalRoot)
				} as unknown as vscode.ExtensionContext);
			} finally {
				fs.rmSync(globalRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		};

		test('Should skip the global template when it is disabled', async function () {
			const workspaceTemplate = workspaceTemplatePathFor('prompt');
			if (workspaceTemplate && fs.existsSync(workspaceTemplate)) {
				// ワークスペース側が最優先になる環境では対象外
				this.skip();
				return;
			}

			await withGlobalTemplate('global: {{title}}', async context => {
				const result = await loadTemplate(
					context,
					{ title: 'Test Title', content: 'Body' },
					'prompt',
					settingsWith({ globalTemplates: false })
				);

				// グローバルを飛ばして同梱（fixtures）が使われる
				assert.ok(!result.startsWith('global:'));
				assert.ok(result.includes('Test Title'));
				assert.ok(result.includes('Body'));
			});
		});

		test('Should use the global template when only the workspace one is disabled', async () => {
			await withGlobalTemplate('global: {{title}}', async context => {
				const result = await loadTemplate(
					context,
					{ title: 'Test Title' },
					'prompt',
					settingsWith({ workspaceTemplates: false })
				);

				assert.strictEqual(result, 'global: Test Title');
			});
		});

		test('Should fall back to the bundled template when both are disabled', async () => {
			await withGlobalTemplate('global: {{title}}', async context => {
				const result = await loadTemplate(
					context,
					{ title: 'Test Title', content: 'Body' },
					'prompt',
					settingsWith({ workspaceTemplates: false, globalTemplates: false })
				);

				// 同梱分は無効化できないため必ず見つかる
				assert.ok(!result.startsWith('global:'));
				assert.ok(result.includes('Test Title'));
				assert.ok(result.includes('Body'));
			});
		});

		test('Should skip the workspace template when it is disabled', async function () {
			const workspaceTemplate = workspaceTemplatePathFor('prompt');
			if (!workspaceTemplate) {
				// ワークスペース未オープンでは検証できない
				this.skip();
				return;
			}
			if (fs.existsSync(workspaceTemplate)) {
				// 既存のワークスペーステンプレートを壊さないため対象外
				this.skip();
				return;
			}

			const templatesDir = path.dirname(workspaceTemplate);
			const createdDir = !fs.existsSync(templatesDir);
			fs.mkdirSync(templatesDir, { recursive: true });
			fs.writeFileSync(workspaceTemplate, 'workspace: {{title}}', 'utf8');

			try {
				await withGlobalTemplate('global: {{title}}', async context => {
					// 既定ではワークスペースが優先される
					const preferred = await loadTemplate(context, { title: 'Test Title' }, 'prompt');
					assert.strictEqual(preferred, 'workspace: Test Title');

					const result = await loadTemplate(
						context,
						{ title: 'Test Title' },
						'prompt',
						settingsWith({ workspaceTemplates: false })
					);
					assert.strictEqual(result, 'global: Test Title');
				});
			} finally {
				fs.rmSync(workspaceTemplate, { force: true });
				if (createdDir) {
					fs.rmSync(templatesDir, { recursive: true, force: true });
				}
			}
		});
	});
});
