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
  "aiCodingSidebar.editor.runCommand": "claude \"${filePath}\"",
  "aiCodingSidebar.editor.runCommandWithoutFile": "claude \"${editorContent}\"",
  "aiCodingSidebar.editor.planCommand": "claude \"Review the file at ${filePath} and create an implementation plan.\""
}
```

### Variables

| Variable | Description |
|----------|-------------|
| `${filePath}` | Path to the current file |
| `${editorContent}` | Content of the editor (when no file is open) |

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

[Back to Getting Started](getting-started.md)
