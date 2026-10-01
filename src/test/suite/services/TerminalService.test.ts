import * as assert from 'assert';
import { TerminalService } from '../../../services/TerminalService';

/**
 * 書き込まれたデータを記録するモックPTY
 */
class MockPty {
	public written: string[] = [];
	public pid = 0;
	onData(): void {}
	onExit(): void {}
	write(data: string): void {
		this.written.push(data);
	}
	resize(): void {}
	kill(): void {}
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

suite('TerminalService Test Suite', () => {
	let service: TerminalService;
	let pty: MockPty;
	const sessionId = 'test-session';

	setup(() => {
		service = new TerminalService();
		pty = new MockPty();
		// node-ptyを起動せずにセッションを登録する
		(service as any).sessions.set(sessionId, {
			id: sessionId,
			pty,
			outputCallbacks: new Set(),
			writeQueue: []
		});
	});

	teardown(() => {
		service.dispose();
	});

	suite('write', () => {
		test('Should write short data immediately', () => {
			service.write(sessionId, 'ls\n');

			assert.deepStrictEqual(pty.written, ['ls\n']);
		});

		test('Should split long data into chunks and write all of them in order', async () => {
			const data = 'あ'.repeat(500) + '\n';

			service.write(sessionId, data);

			// 最初のチャンクのみ即座に書き込まれる
			assert.strictEqual(pty.written.length, 1);
			await wait(200);

			assert.ok(pty.written.every(chunk => chunk.length <= 50));
			assert.strictEqual(pty.written.join(''), data);
		});

		test('Should keep the order of consecutive writes', async () => {
			const command = 'x'.repeat(120);

			service.write(sessionId, command);
			service.write(sessionId, '\r');
			await wait(100);

			assert.strictEqual(pty.written.join(''), command + '\r');
			assert.strictEqual(pty.written[pty.written.length - 1], '\r');
		});

		test('Should not split surrogate pairs', async () => {
			const data = 'a'.repeat(49) + '😀' + 'b';

			service.write(sessionId, data);
			await wait(50);

			assert.deepStrictEqual(pty.written, ['a'.repeat(49), '😀b']);
		});

		test('Should ignore unknown sessions and empty data', () => {
			service.write('unknown', 'ls\n');
			service.write(sessionId, '');

			assert.deepStrictEqual(pty.written, []);
		});

		test('Should discard pending chunks when the session is killed', async () => {
			service.write(sessionId, 'x'.repeat(200));
			service.killSession(sessionId);
			await wait(100);

			assert.strictEqual(pty.written.length, 1);
		});
	});
});
