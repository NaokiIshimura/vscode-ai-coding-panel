(function() {
    const vscode = acquireVsCodeApi();
    const tabBar = document.getElementById('tab-bar');
    const terminalsContainer = document.getElementById('terminals-container');
    const errorMessage = document.getElementById('error-message');
    const scrollToBottomBtn = document.getElementById('scroll-to-bottom-btn');
    const contextMenuElement = document.getElementById('context-menu');

    // Tab and terminal management
    const tabs = new Map(); // tabId -> { tabEl, wrapperEl, term, fitAddon }
    let activeTabId = null;

    // Timer for resize debounce
    const resizeTimers = new Map(); // tabId -> timeout

    // Claude Code running state management
    const claudeCodeState = new Map(); // tabId -> boolean

    // Scroll position state management (whether at the bottom)
    const isAtBottomState = new Map(); // tabId -> boolean

    // Stores scroll positions while the panel is hidden
    const savedScrollPositions = new Map(); // tabId -> boolean

    // Helper function to check whether at the bottom
    function isTerminalAtBottom(term) {
        const buffer = term.buffer.active;
        const baseY = buffer.baseY;
        const viewportY = buffer.viewportY;
        // At the bottom when baseY === viewportY
        return baseY === viewportY;
    }

    // Maximum number of wrapped lines joined when detecting links
    const MAX_WRAPPED_LINES = 20;

    // Tolerance for treating the end of a line as reaching the right edge
    // TUIs like Claude Code wrap while leaving a margin on the right, so an exact right-edge match cannot be used
    const WRAP_EDGE_TOLERANCE = 4;

    // Box border characters (vertical lines) drawn by TUIs
    const BOX_VERTICAL = '\u2502\u2503\u2506\u2507\u250a\u250b';

    // Margin and border characters at the start of a wrapped line
    const CONTINUATION_PREFIX = new RegExp('^ *(?:[' + BOX_VERTICAL + '] *)?');

    // Border characters at the end of a line
    const BORDER_SUFFIX = new RegExp(' *[' + BOX_VERTICAL + ']$');

    // Characters that may appear in the body of a URL (used to check the characters around a wrap position)
    const URL_BODY_CHAR = /[A-Za-z0-9\-._~:/?#@!$&*+,;=%]/;

    // URL detection pattern (WebLinksAddon default, plus exclusion of border and block characters)
    const URL_PATTERN = /(?:https?|HTTPS?):\/\/[^\s"'!*(){}|\\\^<>`\u2500-\u259f]*[^\s"':,.!?{}|\\\^~\[\]`()<>\u2500-\u259f]/g;

    /**
     * Read a buffer line and return the text and the cell coordinates of each character
     * Trailing whitespace and border characters are removed, but the original line end position is kept for wrap detection
     * @param {object} term - xterm instance
     * @param {number} y - Buffer line number (0-based)
     * @returns {{text: string, cells: Array<{x: number, y: number, width: number}>, isWrapped: boolean, contentEndX: number}|null}
     */
    function readBufferLine(term, y) {
        if (y < 0) {
            return null;
        }
        const line = term.buffer.active.getLine(y);
        if (!line) {
            return null;
        }

        const cell = term.buffer.active.getNullCell();
        let text = '';
        const cells = [];

        for (let x = 0; x < line.length; x++) {
            line.getCell(x, cell);
            const width = cell.getWidth();
            // Skip the trailing cell of a full-width character (width 0)
            if (width === 0) {
                continue;
            }
            const chars = cell.getChars() || ' ';
            for (const ch of chars) {
                text += ch;
                // Keep the indices of text and cells aligned even for surrogate pairs
                for (let i = 0; i < ch.length; i++) {
                    cells.push({ x: x, y: y, width: width });
                }
            }
        }

        // Remove trailing whitespace
        let end = text.length;
        while (end > 0 && text[end - 1] === ' ') {
            end--;
        }
        text = text.slice(0, end);
        cells.length = end;

        // Line end position before removing border characters (used for wrap detection)
        const lastCell = cells.length > 0 ? cells[cells.length - 1] : null;
        const contentEndX = lastCell ? lastCell.x + lastCell.width : 0;

        // Remove trailing border characters
        const borderMatch = text.match(BORDER_SUFFIX);
        if (borderMatch) {
            const cut = text.length - borderMatch[0].length;
            text = text.slice(0, cut);
            cells.length = cut;
        }

        return {
            text: text,
            cells: cells,
            isWrapped: line.isWrapped,
            contentEndX: contentEndX
        };
    }

    /**
     * Determine whether the next line is a continuation of the previous line, and return the number of leading characters to skip in the next line
     * Returns -1 if it is not a continuation
     *
     * Lines recorded by xterm as wrapped (isWrapped) are treated as continuations as is.
     * TUIs like Claude Code insert their own newlines, so isWrapped is not set,
     * and wrapped lines also start with indentation or border characters, so a line is treated as a continuation when:
     * - the previous line reaches near the right edge
     * - the characters before and after the line break can both appear in a URL
     */
    function getContinuationOffset(term, prevLine, nextLine) {
        if (nextLine.isWrapped) {
            return 0;
        }
        if (prevLine.contentEndX < term.cols - WRAP_EDGE_TOLERANCE) {
            return -1;
        }
        const prevLast = prevLine.text.slice(-1);
        if (!prevLast || !URL_BODY_CHAR.test(prevLast)) {
            return -1;
        }
        const prefixMatch = nextLine.text.match(CONTINUATION_PREFIX);
        const offset = prefixMatch ? prefixMatch[0].length : 0;
        const nextFirst = nextLine.text.charAt(offset);
        if (!nextFirst || !URL_BODY_CHAR.test(nextFirst)) {
            return -1;
        }
        return offset;
    }

    /**
     * Join the wrapped block containing the given line and return the text and the cell coordinates of each character
     * @param {object} term - xterm instance
     * @param {number} y - Buffer line number (0-based)
     * @returns {{text: string, cells: Array<{x: number, y: number, width: number}>}|null}
     */
    function readWrappedBlock(term, y) {
        const target = readBufferLine(term, y);
        if (!target) {
            return null;
        }

        // offset is the number of leading characters to skip when joining as a continuation of the previous line
        const entries = [{ line: target, offset: 0 }];

        // Walk upward
        for (let cur = y - 1; entries.length < MAX_WRAPPED_LINES; cur--) {
            const prev = readBufferLine(term, cur);
            if (!prev) {
                break;
            }
            const offset = getContinuationOffset(term, prev, entries[0].line);
            if (offset < 0) {
                break;
            }
            entries[0].offset = offset;
            entries.unshift({ line: prev, offset: 0 });
        }

        // Walk downward
        for (let cur = y + 1; entries.length < MAX_WRAPPED_LINES; cur++) {
            const next = readBufferLine(term, cur);
            if (!next) {
                break;
            }
            const offset = getContinuationOffset(term, entries[entries.length - 1].line, next);
            if (offset < 0) {
                break;
            }
            entries.push({ line: next, offset: offset });
        }

        let text = '';
        const cells = [];
        for (const entry of entries) {
            text += entry.line.text.slice(entry.offset);
            for (let i = entry.offset; i < entry.line.cells.length; i++) {
                cells.push(entry.line.cells[i]);
            }
        }

        return { text: text, cells: cells };
    }

    // Toggle the shortcut bar display
    function updateShortcutBar(isClaudeCodeRunning) {
        const notRunning = document.getElementById('shortcuts-not-running');
        const running = document.getElementById('shortcuts-running');
        if (isClaudeCodeRunning) {
            notRunning.classList.add('hidden');
            running.classList.remove('hidden');
        } else {
            notRunning.classList.remove('hidden');
            running.classList.add('hidden');
        }
    }

    /**
     * Update the loader display of a tab
     * @param {string} tabId - Tab ID
     * @param {boolean} isRunning - Whether Claude Code is running
     */
    function updateTabLoader(tabId, isRunning) {
        const tabElement = document.querySelector('[data-tab-id="' + tabId + '"]');
        if (!tabElement) {
            console.warn('[updateTabLoader] Tab element not found:', tabId);
            return;
        }

        const loader = tabElement.querySelector('.loader');
        if (!loader) {
            console.warn('[updateTabLoader] Loader element not found in tab:', tabId);
            return;
        }

        if (isRunning) {
            loader.classList.remove('hidden');
        } else {
            loader.classList.add('hidden');
        }
    }

    // Helper function to get colors from CSS variables
    function getCssVar(name, fallback) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return value || fallback;
    }

    // URL currently under the mouse (updated by the link provider's hover/leave)
    // Kept to determine which URL the menu is for when right-clicking
    let hoveredUrl = null;

    // Menu items shown when right-clicking a URL
    const URL_CONTEXT_MENU = [
        { title: 'Open in Default Browser', messageType: 'openUrl' },
        { title: 'Open in Integrated Browser', messageType: 'openUrlInIntegratedBrowser' }
    ];

    // Maximum number of URL characters shown in the menu
    const URL_LABEL_MAX_LENGTH = 60;

    /**
     * Show the context menu for a URL
     */
    function showUrlContextMenu(event, url) {
        contextMenuElement.textContent = '';

        // Show the target URL as the header
        const header = document.createElement('div');
        header.className = 'context-menu-header';
        header.textContent = url.length > URL_LABEL_MAX_LENGTH
            ? url.slice(0, URL_LABEL_MAX_LENGTH) + '…'
            : url;
        header.title = url;
        contextMenuElement.appendChild(header);

        const separator = document.createElement('div');
        separator.className = 'context-menu-separator';
        contextMenuElement.appendChild(separator);

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
    }

    function hideContextMenu() {
        contextMenuElement.classList.add('hidden');
    }

    // Show our own menu only when right-clicking on a URL
    // If preventDefault() is not called, the standard VSCode menu is shown
    document.addEventListener('contextmenu', (event) => {
        if (contextMenuElement.contains(event.target)) {
            return;
        }
        hideContextMenu();
        if (!hoveredUrl) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        showUrlContextMenu(event, hoveredUrl);
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

    // Shortcut that runs the Editor View Run command (same key binding as the Editor View)
    const IS_MAC = /mac/i.test(navigator.platform || navigator.userAgent);

    function isRunShortcut(event) {
        if (event.key !== 'r' && event.key !== 'R') {
            return false;
        }
        if (event.altKey || event.shiftKey) {
            return false;
        }
        return IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    }

    // Listen on document so it also works when focus is outside the terminal (tab bar etc.)
    // On the xterm side, attachCustomKeyEventHandler only suppresses sending to the PTY
    document.addEventListener('keydown', (event) => {
        if (!isRunShortcut(event)) {
            return;
        }
        event.preventDefault();
        vscode.postMessage({ type: 'runEditorTask' });
    });

    // Close on user-initiated scrolling (not on automatic scrolling caused by output)
    document.addEventListener('wheel', hideContextMenu, { passive: true });

    // Terminal settings (read from the data attribute of body)
    const terminalConfigStr = document.body.dataset.terminalConfig;

    let terminalConfig;
    try {
        terminalConfig = JSON.parse(terminalConfigStr);
    } catch (error) {
        console.error('[Terminal Config] Failed to parse config:', error);
        // Fallback settings
        terminalConfig = {
            fontSize: 12,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            cursorStyle: 'block',
            cursorBlink: true,
            scrollback: 1000
        };
    }

    // Create a new tab
    function createTab(tabId, shellName, tabIndex) {
        // Create the tab element
        const tabEl = document.createElement('div');
        tabEl.className = 'tab';
        tabEl.dataset.tabId = tabId;
        tabEl.innerHTML = `
            <span class="tab-title">
                <span class="loader hidden"></span>
                <span class="shell-name">${shellName}</span>
            </span>
        `;

        // Activate on tab click
        tabEl.addEventListener('click', () => {
            vscode.postMessage({ type: 'activateTab', tabId: tabId });
        });

        // Insert the tab before the + button
        const newTabButton = document.getElementById('new-tab-button');
        tabBar.insertBefore(tabEl, newTabButton);

        // Create the terminal wrapper (created as active so its size can be calculated)
        const wrapperEl = document.createElement('div');
        wrapperEl.className = 'terminal-wrapper active';
        wrapperEl.dataset.tabId = tabId;
        terminalsContainer.appendChild(wrapperEl);

        // Create the xterm instance
        const term = new Terminal({
            ...terminalConfig,
            allowProposedApi: true,  // Enable proposed APIs such as the Unicode11 Addon
            theme: {
                background: getCssVar('--vscode-terminal-background', '#1e1e1e'),
                foreground: getCssVar('--vscode-terminal-foreground', '#cccccc'),
                cursor: getCssVar('--vscode-terminalCursor-foreground', '#ffffff'),
                cursorAccent: getCssVar('--vscode-terminalCursor-background', '#000000'),
                selectionBackground: getCssVar('--vscode-terminal-selectionBackground', '#264f78')
            }
        });

        // Cmd+R / Ctrl+R is used to run the Editor View Run, so it is not sent to the PTY
        // (the message is sent by the document keydown handler)
        term.attachCustomKeyEventHandler((event) => !(event.type === 'keydown' && isRunShortcut(event)));

        // Load the Fit Addon
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);

        // Load the Unicode11 Addon (to correctly calculate the width of CJK characters such as Japanese)
        try {
            if (typeof Unicode11Addon !== 'undefined' && Unicode11Addon.Unicode11Addon) {
                const unicode11Addon = new Unicode11Addon.Unicode11Addon();
                term.loadAddon(unicode11Addon);
                term.unicode.activeVersion = '11';
            }
        } catch (e) {
            console.warn('Failed to load Unicode11 addon:', e);
        }

        // URL link provider (also joins and detects URLs split by wrapping)
        // Registered before the file path provider so that it takes precedence
        term.registerLinkProvider({
            provideLinks: (bufferLineNumber, callback) => {
                const targetY = bufferLineNumber - 1;
                const block = readWrappedBlock(term, targetY);
                if (!block || !block.text) {
                    callback(undefined);
                    return;
                }

                const links = [];
                URL_PATTERN.lastIndex = 0;
                let match;

                while ((match = URL_PATTERN.exec(block.text)) !== null) {
                    const url = match[0];
                    const startCell = block.cells[match.index];
                    const endCell = block.cells[match.index + url.length - 1];
                    if (!startCell || !endCell) {
                        continue;
                    }

                    // Do not return links that do not overlap the target line
                    if (endCell.y < targetY || startCell.y > targetY) {
                        continue;
                    }

                    links.push({
                        range: {
                            start: { x: startCell.x + 1, y: startCell.y + 1 },
                            end: { x: endCell.x + endCell.width, y: endCell.y + 1 }
                        },
                        text: url,
                        decorations: {
                            pointerCursor: true,
                            underline: true
                        },
                        activate: () => {
                            vscode.postMessage({ type: 'openUrl', url: url });
                        },
                        hover: () => {
                            hoveredUrl = url;
                        },
                        leave: () => {
                            if (hoveredUrl === url) {
                                hoveredUrl = null;
                            }
                        }
                    });
                }

                callback(links.length > 0 ? links : undefined);
            }
        });

        // Open the terminal
        term.open(wrapperEl);

        // Watch the scroll position and toggle the button visibility
        function updateScrollButtonVisibility(targetTabId) {
            const tabInfo = tabs.get(targetTabId);
            if (!tabInfo) return;

            // Check whether at the bottom
            const atBottom = isTerminalAtBottom(tabInfo.term);

            // Update the scroll position state (update the state of all tabs)
            isAtBottomState.set(targetTabId, atBottom);

            // Update the button visibility only for the active tab
            if (activeTabId === targetTabId) {
                const buffer = tabInfo.term.buffer.active;
                const baseY = buffer.baseY;
                const hasScrollback = baseY > 0;

                if (hasScrollback && !atBottom) {
                    scrollToBottomBtn.classList.remove('hidden');
                } else {
                    scrollToBottomBtn.classList.add('hidden');
                }
            }
        }

        // Watch the xterm.js onScroll event
        term.onScroll(() => {
            updateScrollButtonVisibility(tabId);
        });

        // Also watch the native scroll event of xterm-viewport (set after the DOM is built)
        requestAnimationFrame(() => {
            const viewport = wrapperEl.querySelector('.xterm-viewport');
            if (viewport) {
                viewport.addEventListener('scroll', () => {
                    updateScrollButtonVisibility(tabId);
                }, { passive: true });
            }
        });

        // Custom link provider (for file paths)
        term.registerLinkProvider({
            provideLinks: (bufferLineNumber, callback) => {
                const line = term.buffer.active.getLine(bufferLineNumber - 1);
                if (!line) {
                    callback(undefined);
                    return;
                }
                const text = line.translateToString();
                const links = [];

                // Match absolute paths (/), relative paths (./, ../) and hidden directories (.claude/ etc.)
                const filePattern = /(?:^|[\s'":([])((?:\.{1,2}\/|\.(?=[a-zA-Z_])|\/)[a-zA-Z0-9_.\-\/]*[a-zA-Z0-9_\-]\.[a-zA-Z0-9]+(?::\d+)?)/g;
                let match;

                while ((match = filePattern.exec(text)) !== null) {
                    const pathWithLine = match[1];
                    const startIndex = match.index + (match[0].length - match[1].length);

                    const lineMatch = pathWithLine.match(/:(\d+)$/);
                    const filePath = lineMatch ? pathWithLine.replace(/:(\d+)$/, '') : pathWithLine;
                    const lineNumber = lineMatch ? parseInt(lineMatch[1]) : undefined;

                    links.push({
                        range: {
                            start: { x: startIndex + 1, y: bufferLineNumber },
                            end: { x: startIndex + pathWithLine.length + 1, y: bufferLineNumber }
                        },
                        text: pathWithLine,
                        decorations: {
                            pointerCursor: true,
                            underline: true
                        },
                        activate: () => {
                            vscode.postMessage({
                                type: 'openFile',
                                path: filePath,
                                line: lineNumber
                            });
                        }
                    });
                }

                callback(links.length > 0 ? links : undefined);
            }
        });

        // Send user input to the Extension
        term.onData(data => {
            vscode.postMessage({ type: 'input', tabId: tabId, data: data });
        });

        // Save the tab info (resizeObserver is added later)
        const tabInfo = {
            tabEl: tabEl,
            wrapperEl: wrapperEl,
            term: term,
            fitAddon: fitAddon,
            resizeObserver: null
        };
        tabs.set(tabId, tabInfo);

        // Set the initial scroll position state (at the bottom)
        isAtBottomState.set(tabId, true);

        // Watch for resizing (with debounce)
        const resizeObserver = new ResizeObserver(() => {
            if (wrapperEl.classList.contains('active')) {
                // Clear the existing timer
                const existingTimer = resizeTimers.get(tabId);
                if (existingTimer) {
                    clearTimeout(existingTimer);
                }

                // Debounce: run after 200ms
                const timer = setTimeout(() => {
                    // Check whether it was at the bottom before resizing
                    const wasAtBottom = isAtBottomState.get(tabId);

                    try {
                        fitAddon.fit();
                        vscode.postMessage({
                            type: 'resize',
                            tabId: tabId,
                            cols: term.cols,
                            rows: term.rows
                        });

                        // If it was at the bottom, follow automatically
                        // Use two requestAnimationFrame calls so that scrolling happens after fit has completed
                        if (wasAtBottom) {
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    term.scrollToBottom();
                                    // Record that it is definitely at the bottom
                                    isAtBottomState.set(tabId, true);
                                });
                            });
                        }
                    } catch (e) {
                        console.error('Resize error:', e);
                    }

                    resizeTimers.delete(tabId);
                }, 200);

                resizeTimers.set(tabId, timer);
            }
        });
        resizeObserver.observe(wrapperEl);
        tabInfo.resizeObserver = resizeObserver;

        return tabInfo;
    }

    // Activate a tab
    function activateTab(tabId) {
        hideContextMenu();
        hoveredUrl = null;
        const tabInfo = tabs.get(tabId);
        if (!tabInfo) return;

        // Deactivate all tabs
        tabs.forEach((info, id) => {
            info.tabEl.classList.remove('active');
            info.wrapperEl.classList.remove('active');
        });

        // Activate the given tab
        tabInfo.tabEl.classList.add('active');
        tabInfo.wrapperEl.classList.add('active');
        activeTabId = tabId;

        // Update the shortcut bar state
        const isClaudeCodeRunning = claudeCodeState.get(tabId) || false;
        updateShortcutBar(isClaudeCodeRunning);

        // Update the scroll button visibility
        const buffer = tabInfo.term.buffer.active;
        const hasScrollback = buffer.baseY > 0;
        const isScrolledUp = buffer.viewportY < buffer.baseY;
        if (hasScrollback && isScrolledUp) {
            scrollToBottomBtn.classList.remove('hidden');
        } else {
            scrollToBottomBtn.classList.add('hidden');
        }

        // Fit adjustment and resize notification (run after DOM rendering)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Check whether it was at the bottom before the fit adjustment
                const wasAtBottom = isAtBottomState.get(tabId);

                tabInfo.fitAddon.fit();
                vscode.postMessage({
                    type: 'resize',
                    tabId: tabId,
                    cols: tabInfo.term.cols,
                    rows: tabInfo.term.rows
                });

                // If it was at the bottom, restore it after the fit adjustment
                if (wasAtBottom) {
                    requestAnimationFrame(() => {
                        tabInfo.term.scrollToBottom();
                        isAtBottomState.set(tabId, true);
                    });
                }

                tabInfo.term.focus();
            });
        });
    }

    // Close a tab
    function closeTab(tabId) {
        const tabInfo = tabs.get(tabId);
        if (!tabInfo) return;

        // Disconnect the ResizeObserver
        if (tabInfo.resizeObserver) {
            tabInfo.resizeObserver.disconnect();
        }

        // Clear the resize debounce timer
        const existingTimer = resizeTimers.get(tabId);
        if (existingTimer) {
            clearTimeout(existingTimer);
            resizeTimers.delete(tabId);
        }

        tabInfo.tabEl.remove();
        tabInfo.wrapperEl.remove();
        tabInfo.term.dispose();
        tabs.delete(tabId);

        // Clear the scroll position state
        isAtBottomState.delete(tabId);
    }

    // Handle messages from the Extension
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'tabCreated':
                createTab(message.tabId, message.shellName, message.tabIndex);
                errorMessage.style.display = 'none';
                break;
            case 'tabActivated':
                activateTab(message.tabId);
                break;
            case 'tabClosed':
                closeTab(message.tabId);
                break;
            case 'output':
                {
                    const tabInfo = tabs.get(message.tabId);
                    if (tabInfo) {
                        // Check whether it was at the bottom before output
                        const wasAtBottom = isAtBottomState.get(message.tabId);

                        // Use the write() callback to scroll after writing has completed
                        tabInfo.term.write(message.data, () => {
                            // If it was at the bottom, follow automatically
                            if (wasAtBottom) {
                                // Use two requestAnimationFrame calls to make sure the DOM has been updated
                                requestAnimationFrame(() => {
                                    requestAnimationFrame(() => {
                                        tabInfo.term.scrollToBottom();
                                        // Record that it is definitely at the bottom
                                        isAtBottomState.set(message.tabId, true);
                                    });
                                });
                            }
                        });
                    }
                }
                break;
            case 'clear':
                {
                    const tabInfo = tabs.get(message.tabId);
                    if (tabInfo) {
                        tabInfo.term.clear();
                    }
                }
                break;
            case 'error':
                errorMessage.textContent = message.message;
                errorMessage.style.display = 'block';
                break;
            case 'focus':
                if (activeTabId) {
                    const tabInfo = tabs.get(activeTabId);
                    if (tabInfo) {
                        tabInfo.term.focus();
                    }
                }
                break;
            case 'saveScrollPositions':
                {
                    // Save the current scroll positions of all tabs
                    tabs.forEach((tabInfo, tabId) => {
                        const atBottom = isTerminalAtBottom(tabInfo.term);
                        savedScrollPositions.set(tabId, atBottom);
                    });
                }
                break;
            case 'restoreScrollPositions':
                {
                    // Restore the scroll positions of all tabs
                    tabs.forEach((tabInfo, tabId) => {
                        // Use the saved scroll position (fall back to isAtBottomState if none)
                        const wasAtBottom = savedScrollPositions.has(tabId)
                            ? savedScrollPositions.get(tabId)
                            : isAtBottomState.get(tabId);

                        // Restore if it was at the bottom
                        if (wasAtBottom) {
                            // Use two requestAnimationFrame calls to make sure the DOM has been updated
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    tabInfo.term.scrollToBottom();
                                    // Record that it is definitely at the bottom
                                    isAtBottomState.set(tabId, true);
                                });
                            });
                        }
                    });
                }
                break;
            case 'claudeCodeStateChanged':
                {
                    claudeCodeState.set(message.tabId, message.isRunning);

                    // Update the loader display (based on the processing state)
                    const isProcessing = message.isProcessing !== undefined ? message.isProcessing : message.isRunning;
                    updateTabLoader(message.tabId, isProcessing);

                    // For the active tab, also update the shortcut bar
                    if (message.tabId === activeTabId) {
                        updateShortcutBar(message.isRunning);
                    }
                }
                break;
            case 'updateNewTabButtonVisibility':
                {
                    const newTabButton = document.getElementById('new-tab-button');
                    if (newTabButton) {
                        if (message.visible) {
                            newTabButton.style.display = 'flex';
                        } else {
                            newTabButton.style.display = 'none';
                        }
                    }
                }
                break;
            case 'sessionClosed':
                {
                    const tabInfo = tabs.get(message.tabId);
                    if (tabInfo) {
                        // Show the exit message in the terminal
                        tabInfo.term.write('\r\n\x1b[31m[Session closed - Exit code: ' + message.exitCode + ']\x1b[0m\r\n');

                        // Show the reconnect button
                        const tabElement = document.querySelector('[data-tab-id="' + message.tabId + '"]');
                        if (tabElement) {
                            const reconnectBtn = document.createElement('button');
                            reconnectBtn.className = 'reconnect-button';
                            reconnectBtn.textContent = 'Reconnect';
                            reconnectBtn.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 10px 20px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; z-index: 1000;';
                            reconnectBtn.onclick = () => {
                                vscode.postMessage({ type: 'reconnect', tabId: message.tabId });
                                reconnectBtn.remove();
                            };
                            tabElement.appendChild(reconnectBtn);
                        }
                    }
                }
                break;
            case 'sessionReconnected':
                {
                    const tabInfo = tabs.get(message.tabId);
                    if (tabInfo) {
                        // Show the reconnect message in the terminal
                        tabInfo.term.write('\r\n\x1b[32m[Session reconnected]\x1b[0m\r\n');
                    }
                }
                break;
            case 'updateTabCommandType':
                {
                    const tabElement = document.querySelector('[data-tab-id="' + message.tabId + '"]');
                    if (!tabElement) break;

                    const titleSpan = tabElement.querySelector('.tab-title');
                    if (!titleSpan) break;

                    // Get or create the existing loader and shell name elements
                    let loader = titleSpan.querySelector('.loader');
                    let shellNameSpan = titleSpan.querySelector('.shell-name');

                    if (!loader) {
                        loader = document.createElement('span');
                        loader.className = 'loader hidden';
                    }
                    if (!shellNameSpan) {
                        shellNameSpan = document.createElement('span');
                        shellNameSpan.className = 'shell-name';
                        // Extract the shell name from the old-format text
                        const currentText = titleSpan.textContent || '';
                        shellNameSpan.textContent = currentText.replace(/^[▶️📝📑]\s*/, '').trim();
                    }

                    // Keep the loader state
                    const isLoaderVisible = !loader.classList.contains('hidden');

                    // Create / update / remove the command icon
                    let commandIcon = titleSpan.querySelector('.command-icon');
                    if (message.commandType) {
                        if (!commandIcon) {
                            commandIcon = document.createElement('span');
                            commandIcon.className = 'command-icon';
                        }

                        const icons = {
                            'run': '▶️',
                            'plan': '📝',
                            'spec': '📑'
                        };
                        commandIcon.textContent = icons[message.commandType] || '';
                    } else if (commandIcon) {
                        commandIcon.remove();
                        commandIcon = null;
                    }

                    // Rebuild the tab title (command icon -> loader -> shell name)
                    titleSpan.innerHTML = '';
                    if (commandIcon) titleSpan.appendChild(commandIcon);
                    titleSpan.appendChild(loader);
                    titleSpan.appendChild(shellNameSpan);

                    // Restore the loader state
                    if (isLoaderVisible) {
                        loader.classList.remove('hidden');
                    } else {
                        loader.classList.add('hidden');
                    }
                }
                break;

            case 'updateTabName':
                {
                    const tabElement = document.querySelector('[data-tab-id="' + message.tabId + '"]');
                    if (!tabElement) {
                        break;
                    }

                    const titleSpan = tabElement.querySelector('.tab-title');
                    if (!titleSpan) {
                        break;
                    }

                    // Update the process name while keeping the existing icon
                    const commandIcon = titleSpan.querySelector('.command-icon');
                    const loader = titleSpan.querySelector('.loader');
                    let shellNameSpan = titleSpan.querySelector('.shell-name');

                    if (!shellNameSpan) {
                        shellNameSpan = document.createElement('span');
                        shellNameSpan.className = 'shell-name';
                    }

                    // Update the process name
                    shellNameSpan.textContent = message.processName;

                    // Keep the loader state
                    const isLoaderVisible = loader && !loader.classList.contains('hidden');

                    // Rebuild the tab title (command icon -> loader -> process name)
                    titleSpan.innerHTML = '';
                    if (commandIcon) titleSpan.appendChild(commandIcon);
                    if (loader) {
                        titleSpan.appendChild(loader);
                        // Restore the loader state
                        if (isLoaderVisible) {
                            loader.classList.remove('hidden');
                        } else {
                            loader.classList.add('hidden');
                        }
                    }
                    titleSpan.appendChild(shellNameSpan);
                }
                break;
        }
    });

    // Event handlers for the header buttons
    document.getElementById('new-tab-button')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'createTab' });
    });
    document.getElementById('clear-button')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'clearTerminal' });
    });
    document.getElementById('kill-button')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'killTerminal' });
    });

    // Event handlers for the shortcut buttons
    function sendShortcut(command, startsClaudeCode, execute = true) {
        if (!activeTabId) return;

        const tabInfo = tabs.get(activeTabId);
        if (tabInfo) {
            tabInfo.term.focus();
        }

        // Command sending is handled on the Extension side
        vscode.postMessage({
            type: 'sendShortcut',
            command: command,
            startsClaudeCode: startsClaudeCode,
            execute: execute
        });
    }

    // Only insert the command without running it (do not send a newline)
    function insertShortcut(command) {
        sendShortcut(command, false, false);
    }

    document.getElementById('btn-claude')?.addEventListener('click', () => sendShortcut('claude', true));
    document.getElementById('btn-claude-c')?.addEventListener('click', () => sendShortcut('claude -c', true));
    document.getElementById('btn-claude-r')?.addEventListener('click', () => sendShortcut('claude -r', true));
    document.getElementById('btn-claude-from-pr')?.addEventListener('click', () => insertShortcut('claude --from-pr '));
    document.getElementById('btn-claude-update')?.addEventListener('click', () => sendShortcut('claude update', false));
    document.getElementById('btn-model-sonnet')?.addEventListener('click', () => sendShortcut('/model sonnet', false));
    document.getElementById('btn-model-opus')?.addEventListener('click', () => sendShortcut('/model opus', false));
    document.getElementById('btn-compact')?.addEventListener('click', () => sendShortcut('/compact', false));
    document.getElementById('btn-clear')?.addEventListener('click', () => sendShortcut('/clear', false));
    document.getElementById('btn-exit')?.addEventListener('click', () => sendShortcut('/exit', false));

    // Event handler for the scroll button
    scrollToBottomBtn?.addEventListener('click', () => {
        if (activeTabId) {
            const tabInfo = tabs.get(activeTabId);
            if (tabInfo) {
                tabInfo.term.scrollToBottom();
                // Moved to the bottom, so update the state
                isAtBottomState.set(activeTabId, true);
                scrollToBottomBtn.classList.add('hidden');
                tabInfo.term.focus();
            }
        }
    });

    // Focus/blur handlers for visual focus indicator
    window.addEventListener('focus', () => {
        document.body.classList.add('focused');
    });
    window.addEventListener('blur', () => {
        document.body.classList.remove('focused');
    });

    // Notify that it is ready
    vscode.postMessage({ type: 'ready' });
})();
