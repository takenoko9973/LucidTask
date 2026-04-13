import { describe, expect, it } from "vitest";

import type { Task } from "../../shared/types/task";
import {
  canExpandTaskList,
  countActiveTasks,
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
  completedAt?: string,
): Task {
  return {
    id,
    title,
    taskType: {
      kind: "deadline",
      deadlineAt,
    },
    isPinned,
    completion: completedAt
      ? {
          kind: "deadline",
          completedAt,
        }
      : undefined,
  };
}

function createDailyTask(id: string, title: string, isPinned = false, completedAt?: string): Task {
  return {
    id,
    title,
    taskType: {
      kind: "daily",
    },
    isPinned,
    completion: completedAt
      ? {
          kind: "daily",
          completedAt,
          businessDay: "2026-03-26",
        }
      : undefined,
  };
}

describe("sortTasks", () => {
  it("enforces the spec priority order", () => {
    // 仕様順序:
    // 1) pinned 2) 期限超過/当日 3) daily 4) 未来期限 5) 完了。
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
    // 仕様: 同順位時は title -> id で安定ソートし、表示順の揺れを防ぐ。
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

  it("moves completed tasks to the bottom section", () => {
    // 仕様: 完了タスクは最下段セクションへ寄せ、完了時刻の新しい順で並ぶ。
    const now = new Date("2026-03-26T10:00:00+09:00");
    const tasks: Task[] = [
      createDailyTask("active", "active"),
      createDeadlineTask("done-old", "done-old", "2026-03-20T09:00:00+09:00", false, "2026-03-24T09:00:00+09:00"),
      createDeadlineTask("done-new", "done-new", "2026-03-25T09:00:00+09:00", false, "2026-03-26T09:00:00+09:00"),
    ];

    const sortedIds = sortTasks(tasks, now).map((task) => task.id);

    expect(sortedIds).toEqual(["active", "done-new", "done-old"]);
  });
});

describe("visibility and layout selectors", () => {
  const tasks = Array.from({ length: 10 }, (_, index) => createDailyTask(`task-${index}`, `task-${index}`));

  it("shows 4 tasks in collapsed state", () => {
    // 仕様: 折りたたみでは初期表示件数のみ返す。
    const visible = selectVisibleTasks(tasks, false);
    expect(visible).toHaveLength(INITIAL_VISIBLE_TASK_COUNT);
  });

  it("shows all tasks in expanded state", () => {
    // 仕様: 展開時は全件返し、スクロール有無はCSS側で制御する。
    const visible = selectVisibleTasks(tasks, true);
    expect(visible).toHaveLength(10);
  });

  it("sets scroll flag when expanded and task count exceeds 9", () => {
    // 仕様: スクロール判定の閾値は展開時にのみ適用する。
    expect(selectLayoutMeta(10, 10, true)).toEqual({
      showExpandButton: true,
      requiresScroll: true,
    });
  });

  it("normalizes expanded state to collapsed when 4 tasks or fewer", () => {
    // 仕様: 展開ボタンが不要な件数なら isExpanded は強制的に false。
    expect(normalizeExpandedState(true, 4, 4)).toBe(false);
    expect(normalizeExpandedState(true, 5, 5)).toBe(true);
  });

  it("hides completed tasks in collapsed mode", () => {
    // 仕様: 折りたたみ表示は未完了のみを対象にして情報密度を保つ。
    const now = new Date("2026-03-26T10:00:00+09:00");
    const sorted = sortTasks(
      [
        createDailyTask("active-1", "active-1"),
        createDailyTask("active-2", "active-2"),
        createDeadlineTask(
          "done-1",
          "done-1",
          "2026-03-20T09:00:00+09:00",
          false,
          "2026-03-25T09:00:00+09:00",
        ),
      ],
      now,
    );

    const visibleIds = selectVisibleTasks(sorted, false).map((task) => task.id);
    expect(visibleIds).toEqual(["active-1", "active-2"]);
  });

  it("keeps expand available when completed tasks exist under threshold", () => {
    // 仕様: 未完了が少なくても完了履歴がある場合は展開可能にする。
    expect(canExpandTaskList(2, 3)).toBe(true);
    expect(selectLayoutMeta(2, 3, false).showExpandButton).toBe(true);
    expect(normalizeExpandedState(true, 2, 3)).toBe(true);
  });
});

describe("countActiveTasks", () => {
  it("excludes completed tasks from the task counter", () => {
    // 仕様: ヘッダー件数は未完了タスクのみを数える。
    const tasks: Task[] = [
      createDailyTask("active-1", "active-1"),
      createDeadlineTask(
        "done-1",
        "done-1",
        "2026-03-20T10:00:00+09:00",
        false,
        "2026-03-26T10:00:00+09:00",
      ),
      createDailyTask("active-2", "active-2"),
    ];

    expect(countActiveTasks(tasks)).toBe(2);
  });
});
