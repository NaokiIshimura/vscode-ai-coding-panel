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
│   ├── PlansProvider.ts  # Plansビュー（フラットリスト、Drag&Drop）
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
        └── terminal/     # TerminalProvider用外部ファイル（v0.9.7で追加）
            ├── index.html  # HTMLテンプレート
            ├── style.css   # スタイルシート
            └── main.js     # JavaScript
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

### v1.0.10バグ修正: Plans Viewファイル追加の自動反映

Plans Viewで開いているディレクトリにファイルが追加されてもリアルタイムに反映されない問題を修正：

**キャッシュクリアの改善**
- FileWatcherServiceからの変更通知時に、部分的なキャッシュクリア（targetPathベース）ではなく、全キャッシュクリアに変更
- パス正規化の差異やデバウンスによるイベント統合で特定パスのキャッシュクリアが漏れる問題を解消
- 500msデバウンスが既に適用されているため、パフォーマンスへの影響は軽微

**ビュー復帰時のリフレッシュ追加**
- `handleVisibilityChange(true)` 時に `refresh()` を呼び出すように変更
- ビュー非表示中にFileWatcherイベントが発生しても、リスナーが無効化されているためイベントが失われる問題をカバー
- パネル切り替え後に最新のファイル状態が確実に反映される

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
- `aiCodingSidebar.editor.commandPrefix`: コマンドプレフィックス（デフォルト: `claude --model opus`）
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
