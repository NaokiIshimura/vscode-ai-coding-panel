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
		// Create the test directory
		if (!fs.existsSync(testDir)) {
			fs.mkdirSync(testDir, { recursive: true });
		}

		// Create the test file
		fs.writeFileSync(testFilePath, '# Test Content', 'utf8');

		// Initialize TemplateService
		templateService = new TemplateService();

		// Initialize EditorProvider (without initializing the WebView)
		const extensionUri = vscode.Uri.file(__dirname);
		editorProvider = new EditorProvider(extensionUri, templateService);
	});

	teardown(() => {
		// Clean up
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

			// Calling showFile sets _currentFilePath
			const filePath = editorProvider.getCurrentFilePath();
			assert.strictEqual(filePath, testFilePath);
		});
	});

	suite('setPlansProvider', () => {
		test('Should set PlansProvider reference', () => {
			const mockPlansProvider = {} as PlansProvider;
			editorProvider.setPlansProvider(mockPlansProvider);

			// Check that PlansProvider is set (hard to test because it is an internal property)
			// Verify that no error occurs
			assert.ok(true);
		});
	});

	suite('setDetailsProvider', () => {
		test('Should set details provider reference', () => {
			const mockPlansProvider = {} as PlansProvider;
			editorProvider.setDetailsProvider(mockPlansProvider);

			// Check that DetailsProvider is set
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

			// Check that TerminalProvider is set
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

			// No error occurs even when the WebView is not initialized
			assert.doesNotThrow(() => {
				editorProvider.insertPaths(paths);
			});
		});
	});

	suite('saveSync', () => {
		test('Should not throw error when saving without WebView', () => {
			// No error occurs even when the WebView is not initialized
			assert.doesNotThrow(() => {
				editorProvider.saveSync();
			});
		});
	});

	suite('dispose', () => {
		test('Should dispose resources', () => {
			// Verify that calling dispose does not throw
			assert.doesNotThrow(() => {
				editorProvider.dispose();
			});
		});
	});

	suite('insertPromptTemplate', () => {
		test('Should not throw error when PromptTemplateService is not set', async () => {
			// Without the service, it shows a warning and returns
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
		// Verify the private method directly (to check the safety of command generation without going through the UI)
		const escape = (arg: string): string =>
			(editorProvider as unknown as { _escapeShellArgument(a: string): string })._escapeShellArgument(arg);

		test('Should wrap the value in double quotes outside single quotes', () => {
			// It closes and reopens the template's double quotes
			assert.strictEqual(escape('hello'), '"\'hello\'"');
		});

		test('Should protect backticks so that the shell does not run them', () => {
			// Markdown inline code must not run as command substitution
			const escaped = escape('Run `claude attach fdf4892c` to open it');
			assert.strictEqual(escaped, '"\'Run `claude attach fdf4892c` to open it\'"');
		});

		test('Should protect a code fence', () => {
			// A code fence became an empty pair of backquotes and caused command not found
			assert.strictEqual(escape('```'), '"\'```\'"');
		});

		test('Should protect an exclamation mark from history expansion', () => {
			// In an interactive shell, ! inside double quotes triggers history expansion
			assert.strictEqual(escape('Important!Note'), '"\'Important!Note\'"');
		});

		test('Should protect dollar signs from parameter expansion', () => {
			assert.strictEqual(escape('$HOME and ${PATH}'), '"\'$HOME and ${PATH}\'"');
		});

		test('Should protect backslashes', () => {
			assert.strictEqual(escape('a\\b'), '"\'a\\b\'"');
		});

		test('Should close and reopen quoting around a single quote', () => {
			// A single quote closes the quote, is escaped, and reopens it
			assert.strictEqual(escape("it's"), '"\'it\'\\\'\'s\'"');
		});

		test('Should keep newlines as is', () => {
			// Newlines are kept as is because the whole body is passed as one argument
			assert.strictEqual(escape('line1\nline2'), '"\'line1\nline2\'"');
		});

		test('Should produce a single argument when embedded in a quoted template', () => {
			// Embedded in the template "${editorContent}", it becomes ""'value'"",
			// and the shell joins the adjacent quotes into one argument
			const command = '${commandPrefix} "${editorContent}"'
				.replace('${commandPrefix}', 'claude')
				.replace('${editorContent}', escape('# task\n```\n`ls`\n```'));
			assert.strictEqual(command, 'claude ""\'# task\n```\n`ls`\n```\'""');
		});

		test('Should produce a single argument when embedded mid-sentence', () => {
			// Plan / Spec embed it in the middle of a sentence, so it is joined with the surrounding double quotes
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

		// Compute the expected value on the same basis as EditorProvider (relative path from the workspace root)
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
			// Skipped because it cannot be verified when the settings differ from the defaults
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
			// The instruction is included only in the sent command and is not written to the file
			assert.ok(!fs.readFileSync(testFilePath, 'utf8').includes('_status.md'));
		});
	});

	suite('session metadata', () => {
		const metadataPath = path.join(testDir, 'metadata.md');
		const sessionId = '0f1d2c3b-4a59-4687-8f0a-1b2c3d4e5f60';

		interface SentCommand {
			command: string;
			filePath?: string;
			commandType?: string;
			newTab: boolean;
		}

		const createTerminalProvider = (isRunning: boolean, options: { newTab?: boolean; newTabResult?: boolean } = {}) => {
			const sent: SentCommand[] = [];
			const provider: {
				focus(): void;
				sendCommand(command: string, addNewline?: boolean, filePath?: string, commandType?: 'run' | 'plan' | 'spec'): Promise<void>;
				isClaudeCodeRunning(): boolean;
				sendCommandInNewTab?(command: string, filePath?: string, commandType?: 'run' | 'plan' | 'spec'): Promise<boolean>;
			} = {
				focus: () => { /* noop */ },
				sendCommand: async (command, _addNewline, filePath, commandType) => {
					sent.push({ command, filePath, commandType, newTab: false });
				},
				isClaudeCodeRunning: () => isRunning
			};
			if (options.newTab !== false) {
				provider.sendCommandInNewTab = async (command, filePath, commandType) => {
					sent.push({ command, filePath, commandType, newTab: true });
					return options.newTabResult ?? true;
				};
			}
			return { provider, sent };
		};

		// Skipped because it cannot be verified when the settings differ from the defaults
		const skipUnlessDefaultPrefix = (context: Mocha.Context) => {
			const config = vscode.workspace.getConfiguration('aiCodingSidebar');
			if (config.get<string>('editor.commandPrefix', 'claude') !== 'claude'
				|| !config.get<boolean>('editor.recordResumeCommand', true)) {
				context.skip();
			}
		};

		test('Should record the session in metadata.md next to the file on Run', async function () {
			skipUnlessDefaultPrefix(this);
			const terminal = createTerminalProvider(false);
			editorProvider.setTerminalProvider(terminal.provider);
			await editorProvider.showFile(testFilePath);

			await editorProvider.runTask();

			const metadata = fs.readFileSync(metadataPath, 'utf8');
			const entry = templateService.findLatestSessionMetadata(metadata);
			assert.strictEqual(entry?.commandType, 'run');
			assert.strictEqual(entry?.fileName, 'test.md');
			// Sent with the recorded session ID
			assert.ok(terminal.sent[0].command.includes(`--session-id ${entry?.sessionId}`));
		});

		test('Should not record the session while Claude Code is running', async () => {
			const terminal = createTerminalProvider(true);
			editorProvider.setTerminalProvider(terminal.provider);
			await editorProvider.showFile(testFilePath);

			await editorProvider.runTask();

			assert.strictEqual(fs.existsSync(metadataPath), false);
		});

		test('Should resume in the active tab when Claude Code is not running', async function () {
			skipUnlessDefaultPrefix(this);
			const terminal = createTerminalProvider(false);
			editorProvider.setTerminalProvider(terminal.provider);

			const resumed = await editorProvider.resumeSession(sessionId, testFilePath, 'plan');

			assert.strictEqual(resumed, true);
			assert.deepStrictEqual(terminal.sent, [{
				command: `claude --resume ${sessionId}`,
				filePath: testFilePath,
				commandType: 'plan',
				newTab: false
			}]);
		});

		test('Should resume in a new tab when Claude Code is running', async () => {
			const terminal = createTerminalProvider(true);
			editorProvider.setTerminalProvider(terminal.provider);

			const resumed = await editorProvider.resumeSession(sessionId, testFilePath, 'run');

			assert.strictEqual(resumed, true);
			assert.strictEqual(terminal.sent.length, 1);
			assert.strictEqual(terminal.sent[0].newTab, true);
		});

		test('Should not send to a running session when a new tab cannot be opened', async () => {
			const terminal = createTerminalProvider(true, { newTab: false });
			editorProvider.setTerminalProvider(terminal.provider);

			const resumed = await editorProvider.resumeSession(sessionId);

			assert.strictEqual(resumed, false);
			assert.strictEqual(terminal.sent.length, 0);
		});

		test('Should not send a session ID that is not a UUID', async () => {
			const terminal = createTerminalProvider(false);
			editorProvider.setTerminalProvider(terminal.provider);

			const resumed = await editorProvider.resumeSession('abc; rm -rf ~');

			assert.strictEqual(resumed, false);
			assert.strictEqual(terminal.sent.length, 0);
		});

		test('Should not append to the sent history or metadata.md when resuming', async () => {
			const terminal = createTerminalProvider(false);
			editorProvider.setTerminalProvider(terminal.provider);
			await editorProvider.showFile(testFilePath);

			await editorProvider.resumeSession(sessionId, testFilePath, 'run');

			assert.strictEqual(fs.readFileSync(testFilePath, 'utf8'), '# Test Content');
			assert.strictEqual(fs.existsSync(metadataPath), false);
		});
	});

	suite('Integration with TemplateService', () => {
		test('Should use TemplateService for file operations', () => {
			// Check that TemplateService is injected
			// EditorProvider uses TemplateService for timestamp generation and so on
			const timestamp = templateService.generateTimestamp();
			assert.ok(timestamp.match(/^\d{4}_\d{4}_\d{4}_\d{2}$/));
		});
	});
});
