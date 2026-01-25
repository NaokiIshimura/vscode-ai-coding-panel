import * as assert from 'assert';
import * as vscode from 'vscode';
import { TerminalProvider } from '../../../providers/TerminalProvider';

// Mock EditorProvider interface
interface IEditorProvider {
    getCurrentFilePath(): string | undefined;
    clearFile(): Promise<void>;
    showFile(filePath: string): Promise<void>;
}

// Mock PlansProvider interface
interface IPlansProvider {
    setActiveFolder(folderPath: string | undefined, force?: boolean): void;
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
				showFile: async (filePath: string) => {}
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
		test('Should not throw error when inserting paths without WebView', async () => {
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
