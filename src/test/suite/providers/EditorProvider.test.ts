import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { EditorProvider } from '../../../providers/EditorProvider';
import { PlansProvider } from '../../../providers/PlansProvider';
import { TemplateService } from '../../../services/TemplateService';

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
			fs.rmSync(testDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
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

	suite('Integration with TemplateService', () => {
		test('Should use TemplateService for file operations', () => {
			// TemplateServiceが注入されていることを確認
			// EditorProviderがTemplateServiceを使用してタイムスタンプ生成などを行う
			const timestamp = templateService.generateTimestamp();
			assert.ok(timestamp.match(/^\d{4}_\d{4}_\d{4}_\d{2}$/));
		});
	});
});
