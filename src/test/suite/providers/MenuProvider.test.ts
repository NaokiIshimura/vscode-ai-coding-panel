import * as assert from 'assert';
import { MenuProvider } from '../../../providers/MenuProvider';
import { MenuItem } from '../../../providers/items/MenuItem';

suite('MenuProvider Test Suite', () => {
	let menuProvider: MenuProvider;

	setup(() => {
		menuProvider = new MenuProvider();
	});

	suite('getTreeItem', () => {
		test('Should return the element as-is', () => {
			const menuItem = new MenuItem('Test', 'Test description');
			const result = menuProvider.getTreeItem(menuItem);

			assert.strictEqual(result, menuItem);
		});
	});

	suite('getChildren', () => {
		test('Should return menu items when no element is provided', async () => {
			const children = await menuProvider.getChildren();

			assert.ok(Array.isArray(children));
			assert.ok(children.length > 0);
		});

		test('Root menu should contain expected sections', async () => {
			const children = await menuProvider.getChildren();

			// メニューに特定のセクションが含まれているか確認
			const labels = children.map(item => item.label);
			assert.ok(labels.some(label => typeof label === 'string' && label.includes('Guide')));
		});

		test('Should handle element parameter correctly', async () => {
			const rootItems = await menuProvider.getChildren();

			// 親要素を持つアイテムがあれば、その子要素を取得
			const parentItem = rootItems.find(item => item.children && item.children.length > 0);

			if (parentItem && parentItem.children) {
				const childItems = await menuProvider.getChildren(parentItem);
				assert.ok(Array.isArray(childItems));
			}
		});
	});

	suite('refresh', () => {
		test('Should fire onDidChangeTreeData event', (done) => {
			menuProvider.onDidChangeTreeData(() => {
				// イベントが発火したことを確認
				done();
			});

			menuProvider.refresh();
		});
	});

	suite('onDidChangeTreeData', () => {
		test('Should be defined', () => {
			assert.ok(menuProvider.onDidChangeTreeData);
		});

		test('Should allow event subscription', () => {
			const subscription = menuProvider.onDidChangeTreeData(() => {
				// イベントハンドラー
			});

			assert.ok(subscription);
			assert.ok(typeof subscription.dispose === 'function');

			subscription.dispose();
		});
	});
});
