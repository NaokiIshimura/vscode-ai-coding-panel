import * as vscode from 'vscode';

/**
 * Listener type for terminal output events
 */
export type TerminalOutputListener = (data: string) => void;

/**
 * Listener type for terminal session exit events
 */
export type TerminalExitListener = (sessionId: string, exitCode: number, signal?: number) => void;

/**
 * Process information
 */
export interface ProcessInfo {
    pid: number;
    ppid: number;
    command: string;
    name?: string;           // Process name (e.g. "bash", "vim", "claude")
    isForeground?: boolean;  // Whether it is the foreground process
}

/**
 * Result of analyzing the process tree
 * Gets both the Claude Code detection and the foreground process name from a single ps command run
 */
export interface ProcessTreeResult {
    isClaudeCodeRunning: boolean;
    foregroundProcess: string | null;
}

/**
 * Interface of the terminal service
 */
export interface ITerminalService extends vscode.Disposable {
    /**
     * Create a terminal session
     * @param cwd Working directory (optional)
     * @returns Session ID
     */
    createSession(cwd?: string): Promise<string>;

    /**
     * Kill a terminal session
     * @param sessionId Session ID
     */
    killSession(sessionId: string): void;

    /**
     * Write data to the terminal
     * @param sessionId Session ID
     * @param data Input data
     */
    write(sessionId: string, data: string): void;

    /**
     * Register an output listener
     * @param sessionId Session ID
     * @param callback Callback invoked on output
     * @returns Disposable for unregistering
     */
    onOutput(sessionId: string, callback: TerminalOutputListener): vscode.Disposable;

    /**
     * Resize the terminal
     * @param sessionId Session ID
     * @param cols Number of columns
     * @param rows Number of rows
     */
    resize(sessionId: string, cols: number, rows: number): void;

    /**
     * Check whether node-pty is available
     */
    isAvailable(): boolean;

    /**
     * Get the reason node-pty is unavailable
     * @returns Error reason (empty string if available)
     */
    getUnavailableReason(): string;

    /**
     * Register a listener for session exit events
     * @param callback Callback invoked when a session exits
     * @returns Disposable for unregistering
     */
    onSessionExit(callback: TerminalExitListener): vscode.Disposable;

    /**
     * Get the child processes of the given session
     * @param sessionId Session ID
     * @returns Array of process information
     */
    getChildProcesses(sessionId: string): Promise<ProcessInfo[]>;

    /**
     * Check whether Claude Code is running in the given session
     * @param sessionId Session ID
     * @returns true if Claude Code is running
     */
    isClaudeCodeRunning(sessionId: string): Promise<boolean>;

    /**
     * Get the foreground process name of the given session
     * @param sessionId Session ID
     * @returns Foreground process name (null if none)
     */
    getForegroundProcess(sessionId: string): Promise<string | null>;

    /**
     * Get the process tree of the given session with a single ps command and
     * compute both the Claude Code detection and the foreground process name
     * @param sessionId Session ID
     * @returns Result of analyzing the process tree
     */
    getProcessTree(sessionId: string): Promise<ProcessTreeResult>;
}
