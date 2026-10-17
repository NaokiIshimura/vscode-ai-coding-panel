import * as assert from 'assert';
import * as vscode from 'vscode';
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

			// Check that the menu contains specific sections
			const labels = children.map(item => item.label);
			assert.ok(labels.some(label => typeof label === 'string' && label.includes('Guide')));
		});

		test('Global and Workspace should be expanded by default', async () => {
			const rootItems = await menuProvider.getChildren();

			// Returned expanded so that child items are fetched at once, reducing round trips
			['Global', 'Workspace'].forEach(label => {
				const item = rootItems.find(i => i.label === label);
				assert.ok(item, `${label} should exist`);
				assert.strictEqual(
					item!.collapsibleState,
					vscode.TreeItemCollapsibleState.Expanded
				);
			});
		});

		test('Usage Guide should be collapsed by default', async () => {
			const rootItems = await menuProvider.getChildren();
			const usageGuide = rootItems.find(item => item.label === 'Usage Guide');

			// Collapsed by default because it has many items and is not used often
			assert.ok(usageGuide);
			assert.strictEqual(
				usageGuide!.collapsibleState,
				vscode.TreeItemCollapsibleState.Collapsed
			);
		});

		test('Should handle element parameter correctly', async () => {
			const rootItems = await menuProvider.getChildren();

			// If an item has children, get its child items
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
				// Verify that the event fired
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
				// Event handler
			});

			assert.ok(subscription);
			assert.ok(typeof subscription.dispose === 'function');

			subscription.dispose();
		});
	});
});
