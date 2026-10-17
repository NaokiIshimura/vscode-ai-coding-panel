const vscode = acquireVsCodeApi();
const editor = document.getElementById('editor');
const readonlyIndicator = document.getElementById('readonly-indicator');
const editButton = document.getElementById('edit-button');
const saveButton = document.getElementById('save-button');
const specButton = document.getElementById('spec-button');
const planButton = document.getElementById('plan-button');
const runButton = document.getElementById('run-button');
const nextButton = document.getElementById('next-button');
const templateButton = document.getElementById('template-button');
const outputMdButton = document.getElementById('output-md-button');
const outputMemoryButton = document.getElementById('output-memory-button');
const linkOverlay = document.getElementById('link-overlay');
const contextMenuElement = document.getElementById('context-menu');
let originalContent = '';
let currentFilePath = '';
let isReadOnly = false;

// Focus the editor and move the cursor to the beginning
const focusEditor = () => {
    // Focus after rendering completes (before the content is applied, the cursor position would be off)
    requestAnimationFrame(() => {
        editor.focus();
        editor.setSelectionRange(0, 0);
        editor.scrollTop = 0;
    });
};

// URL detection pattern (same definition as the link detection in the Terminal View)
const URL_PATTERN = /(?:https?|HTTPS?):\/\/[^\s"'!*(){}|\\\^<>`]*[^\s"':,.!?{}|\\\^~\[\]`()<>]/g;

// Maximum number of URL characters shown in the context menu header
const URL_LABEL_MAX_LENGTH = 60;

// Menu items shown when right-clicking a URL
const URL_CONTEXT_MENU = [
    { title: 'Open in Default Browser', messageType: 'openUrl' },
    { title: 'Open in Integrated Browser', messageType: 'openUrlInIntegratedBrowser' }
];

// URL elements on the overlay (used to determine the click position)
let linkElements = [];
let overlayRenderHandle = null;

/**
 * Match the overlay's position, size and scroll amount to the textarea
 * The width must match clientWidth (the width excluding the scrollbar), otherwise the wrap positions are off
 */
const syncLinkOverlay = () => {
    linkOverlay.style.width = `${editor.clientWidth}px`;
    linkOverlay.style.height = `${editor.clientHeight}px`;
    linkOverlay.scrollTop = editor.scrollTop;
    linkOverlay.scrollLeft = editor.scrollLeft;
};

/**
 * Rebuild the overlay from the textarea content
 * Only the URL parts become elements, and their rectangles are used to determine the click position
 */
const renderLinkOverlay = () => {
    const text = editor.value;
    linkOverlay.textContent = '';
    linkElements = [];

    URL_PATTERN.lastIndex = 0;
    let lastIndex = 0;
    let match;
    while ((match = URL_PATTERN.exec(text)) !== null) {
        if (match.index > lastIndex) {
            linkOverlay.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        const link = document.createElement('span');
        link.className = 'overlay-link';
        link.textContent = match[0];
        link.dataset.url = match[0];
        linkOverlay.appendChild(link);
        linkElements.push(link);
        lastIndex = match.index + match[0].length;
    }
    // Append a trailing newline. With pre-wrap the trailing newline collapses and the line count would differ from the textarea
    linkOverlay.appendChild(document.createTextNode(text.slice(lastIndex) + '\n'));

    syncLinkOverlay();
};

// During continuous input, rebuild at most once per frame
const scheduleLinkOverlayRender = () => {
    if (overlayRenderHandle !== null) {
        return;
    }
    overlayRenderHandle = requestAnimationFrame(() => {
        overlayRenderHandle = null;
        renderLinkOverlay();
    });
};

/**
 * Return the URL at the given coordinates (null if none)
 * The overlay has pointer-events: none, so this is determined by matching the element rectangles against the coordinates
 */
const findUrlAtPoint = (x, y) => {
    for (const link of linkElements) {
        // A wrapped URL consists of multiple rectangles
        for (const rect of link.getClientRects()) {
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                return link.dataset.url;
            }
        }
    }
    return null;
};

// Whether the template menu is open (used to toggle it with the button)
let promptMenuOpen = false;

const hideContextMenu = () => {
    contextMenuElement.classList.add('hidden');
    promptMenuOpen = false;
};

/**
 * Create a menu separator
 */
const createMenuSeparator = () => {
    const separator = document.createElement('div');
    separator.className = 'context-menu-separator';
    return separator;
};

/**
 * Show the context menu for a URL
 */
const showUrlContextMenu = (event, url) => {
    contextMenuElement.textContent = '';
    contextMenuElement.classList.remove('prompt-menu');

    // Show the target URL as the header
    const header = document.createElement('div');
    header.className = 'context-menu-header';
    header.textContent = url.length > URL_LABEL_MAX_LENGTH
        ? url.slice(0, URL_LABEL_MAX_LENGTH) + '…'
        : url;
    header.title = url;
    contextMenuElement.appendChild(header);

    contextMenuElement.appendChild(createMenuSeparator());

    for (const entry of URL_CONTEXT_MENU) {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        menuItem.textContent = entry.title;
        menuItem.addEventListener('click', () => {
            hideContextMenu();
            vscode.postMessage({ type: entry.messageType, url: url });
        });
        contextMenuElement.appendChild(menuItem);
    }

    contextMenuElement.classList.remove('hidden');

    // Adjust the position so the menu does not overflow the screen
    const menuRect = contextMenuElement.getBoundingClientRect();
    const left = Math.min(event.clientX, window.innerWidth - menuRect.width - 4);
    const top = Math.min(event.clientY, window.innerHeight - menuRect.height - 4);
    contextMenuElement.style.left = `${Math.max(0, left)}px`;
    contextMenuElement.style.top = `${Math.max(0, top)}px`;
};

/**
 * Position the menu so it fits within the screen
 * Place it above the reference element, and flip it below if it does not fit
 */
const placeMenuNearElement = (element) => {
    const anchorRect = element.getBoundingClientRect();
    const menuRect = contextMenuElement.getBoundingClientRect();
    const gap = 4;

    let top = anchorRect.top - menuRect.height - gap;
    if (top < gap) {
        // If it does not fit above, place it below
        top = Math.min(anchorRect.bottom + gap, window.innerHeight - menuRect.height - gap);
    }

    const left = Math.min(anchorRect.left, window.innerWidth - menuRect.width - gap);

    contextMenuElement.style.left = `${Math.max(gap, left)}px`;
    contextMenuElement.style.top = `${Math.max(gap, top)}px`;
};

/**
 * Show the prompt template menu near the button
 */
const showPromptTemplateMenu = (templates) => {
    contextMenuElement.textContent = '';
    contextMenuElement.classList.add('prompt-menu');

    for (const template of templates) {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        menuItem.textContent = template.label;
        // Make templates with the same display name distinguishable by file name
        menuItem.title = template.description;
        menuItem.addEventListener('click', () => {
            hideContextMenu();
            vscode.postMessage({
                type: 'insertPromptTemplate',
                templateId: template.id
            });
        });
        contextMenuElement.appendChild(menuItem);
    }

    // Bottom: item to create a new template
    // Do not show the separator when there are 0 templates (the menu would start with a separator)
    if (templates.length > 0) {
        contextMenuElement.appendChild(createMenuSeparator());
    }

    const addItem = document.createElement('div');
    addItem.className = 'context-menu-item prompt-menu-add-item';
    const addIcon = document.createElement('span');
    addIcon.className = 'codicon codicon-add';
    const addLabel = document.createElement('span');
    addLabel.textContent = 'Add template';
    addItem.appendChild(addIcon);
    addItem.appendChild(addLabel);
    addItem.addEventListener('click', (event) => {
        event.stopPropagation();
        hideContextMenu();
        vscode.postMessage({ type: 'createPromptTemplate' });
    });
    contextMenuElement.appendChild(addItem);

    // Position calculation needs the rendered size, so show it first
    contextMenuElement.classList.remove('hidden');
    placeMenuNearElement(templateButton);
    promptMenuOpen = true;
};

// Show our own menu only when right-clicking on a URL
// If preventDefault() is not called, the standard VSCode menu is shown
// Registered on document because VSCode listens on window, so we need to handle it first
document.addEventListener('contextmenu', (event) => {
    if (contextMenuElement.contains(event.target)) {
        return;
    }
    hideContextMenu();

    if (event.target !== editor) {
        return;
    }
    const url = findUrlAtPoint(event.clientX, event.clientY);
    if (!url) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    showUrlContextMenu(event, url);
});

document.addEventListener('click', (event) => {
    if (!contextMenuElement.contains(event.target)) {
        hideContextMenu();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        hideContextMenu();
    }
});

window.addEventListener('blur', hideContextMenu);

// Use a pointer cursor over URLs to indicate that they are links
editor.addEventListener('mousemove', (event) => {
    editor.style.cursor = findUrlAtPoint(event.clientX, event.clientY) ? 'pointer' : '';
});

editor.addEventListener('mouseleave', () => {
    editor.style.cursor = '';
});

// Make the overlay follow the textarea scroll
editor.addEventListener('scroll', () => {
    syncLinkOverlay();
    hideContextMenu();
});

// The wrap positions change when the view width changes, so follow size changes
if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => syncLinkOverlay()).observe(editor);
}

renderLinkOverlay();

// Receive messages
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'showContent':
            editor.value = message.content;
            originalContent = message.content;
            currentFilePath = message.filePath;
            saveButton.classList.remove('dirty');
            renderLinkOverlay();

            // Handle read-only mode
            isReadOnly = message.isReadOnly || false;
            if (isReadOnly) {
                editor.setAttribute('readonly', 'readonly');
                readonlyIndicator.classList.add('show');
                editButton.classList.add('active');
            } else {
                editor.removeAttribute('readonly');
                readonlyIndicator.classList.remove('show');
                editButton.classList.remove('active');
            }

            // Right after a new file is created etc., focus the editor so input can start from the beginning
            if (message.focusEditor) {
                focusEditor();
            }
            break;
        case 'updateContent':
            // Resync when the file is rewritten on the extension side
            // (e.g. appending to the sent history). Keep the cursor and scroll positions
            const selectionStart = editor.selectionStart;
            const selectionEnd = editor.selectionEnd;
            const scrollTop = editor.scrollTop;
            editor.value = message.content;
            originalContent = message.content;
            saveButton.classList.remove('dirty');
            editor.setSelectionRange(selectionStart, selectionEnd);
            editor.scrollTop = scrollTop;
            renderLinkOverlay();
            break;
        case 'updateDirtyState':
            if (message.isDirty) {
                saveButton.classList.add('dirty');
            } else {
                saveButton.classList.remove('dirty');
                originalContent = editor.value;
            }
            break;
        case 'setReadOnlyState':
            isReadOnly = message.isReadOnly || false;
            if (isReadOnly) {
                editor.setAttribute('readonly', 'readonly');
                readonlyIndicator.classList.add('show');
                editButton.classList.add('active');
                saveButton.classList.remove('dirty');
            } else {
                editor.removeAttribute('readonly');
                readonlyIndicator.classList.remove('show');
                editButton.classList.remove('active');
                // Check if content is dirty when switching back to editable
                const isDirty = editor.value !== originalContent;
                if (isDirty) {
                    saveButton.classList.add('dirty');
                }
            }
            break;
        case 'clearContent':
            editor.value = '';
            originalContent = '';
            currentFilePath = '';
            saveButton.classList.remove('dirty');
            renderLinkOverlay();
            readonlyIndicator.classList.remove('show');
            editButton.classList.remove('active');
            editor.removeAttribute('readonly');
            isReadOnly = false;
            break;
        case 'showPromptTemplates':
            // Receive the template list and show the menu near the button
            showPromptTemplateMenu(message.templates || []);
            break;
        case 'insertText':
            // Insert text at the cursor position
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            const text = message.text;
            editor.value = editor.value.substring(0, start) + text + editor.value.substring(end);
            // Move the cursor after the inserted text
            editor.selectionStart = editor.selectionEnd = start + text.length;
            editor.focus();
            renderLinkOverlay();
            // Notify the change
            vscode.postMessage({ type: 'contentChanged', content: editor.value });
            if (editor.value !== originalContent) {
                saveButton.classList.add('dirty');
            }
            break;
    }
});

// Detect changes to the editor content
editor.addEventListener('input', () => {
    scheduleLinkOverlayRender();
    if (isReadOnly) {
        return;
    }
    const isDirty = editor.value !== originalContent;
    if (isDirty) {
        saveButton.classList.add('dirty');
    } else {
        saveButton.classList.remove('dirty');
    }
    vscode.postMessage({
        type: 'contentChanged',
        content: editor.value
    });
});

// Run task function
const runTask = () => {
    if (currentFilePath) {
        // File is open - use the file-based run task
        const isDirty = editor.value !== originalContent;
        vscode.postMessage({
            type: 'runTask',
            filePath: currentFilePath,
            content: isDirty && !isReadOnly ? editor.value : null
        });
    } else {
        // No file open - use editor content directly
        vscode.postMessage({
            type: 'runTask',
            editorContent: editor.value
        });
    }
};

// Keyboard shortcuts
editor.addEventListener('keydown', (e) => {
    // Run with Cmd+R / Ctrl+R
    if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault();
        runTask();
    }

    // Create Markdown File with Cmd+M / Ctrl+M
    if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
        e.preventDefault();
        vscode.postMessage({
            type: 'createMarkdownFile'
        });
    }
});

// Save button click handler
saveButton.addEventListener('click', () => {
    if (isReadOnly) {
        return;
    }
    vscode.postMessage({
        type: 'save',
        content: editor.value
    });
});

// Run button click handler
runButton.addEventListener('click', () => {
    runTask();
});

// Spec button click handler
specButton.addEventListener('click', () => {
    const isDirty = editor.value !== originalContent;
    vscode.postMessage({
        type: 'specTask',
        filePath: currentFilePath,
        content: (currentFilePath && isDirty && !isReadOnly) || !currentFilePath ? editor.value : null
    });
});

// Plan button click handler
planButton.addEventListener('click', () => {
    const isDirty = editor.value !== originalContent;
    vscode.postMessage({
        type: 'planTask',
        filePath: currentFilePath,
        content: (currentFilePath && isDirty && !isReadOnly) || !currentFilePath ? editor.value : null
    });
});

// prompts button click handler - show the template list in a menu near the button
templateButton.addEventListener('click', (event) => {
    // Prevent the document click handler from closing it immediately
    event.stopPropagation();

    // If it is open, toggle it closed
    if (promptMenuOpen) {
        hideContextMenu();
        return;
    }

    hideContextMenu();

    // Do not open when read-only, because inserted text would not be saved from the textarea
    if (isReadOnly) {
        vscode.postMessage({
            type: 'showWarning',
            message: 'This file is being edited in VS Code. Close the tab to insert a template here.'
        });
        return;
    }

    vscode.postMessage({
        type: 'requestPromptTemplates'
    });
});

// Next button click handler - create new PROMPT.md
nextButton.addEventListener('click', () => {
    vscode.postMessage({
        type: 'createMarkdownFile'
    });
});

// output md / output memory button click handlers - send output instructions to the running Claude Code
// Claude Code reads the session context, so the editor content is not saved
outputMdButton.addEventListener('click', () => {
    vscode.postMessage({
        type: 'outputMd'
    });
});

outputMemoryButton.addEventListener('click', () => {
    vscode.postMessage({
        type: 'outputMemory'
    });
});

// Edit button click handler
editButton.addEventListener('click', () => {
    if (!currentFilePath) {
        vscode.postMessage({
            type: 'showWarning',
            message: 'No file is currently open. Please save the file first.'
        });
        return;
    }
    const isDirty = editor.value !== originalContent;
    vscode.postMessage({
        type: 'openInVSCode',
        filePath: currentFilePath,
        content: isDirty && !isReadOnly ? editor.value : null
    });
});

// Editor click handler - open URL, or focus the tab in VS Code when readonly
editor.addEventListener('click', (event) => {
    // Clicking on a URL opens it in the default browser
    // Do not open it when the end of a drag selection lands on a URL
    const hasSelection = editor.selectionStart !== editor.selectionEnd;
    const url = hasSelection ? null : findUrlAtPoint(event.clientX, event.clientY);
    if (url) {
        vscode.postMessage({ type: 'openUrl', url: url });
        return;
    }
    if (isReadOnly && currentFilePath) {
        vscode.postMessage({
            type: 'focusTabInVSCode',
            filePath: currentFilePath
        });
    }
});

// Notify extension that webview is ready
window.addEventListener('load', () => {
    vscode.postMessage({ type: 'webviewReady' });
});

// Global key handler for Cmd+M / Ctrl+M (works when webview has focus)
document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
        e.preventDefault();
        vscode.postMessage({
            type: 'createMarkdownFile'
        });
    }
});

// Focus/blur handlers for visual focus indicator
window.addEventListener('focus', () => {
    document.body.classList.add('focused');
});
window.addEventListener('blur', () => {
    document.body.classList.remove('focused');
});
