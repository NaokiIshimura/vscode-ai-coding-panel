import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TemplateService, TemplateVariables } from '../../../services/TemplateService';

suite('TemplateService Test Suite', () => {
	let templateService: TemplateService;

	setup(() => {
		templateService = new TemplateService();
	});

	suite('generateTimestamp', () => {
		test('Should generate timestamp in YYYY_MMDD_HHMM_SS format', () => {
			const timestamp = templateService.generateTimestamp();

			// タイムスタンプの形式を検証（例: 2026_0125_1411_58）
			const timestampRegex = /^\d{4}_\d{4}_\d{4}_\d{2}$/;
			assert.ok(timestampRegex.test(timestamp), `Timestamp ${timestamp} should match YYYY_MMDD_HHMM_SS format`);
		});

		test('Should generate different timestamps when called multiple times', async () => {
			const timestamp1 = templateService.generateTimestamp();
			// 1秒待機
			await new Promise(resolve => setTimeout(resolve, 1000));
			const timestamp2 = templateService.generateTimestamp();

			// 異なるタイムスタンプが生成されることを確認
			assert.notStrictEqual(timestamp1, timestamp2);
		});
	});

	suite('formatDateTime', () => {
		test('Should format datetime in YYYY/MM/DD HH:MM:SS format', () => {
			const datetime = templateService.formatDateTime();

			// 日時の形式を検証
			const datetimeRegex = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/;
			assert.ok(datetimeRegex.test(datetime), `Datetime ${datetime} should match YYYY/MM/DD HH:MM:SS format`);
		});

		test('Should include current year', () => {
			const datetime = templateService.formatDateTime();
			const currentYear = new Date().getFullYear();

			assert.ok(datetime.startsWith(String(currentYear)));
		});
	});

	suite('generateTemplateVariables', () => {
		test('Should generate template variables with correct structure', () => {
			const targetPath = '/test/path';
			const fileName = 'test.md';
			const timestamp = '2026_0125_1200_00';

			const variables = templateService.generateTemplateVariables(targetPath, fileName, timestamp);

			assert.ok(variables.datetime);
			assert.strictEqual(variables.filename, fileName);
			assert.strictEqual(variables.timestamp, timestamp);
			assert.ok(variables.filepath);
			assert.ok(variables.dirpath);
		});

		test('Should generate datetime in correct format', () => {
			const variables = templateService.generateTemplateVariables('/test', 'test.md', '2026_0125_1200_00');

			const datetimeRegex = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/;
			assert.ok(datetimeRegex.test(variables.datetime));
		});
	});

	suite('loadTemplate', () => {
		const testFixturesDir = path.join(__dirname, '../../fixtures/templates');

		setup(() => {
			// テスト用のテンプレートディレクトリを作成
			if (!fs.existsSync(testFixturesDir)) {
				fs.mkdirSync(testFixturesDir, { recursive: true });
			}
		});

		teardown(() => {
			// クリーンアップ
			if (fs.existsSync(testFixturesDir)) {
				fs.rmSync(testFixturesDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		});

		test('Should load default template when no template file exists', async () => {
			const variables: TemplateVariables = {
				datetime: '2026/01/25 12:00:00',
				filename: 'test.md',
				timestamp: '2026_0125_1200_00',
				filepath: 'test/test.md',
				dirpath: 'test'
			};

			const result = await templateService.loadTemplate(variables, 'prompt');

			// デフォルトテンプレートには変数が含まれているはず
			assert.ok(result.includes('test.md'));
			assert.ok(result.includes('2026/01/25 12:00:00'));
			assert.ok(result.includes('test'));
		});

		test('Should replace variables in template', async () => {
			const variables: TemplateVariables = {
				datetime: '2026/01/25 12:00:00',
				filename: 'test.md',
				timestamp: '2026_0125_1200_00',
				filepath: 'test/test.md',
				dirpath: 'test'
			};

			// テスト用のフィクスチャディレクトリを使用（実際のプロジェクトファイルを保護）
			const testExtensionPath = path.join(__dirname, '../../fixtures/testTemplateService');
			const templatePath = path.join(testExtensionPath, 'templates', 'prompt.md');

			// テスト用のtemplatesディレクトリを作成
			const templatesDir = path.dirname(templatePath);
			if (!fs.existsSync(templatesDir)) {
				fs.mkdirSync(templatesDir, { recursive: true });
			}

			// テンプレートを作成
			const templateContent = '# {{filename}}\n\nDate: {{datetime}}\nPath: {{filepath}}';
			fs.writeFileSync(templatePath, templateContent, 'utf8');

			try {
				const context = { extensionPath: testExtensionPath } as vscode.ExtensionContext;
				const serviceWithContext = new TemplateService(context);

				const result = await serviceWithContext.loadTemplate(variables, 'prompt');

				// 変数が置換されていることを確認
				assert.ok(result.includes('test.md'));
				assert.ok(result.includes('2026/01/25 12:00:00'));
				// filepathは相対パスに変換されるため、完全一致ではなく、ファイル名が含まれているかチェック
				assert.ok(result.includes('test.md'));

				// 変数プレースホルダーが残っていないことを確認
				assert.ok(!result.includes('{{filename}}'));
				assert.ok(!result.includes('{{datetime}}'));
				assert.ok(!result.includes('{{filepath}}'));
			} finally {
				// テスト用ディレクトリ全体をクリーンアップ（実際のプロジェクトファイルは保護）
				if (fs.existsSync(testExtensionPath)) {
					fs.rmSync(testExtensionPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
				}
			}
		});
	});

	suite('generatePromptFileName', () => {
		test('Should generate prompt filename with timestamp and PROMPT suffix', () => {
			const filename = templateService.generatePromptFileName();

			assert.ok(filename.endsWith('_PROMPT.md'));
			assert.ok(filename.match(/^\d{4}_\d{4}_\d{4}_\d{2}_PROMPT\.md$/));
		});
	});

	suite('generateTaskFileName', () => {
		test('Should generate task filename with timestamp and TASK suffix', () => {
			const filename = templateService.generateTaskFileName();

			assert.ok(filename.endsWith('_TASK.md'));
			assert.ok(filename.match(/^\d{4}_\d{4}_\d{4}_\d{2}_TASK\.md$/));
		});
	});

	suite('generateSpecFileName', () => {
		test('Should generate spec filename with timestamp and SPEC suffix', () => {
			const filename = templateService.generateSpecFileName();

			assert.ok(filename.endsWith('_SPEC.md'));
			assert.ok(filename.match(/^\d{4}_\d{4}_\d{4}_\d{2}_SPEC\.md$/));
		});
	});

	suite('appendSendHistoryLine', () => {
		const dateTime = '2026/09/06 21:27:29';

		test('Should create a new section when no history section exists', () => {
			const content = '# task\n\nDo something\n';

			const result = templateService.appendSendHistoryLine(content, 'run', dateTime);

			assert.strictEqual(result, '# task\n\nDo something\n\n## sent history\n- run : 2026/09/06 21:27:29\n');
		});

		test('Should append to the existing section without duplicating the heading', () => {
			const content = '# task\n\n## sent history\n- run : 2026/09/06 21:27:29\n';

			const result = templateService.appendSendHistoryLine(content, 'plan', '2026/09/06 21:31:02');

			assert.strictEqual(
				result,
				'# task\n\n## sent history\n- run : 2026/09/06 21:27:29\n- plan: 2026/09/06 21:31:02\n'
			);
			assert.strictEqual(result.split('## sent history').length - 1, 1);
		});

		test('Should add a newline when the content does not end with one', () => {
			const content = '# task';

			const result = templateService.appendSendHistoryLine(content, 'spec', dateTime);

			assert.strictEqual(result, '# task\n\n## sent history\n- spec: 2026/09/06 21:27:29\n');
		});

		test('Should keep the metadata section untouched', () => {
			const content = [
				'# task',
				'',
				'---',
				'',
				'# metadata',
				'dir     : .claude/plans/2026_0906_2116_17',
				'prompt  : 2026_0906_2116_17_QUICK_START.md',
				'datetime: 2026/09/06 21:16:17',
				''
			].join('\n');

			const result = templateService.appendSendHistoryLine(content, 'run', dateTime);

			assert.ok(result.includes('# metadata'));
			assert.ok(result.includes('dir     : .claude/plans/2026_0906_2116_17'));
			assert.ok(result.includes('prompt  : 2026_0906_2116_17_QUICK_START.md'));
			assert.ok(result.includes('datetime: 2026/09/06 21:16:17'));
			assert.ok(result.endsWith('## sent history\n- run : 2026/09/06 21:27:29\n'));
		});

		test('Should insert before a following section', () => {
			const content = '## sent history\n- run : 2026/09/06 21:27:29\n\n# notes\n\nmemo\n';

			const result = templateService.appendSendHistoryLine(content, 'spec', '2026/09/06 21:40:00');

			assert.strictEqual(
				result,
				'## sent history\n- run : 2026/09/06 21:27:29\n- spec: 2026/09/06 21:40:00\n\n# notes\n\nmemo\n'
			);
		});

		test('Should append the resume command after the timestamp', () => {
			const content = '# task\n';

			const result = templateService.appendSendHistoryLine(
				content,
				'run',
				dateTime,
				'claude --resume 0f1d2c3b-4a59-4687-8f0a-1b2c3d4e5f60'
			);

			assert.strictEqual(
				result,
				'# task\n\n## sent history\n- run : 2026/09/06 21:27:29 | claude --resume 0f1d2c3b-4a59-4687-8f0a-1b2c3d4e5f60\n'
			);
		});

		test('Should keep the existing format when no resume command is given', () => {
			const withUndefined = templateService.appendSendHistoryLine('', 'run', dateTime, undefined);
			const withEmpty = templateService.appendSendHistoryLine('', 'run', dateTime, '');

			assert.strictEqual(withUndefined, '## sent history\n- run : 2026/09/06 21:27:29\n');
			assert.strictEqual(withEmpty, '## sent history\n- run : 2026/09/06 21:27:29\n');
		});

		test('Should append the resume command to the existing section', () => {
			const content = '## sent history\n- run : 2026/09/06 21:27:29\n';

			const result = templateService.appendSendHistoryLine(
				content,
				'plan',
				'2026/09/06 21:31:02',
				'claude --resume 11111111-2222-4333-8444-555555555555'
			);

			assert.strictEqual(
				result,
				'## sent history\n- run : 2026/09/06 21:27:29\n- plan: 2026/09/06 21:31:02 | claude --resume 11111111-2222-4333-8444-555555555555\n'
			);
		});

		test('Should align the timestamp column for every command type', () => {
			const run = templateService.appendSendHistoryLine('', 'run', dateTime);
			const plan = templateService.appendSendHistoryLine('', 'plan', dateTime);
			const spec = templateService.appendSendHistoryLine('', 'spec', dateTime);

			assert.strictEqual(run, '## sent history\n- run : 2026/09/06 21:27:29\n');
			assert.strictEqual(plan, '## sent history\n- plan: 2026/09/06 21:27:29\n');
			assert.strictEqual(spec, '## sent history\n- spec: 2026/09/06 21:27:29\n');
		});
	});

	suite('appendSessionMetadataLine', () => {
		const dateTime = '2026/10/17 18:54:39';
		const resume = 'claude --resume 0f1d2c3b-4a59-4687-8f0a-1b2c3d4e5f60';

		test('Should create the file content with headings when empty', () => {
			const result = templateService.appendSessionMetadataLine('', 'run', dateTime, 'a_PROMPT.md', resume);
			assert.strictEqual(
				result,
				`# metadata\n\n## sessions\n- ${dateTime} | run  | a_PROMPT.md | ${resume}\n`
			);
		});

		test('Should append after the last session line', () => {
			const content = `# metadata\n\n## sessions\n- ${dateTime} | run  | a_PROMPT.md | ${resume}\n\n`;
			const result = templateService.appendSessionMetadataLine(content, 'plan', '2026/10/17 19:02:11', 'b_PROMPT.md', 'claude --resume x');
			const lines = result.split('\n');
			assert.strictEqual(lines[4], '- 2026/10/17 19:02:11 | plan | b_PROMPT.md | claude --resume x');
		});

		test('Should add the sessions section when missing', () => {
			const result = templateService.appendSessionMetadataLine('# metadata\n\nnote\n', 'spec', dateTime, 'a_SPEC.md', resume);
			assert.strictEqual(result, `# metadata\n\nnote\n\n## sessions\n- ${dateTime} | spec | a_SPEC.md | ${resume}\n`);
		});
	});

	suite('findLatestSessionMetadata', () => {
		const first = '0f1d2c3b-4a59-4687-8f0a-1b2c3d4e5f60';
		const second = '11111111-2222-4333-8444-555555555555';

		test('Should return undefined without a sessions section', () => {
			assert.strictEqual(templateService.findLatestSessionMetadata('# metadata\n'), undefined);
		});

		test('Should return the last session', () => {
			let content = templateService.appendSessionMetadataLine('', 'run', '2026/10/17 18:54:39', 'a_PROMPT.md', `claude --resume ${first}`);
			content = templateService.appendSessionMetadataLine(content, 'plan', '2026/10/17 19:02:11', 'b_PROMPT.md', `/usr/local/bin/claude --resume ${second}`);

			assert.deepStrictEqual(templateService.findLatestSessionMetadata(content), {
				commandType: 'plan',
				fileName: 'b_PROMPT.md',
				sessionId: second
			});
		});

		test('Should skip lines whose session ID is not a UUID', () => {
			const content = [
				'## sessions',
				`- 2026/10/17 18:54:39 | run  | a_PROMPT.md | claude --resume ${first}`,
				'- 2026/10/17 19:00:00 | run  | b_PROMPT.md | claude --resume $(rm -rf ~)',
				'- 2026/10/17 19:01:00 | run  | c_PROMPT.md | claude --resume abc;echo'
			].join('\n');

			assert.strictEqual(templateService.findLatestSessionMetadata(content)?.sessionId, first);
		});

		test('Should ignore lines outside the sessions section', () => {
			const content = [
				'## sessions',
				`- 2026/10/17 18:54:39 | run  | a_PROMPT.md | claude --resume ${first}`,
				'',
				'---',
				`- 2026/10/17 19:00:00 | run  | b_PROMPT.md | claude --resume ${second}`
			].join('\n');

			assert.strictEqual(templateService.findLatestSessionMetadata(content)?.sessionId, first);
		});
	});

	suite('File name generation consistency', () => {
		test('All file name generators should use the same timestamp format', () => {
			const promptFile = templateService.generatePromptFileName();
			const taskFile = templateService.generateTaskFileName();
			const specFile = templateService.generateSpecFileName();

			// タイムスタンプ部分を抽出
			const promptTimestamp = promptFile.replace('_PROMPT.md', '');
			const taskTimestamp = taskFile.replace('_TASK.md', '');
			const specTimestamp = specFile.replace('_SPEC.md', '');

			// すべて同じタイムスタンプ形式であることを確認（例: 2026_0125_1411_58）
			const timestampRegex = /^\d{4}_\d{4}_\d{4}_\d{2}$/;
			assert.ok(timestampRegex.test(promptTimestamp));
			assert.ok(timestampRegex.test(taskTimestamp));
			assert.ok(timestampRegex.test(specTimestamp));
		});
	});
});
