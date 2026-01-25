import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PlansProvider } from '../../../providers/PlansProvider';
import { FileWatcherService } from '../../../services/FileWatcherService';

suite('PlansProvider Integration Test Suite', () => {
	let plansProvider: PlansProvider;
	let fileWatcherService: FileWatcherService;
	const testDir = path.join(__dirname, '../../fixtures/plans');

	setup(async () => {
		// テストディレクトリを作成
		if (!fs.existsSync(testDir)) {
			fs.mkdirSync(testDir, { recursive: true });
		}

		// FileWatcherServiceを初期化
		fileWatcherService = new FileWatcherService();

		// PlansProviderを初期化
		plansProvider = new PlansProvider(fileWatcherService);
	});

	teardown(() => {
		// クリーンアップ
		plansProvider.dispose();
		fileWatcherService.dispose();

		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
		}
	});

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

			// パスが見つからない場合、createDirectoryButtonが表示される
			const children = await plansProvider.getChildren();
			assert.ok(children.length > 0);
		});
	});

	suite('getChildren', () => {
		test('Should return empty array when no root path is set', async () => {
			const children = await plansProvider.getChildren();
			assert.strictEqual(children.length, 0);
		});

		test('Should return path display item when root path is set', async () => {
			await plansProvider.setRootPath(testDir);

			const children = await plansProvider.getChildren();
			assert.ok(children.length > 0);
			// 最初のアイテムはパス表示アイテム
			assert.strictEqual(children[0].contextValue, 'pathDisplay');
		});

		test('Should return parent directory item when not at root', async () => {
			// サブディレクトリを作成
			const subDir = path.join(testDir, 'subdir');
			fs.mkdirSync(subDir, { recursive: true });

			await plansProvider.setRootPath(testDir);
			plansProvider.setActiveFolder(subDir);

			const children = await plansProvider.getChildren();
			// パス表示アイテムと親ディレクトリアイテムが存在する
			const parentItem = children.find(item => item.contextValue === 'parentDirectory');
			assert.ok(parentItem);
			assert.strictEqual(parentItem.label, '..');
		});

		test('Should list files and directories', async () => {
			// テストファイルとディレクトリを作成
			fs.writeFileSync(path.join(testDir, 'test.md'), 'content', 'utf8');
			fs.mkdirSync(path.join(testDir, 'testDir'), { recursive: true });

			await plansProvider.setRootPath(testDir);

			const children = await plansProvider.getChildren();
			// パス表示アイテム + ファイル + ディレクトリ
			assert.ok(children.length >= 3);

			const fileItem = children.find(item => item.label === 'test.md');
			const dirItem = children.find(item => item.label === 'testDir');

			assert.ok(fileItem);
			assert.ok(dirItem);
			assert.strictEqual(fileItem!.isDirectory, false);
			assert.strictEqual(dirItem!.isDirectory, true);
		});

		test('Should return empty array for element parameter (flat list)', async () => {
			await plansProvider.setRootPath(testDir);

			// elementが指定された場合は空配列を返す（フラットリスト形式のため）
			const mockElement = {
				label: 'test',
				filePath: testDir,
				isDirectory: true
			} as any;

			const children = await plansProvider.getChildren(mockElement);
			assert.strictEqual(children.length, 0);
		});
	});

	suite('getTreeItem', () => {
		test('Should return the element as-is', async () => {
			await plansProvider.setRootPath(testDir);

			const children = await plansProvider.getChildren();
			const firstItem = children[0];

			const treeItem = plansProvider.getTreeItem(firstItem);
			assert.strictEqual(treeItem, firstItem);
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
	});

	suite('refresh', () => {
		test('Should fire onDidChangeTreeData event', (done) => {
			const disposable = plansProvider.onDidChangeTreeData(() => {
				disposable.dispose();
				done();
			});

			plansProvider.refresh();
		});

		test('Should clear cache on full refresh', async () => {
			await plansProvider.setRootPath(testDir);

			// 初回読み込みでキャッシュを構築
			await plansProvider.getChildren();

			// 新しいファイルを作成
			fs.writeFileSync(path.join(testDir, 'new.md'), 'content', 'utf8');

			// 全体更新
			plansProvider.refresh();

			// キャッシュがクリアされているので新しいファイルが表示される
			const children = await plansProvider.getChildren();
			const newFile = children.find(item => item.label === 'new.md');
			assert.ok(newFile);
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
		test('Should set and get selected item', async () => {
			await plansProvider.setRootPath(testDir);

			const children = await plansProvider.getChildren();
			const firstItem = children[0];

			plansProvider.setSelectedItem(firstItem);

			const selectedItem = plansProvider.getSelectedItem();
			assert.strictEqual(selectedItem, firstItem);
		});

		test('Should clear selected item', async () => {
			await plansProvider.setRootPath(testDir);

			const children = await plansProvider.getChildren();
			plansProvider.setSelectedItem(children[0]);

			plansProvider.setSelectedItem(undefined);

			const selectedItem = plansProvider.getSelectedItem();
			assert.strictEqual(selectedItem, undefined);
		});
	});

	suite('onDidChangeTreeData', () => {
		test('Should be defined', () => {
			assert.ok(plansProvider.onDidChangeTreeData);
		});

		test('Should allow event subscription', () => {
			const disposable = plansProvider.onDidChangeTreeData(() => {
				// Event handler
			});

			assert.ok(disposable);
			disposable.dispose();
		});
	});
});
