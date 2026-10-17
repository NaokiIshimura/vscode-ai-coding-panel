import * as path from 'path';
import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath, runTests } from '@vscode/test-electron';

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		// Download VS Code, unzip it and run the integration test
		console.log('Starting test run...');

		// On macOS, VS Code 1.85.0 and later changed the binary layout,
		// so run the tests through the CLI path
		const vscodeExecutablePath = await downloadAndUnzipVSCode();
		let executablePath = vscodeExecutablePath;
		try {
			executablePath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);
		} catch {
			// Fall back to the default path if resolveCliPath fails
		}

		await runTests({
			vscodeExecutablePath: executablePath,
			extensionDevelopmentPath,
			extensionTestsPath
		});
		console.log('Tests completed successfully!');
	} catch (err) {
		console.error('Failed to run tests');
		console.error(err);
		process.exit(1);
	}
}

main();


