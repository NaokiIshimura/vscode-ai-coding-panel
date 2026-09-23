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
│   ├── browser.ts        # ブラウザ関連コマンド（1コマンド、v1.1.5で新設）
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

### v1.2.5バグ修正: Runでエディタの内容がシェルに解釈される

v1.2.4でRunがエディタの内容を送信するようになった結果、Markdownのコードフェンスやインラインコードを含む本文を送ると、本文の一部がシェルコマンドとして実行され、`claude` には冒頭しか渡らない問題を修正した：

**原因はエスケープの形とテンプレートの形が噛み合っていないこと**

| 箇所 | 生成していたもの |
|---|---|
| `_escapeShellArgument()` | `'値'`（シングルクォート囲み） |
| テンプレート既定値 | `${commandPrefix} "${editorContent}"`（さらにダブルクォートで囲む） |
| 送信される文字列 | `claude "'# task ...'"` |

外側がダブルクォートになるためシングルクォートはただの文字になり、`` ` `` `$` `\` が展開対象のまま残る。Markdownの本文には必ずバッククォートが入るため、`` `claude attach xxx` `` がコマンド置換として**実行され**、コードフェンス ` ``` ` は空のバッククォート対になって `command not found: `（空のコマンド名）を起こしていた。

**対話シェルでは `!` のヒストリ展開まで起きる（修正方針を決めた根拠）**

| 送信形 | 対話zshの結果 |
|---|---|
| `claude "重要!注意"` | `zsh: event not found: 注意` → コマンドが実行されない |
| `claude '重要!注意'` | 正常に1引数として渡る |

コマンドはPTY上の対話シェルへ送るため、`sh -c` では起きないヒストリ展開が起きる。本文に `!` は普通に現れるので、**値はシングルクォートで保護するしかない**。

**`${filePath}` と揃えるために、テンプレートではなくエスケープ関数を直した**

`${editorContent}` は引数まるごとなので「テンプレートの `"` を外す」修正でも直る。しかし `${filePath}` はPlan / Specで**英文の途中**へ埋め込まれ（`"Review the file at ${filePath} and create..."`）、文全体を1引数にするダブルクォートを外せないため同じ手が使えない。

そこで戻り値の前後にもダブルクォートを付け、**テンプレート側のクォートを一度閉じ、値をシングルクォートで保護し、また開く**形にした。シェルは隣接する引用符を連結するため結果は1引数のままになる。

```ts
private _escapeShellArgument(arg: string): string {
    return `"'${arg.replace(/'/g, "'\\''")}'"`;
}
```

| テンプレート | 置換後 | 渡る引数 |
|---|---|---|
| `${commandPrefix} "${editorContent}"` | `claude ""'本文'""` | 本文全体（1引数） |
| `..."Review the file at ${filePath} and..."` | `..."Review the file at "'path'" and..."` | 文全体（1引数） |

- 変更は**この1関数のみ**。`${editorContent}` と `${filePath}` の計5箇所がすべてこの関数を通るため、Run / Plan / Spec が同時に直る
- `package.json` の既定値・ユーザー設定・READMEの設定例は**変更していない**。既定値から `"` を外す案だと、旧既定値を設定として保存済みのユーザーが直らず、`${filePath}` 側には適用もできない
- 副次的に、Plan / Specのプロンプト文からリテラルのクォートが消える（`Review the file at '.claude/x.md' and` → `Review the file at .claude/x.md and`）

**「プレースホルダはダブルクォートで囲む」がテンプレートの契約になる（唯一の非互換）**
- `"` で囲まないカスタムテンプレート（`${commandPrefix} ${editorContent}`）は、この変更後に `zsh: unmatched '` で壊れる
- 既定値・README・`docs/editor-view.md` の例はすべて `"` 付きのため実害は無いが、`package.json` の `description`（6箇所）とREADME 2種・`docs/editor-view.md` に明記した

**実装内容**

| ファイル | 変更 |
|---|---|
| `src/providers/EditorProvider.ts` | `_escapeShellArgument()` の戻り値とコメント |
| `package.json` | `runCommand` / `runCommandWithoutFile` / `runPlanCommand` / `runSpecCommand`（＋旧キー2件）の `description` |
| `README.md` / `README-JA.md` / `docs/editor-view.md` | プレースホルダの説明 |
| `src/test/suite/providers/EditorProvider.test.ts` | `_escapeShellArgument()` のテスト10ケース |

**ローカルでのテスト実行について**
- v1.1.15に記載のとおり、macOSローカルの `npm test` はmochaの結果が親プロセスへ返らず、失敗しても成功扱いになる
- 本バージョンでは `vscode` をスタブ化したNode上でmocha（`--ui tdd`）を実行して確認している（`EditorProvider.test.ts` 22 passing。既存12ケースへの影響なし）
- あわせて、スタブ上で `EditorProvider` を生成して `runTask()` が実際に生成するコマンド文字列を取り出し、**対話zsh（`zsh -i`）へ流して**バッククォート・コードフェンス・`!`・`$`・`'` を含む本文が1引数のまま渡ることを確認している。非対話の `zsh -c` ではヒストリ展開が起きないため、この検証は `-i` で行う必要がある

### v1.2.4変更: Runボタンの送信内容とPlan / Specの設定キー名

Editor ViewのRunボタンが送信する内容を「ファイルパス」から「エディタの内容」へ変更し、Plan / Spec のコマンド設定をリネームした：

**Runボタンがエディタの内容を送信する**

| | 変更前 | 変更後 |
|---|---|---|
| `aiCodingSidebar.editor.runCommand` の既定値 | `${commandPrefix} "Execute the instructions described in the file at ${filePath}"` | `${commandPrefix} "${editorContent}"` |
| 送信される内容 | ファイルの相対パス（Claude Codeが読みに行く） | ファイルの内容そのもの |

- 従来の挙動に戻す場合は `aiCodingSidebar.editor.runCommand` に変更前の値を設定する

**既定値の変更だけでは動かない（最も見落としやすい箇所）**
- `_runTask()` のファイルあり分岐は `${commandPrefix}` と `${filePath}` しか置換していなかったため、既定値を変えるだけでは `${editorContent}` が文字列のまま送信される
- 同分岐へ `${editorContent}` の置換を追加した。ファイル未オープン時の `runCommandWithoutFile` は従来どおりで変更していない

**置換に使う内容と順序**

| 項目 | 内容 |
|---|---|
| 値 | `this._pendingContent ?? this._currentContent ?? ''`。`runTask()` が使う「最新の内容」と同じ取り方で、未保存の編集を含む |
| タイミング | `_appendSendHistory()` の**前**。エディタに表示されている内容がそのまま送信され、今回のresumeコマンド行は含まれない |
| 順序 | commandPrefix → filePath → **editorContent を最後**。ファイル内に `${filePath}` 等が書かれていても展開しないため |

- エスケープは既存の `_escapeShellArgument()` を使う。テンプレート側の `"` と合わせて `"'内容'"` となるが、これは `runCommandWithoutFile` の従来からの挙動と同じ

**Plan / Spec のコマンド設定をリネームした**

| 変更前 | 変更後 | 設定画面の表示 |
|---|---|---|
| `aiCodingSidebar.editor.planCommand` | `aiCodingSidebar.editor.runPlanCommand` | Run Plan Command |
| `aiCodingSidebar.editor.specCommand` | `aiCodingSidebar.editor.runSpecCommand` | Run Spec Command |

- VS Codeは設定のタイトルをキーの末尾セグメントから生成するため（v1.2.3参照）、表示名を変えるにはキー名を変えるしかない
- `Run Command` と並びが揃い、3つのボタンに対応する設定であることが表からも読み取れる

**旧キーの値を引き継ぐ（リネームでユーザー設定を失わせないため）**
- `EditorProvider._getCommandTemplate()` を追加し、**新キーに明示的な値が無い場合に限り**旧キーの値を返す
- `get()` はユーザーが設定した値と拡張機能の既定値を区別できないため、`inspect()` の `workspaceFolderValue` / `workspaceValue` / `globalValue` で判定する
- 旧キーは `package.json` に `deprecationMessage` 付きで残す。スキーマから消すとVS Codeが「不明な設定」として警告するため。非推奨の設定は設定画面の一覧に出ないので、表示されるのは新キーのみ

**実装内容**

| ファイル | 変更 |
|---|---|
| `src/providers/EditorProvider.ts` | `_getCommandTemplate()` を追加。Plan / Spec の2箇所で使用。Run分岐に `${editorContent}` の置換を追加し、`runCommand` のフォールバック値を変更 |
| `package.json` | `runCommand` の既定値と説明、`runPlanCommand` / `runSpecCommand` の追加、旧キー2件への `deprecationMessage` |
| `README.md` / `README-JA.md` / `docs/editor-view.md` | 設定表・設定例・プレースホルダー表 |

**ローカルでのテスト実行について**
- v1.1.15に記載のとおり、macOSローカルの `npm test` はmochaの結果が親プロセスへ返らず、失敗しても成功扱いになる
- 本バージョンでは `vscode` をスタブ化したNode上で `EditorProvider` を生成し、`_getCommandTemplate()`（旧キーからの引き継ぎ5ケース）と `_runTask()`（既定値での展開・未保存内容の優先・シングルクォートのエスケープ・内容中プレースホルダーの非展開・`${filePath}` を使うカスタム設定・ファイル未オープン時の6ケース）を直接呼び出して確認している

### v1.2.3新機能: テンプレート読み込み元の無効化設定

Editor Settings に、テンプレートの読み込み元を個別に無効化する4つのboolean設定を追加した。いずれも既定は `false`（＝読み込む。従来どおりの挙動）：

| 設定キー | 無効化する対象 | 影響する実装 |
|---|---|---|
| `aiCodingSidebar.editor.disableWorkspaceEditorTemplates` | ワークスペースのファイル雛形 `.vscode/ai-coding-panel/templates/` | `utils/templateUtils.ts` |
| `aiCodingSidebar.editor.disableGlobalEditorTemplates` | グローバルのファイル雛形 `<global>/templates/` | `utils/templateUtils.ts` |
| `aiCodingSidebar.editor.disableWorkspacePromptTemplates` | ワークスペースのスニペット `.vscode/ai-coding-panel/prompts/` | `services/PromptTemplateService.ts` |
| `aiCodingSidebar.editor.disableGlobalPromptTemplates` | グローバルのスニペット `<global>/prompts/` | `services/PromptTemplateService.ts` |

**設定画面の表示名はキー名から生成される**
- VS Codeは設定のタイトルを持たず、キーの末尾セグメントをcamelCase分割して表示する（`disableGlobalEditorTemplates` → `Disable Global Editor Templates`）
- そのため表示名を変えるにはキー名を変えるしかない。`description` はタイトルの下の説明文にしかならない
- ファイル雛形のキーに `Editor` が入っているのはこのため（Menu Viewの `Customize Editor Templates` と表記を揃えている）。スニペット側は `Prompt` が既に入っているため変更していない

**`editor.` 名前空間に置いているのは Editor Settings の実装都合**
- `aiCodingSidebar.openEditorSettings`（`commands/settings.ts`）は `workbench.action.openSettings` へ文字列 `'aiCodingSidebar.editor'` を渡すだけの**検索**であり、このプレフィックスを持たない設定はEditor Settingsに表示されない
- ファイル雛形（template）はEditor View専用ではなくPlans Viewのファイル作成コマンドからも使われるため、意味的には `aiCodingSidebar.templates.*` の方が正確だが、「Editor Settingsに追加する」という要求を優先した

**設定は無効化フラグ、内部では肯定形に反転する**
- `utils/templateSourceSettings.ts`（新規）の `readTemplateSourceSettings()` が `disableXxx` を読み、`TemplateSourceSettings`（**true = 読み込む**）へ反転して返す。呼び出し側の条件式が二重否定になるのを避けるため
- キャッシュしない。`loadTemplate()` / `listTemplates()` は呼ばれるたびに設定を読むため、`onDidChangeConfiguration` を購読しなくても設定変更が即座に反映される

**同梱分（bundled）は無効化できない**
- `buildCandidatePaths()` は無効化された候補を積まないだけで、最後の `<extensionPath>/templates/<type>.md` は常に候補に入る。4設定すべてONでもファイル作成が壊れない
- `listTemplates()` も「有効な読み込み元に1件も無い」場合は同梱分へフォールバックする

**`hasNoUserTemplates()` を `listTemplates()` と同じ基準にする必要がある（最も壊れやすい箇所）**
- 両者は `getEnabledSourceDirs()` を共有する。`hasNoUserTemplates()` は「一覧から同梱分が消えるのを防ぐ」ためだけに存在する関数（v1.2.0）なので、判定対象が一覧とずれると v1.1.20・v1.2.0 と同型のバグ（1件作った瞬間に同梱分が一覧から消える）が再発する
- 例: ワークスペースの読み込みを無効化した状態でグローバルへ1件目を作成する場合、有効な読み込み元はグローバルのみのため、ワークスペースにファイルがあっても同梱分をグローバルへコピーしてから作成する

**無効化するのは「読み込み」だけで「作成・コピー」はしない（設計判断）**

| 対象 | 設定の影響 |
|---|---|
| `loadTemplate()` / `listTemplates()` | あり |
| `validateTemplateName()` | **なし**。重複判定は実ディレクトリに対して行う必要がある（無効化中でも同名ファイルは作れない） |
| `createWorkspaceTemplate()` / `createGlobalTemplate()` | **なし**。明示的な作成操作のため |
| `setupTemplate()` / `setupWorkspaceTemplates()` / `setupGlobalTemplates()` | **なし**。明示的なコピー操作のため |
| `EditorProvider._pickPromptTemplateTarget()` | **なし**。作成先の選択肢は従来どおり両方出る |

- トレードオフとして、無効化中の配置先にも作成できてしまう（作ったのに一覧に出ない、という見え方になり得る）。「読み込まない」という要求の範囲に留めた

**実装内容**

| ファイル | 変更 |
|---|---|
| `src/utils/templateSourceSettings.ts`（新規） | `TemplateSourceSettings` / `TemplateSourceSettingsReader` / `readTemplateSourceSettings()` |
| `src/utils/templateUtils.ts` | `buildCandidatePaths()` に `settings` を渡して候補を絞る。`loadTemplate()` に任意引数 `settings` を追加 |
| `src/services/PromptTemplateService.ts` | コンストラクタに任意の設定リーダーを追加。`getEnabledSourceDirs()` を新設し、`listTemplates()` / `hasNoUserTemplates()` から使う |
| `package.json` | 設定4件 |
| `src/test/suite/utils/templateUtils.test.ts` | 読み込み元を無効化した4ケース |
| `src/test/suite/services/PromptTemplateService.test.ts` | `createService()` に設定の差し替えを追加し、無効化した4ケース |

**テストのために設定リーダーを注入できるようにしている**
- 既存テストは `config.update()` を一切使わず、設定が既定と異なる環境では `this.skip()` する方針。そのままでは設定ONの経路を検証できない
- `loadTemplate()` の第4引数と `PromptTemplateService` の第3引数はいずれも**オプショナル**。必須にすると `extension.ts` と既存テストの生成箇所が壊れる

**ローカルでのテスト実行について**
- v1.1.15に記載のとおり、macOSローカルの `npm test` はmochaの結果が親プロセスへ返らず、失敗しても成功扱いになる
- 本バージョンでは `vscode` をスタブ化したNode上でmocha（`--ui tdd`）を実行して確認している（ワークスペース無し: 44 passing / 5 pending、ワークスペース有り: 47 passing / 2 pending。`workspaceSetup` / `globalTemplatePaths` / `TemplateService` も同時に実行して影響が無いことを確認）

### v1.2.3変更: Menu Viewの項目名変更

Menu Viewのテンプレートカスタマイズ項目から `Global` を外し、親項目で区別する命名にした：

| セクション | 変更前 | 変更後 |
|---|---|---|
| Global | Customize Global Template | Customize Editor Templates |
| Global | Customize Global Prompt Templates | Customize Prompt Templates |
| Workspace | Customize Template | Customize Editor Templates |
| Workspace | Customize Prompt Templates | （変更なし） |

**Global / Workspace の子項目が同名になる**
- 配置先の区別は親項目（Global / Workspace）が担う。ラベル側の `Global` は冗長になるため外した
- コマンドIDは異なるため動作は変わらない（Global: `setupGlobalTemplate` / `setupGlobalPromptTemplates`、Workspace: `setupTemplate` / `setupPromptTemplates`）
- READMEで項目を指す箇所は名前だけでは一意に定まらなくなったため、「Workspaceセクションの」「Globalセクションの同名項目」のようにセクション名を添える表現へ変更した

**ファイル雛形を `Editor Templates` と呼ぶ**
- 従来の `Template` は、スニペット（`Prompt Templates`）との対比が弱かった
- 実体は `templates/{task,spec,prompt,quick_start}.md`（ファイル新規作成時の雛形）で、`resources/prompt-templates/*.md`（挿入用スニペット）とは別物。v1.1.19で分離した2系統の呼び分けを表示名にも反映している

**変更したのは表示名のみ**

| 対象 | 変更 |
|---|---|
| `MenuProvider` の `MenuItem` ラベルと `Command.title` | あり |
| コマンドID | なし |
| `package.json` の `contributes.commands` の `title` | **なし**。コマンドパレットの表示は `Customize Template` / `Customize Global Template` / `Customize Prompt Templates` / `Customize Global Prompt Templates` のまま |
| `commands/settings.ts` の `setupWorkspace` のQuickPick（`$(file-text) Customize Template`） | **なし** |

- 指示の対象がMenu Viewの項目名のため、コマンドパレット側は揃えていない。揃える場合は `package.json` の4箇所と `commands/settings.ts` を合わせて変更する

**実装内容**

| ファイル | 変更 |
|---|---|
| `src/providers/MenuProvider.ts` | Global 2項目・Workspace 1項目のラベルと `title`（各2箇所ずつ） |
| `README.md` / `README-JA.md` | Menu項目名を参照している4箇所（promptsボタンの説明、グローバルテンプレートの節、同梱プロンプトテンプレートの節、テンプレートの優先順位の節） |

- `src/test/suite/providers/MenuProvider.test.ts` はラベル文字列を検証していないため変更不要（9 passing）

### v1.2.2新機能: `output_status` プロンプトテンプレートの追加

Editor Viewの `prompts` ボタン向けの同梱スニペットに `resources/prompt-templates/output_status.md` を追加した（同梱3件→4件）：

**内容**

```markdown
# Output status

Record the current status of this task as a Markdown file.

- Output to: {{dirpath}}
- File name: {{timestamp}}_status.md
- State what is done, what is left, and why each decision was made
- Reference code as file:line so it can be opened directly
- Keep it short enough to be read as a handover note
```

- `{{dirpath}}` はメタデータの `dir` と同じ値に展開されるため、出力先が対応するプロンプトファイルと同じディレクトリに揃う
- ファイル名は挿入時に確定する（`{{timestamp}}` は `PromptTemplateService.buildVariables()` が挿入時刻から生成する）
- 既存3件と同じ「H1 + 1文 + 箇条書き」の構成に合わせている

**コード変更は不要（`listTemplates()` がディレクトリを走査するため）**
- `readTemplatesFrom()` は指定ディレクトリ直下の `.md` を読むだけなので、ファイルを置けば一覧に載る
- ファイル雛形（`templates/*.md`）側の `TEMPLATE_TYPES` のような列挙は存在しないため、同期漏れの心配は無い

**同梱スニペットの追加は既存ユーザーへ自動では届かない（最も誤解しやすい箇所）**

| 前提 | 挙動 |
|---|---|
| コピー元 | `context.extensionPath` 配下。**インストール済み拡張機能のディレクトリ**であり、リポジトリの作業ツリーではない |
| 一覧の条件 | ワークスペースかグローバルに `.md` が1件でもあれば同梱分は表示されない（v1.2.0参照） |
| コピーの条件 | `copyBundledTemplatesTo()` は**存在しないファイルのみ**コピーする |

- したがって、新しい同梱スニペットを見るには「拡張機能のアップデート」＋「Customize (Global) Prompt Templates の再実行」の両方が必要になる。v1.1.20 の `quick_start.md` と同じ構図
- 開発中に確認する場合は `F5`（Extension Development Host）を使う。`extensionPath` がリポジトリを指すため、リリース前でも同梱分に含まれる

**ワークスペース側ではなくグローバル側の再実行を推奨する理由**
- `copyBundledTemplatesTo()` は同梱の**全4件**をコピーする。ワークスペース側で実行すると `add_test` / `refactor` / `review` もワークスペースへ作られる
- 一覧は同名ファイルをワークスペース優先で解決するため（v1.2.0参照）、**グローバルで編集済みの同名スニペットがそのワークスペースでは使われなくなる**。以後グローバル側を編集しても反映されず、気づきにくい
- グローバル側で実行した場合は不足している `output_status.md` が1件増えるだけで、既存ファイルには影響しない

**今回のスコープ外**
- 同梱スニペットの追加を既存ユーザーへ自動で届ける仕組み（activate時の不足分補完、または同梱分を常にマージする方式）。いずれも「意図的に削除したスニペットが復活する」「v1.1.19で決めた『同梱分はユーザー定義と混ぜない』方針の変更」というトレードオフがあるため、本バージョンではリリースノートでの案内に留めている

### v1.2.1新機能: 送信履歴へのresumeコマンド記録

Spec / Plan / Run を実行した際、起動したClaude Codeのセッションを再開するコマンドを、開いているMarkdownファイルへ記録するようにした：

**記録の形式**

v1.1.15で追加した `## sent history` の行を拡張し、日時の後ろへ `|` 区切りで連結する。

```markdown
## sent history
- run : 2026/09/20 15:12:03 | claude --resume 0f1d2c3b-4a59-4687-8f0a-1b2c3d4e5f60
- plan: 2026/09/20 15:20:41 | claude --resume 11111111-2222-4333-8444-555555555555
```

**セッションIDは「取得」ではなく「指定」する（設計の要点）**
- コマンドを送信した後にそのセッションのIDを読み取る手段は無い。ターミナルの出力を解析する案もあるが、TUIの描画に依存するため壊れやすい
- 代わりに拡張機能側で `randomUUID()` を生成し、`--session-id <uuid>` としてコマンドプレフィックスへ付与する。記録するコマンドがセッション開始前に確定するため、追記処理を従来どおり送信の直前に置ける
- 付与位置はプレフィックスの末尾。`claude --permission-mode auto` のようなオプション付きでも `claude --permission-mode auto --session-id <uuid> "..."` となり、テンプレートの `${commandPrefix}` を置き換えるだけで済む
- resumeコマンドの実行ファイルはプレフィックスの先頭トークンを使う。`/usr/local/bin/claude` のようなパス指定でもそのまま再実行できる

**セッションIDを付与しない条件**

| 条件 | 理由 |
|---|---|
| Claude Code起動中（`isClaudeCodeRunning()`） | `sendCommand()` の内容はコマンドとして実行されず入力テキストとして扱われる（v1.0.12参照）。新しいセッションは始まらないため、記録すると存在しないIDが残る |
| プレフィックスがClaude Codeを起動しない | `--session-id` は Claude CLI のオプション。`CLAUDE_EXECUTABLE_PATTERN` で先頭トークンが `claude`（パス付きも可）かを判定する。`claude-wrapper` のような別コマンドは対象外 |
| 既にセッションを指定している | `RESUME_CONFLICTING_OPTIONS` が `--session-id` / `--resume` / `-r` / `--continue` / `-c` / `--fork-session` を検出する |
| `recordSendTimestamp` が `false` | 記録先の行そのものが作られないため |
| `recordResumeCommand` が `false` | 本機能の設定 |
| ファイル未オープンでのRun | 追記先が無い（v1.1.15と同じ扱い） |

**実装内容**

| ファイル | 変更 |
|---|---|
| `src/services/TemplateService.ts` | `appendSendHistoryLine()` に任意引数 `resumeCommand` を追加。区切り文字は `SEND_HISTORY_SEPARATOR`（`\|`） |
| `src/providers/EditorProvider.ts` | `ResumeSession` 型・`RESUME_CONFLICTING_OPTIONS` / `CLAUDE_EXECUTABLE_PATTERN`・`_prepareResumeSession()` を追加。Run / Plan / Spec の3経路から呼ぶ |
| `src/providers/TerminalProvider.ts` | アクティブタブの状態を返す `isClaudeCodeRunning()` を追加 |
| `package.json` | 設定 `aiCodingSidebar.editor.recordResumeCommand`（既定 `true`） |
| `src/test/suite/services/TemplateService.test.ts` | `resumeCommand` 付き / 無しの3ケースを追加 |

**`ITerminalProvider.isClaudeCodeRunning()` はオプショナルにしている**
- `ITerminalProvider`（`EditorProvider.ts` 内の前方宣言）は循環参照回避のための最小インターフェースで、テストが独自のモックを渡す
- 必須メンバーとして追加すると既存のモックが軒並みコンパイルエラーになるため、`isClaudeCodeRunning?(): boolean` として宣言し、呼び出し側も `this._terminalProvider?.isClaudeCodeRunning?.()` とする
- 未実装のプロバイダーでは「起動中ではない」とみなされ、セッションIDが付与される

**ローカルでのテスト実行について**
- v1.1.15に記載のとおり、macOSローカルの `npm test` はmochaの結果が親プロセスへ返らず、失敗しても成功扱いになる
- 本バージョンでは `vscode` をスタブ化したNode上でmocha（`--ui tdd`）を実行し、`TemplateService` のテストを確認している（21 passing）
- `_prepareResumeSession()` は同じスタブ上で `EditorProvider` を生成して直接呼び出し、UUID形式・オプション付き／パス付きプレフィックス・競合オプション6種・Claude Code起動中・設定オフ2種・`isClaudeCodeRunning` 未実装のプロバイダーの計15ケースを確認している

### v1.2.0新機能: テンプレート / プロンプトテンプレートのグローバル管理

ファイル雛形（template）とスニペット（prompt template）を、ワークスペース単位だけでなく全ワークスペース共通でも管理できるようにした：

**グローバル配置先**

```
<globalTemplatesPath>            ← 既定: context.globalStorageUri.fsPath
├── templates/                   ← ファイル雛形（prompt.md / task.md / spec.md / quick_start.md）
└── prompts/                     ← スニペット（*.md）
```

- 設定 `aiCodingSidebar.globalTemplatesPath`（既定 `""`）で差し替え可能。空なら拡張機能のグローバルストレージ
- **相対パスはワークスペースルートではなくホームディレクトリ基準**で解決し、`~` も展開する。グローバル配置先をワークスペースに依存させないため
- ワークスペース側（`.vscode/ai-coding-panel/{templates,prompts}`）と同じサブディレクトリ構成にしている。設定を1つ（ルート）にまとめた理由もこれ

**`globalStorageUri` のディレクトリはVS Codeが自動作成しない（最も踏みやすい落とし穴）**
- URIが返るだけでディレクトリは存在しない。書き込み経路では必ず `fsPromises.mkdir(dir, { recursive: true })` を行う
- `getGlobalRootDir()` は `context.globalStorageUri?.fsPath` を参照する。**既存テストのモックcontextは `{ extensionPath }` だけを持つ**ため、オプショナルチェーンで `undefined` を返してグローバル配置先を無効化している。ここを `!` にすると既存テストが軒並み落ちる

**`revealInExplorer` はグローバル配置先に使えない**
- ワークスペース外のパスは現在のウィンドウのエクスプローラーに表示できない
- グローバル系のコマンドは `openGlobalTemplatesRoot()` で **VS Codeの新しいウィンドウ**として開く
  ```ts
  vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), { forceNewWindow: true })
  ```
  - **`forceNewWindow` は必須**。省略すると現在のウィンドウがそのフォルダで開き直され、作業中のワークスペースが閉じてしまう
  - 開くのは `templates` / `prompts` ではなく**ルート**。両方を1つのウィンドウで扱えるようにするため
  - 新しいウィンドウへフォーカスが移るため、**通知（`showInformationMessage`）はフォルダを開く前に出す**
- ワークスペース側の既存コマンドは `revealInExplorer` のまま

**グローバル系のコマンドはファイルをエディタで開かない**

| コマンド | コピー後の挙動 |
|---|---|
| Customize Template（ワークスペース） | `openFirstTemplate()` で `TEMPLATE_FILE_NAMES[0]`（= `task.md`）を開く＋`revealInExplorer` |
| Customize Prompt Templates（ワークスペース） | 一覧の先頭テンプレートを開く＋`revealInExplorer` |
| **Customize Global Template** | ファイルは**開かない**。グローバル配置先のルートを新しいウィンドウで開く |
| **Customize Global Prompt Templates** | ファイルは**開かない**。グローバル配置先のルートを新しいウィンドウで開く |

- グローバル側はどのファイルを編集したいかが利用者によるため、特定のファイルを勝手に開かずディレクトリの表示のみにしている
- ワークスペース側の挙動は従来どおり（変更していない）
- `TEMPLATE_TYPES` の並び（`task` が先頭）は `setupTemplate()` の従来挙動を保つためであり、コピー自体は全4ファイルが対象なので順序に意味は無い。将来 `openFirstTemplate()` が開くファイルを変えたい場合は、配列順を入れ替えるのではなく開くファイル名を明示すること
- `setupGlobalPromptTemplates` から開く処理を外したことで `listTemplates()` の呼び出しも不要になった

**template（ファイル雛形）の解決順**

| 順 | 探索先 |
|---|---|
| 1 | `<workspace>/.vscode/ai-coding-panel/templates/<type>.md` |
| 2 | `<global>/templates/<type>.md` |
| 3 | `<extensionPath>/templates/<type>.md`（同梱） |

- `loadTemplate()` は候補パスの配列を先頭から探す形へ整理した。**変更前はワークスペース未オープン時に即同梱へ落ちていたが、変更後は未オープンでもグローバルを見る**

**prompt template（スニペット）は排他ではなくマージにした（設計判断）**

| 方式 | 挙動 | 採否 |
|---|---|---|
| 優先順位のみ | ワークスペースに1件でもあればワークスペースのみ | **不採用**。グローバルへ共通スニペットを置いても、ワークスペース側に1件でもあった時点で共通分が消えてしまい実用にならない |
| **マージ** | ワークスペース + グローバルを結合し、**同名はワークスペース優先**。両方空のときだけ同梱 | **採用** |

- `PromptTemplate.id`（拡張子を除いたファイル名）は `_insertPromptTemplateById()` の選択キーであり一意である必要がある。マージ時に同名があると衝突するため、**ワークスペース側を残してグローバル側を捨てる**
- 並び順はワークスペース分 → グローバル分。各グループ内はファイル名昇順
- 由来が分かるよう `PromptTemplate.origin`（`workspace` / `global` / `bundled`）を追加し、グローバル分は `description` を `refactor.md (global)` の形にしている
- 同梱分は従来どおりユーザー定義と混ぜない（どちらにも1件も無い場合のみ表示）

**`createWorkspaceTemplate()` の「空なら同梱をコピー」条件を変えている（見落とすとv1.1.20と同じ構図のバグ）**
- 旧: 「ワークスペース側が空なら同梱をコピー」
- 新: 「**ワークスペースにもグローバルにも1件も無い**なら同梱をコピー」（`hasNoUserTemplates()`）
- 同梱分が消える条件がマージ化で変わったため。旧条件のままだと、グローバルにスニペットがある状態でワークスペースに1件作った瞬間に同梱分が一覧から消える
- コピー先は「作成先のディレクトリ」。`createGlobalTemplate()` から呼ばれた場合はグローバルへコピーされる

**テンプレート一覧の二重管理を解消した**
- v1.1.20 の原因だった「`setupTemplate()` の `templateFiles` 配列」と「`templateUtils.ts` の `TemplateType`」の手動同期を廃止
- `TEMPLATE_TYPES`（as const配列）から `TemplateType` と `TEMPLATE_FILE_NAMES` の両方を導出し、コピー処理は `copyBundledTemplates()` に一本化した。テンプレート種別を追加してもコピー漏れが起きない

**実装内容**

| ファイル | 変更 |
|---|---|
| `src/utils/globalTemplatePaths.ts`（新規） | グローバルのルート / `templates` / `prompts` のパス解決と、ルートを新しいウィンドウで開く `openGlobalTemplatesRoot()`。`resolveConfiguredGlobalPath()` は設定値だけを受け取る純粋関数として公開し、設定を書き換えずにテストできるようにしている |
| `src/utils/templateUtils.ts` | `TEMPLATE_TYPES` / `TEMPLATE_FILE_NAMES` / `WORKSPACE_TEMPLATES_RELATIVE_PATH` を追加。`loadTemplate()` を候補パス走査へ変更 |
| `src/utils/workspaceSetup.ts` | `copyBundledTemplates()` / `openFirstTemplate()` を切り出し、`setupGlobalTemplate()` を追加 |
| `src/services/PromptTemplateService.ts` | `getGlobalTemplatesDir()` / `setupGlobalTemplates()` / `createGlobalTemplate()` を追加。`listTemplates()` をマージ化、`validateTemplateName()` に作成先を追加、`PromptTemplate` に `origin` を追加 |
| `src/providers/EditorProvider.ts` | `_pickPromptTemplateTarget()` を追加。`[+]` は作成先を選ばせてから名前を聞く |
| `src/commands/settings.ts` / `src/commands/templates.ts` | `setupGlobalTemplate` / `setupGlobalPromptTemplates` を登録 |
| `src/providers/MenuProvider.ts` | Global セクションに2項目を追加 |
| `package.json` | 設定 `globalTemplatesPath`、コマンド2件 |

**`[+]` は作成先を名前入力より先に聞く**
- `validateTemplateName()` の重複チェックは作成先ディレクトリに対して行うため。逆順にすると検証対象が決まらない
- 選択肢が1つしかない場合（ワークスペース未オープン等）はQuickPickを出さずにそれを使う
- 従来はワークスペース未オープン時にエラーだったが、グローバルへ作成できるようになった

**ローカルでのテスト実行について**
- v1.1.15に記載のとおり、macOSローカルの `npm test` はmochaの結果が親プロセスへ返らず、失敗しても成功扱いになる
- 本バージョンでは `vscode` をスタブ化したNode上でmocha（`--ui tdd`）を直接実行して確認している
- ワークスペースの有無で分岐するテスト（マージの優先順位など）は `this.skip()` で保護しているため、**スタブに `workspaceFolders` を持たせた状態でも実行**して確認した（ワークスペース無し: 66 passing / 2 pending、ワークスペース有り: PromptTemplateService 31 passing / 2 pending）
- 既存のワークスペーステンプレートを壊さないため、ワークスペース側のディレクトリが既に存在する場合はテストをスキップする

**今回のスコープ外**
- `TemplateService.loadTemplate()` / `getDefaultTemplate()` は探索先が `.vscode/templates/` のままで、`templateUtils.ts` の `.vscode/ai-coding-panel/templates/` と食い違っている。参照は自身のテストのみでデッドコードの疑いがあるため触っていないが、**今回グローバル対応を入れたことで `templateUtils` との差はさらに広がった**
- グローバルテンプレートのSettings Sync対応。`globalStorageUri` は同期対象外のため、同期したい場合は `globalTemplatesPath` にdotfiles配下の絶対パスを指定する運用で代替する

### v1.1.20バグ修正: Customize Templateで`quick_start.md`がコピーされない

Menu Viewの「Customize Template」（`utils/workspaceSetup.ts` の `setupTemplate()`）がワークスペースへコピーする対象に `quick_start.md` が含まれておらず、Quick Startのテンプレートだけワークスペース側でカスタマイズできなかった問題を修正：

**Quick Start自体は壊れていない（最も誤解しやすい箇所）**
- `loadTemplate()`（`utils/templateUtils.ts`）は「ワークスペースの `.vscode/ai-coding-panel/templates/<type>.md` を優先し、無ければ拡張機能同梱の `templates/<type>.md` にフォールバック」する2段構成
- そのためワークスペース側に `quick_start.md` が無くても Quick Start は同梱テンプレートで正常に動作していた
- 壊れていたのは**カスタマイズ経路のみ**。「Customize Template」を実行しても `quick_start.md` だけ作られないため、ユーザーが編集する起点が存在しなかった

**原因**
- v1.0.20で `templates/quick_start.md` と `TemplateType` の `'quick_start'` を追加した際、`setupTemplate()` の `templateFiles` 配列への追加が漏れていた
- v1.1.16の「今回のスコープ外（別タスク）」に既知事項として記載されていたものを本バージョンで解消

**実装内容**

| ファイル | 変更 |
|---|---|
| `src/utils/workspaceSetup.ts` | `setupTemplate()` の `templateFiles` に `'quick_start.md'` を追加（3→4ファイル） |
| `src/test/suite/utils/workspaceSetup.test.ts` | フィクスチャに `quick_start.md` を追加し、4ファイルすべてがコピーされることを検証 |
| `README.md` / `README-JA.md` | Template Featureの作成ファイル一覧に `quick_start.md` を追加 |

**既存ワークスペースへの反映**
- `setupTemplate()` は「存在しない場合のみ作成」する仕様のため、カスタマイズ済みの `task.md` / `spec.md` / `prompt.md` は上書きされない
- 既存ワークスペースで `quick_start.md` を得るには「Customize Template」を再実行する

**テンプレート一覧が2箇所に分かれている点に注意**
- `setupTemplate()` の `templateFiles`（コピー対象のファイル名配列）と `templateUtils.ts` の `TemplateType`（読み込み時の種別ユニオン型）は連動しておらず、手動同期に依存している
- 新しいテンプレート種別を追加する際は**両方**を更新する必要がある。本バージョンの不具合はこの同期漏れが原因

**ローカルでのテスト実行について**
- v1.1.15に記載のとおり、macOSローカルの `npm test` はmochaの結果が親プロセスへ返らず、失敗しても成功扱いになる
- 本バージョンでは `vscode` をスタブ化したNode上で `setupTemplate()` を直接実行し、4ファイルのコピー・内容の一致・既存ファイルを上書きしないことの3点を確認している

### v1.1.19新機能: Editor Viewのプロンプトテンプレート挿入

Editor Viewのカーソル位置へ定型プロンプト（スニペット）を挿入できるようにした：

**配置と一覧**

| 場所 | 用途 |
|---|---|
| `.vscode/ai-coding-panel/prompts/*.md` | ワークスペース側（優先・ユーザー編集用）。設定 `aiCodingSidebar.editor.promptTemplatesPath` で変更可能 |
| `resources/prompt-templates/*.md` | 拡張機能同梱（フォールバック） |

- 1ファイル1テンプレート。直下の `.md` のみが対象で、サブディレクトリは辿らない
- ワークスペース側に `.md` が1つでもあれば**ワークスペース側のみ**を一覧に出す。同梱分と混在させると同名ファイルの優先順位が分かりづらくなるため
- 一覧はQuickPickを開くたびに読み直す（キャッシュしない）

**表示名にH1を使うが、本文は加工しない（最も間違えやすい箇所）**
- 一覧の表示名は先頭の `# 見出し`、無ければ拡張子を除いたファイル名
- **表示名にH1を使った場合でも、挿入本文からH1行は除去しない**。`PromptTemplate.body` は読み込んだ内容をそのまま保持し、`renderTemplate()` は変数置換しか行わない
- 結果として本文の途中へ挿入すると見出し行も入る。H1を入れたくない場合はスニペット側でH1を書かない（表示名はファイル名になる）

**実装内容**

| ファイル | 変更 |
|---|---|
| `resources/prompt-templates/`（新規） | 同梱スニペット3件（`refactor.md` / `add_test.md` / `review.md`） |
| `src/services/PromptTemplateService.ts`（新規） | 一覧取得・ワークスペースへのコピー・変数置換 |
| `src/services/TemplateService.ts` | `renderVariables()` を追加公開 |
| `src/providers/EditorProvider.ts` | `insertPromptTemplate()` と `insertPromptTemplate` メッセージ、`setPromptTemplateService()` を追加 |
| `resources/webview/editor/{index.html,style.css,main.js}` | `#footer` を2グループ化し、左端に `#template-button`（アイコン＋`prompts`）とテンプレート選択メニューを追加 |
| `src/commands/templates.ts`（新規） | `aiCodingSidebar.insertPromptTemplate` / `aiCodingSidebar.setupPromptTemplates` |
| `src/providers/MenuProvider.ts` | Workspace に「Customize Prompt Templates」を追加 |
| `package.json` | 上記2コマンドと設定 `editor.promptTemplatesPath` |

**選択UIはEditor View内のメニュー（QuickPickではない）**

`prompts` ボタンの押下から挿入までの流れ:

| # | 送信元 | メッセージ | 内容 |
|---|---|---|---|
| 1 | Webview | `requestPromptTemplates` | ボタン押下。読み取り専用時とメニューを開いている時（トグルで閉じる）は送らない |
| 2 | 拡張 | `showPromptTemplates` | `listTemplates()` の結果を **id / label / description のみ**にして送る |
| 3 | Webview | `insertPromptTemplate`（`templateId`付き） | メニュー項目のクリック |
| 4 | 拡張 | `insertText` | IDで一覧を引き直し、変数置換した本文を送る |

メニューのヘッダー行（`.prompt-menu-header`）には見出しと **[+]ボタン**（`codicon-add`）を並べている。押下すると `createPromptTemplate` を送り、拡張側が `showInputBox()` で名前を受け取ってファイルを作成し、VS Codeの標準エディタで開く。

**[+]で作成するとき、ワークスペース側が空なら同梱テンプレートも同時にコピーする**
- 一覧は「ワークスペース側に1件でもあればワークスペース側のみ」という仕様のため、同梱テンプレートを見ている状態で1件作ると**それまで見えていたテンプレートが消える**
- これを避けるため、`createWorkspaceTemplate()` はワークスペース側が空の場合に `setupWorkspaceTemplates()` を先に実行する
- 作成するファイルの内容は `# <名前>` のみ。見出しは一覧の表示名としても使われる
- 名前の検証は `validateTemplateName()`（`showInputBox` の `validateInput` から呼ぶ）。空文字・パス区切り・`: * ? " < > |`・既存ファイルを弾き、拡張子は省略可（`toTemplateFileName()` が `.md` を付ける）

- **本文はメッセージに載せない**。Webviewには表示に必要な情報だけを渡し、挿入時に拡張側で読み直す。メニュー表示中にファイルが変化していた場合も最新の内容が入る（見つからない場合は警告）
- メニューはv1.1.13で追加した `#context-menu` 要素を再利用する。閉じる処理（メニュー外クリック・`Escape`・`window` のblur・エディタのスクロール）が既存のまま効く
- ボタンのクリックハンドラでは `event.stopPropagation()` を呼ぶ。`document` のclickハンドラ（メニュー外クリックで閉じる）に届くと、開いた直後に閉じてしまうため
- 位置は `placeMenuNearElement()` が `getBoundingClientRect()` で計算する。**サイズを測るには描画済みである必要がある**ため、`hidden` を外してから位置を決めている。フッターは最下部にあるため既定はボタンの上側で、収まらない場合のみ下側へ反転する
- サイドバーは幅が狭いため、`.context-menu.prompt-menu` で `max-width` / `max-height` と省略表示を指定している
- `aiCodingSidebar.insertPromptTemplate`（コマンドパレット）は基準となるボタンが無いため、従来どおり `showQuickPick()` を使う。`insertPromptTemplate()` と `_insertPromptTemplateById()` のどちらも `_insertPromptTemplateText()` に集約している

**挿入は既存の `insertText` メッセージを再利用している**
- `insertPaths()`（`EditorProvider.ts`）と同じ経路で送るだけ。Webview側の `case 'insertText'` がカーソル位置挿入・`contentChanged` 通知・`renderLinkOverlay()`（v1.1.13）まで実施済み
- Webview側に独自の挿入処理を書くと、dirty反映やリンクオーバーレイの再構築を取りこぼす

**読み取り専用時は挿入しない**
- VS Codeのタブで開いている間、Editor Viewのtextareaは読み取り専用。挿入しても保存されず内容が失われるため、Webview側（`isReadOnly`）と拡張側（`_isFileOpenInTab()`）の両方で弾いて警告を出す

**`#footer` を2グループ構成へ変更した**
- `#footer` は `justify-content: flex-end` の1グループ構成だった。`space-between` に変えたうえで**左グループの `<div class="footer-actions">` を必ず置く**こと。置かないとNextが左端へ移動する
- `.footer-actions .codicon` の既存ルールが両グループへそのまま効くため、アイコンサイズの追加指定は不要
- ボタンの配色は `.edit-button` と同じセカンダリ系。同じ行にあるNext（`#c9483f` の赤）と競合させないため
- ボタンはアイコン（`codicon-symbol-snippet`）＋ラベル `prompts` の構成

**ファイル新規作成用の雛形とは分離している**
- `templates/{prompt,task,spec,quick_start}.md` と `utils/templateUtils.ts` の `TemplateType` は「ファイル新規作成時の雛形」。ここにスニペット種別を足すと `createMarkdownFile` 等の分岐に混入するため、ディレクトリもサービスも分けている
- `utils/workspaceSetup.ts` の `setupTemplate()`（Customize Template）は雛形用のまま。プロンプトテンプレート用は `PromptTemplateService.setupWorkspaceTemplates()` で、既存ファイルは上書きしない

**変数置換**
- `{{datetime}}` / `{{timestamp}}` / `{{filename}}` / `{{filepath}}` / `{{dirpath}}` を `TemplateService` と同じ記法で置換する
- ファイル未オープン時はファイル関連の3つを空文字にする（例外にしない）。Editor Viewはファイル無しでも編集できるため
- 未定義の `{{...}}` はそのまま残す

**ローカルでのテスト実行について**
- v1.1.15に記載のとおり、macOSローカルの `npm test` はmochaの結果が親プロセスへ返らず、失敗しても成功扱いになる
- 本バージョンでは `PromptTemplateService` のテスト（16ケース）を、`vscode` モジュールをスタブ化したNode上のmochaで直接実行して確認している。VS Code APIに依存する `EditorProvider` / `extension` のテストはCIの結果で判断する
- Webviewのメニュー（ボタン押下→一覧要求→表示→選択→トグル／`Escape`／読み取り専用／ヘッダーの[+]）は、最小限のDOMスタブ上で `main.js` を実行して確認している
- ワークスペース側の作成処理（同梱分のコピー、既存名の拒否、拡張子の補完）は、`vscode` をスタブ化してワークスペースありの状態を模して確認している

### v1.1.18新機能: Terminal Viewの `claude --from-pr` ショートカット

Terminal Viewのショートカットバーに `claude --from-pr` ボタンを追加した。**押下時はコマンドを挿入するだけで実行しない**点が他のショートカットと異なる：

**変更後のClaude Code未起動時ショートカット**
```
[claude] [claude -c] [claude -r] [claude --from-pr] [↑]
```

**実装内容**

| ファイル | 変更 |
|---|---|
| `resources/webview/terminal/index.html` | `btn-claude-r` の直後に `btn-claude-from-pr` を追加 |
| `resources/webview/terminal/main.js` | `sendShortcut()` に `execute` 引数を追加し、挿入専用の `insertShortcut()` を追加 |
| `src/providers/TerminalProvider.ts` | `handleShortcut()` に `execute` 引数を追加。`sendShortcut` メッセージから受け渡す |
| `src/test/suite/providers/TerminalProvider.test.ts` | `execute: false` の3ケースを追加 |

**`execute: false` の分岐を最上位に置いている**
- `handleShortcut()` は従来「Claude Code起動中 / シェル」の2分岐だったが、`!execute` の判定を**その手前**に置いている
- 起動中の分岐に入ると「テキスト送信 → 100ms後に `\r`」（v1.0.12参照）が走ってコマンドが実行されてしまうため
- 挿入のみの場合は `startsClaudeCode` に関わらず `isClaudeCodeRunning` / `isProcessing` を更新しない。実行していない以上、起動状態を立てるのは誤りになる

**末尾の半角スペースはコマンド文字列側に持たせている**
- Webview側が `'claude --from-pr '` を送信する。`handleShortcut()` の `if (!command)` は空文字のみを弾くため、末尾スペース付きの文字列はそのまま通る
- PR番号をそのまま入力できるようにするための仕様であり、`trim()` を挟むと意図が壊れる

**後方互換性**
- `execute` はオプショナル（既定 `true`）。Webview側も `data.execute === undefined` を `true` として扱うため、既存の全ショートカットの挙動は変わらない

### v1.1.17変更: Editor Viewのファイル名ブロック削除

Editor View最上段の `#header`（開いているファイルのパス表示）を削除し、v1.1.1で導入した3段構成を2段構成に戻した：

**変更後のレイアウト**

| 段 | 要素 | 内容 |
|---|---|---|
| 1段目 | `#sub-header` | 左: Edit / Save、右: Spec / Plan / Run |
| 最下段 | `#footer` | Next |

**実装内容**

| ファイル | 変更 |
|---|---|
| `resources/webview/editor/index.html` | `#header` の `<div>` ブロックを削除 |
| `resources/webview/editor/style.css` | `#header` / `.file-info` / `#file-path` / `#file-path.placeholder` の4ルールを削除 |
| `resources/webview/editor/main.js` | `filePathElement` / `FILE_PATH_PLACEHOLDER` / `setFilePath()` の定義と全呼び出しを削除 |
| `README.md` / `README-JA.md` | レイアウトの説明を2段構成へ修正 |

**`#header` をブロックごと削除している理由**
- `#header` の中身は `.file-info` > `#file-path` だけで、他に要素を持たない。中身のみを消すと `min-height: var(--button-bar-height)`（36px）の空バーが残るため、外側の `<div>` ごと削除している
- `body` の `--button-bar-height` は `#sub-header` / `#footer` が参照し続けるため残している
- Editor Viewは flexbox のみで構成されており、`#editor-container` の `flex: 1` が自動的に空いた高さを吸収する。Terminal Viewのようなヘッダー高さのハードコード計算（v1.1.0参照）は無いため、高さ調整は不要

**`currentFilePath` は削除していない（最も間違えやすい箇所）**
- 表示用の `setFilePath()` と、状態として保持する `currentFilePath` は別物
- `currentFilePath` は Save / Run / Plan / Spec / `focusTabInVSCode` など計13行で参照されており、これを巻き込んで削除すると保存とコマンド送信が壊れる
- `showContent` / `clearContent` の各ハンドラでは `currentFilePath` への代入行を残し、直後の `setFilePath()` 呼び出しのみを削除している

**トレードオフ**
- Editor View上でどのファイルを編集中かが判別できなくなる。Plans Viewの選択状態やTerminal Viewのタブから判断する
- ファイル未オープン時の案内文（`No file open - select a file in Plans View`）も同時に消える

**`src/` 配下は変更していない**
- `EditorProvider` が送る `showContent` メッセージの `filePath` は、表示用ではなく `currentFilePath` の保持に必要なため、そのまま送信を続けている
- `EditorProvider.test.ts` は `getCurrentFilePath()` を検証しており、Webviewの見た目には依存しないため影響なし

### v1.1.16変更: テンプレートのメタデータセクション見直しと`datetime`書式の統一

組み込みテンプレートが共通で持つ末尾メタデータブロックに見出しを追加し、`memory` 項目をリネームした。あわせて生成経路ごとに異なっていた `datetime` の書式を統一した：

**メタデータブロックの新形式**

```markdown
---

# metadata
dir     : {{dirpath}}
prompt  : {{filename}}
datetime: {{datetime}}
```

| 変更 | 内容 |
|---|---|
| 見出しの追加 | `---` の下・項目一覧の上に `# metadata` を追加。ブロックが何であるかを明示する |
| `memory` → `dir` | 値は `{{dirpath}}`（ワークスペースルートからのディレクトリ相対パス）であり、`memory` というラベルからは意図も実態も読み取れなかった。`dir` + `prompt` でフルパスを構成する関係が読み取れる |
| パディングの調整 | 最長ラベル `datetime`（8文字）に合わせ `dir     :` とする |

- 対象は `templates/prompt.md` / `task.md` / `spec.md` / `quick_start.md` の4ファイル。**4ファイルは完全に同一のブロックを持つ**（共通化の仕組みは無く手動同期に依存しているため、変更時は必ず4ファイルまとめて更新する）
- 見出しは H1（`#`）とした。`task.md` の `# task` と同階層になるが、`---`（水平線）で本文と区切られているため実害は無いと判断している
- `quick_start.md` の `# update dir name` は「本ファイルに記録されたディレクトリ名も更新せよ」とAIエージェントに指示しており、メタデータの項目名を間接参照している唯一の箇所。`dir` の値を明示的に指すよう文言を修正した

**`datetime` の書式統一**

生成経路によって `{{datetime}}` の書式が異なっていた（同一ディレクトリ内のファイル間で表記が揺れる状態だった）。

| 生成対象 | 変更前 | 出力例 |
|---|---|---|
| PROMPT / TASK / SPEC | `now.toLocaleString()` | `2026/9/6 21:50:31`（ゼロ埋めなし・ロケール依存） |
| QUICK_START | `templateService.formatDateTime()` | `2026/09/06 21:46:07` |

`toLocaleString()` はロケール依存のため、環境によっては `9/6/2026, 9:50:31 PM` のような全く異なる書式にもなり得た。全経路を `formatDateTime()` に統一し、常に `YYYY/MM/DD HH:MM:SS` 形式にした。

| ファイル | 変更 |
|---|---|
| `src/services/TemplateService.ts` | `formatDateTime(date?: Date)` としてオプション引数を追加。省略時は従来どおり現在時刻を使う |
| `src/commands/files.ts` | 4箇所（PROMPT / TASK / SPEC / SPEC別コマンド）の `now.toLocaleString()` を `templateService.formatDateTime(now)` に置換。`deps` の分割代入に `templateService` を追加 |
| `src/commands/plans.ts` | 1箇所（TASK）を `deps.templateService.formatDateTime(now)` に置換 |

**`formatDateTime()` に `now` を渡している理由**
- 各コマンドはファイル名用のタイムスタンプを `now` から組み立てている。`formatDateTime()` が内部で別の `new Date()` を呼ぶと、秒をまたいだ際にファイル名と `datetime` が1秒ずれる
- 既存の `now` をそのまま渡すことでこのずれを解消している
- `plans.ts` で `deps.templateService` と書いているのは、同ファイル内の他コマンドがローカルに `new TemplateService(context)` を生成しており、分割代入で受けるとシャドウイングして紛らわしくなるため

**移行に関する注意**
- `.claude/plans/` 配下の既存ファイルは変換していない（当時の作業記録として当時の形式のまま残す方針）
- `.vscode/ai-coding-panel/templates/` のワークスペーステンプレートは `setupTemplate()` が「存在しない場合のみ作成」する仕様のため上書きされない。カスタマイズ済みのユーザーは従来形式のまま

**今回のスコープ外（別タスク）**
- `TemplateService.getDefaultTemplate()` が旧形式（`working dir:` を先頭ヘッダとして出力）のまま残っている。`loadTemplate()` の探索先も `.vscode/templates/` で `templateUtils.ts` の `.vscode/ai-coding-panel/templates/` と食い違う。いずれも本体からの呼び出しが無くデッドコードの疑いがある
- ~~`setupTemplate()` のコピー対象に `quick_start.md` が含まれていない~~（v1.1.20で対応済み）

### v1.1.15新機能: Editor Viewの送信履歴記録

Editor Viewで Spec / Plan / Run を実行した際、開いているMarkdownファイルへ送信日時を追記するようにした：

**記録の形式**

ファイル末尾の `## sent history` セクションへ1行ずつ追加する。

```markdown
（本文）

---

memory  : .claude/plans/2026_0906_2116_17
prompt  : 2026_0906_2116_17_QUICK_START.md
datetime: 2026/09/06 21:16:17

## sent history
- run : 2026/09/06 21:27:29
- plan: 2026/09/06 21:31:02
```

- 日時は `TemplateService.formatDateTime()`（`YYYY/MM/DD HH:MM:SS`）を再利用し、テンプレートが出力する `datetime` 行と揃えている
- ラベルは `run ` / `plan` / `spec` と幅を揃え、日時の開始位置を合わせている
- テンプレートのメタデータセクション（`---` 以降）は書き換えず、その後ろに独立したセクションを追加する

**実装内容**

| ファイル | 変更 |
|---|---|
| `src/services/TemplateService.ts` | `SendCommandType` / `SENT_HISTORY_HEADING` と、追記位置を決める純粋関数 `appendSendHistoryLine()` を追加 |
| `src/providers/EditorProvider.ts` | `_appendSendHistory()` / `_applySendHistory()` を追加し、plan / spec / `_runTask()` の送信直前に呼ぶ |
| `resources/webview/editor/main.js` | `updateContent` メッセージを追加 |
| `package.json` | 設定 `aiCodingSidebar.editor.recordSendTimestamp`（既定 `true`）を追加 |
| `src/test/suite/services/TemplateService.test.ts` | `appendSendHistoryLine()` のテストを追加 |

**Webviewへの再送が必須（最も壊れやすい箇所）**
- 拡張側でファイルへ追記しても、Editor Viewの `editor.value` は古いままとなる。この状態で保存すると**追記した履歴行が消える**
- そのため追記後は `updateContent` を送り、`editor.value` と `originalContent` の両方を差し替える。`originalContent` を更新しないとdirty判定が狂う
- `showContent` を再利用しなかったのは、カーソル位置とスクロール位置がリセットされるため。`updateContent` は `selectionStart` / `selectionEnd` / `scrollTop` を保存して復元する
- v1.1.13のリンクオーバーレイと本文がずれるため、`renderLinkOverlay()` の呼び出しを忘れないこと

**書き込み方法をファイルの状態で分ける**

| 状態 | 書き込み方法 |
|---|---|
| VS Codeのタブで開いていない | `fsPromises.readFile` で読み直してから `fsPromises.writeFile` |
| VS Codeのタブで開いている | `document.getText()` を入力に `WorkspaceEdit` で全置換し、`applyEdit()` |

- ディスクへ直接書き込むと、標準エディタ側の未保存の変更と競合する。`document.getText()` を入力にすることで、未保存の変更を保持したまま追記できる
- `document.save()` は**編集前に未保存の変更が無かった場合のみ**実行する。ユーザーが編集中の内容を勝手に確定させないため（`applyEdit()` 後は必ずdirtyになるので、`isDirty` は編集前に控えておく）
- 保存すると `onDidSaveTextDocument` リスナーが発火するため、`_applySendHistory()` で `_currentContent` を更新してから `save()` を呼ぶ。順序を逆にするとリスナー側が差分ありと判断して `showContent` を送り、カーソル位置がリセットされる

**追記のタイミング**
- 「保存の完了後・`sendCommand()` の前」に固定している
- 保存より前に追記すると、直後の保存がWebviewの古い内容でファイルを上書きし、履歴が消える
- 送信より前にするのは、AIエージェントが読むファイルに履歴が含まれている方が自然なため
- 追記に失敗してもコマンド送信は継続する（`try/catch` で `console.error` に記録するのみ）。履歴は補助情報であり、送信を止める理由にならない

**セクションの検出と挿入位置（`appendSendHistoryLine()`）**
- 見出しは**行全体の完全一致**（`line.trim() === '## sent history'`）で判定する。本文中の類似表記へ誤って追記しないため
- 見出しが見つかった場合は、次の見出し（`#{1,6}` + 空白）または水平線（`---`）の手前までをセクションとみなし、末尾の空行を飛ばして最後の内容行の直後へ挿入する
- 見出しが無い場合は、末尾の空白を除去してから `\n\n## sent history\n` + 1行を追加する
- ファイルシステムに触れない純粋関数のため、privateメソッドを避けつつテストできる

**記録対象外**
- ファイル未オープンでのRun（`runCommandWithoutFile`）は追記先が無いためスキップする。警告も出さない
- 設定 `aiCodingSidebar.editor.recordSendTimestamp` が `false` の場合

**ローカルでのテスト実行について**
- VS Code 1.136 のmacOS向けバンドルは実行ファイル名が `Electron` から `Code` に変わっており、`@vscode/test-electron@2.5.2` からは起動できない
- `src/test/runTest.ts` はCLIパスへフォールバックするが、macOSの `code` は起動を委譲して即座に終了するため、**mochaの結果が親プロセスへ返らず、テストが失敗していても `npm test` が成功扱いになる**
- 本バージョンの実装では、`appendSendHistoryLine()` をNode上で直接呼び出して検証している（8ケース）。CI（`test.yml`）は別環境のため影響の有無は未確認


### v1.1.14新機能: Terminal ViewのRunショートカット

Terminal Viewにフォーカスがある状態で `Cmd+R` / `Ctrl+R` を押すと、Editor ViewのRunコマンドが実行されるようにした：

**実装内容**

| ファイル | 変更 |
|---|---|
| `resources/webview/terminal/main.js` | `isRunShortcut()` を追加。`document` の `keydown` で `runEditorTask` を postMessage し、`term.attachCustomKeyEventHandler()` で該当キーのPTY送信のみ抑止 |
| `src/providers/TerminalProvider.ts` | `runEditorTask` メッセージを追加し `editorProvider.runTask()` を呼び出す。`IEditorProvider` に `runTask()` を追加 |
| `src/providers/EditorProvider.ts` | `runTask` メッセージ処理を `_runTask()` に切り出し、外部から呼べる `public runTask()` を追加 |
| `src/test/suite/providers/TerminalProvider.test.ts` | モックの `IEditorProvider` に `runTask` を追加 |

**Runの実装を1箇所に集約している**
- Editor Viewの `runTask` メッセージハンドラをそのまま `_runTask(content, editorContent)` に切り出し、Webviewからの呼び出しと外部からの呼び出しで同じ処理を通す
- `public runTask()` は `_pendingContent` / `_isDirty` / `_isFileOpenInTab()` から、Webview側 `runTask()` が組み立てるのと同じ引数を再現する
  - 未保存の変更がある場合のみ保存対象として渡す。VS Codeのタブで開いている（読み取り専用）間は保存しない
  - ファイル未オープン時は `editorContent` として最新の内容を渡し、空ならEditor Viewと同じ警告が出る

**`document` で受けて xterm では送信のみ抑止する理由**
- ターミナル本体だけでなくタブバーにフォーカスがある場合も動作させたいため、キー処理は `document` の `keydown` に置いている
- `attachCustomKeyEventHandler` が `false` を返すとxterm.jsは処理・PTYへの送信を行わないが、`stopPropagation()` はしないためイベントは `document` まで到達する。したがって二重実行にはならない

**キー割り当ての制約**
- Editor View（`resources/webview/editor/main.js`）に合わせ、macOSは `metaKey`、Windows/Linuxは `ctrlKey` を対象にしている（`navigator.platform` で判定）
- macOSでは `Ctrl+R`（シェルのreverse-i-search、Claude CodeのCtrl+R）はそのまま使える
- Windows/Linuxでは `Ctrl+R` を横取りするため、シェルのreverse-i-searchが使えなくなる。macOSの `Cmd+R` のみに限定する場合は `isRunShortcut()` の判定を変更する

### v1.1.13新機能: Editor ViewのURLリンク化と右クリックメニュー

Editor View（textarea）に書かれたURLをクリックで標準ブラウザで開けるようにし、右クリックで標準ブラウザ／統合ブラウザ（Simple Browser）を選べるメニューを追加した：

**textareaはリンクを描画できないため、ミラー要素を重ねる**

| 層 | 役割 |
|---|---|
| `#editor`（textarea） | 従来どおり文字の描画・編集・キャレット操作を担当 |
| `#link-overlay`（div） | textareaと同じ折り返しでテキストを複製し、URL部分だけを`.overlay-link`要素にする。文字色は`transparent`で下線だけ見せる |

- overlayは`pointer-events: none`のままにし、**クリック位置の判定は`getClientRects()`との突き合わせで行う**（`findUrlAtPoint()`）。overlayにマウス操作を受けさせるとURL上でキャレットを置けなくなり、編集の妨げになるため
- 折り返されたURLは矩形が複数になるため、`getClientRects()`を全て走査する
- 文字を二重に描画しないよう、overlay側は`color: transparent`＋`text-decoration-color`だけを指定する。`text-decoration-color`を明示しているため、文字色が透明でも下線は描画される

**折り返し位置を一致させるための条件**

| 項目 | 対応 |
|---|---|
| 幅 | `editor.clientWidth`（スクロールバーを除いた幅）をJSで設定する。`width: 100%`ではスクロールバー出現時に折り返し位置がずれる |
| パディング・フォント | `padding: 10px` / `box-sizing: border-box` / `--vscode-editor-font-family` / `--vscode-editor-font-size` / `line-height: normal` をtextareaと揃える |
| 折り返し規則 | Chromeのtextareaの既定に合わせて `white-space: pre-wrap` / `overflow-wrap: break-word` を指定 |
| スクロール | `overflow: hidden` のまま `overlay.scrollTop = editor.scrollTop` で追従させる（`overflow: hidden`でもプログラムからはスクロールできる） |
| 末尾の改行 | `pre-wrap`では末尾の改行が潰れて行数がずれるため、複製時に改行を1つ補う |

再構築のタイミングは `showContent` / `clearContent` / `insertText` / `input`。`input`は`requestAnimationFrame`で1フレーム1回に間引く。幅の変化には`ResizeObserver`で追従する。

**実装内容**

| ファイル | 変更 |
|---|---|
| `resources/webview/editor/index.html` | `#link-overlay`（`#editor-container`内）と`#context-menu`を追加 |
| `resources/webview/editor/style.css` | `#link-overlay` / `.overlay-link` と、Terminal Viewと同じ`.context-menu`系のスタイルを追加 |
| `resources/webview/editor/main.js` | オーバーレイの生成・同期・当たり判定、URLのクリック／右クリック処理を追加 |
| `src/providers/EditorProvider.ts` | `openUrl` / `openUrlInIntegratedBrowser` メッセージを追加（`utils/browserUtils.ts`を利用） |

**クリック時の挙動**
- URL上の左クリックで標準ブラウザを開く。**ドラッグでの範囲選択中（`selectionStart !== selectionEnd`）は開かない**。選択の終端がURLに重なった場合に誤って開くのを防ぐため
- 読み取り専用時の既存処理（`focusTabInVSCode`）はURL判定の後に実行する。URLをクリックした場合はVS Codeのタブにフォーカスを移さない
- `mousemove`でURL上かを判定して`cursor: pointer`に切り替える。overlayが`pointer-events: none`のためCSSの`:hover`では実現できない

**右クリックメニュー**
- Terminal View（v1.1.11）・Plans View（v1.0.22）と同じ構成。`document`に`contextmenu`を登録し、**URL上のときだけ**`preventDefault()`する（VS Code側は`window`で監視しているため、`document`側で先に止める必要がある）
- 閉じるタイミング: メニュー外のクリック、`Escape`、`window`の`blur`、textareaのスクロール

**CSPについて**
- Editor ViewのCSPは`style-src {{cspSource}}`のまま（`'unsafe-inline'`は追加していない）。`element.style.left = ...` のようなCSSOM経由の指定はCSPの対象外で、Plans Viewでも同じ方法でメニュー位置を指定している

### v1.1.11新機能: Terminal ViewのURL右クリックメニュー

Terminal View内のURLを右クリックすると、標準ブラウザ／統合ブラウザ（Simple Browser）のどちらで開くかを選べるメニューを表示するようにした：

**実装内容**

| ファイル | 変更 |
|---|---|
| `resources/webview/terminal/index.html` | `#context-menu` 要素を追加 |
| `resources/webview/terminal/style.css` | `.context-menu` / `.context-menu-header` / `.context-menu-item` / `.context-menu-separator` を追加 |
| `resources/webview/terminal/main.js` | URLリンクに `hover` / `leave` を追加して `hoveredUrl` を保持し、`contextmenu` で自前メニューを表示 |
| `src/providers/TerminalProvider.ts` | `openUrlInIntegratedBrowser` メッセージを追加 |
| `src/utils/browserUtils.ts`（新規） | `normalizeUrl()` / `openInIntegratedBrowser()` / `DEFAULT_BROWSER_URL` を切り出し |
| `src/commands/browser.ts` | 上記ユーティリティを利用するように変更 |

**右クリック位置のURLを特定する方法**
- xterm.jsには「座標からリンクを引く」公開APIが無く、ピクセル座標からセル座標への変換も内部APIに依存する
- 代わりに `ILink` の `hover` / `leave` コールバックでホバー中のURLを `hoveredUrl` に保持し、右クリック時にその値を使う。右クリックではマウスが動かないためホバー状態はそのまま残る
- `leave` では `hoveredUrl === url` を確認してからクリアする。別リンクへ移った直後に前のリンクの `leave` が届いても、新しい値を消さないため

**VS Code標準のコンテキストメニューとの関係**
- Webviewホスト側は `contextmenu` を `window` で監視し、`e.defaultPrevented` でなければ標準メニューを表示する
- そのため `document` にリスナーを登録し（バブリングは `document` → `window`）、**URL上のときだけ** `preventDefault()` する。URL以外の場所では従来どおりVS Code標準のメニューが出る
- この構成はPlans View（v1.0.22）のコンテキストメニューと同じ

**メニューを閉じるタイミング**
- メニュー外のクリック、`Escape`、`wheel`（ユーザー操作によるスクロール）、`window` の `blur`、タブ切り替え（`activateTab()`）
- ターミナルの `onScroll` では閉じない。出力による自動スクロールで即座に閉じてしまうため

**統合ブラウザ処理の共通化**
- `commands/browser.ts` に閉じていた `normalizeUrl()` とSimple Browser起動処理を `utils/browserUtils.ts` へ移し、Menu Viewのコマンドと Terminal View の両方から使う
- `simpleBrowser.show` にURLを渡さないとSimple Browser側が入力を求めるため、必ず正規化済みURLを渡す点は従来どおり

### v1.1.10変更: commandPrefixデフォルト値の変更（`--permission-mode auto` の削除）

`aiCodingSidebar.editor.commandPrefix` のデフォルト値から `--permission-mode auto` を削除：

**変更内容**
- デフォルト値: `claude --permission-mode auto` → `claude`
- v1.0.17で `--enable-auto-mode` を、v1.0.19で `--permission-mode auto` を既定に含めていたが、権限モードは既定に含めずユーザーの設定に委ねる方針に戻した
- 従来の挙動が必要な場合は、設定で `claude --permission-mode auto` を指定する

**変更箇所**

| ファイル | 箇所 |
|---|---|
| `package.json` | `aiCodingSidebar.editor.commandPrefix` 設定スキーマの `default` |
| `src/services/ConfigurationProvider.ts` | `getCommandPrefix()` のフォールバック値 |
| `src/providers/EditorProvider.ts` | Run / RunWithoutFile / Plan / Spec のフォールバック値（4箇所） |
| `README.md` / `README-JA.md` | 設定例のJSONと設定表 |

**READMEの設定表に `editor.commandPrefix` を追加**
- 設定表には `editor.runCommand` 以降のテンプレート系設定しか記載がなく、テンプレート内の `${commandPrefix}` が何に展開されるかを表から辿れなかったため、`editor.runCommand` の直前に行を追加した

**変更していない箇所**
- Terminal Viewのショートカットバー: v1.1.4で `claude --permission-mode auto` ボタンを削除済みのため該当なし
- `editor.planCommand` / `editor.specCommand` の既定値に含まれる `--permission-mode plan`: `${commandPrefix}` とは別に各テンプレートが持つオプションであり、今回の変更対象外

### v1.1.9バグ修正: Plans Viewの外部ドラッグ&ドロップ（Webview化以降の制約と対応）

v1.0.22でPlans ViewをWebview化して以降、ビューの外からファイルをドラッグしても配置できなくなっていた問題への対応：

**原因: VS Codeがドラッグ中にWebviewのポインタイベントを無効化する**

| 層 | 挙動 |
|---|---|
| workbench | window の `dragstart` / `drag` / `dragover` を監視し、`shiftKey` が押されていなければ webview の iframe に `pointerEvents: none` を設定する（`_startBlockingIframeDragEvents()`）。`shiftKey` 押下・`dragend`・ボタンを離したマウス移動で解除される |
| webview内部（`pre/index.html`） | `dragenter` で、`e.defaultPrevented` でなくアイテムが全て `kind === 'file'` の場合にホストへ `drag-start` を通知し、同じブロックを発動させる |

- つまり**外部からのドラッグはShiftキーを押しながらでないとWebviewに届かない**。これはVS Code側の仕様で、拡張から無効化する手段はない
- TreeView時代（`TreeDragAndDropController`）はVS Code本体のDnD機構で処理されていたため、この制約を受けなかった
- README.md / README-JA.md のドラッグ&ドロップの説明にShiftキーの注記を追加している
- Shiftキーが必要なことは操作前には分からないため、ビュー右下に常設のヒント（`#footer` の `.footer-hint`）を表示している
  - Editor Viewの `#footer` と同じ構成（`min-height: var(--button-bar-height)`・`border-top`・右寄せ）に揃えている
  - ドラッグ中に強調表示する案は採れない。Shiftキーを押していない間はWebviewにドラッグイベント自体が届かないため
  - ネイティブの `title` を使っている（`.row` と違い、`title` を持つ祖先が無いため期待どおり表示される）

**実装した対応**

| ファイル | 変更 |
|---|---|
| `resources/webview/plans/main.js` | `setupViewDropTarget()` を追加し、`document` で `dragenter` / `dragover` / `dragleave` / `dragend` / `drop` を処理。ドロップ先の行が無い場合は `targetPath` を送らない。URI読み取りを `readInternalSources()` / `readUriList()` / `hasFileUri()` に分離 |
| `resources/webview/plans/style.css` | `body.drag-over #list` のハイライトを追加 |
| `src/providers/PlansProvider.ts` | `_handleDrop()` の `targetPath` をオプショナル化し、未指定なら `getCurrentPath()` を使う |

**ドロップ受け入れ範囲を旧実装に戻した**
- Webview化以前の `handleDrop()` は、`target` が `undefined`（ビューの空白領域）なら `activeFolderPath || rootPath`、ファイル行なら親ディレクトリへコピーしていた
- Webview版はディレクトリ・パス表示・親（`..`）の行しかドロップ先にしていなかったため、空白領域とファイル行へのドロップが無反応だった
- 行にドロップした場合はその行を、それ以外は拡張側で現在表示中のディレクトリを対象にする

**外部アプリからのドロップは絶対パスが取れないため内容を転送する**

| ドラッグ元 | Webviewで取得できるもの | 処理 |
|---|---|---|
| ビュー内の行 | `application/vnd.aicodingsidebar.paths`（自前のMIME） | パスをそのままコピー |
| fileスキームのURIを含むドロップ | `text/uri-list` 等 | URIのパスからコピー |
| Finder・VS Codeのエクスプローラー | `dataTransfer.files`（Fileオブジェクトのみ） | 内容を読み取って書き出す |

- ElectronはFile.pathを廃止しており（代替の `webUtils.getPathForFile()` はWebviewから呼べない）、Webviewは絶対パスを一切取得できない。当初は警告（`dropUnsupported`）を出す実装にしたが、Finderからドロップすると必ずこの警告になったため、内容を転送する方式へ変更した
- `readDroppedEntries()` は drop イベント中に**同期的に** `DataTransfer` を読む。ハンドラを抜けると `DataTransfer` は読めなくなる（取り出し済みのFileオブジェクトはその後も読める）
- 内容は `encodeBase64()` でbase64化してから `postMessage` する。VS CodeのWebviewメッセージはJSONシリアライズされるためUint8Arrayをそのまま渡せない。`String.fromCharCode.apply` は引数が多すぎるとスタックが溢れるので0x8000バイトずつ分割している
- ディレクトリは `item.webkitGetAsEntry().isDirectory` で判定して除外し、警告を表示する（File APIから中身を辿れない。TreeView時代の `copyExternalFiles` も `fs.copyFile` のみでディレクトリ非対応だった）
- 転送するファイルサイズの上限は `MAX_DROP_FILE_SIZE`（50MB）。超えるものはスキップして警告する
- 拡張側は受け取った名前を `path.basename()` で正規化してから結合する（Webview由来の文字列をそのまま `path.join()` に渡さない）
- `hasFileUri()` でURI一覧にfileスキームが含まれるかを先に判定する。リンクのドロップなどコピー元にできないURIしか無い場合に、無反応にせず内容の読み取りへ回すため

**ドロップ処理の共通化（`PlansProvider`）**

| メソッド | 責務 |
|---|---|
| `_resolveDropTargetDir()` | ドロップ先ディレクトリの決定（未指定なら `getCurrentPath()`、ファイルならその親） |
| `confirmOverwrite()` | 同名ファイルの上書き確認 |
| `showCopyResult()` | コピー結果の表示とビュー更新 |

パス指定の `copyFiles()` と内容指定の `_handleDroppedFileContents()` の双方から利用する。

**設計上の注意点**
- **`dragenter` での `preventDefault()`**: webview内部の `handleInnerDragStartEvent` が `e.defaultPrevented` で早期returnするため、Shiftキーを離した瞬間に再ブロックされるのを防げる
- **`document` に登録している理由**: バブリングは `document` → `window` の順で、VS Code側のハンドラは `window` に登録されている。`document` 側で先に `preventDefault()` を呼ぶ必要がある
- **行の `dragover` での `stopPropagation()`**: 行のハイライトとビュー全体のハイライトが二重に出ないようにしている
- **URI一覧のMIMEタイプ**: ドラッグ元によって異なるため `text/uri-list` → `application/vnd.code.uri-list` → `resourceurls`（VS CodeがURIのJSON配列を入れる `DataTransfers.RESOURCES`）の順に確認する
- **`text/uri-list` のパース**: 改行は `\r\n` の場合があり、`#` で始まる行はコメントのため除外する
- **`dropUnsupported`**: `dataTransfer.files` しか取れないドロップはWebviewから絶対パスを取得できないため、警告メッセージを表示してエクスプローラーからのドラッグを案内する

### v1.1.8新機能: Plans Viewインラインアクションのツールチップ

Plans Viewの行に表示されるインラインアクションアイコン（Archive等）にマウスオーバーすると、アクション名が表示されるようにした：

**なぜ`title`属性だけでは足りなかったか**

| 要素 | `title` | 挙動 |
|---|---|---|
| `.row`（行本体） | `item.tooltip || item.filePath` | ファイルパスのネイティブツールチップが出る |
| `.row-action`（アイコン） | `entry.title`（例: `Archive`） | 行側のツールチップが優先され、アクション名が出ない |

- `createRowActions()` は元からボタンに `title` を設定していたが、Webview内ではネイティブツールチップが期待どおりに切り替わらず、アイコン上でも親の `.row` のファイルパスが表示されていた
- そのため自前のツールチップを描画し、ボタン側の `title` は**空文字**にして親から継承されるネイティブツールチップを抑止している（`title` を削除するのではなく空にするのがポイント。属性が無いと親の `title` が使われる）
- `aria-label` は従来どおりアクション名を保持しているため、スクリーンリーダー向けの情報は変わらない

**実装内容**

| ファイル | 変更 |
|---|---|
| `resources/webview/plans/index.html` | `#tooltip` 要素を追加 |
| `resources/webview/plans/style.css` | `.tooltip` / `.tooltip.hidden` を追加。色は `--vscode-editorHoverWidget-*` 系を使用 |
| `resources/webview/plans/main.js` | `attachTooltip()` / `showTooltip()` / `hideTooltip()` を追加し、`.row-action` 生成時に登録 |

**表示・非表示の制御**

| 項目 | 内容 |
|---|---|
| 表示遅延 | `TOOLTIP_DELAY = 300`（ms）。`mouseenter` でタイマーを張り、`mouseleave` / `mousedown` でクリア |
| 位置 | アイコンの下に中央揃え（`TOOLTIP_GAP = 4`px）。下端に収まらない場合は上側へ反転し、左右も画面内へクランプする |
| 閉じるタイミング | マウスアウト・クリック（`mousedown` とコマンド実行時）・一覧のスクロール・`window` の `blur`・`render()` での再描画・`showContextMenu()` |

- 位置計算は `position: fixed` + `getBoundingClientRect()` で行うため、テキスト設定後に一度 `hidden` を外してから測る必要がある
- `showTooltip()` の冒頭で `element.isConnected` を確認している。遅延中に `render()` が走って行が差し替わった場合、既にDOMから外れた要素の座標を使ってしまうため
- `.tooltip` には `pointer-events: none` を指定。指定しないとツールチップ自身がマウスを受け取り、`mouseleave` が即座に発火してちらつく

**適用範囲**
- `INLINE_ACTIONS` に定義された全アイコンが対象（Archive のほか New PROMPT.md / New TASK.md / New SPEC.md / Rename... / Copy Relative Path / New Directory / Show in File List / Insert Path to Editor / Insert Path to Terminal）
- ヘッダーの Quick Start ボタンは従来どおりネイティブの `title` のままにしている（親に `title` を持つ要素が無く、実際にツールチップが表示されるため）

### v1.1.7削除: Menu Viewからの「Quick actions」削除

Menu View（`workspaceSettings`）から「Quick actions」セクションを削除し、Usage Guide / Global / Workspace の3項目構成に変更：

| ファイル | 変更 |
|---|---|
| `src/providers/MenuProvider.ts` | `_buildRootItems()` から Quick actions の親項目と5つの子項目を削除 |
| `README.md` / `README-JA.md` | Menuビューの機能表からQuick actionsの行を削除し、説明文を「設定やドキュメントへのクイックアクセス」に変更 |

**コマンド登録は残している**
- `aiCodingSidebar.openTerminal` / `checkoutDefaultBranch` / `gitPull`（`commands/terminal.ts`）と `aiCodingSidebar.openIntegratedBrowser`（`commands/browser.ts`）の `registerCommand` と `contributes.commands` はそのまま
- v1.1.0でタイトルバーのボタンを削除した際と同じ方針で、コマンドパレットやキーバインドからは引き続き実行できる
- `workbench.action.duplicateWorkspaceInNewWindow` はVS Code組み込みコマンドのため元から本拡張の管理外

**テストへの影響なし**
- `src/test/suite/providers/MenuProvider.test.ts` はルート項目の件数を固定せず「子を持つ項目が存在すること」を確認する構成のため、項目削除後もそのまま通る

### v1.1.6バグ修正: Terminal Viewで折り返されたURLのリンク化

Terminal View内で2行に折り返されたURLをクリックすると、クリックした行の断片だけがブラウザで開かれる問題を修正：

**問題の切り分け**

| 表示元 | xtermの`isWrapped` | 行末位置 | 従来の挙動 |
|---|---|---|---|
| ターミナル自身の自動折り返し | `true` | 右端ぴったり | 問題なし |
| Claude Code（TUI）の出力 | `false`（自前で改行を出力） | 右端に余白が残る | **URLが途中で途切れる** |

- Claude CodeはInkベースのTUIで自前の折り返しを行い、改行を出力するため、xterm.jsは折り返し行として記録しない
- さらに折り返し行の先頭にインデント（2スペース）や罫線 `│` が入るため、単に行を結合しても空白でURLが途切れる
- `@xterm/addon-web-links` はバッファの1行単位でしか動作せず、この構造では対応できない

**実装内容**

| ファイル | 変更 |
|---|---|
| `resources/webview/terminal/main.js` | WebLinksAddonを廃止し、折り返しを結合する自前のURLリンクプロバイダーを実装 |
| `resources/webview/terminal/index.html` | `{{xtermWebLinksUri}}` のscriptタグを削除 |
| `src/providers/TerminalProvider.ts` | `xtermWebLinksUri` の生成と置換を削除 |
| `package.json` | 依存 `@xterm/addon-web-links` と `copy-xterm` のコピー対象から削除 |

**リンクプロバイダーの主要な関数（`main.js`）**

| 関数 | 責務 |
|---|---|
| `readBufferLine()` | バッファ1行を読み取り、文字列・各文字のセル座標・`isWrapped`・行末位置（`contentEndX`）を返す。行末の空白と罫線は除去するが、`contentEndX` は罫線を含む位置で算出する |
| `getContinuationOffset()` | 次の行を前の行の続きとみなせるかを判定し、読み飛ばす先頭文字数（インデント・罫線の長さ）を返す。続きでなければ `-1` |
| `readWrappedBlock()` | 対象行から上下に辿って折り返しブロックを結合し、文字列と各文字のセル座標を返す |

**結合の判定条件**
- `isWrapped` が立っている行はそのまま続きとみなす（従来どおり）
- 立っていない場合は、**前の行が右端付近（`term.cols - WRAP_EDGE_TOLERANCE`、許容幅4）まで達している**ことに加え、**改行位置の前後の文字がいずれもURLに現れうる文字**であることを要求する
  - 許容幅を設けているのは、TUIが右側に余白を残して折り返すため厳密な右端一致では判定できないため
  - 前後の文字を見ているのは誤結合の抑止のため。`See https://example.com` のようにURLで終わる短い行が次の文と繋がることを防ぐ

**セル座標を保持する理由**
- リンクの範囲（下線・クリック領域）はバッファ座標で指定する必要があるため、結合後の文字列の各文字に対応するセル座標（`x`/`y`/`width`）を並行して保持している
- インデントや罫線を読み飛ばす際はセル配列側も同じ位置から詰めるため、範囲がずれない
- 全角文字の後続セル（幅0）はスキップし、サロゲートペアは文字列の添字とセル配列の添字が一致するように展開している

**URL検出パターン**
- WebLinksAddonの既定パターンを踏襲しつつ、罫線・ブロック要素の文字（U+2500-U+259F）を除外している。除外しないとTUIの枠線がURLの一部として取り込まれる

**登録順序**
- URLプロバイダーはファイルパス用プロバイダーより**先に**登録する。xterm.jsは登録順にリンクを問い合わせ、最初にヒットしたプロバイダーを採用するため、URL内のパス部分がファイルリンクとして解釈されるのを防げる

**検証**
- xtermのバッファを模したハーネスで、Claude Code形式（自前改行＋インデント）・自動折り返し・罫線ボックス内・3行に跨る折り返し・誤結合しないケースを確認している
- ファイルパス用のリンクプロバイダーは1行単位のままで、折り返しには対応していない

### v1.1.5新機能: Menu Viewへの統合ブラウザ追加と表示遅延の解消

**Quick actionsへの「Open Integrated Browser」追加**

| ファイル | 変更 |
|---|---|
| `src/commands/browser.ts`（新規） | `aiCodingSidebar.openIntegratedBrowser` を登録。設定値のURLを `simpleBrowser.show` に渡してVS Code組み込みのSimple Browserを開く |
| `src/commands/index.ts` | `registerBrowserCommands()` を登録処理に追加 |
| `src/providers/MenuProvider.ts` | Quick actionsに `globe` アイコンの項目を追加（Git Pull と Duplicate Workspace の間） |
| `package.json` | `contributes.commands` にコマンド定義、設定 `aiCodingSidebar.browser.defaultUrl`（既定値 `about:blank`）を追加 |

- **URLは必ず渡す**: `simpleBrowser.show` に引数を渡さないとSimple Browser側が自前の入力ボックスを表示する。入力なしで空タブを開くには `about:blank` を明示的に渡す必要がある。開いた後はSimple Browserのアドレスバーからページを移動できる
- **`normalizeUrl()` のスキーム判定**: `^[a-zA-Z][a-zA-Z0-9+.-]*:` で判定している。`scheme://` を要求すると `about:blank` が `http://about:blank` に変換されてしまうため、`//` を持たないスキームも対象にしている
- **専用モジュールを新設した理由**: 既存のQuick Actionsコマンド（`openTerminal` / `gitPull` 等）は `commands/terminal.ts` にあるが、ブラウザはターミナル関連ではないため `commands/browser.ts` を分けている
- READMEはMenuビューの構成を「Quick shortcuts」から「Quick actions」に改め、設定表に `browser.defaultUrl` を追加した

**Quick actionsを既定で展開**
- `MenuProvider` のQuick actions項目に渡す `collapsibleState` を `Collapsed` → `Expanded` に変更（他の3項目は `Collapsed` のまま）
- VS CodeはTreeViewの展開状態をワークスペースごとに記憶するため、手動で折りたたんだ環境ではその状態が優先される

**Menu Viewの表示遅延を解消（`src/providers/MenuProvider.ts`）**

| 変更 | 内容 |
|---|---|
| 300ms遅延の削除 | `_isInitialLoad` フィールドとローダー用の `setTimeout` を削除 |
| `getChildren()` の同期化 | `async` / `Promise<MenuItem[]>` をやめて `MenuItem[]` を同期で返す |
| ルート項目のキャッシュ化 | 構築処理を `_buildRootItems()` に切り出し、`_rootItems` にキャッシュ |

- Menu View（`workspaceSettings`）は `package.json` で `"visibility": "collapsed"` が指定されており、**ユーザーが最初に開いたタイミングで初めて `getChildren()` が呼ばれる**。そのためローダー用の300msがそのまま体感のタイムラグになっていた
- メニュー項目は静的なオブジェクト生成のみで、待つべき非同期処理は元々存在しない。`TreeDataProvider.getChildren()` は `ProviderResult<T[]>` を受け付けるため、同期の配列を返しても問題ない
- `refresh()` ではキャッシュを破棄してから `onDidChangeTreeData` を発火するため、将来メニュー内容を動的にした場合も再構築される
- 既存の `MenuProvider.test.ts` は `await menuProvider.getChildren()` の形で呼んでいるため、同期化後もそのまま通る

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
- `aiCodingSidebar.editor.runPlanCommand`: Planボタン実行コマンド（旧 `aiCodingSidebar.editor.planCommand`）
- `aiCodingSidebar.editor.runSpecCommand`: Specボタン実行コマンド（旧 `aiCodingSidebar.editor.specCommand`）
- `aiCodingSidebar.editor.recordResumeCommand`: Spec / Plan / Run の実行時にセッションIDを指定し、resumeコマンドを送信履歴へ記録するか（デフォルト: `true`）
- `aiCodingSidebar.editor.disableWorkspaceEditorTemplates`: ワークスペースのファイル雛形を読み込まないか（デフォルト: `false`）
- `aiCodingSidebar.editor.disableGlobalEditorTemplates`: グローバルのファイル雛形を読み込まないか（デフォルト: `false`）
- `aiCodingSidebar.editor.disableWorkspacePromptTemplates`: ワークスペースのプロンプトテンプレートを一覧に出さないか（デフォルト: `false`）
- `aiCodingSidebar.editor.disableGlobalPromptTemplates`: グローバルのプロンプトテンプレートを一覧に出さないか（デフォルト: `false`）
- `aiCodingSidebar.browser.defaultUrl`: 統合ブラウザで開くURL（デフォルト: `about:blank`）
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
