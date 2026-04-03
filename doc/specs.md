# 基本設計書: LucidTask（デスクトップ常駐タスクウィジェット）

最終更新日: 2026-04-03

## 1. 目的と適用範囲

- 本書は LucidTask の「現行実装」を正として、機能仕様と設計方針を定義する。
- 対象はデスクトップ版（Tauri + React）であり、Webブラウザ単体実行は検証補助用途とする。

## 2. システム構成

- フロントエンド: React + TypeScript + Vitest
- バックエンド: Rust + Tauri
- 永続化: ローカル JSON ファイル
- IPC: Tauri command invoke
- UI方針: 1ウィンドウ（メイン）+ メイン内モーダル

## 3. ウィンドウ/ランタイム仕様

- メインウィンドウは `decorations: false` / `transparent: true` / `resizable: false` / `skipTaskbar: true`。
- `alwaysOnTop` の初期値は `false`。右クリックメニューで切替可能。
- 専用ドラッグ帯（ウィジェット上部）でのみドラッグ移動を行う。
- アプリ全体で `user-select: none` を適用し、通常テキスト選択は無効化する。

## 4. データモデル

### 4.1 TaskType

- `daily`
- `deadline`（`deadlineAt` を持つ）

### 4.2 Task

- `id: string`
- `title: string`
- `taskType: TaskType`
- `isPinned: boolean`
- `completedAt?: string | null`（完了時刻。未完了は `null/undefined`）

### 4.3 永続化

- `completedAt` を含めて永続化する（完了タスクは一覧に残る）。
- 保存先は Tauri `identifier = com.lucidtask` に紐づくアプリデータ配下。
- `identifier` 変更時の自動移行は行わない。

## 5. タスク業務ルール

### 5.1 ソート順

ソート優先度は以下の固定順:

1. Pin（未完了のみ）
2. 期限超過/当日期限
3. Daily
4. 未来期限
5. 完了

同順位では `title`、次に `id` で安定ソートする。

### 5.2 Pin制約

- Pin 上限は未完了タスクで最大3件。
- 完了タスクへの Pin 更新は不可。
- 完了操作時は Pin を自動解除する。

### 5.3 完了トグル

- `complete_task` はトグル動作:
  - 未完了 -> 完了（`completedAt` 付与）
  - 完了 -> 未完了（`completedAt` 解除）

### 5.4 Daily リセット

- Daily の完了状態は「業務日境界 05:00」を跨いだら未完了へ戻す。
- 判定は `business day` 基準（05:00未満は前日扱い）。
- リセット処理は `list_tasks` 系呼び出し時に適用される。

### 5.5 完了タスクの保持期間

- 完了タスクは完了時刻から 72時間を超えると削除対象。
- `cleanup_completed_tasks` で削除し、永続化にも反映する。

## 6. メイン画面仕様

### 6.1 表示件数と展開

- 折りたたみ時:
  - 未完了タスクのみ上位4件を表示。
  - 完了タスクは表示しない。
- 展開時:
  - 全タスク（完了含む）を表示。
  - 10件以上はスクロール領域で表示。

### 6.2 ヘッダー件数

- 見出し件数は「未完了件数」を表示（完了はカウントしない）。

### 6.3 タスクカード

- 右側操作はチェックボタンのみ（完了/未完了トグル）。
- `isPinned=true` は左上ピンアイコンで表示。
- 完了タスクは薄グレー表示。
- 期限タスクはタイトル下に期限補助文言を表示:
  - 期限後: `期限超過`
  - 1時間未満: `あとN分`
  - 1日未満: `あとN時間`
  - 1日以上: `あとN日`

## 7. 右クリックメニュー仕様（ネイティブ）

### 7.1 アプリ領域メニュー

- `最前列表示`（Always on top 切替）
- `自動起動`（ON/OFF 切替）
- `言語` サブメニュー
  - `日本語`
  - `English`
- `終了`

### 7.2 タスク領域メニュー

- `Pinする` / `Pin解除`（完了タスクでは無効）
- `編集画面表示`（完了タスクでも有効）

### 7.3 表示対象判定

- タスクカード上右クリックはタスクメニュー優先。
- タスク同士の隙間（task-list領域）ではアプリメニューを開かない。
- それ以外の領域ではアプリメニューを開く。

## 8. Add/Edit ダイアログ仕様

- ダイアログは別ウィンドウではなく「メイン内モーダル」。
- モード:
  - `create`
  - `edit(taskId)`
- 入力項目:
  - タイトル
  - タイプ（Daily / 期限あり）
  - 期限あり時: `日付` + `時刻` セレクト
  - Pin

### 8.1 期限入力

- 時刻粒度は `TASK_DIALOG_DEADLINE_STEP_MINUTES`（現値: 15分）。
- 時刻候補は 1日分を `step` で列挙（例: 00:00, 00:15, ...）。
- Create初期値は「現在時刻以降で最も近い枠」に切り上げる。
- 日跨ぎ（例: 23:55 + 15分刻み）は翌日00:00に繰り上げる。

### 8.2 フォーム状態保持

- 同一ルート中（`create` のまま / 同一 `edit:<taskId>`）は、定期更新で `tasks` が更新されても入力中内容を保持する。
- ルート変更時のみフォームを再初期化する。

### 8.3 削除

- 削除は Editモードでのみ表示。
- 削除時はモーダル内の確認UIを経由して実行する。

## 9. 定期メンテナンス

- フロントは60秒間隔で以下を実行:
  1. `cleanup_completed_tasks`
  2. `initialize`（`list_tasks` 再取得）
- 目的:
  - 72時間超過完了タスクの整理
  - Daily 05:00リセット結果の画面反映

## 10. 多言語対応

- 対応ロケール: `ja`, `en`
- 翻訳リソース:
  - `src/shared/i18n/tasks/ja.json`
  - `src/shared/i18n/tasks/en.json`
- 選択言語は `localStorage` に保存し、起動時に復元する。

## 11. IPCコマンド仕様

### 11.1 タスク系

- `list_tasks -> Task[]`
- `create_task(input) -> Task`
- `update_task(input) -> Task`
- `delete_task(id) -> Task[]`
- `complete_task(id) -> Task[]`（完了トグル）
- `set_task_pinned(id, isPinned) -> Task`
- `cleanup_completed_tasks -> number`

### 11.2 アプリ系

- `show_context_menu(input)`（`kind=app|task`）
- `get_autostart_enabled -> bool`
- `set_autostart_enabled(enabled) -> bool`
- `quit_app`

### 11.3 フロントイベント

- Rust -> Frontend イベント: `tasks:native-menu-action`
  - `set-locale`
  - `task-edit`
  - `task-pin-toggle`

## 12. テスト方針

- TypeScript: 実装と同階層に `*.test.ts(x)` を配置。
- Rust:
  - 統合/ドメイン挙動: `src-tauri/tests/*`
  - private最小関数: 対象モジュール inline test 許容
- 重要回帰観点:
  - Daily 05:00リセット
  - 72時間cleanup境界
  - 完了トグル
  - Pin上限制約
  - 右クリックメニューaction変換
  - ダイアログ初期化と入力保持

## 13. 非対象（現時点）

- 別ウィンドウ型ダイアログ
- `identifier` 変更時の自動データ移行
- 3言語目以降の文言追加フロー自動化
