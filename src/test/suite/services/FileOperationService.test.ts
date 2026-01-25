import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { FileOperationService } from '../../../services/FileOperationService';

suite('FileOperationService Test Suite', () => {
	let fileOpService: FileOperationService;
	const testDir = path.join(__dirname, '../../fixtures/fileOps');

	setup(() => {
		fileOpService = new FileOperationService();

		// テストディレクトリを作成
		if (!fs.existsSync(testDir)) {
			fs.mkdirSync(testDir, { recursive: true });
		}
	});

	teardown(() => {
		// テストディレクトリをクリーンアップ
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}
	});

	suite('createFile', () => {
		test('Should create a new file successfully', async () => {
			const filePath = path.join(testDir, 'test.txt');
			const content = 'Hello, World!';

			const result = await fileOpService.createFile(filePath, content);

			assert.strictEqual(result.success, true);
			assert.ok(fs.existsSync(filePath));

			const readContent = fs.readFileSync(filePath, 'utf8');
			assert.strictEqual(readContent, content);
		});

		test('Should create file with empty content if not provided', async () => {
			const filePath = path.join(testDir, 'empty.txt');

			const result = await fileOpService.createFile(filePath);

			assert.strictEqual(result.success, true);
			assert.ok(fs.existsSync(filePath));

			const readContent = fs.readFileSync(filePath, 'utf8');
			assert.strictEqual(readContent, '');
		});

		test('Should fail if file already exists', async () => {
			const filePath = path.join(testDir, 'existing.txt');

			// ファイルを作成
			await fileOpService.createFile(filePath, 'content');

			// 同じファイルを再度作成しようとする
			const result = await fileOpService.createFile(filePath, 'new content');

			assert.strictEqual(result.success, false);
			assert.ok(result.error);
		});

		test('Should create parent directories if they do not exist', async () => {
			const filePath = path.join(testDir, 'nested', 'dir', 'test.txt');

			const result = await fileOpService.createFile(filePath, 'content');

			assert.strictEqual(result.success, true);
			assert.ok(fs.existsSync(filePath));
		});
	});

	suite('createDirectory', () => {
		test('Should create a new directory successfully', async () => {
			const dirPath = path.join(testDir, 'newDir');

			const result = await fileOpService.createDirectory(dirPath);

			assert.strictEqual(result.success, true);
			assert.ok(fs.existsSync(dirPath));
			assert.ok(fs.statSync(dirPath).isDirectory());
		});

		test('Should fail if directory already exists', async () => {
			const dirPath = path.join(testDir, 'existingDir');

			// ディレクトリを作成
			await fileOpService.createDirectory(dirPath);

			// 同じディレクトリを再度作成しようとする
			const result = await fileOpService.createDirectory(dirPath);

			assert.strictEqual(result.success, false);
			assert.ok(result.error);
		});

		test('Should create nested directories', async () => {
			const dirPath = path.join(testDir, 'level1', 'level2', 'level3');

			const result = await fileOpService.createDirectory(dirPath);

			assert.strictEqual(result.success, true);
			assert.ok(fs.existsSync(dirPath));
		});
	});

	suite('readFile', () => {
		test('Should read file content successfully', async () => {
			const filePath = path.join(testDir, 'read.txt');
			const content = 'Test content';

			fs.writeFileSync(filePath, content, 'utf8');

			const result = await fileOpService.readFile(filePath);

			assert.strictEqual(result, content);
		});

		test('Should throw error if file does not exist', async () => {
			const filePath = path.join(testDir, 'nonexistent.txt');

			await assert.rejects(
				async () => await fileOpService.readFile(filePath),
				/not found|見つかりません/i
			);
		});
	});

	suite('exists', () => {
		test('Should return true for existing file', async () => {
			const filePath = path.join(testDir, 'exists.txt');
			fs.writeFileSync(filePath, 'content', 'utf8');

			const result = await fileOpService.exists(filePath);

			assert.strictEqual(result, true);
		});

		test('Should return false for non-existing file', async () => {
			const filePath = path.join(testDir, 'does-not-exist.txt');

			const result = await fileOpService.exists(filePath);

			assert.strictEqual(result, false);
		});

		test('Should return true for existing directory', async () => {
			const dirPath = path.join(testDir, 'existsDir');
			fs.mkdirSync(dirPath, { recursive: true });

			const result = await fileOpService.exists(dirPath);

			assert.strictEqual(result, true);
		});
	});

	suite('deleteFile', () => {
		test('Should delete file successfully', async () => {
			const filePath = path.join(testDir, 'delete.txt');
			fs.writeFileSync(filePath, 'content', 'utf8');

			const result = await fileOpService.deleteFile(filePath);

			assert.strictEqual(result.success, true);
			assert.ok(!fs.existsSync(filePath));
		});

		test('Should fail if file does not exist', async () => {
			const filePath = path.join(testDir, 'nonexistent.txt');

			const result = await fileOpService.deleteFile(filePath);

			assert.strictEqual(result.success, false);
			assert.ok(result.error);
		});
	});

	suite('renameFile', () => {
		test('Should rename file successfully', async () => {
			const oldPath = path.join(testDir, 'old.txt');
			const newPath = path.join(testDir, 'new.txt');
			const content = 'content';

			fs.writeFileSync(oldPath, content, 'utf8');

			const result = await fileOpService.renameFile(oldPath, newPath);

			assert.strictEqual(result.success, true);
			assert.ok(!fs.existsSync(oldPath));
			assert.ok(fs.existsSync(newPath));

			const readContent = fs.readFileSync(newPath, 'utf8');
			assert.strictEqual(readContent, content);
		});

		test('Should fail if source file does not exist', async () => {
			const oldPath = path.join(testDir, 'nonexistent.txt');
			const newPath = path.join(testDir, 'new.txt');

			const result = await fileOpService.renameFile(oldPath, newPath);

			assert.strictEqual(result.success, false);
			assert.ok(result.error);
		});
	});
});
