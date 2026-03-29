import { describe, expect, it } from "vitest";

import {
  getTasksMessages,
  isTasksLocale,
  normalizeTasksLocale,
  SUPPORTED_TASKS_LOCALES,
  type TasksLocale,
} from "./tasksI18n";

describe("tasksI18n", () => {
  it("normalizes unsupported locale to default ja", () => {
    // 仕様: 不正なlocale文字列は安全側で ja にフォールバックする。
    expect(normalizeTasksLocale("fr")).toBe("ja");
    expect(normalizeTasksLocale(null)).toBe("ja");
  });

  it("returns locale-specific message sets", () => {
    // 仕様: ja/en 切替で主要文言が変化する。
    const ja = getTasksMessages("ja");
    const en = getTasksMessages("en");

    expect(ja.widget.addTask).toBe("追加");
    expect(en.widget.addTask).toBe("Add task");
  });

  it("formats template placeholders from shared json", () => {
    // 仕様: 共通JSONのプレースホルダは locale ごとに正しく展開される。
    const ja = getTasksMessages("ja");
    const en = getTasksMessages("en");

    expect(ja.deadline.days(3)).toBe("あと3日");
    expect(en.deadline.hours(1)).toBe("1 hour left");
    expect(en.deadline.hours(2)).toBe("2 hours left");
    expect(ja.dialog.taskNotFound("task-1")).toBe("タスクが見つかりません: task-1");
  });

  it("keeps locale union strictness", () => {
    // 仕様: locale は ja/en のみを扱う。
    const locales: TasksLocale[] = ["ja", "en"];
    expect(locales).toHaveLength(2);
  });

  it("shares supported locale catalog and type guard", () => {
    // 仕様: 対応locale一覧と判定関数は同じ定義を参照する。
    expect(SUPPORTED_TASKS_LOCALES).toEqual(["ja", "en"]);
    expect(isTasksLocale("ja")).toBe(true);
    expect(isTasksLocale("fr")).toBe(false);
  });
});
