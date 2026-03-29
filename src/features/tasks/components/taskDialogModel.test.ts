import { describe, expect, it } from "vitest";

import type { Task } from "../../../shared/types/task";
import {
  buildTaskDialogInitialSnapshot,
  toTaskType,
  validateTaskDialogForm,
  type TaskDialogRoute,
} from "./taskDialogModel";
import { getTasksMessages } from "./tasksI18n";

function createTask(id: string, title = id): Task {
  return {
    id,
    title,
    taskType: { kind: "daily" },
    isPinned: false,
  };
}

function createRoute(route: TaskDialogRoute): TaskDialogRoute {
  return route;
}

describe("taskDialogModel", () => {
  const dialogMessages = getTasksMessages("en").dialog;

  it("builds default create snapshot", () => {
    // 準備
    const route = createRoute({ mode: "create" });

    // 実行
    const snapshot = buildTaskDialogInitialSnapshot(route, []);

    // 検証
    expect(snapshot).toEqual({
      title: "",
      taskTypeKind: "deadline",
      deadlineAt: "",
      isPinned: false,
      error: null,
    });
  });

  it("builds edit snapshot from existing task", () => {
    // 仕様: 編集対象が存在する場合は既存値でフォームを初期化する。
    // 準備
    const route = createRoute({ mode: "edit", taskId: "task-2" });
    const tasks: Task[] = [{ ...createTask("task-2", "updated"), isPinned: true }];

    // 実行
    const snapshot = buildTaskDialogInitialSnapshot(route, tasks);

    // 検証
    expect(snapshot.title).toBe("updated");
    expect(snapshot.taskTypeKind).toBe("daily");
    expect(snapshot.isPinned).toBe(true);
    expect(snapshot.error).toBeNull();
  });

  it("returns not-found error for unknown edit task", () => {
    // 仕様: 編集対象IDが見つからないときは保存不可のエラーを返す。
    // 準備
    const route = createRoute({ mode: "edit", taskId: "missing" });

    // 実行
    const snapshot = buildTaskDialogInitialSnapshot(route, [createTask("task-1")]);

    // 検証
    expect(snapshot.error).toBe(dialogMessages.taskNotFound("missing"));
  });

  it("validates required title", () => {
    // 実行
    const error = validateTaskDialogForm("   ", "daily", "");

    // 検証
    expect(error).toBe(dialogMessages.requiredTitle);
  });

  it("validates deadline for deadline tasks", () => {
    // 実行
    const error = validateTaskDialogForm("release", "deadline", "");

    // 検証
    expect(error).toBe(dialogMessages.requiredDeadline);
  });

  it("converts deadline kind to task type", () => {
    // 実行
    const taskType = toTaskType("deadline", "2026-03-31T09:00");

    // 検証
    expect(taskType.kind).toBe("deadline");
    if (taskType.kind === "deadline") {
      expect(taskType.deadlineAt).toContain("2026-03-31T");
    }
  });
});
