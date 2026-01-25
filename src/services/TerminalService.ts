import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ITerminalService, TerminalOutputListener, TerminalExitListener, ProcessInfo } from '../interfaces/ITerminalService';

const execPromise = promisify(exec);

/**
 * node-ptyの最小型定義
 * 実際にはnode-ptyパッケージのIPtyインターフェースを使用すべきですが、
 * VSCode組み込みのnode-ptyを使用しているため、型定義を直接インポートできません
 */
interface IPty {
    onData(listener: (data: string) => void): void;
    onExit(listener: (exitCode: { exitCode: number; signal?: number }) => void): void;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(signal?: string): void;
    pid: number;
}

/**
 * ターミナルセッション情報
 */
interface TerminalSession {
    id: string;
    pty: IPty;
    outputCallbacks: Set<TerminalOutputListener>;
}

/**
 * プロセス情報
 */
/**
 * ターミナルサービスの実装
 * VSCode内蔵のnode-ptyを使用してPTYセッションを管理
 */
export class TerminalService implements ITerminalService {
    private sessions: Map<string, TerminalSession> = new Map();
    private nodePty: any;
    private _isAvailable: boolean = false;
    private _unavailableReason: string = '';
    private sessionCounter: number = 0;
    private exitCallbacks: Set<TerminalExitListener> = new Set();
    private lastResizeParams: Map<string, { cols: number, rows: number }> = new Map();

    constructor() {
        this.initNodePty();
    }

    /**
     * node-ptyを初期化
     */
    private initNodePty(): void {
        // 試行するパスのリスト
        const paths = [
            // VSCode内蔵のnode-pty (通常のnode_modules)
            path.join(vscode.env.appRoot, 'node_modules', 'node-pty'),
            // VSCode内蔵のnode-pty (asar)
            path.join(vscode.env.appRoot, 'node_modules.asar', 'node-pty'),
            // VSCode内蔵のnode-pty (asar.unpacked)
            path.join(vscode.env.appRoot, 'node_modules.asar.unpacked', 'node-pty'),
        ];

        const errors: string[] = [];

        for (const ptyPath of paths) {
            try {
                this.nodePty = require(ptyPath);
                this._isAvailable = true;
                console.log('node-pty loaded from:', ptyPath);
                return;
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                errors.push(`${ptyPath}: ${errorMsg}`);
                console.log('Failed to load node-pty from:', ptyPath);
            }
        }

        // フォールバック: 直接requireを試みる
        try {
            this.nodePty = require('node-pty');
            this._isAvailable = true;
            console.log('node-pty loaded via direct require');
        } catch (fallbackError) {
            const errorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            errors.push(`Direct require: ${errorMsg}`);
            console.error('Failed to load node-pty:', fallbackError);
            this._isAvailable = false;
            this._unavailableReason = `Failed to load node-pty. Tried paths:\n${errors.join('\n')}`;
        }
    }

    /**
     * デフォルトのシェルパスを取得
     */
    private getDefaultShell(): string {
        const platform = os.platform();
        if (platform === 'win32') {
            return process.env.COMSPEC || 'cmd.exe';
        }
        return process.env.SHELL || '/bin/bash';
    }

    /**
     * ターミナルセッションを作成
     */
    async createSession(cwd?: string): Promise<string> {
        if (!this._isAvailable) {
            throw new Error('node-pty is not available');
        }

        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
        const shellPath = config.get<string>('terminal.shell') || this.getDefaultShell();

        // 作業ディレクトリを決定
        const workingDirectory = cwd ||
            (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath) ||
            os.homedir();

        // セッションIDを生成
        const sessionId = `terminal-${++this.sessionCounter}-${Date.now()}`;

        // シェル引数を設定（ログインシェルとして起動してPATHを正しく設定）
        const shellArgs: string[] = [];
        const platform = os.platform();
        if (platform !== 'win32') {
            // macOS/Linuxではログインシェルとして起動
            shellArgs.push('-l');
        }

        try {
            // 環境変数を設定
            const env = { ...process.env };

            // LANGは未設定の場合のみデフォルト値を設定
            if (!env.LANG) {
                env.LANG = 'en_US.UTF-8';
            }
            // LC_ALLは設定しない（ユーザー環境を尊重）

            // TERMとCOLORTERMを明示的に設定
            env.TERM = 'xterm-256color';
            env.COLORTERM = 'truecolor';

            // PTYプロセスを作成
            const pty = this.nodePty.spawn(shellPath, shellArgs, {
                name: 'xterm-256color',
                cols: 80,
                rows: 24,
                cwd: workingDirectory,
                env: env
            });

            // セッションを保存
            const session: TerminalSession = {
                id: sessionId,
                pty: pty,
                outputCallbacks: new Set()
            };
            this.sessions.set(sessionId, session);

            // PTY出力を監視
            pty.onData((data: string) => {
                session.outputCallbacks.forEach(callback => {
                    try {
                        callback(data);
                    } catch (error) {
                        console.error('Error in terminal output callback:', error);
                    }
                });
            });

            // PTY終了を監視
            pty.onExit(({ exitCode, signal }: { exitCode: number, signal?: number }) => {
                console.log(`Terminal session ${sessionId} exited with code ${exitCode}, signal ${signal}`);

                // 終了コールバックを呼び出す
                this.exitCallbacks.forEach(callback => {
                    try {
                        callback(sessionId, exitCode, signal);
                    } catch (error) {
                        console.error('Error in terminal exit callback:', error);
                    }
                });

                // セッションを削除
                this.sessions.delete(sessionId);
                this.lastResizeParams.delete(sessionId);
            });

            return sessionId;
        } catch (error) {
            console.error('Failed to create terminal session:', error);
            throw error;
        }
    }

    /**
     * ターミナルセッションを終了
     */
    killSession(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            try {
                session.pty.kill();
            } catch (error) {
                console.error('Error killing terminal session:', error);
            }
            session.outputCallbacks.clear();
            this.sessions.delete(sessionId);
            this.lastResizeParams.delete(sessionId);
        }
    }

    /**
     * ターミナルにデータを書き込む
     */
    write(sessionId: string, data: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            try {
                session.pty.write(data);
            } catch (error) {
                console.error('Error writing to terminal:', error);
            }
        }
    }

    /**
     * 出力リスナーを登録
     */
    onOutput(sessionId: string, callback: TerminalOutputListener): vscode.Disposable {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.outputCallbacks.add(callback);
            return {
                dispose: () => {
                    session.outputCallbacks.delete(callback);
                }
            };
        }
        return { dispose: () => {} };
    }

    /**
     * ターミナルをリサイズ
     */
    resize(sessionId: string, cols: number, rows: number): void {
        // 同じサイズの場合はスキップ
        const last = this.lastResizeParams.get(sessionId);
        if (last && last.cols === cols && last.rows === rows) {
            return;
        }

        const session = this.sessions.get(sessionId);
        if (session) {
            try {
                session.pty.resize(cols, rows);
                this.lastResizeParams.set(sessionId, { cols, rows });
            } catch (error) {
                console.error('Error resizing terminal:', error);
            }
        }
    }

    /**
     * node-ptyが利用可能かどうかを確認
     */
    isAvailable(): boolean {
        return this._isAvailable;
    }

    /**
     * node-ptyが利用不可の場合の理由を取得
     */
    getUnavailableReason(): string {
        if (this._isAvailable) {
            return '';
        }
        return this._unavailableReason || 'node-pty could not be loaded. Please check your VSCode installation or try restarting VSCode.';
    }

    /**
     * セッション終了イベントのリスナーを登録
     */
    onSessionExit(callback: TerminalExitListener): vscode.Disposable {
        this.exitCallbacks.add(callback);
        return new vscode.Disposable(() => {
            this.exitCallbacks.delete(callback);
        });
    }


    /**
     * 指定されたセッションの子プロセスを取得
     */
    async getChildProcesses(sessionId: string): Promise<ProcessInfo[]> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return [];
        }

        const ptyPid = session.pty.pid;
        const platform = os.platform();

        try {
            if (platform === 'win32') {
                // Windows用の実装
                const { stdout } = await execPromise(
                    `wmic process where (ParentProcessId=${ptyPid}) get ProcessId,CommandLine /format:csv`
                );

                return stdout
                    .trim()
                    .split('\n')
                    .slice(1) // ヘッダーをスキップ
                    .filter(line => line.trim())
                    .map(line => {
                        const parts = line.split(',');
                        return {
                            pid: parseInt(parts[1]) || 0,
                            ppid: ptyPid,
                            command: parts[2] || ''
                        };
                    })
                    .filter(proc => proc.pid > 0);
            } else {
                // macOS/Linux用の実装
                const { stdout } = await execPromise(
                    `ps -o pid,ppid,comm | grep -E "^\\s*[0-9]+\\s+${ptyPid}\\s"`
                );

                return stdout
                    .trim()
                    .split('\n')
                    .filter(line => line.trim())
                    .map(line => {
                        const parts = line.trim().split(/\s+/);
                        return {
                            pid: parseInt(parts[0]) || 0,
                            ppid: parseInt(parts[1]) || 0,
                            command: parts.slice(2).join(' ')
                        };
                    })
                    .filter(proc => proc.pid > 0);
            }
        } catch (error) {
            // プロセスが見つからない場合はエラーではなく空配列を返す
            if (error instanceof Error && error.message.includes('Command failed')) {
                return [];
            }
            console.error('Error getting child processes:', error);
            return [];
        }
    }

    /**
     * 指定されたセッションでClaude Codeが起動しているか確認
     */
    async isClaudeCodeRunning(sessionId: string): Promise<boolean> {
        const children = await this.getChildProcesses(sessionId);
        return children.some(proc =>
            proc.command.toLowerCase().includes('claude') ||
            proc.command.toLowerCase().includes('anthropic')
        );
    }

    /**
     * リソースを破棄
     */
    dispose(): void {
        // すべてのセッションを終了
        this.sessions.forEach((session) => {
            try {
                session.pty.kill();
            } catch (error) {
                console.error('Error disposing terminal session:', error);
            }
            session.outputCallbacks.clear();
        });
        this.sessions.clear();
        this.exitCallbacks.clear();
        this.lastResizeParams.clear();
    }
}
