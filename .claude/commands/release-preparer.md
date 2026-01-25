---
description: リリース準備を実行する（ブランチ作成、README/CHANGELOG更新、コミット、PR作成）
---

リリース準備を開始します。

実行前に `npm run compile` と `npm run package` が成功することを確認してください。

## 注意事項

- コミットメッセージは英語で記述してください
- PRのタイトルは英語で記述してください
- PRのdescriptionは英語で記述してください
- ファイル末尾には必ず空行を含めてください

---

# リリース準備手順

## 1. 事前確認

```bash
# 現在のブランチを確認
git branch --show-current

# package.jsonからバージョンを取得
cat package.json | grep '"version"'

# 未コミットの変更を確認
git status
```

## 2. デバッグコードのクリーンアップ

リリース前に、デバッグ目的で追加したコードを削除します。

### 削除対象

- **console.log/console.error等のデバッグログ**
  - 本番環境では不要なログ出力
  - ただし、エラーハンドリングに必要な`console.error`は残す

- **デバッグ用のコメント**
  - `// TODO: debug`, `// FIXME: test`などの一時的なコメント
  - コードの動作確認用のコメントアウト

- **テスト用の一時的なコード**
  - 動作検証のために追加した仮実装
  - 未使用のインポート文

### 検索コマンド

```bash
# console.logを検索（src配下）
grep -rn "console.log" src/

# console.debugを検索
grep -rn "console.debug" src/

# デバッグコメントを検索
grep -rn "// TODO.*debug\|// FIXME.*test\|// DEBUG" src/

# コメントアウトされたコードブロックを検索（目視確認推奨）
grep -rn "^[[:space:]]*//.*(" src/
```

### 削除時の注意事項

**残すべきログ**：
- `console.error`: エラーハンドリングに必要
- `console.warn`: 重要な警告メッセージ
- 初期化時のバージョン情報など、本番環境でも必要なログ

**削除すべきログ**：
- `console.log`: デバッグ用の一時的なログ
- `console.debug`: デバッグ専用のログ
- 処理の途中経過を記録するだけのログ

### 実施手順

1. 上記の検索コマンドで対象を特定
2. 各ファイルを確認し、デバッグコードを削除
3. `npm run compile`でコンパイルエラーがないことを確認
4. `npm run package`でパッケージが正常に作成されることを確認

### 実施例

バージョン固有のクリーンアップドキュメントがある場合は参照：
- v0.9.10: `.claude/plans/v0.9.10/2026_0125_1230_00_cleanup_debug_logs.md`

## 3. バージョン更新

```bash
# パッチバージョンを上げる
npm run version:patch
```

## 4. ブランチ作成

- ブランチ名: `v{バージョン}` （例: `v0.7.28`）
- mainブランチから作成

```bash
git checkout main
git pull origin main
git checkout -b v{バージョン}
```

## 5. CLAUDE.md & README更新

**注意**: 手順5と手順6（CHANGELOG更新）は並行して実行できます。

対象ファイル：
- `CLAUDE.md`（プロジェクトドキュメント）
- `README.md`（英語版）
- `README-JA.md`（日本語版）

### CLAUDE.md更新ルール

**更新内容**：
- 新機能・変更に伴うアーキテクチャの更新
- ファイル構成の変更を反映
- 開発コマンドの追加・変更
- デバッグ方法の更新
- 重要な注意事項の追加

**言語**：
- 日本語で記述（コードベースへのチェックイン用プロジェクト説明）

### README更新ルール

**構造**（以下の順序を維持）：
1. タイトルと概要
2. Features（テーブル形式）
3. Usage（Keyboard Shortcuts含む）
4. Template Feature
5. File Operations
6. Other Features
7. Settings（テーブル形式）
8. Development & Build
9. Debugging
10. Installation
11. Automated Build & Release
12. Uninstall
13. Requirements

**更新内容**：
- 新機能・変更をFeaturesセクションに反映
- 設定変更をSettingsセクションに反映
- キーボードショートカット追加をUsageセクションに反映
- VSIXバージョン番号を更新（例: `ai-coding-sidebar-0.7.28.vsix`）

**言語**：
- README.md: 英語で記述
- README-JA.md: 日本語で記述
- 英語版と日本語版の内容を同期させる

## 6. CHANGELOG更新

対象ファイル：
- `CHANGELOG.md`（英語版）
- `CHANGELOG-JA.md`（日本語版）

### CHANGELOG更新ルール

**フォーマット**：Keep a Changelog形式に準拠

**セクションの種類**：
- **Added**: 新機能
- **Changed**: 既存機能の変更
- **Deprecated**: 将来削除予定の機能
- **Removed**: 削除された機能
- **Fixed**: バグ修正
- **Security**: セキュリティ関連の修正
- **Improved**: パフォーマンス改善など
- **Technical**: 内部的な技術変更

**エントリのフォーマット**：
```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- **機能名**: 説明
  - 詳細項目1
  - 詳細項目2

### Changed
- **機能名**: 変更内容の説明
```

**記述ルール**：
- 各エントリは「- **機能名**:」で始める
- 説明は簡潔に（1-2文）
- 日付は日本時間（JST）を使用（YYYY-MM-DD形式）

**バージョンリンク**（ファイル末尾に追加）：
```markdown
[X.Y.Z]: https://github.com/NaokiIshimura/vscode-ai-coding-sidebar/compare/vX.Y.W...vX.Y.Z
```

**言語**：
- CHANGELOG.md: 英語で記述
- CHANGELOG-JA.md: 日本語で記述
- 英語版と日本語版の内容を同期させる

## 7. Git Commit

```bash
# 変更をステージング（.claude, .vscodeは除外）
git add package.json package-lock.json CLAUDE.md README.md README-JA.md CHANGELOG.md CHANGELOG-JA.md

# コミット（英語メッセージ）
git commit -m "Release v{バージョン}: Update documentation"
```

## 8. Push

```bash
git push origin v{バージョン}
```

## 9. PR作成

GitHub MCPまたはghコマンドを使用してPRを作成：

- **base**: `main`
- **head**: `v{バージョン}`
- **title**: `[v{バージョン}] {変更の要約}` （英語）
- **description**: 変更内容の要約（英語）

**PR descriptionのテンプレート**：
```markdown
## Summary
- Brief description of changes

## Changes
### Added
- New features

### Changed
- Modified features

### Fixed
- Bug fixes

### Removed
- Removed features

## Test Checklist
- [ ] npm run compile succeeds
- [ ] npm run package succeeds
- [ ] Extension works in debug mode
```

---

# 言語ルール一覧

| 項目 | 言語 |
|------|------|
| UI表記 | 英語 |
| commitメッセージ | 英語 |
| PR title | 英語 |
| PR description | 英語 |
| CLAUDE.md | 日本語 |
| README.md | 英語 |
| README-JA.md | 日本語 |
| CHANGELOG.md | 英語 |
| CHANGELOG-JA.md | 日本語 |

---

# エラーハンドリング

- ブランチが既に存在する場合: 既存ブランチにチェックアウト
- コンフリクトが発生した場合: ユーザーに報告して手動解決を依頼
- PR作成に失敗した場合: エラー内容を報告

---

# 完了報告

すべての手順が完了したら、以下を報告：
- 作成/更新したブランチ名
- 更新したファイル一覧
- 作成したPRのURL
- 次のステップ（レビュー、マージ等）
