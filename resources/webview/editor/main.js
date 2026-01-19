const vscode = acquireVsCodeApi();
const editor = document.getElementById('editor');
const filePathElement = document.getElementById('file-path');
const readonlyIndicator = document.getElementById('readonly-indicator');
const editButton = document.getElementById('edit-button');
const saveButton = document.getElementById('save-button');
const specButton = document.getElementById('spec-button');
const planButton = document.getElementById('plan-button');
const runButton = document.getElementById('run-button');
let originalContent = '';
let currentFilePath = '';
let isReadOnly = false;

// メッセージを受信
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'showContent':
            editor.value = message.content;
            originalContent = message.content;
            currentFilePath = message.filePath;
            filePathElement.textContent = message.filePath;
            saveButton.classList.remove('dirty');

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
            filePathElement.textContent = '';
            saveButton.classList.remove('dirty');
            readonlyIndicator.classList.remove('show');
            editButton.classList.remove('active');
            editor.removeAttribute('readonly');
            isReadOnly = false;
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

// Editor click handler when readonly - focus the tab in VS Code
editor.addEventListener('click', () => {
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
