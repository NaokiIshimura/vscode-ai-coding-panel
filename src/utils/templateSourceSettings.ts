import * as vscode from 'vscode';

/**
 * テンプレートの読み込み元を有効にするかどうか
 *
 * 設定側は`disableXxx`（無効化フラグ）だが、ここでは
 * **true = 読み込む** の肯定形に反転して保持する。
 * 呼び出し側の条件式が二重否定にならないようにするため。
 */
export interface TemplateSourceSettings {
    /** ワークスペースのファイル雛形（.vscode/ai-coding-panel/templates）を読み込むか */
    workspaceTemplates: boolean;
    /** グローバルのファイル雛形（<global>/templates）を読み込むか */
    globalTemplates: boolean;
    /** ワークスペースのスニペット（editor.promptTemplatesPath）を読み込むか */
    workspacePromptTemplates: boolean;
    /** グローバルのスニペット（<global>/prompts）を読み込むか */
    globalPromptTemplates: boolean;
}

/**
 * 設定を読み取る関数
 * テストから差し替えられるよう型として公開している
 */
export type TemplateSourceSettingsReader = () => TemplateSourceSettings;

/** 設定キー（`aiCodingSidebar`配下） */
const SETTING_KEYS = {
    workspaceTemplates: 'editor.disableWorkspaceEditorTemplates',
    globalTemplates: 'editor.disableGlobalEditorTemplates',
    workspacePromptTemplates: 'editor.disableWorkspacePromptTemplates',
    globalPromptTemplates: 'editor.disableGlobalPromptTemplates'
} as const;

/**
 * 読み込み元の設定を取得する
 *
 * 呼ばれるたびに設定を読むためキャッシュしない。
 * 設定変更が拡張機能の再読み込み無しで反映される
 */
export function readTemplateSourceSettings(): TemplateSourceSettings {
    const config = vscode.workspace.getConfiguration('aiCodingSidebar');

    // 設定は無効化フラグのため反転する
    const isEnabled = (key: string): boolean => !config.get<boolean>(key, false);

    return {
        workspaceTemplates: isEnabled(SETTING_KEYS.workspaceTemplates),
        globalTemplates: isEnabled(SETTING_KEYS.globalTemplates),
        workspacePromptTemplates: isEnabled(SETTING_KEYS.workspacePromptTemplates),
        globalPromptTemplates: isEnabled(SETTING_KEYS.globalPromptTemplates)
    };
}
