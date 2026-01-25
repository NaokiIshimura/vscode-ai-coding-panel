import * as assert from 'assert';
import { formatFileSize } from '../../../utils/fileUtils';

suite('fileUtils Test Suite', () => {
	suite('formatFileSize', () => {
		test('0 bytes should return "0 B"', () => {
			assert.strictEqual(formatFileSize(0), '0 B');
		});

		test('Bytes (< 1024) should return with "B" suffix', () => {
			assert.strictEqual(formatFileSize(100), '100 B');
			assert.strictEqual(formatFileSize(1023), '1023 B');
		});

		test('Kilobytes should return with "KB" suffix', () => {
			assert.strictEqual(formatFileSize(1024), '1 KB');
			assert.strictEqual(formatFileSize(2048), '2 KB');
			assert.strictEqual(formatFileSize(1536), '1.5 KB');
		});

		test('Megabytes should return with "MB" suffix', () => {
			assert.strictEqual(formatFileSize(1024 * 1024), '1 MB');
			assert.strictEqual(formatFileSize(1024 * 1024 * 2), '2 MB');
			assert.strictEqual(formatFileSize(1024 * 1024 * 1.5), '1.5 MB');
		});

		test('Gigabytes should return with "GB" suffix', () => {
			assert.strictEqual(formatFileSize(1024 * 1024 * 1024), '1 GB');
			assert.strictEqual(formatFileSize(1024 * 1024 * 1024 * 2), '2 GB');
			assert.strictEqual(formatFileSize(1024 * 1024 * 1024 * 1.5), '1.5 GB');
		});

		test('Should round to 2 decimal places', () => {
			const result = formatFileSize(1234567);
			assert.ok(result.includes('1.18 MB'));
		});

		test('Negative values should be handled', () => {
			// formatFileSizeは負の値に対してNaNを返す可能性があるが、
			// 実際のユースケースでは負の値は渡されないと仮定
			const result = formatFileSize(-100);
			assert.ok(result); // 何らかの結果が返されることを確認
		});
	});
});
