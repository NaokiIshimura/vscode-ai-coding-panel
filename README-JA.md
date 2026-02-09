# AI Coding Panel for Claude Code

Claude Codeでの生産性を最大化するために設計された、強力なVS Codeパネル拡張機能。

プロンプトファイルの管理、AIコマンドの実行、結果の確認を1つの統合パネルで完結。ファイルエクスプローラー、エディタ、ターミナル間のコンテキスト切り替えが不要になります。

![Screenshot](images/screenshot.png)

## Claude Codeでこの拡張機能を使う理由

この拡張機能は、Claude Code体験を強化するために設計されています：

- **シームレスなターミナル統合**: プロセスベースの監視（プロンプトパターンに依存しない）によるClaude Codeセッションの自動検知
- **スマートなコンテキスト管理**: タブ切り替え時に、Terminal、Editor、Plansビュー間でファイルコンテキストを自動同期
- **インテリジェントなコマンドショートカット**: Claude Codeの実行状態（実行中/アイドル）に応じて適応するコンテキスト対応ボタン
- **動的タブ名**: iTerm2のように実行中プロセスを表示し、コマンド種別アイコン（▶️ Run、📝 Plan、📑 Spec）付き
- **永続的セッション**: ビュー切り替え時もターミナルセッションが維持され、コンテキストや履歴が失われない

## 機能

| 機能 | 説明 |
| --- | --- |
| **Plans** | フラットリストでプロンプトファイルを閲覧・管理、ディレクトリナビゲーション対応 |
| **Editor** | Run/Plan/Specボタンを備えたClaude Code実行のコマンドセンター |
| **Terminal** | Claude Code最適化済み：自動検知、コンテキスト対応ショートカット、永続的セッション |
| **Menu** | 設定や共通操作へのクイックアクセス |

## 機能詳細

### Plans

指定したディレクトリ配下のフォルダとファイルをフラットリストで表示。

| 機能 | 説明 |
| --- | --- |
| フラットリスト表示 | 現在のディレクトリの内容のみを表示（ツリー構造ではない） |
| ディレクトリナビゲーション | ディレクトリをクリックでそのディレクトリに移動。".."で親ディレクトリに戻る |
| 自動ファイル選択 | ディレクトリに移動した際に、最も古いTASK.md、PROMPT.md、SPEC.mdファイルを自動的に選択して表示 |
| **初期プロンプト付きディレクトリ作成** | 「Create directory」ボタンで`.claude/plans`ディレクトリと初期プロンプトファイル（`YYYY_MMDD_HHMM_SS_PROMPT.md`）を自動作成。Run/Plan/Specボタンの使い方を説明するテンプレート付き。ファイルは自動的にEditor Viewで開かれる |
| パス表示 | 現在のパスをリストの先頭アイテムとして表示（New PROMPT.md、New TASK.md、New SPEC.md、Copy、Rename、New Directory、Archiveボタン付き） |
| **日付/時間プレフィックス** | ルートディレクトリのディレクトリ名の前に日付または時間を表示: 当日は`[HH:MM]`、当日以外は`[MM/DD]`（ファイルはプレフィックスなし） |
| **Editor対象ファイルアイコン** | Editor Viewで開くファイル（TASK.md、PROMPT.md、SPEC.md）は`edit`アイコンで表示し、通常のMarkdownファイルと区別 |
| ソート | ファイルはデフォルトで作成日時の昇順でソート |
| ドラッグ&ドロップ | ビュー内または外部からのファイルをドラッグしてコピー |
| 自動更新 | ファイルが作成、変更、削除されたときに自動的に更新 |
| 設定アイコン | デフォルトパスとソート設定へのクイックアクセス |

### Editor (Claude Codeコマンドセンター)

Markdownプロンプトファイルを編集し、パネルから直接Claude Codeコマンドを実行。

| 機能 | 説明 |
| --- | --- |
| **Run/Plan/Specコマンド** | 事前設定されたコマンドでClaude Codeを実行：<br>- **Run** (`Cmd+R` / `Ctrl+R`): `claude "Review the file at ${filePath}"`<br>- **Plan**: `claude --permission-mode plan "Review ... create an implementation plan ..."`<br>- **Spec**: `claude --permission-mode plan "Review ... create specification documents ..."`<br>実行前に自動保存、ファイル未開でも実行可能 |
| **自動ターミナル統合** | コマンドはTerminalビューに送信され、シームレスなワークフローのためにファイル-タブの自動関連付けが行われる |
| 自動表示 | タイムスタンプ形式のMarkdownファイル（形式: `YYYY_MMDD_HHMM_SS_PROMPT.md`）を選択すると自動的に表示。その他のMarkdownファイルは通常のエディタで開く |
| Saveボタン | ヘッダーに表示され、未保存の変更がある場合は色が変わる。ファイル未開時は現在のPlansディレクトリに新規作成 |
| 新規ファイルボタン | ヘッダーからPROMPT.md、TASK.md、SPEC.mdファイルを作成。PROMPT.mdは`Cmd+M` / `Ctrl+M`でも作成可能 |
| カスタマイズ可能なコマンド | ワークフローに合わせてRun、Plan、Specコマンドを設定で変更可能 |
| 読み取り専用モード | VSCodeエディタでファイルがアクティブになると自動的に読み取り専用モードに切り替わる |
| 自動保存 | ファイル切替、ディレクトリ移動、ビューを閉じる際に自動保存 |
| 編集ファイル復元 | 別の拡張機能から戻ってきたときに編集中のファイルを復元 |
| 設定アイコン | コマンド設定へのクイックアクセス |
| フォーカスインジケーター | フォーカス時にビューの周囲に枠線を表示 |

### Terminal (Claude Code最適化済み)

Claude Code向けに設計された、インテリジェントな自動化とコンテキスト認識を備えた埋め込みターミナル。

| 機能 | 説明 |
| --- | --- |
| **Claude Code自動検知** | プロセスベースの検知（1.5秒ごとにチェック）により、プロンプト変更に影響されずClaude Codeセッションを確実に識別。Claude Codeの起動・終了時にUIとショートカットを自動切り替え |
| **コンテキスト対応ショートカット** | 状態に応じて変化するスマートボタン：<br>- 未起動時: `claude`, `claude -c`, `claude -r`, `claude update`<br>- 起動中: `/model sonnet`, `/model opus`, `/compact`, `/clear`<br>Claude Codeセッション中に素早いモデル切り替えと共通コマンドが実行可能 |
| **コマンド種別アイコン** | タブ名にコマンド種別を示すアイコンを表示：<br>▶️ Runボタン<br>📝 Planボタン<br>📑 Specボタン |
| **動的プロセス名** | iTerm2のように、タブ名が現在実行中のプロセスを自動的に表示 |
| **タブ-ファイル関連付け** | Editor viewからのコマンドはファイルをターミナルタブにリンク。タブ切り替え時に自動的に：<br>- 関連付けられたファイルをEditor viewで開く<br>- Plans viewをそのファイルのディレクトリに移動 |
| **セッション永続化** | ビュー切り替えや拡張機能の切り替え後もターミナルセッションと出力履歴が維持され、作業が失われない |
| 複数タブ | 最大5つの独立したターミナルタブを作成可能。「+」ボタンで新規タブ追加、タブクリックで切り替え。閉じるボタン（× Close）はショートカット領域の右端に配置 |
| 自動スクロール | 新しい出力が追加されたとき、またはビューのサイズが変更されたときに、最下部のスクロール位置を維持（最下部にいる場合のみ） |
| クリック可能リンク | URLはブラウザで開き、ファイルパス（例: `./src/file.ts:123`）はエディタで行番号指定して開く |
| Unicode対応 | CJK文字を適切な幅計算で完全サポート |
| 設定可能 | シェルパス、フォントサイズ、フォントファミリー、カーソルスタイル、カーソル点滅、スクロールバック行数をカスタマイズ可能 |
| WebViewヘッダー | タブバーにシェル名とショートカットボタンを表示、アクティブタブ用のClear、Killボタン |
| 設定アイコン | タイトルバーからターミナル設定へのクイックアクセス |
| デフォルト表示 | 折りたたみ（必要に応じて展開） |
| フォーカスインジケーター | フォーカス時にビューの周囲に枠線を表示 |

### Menu

設定や共通操作へのクイックアクセス。

| 機能 | 説明 |
| --- | --- |
| 設定 | ユーザ設定、グローバル設定を開く |
| テンプレート | テンプレートをカスタマイズ |
| ショートカット | ターミナルを開く、デフォルトブランチへ切り替え、Git pull、新しいウィンドウでワークスペースを複製 |

## 典型的なClaude Codeワークフロー

### 1. タスクの作成
1. Plansタイトルメニューのロケットアイコン🚀をクリックして新しいタスクディレクトリを作成
2. タイムスタンプ付きのTASK.mdファイルがEditorビューで開く
3. タスクの説明や要件を記述

### 2. Claude Codeで実行
1. `Cmd+R` / `Ctrl+R`を押してClaude Codeでタスクを実行
2. Terminalビューが自動的にアクティブになり、コマンドを送信
3. Claude Codeがリクエストの処理を開始

### 3. 進捗の監視
1. TerminalビューでClaude Codeの出力を監視
2. タブ名にプロセスステータスとアイコン（▶️、📝、📑）が表示される
3. ビューを切り替えてもスクロール位置が保持される

### 4. 結果の確認
1. Claude Codeが実装計画や仕様書ドキュメントを作成
2. ファイルがPlansビューに自動的に表示される
3. ファイルをクリックしてEditorビューで確認
4. ターミナルタブはタスクファイルとの関連付けを維持

### 5. 反復
1. 複数のタスクを処理するために、ターミナルタブを切り替え
2. 各タブは関連付けられたファイルとコンテキストを記憶
3. タブを切り替えるとPlans/Editorビューが自動同期

## 使用方法

### キーボードショートカット

| ショートカット | 動作 |
| --- | --- |
| `Cmd+Shift+A` (macOS)<br>`Ctrl+Shift+A` (Windows/Linux) | AI Coding Panelにフォーカス |
| `Cmd+S` (macOS)<br>`Ctrl+S` (Windows/Linux) | 新規タスク（パネルにフォーカス時） |
| `Cmd+M` (macOS)<br>`Ctrl+M` (Windows/Linux) | Markdownファイルを新規作成（パネルにフォーカス時） |
| `Cmd+R` (macOS)<br>`Ctrl+R` (Windows/Linux) | Editorでタスクを実行（自動保存してターミナルにコマンドを送信） |

### 基本操作
1. アクティビティバーの「AI Coding Panel」アイコンをクリック（または`Cmd+Shift+A` / `Ctrl+Shift+A`を押す）
2. Plansのロケットアイコン🚀をクリックして、TASK.mdファイル付きの新しいタスクディレクトリを作成
3. Editorビューでタスクの説明や要件を記述
4. `Cmd+R` / `Ctrl+R`を押してClaude Codeでタスクを実行
5. TerminalビューでClaude Codeの進捗を監視
6. Claude Codeがファイルを作成したら、PlansとEditorビューで結果を確認

## テンプレート機能

Plansでファイルを作成する際、テンプレートを使用して初期内容を自動設定できます。
AIコーディングで使用するmarkdownファイルの構造を統一し、作業効率を向上させます。

### テンプレートの設定方法
1. Plansペインの歯車アイコンをクリック
2. 「ワークスペース設定」->「テンプレートをカスタマイズ」を選択
3. `.vscode/ai-coding-panel/templates/` にテンプレートファイルが作成されます:
   - `task.md` - Start Task用テンプレート
   - `spec.md` - New Spec用テンプレート
   - `prompt.md` - New File (PROMPT.md)用テンプレート
4. テンプレートを編集して保存

### デフォルトテンプレート
初回作成時には以下のテンプレートが設定されます：

```markdown
file: {{filename}}
created: {{datetime}}

---

# task

```

### 使用可能な変数
テンプレート内で以下の変数が使用できます：

- `{{datetime}}`: 作成日時（例: 2025/11/3 12:27:13）
- `{{filename}}`: ファイル名（拡張子を含む、例: 2025_1229_1430_25_PROMPT.md）
- `{{timestamp}}`: タイムスタンプ（例: 2025_1229_1430_25）
- `{{filepath}}`: ワークスペースルートからのファイルパス（例: .claude/plans/2025_1229_1430_25_PROMPT.md）
- `{{dirpath}}`: ワークスペースルートからのディレクトリパス（例: .claude/plans）

### テンプレートの優先順位
1. `.vscode/ai-coding-panel/templates/` のワークスペーステンプレート（存在する場合）
2. 拡張機能内のデフォルトテンプレート

### テンプレートの活用例
- AIへの指示内容を記録するための「overview」セクション
- 実施すべき作業を列挙する「tasks」セクション
- プロジェクト固有の情報を追加するカスタムセクション

## ファイル操作

| 機能 | 説明 |
| --- | --- |
| ファイル・フォルダ作成 | 新しいファイルやフォルダを簡単に作成 |
| 名前の変更 | ファイル・フォルダの名前を変更。ディレクトリのリネーム後は自動的にリネーム後のディレクトリを表示 |
| 削除 | ファイル・フォルダを削除（ゴミ箱に移動） |
| コピー・切り取り・貼り付け | 標準的なファイル操作をサポート |
| ドラッグ&ドロップ | Plansビュー内または外部からファイルをドラッグしてコピー。コピー成功時にメッセージを表示 |
| アーカイブ | タスクディレクトリをアーカイブしてワークスペースを整理。ディレクトリ行のアーカイブアイコン（インラインボタン）をクリックするか、右クリックして「Archive」を選択すると、`archived`フォルダに移動されます。ルートディレクトリ以外のディレクトリ内にいる場合は、パス表示ヘッダーにもアーカイブボタンが表示され、クリックすると現在のディレクトリをアーカイブしてルートに戻ります。同名のディレクトリが既に存在する場合は、競合を避けるために自動的にタイムスタンプが追加されます。 |
| ブランチチェックアウト | ディレクトリを右クリックして、ディレクトリ名をそのままブランチ名としてgitブランチをチェックアウト。ブランチが存在しない場合は作成し、既に存在する場合は切り替え |
| Editorにパスを挿入 | Editorビューに相対パスを挿入。ファイル行のeditアイコンをクリック、または右クリックして「Insert Path to Editor」を選択。複数選択に対応 |
| Terminalにパスを挿入 | Terminalビューに相対パスを挿入。ファイル行のterminalアイコンをクリック、または右クリックして「Insert Path to Terminal」を選択。複数選択に対応。パスはスペースで区切られます |

## その他の機能

### ファイル・フォルダの作成

| 項目 | 手順 |
| --- | --- |
| New Task | Plansのタイトルメニューにあるロケットアイコンをクリック<br>Plans Viewで現在開いているディレクトリ配下に新しいディレクトリを作成し、タイムスタンプ付きのMarkdownファイルを自動生成します<br>作成されたファイルはPlansで「editing」ラベルとともに選択され、Editor Viewで開かれます<br>現在のパスが取得できない場合は、デフォルトパス配下に作成されます |
| 新規ディレクトリ | パス表示行のフォルダアイコンをクリック<br>現在開いているディレクトリ配下に新しいディレクトリを作成します（Markdownファイルは作成しない） |
| PROMPT.md作成 | パス表示行またはEditorヘッダーのファイルアイコンをクリック<br>タイムスタンプ付きのMarkdownファイルが作成され、Editor Viewで開かれます（例: `2025_1229_1430_25_PROMPT.md`） |
| TASK.md作成 | パス表示行またはEditorヘッダーのTASK.mdアイコンをクリック<br>タイムスタンプ付きのTASK.mdファイルが作成され、Editor Viewで開かれます |
| SPEC.md作成 | パス表示行またはEditorヘッダーのSPEC.mdアイコンをクリック<br>タイムスタンプ付きのSPEC.mdファイルが作成され、Editor Viewで開かれます |

### 相対パスの設定

| 方法 | 手順 |
| --- | --- |
| Plans設定から（推奨） | 1. Plansの歯車アイコンをクリック<br>2. 設定画面が開き、`aiCodingSidebar.plans.defaultRelativePath`がフィルタ表示される<br>3. デフォルトの相対パスを編集（例: `src`, `.claude/plans`, `docs/api`） |
| ワークスペース設定 | 1. Plansの歯車アイコンをクリック<br>2. 「ワークスペース設定」を選択<br>3. 設定したい項目を選択：<br>&nbsp;&nbsp;- **settings.jsonを作成/編集**: ワークスペース設定ファイルを自動作成<br>&nbsp;&nbsp;- **.claude/plansフォルダを設定**: .claude/plansフォルダを作成し設定を適用<br>&nbsp;&nbsp;- **テンプレートをカスタマイズ**: ファイル作成時のテンプレートを編集 |
| 拡張機能から設定 | 1. Plansの編集アイコンをクリック<br>2. 相対パスを入力（例: `src`, `.claude/plans`, `docs/api`）<br>3. 設定に保存するか選択 |

#### 相対パスの例
- `src` -> プロジェクト/src
- `docs/api` -> プロジェクト/docs/api
- `.claude/plans` -> プロジェクト/.claude/plans
- 空文字 -> プロジェクトルート

#### 設定したパスが存在しない場合
デフォルトの相対パスが存在しない場合、Plansに「ディレクトリを作成」ボタンが表示されます。ボタンをクリックすると、自動的にディレクトリが作成され、その内容が表示されます。

### その他

| 機能 | 説明 |
| --- | --- |
| 相対パスコピー | ワークスペースからの相対パスをクリップボードにコピー |
| Plans設定 | Plansから設定画面を開き、デフォルトの相対パスを直接編集 |
| 検索機能 | ワークスペース内のファイルを検索 |

## 設定

| 設定項目 | 説明 | 型 | デフォルト値 | 選択肢/例 |
| --- | --- | --- | --- | --- |
| `plans.defaultRelativePath` | Plansのデフォルト相対パス | string | `".claude/plans"` | `"src"`, `".claude/plans"`, `"docs/api"` |
| `plans.sortBy` | Plansのファイル・ディレクトリのソート基準 | string | `"created"` | `"name"`: ファイル名<br>`"created"`: 作成日時<br>`"modified"`: 更新日時 |
| `plans.sortOrder` | Plansのファイル・ディレクトリのソート順序 | string | `"ascending"` | `"ascending"`: 昇順<br>`"descending"`: 降順 |
| `editor.runCommand` | Editorビューのrunボタンで実行されるコマンドテンプレート | string | `claude "Review the file at ${filePath}"` | `${filePath}`をファイルパスのプレースホルダーとして使用 |
| `editor.runCommandWithoutFile` | ファイル未開時にrunボタンで実行されるコマンドテンプレート | string | `claude "${editorContent}"` | `${editorContent}`をエディタ内容のプレースホルダーとして使用 |
| `editor.planCommand` | Planボタンで実行されるコマンドテンプレート | string | `claude --permission-mode plan "Review the file at ${filePath} and create an implementation plan. Save it as a timestamped file (format: YYYY_MMDD_HHMM_SS_plan.md) in the same directory as ${filePath}."` | `${filePath}`をファイルパスのプレースホルダーとして使用 |
| `editor.specCommand` | Specボタンで実行されるコマンドテンプレート | string | `claude --permission-mode plan "Review the file at ${filePath} and create specification documents. Save them as timestamped files (format: YYYY_MMDD_HHMM_SS_requirements.md, YYYY_MMDD_HHMM_SS_design.md, YYYY_MMDD_HHMM_SS_plans.md) in the same directory as ${filePath}."` | `${filePath}`をファイルパスのプレースホルダーとして使用 |
| `terminal.shell` | Terminalビューのシェル実行パス | string | `""` | 空欄の場合はシステムのデフォルトシェルを使用 |
| `terminal.fontSize` | Terminalビューのフォントサイズ | number | `12` | 任意の正の数値 |
| `terminal.fontFamily` | Terminalビューのフォントファミリー | string | `"monospace"` | 任意の有効なフォントファミリー |
| `terminal.cursorStyle` | Terminalビューのカーソルスタイル | string | `"block"` | `"block"`, `"underline"`, `"bar"` |
| `terminal.cursorBlink` | Terminalビューのカーソル点滅を有効化 | boolean | `true` | `true`または`false` |
| `terminal.scrollback` | Terminalビューのスクロールバック行数 | number | `1000` | 任意の正の数値 |

### 設定例

`.vscode/settings.json`に以下のように記述できます:

```json
{
  "aiCodingSidebar.plans.defaultRelativePath": ".claude/plans",
  "aiCodingSidebar.plans.sortBy": "created",
  "aiCodingSidebar.plans.sortOrder": "ascending",
  "aiCodingSidebar.editor.commandPrefix": "claude --model opus",
  "aiCodingSidebar.editor.runCommand": "${commandPrefix} \"Review the file at ${filePath}\"",
  "aiCodingSidebar.editor.runCommandWithoutFile": "${commandPrefix} \"${editorContent}\"",
  "aiCodingSidebar.editor.planCommand": "${commandPrefix} \"Review the file at ${filePath} and create an implementation plan. Save it as a timestamped file (format: YYYY_MMDD_HHMM_SS_plan.md) in the same directory as ${filePath}.\"",
  "aiCodingSidebar.editor.specCommand": "${commandPrefix} \"Review the file at ${filePath} and create specification documents. Save them as timestamped files (format: YYYY_MMDD_HHMM_SS_requirements.md, YYYY_MMDD_HHMM_SS_design.md, YYYY_MMDD_HHMM_SS_tasks.md) in the same directory as ${filePath}.\"",
  "aiCodingSidebar.terminal.fontSize": 12,
  "aiCodingSidebar.terminal.cursorStyle": "block"
}
```

## 開発・ビルド

```bash
# 依存関係のインストール
npm install

# TypeScriptのコンパイル
npm run compile

# 開発時の自動コンパイル
npm run watch
```

## デバッグ方法

### 準備
1. 依存関係をインストール: `npm install`
2. TypeScriptをコンパイル: `npm run compile`

### デバッグの開始

#### コマンドパレットから起動（推奨）
1. `Ctrl+Shift+P` (Windows/Linux) または `Cmd+Shift+P` (Mac) でコマンドパレットを開く
2. 「Debug: Start Debugging」と入力して選択
3. Enterキーを押して実行

#### その他の起動方法
- **F5キー**: デバッグを即座に開始
- **デバッグパネル**: サイドバーの実行とデバッグアイコン -> 「Run Extension」を選択 -> 緑の再生ボタンをクリック
- **メニューバー**: 「実行」->「デバッグの開始」を選択

### デバッグ中の操作
- 新しいVSCodeウィンドウ（Extension Development Host）が開く
- アクティビティバーに「AI Coding Panel」アイコンが表示される
- ブレークポイントの設定、変数の検査、ステップ実行が可能
- `Ctrl+R` / `Cmd+R` で拡張機能をリロード

## インストール

### Claude Codeクイックスタート

1. [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=nacn.ai-coding-sidebar)からこの拡張機能をインストール
2. [Claude Code CLI](https://docs.anthropic.com/claude/docs/claude-code)をインストール
3. `Cmd+Shift+A` / `Ctrl+Shift+A`を押してAI Coding Panelを開く
4. Plansビューからタスクを作成（ロケットアイコン🚀をクリック）
5. `Cmd+R` / `Ctrl+R`を押してClaude Codeを起動

### 方法1: 開発モード（テスト用）
1. このプロジェクトをクローンまたはダウンロード
2. VSCodeで開く
3. `F5`キーを押して拡張機能開発ホストを起動
4. 新しいVSCodeウィンドウで拡張機能をテスト

### 方法2: VSIXパッケージからインストール

#### GitHub Releasesから最新版を使用する場合（推奨）:
1. [GitHubのReleasesページ](https://github.com/NaokiIshimura/vscode-panel/releases)から最新のVSIXファイルをダウンロード
2. コマンドラインからインストール:
   ```bash
   code --install-extension ai-coding-sidebar-1.0.10.vsix
   ```
3. VS Codeを再起動

#### ローカルビルド版を使用する場合:
```bash
# releasesディレクトリから直接インストール
code --install-extension releases/ai-coding-sidebar-1.0.10.vsix
```

#### 自分でパッケージを作成する場合:
1. VSCEツールをインストール:
   ```bash
   npm install -g @vscode/vsce
   ```
2. VSIXパッケージを作成:
   ```bash
   npm run package
   ```
3. 生成されたVSIXファイルをインストール:
   ```bash
   code --install-extension releases/ai-coding-sidebar-1.0.10.vsix
   ```
4. VS Codeを再起動

## 自動ビルド・リリース

このプロジェクトではGitHub Actionsを使用した自動ビルドとリリースを行っています。

### 自動ビルドの仕組み
- **トリガー**: masterブランチへのプッシュ時
- **ビルドプロセス**:
  1. TypeScriptコンパイル
  2. VSIXパッケージの自動作成
  3. GitHub Releasesへの自動アップロード
  4. リポジトリ内 `releases/` ディレクトリの更新

### バージョン管理
package.jsonのversionフィールドに基づいてリリースタグが作成されます。

```bash
# バージョンアップのスクリプト
npm run version:patch   # 0.0.1 -> 0.0.2
npm run version:minor   # 0.0.1 -> 0.1.0
npm run version:major   # 0.0.1 -> 1.0.0
```

## アンインストール

### コマンドラインから
```bash
code --uninstall-extension ai-coding-sidebar
```

### VSCode内から
1. 拡張機能サイドバーを開く（`Ctrl+Shift+X` / `Cmd+Shift+X`）
2. インストール済みの拡張機能から「AI Coding Panel」を検索
3. アンインストールボタンをクリック

## 要件

- VSCode 1.74.0 以上
- Node.js (開発時のみ)

## 互換性に関する注記

この拡張機能はClaude Code向けに最適化されていますが、CursorやGitHub Copilotなどの他のAIコーディングアシスタントでも動作します。ただし、一部の機能（Claude Code自動検知やコンテキスト対応ショートカットなど）は、Claude Code専用に設計されており、他のツールでは機能しない場合があります。
