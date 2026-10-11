# Editor View

Edit markdown files directly in the panel.

## Automatic Display

- Timestamp format files (e.g., `YYYY_MMDD_HHMM_SS_PROMPT.md`) open in Editor view
- Other markdown files open in VSCode's standard editor

## Header Buttons

| Button | Description |
|--------|-------------|
| Save | Save current file. Color changes when unsaved |
| Run | Execute command in Terminal (`Cmd+R` / `Ctrl+R`) |
| Plan | Execute plan command in Terminal |
| New PROMPT.md | Create new prompt file (`Cmd+M` / `Ctrl+M`) |
| New TASK.md | Create new task file |
| New SPEC.md | Create new spec file |
| output md | Ask the running Claude Code session to write the task status to `YYYY_MMDD_HHMM_SS_status.md` in the directory of the open file |
| output memory | Ask the running Claude Code session to write reusable knowledge from the session to `YYYY_MMDD_HHMM_SS_memory.md` in the directory of the open file |

## Features

### Auto-save
Automatically saves when:
- Switching to another file
- Navigating to a different directory
- Closing the view

### Read-only Mode
Automatically switches to read-only when the file is active in VSCode's standard editor.

### File Restoration
Restores the editing file when returning from other extensions.

## Run Command

The Run button executes a customizable command in the Terminal view.

### Configuration

```json
{
  "aiCodingSidebar.editor.runCommand": "claude \"${editorContent}\"",
  "aiCodingSidebar.editor.runCommandWithoutFile": "claude \"${editorContent}\"",
  "aiCodingSidebar.editor.runPlanCommand": "claude \"Review the file at ${filePath} and create an implementation plan.\""
}
```

### Variables

| Variable | Description |
|----------|-------------|
| `${filePath}` | Path to the current file |
| `${editorContent}` | Content of the editor |

Wrap every placeholder in double quotes, as the defaults above do. The value is quoted so that backticks, `$`, `!` and newlines in it reach the command untouched, and the surrounding double quotes keep it a single argument.

## output md / output memory

These buttons sit on the left of the bottom bar. Use them after starting a session with Run / Plan / Spec: they type an instruction into the Claude Code session running in the active Terminal tab instead of starting a new one.

- Nothing is sent while Claude Code is not running in the active tab, or while no file is open (the output goes to the directory of the open file)
- The instruction is sent as typed text, so it is not shell-quoted. Keep it on a single line

```json
{
  "aiCodingSidebar.editor.outputMdPrompt": "Record the current status of this task as a Markdown file. Save it as a timestamped file (format: YYYY_MMDD_HHMM_SS_status.md) in ${dirPath}.",
  "aiCodingSidebar.editor.outputMemoryPrompt": "Record the reusable knowledge from this session as a Markdown file. Save it as a timestamped file (format: YYYY_MMDD_HHMM_SS_memory.md) in ${dirPath}."
}
```

| Variable | Description |
|----------|-------------|
| `${filePath}` | Path to the current file, relative to the workspace root |
| `${dirPath}` | Directory of the current file, relative to the workspace root |

## Templates

Customize file creation templates:

1. Click gear icon in Tasks view
2. Select "Customize Template"
3. Edit templates in `.vscode/ai-coding-panel/templates/`

### Available Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{datetime}}` | Creation date/time | 2026/09/06 21:46:07 |
| `{{filename}}` | File name with extension | 2025_1229_1430_25_PROMPT.md |
| `{{timestamp}}` | Timestamp | 2025_1229_1430_25 |
| `{{filepath}}` | File path from workspace root | .claude/tasks/2025_1229_1430_25_PROMPT.md |
| `{{dirpath}}` | Directory path from workspace root | .claude/tasks |

---

[Back to Quick Start](quick-start.md)
