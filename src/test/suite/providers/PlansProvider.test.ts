import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PlansProvider, MAX_SEARCH_RESULTS, MAX_SEARCH_FILE_SIZE, parseTimestampedFileName } from '../../../providers/PlansProvider';
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

		test('Should report whether the root path is missing', async () => {
			await plansProvider.setRootPath(path.join(testDir, 'nonexistent'));
			assert.strictEqual(plansProvider.isRootPathNotFound(), true);

			await plansProvider.setRootPath(testDir);
			assert.strictEqual(plansProvider.isRootPathNotFound(), false);
		});
	});

	suite('findLatestResumeSession', () => {
		const sessionId = '0f1d2c3b-4a59-4687-8f0a-1b2c3d4e5f60';

		test('Should return the latest session in metadata.md of the current directory', async () => {
			const taskDir = path.join(testDir, 'task');
			fs.mkdirSync(taskDir, { recursive: true });
			fs.writeFileSync(path.join(taskDir, 'metadata.md'), [
				'# metadata',
				'',
				'## sessions',
				'- 2026/10/17 18:54:39 | run  | old_PROMPT.md | claude --resume 11111111-2222-4333-8444-555555555555',
				`- 2026/10/17 19:02:11 | plan | new_PROMPT.md | claude --resume ${sessionId}`,
				''
			].join('\n'), 'utf8');
			await plansProvider.setRootPath(testDir);
			plansProvider.setActiveFolder(taskDir);

			const session = await plansProvider.findLatestResumeSession();

			assert.deepStrictEqual(session, {
				commandType: 'plan',
				fileName: 'new_PROMPT.md',
				sessionId,
				dirPath: taskDir
			});
		});

		test('Should not look into subdirectories', async () => {
			const taskDir = path.join(testDir, 'task');
			fs.mkdirSync(taskDir, { recursive: true });
			fs.writeFileSync(path.join(taskDir, 'metadata.md'),
				`## sessions\n- 2026/10/17 18:54:39 | run  | a.md | claude --resume ${sessionId}\n`, 'utf8');
			await plansProvider.setRootPath(testDir);

			assert.strictEqual(await plansProvider.findLatestResumeSession(), undefined);
		});

		test('Should return undefined when metadata.md has no valid session', async () => {
			fs.writeFileSync(path.join(testDir, 'metadata.md'), '# metadata\n\n## sessions\n', 'utf8');
			await plansProvider.setRootPath(testDir);

			assert.strictEqual(await plansProvider.findLatestResumeSession(), undefined);
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
			const promptItem = items.find(item => item.filePath === path.join(testDir, '2026_0101_0101_01_PROMPT.md'));
			const otherItem = items.find(item => item.filePath === path.join(testDir, 'other.md'));

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

	suite('date/time prefix', () => {
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

		test('Should display date/time prefix for files in subdirectory', async () => {
			const subDir = path.join(testDir, 'subdir');
			fs.mkdirSync(subDir, { recursive: true });
			fs.writeFileSync(path.join(subDir, 'sub.md'), 'content', 'utf8');

			await plansProvider.setRootPath(testDir);
			plansProvider.setActiveFolder(subDir);

			const items = await plansProvider.buildItems();
			const fileItem = items.find(item => item.filePath === path.join(subDir, 'sub.md'));

			assert.ok(fileItem);
			// サブディレクトリのファイルはプレフィックス付きラベル
			assert.match(fileItem!.label, /^\[(\d{2}:\d{2}|\d{2}\/\d{2})\] sub\.md$/);
		});

		test('Should display date/time prefix for directories in subdirectory', async () => {
			const subDir = path.join(testDir, 'subdir');
			fs.mkdirSync(path.join(subDir, 'nested'), { recursive: true });

			await plansProvider.setRootPath(testDir);
			plansProvider.setActiveFolder(subDir);

			const items = await plansProvider.buildItems();
			const dirItem = items.find(item => item.filePath === path.join(subDir, 'nested'));

			assert.ok(dirItem);
			// サブディレクトリのディレクトリもプレフィックス付きラベル
			assert.match(dirItem!.label, /^\[(\d{2}:\d{2}|\d{2}\/\d{2})\] nested$/);
		});

		test('Should not display date/time prefix for path and parent rows in subdirectory', async () => {
			const subDir = path.join(testDir, 'subdir');
			fs.mkdirSync(subDir, { recursive: true });

			await plansProvider.setRootPath(testDir);
			plansProvider.setActiveFolder(subDir);

			const items = await plansProvider.buildItems();
			const pathItem = items.find(item => item.kind === 'path');
			const parentItem = items.find(item => item.kind === 'parent');

			assert.strictEqual(pathItem!.label, 'subdir');
			assert.strictEqual(parentItem!.label, '..');
		});
	});

	suite('parseTimestampedFileName', () => {
		test('Should split a timestamped target file name into the date and the short name', () => {
			const parsed = parseTimestampedFileName('2026_1011_0206_17_QUICK_START.md');

			assert.ok(parsed);
			assert.strictEqual(parsed!.shortName, 'QUICK_START.md');
			assert.strictEqual(parsed!.date.getTime(), new Date(2026, 9, 11, 2, 6, 17).getTime());
		});

		test('Should accept every Editor View target type', () => {
			for (const type of ['PROMPT', 'TASK', 'SPEC', 'QUICK_START']) {
				assert.strictEqual(parseTimestampedFileName(`2026_0101_0101_01_${type}.md`)?.shortName, `${type}.md`);
			}
		});

		test('Should return undefined for names that are not timestamped target files', () => {
			assert.strictEqual(parseTimestampedFileName('2026_0101_0101_01_plan.md'), undefined);
			assert.strictEqual(parseTimestampedFileName('2026_0101_0101_01_PROMPT.txt'), undefined);
			assert.strictEqual(parseTimestampedFileName('PROMPT.md'), undefined);
			assert.strictEqual(parseTimestampedFileName('x2026_0101_0101_01_PROMPT.md'), undefined);
		});

		test('Should return undefined for out-of-range date/time values', () => {
			assert.strictEqual(parseTimestampedFileName('2026_1340_0101_01_PROMPT.md'), undefined);
			assert.strictEqual(parseTimestampedFileName('2026_0230_0101_01_PROMPT.md'), undefined);
			assert.strictEqual(parseTimestampedFileName('2026_0101_2460_01_PROMPT.md'), undefined);
		});
	});

	suite('short file labels', () => {
		test('Should replace the timestamp with a [MM/DD] prefix taken from the file name in subdirectories', async () => {
			const subDir = path.join(testDir, 'subdir');
			fs.mkdirSync(subDir, { recursive: true });
			const filePath = path.join(subDir, '2020_0102_0304_05_QUICK_START.md');
			fs.writeFileSync(filePath, 'content', 'utf8');

			await plansProvider.setRootPath(testDir);
			plansProvider.setActiveFolder(subDir);

			const items = await plansProvider.buildItems();
			const fileItem = items.find(item => item.filePath === filePath);

			assert.ok(fileItem);
			// ファイルの作成日時（今日）ではなくファイル名の日時を使う
			assert.strictEqual(fileItem!.label, '[01/02] QUICK_START.md');
			// tooltipには実ファイルのパスを残す
			assert.strictEqual(fileItem!.tooltip, filePath);
		});

		test('Should use a [HH:MM] prefix when the file name timestamp is today', async () => {
			const subDir = path.join(testDir, 'subdir');
			fs.mkdirSync(subDir, { recursive: true });
			const now = new Date();
			const pad = (value: number) => String(value).padStart(2, '0');
			const fileName = `${now.getFullYear()}_${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}_${pad(now.getSeconds())}_PROMPT.md`;
			fs.writeFileSync(path.join(subDir, fileName), 'content', 'utf8');

			await plansProvider.setRootPath(testDir);
			plansProvider.setActiveFolder(subDir);

			const items = await plansProvider.buildItems();
			const fileItem = items.find(item => item.filePath === path.join(subDir, fileName));

			assert.strictEqual(fileItem!.label, `[${pad(now.getHours())}:${pad(now.getMinutes())}] PROMPT.md`);
		});

		test('Should shorten timestamped files in the root directory as well', async () => {
			fs.writeFileSync(path.join(testDir, '2020_0102_0304_05_PROMPT.md'), 'content', 'utf8');
			fs.writeFileSync(path.join(testDir, 'notes.md'), 'content', 'utf8');

			await plansProvider.setRootPath(testDir);

			const items = await plansProvider.buildItems();

			assert.strictEqual(items.find(item => item.filePath === path.join(testDir, '2020_0102_0304_05_PROMPT.md'))!.label, '[01/02] PROMPT.md');
			// タイムスタンプ形式以外のルートのファイルは従来どおりプレフィックス無し
			assert.strictEqual(items.find(item => item.filePath === path.join(testDir, 'notes.md'))!.label, 'notes.md');
		});

		test('Should keep the full name for files that are not timestamped target files', async () => {
			const subDir = path.join(testDir, 'subdir');
			fs.mkdirSync(subDir, { recursive: true });
			fs.writeFileSync(path.join(subDir, '2020_0102_0304_05_plan.md'), 'content', 'utf8');

			await plansProvider.setRootPath(testDir);
			plansProvider.setActiveFolder(subDir);

			const items = await plansProvider.buildItems();
			const fileItem = items.find(item => item.filePath === path.join(subDir, '2020_0102_0304_05_plan.md'));

			assert.match(fileItem!.label, /^\[(\d{2}:\d{2}|\d{2}\/\d{2})\] 2020_0102_0304_05_plan\.md$/);
		});

		test('Should not shorten directory names', async () => {
			fs.mkdirSync(path.join(testDir, '2020_0102_0304_05'), { recursive: true });

			await plansProvider.setRootPath(testDir);

			const items = await plansProvider.buildItems();
			const dirItem = items.find(item => item.filePath === path.join(testDir, '2020_0102_0304_05'));

			assert.match(dirItem!.label, /^\[(\d{2}:\d{2}|\d{2}\/\d{2})\] 2020_0102_0304_05$/);
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

	suite('search', () => {
		/**
		 * 検索用のフィクスチャを作成する
		 *   login-feature/2026_0101_0000_00_PROMPT.md  （本文: Add OAuth login）
		 *   login-feature/notes.txt                     （本文: oauth ※.md以外）
		 *   archived/old_task/2026_0102_0000_00_TASK.md （本文: Refactor search）
		 *   .hidden/secret.md                           （本文: oauth）
		 */
		function createSearchFixture(): void {
			const loginDir = path.join(testDir, 'login-feature');
			const oldDir = path.join(testDir, 'archived', 'old_task');
			const hiddenDir = path.join(testDir, '.hidden');
			fs.mkdirSync(loginDir, { recursive: true });
			fs.mkdirSync(oldDir, { recursive: true });
			fs.mkdirSync(hiddenDir, { recursive: true });
			fs.writeFileSync(path.join(loginDir, '2026_0101_0000_00_PROMPT.md'), '# task\n\n  Add OAuth login  \n', 'utf8');
			fs.writeFileSync(path.join(loginDir, 'notes.txt'), 'oauth', 'utf8');
			fs.writeFileSync(path.join(oldDir, '2026_0102_0000_00_TASK.md'), '# task\nRefactor search\n', 'utf8');
			fs.writeFileSync(path.join(hiddenDir, 'secret.md'), 'oauth', 'utf8');
		}

		function resultPaths(items: { kind: string; filePath: string }[]): string[] {
			return items.filter(item => item.kind !== 'searchHeader').map(item => item.filePath);
		}

		test('Should return an empty array when no root path is set', async () => {
			const items = await plansProvider.search('task');
			assert.deepStrictEqual(items, []);
		});

		test('Should return an empty array for a blank query', async () => {
			await plansProvider.setRootPath(testDir);
			const items = await plansProvider.search('   ');
			assert.deepStrictEqual(items, []);
		});

		test('Should match directory names case-insensitively', async () => {
			createSearchFixture();
			await plansProvider.setRootPath(testDir);

			const items = await plansProvider.search('LOGIN-feat');

			assert.strictEqual(items[0].kind, 'searchHeader');
			assert.strictEqual(items[0].label, '1 result for "LOGIN-feat"');
			assert.strictEqual(items[1].kind, 'directory');
			assert.strictEqual(items[1].filePath, path.join(testDir, 'login-feature'));
			assert.strictEqual(items[1].contextValue, 'directory');
			// rootの直下のため相対ディレクトリは表示しない
			assert.strictEqual(items[1].description, undefined);
		});

		test('Should match file names and show the relative directory', async () => {
			createSearchFixture();
			await plansProvider.setRootPath(testDir);

			const items = await plansProvider.search('_TASK.md');
			const fileItem = items.find(item => item.kind === 'file');

			assert.ok(fileItem);
			assert.strictEqual(fileItem!.filePath, path.join(testDir, 'archived', 'old_task', '2026_0102_0000_00_TASK.md'));
			assert.strictEqual(fileItem!.description, path.join('archived', 'old_task'));
			assert.strictEqual(fileItem!.contextValue, 'file');
			assert.strictEqual(fileItem!.matchPreview, undefined);
			// 検索結果もタイムスタンプ形式のファイルは短縮表示する
			assert.strictEqual(fileItem!.label, '[01/02] TASK.md');
		});

		test('Should match Markdown content and return the matched line as a preview', async () => {
			createSearchFixture();
			await plansProvider.setRootPath(testDir);

			const items = await plansProvider.search('oauth');

			assert.deepStrictEqual(resultPaths(items), [
				path.join(testDir, 'login-feature', '2026_0101_0000_00_PROMPT.md')
			]);
			assert.strictEqual(items[1].matchPreview, 'Add OAuth login');
		});

		test('Should require every term to match (AND) across name and content', async () => {
			createSearchFixture();
			await plansProvider.setRootPath(testDir);

			assert.deepStrictEqual(resultPaths(await plansProvider.search('prompt oauth')), [
				path.join(testDir, 'login-feature', '2026_0101_0000_00_PROMPT.md')
			]);
			assert.deepStrictEqual(resultPaths(await plansProvider.search('prompt refactor')), []);
		});

		test('Should skip hidden entries, non-Markdown content and oversized files', async () => {
			createSearchFixture();
			fs.writeFileSync(path.join(testDir, 'large.md'), 'x'.repeat(MAX_SEARCH_FILE_SIZE) + 'oauth', 'utf8');
			await plansProvider.setRootPath(testDir);

			const paths = resultPaths(await plansProvider.search('oauth'));

			assert.ok(!paths.some(p => p.includes('.hidden')), 'Hidden directories should not be searched');
			assert.ok(!paths.some(p => p.endsWith('notes.txt')), 'Only Markdown content should be searched');
			assert.ok(!paths.some(p => p.endsWith('large.md')), 'Oversized files should not be read');
		});

		test('Should return only the header when nothing matches', async () => {
			createSearchFixture();
			await plansProvider.setRootPath(testDir);

			const items = await plansProvider.search('nothing-matches-this');

			assert.strictEqual(items.length, 1);
			assert.strictEqual(items[0].kind, 'searchHeader');
			assert.strictEqual(items[0].label, '0 results for "nothing-matches-this"');
		});

		test('Should stop at the maximum number of results', async () => {
			for (let i = 0; i < MAX_SEARCH_RESULTS + 5; i++) {
				fs.writeFileSync(path.join(testDir, `hit_${i}.md`), '', 'utf8');
			}
			await plansProvider.setRootPath(testDir);

			const items = await plansProvider.search('hit_');

			assert.strictEqual(resultPaths(items).length, MAX_SEARCH_RESULTS);
			assert.strictEqual(items[0].label, `${MAX_SEARCH_RESULTS}+ results for "hit_"`);
		});

		test('Should manage the search state', async () => {
			const subDir = path.join(testDir, 'subdir');
			fs.mkdirSync(subDir, { recursive: true });
			await plansProvider.setRootPath(testDir);

			plansProvider.setSearchQuery('  task  ');
			assert.strictEqual(plansProvider.getSearchQuery(), 'task');
			assert.strictEqual(plansProvider.isSearching(), true);

			plansProvider.setSearchQuery('');
			assert.strictEqual(plansProvider.isSearching(), false);

			// ディレクトリ移動で検索を終了する
			plansProvider.setSearchQuery('task');
			await plansProvider.navigateToDirectory(subDir);
			assert.strictEqual(plansProvider.getSearchQuery(), undefined);
		});

		test('Should not search while the root directory is missing', async () => {
			await plansProvider.setRootPath(path.join(testDir, 'nonexistent'));
			plansProvider.setSearchQuery('task');
			assert.strictEqual(plansProvider.isSearching(), false);
		});
	});
});
