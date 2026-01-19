# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2026-01-19

### Improved
- **Terminal View Stability**: Significant improvements to terminal session management
  - Added session reconnection capability with "Reconnect" button displayed when session exits
  - Implemented automatic session cleanup on Webview reload to prevent state inconsistencies
  - Added session exit detection with exit code and signal logging
  - Improved resize handling with 200ms debouncing to reduce unnecessary operations
  - Optimized resize operations to skip duplicate size changes

### Changed
- **Terminal Environment Variables**: Safer environment variable handling
  - LANG now only set to default (`en_US.UTF-8`) when not already configured
  - LC_ALL no longer overridden, respecting user environment settings
  - TERM and COLORTERM explicitly set for better terminal compatibility

### Fixed
- **Terminal Error Messages**: Improved error reporting for node-pty initialization failures
  - Added `getUnavailableReason()` method for detailed error messages
  - Better user guidance when terminal service is unavailable

### Technical
- Added `ITerminalService.onSessionExit()` method for session lifecycle management
- Added `ITerminalService.getUnavailableReason()` for error diagnostics
- Refactored output listener setup into `_setupSessionOutput()` method for code reusability
- Improved terminal session state management with `isClosed` flag
- Enhanced PTY session cleanup on termination

## [0.8.45] - 2026-01-18

### Changed
- **Editor Settings**: Simplified default commands for Plan and Spec buttons
  - Removed `--permission-mode plan` flag from `aiCodingSidebar.editor.planCommand` default value
  - Removed `--permission-mode plan` flag from `aiCodingSidebar.editor.specCommand` default value
  - New default commands use `claude` instead of `claude --permission-mode plan`
  - Existing user configurations are not affected

## [0.8.44] - 2026-01-17

### Changed
- **VSCode Marketplace Metadata**: Enhanced package.json keywords and categories for better discoverability
  - Added category: "SCM Providers" (for Git integration features)
  - Added keywords: "ai-coding", "claude", "copilot", "sidebar", "panel", "file-browser", "task-management", "plans", "terminal", "editor", "markdown", "git", "ai-tools"
  - Improves search visibility and user reach on VSCode Marketplace

## [0.8.43] - 2026-01-17

### Changed
- **Documentation**: Updated README.md and README-JA.md version references from 0.8.42 to 0.8.43

## [0.8.42] - 2026-01-17

### Changed - BREAKING CHANGES
- **File/Class Naming**: Completed Tasks→Plans renaming throughout codebase
  - Renamed `TasksProvider.ts` → `PlansProvider.ts`
  - Renamed class `TasksProvider` → `PlansProvider`
  - **Action Required**: If you have custom keybindings or scripts referencing the old names, please update them

- **Command IDs - Breaking Change**: Updated command identifiers
  - `aiCodingSidebar.openTasksSettings` → `aiCodingSidebar.openPlansSettings`
  - `aiCodingSidebar.openTasksViewGuide` → `aiCodingSidebar.openPlansViewGuide`
  - **Action Required**: If you have keyboard shortcuts configured for these commands, update your keybindings.json

- **Configuration Keys - Breaking Change**: Renamed all configuration keys for consistency
  - `aiCodingSidebar.tasks.sortBy` → `aiCodingSidebar.plans.sortBy`
  - `aiCodingSidebar.tasks.sortOrder` → `aiCodingSidebar.plans.sortOrder`
  - **Action Required**: Update your settings.json to use the new configuration keys

- **Documentation**: Updated all documentation files to reflect Plans naming
  - Renamed `docs/tasks-view.md` → `docs/plans-view.md`
  - Updated getting-started.md, keyboard-shortcuts.md, CLAUDE.md
  - Updated README.md and README-JA.md template examples
  - Updated default template from `YYYY_MMDD_HHMM_SS_tasks.md` → `YYYY_MMDD_HHMM_SS_plans.md`

### Fixed
- **Configuration Loading**: Fixed settings path to correctly read `plans.defaultRelativePath` configuration
  - Updated ConfigurationProvider.ts to use `plans.defaultRelativePath` instead of `defaultRelativePath`
  - Updated extension.ts to properly read the Plans default path setting
  - Updated EditorProvider.ts to use correct configuration path
  - Updated workspaceSetup.ts to set correct configuration key
  - This fix ensures the "Ai Coding Sidebar › Plans: Default Relative Path" setting in VS Code settings UI is properly recognized

### Migration Guide
If you are upgrading from v0.8.33 or earlier:
1. Update keyboard shortcuts: Replace old command IDs with new ones in your keybindings.json
2. Update settings: Rename `aiCodingSidebar.tasks.*` to `aiCodingSidebar.plans.*` in your settings.json
3. No automatic migration is provided - manual updates are required

## [0.8.33] - 2026-01-17

### Changed
- **Documentation**: Updated documentation to fully reflect the "Plans" naming convention
  - Updated CLAUDE.md with new settings namespace (`plans.defaultRelativePath`, `plans.sortBy`, `plans.sortOrder`)
  - Updated README.md and README-JA.md to consistently use "Plans" instead of "Tasks"
  - Added `editor.planCommand` and `editor.specCommand` to settings documentation
  - Updated all VSIX version references from 0.8.32 to 0.8.33
  - Fixed default path examples from `.claude` to `.claude/plans`

## [0.8.32] - 2026-01-17

### Changed
- **View Name**: Renamed "Tasks" view to "Plans" throughout the extension
  - View title changed from "TASKS" to "PLANS"
  - Menu items updated to reflect new naming
  - Documentation and README updated to use "Plans" terminology
- **Settings Structure - Breaking Change**: Reorganized configuration keys under `plans` namespace
  - `aiCodingSidebar.defaultRelativePath` → `aiCodingSidebar.plans.defaultRelativePath`
  - `aiCodingSidebar.tasks.sortBy` → `aiCodingSidebar.plans.sortBy`
  - `aiCodingSidebar.tasks.sortOrder` → `aiCodingSidebar.plans.sortOrder`
  - Default path changed from `.claude/tasks` to `.claude/plans`
  - **Note**: Existing user settings will be reset to defaults (no automatic migration)
- **Settings Menu**: "Tasks Settings" renamed to "Plans Settings"
  - Now opens `aiCodingSidebar.plans` settings section directly
  - Consistent with new "Plans" naming convention

### Technical
- Updated 5 core files with settings key changes (18 total modifications)
- Modified TasksProvider.ts to use new settings namespace
- Updated ConfigurationProvider.ts for new configuration structure
- Changed workspace setup utilities to use new default paths

## [0.8.31] - 2026-01-10

### Improved
- **Editor View - Responsive Header Layout**: Enhanced button visibility in narrow view widths
  - File name now automatically truncates with ellipsis when space is limited
  - Buttons (Edit, Save, Spec, Plan, Run) remain fully visible at all times
  - File name prioritizes hiding over buttons when view width decreases
  - Improved flex layout prevents button overflow and ensures accessibility

### Technical
- Updated EditorProvider.ts CSS: removed `flex-wrap: wrap` from header
- Changed `.file-info` flex behavior to `flex: 1 1 0` for better shrinking
- Removed `min-width: 60px` from `#file-path` to allow complete hiding
- Added `overflow: hidden` to `.file-info` to prevent content overflow

## [0.8.30] - 2026-01-10

### Changed
- **Editor Commands - Plan Mode Integration**: Added `--permission-mode plan` option to default command templates
  - Plan Command now includes `--permission-mode plan` for explicit plan mode activation
  - Spec Command now includes `--permission-mode plan` for structured specification creation
  - Standardizes implementation planning workflow with Claude Code
  - Existing custom command configurations remain unaffected

### Technical
- Updated `aiCodingSidebar.editor.planCommand` default value in package.json
- Updated `aiCodingSidebar.editor.specCommand` default value in package.json

## [0.8.28] - 2026-01-09

### Improved
- **Terminal View - Button Simplification**: Streamlined terminal header buttons for better clarity
  - Renamed "Kill" button to "Close" for more intuitive terminology
  - Removed redundant "× Close" button from shortcut area
  - Single "Close" button now handles all tab closing operations
  - Cleaner UI with reduced button clutter

### Technical
- Removed `closeTab` message handler from TypeScript backend
- Updated HTML template: renamed Kill button to Close with updated title
- Removed "× Close" button element from shortcut bar
- Removed `btn-close-tab` event handler from JavaScript

## [0.8.27] - 2026-01-09

### Improved
- **Terminal View - Close Button Position**: Improved tab close button placement for better usability
  - Moved close button from individual tabs to the right end of the shortcut area
  - Close button (× Close) is now always visible and easily accessible
  - Single unified close button closes the active tab
  - Reduces UI clutter and improves consistency across tab states

### Technical
- Removed close button from individual tab elements in HTML template
- Repositioned close button as a direct child of shortcut bar using flexbox (`margin-left: auto`)
- Consolidated two close button event handlers into a single handler for `btn-close-tab`
- Simplified tab click event handler by removing close button detection logic

## [0.8.26] - 2026-01-08

### Added
- **Tasks View - Auto-file Selection**: Automatically selects and displays the oldest target file when navigating to a directory
  - Searches for TASK.md, PROMPT.md, or SPEC.md files (case-insensitive, including timestamped variants)
  - Selects the file with the oldest creation date
  - Opens the selected file in Editor View automatically
  - Works when clicking directories or navigating back with ".."
  - No action taken if no target files are found

### Technical
- Extended `IEditorProvider` interface with `showFile()` method
- Added `findOldestTargetFile()` method to `TasksProvider` for target file detection
- Enhanced `navigateToDirectory()` to trigger auto-file selection after directory navigation

## [0.8.25] - 2026-01-08

### Added
- **Tasks View - Directory Sort Settings**: Directories now respect sort settings alongside files
  - New settings `aiCodingSidebar.tasks.sortBy` and `aiCodingSidebar.tasks.sortOrder` replace `markdownList.*` settings
  - Directories can now be sorted by name, creation date, or modification date (previously name-only)
  - Both ascending and descending sort orders are supported
  - Default sort is by creation date (ascending), changed from name (ascending)

### Changed
- **Settings Rename**: More intuitive setting names for Tasks view
  - `aiCodingSidebar.markdownList.sortBy` → `aiCodingSidebar.tasks.sortBy`
  - `aiCodingSidebar.markdownList.sortOrder` → `aiCodingSidebar.tasks.sortOrder`
  - Old settings have been removed (no automatic migration)
- **Tasks Settings Menu**: Tasks Settings button now opens `aiCodingSidebar.tasks` settings directly
  - Previously opened all extension settings

### Technical
- Refactored sort logic to use a shared function for both directories and files
- Updated configuration monitoring to watch new setting names

## [0.8.24] - 2026-01-08

### Fixed
- **Terminal View - Japanese Character Encoding**: Fixed Japanese text garbling issue in terminal output
  - Explicitly sets UTF-8 locale environment variables (LANG, LC_ALL) when creating PTY process
  - Ensures proper character encoding for Japanese and other CJK languages
  - Falls back to user's existing locale settings if already configured
  - Improves international character support in terminal sessions

## [0.8.23] - 2026-01-08

### Added
- **Tasks View - Directory Creation Date Display**: Shows creation date for directories at root path
  - Displays creation date in YYYY-MM-DD format on the right side of directory names (as description)
  - Only applies to directories at the root path level (e.g., `.claude/tasks/`)
  - Subdirectories within do not show creation dates
  - Helps users quickly identify when task directories were created for better task management

## [0.8.22] - 2026-01-04

### Improved
- **Terminal View - New Terminal Button Placement**: Positioned New Terminal button (+) to the right of tabs
  - Uses `insertBefore` to insert tab elements before the button, ensuring button always appears on the right side
  - Automatically hides + button when maximum number of terminal tabs (5) is reached
  - Re-displays + button when a tab is closed and count drops below 5
  - Improved UI/UX consistency makes creating new terminals more intuitive

## [0.8.21] - 2026-01-03

### Improved
- **Terminal View - Auto-scroll Enhancement**: Enhanced automatic scroll-to-bottom behavior to prevent unintended position shifts
  - Uses `write()` callback to ensure scrolling happens after output is completely written
  - Double `requestAnimationFrame` for reliable DOM update synchronization
  - Maintains scroll position at bottom unless user manually scrolls up
  - Fixes scroll position issues during rapid output (e.g., npm install)

## [0.8.20] - 2026-01-03

### Changed
- **Editor View - Button Order**: Swapped the order of Plan and Spec buttons
  - Previous order: Edit, Save, Plan, Spec, Run
  - New order: Edit, Save, Spec, Plan, Run
  - Improves workflow by placing Spec button before Plan button

## [0.8.19] - 2026-01-02

### Added
- **Editor View - Edit in VS Code Button**: Added button to open markdown file in VS Code standard editor
  - Pencil icon (✏️) button placed left of Save button
  - Opens file in VS Code standard editor when clicked
  - Auto-saves unsaved changes before opening
  - Editor View becomes read-only when file is open in VS Code

### Changed
- **Editor View - Button UI**: Improved button design and consistency
  - Edit and Save buttons now show icons only (✏️ and 💾)
  - All buttons now have unified height with `line-height: 16px`
  - "Read-only" text changed to "Editing in VS Code"

### Improved
- **Editor View - Read-only Mode**: Enhanced read-only mode behavior and user experience
  - Read-only indicator now displays in top-right corner of editor area with fade-in/out animation
  - Edit button shows active state (highlighted background) when file is open in VS Code
  - Editor remains read-only while file tab is open in VS Code (not just when active)
  - Clicking read-only editor area focuses the file tab in VS Code
  - Real-time synchronization: changes saved in VS Code editor automatically reflect in Editor View

## [0.8.18] - 2026-01-02

### Fixed
- **Terminal View - Scroll Position**: Fixed scroll position jumping to top when resizing terminal view width
  - Now properly maintains scroll position at bottom when user is at bottom before resize
  - Uses `requestAnimationFrame` to ensure scroll adjustment happens after terminal fit operation completes
  - Improves user experience by keeping the latest output visible when adjusting sidebar width

## [0.8.17] - 2026-01-02

### Changed
- **Editor View - Run Command**: Updated default value of `aiCodingSidebar.editor.runCommand` setting
  - Old: `claude "${filePath}"`
  - New: `claude "Review the file at ${filePath}"`
  - Provides clearer context to Claude Code when reviewing files

## [0.8.16] - 2026-01-01

### Improved
- **Terminal View - Auto-scroll**: Automatically maintains scroll position at the bottom when new output arrives or when view is resized
  - Tracks scroll position for each terminal tab independently
  - Only auto-scrolls if the user is already at the bottom (preserves manual scroll position)
  - Restores auto-scroll when user clicks the "↓" scroll-to-bottom button
  - Improves user experience by keeping the latest output visible during long-running commands

## [0.8.15] - 2025-12-31

### Technical
- **Version Update**: Bumped version to 0.8.15
- **Documentation**: Updated version references in README files

## [0.8.12] - 2025-12-31

### Added
- **Tasks View - Insert Path Inline Buttons**: Added inline buttons to file rows for quick path insertion
  - "Insert Path to Editor" button (edit icon) inserts the file's relative path into the Editor view
  - "Insert Path to Terminal" button (terminal icon) inserts the file's relative path into the Terminal view
  - Buttons appear when hovering over file items in the Tasks view
  - Same functionality as the existing context menu options, now accessible with one click

## [0.8.11] - 2025-12-31

### Added
- **Editor View - Focus Indicator**: Shows a border around the Editor view when focused
  - Uses VSCode theme color `--vscode-focusBorder` for consistent appearance
  - Helps users identify which view currently has focus
- **Terminal View - Focus Indicator**: Shows a border around the Terminal view when focused
  - Same styling as Editor view for visual consistency

## [0.8.10] - 2025-12-31

### Added
- **Terminal View - Claude Code Shortcuts**: Added shortcut buttons for Claude Code commands
  - When Claude Code is not running: `claude`, `claude -c`, `claude -r` buttons
  - When Claude Code is running: `/compact`, `/clear` buttons
  - Toggle button (⇆) to manually switch between shortcut groups
- **Terminal View - Auto-detect Claude Code**: Automatically detects Claude Code start/exit from terminal output
  - Detects start patterns: `claude>` prompt, `╭─` UI element, `Entering interactive mode`, `Type /help`
  - Detects exit pattern: shell prompt (`$`, `%`, `#`) without "claude" in the line
  - Automatically switches shortcut buttons based on detected state
- **Terminal View - Smart Enter Key**: Sends Enter key only for shell commands
  - Shell commands: Sends command + newline
  - Claude Code commands: Sends command only (prevents unwanted newlines in Claude Code input)
  - Applied to both shortcut buttons and Editor Run command

### Changed
- **Terminal View - Header Layout**: Changed to 2-row header layout
  - Row 1: Tab bar, New tab button, Clear/Kill buttons
  - Row 2: Shortcut buttons for Claude Code

## [0.8.8] - 2025-12-31

### Changed
- **File Creation Button Icons**: Changed icons for file creation buttons to improve visual distinction
  - New PROMPT.md: Changed from `$(new-file)` to `$(comment-discussion)` (speech bubble icon)
  - New TASK.md: Changed from `$(new-file)` to `$(tasklist)` (task list icon)
  - New SPEC.md: Changed from `$(new-file)` to `$(file-code)` (code file icon)
  - Makes it easier to distinguish between different file creation actions

## [0.8.7] - 2025-12-31

### Changed
- **Command Rename**: Renamed "New .md" command to "New PROMPT.md" for clarity
- **Tasks View - Header Simplification**: Removed "New Directory" and "New PROMPT.md" buttons from the Tasks view title bar
  - These functions are now available as inline buttons in the path display row
  - Title bar now shows only: New Task, New Spec, Refresh, Settings

### Added
- **New File Commands**: Added "New TASK.md" and "New SPEC.md" commands
  - Create timestamped TASK.md or SPEC.md files in the current directory
  - Available from both Tasks path display row and Editor header
- **Tasks View - Path Display Inline Buttons**: Added inline action buttons to the path display row
  - New PROMPT.md, New TASK.md, New SPEC.md: Create new files
  - Copy, Rename: Manage the current directory (subdirectories only)
  - New Directory: Create new subdirectory
  - Archive: Archive the current directory (subdirectories only)
- **Editor View - New File Buttons**: Added "New TASK.md" and "New SPEC.md" buttons to the Editor view header
  - Create new file types directly from the Editor view
  - Supplements the existing "New PROMPT.md" button

## [0.8.6] - 2025-12-31

### Changed
- **Template Feature - Directory Path**: Changed template directory path from `.vscode/ai-coding-sidebar/templates` to `.vscode/ai-coding-panel/templates`
  - Aligns with the extension's renamed display name "AI Coding Panel"
  - All template references now use the new path

### Added
- **Template Feature - Multiple Templates**: Customize Template now creates 3 template files
  - `task.md` - Template for Start Task command
  - `spec.md` - Template for New Spec command
  - `prompt.md` - Template for New File (PROMPT.md) command
  - Previously only created a single `task.md` file
- **Template Feature - Explorer Reveal**: After creating templates, the templates directory is revealed in Explorer
  - Makes it easier to navigate and edit multiple template files

## [0.8.3] - 2025-12-31

### Added
- **Tasks View - Path Header Buttons**: Added Copy Relative Path and Rename buttons to the path display header
  - Copy Relative Path button copies the current directory path to clipboard
  - Rename button allows renaming the current directory inline
  - Both buttons appear next to the archive button in the path header

### Changed
- **Tasks View - Rename Navigation**: After renaming a directory, automatically navigates to the renamed directory
  - Previously stayed at the old (now invalid) path
  - Provides immediate feedback by showing the renamed directory contents

### Improved
- **Editor View - Auto-save**: Enhanced auto-save functionality to cover more scenarios
  - Now saves when webview is disposed (e.g., closing the sidebar)
  - Now saves when extension is deactivated (e.g., closing VS Code)
  - Added proper Disposable interface implementation for cleanup

## [0.8.2] - 2025-12-30

### Added
- **Terminal View - Auto-create Tab**: Automatically creates a new terminal tab when the last tab is closed
  - Ensures the terminal is always available by maintaining at least one tab
  - Provides seamless user experience without manually creating a new tab
- **Terminal View - Scroll to Bottom Button**: Added a floating button to scroll to the bottom of the terminal
  - Button appears in the bottom-right corner when scrolled up from the bottom
  - Clicking the button scrolls to the latest output and focuses the terminal
  - Button automatically hides when at the bottom of the terminal

## [0.8.1] - 2025-12-30

### Added
- **Terminal View - Unicode Support**: Added xterm-addon-unicode11 for proper CJK character width calculation
  - Japanese, Chinese, Korean and other Unicode characters now display correctly
  - Fixed character alignment issues in terminal output

### Improved
- **Terminal View - Layout**: Improved terminal sizing and fit behavior
  - Terminal now properly fills the view width
  - Fixed gap at bottom of terminal view
  - Improved initial terminal size calculation

### Changed
- **Terminal View - Scroll Behavior**: Removed auto-scroll to bottom feature
  - Terminal no longer auto-scrolls to bottom on new output
  - Users have full control over scroll position

## [0.8.0] - 2025-12-30

### Technical
- **Code Refactoring**: Split extension.ts into modular files for better maintainability
  - Created `src/providers/` directory with TasksProvider, EditorProvider, TerminalProvider, MenuProvider
  - Created `src/providers/items/` directory with FileItem, MenuItem TreeItem classes
  - Created `src/utils/` directory with fileUtils, templateUtils, workspaceSetup utilities
  - Reduced extension.ts from ~4,077 lines to ~1,377 lines
  - Used interface-based dependency injection (IEditorProvider, ITerminalProvider) to avoid circular references

### Changed
- **CLAUDE.md**: Updated documentation to reflect new modular architecture
- **README**: Reorganized documentation structure
  - Split Features section into summary table and detailed Feature Details section
  - Updated description to highlight benefits of the extension
  - Converted feature details to table format for better readability

## [0.7.38] - 2025-12-30

### Added
- **Editor View - Shortcuts Overlay**: Added persistent keyboard shortcuts display in the editor
  - Shows "Cmd+M / Ctrl+M - Create new markdown file" and "Cmd+R / Ctrl+R - Run task in terminal"
  - Displayed in bottom-right corner with semi-transparent overlay
  - Always visible during editing (does not interfere with text input)

### Changed
- **Editor View - Placeholder**: Changed placeholder text to "Enter prompt here..." for clearer purpose indication

## [0.7.37] - 2025-12-30

### Added
- **Terminal View - Multiple Tabs**: Added support for multiple terminal tabs
  - Create up to 5 terminal tabs, each with its own independent PTY session
  - Tab bar UI showing shell names with close buttons
  - "+" button to create new tabs
  - Click tabs to switch between sessions
  - "×" button to close individual tabs
  - Clear and Kill buttons operate on the active tab

## [0.7.36] - 2025-12-30

### Added
- **Tasks View - Path Header Archive Button**: Added archive button to the path display header when inside a non-root directory
  - Click to archive the current directory and automatically return to root
  - Provides quick access to archive functionality without navigating away

### Changed
- **UI Messages - English Localization**: Changed all user-facing messages to English
  - Error messages, success notifications, and dialog prompts are now in English
  - Affected files: extension.ts, FileOperationService.ts, ContextMenuManager.ts, DragDropHandler.ts, ClipboardManager.ts, ExplorerManager.ts, SearchService.ts

## [0.7.35] - 2025-12-30

### Changed
- **Editor View - Clear on Directory Navigation**: Editor view now clears file selection when navigating to a different directory in Tasks view
  - Previously, the selected file remained displayed even after moving to another directory
  - Now, the editor returns to unselected state when directory navigation occurs
  - Provides clearer user experience when browsing different directories

## [0.7.34] - 2025-12-29

### Added
- **Tasks View - Show in File List Button**: Restored "Show in File List" inline button for directories
  - Click to navigate to the directory and display its contents
  - Button displayed before the Archive button in the inline button group

### Changed
- **Editor View - Button Label**: Simplified "Create Markdown File" button label to "New .md"
  - More concise and technical label for markdown file creation

## [0.7.33] - 2025-12-29

### Fixed
- **Terminal View - Scroll Position on Resize**: Fixed scroll position jumping to top when view is resized
  - Previously, resizing the terminal view would move scroll position to the top
  - Now always scrolls to the bottom after resize for better user experience
  - Ensures latest terminal output is always visible after resizing

## [0.7.32] - 2025-12-29

### Added
- **Tasks View - Archive Inline Button**: Added Archive button directly in the directory row
  - Archive icon appears inline next to each directory in Tasks view
  - Quick access to archive functionality without right-click context menu
  - Removed "Show in Panel" inline button (archive is more frequently used)

## [0.7.31] - 2025-12-29

### Fixed
- **Start Task - File Naming Format**: Fixed filename format not matching the new format when creating files via Start Task
  - Start Task command was still using the old format `MMDD.HHMM.SS_PROMPT.md`
  - Now correctly uses the new format `YYYY_MMDD_HHMM_SS_PROMPT.md`
  - Unified file naming format across all file creation methods (Create Markdown File and Start Task)

## [0.7.30] - 2025-12-29

### Changed
- **File Naming Format**: Changed timestamp filename format for Create Markdown File
  - Previous format: `MMDD.HHMM.SS_PROMPT.md` (e.g., `1229.0619.38_PROMPT.md`)
  - New format: `YYYY_MMDD_HHMM_SS_PROMPT.md` (e.g., `2025_1229_0619_38_PROMPT.md`)
  - Added year prefix and unified separator to underscores

## [0.7.28] - 2025-12-29

### Changed
- **Settings - Run Command Default**: Changed default value of `editor.runCommand` setting
  - Previous default: `claude "read ${filePath} and save your report to the same directory as ${filePath}"`
  - New default: `claude "${filePath}"`
- **File Naming Format**: Changed filename format for Create Markdown File
  - Previous format: `YYYY_MMDD_HHMM_TASK.md` (e.g., `2025_1229_0619_TASK.md`)
  - New format: `MMDD.HHMM.SS_PROMPT.md` (e.g., `1229.0619.38_PROMPT.md`)
  - Now includes seconds for more precise timestamps

### Added
- **Template Variables**: Added new template variables for workspace-relative paths
  - `{{filepath}}`: File path relative to workspace root (e.g., `.claude/tasks/1229.0619.38_PROMPT.md`)
  - `{{dirpath}}`: Directory path relative to workspace root (e.g., `.claude/tasks`)

## [0.7.25] - 2025-12-29

### Changed
- **Tasks View - Start Task Behavior**: Changed directory creation location for Start Task
  - Previously: Always created under `defaultRelativePath` (default: `.claude/tasks`)
  - Now: Creates under the currently opened directory in Tasks View
  - Fallback: If current path cannot be retrieved, uses `defaultRelativePath` as before

### Added
- **Tasks View - New Directory Button**: Added "New Directory" button to Tasks View header
  - Click the folder icon to create a new directory under the current directory
  - Creates directory only (without Markdown file)
  - Header button order: Start Task -> New Directory -> New File -> Refresh -> Settings

## [0.7.24] - 2025-12-29

### Added
- **Tasks View - Insert Path to Editor**: Insert file/folder paths into the Editor view
  - Right-click files or folders in Tasks view and select "Insert Path to Editor"
  - Inserts the relative path at the cursor position in the Editor view
  - Supports multiple selection - all selected paths are inserted with newlines
  - Editor view is automatically focused after insertion
- **Tasks View - Insert Path to Terminal**: Insert file/folder paths into the Terminal view
  - Right-click files or folders in Tasks view and select "Insert Path to Terminal"
  - Inserts the relative path into the Terminal view
  - Supports multiple selection - paths are separated by spaces
  - Terminal is automatically started if not already running

## [0.7.23] - 2025-12-28

### Changed
- **Tasks View - Template Update**: Updated default task template
  - Added filename placeholder to template
  - Removed version section from template

## [0.7.20] - 2025-12-27

### Changed
- **Tasks View - Settings Integration**: Merged "Folder Tree Settings" and "Docs Settings" into a single "Tasks Settings"
  - Settings icon now opens all Tasks-related settings in one view
  - Simplified title menu with fewer icons
- **Tasks View - Menu Order**: Changed the order of title menu icons
  - New order: Start Task -> Create Markdown File -> Refresh -> Tasks Settings
  - Create Markdown File is now positioned next to Start Task for easier access

## [0.7.19] - 2025-12-27

### Changed
- **Tasks View - Title**: Changed title to fixed "TASKS" instead of dynamic "Tasks: path"
  - Path is now displayed as the first item in the list instead of in the title
  - At root directory: Shows path relative to project root (e.g., ".claude/tasks")
  - In subdirectories: Shows path relative to Tasks root (e.g., "v0.7.19")
- **Editor View - Run Focus**: Terminal view now receives focus when clicking the Run button
  - Previously, focus remained on the Editor view after running
  - Now automatically focuses the terminal for immediate interaction
- **Terminal View - Scroll Position**: Scroll position is now maintained at bottom when resizing
  - When the view is resized while scrolled to the bottom, it stays at the bottom
  - If scrolled up, the scroll position is preserved

## [0.7.18] - 2025-12-27

### Changed
- **Tasks View - Flat List Display**: Changed from tree view to flat list display
  - Shows only the contents of the current directory (no tree expansion)
  - Click a directory to navigate into it
  - Use ".." item to go back to the parent directory
  - Dynamic title shows the current path relative to root (e.g., "Tasks: subdir1/subdir2")
- **Start Task Command**: Now automatically navigates to the newly created directory
  - After creating a directory with Start Task, the view switches to show the new directory's contents
- **View Default Visibility**: Changed default visibility for views
  - Menu: Now collapsed by default
  - Terminal: Now visible by default (previously collapsed)

### Removed
- **Task Panel (Beta)**: Removed Task Panel feature entirely
  - Removed `TaskPanelManager` class and related functionality
  - Removed `aiCodingSidebar.taskPanel.enabled` setting
  - Removed `aiCodingSidebar.taskPanel.nonTaskFilePosition` setting
- **Active Panels View**: Removed Active Panels view from the sidebar
  - This view was used to manage open Task Panels
- **Menu View - Beta Features**: Removed Beta Features section from Menu view
- **Editor Setting**: Removed `aiCodingSidebar.editor.useTerminalView` setting
  - Run button now always sends commands to the Terminal view

## [0.7.17] - 2025-12-27

### Changed
- **Rename**: Changed extension display name from "AI Coding Sidebar" to "AI Coding Panel"
  - Updated activity bar title, settings title, status bar, and terminal name
  - Updated README and README-JA documentation
- **Tasks View - Directory Click Behavior**: Directory click behavior now depends on Task Panel setting
  - When `taskPanel.enabled: false`: Click to expand/collapse directories (standard behavior)
  - When `taskPanel.enabled: true`: Click to open Task Panel (previous behavior)

### Removed
- **Tasks View - Selected Label**: Removed "Selected" label display on directories
  - This was a legacy feature for Docs view integration that is no longer needed

## [0.7.16] - 2025-12-27

### Fixed
- **Terminal View**: Fixed terminal not displaying when installed from Marketplace
  - Added xterm.js library files to Git tracking (previously excluded by `.gitignore`)
  - Updated `.gitignore` to include `media/xterm/*.js` files in the VSIX package

## [0.7.15] - 2025-12-27

### Added
- **Terminal View - Session Persistence**: Terminal session and output history are now preserved when switching views or extensions
  - Added `retainContextWhenHidden: true` to Terminal view configuration
  - Terminal output buffer (xterm.js) is maintained when the view becomes hidden
  - No more loss of terminal history when focusing on other views or extensions

## [0.7.14] - 2025-12-27

### Added
- **Terminal View - Clickable Links**: URLs and file paths are now clickable in the terminal
  - URLs open in the default browser when clicked
  - File paths (e.g., `./src/file.ts:123`) open in the editor when clicked
  - Supports line number navigation for file paths
  - Uses xterm-addon-web-links for URL detection
  - Custom link provider for file path detection

## [0.7.13] - 2025-12-27

### Changed
- **Tasks View - Unified Hierarchical Display**: Merged Tasks and Docs views into a single hierarchical tree view
  - Directories now display both subdirectories and files in a tree structure
  - Files are sorted by creation date (ascending) by default within each directory
  - Removed the separate Docs view - all content is now in Tasks
  - Drag & Drop functionality moved to Tasks view
  - Simplified sidebar with fewer views for a cleaner interface

### Removed
- **Docs View**: Removed the separate Docs view
  - All file browsing functionality is now integrated into the Tasks view
  - File operations (create, rename, delete, copy) are available via context menu in Tasks

## [0.7.11] - 2025-12-27

### Fixed
- **Terminal View**: Fixed terminal not displaying content
  - Resolved CSS variable values before passing to xterm.js theme configuration
  - xterm.js now correctly receives actual color values instead of CSS variable strings

## [0.7.10] - 2025-12-27

### Added
- **Terminal View**: Embedded terminal in the sidebar using xterm.js and VSCode's built-in node-pty
  - Full PTY support for shell command execution
  - Controls: New terminal, Clear, and Kill buttons in the title bar
  - Default visibility: Collapsed (expand when needed)
  - Configurable settings:
    - `aiCodingSidebar.terminal.shell`: Shell executable path (default: system shell)
    - `aiCodingSidebar.terminal.fontSize`: Font size (default: 12)
    - `aiCodingSidebar.terminal.fontFamily`: Font family (default: monospace)
    - `aiCodingSidebar.terminal.cursorStyle`: Cursor style - block/underline/bar (default: block)
    - `aiCodingSidebar.terminal.cursorBlink`: Enable cursor blinking (default: true)
    - `aiCodingSidebar.terminal.scrollback`: Number of scrollback lines (default: 1000)
- **Editor View - Terminal Integration**: Run commands can be sent to the embedded Terminal view
  - Added `aiCodingSidebar.editor.useTerminalView` setting (default: true)
  - When enabled, Run button sends commands to Terminal view instead of VSCode's integrated terminal
  - When disabled, uses VSCode's integrated terminal as before

### Changed
- **Tasks View - Auto Focus**: Automatically focuses on Docs view when selecting a directory
  - Improves workflow by moving focus to the file list after directory selection

## [0.7.9] - 2025-12-27

### Changed
- **Active Panels View - Default Visibility**: Changed default visibility from "visible" to "collapsed"
  - Active Panels view is now collapsed by default when first opening the sidebar
  - Users can expand the view when needed to see the list of open Task Panels
  - Reduces visual clutter in the sidebar for users who don't frequently use Task Panels

## [0.7.8] - 2025-12-27

### Added
- **Menu - Shortcut**: Added "Duplicate Workspace in New Window" to the Shortcut section
  - Opens a copy of the current workspace in a new VSCode window
  - Uses VSCode's built-in `workbench.action.duplicateWorkspaceInNewWindow` command

## [0.7.6] - 2025-12-27

### Changed
- **Task Panel - Parent Directory Navigation**: Parent directory navigation is now restricted to the Tasks view root directory
  - Previously could navigate up to the workspace root
  - Now cannot navigate above the Tasks view root directory
  - Provides better scope control within the configured task directory

## [0.7.5] - 2025-12-26

### Added
- **Task Panel - Context Menu**: Added right-click context menu for directories in Docs section
  - "Open Task Panel": Opens a new Task Panel for the selected directory
  - "Archive": Moves the directory to the archived folder
  - Menu items only appear when right-clicking on directories (not files)

### Changed
- **Task Panel - Parent Directory Navigation**: Parent directory link ("..") is now always visible
  - Previously only shown after navigating into a subdirectory
  - Now displayed from the start when the parent directory is within the workspace
  - Cannot navigate above the workspace root

## [0.7.4] - 2025-12-25

### Added
- **Task Panel - File Icons**: Files in the Docs section now display icons based on their type
  - Markdown files show 📝, TASK files show ✏️
  - TypeScript/JavaScript, Python, JSON, and other file types have distinctive icons
  - Consistent with the Docs view in the sidebar

### Changed
- **Task Panel - Default Non-Task File Position**: Changed default value from `"below"` to `"beside"`
  - Non-task files now open to the right of the Task Panel by default
  - Previous behavior can be restored by setting `aiCodingSidebar.taskPanel.nonTaskFilePosition` to `"below"`
- **Task Panel - Terminal Working Directory**: Run button now opens terminals with the project root as the current working directory
  - Previously opened terminals in the file's parent directory
  - Ensures consistent command execution from the project root

## [0.7.3] - 2025-12-25

### Added
- **Task Panel - Non-Task File Position Setting**: Configure where non-task files open when clicked in Task Panel
  - Added `aiCodingSidebar.taskPanel.nonTaskFilePosition` setting with options:
    - `"below"` (default): Opens in an editor group below the Task Panel
    - `"beside"`: Opens in an editor group to the right of the Task Panel
  - Cmd/Ctrl+click always opens files to the right regardless of setting
  - Editor group reuse: Subsequent file clicks reuse the same editor group instead of creating new panes

## [0.7.2] - 2025-12-25

### Added
- **Task Panel - Active Panels View**: Lists all open Task Panels in the sidebar for easy navigation
  - Click to focus a panel
  - Right-click to close a panel (with unsave confirmation)
  - Shows unsaved indicator (●) for panels with pending changes
  - Automatically updates when directory changes in tasksViewPanel
  - Different icons distinguish panel types:
    - Tree icon: Opened by selecting a directory in Tasks view
    - Folder icon: Opened via "Open Task Panel" command

## [0.7.1] - 2025-12-25

### Added
- **Task Panel - Tab Icon Differentiation**: Different icons distinguish how the panel was opened
  - Tree icon: When opened by selecting a directory in Tasks view
  - Folder icon: When opened via "Open Task Panel" command
  - Added `tree-light.svg` and `tree-dark.svg` icon resources

### Changed
- **Rename**: Combined Panel renamed to Task Panel
  - `aiCodingSidebar.combinedPanel.enabled` -> `aiCodingSidebar.taskPanel.enabled`
  - "Open Combined Panel" -> "Open Task Panel"
  - "Combined Panel Settings" -> "Task Panel Settings"

### Fixed
- **Task Panel - Terminal Reuse**: Run button now reuses existing terminals instead of creating new ones each time
  - Searches for an existing terminal with the same name before creating a new one
  - Consistent behavior with Editor view's Run functionality
  - Prevents terminal clutter when running multiple tasks

## [0.7.0] - 2025-12-25

### Added
- **Combined Panel (Beta)**: Open Docs & Editor in the editor area
  - Added `aiCodingSidebar.combinedPanel.enabled` setting (default: false)
  - When enabled, selecting a directory in Tasks view opens the Combined Panel in the editor area
  - Combined Panel displays both Docs section (file list) and Editor section (markdown editor) side by side
  - Directory header shows relative path from Tasks view root
  - Navigate directories within the Combined Panel using the Docs section
  - Parent directory navigation with ".." entry (cannot navigate above Tasks view root)
  - Access via Menu > Beta Features > Open Combined Panel
  - Quick access to Combined Panel settings via Menu > Beta Features > Combined Panel Settings

### Changed
- **Menu View**: Added "Beta Features" section after "Note"
  - "Open Combined Panel" menu item
  - "Combined Panel Settings" menu item for quick access to Combined Panel configuration
- **Docs View**: Changed default visibility from "collapsed" to "visible"
- **Editor View**: Changed default visibility from "collapsed" to "visible"

## [0.6.6] - 2025-12-21

### Added
- **Editor View - Run Without File**: Execute tasks even when no markdown file is open
  - Added `aiCodingSidebar.editor.runCommandWithoutFile` setting
  - Use `${editorContent}` as placeholder for the editor content
  - Default command: `claude "${editorContent}"`
  - Allows running AI coding tasks directly from editor content without saving a file first
- **Editor View - Save Without File**: Create new files when saving without a file open
  - `Cmd+S` / `Ctrl+S` creates a new timestamped markdown file when no file is open
  - Saves to current Docs directory, or Tasks directory if no directory is selected
  - Provides seamless workflow for quick note-taking and task creation

### Fixed
- **Template Feature**: Fixed workspace template initialization issue

### Changed
- **Editor View - Placeholder**: Simplified editor placeholder text for cleaner UI

## [0.6.5] - 2025-12-21

### Changed
- **Template Feature - Template Path**: Changed workspace template path
  - Previous path: `.vscode/templates/file.md`
  - New path: `.vscode/ai-coding-sidebar/templates/task.md`
  - Template file renamed from `file.md` to `task.md`
  - Templates are now stored in extension-specific directory for better organization
- **Template Feature - Default Template**: Updated default template content
  - Simplified template structure with `file`, `created`, and `# task` sections
  - Removed `DEFAULT_TEMPLATE` constant, now reads directly from extension's `templates/task.md`

## [0.6.3] - 2025-12-21

### Changed
- **Docs View - Markdown Filename Format**: Changed timestamp-named markdown filename format
  - Previous format: `YYYY_MMDD_HHMM.md` (e.g., `2025_1103_1227.md`)
  - New format: `YYYY_MMDD_HHMM_TASK.md` (e.g., `2025_1103_1227_TASK.md`)
  - Files created via "Create Markdown File" button, `Cmd+M` / `Ctrl+M` shortcut, or "Start Task" now use the new naming convention
  - Editor view now recognizes and opens files with the new `_TASK.md` suffix
  - File icons in Docs view are updated to reflect the new pattern recognition

## [0.6.2] - 2025-12-20

### Changed
- **Docs View - Drag & Drop**: Changed file operation from move to copy
  - Files dragged within the Docs view are now copied instead of moved
  - External files dropped into the Docs view are also copied to the target directory
  - Displays a success message after copying (single file: "Copied: filename", multiple files: "Copied N files")
  - Provides better file management workflow with non-destructive copy operations

## [0.6.0] - 2025-11-30

### Added
- **Keyboard Shortcuts - Start Task**: Added `Cmd+S` / `Ctrl+S` keyboard shortcut to start a new task
  - Works when AI Coding Sidebar views (Tasks, Docs, Editor) are focused
  - Creates a new directory and timestamped markdown file for immediate task creation
  - Does not conflict with VSCode's save shortcut when sidebar is not focused
- **Keyboard Shortcuts - Create Markdown File**: Added `Cmd+M` / `Ctrl+M` keyboard shortcut to create new markdown file
  - Works when AI Coding Sidebar views (Tasks, Docs, Editor) are focused
  - Quickly creates a timestamped markdown file in the current directory
- **Menu - Keyboard Shortcut Notes**: Added shortcut descriptions to Menu > Note section
  - Shows "Start Task" shortcut (`Cmd+S` / `Ctrl+S`)
  - Shows "Create Markdown File" shortcut (`Cmd+M` / `Ctrl+M`)
  - Indicates shortcuts only work when sidebar is focused

## [0.5.9] - 2025-11-29

### Added
- **Editor View - Create Markdown File Button**: Added Create Markdown File button to Editor view title bar
  - Click the button to quickly create a new timestamped markdown file
  - Editor view is automatically focused after file creation for seamless workflow
- **Editor View - Keyboard Shortcut**: Added `Cmd+M` / `Ctrl+M` keyboard shortcut to create new markdown file
  - Works when Editor view is focused
  - Provides quick access to file creation without leaving the keyboard
  - Shortcut key descriptions added to placeholder text for discoverability

### Changed
- **GitHub Actions**: Refactored workflows into modular files
  - Split single release.yml into three separate workflows
  - `build-vsix.yml`: Reusable workflow for building VSIX package
  - `release-vsix.yml`: Upload VSIX to GitHub Release
  - `publish-marketplace.yml`: Publish to VS Code Marketplace

## [0.5.8] - 2025-11-22

### Added
- **Docs View - Settings Icon**: Added settings icon to Docs view title for quick access to sort configuration
  - Click the settings icon to open `Ai Coding Sidebar > Markdown List: Sort By` and `Ai Coding Sidebar > Markdown List: Sort Order` settings
  - Provides convenient access to customize file sorting preferences
- **Editor View - Settings Icon**: Added settings icon to Editor view title for quick access to run command configuration
  - Click the settings icon to open `Ai Coding Sidebar > Editor: Run Command` setting
  - Allows easy customization of the command executed by the Run button

## [0.5.7] - 2025-11-22

### Changed
- **Default Relative Path**: Changed default value from `.ai/tasks` to `.claude/tasks`
  - New installations will now use `.claude/tasks` as the default directory
  - Aligns with common AI coding tool conventions
  - Existing installations are not affected unless settings are reset

## [0.5.6] - 2025-11-21

### Added
- **Tasks View - Archive Feature**: Archive task directories to keep your workspace organized
  - Right-click a directory in Tasks view and select "Archive" to move it to the `archived` folder
  - The `archived` folder is automatically created in the default tasks path root if it doesn't exist
  - If a directory with the same name already exists in the archived folder, a timestamp is automatically added to avoid conflicts (format: `directoryname_YYYYMMDD_HHMMSS`)
  - Success messages inform you when directories are archived, including when names are modified due to conflicts
  - Helps maintain a clean workspace by moving completed or inactive tasks out of the main view while preserving history

## [0.5.5] - 2025-11-15

### Added
- **Editor View - Customizable Run Command**: Configure the command executed by the Run button
  - Added `aiCodingSidebar.editor.runCommand` setting
  - Use `${filePath}` as placeholder for the file path
  - Default command: `claude "read ${filePath} and save your report to the same directory as ${filePath}"`
  - Allows customization of the Run button behavior to fit your AI coding workflow

### Improved
- **Docs View - Auto-refresh**: Improved file change detection
  - Removed .gitignore-based file exclusion to ensure all files are monitored
  - Files in `.claude`, `.ai`, `.cline`, `.roo`, `.cursor`, `.copilot` directories are now properly detected
  - Automatically updates the file list when files are created, modified, or deleted in the current directory
  - No need to manually click the Refresh button anymore

## [0.5.4] - 2025-11-15

### Fixed
- **Editor View - Run Button**: Fixed extra newline issue when sending commands to terminal
  - Commands are now trimmed to remove any whitespace or newline characters
  - Added explicit command execution parameter to ensure immediate execution
  - Prevents unintended newlines in terminal when running tasks with Claude Code

## [0.5.3] - 2025-11-13

### Removed
- **File Changes View**: Removed the File Changes view from the sidebar
  - Removed `gitChanges` view definition from package.json
  - Removed `openGitFile`, `showGitDiff`, and `refreshGitChanges` commands
  - Removed Git-related menu items and view refresh button
  - Removed GitChangesProvider, GitFileItem, GitChange, and GitHeadContentProvider classes from extension.ts
  - Simplified the extension by removing ~520 lines of code
  - Users can still use VS Code's built-in Source Control view for Git operations

## [0.5.2] - 2025-11-13

### Added
- **Editor View - Auto-save**: Implemented automatic saving of edited content
  - Auto-saves when switching to another extension or sidebar view
  - Auto-saves before switching to a different file in Docs view
  - Restores the editing file when returning from another extension
  - Prevents data loss when navigating away from the Editor view
  - Maintains a seamless editing experience across extension switches

## [0.5.1] - 2025-11-13

### Added
- **Editor View - Run Button**: Added Run button to execute tasks directly from the Editor
  - Click the Run button to send `claude "read <file>"` command to the "AI Coding Sidebar" terminal
  - Automatically saves the file before running if there are unsaved changes
  - Commands are always sent to the dedicated "AI Coding Sidebar" terminal (creates it if it doesn't exist)
  - Button is positioned on the right side of the Editor header
  - Displays tooltip "Run task (Cmd+R / Ctrl+R)" on hover
- **Editor View - Keyboard Shortcut**: Added `Cmd+R` / `Ctrl+R` keyboard shortcut to run tasks
  - Same functionality as clicking the Run button
  - Auto-saves before running to ensure the latest content is used
  - Provides a quick way to send files to Claude without leaving the keyboard

### Changed
- **Editor View - UI Simplification**: Removed "Cmd+S / Ctrl+S to save" hint text
  - Cleaned up the Editor header for a simpler interface
  - Save functionality still works with the keyboard shortcut

## [0.5.0] - 2025-11-11

### Changed
- **View Names**: Renamed all views for better clarity and consistency
  - "Settings" -> "Menu": More accurately reflects the menu-style navigation
  - "Directory List" -> "Tasks": Better represents the task-oriented workflow
  - "Markdown List" -> "Docs": Clearer indication of documentation/file management
  - "Markdown Editor" -> "Editor": Simplified and more concise
- **Docs View - File Display**: Removed markdown-only filter to display all file types
  - Previously only showed `.md` files
  - Now displays all files in the selected directory
  - Provides more flexibility in managing different file types

### Added
- **Loading Indicators**: Added loader display for all views during initial content load
  - Menu view shows loading state on first display
  - Tasks view shows loading state on first display
  - Docs view shows loading state on first display
  - Editor view shows loading state on first display
  - File Changes view shows loading state on first display
  - Improves user experience by providing visual feedback during initialization

### Removed
- **Unused Settings**: Cleaned up configuration properties
  - Removed `sortBy`, `sortOrder`, `showHidden`, `viewMode`, `autoRefresh`, `showFileIcons`
  - Kept only actively used settings: `defaultRelativePath`, `markdownList.sortBy`, `markdownList.sortOrder`
  - Simplifies configuration and reduces maintenance overhead

### Technical
- Renamed all provider classes and variables for consistency with new view names
  - `WorkspaceSettingsProvider` -> `MenuProvider`
  - `AiCodingSidebarProvider` -> `TasksProvider`
  - `AiCodingSidebarDetailsProvider` -> `DocsProvider`
  - `MarkdownEditorProvider` -> `EditorProvider`

## [0.4.9] - 2025-11-10

### Added
- **GitignoreParser Service**: Parse .gitignore file to automatically exclude files and directories from file watching
  - Respects project-specific .gitignore patterns
  - Always excludes `.git` directory to prevent circular updates
  - Falls back to sensible defaults when .gitignore is not found
  - Reduces file change events for large directories like `node_modules`, `out`, `dist`
- **Git Status Caching**: Implement 5-second cache for git status results
  - Eliminates redundant git status executions within cache window
  - Up to 80% reduction in git status calls during active development
  - Maintains data freshness with reasonable cache duration
- **Git Operation Throttling**: Prevent concurrent git status executions
  - Returns cached results when git operation is already in progress
  - Reduces git lock contention and prevents command queue buildup

### Changed
- **File Changes View - Debounce Time**: Extended from 1500ms to 2500ms
  - Groups more file changes into single refresh operation
  - Reduces refresh frequency during continuous development
  - Better handles build and compilation operations
- **File Changes View - Visibility Optimization**: Complete monitoring stop when view is hidden
  - Zero CPU usage when File Changes view is not visible
  - Cancels pending refreshes when view becomes hidden
  - Triggers immediate refresh when view becomes visible
  - Improves battery life on laptops

### Performance
- **CPU Usage**: 70-90% reduction for File Changes view operations
- **Git Commands**: Up to 80% reduction in git status executions
- **Background Activity**: Zero CPU usage when view is hidden
- **Build Operations**: Minimal performance impact during compilations

### Technical
- New file: `src/services/GitignoreParser.ts` for .gitignore parsing
- Modified: `src/services/FileWatcherService.ts` to filter excluded files
- Modified: `src/extension.ts` GitChangesProvider with caching and throttling

## [0.4.8] - 2025-11-10

### Changed
- **Start Task Command**: Renamed "Create Task" to "Start Task" and changed icon to rocket
  - Creates a new directory under the default path and automatically generates a timestamped Markdown file
  - The created file is automatically selected in Markdown List with "editing" label
  - The file opens in Markdown Editor View for immediate editing
  - Provides a streamlined workflow for starting new tasks
- **Add Directory Behavior**: Changed to create directories under the currently selected directory instead of the root path
  - Right-click menu "New Directory" now creates subdirectories in the selected location
  - Allows for better organization and nested directory structures

## [0.4.6] - 2025-11-09

### Added
- **Markdown List - Configurable Sort Order**: Added settings to customize how markdown files are sorted
  - New setting `aiCodingSidebar.markdownList.sortBy`: Choose sort criteria (name, created, modified)
  - New setting `aiCodingSidebar.markdownList.sortOrder`: Choose sort direction (ascending, descending)
  - Settings changes are reflected in real-time without requiring refresh
- **Markdown List - Sort Order Display**: Current sort order is now displayed in the view title
  - Shows sort criteria and direction (e.g., "Markdown List (Created )")
  - Updates automatically when settings change
  - Makes it clear how files are currently sorted

### Changed
- **Markdown List - Default Sort Order**: Changed default file sort order from name (ascending) to creation date (ascending)
  - Files are now sorted by creation date in ascending order by default
  - Timestamp-named files (e.g., `2025_1109_1230.md`) naturally appear in chronological order
  - Previous behavior (sort by name) can be restored by changing `aiCodingSidebar.markdownList.sortBy` to "name"

## [0.4.5] - 2025-11-09

### Fixed
- **Markdown Editor State Persistence**: Fixed issue where Markdown Editor loses file state when extension becomes inactive/active
  - Previously, when the extension sidebar became inactive and then active again, the Markdown Editor would show empty content
  - Added `retainContextWhenHidden: true` to markdownEditor view configuration to preserve webview context when hidden
  - Added `onDidChangeVisibility` listener to restore file content when view becomes visible
  - Added webview ready message handling to ensure file restoration after webview initialization
  - Now, the previously selected file is automatically restored when the extension becomes active
  - Maintains seamless editing experience across extension lifecycle changes

## [0.4.4] - 2025-11-09

### Changed
- **View Titles Simplification**: Simplified all view titles for cleaner UI
  - Directory List: Removed relative path from title, now shows only "Directory List"
  - Markdown List: Removed relative path from title, now shows only "Markdown List"
  - Provides consistent and simpler interface across all views
- **Markdown List - Directory Header**: Added directory name display at the top of file list
  - Shows the current directory path relative to Directory List root
  - Similar to Markdown Editor's filename display for consistency
  - Makes it clear which directory you're browsing without cluttering the title
- **Markdown List - Editing File Indicator**: Added "editing" indicator for files being edited in Markdown Editor
  - Files currently being edited in Markdown Editor View now show "editing" in their description
  - Automatically updates when switching files without manual refresh
  - Makes it easier to identify which file is actively being edited in the sidebar
- **Markdown Editor - Title Display**: Simplified title to show only the filename
  - Previously showed the full relative path from project root
  - Now displays only the filename for cleaner UI
- **Markdown Editor - Auto-clear on Folder Switch**: Editor now clears when switching folders in Markdown List
  - Prevents confusion by not showing files from previous folders
  - Automatically resets editor state when navigating to different directories
- **Directory List - Add Directory Behavior**: "Add Directory" command now always creates directories in the Directory List root
  - Previously created directories under the selected directory when invoked from context menu
  - Now consistently creates directories in the Directory List's root directory regardless of how the command is invoked
  - Provides more predictable behavior for directory creation

## [0.4.3] - 2025-11-09

### Changed
- **Directory List Auto-Selection**: Newly created directories are now automatically selected in Directory List view
  - When creating a directory via "Add Directory" command, the new directory is immediately selected
  - Provides better visual feedback and easier navigation after directory creation
- **Markdown File Icon**: Markdown files in Markdown List view now display different icons based on how they open
  - Timestamp-named files (format: `YYYY_MMDD_HHMM.md`) that open in Markdown Editor View display edit icon
  - Other markdown files that open in standard editor display markdown icon
  - Makes it clearer which files can be edited directly in the sidebar versus standard editor

## [0.4.2] - 2025-11-08

### Changed
- **Markdown List View Behavior**: Markdown files now open conditionally based on filename format
  - Timestamp-named files (format: `YYYY_MMDD_HHMM.md`) open in Markdown Editor View
  - Other Markdown files open in the standard VSCode editor
  - Provides more flexible file editing options based on file naming conventions

## [0.4.1] - 2025-11-08

### Changed
- **Markdown File Creation**: Created Markdown files now open in Markdown Editor View instead of text editor
  - Applies to both "Create Markdown File" command and "Add Directory" command
  - Provides a more integrated experience when creating files from Markdown List
  - When creating a new directory, the auto-created markdown file also opens in Markdown Editor View
  - Automatically displays the file content in the sidebar's Markdown Editor View

## [0.4.0] - 2025-11-08

### Added
- **Rename Directory**: Added "Rename Directory" context menu item to Directory List view
  - Right-click on any directory in Directory List to rename it
  - Validates directory names and prevents invalid characters
  - Updates both Directory List and Markdown List views after renaming

### Changed
- **Terminology Update**: Updated all "Folder" references to "Directory" for consistency
  - Command names: `addFolder` -> `addDirectory`, `deleteFolder` -> `deleteDirectory`
  - Menu labels: "Add Folder" -> "Add Directory", "Delete Folder" -> "Delete Directory"
  - Function names and internal references updated throughout the codebase

## [0.3.7] - 2025-11-08

### Added
- **Markdown Editor View**: Added a new sidebar view for editing Markdown files directly in the extension
  - Automatically displays when selecting a Markdown file in Markdown List
  - Edit Markdown content in a dedicated textarea editor
  - Save files with `Cmd+S` / `Ctrl+S` keyboard shortcut
  - Shows the file path in the header for context
  - Positioned below Markdown List for easy access
  - Provides a seamless workflow for editing AI coding instructions without leaving the sidebar
  - **Read-only Mode**: Automatically switches to read-only mode when the file is active in VSCode editor
    - Prevents conflicts between simultaneous edits in editor and sidebar
    - Displays "Read-only" indicator when the file is active in VSCode editor
    - Dynamically toggles between editable and read-only based on active editor state
    - Shows unsaved changes indicator when content is modified
    - Displays relative path from project root for context
  - **Context Menu Integration**: Added context menu items for enhanced workflow
    - "Open in Editor" menu item in Markdown List view to open files in VSCode editor
    - "Copy Relative Path" menu item in both Markdown List and Markdown Editor views

## [0.3.6] - 2025-11-08

### Fixed
- **Markdown List Refresh**: Fixed refresh button not updating file list in Markdown List view
  - The refresh command now properly refreshes both Directory List and Markdown List views
  - Resolved issue where clicking the refresh button in Markdown List view had no effect
- **Auto-Refresh on File System Changes**: Fixed file system watcher not activating on initial load
  - File watcher listeners are now registered in provider constructors instead of during setup
  - Views now automatically reflect external file/directory additions and deletions (via Explorer, terminal, etc.)
  - Both Directory List and Markdown List views update automatically when files are changed outside the extension
- **View Updates After Extension Commands**: Improved view refresh behavior after file operations
  - Create Markdown File command now refreshes both Directory List and Markdown List views
  - Rename command now refreshes both views to reflect directory structure changes

### Added
- **Auto-Create Markdown File in New Directory**: Add Directory command now automatically creates a timestamped markdown file
  - After creating a new directory, a markdown file is automatically created inside it
  - The file is automatically opened in the editor for immediate use
  - Provides a seamless workflow for organizing AI coding tasks

### Changed
- **Default Relative Path**: Changed default value from empty string to ".ai/tasks"
  - New installations will automatically open the ".ai/tasks" directory by default
  - Provides better out-of-box experience for AI coding workflows
- **Command Name Update**: Renamed "Add Folder" to "Add Directory" for consistency
- **Timestamp Locale**: Changed timestamp format to use system locale instead of hard-coded Japanese format
  - Markdown file creation now uses `toLocaleString()` to respect user's system locale settings
  - Improves internationalization support

## [0.3.5] - 2025-11-08

### Added
- **Shortcut Menu in Settings View**: Added a new "Shortcut" section in the Settings view for quick access to common actions
  - **Open Terminal**: Quickly toggle the integrated terminal in VS Code with a status message
  - **Checkout Default Branch**: Automatically switch to the default branch (main/master/develop) with intelligent detection
  - **Git Pull**: Pull the latest changes from the remote repository with progress feedback
  - The Shortcut menu provides a centralized location for frequently used Git and workspace actions
  - Positioned between Workspace and Note sections in the Settings view


## [0.3.4] - 2025-01-08

### Added
- **Checkout Branch from Directory**: Added context menu item to checkout git branches using directory names
  - Right-click any directory in Directory List to access "Checkout Branch" menu
  - Automatically uses the directory name as the branch name
  - Validates the directory name for git branch compatibility
  - Creates the branch using VS Code's Git extension if it doesn't exist
  - Switches to the branch if it already exists
  - Displays appropriate messages for both creation and switching scenarios

## [0.3.3] - 2025-01-13

### Changed
- **Directory List View Enhancement**: The opened directory is now displayed as a root node in the tree view
  - Previously: Only the contents of the directory were shown (e.g., `commands`, `tasks`)
  - Now: The directory itself is shown as a parent node with its contents nested underneath (e.g., `.claude` -> `commands`, `tasks`)
  - Provides better visual context and hierarchy understanding
  - The root node displays the project-relative path and is expanded by default

## [0.3.2] - 2025-01-13

### Changed
- **View Title Enhancement**: Updated Directory List and Markdown List view titles to display project-relative paths instead of just folder names
  - Directory List now shows: `Directory List - <relative-path>` (e.g., `Directory List - .claude`, `Directory List - src`)
  - Markdown List now shows: `Markdown List - <relative-path>` (e.g., `Markdown List - .claude`, `Markdown List - src`)
  - Root directory displays as `.` for clarity
- **File Changes View**: Set default visibility to "collapsed" to reduce UI clutter on extension load

## [0.3.1] - 2025-01-13

### Added
- **Keyboard Shortcut**: Added `Cmd+Shift+A` (macOS) / `Ctrl+Shift+A` (Windows/Linux) to quickly focus the AI Coding Sidebar
- **Settings View Enhancement**: Added "Note" section in Settings view displaying keyboard shortcuts
- **Directory Creation Helper**: When the configured default relative path does not exist, a "Create directory" button is now displayed in Directory List
  - Click the button to create the directory automatically
  - The directory is created recursively if parent directories don't exist
  - After creation, the directory contents are displayed immediately

### Changed
- **Directory List Behavior**: Instead of falling back to workspace root when the default path doesn't exist, the extension now prompts users to create the missing directory

## [0.3.0] - 2025-01-12

### Removed
- **Workspace Explorer View**: Removed the redundant workspace explorer view to simplify the extension
  - Removed `workspaceExplorer` view definition
  - Removed copy/cut/paste/searchInWorkspace commands that were only used by this view
  - Removed all menu items and keybindings associated with the workspace explorer
  - Removed WorkspaceExplorerProvider class (374 lines)
  - **Code reduction**: 687 lines removed
  - Core features (Directory List, Markdown List, File Changes) remain unchanged

## [0.2.6] - 2025-01-11

### Changed
- **Error Message Internationalization**: Converted remaining Japanese error messages to English
  - ContextMenuManager operation failure messages
  - DragDropHandler file operation error messages
  - KeyboardShortcutHandler operation failure messages

## [0.2.5] - 2025-01-11

### Changed
- **UI Internationalization**: Converted all user-facing messages from Japanese to English
  - Information, error, and warning messages
  - Input prompts, quick picks, and confirmation dialogs
  - Tooltips, status bar, and settings labels
  - View titles (Directory List, Markdown List, Explorer)

## [0.1.0] - 2025-01-11

### Added
- **Workspace Explorer**: New view displaying the entire project in tree format
- **File Icon Display**: Automatically displays 50+ icons based on file type
  - Supports major formats: TypeScript, JavaScript, JSON, Markdown, CSS, HTML, image files, etc.
  - Toggle icon display with `fileListExtension.showFileIcons` setting
- **Sort Functionality**: Sort by name, type, size, or modified time
  - Select sort criteria with `fileListExtension.sortBy` setting
  - Choose ascending/descending order with `fileListExtension.sortOrder` setting
- **Hidden Files Display**: Toggle display of hidden files and folders
  - Controlled by `fileListExtension.showHidden` setting
- **Auto-refresh Settings**: Enable/disable auto-refresh on file system changes
  - Controlled by `fileListExtension.autoRefresh` setting
  - Can be disabled for performance optimization in large projects
- **File Operations**:
  - Move files and folders via drag & drop
  - Copy, cut, paste functionality (keyboard shortcuts: Ctrl+C/X/V, Cmd+C/X/V)
  - Rename (F2 key support)
  - Delete (Delete key support)
- **Search Functionality**: Search files within workspace
- **Git Changed Files**: List modified files and review diffs
  - Files grouped by directory

### Improved
- **Performance Optimization**: Implemented caching functionality
  - Added caching to FileListProvider, FileDetailsProvider, and WorkspaceExplorerProvider
  - Reduced unnecessary directory reads
  - Improved performance for large projects
- **Configuration Management**: Implemented ConfigurationProvider service
  - Centralized management of all settings
  - Settings change monitoring functionality
- **Service-Oriented Architecture**:
  - FileOperationService: Centralized file operations management
  - SearchService: Provides search functionality
  - DragDropHandler: Manages drag & drop processing

### Changed
- **Documentation**: Major update to README.md
  - Organized features by category (display features, file operations, customization features)
  - Added detailed settings section
  - Documented all setting items with descriptions and default values
  - Added JSON code examples for settings

### Fixed
- Fixed `modifiedDate` property reference error during file name sorting (unified to `modified`)

## [0.0.1] - 2024-09-27

### Added
- Initial release
- **Folder Tree Pane**: Display folders only and navigate hierarchical structure
- **File List Pane**: Display files and subfolders within selected folder
- **Relative Path Settings**: Specify default folder with relative path from workspace root
- **Navigate to Parent Folder**: Easily move to upper folder from file list pane
- **Copy Relative Path**: Right-click file to copy relative path from workspace to clipboard
- **Create Files and Folders**: Easily create new files and folders
- **Template Feature**: Customize initial file content with `templates/file.md`
- **Workspace Settings**: Easily create and edit `.vscode/settings.json`
- **Automated Build & Release**: Automated build and release via GitHub Actions

[0.8.20]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.19...v0.8.20
[0.8.19]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.18...v0.8.19
[0.8.18]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.17...v0.8.18
[0.8.17]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.16...v0.8.17
[0.8.16]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.15...v0.8.16
[0.8.15]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.12...v0.8.15
[0.8.12]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.11...v0.8.12
[0.8.11]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.10...v0.8.11
[0.8.10]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.8...v0.8.10
[0.8.8]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.7...v0.8.8
[0.8.7]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.6...v0.8.7
[0.8.6]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.5...v0.8.6
[0.8.5]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.4...v0.8.5
[0.8.4]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.3...v0.8.4
[0.8.3]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.38...v0.8.0
[0.7.38]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.37...v0.7.38
[0.7.37]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.36...v0.7.37
[0.7.36]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.35...v0.7.36
[0.7.35]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.34...v0.7.35
[0.7.34]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.33...v0.7.34
[0.7.33]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.32...v0.7.33
[0.7.32]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.31...v0.7.32
[0.7.31]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.30...v0.7.31
[0.7.30]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.28...v0.7.30
[0.7.28]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.25...v0.7.28
[0.7.25]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.24...v0.7.25
[0.7.24]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.23...v0.7.24
[0.7.23]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.20...v0.7.23
[0.7.20]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.19...v0.7.20
[0.7.19]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.18...v0.7.19
[0.7.18]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.17...v0.7.18
[0.7.17]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.16...v0.7.17
[0.7.16]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.15...v0.7.16
[0.7.15]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.14...v0.7.15
[0.7.14]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.13...v0.7.14
[0.7.13]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.11...v0.7.13
[0.7.11]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.10...v0.7.11
[0.7.10]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.9...v0.7.10
[0.7.9]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.8...v0.7.9
[0.7.8]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.6...v0.7.8
[0.7.6]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.5...v0.7.6
[0.7.5]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.4...v0.7.5
[0.7.4]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.3...v0.7.4
[0.7.3]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.6.6...v0.7.0
[0.6.6]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.6.5...v0.6.6
[0.6.5]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.6.3...v0.6.5
[0.6.3]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.6.2...v0.6.3
[0.6.2]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.6.0...v0.6.2
[0.6.0]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.5.9...v0.6.0
[0.5.9]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.5.8...v0.5.9
[0.5.8]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.5.7...v0.5.8
[0.5.7]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.5.6...v0.5.7
[0.5.6]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.5.5...v0.5.6
[0.5.5]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.5.4...v0.5.5
[0.5.4]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.4.9...v0.5.0
[0.4.9]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.4.8...v0.4.9
[0.8.16]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.15...v0.8.16
[0.4.8]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.4.6...v0.4.8
[0.4.6]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.4.5...v0.4.6
[0.4.5]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.3.7...v0.4.0
[0.3.7]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.3.6...v0.3.7
[0.3.6]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.2.6...v0.3.0
[0.2.6]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.1.0...v0.2.5
[0.1.0]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/releases/tag/v0.0.1
[0.8.24]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.23...v0.8.24
[0.8.23]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.22...v0.8.23
[0.8.21]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.20...v0.8.21
[0.8.25]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.24...v0.8.25
[0.8.31]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.30...v0.8.31
[0.8.32]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.31...v0.8.32
[0.8.33]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.32...v0.8.33
[0.8.42]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.33...v0.8.42
[0.8.43]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.42...v0.8.43
[0.8.44]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.43...v0.8.44
[0.8.45]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.44...v0.8.45
[0.9.0]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.45...v0.9.0
