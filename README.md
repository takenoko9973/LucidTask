# LucidTask

Tauri + React + TypeScript で構成された、デスクトップ向けタスクウィジェットです。

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
  - Ubuntu / Windows / macOS で Tauri バンドルをビルド
  - GitHub Release（Draft）を自動作成

## リリース手順

1. `main` にリリース対象が取り込まれていることを確認
2. バージョンタグを作成して push

```bash
git tag v0.1.0
git push origin v0.1.0
```

3. GitHub の Draft Release に生成された成果物を確認し、公開

## データ保存先について

- Tauri の保存先は `src-tauri/tauri.conf.json` の `identifier` に依存します。
- 本プロジェクトは `com.lucidtask` を使用しています。
- `identifier` 変更時の自動データ移行は行っていません。
