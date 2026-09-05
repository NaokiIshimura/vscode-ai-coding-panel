const vscode = acquireVsCodeApi();

const quickStartButton = document.getElementById('quick-start-button');
const listElement = document.getElementById('list');
const contextMenuElement = document.getElementById('context-menu');
const tooltipElement = document.getElementById('tooltip');

// 内部ドラッグ用のMIMEタイプ（VS Codeのtext/uri-listと区別する）
const INTERNAL_MIME = 'application/vnd.aicodingsidebar.paths';

// 外部からのドロップでURI一覧が入りうるMIMEタイプ（先頭から順に確認する）
const URI_LIST_MIMES = ['text/uri-list', 'application/vnd.code.uri-list'];

// VS CodeがリソースURIのJSON配列を入れるMIMEタイプ（DataTransfers.RESOURCES）
const RESOURCE_URLS_MIME = 'resourceurls';

// 内容を読み取って転送するドロップファイルの上限サイズ（50MB）
const MAX_DROP_FILE_SIZE = 50 * 1024 * 1024;

let items = [];
let selectedPath;

/**
 * コンテキストメニュー定義
 * contextValueごとに表示するコマンドを出し分ける
 * （旧 package.json の view/item/context 定義を踏襲）
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
 * 行ホバー時に表示するインラインアクション定義
 * （旧 package.json の view/item/context の inline グループを踏襲）
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

/**
 * 選択された行に対してコマンドを実行するよう拡張側へ依頼する
 */
function executeItemCommand(commandId, item) {
    vscode.postMessage({
        type: 'command',
        commandId,
        filePath: item.filePath,
        isDirectory: item.kind === 'directory' || item.kind === 'path' || item.kind === 'parent',
        label: item.label,
        // archiveDirectoryが 'pathDisplayNonRoot' を判定するため引き継ぐ
        contextValue: item.contextValue
    });
}

// メッセージを受信
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'update':
            items = message.items || [];
            selectedPath = message.selectedPath;
            render(message.message);
            break;
        case 'select':
            selectedPath = message.filePath;
            updateSelection();
            break;
    }
});

/**
 * 一覧を描画する
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
 * 1行分の要素を生成する
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

    // ファイル・ディレクトリのみドラッグ可能
    if (item.kind === 'file' || item.kind === 'directory') {
        row.draggable = true;
        row.addEventListener('dragstart', (event) => {
            event.dataTransfer.setData(INTERNAL_MIME, JSON.stringify([item.filePath]));
            event.dataTransfer.effectAllowed = 'copy';
        });
    }

    // ディレクトリ・パス表示行は個別のドロップ先になれる
    // （ファイル行や空白領域へのドロップはビュー全体のハンドラが現在のディレクトリとして受ける）
    if (item.kind === 'directory' || item.kind === 'path' || item.kind === 'parent') {
        row.addEventListener('dragenter', (event) => {
            event.preventDefault();
        });
        row.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'copy';
            row.classList.add('drop-target');
            // 行のハイライトとビュー全体のハイライトを二重に出さない
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
 * 行ホバー時に表示するインラインアクションボタン群を生成する
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
        // 空のtitleで行（ファイルパス）のネイティブツールチップを抑止し、代わりに自前のものを表示する
        button.title = '';
        button.setAttribute('aria-label', entry.title);

        const icon = document.createElement('span');
        icon.className = `codicon codicon-${entry.icon}`;
        button.appendChild(icon);

        attachTooltip(button, entry.title);

        button.addEventListener('click', (event) => {
            // 行本体のクリック（ディレクトリ移動・ファイルを開く）を発火させない
            event.stopPropagation();
            hideTooltip();
            executeItemCommand(entry.command, item);
        });

        container.appendChild(button);
    }

    return container;
}

// ツールチップ表示までの待ち時間（ms）
const TOOLTIP_DELAY = 300;
// 要素とツールチップの間隔（px）
const TOOLTIP_GAP = 4;

let tooltipTimer;

/**
 * 要素にホバーしたらツールチップを表示するよう登録する
 * （Webviewではネイティブのtitleツールチップが表示されないことがあるため自前で描画する）
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
 * 対象要素の下（はみ出す場合は上）にツールチップを表示する
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

// 一覧のスクロールやフォーカス喪失で位置がずれるため閉じる
listElement.addEventListener('scroll', hideTooltip);
window.addEventListener('blur', hideTooltip);

/**
 * 選択状態の表示を更新する
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
 * ビュー全体をドロップ先として登録する
 * 行の上以外（空白領域・ファイル行）へのドロップは、現在表示中のディレクトリを対象にする
 */
function setupViewDropTarget() {
    document.addEventListener('dragenter', (event) => {
        event.preventDefault();
    });

    document.addEventListener('dragover', (event) => {
        // preventDefaultしないとdropが発火せず、Webviewがドロップされたファイルへ遷移してしまう
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        document.body.classList.add('drag-over');
    });

    document.addEventListener('dragleave', (event) => {
        // 子要素間の移動でも発火するため、ビューの外へ出たときだけ解除する
        if (!event.relatedTarget) {
            clearViewDropHighlight();
        }
    });

    document.addEventListener('dragend', clearViewDropHighlight);

    document.addEventListener('drop', (event) => {
        event.preventDefault();
        clearViewDropHighlight();
        // targetPathを渡さないことで、拡張側が現在のディレクトリを使う
        handleDrop(event);
    });
}

/**
 * ビュー全体のドロップ中ハイライトを解除する
 */
function clearViewDropHighlight() {
    document.body.classList.remove('drag-over');
}

/**
 * ドロップされた内容を拡張側へ送信する
 * targetPathを省略した場合は現在表示中のディレクトリが対象になる
 */
function handleDrop(event, targetPath) {
    const sources = readInternalSources(event.dataTransfer);
    if (sources.length > 0) {
        vscode.postMessage({ type: 'drop', targetPath, sources });
        return;
    }

    // パスが分かる場合はそのままコピーさせる（内容の読み取りが不要で確実）
    const uriList = readUriList(event.dataTransfer);
    if (hasFileUri(uriList)) {
        vscode.postMessage({ type: 'drop', targetPath, uriList });
        return;
    }

    // FinderやVS Codeのエクスプローラーからのドロップは、Webviewからは絶対パスを取得できない
    // （ElectronのFile.pathは廃止済み）ため、内容そのものを読み取って拡張側へ渡す
    const dropped = readDroppedEntries(event.dataTransfer);
    if (dropped.files.length > 0 || dropped.directories.length > 0) {
        sendDroppedFileContents(dropped, targetPath);
        return;
    }

    vscode.postMessage({ type: 'dropUnsupported' });
}

/**
 * ドロップされたファイルをイベント処理中に同期的に取り出す
 * DataTransferはハンドラを抜けると読めなくなるため、Fileオブジェクトをここで確保しておく
 */
function readDroppedEntries(dataTransfer) {
    const files = [];
    const directories = [];

    if (dataTransfer.items && dataTransfer.items.length > 0) {
        for (const item of dataTransfer.items) {
            if (item.kind !== 'file') {
                continue;
            }

            // ディレクトリはFile APIから中身を読めないため対象外にする
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
 * ドロップされたファイルの内容を読み取って拡張側へ送る
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
 * 内容をpostMessageで送れるようbase64へ変換する
 */
function encodeBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    // 一度に渡すと引数が多すぎてスタックが溢れるため分割する
    const chunkSize = 0x8000;
    let binary = '';

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
    }

    return btoa(binary);
}

/**
 * URI一覧にfileスキームのURIが含まれるかを判定する
 * リンクのドロップなどコピー元にできないURIしか無い場合は、内容の読み取りへ回す
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
 * ビュー内でのドラッグで設定したパス一覧を読み取る
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
        // パースできない場合は外部ドロップとして扱う
        return [];
    }
}

/**
 * 外部からのドロップに含まれるURI一覧を改行区切りで読み取る
 * ドラッグ元によって使われるMIMEタイプが異なるため順に確認する
 */
function readUriList(dataTransfer) {
    for (const mime of URI_LIST_MIMES) {
        const value = dataTransfer.getData(mime);
        if (value) {
            return value;
        }
    }

    // VS Codeのエクスプローラーはリソース一覧をJSON配列で渡すことがある
    const resourceUrls = dataTransfer.getData(RESOURCE_URLS_MIME);
    if (resourceUrls) {
        try {
            const parsed = JSON.parse(resourceUrls);
            if (Array.isArray(parsed)) {
                return parsed.join('\n');
            }
        } catch {
            // パースできない場合は無視
        }
    }

    return '';
}

/**
 * コンテキストメニューを表示する
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

document.addEventListener('click', (event) => {
    if (!contextMenuElement.contains(event.target)) {
        hideContextMenu();
    }
});

document.addEventListener('contextmenu', (event) => {
    // 行以外の場所ではメニューを閉じる
    if (!event.target.closest('.row')) {
        hideContextMenu();
    }
});

// キーボード操作（↑↓で選択移動、Enterで実行）
listElement.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'Enter') {
        return;
    }

    const currentIndex = items.findIndex(item => item.filePath === selectedPath);

    if (event.key === 'Enter') {
        if (currentIndex >= 0) {
            const item = items[currentIndex];
            vscode.postMessage({ type: 'itemClick', kind: item.kind, filePath: item.filePath });
        }
        event.preventDefault();
        return;
    }

    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = currentIndex < 0
        ? (delta > 0 ? 0 : items.length - 1)
        : Math.min(items.length - 1, Math.max(0, currentIndex + delta));

    if (items[nextIndex]) {
        selectedPath = items[nextIndex].filePath;
        updateSelection();
        const selectedRow = listElement.querySelector('.row.selected');
        if (selectedRow) {
            selectedRow.scrollIntoView({ block: 'nearest' });
        }
    }
    event.preventDefault();
});

setupViewDropTarget();

// 拡張側へ準備完了を通知
vscode.postMessage({ type: 'ready' });
