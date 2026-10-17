import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ITerminalService, TerminalOutputListener, TerminalExitListener, ProcessInfo, ProcessTreeResult } from '../interfaces/ITerminalService';

const execPromise = promisify(exec);

/**
 * Minimal type definition for node-pty
 * Ideally the IPty interface from the node-pty package should be used, but
 * the type definitions cannot be imported directly because the node-pty bundled with VSCode is used
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
 * Terminal session information
 */
interface TerminalSession {
    id: string;
    pty: IPty;
    outputCallbacks: Set<TerminalOutputListener>;
    /** Chunks not yet written to the PTY */
    writeQueue: string[];
    /** Timer for writing the next chunk (set only while writing) */
    writeTimer?: NodeJS.Timeout;
}

/**
 * Maximum number of characters written to the PTY at once
 * The macOS PTY input buffer is only about 1KB and the overflow is lost when written all at once, so
 * split the data into small chunks, as the built-in VS Code terminal does
 */
const WRITE_CHUNK_SIZE = 50;

/**
 * Interval between chunk writes (ms)
 */
const WRITE_INTERVAL_MS = 5;

/**
 * Process information
 */
/**
 * Implementation of the terminal service
 * Manages PTY sessions using the node-pty bundled with VSCode
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
     * Initialize node-pty
     */
    private initNodePty(): void {
        // List of paths to try
        const paths = [
            // node-pty bundled with VSCode (regular node_modules)
            path.join(vscode.env.appRoot, 'node_modules', 'node-pty'),
            // node-pty bundled with VSCode (asar)
            path.join(vscode.env.appRoot, 'node_modules.asar', 'node-pty'),
            // node-pty bundled with VSCode (asar.unpacked)
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

        // Fallback: try require directly
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
     * Get the default shell path
     */
    private getDefaultShell(): string {
        const platform = os.platform();
        if (platform === 'win32') {
            return process.env.COMSPEC || 'cmd.exe';
        }
        return process.env.SHELL || '/bin/bash';
    }

    /**
     * Create a terminal session
     */
    async createSession(cwd?: string): Promise<string> {
        if (!this._isAvailable) {
            throw new Error('node-pty is not available');
        }

        const config = vscode.workspace.getConfiguration('aiCodingSidebar');
        const shellPath = config.get<string>('terminal.shell') || this.getDefaultShell();

        // Determine the working directory
        const workingDirectory = cwd ||
            (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath) ||
            os.homedir();

        // Generate the session ID
        const sessionId = `terminal-${++this.sessionCounter}-${Date.now()}`;

        // Set shell arguments (start as a login shell so PATH is set correctly)
        const shellArgs: string[] = [];
        const platform = os.platform();
        if (platform !== 'win32') {
            // Start as a login shell on macOS/Linux
            shellArgs.push('-l');
        }

        try {
            // Set environment variables
            const env = { ...process.env };

            // Set a default LANG only if it is not set
            if (!env.LANG) {
                env.LANG = 'en_US.UTF-8';
            }
            // Do not set LC_ALL (respect the user's environment)

            // Set TERM and COLORTERM explicitly
            env.TERM = 'xterm-256color';
            env.COLORTERM = 'truecolor';

            // Create the PTY process
            const pty = this.nodePty.spawn(shellPath, shellArgs, {
                name: 'xterm-256color',
                cols: 80,
                rows: 24,
                cwd: workingDirectory,
                env: env
            });

            // Store the session
            const session: TerminalSession = {
                id: sessionId,
                pty: pty,
                outputCallbacks: new Set(),
                writeQueue: []
            };
            this.sessions.set(sessionId, session);

            // Watch PTY output
            pty.onData((data: string) => {
                session.outputCallbacks.forEach(callback => {
                    try {
                        callback(data);
                    } catch (error) {
                        console.error('Error in terminal output callback:', error);
                    }
                });
            });

            // Watch PTY exit
            pty.onExit(({ exitCode, signal }: { exitCode: number, signal?: number }) => {
                // Invoke the exit callbacks
                this.exitCallbacks.forEach(callback => {
                    try {
                        callback(sessionId, exitCode, signal);
                    } catch (error) {
                        console.error('Error in terminal exit callback:', error);
                    }
                });

                // Remove the session
                this._clearWriteQueue(session);
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
     * Kill a terminal session
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
            this._clearWriteQueue(session);
            this.sessions.delete(sessionId);
            this.lastResizeParams.delete(sessionId);
        }
    }

    /**
     * Write data to the terminal
     */
    write(sessionId: string, data: string): void {
        const session = this.sessions.get(sessionId);
        if (!session || !data) {
            return;
        }

        // Split into chunks and write them in order so long commands are not truncated
        session.writeQueue.push(...this._splitIntoChunks(data));
        if (!session.writeTimer) {
            this._flushWriteQueue(session);
        }
    }

    /**
     * Write one pending chunk, and if any remain, write the rest after an interval
     */
    private _flushWriteQueue(session: TerminalSession): void {
        const chunk = session.writeQueue.shift();
        if (chunk === undefined) {
            session.writeTimer = undefined;
            return;
        }

        try {
            session.pty.write(chunk);
        } catch (error) {
            console.error('Error writing to terminal:', error);
        }

        session.writeTimer = setTimeout(() => this._flushWriteQueue(session), WRITE_INTERVAL_MS);
    }

    /**
     * Discard pending chunks
     */
    private _clearWriteQueue(session: TerminalSession): void {
        if (session.writeTimer) {
            clearTimeout(session.writeTimer);
            session.writeTimer = undefined;
        }
        session.writeQueue = [];
    }

    /**
     * Split data into chunks of WRITE_CHUNK_SIZE characters
     * Never split in the middle of a surrogate pair (emoji, etc.)
     */
    private _splitIntoChunks(data: string): string[] {
        const chunks: string[] = [];
        let start = 0;
        while (start < data.length) {
            let end = Math.min(start + WRITE_CHUNK_SIZE, data.length);
            const lastCode = data.charCodeAt(end - 1);
            if (end < data.length && lastCode >= 0xD800 && lastCode <= 0xDBFF) {
                end--;
            }
            chunks.push(data.substring(start, end));
            start = end;
        }
        return chunks;
    }

    /**
     * Register an output listener
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
     * Resize the terminal
     */
    resize(sessionId: string, cols: number, rows: number): void {
        // Skip if the size is unchanged
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
     * Check whether node-pty is available
     */
    isAvailable(): boolean {
        return this._isAvailable;
    }

    /**
     * Get the reason node-pty is unavailable
     */
    getUnavailableReason(): string {
        if (this._isAvailable) {
            return '';
        }
        return this._unavailableReason || 'node-pty could not be loaded. Please check your VSCode installation or try restarting VSCode.';
    }

    /**
     * Register a listener for session exit events
     */
    onSessionExit(callback: TerminalExitListener): vscode.Disposable {
        this.exitCallbacks.add(callback);
        return new vscode.Disposable(() => {
            this.exitCallbacks.delete(callback);
        });
    }


    /**
     * Get the child processes of the given session
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
                // Implementation for Windows
                const { stdout } = await execPromise(
                    `wmic process where (ParentProcessId=${ptyPid}) get ProcessId,Name,CommandLine /format:csv`
                );

                return stdout
                    .trim()
                    .split('\n')
                    .slice(1) // Skip the header
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
                // Implementation for macOS/Linux
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
            // If no process is found, return an empty array instead of an error
            if (error instanceof Error && error.message.includes('Command failed')) {
                return [];
            }
            console.error('Error getting child processes:', error);
            return [];
        }
    }

    /**
     * Extract the process name from a command string
     */
    private _extractProcessName(command: string): string {
        if (!command) {
            return '';
        }
        // Extract the file name from the path (e.g. "/usr/bin/vim" -> "vim", "bash" -> "bash")
        const baseName = command.split('/').pop() || command;
        // Strip arguments (e.g. "vim file.txt" -> "vim")
        return baseName.split(/\s+/)[0] || '';
    }

    /**
     * Determine whether the parent process name should be shown
     * true for specific processes such as claude and anthropic
     */
    private _shouldShowParentProcess(processName: string): boolean {
        const lowerName = processName.toLowerCase();
        return lowerName.includes('claude') || lowerName.includes('anthropic');
    }

    /**
     * Check whether Claude Code is running in the given session
     */
    async isClaudeCodeRunning(sessionId: string): Promise<boolean> {
        const children = await this.getChildProcesses(sessionId);
        return children.some(proc =>
            proc.command.toLowerCase().includes('claude') ||
            proc.command.toLowerCase().includes('anthropic')
        );
    }

    /**
     * Get the foreground process name of the given session
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
                // Implementation for Windows
                // Recursively get the PTY's descendant processes and return the deepest child
                const { stdout } = await execPromise(
                    `wmic process where (ParentProcessId=${ptyPid}) get ProcessId,Name /format:csv`
                );

                const lines = stdout.trim().split('\n').slice(1).filter(line => line.trim());
                if (lines.length === 0) {
                    return null;
                }

                // Get the first child process (the shell)
                const parts = lines[0].split(',');
                const shellName = parts[1]?.trim();
                const shellPid = parts[0]?.trim();

                if (!shellPid) {
                    return shellName || null;
                }

                // Get the shell's child processes (2nd level)
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

                        // Get the children of the 2nd-level process (3rd level)
                        try {
                            const { stdout: grandchildStdout } = await execPromise(
                                `wmic process where (ParentProcessId=${childPid}) get Name /format:list`
                            );

                            const grandchildLines = grandchildStdout.trim().split('\n').filter(line => line.startsWith('Name='));
                            if (grandchildLines.length > 0) {
                                const grandchildName = grandchildLines[0].split('=')[1]?.trim();
                                if (grandchildName) {
                                    // Avoid duplication when the names are the same
                                    if (childName === grandchildName) {
                                        return childName;
                                    }
                                    // Show both the parent and child processes: "claude(caffeinate)"
                                    return `${childName}(${grandchildName})`;
                                }
                            }
                        } catch {
                            // When no 3rd-level process is found
                        }

                        // When there is a 2nd level but no 3rd level
                        // Combine parent and child only for specific processes (claude, anthropic, etc.)
                        if (this._shouldShowParentProcess(shellName)) {
                            // Avoid duplication when the names are the same
                            if (shellName === childName) {
                                return childName;
                            }
                            return `${shellName}(${childName})`;
                        }

                        // For a regular shell, show only the child process
                        return childName || shellName || null;
                    }
                } catch {
                    // If the shell has no child process, return the shell name
                }

                return shellName || null;
            } else {
                // Implementation for macOS/Linux
                // Get the PTY's direct child process (the shell)
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

                // Get the shell's child processes (2nd level)
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

                            // Get the children of the 2nd-level process (3rd level)
                            try {
                                const { stdout: grandchildStdout } = await execPromise(
                                    `ps -o pid,ppid,comm | grep -E "^\\s*[0-9]+\\s+${childPid}\\s" | head -1`
                                );

                                if (grandchildStdout.trim()) {
                                    const grandchildParts = grandchildStdout.trim().split(/\s+/);
                                    if (grandchildParts.length >= 3) {
                                        const grandchildCommand = grandchildParts.slice(2).join(' ');
                                        const grandchildName = this._extractProcessName(grandchildCommand);
                                        // Avoid duplication when the names are the same
                                        if (childName === grandchildName) {
                                            return childName;
                                        }
                                        // Show both the parent and child processes: "claude(caffeinate)"
                                        return `${childName}(${grandchildName})`;
                                    }
                                }
                            } catch (grandchildError) {
                                // When no 3rd-level process is found
                            }

                            // When there is a 2nd level but no 3rd level
                            // Combine parent and child only for specific processes (claude, anthropic, etc.)
                            if (this._shouldShowParentProcess(shellName)) {
                                // Avoid duplication when the names are the same
                                if (shellName === childName) {
                                    return childName;
                                }
                                return `${shellName}(${childName})`;
                            }

                            // For a regular shell, show only the child process
                            return childName || shellName || null;
                        }
                    }
                } catch (childError) {
                    // If the shell has no child process, return the shell name
                }

                return shellName || null;
            }
        } catch (error) {
            // Return null if no process is found
            if (error instanceof Error && error.message.includes('Command failed')) {
                return null;
            }
            console.error('Error getting foreground process:', error);
            return null;
        }
    }

    /**
     * Get the process tree with a single ps command and
     * compute both the Claude Code detection and the foreground process name
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
     * macOS/Linux: get all process information with a single ps command and filter it in memory
     */
    private async _getProcessTreeUnix(ptyPid: number): Promise<ProcessTreeResult> {
        // Get all process information at once without grep
        const { stdout } = await execPromise('ps -eo pid,ppid,comm');

        // Parse the process list into a Map (pid -> {ppid, command})
        const processMap = new Map<number, { ppid: number; command: string }>();
        const lines = stdout.trim().split('\n');

        // Skip the header line
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

        // Find the PTY's direct child process (the shell)
        const children: { pid: number; command: string }[] = [];
        for (const [pid, proc] of processMap) {
            if (proc.ppid === ptyPid) {
                children.push({ pid, command: proc.command });
            }
        }

        if (children.length === 0) {
            return { isClaudeCodeRunning: false, foregroundProcess: null };
        }

        // Claude Code detection: scan all descendant processes
        let isClaudeCodeRunning = false;
        const allDescendants = this._getAllDescendants(ptyPid, processMap);
        for (const desc of allDescendants) {
            const lowerCommand = desc.command.toLowerCase();
            if (lowerCommand.includes('claude') || lowerCommand.includes('anthropic')) {
                isClaudeCodeRunning = true;
                break;
            }
        }

        // Get the foreground process name (search for the deepest child in the process tree)
        const foregroundProcess = this._findForegroundProcess(children[0].pid, children[0].command, processMap);

        return { isClaudeCodeRunning, foregroundProcess };
    }

    /**
     * Windows: get all process information with a single wmic command and filter it in memory
     */
    private async _getProcessTreeWindows(ptyPid: number): Promise<ProcessTreeResult> {
        // Get PID, PPID, Name and CommandLine of all processes at once
        const { stdout } = await execPromise(
            'wmic process get ProcessId,ParentProcessId,Name,CommandLine /format:csv'
        );

        // Parse the process list into a Map
        const processMap = new Map<number, { ppid: number; command: string }>();
        const lines = stdout.trim().split('\n');

        // Skip the header line
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

        // Find the PTY's direct child process (the shell)
        const children: { pid: number; command: string }[] = [];
        for (const [pid, proc] of processMap) {
            if (proc.ppid === ptyPid) {
                children.push({ pid, command: proc.command });
            }
        }

        if (children.length === 0) {
            return { isClaudeCodeRunning: false, foregroundProcess: null };
        }

        // Claude Code detection: scan all descendant processes
        let isClaudeCodeRunning = false;
        const allDescendants = this._getAllDescendants(ptyPid, processMap);
        for (const desc of allDescendants) {
            const lowerCommand = desc.command.toLowerCase();
            if (lowerCommand.includes('claude') || lowerCommand.includes('anthropic')) {
                isClaudeCodeRunning = true;
                break;
            }
        }

        // Get the foreground process name
        const foregroundProcess = this._findForegroundProcess(children[0].pid, children[0].command, processMap);

        return { isClaudeCodeRunning, foregroundProcess };
    }

    /**
     * Recursively get all descendant processes of the given PID
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
     * Determine the foreground process name by searching for the deepest child in the process tree
     * Runs the same 3-level search logic as the existing getForegroundProcess() in memory
     */
    private _findForegroundProcess(
        shellPid: number,
        shellCommand: string,
        processMap: Map<number, { ppid: number; command: string }>
    ): string | null {
        const shellName = this._extractProcessName(shellCommand);

        // Find the shell's child processes (2nd level)
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

        // Find the children of the 2nd-level process (3rd level)
        let grandchildName: string | null = null;
        for (const [_pid, proc] of processMap) {
            if (proc.ppid === childPid) {
                grandchildName = this._extractProcessName(proc.command);
                break;
            }
        }

        if (grandchildName) {
            // Avoid duplication when the names are the same
            if (childName === grandchildName) {
                return childName;
            }
            // Show both the parent and child processes: "claude(caffeinate)"
            return `${childName}(${grandchildName})`;
        }

        // When there is a 2nd level but no 3rd level
        // Combine parent and child only for specific processes (claude, anthropic, etc.)
        if (this._shouldShowParentProcess(shellName)) {
            if (shellName === childName) {
                return childName;
            }
            return `${shellName}(${childName})`;
        }

        // For a regular shell, show only the child process
        return childName || shellName || null;
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        // Kill all sessions
        this.sessions.forEach((session) => {
            try {
                session.pty.kill();
            } catch (error) {
                console.error('Error disposing terminal session:', error);
            }
            session.outputCallbacks.clear();
            this._clearWriteQueue(session);
        });
        this.sessions.clear();
        this.exitCallbacks.clear();
        this.lastResizeParams.clear();
    }
}
