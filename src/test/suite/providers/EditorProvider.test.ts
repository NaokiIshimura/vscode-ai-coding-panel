import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { EditorProvider, appendOutputMdPrompt } from '../../../providers/EditorProvider';
import { PlansProvider } from '../../../providers/PlansProvider';
import { TemplateService } from '../../../services/TemplateService';
import { PromptTemplateService } from '../../../services/PromptTemplateService';

suite('EditorProvider Integration Test Suite', () => {
	let editorProvider: EditorProvider;
	let templateService: TemplateService;
	const testDir = path.join(__dirname, '../../fixtures/editor');
	const testFilePath = path.join(testDir, 'test.md');

	setup(async () => {
		// テストディレクトリを作成
		if (!fs.existsSync(testDir)) {
			fs.mkdirSync(testDir, { recursive: true });
		}

		// テストファイルを作成
		fs.writeFileSync(testFilePath, '# Test Content', 'utf8');

		// TemplateServiceを初期化
		templateService = new TemplateService();

		// EditorProviderを初期化（WebView初期化なし）
		const extensionUri = vscode.Uri.file(__dirname);
		editorProvider = new EditorProvider(extensionUri, templateService);
	});

	teardown(() => {
		// クリーンアップ
		editorProvider.dispose();

		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
		}
	});

	suite('getCurrentFilePath', () => {
		test('Should return undefined when no file is loaded', () => {
			const filePath = editorProvider.getCurrentFilePath();
			assert.strictEqual(filePath, undefined);
		});

		test('Should return current file path after showFile', async () => {
			await editorProvider.showFile(testFilePath);

			// showFileを呼ぶと、_currentFilePathが設定される
			const filePath = editorProvider.getCurrentFilePath();
			assert.strictEqual(filePath, testFilePath);
		});
	});

	suite('setPlansProvider', () => {
		test('Should set PlansProvider reference', () => {
			const mockPlansProvider = {} as PlansProvider;
			editorProvider.setPlansProvider(mockPlansProvider);

			// PlansProviderが設定されたことを確認（内部プロパティなのでテストは難しい）
			// エラーが発生しないことを確認
			assert.ok(true);
		});
	});

	suite('setDetailsProvider', () => {
		test('Should set details provider reference', () => {
			const mockPlansProvider = {} as PlansProvider;
			editorProvider.setDetailsProvider(mockPlansProvider);

			// DetailsProviderが設定されたことを確認
			assert.ok(true);
		});
	});

	suite('setTerminalProvider', () => {
		test('Should set TerminalProvider reference', () => {
			const mockTerminalProvider = {
				focus: () => {},
				sendCommand: async () => {}
			};
			editorProvider.setTerminalProvider(mockTerminalProvider);

			// TerminalProviderが設定されたことを確認
			assert.ok(true);
		});
	});

	suite('clearFile', () => {
		test('Should clear current file (without WebView)', async () => {
			await editorProvider.clearFile();

			const filePath = editorProvider.getCurrentFilePath();
			assert.strictEqual(filePath, undefined);
		});
	});

	suite('insertPaths', () => {
		test('Should not throw error when inserting paths without WebView', () => {
			const paths = [testFilePath];

			// WebViewが初期化されていない状態でも、エラーは発生しない
			assert.doesNotThrow(() => {
				editorProvider.insertPaths(paths);
			});
		});
	});

	suite('saveSync', () => {
		test('Should not throw error when saving without WebView', () => {
			// WebViewが初期化されていない状態でも、エラーは発生しない
			assert.doesNotThrow(() => {
				editorProvider.saveSync();
			});
		});
	});

	suite('dispose', () => {
		test('Should dispose resources', () => {
			// disposeを呼んでもエラーが発生しないことを確認
			assert.doesNotThrow(() => {
				editorProvider.dispose();
			});
		});
	});

	suite('insertPromptTemplate', () => {
		test('Should not throw error when PromptTemplateService is not set', async () => {
			// サービス未設定時は警告を出して終了する
			await editorProvider.insertPromptTemplate();
			assert.ok(true);
		});

		test('Should set PromptTemplateService reference', () => {
			const mockPromptTemplateService = {} as PromptTemplateService;
			assert.doesNotThrow(() => {
				editorProvider.setPromptTemplateService(mockPromptTemplateService);
			});
		});
	});

	suite('_escapeShellArgument', () => {
		// privateメソッドを直接検証する（コマンド生成の安全性はUIを介さず確認したい）
		const escape = (arg: string): string =>
			(editorProvider as unknown as { _escapeShellArgument(a: string): string })._escapeShellArgument(arg);

		test('Should wrap the value in double quotes outside single quotes', () => {
			// テンプレート側のダブルクォートを閉じて開き直す形になっている
			assert.strictEqual(escape('hello'), '"\'hello\'"');
		});

		test('Should protect backticks so that the shell does not run them', () => {
			// Markdownのインラインコードがコマンド置換として実行されないこと
			const escaped = escape('Run `claude attach fdf4892c` to open it');
			assert.strictEqual(escaped, '"\'Run `claude attach fdf4892c` to open it\'"');
		});

		test('Should protect a code fence', () => {
			// コードフェンスは空のバッククォート対になり command not found を起こしていた
			assert.strictEqual(escape('```'), '"\'```\'"');
		});

		test('Should protect an exclamation mark from history expansion', () => {
			// 対話シェルではダブルクォート内の ! がヒストリ展開される
			assert.strictEqual(escape('重要!注意'), '"\'重要!注意\'"');
		});

		test('Should protect dollar signs from parameter expansion', () => {
			assert.strictEqual(escape('$HOME and ${PATH}'), '"\'$HOME and ${PATH}\'"');
		});

		test('Should protect backslashes', () => {
			assert.strictEqual(escape('a\\b'), '"\'a\\b\'"');
		});

		test('Should close and reopen quoting around a single quote', () => {
			// シングルクォートはクォートを閉じてエスケープし、再度開く
			assert.strictEqual(escape("it's"), '"\'it\'\\\'\'s\'"');
		});

		test('Should keep newlines as is', () => {
			// 本文全体を1引数として渡すため改行はそのまま保持する
			assert.strictEqual(escape('line1\nline2'), '"\'line1\nline2\'"');
		});

		test('Should produce a single argument when embedded in a quoted template', () => {
			// テンプレート "${editorContent}" へ埋め込むと ""'値'"" となり、
			// シェルは隣接する引用符を連結して1つの引数として扱う
			const command = '${commandPrefix} "${editorContent}"'
				.replace('${commandPrefix}', 'claude')
				.replace('${editorContent}', escape('# task\n```\n`ls`\n```'));
			assert.strictEqual(command, 'claude ""\'# task\n```\n`ls`\n```\'""');
		});

		test('Should produce a single argument when embedded mid-sentence', () => {
			// Plan / Spec は文の途中へ埋め込むため、前後のダブルクォートと連結される
			const command = '${commandPrefix} "Review the file at ${filePath} and create a plan."'
				.replace('${commandPrefix}', 'claude')
				.replace(/\$\{filePath\}/g, escape('.claude/plans/x.md'));
			assert.strictEqual(
				command,
				'claude "Review the file at "\'.claude/plans/x.md\'" and create a plan."'
			);
		});
	});

	suite('sendSessionPrompt', () => {
		interface SentCommand {
			command: string;
			addNewline?: boolean;
			filePath?: string;
			commandType?: string;
		}

		const createTerminalProvider = (isRunning: boolean | undefined) => {
			const sent: SentCommand[] = [];
			let focused = 0;
			const provider: {
				focus(): void;
				sendCommand(command: string, addNewline?: boolean, filePath?: string, commandType?: 'run' | 'plan' | 'spec'): Promise<void>;
				isClaudeCodeRunning?(): boolean;
			} = {
				focus: () => { focused++; },
				sendCommand: async (command, addNewline, filePath, commandType) => {
					sent.push({ command, addNewline, filePath, commandType });
				}
			};
			if (isRunning !== undefined) {
				provider.isClaudeCodeRunning = () => isRunning;
			}
			return { provider, sent, getFocused: () => focused };
		};

		// EditorProviderと同じ基準（ワークスペースルートからの相対パス）で期待値を求める
		const expectedRelativeDir = (): string => {
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const relativeFilePath = workspaceRoot ? path.relative(workspaceRoot, testFilePath) : testFilePath;
			return path.dirname(relativeFilePath);
		};

		test('Should send the output md prompt with the directory to a running session', async () => {
			const terminal = createTerminalProvider(true);
			editorProvider.setTerminalProvider(terminal.provider);
			await editorProvider.showFile(testFilePath);

			await editorProvider.sendSessionPrompt('md');

			assert.strictEqual(terminal.sent.length, 1);
			assert.ok(terminal.sent[0].command.includes('_status.md'));
			assert.ok(terminal.sent[0].command.includes(` in ${expectedRelativeDir()}.`));
			assert.strictEqual(terminal.getFocused(), 1);
		});

		test('Should send the output memory prompt with the directory to a running session', async () => {
			const terminal = createTerminalProvider(true);
			editorProvider.setTerminalProvider(terminal.provider);
			await editorProvider.showFile(testFilePath);

			await editorProvider.sendSessionPrompt('memory');

			assert.strictEqual(terminal.sent.length, 1);
			assert.ok(terminal.sent[0].command.includes('_memory.md'));
			assert.ok(terminal.sent[0].command.includes(` in ${expectedRelativeDir()}.`));
		});

		test('Should send the prompt as typed text without shell quoting or placeholders', async () => {
			const terminal = createTerminalProvider(true);
			editorProvider.setTerminalProvider(terminal.provider);
			await editorProvider.showFile(testFilePath);

			await editorProvider.sendSessionPrompt('md');

			const command = terminal.sent[0].command;
			assert.ok(!command.includes('"\''));
			assert.ok(!command.includes('${'));
			assert.ok(!command.includes('\n'));
		});

		test('Should not associate the tab with the file or change its command type', async () => {
			const terminal = createTerminalProvider(true);
			editorProvider.setTerminalProvider(terminal.provider);
			await editorProvider.showFile(testFilePath);

			await editorProvider.sendSessionPrompt('memory');

			assert.strictEqual(terminal.sent[0].addNewline, true);
			assert.strictEqual(terminal.sent[0].filePath, undefined);
			assert.strictEqual(terminal.sent[0].commandType, undefined);
		});

		test('Should not send when Claude Code is not running', async () => {
			const terminal = createTerminalProvider(false);
			editorProvider.setTerminalProvider(terminal.provider);
			await editorProvider.showFile(testFilePath);

			await editorProvider.sendSessionPrompt('md');
			await editorProvider.sendSessionPrompt('memory');

			assert.strictEqual(terminal.sent.length, 0);
			assert.strictEqual(terminal.getFocused(), 0);
		});

		test('Should not send when the provider cannot tell whether Claude Code is running', async () => {
			const terminal = createTerminalProvider(undefined);
			editorProvider.setTerminalProvider(terminal.provider);
			await editorProvider.showFile(testFilePath);

			await editorProvider.sendSessionPrompt('md');

			assert.strictEqual(terminal.sent.length, 0);
		});

		test('Should not send either prompt when no file is open', async () => {
			const terminal = createTerminalProvider(true);
			editorProvider.setTerminalProvider(terminal.provider);

			await editorProvider.sendSessionPrompt('md');
			await editorProvider.sendSessionPrompt('memory');

			assert.strictEqual(terminal.sent.length, 0);
		});

		test('Should not throw when no TerminalProvider is set', async () => {
			await editorProvider.showFile(testFilePath);
			await editorProvider.sendSessionPrompt('md');
		});
	});

	suite('appendOutputMdPrompt', () => {
		test('Should append the prompt under the output md heading after a blank line', () => {
			assert.strictEqual(
				appendOutputMdPrompt('# task\ndo something', 'Record the status.'),
				'# task\ndo something\n\n# output md\nRecord the status.'
			);
		});

		test('Should trim surrounding whitespace of the content and the prompt', () => {
			assert.strictEqual(
				appendOutputMdPrompt('\n# task\n\n\n', '  Record the status.\n'),
				'# task\n\n# output md\nRecord the status.'
			);
		});

		test('Should return the content unchanged when the prompt is empty', () => {
			assert.strictEqual(appendOutputMdPrompt('# task\n', ''), '# task\n');
			assert.strictEqual(appendOutputMdPrompt('# task\n', '   '), '# task\n');
		});

		test('Should return only the heading and the prompt when the content is empty', () => {
			assert.strictEqual(appendOutputMdPrompt('  \n', 'Record the status.'), '# output md\nRecord the status.');
		});
	});

	suite('runTask', () => {
		const createTerminalProvider = () => {
			const sent: string[] = [];
			const provider = {
				focus: () => { /* noop */ },
				sendCommand: async (command: string) => { sent.push(command); }
			};
			return { provider, sent };
		};

		test('Should append the output md prompt by default (Quick Run is off)', async function () {
			// 設定が既定と異なる環境では検証できないためスキップする
			const quickRun = vscode.workspace.getConfiguration('aiCodingSidebar').get<boolean>('editor.quickRun', false);
			if (quickRun) {
				this.skip();
			}
			const terminal = createTerminalProvider();
			editorProvider.setTerminalProvider(terminal.provider);
			await editorProvider.showFile(testFilePath);

			await editorProvider.runTask();

			assert.strictEqual(terminal.sent.length, 1);
			assert.ok(terminal.sent[0].includes('# Test Content\n\n# output md\nRecord the current status'));
			assert.ok(terminal.sent[0].includes('_status.md'));
			// 指示文は送信するコマンドにのみ含め、ファイルには書き込まない
			assert.ok(!fs.readFileSync(testFilePath, 'utf8').includes('_status.md'));
		});
	});

	suite('Integration with TemplateService', () => {
		test('Should use TemplateService for file operations', () => {
			// TemplateServiceが注入されていることを確認
			// EditorProviderがTemplateServiceを使用してタイムスタンプ生成などを行う
			const timestamp = templateService.generateTimestamp();
			assert.ok(timestamp.match(/^\d{4}_\d{4}_\d{4}_\d{2}$/));
		});
	});
});
