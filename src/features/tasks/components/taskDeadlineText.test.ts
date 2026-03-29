import { describe, expect, it } from "vitest";

import type { Task } from "../../../shared/types/task";
import { getTaskDeadlineText } from "./taskDeadlineText";

function createDeadlineTask(deadlineAt: string): Task {
  return {
    id: "deadline-task",
    title: "deadline task",
    taskType: {
      kind: "deadline",
      deadlineAt,
    },
    isPinned: false,
  };
}

describe("getTaskDeadlineText", () => {
  it("returns day text when deadline is 24 hours or more away", () => {
    const now = new Date("2026-04-01T12:00:00+09:00");
    const task = createDeadlineTask("2026-04-03T12:00:00+09:00");

    const text = getTaskDeadlineText(task, now);

    expect(text).toBe("あと2日");
  });

  it("returns hour text when deadline is under 24 hours", () => {
    const now = new Date("2026-04-01T12:00:00+09:00");
    const task = createDeadlineTask("2026-04-02T11:00:00+09:00");

    const text = getTaskDeadlineText(task, now);

    expect(text).toBe("あと23時間");
  });

  it("returns minute text when deadline is under 1 hour", () => {
    const now = new Date("2026-04-01T12:00:00+09:00");
    const task = createDeadlineTask("2026-04-01T12:45:00+09:00");

    const text = getTaskDeadlineText(task, now);

    expect(text).toBe("あと45分");
  });

  it("returns overdue label for past deadline", () => {
    const now = new Date("2026-04-01T12:00:00+09:00");
    const task = createDeadlineTask("2026-04-01T11:59:00+09:00");

    const text = getTaskDeadlineText(task, now);

    expect(text).toBe("期限超過");
  });

  it("returns null for daily tasks", () => {
    const now = new Date("2026-04-01T12:00:00+09:00");
    const task: Task = {
      id: "daily-task",
      title: "daily task",
      taskType: { kind: "daily" },
      isPinned: false,
    };

    const text = getTaskDeadlineText(task, now);

    expect(text).toBeNull();
  });

  it("supports english locale output", () => {
    // 仕様: 言語切替後は期限補助テキストもロケールに追従する。
    const now = new Date("2026-04-01T12:00:00+09:00");
    const task = createDeadlineTask("2026-04-01T12:45:00+09:00");

    const text = getTaskDeadlineText(task, now, "en");

    expect(text).toBe("45 minutes left");
  });
});
