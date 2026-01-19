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
├── extension.ts          # activate関数、コマンド登録（~1,377行）
├── providers/            # UIコンポーネント
│   ├── PlansProvider.ts  # Plansビュー（フラットリスト、Drag&Drop）
│   ├── EditorProvider.ts # Markdown EditorのWebView
│   ├── TerminalProvider.ts # xterm.jsターミナルのWebView（スクロール位置自動追従、Claude Code自動検知、セッション再接続機能付き）
│   ├── MenuProvider.ts   # 設定メニュー
│   └── items/            # TreeItem定義
│       ├── FileItem.ts   # ファイル/ディレクトリ項目
│       └── MenuItem.ts   # メニュー項目
├── utils/                # ユーティリティ
│   ├── fileUtils.ts      # FileInfo, formatFileSize, getFileList, copyDirectory
│   ├── templateUtils.ts  # loadTemplate
│   └── workspaceSetup.ts # setupSettingsJson, setupTemplate, setupClaudeFolder
├── services/             # ビジネスロジック
│   ├── TerminalService.ts    # PTYセッション管理（node-pty、セッション終了検知、リサイズ最適化、環境変数の安全化）
│   ├── FileWatcherService.ts # ファイル変更監視
│   └── ...               # その他サービス
├── interfaces/           # サービスインターフェース定義
│   └── ITerminalService.ts   # ターミナルサービスのインターフェース（onSessionExit、getUnavailableReason等）
└── types/                # 共通型定義
```

### Provider間の依存関係

循環参照を避けるため、インターフェースベースの依存性注入を使用：

- `IEditorProvider`: EditorProviderが実装、PlansProviderが参照
- `ITerminalProvider`: TerminalProviderが実装、EditorProviderが参照

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
