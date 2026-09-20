import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import { TemplateService, TemplateVariables } from './TemplateService';
import { getGlobalPromptTemplatesDir } from '../utils/globalTemplatePaths';

/**
 * テンプレートの作成先
 */
export type PromptTemplateTarget = 'workspace' | 'global';

/**
 * テンプレートの出所
 */
export type PromptTemplateOrigin = PromptTemplateTarget | 'bundled';

/**
 * Editor Viewへ挿入するプロンプトテンプレート（スニペット）
 */
export interface PromptTemplate {
    /** ファイル名（拡張子なし）。一覧からの選択キーとして使うため一意であること */
    id: string;
    /** 表示名（先頭のH1見出し、無ければファイル名） */
    label: string;
    /** 一覧に表示する補足（ファイル名。グローバル分は`(global)`付き） */
    description: string;
    /** ファイルの内容そのまま（変数置換前・H1を含む） */
    body: string;
    /** 元ファイルの絶対パス */
    filePath: string;
    /** どこに置かれているテンプレートか */
    origin: PromptTemplateOrigin;
}

/** ワークスペース上のテンプレート配置先（既定値） */
const DEFAULT_TEMPLATES_RELATIVE_PATH = '.vscode/ai-coding-panel/prompts';

/** 拡張機能に同梱するテンプレートの配置先 */
const BUNDLED_TEMPLATES_DIR = ['resources', 'prompt-templates'];

/** ファイル名に使えない文字 */
const INVALID_FILE_NAME_PATTERN = /[:*?"<>|]/;

/**
 * プロンプトテンプレート（スニペット）を管理するサービス
 *
 * ファイル新規作成時の雛形（TemplateService / templateUtils）とは用途が異なるため、
 * 配置ディレクトリもサービスも分離している。
 */
export class PromptTemplateService {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly templateService: TemplateService
    ) {}

    /**
     * ワークスペース側のテンプレートディレクトリを取得
     * ワークスペースが開かれていない場合はundefinedを返す
     */
    getWorkspaceTemplatesDir(): string | undefined {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return undefined;
        }

        const configured = vscode.workspace
            .getConfiguration('aiCodingSidebar')
            .get<string>('editor.promptTemplatesPath', DEFAULT_TEMPLATES_RELATIVE_PATH)
            .trim() || DEFAULT_TEMPLATES_RELATIVE_PATH;

        return path.isAbsolute(configured)
            ? configured
            : path.join(workspaceRoot, configured);
    }

    /**
     * 拡張機能に同梱しているテンプレートディレクトリを取得
     */
    getBundledTemplatesDir(): string {
        return path.join(this.context.extensionPath, ...BUNDLED_TEMPLATES_DIR);
    }

    /**
     * グローバルのテンプレートディレクトリを取得
     * 解決できない場合はundefinedを返す
     */
    getGlobalTemplatesDir(): string | undefined {
        return getGlobalPromptTemplatesDir(this.context);
    }

    /**
     * テンプレート一覧を取得
     *
     * ワークスペースとグローバルをマージし、**同名ファイルはワークスペースを優先**する。
     * 排他（どちらか片方だけ）にすると、グローバルへ共通スニペットを置いても
     * ワークスペース側に1件でもあった時点で共通分が消えてしまい実用にならないため。
     *
     * 同梱分はどちらにも1件も無い場合のみ返す。
     * ユーザー定義と混在させると同名ファイルの優先順位が分かりづらくなるため。
     *
     * 並び順はワークスペース分→グローバル分で、各グループ内はファイル名昇順。
     */
    async listTemplates(): Promise<PromptTemplate[]> {
        const workspaceDir = this.getWorkspaceTemplatesDir();
        const globalDir = this.getGlobalTemplatesDir();

        const workspaceTemplates = workspaceDir
            ? await this.readTemplatesFrom(workspaceDir, 'workspace')
            : [];
        const globalTemplates = globalDir
            ? await this.readTemplatesFrom(globalDir, 'global')
            : [];

        // idは選択キーのため一意にする必要がある。同名はワークスペース側を残す
        const usedIds = new Set(workspaceTemplates.map(template => template.id));
        const merged = [
            ...workspaceTemplates,
            ...globalTemplates.filter(template => !usedIds.has(template.id))
        ];

        if (merged.length > 0) {
            return merged;
        }

        return this.readTemplatesFrom(this.getBundledTemplatesDir(), 'bundled');
    }

    /**
     * 同梱テンプレートをワークスペースへコピーする
     * 既に存在するファイルは上書きしない
     *
     * @returns コピー先ディレクトリ（ワークスペース未オープン時はundefined）
     */
    async setupWorkspaceTemplates(): Promise<string | undefined> {
        const workspaceDir = this.getWorkspaceTemplatesDir();
        if (!workspaceDir) {
            return undefined;
        }

        await this.copyBundledTemplatesTo(workspaceDir);
        return workspaceDir;
    }

    /**
     * 同梱テンプレートをグローバルへコピーする
     * 既に存在するファイルは上書きしない
     *
     * @returns コピー先ディレクトリ（解決できない場合はundefined）
     */
    async setupGlobalTemplates(): Promise<string | undefined> {
        const globalDir = this.getGlobalTemplatesDir();
        if (!globalDir) {
            return undefined;
        }

        await this.copyBundledTemplatesTo(globalDir);
        return globalDir;
    }

    /**
     * 同梱テンプレートを指定ディレクトリへコピーする
     * 既に存在するファイルは上書きしない
     *
     * globalStorageUri配下はVS Codeが自動作成しないため必ずmkdirする
     */
    private async copyBundledTemplatesTo(destinationDir: string): Promise<void> {
        await fsPromises.mkdir(destinationDir, { recursive: true });

        const bundledDir = this.getBundledTemplatesDir();
        const fileNames = await this.readMarkdownFileNames(bundledDir);

        for (const fileName of fileNames) {
            const destinationPath = path.join(destinationDir, fileName);
            if (await this.pathExists(destinationPath)) {
                continue;
            }
            const content = await fsPromises.readFile(path.join(bundledDir, fileName), 'utf8');
            await fsPromises.writeFile(destinationPath, content, 'utf8');
        }
    }

    /**
     * 新規テンプレートのファイル名として使えるかを検証する
     *
     * `vscode.window.showInputBox`のvalidateInputから利用する。
     * 既存ファイルとの衝突は作成先ごとに判定するため、
     * 呼び出し側は名前入力より先に作成先を決めておくこと
     *
     * @param name テンプレート名（拡張子は省略可）
     * @param target 作成先
     * @returns 問題がある場合はエラーメッセージ、問題なければundefined
     */
    async validateTemplateName(
        name: string,
        target: PromptTemplateTarget = 'workspace'
    ): Promise<string | undefined> {
        const trimmed = name.trim();

        if (!trimmed) {
            return 'Enter a template name';
        }

        if (/[\\/]/.test(trimmed)) {
            return 'The name cannot contain a path separator';
        }

        if (INVALID_FILE_NAME_PATTERN.test(trimmed)) {
            return 'The name cannot contain : * ? " < > |';
        }

        const fileName = this.toTemplateFileName(trimmed);
        if (fileName === '.md') {
            return 'Enter a template name';
        }

        const targetDir = this.getTemplatesDirFor(target);
        if (targetDir && await this.pathExists(path.join(targetDir, fileName))) {
            return `${fileName} already exists`;
        }

        return undefined;
    }

    /**
     * ワークスペースへ新規テンプレートを作成する
     *
     * @param name テンプレート名（拡張子は省略可）
     * @returns 作成したファイルの絶対パス
     */
    async createWorkspaceTemplate(name: string): Promise<string> {
        const workspaceDir = this.getWorkspaceTemplatesDir();
        if (!workspaceDir) {
            throw new Error('No workspace is open');
        }

        return this.createTemplateIn(workspaceDir, name);
    }

    /**
     * グローバルへ新規テンプレートを作成する
     *
     * @param name テンプレート名（拡張子は省略可）
     * @returns 作成したファイルの絶対パス
     */
    async createGlobalTemplate(name: string): Promise<string> {
        const globalDir = this.getGlobalTemplatesDir();
        if (!globalDir) {
            throw new Error('Global template directory is not available');
        }

        return this.createTemplateIn(globalDir, name);
    }

    /**
     * 指定ディレクトリへ新規テンプレートを作成する
     *
     * 作成前にユーザー定義のテンプレートが1件も無い場合は、同梱テンプレートを先にコピーする。
     * 同梱分は「ワークスペースにもグローバルにも1件も無い場合のみ」一覧に出る仕様のため、
     * コピーしないと1件作った瞬間に一覧から同梱分が消えてしまう
     */
    private async createTemplateIn(directoryPath: string, name: string): Promise<string> {
        const fileName = this.toTemplateFileName(name.trim());
        const filePath = path.join(directoryPath, fileName);

        if (await this.pathExists(filePath)) {
            throw new Error(`${fileName} already exists`);
        }

        if (await this.hasNoUserTemplates()) {
            await this.copyBundledTemplatesTo(directoryPath);
        } else {
            await fsPromises.mkdir(directoryPath, { recursive: true });
        }

        // 見出しは一覧の表示名としても使われる
        const label = path.basename(fileName, '.md');
        await fsPromises.writeFile(filePath, `# ${label}\n\n`, 'utf8');

        return filePath;
    }

    /**
     * 作成先に対応するディレクトリを取得
     */
    private getTemplatesDirFor(target: PromptTemplateTarget): string | undefined {
        return target === 'global'
            ? this.getGlobalTemplatesDir()
            : this.getWorkspaceTemplatesDir();
    }

    /**
     * ユーザー定義のテンプレート（ワークスペース・グローバル）が1件も無いかどうか
     */
    private async hasNoUserTemplates(): Promise<boolean> {
        const workspaceDir = this.getWorkspaceTemplatesDir();
        if (workspaceDir && (await this.readMarkdownFileNames(workspaceDir)).length > 0) {
            return false;
        }

        const globalDir = this.getGlobalTemplatesDir();
        if (globalDir && (await this.readMarkdownFileNames(globalDir)).length > 0) {
            return false;
        }

        return true;
    }

    /**
     * テンプレート名をファイル名へ変換する（拡張子が無ければ.mdを付ける）
     */
    private toTemplateFileName(name: string): string {
        return name.toLowerCase().endsWith('.md') ? name : `${name}.md`;
    }

    /**
     * テンプレートの変数を置換して挿入用の文字列を生成する
     *
     * 本文は加工しない（H1見出しもそのまま残す）
     *
     * @param template 対象のテンプレート
     * @param currentFilePath Editor Viewで開いているファイルの絶対パス（未オープン時はundefined）
     */
    renderTemplate(template: PromptTemplate, currentFilePath?: string): string {
        return this.templateService.renderVariables(
            template.body,
            this.buildVariables(currentFilePath)
        );
    }

    /**
     * 挿入時に使用するテンプレート変数を生成する
     * ファイル未オープン時はファイル関連の変数を空文字にする
     */
    private buildVariables(currentFilePath?: string): TemplateVariables {
        const timestamp = this.templateService.generateTimestamp();

        if (!currentFilePath) {
            return {
                datetime: this.templateService.formatDateTime(),
                filename: '',
                timestamp: timestamp,
                filepath: '',
                dirpath: ''
            };
        }

        return this.templateService.generateTemplateVariables(
            path.dirname(currentFilePath),
            path.basename(currentFilePath),
            timestamp
        );
    }

    /**
     * 指定ディレクトリ直下の.mdファイルをテンプレートとして読み込む
     * ディレクトリが存在しない場合は空配列を返す
     *
     * グローバル分はワークスペース分と見分けがつくよう、descriptionに`(global)`を付ける
     */
    private async readTemplatesFrom(
        directoryPath: string,
        origin: PromptTemplateOrigin
    ): Promise<PromptTemplate[]> {
        const fileNames = await this.readMarkdownFileNames(directoryPath);

        const templates = await Promise.all(
            fileNames.map(async fileName => {
                const filePath = path.join(directoryPath, fileName);
                const body = await fsPromises.readFile(filePath, 'utf8');

                return {
                    id: path.basename(fileName, '.md'),
                    label: this.extractLabel(body) ?? path.basename(fileName, '.md'),
                    description: origin === 'global' ? `${fileName} (global)` : fileName,
                    body: body,
                    filePath: filePath,
                    origin: origin
                };
            })
        );

        return templates;
    }

    /**
     * 指定ディレクトリ直下の.mdファイル名をファイル名昇順で取得する
     * サブディレクトリは辿らない
     */
    private async readMarkdownFileNames(directoryPath: string): Promise<string[]> {
        let entries;
        try {
            entries = await fsPromises.readdir(directoryPath, { withFileTypes: true });
        } catch {
            // ディレクトリが存在しない場合はテンプレート無しとして扱う
            return [];
        }

        return entries
            .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
            .map(entry => entry.name)
            .sort((a, b) => a.localeCompare(b));
    }

    /**
     * 先頭のH1見出しを表示名として取り出す（無ければundefined）
     * 本文からは除去しない（挿入時はファイルの内容をそのまま使う）
     */
    private extractLabel(body: string): string | undefined {
        for (const line of body.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) {
                continue;
            }
            const matched = /^#\s+(.+)$/.exec(trimmed);
            return matched ? matched[1].trim() : undefined;
        }
        return undefined;
    }

    /**
     * パスが存在するかどうかを確認
     */
    private async pathExists(targetPath: string): Promise<boolean> {
        try {
            await fsPromises.access(targetPath);
            return true;
        } catch {
            return false;
        }
    }
}
