import * as vscode from 'vscode';

/**
 * ターミナル出力イベントのリスナー型
 */
export type TerminalOutputListener = (data: string) => void;

/**
 * ターミナルセッション終了イベントのリスナー型
 */
export type TerminalExitListener = (sessionId: string, exitCode: number, signal?: number) => void;

/**
 * ターミナルサービスのインターフェース
 */
export interface ITerminalService extends vscode.Disposable {
    /**
     * ターミナルセッションを作成
     * @param cwd 作業ディレクトリ（オプション）
     * @returns セッションID
     */
    createSession(cwd?: string): Promise<string>;

    /**
     * ターミナルセッションを終了
     * @param sessionId セッションID
     */
    killSession(sessionId: string): void;

    /**
     * ターミナルにデータを書き込む
     * @param sessionId セッションID
     * @param data 入力データ
     */
    write(sessionId: string, data: string): void;

    /**
     * 出力リスナーを登録
     * @param sessionId セッションID
     * @param callback 出力時のコールバック
     * @returns 登録解除用のDisposable
     */
    onOutput(sessionId: string, callback: TerminalOutputListener): vscode.Disposable;

    /**
     * ターミナルをリサイズ
     * @param sessionId セッションID
     * @param cols 列数
     * @param rows 行数
     */
    resize(sessionId: string, cols: number, rows: number): void;

    /**
     * node-ptyが利用可能かどうかを確認
     */
    isAvailable(): boolean;

    /**
     * node-ptyが利用不可の場合の理由を取得
     * @returns エラー理由（利用可能な場合は空文字列）
     */
    getUnavailableReason(): string;

    /**
     * セッション終了イベントのリスナーを登録
     * @param callback セッション終了時のコールバック
     * @returns 登録解除用のDisposable
     */
    onSessionExit(callback: TerminalExitListener): vscode.Disposable;
}
