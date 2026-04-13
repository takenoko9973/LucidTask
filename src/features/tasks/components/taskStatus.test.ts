import { describe, expect, it } from "vitest";

import type { Task } from "../../../shared/types/task";
import { getTaskIndicator } from "./taskStatus";

function createDeadlineTask(deadlineAt: string): Task {
  return {
    id: `task-${deadlineAt}`,
    title: "deadline task",
    taskType: { kind: "deadline", deadlineAt },
    isPinned: false,
  };
}

describe("getTaskIndicator", () => {
  const now = new Date("2026-03-26T10:00:00+09:00");

  it("returns completed indicator when task has completion", () => {
    const indicator = getTaskIndicator(
      {
        ...createDeadlineTask("2026-03-27T09:00:00+09:00"),
        completion: {
          kind: "deadline",
          completedAt: "2026-03-26T12:00:00+09:00",
        },
      },
      now,
    );
    expect(indicator.kind).toBe("completed");
  });

  it("returns overdue-or-today for deadline tasks due today", () => {
    const indicator = getTaskIndicator(createDeadlineTask("2026-03-26T23:00:00+09:00"), now);
    expect(indicator.kind).toBe("overdue-or-today");
  });

  it("returns daily for daily tasks", () => {
    const indicator = getTaskIndicator(
      {
        id: "daily-task",
        title: "daily task",
        taskType: { kind: "daily" },
        isPinned: false,
      },
      now,
    );
    expect(indicator.kind).toBe("daily");
  });

  it("keeps daily indicator for completed daily tasks", () => {
    const indicator = getTaskIndicator(
      {
        id: "daily-completed",
        title: "daily completed task",
        taskType: { kind: "daily" },
        isPinned: false,
        completion: {
          kind: "daily",
          completedAt: "2026-03-26T12:00:00+09:00",
          businessDay: "2026-03-26",
        },
      },
      now,
    );
    expect(indicator.kind).toBe("daily");
  });

  it("returns future-deadline for tasks due tomorrow or later", () => {
    const indicator = getTaskIndicator(createDeadlineTask("2026-03-27T09:00:00+09:00"), now);
    expect(indicator.kind).toBe("future-deadline");
  });

  it("returns localized english labels", () => {
    // 仕様: インジケーター文言は locale に応じて切り替わる。
    const indicator = getTaskIndicator(createDeadlineTask("2026-03-27T09:00:00+09:00"), now, "en");
    expect(indicator.label).toBe("Upcoming");
  });
});
