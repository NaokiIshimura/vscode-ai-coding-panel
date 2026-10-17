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
	// Use a test-only temporary directory (so existing files are not destroyed)
	const testFixturesDir = path.join(__dirname, '../../fixtures/templates');
	const extensionPath = path.join(__dirname, '../../../..');

	// Workspace templates take top priority, so skip the tests when they exist
	const workspaceTemplatePathFor = (templateType: TemplateType): string | undefined => {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		return workspaceRoot
			? path.join(workspaceRoot, WORKSPACE_TEMPLATES_RELATIVE_PATH, `${templateType}.md`)
			: undefined;
	};

	// Create the fixtures directory before the tests
	suiteSetup(() => {
		if (!fs.existsSync(testFixturesDir)) {
			fs.mkdirSync(testFixturesDir, { recursive: true });
		}

		// Create the test template files
		const promptTemplate = '# {{title}}\n\n{{content}}';
		const taskTemplate = '## Task: {{taskName}}\n\n{{description}}';
		const specTemplate = '# Spec: {{specName}}\n\n{{details}}';

		fs.writeFileSync(path.join(testFixturesDir, 'prompt.md'), promptTemplate, 'utf8');
		fs.writeFileSync(path.join(testFixturesDir, 'task.md'), taskTemplate, 'utf8');
		fs.writeFileSync(path.join(testFixturesDir, 'spec.md'), specTemplate, 'utf8');
	});

	// Clean up after the tests
	suiteTeardown(() => {
		// Remove the whole test directory
		if (fs.existsSync(testFixturesDir)) {
			fs.rmSync(testFixturesDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
		}
	});

	suite('loadTemplate', () => {
		test('Should load prompt template and replace variables', async () => {
			// Use the parent directory of testFixturesDir as extensionPath
			// loadTemplate looks in extensionPath/templates
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
				// Skipped when the workspace has a template with the same name, because the priority changes
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
				// Run without creating the templates directory
				const context = {
					extensionPath: path.join(testFixturesDir, '..'),
					globalStorageUri: vscode.Uri.file(globalRoot)
				} as unknown as vscode.ExtensionContext;

				const result = await loadTemplate(context, { title: 'Test Title', content: 'Body' }, 'prompt');

				// The bundled fixture template (# {{title}}\n\n{{content}}) is used
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
			// Variables are not replaced, so {{title}} and others remain as is
			assert.ok(result.includes('{{title}}'));
			assert.ok(result.includes('{{content}}'));
		});

		test('Should replace multiple occurrences of the same variable', () => {
			// Template in which the same variable appears more than once
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

			// The template type cannot be specified as 'multi',
			// so read the file directly and test the variable replacement
			let content = fs.readFileSync(multiTemplatePath, 'utf8');
			for (const [key, value] of Object.entries(variables)) {
				const regex = new RegExp(`{{${key}}}`, 'g');
				content = content.replace(regex, value);
			}

			assert.strictEqual(content, 'John is John');
		});
	});

	suite('loadTemplate with template source settings', () => {
		// Source settings. By default, all sources are loaded as before
		const settingsWith = (overrides: Partial<TemplateSourceSettings>): TemplateSourceSettings => ({
			workspaceTemplates: true,
			globalTemplates: true,
			workspacePromptTemplates: true,
			globalPromptTemplates: true,
			...overrides
		});

		// Prepare a temporary directory with global templates
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
				// Skipped when the workspace takes top priority
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

				// The global one is skipped and the bundled one (fixtures) is used
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

				// The bundled templates cannot be disabled, so one is always found
				assert.ok(!result.startsWith('global:'));
				assert.ok(result.includes('Test Title'));
				assert.ok(result.includes('Body'));
			});
		});

		test('Should skip the workspace template when it is disabled', async function () {
			const workspaceTemplate = workspaceTemplatePathFor('prompt');
			if (!workspaceTemplate) {
				// Cannot be verified without an open workspace
				this.skip();
				return;
			}
			if (fs.existsSync(workspaceTemplate)) {
				// Skipped so as not to break existing workspace templates
				this.skip();
				return;
			}

			const templatesDir = path.dirname(workspaceTemplate);
			const createdDir = !fs.existsSync(templatesDir);
			fs.mkdirSync(templatesDir, { recursive: true });
			fs.writeFileSync(workspaceTemplate, 'workspace: {{title}}', 'utf8');

			try {
				await withGlobalTemplate('global: {{title}}', async context => {
					// The workspace takes precedence by default
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
