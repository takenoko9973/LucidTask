import { describe, expect, it } from "vitest";

import type { Task } from "../../../shared/types/task";
import {
  TASK_DIALOG_DEADLINE_STEP_MINUTES,
  buildTaskDialogDeadlineTimeOptions,
  buildTaskDialogInitialSnapshot,
  buildTaskDialogRouteKey,
  joinTaskDialogDeadlineInput,
  resolveDefaultTaskDialogDeadlineInput,
  resolveDefaultTaskDialogDeadlineTime,
  shouldResetTaskDialogForm,
  splitTaskDialogDeadlineInput,
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
    const now = new Date("2026-04-03T09:07:00");

    // 実行
    const snapshot = buildTaskDialogInitialSnapshot(route, [], undefined, now);

    // 検証
    expect(snapshot).toEqual({
      title: "",
      taskTypeKind: "deadline",
      deadlineAt: "2026-04-03T09:15",
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

  it("builds stable route keys for create/edit dialogs", () => {
    // 仕様: ダイアログ初期化は routeキーで判定し、task配列更新だけでは変化しない。
    expect(buildTaskDialogRouteKey(null)).toBeNull();
    expect(buildTaskDialogRouteKey({ mode: "create" })).toBe("create");
    expect(buildTaskDialogRouteKey({ mode: "edit", taskId: "task-1" })).toBe("edit:task-1");
    expect(buildTaskDialogRouteKey({ mode: "edit", taskId: "  task-2  " })).toBe("edit:task-2");
  });

  it("keeps deadline step constants configurable from one place", () => {
    // 仕様: 時間粒度は分定数で管理し、将来変更時の修正点を1箇所にする。
    expect(TASK_DIALOG_DEADLINE_STEP_MINUTES).toBe(15);
  });

  it("resets dialog form only when route key actually changes", () => {
    // 仕様: 定期更新でtasksが変わっても同一routeではフォームを再初期化しない。
    expect(shouldResetTaskDialogForm(null, null)).toBe(false);
    expect(shouldResetTaskDialogForm("create", null)).toBe(false);
    expect(shouldResetTaskDialogForm(null, "create")).toBe(true);
    expect(shouldResetTaskDialogForm("create", "create")).toBe(false);
    expect(shouldResetTaskDialogForm("edit:task-1", "edit:task-1")).toBe(false);
    expect(shouldResetTaskDialogForm("edit:task-1", "edit:task-2")).toBe(true);
  });

  it("builds 15-minute time options for full day", () => {
    // 仕様: 時間選択肢は00:00から23:45まで15分刻みで生成する。
    const options = buildTaskDialogDeadlineTimeOptions();

    expect(options[0]).toBe("00:00");
    expect(options[1]).toBe("00:15");
    expect(options[options.length - 1]).toBe("23:45");
    expect(options).toHaveLength(96);
  });

  it("joins and splits deadline local input consistently", () => {
    // 仕様: date/time分割UIでも保存値はYYYY-MM-DDTHH:mm形式を維持する。
    const joined = joinTaskDialogDeadlineInput("2026-04-03", "09:30");
    expect(joined).toBe("2026-04-03T09:30");
    expect(splitTaskDialogDeadlineInput(joined)).toEqual({
      date: "2026-04-03",
      time: "09:30",
    });
    expect(joinTaskDialogDeadlineInput("", "09:30")).toBe("");
    expect(splitTaskDialogDeadlineInput("")).toEqual({ date: "", time: "" });
  });

  it("resolves default deadline time to nearest future slot", () => {
    // 仕様: 初期時間は現在時刻を15分単位で切り上げた枠を使う。
    const now = new Date("2026-04-03T09:07:00");
    expect(resolveDefaultTaskDialogDeadlineTime(now)).toBe("09:15");
  });

  it("keeps exact slot when current minute is already aligned", () => {
    // 仕様: 既に15分枠上にいる場合は、その時刻をそのまま初期値に使う。
    const now = new Date("2026-04-03T09:30:00");
    expect(resolveDefaultTaskDialogDeadlineTime(now)).toBe("09:30");
  });

  it("wraps default deadline time to midnight after end of day", () => {
    // 仕様: 23:59など日末を越える切り上げ時は翌日00:00枠に丸める。
    const now = new Date("2026-04-03T23:59:00");
    expect(resolveDefaultTaskDialogDeadlineTime(now)).toBe("00:00");
  });

  it("resolves default deadline input with date rollover", () => {
    // 仕様: 23:55以降を15分刻みに丸めると、日付は翌日に繰り上がる。
    const now = new Date("2026-04-03T23:55:00");
    expect(resolveDefaultTaskDialogDeadlineInput(now)).toBe("2026-04-04T00:00");
  });
});
