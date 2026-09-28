# Plans View

Browse and manage files in a flat list format.

## Navigation

| Feature | Description |
|---------|-------------|
| Directory click | Navigate into the directory |
| ".." item | Go back to parent directory |
| Path header | Shows current path with action buttons |

## File Operations

| Feature | Description |
|---------|-------------|
| New PROMPT.md | Create timestamp markdown file (e.g., `2025_1229_1430_25_PROMPT.md`) |
| New TASK.md | Create timestamp TASK.md file |
| New SPEC.md | Create timestamp SPEC.md file |
| New Directory | Create a new folder |
| Rename | Rename file or folder |
| Delete | Move to trash |
| Archive | Move directory to `archived` folder |
| Drag & Drop | Copy files within view or from external sources |

## Context Menu Actions

- **Copy Relative Path**: Copy path from workspace root
- **Checkout Branch**: Create/switch git branch matching directory name
- **Insert Path to Editor**: Insert relative path at Editor cursor position
- **Insert Path to Terminal**: Insert relative path to Terminal view

## Path Header Buttons

The path header row displays the current path and provides quick action buttons:

| Button | Description |
|--------|-------------|
| New PROMPT.md | Create new prompt file |
| New TASK.md | Create new task file |
| New SPEC.md | Create new spec file |
| Copy | Copy relative path |
| Rename | Rename current directory |
| New Directory | Create subdirectory |
| Archive | Archive current directory |

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `defaultRelativePath` | Default path for Tasks view | `.claude/plans` |
| `markdownList.sortBy` | Sort criterion (name/created/modified) | `created` |
| `markdownList.sortOrder` | Sort order (ascending/descending) | `ascending` |

### Setting the Default Path

1. Click the gear icon in Tasks view title bar
2. Edit `aiCodingSidebar.defaultRelativePath` setting
3. Example values: `src`, `.claude`, `docs/api`

---

[Back to Quick Start](quick-start.md)
