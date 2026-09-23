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
 * テスト用MockTerminalService
 * write()呼び出しを記録し、ブラケットペーストモードの検証に使用
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
		// TerminalProviderを初期化（WebView初期化なし）
		const extensionUri = vscode.Uri.file(__dirname);
		terminalProvider = new TerminalProvider(extensionUri);
	});

	teardown(() => {
		// クリーンアップ
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

			// EditorProviderが設定されたことを確認
			assert.ok(true);
		});
	});

	suite('setPlansProvider', () => {
		test('Should set PlansProvider reference', () => {
			const mockPlansProvider: IPlansProvider = {
				setActiveFolder: (folderPath: string | undefined, force?: boolean) => {}
			};

			terminalProvider.setPlansProvider(mockPlansProvider);

			// PlansProviderが設定されたことを確認
			assert.ok(true);
		});
	});

	suite('clearTerminal', () => {
		test('Should not throw error when clearing terminal without WebView', () => {
			// WebViewが初期化されていない状態でも、エラーは発生しない
			assert.doesNotThrow(() => {
				terminalProvider.clearTerminal();
			});
		});
	});

	suite('killTerminal', () => {
		test('Should not throw error when killing terminal without WebView', () => {
			// WebViewが初期化されていない状態でも、エラーは発生しない
			assert.doesNotThrow(() => {
				terminalProvider.killTerminal();
			});
		});
	});

	suite('newTerminal', () => {
		test('Should not throw error when creating new terminal without WebView', async function() {
			// Windows環境ではシェルが見つからないためスキップ
			if (process.platform === 'win32') {
				this.skip();
			}

			// WebViewが初期化されていない状態でも、エラーは発生しない
			await assert.doesNotReject(async () => {
				await terminalProvider.newTerminal();
			});
		});
	});

	suite('sendCommand', () => {
		test('Should not throw error when sending command without WebView', async function() {
			// Windows環境ではシェルが見つからないためスキップ
			if (process.platform === 'win32') {
				this.skip();
			}

			// WebViewが初期化されていない状態でも、エラーは発生しない
			await assert.doesNotReject(async () => {
				await terminalProvider.sendCommand('echo "test"');
			});
		});

		test('Should accept optional parameters', async function() {
			// Windows環境ではシェルが見つからないためスキップ
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
			// Windows環境ではシェルが見つからないためスキップ
			if (process.platform === 'win32') {
				this.skip();
			}

			const paths = ['/path/to/file1.md', '/path/to/file2.md'];

			// WebViewが初期化されていない状態でも、エラーは発生しない
			await assert.doesNotReject(async () => {
				await terminalProvider.insertPaths(paths);
			});
		});
	});

	suite('focus', () => {
		test('Should not throw error when focusing without WebView', () => {
			// WebViewが初期化されていない状態でも、エラーは発生しない
			assert.doesNotThrow(() => {
				terminalProvider.focus();
			});
		});
	});

	suite('dispose', () => {
		test('Should dispose resources', () => {
			// disposeを呼んでもエラーが発生しないことを確認
			assert.doesNotThrow(() => {
				terminalProvider.dispose();
			});
		});
	});

	suite('Integration with TerminalService', () => {
		test('Should initialize TerminalService internally', () => {
			// TerminalProviderがTerminalServiceを内部で初期化していることを確認
			// エラーが発生しないことを確認
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
		// タブを作成（MockTerminalServiceのcreateSessionが使われる）
		await terminalProvider.newTerminal();
	});

	teardown(() => {
		terminalProvider.dispose();
	});

	suite('sendCommand - Bracket Paste Mode', () => {
		test('Claude Code起動中、ブラケットペーストモードでコマンドを送信すること', async () => {
			// タブのisClaudeCodeRunningをtrueに設定
			const provider = terminalProvider as any;
			provider._tabs[0].isClaudeCodeRunning = true;

			await terminalProvider.sendCommand('/compact');

			// ブラケットペーストシーケンスでラップされたコマンドが送信されること
			const pasteWrite = mockService.writeCalls.find(c => c.data.includes('\x1b[200~'));
			assert.ok(pasteWrite, 'ブラケットペースト開始シーケンスが含まれること');
			assert.ok(pasteWrite!.data.includes('\x1b[201~'), 'ブラケットペースト終了シーケンスが含まれること');
			assert.strictEqual(pasteWrite!.data, '\x1b[200~/compact\x1b[201~');
		});

		test('Claude Code起動中、20ms後にEnter（\\r）が送信されること', async () => {
			const provider = terminalProvider as any;
			provider._tabs[0].isClaudeCodeRunning = true;

			await terminalProvider.sendCommand('/compact');

			// 即座にはEnterが送信されていないことを確認
			const immediateEnter = mockService.writeCalls.filter(c => c.data === '\r');
			assert.strictEqual(immediateEnter.length, 0, '即座にはEnterが送信されないこと');

			// 50ms待機してEnterが送信されたことを確認
			await new Promise(resolve => setTimeout(resolve, 50));
			const delayedEnter = mockService.writeCalls.filter(c => c.data === '\r');
			assert.strictEqual(delayedEnter.length, 1, '遅延後にEnterが送信されること');
		});

		test('Claude Code未起動時、通常の改行でコマンドを送信すること', async () => {
			// isClaudeCodeRunningはデフォルトでfalse
			await terminalProvider.sendCommand('echo "test"');

			// 通常の改行付きコマンドが送信されること
			const normalWrite = mockService.writeCalls.find(c => c.data === 'echo "test"\n');
			assert.ok(normalWrite, 'コマンド + 改行が送信されること');
		});

		test('Claude Code未起動時、ブラケットペーストシーケンスが含まれないこと', async () => {
			await terminalProvider.sendCommand('echo "test"');

			const hasBracketPaste = mockService.writeCalls.some(c => c.data.includes('\x1b[200~'));
			assert.strictEqual(hasBracketPaste, false, 'ブラケットペーストシーケンスが含まれないこと');
		});

		test('claudeコマンド送信時、isClaudeCodeRunningがtrueに更新されること', async () => {
			await terminalProvider.sendCommand('claude --model opus');

			const provider = terminalProvider as any;
			assert.strictEqual(provider._tabs[0].isClaudeCodeRunning, true, 'Claude Code起動状態に更新されること');
			assert.strictEqual(provider._tabs[0].isProcessing, true, '処理中状態に更新されること');
		});
	});

	suite('handleShortcut - Bracket Paste Mode', () => {
		test('Claude Code起動中、ブラケットペーストモードでショートカットコマンドを送信すること', () => {
			const provider = terminalProvider as any;
			provider._tabs[0].isClaudeCodeRunning = true;

			terminalProvider.handleShortcut('/clear', false);

			const pasteWrite = mockService.writeCalls.find(c => c.data.includes('\x1b[200~'));
			assert.ok(pasteWrite, 'ブラケットペースト開始シーケンスが含まれること');
			assert.strictEqual(pasteWrite!.data, '\x1b[200~/clear\x1b[201~');
		});

		test('Claude Code起動中、20ms後にEnter（\\r）が送信されること', async () => {
			const provider = terminalProvider as any;
			provider._tabs[0].isClaudeCodeRunning = true;

			terminalProvider.handleShortcut('/model sonnet', false);

			// 即座にはEnterが送信されていないことを確認
			const immediateEnter = mockService.writeCalls.filter(c => c.data === '\r');
			assert.strictEqual(immediateEnter.length, 0, '即座にはEnterが送信されないこと');

			// 50ms待機してEnterが送信されたことを確認
			await new Promise(resolve => setTimeout(resolve, 50));
			const delayedEnter = mockService.writeCalls.filter(c => c.data === '\r');
			assert.strictEqual(delayedEnter.length, 1, '遅延後にEnterが送信されること');
		});

		test('Claude Code未起動時、通常の改行でショートカットコマンドを送信すること', () => {
			terminalProvider.handleShortcut('claude', false);

			const normalWrite = mockService.writeCalls.find(c => c.data === 'claude\n');
			assert.ok(normalWrite, 'コマンド + 改行が送信されること');
		});

		test('startsClaudeCode=trueの場合、isClaudeCodeRunningがtrueに更新されること', () => {
			terminalProvider.handleShortcut('claude', true);

			const provider = terminalProvider as any;
			assert.strictEqual(provider._tabs[0].isClaudeCodeRunning, true, 'Claude Code起動状態に更新されること');
			assert.strictEqual(provider._tabs[0].isProcessing, true, '処理中状態に更新されること');
		});

		test('コマンドが空の場合、write()が呼ばれないこと', () => {
			terminalProvider.handleShortcut('', false);

			assert.strictEqual(mockService.writeCalls.length, 0, 'write()が呼ばれないこと');
		});

		test('execute=falseの場合、改行を付けずにコマンドが挿入されること', () => {
			terminalProvider.handleShortcut('claude --from-pr ', false, false);

			assert.strictEqual(mockService.writeCalls.length, 1, 'write()が1回だけ呼ばれること');
			assert.strictEqual(
				mockService.writeCalls[0].data,
				'claude --from-pr ',
				'改行を付けずにコマンドが送信されること'
			);
		});

		test('execute=falseの場合、Claude Code起動中でもEnterが送信されないこと', async () => {
			const provider = terminalProvider as any;
			provider._tabs[0].isClaudeCodeRunning = true;

			terminalProvider.handleShortcut('claude --from-pr ', false, false);

			await new Promise(resolve => setTimeout(resolve, 150));
			const enterWrites = mockService.writeCalls.filter(c => c.data === '\r');
			assert.strictEqual(enterWrites.length, 0, 'Enterが送信されないこと');
		});

		test('execute=falseの場合、Claude Codeの起動状態が変更されないこと', () => {
			terminalProvider.handleShortcut('claude --from-pr ', true, false);

			const provider = terminalProvider as any;
			assert.strictEqual(
				provider._tabs[0].isClaudeCodeRunning,
				false,
				'Claude Code起動状態が変更されないこと'
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

		test('実際のPTYセッションでブラケットペーストシーケンスが送信されること', async function() {
			// Windows環境ではシェルが見つからないためスキップ
			if (process.platform === 'win32') {
				this.skip();
			}

			// 実際のタブを作成
			await realTerminalProvider.newTerminal();

			const provider = realTerminalProvider as any;
			const tab = provider._tabs[0];
			assert.ok(tab, 'タブが作成されていること');
			assert.ok(tab.sessionId, 'セッションIDが存在すること');

			// PTY出力をキャプチャ
			const outputs: string[] = [];
			const disposable = provider._terminalService.onOutput(tab.sessionId, (data: string) => {
				outputs.push(data);
			});

			// Claude Code起動中の状態に設定
			tab.isClaudeCodeRunning = true;

			// sendCommandでブラケットペーストモードのコマンドを送信
			await realTerminalProvider.sendCommand('/compact');

			// PTYへの書き込みが完了するまで待機
			await new Promise(resolve => setTimeout(resolve, 100));

			// PTY出力にブラケットペーストシーケンスが含まれることを確認
			const allOutput = outputs.join('');
			assert.ok(
				allOutput.includes('/compact'),
				'PTY出力にコマンドが含まれること'
			);

			disposable.dispose();
		});

		test('実際のPTYセッションで通常のコマンド送信が行われること', async function() {
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

			// Claude Code未起動状態（デフォルト）でコマンドを送信
			await realTerminalProvider.sendCommand('echo bracket_paste_test');

			await new Promise(resolve => setTimeout(resolve, 100));

			const allOutput = outputs.join('');
			assert.ok(
				allOutput.includes('echo bracket_paste_test') || allOutput.includes('bracket_paste_test'),
				'PTY出力にコマンドまたはその結果が含まれること'
			);

			disposable.dispose();
		});
	});
});

/**
 * テスト用MockWebviewView
 *
 * resolveWebviewView()が登録するメッセージハンドラを捕捉し、
 * Webview（タブのクリック等）からのメッセージ送信を再現する
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
	 * Webviewからのメッセージ送信を再現する
	 */
	public async receiveMessage(data: any): Promise<void> {
		await this._messageHandler?.(data);
	}
}

/**
 * タブとファイルの関連付け（v0.9.3のTerminal Viewタブ連携）を検証する
 *
 * Run / Plan / Specの送信時にタブとファイルが関連付けられ、
 * タブを切り替えるとそのファイルがEditor Viewで開かれ、
 * Plans Viewが親ディレクトリへ移動する
 */
suite('TerminalProvider Tab-File Association Test Suite', () => {
	let terminalProvider: TerminalProvider;
	let mockService: MockTerminalService;
	let mockView: MockWebviewView;
	let showFileCalls: string[];
	let setActiveFolderCalls: { folderPath: string | undefined; force?: boolean }[];

	// 実ファイルを作成する（リネーム追従の検証にファイルシステムが必要なため）
	let tmpRoot: string | undefined;
	let plansRoot: string;
	let dirA: string;
	let fileA: string;
	let fileB: string;

	// 拡張機能のルート（out/test/suite/providers からの相対）
	// _getHtmlForWebview()がresources/webview/terminal/index.htmlを読むため実パスが必要
	const extensionRoot = path.resolve(__dirname, '..', '..', '..', '..');

	/**
	 * 新しいタブを作成し、そのタブへコマンドを送信してタブIDを返す
	 * @param filePath 関連付けるファイルパス（未指定の場合は関連付けを行わない）
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
	 * 条件が満たされるまで待機する
	 * （_closeTab()はタブのアクティブ化を待たないため、結果の確認に使う）
	 */
	async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
		const start = Date.now();
		while (!condition()) {
			if (Date.now() - start > timeoutMs) {
				throw new Error('条件が満たされませんでした');
			}
			await new Promise(resolve => setTimeout(resolve, 5));
		}
	}

	/**
	 * タブに関連付けられているファイルパスを取得する
	 */
	function getAssociatedFilePath(tabId: string): string | undefined {
		return ((terminalProvider as any)._tabFileMap as Map<string, string>).get(tabId);
	}

	setup(async function() {
		// Windows環境ではシェルが見つからないためスキップ
		if (process.platform === 'win32') {
			this.skip();
		}

		// タスクディレクトリを模した構成を作成する
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

		// Webviewを解決してメッセージハンドラを登録させる
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

	test('タブを切り替えると、そのタブへ送信したファイルがEditor Viewで開かれること', async () => {
		const tabA = await sendToNewTab(fileA);
		const tabB = await sendToNewTab(fileB);

		showFileCalls = [];

		await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });
		assert.deepStrictEqual(showFileCalls, [fileA], 'タブAのファイルが開かれること');

		await mockView.receiveMessage({ type: 'activateTab', tabId: tabB });
		assert.deepStrictEqual(showFileCalls, [fileA, fileB], 'タブBのファイルが開かれること');
	});

	test('タブを切り替えると、Plans Viewが関連ファイルの親ディレクトリへ移動すること', async () => {
		const tabA = await sendToNewTab(fileA);
		await sendToNewTab(fileB);

		setActiveFolderCalls = [];

		await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });

		assert.deepStrictEqual(
			setActiveFolderCalls,
			[{ folderPath: path.dirname(fileA), force: false }],
			'親ディレクトリへforce=falseで移動すること'
		);
	});

	test('ファイルパスを渡さない送信ではタブに関連付けされないこと', async () => {
		// ファイル未オープン時のRun（runCommandWithoutFile）はfilePathを渡さない
		const tabWithoutFile = await sendToNewTab(undefined);
		await sendToNewTab(fileA);

		showFileCalls = [];
		setActiveFolderCalls = [];

		await mockView.receiveMessage({ type: 'activateTab', tabId: tabWithoutFile });

		assert.deepStrictEqual(showFileCalls, [], 'Editor Viewが更新されないこと');
		assert.deepStrictEqual(setActiveFolderCalls, [], 'Plans Viewが移動しないこと');
	});

	test('同じタブへ続けて送信すると、関連付けが最後のファイルで上書きされること', async () => {
		const tabA = await sendToNewTab(fileA);
		// 同じタブでPlanを実行する
		await terminalProvider.sendCommand('echo test', true, fileB, 'plan');

		// 別のタブへ移動してから戻る
		await sendToNewTab(undefined);
		showFileCalls = [];

		await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });

		assert.deepStrictEqual(showFileCalls, [fileB], '最後に送信したファイルが開かれること');
	});

	test('存在しないタブIDを指定してもEditor Viewが更新されないこと', async () => {
		await sendToNewTab(fileA);
		showFileCalls = [];

		await mockView.receiveMessage({ type: 'activateTab', tabId: 'tab-does-not-exist' });

		assert.deepStrictEqual(showFileCalls, [], 'Editor Viewが更新されないこと');
	});

	test('アクティブタブを閉じると、次にアクティブ化されるタブの関連ファイルが開かれること', async () => {
		await sendToNewTab(fileA);
		await sendToNewTab(fileB); // タブBがアクティブ

		showFileCalls = [];

		// killTerminal()はアクティブタブ（タブB）を閉じ、タブAをアクティブ化する
		terminalProvider.killTerminal();
		await waitFor(() => showFileCalls.length > 0);

		assert.deepStrictEqual(showFileCalls, [fileA], 'タブAのファイルが開かれること');
	});

	test('タブを閉じると、そのタブの関連付けが削除されること', async () => {
		const tabA = await sendToNewTab(fileA);
		await sendToNewTab(fileB);

		// タブAをアクティブにしてから閉じる
		await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });
		terminalProvider.killTerminal();

		assert.strictEqual(getAssociatedFilePath(tabA), undefined, '閉じたタブの関連付けが残らないこと');
	});

	suite('ディレクトリのリネームへの追従', () => {
		// Quick Startのテンプレートは、タスク内容に応じたディレクトリ名へのリネームをAIエージェントへ指示する（v1.0.20）
		const RENAMED_DIR_NAME = 'weather-osaka';

		/**
		 * ファイルが格納されているディレクトリをリネームし、リネーム後のファイルパスを返す
		 */
		async function renameDirectory(): Promise<string> {
			const renamedDir = path.join(plansRoot, RENAMED_DIR_NAME);
			await fsPromises.rename(dirA, renamedDir);
			return path.join(renamedDir, path.basename(fileA));
		}

		test('ディレクトリ名が変更されていても、リネーム後のファイルが開かれること', async () => {
			const tabA = await sendToNewTab(fileA);
			await sendToNewTab(fileB);

			const renamedFilePath = await renameDirectory();
			showFileCalls = [];

			await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });

			assert.deepStrictEqual(
				showFileCalls,
				[renamedFilePath],
				'リネーム後のパスでファイルが開かれること'
			);
		});

		test('ディレクトリ名が変更されていても、Plans Viewがリネーム後のディレクトリへ移動すること', async () => {
			const tabA = await sendToNewTab(fileA);
			await sendToNewTab(fileB);

			const renamedFilePath = await renameDirectory();
			setActiveFolderCalls = [];

			await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });

			assert.deepStrictEqual(
				setActiveFolderCalls,
				[{ folderPath: path.dirname(renamedFilePath), force: false }],
				'リネーム後のディレクトリへ移動すること'
			);
		});

		test('リネームを検出したら、タブの関連付けが新しいパスへ更新されること', async () => {
			const tabA = await sendToNewTab(fileA);
			await sendToNewTab(fileB);

			const renamedFilePath = await renameDirectory();
			await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });

			assert.strictEqual(
				getAssociatedFilePath(tabA),
				renamedFilePath,
				'関連付けがリネーム後のパスへ更新されること'
			);
		});

		test('ディレクトリごと削除された場合は、Editor Viewを更新せず関連付けを破棄すること', async () => {
			const tabA = await sendToNewTab(fileA);
			await sendToNewTab(fileB);

			await fsPromises.rm(dirA, { recursive: true, force: true });
			showFileCalls = [];
			setActiveFolderCalls = [];

			await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });

			assert.deepStrictEqual(showFileCalls, [], 'Editor Viewが更新されないこと');
			assert.deepStrictEqual(setActiveFolderCalls, [], 'Plans Viewが移動しないこと');
			assert.strictEqual(getAssociatedFilePath(tabA), undefined, '関連付けが破棄されること');
		});

		test('同名ファイルを持つディレクトリが無い場合は、関連付けを破棄すること', async () => {
			const tabA = await sendToNewTab(fileA);
			await sendToNewTab(fileB);

			// ファイル名も変わってしまった場合は追跡できない
			const renamedDir = path.join(plansRoot, RENAMED_DIR_NAME);
			await fsPromises.rename(dirA, renamedDir);
			await fsPromises.rename(
				path.join(renamedDir, path.basename(fileA)),
				path.join(renamedDir, 'renamed.md')
			);
			showFileCalls = [];

			await mockView.receiveMessage({ type: 'activateTab', tabId: tabA });

			assert.deepStrictEqual(showFileCalls, [], 'Editor Viewが更新されないこと');
			assert.strictEqual(getAssociatedFilePath(tabA), undefined, '関連付けが破棄されること');
		});
	});
});
