import * as path from 'path';
import * as fs from 'fs';

/**
 * .gitignore parser to extract file/directory exclusion patterns
 */
export class GitignoreParser {
    private patterns: string[] = [];
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Parse .gitignore file and extract exclusion patterns
     */
    async parse(): Promise<void> {
        const gitignorePath = path.join(this.workspaceRoot, '.gitignore');

        if (!fs.existsSync(gitignorePath)) {
            this.setDefaultPatterns();
            return;
        }

        try {
            const content = fs.readFileSync(gitignorePath, 'utf8');
            this.patterns = this.parseGitignoreContent(content);

            // Always add .git directory to exclusions
            if (!this.patterns.includes('.git')) {
                this.patterns.push('.git');
            }
        } catch (error) {
            console.error('Failed to parse .gitignore:', error);
            this.setDefaultPatterns();
        }
    }

    /**
     * Parse .gitignore content and extract patterns
     */
    private parseGitignoreContent(content: string): string[] {
        const patterns: string[] = [];
        const lines = content.split('\n');

        for (let line of lines) {
            // Remove comments and trim whitespace
            line = line.split('#')[0].trim();

            // Skip empty lines
            if (!line) {
                continue;
            }

            // Skip negation patterns (starting with !)
            if (line.startsWith('!')) {
                continue;
            }

            // Convert gitignore pattern to a format suitable for file watching
            const pattern = this.convertGitignorePattern(line);
            if (pattern) {
                patterns.push(pattern);
            }
        }

        return patterns;
    }

    /**
     * Convert .gitignore pattern to a format suitable for VSCode file watching
     */
    private convertGitignorePattern(pattern: string): string | null {
        // Remove leading slash
        if (pattern.startsWith('/')) {
            pattern = pattern.substring(1);
        }

        // Remove trailing slash (directories)
        if (pattern.endsWith('/')) {
            pattern = pattern.substring(0, pattern.length - 1);
        }

        // Handle wildcard patterns
        // For file watching, we want to exclude directories and files
        // Simple patterns like "node_modules" or "out" are most effective

        // Skip complex glob patterns for now (e.g., *.js, *.map)
        // These are better handled by VSCode's built-in file exclusion settings
        if (pattern.includes('*') || pattern.includes('?')) {
            // Only keep directory-level wildcards
            if (pattern.includes('/')) {
                return null;
            }
            // Skip file extension patterns
            if (pattern.startsWith('*.') || pattern.startsWith('.')) {
                return null;
            }
        }

        return pattern;
    }

    /**
     * Set default exclusion patterns when .gitignore is not available
     */
    private setDefaultPatterns(): void {
        this.patterns = [
            '.git',
            'node_modules',
            'out',
            'dist',
            '.vscode-test',
            'coverage',
            '.nyc_output'
        ];
    }

    /**
     * Get the list of exclusion patterns
     */
    getPatterns(): string[] {
        return this.patterns;
    }

    /**
     * Check if a given path should be excluded based on patterns
     */
    shouldExclude(filePath: string): boolean {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        const pathParts = relativePath.split(path.sep);

        for (const pattern of this.patterns) {
            // Check if any part of the path matches the pattern
            if (pathParts.some(part => part === pattern)) {
                return true;
            }

            // Check if the relative path starts with the pattern
            if (relativePath.startsWith(pattern)) {
                return true;
            }
        }

        return false;
    }
}
