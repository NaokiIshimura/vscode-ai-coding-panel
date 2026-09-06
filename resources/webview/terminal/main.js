(function() {
    const vscode = acquireVsCodeApi();
    const tabBar = document.getElementById('tab-bar');
    const terminalsContainer = document.getElementById('terminals-container');
    const errorMessage = document.getElementById('error-message');
    const scrollToBottomBtn = document.getElementById('scroll-to-bottom-btn');
    const contextMenuElement = document.getElementById('context-menu');

    // タブとターミナルの管理
    const tabs = new Map(); // tabId -> { tabEl, wrapperEl, term, fitAddon }
    let activeTabId = null;

    // リサイズデバウンス用タイマー
    const resizeTimers = new Map(); // tabId -> timeout

    // Claude Code起動状態の管理
    const claudeCodeState = new Map(); // tabId -> boolean

    // スクロール位置の状態管理（最下部にいるかどうか）
    const isAtBottomState = new Map(); // tabId -> boolean

    // パネル非表示時のスクロール位置保存用
    const savedScrollPositions = new Map(); // tabId -> boolean

    // 最下部判定のヘルパー関数
    function isTerminalAtBottom(term) {
        const buffer = term.buffer.active;
        const baseY = buffer.baseY;
        const viewportY = buffer.viewportY;
        // baseY === viewportY の場合、最下部にいる
        return baseY === viewportY;
    }

    // リンク検出時に結合する折り返し行の上限
    const MAX_WRAPPED_LINES = 20;

    // 行末が右端に達しているとみなす許容幅
    // Claude CodeのようなTUIは右側に余白を残して折り返すため、厳密な右端一致では判定できない
    const WRAP_EDGE_TOLERANCE = 4;

    // TUIが描画するボックスの罫線（縦線）
    const BOX_VERTICAL = '\u2502\u2503\u2506\u2507\u250a\u250b';

    // 折り返し行の先頭に付く余白・罫線
    const CONTINUATION_PREFIX = new RegExp('^ *(?:[' + BOX_VERTICAL + '] *)?');

    // 行末に付く罫線
    const BORDER_SUFFIX = new RegExp(' *[' + BOX_VERTICAL + ']$');

    // URLの本体に現れうる文字（折り返し位置の前後判定に使用）
    const URL_BODY_CHAR = /[A-Za-z0-9\-._~:/?#@!$&*+,;=%]/;

    // URL検出パターン（WebLinksAddonのデフォルトに罫線・ブロック文字の除外を追加）
    const URL_PATTERN = /(?:https?|HTTPS?):\/\/[^\s"'!*(){}|\\\^<>`\u2500-\u259f]*[^\s"':,.!?{}|\\\^~\[\]`()<>\u2500-\u259f]/g;

    /**
     * バッファ行を読み取り、文字列と各文字のセル座標を返す
     * 行末の空白と罫線は除去するが、折り返し判定用に元の行末位置は保持する
     * @param {object} term - xtermインスタンス
     * @param {number} y - バッファ行番号（0始まり）
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
            // 全角文字の後続セル（幅0）はスキップ
            if (width === 0) {
                continue;
            }
            const chars = cell.getChars() || ' ';
            for (const ch of chars) {
                text += ch;
                // サロゲートペアでも text の添字と cells の添字を一致させる
                for (let i = 0; i < ch.length; i++) {
                    cells.push({ x: x, y: y, width: width });
                }
            }
        }

        // 行末の空白を除去
        let end = text.length;
        while (end > 0 && text[end - 1] === ' ') {
            end--;
        }
        text = text.slice(0, end);
        cells.length = end;

        // 罫線を除去する前の行末位置（折り返し判定に使用）
        const lastCell = cells.length > 0 ? cells[cells.length - 1] : null;
        const contentEndX = lastCell ? lastCell.x + lastCell.width : 0;

        // 行末の罫線を除去
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
     * 次の行を前の行の続きとみなせるかを判定し、次の行から読み飛ばす先頭文字数を返す
     * 続きでない場合は -1 を返す
     *
     * xtermが折り返しとして記録している行（isWrapped）はそのまま続きとみなす。
     * Claude CodeのようなTUIは自前で改行を挿入するためisWrappedが立たず、
     * さらに折り返し行の先頭にインデントや罫線が入るため、以下の条件で続きと判定する:
     * - 前の行が右端付近まで達している
     * - 改行位置の前後の文字がいずれもURLに現れうる文字である
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
     * 指定行を含む折り返しブロックを結合し、文字列と各文字のセル座標を返す
     * @param {object} term - xtermインスタンス
     * @param {number} y - バッファ行番号（0始まり）
     * @returns {{text: string, cells: Array<{x: number, y: number, width: number}>}|null}
     */
    function readWrappedBlock(term, y) {
        const target = readBufferLine(term, y);
        if (!target) {
            return null;
        }

        // offset は前の行の続きとして結合する際に読み飛ばす先頭文字数
        const entries = [{ line: target, offset: 0 }];

        // 上方向へ遡る
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

        // 下方向へ辿る
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

    // ショートカットバーの表示切り替え
    function updateShortcutBar(isClaudeCodeRunning) {
        const notRunning = document.getElementById('shortcuts-not-running');
        const updateGroup = document.getElementById('shortcuts-update');
        const running = document.getElementById('shortcuts-running');
        if (isClaudeCodeRunning) {
            notRunning.classList.add('hidden');
            updateGroup.classList.add('hidden');
            running.classList.remove('hidden');
        } else {
            notRunning.classList.remove('hidden');
            updateGroup.classList.add('hidden');
            running.classList.add('hidden');
        }
    }

    /**
     * タブのローダー表示を更新
     * @param {string} tabId - タブID
     * @param {boolean} isRunning - Claude Code実行中か
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

    // CSS変数から色を取得するヘルパー関数
    function getCssVar(name, fallback) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return value || fallback;
    }

    // 現在マウスが乗っているURL（リンクプロバイダーのhover/leaveで更新）
    // 右クリック時にどのURLに対するメニューかを判定するために保持する
    let hoveredUrl = null;

    // URL右クリック時のメニュー項目
    const URL_CONTEXT_MENU = [
        { title: 'Open in Default Browser', messageType: 'openUrl' },
        { title: 'Open in Integrated Browser', messageType: 'openUrlInIntegratedBrowser' }
    ];

    // メニューに表示するURLの最大文字数
    const URL_LABEL_MAX_LENGTH = 60;

    /**
     * URLのコンテキストメニューを表示する
     */
    function showUrlContextMenu(event, url) {
        contextMenuElement.textContent = '';

        // 対象URLを見出しとして表示する
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

        // 画面外にはみ出さないように位置を調整
        const menuRect = contextMenuElement.getBoundingClientRect();
        const left = Math.min(event.clientX, window.innerWidth - menuRect.width - 4);
        const top = Math.min(event.clientY, window.innerHeight - menuRect.height - 4);
        contextMenuElement.style.left = `${Math.max(0, left)}px`;
        contextMenuElement.style.top = `${Math.max(0, top)}px`;
    }

    function hideContextMenu() {
        contextMenuElement.classList.add('hidden');
    }

    // URL上での右クリックのみ自前のメニューを表示する
    // preventDefault() を呼ばない場合はVSCode標準のメニューが表示される
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

    // ユーザー操作によるスクロールでは閉じる（出力による自動スクロールでは閉じない）
    document.addEventListener('wheel', hideContextMenu, { passive: true });

    // ターミナル設定（bodyのdata属性から読み取る）
    const terminalConfigStr = document.body.dataset.terminalConfig;

    let terminalConfig;
    try {
        terminalConfig = JSON.parse(terminalConfigStr);
    } catch (error) {
        console.error('[Terminal Config] Failed to parse config:', error);
        // フォールバック設定
        terminalConfig = {
            fontSize: 12,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            cursorStyle: 'block',
            cursorBlink: true,
            scrollback: 1000
        };
    }

    // 新しいタブを作成
    function createTab(tabId, shellName, tabIndex) {
        // タブ要素を作成
        const tabEl = document.createElement('div');
        tabEl.className = 'tab';
        tabEl.dataset.tabId = tabId;
        tabEl.innerHTML = `
            <span class="tab-title">
                <span class="loader hidden"></span>
                <span class="shell-name">${shellName}</span>
            </span>
        `;

        // タブクリックでアクティブ化
        tabEl.addEventListener('click', () => {
            vscode.postMessage({ type: 'activateTab', tabId: tabId });
        });

        // +ボタンの前にタブを挿入
        const newTabButton = document.getElementById('new-tab-button');
        tabBar.insertBefore(tabEl, newTabButton);

        // ターミナルラッパーを作成（activeで作成してサイズ計算を可能に）
        const wrapperEl = document.createElement('div');
        wrapperEl.className = 'terminal-wrapper active';
        wrapperEl.dataset.tabId = tabId;
        terminalsContainer.appendChild(wrapperEl);

        // xtermインスタンスを作成
        const term = new Terminal({
            ...terminalConfig,
            allowProposedApi: true,  // Unicode11 Addonなどの提案APIを有効化
            theme: {
                background: getCssVar('--vscode-terminal-background', '#1e1e1e'),
                foreground: getCssVar('--vscode-terminal-foreground', '#cccccc'),
                cursor: getCssVar('--vscode-terminalCursor-foreground', '#ffffff'),
                cursorAccent: getCssVar('--vscode-terminalCursor-background', '#000000'),
                selectionBackground: getCssVar('--vscode-terminal-selectionBackground', '#264f78')
            }
        });

        // Fit Addonをロード
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);

        // Unicode11 Addonをロード（日本語などのCJK文字の幅を正しく計算）
        try {
            if (typeof Unicode11Addon !== 'undefined' && Unicode11Addon.Unicode11Addon) {
                const unicode11Addon = new Unicode11Addon.Unicode11Addon();
                term.loadAddon(unicode11Addon);
                term.unicode.activeVersion = '11';
            }
        } catch (e) {
            console.warn('Failed to load Unicode11 addon:', e);
        }

        // URLリンクプロバイダー（折り返しで分断されたURLも結合して検出）
        // ファイルパス用プロバイダーより先に登録して優先させる
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

                    // 対象行にかからないリンクは返さない
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

        // ターミナルを開く
        term.open(wrapperEl);

        // スクロール位置を監視してボタンの表示/非表示を切り替え
        function updateScrollButtonVisibility(targetTabId) {
            const tabInfo = tabs.get(targetTabId);
            if (!tabInfo) return;

            // 最下部にいるかどうかを判定
            const atBottom = isTerminalAtBottom(tabInfo.term);

            // スクロール位置の状態を更新（全タブの状態を更新）
            isAtBottomState.set(targetTabId, atBottom);

            // アクティブタブの場合のみボタンの表示/非表示を更新
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

        // xterm.jsのonScrollイベントを監視
        term.onScroll(() => {
            updateScrollButtonVisibility(tabId);
        });

        // xterm-viewportのネイティブスクロールイベントも監視（DOM構築後に設定）
        requestAnimationFrame(() => {
            const viewport = wrapperEl.querySelector('.xterm-viewport');
            if (viewport) {
                viewport.addEventListener('scroll', () => {
                    updateScrollButtonVisibility(tabId);
                }, { passive: true });
            }
        });

        // カスタムリンクプロバイダー（ファイルパス用）
        term.registerLinkProvider({
            provideLinks: (bufferLineNumber, callback) => {
                const line = term.buffer.active.getLine(bufferLineNumber - 1);
                if (!line) {
                    callback(undefined);
                    return;
                }
                const text = line.translateToString();
                const links = [];

                // 絶対パス（/）・相対パス（./、../）・隠しディレクトリ（.claude/など）をマッチ
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

        // ユーザー入力をExtensionに送信
        term.onData(data => {
            vscode.postMessage({ type: 'input', tabId: tabId, data: data });
        });

        // タブ情報を保存（resizeObserverは後で追加）
        const tabInfo = {
            tabEl: tabEl,
            wrapperEl: wrapperEl,
            term: term,
            fitAddon: fitAddon,
            resizeObserver: null
        };
        tabs.set(tabId, tabInfo);

        // スクロール位置の初期状態を設定（最下部にいる状態）
        isAtBottomState.set(tabId, true);

        // リサイズを監視（デバウンス付き）
        const resizeObserver = new ResizeObserver(() => {
            if (wrapperEl.classList.contains('active')) {
                // 既存のタイマーをクリア
                const existingTimer = resizeTimers.get(tabId);
                if (existingTimer) {
                    clearTimeout(existingTimer);
                }

                // デバウンス: 200ms後に実行
                const timer = setTimeout(() => {
                    // リサイズ前に最下部にいたかどうかを確認
                    const wasAtBottom = isAtBottomState.get(tabId);

                    try {
                        fitAddon.fit();
                        vscode.postMessage({
                            type: 'resize',
                            tabId: tabId,
                            cols: term.cols,
                            rows: term.rows
                        });

                        // 最下部にいた場合は自動的に追従
                        // fitの処理が完了してからスクロールするため、2回のrequestAnimationFrameを使用
                        if (wasAtBottom) {
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    term.scrollToBottom();
                                    // 確実に最下部にいることを記録
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

    // タブをアクティブ化
    function activateTab(tabId) {
        hideContextMenu();
        hoveredUrl = null;
        const tabInfo = tabs.get(tabId);
        if (!tabInfo) return;

        // すべてのタブを非アクティブ化
        tabs.forEach((info, id) => {
            info.tabEl.classList.remove('active');
            info.wrapperEl.classList.remove('active');
        });

        // 指定タブをアクティブ化
        tabInfo.tabEl.classList.add('active');
        tabInfo.wrapperEl.classList.add('active');
        activeTabId = tabId;

        // ショートカットバーの状態を更新
        const isClaudeCodeRunning = claudeCodeState.get(tabId) || false;
        updateShortcutBar(isClaudeCodeRunning);

        // スクロールボタンの表示状態を更新
        const buffer = tabInfo.term.buffer.active;
        const hasScrollback = buffer.baseY > 0;
        const isScrolledUp = buffer.viewportY < buffer.baseY;
        if (hasScrollback && isScrolledUp) {
            scrollToBottomBtn.classList.remove('hidden');
        } else {
            scrollToBottomBtn.classList.add('hidden');
        }

        // フィット調整とリサイズ通知（DOMレンダリング後に実行）
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // フィット調整前に最下部にいたかどうかを確認
                const wasAtBottom = isAtBottomState.get(tabId);

                tabInfo.fitAddon.fit();
                vscode.postMessage({
                    type: 'resize',
                    tabId: tabId,
                    cols: tabInfo.term.cols,
                    rows: tabInfo.term.rows
                });

                // 最下部にいた場合は、フィット調整後に復元
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

    // タブを閉じる
    function closeTab(tabId) {
        const tabInfo = tabs.get(tabId);
        if (!tabInfo) return;

        // ResizeObserverを切断
        if (tabInfo.resizeObserver) {
            tabInfo.resizeObserver.disconnect();
        }

        // リサイズデバウンスタイマーをクリア
        const existingTimer = resizeTimers.get(tabId);
        if (existingTimer) {
            clearTimeout(existingTimer);
            resizeTimers.delete(tabId);
        }

        tabInfo.tabEl.remove();
        tabInfo.wrapperEl.remove();
        tabInfo.term.dispose();
        tabs.delete(tabId);

        // スクロール位置の状態をクリア
        isAtBottomState.delete(tabId);
    }

    // Extensionからのメッセージを処理
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
                        // 出力前に最下部にいたかどうかを確認
                        const wasAtBottom = isAtBottomState.get(message.tabId);

                        // write()のコールバックを使用して、書き込み完了後にスクロール
                        tabInfo.term.write(message.data, () => {
                            // 最下部にいた場合は自動的に追従
                            if (wasAtBottom) {
                                // DOM更新を確実に待つため、2回のrequestAnimationFrameを使用
                                requestAnimationFrame(() => {
                                    requestAnimationFrame(() => {
                                        tabInfo.term.scrollToBottom();
                                        // 確実に最下部にいることを記録
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
                    // 全タブの現在のスクロール位置を保存
                    tabs.forEach((tabInfo, tabId) => {
                        const atBottom = isTerminalAtBottom(tabInfo.term);
                        savedScrollPositions.set(tabId, atBottom);
                    });
                }
                break;
            case 'restoreScrollPositions':
                {
                    // 全タブのスクロール位置を復元
                    tabs.forEach((tabInfo, tabId) => {
                        // 保存されたスクロール位置を使用（なければisAtBottomStateを使用）
                        const wasAtBottom = savedScrollPositions.has(tabId)
                            ? savedScrollPositions.get(tabId)
                            : isAtBottomState.get(tabId);

                        // 最下部にいた場合は復元
                        if (wasAtBottom) {
                            // DOM更新を確実に待つため、2回のrequestAnimationFrameを使用
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    tabInfo.term.scrollToBottom();
                                    // 確実に最下部にいることを記録
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

                    // ローダー表示を更新（処理中状態に基づく）
                    const isProcessing = message.isProcessing !== undefined ? message.isProcessing : message.isRunning;
                    updateTabLoader(message.tabId, isProcessing);

                    // アクティブタブの場合、ショートカットバーも更新
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
                        // ターミナルに終了メッセージを表示
                        tabInfo.term.write('\r\n\x1b[31m[Session closed - Exit code: ' + message.exitCode + ']\x1b[0m\r\n');

                        // 再接続ボタンを表示
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
                        // ターミナルに再接続メッセージを表示
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

                    // 既存のローダーとシェル名要素を取得または作成
                    let loader = titleSpan.querySelector('.loader');
                    let shellNameSpan = titleSpan.querySelector('.shell-name');

                    if (!loader) {
                        loader = document.createElement('span');
                        loader.className = 'loader hidden';
                    }
                    if (!shellNameSpan) {
                        shellNameSpan = document.createElement('span');
                        shellNameSpan.className = 'shell-name';
                        // 旧形式のテキストからシェル名を抽出
                        const currentText = titleSpan.textContent || '';
                        shellNameSpan.textContent = currentText.replace(/^[▶️📝📑]\s*/, '').trim();
                    }

                    // ローダーの状態を保持
                    const isLoaderVisible = !loader.classList.contains('hidden');

                    // コマンドアイコンを作成/更新/削除
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

                    // タブタイトルを再構築（コマンドアイコン -> ローダー -> シェル名）
                    titleSpan.innerHTML = '';
                    if (commandIcon) titleSpan.appendChild(commandIcon);
                    titleSpan.appendChild(loader);
                    titleSpan.appendChild(shellNameSpan);

                    // ローダーの状態を復元
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

                    // 既存のアイコンを保持しつつ、プロセス名を更新
                    const commandIcon = titleSpan.querySelector('.command-icon');
                    const loader = titleSpan.querySelector('.loader');
                    let shellNameSpan = titleSpan.querySelector('.shell-name');

                    if (!shellNameSpan) {
                        shellNameSpan = document.createElement('span');
                        shellNameSpan.className = 'shell-name';
                    }

                    // プロセス名を更新
                    shellNameSpan.textContent = message.processName;

                    // ローダーの状態を保持
                    const isLoaderVisible = loader && !loader.classList.contains('hidden');

                    // タブタイトルを再構築（コマンドアイコン -> ローダー -> プロセス名）
                    titleSpan.innerHTML = '';
                    if (commandIcon) titleSpan.appendChild(commandIcon);
                    if (loader) {
                        titleSpan.appendChild(loader);
                        // ローダーの状態を復元
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

    // ヘッダーボタンのイベントハンドラ
    document.getElementById('new-tab-button')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'createTab' });
    });
    document.getElementById('clear-button')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'clearTerminal' });
    });
    document.getElementById('kill-button')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'killTerminal' });
    });

    // ショートカットボタンのイベントハンドラ
    function sendShortcut(command, startsClaudeCode) {
        if (!activeTabId) return;

        const tabInfo = tabs.get(activeTabId);
        if (tabInfo) {
            tabInfo.term.focus();
        }

        // Extension側でコマンド送信を処理
        vscode.postMessage({
            type: 'sendShortcut',
            command: command,
            startsClaudeCode: startsClaudeCode
        });
    }

    document.getElementById('btn-claude')?.addEventListener('click', () => sendShortcut('claude', true));
    document.getElementById('btn-claude-c')?.addEventListener('click', () => sendShortcut('claude -c', true));
    document.getElementById('btn-claude-r')?.addEventListener('click', () => sendShortcut('claude -r', true));
    document.getElementById('btn-claude-update')?.addEventListener('click', () => sendShortcut('claude update', false));
    document.getElementById('btn-model-sonnet')?.addEventListener('click', () => sendShortcut('/model sonnet', false));
    document.getElementById('btn-model-opus')?.addEventListener('click', () => sendShortcut('/model opus', false));
    document.getElementById('btn-compact')?.addEventListener('click', () => sendShortcut('/compact', false));
    document.getElementById('btn-clear')?.addEventListener('click', () => sendShortcut('/clear', false));

    // ↑ボタン: not-running → update グループ切り替え
    document.getElementById('toggle-update-shortcuts')?.addEventListener('click', () => {
        document.getElementById('shortcuts-not-running').classList.add('hidden');
        document.getElementById('shortcuts-update').classList.remove('hidden');
    });

    // ←ボタン（updateグループ）: update → not-running グループ切り替え
    document.getElementById('toggle-update-back')?.addEventListener('click', () => {
        document.getElementById('shortcuts-update').classList.add('hidden');
        document.getElementById('shortcuts-not-running').classList.remove('hidden');
    });

    // ←ボタン（runningグループ）: running → not-running グループ切り替え
    document.getElementById('toggle-shortcuts-2')?.addEventListener('click', () => {
        if (!activeTabId) return;
        claudeCodeState.set(activeTabId, false);
        updateShortcutBar(false);
        vscode.postMessage({ type: 'setClaudeCodeRunning', tabId: activeTabId, isRunning: false });
    });

    // スクロールボタンのイベントハンドラ
    scrollToBottomBtn?.addEventListener('click', () => {
        if (activeTabId) {
            const tabInfo = tabs.get(activeTabId);
            if (tabInfo) {
                tabInfo.term.scrollToBottom();
                // 最下部に移動したので状態を更新
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

    // 準備完了を通知
    vscode.postMessage({ type: 'ready' });
})();
