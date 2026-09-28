# Terminal View

Embedded terminal with full PTY support using xterm.js.

## Tab Management

- Up to 5 terminal tabs
- Click "+" to add new tab
- Click tab to switch
- Click "x" to close tab

## Features

| Feature | Description |
|---------|-------------|
| Session persistence | Output history preserved across view switches |
| Clickable links | URLs open in browser, file paths open in editor |
| Unicode support | Proper display of CJK and other Unicode characters |
| Full PTY support | Complete terminal emulation with xterm.js |

## Header Buttons

| Button | Description |
|--------|-------------|
| + | Create new terminal tab |
| Clear | Clear current terminal output |
| Kill | Terminate current terminal session |
| Settings | Open terminal settings |

## Clickable Links

- **URLs**: Click to open in default browser
- **File paths**: Click to open in editor (e.g., `./src/file.ts:123` opens at line 123)

## Configuration

```json
{
  "aiCodingSidebar.terminal.shell": "",
  "aiCodingSidebar.terminal.fontSize": 12,
  "aiCodingSidebar.terminal.fontFamily": "monospace",
  "aiCodingSidebar.terminal.cursorStyle": "block",
  "aiCodingSidebar.terminal.cursorBlink": true,
  "aiCodingSidebar.terminal.scrollback": 1000
}
```

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `terminal.shell` | Shell executable path | (system default) |
| `terminal.fontSize` | Font size | 12 |
| `terminal.fontFamily` | Font family | monospace |
| `terminal.cursorStyle` | Cursor style (block/underline/bar) | block |
| `terminal.cursorBlink` | Enable cursor blink | true |
| `terminal.scrollback` | Scrollback buffer lines | 1000 |

## Usage with Editor

The Terminal view receives commands from the Editor view:

1. Edit your prompt in Editor view
2. Click Run button or press `Cmd+R`
3. Command is executed in Terminal view
4. View output and iterate

---

[Back to Quick Start](quick-start.md)
