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
const linkOverlay = document.getElementById('link-overlay');
const contextMenuElement = document.getElementById('context-menu');
let originalContent = '';
let currentFilePath = '';
let isReadOnly = false;

// エディタにフォーカスを当て、カーソルを先頭へ移動する
const focusEditor = () => {
    // 描画完了後にフォーカスを当てる（内容反映前だとカーソル位置がずれるため）
    requestAnimationFrame(() => {
        editor.focus();
        editor.setSelectionRange(0, 0);
        editor.scrollTop = 0;
    });
};

// URL検出パターン（Terminal Viewのリンク検出と同じ定義）
const URL_PATTERN = /(?:https?|HTTPS?):\/\/[^\s"'!*(){}|\\\^<>`]*[^\s"':,.!?{}|\\\^~\[\]`()<>]/g;

// コンテキストメニューの見出しに表示するURLの最大文字数
const URL_LABEL_MAX_LENGTH = 60;

// URL右クリック時のメニュー項目
const URL_CONTEXT_MENU = [
    { title: 'Open in Default Browser', messageType: 'openUrl' },
    { title: 'Open in Integrated Browser', messageType: 'openUrlInIntegratedBrowser' }
];

// オーバーレイ上のURL要素（クリック位置の判定に使用）
let linkElements = [];
let overlayRenderHandle = null;

/**
 * オーバーレイの位置・サイズ・スクロール量をtextareaに合わせる
 * 幅はclientWidth（スクロールバーを除いた幅）に合わせないと折り返し位置がずれる
 */
const syncLinkOverlay = () => {
    linkOverlay.style.width = `${editor.clientWidth}px`;
    linkOverlay.style.height = `${editor.clientHeight}px`;
    linkOverlay.scrollTop = editor.scrollTop;
    linkOverlay.scrollLeft = editor.scrollLeft;
};

/**
 * textareaの内容からオーバーレイを再構築する
 * URL部分だけを要素化し、その矩形をクリック位置の判定に使う
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
    // 末尾に改行を足す。pre-wrapでは末尾の改行が潰れ、textareaと行数がずれるため
    linkOverlay.appendChild(document.createTextNode(text.slice(lastIndex) + '\n'));

    syncLinkOverlay();
};

// 連続入力時は1フレームに1回だけ再構築する
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
 * 指定座標にあるURLを返す（無ければnull）
 * オーバーレイはpointer-events: noneのため、要素の矩形と座標を突き合わせて判定する
 */
const findUrlAtPoint = (x, y) => {
    for (const link of linkElements) {
        // 折り返されたURLは複数の矩形になる
        for (const rect of link.getClientRects()) {
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                return link.dataset.url;
            }
        }
    }
    return null;
};

// テンプレート選択メニューを開いているか（ボタンでの開閉判定に使う）
let promptMenuOpen = false;

const hideContextMenu = () => {
    contextMenuElement.classList.add('hidden');
    promptMenuOpen = false;
};

/**
 * URLのコンテキストメニューを表示する
 */
const showUrlContextMenu = (event, url) => {
    contextMenuElement.textContent = '';
    contextMenuElement.classList.remove('prompt-menu');

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
};

/**
 * メニューが画面内に収まるように位置を決める
 * 基準要素の上側に出し、収まらない場合は下側へ反転する
 */
const placeMenuNearElement = (element) => {
    const anchorRect = element.getBoundingClientRect();
    const menuRect = contextMenuElement.getBoundingClientRect();
    const gap = 4;

    let top = anchorRect.top - menuRect.height - gap;
    if (top < gap) {
        // 上側に収まらない場合は下側へ出す
        top = Math.min(anchorRect.bottom + gap, window.innerHeight - menuRect.height - gap);
    }

    const left = Math.min(anchorRect.left, window.innerWidth - menuRect.width - gap);

    contextMenuElement.style.left = `${Math.max(gap, left)}px`;
    contextMenuElement.style.top = `${Math.max(gap, top)}px`;
};

/**
 * プロンプトテンプレートの選択メニューをボタンの近くに表示する
 */
const showPromptTemplateMenu = (templates) => {
    contextMenuElement.textContent = '';
    contextMenuElement.classList.add('prompt-menu');

    // ヘッダー行: 見出しと、テンプレートを追加する[+]ボタン
    const header = document.createElement('div');
    header.className = 'context-menu-header prompt-menu-header';

    const headerLabel = document.createElement('span');
    headerLabel.textContent = 'Prompt templates';
    header.appendChild(headerLabel);

    const addButton = document.createElement('button');
    addButton.className = 'context-menu-action';
    addButton.title = 'Add template';
    addButton.setAttribute('aria-label', 'Add template');
    const addIcon = document.createElement('span');
    addIcon.className = 'codicon codicon-add';
    addButton.appendChild(addIcon);
    addButton.addEventListener('click', (event) => {
        event.stopPropagation();
        hideContextMenu();
        vscode.postMessage({ type: 'createPromptTemplate' });
    });
    header.appendChild(addButton);

    contextMenuElement.appendChild(header);

    const separator = document.createElement('div');
    separator.className = 'context-menu-separator';
    contextMenuElement.appendChild(separator);

    for (const template of templates) {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        menuItem.textContent = template.label;
        // 同じ表示名でもファイル名で判別できるようにする
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

    // 位置計算には描画後のサイズが必要なため、先に表示する
    contextMenuElement.classList.remove('hidden');
    placeMenuNearElement(templateButton);
    promptMenuOpen = true;
};

// URL上での右クリックのみ自前のメニューを表示する
// preventDefault() を呼ばない場合はVSCode標準のメニューが表示される
// documentに登録するのは、VSCode側がwindowで監視しているため先に処理する必要があるため
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

// URL上ではポインターカーソルにしてリンクであることを示す
editor.addEventListener('mousemove', (event) => {
    editor.style.cursor = findUrlAtPoint(event.clientX, event.clientY) ? 'pointer' : '';
});

editor.addEventListener('mouseleave', () => {
    editor.style.cursor = '';
});

// textareaのスクロールにオーバーレイを追従させる
editor.addEventListener('scroll', () => {
    syncLinkOverlay();
    hideContextMenu();
});

// ビューの幅が変わると折り返し位置が変わるため、サイズ変更に追従する
if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => syncLinkOverlay()).observe(editor);
}

renderLinkOverlay();

// メッセージを受信
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

            // 新規作成直後などはエディタにフォーカスを当て、先頭から入力できるようにする
            if (message.focusEditor) {
                focusEditor();
            }
            break;
        case 'updateContent':
            // 拡張側でファイルが書き換わった場合の再同期
            // （送信履歴の追記など）。カーソル位置とスクロール位置は維持する
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
            // テンプレート一覧を受け取ってボタン近くにメニューを表示する
            showPromptTemplateMenu(message.templates || []);
            break;
        case 'insertText':
            // カーソル位置にテキストを挿入
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            const text = message.text;
            editor.value = editor.value.substring(0, start) + text + editor.value.substring(end);
            // カーソルを挿入テキストの後に移動
            editor.selectionStart = editor.selectionEnd = start + text.length;
            editor.focus();
            renderLinkOverlay();
            // 変更を通知
            vscode.postMessage({ type: 'contentChanged', content: editor.value });
            if (editor.value !== originalContent) {
                saveButton.classList.add('dirty');
            }
            break;
    }
});

// エディタの内容変更を検知
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
    // Cmd+R / Ctrl+Rで実行
    if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault();
        runTask();
    }

    // Cmd+M / Ctrl+MでCreate Markdown File
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

// prompts button click handler - テンプレート一覧をボタン近くのメニューで表示する
templateButton.addEventListener('click', (event) => {
    // documentのclickハンドラで直後に閉じられないようにする
    event.stopPropagation();

    // 開いている場合はトグルで閉じる
    if (promptMenuOpen) {
        hideContextMenu();
        return;
    }

    hideContextMenu();

    // 読み取り専用時は挿入してもtextareaの変更が保存されないため開かない
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
    // URL上のクリックは標準ブラウザで開く
    // ドラッグでの範囲選択の終端がURLに重なった場合は開かない
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
