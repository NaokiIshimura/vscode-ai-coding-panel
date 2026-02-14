# Change Log

このプロジェクトのすべての重要な変更は、このファイルに記録されます。

フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.0.0/) に基づいており、
このプロジェクトは [セマンティックバージョニング](https://semver.org/lang/ja/) に準拠しています。

## [1.0.13] - 2026-02-14

### 修正
- **Plans View自動更新（完全修正）**: Plans Viewが非表示の状態でディレクトリにファイルが追加されても表示されない問題を完全に解決
  - 根本原因: ビュー非表示時にFileWatcherのリスナーが無効化されていたため、イベントが失われていた
  - 修正: リスナーをビューの可視性に関わらず常に有効化
  - ビュー非表示中でもファイル変更イベントを受け取り、キャッシュをクリア
  - ビュー復帰時に最新の状態が自動的に反映される
  - 注記: v1.0.10の部分修正（ビュー非表示時にリスナーを無効化していた）を完全に修正

## [1.0.12] - 2026-02-09

### 修正
- **Terminalコマンド実行**: Claude Code起動中にEditor ViewからRun/Plan/Specコマンドを送信すると実行されない問題を修正
  - 原因: コマンドテキストと改行文字（\r）が1回のPTY書き込みで送信されていたため、改行がコマンドの末尾に表示されてしまい実行されない
  - 修正: コマンドテキスト送信とEnter送信を分離し、100msの遅延を設定
  - Bracketed Paste Modeの使用を廃止してコマンド実行を適切に処理するように改善
  - TerminalProvider.tsの`sendCommand()`と`handleShortcut()`メソッドに適用

## [1.0.11] - 2026-02-09

### 変更
- **コマンドプレフィックスのデフォルト値**: `aiCodingSidebar.editor.commandPrefix`のデフォルト値から`--model opus`を削除
  - デフォルト値を`claude --model opus`から`claude`に変更
  - モデル選択をClaude CLIのデフォルトモデル設定に委ね、ユーザーが任意のモデルを柔軟に選択可能に

## [1.0.10] - 2026-02-09

### 修正
- **Plans View自動更新**: Plans Viewで開いているディレクトリにファイルが追加されても手動リフレッシュまで表示されない問題を修正
  - FileWatcher通知時のキャッシュクリアを部分的（パスベース）から全クリアに変更し、パス正規化の差異やデバウンスによるイベント統合でキャッシュクリアが漏れる問題を解消
  - Plans Viewが再表示された際に`refresh()`を呼び出すように変更し、ビュー非表示中に発生したファイル変更が即座に反映されるように改善

## [1.0.9] - 2026-02-07

### 改善
- **プロセス監視の最適化**: プロセスチェックを統合した`getProcessTree()`メソッドを新設し、1回の`ps`コマンドでClaude Code検知とフォアグラウンドプロセス名取得を実行
  - 外部プロセス生成を最大20回/1.5秒（5タブ時）から1回/1.5秒に削減（95%削減）
  - タブごとのsetIntervalを全タブ共通の単一タイマーに統合
  - パネル非表示時にプロセスチェックを完全停止
  - 適応的なチェック間隔: Claude Code起動中は1.5秒、未起動時は3秒

- **ファイル監視の最適化**: FileWatcherServiceの監視パターンを`**/*`（ワークスペース全体）から`.claude/plans/**/*`（設定値に基づく）に限定
  - `defaultRelativePath`設定の変更時にウォッチャーを動的に再作成
  - `node_modules`、`.git`、ビルド出力等からの不要なイベントを排除

- **正規表現処理の最適化**: エスケープシーケンス除去を共通メソッド`_stripEscapeSequences()`に抽出
  - ターミナル出力あたりの重複処理を2回から1回に削減
  - 正規表現パターンをstatic readonlyクラスプロパティとして事前コンパイル

- **ファイルI/Oの非同期化**: 複数ファイルにわたる全同期ファイルI/Oを非同期に変換
  - PlansProvider: 5箇所の同期呼び出しを非同期化（statSync、existsSync）
  - commands/plans.ts: 9箇所の同期呼び出しを非同期化（statSync、mkdirSync、existsSync）
  - commands/files.ts: 同期呼び出しを非同期化
  - utils/workspaceSetup.ts: 全同期I/Oを非同期化
  - utils/templateUtils.ts: loadTemplateを非同期化
  - PlansProvider.getFilesInDirectory: 逐次statをPromise.allによる並列実行に変更

### 修正
- **リソースクリーンアップ**: 複数のリソースリーク問題を修正
  - `_closeTab()`で`_outputMonitor`と`_lastProcessNames`のエントリを適切にクリーンアップ
  - `_cleanup()`で`_outputMonitor`と`_lastProcessNames`マップを確実にクリア
  - WebViewのResizeObserverをタブ閉鎖時に適切にdisconnect
  - extension.ts、TerminalProvider.ts、EditorProvider.tsの5箇所のDisposable管理漏れを修正

## [1.0.8] - 2026-02-05

### 変更
- **xterm.js v5 → v6 アップデート**: 全てのxterm.jsパッケージを非推奨の`xterm`スコープから新しい`@xterm`スコープに移行
  - `xterm@5.3.0` → `@xterm/xterm@6.0.0`
  - `xterm-addon-fit@0.8.0` → `@xterm/addon-fit@0.11.0`
  - `xterm-addon-web-links@0.9.0` → `@xterm/addon-web-links@0.12.0`
  - `xterm-addon-unicode11`（手動配置）→ `@xterm/addon-unicode11@0.9.0`（package.jsonで管理）

### 改善
- **ビルドシステム**: `copy-xterm`スクリプトを全アドオン（fit, web-links, unicode11）を含むように更新
  - 以前はweb-linksとunicode11がコピースクリプトに含まれていなかった
  - `npm run copy-xterm`で全5ファイルが自動コピーされるように改善

## [1.0.7] - 2026-01-31

### 追加
- **Terminalショートカット: claude update**: Claude Code未起動時のTerminal Viewショートカットバーに`claude update`ボタンを追加
  - トグルボタンの直前（一番右側）に配置
  - ターミナルショートカットから直接Claude CLIのアップデートコマンドを実行
  - インタラクティブなClaude Codeセッションは起動しない（`startsClaudeCode: false`）

## [1.0.6] - 2026-01-31

### 変更
- **Plans Viewファイル表示**: ルートディレクトリのファイルから日付/時間プレフィックス（`[HH:MM]`/`[MM/DD]`）を削除
  - ディレクトリの日付/時間プレフィックス表示は維持
  - ファイルはルート・サブディレクトリ共にファイル名のみ表示

### 修正
- **Editor対象ファイルアイコン**: Editor Viewで開くファイル（TASK.md、PROMPT.md、SPEC.md）がルート・サブディレクトリ両方で`edit`アイコンを表示するように修正
  - 以前は特定のタイムスタンプパターンのPROMPT.mdのみが対象で、パターンにバグあり（ドット区切りでアンダースコア区切りと不一致）
  - パターンを`/^\d{4}\.\d{4}\.\d{2}_PROMPT\.md$/`から`/(?:TASK|PROMPT|SPEC)\.md$/i`に更新
  - `findOldestTargetFile`の対象ファイル判定と統一（大文字小文字を区別しない）

## [1.0.5] - 2026-01-29

### 追加
- **Plans View日付/時間表示**: ルートディレクトリのファイル/ディレクトリに日付/時間プレフィックスを追加
  - 当日のアイテムは時間を表示: `[HH:MM] ファイル名`（例: `[09:54] 2026_0129_0954_07_TASK.md`）
  - 当日以外のアイテムは日付を表示: `[MM/DD] ファイル名`（例: `[01/28] 2026_0128_1430_25_TASK.md`）
  - 固定幅プレフィックス（7文字）により整列された表示を実現
  - ルートディレクトリのみに適用、サブディレクトリ内のアイテムは変更なし

### 改善
- **TerminalProviderのテスタビリティ向上**: 依存性注入パターンによりテスタビリティを改善
  - コンストラクタでオプショナルな`ITerminalService`を受け取り、テスト時にモック注入が可能
  - `handleShortcut()`をpublicメソッドとして切り出し、直接テスト可能に
  - TerminalProviderの包括的なテストスイートを追加

### 技術的変更
- `formatCreatedDate()`（YYYY-MM-DD description方式）を`formatDateTimePrefix()`（labelプレフィックス方式）に置換
- TreeItemLabelのhighlightsはediting中のファイルのみに適用、その他は文字列ラベルを使用
- VS Code test-electronのテストランナーCLIパス解決を改善

## [1.0.4] - 2026-01-28

### 修正
- **Terminalショートカットコマンド実行**: Claude Codeショートカットボタン（例: `/clear`、`/model`、`/compact`）をクリックしてもコマンドが実行されない問題を修正
  - ブラケットペーストモード（`\x1b[200~...\x1b[201~`）を実装し、Enter送信前に20msの遅延を追加
  - Claude Codeセッション中、1回のクリックでコマンドが即座に実行されるようになりました
  - 以前の問題（複数回クリックが必要、またはコマンドが表示されるだけで実行されない）を解決

### 改善
- **Editorコマンド実行**: Editor ViewのRun/Plan/Specボタンにも同じブラケットペーストモードの改善を適用
  - Terminalショートカットとエディターボタンで一貫したコマンド実行動作を実現
  - Editor Viewから送信されたコマンドも、Claude Codeセッション中に確実に実行されるようになりました

### 技術的変更
- Claude Codeセッション中にブラケットペーストモードを使用するように`TerminalProvider.sendCommand()`メソッドを更新
- Terminal Viewのショートカットボタンハンドラも同じメカニズムを使用するように更新
- 両方の実装で、確実なコマンド処理のためにペーストシーケンスとEnterキーの間に20msの遅延を使用

## [1.0.3] - 2026-01-27

### 変更
- **テストコード改善**: 一貫性のため、テストファイル内の日本語コメントをすべて英語に翻訳

## [1.0.2] - 2026-01-27

### 追加
- **コマンドプレフィックス設定**: エディターコマンドで使用するコマンドプレフィックスをカスタマイズする`aiCodingSidebar.editor.commandPrefix`設定を追加
  - デフォルト値: `claude --model opus`
  - コマンドテンプレート（runCommand、planCommand、specCommand）で`${commandPrefix}`プレースホルダーを使用
  - 各コマンドを個別に編集せずに、モデル切り替えやカスタムオプションの追加が可能

### 変更
- デフォルトのコマンドテンプレートを`${commandPrefix}`プレースホルダーを使用するように更新
- デフォルトモデルを`claude`から`claude --model opus`に変更

## [1.0.1] - 2026-01-27

### 追加
- **モデル切り替えショートカット**: Terminal Viewに`/model sonnet`と`/model opus`ショートカットボタンを追加
  - Claude Code実行中のショートカットバーにボタンを表示
  - `/compact`の左側に配置し、素早いモデル変更を可能に
  - Claude Codeセッション中にSonnetとOpusモデルを素早く切り替え可能

## [1.0.0] - 2026-01-26

### 概要
🎉 **最初の安定版リリース** - AI Coding Sidebarは、包括的な機能、堅牢なアーキテクチャ、完全なテストカバレッジを備え、プロダクションレディな状態に到達しました。

この拡張機能は、Claude Codeでの生産性を最大化するために設計された強力なVS Codeパネルを提供し、Plans（ファイル管理）、Editor（コマンドセンター）、Terminal（Claude Code最適化）、Menu（クイック設定）を統合ワークフローにまとめます。

### ハイライト
- **包括的なテストフレームワーク**: Mocha + @vscode/test-electronによる131個のテストに合格
- **マルチプラットフォームCI/CD**: Ubuntu、macOS、WindowsでNode.js 18.x、20.xの自動テスト
- **堅牢なアーキテクチャ**: commands、providers、services、utilitiesによる明確な関心の分離
- **Claude Code統合**: 自動検知、コンテキスト対応ショートカット、シームレスなターミナル統合
- **ユーザーエクスペリエンス**: 初期プロンプトテンプレート、自動ファイル選択、ドラッグ&ドロップ、永続的セッション
- **パフォーマンス**: 非同期ファイル操作、最適化されたプロセス検知、デバウンスイベント
- **セキュリティ**: CSP準拠のWebView、コマンドインジェクション保護、安全な環境変数

### プロダクションレディ
このリリースは、ベータ版（0.x）から安定版（1.0.x）への移行を示します。すべてのコア機能が実装され、テストされ、プロダクション使用の準備が整っています。

## [0.9.14] - 2026-01-26

### 追加
- **初期プロンプト付きディレクトリ作成**: Plans Viewの「Create directory」ボタンで初期プロンプトファイルを自動作成
  - タイムスタンプ付きPROMPT.mdファイルを自動生成（形式: `YYYY_MMDD_HHMM_SS_PROMPT.md`）
  - Run/Plan/Specボタンの使い方を説明するテンプレートを含む
  - ファイルは自動的にEditor Viewで開かれ、Plans Viewで選択される
  - テンプレートファイル: `resources/templates/initial_prompt.md`
  - 新規ユーザーへ即座にガイダンスを提供

### 変更
- **パッケージ説明文**: package.jsonの説明文をClaude Codeへのフォーカスをより明確にするよう更新
  - 新: "A powerful VS Code panel extension designed to maximize your productivity with Claude Code."
  - 旧: 汎用的なAIコーディングツール連携の説明

### 技術的変更
- **コマンド拡張**: `src/commands/plans.ts`の`createDefaultPath`コマンドを拡張
  - TemplateServiceを統合してタイムスタンプ生成（日本時間）
  - デフォルトテキストへのフォールバック付きテンプレート読み込み
  - fsPromisesを使用した非同期ファイル操作
  - テンプレートファイル未検出時のエラーハンドリング
- **ファイル選択**: PlansProviderの`revealFile`メソッドを統合
  - 作成されたファイルが自動的にPlans Viewで選択される
  - 他のファイル作成ワークフローとの一貫性を維持

## [0.9.13] - 2026-01-25

### 追加
- **包括的なテストフレームワーク**: Mocha + @vscode/test-electronによる完全なテストスイートを実装
  - Utils（fileUtils、templateUtils、workspaceSetup）のユニットテスト
  - Services（TemplateService、FileOperationService）のユニットテスト
  - Providers（MenuProvider、PlansProvider、EditorProvider、TerminalProvider）のユニットテスト
  - Commands（settings、documentation、files）のユニットテスト
  - 拡張機能のアクティベーションとコマンド登録の統合テスト
  - 完全なユーザーワークフローをカバーするエンドツーエンドテスト
  - 合計: 131個のテストが成功
- **コードカバレッジ**: テストカバレッジレポート用のnyc（Istanbul）を統合
  - `.nycrc`設定ファイルを追加
  - `npm run test:coverage`コマンドを追加
  - カバレッジレポートを`coverage/`ディレクトリに生成
- **CI/CD統合**: 自動テスト実行用のGitHub Actionsワークフロー
  - マルチプラットフォームテスト（Ubuntu、macOS、Windows）
  - マルチバージョンテスト（Node.js 18.x、20.x）
  - プルリクエストとmainブランチプッシュ時の自動テスト実行
  - テスト結果のアーティファクトアップロード（7日間保持）

### 技術的変更
- **テストインフラ**: 堅牢なテストフレームワークのセットアップを作成
  - テストランナー: `src/test/runTest.ts`
  - テストスイートインデックス: `src/test/suite/index.ts`
  - テスト用のVSCodeデバッグ設定
  - 分離されたテストデータ用のテストフィクスチャ
- **デバッグコードのクリーンアップ**: デバッグ用console.log文を削除
  - TerminalProvider、TerminalServiceから不要なログを削除
  - extension.tsとcommands/plans.tsのエラーログをconsole.errorに変換
  - GitignoreParserからデバッグログを削除

### 改善
- **ドキュメント**: 包括的なテスト情報でCLAUDE.mdを更新
  - ツールの説明を含むテストフレームワークセクションを追加
  - テスト実行方法（VSCodeデバッガーとCLI）を追加
  - テスト統計とカバレッジ情報を追加
  - CI/CDワークフローのドキュメントを追加

## [0.9.12] - 2026-01-25

### 追加
- **動的ターミナルタブ名**: Terminal Viewのタブ名が実行中のプロセスに応じて動的に変わる機能（iTerm2風）
  - タブ名がフォアグラウンドプロセスを反映して自動的に変化（例: `vim`、`claude`、`git`）
  - 複数階層のプロセス階層をサポート（最大3階層）
  - Claude Codeプロセスでは親子プロセスを表示: `claude(caffeinate)`、`claude(git)`
  - 親子プロセスが同じ名前の場合は重複を回避
  - 既存のプロセスチェック機構を利用して1.5秒間隔で更新

### 改善
- **TerminalServiceプロセス検知**: フォアグラウンドプロセス名取得機能を拡張
  - 現在実行中のプロセスを取得する`getForegroundProcess()`メソッドを追加
  - `ProcessInfo`インターフェースに`name`と`isForeground`フィールドを追加
  - 複数階層のプロセス階層を走査（PTY → シェル → プロセス → サブプロセス）
  - プラットフォーム別実装（macOS/Linux: `ps`、Windows: `wmic`）
  - コマンドパスと引数からプロセス名をスマートに抽出
- **TerminalProviderタブ管理**: プロセスベースのタブ名更新機能を統合
  - タブごとのプロセス名変更を追跡する`_lastProcessNames` Mapを追加
  - プロセス変更を検知してタブ名を更新する`_checkProcessAndUpdateTab()`を追加
  - WebViewにタブ名更新を送信する`_updateTabNameWithProcess()`を追加
  - プロセス名を表示用にフォーマットする`_getDisplayName()`ヘルパーを追加
  - 親プロセス名を表示すべきか判定する`_shouldShowParentProcess()`を追加
- **Terminal WebView**: 動的プロセス名でタブタイトル表示を強化
  - タブ名更新用の`updateTabName`メッセージハンドラを追加
  - 既存のコマンド種別アイコン（▶️、📝、📑）とローダー状態を保持
  - 既存のタブUI構造とシームレスに統合

### 技術的変更
- **プロセス階層検知**: 3階層のプロセス階層を走査
  - 第1階層: PTYの直接の子プロセス（シェル: bash、zsh）
  - 第2階層: シェルの子プロセス（例: claude、vim、git）
  - 第3階層: プロセスの子プロセス（例: claudeの下のcaffeinate）
- **表示ロジック**:
  - 第3階層が存在: `第2階層(第3階層)`形式で表示（例: `claude(caffeinate)`）
  - 第3階層なし + 親がclaude/anthropic: `第1階層(第2階層)`形式で表示（例: `claude(git)`）
  - 第3階層なし + 親が通常シェル: `第2階層`のみ表示（例: `vim`）
  - 同じ名前: 重複を回避（例: `git(git)` → `git`）
- **フォーマット**: スペースなしのコンパクト形式: `親(子)` （`親 (子)`ではない）

## [0.9.11] - 2026-01-25

### 修正
- **Terminal Viewのスクロール位置**: パネル切り替え時にスクロール位置が最上位にリセットされる問題を修正
  - WebViewの可視性変更時にスクロール位置の保存・復元メカニズムを実装
  - 非表示前に`saveScrollPositions`メッセージでスクロール状態をキャプチャ
  - 表示後に`restoreScrollPositions`メッセージでスクロール状態を復元
  - タブアクティブ化時の`fitAddon.fit()`呼び出し後もスクロール位置を維持
  - 保存されたスクロール位置を優先して使用することでリセット問題を防止

### 技術的変更
- **TerminalProvider**: パネル非表示前にスクロール状態を保存する`_onWebviewBecameHidden()`メソッドを追加
- **TerminalProvider**: `_onWebviewBecameVisible()`メソッドに遅延スクロール復元（50ms）を追加
- **Terminal WebView**: タブごとのスクロール状態を保存する`savedScrollPositions` Mapを導入
- **Terminal WebView**: `activateTab()`を修正し、`fitAddon.fit()`後にスクロール位置を復元

## [0.9.10] - 2026-01-25

### 追加
- **プロセスベースのClaude Code検知**: プロンプトパターンマッチングに依存しない信頼性の高いClaude Codeセッション検知を実装
  - TerminalServiceに`getChildProcesses()`メソッドを追加し、PTYの子プロセスを取得
  - `isClaudeCodeRunning()`メソッドを追加し、プロセス名でClaude Codeを検知
  - ターミナルタブごとに1.5秒間隔で自動的にプロセスをチェック
  - プラットフォーム別の実装（macOS/Linux: `ps`、Windows: `wmic`）

### 変更
- **ターミナル状態検知の強化**: プロセスベースアプローチでClaude Code状態検知を改善
  - プロセスベース検知と既存のパターンマッチングを併用し、信頼性を向上
  - プロセスベース検知は出力パターンマッチングとは独立して動作
  - Claude Codeのプロンプト変更に対して強い耐性
  - 類似のコマンドプロンプトによる誤検知を削減

### 改善
- **ITerminalServiceインターフェース**: 新しいプロセス検知メソッドで拡張
  - プロセス情報用の`ProcessInfo`型定義を追加
  - 子プロセスリストを取得する`getChildProcesses(sessionId)`を追加
  - Claude Codeセッション状態を確認する`isClaudeCodeRunning(sessionId)`を追加
- **TerminalProviderアーキテクチャ**: プロセスベース検知のライフサイクルを統合
  - タブ作成とセッション再接続時にプロセスチェックを開始
  - タブ削除とクリーンアップ時にプロセスチェックを停止
  - メモリリークを防ぐため`dispose()`メソッドで適切にクリーンアップ

### 技術詳細
- PTYの子プロセスのコマンド名に"claude"または"anthropic"が含まれているかチェックして検知
- パフォーマンスへの影響は最小限: チェック1回あたり約1ms、1.5秒間隔
- エラーに強い: プロセスが見つからない場合は空配列を返す（エラーではない）
- クロスプラットフォーム対応: macOS/Linux検証済み、Windows実装済みだが未テスト

## [0.9.8] - 2026-01-25

### 修正
- **Terminal Viewローダー表示**: ターミナルのフォーカス変更時に誤ってローダーが表示される問題を修正
  - エスケープシーケンス除去を改善し、CSI・OSCシーケンスに対応
  - プログレスバーや制御文字のノイズフィルタリングを追加
  - ローダーは実際のClaude Code処理中のみ表示されるように改善

### 削除
- **プロセス監視機能**: ps-treeベースのプロセス監視アプローチを削除
  - より信頼性の高いパターンベース検知に戻した
  - 状態検知ロジックを簡素化

## [0.9.7] - 2026-01-24

### 追加
- **Terminal WebViewの外部化**: Terminal viewのHTML/CSS/JavaScriptを外部ファイルに分離
  - `resources/webview/terminal/`ディレクトリにindex.html、style.css、main.jsを作成
  - コードの保守性と関心の分離を改善
  - Editor viewの外部リソース構造（v0.9.1）と統一

### 変更
- **CSP（Content Security Policy）の改善**: セキュリティを向上させつつ、機能性を維持
  - インラインスクリプトを削除し、厳格なCSP要件に準拠
  - ターミナル設定をdata属性（`data-terminal-config`）経由で渡すように変更
  - xterm.jsのインラインスタイル使用のため`style-src 'unsafe-inline'`を追加
  - Unicode11 Addonサポートのため`allowProposedApi: true`を有効化

### 修正
- **ターミナルフォント設定の不具合**: フォント設定が適用されない問題を修正
  - ターミナル設定（fontFamily、fontSize等）がCSPによってブロックされていた問題を解消
  - インラインスクリプト（`<script>window.terminalConfig = {...}</script>`）からdata属性アプローチに変更
  - 設定がHTML経由で安全に渡され、main.jsでパースされるように改善
  - Unicode11 Addonにより、CJK文字（日本語、中国語、韓国語）が正しく表示されるように修正

### 改善
- **ファイル操作の非同期化**: すべてのファイル操作をasync/awaitに移行
  - PlansProvider: `setRootPath`、`getFilesInDirectory`、`findOldestTargetFile`を非同期化
  - EditorProvider: `_getHtmlForWebview`で`fs.promises.readFile`を使用
  - TemplateService: `loadTemplate`を`fs.promises.access`と`readFile`で非同期化
  - UIブロッキングを解消し、レスポンシブ性を向上
- **依存性注入の改善**: EditorProviderでTemplateServiceのDIをサポート
  - コンストラクタにオプショナル`templateService`パラメータを追加
  - テスタビリティとコードの柔軟性が向上
- **型安全性の向上**: TerminalServiceで型定義を強化
  - `any`型を`IPty`インターフェース定義に置き換え
  - 型安全性とIDE サポートが向上
- **コード品質の改善**: Low優先度のコード品質問題に対応
  - デバッグ用のconsole.log文を削除（extension.ts、TerminalProvider.ts）
  - プロバイダープロパティの用途を明確化するコメントを追加（EditorProvider.ts）
  - デバウンス時間を1500msから500msに短縮し、レスポンシブ性を向上（PlansProvider.ts）
  - 詳細なエラーメッセージでエラーハンドリングを改善（PlansProvider.ts）
  - formatDateTime()メソッドを使用して日時フォーマットを標準化（TemplateService.ts）

### 技術的変更
- TerminalProviderとEditorProviderで`_getHtmlForWebview`を非同期化
- 両プロバイダーで`resolveWebviewView`を非同期化
- すべての呼び出し元で非同期ファイル操作を適切にawaitするように更新
- HTML/CSS/JSの外部化によりTerminalProviderから約850行のインラインコードを削減
- 本番環境向けにデバッグ出力をクリーンアップ

## [0.9.6] - 2026-01-24

### セキュリティ
- **コマンドインジェクション脆弱性の修正**: EditorProviderで実行されるシェルコマンドのエスケープ処理を強化
  - シングルクォートベースの安全なエスケープ関数`_escapeShellArgument()`を実装
  - Run/Plan/Specボタンで実行されるすべてのコマンドで特殊文字を適切にエスケープ
  - バッククォート（`）、ドル記号（$）、バックスラッシュ（\）などのシェル特殊文字をすべて安全に処理
  - シェルインジェクション攻撃のリスクを大幅に軽減

### 修正
- **メモリリークの修正**: TerminalProviderで出力リスナーのDisposableが解放されない問題を修正
  - `_outputDisposables`のMapキーを統一（`sessionId` → `tab.id`）
  - `_setupSessionOutput`と`_closeTab`で同じキーを使用
  - タブ終了時にリソースが確実に解放されるように改善

### 改善
- **エラーハンドリングの強化**: TerminalServiceでnode-ptyロード失敗時の詳細情報を記録
  - `_unavailableReason`プロパティを追加
  - すべての試行パスとエラーメッセージを記録
  - `getUnavailableReason()`メソッドで詳細なエラー理由を取得可能
  - トラブルシューティングが容易に
- **ファイル操作の非同期化**: PlansProviderでファイルコピー処理を非同期化
  - `fs.copyFileSync` → `fs.promises.copyFile`に変更
  - `fs.existsSync` → `fs.promises.access`に変更
  - 大きなファイルのコピー時にUIがブロックされる問題を解消
- **コード重複の解消**: EditorProviderでTemplateServiceを活用
  - タイムスタンプ生成ロジックを一元化
  - `formatDateTime()`メソッドをTemplateServiceに追加
  - コードの保守性が向上

### 技術的変更
- TemplateServiceのコンストラクタをオプショナル化（EditorProviderから使用可能に）
- EditorProvider、PlansProvider、TerminalProvider、TerminalServiceの内部実装を改善

## [0.9.5] - 2026-01-24

### 修正
- **ターミナルタブのコマンド種別アイコン**: v0.9.4で実装した機能が正しく動作していなかった問題を修正
  - タブ番号がタブ表示から削除されていなかった問題を修正（TerminalProvider.ts:813）
  - `updateTabCommandType`のWebViewメッセージハンドラが実装されていなかった問題を修正
  - コマンド種別アイコン（▶️、📝、📑）がターミナルタブに表示されなかった問題を修正
  - WebViewとExtension間のメッセージング不整合を解消

### 技術的変更
- WebViewメッセージハンドラに`updateTabCommandType`ケースを実装
- 既存アイコンの削除と新規アイコンの追加を適切に処理するロジックを実装
- タブ作成コードを修正し、タブ番号を削除してシェル名のみを表示するように変更

## [0.9.4] - 2026-01-24

### 追加
- **ターミナルタブのコマンド種別アイコン**: 実行されたコマンドの種別に応じて、タブ名にアイコンを表示
  - Runコマンド（▶️）: Editor viewからタスクを実行したときに表示
  - Planコマンド（📝）: 実装計画を作成したときに表示
  - Specコマンド（📑）: 仕様書を生成したときに表示
  - アイコンはシェル名と一緒に表示されます（例: `▶️ bash`, `📝 bash`, `📑 bash`）

### 変更
- **ターミナルタブ名の表示**: タブ名から番号を削除
  - `bash (2)`, `zsh (3)`から、シンプルな`bash`, `zsh`に変更
  - タブの識別は表示番号ではなく内部IDで行うため、番号削除による影響なし
  - より見やすく、すっきりしたタブ表示

### 技術的変更
- `TerminalTab`インターフェースに`commandType`プロパティを追加
- `sendCommand`メソッドにオプショナル`commandType`パラメータを追加
- `updateTabCommandType`のWebViewメッセージハンドラーを実装
- EditorProviderのRun/Plan/Specコマンド実行時に`commandType`を渡すように更新
- タブ情報に`shellName`を保存し、アイコン更新時に利用

## [0.9.3] - 2026-01-23

### 追加
- **ターミナルタブ-ファイル関連付け**: Editor viewからコマンドを実行する際、現在のファイルがアクティブなターミナルタブに関連付けられるようになりました
  - Run/Plan/Specボタンで実行されたコマンドに、実行元ファイルのパスが記録されます
  - ターミナルタブとファイルの関連付けをMap構造で管理（`tabId -> filePath`）
- **タブ切り替え時の自動同期**: ターミナルタブを切り替えると、関連付けられたファイルとディレクトリが自動的に開きます
  - 関連付けられたファイルがEditor viewで自動的に開かれます
  - Plans viewが関連ファイルの親ディレクトリに自動的に移動します
  - Terminal、Editor、Plans viewが連携して動作します

### 変更
- **Provider依存関係**: インターフェースベースの依存性注入を拡張し、ビュー間の連携を強化
  - `TerminalProvider`に`IEditorProvider`インターフェースを追加（Editor viewとの連携用）
  - `TerminalProvider`に`IPlansProvider`インターフェースを追加（Plans viewとの連携用）
  - `ITerminalProvider.sendCommand()`メソッドに`filePath`オプションパラメータを追加

### 技術的変更
- `_tabFileMap: Map<string, string>`プロパティをTerminalProviderに追加し、タブとファイルの関連付けを管理
- `_activateTab()`メソッドを拡張し、EditorProviderとPlansProviderの両方を呼び出すように変更
- `setEditorProvider()`と`setPlansProvider()`メソッドを追加し、Providerインスタンスを注入
- `_closeTab()`と`_cleanup()`メソッドに関連付けマップのクリーンアップ処理を追加
- EditorProviderのRun/Plan/Specボタンから`sendCommand()`を呼び出す際、`filePath`パラメータを渡すように更新

## [0.9.2] - 2026-01-20

### 変更
- **Editorのspecコマンド**: `aiCodingSidebar.editor.specCommand`のデフォルト値を更新
  - 出力ファイルを`YYYY_MMDD_HHMM_SS_plans.md`から`YYYY_MMDD_HHMM_SS_tasks.md`に変更
  - 仕様書ワークフロー（requirements.md, design.md, tasks.md）との整合性を向上

## [0.9.1] - 2026-01-20

### 改善
- **コード保守性**: コード構成と保守性を向上させる大規模なリファクタリング
  - extension.tsを1674行から217行に削減（87%削減）
  - コマンド登録を機能別に6つのモジュールファイルに分割
  - テスタビリティ向上のため依存性注入パターン（CommandDependencies）を導入

### 変更
- **ファイル操作**: すべてのファイル操作をasync/awaitパターンに変換
  - 同期的なfs.*Syncメソッドからfs.promisesに移行
  - ファイル操作中のUIブロッキングを防止
  - パフォーマンスとユーザーエクスペリエンスを改善

### 追加
- **TemplateService**: タイムスタンプとテンプレート生成を一元化
  - タイムスタンプ生成ロジックを統一（YYYY_MMDD_HHMM_SS形式）
  - テンプレート変数生成を一元化
  - Prompt/Task/Specファイルのファイル名生成を標準化
- **外部Webviewリソース**: EditorProviderのHTML/CSS/JSを外部化
  - インライン文字列からresources/webview/editor/配下の個別ファイルに移動
  - 保守性とContent Security Policy準拠を改善
  - UIコンポーネントの修正とデバッグが容易に

### 削除
- **未使用サービス**: 7つの未使用サービスクラスをクリーンアップ
  - ExplorerManager、KeyboardShortcutHandler、ContextMenuManagerを削除
  - MultiSelectionManager、ClipboardManager、DragDropHandler、SearchServiceを削除
  - 関連するインターフェース（IExplorerManager、IClipboardManager、IMultiSelectionManager）を削除
  - 未使用の型定義（ClipboardData、SelectionState、SearchOptions）を削除

### 技術的変更
- モジュール化されたコマンド登録を持つsrc/commands/ディレクトリを作成
  - types.ts: CommandDependenciesインターフェース
  - settings.ts: 8つの設定関連コマンド
  - documentation.ts: 6つのドキュメントコマンド
  - terminal.ts: 6つのターミナルコマンド
  - plans.ts: 13個のPlans Viewコマンド
  - files.ts: 12個のファイル操作コマンド
  - index.ts: 集中化されたコマンドレジストリ
- fileUtils.getFileList()を非推奨とし、FileOperationService.getFileList()を優先
- resources/webview/editor/にindex.html、style.css、main.jsを作成

## [0.9.0] - 2026-01-19

### 改善
- **Terminal Viewの安定性**: ターミナルセッション管理を大幅に改善
  - セッション終了時に「Reconnect」ボタンを表示し、再接続機能を追加
  - Webview再読み込み時に自動的にセッションをクリーンアップし、状態の不整合を防止
  - セッション終了検知機能を追加（終了コードとシグナルをログ出力）
  - リサイズ処理を200msでデバウンスし、不要な操作を削減
  - 重複するサイズ変更をスキップして、リサイズ処理を最適化

### 変更
- **Terminal環境変数**: より安全な環境変数の処理
  - LANGは未設定の場合のみデフォルト値（`en_US.UTF-8`）を設定
  - LC_ALLは上書きせず、ユーザー環境設定を尊重
  - TERMとCOLORTERMを明示的に設定し、ターミナル互換性を向上

### 修正
- **Terminalエラーメッセージ**: node-pty初期化失敗時のエラー報告を改善
  - 詳細なエラーメッセージを取得する`getUnavailableReason()`メソッドを追加
  - ターミナルサービスが利用不可の場合のユーザーガイダンスを改善

### 技術的変更
- セッションライフサイクル管理のための`ITerminalService.onSessionExit()`メソッドを追加
- エラー診断のための`ITerminalService.getUnavailableReason()`を追加
- コードの再利用性向上のため、出力リスナー設定を`_setupSessionOutput()`メソッドにリファクタリング
- `isClosed`フラグによるターミナルセッション状態管理を改善
- PTYセッション終了時のクリーンアップ処理を強化

## [0.8.45] - 2026-01-18

### 変更
- **Editor設定**: PlanボタンとSpecボタンのデフォルトコマンドを簡素化
  - `aiCodingSidebar.editor.planCommand` のデフォルト値から `--permission-mode plan` フラグを削除
  - `aiCodingSidebar.editor.specCommand` のデフォルト値から `--permission-mode plan` フラグを削除
  - 新しいデフォルトコマンドは `claude --permission-mode plan` の代わりに `claude` を使用
  - 既存のユーザー設定には影響しません

## [0.8.44] - 2026-01-17

### 変更
- **VSCode Marketplaceメタデータ**: package.jsonのキーワードとカテゴリを強化し、検索性を向上
  - カテゴリを追加: "SCM Providers"（Git統合機能のため）
  - キーワードを追加: "ai-coding", "claude", "copilot", "sidebar", "panel", "file-browser", "task-management", "plans", "terminal", "editor", "markdown", "git", "ai-tools"
  - VSCode Marketplaceでの検索表示とユーザーリーチを改善

## [0.8.43] - 2026-01-17

### 変更
- **ドキュメント**: README.mdとREADME-JA.mdのバージョン参照を0.8.42から0.8.43に更新

## [0.8.42] - 2026-01-17

### 変更 - 破壊的変更
- **ファイル/クラス名**: Tasks→Plans への名称変更をコードベース全体で完了
  - `TasksProvider.ts` → `PlansProvider.ts` にリネーム
  - クラス名 `TasksProvider` → `PlansProvider` に変更
  - **対応が必要**: カスタムキーバインディングやスクリプトで旧名称を参照している場合は更新してください

- **コマンドID - 破壊的変更**: コマンド識別子を更新
  - `aiCodingSidebar.openTasksSettings` → `aiCodingSidebar.openPlansSettings`
  - `aiCodingSidebar.openTasksViewGuide` → `aiCodingSidebar.openPlansViewGuide`
  - **対応が必要**: これらのコマンドにキーボードショートカットを設定している場合は、keybindings.jsonを更新してください

- **設定キー - 破壊的変更**: 一貫性のため全ての設定キーを名称変更
  - `aiCodingSidebar.tasks.sortBy` → `aiCodingSidebar.plans.sortBy`
  - `aiCodingSidebar.tasks.sortOrder` → `aiCodingSidebar.plans.sortOrder`
  - **対応が必要**: settings.jsonで新しい設定キーを使用するように更新してください

- **ドキュメント**: Plans命名を反映するよう全ドキュメントファイルを更新
  - `docs/tasks-view.md` → `docs/plans-view.md` にリネーム
  - getting-started.md、keyboard-shortcuts.md、CLAUDE.mdを更新
  - README.mdとREADME-JA.mdのテンプレート例を更新
  - デフォルトテンプレートを `YYYY_MMDD_HHMM_SS_tasks.md` → `YYYY_MMDD_HHMM_SS_plans.md` に更新

### 修正
- **設定読み込み**: `plans.defaultRelativePath` 設定を正しく読み込むように設定パスを修正
  - ConfigurationProvider.tsを `defaultRelativePath` から `plans.defaultRelativePath` に更新
  - extension.tsでPlansのデフォルトパス設定を正しく読み込むように修正
  - EditorProvider.tsで正しい設定パスを使用するように更新
  - workspaceSetup.tsで正しい設定キーを設定するように更新
  - この修正により、VSCode設定UIの「Ai Coding Sidebar › Plans: Default Relative Path」設定が正しく認識されるようになります

### マイグレーションガイド
v0.8.33以前からアップグレードする場合:
1. キーボードショートカットを更新: keybindings.jsonで旧コマンドIDを新しいものに置き換えてください
2. 設定を更新: settings.jsonで `aiCodingSidebar.tasks.*` を `aiCodingSidebar.plans.*` に名称変更してください
3. 自動マイグレーションは提供されません - 手動での更新が必要です

## [0.8.33] - 2026-01-17

### 変更
- **ドキュメント**: "Plans" 命名規則を完全に反映するようドキュメントを更新
  - CLAUDE.mdを新しい設定名前空間（`plans.defaultRelativePath`、`plans.sortBy`、`plans.sortOrder`）に更新
  - README.mdとREADME-JA.mdを "Tasks" から "Plans" に一貫して更新
  - 設定ドキュメントに `editor.planCommand` と `editor.specCommand` を追加
  - すべてのVSIXバージョン参照を0.8.32から0.8.33に更新
  - デフォルトパスの例を `.claude` から `.claude/plans` に修正

## [0.8.32] - 2026-01-17

### 変更
- **ビュー名**: 拡張機能全体で "Tasks" ビューを "Plans" に名称変更
  - ビュータイトルを "TASKS" から "PLANS" に変更
  - メニュー項目を新しい名称に更新
  - ドキュメントとREADMEを "Plans" 用語に更新
- **設定構造 - 破壊的変更**: 設定キーを `plans` 名前空間に再編成
  - `aiCodingSidebar.defaultRelativePath` → `aiCodingSidebar.plans.defaultRelativePath`
  - `aiCodingSidebar.tasks.sortBy` → `aiCodingSidebar.plans.sortBy`
  - `aiCodingSidebar.tasks.sortOrder` → `aiCodingSidebar.plans.sortOrder`
  - デフォルトパスを `.claude/tasks` から `.claude/plans` に変更
  - **注意**: 既存ユーザーの設定はデフォルト値にリセットされます（自動移行なし）
- **設定メニュー**: "Tasks Settings" を "Plans Settings" に名称変更
  - `aiCodingSidebar.plans` 設定セクションを直接開くように変更
  - 新しい "Plans" 命名規則と一貫性を保つ

### 技術的変更
- 設定キー変更により5つのコアファイルを更新（合計18箇所の修正）
- TasksProvider.tsを新しい設定名前空間に対応
- ConfigurationProvider.tsを新しい設定構造に更新
- ワークスペース設定ユーティリティを新しいデフォルトパスに変更

## [0.8.31] - 2026-01-10

### 改善
- **Editor View - レスポンシブなヘッダーレイアウト**: 狭いビュー幅でのボタン表示を改善
  - スペースが限られている場合、ファイル名が自動的に省略記号で切り詰められます
  - ボタン（Edit、Save、Spec、Plan、Run）は常に完全に表示されます
  - ビュー幅が狭くなると、ファイル名がボタンより優先的に非表示になります
  - 改善されたFlexレイアウトにより、ボタンのオーバーフローを防ぎ、アクセシビリティを確保

### 技術的変更
- EditorProvider.tsのCSSを更新：ヘッダーから`flex-wrap: wrap`を削除
- `.file-info`のflex動作を`flex: 1 1 0`に変更し、縮小を改善
- `#file-path`から`min-width: 60px`を削除し、完全に非表示にできるように
- `.file-info`に`overflow: hidden`を追加してコンテンツのオーバーフローを防止

## [0.8.30] - 2026-01-10

### 変更
- **Editor Commands - Plan Mode統合**: デフォルトコマンドテンプレートに`--permission-mode plan`オプションを追加
  - Plan Commandに明示的なplan mode起動のための`--permission-mode plan`を追加
  - Spec Commandに構造化された仕様作成のための`--permission-mode plan`を追加
  - Claude Codeとの実装計画ワークフローを標準化
  - 既存のカスタムコマンド設定は影響を受けません

### 技術的変更
- package.jsonの`aiCodingSidebar.editor.planCommand`デフォルト値を更新
- package.jsonの`aiCodingSidebar.editor.specCommand`デフォルト値を更新

## [0.8.28] - 2026-01-09

### 改善
- **Terminal View - ボタンの簡素化**: ターミナルヘッダーボタンを整理し、より明確に
  - より直感的な用語として「Kill」ボタンを「Close」に改名
  - ショートカット領域から冗長な「× Close」ボタンを削除
  - 単一の「Close」ボタンですべてのタブ閉じる操作を処理
  - ボタンの混雑を減らし、よりクリーンなUI

### 技術的変更
- TypeScriptバックエンドから`closeTab`メッセージハンドラを削除
- HTMLテンプレートを更新：Killボタンをタイトル付きでCloseに改名
- ショートカットバーから「× Close」ボタン要素を削除
- JavaScriptから`btn-close-tab`イベントハンドラを削除

## [0.8.27] - 2026-01-09

### 改善
- **Terminal View - 閉じるボタンの配置**: タブの閉じるボタンの配置を改善し、使いやすさを向上
  - 閉じるボタンを各タブからショートカット領域の右端に移動
  - 閉じるボタン（× Close）が常に表示され、アクセスしやすくなりました
  - 1つの統一された閉じるボタンでアクティブなタブを閉じる
  - UIの混雑を減らし、タブの状態間での一貫性を改善

### 技術的変更
- HTMLテンプレートから個別のタブ要素の閉じるボタンを削除
- flexbox（`margin-left: auto`）を使用してショートカットバーの直接の子要素として閉じるボタンを再配置
- 2つの閉じるボタンイベントハンドラを`btn-close-tab`用の単一ハンドラに統合
- 閉じるボタン検出ロジックを削除してタブクリックイベントハンドラを簡略化

## [0.8.26] - 2026-01-08

### 追加
- **Tasks View - 自動ファイル選択**: ディレクトリに移動した際に、最も古い対象ファイルを自動的に選択して表示
  - TASK.md、PROMPT.md、SPEC.mdファイルを検索（大文字小文字を区別せず、タイムスタンプ付きも含む）
  - 最も古い作成日時のファイルを選択
  - 選択されたファイルを自動的にEditor Viewで開く
  - ディレクトリをクリックした場合や".."で戻った場合に動作
  - 対象ファイルが見つからない場合は何もしない

### 技術的変更
- `IEditorProvider`インターフェースに`showFile()`メソッドを追加
- `TasksProvider`に対象ファイル検出用の`findOldestTargetFile()`メソッドを追加
- `navigateToDirectory()`を拡張してディレクトリ移動後に自動ファイル選択を実行

## [0.8.25] - 2026-01-08

### 追加
- **Tasks View - ディレクトリソート設定**: ディレクトリがファイルと同様にソート設定を尊重するようになりました
  - 新設定 `aiCodingSidebar.tasks.sortBy` と `aiCodingSidebar.tasks.sortOrder` が `markdownList.*` 設定を置き換え
  - ディレクトリを名前、作成日時、更新日時でソート可能（従来は名前のみ）
  - 昇順・降順の両方のソート順をサポート
  - デフォルトソートは作成日時（昇順）に変更（従来は名前（昇順））

### 変更
- **設定名の変更**: Tasks Viewの設定名をより直感的に変更
  - `aiCodingSidebar.markdownList.sortBy` → `aiCodingSidebar.tasks.sortBy`
  - `aiCodingSidebar.markdownList.sortOrder` → `aiCodingSidebar.tasks.sortOrder`
  - 旧設定は削除されました（自動移行なし）
- **Tasks設定メニュー**: Tasks Settingsボタンで `aiCodingSidebar.tasks` 設定を直接開くように変更
  - 従来は拡張機能の全設定を開いていました

### 技術的変更
- ディレクトリとファイル共通のソート関数にリファクタリング
- 新しい設定名を監視するように設定変更監視を更新

## [0.8.24] - 2026-01-08

### 修正
- **Terminal View - 日本語文字エンコーディング**: ターミナル出力での日本語文字化け問題を修正
  - PTYプロセス作成時にUTF-8ロケール環境変数（LANG、LC_ALL）を明示的に設定
  - 日本語やその他のCJK言語の文字エンコーディングを確実に実行
  - 既にロケールが設定されている場合はユーザーの設定を尊重
  - ターミナルセッションでの国際文字サポートを改善

## [0.8.23] - 2026-01-08

### 追加
- **Tasks View - ディレクトリ作成日表示**: ルートパスのディレクトリに作成日を表示
  - ディレクトリ名の右側に作成日をYYYY-MM-DD形式で表示（description表示）
  - ルートパスレベル（例：`.claude/tasks/`）のディレクトリのみが対象
  - サブディレクトリ内では作成日を表示しない
  - タスクディレクトリがいつ作成されたかを一目で確認でき、タスク管理が効率化

## [0.8.22] - 2026-01-04

### 改善
- **Terminal View - New Terminalボタン配置**: タブの右側にNew Terminalボタン（+ボタン）を配置
  - タブ要素の前に`insertBefore`で挿入することで、ボタンが常にタブの右側に表示される
  - ターミナルタブが最大数（5つ）に達した場合、+ボタンを自動的に非表示
  - タブを閉じてタブ数が5つ未満になった場合、+ボタンを再表示
  - UI/UXの一貫性向上により、新しいターミナルの作成が直感的に

## [0.8.21] - 2026-01-03

### 改善
- **Terminal View - 自動スクロール強化**: 意図しないスクロール位置のずれを防ぐため、最下部への自動追従動作を強化
  - `write()`コールバックを使用して、出力完了後に確実にスクロールを実行
  - 2重の`requestAnimationFrame`でDOM更新との同期を確実に実現
  - ユーザーが手動で上にスクロールしない限り、スクロール位置を最下部に維持
  - 高速な出力（npm installなど）時のスクロール位置のずれを修正

## [0.8.20] - 2026-01-03

### 変更
- **Editor View - ボタン順序**: PlanボタンとSpecボタンの順序を入れ替え
  - 旧順序: Edit、Save、Plan、Spec、Run
  - 新順序: Edit、Save、Spec、Plan、Run
  - Specボタンを先に配置することでワークフローを改善

## [0.8.19] - 2026-01-02

### 追加
- **Editor View - VS Codeで編集ボタン**: VS Code標準エディタでMarkdownファイルを開くボタンを追加
  - Saveボタンの左側に鉛筆アイコン（✏️）ボタンを配置
  - クリックするとVS Code標準エディタでファイルを開く
  - 開く前に未保存の変更を自動保存
  - VS Codeでファイルを開いている間、Editor Viewは読み取り専用モードに

### 変更
- **Editor View - ボタンUI**: ボタンデザインと一貫性を改善
  - EditボタンとSaveボタンをアイコンのみ表示に変更（✏️ と 💾）
  - すべてのボタンの高さを`line-height: 16px`で統一
  - 「Read-only」テキストを「Editing in VS Code」に変更

### 改善
- **Editor View - 読み取り専用モード**: 読み取り専用モードの動作とユーザー体験を強化
  - 読み取り専用インジケータをエディタエリアの右上に配置し、フェードイン/アウトアニメーション付きで表示
  - VS Codeでファイルを開いている間、Editボタンにアクティブ状態（背景色付き）を表示
  - ファイルタブがVS Codeで開いている限り読み取り専用モードを維持（アクティブでなくても）
  - 読み取り専用エディタエリアをクリックすると、VS Codeでファイルタブにフォーカス
  - リアルタイム同期: VS Codeエディタで保存した変更が自動的にEditor Viewに反映

## [0.8.18] - 2026-01-02

### 修正
- **Terminal View - スクロール位置**: ターミナルビューの横幅を変更したときにスクロール位置が最上部にジャンプしてしまう問題を修正
  - リサイズ前に最下部にいた場合、スクロール位置が最下部に正しく維持されるように修正
  - `requestAnimationFrame`を使用してターミナルのfit操作完了後にスクロール調整が実行されるように変更
  - サイドバーの幅を調整しても最新の出力が表示され続けることで、ユーザー体験を向上

## [0.8.17] - 2026-01-02

### 変更
- **Editor View - Runコマンド**: `aiCodingSidebar.editor.runCommand`設定のデフォルト値を更新
  - 旧: `claude "${filePath}"`
  - 新: `claude "Review the file at ${filePath}"`
  - ファイルレビュー時にClaude Codeへのコンテキストをより明確に提供

## [0.8.16] - 2026-01-01

### 改善
- **Terminal View - 自動スクロール**: 新しい出力が追加されたときやビューのサイズが変更されたときに、スクロール位置を最下部に自動維持
  - 各ターミナルタブのスクロール位置を独立して追跡
  - ユーザーが最下部にいる場合のみ自動スクロール（手動スクロール位置は保持）
  - ユーザーが「↓」スクロール-最下部ボタンをクリックすると自動スクロールを再開
  - 長時間実行コマンド中も最新の出力を表示し続けることで、ユーザー体験を向上

## [0.8.15] - 2025-12-31

### 技術的変更
- **バージョン更新**: バージョンを0.8.15に更新
- **ドキュメント**: READMEファイルのバージョン参照を更新

## [0.8.12] - 2025-12-31

### 追加
- **Tasks View - パス挿入インラインボタン**: ファイル行にパス挿入用のインラインボタンを追加
  - 「Insert Path to Editor」ボタン（editアイコン）でファイルの相対パスをEditor viewに挿入
  - 「Insert Path to Terminal」ボタン（terminalアイコン）でファイルの相対パスをTerminal viewに挿入
  - Tasks viewでファイルアイテムにホバーするとボタンが表示
  - 既存のコンテキストメニューと同じ機能を1クリックで利用可能に

## [0.8.11] - 2025-12-31

### 追加
- **Editor View - フォーカスインジケーター**: Editor viewにフォーカスがあるときに枠線を表示
  - VSCodeテーマカラー `--vscode-focusBorder` を使用して一貫した外観を実現
  - どのビューにフォーカスがあるかをユーザーが識別しやすくなった
- **Terminal View - フォーカスインジケーター**: Terminal viewにフォーカスがあるときに枠線を表示
  - Editor viewと同じスタイリングで視覚的な一貫性を実現

## [0.8.10] - 2025-12-31

### 追加
- **Terminal View - Claude Codeショートカット**: Claude Codeコマンド用のショートカットボタンを追加
  - Claude Code未起動時: `claude`, `claude -c`, `claude -r` ボタン
  - Claude Code起動中: `/compact`, `/clear` ボタン
  - トグルボタン（⇆）でショートカットグループを手動切り替え可能
- **Terminal View - Claude Code自動検知**: ターミナル出力からClaude Codeの起動・終了を自動検知
  - 起動検知パターン: `claude>` プロンプト、`╭─` UI要素、`Entering interactive mode`、`Type /help`
  - 終了検知パターン: シェルプロンプト（`$`, `%`, `#`）で行に「claude」を含まない場合
  - 検知された状態に応じてショートカットボタンを自動切り替え
- **Terminal View - スマートEnterキー**: シェルコマンドにのみEnterキーを送信
  - シェルコマンド: コマンド + 改行を送信
  - Claude Codeコマンド: コマンドのみ送信（Claude Code入力での不要な改行を防止）
  - ショートカットボタンとEditor Runコマンドの両方に適用

### 変更
- **Terminal View - ヘッダーレイアウト**: 2行ヘッダーレイアウトに変更
  - 1行目: タブバー、新規タブボタン、Clear/Killボタン
  - 2行目: Claude Code用ショートカットボタン

## [0.8.8] - 2025-12-31

### 変更
- **ファイル作成ボタンのアイコン**: ファイル作成ボタンのアイコンを変更し、視覚的な区別を改善
  - New PROMPT.md: `$(new-file)` から `$(comment-discussion)`（吹き出しアイコン）に変更
  - New TASK.md: `$(new-file)` から `$(tasklist)`（タスクリストアイコン）に変更
  - New SPEC.md: `$(new-file)` から `$(file-code)`（コードファイルアイコン）に変更
  - 異なるファイル作成アクションを識別しやすくなった

## [0.8.7] - 2025-12-31

### 変更
- **コマンド名変更**: 「New .md」コマンドを「New PROMPT.md」に名称変更し明確化
- **Tasks View - ヘッダー簡素化**: Tasks viewタイトルバーから「New Directory」「New PROMPT.md」ボタンを削除
  - これらの機能はパス表示行のインラインボタンとして利用可能に
  - タイトルバーには New Task、New Spec、Refresh、Settings のみ表示

### 追加
- **新規ファイルコマンド**: 「New TASK.md」「New SPEC.md」コマンドを追加
  - 現在のディレクトリにタイムスタンプ付きのTASK.mdまたはSPEC.mdファイルを作成
  - Tasksのパス表示行とEditorヘッダーの両方から利用可能
- **Tasks View - パス表示インラインボタン**: パス表示行にインラインアクションボタンを追加
  - New PROMPT.md、New TASK.md、New SPEC.md: 新規ファイル作成
  - Copy、Rename: 現在のディレクトリを管理（サブディレクトリのみ）
  - New Directory: 新しいサブディレクトリを作成
  - Archive: 現在のディレクトリをアーカイブ（サブディレクトリのみ）
- **Editor View - 新規ファイルボタン**: Editor viewヘッダーに「New TASK.md」「New SPEC.md」ボタンを追加
  - Editor viewから直接新しいファイルタイプを作成可能
  - 既存の「New PROMPT.md」ボタンを補完

## [0.8.6] - 2025-12-31

### 変更
- **テンプレート機能 - ディレクトリパス**: テンプレートディレクトリパスを `.vscode/ai-coding-sidebar/templates` から `.vscode/ai-coding-panel/templates` に変更
  - 拡張機能のリネーム後の表示名「AI Coding Panel」に合わせた変更
  - すべてのテンプレート参照が新しいパスを使用するように

### 追加
- **テンプレート機能 - 複数テンプレート**: Customize Templateで3つのテンプレートファイルを作成
  - `task.md` - Start Taskコマンド用テンプレート
  - `spec.md` - New Specコマンド用テンプレート
  - `prompt.md` - New File (PROMPT.md)コマンド用テンプレート
  - 以前は`task.md`ファイル1つのみを作成していた
- **テンプレート機能 - エクスプローラー表示**: テンプレート作成後、templatesディレクトリをエクスプローラーで表示
  - 複数のテンプレートファイルへのナビゲーションと編集が容易に

## [0.8.3] - 2025-12-31

### 追加
- **Tasks View - パスヘッダーボタン**: パス表示ヘッダーにCopy Relative PathとRenameボタンを追加
  - Copy Relative Pathボタンで現在のディレクトリパスをクリップボードにコピー
  - Renameボタンで現在のディレクトリをインラインでリネーム可能
  - 両ボタンはArchiveボタンの横に表示

### 変更
- **Tasks View - リネーム後のナビゲーション**: ディレクトリリネーム後に自動的にリネーム後のディレクトリに移動
  - 以前は古い（無効な）パスに留まっていた
  - リネーム後のディレクトリ内容を即座に表示し、フィードバックを提供

### 改善
- **Editor View - 自動保存**: より多くのシナリオをカバーするよう自動保存機能を強化
  - Webviewが破棄される際に保存（サイドバーを閉じる場合など）
  - 拡張機能がdeactivateされる際に保存（VS Codeを閉じる場合など）
  - クリーンアップのためのDisposableインターフェースを適切に実装

## [0.8.2] - 2025-12-30

### 追加
- **Terminal View - タブ自動作成**: 最後のタブが閉じられた際に自動的に新しいターミナルタブを作成
  - 少なくとも1つのタブを維持することで、ターミナルが常に利用可能な状態を確保
  - 手動で新しいタブを作成する手間なくシームレスなユーザー体験を提供
- **Terminal View - 最下部へスクロールボタン**: ターミナルの最下部へスクロールするフローティングボタンを追加
  - 最下部からスクロールアップすると右下にボタンが表示
  - ボタンをクリックすると最新の出力にスクロールし、ターミナルにフォーカス
  - 最下部にいる時はボタンが自動的に非表示

## [0.8.1] - 2025-12-30

### 追加
- **Terminal View - Unicode対応**: xterm-addon-unicode11を追加し、CJK文字の幅計算を適切に実行
  - 日本語、中国語、韓国語などのUnicode文字が正しく表示されるように
  - ターミナル出力での文字配置のずれを修正

### 改善
- **Terminal View - レイアウト**: ターミナルのサイズ調整とフィット動作を改善
  - ターミナルがビューの幅いっぱいに正しく表示されるように
  - ターミナルビュー下部の隙間を修正
  - 初期ターミナルサイズ計算を改善

### 変更
- **Terminal View - スクロール動作**: 自動スクロール機能を削除
  - 新しい出力時にターミナルが自動的に最下部にスクロールしなくなった
  - ユーザーがスクロール位置を完全に制御可能

## [0.8.0] - 2025-12-30

### 技術的変更
- **コードリファクタリング**: extension.tsをモジュラーファイルに分割し、保守性を向上
  - `src/providers/`ディレクトリを作成（TasksProvider, EditorProvider, TerminalProvider, MenuProvider）
  - `src/providers/items/`ディレクトリを作成（FileItem, MenuItem TreeItemクラス）
  - `src/utils/`ディレクトリを作成（fileUtils, templateUtils, workspaceSetupユーティリティ）
  - extension.tsを約4,077行から約1,377行に削減
  - 循環参照を避けるためインターフェースベースの依存性注入（IEditorProvider, ITerminalProvider）を使用

### 変更
- **CLAUDE.md**: 新しいモジュラーアーキテクチャを反映してドキュメントを更新
- **README**: ドキュメント構造を再編成
  - Featuresセクションを概要テーブルと詳細な機能詳細セクションに分割
  - 拡張機能のメリットを強調する説明文に更新
  - 機能詳細をテーブル形式に変換して可読性を向上

## [0.7.38] - 2025-12-30

### 追加
- **Editor View - ショートカットオーバーレイ**: エディタに常時表示のキーボードショートカット案内を追加
  - 「Cmd+M / Ctrl+M - Create new markdown file」「Cmd+R / Ctrl+R - Run task in terminal」を表示
  - 右下に半透明のオーバーレイとして表示
  - 編集中も常に表示（テキスト入力を妨げない）

### 変更
- **Editor View - プレースホルダー**: プレースホルダーテキストを「Enter prompt here...」に変更し、用途を明確化

## [0.7.37] - 2025-12-30

### 追加
- **Terminal View - 複数タブ**: ターミナルの複数タブ機能を追加
  - 最大5つのターミナルタブを作成可能、各タブは独立したPTYセッションを持つ
  - シェル名と閉じるボタンを持つタブバーUI
  - 「+」ボタンで新規タブを作成
  - タブをクリックでセッション切り替え
  - 「×」ボタンで個別のタブを閉じる
  - ClearとKillボタンはアクティブタブに対して動作

## [0.7.36] - 2025-12-30

### 追加
- **Tasks View - パスヘッダーのArchiveボタン**: ルートディレクトリ以外にいる場合、パス表示ヘッダーにArchiveボタンを追加
  - クリックで現在のディレクトリをアーカイブし、自動的にルートに戻る
  - 他のディレクトリに移動せずにアーカイブ機能へ素早くアクセス可能

### 変更
- **UIメッセージ - 英語化**: すべてのユーザー向けメッセージを英語に変更
  - エラーメッセージ、成功通知、ダイアログのプロンプトが英語になりました
  - 対象ファイル: extension.ts, FileOperationService.ts, ContextMenuManager.ts, DragDropHandler.ts, ClipboardManager.ts, ExplorerManager.ts, SearchService.ts

## [0.7.35] - 2025-12-30

### 変更
- **Editor View - ディレクトリ移動時のクリア**: Tasks viewでディレクトリを移動した際にEditor viewのファイル選択をクリアするように変更
  - 以前は別のディレクトリに移動しても選択中のファイルが表示されたままだった
  - ディレクトリ移動時にエディタが未選択状態に戻るようになりました
  - 異なるディレクトリを閲覧する際のユーザー体験が向上

## [0.7.34] - 2025-12-29

### 追加
- **Tasks View - Show in File Listボタン**: ディレクトリの「Show in File List」インラインボタンを復活
  - クリックでそのディレクトリに移動し、内容を表示
  - Archiveボタンの前にインラインボタンとして表示

### 変更
- **Editor View - ボタンラベル**: 「Create Markdown File」ボタンのラベルを「New .md」に簡略化
  - Markdownファイル作成用のより簡潔で技術的なラベルに変更

## [0.7.33] - 2025-12-29

### 修正
- **Terminal View - リサイズ時のスクロール位置**: ビューのサイズ変更時にスクロール位置が最上部に移動してしまう問題を修正
  - 以前はターミナルビューをリサイズするとスクロール位置が最上部に移動していた
  - リサイズ後は常に最下部にスクロールするように変更し、ユーザー体験を改善
  - リサイズ後も常に最新のターミナル出力が表示されるようになりました

## [0.7.32] - 2025-12-29

### 追加
- **Tasks View - Archiveインラインボタン**: ディレクトリ行にArchiveボタンを直接追加
  - Tasksビューの各ディレクトリ行にArchiveアイコンがインライン表示
  - 右クリックコンテキストメニューなしでアーカイブ機能に素早くアクセス
  - 「Show in Panel」インラインボタンを削除（アーカイブの方がよく使用されるため）

## [0.7.31] - 2025-12-29

### 修正
- **Start Task - ファイル名形式**: Start Taskでファイル作成時に新しい形式が適用されていなかった問題を修正
  - Start Taskコマンドが旧形式 `MMDD.HHMM.SS_PROMPT.md` を使用していた
  - 新形式 `YYYY_MMDD_HHMM_SS_PROMPT.md` を正しく使用するように修正
  - すべてのファイル作成方法（Create Markdown FileとStart Task）でファイル名形式を統一

## [0.7.30] - 2025-12-29

### 変更
- **ファイル名形式**: Create Markdown Fileで作成されるファイル名の形式を変更
  - 旧形式: `MMDD.HHMM.SS_PROMPT.md`（例: `1229.0619.38_PROMPT.md`）
  - 新形式: `YYYY_MMDD_HHMM_SS_PROMPT.md`（例: `2025_1229_0619_38_PROMPT.md`）
  - 年プレフィックスを追加し、区切り文字をアンダースコアに統一

## [0.7.28] - 2025-12-29

### 変更
- **設定 - Run Commandデフォルト値**: `editor.runCommand`設定のデフォルト値を変更
  - 旧デフォルト値: `claude "read ${filePath} and save your report to the same directory as ${filePath}"`
  - 新デフォルト値: `claude "${filePath}"`
- **ファイル名形式**: Create Markdown Fileで作成されるファイル名の形式を変更
  - 旧形式: `YYYY_MMDD_HHMM_TASK.md`（例: `2025_1229_0619_TASK.md`）
  - 新形式: `MMDD.HHMM.SS_PROMPT.md`（例: `1229.0619.38_PROMPT.md`）
  - より正確なタイムスタンプのため秒を追加

### 追加
- **テンプレート変数**: ワークスペース相対パス用の新しいテンプレート変数を追加
  - `{{filepath}}`: ワークスペースルートからのファイルパス（例: `.claude/tasks/1229.0619.38_PROMPT.md`）
  - `{{dirpath}}`: ワークスペースルートからのディレクトリパス（例: `.claude/tasks`）

## [0.7.25] - 2025-12-29

### 変更
- **Tasks View - Start Task動作の変更**: Start Taskでディレクトリを作成する場所を変更
  - 以前: 常に`defaultRelativePath`（デフォルト: `.claude/tasks`）配下に作成
  - 変更後: Tasks Viewで現在開いているディレクトリ配下に作成
  - フォールバック: 現在のパスが取得できない場合は従来通り`defaultRelativePath`を使用

### 追加
- **Tasks View - 新規ディレクトリボタン**: Tasks Viewヘッダーに「New Directory」ボタンを追加
  - フォルダアイコンをクリックして現在のディレクトリ配下に新しいディレクトリを作成
  - ディレクトリのみを作成（Markdownファイルは作成しない）
  - ヘッダーボタンの順序: Start Task -> New Directory -> New File -> Refresh -> Settings

## [0.7.24] - 2025-12-29

### 追加
- **Tasks View - Editorにパスを挿入**: ファイル/フォルダのパスをEditorビューに挿入
  - Tasksビューでファイルやフォルダを右クリックして「Insert Path to Editor」を選択
  - Editorビューのカーソル位置に相対パスを挿入
  - 複数選択に対応 - 選択したすべてのパスが改行区切りで挿入される
  - 挿入後、Editorビューに自動的にフォーカス
- **Tasks View - Terminalにパスを挿入**: ファイル/フォルダのパスをTerminalビューに挿入
  - Tasksビューでファイルやフォルダを右クリックして「Insert Path to Terminal」を選択
  - Terminalビューに相対パスを挿入
  - 複数選択に対応 - パスはスペースで区切られる
  - ターミナルが起動していない場合は自動的に開始

## [0.7.23] - 2025-12-28

### 変更
- **Tasks View - テンプレート更新**: デフォルトのタスクテンプレートを更新
  - テンプレートにファイル名プレースホルダーを追加
  - テンプレートからバージョンセクションを削除

## [0.7.20] - 2025-12-27

### 変更
- **Tasks View - 設定の統合**: 「Folder Tree Settings」と「Docs Settings」を「Tasks Settings」に統合
  - 設定アイコンですべてのTasks関連設定を一箇所で表示
  - タイトルメニューのアイコン数を削減してシンプルに
- **Tasks View - メニュー順序**: タイトルメニューのアイコン順序を変更
  - 新しい順序: Start Task -> Create Markdown File -> Refresh -> Tasks Settings
  - Create Markdown FileをStart Taskの隣に配置してアクセスしやすく

## [0.7.19] - 2025-12-27

### 変更
- **Tasks View - タイトル**: タイトルを動的な「Tasks: パス」から固定の「TASKS」に変更
  - パスはタイトルではなくリストの先頭アイテムとして表示されるように
  - ルートディレクトリ: プロジェクトルートからの相対パスを表示（例: ".claude/tasks"）
  - サブディレクトリ: Tasksルートからの相対パスを表示（例: "v0.7.19"）
- **Editor View - Run時のフォーカス**: Runボタンをクリックした際にTerminal viewにフォーカスが移動するように変更
  - 以前はRun実行後もEditor viewにフォーカスが残っていた
  - ターミナルとの即座のインタラクションのため自動的にフォーカスを移動
- **Terminal View - スクロール位置**: リサイズ時にスクロール位置が最下部で維持されるように変更
  - ビューが最下部までスクロールされている状態でリサイズすると、最下部を維持
  - 上にスクロールしている場合は、そのスクロール位置を維持

## [0.7.18] - 2025-12-27

### 変更
- **Tasks View - フラットリスト表示**: ツリービューからフラットリスト表示に変更
  - 現在のディレクトリの内容のみを表示（ツリー展開なし）
  - ディレクトリをクリックでそのディレクトリに移動
  - ".."アイテムで親ディレクトリに戻る
  - タイトルにルートからの相対パスを動的に表示（例: "Tasks: subdir1/subdir2"）
- **Start Taskコマンド**: 作成したディレクトリに自動的に移動するように変更
  - Start Taskでディレクトリを作成後、ビューが新しいディレクトリの内容を表示
- **ビューのデフォルト表示**: 各ビューのデフォルト表示状態を変更
  - Menu: デフォルトで折りたたみ
  - Terminal: デフォルトで表示（以前は折りたたみ）

### 削除
- **Task Panel（ベータ版）**: Task Panel機能を完全に削除
  - `TaskPanelManager`クラスと関連機能を削除
  - `aiCodingSidebar.taskPanel.enabled`設定を削除
  - `aiCodingSidebar.taskPanel.nonTaskFilePosition`設定を削除
- **Active Panelsビュー**: サイドバーからActive Panelsビューを削除
  - このビューは開いているTask Panelの管理に使用されていました
- **Menu View - Beta Features**: MenuビューからBeta Featuresセクションを削除
- **Editor設定**: `aiCodingSidebar.editor.useTerminalView`設定を削除
  - Runボタンは常にTerminal viewにコマンドを送信するようになりました

## [0.7.17] - 2025-12-27

### 変更
- **名称変更**: 拡張機能の表記名を「AI Coding Sidebar」から「AI Coding Panel」に変更
  - アクティビティバータイトル、設定タイトル、ステータスバー、ターミナル名を更新
  - READMEとREADME-JAドキュメントを更新
- **Tasks View - ディレクトリクリック動作**: Task Panel設定に応じてディレクトリクリック時の動作を変更
  - `taskPanel.enabled: false`の場合: クリックで展開/折りたたみ（標準動作）
  - `taskPanel.enabled: true`の場合: クリックでTask Panelを開く（従来の動作）

### 削除
- **Tasks View - Selectedラベル**: ディレクトリの「Selected」ラベル表示を削除
  - Docsビュー連携のための旧機能で、不要となったため削除

## [0.7.16] - 2025-12-27

### 修正
- **Terminal View**: Marketplaceからインストールした際にターミナルが表示されない問題を修正
  - xterm.jsライブラリファイルをGit追跡対象に追加（`.gitignore`で除外されていた）
  - `.gitignore`を更新して`media/xterm/*.js`ファイルがVSIXパッケージに含まれるように

## [0.7.15] - 2025-12-27

### 追加
- **Terminal View - セッション維持**: ビューや拡張機能を切り替えてもターミナルセッションと出力履歴が保持されるように
  - Terminal viewの設定に`retainContextWhenHidden: true`を追加
  - ビューが非表示になってもターミナル出力バッファ（xterm.js）が維持される
  - 他のビューや拡張機能にフォーカスを移動しても、ターミナル履歴が失われなくなりました

## [0.7.14] - 2025-12-27

### 追加
- **Terminal View - クリック可能リンク**: ターミナル内のURLとファイルパスがクリック可能に
  - URLをクリックするとデフォルトブラウザで開く
  - ファイルパス（例: `./src/file.ts:123`）をクリックするとエディタで開く
  - ファイルパスの行番号指定に対応
  - xterm-addon-web-linksを使用したURL検出
  - カスタムリンクプロバイダーによるファイルパス検出

## [0.7.13] - 2025-12-27

### 変更
- **Tasks View - 統合階層表示**: TasksビューとDocsビューを単一の階層ツリービューに統合
  - ディレクトリ内にサブディレクトリとファイルをツリー構造で表示
  - ファイルはデフォルトで各ディレクトリ内で作成日時の昇順でソート
  - 別々のDocsビューを削除 - すべてのコンテンツがTasksに統合
  - ドラッグ&ドロップ機能をTasksビューに移植
  - ビュー数を削減してシンプルなサイドバーを実現

### 削除
- **Docs View**: 別々のDocsビューを削除
  - すべてのファイル閲覧機能がTasksビューに統合
  - ファイル操作（作成、名前変更、削除、コピー）はTasksのコンテキストメニューから利用可能

## [0.7.9] - 2025-12-27

### 変更
- **Active Panels View - デフォルト表示状態**: デフォルトの表示状態を「表示」から「折りたたみ」に変更
  - Active Panelsビューはサイドバーを開いた時にデフォルトで折りたたまれた状態になります
  - 開いているTask Panelの一覧を確認したい場合にユーザーが展開できます
  - Task Panelを頻繁に使用しないユーザーのサイドバーの視覚的な煩雑さを軽減

## [0.7.8] - 2025-12-27

### 追加
- **Menu - Shortcut**: Shortcutセクションに「Duplicate Workspace in New Window」を追加
  - 現在のワークスペースを新しいVSCodeウィンドウで複製して開く
  - VSCodeのビルトインコマンド `workbench.action.duplicateWorkspaceInNewWindow` を使用

## [0.4.6] - 2025-11-09

### 追加
- **Markdown List - ソート順のカスタマイズ**: マークダウンファイルのソート方法をカスタマイズする設定を追加
  - 新しい設定 `aiCodingSidebar.markdownList.sortBy`: ソート基準を選択（name、created、modified）
  - 新しい設定 `aiCodingSidebar.markdownList.sortOrder`: ソート方向を選択（ascending、descending）
  - 設定変更は更新不要でリアルタイムに反映されます
- **Markdown List - ソート順の表示**: 現在のソート順がビュータイトルに表示されるように変更
  - ソート基準と方向を表示（例：「Markdown List (Created ↑)」）
  - 設定変更時に自動的に更新されます
  - 現在ファイルがどのようにソートされているかが一目で分かります

### 変更
- **Markdown List - デフォルトソート順**: デフォルトのファイルソート順を名前（昇順）から作成日時（昇順）に変更
  - ファイルはデフォルトで作成日時の昇順でソートされるようになりました
  - タイムスタンプ形式のファイル（例：`2025_1109_1230.md`）が自然な時系列順に表示されます
  - 以前の動作（名前順）は`aiCodingSidebar.markdownList.sortBy`を"name"に変更することで復元できます

## [0.4.5] - 2025-11-09

### 修正
- **Markdown Editorの状態維持**: 拡張機能がアクティブ/非アクティブになった際にMarkdown Editorがファイル状態を失う問題を修正
  - 以前は、拡張機能サイドバーが非アクティブから再びアクティブになると、Markdown Editorが空の状態になっていました
  - markdownEditorビューの設定に`retainContextWhenHidden: true`を追加し、非表示時もwebviewのコンテキストを保持するようにしました
  - `onDidChangeVisibility`リスナーを追加し、ビューが表示されたときにファイル内容を復元するようにしました
  - webview準備完了メッセージのハンドリングを追加し、webview初期化後のファイル復元を確実にしました
  - 現在は、拡張機能が再度アクティブになった際に、以前選択していたファイルが自動的に復元されます
  - 拡張機能のライフサイクル変更を通じてシームレスな編集体験を維持します

## [0.4.4] - 2025-11-09

### 変更
- **ビュータイトルの簡素化**: すべてのビュータイトルをよりシンプルに変更
  - Directory List: タイトルから相対パスを削除し、「Directory List」のみを表示
  - Markdown List: タイトルから相対パスを削除し、「Markdown List」のみを表示
  - すべてのビューで一貫性のあるシンプルなインターフェースを提供
- **Markdown List - ディレクトリヘッダー**: ファイルリストの上部にディレクトリ名の表示を追加
  - Directory Listルートからの相対パスとして現在のディレクトリパスを表示
  - Markdown Editorのファイル名表示と同様の一貫性を提供
  - タイトルを煩雑にせずに、どのディレクトリを閲覧しているかが明確になります
- **Markdown List - 編集中ファイルのインジケーター**: Markdown Editorで編集中のファイルに「editing」インジケーターを追加
  - Markdown Editor Viewで現在編集中のファイルには、説明に「editing」が表示されます
  - 手動で更新することなく、ファイル切り替え時に自動的に更新されます
  - サイドバーでアクティブに編集されているファイルを特定しやすくなります
- **Markdown Editor - タイトル表示**: ファイル名のみを表示するようにタイトルを簡素化
  - 以前はプロジェクトルートからの完全な相対パスを表示していました
  - 現在はより洗練されたUIのためにファイル名のみを表示します
- **Markdown Editor - フォルダ切り替え時の自動クリア**: Markdown Listでフォルダを切り替えた際にエディタがクリアされるように変更
  - 以前のフォルダのファイルを表示したままにすることで混乱を防ぎます
  - 異なるディレクトリに移動した際にエディタの状態を自動的にリセットします
- **Directory List - Add Directoryの動作**: 「Add Directory」コマンドが常にDirectory Listルートにディレクトリを作成するように変更
  - 以前はコンテキストメニューから呼び出された際に、選択されたディレクトリ配下にディレクトリを作成していました
  - 現在はコマンドの呼び出し方法に関わらず、常にDirectory Listのルートディレクトリにディレクトリを作成します
  - ディレクトリ作成の動作がより予測可能になります

## [0.4.3] - 2025-11-09

### 変更
- **Directory Listの自動選択**: 新規作成されたディレクトリがDirectory Listビューで自動的に選択されるように変更
  - "Add Directory"コマンドでディレクトリを作成すると、新しいディレクトリが即座に選択されます
  - ディレクトリ作成後の視覚的フィードバックとナビゲーションが改善されました
- **Markdownファイルアイコン**: Markdown Listビューのファイルが開き方に応じて異なるアイコンを表示するように変更
  - タイムスタンプ形式のファイル（形式：`YYYY_MMDD_HHMM.md`）でMarkdown Editor Viewで開かれるものはEditアイコンを表示
  - その他の通常のエディタで開かれるMarkdownファイルはMarkdownアイコンを表示
  - サイドバーで直接編集できるファイルと通常のエディタで開くファイルの違いがより明確になりました

## [0.3.6] - 2025-11-08

### 修正
- **Markdown Listの更新機能**: Markdown Listビューの更新ボタンがファイルリストを更新しない問題を修正
  - 更新コマンドがDirectory ListとMarkdown Listの両方のビューを正しく更新するように変更
  - Markdown Listビューで更新ボタンをクリックしても効果がなかった問題を解決
- **ファイルシステム変更の自動反映**: 初期ロード時にファイル監視が有効化されない問題を修正
  - ファイル監視リスナーをセットアップ時ではなく、プロバイダーのコンストラクタで登録するように変更
  - エクスプローラーやターミナルなどでファイル・ディレクトリを追加・削除した際に、ビューが自動的に更新されるようになりました
  - Directory ListとMarkdown Listの両方のビューが、拡張機能外部でのファイル変更を自動的に反映します
- **拡張機能コマンド実行後のビュー更新**: ファイル操作後のビュー更新動作を改善
  - Markdownファイル作成コマンドで、Directory ListとMarkdown Listの両方のビューを更新するように変更
  - 名前変更コマンドで、ディレクトリ構造の変更を反映するために両方のビューを更新するように変更

### 追加
- **新規ディレクトリでのMarkdownファイル自動作成**: Add Directoryコマンドでタイムスタンプ付きMarkdownファイルを自動作成
  - 新しいディレクトリを作成すると、その中に自動的にMarkdownファイルが作成されます
  - ファイルは自動的にエディタで開かれ、すぐに使用できます
  - AIコーディングタスクの整理をシームレスに行えるワークフローを提供

### 変更
- **デフォルト相対パス**: デフォルト値を空文字列から".ai/tasks"に変更
  - 新規インストール時に自動的に".ai/tasks"ディレクトリが開かれるようになりました
  - AIコーディングワークフローに適した初期設定を提供
- **コマンド名の更新**: 一貫性のため"Add Folder"を"Add Directory"に変更
- **タイムスタンプのロケール**: タイムスタンプ形式を日本語固定からシステムロケール使用に変更
  - Markdownファイル作成時に`toLocaleString()`を使用し、ユーザーのシステムロケール設定を尊重
  - 国際化対応を改善

## [0.3.0] - 2025-01-12

### 削除
- **ワークスペースエクスプローラービュー**: 冗長なワークスペースエクスプローラービューを削除し、拡張機能をシンプル化
  - `workspaceExplorer`ビュー定義を削除
  - このビューでのみ使用されていたcopy/cut/paste/searchInWorkspaceコマンドを削除
  - ワークスペースエクスプローラーに関連するすべてのメニュー項目とキーバインディングを削除
  - WorkspaceExplorerProviderクラスを削除（374行）
  - **コード削減**: 687行を削除
  - コア機能（Directory List、Markdown List、File Changes）は変更なし

## [0.2.6] - 2025-01-11

### 変更
- **エラーメッセージの英語化**: 残っていた日本語のエラーメッセージを英語に変更
  - ContextManagerの操作失敗メッセージ
  - DragDropHandlerのファイル操作エラーメッセージ
  - KeyboardShortcutHandlerの操作失敗メッセージ

## [0.2.5] - 2025-01-11

### 変更
- **UIの英語化**: すべてのユーザー向けメッセージを日本語から英語に変更
  - 情報メッセージ、エラーメッセージ、警告メッセージ
  - 入力プロンプト、クイックピック、確認ダイアログ
  - ツールチップ、ステータスバー、設定項目のラベルと説明
  - ビューのタイトル表示（Directory List, Markdown List, Explorer）

## [0.1.0] - 2025-01-11

### 追加
- **ワークスペースエクスプローラー**: プロジェクト全体をツリー形式で表示する新しいビュー
- **ファイルアイコン表示**: ファイル種別に応じた50種類以上のアイコンを自動表示
  - TypeScript、JavaScript、JSON、Markdown、CSS、HTML、画像ファイルなど主要な形式をサポート
  - `fileListExtension.showFileIcons`設定でアイコンの表示/非表示を切り替え可能
- **ソート機能**: 名前、種類、サイズ、更新日時でソート可能
  - `fileListExtension.sortBy`設定でソート基準を選択
  - `fileListExtension.sortOrder`設定で昇順/降順を選択
- **隠しファイル表示**: 隠しファイル・フォルダの表示/非表示を切り替え
  - `fileListExtension.showHidden`設定で制御
- **自動更新設定**: ファイルシステム変更時の自動更新を有効/無効化
  - `fileListExtension.autoRefresh`設定で制御
  - パフォーマンス最適化のため、大規模プロジェクトでは無効化可能
- **ファイル操作機能**:
  - ドラッグ&ドロップによるファイル・フォルダの移動
  - コピー、切り取り、貼り付け機能（Ctrl+C/X/V、Cmd+C/X/Vのキーボードショートカット対応）
  - 名前の変更（F2キー対応）
  - 削除機能（Deleteキー対応）
- **検索機能**: ワークスペース内のファイルを検索
- **Git変更ファイル**: 変更されたファイルを一覧表示し、差分を確認
  - ディレクトリ配下のファイルをグループ化して表示

### 改善
- **パフォーマンス最適化**: キャッシュ機能の実装
  - FileListProvider、FileDetailsProvider、WorkspaceExplorerProviderにキャッシュを追加
  - 不要なディレクトリ読み取りを削減
  - 大規模プロジェクトでのパフォーマンス向上
- **設定管理**: ConfigurationProviderサービスの実装
  - すべての設定を一元管理
  - 設定変更の監視機能
- **サービス指向アーキテクチャ**:
  - FileOperationService: ファイル操作を一元管理
  - SearchService: 検索機能を提供
  - DragDropHandler: ドラッグ&ドロップ処理を管理

### 変更
- **ドキュメント**: README.mdを大幅に更新
  - 機能をカテゴリ別に整理（表示機能、ファイル操作、カスタマイズ機能）
  - 詳細な設定セクションを追加
  - すべての設定項目の説明とデフォルト値を記載
  - 設定例のJSONコードを追加

### 修正
- ファイル名のソート時の`modifiedDate`プロパティの参照エラーを修正（`modified`に統一）

## [0.0.1] - 2024-09-27

### 追加
- 初回リリース
- **フォルダツリーペイン**: フォルダのみを表示し、階層構造をナビゲート
- **ファイル一覧ペイン**: 選択したフォルダ内のファイルとサブフォルダを表示
- **相対パス設定**: ワークスペースルートからの相対パスでデフォルトフォルダを指定
- **親フォルダへ移動**: ファイル一覧ペインから上位フォルダへ簡単移動
- **相対パスコピー**: ファイルを右クリックしてワークスペースからの相対パスをクリップボードにコピー
- **ファイル・フォルダ作成**: 新しいファイルやフォルダを簡単に作成
- **テンプレート機能**: `templates/file.md`でファイル作成時の初期内容をカスタマイズ
- **ワークスペース設定**: `.vscode/settings.json`を簡単に作成・編集
- **自動ビルド・リリース**: GitHub Actionsによる自動ビルドとリリース

[0.8.20]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.19...v0.8.20
[0.8.19]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.18...v0.8.19
[0.8.18]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.17...v0.8.18
[0.8.17]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.16...v0.8.17
[0.8.16]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.15...v0.8.16
[0.8.15]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.12...v0.8.15
[0.8.12]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.11...v0.8.12
[0.8.11]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.10...v0.8.11
[0.8.10]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.8...v0.8.10
[0.8.8]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.7...v0.8.8
[0.8.7]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.6...v0.8.7
[0.8.6]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.5...v0.8.6
[0.8.5]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.4...v0.8.5
[0.8.4]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.3...v0.8.4
[0.8.3]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.38...v0.8.0
[0.7.38]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.37...v0.7.38
[0.7.37]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.36...v0.7.37
[0.7.36]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.35...v0.7.36
[0.7.35]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.34...v0.7.35
[0.7.34]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.33...v0.7.34
[0.7.33]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.32...v0.7.33
[0.7.32]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.31...v0.7.32
[0.7.31]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.30...v0.7.31
[0.7.30]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.28...v0.7.30
[0.7.28]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.25...v0.7.28
[0.7.25]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.24...v0.7.25
[0.7.24]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.23...v0.7.24
[0.7.23]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.20...v0.7.23
[0.7.20]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.19...v0.7.20
[0.8.16]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.15...v0.8.16
[0.7.19]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.18...v0.7.19
[0.7.18]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.17...v0.7.18
[0.7.17]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.16...v0.7.17
[0.7.16]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.15...v0.7.16
[0.7.15]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.14...v0.7.15
[0.7.14]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.13...v0.7.14
[0.7.13]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.11...v0.7.13
[0.7.9]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.8...v0.7.9
[0.7.8]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.7.6...v0.7.8
[0.3.6]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.2.6...v0.3.0
[0.2.6]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.1.0...v0.2.5
[0.1.0]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/releases/tag/v0.0.1
[0.8.24]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.23...v0.8.24
[0.8.23]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.22...v0.8.23
[0.8.21]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.20...v0.8.21
[0.8.25]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.24...v0.8.25
[0.8.31]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.30...v0.8.31
[0.8.32]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.31...v0.8.32
[0.8.33]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.32...v0.8.33
[0.8.42]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.33...v0.8.42
[0.8.43]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.42...v0.8.43
[0.8.44]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.43...v0.8.44
[0.8.45]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.44...v0.8.45
[0.9.0]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.8.45...v0.9.0
[0.9.1]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.9.0...v0.9.1
[0.9.2]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.9.1...v0.9.2
[0.9.3]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.9.2...v0.9.3
[0.9.4]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.9.3...v0.9.4
[0.9.5]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.9.4...v0.9.5
[0.9.6]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.9.5...v0.9.6
[0.9.7]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.9.6...v0.9.7
[0.9.8]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.9.7...v0.9.8
[0.9.9]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.9.8...v0.9.9
[0.9.10]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.9.9...v0.9.10
[0.9.11]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.9.10...v0.9.11
[0.9.12]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.9.11...v0.9.12
[0.9.13]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.9.12...v0.9.13
[0.9.14]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.9.13...v0.9.14
[1.0.0]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v0.9.14...v1.0.0
[1.0.1]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v1.0.0...v1.0.1
[1.0.2]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v1.0.1...v1.0.2
[1.0.3]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v1.0.2...v1.0.3
[1.0.4]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v1.0.3...v1.0.4
[1.0.5]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v1.0.4...v1.0.5
[1.0.12]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v1.0.11...v1.0.12
[1.0.11]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v1.0.10...v1.0.11
[1.0.10]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v1.0.9...v1.0.10
[1.0.9]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v1.0.7...v1.0.8
[1.0.7]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v1.0.5...v1.0.6
[1.0.13]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/v1.0.12...v1.0.13
