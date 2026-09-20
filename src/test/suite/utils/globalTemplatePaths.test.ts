import * as assert from 'assert';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import {
	getGlobalPromptTemplatesDir,
	getGlobalRootDir,
	getGlobalTemplatesDir,
	resolveConfiguredGlobalPath
} from '../../../utils/globalTemplatePaths';

suite('globalTemplatePaths Test Suite', () => {
	// globalStorageUriを持つcontext / 持たないcontext を作り分ける
	const createContext = (globalStoragePath?: string): vscode.ExtensionContext => {
		return {
			extensionPath: '/tmp/extension',
			globalStorageUri: globalStoragePath ? vscode.Uri.file(globalStoragePath) : undefined
		} as unknown as vscode.ExtensionContext;
	};

	suite('resolveConfiguredGlobalPath', () => {
		test('Should return undefined for an empty value', () => {
			assert.strictEqual(resolveConfiguredGlobalPath(undefined), undefined);
			assert.strictEqual(resolveConfiguredGlobalPath(''), undefined);
			assert.strictEqual(resolveConfiguredGlobalPath('   '), undefined);
		});

		test('Should return an absolute path as it is', () => {
			const absolute = path.join(path.sep, 'tmp', 'ai-coding-templates');

			assert.strictEqual(resolveConfiguredGlobalPath(absolute), absolute);
		});

		test('Should trim surrounding spaces', () => {
			const absolute = path.join(path.sep, 'tmp', 'ai-coding-templates');

			assert.strictEqual(resolveConfiguredGlobalPath(`  ${absolute}  `), absolute);
		});

		test('Should expand a leading tilde', () => {
			assert.strictEqual(resolveConfiguredGlobalPath('~'), os.homedir());
			assert.strictEqual(
				resolveConfiguredGlobalPath('~/ai-coding-guide/templates'),
				path.join(os.homedir(), 'ai-coding-guide', 'templates')
			);
		});

		test('Should resolve a relative path from the home directory', () => {
			// ワークスペースに依存させないため、ワークスペースルート基準にはしない
			assert.strictEqual(
				resolveConfiguredGlobalPath('ai-coding-guide/templates'),
				path.join(os.homedir(), 'ai-coding-guide', 'templates')
			);
		});
	});

	suite('getGlobalRootDir', () => {
		test('Should fall back to the global storage directory', function () {
			// 設定が指定されている環境では設定値が優先されるため対象外
			const configured = vscode.workspace
				.getConfiguration('aiCodingSidebar')
				.get<string>('globalTemplatesPath', '');
			if (configured && configured.trim()) {
				this.skip();
				return;
			}

			const globalStoragePath = path.join(path.sep, 'tmp', 'global-storage');

			assert.strictEqual(getGlobalRootDir(createContext(globalStoragePath)), globalStoragePath);
		});

		test('Should return undefined when the context has no global storage', function () {
			const configured = vscode.workspace
				.getConfiguration('aiCodingSidebar')
				.get<string>('globalTemplatesPath', '');
			if (configured && configured.trim()) {
				this.skip();
				return;
			}

			assert.strictEqual(getGlobalRootDir(createContext()), undefined);
		});
	});

	suite('getGlobalTemplatesDir / getGlobalPromptTemplatesDir', () => {
		test('Should point to the templates and prompts sub directories', function () {
			const configured = vscode.workspace
				.getConfiguration('aiCodingSidebar')
				.get<string>('globalTemplatesPath', '');
			if (configured && configured.trim()) {
				this.skip();
				return;
			}

			const globalStoragePath = path.join(path.sep, 'tmp', 'global-storage');
			const context = createContext(globalStoragePath);

			assert.strictEqual(
				getGlobalTemplatesDir(context),
				path.join(globalStoragePath, 'templates')
			);
			assert.strictEqual(
				getGlobalPromptTemplatesDir(context),
				path.join(globalStoragePath, 'prompts')
			);
		});

		test('Should return undefined when the root cannot be resolved', function () {
			const configured = vscode.workspace
				.getConfiguration('aiCodingSidebar')
				.get<string>('globalTemplatesPath', '');
			if (configured && configured.trim()) {
				this.skip();
				return;
			}

			assert.strictEqual(getGlobalTemplatesDir(createContext()), undefined);
			assert.strictEqual(getGlobalPromptTemplatesDir(createContext()), undefined);
		});
	});
});
