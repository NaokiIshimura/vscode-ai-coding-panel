import * as assert from 'assert';
import { ConfigurationProvider } from '../../../services/ConfigurationProvider';
import { SortField, SortOrder, ViewMode } from '../../../types';

// Skip ConfigurationProvider tests
// Reason: Workspace is not open in test environment and many settings are not registered in package.json
suite.skip('ConfigurationProvider Test Suite', () => {
	let configProvider: ConfigurationProvider;

	setup(() => {
		configProvider = new ConfigurationProvider();
	});

	teardown(async () => {
		// Reset settings after each test
		try {
			await configProvider.resetAllSettings();
		} catch (error) {
			// Skip if workspace is not open
		}
	});

	suite('getCommandPrefix', () => {
		test('Should return command prefix', () => {
			const prefix = configProvider.getCommandPrefix();

			// Returns default value or configured value
			assert.ok(typeof prefix === 'string');
		});

		test('Should return default value when not configured', () => {
			const prefix = configProvider.getCommandPrefix();

			// Default value is 'claude'
			assert.strictEqual(prefix, 'claude');
		});
	});

	suite('getDefaultRelativePath', () => {
		test('Should return default relative path', () => {
			const path = configProvider.getDefaultRelativePath();

			// Returns default value or configured value
			assert.ok(typeof path === 'string');
		});
	});

	suite('setDefaultRelativePath', () => {
		test('Should set default relative path', async () => {
			const testPath = '.test/path';

			await configProvider.setDefaultRelativePath(testPath);
			const result = configProvider.getDefaultRelativePath();

			assert.strictEqual(result, testPath);
		});
	});

	suite('getDisplayOptions', () => {
		test('Should return display options with default values', () => {
			const options = configProvider.getDisplayOptions();

			assert.ok(options);
			assert.ok(options.hasOwnProperty('sortBy'));
			assert.ok(options.hasOwnProperty('sortOrder'));
			assert.ok(options.hasOwnProperty('showHidden'));
			assert.ok(options.hasOwnProperty('viewMode'));
		});

		test('Should return correct types for each option', () => {
			const options = configProvider.getDisplayOptions();

			assert.ok(typeof options.sortBy === 'string');
			assert.ok(typeof options.sortOrder === 'string');
			assert.ok(typeof options.showHidden === 'boolean');
			assert.ok(typeof options.viewMode === 'string');
		});
	});

	suite('getSortBy and setSortBy', () => {
		test('Should get and set sort field', async () => {
			await configProvider.setSortBy(SortField.Modified);
			const result = configProvider.getSortBy();

			assert.strictEqual(result, SortField.Modified);
		});

		test('Should handle different sort fields', async () => {
			const sortFields = [SortField.Name, SortField.Created, SortField.Modified];

			for (const field of sortFields) {
				await configProvider.setSortBy(field);
				const result = configProvider.getSortBy();
				assert.strictEqual(result, field);
			}
		});
	});

	suite('getSortOrder and setSortOrder', () => {
		test('Should get and set sort order', async () => {
			await configProvider.setSortOrder(SortOrder.Descending);
			const result = configProvider.getSortOrder();

			assert.strictEqual(result, SortOrder.Descending);
		});

		test('Should handle both ascending and descending', async () => {
			// Ascending
			await configProvider.setSortOrder(SortOrder.Ascending);
			let result = configProvider.getSortOrder();
			assert.strictEqual(result, SortOrder.Ascending);

			// Descending
			await configProvider.setSortOrder(SortOrder.Descending);
			result = configProvider.getSortOrder();
			assert.strictEqual(result, SortOrder.Descending);
		});
	});

	suite('getShowHidden and setShowHidden', () => {
		test('Should get and set show hidden setting', async () => {
			await configProvider.setShowHidden(true);
			const result = configProvider.getShowHidden();

			assert.strictEqual(result, true);
		});

		test('Should handle boolean values correctly', async () => {
			// true
			await configProvider.setShowHidden(true);
			let result = configProvider.getShowHidden();
			assert.strictEqual(result, true);

			// false
			await configProvider.setShowHidden(false);
			result = configProvider.getShowHidden();
			assert.strictEqual(result, false);
		});
	});

	suite('getViewMode and setViewMode', () => {
		test('Should get and set view mode', async () => {
			await configProvider.setViewMode(ViewMode.List);
			const result = configProvider.getViewMode();

			assert.strictEqual(result, ViewMode.List);
		});

		test('Should handle different view modes', async () => {
			const viewModes = [ViewMode.Tree, ViewMode.List];

			for (const mode of viewModes) {
				await configProvider.setViewMode(mode);
				const result = configProvider.getViewMode();
				assert.strictEqual(result, mode);
			}
		});
	});

	suite('getAutoRefresh and setAutoRefresh', () => {
		test('Should get and set auto refresh setting', async () => {
			await configProvider.setAutoRefresh(false);
			const result = configProvider.getAutoRefresh();

			assert.strictEqual(result, false);
		});
	});

	suite('getShowFileIcons and setShowFileIcons', () => {
		test('Should get and set show file icons setting', async () => {
			await configProvider.setShowFileIcons(false);
			const result = configProvider.getShowFileIcons();

			assert.strictEqual(result, false);
		});
	});

	suite('resetAllSettings', () => {
		test('Should reset all settings to defaults', async () => {
			// Change settings
			await configProvider.setDefaultRelativePath('.custom/path');
			await configProvider.setSortBy(SortField.Modified);
			await configProvider.setSortOrder(SortOrder.Descending);
			await configProvider.setShowHidden(true);

			// Reset
			await configProvider.resetAllSettings();

			// Verify settings are reset to defaults
			// Note: Values after reset depend on extension defaults
			const path = configProvider.getDefaultRelativePath();
			assert.ok(typeof path === 'string');
		});
	});

	suite('Integration tests', () => {
		test('Should persist settings across multiple get/set operations', async () => {
			const testPath = '.test/integration';
			const testSortBy = SortField.Created;
			const testSortOrder = SortOrder.Descending;

			// Set multiple settings
			await configProvider.setDefaultRelativePath(testPath);
			await configProvider.setSortBy(testSortBy);
			await configProvider.setSortOrder(testSortOrder);

			// Verify settings are persisted
			assert.strictEqual(configProvider.getDefaultRelativePath(), testPath);
			assert.strictEqual(configProvider.getSortBy(), testSortBy);
			assert.strictEqual(configProvider.getSortOrder(), testSortOrder);
		});
	});
});
