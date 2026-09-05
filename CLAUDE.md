# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Claude Codeでの生産性を最大化するために設計された、強力なVS Codeパネル拡張機能。プロンプトファイルの管理、AIコマンドの実行、結果の確認を1つの統合パネルで完結し、ファイルエクスプローラー、エディタ、ターミナル間のコンテキスト切り替えを不要にする。

## 開発コマンド

```bash
npm install         # 依存関係のインストール
npm run compile     # コンパイル
npm run watch       # ウォッチモード（開発中）
npm run package     # VSIXパッケージ作成
```

## デバッグ方法

1. `npm run compile` でコンパイル
2. VSCodeで `F5` キーを押してデバッグ開始
3. Extension Development Hostウィンドウが開く
4. コード変更後は `Cmd+R` / `Ctrl+R` でリロード

## アーキテクチャ

### ファイル構成

```
src/
├── extension.ts          # activate関数（~217行、v0.9.1で87%削減）
├── commands/             # コマンド登録モジュール（v0.9.1で新設）
│   ├── types.ts          # CommandDependencies型定義
│   ├── settings.ts       # 設定関連コマンド（8コマンド）
│   ├── documentation.ts  # ドキュメント関連コマンド（6コマンド）
│   ├── terminal.ts       # ターミナル関連コマンド（6コマンド）
│   ├── plans.ts          # Plans View関連コマンド（13コマンド）
│   ├── files.ts          # ファイル操作関連コマンド（12コマンド）
│   └── index.ts          # 統合コマンドレジストリ
├── providers/            # UIコンポーネント
│   ├── PlansProvider.ts  # PlansビューのWebView（フラットリスト、Drag&Drop、v1.0.22でWebview化）
│   ├── EditorProvider.ts # Markdown EditorのWebView（v0.9.1で外部HTML/CSS/JS化）
│   ├── TerminalProvider.ts # xterm.jsターミナルのWebView（スクロール位置自動追従、Claude Code自動検知、セッション再接続機能付き）
│   ├── MenuProvider.ts   # 設定メニュー
│   └── items/            # TreeItem定義
│       ├── FileItem.ts   # ファイル/ディレクトリ項目
│       └── MenuItem.ts   # メニュー項目
├── utils/                # ユーティリティ
│   ├── fileUtils.ts      # FileInfo, formatFileSize, copyDirectory（getFileListは非推奨）
│   ├── templateUtils.ts  # loadTemplate
│   └── workspaceSetup.ts # setupSettingsJson, setupTemplate, setupClaudeFolder
├── services/             # ビジネスロジック
│   ├── TerminalService.ts      # PTYセッション管理（node-pty、セッション終了検知、リサイズ最適化、環境変数の安全化）
│   ├── FileOperationService.ts # ファイル操作（v0.9.1で完全非同期化）
│   ├── TemplateService.ts      # タイムスタンプ・テンプレート生成（v0.9.1で新設）
│   ├── FileWatcherService.ts   # ファイル変更監視
│   └── ConfigurationProvider.ts # 設定値取得
├── interfaces/           # サービスインターフェース定義
│   ├── ITerminalService.ts   # ターミナルサービスのインターフェース
│   ├── IEditorProvider.ts    # Editorプロバイダーのインターフェース
│   └── ITerminalProvider.ts  # Terminalプロバイダーのインターフェース
├── types/                # 共通型定義
│   └── index.ts          # FileOperationResult, FileStats, FilePermissions, DisplayOptions等
└── resources/            # 外部リソース（v0.9.1で新設）
    ├── templates/        # テンプレートファイル（v0.9.14で追加）
    │   └── initial_prompt.md  # 初期プロンプトファイルのテンプレート
    └── webview/
        ├── editor/       # EditorProvider用外部ファイル
        │   ├── index.html  # HTMLテンプレート
        │   ├── style.css   # スタイルシート
        │   └── main.js     # JavaScript
        ├── terminal/     # TerminalProvider用外部ファイル（v0.9.7で追加）
        │   ├── index.html  # HTMLテンプレート
        │   ├── style.css   # スタイルシート
        │   └── main.js     # JavaScript
        └── plans/        # PlansProvider用外部ファイル（v1.0.22で追加）
            ├── index.html  # HTMLテンプレート（Quick Startボタン＋一覧＋コンテキストメニュー）
            ├── style.css   # スタイルシート
            └── main.js     # JavaScript（一覧描画、右クリックメニュー、Drag&Drop、キーボード操作）
```

### Provider間の依存関係

循環参照を避けるため、インターフェースベースの依存性注入を使用：

- `IEditorProvider`: EditorProviderが実装、PlansProvider・TerminalProviderが参照
- `ITerminalProvider`: TerminalProviderが実装、EditorProviderが参照
- `IPlansProvider`: PlansProviderが実装、TerminalProviderが参照（v0.9.3で追加）

### v0.9.1リファクタリング

コードベースの保守性と拡張性を向上させるため、大規模なリファクタリングを実施：

**コマンド登録の分割（Phase 1）**
- extension.tsを1674行から217行に削減（87%削減）
- コマンドを機能別に6つのモジュールに分割（settings, documentation, terminal, plans, files）
- 依存性注入パターン（CommandDependencies）を導入

**ファイル操作の非同期化（Phase 2）**
- FileOperationServiceの全メソッドを非同期化（fs.Sync → fs.promises）
- UIブロッキングを防止し、パフォーマンスを改善

**テンプレート・タイムスタンプ生成の共通化（Phase 3）**
- TemplateServiceを新設し、タイムスタンプ生成ロジックを一元化
- テンプレート変数生成とファイル名生成を共通化

**未使用クラスの整理（Phase 4）**
- 7つの未使用サービスクラスを削除（ExplorerManager、KeyboardShortcutHandler等）
- 3つの未使用インターフェースを削除
- types/index.tsから未使用の型定義を削除

**Webview外部化（Phase 5）**
- EditorProviderのHTML/CSS/JavaScriptを外部ファイル化
- resources/webview/editor/配下に分離し、保守性を向上
- CSP（Content Security Policy）対応

### v0.9.3新機能: Terminal Viewタブ連携

Terminal Viewのタブ選択時に、Editor ViewとPlans Viewが自動的に連携する機能を実装：

**タブとファイルの関連付け**
- TerminalProviderに`_tabFileMap`でタブIDとファイルパスを管理
- `sendCommand`メソッドにオプショナルパラメータ`filePath`を追加
- EditorProviderからコマンド送信時にファイルパスを渡して関連付け

**タブ切り替え時の自動連携**
- タブ選択時に`_activateTab`メソッドが以下を実行：
  1. Editor Viewで関連ファイルを開く（`IEditorProvider.showFile()`）
  2. Plans Viewを親ディレクトリに移動（`IPlansProvider.setActiveFolder()`）
- 3つのView（Terminal、Editor、Plans）が同期して動作

**インターフェースベースの設計**
- `IEditorProvider`: TerminalProvider・PlansProviderから参照
- `IPlansProvider`: TerminalProviderから参照（新規追加）
- 循環参照を回避し、疎結合なアーキテクチャを維持

### v0.9.4新機能: Terminal Viewタブ名改善

Terminal Viewのタブ名表示を改善し、コマンド種別に応じたアイコンを表示する機能を実装：

**タブ名から番号を削除**
- `bash (2)`, `zsh (3)`のようなタブ番号表示を削除
- シェル名のみのシンプルな表示に変更（例: `bash`, `zsh`）
- タブの識別は内部IDで管理するため、番号削除による影響なし

**コマンド種別アイコンの表示**
- Editor Viewから送信されたコマンドの種別に応じてアイコンを表示：
  - Run: ▶️（例: `▶️ bash`）
  - Plan: 📝（例: `📝 bash`）
  - Spec: 📑（例: `📑 bash`）
- `TerminalTab`インターフェースに`commandType`プロパティを追加
- `sendCommand`メソッドに`commandType`パラメータを追加
- WebViewメッセージング（`updateTabCommandType`）でタブタイトルを動的更新

**実装の特徴**
- 絵文字アイコンは追加のCSS・フォント不要で即座に実装可能
- commandTypeはオプショナルなため、既存コードへの影響なし
- タブ情報にshellNameを保存し、アイコン更新時に利用

### v0.9.5バグ修正: Terminal Viewタブ名機能の動作不良修正

v0.9.4で実装したタブ名改善機能が正しく動作していなかった問題を修正：

**修正内容**
- タブ作成時に番号が削除されていなかった問題を修正（TerminalProvider.ts:813）
- WebViewメッセージハンドラに`updateTabCommandType`ケースが実装されていなかった問題を修正
- コマンド種別アイコン（▶️、📝、📑）がタブに表示されるように実装

**技術的詳細**
- フロントエンド（WebView）とバックエンド（Extension）のメッセージング実装の不一致を解消
- タブタイトル更新ロジックを正しく実装し、既存アイコンの削除と新規アイコンの追加を適切に処理

### v0.9.6セキュリティ・品質改善

コードレビューで発見された重要な問題と警告項目をすべて修正：

**セキュリティ修正**
- コマンドインジェクション脆弱性を修正（EditorProvider.ts）
  - シングルクォートベースの安全なエスケープ関数を実装
  - Run/Plan/Specコマンドすべてで特殊文字を適切にエスケープ
  - シェルインジェクション攻撃のリスクを大幅に軽減

**バグ修正**
- メモリリーク問題を修正（TerminalProvider.ts）
  - `_outputDisposables`のキー不一致を解消（`sessionId` → `tab.id`）
  - Disposableが確実に解放されるように改善

**品質改善**
- node-ptyエラーハンドリングを強化（TerminalService.ts）
  - ロード失敗時の詳細情報を記録
  - `getUnavailableReason()`メソッドで詳細なエラー理由を取得可能
- ファイル操作を非同期化（PlansProvider.ts）
  - `fs.copyFileSync` → `fs.promises.copyFile`
  - UIブロッキングを解消
- TemplateServiceを活用（EditorProvider.ts）
  - タイムスタンプ生成ロジックの重複を解消
  - `formatDateTime()`メソッドを追加

### v0.9.7 WebView外部化・CSP改善・非同期化

Terminal ViewのWebView外部化とセキュリティ改善、非同期ファイル操作への移行を実施：

**Terminal WebView外部化（Phase 1）**
- TerminalProviderのHTML/CSS/JavaScriptを外部ファイル化
- resources/webview/terminal/配下に分離（index.html、style.css、main.js）
- CSP（Content Security Policy）対応を強化
- インラインスクリプトを排除し、セキュリティを向上

**ターミナル設定の安全な読み込み**
- インラインスクリプトをdata属性経由に変更
- `<body data-terminal-config="{...}">` 形式で設定を埋め込み
- main.jsでJSON.parseして読み取り、CSP違反を回避
- フォント設定（fontFamily、fontSize等）が正しく適用されるように修正

**CSP改善**
- xterm.jsのインラインスタイル使用のため `style-src 'unsafe-inline'` を追加
- Unicode11 Addon対応のため `allowProposedApi: true` を設定
- CSP違反エラーを解消し、日本語等のCJK文字が正しく表示されるように改善

**非同期ファイル操作への移行（Phase 2）**
- PlansProviderの全ファイル操作を非同期化
  - `setRootPath` を async に変更（fsPromises.stat使用）
  - `getFilesInDirectory` を async に変更（fsPromises.readdir/stat使用）
  - `findOldestTargetFile` を async に変更
- EditorProviderの改善
  - `_getHtmlForWebview` を async に変更（fsPromises.readFile使用）
  - TemplateServiceのDI対応を追加
- TemplateServiceの非同期化
  - `loadTemplate` を async に変更（fsPromises.access/readFile使用）

**型安全性の向上**
- TerminalServiceにIPtyインターフェース定義を追加
- `any`型を排除し、型安全性を向上

**コード品質の向上**
- デバッグ用console.log文を削除（本番環境向けクリーンアップ）
- プロバイダープロパティの用途を明確化するコメントを追加
- PlansProviderのデバウンス時間を1500msから500msに短縮（レスポンシブ性向上）
- エラーハンドリングを改善し、詳細なエラーメッセージを記録
- formatDateTime()メソッドを使用して日時フォーマットを標準化

### v0.9.11バグ修正: Terminal Viewスクロール位置の保持

パネル切り替え時にスクロール位置がリセットされる問題を修正：

**実装内容**
- **スクロール位置の保存・復元メカニズム**: WebViewの可視性変更時に動作
  - `_onWebviewBecameHidden()`: パネル非表示前にスクロール状態を保存
  - `_onWebviewBecameVisible()`: パネル表示後にスクロール状態を復元（50ms遅延）
  - `savedScrollPositions` Map: タブごとのスクロール状態を保存
- **タブアクティブ化時の復元**: `fitAddon.fit()`後にスクロール位置を維持
  - フィット調整前のスクロール状態を確認
  - 最下部にいた場合は、フィット後に自動的に最下部に復元

**メリット**
- パネル切り替え後もスクロール位置が維持される
- `fitAddon.fit()`によるスクロール位置リセットを防止
- 保存された状態を優先することで、一時的な状態変更の影響を受けない

**技術詳細**
- 可視性変更: `webviewView.onDidChangeVisibility`イベントを監視
- メッセージング: `saveScrollPositions`（保存）、`restoreScrollPositions`（復元）
- 2段階復元: パネル表示時とタブアクティブ化時の両方で復元を実行

### v0.9.12新機能: 実行中プロセスに応じた動的タブ名更新

iTerm2のように、terminal内で実行中のプロセスに応じてterminal viewのタブ名が動的に変わる機能を実装：

**実装内容**
- **TerminalServiceの拡張**: フォアグラウンドプロセス名取得機能を追加
  - `getForegroundProcess(sessionId)`: フォアグラウンドプロセス名を取得
  - `ProcessInfo`インターフェースに`name`と`isForeground`フィールドを追加
  - プラットフォーム別実装（macOS/Linux: `ps`、Windows: `wmic`）
  - `_extractProcessName()`: コマンド文字列からプロセス名を抽出
- **TerminalProviderの拡張**: プロセス名変更の検知とタブ名更新
  - `_lastProcessNames` Map: タブごとの最後のプロセス名を追跡
  - `_checkProcessAndUpdateTab()`: プロセス名を取得してタブ名を更新
  - `_updateTabNameWithProcess()`: WebViewにタブ名更新を通知
  - `_getDisplayName()`: プロセス名から表示名を生成
- **WebViewの更新**: タブ名の動的更新表示
  - `updateTabName`メッセージハンドラを追加
  - 既存のコマンド種別アイコン（▶️、📝、📑）を保持しつつプロセス名を更新

**メリット**
- 実行中のプロセスが一目でわかる
- iTerm2と同様の使いやすさを実現
- 既存のコマンド種別アイコン機能との共存
- パフォーマンスへの影響は最小限（1.5秒間隔のチェック）

**技術詳細**
- プロセス名抽出: パスとスペースで分割してベース名を取得
- タブ名更新: プロセス名が変更された場合のみ更新（不要な更新を回避）
- タブタイトル構造: `[コマンドアイコン] [ローダー] [プロセス名]`

### v0.9.14新機能: Create Directory機能の拡張

Plans Viewの「Create directory」機能を拡張し、初期プロンプトファイルの自動作成機能を実装：

**実装内容**
- **初期プロンプトテンプレート**: `resources/templates/initial_prompt.md` を追加
  - Run/Plan/Specボタンの使い方を説明する英語のテンプレート
  - 新規ユーザーへのガイダンスとして機能
- **コマンドロジック拡張**: `src/commands/plans.ts` の `createDefaultPath` コマンドを拡張
  - ディレクトリ作成時にタイムスタンプ付きPROMPT.mdファイルを自動生成（`YYYY_MMDD_HHMM_SS_PROMPT.md`）
  - テンプレートを読み込んでファイルに書き込み（テンプレートが見つからない場合はデフォルトテキストを使用）
  - EditorProviderでファイルを自動的に開く
  - PlansProviderでファイルを選択状態にする
- **ファイル選択機能**: PlansProviderの `revealFile` メソッドを活用
  - 作成されたファイルが自動的にPlans Viewで選択される

**メリット**
- 新規ユーザーがすぐに使い始められる
- プロンプトファイルの作成が1クリックで完了
- Run/Plan/Specボタンの使い方が明確
- 一貫性のあるファイル命名規則（タイムスタンプ付き）

**技術詳細**
- TemplateServiceを使用したタイムスタンプ生成（日本時間）
- 非同期ファイル操作（fsPromises）でUIブロッキングを防止
- エラーハンドリング: テンプレート未検出時のフォールバック機能
- 既存の「Create directory」機能との後方互換性を維持

### v1.0.5新機能: Plans Viewルートディレクトリの日付/時間表示

Plans Viewのルートディレクトリにおいて、ディレクトリ名の前に日付または時間を表示する機能を実装：

**表示形式**
- 当日以外: `[MM/DD] ディレクトリ名`（例: `[01/28] 2026_0128_1430_25`）
- 当日: `[HH:MM] ディレクトリ名`（例: `[09:54] 2026_0129_0954_07`）

**実装内容**
- **PlansProviderの拡張**: ルートディレクトリのアイテム表示ロジックを改善
  - `formatDateTimePrefix()`: 当日判定と日付/時間フォーマットを実行
  - ディレクトリ: labelプレフィックス方式で日付/時間を表示（highlightsなし）
  - ファイル: プレフィックスなし（v1.0.6で変更）
- **既存のdescription方式を置換**: `formatCreatedDate()`（YYYY-MM-DD）を`formatDateTimePrefix()`に置換
- **サブディレクトリへの影響なし**: プレフィックス表示はルートディレクトリのみ

**メリット**
- ディレクトリの作成日時が一目でわかる
- 当日のディレクトリは時間表示でより詳細な情報を提供
- 固定長プレフィックス（7文字）により整列された表示

### v1.0.5改善: TerminalProviderのテスタビリティ向上

TerminalProviderのテスタビリティを向上させるリファクタリングを実施：

**実装内容**
- **依存性注入パターン**: コンストラクタでITerminalServiceを受け取れるように変更
  - テスト時にモックサービスを注入可能
  - 本番コードとの互換性を維持（オプショナルパラメータ）
- **handleShortcutメソッドのpublic化**: ショートカットコマンド処理をpublicメソッドとして切り出し
  - WebViewメッセージハンドラから分離し、直接テスト可能に
  - メソッドの責務を明確化

### v1.0.12バグ修正: Claude Code起動中のコマンド実行問題

Terminal ViewでClaude Code起動中にEditor ViewからRun/Plan/Specコマンドを送信すると、末尾が改行になってコマンドが実行されない問題を修正：

**問題の原因**
- コマンドテキストと改行コード（`\r`）が1回のPTY書き込みで送信されると、Claude Code CLIが`\r`を入力テキストの一部として処理してしまい、コマンドが実行されない

**修正内容**
- `sendCommand()`と`handleShortcut()`メソッドのClaude Code起動中のコマンド送信を修正
  1. コマンドテキストをPTYに送信
  2. 100ms遅延後に`\r`を別書き込みで送信
  3. 手動Enter操作と同じデータフローを再現
- シェル状態（Claude Code未起動）の場合は従来通り

**削除した機能**
- Bracketed Paste Mode（ペーストモード）を廃止
  - `\x1b[200~` ... `\x1b[201~` によるコマンドラップを削除

### v1.0.11変更: commandPrefixデフォルト値の変更

`aiCodingSidebar.editor.commandPrefix` のデフォルト値から `--model opus` を削除：

**変更内容**
- デフォルト値: `claude --model opus` → `claude`
- モデル指定をデフォルトに含めず、Claude CLIのデフォルトモデル設定に委ねる
- ユーザーが任意のモデルを柔軟に選択可能に

**変更箇所**
- `package.json`: 設定スキーマのデフォルト値
- `ConfigurationProvider.ts`: フォールバック値
- `EditorProvider.ts`: フォールバック値（4箇所）

### v1.1.4変更: Terminal Viewショートカットの整理とボタンフォントの統一

**Terminal Viewショートカットバーからのボタン削除**

| グループ | 削除したボタン | 削除後の構成 |
|---|---|---|
| `shortcuts-not-running` | `claude --permission-mode auto` | `[claude] [claude -c] [claude -r] [↑]` |
| `shortcuts-update` | `brew upgrade claude-code` | `[claude update] [←]` |

- `resources/webview/terminal/index.html` の `<button>` 要素と、`resources/webview/terminal/main.js` の `addEventListener` を両方削除している。片方だけ残すと存在しないIDへの `?.` アクセスが無言で失敗するため、必ず対で消す
- `aiCodingSidebar.editor.commandPrefix` の既定値（`claude --permission-mode auto`）は**変更していない**。ショートカットボタンはターミナルへ文字列を送るだけで、Run / Plan / Spec が使うプレフィックス設定とは独立している
- README.md / README-JA.md の「Context-Aware Shortcuts / コンテキスト対応ショートカット」の一覧も同時に更新した。CHANGELOG と CLAUDE.md の過去バージョン節（v1.0.18等）は履歴のため変更していない

**Editor Viewボタンのフォント統一（`resources/webview/editor/style.css`）**
- Spec / Plan / Run / Next / Edit / Save が共有するルールに `font-weight: normal` を追加
- `font-family: inherit` / `font-size: 11px` / `line-height: 16px` は既に全ボタンで一致していたため、残る差異になり得るのは `font-weight` のブラウザ既定値のみだった。これを明示することでNextとRunの描画が完全に一致する
- 背景色の違い（Next: `#c9483f` 固定、Run: `--vscode-button-background`）はそのまま維持している。白文字のサブピクセルレンダリングは背景色によって太さの印象が変わるため、フォント指定を揃えても見え方が完全に同一になるとは限らない

### v1.1.3変更: プロンプトファイル作成後のエディタフォーカス

`PROMPT.md` を新規作成した直後に、Editor Viewの入力エリア（textarea）へフォーカスが移るようにした：

**背景**
- 従来は `markdownEditor.focus` でビュー自体をアクティブにするだけだったため、Nextボタンでファイルを作成しても入力を始めるにはエディタをクリックする必要があった

**実装内容**

| ファイル | 変更 |
|---|---|
| `src/providers/EditorProvider.ts` | `showFile(filePath, options?: { focusEditor?: boolean })` にオプション引数を追加し、`showContent` メッセージへ `focusEditor` を含めて送信 |
| `resources/webview/editor/main.js` | `focusEditor()` を追加。`showContent` 受信時に `focusEditor` が真ならtextareaへフォーカスし、カーソルを先頭（0,0）へ配置 |
| `src/commands/files.ts` | `aiCodingSidebar.createMarkdownFile` の処理順を `markdownEditor.focus` → `showFile(filePath, { focusEditor: true })` に変更 |

**設計上の注意点**
- **オプトイン方式**: `showFile()` の既定動作は従来どおりフォーカスを奪わない。全呼び出しでフォーカスすると、Plans Viewでファイルを選択した際にキーボード操作（↑↓/Enter）のフォーカスが奪われるため、`createMarkdownFile` からのみ `focusEditor: true` を渡している
- **`requestAnimationFrame` での遅延**: `editor.value` への代入と同一フレームで `setSelectionRange()` を呼ぶとカーソル位置がずれるため、描画後に実行している
- **カーソル位置**: `templates/prompt.md` は冒頭が空行・末尾がメタデータ行のため、先頭に置くことでそのまま本文を入力できる
- **コマンド順序**: 先に `markdownEditor.focus` でビューをアクティブにしてから表示・フォーカスを行う。逆順だとビューフォーカスがtextareaのフォーカスを上書きする可能性がある

**適用範囲**
- Nextボタンのほか、`Cmd+M` / `Ctrl+M` と Plans Viewコンテキストメニューの「New PROMPT.md」も同じコマンド経由のため同様に動作する
- TASK.md / SPEC.md / Quick Start の作成コマンドは変更していない

### v1.1.2新機能: Plans Viewのファイルアーカイブ

Plans Viewのファイル行から `archived/` へ退避できる `aiCodingSidebar.archiveFile` コマンドを追加：

**背景**
- 従来のアーカイブ（`aiCodingSidebar.archiveDirectory`）はディレクトリのみが対象で、Plans Viewのルート直下に置いたMarkdownファイルは削除するか手動で移動するしかなかった

**実装内容**

| ファイル | 変更 |
|---|---|
| `src/commands/plans.ts` | `aiCodingSidebar.archiveFile` を追加し、アーカイブ処理の共通部分をモジュール関数へ切り出し |
| `package.json` | `contributes.commands` に `aiCodingSidebar.archiveFile`（`$(archive)`）を追加 |
| `resources/webview/plans/main.js` | `CONTEXT_MENUS.file` と `INLINE_ACTIONS.file` に Archive を追加 |
| `src/test/suite/extension.test.ts` | コマンド登録テストに `aiCodingSidebar.archiveFile` を追加 |

- 移動先はディレクトリのアーカイブと同じ `<plans>/archived/`
- Editor Viewで開いているファイルをアーカイブした場合は `editorProvider.clearFile()` で表示をクリアする
- 同名衝突時のタイムスタンプは、**ディレクトリは名前の末尾**、**ファイルは拡張子の前**に付与する（`foo.md_20260905_131144` では拡張子が壊れるため）

**アーカイブ処理の共通化**

`plans.ts` の末尾に3つのモジュール関数を配置し、`archiveDirectory` / `archiveFile` の両方から利用する：

| 関数 | 責務 |
|---|---|
| `ensureArchivedDirectory()` | `<plans>/archived` のパス解決と、未作成時の作成。失敗時はエラーメッセージを表示して `undefined` を返す |
| `resolveArchiveDestination()` | 移動先パスの決定と同名衝突の回避。`isDirectory` でタイムスタンプの付与位置を切り替える |
| `formatArchiveTimestamp()` | `YYYYMMDD_HHmmss` 形式のサフィックス生成（`TemplateService` のタイムスタンプとは形式が異なるためローカルに保持） |

`archiveDirectory` の外部から見た挙動（ルートディレクトリの拒否、`pathDisplayNonRoot` によるカレントディレクトリ判定、アーカイブ後のルートへの移動）は変更していない。

**スコープに関する注意**
- Webviewのファイル行は root / サブディレクトリで `contextValue` が共通の `'file'` のため、Archive はサブディレクトリ内のファイルにも表示される
- 既存の `archiveDirectory` も階層を問わず表示され、いずれも top-level の `archived/` へフラットに移動する挙動のため、それに合わせている
- root のファイルのみに限定する場合は、`PlansProvider.buildItems()` で `contextValue` を分ける必要がある

### v1.1.1変更: Editor Viewのレイアウト再編とcodicon化

Editor Viewのボタン配置を3段構成に整理し、全ボタンをVS Code標準のcodiconに統一：

**3段構成へのレイアウト再編（`resources/webview/editor/index.html` / `style.css`）**

| 段 | 要素 | 内容 |
|---|---|---|
| 1段目 | `#header` | ファイルパス表示のみ（未オープン時は案内文） |
| 2段目 | `#sub-header` | 左: Edit / Save、右: Spec / Plan / Run |
| 最下段 | `#footer` | Next |

- `#header` から `.header-actions`（Spec/Plan/Run）を削除。CSSの `.header-actions` ルールも削除済み
- `#footer` を新設。`#sub-header` と同構成だが区切り線は `border-top`、`justify-content: flex-end` で右寄せ。高さは共通の `--button-bar-height`（36px）
- `#sub-header` は2グループ構成のため `justify-content: space-between`

**全ボタンのcodicon化**

| ボタン | 変更前 | codicon |
|---|---|---|
| Spec | テキストのみ | `codicon-book` |
| Plan | テキストのみ | `codicon-checklist` |
| Run | テキストのみ | `codicon-play` |
| Next | テキストのみ | `codicon-new-file` |
| Edit | ✏️（絵文字） | `codicon-edit` |
| Save | 💾（絵文字） | `codicon-save` |

- **重要**: v1.1.0で「Editor ViewのCSPと `codiconsUri` の受け渡しはアイコン追加前の状態に戻してある」と記載していたが、本バージョンで再度追加した
  - `index.html`: CSPに `font-src {{cspSource}}` を追加し、`{{codiconsUri}}` のstylesheetを読み込む
  - `EditorProvider._getHtmlForWebview()`: `media/codicons/codicon.css` の `codiconsUri` を追加してテンプレート変数を置換
- 絵文字ではなくcodiconを採用したのは、Plans ViewのQuick Startボタンと見た目を統一するため。アイコンサイズ（`font-size: 14px; line-height: 16px`）もQuick Startと同一
- Next の候補は `chevron-right` / `debug-continue` / `arrow-right` 等も検討したが、codiconsには「次のトラック（▶|）」相当のアイコンが無いため、実際の動作（新規PROMPT.md作成）と一致する `new-file` を採用

**ボタン色の調整（白文字とのコントラスト比を実測して選定）**

| ボタン | 変更前 | 変更後 | 白文字コントラスト |
|---|---|---|---|
| Next | `#dc3545` / hover `#c82333` | `#c9483f` / hover `#d55b52` | 4.53 → 4.69 |
| Quick Start（Plans View） | `#e5b700` + 文字色 `#1f1f1f` | `#9a7b00` + 文字色 `#ffffff` | 1.89 → 4.03 |

- Quick Start は文字色を白にする要件のため、黄色系の色相（R:G ≒ 1:0.8、B=0）を保ったまま明度を下げた。明るい黄色（`#e5b700`）のままでは白文字のコントラストが2を下回り判読できない
- Next は一度ダスティローズ（`#b56370`、色相350°）にしたがピンク寄りに見えたため、色相を4°（G > B）の赤側へ補正した上で彩度を落としている

**ファイル未オープン時の案内表示（`resources/webview/editor/main.js`）**
- `FILE_PATH_PLACEHOLDER`（`No file open - select a file in Plans View`）と `setFilePath()` を追加
- `showContent` / `clearContent` の `filePathElement.textContent = ...` を `setFilePath()` 経由に統一し、スクリプト初期化時にも呼び出して起動直後から案内文が出るようにした
- `#file-path.placeholder` で `var(--vscode-descriptionForeground)` の淡色＋斜体にし、実際のファイルパスと視覚的に区別

### v1.1.0変更: ヘッダーボタンの整理とEditor View「Next」ボタンの追加

VS Codeのタイトルバーに散在していたファイル作成系ボタンを整理し、Editor View内に「Next」ボタンを新設：

**タイトルバーボタンの削除（`package.json` の `contributes.menus["view/title"]`）**

| ビュー | 削除したボタン | コマンドID | 代替手段 |
|---|---|---|---|
| Plans View | New Task | `aiCodingSidebar.newDirectory` | `Cmd+S` / `Ctrl+S` |
| Plans View | New Spec | `aiCodingSidebar.newSpec` | なし（コマンド登録のみ残存） |
| Editor View | New PROMPT.md | `aiCodingSidebar.createMarkdownFile` | Nextボタン、`Cmd+M` / `Ctrl+M`、Plans Viewのコンテキストメニュー |
| Editor View | New TASK.md | `aiCodingSidebar.createTaskFile` | Plans Viewのコンテキストメニュー |
| Editor View | New SPEC.md | `aiCodingSidebar.createSpecFile` | Plans Viewのコンテキストメニュー |

- コマンド定義（`contributes.commands`）と `registerCommand` は削除していない。Plans ViewのWebviewコンテキストメニュー（`resources/webview/plans/main.js` の `CONTEXT_MENUS`）とキーバインドから引き続き実行されるため
- 残るタイトルバーボタンは Plans View が `Refresh` / `Plans Settings`、Editor View が `Editor Settings` のみ

**Editor View「Next」ボタンの追加**
- `resources/webview/editor/index.html`: `#header` の下に `#sub-header` 領域を新設し、赤い `Next` ボタン（`#next-button`）を配置（v1.1.1で最下部の `#footer` へ移動）
- `resources/webview/editor/main.js`: クリック時に `{ type: 'createMarkdownFile' }` を postMessage。`EditorProvider` 側の既存ハンドラがそのまま `aiCodingSidebar.createMarkdownFile` を実行するため、TypeScript側の変更は不要だった
- 色は `#dc3545`（ホバー `#c82333`）。Spec（紫）/ Plan（緑）/ Run（青）/ Save dirty（橙）/ Quick Start（黄）と重複しない色として選定（v1.1.1で `#c9483f` に変更）
- 検討段階で codicon（`codicon-arrow-right` → `codicon-arrow-down`）を試したが最終的にアイコンなしとしたため、Editor ViewのCSPと `codiconsUri` の受け渡しはアイコン追加前の状態に戻してある（codiconはPlans Viewのみで使用）※v1.1.1で再度追加済み

**ボタン設置領域の高さ統一（36px）**
- 各Webviewの CSS に `--button-bar-height: 36px` を定義し、ボタン行に `min-height` + `box-sizing: border-box` を適用。縦paddingをやめて `align-items: center` で中央揃えにしている
- 対象: Plans `#header` / Editor `#header`・`#sub-header` / Terminal `.header-row-1`・`.header-row-2`
- Terminal View にはヘッダー高さをハードコードした計算（`#terminals-container` の `calc(100% - 33px - 29px)`、`#terminal-overlay` の `top: 62px`）があり、実際の描画高さに追従していなかったため、`--button-bar-height` ベース（+ `#header` のborder 1px）に修正した

**Plans Viewのrootディレクトリでの自動選択を停止**
- `PlansProvider.navigateToDirectory()` の末尾にある「最も古い対象ファイル（TASK/PROMPT/SPEC/QUICK_START.md）を自動選択してEditor Viewに表示する」処理を、移動先がrootの場合はスキップ
- 判定用に `_isRootDirectory()` を追加。既存の `startsWith` による範囲チェックとは別に `path.resolve()` で正規化して比較する
- 「..」で親へ戻る操作も `navigateToDirectory()` を経由するため、この1箇所でカバーできる

### v1.0.22大規模改修: Plans ViewのWebview化と「Quick Start」ボタン設置

Plans View（`aiCodingSidebarExplorer`）を `TreeDataProvider` ベースからWebviewベースへ全面移行し、Editor ViewのSpec/Plan/Runと同じ見た目の「Quick Start」ボタンをビュー内に設置：

**方針決定の経緯**
| 案 | 内容 | 結果 |
|---|---|---|
| 案1 | Plans Viewの直前に別Webviewビュー（`plansToolbar`）を追加 | 「新しいviewを追加せずPlans View内に」というフィードバックで却下 |
| 案2 | TreeView内の先頭にクリック可能な行（`FileItem`）を追加 | 「Editor Viewのようなボタンにしてほしい」というフィードバックで却下 |
| **案3（採用）** | **Plans View全体をWebview化** | ユーザー選択 |

**技術的背景（なぜWebview化が必須か）**
- `TreeDataProvider` はツリー行（ラベル＋アイコン）しか描画できず、HTMLボタンを描画できない
- `TreeView.message` は `string` 型のみ（MarkdownString・コマンドリンク非対応）
- `contributes.viewsWelcome` はコマンドリンクをボタン描画するが、ツリーが空のときしか表示されない
- → 本物のボタンを単一ビュー内に置くにはWebview化しか手段がない

**実装内容**
- `src/providers/PlansProvider.ts`: `vscode.TreeDataProvider` / `vscode.TreeDragAndDropController` の実装をやめ、`vscode.WebviewViewProvider` として再実装
  - `getChildren()` → `buildItems()`: 表示行を `PlansViewItem`（`kind`/`label`/`filePath`/`icon`/`contextValue` 等を持つ素のオブジェクト）の配列として構築し、`postMessage` でWebviewへ送信。TreeView非依存になったためテストが容易
  - 削除: `getTreeItem()`, `getParent()`, `onDidChangeTreeData`, `setTreeView()`, `handleDrag()`, `handleDrop()`, `dragMimeTypes`, `dropMimeTypes`
  - 維持: `setRootPath()`, `getRootPath()`, `getCurrentPath()`, `getActiveFolderPath()`, `setActiveFolder()`, `resetActiveFolder()`, `navigateToDirectory()`, `revealFile()`, `revealDirectory()`, `getSelectedItem()`/`setSelectedItem()`, `refresh()`, `handleVisibilityChange()`, `dispose()`（コマンド側の改修を最小化するため公開APIは互換を保持）
- `resources/webview/plans/`（新規）: `index.html` / `style.css` / `main.js`。Quick Startボタン、ファイル一覧、コンテキストメニュー、Drag&Drop、キーボード操作（↑↓/Enter）を実装
- `src/providers/items/FileItem.ts`: アイコン判定を `getFileIconName()` としてエクスポートし、`FileItem`（ThemeIcon）とWebview（codicon）で共通利用
- `src/extension.ts`: `createTreeView()` を `registerWebviewViewProvider()` に置換。ファイル選択時にEditor Viewで開く処理（旧 `onDidChangeSelection`）を `PlansProvider` のメッセージハンドラへ移設。`selectInitialFolder()` と初期化用 `setTimeout(500)` を削除
- `src/commands/types.ts` / `src/commands/plans.ts`: `CommandDependencies.treeView` と `selectInitialFolder()` を削除し、`plansProvider.revealDirectory()` に置換
- `package.json`:
  - `aiCodingSidebarExplorer` に `"type": "webview"` と `retainContextWhenHidden` を追加
  - `contributes.menus["view/item/context"]` のPlans View向け25エントリを削除（Webview側のHTMLメニューで実装するため）
  - `copy-codicons` スクリプトを追加し `vscode:prepublish` に組み込み（`@vscode/codicons` を `media/codicons/` へコピー）

**Webview化に伴う設計上の注意点**
- **コマンド引数の互換性**: 既存コマンドは `FileItem` を引数に取る。Webviewからは素のオブジェクトしか送れないため、`_createFileItem()` でパスから `FileItem` を復元して `executeCommand` に渡している
- **`contextValue` の引き継ぎ**: `aiCodingSidebar.archiveDirectory` は `item.contextValue === 'pathDisplayNonRoot'` で「現在表示中のディレクトリ自体か」を判定するため、Webviewから `contextValue` を送信して復元時に設定している（これを忘れるとアーカイブの挙動が変わる）
- **CSP**: codiconsのttf読み込みのため `font-src {{cspSource}}` が必要
- **外部ファイルのDrag&Drop**: Webviewではブラウザ由来のFile APIから絶対パスを取得できないため、VS Codeが設定する `text/uri-list` を読み取って処理している

**トレードオフ（Webview化で失われたVS Code標準機能）**
- ファイルアイコンテーマ連携（codiconsによる固定アイコンで代替）
- TreeViewの `reveal()` API（`postMessage` による選択通知で代替）
- `package.json` によるコンテキストメニュー定義（`main.js` の `CONTEXT_MENUS` で代替）

### v1.0.21バグ修正: Plans View「Quick Start」の作成先ディレクトリ修正

Plans Viewでサブディレクトリを開いた状態で「Quick Start」を実行すると、root ディレクトリ直下ではなく、開いているサブディレクトリ内にディレクトリが作成されてしまう問題を修正：

**問題の原因**
- `aiCodingSidebar.quickStart` コマンド（`src/commands/plans.ts`）の作成先パス取得に `PlansProvider.getCurrentPath()`（`activeFolderPath || rootPath`）を使用していた
- Plans Viewでサブディレクトリへ移動すると `activeFolderPath` が更新されるため、Quick Start がそのサブディレクトリ配下にディレクトリを作成してしまっていた

**修正内容**
- 作成先パス取得を `PlansProvider.getRootPath()`（root ディレクトリのみを返す）に変更
- 「Create directory」コマンド（`aiCodingSidebar.createDefaultPath`）と同様に、常に Plans View の root ディレクトリ配下にディレクトリを作成するように統一

**変更箇所**
- `src/commands/plans.ts`: `aiCodingSidebar.quickStart` コマンドの作成先パス取得ロジック

### v1.0.20バグ修正: Editor View「Run」ボタンのコマンド文言修正

Quick Start機能（後述）で作成したファイルに対して「Run」ボタンを押下した際、ファイル内のタスクが実行されず、内容の要約・報告に留まる問題を修正：

**問題の原因**
- 「Run」ボタンの既定コマンド（`aiCodingSidebar.editor.runCommand`）が `Review the file at ${filePath}` という受動的な文言だった
- Claude Codeがこれを「ファイルをレビューするだけ」の指示と解釈し、ファイル内のタスクを直接実行しなかった
- ファイル内に埋め込まれた自己指示的な文言（ディレクトリ名変更指示等）も、プロンプトインジェクションの可能性を疑われて実行されなかった

**修正内容**
- `aiCodingSidebar.editor.runCommand` の既定値を `Execute the instructions described in the file at ${filePath}` に変更（能動的な文言に修正）
- 「Plan」「Spec」ボタンは「レビューして計画書/仕様書を新規作成する」という意図的に異なる振る舞いのため、文言は変更していない

**変更箇所**
- `package.json`: `editor.runCommand` 設定スキーマのデフォルト値
- `EditorProvider.ts`: `editor.runCommand` 読み込み時のフォールバック値

### v1.0.20新機能: Plans View「Quick Start」機能の追加

Plans Viewでタスク名（フォルダ名）を指定しなくても、ワンクリックでディレクトリと初期ファイルを作成できる「Quick Start」機能を追加：

**実装内容**
- ツールバーに⚡アイコンの「Quick Start」ボタンを追加（`aiCodingSidebar.quickStart`）
- クリックすると、フォルダ名の入力を求めずにタイムスタンプ名（`YYYY_MMDD_HHMM_SS`）のディレクトリを自動作成
  - 同一秒内の連打等で同名ディレクトリが既に存在する場合は、連番サフィックス（`_2`, `_3`, ...）を付与して衝突を回避（`TemplateService.generateUniqueDirectoryPath()`）
- ディレクトリ内に専用テンプレート `QUICK_START.md`（`${timestamp}_QUICK_START.md`）を自動作成し、Editor Viewで開いてPlans Viewで選択状態にする
- `QUICK_START.md` は「対象ファイル」（TASK/PROMPT/SPEC.md）と同様に扱われるよう、`FileItem`のアイコン判定・`PlansProvider.findOldestTargetFile()`の自動検出対象に追加

**QUICK_START.mdのテンプレート内容**
```
# task


# update dir name
- Rename the directory containing this file to a short, descriptive English name that reflects the task. Replace the existing timestamp-based name entirely instead of appending to it.
- Update the directory name recorded in this file accordingly

---

memory  : {{dirpath}}
prompt  : {{filename}}
datetime: {{datetime}}
```
- 1つ目の `# task` セクション: タスク内容を記入する領域
- 2つ目の `# update dir name` セクション: タイムスタンプ名で自動作成されたディレクトリを、AIエージェントがタスク内容に適した名前へリネームする際の指示（リネーム処理自体はAIエージェントの実行時タスクであり、拡張機能側では実装していない）。既存のタイムスタンプ名を残したまま末尾に追記されると名前が冗長になるため、「置き換える」ことを明示している

**変更箇所**
- `templates/quick_start.md`（新規）: Quick Start専用テンプレート
- `src/utils/templateUtils.ts`: `TemplateType` に `'quick_start'` を追加
- `src/services/TemplateService.ts`: `generateQuickStartFileName()`、`generateUniqueDirectoryPath()` を追加
- `src/commands/plans.ts`: `aiCodingSidebar.quickStart` コマンドを追加
- `package.json`: コマンド定義・view/titleメニュー定義
- `src/providers/items/FileItem.ts`、`src/providers/PlansProvider.ts`: 対象ファイル判定への `QUICK_START.md` 追加

**動作確認で判明した追加の問題と対応**
- QUICK_START.mdの指示に従ってAIエージェントがディレクトリをリネームすると、Plans Viewが移動前のパス（`activeFolderPath`）を参照し続け、ディレクトリ内が閲覧できなくなる問題が判明
  - `PlansProvider.getChildren()` で表示中のディレクトリが存在しない場合、リネーム後のディレクトリを自動追跡して表示するよう修正
  - `resolveRenamedDirectory()`: 消失したディレクトリ名（タイムスタンプ）で始まるファイルを持つ兄弟ディレクトリを探索し、リネーム後のディレクトリとして特定（ファイル名は変更されずディレクトリのみリネームされるという命名規則を利用）
  - リネーム先が特定できない場合のフォールバックとして、存在する祖先ディレクトリまで遡って表示する `resolveExistingAncestor()` も維持
- リネーム後のディレクトリ名に元のタイムスタンプが残り名前が冗長になる問題が判明
  - `templates/quick_start.md` の指示文言を「既存のタイムスタンプ名を完全に置き換える」旨に明確化
- Plans ViewでQUICK_START.mdを選択すると、TASK.md/PROMPT.md/SPEC.mdとは異なりVS Code標準エディタで開いてしまう問題が判明
  - `extension.ts` のTreeView選択ハンドラにあるファイル種別判定の正規表現（`^\d{4}_\d{4}_\d{4}_\d{2}_(PROMPT|TASK|SPEC)\.md$`）に `QUICK_START` が未対応だったため追加し、Markdown Editor（Editor View）で開くよう修正

### v1.0.19変更: `--enable-auto-mode` → `--permission-mode auto` への置き換え

廃止されたClaude CLIオプション `--enable-auto-mode` を `--permission-mode auto` に全面置き換え：

**変更内容**
- `aiCodingSidebar.editor.commandPrefix` デフォルト値: `claude --enable-auto-mode` → `claude --permission-mode auto`
- Terminal Viewショートカットバーのボタンラベルを更新

**変更箇所**
- `package.json`: 設定スキーマのデフォルト値
- `ConfigurationProvider.ts`: フォールバック値
- `EditorProvider.ts`: フォールバック値（4箇所）
- `resources/webview/terminal/index.html`: ボタンラベルとID
- `resources/webview/terminal/main.js`: イベントリスナー

### v1.0.18変更: Terminal Viewショートカットバーの再設計

ボタン増加による横幅拡大を解消するため、ショートカットバーを3グループ構成に再設計：

**変更後の構成**
```
Claude Code未起動時（デフォルト）:
[claude] [claude --permission-mode auto] [claude -c] [claude -r] [↑]

updateコマンド表示時（↑ 押下後）:
[claude update] [brew upgrade claude-code] [←]

Claude Code起動中:
[/model sonnet] [/model opus] [/compact] [/clear] [←]
```

**変更箇所**
- `resources/webview/terminal/index.html`: `shortcuts-update` グループ追加、`⇆` を `↑`/`←` に置換
- `resources/webview/terminal/main.js`: `updateShortcutBar()` 更新、`toggleShortcuts()` を個別ハンドラに置換

### v1.0.17変更: commandPrefixデフォルト値の変更（--enable-auto-mode追加）

`aiCodingSidebar.editor.commandPrefix` のデフォルト値に `--enable-auto-mode` オプションを追加：

**変更内容**
- デフォルト値: `claude` → `claude --enable-auto-mode`
- Run/Plan/Specコマンド実行時に自動的にauto modeが有効化される
- ユーザーは設定画面から `commandPrefix` を `claude` に戻すことで従来の動作に戻せる

**変更箇所**
- `package.json`: 設定スキーマのデフォルト値
- `ConfigurationProvider.ts`: フォールバック値
- `EditorProvider.ts`: フォールバック値（4箇所）

### v1.0.16変更: テンプレートファイルのメタデータセクション更新

組み込みテンプレートファイル（`templates/prompt.md`、`templates/spec.md`、`templates/task.md`）のメタデータセクションを更新：

**変更内容**
- `working dir: {{dirpath}}` 行を削除
- `memory  : {{dirpath}}` 行を追加（セッションメモリの保存先を示す）
- `prompt file: {{filename}}` を `prompt  : {{filename}}` に変更

**変更後のメタデータセクション（3ファイル共通）**
```
---

memory  : {{dirpath}}
prompt  : {{filename}}
datetime: {{datetime}}
```

### v1.0.15バグ修正: Plans Viewファイル追加の自動反映（ポーリングによる補完）

v1.0.13でリスナーを常時有効化したが、`vscode.FileSystemWatcher`自体がイベントを見逃すケースがあり、まだ反映されない問題が発生していた。2つの改善を実施：

**FileWatcherService.tsの監視方法改善**
- `RelativePattern`のベースを`workspaceFolder`全体から監視ディレクトリのURIに変更し、イベント検知精度を向上
  - 変更前: `new vscode.RelativePattern(workspaceFolder, '.claude/plans/**/*')`
  - 変更後: `new vscode.RelativePattern(plansUri, '**/*')` （`plansUri`は監視対象ディレクトリのURI）
- `vscode.workspace.onDidCreateFiles` / `onDidDeleteFiles` / `onDidRenameFiles` を追加監視ソースとして登録（`FileSystemWatcher`の補完）

**PlansProviderへのポーリング機能追加**
- Plans View表示中のみ、3秒ごとに`activeFolderPath`のファイル数とmtimeを前回と比較
- 変化があった場合のみ`refresh()`を呼び出す（不要な更新を防止）
- ビュー非表示時・`dispose()`時にポーリングを停止してリソースを解放
- ディレクトリ移動時にスナップショットをリセット

**動作フロー（修正後）**
1. ファイルが追加される
2. `FileSystemWatcher`または`workspace.onDidCreateFiles`がイベントを検知 → 即時リフレッシュ
3. （万が一イベントを見逃しても）ポーリングが3秒以内に変化を検知 → リフレッシュ

### v1.0.14バグ修正: Terminal Viewファイルパスのクリッカブルリンク

Terminal Viewに出力されたファイルパスがクリッカブルにならない問題を修正：

**問題の根本原因**
- 根本原因1: `registerLinkProvider` の正規表現パターンが `.claude/plans/...` のような「`.`+ディレクトリ名」形式にマッチしていなかった
  - 旧パターン `(\.?\/|\.\.?\/|\/)` は `/`・`./`・`../` にのみマッチ
  - `.claude/` のような隠しディレクトリ形式は対象外だった
- 根本原因2: リンクオブジェクトに `decorations` プロパティが未設定のため、ホバー時の視覚的フィードバック（下線・ポインターカーソル）がなく、ユーザーがリンクと認識できなかった

**修正内容**（`resources/webview/terminal/main.js`）
- 正規表現パターンを変更して3種類のパスに対応:
  - 絶対パス: `/path/to/file.ext`
  - 相対パス: `./path/file.ext`・`../path/file.ext`
  - 隠しディレクトリ: `.claude/plans/file.ext`（新規対応）
- `decorations: { pointerCursor: true, underline: true }` を追加
- キャプチャグループを使用したマッチ処理ロジックの簡略化

**変更後のパターン**
```
/(?:^|[\s'":([])((?:\.{1,2}\/|\.(?=[a-zA-Z_])|\/)[a-zA-Z0-9_.\-\/]*[a-zA-Z0-9_\-]\.[a-zA-Z0-9]+(?::\d+)?)/g
```

### v1.0.13バグ修正: Plans Viewファイル追加の自動反映（完全修正）

v1.0.10で実施した修正では、ビュー非表示中にリスナーを無効化していたため、問題が完全には解決していませんでした。根本原因を特定し、完全に修正：

**問題の根本原因**
- Plans Viewが非表示の状態でファイルを追加すると、FileWatcherのリスナーが無効化されているため、イベントは発火するが**通知されない**
- ビュー復帰時に`refresh()`は呼ばれるが、**既にイベントは失われている**
- v1.0.10の「ビュー復帰時のリフレッシュ」は正しく動作していたが、リスナー無効化が問題だった

**修正内容**
- **リスナーを常に有効化**（PlansProvider.ts:45-53行目）
  - コンストラクタでリスナー登録後、即座に`enableListener()`を呼び出す
  - ビューの可視性に関わらず常に有効
- **handleVisibilityChange()の変更**（PlansProvider.ts:103-115行目）
  - リスナーを無効化しない（`disableListener()`を削除）
  - ビュー表示時は`refresh()`のみ呼び出す
  - 非表示時は何もしない

**動作フロー（修正後）**
1. Plans Viewが非表示の状態でファイル追加
2. FileWatcherがイベントを検知
3. **リスナーが有効なので通知される**（修正ポイント）
4. `debouncedRefresh()`が呼ばれ、キャッシュがクリア
5. Plans Viewに戻ると`refresh()`が呼ばれる
6. 最新の状態が自動的に反映される

**パフォーマンスへの影響**
- ビュー非表示中でもリスナーが動作するが、処理は軽量（キャッシュクリア＋デバウンス）
- FileWatcherの監視範囲は`.claude/plans/**/*`のみで限定的
- デバウンス処理（500ms）により、連続したイベントを統合

### v1.0.10バグ修正: Plans Viewファイル追加の自動反映（部分修正）

Plans Viewで開いているディレクトリにファイルが追加されてもリアルタイムに反映されない問題を修正：

**キャッシュクリアの改善**
- FileWatcherServiceからの変更通知時に、部分的なキャッシュクリア（targetPathベース）ではなく、全キャッシュクリアに変更
- パス正規化の差異やデバウンスによるイベント統合で特定パスのキャッシュクリアが漏れる問題を解消
- 500msデバウンスが既に適用されているため、パフォーマンスへの影響は軽微

**ビュー復帰時のリフレッシュ追加**
- `handleVisibilityChange(true)` 時に `refresh()` を呼び出すように変更
- ビュー非表示中にFileWatcherイベントが発生しても、リスナーが無効化されているためイベントが失われる問題をカバー
- パネル切り替え後に最新のファイル状態が確実に反映される

**注**: この修正では、ビュー非表示中にリスナーを無効化していたため、問題が完全には解決していませんでした。v1.0.13でリスナーを常時有効化し、v1.0.15でポーリング機能を追加して完全に解決しました。

### v1.0.9改善: マシン負荷の大幅削減

プロセス監視、ファイル監視、リソース管理の最適化により、マシン負荷を大幅に削減：

**プロセス監視の最適化**
- `getProcessTree(sessionId)` メソッドを新設し、1回のpsコマンドでClaude Code検知とフォアグラウンドプロセス名取得を統合
- タブごとのsetIntervalを単一のsetIntervalに統合（5タブ時: 最大20回/1.5秒 → 1回/1.5秒、95%削減）
- WebView非表示時にプロセスチェックを完全停止
- 適応的な間隔調整: Claude Code起動中は1.5秒、未起動時は3秒

**ファイル監視の最適化**
- FileWatcherServiceの監視パターンを`**/*`（全体）から`.claude/plans/**/*`（設定値に基づく）に限定
- 設定変更時にウォッチャーを動的に再作成

**正規表現処理の最適化**
- エスケープシーケンス除去処理を`_stripEscapeSequences()`に共通化（2回→1回/出力）
- 正規表現をstatic readonlyプロパティとして事前コンパイル

**リソースクリーンアップの完全化**
- `_closeTab()`に`_cleanupOutputMonitoring()`と`_lastProcessNames.delete()`を追加
- `_cleanup()`に`_outputMonitor.clear()`と`_lastProcessNames.clear()`を追加
- ResizeObserverのdisconnect()をcloseTab()に追加
- 5箇所のDisposable管理漏れを修正（extension.ts、TerminalProvider.ts、EditorProvider.ts）

**同期I/Oの非同期化**
- PlansProvider、commands/plans.ts、commands/files.ts、workspaceSetup.ts、templateUtils.tsの全同期I/Oを非同期化
- `getFilesInDirectory()`のstat呼び出しをPromise.allで並列化

### v1.0.8更新: xterm.js v5 → v6（@xterm/xterm）アップデート

Terminal Viewで使用しているxterm.jsおよび関連アドオンを、非推奨パッケージから新パッケージ（@xtermスコープ）に移行：

**パッケージ移行**
- `xterm@5.3.0` → `@xterm/xterm@6.0.0`
- `xterm-addon-fit@0.8.0` → `@xterm/addon-fit@0.11.0`
- `xterm-addon-web-links@0.9.0` → `@xterm/addon-web-links@0.12.0`
- `xterm-addon-unicode11`（手動配置）→ `@xterm/addon-unicode11@0.9.0`（package.jsonで管理）

**ビルドシステム改善**
- `copy-xterm`スクリプトを新パッケージパスに対応
- 全アドオン（fit, web-links, unicode11）を`copy-xterm`スクリプトに含め、`npm run copy-xterm`で全5ファイルが自動コピーされるように改善
- `media/xterm/`内のファイル名は既存名を維持し、TerminalProvider.tsの変更を不要に

**API互換性**
- グローバル変数名（`Terminal`, `FitAddon`, `WebLinksAddon`, `Unicode11Addon`）は全て互換
- `.xterm-viewport`、`.xterm-screen`クラスはv6でも存在
- `allowProposedApi`オプションはv6でも認識される
- main.js、style.css、TerminalProvider.ts、TerminalService.tsの変更は不要

### v1.0.7新機能: Terminal Viewショートカットに「claude update」を追加

Terminal ViewのClaude Code未起動時のショートカットバーに `claude update` ボタンを追加：

**実装内容**
- **HTMLボタン追加**: `resources/webview/terminal/index.html` の `shortcuts-not-running` グループにボタンを追加
  - トグルボタン（⇆）の直前（一番右側）に配置
- **イベントリスナー追加**: `resources/webview/terminal/main.js` にクリックイベントリスナーを追加
  - `startsClaudeCode: false` — Claude CLIのアップデートコマンドでインタラクティブセッションを起動しない

**変更後のClaude Code未起動時ショートカット**
```
[claude] [claude -c] [claude -r] [claude update] [⇆]
```

**メリット**
- ターミナルショートカットから直接Claude CLIのアップデートが可能
- 既存の `handleShortcut` メソッドでシェルコマンドとして送信されるため、バックエンド変更不要

### v1.0.6改善: Plans Viewファイル表示の改善

Plans Viewのファイル表示に関する2つの改善を実施：

**ルートディレクトリのファイルから日付/時間プレフィックスを削除**
- ルートディレクトリのファイルに表示されていた`[HH:MM]`/`[MM/DD]`プレフィックスを削除
- ディレクトリのプレフィックス表示は維持
- ルートディレクトリとサブディレクトリでファイル表示を統一

**Editor View対象ファイルのアイコン差別化**
- TASK.md、PROMPT.md、SPEC.mdファイルに`edit`アイコンを表示（ルート・サブディレクトリ両方）
- それ以外の.mdファイルは従来通り`markdown`アイコンを表示
- FileItemの`getFileIcon()`メソッドのパターンを修正: `/^\d{4}\.\d{4}\.\d{2}_PROMPT\.md$/`（不一致バグあり）→ `/(?:TASK|PROMPT|SPEC)\.md$/i`
- `findOldestTargetFile`と同じ対象ファイル判定に統一（大文字小文字を区別しない）

### v0.9.10新機能: プロセスベースのClaude Code検知

プロンプト表示に依存しない、信頼性の高いClaude Code検知機能を実装：

**実装内容**
- **TerminalServiceの拡張**: PTY子プロセスの取得とClaude Code検知機能を追加
  - `getChildProcesses(sessionId)`: PTYの子プロセスをリスト化
  - `isClaudeCodeRunning(sessionId)`: プロセス名でClaude Codeを検知
  - プラットフォーム別実装（macOS/Linux: `ps`、Windows: `wmic`）
- **TerminalProviderの統合**: プロセスチェックのライフサイクル管理
  - タブ作成・セッション再接続時にプロセスチェック開始（1.5秒間隔）
  - タブ削除・クリーンアップ時にプロセスチェック停止
  - 状態変更時にWebViewへ通知
- **ITerminalServiceインターフェースの拡張**: ProcessInfo型定義とメソッド追加

**メリット**
- プロンプト表示の変更に影響されない
- 誤検知が大幅に減少
- パフォーマンスへの影響は最小限（チェック1回あたり約1ms、1.5秒間隔）
- 既存のパターンマッチング検知と併用して最高の信頼性を実現

**技術詳細**
- 検知方法: PTY子プロセスのコマンド名に"claude"または"anthropic"が含まれるかチェック
- エラー耐性: プロセス未検出時は空配列を返す（エラーではない）
- クロスプラットフォーム: macOS/Linux検証済み、Windows実装済み（未テスト）

### v0.9.8バグ修正: Terminal Viewローダー表示の改善

Terminal Viewのローダー表示の不具合を修正し、フォーカス変更時の誤動作を解消：

**修正内容**
- **エスケープシーケンス除去の強化**: CSI・OSCシーケンスに対応
  - CSIシーケンス: `\x1b\[[\?0-9;]*[a-zA-Z]`
  - OSCシーケンス: `\x1b\].*?(\x07|\x1b\\)`（タイトル設定等）
  - 制御文字の除去（タブ・改行・CR以外）
- **ノイズフィルタリングの追加**:
  - 単独の"T"文字（制御文字の残骸）を無視
  - ボックス描画文字・ブロック要素のみの出力を無視
  - プログレスバー文字（`░▒▓█◯◉●○`等）のみの出力を無視
  - `[░░░░░░░░░░] 0%`形式のプログレスバーを無視
- **処理中判定の改善**:
  - 意味のある出力（実際のテキスト）がある場合のみ処理中状態にする
  - フォーカス変更などの制御文字は無視

**削除した機能**
- **プロセス監視機能**: ps-treeベースのプロセス監視を削除
  - より信頼性の高いパターンベース検知に戻した
  - 状態検知ロジックを簡素化
  - `_getProcessInfo()`、`getProcessTree()`、`_isClaudeProcess()`、`isClaudeCodeRunning()`メソッドを削除
  - ps-tree依存を削除

**動作**
- **Claude Code起動検知**: `claude>`, `❯`, `Claude Code`などのパターンで検知
- **Claude Code終了検知**: シェルプロンプト（`user@hostname`形式）で検知
- **処理中状態**: 意味のある出力があれば処理中、2秒間出力がなければ処理完了

### Terminal Viewのアーキテクチャ（v0.9.0で改善）

Terminal Viewの安定性向上のため、以下の改善を実施：

**セッション管理**
- PTYセッションの異常終了を検知し、UI上で「Reconnect」ボタンを表示
- セッション再接続時に新しいPTYセッションを作成し、状態をリセット
- Webview再生成時に全セッションを終了してクリーンアップ

**パフォーマンス最適化**
- Resizeイベントを200msでデバウンス
- 同じサイズへのリサイズをスキップ
- 出力リスナーの管理を最適化

**環境変数の安全化**
- `LANG`は未設定時のみデフォルト値（`en_US.UTF-8`）を設定
- `LC_ALL`は設定せず、ユーザー環境を尊重
- `TERM`と`COLORTERM`を明示的に設定

**エラーハンドリング**
- node-pty利用不可時に具体的なエラーメッセージを表示
- `getUnavailableReason()`メソッドでエラー理由を取得可能

### データフロー

1. Plans Viewで「Create directory」をクリックすると、`.claude/plans` ディレクトリと初期プロンプトファイル（`YYYY_MMDD_HHMM_SS_PROMPT.md`）を自動作成（v0.9.14）
   - 初期プロンプトファイルには、Run/Plan/Specボタンの使い方を説明するテンプレートが含まれる
   - 作成されたファイルは自動的にEditor Viewで開かれ、Plans Viewで選択される
2. PlansProviderでディレクトリ/ファイルを選択（フラットリスト形式）
3. ディレクトリクリックでそのディレクトリ内に移動、".."で親に移動
4. ディレクトリ移動時、自動的に最も古いTASK.md/PROMPT.md/SPEC.mdファイルを検索してEditorViewに表示
5. タイムスタンプ形式のMarkdownファイル選択時、EditorProviderにファイルパスが渡される
6. FileWatcherServiceがファイル変更を監視し、各Providerに通知
7. EditorのRunボタンでTerminalProviderにコマンドを送信
8. Terminal Viewでタブを選択すると、Editor ViewとPlans Viewが自動的に連携（v0.9.3）
9. Claude Code検知時に`claudeCodeStateChanged`メッセージでローダー表示を更新（v0.9.8）

### 設定項目（package.json）

- `aiCodingSidebar.plans.defaultRelativePath`: デフォルトの相対パス（デフォルト: `.claude/plans`）
- `aiCodingSidebar.plans.sortBy`: ソート基準（name/created/modified）- ファイルとディレクトリの両方に適用
- `aiCodingSidebar.plans.sortOrder`: ソート順（ascending/descending）- ファイルとディレクトリの両方に適用
- `aiCodingSidebar.editor.commandPrefix`: コマンドプレフィックス（デフォルト: `claude`）
- `aiCodingSidebar.editor.runCommand`: Runボタン実行コマンド
- `aiCodingSidebar.editor.runCommandWithoutFile`: ファイルなし時のRunコマンド
- `aiCodingSidebar.editor.planCommand`: Planボタン実行コマンド
- `aiCodingSidebar.editor.specCommand`: Specボタン実行コマンド
- `aiCodingSidebar.terminal.*`: ターミナル設定（shell, fontSize, fontFamily, cursorStyle, cursorBlink, scrollback）

## テストフレームワーク

### テストツール
- **フレームワーク**: Mocha + @vscode/test-electron
- **アサーションライブラリ**: Chai
- **カバレッジツール**: nyc (Istanbul)
- **テストファイル**: `src/test/suite/**/*.test.ts`

### テスト実行方法

#### VSCode内でのデバッグ実行（推奨）
1. `Cmd+Shift+D` (Mac) / `Ctrl+Shift+D` (Windows/Linux) でデバッグビューを開く
2. ドロップダウンから「Extension Tests」を選択
3. `F5` キーを押してテストを実行

#### コマンドラインでの実行
```bash
npm test
```

#### カバレッジ付きテスト実行
```bash
npm run test:coverage
```
カバレッジレポートは `coverage/` ディレクトリに生成されます。

### 実装済みのテスト

- **Utils**: fileUtils, templateUtils, workspaceSetup
- **Services**: TemplateService, FileOperationService, ConfigurationProvider (スキップ)
- **Providers**: MenuProvider, PlansProvider, EditorProvider, TerminalProvider
- **Commands**: settings, documentation, files
- **Integration**: 拡張機能アクティベーション、コマンド登録、エンドツーエンドテスト

### テスト統計
- **合計**: 142 passing
- **スキップ**: 16 pending (ConfigurationProvider)
- **失敗**: 0 failing

## プルリクエスト作成前のチェックリスト

### 必須手順（順番を守ること）

1. **コンパイル確認**: `npm run compile`
2. **テスト実行**: `npm test` または VSCode内で「Extension Tests」を実行
3. **VSIXパッケージ作成**: `npm run package`
   - **重要**: PR作成前に必ずVSIXパッケージを作成する
   - `releases/ai-coding-sidebar-*.vsix` が生成されることを確認

## CI/CD

### GitHub Actions ワークフロー

#### テストワークフロー (test.yml)
プルリクエストとmainブランチへのプッシュ時に自動実行：

- **複数OS**: Ubuntu, macOS, Windows
- **複数Node.jsバージョン**: 18.x, 20.x
- **実行内容**:
  1. 依存関係のインストール (`npm ci`)
  2. TypeScriptコンパイル (`npm run compile`)
  3. テスト実行 (`npm test`)
     - Linux: `xvfb-run -a npm test` (ヘッドレスモード)
     - macOS/Windows: `npm test`
  4. テスト結果のアップロード

#### リリースワークフロー

mainブランチへのプッシュで自動的に以下が実行される：

1. TypeScriptコンパイル
2. VSIXパッケージ作成
3. GitHub Releaseへアップロード（タグ: v{version}）

## 注意事項

- `.claude`ディレクトリはコミット対象外
- Git操作は明示的な指示がない限りコミットしない
- ブランチを作成する場合は、必ずmainブランチから切ること
- ファイル末尾は必ず空行を含める
