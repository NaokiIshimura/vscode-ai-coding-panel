const vscode = acquireVsCodeApi();

const quickStartButton = document.getElementById('quick-start-button');
const listElement = document.getElementById('list');
const contextMenuElement = document.getElementById('context-menu');

// 内部ドラッグ用のMIMEタイプ（VS Codeのtext/uri-listと区別する）
const INTERNAL_MIME = 'application/vnd.aicodingsidebar.paths';

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
        { command: 'aiCodingSidebar.insertPathToTerminal', title: 'Insert Path to Terminal', icon: 'terminal' }
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

    // ディレクトリ・パス表示行はドロップ先になれる
    if (item.kind === 'directory' || item.kind === 'path' || item.kind === 'parent') {
        row.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            row.classList.add('drop-target');
        });
        row.addEventListener('dragleave', () => {
            row.classList.remove('drop-target');
        });
        row.addEventListener('drop', (event) => {
            event.preventDefault();
            event.stopPropagation();
            row.classList.remove('drop-target');
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
        button.title = entry.title;
        button.setAttribute('aria-label', entry.title);

        const icon = document.createElement('span');
        icon.className = `codicon codicon-${entry.icon}`;
        button.appendChild(icon);

        button.addEventListener('click', (event) => {
            // 行本体のクリック（ディレクトリ移動・ファイルを開く）を発火させない
            event.stopPropagation();
            executeItemCommand(entry.command, item);
        });

        container.appendChild(button);
    }

    return container;
}

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
 * ドロップされた内容を拡張側へ送信する
 */
function handleDrop(event, targetPath) {
    const internal = event.dataTransfer.getData(INTERNAL_MIME);
    if (internal) {
        try {
            const sources = JSON.parse(internal);
            if (Array.isArray(sources) && sources.length > 0) {
                vscode.postMessage({ type: 'drop', targetPath, sources });
                return;
            }
        } catch {
            // パースできない場合は外部ドロップとして扱う
        }
    }

    // VS Codeのエクスプローラー等からのドロップはtext/uri-listで届く
    const uriList = event.dataTransfer.getData('text/uri-list');
    if (uriList) {
        vscode.postMessage({ type: 'drop', targetPath, uriList });
    }
}

/**
 * コンテキストメニューを表示する
 */
function showContextMenu(event, item) {
    const entries = CONTEXT_MENUS[item.contextValue];
    if (!entries || entries.length === 0) {
        return;
    }

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

// 拡張側へ準備完了を通知
vscode.postMessage({ type: 'ready' });
