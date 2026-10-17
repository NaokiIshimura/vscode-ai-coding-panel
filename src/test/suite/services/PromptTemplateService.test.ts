import * as assert from 'assert';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { PromptTemplate, PromptTemplateService } from '../../../services/PromptTemplateService';
import { TemplateService } from '../../../services/TemplateService';
import { TemplateSourceSettings } from '../../../utils/templateSourceSettings';

suite('PromptTemplateService Test Suite', () => {
	let promptTemplateService: PromptTemplateService;
	let extensionPath: string;
	let bundledDir: string;
	let globalRoot: string;
	let globalPromptsDir: string;

	// globalStorageUri is not used when the global location is overridden by the settings
	const isGlobalPathConfigured = (): boolean => {
		const configured = vscode.workspace
			.getConfiguration('aiCodingSidebar')
			.get<string>('globalTemplatesPath', '');
		return !!(configured && configured.trim());
	};

	// Source settings. By default, all sources are loaded as before
	const settingsWith = (overrides: Partial<TemplateSourceSettings> = {}): TemplateSourceSettings => ({
		workspaceTemplates: true,
		globalTemplates: true,
		workspacePromptTemplates: true,
		globalPromptTemplates: true,
		...overrides
	});

	// Use a temporary directory to replace the extension's bundled templates and the global location
	// Settings are replaced via arguments instead of actual values (so the tests do not depend on the environment)
	const createService = (
		overrides: Partial<TemplateSourceSettings> = {}
	): PromptTemplateService => {
		const context = {
			extensionPath: extensionPath,
			globalStorageUri: vscode.Uri.file(globalRoot)
		} as unknown as vscode.ExtensionContext;
		return new PromptTemplateService(
			context,
			new TemplateService(),
			() => settingsWith(overrides)
		);
	};

	setup(() => {
		extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-templates-test-'));
		bundledDir = path.join(extensionPath, 'resources', 'prompt-templates');
		fs.mkdirSync(bundledDir, { recursive: true });

		globalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-templates-global-'));
		globalPromptsDir = path.join(globalRoot, 'prompts');

		promptTemplateService = createService();
	});

	teardown(() => {
		for (const dir of [extensionPath, globalRoot]) {
			fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
		}
	});

	suite('listTemplates', () => {
		test('Should return an empty array when the directory does not exist', async () => {
			fs.rmSync(bundledDir, { recursive: true, force: true });

			const templates = await promptTemplateService.listTemplates();

			assert.strictEqual(templates.length, 0);
		});

		test('Should return an empty array when the directory has no markdown file', async () => {
			fs.writeFileSync(path.join(bundledDir, 'note.txt'), 'not a template', 'utf8');

			const templates = await promptTemplateService.listTemplates();

			assert.strictEqual(templates.length, 0);
		});

		test('Should sort templates by file name', async () => {
			fs.writeFileSync(path.join(bundledDir, 'c.md'), 'c', 'utf8');
			fs.writeFileSync(path.join(bundledDir, 'a.md'), 'a', 'utf8');
			fs.writeFileSync(path.join(bundledDir, 'b.md'), 'b', 'utf8');

			const templates = await promptTemplateService.listTemplates();

			assert.deepStrictEqual(templates.map(template => template.id), ['a', 'b', 'c']);
		});

		test('Should ignore sub directories', async () => {
			fs.mkdirSync(path.join(bundledDir, 'nested'), { recursive: true });
			fs.writeFileSync(path.join(bundledDir, 'nested', 'nested.md'), '# Nested', 'utf8');
			fs.writeFileSync(path.join(bundledDir, 'top.md'), '# Top', 'utf8');

			const templates = await promptTemplateService.listTemplates();

			assert.deepStrictEqual(templates.map(template => template.id), ['top']);
		});

		test('Should use the first H1 heading as the label', async () => {
			fs.writeFileSync(path.join(bundledDir, 'refactor.md'), '# Refactor code\n\nbody\n', 'utf8');

			const templates = await promptTemplateService.listTemplates();

			assert.strictEqual(templates[0].label, 'Refactor code');
			assert.strictEqual(templates[0].description, 'refactor.md');
		});

		test('Should skip leading empty lines when looking for the H1 heading', async () => {
			fs.writeFileSync(path.join(bundledDir, 'spaced.md'), '\n\n# Spaced heading\n\nbody\n', 'utf8');

			const templates = await promptTemplateService.listTemplates();

			assert.strictEqual(templates[0].label, 'Spaced heading');
		});

		test('Should fall back to the file name when there is no H1 heading', async () => {
			fs.writeFileSync(path.join(bundledDir, 'no_heading.md'), 'body only\n', 'utf8');

			const templates = await promptTemplateService.listTemplates();

			assert.strictEqual(templates[0].label, 'no_heading');
		});

		test('Should fall back to the file name when the first line is not an H1 heading', async () => {
			fs.writeFileSync(path.join(bundledDir, 'h2_only.md'), '## Sub heading\n\nbody\n', 'utf8');

			const templates = await promptTemplateService.listTemplates();

			assert.strictEqual(templates[0].label, 'h2_only');
		});

		test('Should keep the H1 heading in the body', async () => {
			const content = '# Refactor code\n\nRefactor {{filepath}}\n';
			fs.writeFileSync(path.join(bundledDir, 'refactor.md'), content, 'utf8');

			const templates = await promptTemplateService.listTemplates();

			// The body is not modified even when the H1 is used as the display name
			assert.strictEqual(templates[0].body, content);
		});
	});

	suite('renderTemplate', () => {
		const buildTemplate = (body: string): PromptTemplate => ({
			id: 'sample',
			label: 'Sample',
			description: 'sample.md',
			body: body,
			filePath: '/tmp/sample.md',
			origin: 'workspace'
		});

		test('Should replace file related variables with the current file', async () => {
			const filePath = path.join(extensionPath, 'plans', 'sample_PROMPT.md');
			const rendered = promptTemplateService.renderTemplate(
				buildTemplate('file: {{filename}}\npath: {{filepath}}\ndir: {{dirpath}}\n'),
				filePath
			);

			assert.ok(rendered.includes('file: sample_PROMPT.md'));
			assert.ok(rendered.includes(path.basename(filePath)));
			assert.ok(!rendered.includes('{{'));
		});

		test('Should replace file related variables with empty strings when no file is open', () => {
			const rendered = promptTemplateService.renderTemplate(
				buildTemplate('[{{filename}}][{{filepath}}][{{dirpath}}]')
			);

			assert.strictEqual(rendered, '[][][]');
		});

		test('Should replace datetime and timestamp variables', () => {
			const rendered = promptTemplateService.renderTemplate(
				buildTemplate('{{datetime}}\n{{timestamp}}')
			);

			const [datetime, timestamp] = rendered.split('\n');
			assert.ok(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(datetime));
			assert.ok(/^\d{4}_\d{4}_\d{4}_\d{2}$/.test(timestamp));
		});

		test('Should keep unknown variables as they are', () => {
			const rendered = promptTemplateService.renderTemplate(buildTemplate('{{unknown}}'));

			assert.strictEqual(rendered, '{{unknown}}');
		});

		test('Should keep the body unchanged when it has no variable', () => {
			const body = '# Refactor\n\nRefactor the code below.\n';
			const rendered = promptTemplateService.renderTemplate(buildTemplate(body));

			assert.strictEqual(rendered, body);
		});
	});

	suite('getBundledTemplatesDir', () => {
		test('Should point to resources/prompt-templates under the extension path', () => {
			assert.strictEqual(promptTemplateService.getBundledTemplatesDir(), bundledDir);
		});
	});

	suite('validateTemplateName', () => {
		test('Should reject an empty name', async () => {
			assert.ok(await promptTemplateService.validateTemplateName(''));
			assert.ok(await promptTemplateService.validateTemplateName('   '));
		});

		test('Should reject a name with a path separator', async () => {
			assert.ok(await promptTemplateService.validateTemplateName('nested/refactor'));
			assert.ok(await promptTemplateService.validateTemplateName('nested\\refactor'));
		});

		test('Should reject a name with a character that cannot be used in a file name', async () => {
			assert.ok(await promptTemplateService.validateTemplateName('refactor?'));
			assert.ok(await promptTemplateService.validateTemplateName('re:factor'));
		});

		test('Should reject a name that is only an extension', async () => {
			assert.ok(await promptTemplateService.validateTemplateName('.md'));
		});

		test('Should accept a valid name', async () => {
			assert.strictEqual(await promptTemplateService.validateTemplateName('refactor'), undefined);
			assert.strictEqual(await promptTemplateService.validateTemplateName('refactor.md'), undefined);
			assert.strictEqual(await promptTemplateService.validateTemplateName('add test'), undefined);
		});
	});

	suite('createWorkspaceTemplate', () => {
		test('Should throw an error when no workspace is open', async function () {
			if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
				// Skipped when a workspace is open, because the destination is determined
				this.skip();
				return;
			}

			await assert.rejects(() => promptTemplateService.createWorkspaceTemplate('refactor'));
		});
	});

	suite('setupWorkspaceTemplates', () => {
		test('Should return undefined when no workspace is open', async function () {
			if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
				// Skipped when a workspace is open, because the copy destination is determined
				this.skip();
				return;
			}

			const result = await promptTemplateService.setupWorkspaceTemplates();

			assert.strictEqual(result, undefined);
		});
	});

	suite('getGlobalTemplatesDir', () => {
		test('Should point to the prompts sub directory of the global root', function () {
			if (isGlobalPathConfigured()) {
				this.skip();
				return;
			}

			assert.strictEqual(promptTemplateService.getGlobalTemplatesDir(), globalPromptsDir);
		});
	});

	suite('listTemplates with global templates', () => {
		test('Should return global templates instead of the bundled ones', async function () {
			if (isGlobalPathConfigured()) {
				this.skip();
				return;
			}

			fs.writeFileSync(path.join(bundledDir, 'bundled.md'), '# Bundled', 'utf8');
			fs.mkdirSync(globalPromptsDir, { recursive: true });
			fs.writeFileSync(path.join(globalPromptsDir, 'shared.md'), '# Shared', 'utf8');

			const templates = await promptTemplateService.listTemplates();

			// If there is even one user-defined template, the bundled ones are not mixed in
			assert.deepStrictEqual(templates.map(template => template.id), ['shared']);
			assert.strictEqual(templates[0].origin, 'global');
		});

		test('Should mark a global template in the description', async function () {
			if (isGlobalPathConfigured()) {
				this.skip();
				return;
			}

			fs.mkdirSync(globalPromptsDir, { recursive: true });
			fs.writeFileSync(path.join(globalPromptsDir, 'shared.md'), '# Shared', 'utf8');

			const templates = await promptTemplateService.listTemplates();

			assert.strictEqual(templates[0].description, 'shared.md (global)');
		});

		test('Should prefer the workspace template when the same file name exists in both', async function () {
			const workspaceDir = promptTemplateService.getWorkspaceTemplatesDir();
			if (isGlobalPathConfigured() || !workspaceDir || fs.existsSync(workspaceDir)) {
				// Run only when not created yet, so as not to break existing workspace templates
				this.skip();
				return;
			}

			try {
				fs.mkdirSync(workspaceDir, { recursive: true });
				fs.writeFileSync(path.join(workspaceDir, 'shared.md'), '# Workspace shared', 'utf8');
				fs.writeFileSync(path.join(workspaceDir, 'only_workspace.md'), '# Only workspace', 'utf8');

				fs.mkdirSync(globalPromptsDir, { recursive: true });
				fs.writeFileSync(path.join(globalPromptsDir, 'shared.md'), '# Global shared', 'utf8');
				fs.writeFileSync(path.join(globalPromptsDir, 'only_global.md'), '# Only global', 'utf8');

				const templates = await promptTemplateService.listTemplates();

				// Workspace ones first, then global ones. For the same name, the workspace one is kept
				assert.deepStrictEqual(
					templates.map(template => template.id),
					['only_workspace', 'shared', 'only_global']
				);

				const shared = templates.find(template => template.id === 'shared');
				assert.strictEqual(shared?.origin, 'workspace');
				assert.strictEqual(shared?.body, '# Workspace shared');
			} finally {
				fs.rmSync(workspaceDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		});
	});

	suite('setupGlobalTemplates', () => {
		test('Should copy the bundled templates into the global directory', async function () {
			if (isGlobalPathConfigured()) {
				this.skip();
				return;
			}

			fs.writeFileSync(path.join(bundledDir, 'refactor.md'), '# Refactor', 'utf8');
			fs.writeFileSync(path.join(bundledDir, 'review.md'), '# Review', 'utf8');

			const result = await promptTemplateService.setupGlobalTemplates();

			assert.strictEqual(result, globalPromptsDir);
			assert.ok(fs.existsSync(path.join(globalPromptsDir, 'refactor.md')));
			assert.ok(fs.existsSync(path.join(globalPromptsDir, 'review.md')));
		});

		test('Should not overwrite an existing template', async function () {
			if (isGlobalPathConfigured()) {
				this.skip();
				return;
			}

			fs.writeFileSync(path.join(bundledDir, 'refactor.md'), '# Refactor', 'utf8');
			fs.mkdirSync(globalPromptsDir, { recursive: true });
			fs.writeFileSync(path.join(globalPromptsDir, 'refactor.md'), '# Customized', 'utf8');

			await promptTemplateService.setupGlobalTemplates();

			assert.strictEqual(
				fs.readFileSync(path.join(globalPromptsDir, 'refactor.md'), 'utf8'),
				'# Customized'
			);
		});
	});

	suite('createGlobalTemplate', () => {
		test('Should create a template with an H1 heading', async function () {
			if (isGlobalPathConfigured()) {
				this.skip();
				return;
			}

			const filePath = await promptTemplateService.createGlobalTemplate('my snippet');

			assert.strictEqual(filePath, path.join(globalPromptsDir, 'my snippet.md'));
			assert.strictEqual(fs.readFileSync(filePath, 'utf8'), '# my snippet\n\n');
		});

		test('Should copy the bundled templates when there is no user template yet', async function () {
			const workspaceDir = promptTemplateService.getWorkspaceTemplatesDir();
			if (isGlobalPathConfigured() || (workspaceDir && fs.existsSync(workspaceDir))) {
				// Skipped when the workspace has templates, because the bundled ones are not copied in that case by design
				this.skip();
				return;
			}

			fs.writeFileSync(path.join(bundledDir, 'refactor.md'), '# Refactor', 'utf8');

			await promptTemplateService.createGlobalTemplate('my snippet');

			// Copied so that the bundled ones do not disappear from the list as soon as one is created
			assert.ok(fs.existsSync(path.join(globalPromptsDir, 'refactor.md')));
		});

		test('Should reject a duplicated name', async function () {
			if (isGlobalPathConfigured()) {
				this.skip();
				return;
			}

			await promptTemplateService.createGlobalTemplate('my snippet');

			await assert.rejects(() => promptTemplateService.createGlobalTemplate('my snippet'));
		});
	});

	suite('validateTemplateName with a target', () => {
		test('Should reject a name that already exists in the global directory', async function () {
			if (isGlobalPathConfigured()) {
				this.skip();
				return;
			}

			fs.mkdirSync(globalPromptsDir, { recursive: true });
			fs.writeFileSync(path.join(globalPromptsDir, 'shared.md'), '# Shared', 'utf8');

			assert.ok(await promptTemplateService.validateTemplateName('shared', 'global'));
		});

		test('Should accept a name that exists only in the other location', async function () {
			const workspaceDir = promptTemplateService.getWorkspaceTemplatesDir();
			if (isGlobalPathConfigured() || !workspaceDir || fs.existsSync(workspaceDir)) {
				this.skip();
				return;
			}

			try {
				fs.mkdirSync(workspaceDir, { recursive: true });
				fs.writeFileSync(path.join(workspaceDir, 'shared.md'), '# Shared', 'utf8');

				// Can be created because it exists in the workspace but not in the global location
				assert.strictEqual(
					await promptTemplateService.validateTemplateName('shared', 'global'),
					undefined
				);
				assert.ok(await promptTemplateService.validateTemplateName('shared', 'workspace'));
			} finally {
				fs.rmSync(workspaceDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		});
	});

	suite('listTemplates with disabled sources', () => {
		test('Should skip the global templates when they are disabled', async function () {
			if (isGlobalPathConfigured()) {
				this.skip();
				return;
			}

			fs.writeFileSync(path.join(bundledDir, 'bundled.md'), '# Bundled', 'utf8');
			fs.mkdirSync(globalPromptsDir, { recursive: true });
			fs.writeFileSync(path.join(globalPromptsDir, 'shared.md'), '# Shared', 'utf8');

			const service = createService({ globalPromptTemplates: false });
			const templates = await service.listTemplates();

			// Falls back to the bundled ones because the enabled sources are empty
			assert.deepStrictEqual(templates.map(template => template.id), ['bundled']);
			assert.strictEqual(templates[0].origin, 'bundled');
		});

		test('Should fall back to the bundled templates when both sources are disabled', async function () {
			if (isGlobalPathConfigured()) {
				this.skip();
				return;
			}

			fs.writeFileSync(path.join(bundledDir, 'bundled.md'), '# Bundled', 'utf8');
			fs.mkdirSync(globalPromptsDir, { recursive: true });
			fs.writeFileSync(path.join(globalPromptsDir, 'shared.md'), '# Shared', 'utf8');

			const service = createService({
				workspacePromptTemplates: false,
				globalPromptTemplates: false
			});
			const templates = await service.listTemplates();

			assert.deepStrictEqual(templates.map(template => template.id), ['bundled']);
		});

		test('Should show the global template that the workspace one hides when the workspace is disabled', async function () {
			const workspaceDir = promptTemplateService.getWorkspaceTemplatesDir();
			if (isGlobalPathConfigured() || !workspaceDir || fs.existsSync(workspaceDir)) {
				// Run only when not created yet, so as not to break existing workspace templates
				this.skip();
				return;
			}

			try {
				fs.mkdirSync(workspaceDir, { recursive: true });
				fs.writeFileSync(path.join(workspaceDir, 'shared.md'), '# Workspace shared', 'utf8');

				fs.mkdirSync(globalPromptsDir, { recursive: true });
				fs.writeFileSync(path.join(globalPromptsDir, 'shared.md'), '# Global shared', 'utf8');

				const service = createService({ workspacePromptTemplates: false });
				const templates = await service.listTemplates();

				// The global one that was hidden by the same name is shown
				assert.deepStrictEqual(templates.map(template => template.id), ['shared']);
				assert.strictEqual(templates[0].origin, 'global');
				assert.strictEqual(templates[0].body, '# Global shared');
			} finally {
				fs.rmSync(workspaceDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		});

		test('Should copy the bundled templates when the only templates are in a disabled source', async function () {
			const workspaceDir = promptTemplateService.getWorkspaceTemplatesDir();
			if (isGlobalPathConfigured() || !workspaceDir || fs.existsSync(workspaceDir)) {
				this.skip();
				return;
			}

			try {
				fs.writeFileSync(path.join(bundledDir, 'bundled.md'), '# Bundled', 'utf8');
				fs.mkdirSync(workspaceDir, { recursive: true });
				fs.writeFileSync(path.join(workspaceDir, 'shared.md'), '# Workspace shared', 'utf8');

				// The workspace ones are not listed, so the first creation in the global location copies the bundled ones
				const service = createService({ workspacePromptTemplates: false });
				await service.createGlobalTemplate('new_one');

				assert.ok(fs.existsSync(path.join(globalPromptsDir, 'bundled.md')));

				const templates = await service.listTemplates();
				assert.deepStrictEqual(
					templates.map(template => template.id).sort(),
					['bundled', 'new_one']
				);
			} finally {
				fs.rmSync(workspaceDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		});
	});
});
