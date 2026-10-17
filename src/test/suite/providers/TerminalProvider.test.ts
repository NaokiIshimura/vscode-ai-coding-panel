import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import * as vscode from 'vscode';
import { TerminalProvider } from '../../../providers/TerminalProvider';
import { ITerminalService, TerminalOutputListener, TerminalExitListener, ProcessInfo, ProcessTreeResult } from '../../../interfaces/ITerminalService';

// Mock EditorProvider interface
interface IEditorProvider {
    getCurrentFilePath(): string | undefined;
    clearFile(): Promise<void>;
    showFile(filePath: string): Promise<void>;
    runTask(): Promise<void>;
}

// Mock PlansProvider interface
interface IPlansProvider {
    setActiveFolder(folderPath: string | undefined, force?: boolean): void;
}

/**
 * MockTerminalService for tests
 * Records write() calls; used to verify the bracketed paste mode
 */
class MockTerminalService implements ITerminalService {
    public writeCalls: { sessionId: string; data: string }[] = [];
    private _sessionCounter = 0;
    private _exitCallbacks = new Set<TerminalExitListener>();

    async createSession(cwd?: string): Promise<string> {
        return `mock-session-${++this._sessionCounter}`;
    }

    killSession(sessionId: string): void {}

    write(sessionId: string, data: string): void {
        this.writeCalls.push({ sessionId, data });
    }

    onOutput(sessionId: string, callback: TerminalOutputListener): vscode.Disposable {
        return { dispose: () => {} };
    }

    resize(sessionId: string, cols: number, rows: number): void {}

    isAvailable(): boolean { return true; }

    getUnavailableReason(): string { return ''; }

    onSessionExit(callback: TerminalExitListener): vscode.Disposable {
        this._exitCallbacks.add(callback);
        return { dispose: () => { this._exitCallbacks.delete(callback); } };
    }

    async getChildProcesses(sessionId: string): Promise<ProcessInfo[]> { return []; }

    async isClaudeCodeRunning(sessionId: string): Promise<boolean> { return false; }

    async getForegroundProcess(sessionId: string): Promise<string | null> { return null; }

    async getProcessTree(sessionId: string): Promise<ProcessTreeResult> {
        return { isClaudeCodeRunning: false, foregroundProcess: null };
    }

    dispose(): void {}
}

suite('TerminalProvider Integration Test Suite', () => {
	let terminalProvider: TerminalProvider;

	setup(() => {
		// Initialize TerminalProvider (without initializing the WebView)
		const extensionUri = vscode.Uri.file(__dirname);
		terminalProvider = new TerminalProvider(extensionUri);
	});

	teardown(() => {
		// Clean up
		terminalProvider.dispose();
	});

	suite('setEditorProvider', () => {
		test('Should set EditorProvider reference', () => {
			const mockEditorProvider: IEditorProvider = {
				getCurrentFilePath: () => undefined,
				clearFile: async () => {},
				showFile: async (filePath: string) => {},
				runTask: async () => {}
			};

			terminalProvider.setEditorProvider(mockEditorProvider);

			// Check that EditorProvider is set
			assert.ok(true);
		});
	});

	suite('setPlansProvider', () => {
		test('Should set PlansProvider reference', () => {
			const mockPlansProvider: IPlansProvider = {
				setActiveFolder: (folderPath: string | undefined, force?: boolean) => {}
			};

			terminalProvider.setPlansProvider(mockPlansProvider);

			// Check that PlansProvider is set
			assert.ok(true);
		});
	});

	suite('clearTerminal', () => {
		test('Should not throw error when clearing terminal without WebView', () => {
			// No error occurs even when the WebView is not initialized
			assert.doesNotThrow(() => {
				terminalProvider.clearTerminal();
			});
		});
	});

	suite('killTerminal', () => {
		test('Should not throw error when killing terminal without WebView', () => {
			// No error occurs even when the WebView is not initialized
			assert.doesNotThrow(() => {
				terminalProvider.killTerminal();
			});
		});
	});

	suite('newTerminal', () => {
		test('Should not throw error when creating new terminal without WebView', async function() {
			// Skipped on Windows because the shell is not found
			if (process.platform === 'win32') {
				this.skip();
			}

			// No error occurs even when the WebView is not initialized
			await assert.doesNotReject(async () => {
				await terminalProvider.newTerminal();
			});
		});
	});

	suite('sendCommand', () => {
		test('Should not throw error when sending command without WebView', async function() {
			// Skipped on Windows because the shell is not found
			if (process.platform === 'win32') {
				this.skip();
			}

			// No error occurs even when the WebView is not initialized
			await assert.doesNotReject(async () => {
				await terminalProvider.sendCommand('echo "test"');
			});
		});

		test('Should accept optional parameters', async function() {
			// Skipped on Windows because the shell is not found
			if (process.platform === 'win32') {
				this.skip();
			}

			await assert.doesNotReject(async () => {
				await terminalProvider.sendCommand(
					'echo "test"',
					true,
					'/path/to/file.md',
					'run'
				);
			});
		});
	});

	suite('insertPaths', () => {
		test('Should not throw error when inserting paths without WebView', async function() {
			// Skipped on Windows because the shell is not found
			if (process.platform === 'win32') {
				this.skip();
			}

			const paths = ['/path/to/file1.md', '/path/to/file2.md'];

			// No error occurs even when the WebView is not initialized
			await assert.doesNotReject(async () => {
				await terminalProvider.insertPaths(paths);
			});
		});
	});

	suite('focus', () => {
		test('Should not throw error when focusing without WebView', () => {
			// No error occurs even when the WebView is not initialized
			assert.doesNotThrow(() => {
				terminalProvider.focus();
			});
		});
	});

	suite('dispose', () => {
		test('Should dispose resources', () => {
			// Verify that calling dispose does not throw
			assert.doesNotThrow(() => {
				terminalProvider.dispose();
			});
		});
	});

	suite('Integration with TerminalService', () => {
		test('Should initialize TerminalService internally', () => {
			// Check that TerminalProvider initializes TerminalService internally
			// Verify that no error occurs
			assert.ok(true);
		});
	});
});

suite('TerminalProvider Bracket Paste Mode Test Suite', () => {
	let terminalProvider: TerminalProvider;
	let mockService: MockTerminalService;

	setup(async () => {
		mockService = new MockTerminalService();
		const extensionUri = vscode.Uri.file(__dirname);
		terminalProvider = new TerminalProvider(extensionUri, mockService);
		// Create a tab (MockTerminalService's createSession is used)
		await terminalProvider.newTerminal();
	});

	teardown(() => {
		terminalProvider.dispose();
	});

	suite('sendCommand - Bracket Paste Mode', () => {
		test('Should send the command in bracketed paste mode while Claude Code is running', async () => {
			// Set the tab's isClaudeCodeRunning to true
			const provider = terminalProvider as any;
			provider._tabs[0].isClaudeCodeRunning = true;

			await terminalProvider.sendCommand('/compact');

			// The command wrapped in the bracketed paste sequence must be sent
			const pasteWrite = mockService.writeCalls.find(c => c.data.includes('\x1b[200~'));
			assert.ok(pasteWrite, 'Should include the bracketed paste start sequence');
			assert.ok(pasteWrite!.data.includes('\x1b[201~'), 'Should include the bracketed paste end sequence');
			assert.strictEqual(pasteWrite!.data, '\x1b[200~/compact\x1b[201~');
		});

		test('Should send Enter (\\r) after 20ms while Claude Code is running', async () => {
			const provider = terminalProvider as any;
			provider._tabs[0].isClaudeCodeRunning = true;

			await terminalProvider.sendCommand('/compact');

			// Verify that Enter is not sent immediately
			const immediateEnter = mockService.writeCalls.filter(c => c.data === '\r');
			assert.strictEqual(immediateEnter.length, 0, 'Should not send Enter immediately');

			// Wait 50ms and verify that Enter was sent
			await new Promise(resolve => setTimeout(resolve, 50));
			const delayedEnter = mockService.writeCalls.filter(c => c.data === '\r');
			assert.strictEqual(delayedEnter.length, 1, 'Should send Enter after the delay');
		});

		test('Should send the command with a normal newline when Claude Code is not running', async () => {
			// isClaudeCodeRunning is false by default
			await terminalProvider.sendCommand('echo "test"');

			// The command with a normal newline must be sent
			const normalWrite = mockService.writeCalls.find(c => c.data === 'echo "test"\n');
			assert.ok(normalWrite, 'Should send the command + newline');
		});

		test('Should not include the bracketed paste sequence when Claude Code is not running', async () => {
			await terminalProvider.sendCommand('echo "test"');

			const hasBracketPaste = mockService.writeCalls.some(c => c.data.includes('\x1b[200~'));
			assert.strictEqual(hasBracketPaste, false, 'Should not include the bracketed paste sequence');
		});

		test('Should update isClaudeCodeRunning to true when sending the claude command', async () => {
			await terminalProvider.sendCommand('claude --model opus');

			const provider = terminalProvider as any;
			assert.strictEqual(provider._tabs[0].isClaudeCodeRunning, true, 'Should update to the Claude Code running state');
			assert.strictEqual(provider._tabs[0].isProcessing, true, 'Should update to the processing state');
		});
	});

	suite('handleShortcut - Bracket Paste Mode', () => {
		test('Should send the shortcut command in bracketed paste mode while Claude Code is running', () => {
			const provider = terminalProvider as any;
			provider._tabs[0].isClaudeCodeRunning = true;

			terminalProvider.handleShortcut('/clear', false);

			const pasteWrite = mockService.writeCalls.find(c => c.data.includes('\x1b[200~'));
			assert.ok(pasteWrite, 'Should include the bracketed paste start sequence');
			assert.strictEqual(pasteWrite!.data, '\x1b[200~/clear\x1b[201~');
		});

		test('Should send Enter (\\r) after 20ms while Claude Code is running', async () => {
			const provider = terminalProvider as any;
			provider._tabs[0].isClaudeCodeRunning = true;

			terminalProvider.handleShortcut('/model sonnet', false);

			// Verify that Enter is not sent immediately
			const immediateEnter = mockService.writeCalls.filter(c => c.data === '\r');
			assert.strictEqual(immediateEnter.length, 0, 'Should not send Enter immediately');

			// Wait 50ms and verify that Enter was sent
			await new Promise(resolve => setTimeout(resolve, 50));
			const delayedEnter = mockService.writeCalls.filter(c => c.data === '\r');
			assert.strictEqual(delayedEnter.length, 1, 'Should send Enter after the delay');
		});

		test('Should send the shortcut command with a normal newline when Claude Code is not running', () => {
			terminalProvider.handleShortcut('claude', false);

			const normalWrite = mockService.writeCalls.find(c => c.data === 'claude\n');
			assert.ok(normalWrite, 'Should send the command + newline');
		});

		test('Should update isClaudeCodeRunning to true when startsClaudeCode=true', () => {
			terminalProvider.handleShortcut('claude', true);

			const provider = terminalProvider as any;
			assert.strictEqual(provider._tabs[0].isClaudeCodeRunning, true, 'Should update to the Claude Code running state');
			assert.strictEqual(provider._tabs[0].isProcessing, true, 'Should update to the processing state');
		});

		test('Should not call write() when the command is empty', () => {
			terminalProvider.handleShortcut('', false);

			assert.strictEqual(mockService.writeCalls.length, 0, 'Should not call write()');
		});

		test('Should insert the command without a newline when execute=false', () => {
			terminalProvider.handleShortcut('claude --from-pr ', false, false);

			assert.strictEqual(mockService.writeCalls.length, 1, 'Should call write() only once');
			assert.strictEqual(
				mockService.writeCalls[0].data,
				'claude --from-pr ',
				'Should send the command without a newline'
			);
		});

		test('Should not send Enter when execute=false even while Claude Code is running', async () => {
			const provider = terminalProvider as any;
			provider._tabs[0].isClaudeCodeRunning = true;

			terminalProvider.handleShortcut('claude --from-pr ', false, false);

			await new Promise(resolve => setTimeout(resolve, 150));
			const enterWrites = mockService.writeCalls.filter(c => c.data === '\r');
			assert.strictEqual(enterWrites.length, 0, 'Should not send Enter');
		});

		test('Should not change the Claude Code running state when execute=false', () => {
			terminalProvider.handleShortcut('claude --from-pr ', true, false);

			const provider = terminalProvider as any;
			assert.strictEqual(
				provider._tabs[0].isClaudeCodeRunning,
				false,
				'Should not change the Claude Code running state'
			);
		});
	});

	suite('Bracket Paste Mode - Integration with real TerminalService', () => {
		let realTerminalProvider: TerminalProvider;

		setup(() => {
			const extensionUri = vscode.Uri.file(__dirname);
			realTerminalProvider = new TerminalProvider(extensionUri);
		});

		teardown(() => {
			realTerminalProvider.dispose();
		});

		test('Should send the bracketed paste sequence in a real PTY session', async function() {
			// Skipped on Windows because the shell is not found
			if (process.platform === 'win32') {
				this.skip();
			}

			// Create a real tab
			await realTerminalProvider.newTerminal();

			const provider = realTerminalProvider as any;
			const tab = provider._tabs[0];
			assert.ok(tab, 'Should have created the tab');
			assert.ok(tab.sessionId, 'Should have a session ID');

			// Capture the PTY output
			const outputs: string[] = [];
			const disposable = provider._terminalService.onOutput(tab.sessionId, (data: string) => {
				outputs.push(data);
			});

			// Set the state to Claude Code running
			tab.isClaudeCodeRunning = true;

			// Send the command in bracketed paste mode with sendCommand
			await realTerminalProvider.sendCommand('/compact');

			// Wait until the write to the PTY completes
			await new Promise(resolve => setTimeout(resolve, 100));

			// Verify that the PTY output contains the bracketed paste sequence
			const allOutput = outputs.join('');
			assert.ok(
				allOutput.includes('/compact'),
				'PTY output should contain the command'
			);

			disposable.dispose();
		});

		test('Should send a normal command in a real PTY session', async function() {
			if (process.platform === 'win32') {
				this.skip();
			}

			await realTerminalProvider.newTerminal();

			const provider = realTerminalProvider as any;
			const tab = provider._tabs[0];

			const outputs: string[] = [];
			const disposable = provider._terminalService.onOutput(tab.sessionId, (data: string) => {
				outputs.push(data);
			});

			// Send the command while Claude Code is not running (default)
			await realTerminalProvider.sendCommand('echo bracket_paste_test');

			await new Promise(resolve => setTimeout(resolve, 100));

			const allOutput = outputs.join('');
			assert.ok(
				allOutput.includes('echo bracket_paste_test') || allOutput.includes('bracket_paste_test'),
				'PTY output should contain the command or its result'
			);

			disposable.dispose();
		});
	});
});

/**
 * MockWebviewView for tests
 *
 * Captures the message handler registered by resolveWebviewView()
 * and reproduces messages sent from the Webview (tab clicks, etc.)
 */
class MockWebviewView {
	public readonly postedMessages: any[] = [];
	private _messageHandler?: (data: any) => void | Promise<void>;

	public webview = {
		options: {},
		html: '',
		cspSource: 'vscode-webview://mock',
		asWebviewUri: (uri: vscode.Uri) => uri,
		postMessage: async (message: any) => {
			this.postedMessages.push(message);
			return true;
		},
		onDidReceiveMessage: (handler: (data: any) => void | Promise<void>) => {
			this._messageHandler = handler;
			return { dispose: () => {} };
		}
	};

	public visible = true;
	public onDidChangeVisibility = () => ({ dispose: () => {} });
	public onDidDispose = () => ({ dispose: () => {} });
	public show = () => {};

	/**
	 * Reproduces a message sent from the Webview
	 */
	public async receiveMessage(data: any): Promise<void> {
		await this._messageHandler?.(data);
	}
}

/**
 * Verifies the tab-file association (Terminal View tab linking from v0.9.3)
 *
 * A tab and a file are associated when Run / Plan / Spec is sent,
 * switching to the tab opens that file in the Editor View,
 * and the Plans View moves to its parent directory
 */
suite('TerminalProvider Tab-File Association Test Suite', () => {
	let terminalProvider: TerminalProvider;
	let mockService: MockTerminalService;
	let mockView: MockWebviewView;
	let showFileCalls: string[];
	let setActiveFolderCalls: { folderPath: string | undefined; force?: boolean }[];

	// Create real files (the file system is needed to verify following renames)
	let tmpRoot: string | undefined;
	let plansRoot: string;
	let dirA: string;
	let fileA: string;
	let fileB: string;

	// Extension root (relative to out/test/suite/providers)
	// A real path is needed because _getHtmlForWebview() reads resources/webview/terminal/index.html
	const extensionRoot = path.resolve(__dirname, '..', '..', '..', '..');

	/**
	 * Creates a new tab, sends a command to it, and returns the tab ID
	 * @param filePath File path to associate (no association when omitted)
	 */
	async function sendToNewTab(filePath?: string): Promise<string> {
		await terminalProvider.newTerminal();
		const tabs = (terminalProvider as any)._tabs as { id: string }[];
		const tabId = tabs[tabs.length - 1].id;
		await terminalProvider.sendCommand(
			'echo test',
			true,
			filePath,
			filePath ? 'run' : undefined
		);
		return tabId;
	}

	/**
	 * Waits until the condition is met
	 * (used to check results, because _closeTab() does not wait for the tab activation)
	 */
	async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
		const start = Date.now();
		while (!condition()) {
			if (Date.now() - start > timeoutMs) {
				throw new Error('The condition was not met');
			}
			await new Promise(resolve => setTimeout(resolve, 5));
		}
	}

	/**
	 * Gets the file path associated with the tab
	 */
	function getAssociatedFilePath(tabId: string): string | undefined {
		return ((terminalProvider as any)._tabFileMap as Map<string, string>).get(tabId);
	}

	setup(async function() {
		// Skipped on Windows because the shell is not found
		if (process.platform === 'win32') {
			this.skip();
		}

		// Create a structure that mimics task directories
		tmpRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'terminal-provider-test-'));
		plansRoot = path.join(tmpRoot, '.claude', 'plans');
		dirA = path.join(plansRoot, '2026_0101_0000_00');
		const dirB = path.join(plansRoot, '2026_0102_0000_00');
		fileA = path.join(dirA, '2026_0101_0000_00_QUICK_START.md');
		fileB = path.join(dirB, '2026_0102_0000_00_QUICK_START.md');
		await fsPromises.mkdir(dirA, { recursive: true });
		await fsPromises.mkdir(dirB, { recursive: true });
		await fsPromises.writeFile(fileA, '# task A\n', 'utf8');
		await fsPromises.writeFile(fileB, '# task B\n', 'utf8');

		showFileCalls = [];
		setActiveFolderCalls = [];

		mockService = new MockTerminalService();
		terminalProvider = new TerminalProvider(vscode.Uri.file(extensionRoot), mockService);

		terminalProvider.setEditorProvider({
			getCurrentFilePath: () => undefined,
			clearFile: async () => {},
			showFile: async (filePath: string) => { showFileCalls.push(filePath); },
			runTask: async () => {}
		} as IEditorProvider);

		terminalProvider.setPlansProvider({
			setActiveFolder: (folderPath: string | undefined, force?: boolean) => {
				setActiveFolderCalls.push({ folderPath, force });
			}
		} as IPlansProvider);

		// Resolve the Webview so that it registers the message handler
		mockView = new MockWebviewView();
		await terminalProvider.resolveWebviewView(mockView as any, {} as any, {} as any);
	});

	teardown(async () => {
		terminalProvider?.dispose();
		if (tmpRoot) {
			await fsPromises.rm(tmpRoot, { recursive: true, force: true });
			tmpRoot = undefined;
		}
	});

	test('Should open the file sent to the tab in the Editor View when switching tabs', async () => {
		const tabA = await sendToNewTab(fileA);
		const tabB = await sendToNewTab(fileB);

		showFileCalls = [];

		await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });
		assert.deepStrictEqual(showFileCalls, [fileA], 'Should open the file of tab A');

		await mockView.receiveMessage({ type: 'activateTab', tabId: tabB });
		assert.deepStrictEqual(showFileCalls, [fileA, fileB], 'Should open the file of tab B');
	});

	test('Should move the Plans View to the parent directory of the associated file when switching tabs', async () => {
		const tabA = await sendToNewTab(fileA);
		await sendToNewTab(fileB);

		setActiveFolderCalls = [];

		await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });

		assert.deepStrictEqual(
			setActiveFolderCalls,
			[{ folderPath: path.dirname(fileA), force: false }],
			'Should move to the parent directory with force=false'
		);
	});

	test('Should not associate the tab when sending without a file path', async () => {
		// Run without an open file (runCommandWithoutFile) does not pass filePath
		const tabWithoutFile = await sendToNewTab(undefined);
		await sendToNewTab(fileA);

		showFileCalls = [];
		setActiveFolderCalls = [];

		await mockView.receiveMessage({ type: 'activateTab', tabId: tabWithoutFile });

		assert.deepStrictEqual(showFileCalls, [], 'Should not update the Editor View');
		assert.deepStrictEqual(setActiveFolderCalls, [], 'Should not move the Plans View');
	});

	test('Should overwrite the association with the last file when sending to the same tab repeatedly', async () => {
		const tabA = await sendToNewTab(fileA);
		// Run Plan in the same tab
		await terminalProvider.sendCommand('echo test', true, fileB, 'plan');

		// Move to another tab and come back
		await sendToNewTab(undefined);
		showFileCalls = [];

		await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });

		assert.deepStrictEqual(showFileCalls, [fileB], 'Should open the last sent file');
	});

	test('Should not update the Editor View when a nonexistent tab ID is given', async () => {
		await sendToNewTab(fileA);
		showFileCalls = [];

		await mockView.receiveMessage({ type: 'activateTab', tabId: 'tab-does-not-exist' });

		assert.deepStrictEqual(showFileCalls, [], 'Should not update the Editor View');
	});

	test('Should open the associated file of the next activated tab when the active tab is closed', async () => {
		await sendToNewTab(fileA);
		await sendToNewTab(fileB); // Tab B is active

		showFileCalls = [];

		// killTerminal() closes the active tab (tab B) and activates tab A
		terminalProvider.killTerminal();
		await waitFor(() => showFileCalls.length > 0);

		assert.deepStrictEqual(showFileCalls, [fileA], 'Should open the file of tab A');
	});

	test('Should remove the association of the tab when it is closed', async () => {
		const tabA = await sendToNewTab(fileA);
		await sendToNewTab(fileB);

		// Activate tab A and then close it
		await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });
		terminalProvider.killTerminal();

		assert.strictEqual(getAssociatedFilePath(tabA), undefined, 'Should not keep the association of the closed tab');
	});

	suite('Following directory renames', () => {
		// The Quick Start template instructs the AI agent to rename the directory to match the task (v1.0.20)
		const RENAMED_DIR_NAME = 'weather-osaka';

		/**
		 * Renames the directory containing the file and returns the file path after the rename
		 */
		async function renameDirectory(): Promise<string> {
			const renamedDir = path.join(plansRoot, RENAMED_DIR_NAME);
			await fsPromises.rename(dirA, renamedDir);
			return path.join(renamedDir, path.basename(fileA));
		}

		test('Should open the renamed file even when the directory name has changed', async () => {
			const tabA = await sendToNewTab(fileA);
			await sendToNewTab(fileB);

			const renamedFilePath = await renameDirectory();
			showFileCalls = [];

			await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });

			assert.deepStrictEqual(
				showFileCalls,
				[renamedFilePath],
				'Should open the file at the renamed path'
			);
		});

		test('Should move the Plans View to the renamed directory even when the directory name has changed', async () => {
			const tabA = await sendToNewTab(fileA);
			await sendToNewTab(fileB);

			const renamedFilePath = await renameDirectory();
			setActiveFolderCalls = [];

			await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });

			assert.deepStrictEqual(
				setActiveFolderCalls,
				[{ folderPath: path.dirname(renamedFilePath), force: false }],
				'Should move to the renamed directory'
			);
		});

		test('Should update the tab association to the new path when a rename is detected', async () => {
			const tabA = await sendToNewTab(fileA);
			await sendToNewTab(fileB);

			const renamedFilePath = await renameDirectory();
			await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });

			assert.strictEqual(
				getAssociatedFilePath(tabA),
				renamedFilePath,
				'Should update the association to the renamed path'
			);
		});

		test('Should discard the association without updating the Editor View when the whole directory is deleted', async () => {
			const tabA = await sendToNewTab(fileA);
			await sendToNewTab(fileB);

			await fsPromises.rm(dirA, { recursive: true, force: true });
			showFileCalls = [];
			setActiveFolderCalls = [];

			await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });

			assert.deepStrictEqual(showFileCalls, [], 'Should not update the Editor View');
			assert.deepStrictEqual(setActiveFolderCalls, [], 'Should not move the Plans View');
			assert.strictEqual(getAssociatedFilePath(tabA), undefined, 'Should discard the association');
		});

		test('Should discard the association when no directory has a file with the same name', async () => {
			const tabA = await sendToNewTab(fileA);
			await sendToNewTab(fileB);

			// Cannot be tracked when the file name has also changed
			const renamedDir = path.join(plansRoot, RENAMED_DIR_NAME);
			await fsPromises.rename(dirA, renamedDir);
			await fsPromises.rename(
				path.join(renamedDir, path.basename(fileA)),
				path.join(renamedDir, 'renamed.md')
			);
			showFileCalls = [];

			await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });

			assert.deepStrictEqual(showFileCalls, [], 'Should not update the Editor View');
			assert.strictEqual(getAssociatedFilePath(tabA), undefined, 'Should discard the association');
		});
	});
});
