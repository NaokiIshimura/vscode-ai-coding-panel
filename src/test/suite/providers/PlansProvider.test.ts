import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PlansProvider } from '../../../providers/PlansProvider';
import { FileItem } from '../../../providers/items/FileItem';
import { FileWatcherService } from '../../../services/FileWatcherService';

suite('PlansProvider Integration Test Suite', () => {
	let plansProvider: PlansProvider;
	let fileWatcherService: FileWatcherService;
	const testDir = path.join(__dirname, '../../fixtures/plans');
	// out/test/suite/providers から拡張機能のルートへ遡る
	const extensionRoot = path.resolve(__dirname, '../../../..');

	setup(async () => {
		// テストディレクトリを作成
		if (!fs.existsSync(testDir)) {
			fs.mkdirSync(testDir, { recursive: true });
		}

		// FileWatcherServiceを初期化
		fileWatcherService = new FileWatcherService();

		// PlansProviderを初期化（WebView初期化なし）
		plansProvider = new PlansProvider(fileWatcherService, vscode.Uri.file(extensionRoot));
	});

	teardown(() => {
		// クリーンアップ
		plansProvider.dispose();
		fileWatcherService.dispose();

		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
		}
	});

	/**
	 * refresh()の呼び出しを記録するスパイを仕掛ける
	 * Webview化により onDidChangeTreeData が無くなったため、更新契機の検証に使用する
	 */
	function spyOnRefresh(): { calledCount: () => number; restore: () => void } {
		const original = plansProvider.refresh.bind(plansProvider);
		let count = 0;
		(plansProvider as any).refresh = (targetPath?: string) => {
			count++;
			original(targetPath);
		};
		return {
			calledCount: () => count,
			restore: () => { (plansProvider as any).refresh = original; }
		};
	}

	suite('setRootPath', () => {
		test('Should set root path and activate folder', async () => {
			await plansProvider.setRootPath(testDir);

			const rootPath = plansProvider.getRootPath();
			const currentPath = plansProvider.getCurrentPath();

			assert.strictEqual(rootPath, testDir);
			assert.strictEqual(currentPath, testDir);
		});

		test('Should handle relative path parameter', async () => {
			const relativePath = '.claude/plans';
			await plansProvider.setRootPath(testDir, relativePath);

			const configuredPath = plansProvider.getConfiguredRelativePath();
			assert.strictEqual(configuredPath, relativePath);
		});

		test('Should handle non-existent path', async () => {
			const nonExistentPath = path.join(testDir, 'nonexistent');
			await plansProvider.setRootPath(nonExistentPath);

			// パスが見つからない場合、作成ボタンが表示される
			const items = await plansProvider.buildItems();
			assert.strictEqual(items.length, 1);
			assert.strictEqual(items[0].kind, 'createDirectory');
			assert.strictEqual(items[0].contextValue, 'createDirectoryButton');
		});
	});

	suite('buildItems', () => {
		test('Should return empty array when no root path is set', async () => {
			const items = await plansProvider.buildItems();
			assert.strictEqual(items.length, 0);
		});

		test('Should return path display item as the first item', async () => {
			await plansProvider.setRootPath(testDir);

			const items = await plansProvider.buildItems();
			assert.ok(items.length > 0);
			// Quick StartはHTMLボタンになったため、一覧の先頭はパス表示アイテム
			assert.strictEqual(items[0].kind, 'path');
			assert.strictEqual(items[0].contextValue, 'pathDisplay');
		});

		test('Should not include a Quick Start row (it is an HTML button now)', async () => {
			await plansProvider.setRootPath(testDir);

			const items = await plansProvider.buildItems();
			const quickStartRow = items.find(item => item.label === 'Quick Start');
			assert.strictEqual(quickStartRow, undefined);
		});

		test('Should return parent directory item when not at root', async () => {
			// サブディレクトリを作成
			const subDir = path.join(testDir, 'subdir');
			fs.mkdirSync(subDir, { recursive: true });

			await plansProvider.setRootPath(testDir);
			plansProvider.setActiveFolder(subDir);

			const items = await plansProvider.buildItems();
			const parentItem = items.find(item => item.kind === 'parent');
			assert.ok(parentItem);
			assert.strictEqual(parentItem!.label, '..');
			assert.strictEqual(parentItem!.filePath, testDir);
		});

		test('Should mark the path display item as non-root in a subdirectory', async () => {
			const subDir = path.join(testDir, 'subdir');
			fs.mkdirSync(subDir, { recursive: true });

			await plansProvider.setRootPath(testDir);
			plansProvider.setActiveFolder(subDir);

			const items = await plansProvider.buildItems();
			// archiveDirectoryコマンドが 'pathDisplayNonRoot' を判定するため重要
			assert.strictEqual(items[0].contextValue, 'pathDisplayNonRoot');
		});

		test('Should list files and directories', async () => {
			// テストファイルとディレクトリを作成
			fs.writeFileSync(path.join(testDir, 'test.md'), 'content', 'utf8');
			fs.mkdirSync(path.join(testDir, 'testDir'), { recursive: true });

			await plansProvider.setRootPath(testDir);

			const items = await plansProvider.buildItems();
			// パス表示アイテム + ファイル + ディレクトリ
			assert.ok(items.length >= 3);

			const fileItem = items.find(item => item.filePath === path.join(testDir, 'test.md'));
			const dirItem = items.find(item => item.filePath === path.join(testDir, 'testDir'));

			assert.ok(fileItem);
			assert.ok(dirItem);
			assert.strictEqual(fileItem!.kind, 'file');
			assert.strictEqual(dirItem!.kind, 'directory');
			assert.strictEqual(dirItem!.contextValue, 'directory');
			assert.strictEqual(fileItem!.contextValue, 'file');
		});

		test('Should assign an edit icon to Editor View target files', async () => {
			fs.writeFileSync(path.join(testDir, '2026_0101_0101_01_PROMPT.md'), 'content', 'utf8');
			fs.writeFileSync(path.join(testDir, 'other.md'), 'content', 'utf8');

			await plansProvider.setRootPath(testDir);

			const items = await plansProvider.buildItems();
			const promptItem = items.find(item => item.label === '2026_0101_0101_01_PROMPT.md');
			const otherItem = items.find(item => item.label === 'other.md');

			assert.strictEqual(promptItem!.icon, 'edit');
			assert.strictEqual(otherItem!.icon, 'markdown');
		});
	});

	suite('webview inline actions', () => {
		// TreeViewの view/item/context inline グループをWebviewへ移植した際に
		// これらのアクションが欠落した不具合があったため、定義の存在を検証する
		const mainJsPath = path.join(extensionRoot, 'resources', 'webview', 'plans', 'main.js');

		test('Should define inline actions for file rows', () => {
			const mainJs = fs.readFileSync(mainJsPath, 'utf8');
			const inlineActionsBlock = mainJs.slice(
				mainJs.indexOf('const INLINE_ACTIONS'),
				mainJs.indexOf('quickStartButton.addEventListener')
			);

			assert.ok(inlineActionsBlock.includes('aiCodingSidebar.insertPathToEditor'));
			assert.ok(inlineActionsBlock.includes('aiCodingSidebar.insertPathToTerminal'));
		});

		test('Should define inline actions for path and directory rows', () => {
			const mainJs = fs.readFileSync(mainJsPath, 'utf8');
			const inlineActionsBlock = mainJs.slice(
				mainJs.indexOf('const INLINE_ACTIONS'),
				mainJs.indexOf('quickStartButton.addEventListener')
			);

			for (const command of [
				'aiCodingSidebar.createMarkdownFile',
				'aiCodingSidebar.createTaskFile',
				'aiCodingSidebar.createSpecFile',
				'aiCodingSidebar.addDirectory',
				'aiCodingSidebar.copyRelativePath',
				'aiCodingSidebar.rename',
				'aiCodingSidebar.archiveDirectory',
				'aiCodingSidebar.showInPanel'
			]) {
				assert.ok(inlineActionsBlock.includes(command), `${command} should have an inline action`);
			}
		});
	});

	suite('webview html', () => {
		test('Should render the Quick Start button and resolve template variables', async () => {
			const webview = {
				cspSource: 'vscode-webview://test',
				asWebviewUri: (uri: vscode.Uri) => uri
			} as unknown as vscode.Webview;

			const html = await (plansProvider as any)._getHtmlForWebview(webview);

			assert.ok(html.includes('quick-start-button'));
			assert.ok(html.includes('Quick Start'));
			// テンプレート変数が全て置換されていること
			assert.ok(!html.includes('{{cspSource}}'));
			assert.ok(!html.includes('{{styleUri}}'));
			assert.ok(!html.includes('{{scriptUri}}'));
			assert.ok(!html.includes('{{codiconsUri}}'));
		});
	});

	suite('setActiveFolder', () => {
		test('Should change active folder path', async () => {
			const subDir = path.join(testDir, 'subdir');
			fs.mkdirSync(subDir, { recursive: true });

			await plansProvider.setRootPath(testDir);

			// アクティブフォルダを変更
			plansProvider.setActiveFolder(subDir);

			const activeFolderPath = plansProvider.getActiveFolderPath();
			assert.strictEqual(activeFolderPath, subDir);
		});

		test('Should update current path', async () => {
			const subDir = path.join(testDir, 'subdir');
			fs.mkdirSync(subDir, { recursive: true });

			await plansProvider.setRootPath(testDir);
			plansProvider.setActiveFolder(subDir);

			const currentPath = plansProvider.getCurrentPath();
			assert.strictEqual(currentPath, subDir);
		});

		test('Should ignore folders outside of the root path', async () => {
			await plansProvider.setRootPath(testDir);
			plansProvider.setActiveFolder('/tmp/outside-of-root');

			assert.strictEqual(plansProvider.getActiveFolderPath(), testDir);
		});
	});

	suite('refresh', () => {
		test('Should clear cache on full refresh', async () => {
			await plansProvider.setRootPath(testDir);

			// 初回読み込みでキャッシュを構築
			await plansProvider.buildItems();

			// 新しいファイルを作成
			fs.writeFileSync(path.join(testDir, 'new.md'), 'content', 'utf8');

			// 全体更新
			plansProvider.refresh();

			// キャッシュがクリアされているので新しいファイルが表示される
			const items = await plansProvider.buildItems();
			const newFile = items.find(item => item.filePath === path.join(testDir, 'new.md'));
			assert.ok(newFile);
		});

		test('Should not throw when no webview is resolved', async () => {
			await plansProvider.setRootPath(testDir);

			assert.doesNotThrow(() => {
				plansProvider.refresh();
			});
		});
	});

	suite('getCurrentPath', () => {
		test('Should return active folder path if set', async () => {
			const subDir = path.join(testDir, 'subdir');
			fs.mkdirSync(subDir, { recursive: true });

			await plansProvider.setRootPath(testDir);
			plansProvider.setActiveFolder(subDir);

			const currentPath = plansProvider.getCurrentPath();
			assert.strictEqual(currentPath, subDir);
		});

		test('Should return root path if active folder not set', async () => {
			await plansProvider.setRootPath(testDir);

			const currentPath = plansProvider.getCurrentPath();
			assert.strictEqual(currentPath, testDir);
		});

		test('Should return undefined if no path is set', () => {
			const currentPath = plansProvider.getCurrentPath();
			assert.strictEqual(currentPath, undefined);
		});
	});

	suite('selected item management', () => {
		test('Should set and get selected item', () => {
			const item = new FileItem(
				'test.md',
				vscode.TreeItemCollapsibleState.None,
				path.join(testDir, 'test.md'),
				false,
				0,
				new Date(),
				new Date()
			);

			plansProvider.setSelectedItem(item);

			assert.strictEqual(plansProvider.getSelectedItem(), item);
		});

		test('Should clear selected item', () => {
			const item = new FileItem(
				'test.md',
				vscode.TreeItemCollapsibleState.None,
				path.join(testDir, 'test.md'),
				false,
				0,
				new Date(),
				new Date()
			);

			plansProvider.setSelectedItem(item);
			plansProvider.setSelectedItem(undefined);

			assert.strictEqual(plansProvider.getSelectedItem(), undefined);
		});
	});

	suite('_createFileItem', () => {
		test('Should preserve the given contextValue for archiveDirectory', async () => {
			const subDir = path.join(testDir, 'subdir');
			fs.mkdirSync(subDir, { recursive: true });

			const item = await (plansProvider as any)._createFileItem(subDir, true, 'subdir', 'pathDisplayNonRoot');

			// archiveDirectoryコマンドが contextValue で現在ディレクトリか判定するため
			assert.strictEqual(item.contextValue, 'pathDisplayNonRoot');
			assert.strictEqual(item.filePath, subDir);
			assert.strictEqual(item.isDirectory, true);
		});

		test('Should fall back to the default contextValue when not given', async () => {
			const filePath = path.join(testDir, 'test.md');
			fs.writeFileSync(filePath, 'content', 'utf8');

			const item = await (plansProvider as any)._createFileItem(filePath, false);

			assert.strictEqual(item.contextValue, 'file');
			assert.strictEqual(item.isDirectory, false);
		});
	});

	suite('formatDateTimePrefix', () => {
		test('Should return [HH:MM] for today', () => {
			const today = new Date();
			const result = (plansProvider as any).formatDateTimePrefix(today);
			const hour = String(today.getHours()).padStart(2, '0');
			const minute = String(today.getMinutes()).padStart(2, '0');
			assert.strictEqual(result, `[${hour}:${minute}]`);
		});

		test('Should return [MM/DD] for non-today', () => {
			const yesterday = new Date();
			yesterday.setDate(yesterday.getDate() - 1);
			const result = (plansProvider as any).formatDateTimePrefix(yesterday);
			const month = String(yesterday.getMonth() + 1).padStart(2, '0');
			const day = String(yesterday.getDate()).padStart(2, '0');
			assert.strictEqual(result, `[${month}/${day}]`);
		});

		test('Should return [MM/DD] for date in different year', () => {
			const lastYear = new Date();
			lastYear.setFullYear(lastYear.getFullYear() - 1);
			const result = (plansProvider as any).formatDateTimePrefix(lastYear);
			const month = String(lastYear.getMonth() + 1).padStart(2, '0');
			const day = String(lastYear.getDate()).padStart(2, '0');
			assert.strictEqual(result, `[${month}/${day}]`);
		});
	});

	suite('root directory date/time prefix', () => {
		test('Should not display date/time prefix for files in root directory', async () => {
			fs.writeFileSync(path.join(testDir, 'test.md'), 'content', 'utf8');

			await plansProvider.setRootPath(testDir);

			const items = await plansProvider.buildItems();
			const fileItem = items.find(item => item.filePath === path.join(testDir, 'test.md'));

			assert.ok(fileItem);
			// ルートディレクトリのファイルはプレフィックスなし
			assert.strictEqual(fileItem!.label, 'test.md');
		});

		test('Should display date/time prefix for directories in root directory', async () => {
			fs.mkdirSync(path.join(testDir, 'subdir'), { recursive: true });

			await plansProvider.setRootPath(testDir);

			const items = await plansProvider.buildItems();
			const dirItem = items.find(item => item.filePath === path.join(testDir, 'subdir'));

			assert.ok(dirItem);
			// ルートディレクトリのディレクトリはプレフィックス付きラベル
			assert.ok(dirItem!.label.endsWith('subdir'));
			assert.ok(dirItem!.label.startsWith('['));
		});

		test('Should not display date/time prefix for files in subdirectory', async () => {
			const subDir = path.join(testDir, 'subdir');
			fs.mkdirSync(subDir, { recursive: true });
			fs.writeFileSync(path.join(subDir, 'sub.md'), 'content', 'utf8');

			await plansProvider.setRootPath(testDir);
			plansProvider.setActiveFolder(subDir);

			const items = await plansProvider.buildItems();
			const fileItem = items.find(item => item.filePath === path.join(subDir, 'sub.md'));

			assert.ok(fileItem);
			// サブディレクトリのファイルはプレフィックスなし
			assert.strictEqual(fileItem!.label, 'sub.md');
		});
	});

	suite('polling', () => {
		test('Should start polling on handleVisibilityChange(true)', () => {
			plansProvider.handleVisibilityChange(true);
			const timer = (plansProvider as any)._pollingTimer;
			assert.ok(timer !== undefined, 'Polling timer should be set when view becomes visible');
		});

		test('Should stop polling on handleVisibilityChange(false)', () => {
			plansProvider.handleVisibilityChange(true);
			plansProvider.handleVisibilityChange(false);
			const timer = (plansProvider as any)._pollingTimer;
			assert.strictEqual(timer, undefined, 'Polling timer should be cleared when view is hidden');
		});

		test('Should stop polling on dispose', () => {
			plansProvider.handleVisibilityChange(true);
			plansProvider.dispose();
			const timer = (plansProvider as any)._pollingTimer;
			assert.strictEqual(timer, undefined, 'Polling timer should be cleared on dispose');
		});

		test('Should refresh when directory changes during polling', async () => {
			await plansProvider.setRootPath(testDir);

			// ポーリングの初期スナップショットを確定させる
			await (plansProvider as any)._pollDirectory();

			const spy = spyOnRefresh();

			// ファイルを追加してディレクトリを変化させる
			fs.writeFileSync(path.join(testDir, 'polling_test.md'), 'content', 'utf8');

			// _pollDirectoryを直接呼び出して変化を検知させる
			await (plansProvider as any)._pollDirectory();

			spy.restore();
			assert.ok(spy.calledCount() > 0, 'refresh should be called when directory content changes');
		});

		test('Should not refresh when directory is unchanged', async () => {
			await plansProvider.setRootPath(testDir);
			fs.writeFileSync(path.join(testDir, 'stable.md'), 'content', 'utf8');

			// 初回ポーリングでスナップショットを確定させる
			await (plansProvider as any)._pollDirectory();

			const spy = spyOnRefresh();

			// 2回目のポーリング（変化なし）
			await (plansProvider as any)._pollDirectory();

			spy.restore();
			assert.strictEqual(spy.calledCount(), 0, 'refresh should not be called when directory is unchanged');
		});

		test('Should reset snapshot when navigating to directory', async () => {
			const subDir = path.join(testDir, 'subdir');
			fs.mkdirSync(subDir, { recursive: true });
			await plansProvider.setRootPath(testDir);

			// スナップショットを設定
			(plansProvider as any)._lastDirFileCount = 5;
			(plansProvider as any)._lastDirModTime = 12345;

			// ディレクトリ移動（navigateToDirectoryの内部処理をシミュレート）
			await plansProvider.navigateToDirectory(subDir);

			// スナップショットがリセットされているか確認
			assert.strictEqual((plansProvider as any)._lastDirFileCount, -1, 'File count should be reset after navigation');
			assert.strictEqual((plansProvider as any)._lastDirModTime, 0, 'Mod time should be reset after navigation');
		});
	});
});
