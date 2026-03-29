import { describe, expect, it } from "vitest";

import type { Task } from "../../../shared/types/task";
import { initialTasksState, tasksReducer } from "./reducer";

function createTask(id: string): Task {
  return {
    id,
    title: id,
    taskType: { kind: "daily" },
    isPinned: false,
  };
}

function createCompletedTask(id: string): Task {
  return {
    ...createTask(id),
    completedAt: "2026-03-29T10:00:00+09:00",
  };
}

describe("tasksReducer", () => {
  it("collapses expanded state when replaceTasks result has 4 tasks or fewer", () => {
    // 仕様: タスク再同期で件数が閾値未満になった場合、展開状態を自動補正する。
    const state = {
      ...initialTasksState,
      isExpanded: true,
      tasks: [createTask("a"), createTask("b"), createTask("c"), createTask("d"), createTask("e")],
    };

    const nextState = tasksReducer(state, {
      type: "tasks/replaceTasks",
      tasks: [createTask("a"), createTask("b"), createTask("c"), createTask("d")],
    });

    expect(nextState.isExpanded).toBe(false);
  });

  it("toggles expansion only when task count is greater than 4", () => {
    // 仕様: 折りたたみ時に完了タスクが隠れるため、完了履歴がある場合も展開を許可する。
    const collapsedWithFour = tasksReducer(
      {
        ...initialTasksState,
        tasks: [createTask("a"), createTask("b"), createTask("c"), createTask("d")],
      },
      { type: "tasks/toggleExpand" },
    );
    expect(collapsedWithFour.isExpanded).toBe(false);

    const toggledWithFive = tasksReducer(
      {
        ...initialTasksState,
        tasks: [createTask("a"), createTask("b"), createTask("c"), createTask("d"), createTask("e")],
      },
      { type: "tasks/toggleExpand" },
    );
    expect(toggledWithFive.isExpanded).toBe(true);

    const toggledWithCompleted = tasksReducer(
      {
        ...initialTasksState,
        tasks: [createTask("active"), createCompletedTask("done")],
      },
      { type: "tasks/toggleExpand" },
    );
    expect(toggledWithCompleted.isExpanded).toBe(true);
  });

  it("upserts existing tasks by id", () => {
    // 仕様: create/update/pin の単体更新は id をキーに同じ upsert 規約で反映する。
    const state = {
      ...initialTasksState,
      tasks: [createTask("task-1")],
    };

    const nextState = tasksReducer(state, {
      type: "tasks/upsertTask",
      task: {
        ...createTask("task-1"),
        title: "updated",
      },
    });

    expect(nextState.tasks).toHaveLength(1);
    expect(nextState.tasks[0]?.title).toBe("updated");
  });

  it("opens create/edit dialogs and closes them", () => {
    // 仕様: ダイアログ開閉はローカル状態のみで完結し、IPCに依存しない。
    const createOpened = tasksReducer(initialTasksState, { type: "tasks/openCreateDialog" });
    expect(createOpened.dialog).toEqual({
      isOpen: true,
      mode: "create",
      taskId: null,
    });

    const editOpened = tasksReducer(createOpened, { type: "tasks/openEditDialog", id: "task-2" });
    expect(editOpened.dialog).toEqual({
      isOpen: true,
      mode: "edit",
      taskId: "task-2",
    });

    const closed = tasksReducer(editOpened, { type: "tasks/closeDialog" });
    expect(closed.dialog).toEqual(initialTasksState.dialog);
  });

  it("closes edit dialog when target task disappears after replace", () => {
    // 仕様: 編集対象が最新一覧に存在しない場合は、編集ダイアログを閉じて整合を保つ。
    const state = tasksReducer(
      {
        ...initialTasksState,
        tasks: [createTask("task-1"), createTask("task-2")],
      },
      { type: "tasks/openEditDialog", id: "task-2" },
    );

    const nextState = tasksReducer(state, {
      type: "tasks/replaceTasks",
      tasks: [createTask("task-1")],
    });

    expect(nextState.dialog).toEqual(initialTasksState.dialog);
  });
});
