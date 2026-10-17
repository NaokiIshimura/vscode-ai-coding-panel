const vscode = acquireVsCodeApi();

const quickStartButton = document.getElementById('quick-start-button');
const resumeSessionButton = document.getElementById('resume-session-button');
const listElement = document.getElementById('list');
const contextMenuElement = document.getElementById('context-menu');
const tooltipElement = document.getElementById('tooltip');
const searchInput = document.getElementById('search-input');
const searchClearButton = document.getElementById('search-clear');

// MIME type for internal drags (distinguished from VS Code's text/uri-list)
const INTERNAL_MIME = 'application/vnd.aicodingsidebar.paths';

// MIME types that may carry a URI list in an external drop (checked in order from the first)
const URI_LIST_MIMES = ['text/uri-list', 'application/vnd.code.uri-list'];

// MIME type in which VS Code puts a JSON array of resource URIs (DataTransfers.RESOURCES)
const RESOURCE_URLS_MIME = 'resourceurls';

// Maximum size of a dropped file whose content is read and transferred (50MB)
const MAX_DROP_FILE_SIZE = 50 * 1024 * 1024;

// Wait time before sending the search input to the extension (ms)
const SEARCH_DEBOUNCE = 250;

let items = [];
let selectedPath;
let searchTimer;

/**
 * Context menu definitions
 * The commands shown differ per contextValue
 * (follows the old view/item/context definitions in package.json)
 */
const CONTEXT_MENUS = {
    pathDisplay: [
        { command: 'aiCodingSidebar.createMarkdownFile', title: 'New PROMPT.md' },
        { command: 'aiCodingSidebar.createTaskFile', title: 'New TASK.md' },
        { command: 'aiCodingSidebar.createSpecFile', title: 'New SPEC.md' },
        { separator: true },
        { command: 'aiCodingSidebar.addDirectory', title: 'New Directory' }
    ],
    pathDisplayNonRoot: [
        { command: 'aiCodingSidebar.createMarkdownFile', title: 'New PROMPT.md' },
        { command: 'aiCodingSidebar.createTaskFile', title: 'New TASK.md' },
        { command: 'aiCodingSidebar.createSpecFile', title: 'New SPEC.md' },
        { separator: true },
        { command: 'aiCodingSidebar.addDirectory', title: 'New Directory' },
        { command: 'aiCodingSidebar.rename', title: 'Rename...' },
        { separator: true },
        { command: 'aiCodingSidebar.copyRelativePath', title: 'Copy Relative Path' },
        { command: 'aiCodingSidebar.archiveDirectory', title: 'Archive' }
    ],
    directory: [
        { command: 'aiCodingSidebar.showInPanel', title: 'Show in File List' },
        { command: 'aiCodingSidebar.checkoutBranch', title: 'Checkout Branch' },
        { separator: true },
        { command: 'aiCodingSidebar.createMarkdownFile', title: 'New PROMPT.md' },
        { command: 'aiCodingSidebar.createFile', title: 'Create File' },
        { command: 'aiCodingSidebar.addDirectory', title: 'New Directory' },
        { separator: true },
        { command: 'aiCodingSidebar.renameDirectory', title: 'Rename Directory' },
        { command: 'aiCodingSidebar.deleteDirectory', title: 'Delete Directory' },
        { separator: true },
        { command: 'aiCodingSidebar.copyRelativePath', title: 'Copy Relative Path' },
        { command: 'aiCodingSidebar.archiveDirectory', title: 'Archive' }
    ],
    file: [
        { command: 'aiCodingSidebar.openInEditor', title: 'Open in Editor' },
        { separator: true },
        { command: 'aiCodingSidebar.insertPathToEditor', title: 'Insert Path to Editor' },
        { command: 'aiCodingSidebar.insertPathToTerminal', title: 'Insert Path to Terminal' },
        { command: 'aiCodingSidebar.copyRelativePath', title: 'Copy Relative Path' },
        { separator: true },
        { command: 'aiCodingSidebar.rename', title: 'Rename...' },
        { command: 'aiCodingSidebar.archiveFile', title: 'Archive' },
        { command: 'aiCodingSidebar.delete', title: 'Delete' }
    ]
};

/**
 * Inline action definitions shown on row hover
 * (follows the inline group of the old view/item/context in package.json)
 */
const INLINE_ACTIONS = {
    pathDisplay: [
        { command: 'aiCodingSidebar.createMarkdownFile', title: 'New PROMPT.md', icon: 'comment-discussion' },
        { command: 'aiCodingSidebar.createTaskFile', title: 'New TASK.md', icon: 'tasklist' },
        { command: 'aiCodingSidebar.createSpecFile', title: 'New SPEC.md', icon: 'file-code' },
        { command: 'aiCodingSidebar.addDirectory', title: 'New Directory', icon: 'new-folder' }
    ],
    pathDisplayNonRoot: [
        { command: 'aiCodingSidebar.createMarkdownFile', title: 'New PROMPT.md', icon: 'comment-discussion' },
        { command: 'aiCodingSidebar.createTaskFile', title: 'New TASK.md', icon: 'tasklist' },
        { command: 'aiCodingSidebar.createSpecFile', title: 'New SPEC.md', icon: 'file-code' },
        { command: 'aiCodingSidebar.copyRelativePath', title: 'Copy Relative Path', icon: 'copy' },
        { command: 'aiCodingSidebar.rename', title: 'Rename...', icon: 'edit' },
        { command: 'aiCodingSidebar.addDirectory', title: 'New Directory', icon: 'new-folder' },
        { command: 'aiCodingSidebar.archiveDirectory', title: 'Archive', icon: 'archive' }
    ],
    directory: [
        { command: 'aiCodingSidebar.showInPanel', title: 'Show in File List', icon: 'list-tree' },
        { command: 'aiCodingSidebar.archiveDirectory', title: 'Archive', icon: 'archive' }
    ],
    file: [
        { command: 'aiCodingSidebar.insertPathToEditor', title: 'Insert Path to Editor', icon: 'edit' },
        { command: 'aiCodingSidebar.insertPathToTerminal', title: 'Insert Path to Terminal', icon: 'terminal' },
        { command: 'aiCodingSidebar.archiveFile', title: 'Archive', icon: 'archive' }
    ]
};

quickStartButton.addEventListener('click', () => {
    vscode.postMessage({ type: 'quickStart' });
});

resumeSessionButton.addEventListener('click', () => {
    vscode.postMessage({ type: 'resumeSession' });
});

/**
 * Ask the extension to run a command on the selected row
 */
function executeItemCommand(commandId, item) {
    vscode.postMessage({
        type: 'command',
        commandId,
        filePath: item.filePath,
        isDirectory: item.kind === 'directory' || item.kind === 'path' || item.kind === 'parent',
        label: item.label,
        // Passed through because archiveDirectory checks for 'pathDisplayNonRoot'
        contextValue: item.contextValue
    });
}

// Receive messages
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'update':
            items = message.items || [];
            selectedPath = message.selectedPath;
            // Searching is not possible while there is no root directory (Create directory is shown)
            searchInput.disabled = items.some(item => item.kind === 'createDirectory');
            resumeSessionButton.disabled = searchInput.disabled;
            render(message.message);
            break;
        case 'select':
            selectedPath = message.filePath;
            updateSelection();
            break;
        case 'searchCleared':
            // The extension ended the search (e.g. by moving to another directory)
            clearTimeout(searchTimer);
            searchInput.value = '';
            updateSearchClearButton();
            break;
    }
});

/**
 * Render the list
 */
function render(messageText) {
    hideContextMenu();
    hideTooltip();
    listElement.textContent = '';

    if (messageText) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        messageElement.textContent = messageText;
        listElement.appendChild(messageElement);
        return;
    }

    for (const item of items) {
        listElement.appendChild(createRow(item));
    }
    updateSelection();
}

/**
 * Create the element for one row
 */
function createRow(item) {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.filePath = item.filePath;
    row.dataset.kind = item.kind;
    row.dataset.contextValue = item.contextValue || '';
    row.title = item.tooltip || item.filePath;

    if (item.kind === 'path') {
        row.classList.add('path');
    }
    if (item.isEditing) {
        row.classList.add('editing');
    }

    const icon = document.createElement('span');
    icon.className = `codicon codicon-${item.icon}`;
    row.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = item.label;
    row.appendChild(label);

    if (item.description) {
        const description = document.createElement('span');
        description.className = 'description';
        description.textContent = item.description;
        row.appendChild(description);
    }

    // The search result count row is display only (not a target for selection, menus or dragging)
    if (item.kind === 'searchHeader') {
        row.classList.add('search-header');
        return row;
    }

    const actions = createRowActions(item);
    if (actions) {
        row.appendChild(actions);
    }

    row.addEventListener('click', () => {
        selectedPath = item.filePath;
        updateSelection();
        vscode.postMessage({ type: 'itemClick', kind: item.kind, filePath: item.filePath });
    });

    row.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        selectedPath = item.filePath;
        updateSelection();
        showContextMenu(event, item);
    });

    // Only files and directories are draggable
    if (item.kind === 'file' || item.kind === 'directory') {
        row.draggable = true;
        row.addEventListener('dragstart', (event) => {
            event.dataTransfer.setData(INTERNAL_MIME, JSON.stringify([item.filePath]));
            event.dataTransfer.effectAllowed = 'copy';
        });
    }

    // Directory and path display rows can be individual drop targets
    // (drops on file rows or empty areas are handled by the view-wide handler as the current directory)
    if (item.kind === 'directory' || item.kind === 'path' || item.kind === 'parent') {
        row.addEventListener('dragenter', (event) => {
            event.preventDefault();
        });
        row.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'copy';
            row.classList.add('drop-target');
            // Do not show both the row highlight and the view-wide highlight
            clearViewDropHighlight();
        });
        row.addEventListener('dragleave', () => {
            row.classList.remove('drop-target');
        });
        row.addEventListener('drop', (event) => {
            event.preventDefault();
            event.stopPropagation();
            row.classList.remove('drop-target');
            clearViewDropHighlight();
            handleDrop(event, item.filePath);
        });
    }

    return row;
}

/**
 * Create the inline action buttons shown on row hover
 */
function createRowActions(item) {
    const entries = INLINE_ACTIONS[item.contextValue];
    if (!entries || entries.length === 0) {
        return null;
    }

    const container = document.createElement('div');
    container.className = 'row-actions';

    for (const entry of entries) {
        const button = document.createElement('button');
        button.className = 'row-action';
        // An empty title suppresses the row's native tooltip (the file path) and our own tooltip is shown instead
        button.title = '';
        button.setAttribute('aria-label', entry.title);

        const icon = document.createElement('span');
        icon.className = `codicon codicon-${entry.icon}`;
        button.appendChild(icon);

        attachTooltip(button, entry.title);

        button.addEventListener('click', (event) => {
            // Do not trigger the row click (moving into a directory / opening a file)
            event.stopPropagation();
            hideTooltip();
            executeItemCommand(entry.command, item);
        });

        container.appendChild(button);
    }

    return container;
}

// Wait time before showing the tooltip (ms)
const TOOLTIP_DELAY = 300;
// Gap between the element and the tooltip (px)
const TOOLTIP_GAP = 4;

let tooltipTimer;

/**
 * Register the element to show a tooltip on hover
 * (drawn by ourselves because the native title tooltip is sometimes not shown in a Webview)
 */
function attachTooltip(element, text) {
    element.addEventListener('mouseenter', () => {
        clearTimeout(tooltipTimer);
        tooltipTimer = setTimeout(() => showTooltip(element, text), TOOLTIP_DELAY);
    });
    element.addEventListener('mouseleave', hideTooltip);
    element.addEventListener('mousedown', hideTooltip);
}

/**
 * Show the tooltip below the target element (above it if it would overflow)
 */
function showTooltip(element, text) {
    if (!element.isConnected) {
        return;
    }

    tooltipElement.textContent = text;
    tooltipElement.classList.remove('hidden');

    const targetRect = element.getBoundingClientRect();
    const tooltipRect = tooltipElement.getBoundingClientRect();

    let left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
    left = Math.min(left, window.innerWidth - tooltipRect.width - TOOLTIP_GAP);
    left = Math.max(TOOLTIP_GAP, left);

    let top = targetRect.bottom + TOOLTIP_GAP;
    if (top + tooltipRect.height > window.innerHeight) {
        top = targetRect.top - tooltipRect.height - TOOLTIP_GAP;
    }
    top = Math.max(TOOLTIP_GAP, top);

    tooltipElement.style.left = `${left}px`;
    tooltipElement.style.top = `${top}px`;
}

function hideTooltip() {
    clearTimeout(tooltipTimer);
    tooltipElement.classList.add('hidden');
}

// Close it on list scroll or focus loss because its position would be off
listElement.addEventListener('scroll', hideTooltip);
window.addEventListener('blur', hideTooltip);

/**
 * Update the display of the selection state
 */
function updateSelection() {
    for (const row of listElement.querySelectorAll('.row')) {
        if (row.dataset.filePath === selectedPath) {
            row.classList.add('selected');
        } else {
            row.classList.remove('selected');
        }
    }
}

/**
 * Register the whole view as a drop target
 * Drops anywhere other than on a row (empty area, file rows) target the currently displayed directory
 */
function setupViewDropTarget() {
    document.addEventListener('dragenter', (event) => {
        event.preventDefault();
    });

    document.addEventListener('dragover', (event) => {
        // Without preventDefault, drop does not fire and the Webview navigates to the dropped file
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        document.body.classList.add('drag-over');
    });

    document.addEventListener('dragleave', (event) => {
        // This also fires when moving between child elements, so clear it only when leaving the view
        if (!event.relatedTarget) {
            clearViewDropHighlight();
        }
    });

    document.addEventListener('dragend', clearViewDropHighlight);

    document.addEventListener('drop', (event) => {
        event.preventDefault();
        clearViewDropHighlight();
        // By not passing targetPath, the extension uses the current directory
        handleDrop(event);
    });
}

/**
 * Clear the drop highlight on the whole view
 */
function clearViewDropHighlight() {
    document.body.classList.remove('drag-over');
}

/**
 * Send the dropped content to the extension
 * When targetPath is omitted, the currently displayed directory is the target
 */
function handleDrop(event, targetPath) {
    const sources = readInternalSources(event.dataTransfer);
    if (sources.length > 0) {
        vscode.postMessage({ type: 'drop', targetPath, sources });
        return;
    }

    // If the paths are known, copy them directly (reliable, no need to read the content)
    const uriList = readUriList(event.dataTransfer);
    if (hasFileUri(uriList)) {
        vscode.postMessage({ type: 'drop', targetPath, uriList });
        return;
    }

    // For drops from Finder or the VS Code Explorer, the Webview cannot get absolute paths
    // (Electron's File.path has been removed), so read the content itself and pass it to the extension
    const dropped = readDroppedEntries(event.dataTransfer);
    if (dropped.files.length > 0 || dropped.directories.length > 0) {
        sendDroppedFileContents(dropped, targetPath);
        return;
    }

    vscode.postMessage({ type: 'dropUnsupported' });
}

/**
 * Synchronously take the dropped files out during event handling
 * DataTransfer can no longer be read after the handler returns, so the File objects are secured here
 */
function readDroppedEntries(dataTransfer) {
    const files = [];
    const directories = [];

    if (dataTransfer.items && dataTransfer.items.length > 0) {
        for (const item of dataTransfer.items) {
            if (item.kind !== 'file') {
                continue;
            }

            // Directories are excluded because their contents cannot be read through the File API
            const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
            if (entry && entry.isDirectory) {
                directories.push(entry.name);
                continue;
            }

            const file = item.getAsFile();
            if (file) {
                files.push(file);
            }
        }

        return { files, directories };
    }

    for (const file of dataTransfer.files || []) {
        files.push(file);
    }

    return { files, directories };
}

/**
 * Read the content of the dropped files and send it to the extension
 */
async function sendDroppedFileContents(dropped, targetPath) {
    const files = [];
    const skippedFiles = [];

    for (const file of dropped.files) {
        if (file.size > MAX_DROP_FILE_SIZE) {
            skippedFiles.push(file.name);
            continue;
        }

        try {
            const buffer = await file.arrayBuffer();
            files.push({ name: file.name, data: encodeBase64(buffer) });
        } catch {
            skippedFiles.push(file.name);
        }
    }

    vscode.postMessage({
        type: 'dropFiles',
        targetPath,
        files,
        skippedDirectories: dropped.directories,
        skippedFiles
    });
}

/**
 * Convert the content to base64 so it can be sent with postMessage
 */
function encodeBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    // Split into chunks because passing everything at once has too many arguments and overflows the stack
    const chunkSize = 0x8000;
    let binary = '';

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
    }

    return btoa(binary);
}

/**
 * Determine whether the URI list contains a file scheme URI
 * If there are only URIs that cannot be copied from (e.g. a dropped link), fall back to reading the content
 */
function hasFileUri(uriList) {
    if (!uriList) {
        return false;
    }

    return uriList
        .split(/\r?\n/)
        .some(line => line.trim().toLowerCase().startsWith('file:'));
}

/**
 * Read the path list set by a drag within the view
 */
function readInternalSources(dataTransfer) {
    const internal = dataTransfer.getData(INTERNAL_MIME);
    if (!internal) {
        return [];
    }

    try {
        const parsed = JSON.parse(internal);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        // If it cannot be parsed, treat it as an external drop
        return [];
    }
}

/**
 * Read the URI list in an external drop as newline-separated values
 * The MIME type used differs depending on the drag source, so check them in order
 */
function readUriList(dataTransfer) {
    for (const mime of URI_LIST_MIMES) {
        const value = dataTransfer.getData(mime);
        if (value) {
            return value;
        }
    }

    // The VS Code Explorer may pass the resource list as a JSON array
    const resourceUrls = dataTransfer.getData(RESOURCE_URLS_MIME);
    if (resourceUrls) {
        try {
            const parsed = JSON.parse(resourceUrls);
            if (Array.isArray(parsed)) {
                return parsed.join('\n');
            }
        } catch {
            // Ignore if it cannot be parsed
        }
    }

    return '';
}

/**
 * Show the context menu
 */
function showContextMenu(event, item) {
    const entries = CONTEXT_MENUS[item.contextValue];
    if (!entries || entries.length === 0) {
        return;
    }

    hideTooltip();
    contextMenuElement.textContent = '';

    for (const entry of entries) {
        if (entry.separator) {
            const separator = document.createElement('div');
            separator.className = 'context-menu-separator';
            contextMenuElement.appendChild(separator);
            continue;
        }

        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        menuItem.textContent = entry.title;
        menuItem.addEventListener('click', () => {
            hideContextMenu();
            executeItemCommand(entry.command, item);
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
}

function hideContextMenu() {
    contextMenuElement.classList.add('hidden');
}

document.addEventListener('click', (event) => {
    if (!contextMenuElement.contains(event.target)) {
        hideContextMenu();
    }
});

document.addEventListener('contextmenu', (event) => {
    // Close the menu when right-clicking anywhere other than a row
    if (!event.target.closest('.row')) {
        hideContextMenu();
    }
});

/**
 * Rows that can be selected with the keyboard (excluding the search result count row)
 */
function getSelectableItems() {
    return items.filter(item => item.kind !== 'searchHeader');
}

/**
 * Select the given row and scroll it into view
 */
function selectItem(item) {
    selectedPath = item.filePath;
    updateSelection();
    const selectedRow = listElement.querySelector('.row.selected');
    if (selectedRow) {
        selectedRow.scrollIntoView({ block: 'nearest' });
    }
}

// Keyboard operation (move the selection with Up/Down, run with Enter)
listElement.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'Enter') {
        return;
    }

    const selectableItems = getSelectableItems();
    const currentIndex = selectableItems.findIndex(item => item.filePath === selectedPath);

    if (event.key === 'Enter') {
        if (currentIndex >= 0) {
            const item = selectableItems[currentIndex];
            vscode.postMessage({ type: 'itemClick', kind: item.kind, filePath: item.filePath });
        }
        event.preventDefault();
        return;
    }

    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = currentIndex < 0
        ? (delta > 0 ? 0 : selectableItems.length - 1)
        : Math.min(selectableItems.length - 1, Math.max(0, currentIndex + delta));

    if (selectableItems[nextIndex]) {
        selectItem(selectableItems[nextIndex]);
    }
    event.preventDefault();
});

// ---------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------

function updateSearchClearButton() {
    searchClearButton.classList.toggle('hidden', searchInput.value.length === 0);
}

/**
 * Send the current search term to the extension (end the search if it is empty)
 */
function sendSearchQuery() {
    clearTimeout(searchTimer);
    const query = searchInput.value.trim();
    vscode.postMessage(query ? { type: 'search', query } : { type: 'clearSearch' });
}

function clearSearchInput() {
    searchInput.value = '';
    updateSearchClearButton();
    sendSearchQuery();
}

searchInput.addEventListener('input', () => {
    updateSearchClearButton();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(sendSearchQuery, SEARCH_DEBOUNCE);
});

searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        clearSearchInput();
        event.preventDefault();
        return;
    }

    if (event.key === 'Enter') {
        // Search immediately without waiting for the debounce
        sendSearchQuery();
        event.preventDefault();
        return;
    }

    // Down moves the focus to the list and selects the first result
    if (event.key === 'ArrowDown') {
        const first = getSelectableItems()[0];
        if (first) {
            listElement.focus();
            selectItem(first);
        }
        event.preventDefault();
    }
});

searchClearButton.addEventListener('click', () => {
    clearSearchInput();
    searchInput.focus();
});

setupViewDropTarget();

// Notify the extension that it is ready
vscode.postMessage({ type: 'ready' });
