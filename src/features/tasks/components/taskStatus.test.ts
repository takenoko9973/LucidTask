import { describe, expect, it } from "vitest";

import type { Task } from "../../../shared/types/task";
import { getTaskIndicator } from "./taskStatus";

function createDeadlineTask(deadlineAt: string, isPinned = false): Task {
  return {
    id: `task-${deadlineAt}`,
    title: "deadline task",
    taskType: { kind: "deadline", deadlineAt },
    isPinned,
  };
}

describe("getTaskIndicator", () => {
  const now = new Date("2026-03-26T10:00:00+09:00");

  it("returns pinned indicator first when task is pinned", () => {
    const indicator = getTaskIndicator(createDeadlineTask("2026-03-27T09:00:00+09:00", true), now);
    expect(indicator.kind).toBe("pinned");
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

  it("returns future-deadline for tasks due tomorrow or later", () => {
    const indicator = getTaskIndicator(createDeadlineTask("2026-03-27T09:00:00+09:00"), now);
    expect(indicator.kind).toBe("future-deadline");
  });
});
