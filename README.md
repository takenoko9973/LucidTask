# LucidTask

Tauri + React + TypeScript で構成された、デスクトップ向けタスクウィジェットです。

## 仕様書

- 詳細仕様は [doc/specs.md](doc/specs.md) を参照してください。

## 主な仕様（要約）

- 1ウィンドウ構成（メイン内モーダルで Add/Edit）
- タスク種別: `Daily` / `期限あり`
- 完了はトグル動作（完了 <-> 未完了）
- 完了タスクは72時間保持後にクリーンアップ
- Daily は 05:00 境界で完了状態を自動リセット
- 折りたたみ時は未完了上位4件、展開時は全件表示
- 右クリックネイティブメニュー:
  - アプリ領域: 最前列表示 / 自動起動 / 言語 / 終了
  - タスク領域: Pin切替 / 編集画面表示
- 期限入力は日付 + 時刻選択（15分刻み、定数化）

## 前提環境

- Node.js 20 以上
- pnpm 10 系
- Rust stable
- Tauri 開発環境

## セットアップ

```bash
pnpm install
```

## 開発

```bash
pnpm tauri dev
```

## テストとビルド

```bash
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

## ビルド最適化

- `src-tauri/Cargo.toml` の `profile.release` で最適化を強化しています。
  - `opt-level = 3`
  - `lto = true`
  - `codegen-units = 1`
  - `strip = true`
  - `panic = "abort"`

## GitHub Actions

### CI

- ファイル: `.github/workflows/ci.yml`
- トリガー: `pull_request` と `push (main / feature/** / fix/** / refactor/**)`
- 実行内容:
  - `pnpm test`
  - `pnpm build`
  - `cargo test --manifest-path src-tauri/Cargo.toml`

### Release

- ファイル: `.github/workflows/release.yml`
- トリガー: `v*` タグ push（例: `v0.2.0`）
- 実行内容:
  - Ubuntu / Windows / macOS で Tauri バンドルをビルド（installer 系）
  - 各OSで portable zip（実行バイナリ単体）を生成
  - GitHub Release（Draft）を自動作成

### 生成される成果物（例）

- installer 版
  - Windows: `nsis` / `msi`
  - macOS: `app` / `dmg`
  - Linux: `deb` / `rpm` / `appimage`
- zip 版
  - Windows portable zip（`lucid-task.exe`）
  - Linux portable zip（`lucid-task`）
  - macOS portable zip（`lucid-task`）

## リリース手順

1. `main` にリリース対象が取り込まれていることを確認
2. バージョンタグを作成して push

```bash
git tag v0.1.0
git push origin v0.1.0
```

3. GitHub の Draft Release に生成された成果物を確認し、公開

## 配布物の注意点

- `exe` 単体 zip は「可能な限り単体」にしていますが、Windows 環境には `WebView2 Runtime` が必要です。
- インストーラー版は実行環境に応じて WebView2 の導入を補助します。

## データ保存先について

- Tauri の保存先は `src-tauri/tauri.conf.json` の `identifier` に依存します。
- 本プロジェクトは `com.lucidtask` を使用しています。
- `identifier` 変更時の自動データ移行は行っていません。
