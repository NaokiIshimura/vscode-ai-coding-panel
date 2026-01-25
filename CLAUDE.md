# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

AIコーディングツール（Claude Code、Cursor、GitHub Copilot等）との連携を強化するVSCode拡張機能。ワークスペース内のファイル・フォルダの効率的な閲覧・管理、Git変更ファイルの追跡など、AIとのコーディング作業を支援する機能を提供する。

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

1. PlansProviderでディレクトリ/ファイルを選択（フラットリスト形式）
2. ディレクトリクリックでそのディレクトリ内に移動、".."で親に移動
3. ディレクトリ移動時、自動的に最も古いTASK.md/PROMPT.md/SPEC.mdファイルを検索してEditorViewに表示
4. タイムスタンプ形式のMarkdownファイル選択時、EditorProviderにファイルパスが渡される
5. FileWatcherServiceがファイル変更を監視し、各Providerに通知
6. EditorのRunボタンでTerminalProviderにコマンドを送信
7. Terminal Viewでタブを選択すると、Editor ViewとPlans Viewが自動的に連携（v0.9.3）
8. Claude Code検知時に`claudeCodeStateChanged`メッセージでローダー表示を更新（v0.9.8）

### 設定項目（package.json）

- `aiCodingSidebar.plans.defaultRelativePath`: デフォルトの相対パス（デフォルト: `.claude/plans`）
- `aiCodingSidebar.plans.sortBy`: ソート基準（name/created/modified）- ファイルとディレクトリの両方に適用
- `aiCodingSidebar.plans.sortOrder`: ソート順（ascending/descending）- ファイルとディレクトリの両方に適用
- `aiCodingSidebar.editor.runCommand`: Runボタン実行コマンド
- `aiCodingSidebar.editor.runCommandWithoutFile`: ファイルなし時のRunコマンド
- `aiCodingSidebar.editor.planCommand`: Planボタン実行コマンド
- `aiCodingSidebar.editor.specCommand`: Specボタン実行コマンド
- `aiCodingSidebar.terminal.*`: ターミナル設定（shell, fontSize, fontFamily, cursorStyle, cursorBlink, scrollback）

## プルリクエスト作成前のチェックリスト

### 必須手順（順番を守ること）

1. **コンパイル確認**: `npm run compile`
2. **VSIXパッケージ作成**: `npm run package`
   - **重要**: PR作成前に必ずVSIXパッケージを作成する
   - `releases/ai-coding-sidebar-*.vsix` が生成されることを確認

## リリースプロセス

mainブランチへのプッシュで自動的に以下が実行される：

1. TypeScriptコンパイル
2. VSIXパッケージ作成
3. GitHub Releaseへアップロード（タグ: v{version}）

## 注意事項

- `.claude`ディレクトリはコミット対象外
- Git操作は明示的な指示がない限りコミットしない
- ブランチを作成する場合は、必ずmainブランチから切ること
- ファイル末尾は必ず空行を含める
- テストフレームワークは未実装
