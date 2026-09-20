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

	// 設定でグローバル配置先が差し替えられている環境ではglobalStorageUriが使われない
	const isGlobalPathConfigured = (): boolean => {
		const configured = vscode.workspace
			.getConfiguration('aiCodingSidebar')
			.get<string>('globalTemplatesPath', '');
		return !!(configured && configured.trim());
	};

	// 読み込み元の設定。既定は現行どおり全て読み込む
	const settingsWith = (overrides: Partial<TemplateSourceSettings> = {}): TemplateSourceSettings => ({
		workspaceTemplates: true,
		globalTemplates: true,
		workspacePromptTemplates: true,
		globalPromptTemplates: true,
		...overrides
	});

	// 拡張機能の同梱テンプレートとグローバル配置先を差し替えるため、一時ディレクトリを使う
	// 設定は実際の設定値ではなく引数で差し替える（テストが環境設定に依存しないようにするため）
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

			// 表示名にH1を使った場合でも本文は加工しない
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

			// ユーザー定義が1件でもあれば同梱分は混ぜない
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
				// 既存のワークスペーステンプレートを壊さないため、未作成の場合のみ実行する
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

				// ワークスペース分→グローバル分の順。同名はワークスペースを残す
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
				// ワークスペース側にテンプレートがある環境では同梱分をコピーしない仕様のため対象外
				this.skip();
				return;
			}

			fs.writeFileSync(path.join(bundledDir, 'refactor.md'), '# Refactor', 'utf8');

			await promptTemplateService.createGlobalTemplate('my snippet');

			// 1件作った瞬間に同梱分が一覧から消えないようコピーされる
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

				// ワークスペースには存在するがグローバルには無いため作成できる
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

			// 有効な読み込み元が空になるため同梱分へフォールバックする
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
				// 既存のワークスペーステンプレートを壊さないため、未作成の場合のみ実行する
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

				// 同名で隠れていたグローバル分が表示される
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

				// ワークスペース分は一覧に出ないため、グローバルへの初回作成では同梱分をコピーする
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
