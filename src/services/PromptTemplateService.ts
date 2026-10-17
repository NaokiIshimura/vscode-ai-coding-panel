import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import { TemplateService, TemplateVariables } from './TemplateService';
import { getGlobalPromptTemplatesDir } from '../utils/globalTemplatePaths';
import {
    TemplateSourceSettingsReader,
    readTemplateSourceSettings
} from '../utils/templateSourceSettings';

/**
 * Where a template is created
 */
export type PromptTemplateTarget = 'workspace' | 'global';

/**
 * Origin of a template
 */
export type PromptTemplateOrigin = PromptTemplateTarget | 'bundled';

/**
 * Prompt template (snippet) inserted into the Editor View
 */
export interface PromptTemplate {
    /** File name without extension. Must be unique because it is used as the selection key in the list */
    id: string;
    /** Display name (the first H1 heading, or the file name if there is none) */
    label: string;
    /** Supplementary text shown in the list (the file name, with `(global)` for global templates) */
    description: string;
    /** File content as is (before variable replacement, including the H1) */
    body: string;
    /** Absolute path of the source file */
    filePath: string;
    /** Where the template is located */
    origin: PromptTemplateOrigin;
}

/** Template location in the workspace (default) */
const DEFAULT_TEMPLATES_RELATIVE_PATH = '.vscode/ai-coding-panel/prompts';

/** Location of the templates bundled with the extension */
const BUNDLED_TEMPLATES_DIR = ['resources', 'prompt-templates'];

/** Characters that cannot be used in file names */
const INVALID_FILE_NAME_PATTERN = /[:*?"<>|]/;

/**
 * Service that manages prompt templates (snippets)
 *
 * Its purpose differs from the file templates used when creating new files (TemplateService / templateUtils),
 * so both the directory and the service are kept separate.
 */
export class PromptTemplateService {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly templateService: TemplateService,
        // Allows tests to replace the settings for template sources
        private readonly readSettings: TemplateSourceSettingsReader = readTemplateSourceSettings
    ) {}

    /**
     * Get the workspace template directory
     * Returns undefined if no workspace is open
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
     * Get the template directory bundled with the extension
     */
    getBundledTemplatesDir(): string {
        return path.join(this.context.extensionPath, ...BUNDLED_TEMPLATES_DIR);
    }

    /**
     * Get the global template directory
     * Returns undefined if it cannot be resolved
     */
    getGlobalTemplatesDir(): string | undefined {
        return getGlobalPromptTemplatesDir(this.context);
    }

    /**
     * Get the list of templates
     *
     * Merges workspace and global templates; **for files with the same name, the workspace one takes precedence**.
     * Making them exclusive (only one of the two) would be impractical: shared snippets placed in the global location
     * would disappear as soon as the workspace had even one template.
     *
     * Bundled templates are returned only when none of the enabled sources has any template.
     * Mixing them with user-defined templates would make the precedence of same-named files hard to understand.
     *
     * Workspace templates come first, then global ones; each group is sorted by file name in ascending order.
     */
    async listTemplates(): Promise<PromptTemplate[]> {
        const sources = this.getEnabledSourceDirs();

        // The id is the selection key and must be unique. For duplicates the first one wins (workspace takes precedence)
        const usedIds = new Set<string>();
        const merged: PromptTemplate[] = [];

        for (const source of sources) {
            const templates = await this.readTemplatesFrom(source.dir, source.origin);
            for (const template of templates) {
                if (usedIds.has(template.id)) {
                    continue;
                }
                usedIds.add(template.id);
                merged.push(template);
            }
        }

        if (merged.length > 0) {
            return merged;
        }

        return this.readTemplatesFrom(this.getBundledTemplatesDir(), 'bundled');
    }

    /**
     * Return the directories used for the list and the duplicate check, in order of precedence
     *
     * Template sources disabled in the settings are excluded.
     * Shared so that `listTemplates()` and `hasNoUserTemplates()` use the same criteria
     * (if they diverge, the bug where "bundled templates disappear from the list as soon as one is created" comes back)
     */
    private getEnabledSourceDirs(): { dir: string; origin: PromptTemplateTarget }[] {
        const settings = this.readSettings();
        const sources: { dir: string; origin: PromptTemplateTarget }[] = [];

        const workspaceDir = this.getWorkspaceTemplatesDir();
        if (settings.workspacePromptTemplates && workspaceDir) {
            sources.push({ dir: workspaceDir, origin: 'workspace' });
        }

        const globalDir = this.getGlobalTemplatesDir();
        if (settings.globalPromptTemplates && globalDir) {
            sources.push({ dir: globalDir, origin: 'global' });
        }

        return sources;
    }

    /**
     * Copy the bundled templates to the workspace
     * Existing files are not overwritten
     *
     * @returns The destination directory (undefined when no workspace is open)
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
     * Copy the bundled templates to the global location
     * Existing files are not overwritten
     *
     * @returns The destination directory (undefined if it cannot be resolved)
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
     * Copy the bundled templates to the given directory
     * Existing files are not overwritten
     *
     * Always mkdir, because VS Code does not create the globalStorageUri directory automatically
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
     * Validate whether the name can be used as the file name of a new template
     *
     * Used from validateInput of `vscode.window.showInputBox`.
     * Collisions with existing files are checked per destination,
     * so callers must decide the destination before asking for the name
     *
     * @param name Template name (the extension can be omitted)
     * @param target Destination
     * @returns An error message if there is a problem, otherwise undefined
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
     * Create a new template in the workspace
     *
     * @param name Template name (the extension can be omitted)
     * @returns Absolute path of the created file
     */
    async createWorkspaceTemplate(name: string): Promise<string> {
        const workspaceDir = this.getWorkspaceTemplatesDir();
        if (!workspaceDir) {
            throw new Error('No workspace is open');
        }

        return this.createTemplateIn(workspaceDir, name);
    }

    /**
     * Create a new template in the global location
     *
     * @param name Template name (the extension can be omitted)
     * @returns Absolute path of the created file
     */
    async createGlobalTemplate(name: string): Promise<string> {
        const globalDir = this.getGlobalTemplatesDir();
        if (!globalDir) {
            throw new Error('Global template directory is not available');
        }

        return this.createTemplateIn(globalDir, name);
    }

    /**
     * Create a new template in the given directory
     *
     * If there are no user-defined templates yet, the bundled templates are copied first.
     * Bundled templates appear in the list only "when neither the workspace nor the global location has any template",
     * so without copying them they would disappear from the list as soon as one template is created
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

        // The heading is also used as the display name in the list
        const label = path.basename(fileName, '.md');
        await fsPromises.writeFile(filePath, `# ${label}\n\n`, 'utf8');

        return filePath;
    }

    /**
     * Get the directory for the destination
     */
    private getTemplatesDirFor(target: PromptTemplateTarget): string | undefined {
        return target === 'global'
            ? this.getGlobalTemplatesDir()
            : this.getWorkspaceTemplatesDir();
    }

    /**
     * Whether there are no user-defined templates that would appear in the list
     *
     * Like `listTemplates()`, only enabled template sources are checked.
     * Files in disabled sources do not appear in the list, so counting them here
     * would skip copying the bundled templates and leave the list empty
     */
    private async hasNoUserTemplates(): Promise<boolean> {
        for (const source of this.getEnabledSourceDirs()) {
            if ((await this.readMarkdownFileNames(source.dir)).length > 0) {
                return false;
            }
        }

        return true;
    }

    /**
     * Convert a template name to a file name (adds .md if there is no extension)
     */
    private toTemplateFileName(name: string): string {
        return name.toLowerCase().endsWith('.md') ? name : `${name}.md`;
    }

    /**
     * Replace the template variables and build the string to insert
     *
     * The body is not modified (the H1 heading is kept as is)
     *
     * @param template Target template
     * @param currentFilePath Absolute path of the file open in the Editor View (undefined when no file is open)
     */
    renderTemplate(template: PromptTemplate, currentFilePath?: string): string {
        return this.templateService.renderVariables(
            template.body,
            this.buildVariables(currentFilePath)
        );
    }

    /**
     * Build the template variables used on insertion
     * File-related variables are empty strings when no file is open
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
     * Load the .md files directly under the given directory as templates
     * Returns an empty array if the directory does not exist
     *
     * Global templates get `(global)` in their description so they can be told apart from workspace ones
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
     * Get the .md file names directly under the given directory, sorted by file name in ascending order
     * Subdirectories are not traversed
     */
    private async readMarkdownFileNames(directoryPath: string): Promise<string[]> {
        let entries;
        try {
            entries = await fsPromises.readdir(directoryPath, { withFileTypes: true });
        } catch {
            // Treat a missing directory as having no templates
            return [];
        }

        return entries
            .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
            .map(entry => entry.name)
            .sort((a, b) => a.localeCompare(b));
    }

    /**
     * Extract the first H1 heading as the display name (undefined if there is none)
     * It is not removed from the body (the file content is used as is on insertion)
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
     * Check whether a path exists
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
