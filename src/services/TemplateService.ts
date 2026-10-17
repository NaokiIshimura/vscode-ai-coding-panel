import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';

/**
 * Template variables
 */
export interface TemplateVariables {
    datetime: string;
    filename: string;
    timestamp: string;
    filepath: string;
    dirpath: string;
}

/**
 * Type of command sent from the Editor View
 */
export type SendCommandType = 'run' | 'plan' | 'spec';

/**
 * Heading of the sent history section
 */
export const SENT_HISTORY_HEADING = '## sent history';

/**
 * Labels for sent history lines (padded to the same width so the date/time starts at the same column)
 */
const SEND_HISTORY_LABELS: Record<SendCommandType, string> = {
    run: 'run ',
    plan: 'plan',
    spec: 'spec'
};

/**
 * Separator between the date/time and the resume command in a sent history line
 */
const SEND_HISTORY_SEPARATOR = '|';

/**
 * File name for session information (placed directly under the task directory)
 */
export const SESSION_METADATA_FILE_NAME = 'metadata.md';

/**
 * Heading of the session information file
 */
const SESSION_METADATA_TITLE = '# metadata';

/**
 * Heading of the session list section in the session information file
 */
export const SESSION_METADATA_HEADING = '## sessions';

/**
 * A single line of session information
 * Example: - 2026/10/17 18:54:39 | run  | 2026_1017_1854_39_PROMPT.md | claude --resume <uuid>
 */
const SESSION_METADATA_LINE_PATTERN = /^-\s+[^|]+\|\s*(run|plan|spec)\s*\|\s*([^|]+?)\s*\|\s*\S+\s+--resume\s+(\S+)\s*$/;

/**
 * Session ID (Claude Code UUID)
 */
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Determine whether the value is in the format accepted as a session ID (UUID)
 */
export function isValidSessionId(sessionId: string): boolean {
    return SESSION_ID_PATTERN.test(sessionId);
}

/**
 * Session to resume, read from the session information file
 */
export interface SessionMetadataEntry {
    /** Type of the command that was sent */
    commandType: SendCommandType;
    /** Name of the file that was sent (in the same directory as the session information file) */
    fileName: string;
    /** ID of the session to resume */
    sessionId: string;
}

/**
 * Find the range of the section that starts with the given heading
 *
 * The heading must match the whole line; the section runs up to (but not including) the next heading or horizontal rule (---)
 * @returns The line index of the heading and the line index where the section ends (exclusive)
 */
function findSectionRange(lines: string[], heading: string): { headingIndex: number; endIndex: number } | undefined {
    const headingIndex = lines.findIndex(line => line.trim() === heading);
    if (headingIndex === -1) {
        return undefined;
    }

    let endIndex = lines.length;
    for (let i = headingIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/^#{1,6}\s/.test(line) || line === '---') {
            endIndex = i;
            break;
        }
    }

    return { headingIndex, endIndex };
}

/**
 * Insert one line right after the last content line in the section
 */
function insertLineIntoSection(lines: string[], range: { headingIndex: number; endIndex: number }, line: string): string {
    // Skip trailing blank lines and insert right after the last content line in the section
    let insertIndex = range.endIndex;
    while (insertIndex > range.headingIndex + 1 && lines[insertIndex - 1].trim() === '') {
        insertIndex--;
    }

    lines.splice(insertIndex, 0, line);
    return lines.join('\n');
}

/**
 * Template generation service
 */
export class TemplateService {
    constructor(private context?: vscode.ExtensionContext) {}

    /**
     * Generate a JST timestamp (YYYY_MMDD_HHMM_SS format)
     */
    generateTimestamp(): string {
        const now = new Date();
        const year = String(now.getFullYear());
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');

        return `${year}_${month}${day}_${hour}${minute}_${second}`;
    }

    /**
     * Generate the date and time as a string (YYYY/MM/DD HH:MM:SS format)
     * Pass a date to use the same moment as the timestamp used for the file name
     */
    formatDateTime(date?: Date): string {
        const now = date ?? new Date();
        const year = String(now.getFullYear());
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');

        return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
    }

    /**
     * Generate template variables
     */
    generateTemplateVariables(
        targetPath: string,
        fileName: string,
        timestamp: string
    ): TemplateVariables {
        const filePath = path.join(targetPath, fileName);
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const relativeFilePath = workspaceRoot ? path.relative(workspaceRoot, filePath) : filePath;
        const relativeDirPath = workspaceRoot ? path.relative(workspaceRoot, targetPath) : targetPath;

        return {
            datetime: this.formatDateTime(),
            filename: fileName,
            timestamp: timestamp,
            filepath: relativeFilePath,
            dirpath: relativeDirPath
        };
    }

    /**
     * Load a template and replace its variables
     */
    async loadTemplate(variables: TemplateVariables, templateType: 'prompt' | 'task' | 'spec'): Promise<string> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceRoot) {
            return this.getDefaultTemplate(variables, templateType);
        }

        // Template file path in the workspace
        const templateFileName = `${templateType}.md`;
        const workspaceTemplatePath = path.join(workspaceRoot, '.vscode', 'templates', templateFileName);

        // Use the template in the workspace if it exists
        try {
            await fsPromises.access(workspaceTemplatePath);
            const templateContent = await fsPromises.readFile(workspaceTemplatePath, 'utf8');
            return this.replaceVariables(templateContent, variables);
        } catch (error) {
            // The file does not exist; go to the next step
        }

        // Use the template in the extension's templates folder
        if (this.context) {
            const extensionTemplatePath = path.join(this.context.extensionPath, 'templates', templateFileName);

            try {
                await fsPromises.access(extensionTemplatePath);
                const templateContent = await fsPromises.readFile(extensionTemplatePath, 'utf8');
                return this.replaceVariables(templateContent, variables);
            } catch (error) {
                // The file does not exist; go to the next step
            }
        }

        // Use the default template if no template is found
        return this.getDefaultTemplate(variables, templateType);
    }

    /**
     * Get the default template
     */
    private getDefaultTemplate(variables: TemplateVariables, templateType: string): string {
        const header = `---
working dir: ${variables.dirpath}
${templateType} file: ${variables.filename}
datetime   : ${variables.datetime}
---

`;

        return header;
    }

    /**
     * Replace template variables in an arbitrary string
     * Also used for content other than template files, such as inserting prompt templates
     */
    renderVariables(content: string, variables: TemplateVariables): string {
        return this.replaceVariables(content, variables);
    }

    /**
     * Replace variables in a template
     */
    private replaceVariables(template: string, variables: TemplateVariables): string {
        return template
            .replace(/\{\{datetime\}\}/g, variables.datetime)
            .replace(/\{\{filename\}\}/g, variables.filename)
            .replace(/\{\{timestamp\}\}/g, variables.timestamp)
            .replace(/\{\{filepath\}\}/g, variables.filepath)
            .replace(/\{\{dirpath\}\}/g, variables.dirpath);
    }

    /**
     * Generate the file name for a PROMPT file
     */
    generatePromptFileName(): string {
        const timestamp = this.generateTimestamp();
        return `${timestamp}_PROMPT.md`;
    }

    /**
     * Generate the file name for a TASK file
     */
    generateTaskFileName(): string {
        const timestamp = this.generateTimestamp();
        return `${timestamp}_TASK.md`;
    }

    /**
     * Generate the file name for a SPEC file
     */
    generateSpecFileName(): string {
        const timestamp = this.generateTimestamp();
        return `${timestamp}_SPEC.md`;
    }

    /**
     * Generate the file name for a QUICK_START file
     */
    generateQuickStartFileName(): string {
        const timestamp = this.generateTimestamp();
        return `${timestamp}_QUICK_START.md`;
    }

    /**
     * When creating a timestamp-named directory under the given directory,
     * append a sequential suffix (_2, _3, ...) if a directory with the same name already exists
     * to generate a directory path that does not collide
     */
    async generateUniqueDirectoryPath(parentPath: string): Promise<{ path: string; name: string }> {
        const baseName = this.generateTimestamp();
        let name = baseName;
        let dirPath = path.join(parentPath, name);
        let suffix = 2;

        while (await this.pathExists(dirPath)) {
            name = `${baseName}_${suffix}`;
            dirPath = path.join(parentPath, name);
            suffix++;
        }

        return { path: dirPath, name };
    }

    /**
     * Append a Spec / Plan / Run sent history line to the content
     *
     * Adds one line to the "## sent history" section at the end.
     * Creates the section at the end if it does not exist.
     *
     * @param content Content to append to
     * @param commandType Type of the command that was sent
     * @param dateTime Date and time to record (return value of formatDateTime())
     * @param resumeCommand Command to resume the sent session (e.g. claude --resume <uuid>)
     * @returns Content after appending
     */
    appendSendHistoryLine(
        content: string,
        commandType: SendCommandType,
        dateTime: string,
        resumeCommand?: string
    ): string {
        const suffix = resumeCommand ? ` ${SEND_HISTORY_SEPARATOR} ${resumeCommand}` : '';
        const historyLine = `- ${SEND_HISTORY_LABELS[commandType]}: ${dateTime}${suffix}`;
        const lines = content.split('\n');
        // The heading must match the whole line (to avoid appending to similar text in the body)
        const range = findSectionRange(lines, SENT_HISTORY_HEADING);

        if (!range) {
            // Create the section at the end if it does not exist
            const body = content.replace(/\s+$/, '');
            const prefix = body ? `${body}\n\n` : '';
            return `${prefix}${SENT_HISTORY_HEADING}\n${historyLine}\n`;
        }

        return insertLineIntoSection(lines, range, historyLine);
    }

    /**
     * Append one session line to the content of the session information file (metadata.md)
     *
     * Adds it to the end of the "## sessions" section. If the content is empty, creates it along with the heading;
     * if the section does not exist, creates it at the end.
     *
     * @param content Content to append to (empty string if the file does not exist)
     * @param commandType Type of the command that was sent
     * @param dateTime Date and time to record (return value of formatDateTime())
     * @param fileName Name of the file that was sent
     * @param resumeCommand Command to resume the sent session (e.g. claude --resume <uuid>)
     * @returns Content after appending
     */
    appendSessionMetadataLine(
        content: string,
        commandType: SendCommandType,
        dateTime: string,
        fileName: string,
        resumeCommand: string
    ): string {
        const sep = SEND_HISTORY_SEPARATOR;
        const line = `- ${dateTime} ${sep} ${SEND_HISTORY_LABELS[commandType]} ${sep} ${fileName} ${sep} ${resumeCommand}`;
        const body = content.replace(/\s+$/, '');

        if (!body) {
            return `${SESSION_METADATA_TITLE}\n\n${SESSION_METADATA_HEADING}\n${line}\n`;
        }

        const lines = content.split('\n');
        const range = findSectionRange(lines, SESSION_METADATA_HEADING);
        if (!range) {
            return `${body}\n\n${SESSION_METADATA_HEADING}\n${line}\n`;
        }

        return insertLineIntoSection(lines, range, line);
    }

    /**
     * Get the latest session from the content of the session information file (metadata.md)
     *
     * Returns the last valid line in the "## sessions" section.
     * The file can be edited by hand, so only session IDs in UUID format are accepted
     * (so that the recorded string is never sent to the shell as is)
     *
     * @param content Content of the session information file
     * @returns The latest session, or undefined if there is no valid line
     */
    findLatestSessionMetadata(content: string): SessionMetadataEntry | undefined {
        const lines = content.split('\n');
        const range = findSectionRange(lines, SESSION_METADATA_HEADING);
        if (!range) {
            return undefined;
        }

        for (let i = range.endIndex - 1; i > range.headingIndex; i--) {
            const match = SESSION_METADATA_LINE_PATTERN.exec(lines[i].trim());
            if (match && isValidSessionId(match[3])) {
                return {
                    commandType: match[1] as SendCommandType,
                    fileName: match[2],
                    sessionId: match[3]
                };
            }
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
