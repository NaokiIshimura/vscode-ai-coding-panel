import * as assert from 'assert';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { PromptTemplateService } from '../../../services/PromptTemplateService';
import { TemplateService } from '../../../services/TemplateService';

suite('PromptTemplateService Test Suite', () => {
	let promptTemplateService: PromptTemplateService;
	let extensionPath: string;
	let bundledDir: string;

	// 拡張機能の同梱テンプレートを差し替えるため、一時ディレクトリをextensionPathに見立てる
	const createService = (): PromptTemplateService => {
		const context = { extensionPath: extensionPath } as vscode.ExtensionContext;
		return new PromptTemplateService(context, new TemplateService());
	};

	setup(() => {
		extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-templates-test-'));
		bundledDir = path.join(extensionPath, 'resources', 'prompt-templates');
		fs.mkdirSync(bundledDir, { recursive: true });

		promptTemplateService = createService();
	});

	teardown(() => {
		fs.rmSync(extensionPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
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

			// 表示名にH1を使った場合でも本文は加工しない
			assert.strictEqual(templates[0].body, content);
		});
	});

	suite('renderTemplate', () => {
		const buildTemplate = (body: string) => ({
			id: 'sample',
			label: 'Sample',
			description: 'sample.md',
			body: body,
			filePath: '/tmp/sample.md'
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
				// ワークスペースが開かれている環境では作成先が決まるため対象外
				this.skip();
				return;
			}

			await assert.rejects(() => promptTemplateService.createWorkspaceTemplate('refactor'));
		});
	});

	suite('setupWorkspaceTemplates', () => {
		test('Should return undefined when no workspace is open', async function () {
			if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
				// ワークスペースが開かれている環境ではコピー先が決まるため対象外
				this.skip();
				return;
			}

			const result = await promptTemplateService.setupWorkspaceTemplates();

			assert.strictEqual(result, undefined);
		});
	});
});
