import { describe, expect, it } from "vitest";

import type { Task } from "../../shared/types/task";
import {
  INITIAL_VISIBLE_TASK_COUNT,
  normalizeExpandedState,
  selectLayoutMeta,
  selectVisibleTasks,
  sortTasks,
} from "./selectors";

function createDeadlineTask(
  id: string,
  title: string,
  deadlineAt: string,
  isPinned = false,
): Task {
  return {
    id,
    title,
    taskType: {
      kind: "deadline",
      deadlineAt,
    },
    isPinned,
  };
}

function createDailyTask(id: string, title: string, isPinned = false): Task {
  return {
    id,
    title,
    taskType: {
      kind: "daily",
    },
    isPinned,
  };
}

describe("sortTasks", () => {
  it("enforces the spec priority order", () => {
    const now = new Date("2026-03-26T10:00:00+09:00");
    const tasks: Task[] = [
      createDeadlineTask("future-2", "future-2", "2026-03-28T09:00:00+09:00"),
      createDeadlineTask("today", "today", "2026-03-26T23:00:00+09:00"),
      createDailyTask("daily", "daily"),
      createDeadlineTask("overdue", "overdue", "2026-03-25T08:00:00+09:00"),
      createDeadlineTask("pinned", "pinned", "2026-03-30T12:00:00+09:00", true),
      createDeadlineTask("future-1", "future-1", "2026-03-27T09:00:00+09:00"),
    ];

    const sortedIds = sortTasks(tasks, now).map((task) => task.id);

    expect(sortedIds).toEqual(["pinned", "overdue", "today", "daily", "future-1", "future-2"]);
  });

  it("uses title then id as deterministic tie-breakers", () => {
    const now = new Date("2026-03-26T10:00:00+09:00");
    const sharedDeadline = "2026-03-29T09:00:00+09:00";
    const tasks: Task[] = [
      createDeadlineTask("task-3", "same", sharedDeadline),
      createDeadlineTask("task-1", "alpha", sharedDeadline),
      createDeadlineTask("task-2", "same", sharedDeadline),
    ];

    const sortedIds = sortTasks(tasks, now).map((task) => task.id);

    expect(sortedIds).toEqual(["task-1", "task-2", "task-3"]);
  });
});

describe("visibility and layout selectors", () => {
  const tasks = Array.from({ length: 10 }, (_, index) => createDailyTask(`task-${index}`, `task-${index}`));

  it("shows 4 tasks in collapsed state", () => {
    const visible = selectVisibleTasks(tasks, false);
    expect(visible).toHaveLength(INITIAL_VISIBLE_TASK_COUNT);
  });

  it("shows all tasks in expanded state", () => {
    const visible = selectVisibleTasks(tasks, true);
    expect(visible).toHaveLength(10);
  });

  it("sets scroll flag when expanded and task count exceeds 9", () => {
    expect(selectLayoutMeta(10, true)).toEqual({
      showExpandButton: true,
      requiresScroll: true,
    });
  });

  it("normalizes expanded state to collapsed when 4 tasks or fewer", () => {
    expect(normalizeExpandedState(true, 4)).toBe(false);
    expect(normalizeExpandedState(true, 5)).toBe(true);
  });
});
