import * as path from 'path';
import * as Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true,
		timeout: 10000
	});

	const testsRoot = path.resolve(__dirname, '..');

	try {
		// Only include test files in the suite directory
		const files = await glob('suite/**/**.test.js', { cwd: testsRoot });

		// Add files to the test suite
		files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

		// Run the mocha test
		return new Promise((resolve, reject) => {
			mocha.run(failures => {
				if (failures > 0) {
					reject(new Error(`${failures} tests failed.`));
				} else {
					resolve();
				}
			});
		});
	} catch (err) {
		console.error('Failed to load test files:', err);
		throw err;
	}
}
