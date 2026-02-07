import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ITerminalService, TerminalOutputListener, TerminalExitListener, ProcessInfo, ProcessTreeResult } from '../interfaces/ITerminalService';

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
                return;
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                errors.push(`${ptyPath}: ${errorMsg}`);
            }
        }

        // フォールバック: 直接requireを試みる
        try {
            this.nodePty = require('node-pty');
            this._isAvailable = true;
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
                    `wmic process where (ParentProcessId=${ptyPid}) get ProcessId,Name,CommandLine /format:csv`
                );

                return stdout
                    .trim()
                    .split('\n')
                    .slice(1) // ヘッダーをスキップ
                    .filter(line => line.trim())
                    .map(line => {
                        const parts = line.split(',');
                        const command = parts[3] || '';
                        const name = parts[2] || this._extractProcessName(command);
                        return {
                            pid: parseInt(parts[1]) || 0,
                            ppid: ptyPid,
                            command: command,
                            name: name,
                            isForeground: false
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
                        const command = parts.slice(2).join(' ');
                        const name = this._extractProcessName(command);
                        return {
                            pid: parseInt(parts[0]) || 0,
                            ppid: parseInt(parts[1]) || 0,
                            command: command,
                            name: name,
                            isForeground: false
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
     * コマンド文字列からプロセス名を抽出
     */
    private _extractProcessName(command: string): string {
        if (!command) {
            return '';
        }
        // パスからファイル名を抽出 (例: "/usr/bin/vim" -> "vim", "bash" -> "bash")
        const baseName = command.split('/').pop() || command;
        // 引数を除外 (例: "vim file.txt" -> "vim")
        return baseName.split(/\s+/)[0] || '';
    }

    /**
     * 親プロセス名を表示すべきかどうかを判定
     * claude, anthropic等の特定プロセスの場合はtrue
     */
    private _shouldShowParentProcess(processName: string): boolean {
        const lowerName = processName.toLowerCase();
        return lowerName.includes('claude') || lowerName.includes('anthropic');
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
     * 指定されたセッションのフォアグラウンドプロセス名を取得
     */
    async getForegroundProcess(sessionId: string): Promise<string | null> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        const ptyPid = session.pty.pid;
        const platform = os.platform();

        try {
            if (platform === 'win32') {
                // Windows用の実装
                // PTYの子孫プロセスを再帰的に取得して、最も深い子プロセスを返す
                const { stdout } = await execPromise(
                    `wmic process where (ParentProcessId=${ptyPid}) get ProcessId,Name /format:csv`
                );

                const lines = stdout.trim().split('\n').slice(1).filter(line => line.trim());
                if (lines.length === 0) {
                    return null;
                }

                // 最初の子プロセス（シェル）を取得
                const parts = lines[0].split(',');
                const shellName = parts[1]?.trim();
                const shellPid = parts[0]?.trim();

                if (!shellPid) {
                    return shellName || null;
                }

                // シェルの子プロセスを取得（第2階層）
                try {
                    const { stdout: childStdout } = await execPromise(
                        `wmic process where (ParentProcessId=${shellPid}) get ProcessId,Name /format:csv`
                    );

                    const childLines = childStdout.trim().split('\n').slice(1).filter(line => line.trim());
                    if (childLines.length > 0) {
                        const childParts = childLines[0].split(',');
                        const childName = childParts[1]?.trim();
                        const childPid = childParts[0]?.trim();

                        if (!childPid) {
                            return childName || shellName || null;
                        }

                        // 第2階層の子プロセスを取得（第3階層）
                        try {
                            const { stdout: grandchildStdout } = await execPromise(
                                `wmic process where (ParentProcessId=${childPid}) get Name /format:list`
                            );

                            const grandchildLines = grandchildStdout.trim().split('\n').filter(line => line.startsWith('Name='));
                            if (grandchildLines.length > 0) {
                                const grandchildName = grandchildLines[0].split('=')[1]?.trim();
                                if (grandchildName) {
                                    // 同じ名前の場合は重複を避ける
                                    if (childName === grandchildName) {
                                        return childName;
                                    }
                                    // 親プロセスと子プロセスの両方を表示: "claude(caffeinate)"
                                    return `${childName}(${grandchildName})`;
                                }
                            }
                        } catch {
                            // 第3階層が見つからない場合
                        }

                        // 第2階層があるが第3階層がない場合
                        // 特定のプロセス（claude, anthropic等）の場合のみ親子を組み合わせて表示
                        if (this._shouldShowParentProcess(shellName)) {
                            // 同じ名前の場合は重複を避ける
                            if (shellName === childName) {
                                return childName;
                            }
                            return `${shellName}(${childName})`;
                        }

                        // 通常のシェルの場合は子プロセスのみ表示
                        return childName || shellName || null;
                    }
                } catch {
                    // シェルの子プロセスが見つからない場合はシェル名を返す
                }

                return shellName || null;
            } else {
                // macOS/Linux用の実装
                // PTYの直接の子プロセス（シェル）を取得
                const { stdout } = await execPromise(
                    `ps -o pid,ppid,comm | grep -E "^\\s*[0-9]+\\s+${ptyPid}\\s" | head -1`
                );

                if (!stdout.trim()) {
                    return null;
                }

                const parts = stdout.trim().split(/\s+/);
                if (parts.length < 3) {
                    return null;
                }

                const shellPid = parts[0];
                const shellCommand = parts.slice(2).join(' ');
                const shellName = this._extractProcessName(shellCommand);

                // シェルの子プロセスを取得（第2階層）
                try {
                    const { stdout: childStdout } = await execPromise(
                        `ps -o pid,ppid,comm | grep -E "^\\s*[0-9]+\\s+${shellPid}\\s" | head -1`
                    );

                    if (childStdout.trim()) {
                        const childParts = childStdout.trim().split(/\s+/);
                        if (childParts.length >= 3) {
                            const childPid = childParts[0];
                            const childCommand = childParts.slice(2).join(' ');
                            const childName = this._extractProcessName(childCommand);

                            // 第2階層の子プロセスを取得（第3階層）
                            try {
                                const { stdout: grandchildStdout } = await execPromise(
                                    `ps -o pid,ppid,comm | grep -E "^\\s*[0-9]+\\s+${childPid}\\s" | head -1`
                                );

                                if (grandchildStdout.trim()) {
                                    const grandchildParts = grandchildStdout.trim().split(/\s+/);
                                    if (grandchildParts.length >= 3) {
                                        const grandchildCommand = grandchildParts.slice(2).join(' ');
                                        const grandchildName = this._extractProcessName(grandchildCommand);
                                        // 同じ名前の場合は重複を避ける
                                        if (childName === grandchildName) {
                                            return childName;
                                        }
                                        // 親プロセスと子プロセスの両方を表示: "claude(caffeinate)"
                                        return `${childName}(${grandchildName})`;
                                    }
                                }
                            } catch (grandchildError) {
                                // 第3階層が見つからない場合
                            }

                            // 第2階層があるが第3階層がない場合
                            // 特定のプロセス（claude, anthropic等）の場合のみ親子を組み合わせて表示
                            if (this._shouldShowParentProcess(shellName)) {
                                // 同じ名前の場合は重複を避ける
                                if (shellName === childName) {
                                    return childName;
                                }
                                return `${shellName}(${childName})`;
                            }

                            // 通常のシェルの場合は子プロセスのみ表示
                            return childName || shellName || null;
                        }
                    }
                } catch (childError) {
                    // シェルの子プロセスが見つからない場合はシェル名を返す
                }

                return shellName || null;
            }
        } catch (error) {
            // プロセスが見つからない場合はnullを返す
            if (error instanceof Error && error.message.includes('Command failed')) {
                return null;
            }
            console.error('Error getting foreground process:', error);
            return null;
        }
    }

    /**
     * 1回のpsコマンドでプロセスツリーを取得し、
     * Claude Code検知とフォアグラウンドプロセス名の両方を算出する
     */
    async getProcessTree(sessionId: string): Promise<ProcessTreeResult> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return { isClaudeCodeRunning: false, foregroundProcess: null };
        }

        const ptyPid = session.pty.pid;
        const platform = os.platform();

        try {
            if (platform === 'win32') {
                return await this._getProcessTreeWindows(ptyPid);
            } else {
                return await this._getProcessTreeUnix(ptyPid);
            }
        } catch (error) {
            if (error instanceof Error && error.message.includes('Command failed')) {
                return { isClaudeCodeRunning: false, foregroundProcess: null };
            }
            console.error('Error getting process tree:', error);
            return { isClaudeCodeRunning: false, foregroundProcess: null };
        }
    }

    /**
     * macOS/Linux用: 1回のpsコマンドで全プロセス情報を取得し、メモリ上でフィルタリング
     */
    private async _getProcessTreeUnix(ptyPid: number): Promise<ProcessTreeResult> {
        // grepなしで全プロセス情報を1回で取得
        const { stdout } = await execPromise('ps -eo pid,ppid,comm');

        // プロセス一覧をパースしてMapに格納（pid -> {ppid, command}）
        const processMap = new Map<number, { ppid: number; command: string }>();
        const lines = stdout.trim().split('\n');

        // ヘッダー行をスキップ
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) {
                continue;
            }
            const parts = line.split(/\s+/);
            if (parts.length >= 3) {
                const pid = parseInt(parts[0]);
                const ppid = parseInt(parts[1]);
                const command = parts.slice(2).join(' ');
                if (pid > 0) {
                    processMap.set(pid, { ppid, command });
                }
            }
        }

        // PTYの直接の子プロセス（シェル）を検索
        const children: { pid: number; command: string }[] = [];
        for (const [pid, proc] of processMap) {
            if (proc.ppid === ptyPid) {
                children.push({ pid, command: proc.command });
            }
        }

        if (children.length === 0) {
            return { isClaudeCodeRunning: false, foregroundProcess: null };
        }

        // Claude Code検知: 全子孫プロセスを走査
        let isClaudeCodeRunning = false;
        const allDescendants = this._getAllDescendants(ptyPid, processMap);
        for (const desc of allDescendants) {
            const lowerCommand = desc.command.toLowerCase();
            if (lowerCommand.includes('claude') || lowerCommand.includes('anthropic')) {
                isClaudeCodeRunning = true;
                break;
            }
        }

        // フォアグラウンドプロセス名を取得（プロセスツリーの最も深い子プロセスを探索）
        const foregroundProcess = this._findForegroundProcess(children[0].pid, children[0].command, processMap);

        return { isClaudeCodeRunning, foregroundProcess };
    }

    /**
     * Windows用: 1回のwmicコマンドで全プロセス情報を取得し、メモリ上でフィルタリング
     */
    private async _getProcessTreeWindows(ptyPid: number): Promise<ProcessTreeResult> {
        // 全プロセスのPID, PPID, Name, CommandLineを1回で取得
        const { stdout } = await execPromise(
            'wmic process get ProcessId,ParentProcessId,Name,CommandLine /format:csv'
        );

        // プロセス一覧をパースしてMapに格納
        const processMap = new Map<number, { ppid: number; command: string }>();
        const lines = stdout.trim().split('\n');

        // ヘッダー行をスキップ
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) {
                continue;
            }
            const parts = line.split(',');
            if (parts.length >= 4) {
                const commandLine = parts[1] || '';
                const name = parts[2] || '';
                const ppid = parseInt(parts[3]) || 0;
                const pid = parseInt(parts[4]) || 0;
                if (pid > 0) {
                    processMap.set(pid, { ppid, command: commandLine || name });
                }
            }
        }

        // PTYの直接の子プロセス（シェル）を検索
        const children: { pid: number; command: string }[] = [];
        for (const [pid, proc] of processMap) {
            if (proc.ppid === ptyPid) {
                children.push({ pid, command: proc.command });
            }
        }

        if (children.length === 0) {
            return { isClaudeCodeRunning: false, foregroundProcess: null };
        }

        // Claude Code検知: 全子孫プロセスを走査
        let isClaudeCodeRunning = false;
        const allDescendants = this._getAllDescendants(ptyPid, processMap);
        for (const desc of allDescendants) {
            const lowerCommand = desc.command.toLowerCase();
            if (lowerCommand.includes('claude') || lowerCommand.includes('anthropic')) {
                isClaudeCodeRunning = true;
                break;
            }
        }

        // フォアグラウンドプロセス名を取得
        const foregroundProcess = this._findForegroundProcess(children[0].pid, children[0].command, processMap);

        return { isClaudeCodeRunning, foregroundProcess };
    }

    /**
     * 指定されたPIDの全子孫プロセスを再帰的に取得
     */
    private _getAllDescendants(
        parentPid: number,
        processMap: Map<number, { ppid: number; command: string }>
    ): { pid: number; command: string }[] {
        const descendants: { pid: number; command: string }[] = [];
        for (const [pid, proc] of processMap) {
            if (proc.ppid === parentPid) {
                descendants.push({ pid, command: proc.command });
                descendants.push(...this._getAllDescendants(pid, processMap));
            }
        }
        return descendants;
    }

    /**
     * プロセスツリーの最も深い子プロセスを探索してフォアグラウンドプロセス名を決定
     * 既存のgetForegroundProcess()と同じ3階層探索ロジックをメモリ上で実行
     */
    private _findForegroundProcess(
        shellPid: number,
        shellCommand: string,
        processMap: Map<number, { ppid: number; command: string }>
    ): string | null {
        const shellName = this._extractProcessName(shellCommand);

        // シェルの子プロセスを検索（第2階層）
        let childPid: number | null = null;
        let childName: string | null = null;
        for (const [pid, proc] of processMap) {
            if (proc.ppid === shellPid) {
                childPid = pid;
                childName = this._extractProcessName(proc.command);
                break;
            }
        }

        if (childPid === null || childName === null) {
            return shellName || null;
        }

        // 第2階層の子プロセスを検索（第3階層）
        let grandchildName: string | null = null;
        for (const [_pid, proc] of processMap) {
            if (proc.ppid === childPid) {
                grandchildName = this._extractProcessName(proc.command);
                break;
            }
        }

        if (grandchildName) {
            // 同じ名前の場合は重複を避ける
            if (childName === grandchildName) {
                return childName;
            }
            // 親プロセスと子プロセスの両方を表示: "claude(caffeinate)"
            return `${childName}(${grandchildName})`;
        }

        // 第2階層があるが第3階層がない場合
        // 特定のプロセス（claude, anthropic等）の場合のみ親子を組み合わせて表示
        if (this._shouldShowParentProcess(shellName)) {
            if (shellName === childName) {
                return childName;
            }
            return `${shellName}(${childName})`;
        }

        // 通常のシェルの場合は子プロセスのみ表示
        return childName || shellName || null;
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
