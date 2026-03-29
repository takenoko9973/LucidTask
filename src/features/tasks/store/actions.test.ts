import { describe, expect, it, vi } from "vitest";

import type { CreateTaskInput, Task, UpdateTaskInput } from "../../../shared/types/task";
import type { TaskApi } from "../api/taskApi";
import { createTasksActions } from "./actions";
import { initialTasksState, tasksReducer, type TasksAction } from "./reducer";
import type { TasksState } from "./types";

function createTask(id: string, title = id): Task {
  return {
    id,
    title,
    taskType: { kind: "daily" },
    isPinned: false,
  };
}

function createApiMock() {
  return {
    listTasks: vi.fn<TaskApi["listTasks"]>(),
    createTask: vi.fn<TaskApi["createTask"]>(),
    updateTask: vi.fn<TaskApi["updateTask"]>(),
    deleteTask: vi.fn<TaskApi["deleteTask"]>(),
    completeTask: vi.fn<TaskApi["completeTask"]>(),
    setTaskPinned: vi.fn<TaskApi["setTaskPinned"]>(),
    cleanupCompletedTasks: vi.fn<TaskApi["cleanupCompletedTasks"]>(),
  };
}

function createHarness(initialState: TasksState = initialTasksState) {
  let state = initialState;
  const dispatch = (action: TasksAction) => {
    state = tasksReducer(state, action);
  };

  return {
    dispatch,
    getState: () => state,
  };
}

describe("createTasksActions", () => {
  it("initializes tasks and updates loading state", async () => {
    // 仕様: initialize は即座に loading を立て、取得完了後に initialized を確定する。
    const api = createApiMock();
    const harness = createHarness();
    const actions = createTasksActions(harness.dispatch, api);
    const tasks = [createTask("task-1")];
    let resolveList: ((value: Task[]) => void) | undefined;

    api.listTasks.mockImplementation(
      () =>
        new Promise<Task[]>((resolve) => {
          resolveList = resolve;
        }),
    );

    const pending = actions.initialize();
    expect(harness.getState().loading).toBe(true);

    resolveList?.(tasks);
    await pending;

    const state = harness.getState();
    expect(state.loading).toBe(false);
    expect(state.initialized).toBe(true);
    expect(state.tasks).toEqual(tasks);
    expect(state.error).toBeNull();
  });

  it("upserts create/update/setPinned responses", async () => {
    // 仕様: 単体更新APIは一覧再取得ではなく upsert で局所反映する。
    const api = createApiMock();
    const harness = createHarness();
    const actions = createTasksActions(harness.dispatch, api);
    const createInput: CreateTaskInput = {
      title: "new",
      taskType: { kind: "daily" },
    };
    const updateInput: UpdateTaskInput = {
      id: "task-1",
      title: "updated",
    };

    api.createTask.mockResolvedValueOnce(createTask("task-1", "new"));
    api.updateTask.mockResolvedValueOnce(createTask("task-1", "updated"));
    api.setTaskPinned.mockResolvedValueOnce({
      ...createTask("task-1", "updated"),
      isPinned: true,
    });

    await actions.createTask(createInput);
    await actions.updateTask(updateInput);
    await actions.setTaskPinned("task-1", true);

    const state = harness.getState();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]?.title).toBe("updated");
    expect(state.tasks[0]?.isPinned).toBe(true);
  });

  it("replaces task list from delete/complete responses", async () => {
    // 仕様: delete/complete は一覧全体レスポンスなので local state を置換する。
    const api = createApiMock();
    const initialState: TasksState = {
      ...initialTasksState,
      tasks: [createTask("task-1"), createTask("task-2")],
    };
    const harness = createHarness(initialState);
    const actions = createTasksActions(harness.dispatch, api);

    api.deleteTask.mockResolvedValueOnce([createTask("task-2")]);
    await actions.deleteTask("task-1");
    expect(harness.getState().tasks.map((task) => task.id)).toEqual(["task-2"]);

    api.completeTask.mockResolvedValueOnce([
      {
        ...createTask("task-2"),
        completedAt: "2026-03-29T10:00:00+09:00",
      },
    ]);
    await actions.completeTask("task-2");
    expect(harness.getState().tasks).toEqual([
      {
        ...createTask("task-2"),
        completedAt: "2026-03-29T10:00:00+09:00",
      },
    ]);
  });

  it("refreshes task list after cleanup removes completed tasks", async () => {
    // 仕様: cleanup は削除件数のみ返すため、removed > 0 のときだけ再取得する。
    const api = createApiMock();
    const initialState: TasksState = {
      ...initialTasksState,
      tasks: [createTask("task-1"), createTask("task-2")],
    };
    const harness = createHarness(initialState);
    const actions = createTasksActions(harness.dispatch, api);

    api.cleanupCompletedTasks.mockResolvedValueOnce(2);
    api.listTasks.mockResolvedValueOnce([createTask("task-2")]);

    const removed = await actions.cleanupCompletedTasks();

    expect(removed).toBe(2);
    expect(api.listTasks).toHaveBeenCalledTimes(1);
    expect(harness.getState().tasks.map((task) => task.id)).toEqual(["task-2"]);
  });

  it("does not refetch tasks when cleanup removes nothing", async () => {
    // 仕様: no-op cleanup では余計なIOや表示順変化を発生させない。
    const api = createApiMock();
    const initialState: TasksState = {
      ...initialTasksState,
      tasks: [createTask("task-1"), createTask("task-2")],
    };
    const harness = createHarness(initialState);
    const actions = createTasksActions(harness.dispatch, api);

    api.cleanupCompletedTasks.mockResolvedValueOnce(0);

    const removed = await actions.cleanupCompletedTasks();

    expect(removed).toBe(0);
    expect(api.listTasks).not.toHaveBeenCalled();
    expect(harness.getState().tasks.map((task) => task.id)).toEqual(["task-1", "task-2"]);
  });

  it("stores error and resets loading when operation fails", async () => {
    // 仕様: すべての非同期操作で loading/error 遷移契約を共通化する。
    const api = createApiMock();
    const harness = createHarness();
    const actions = createTasksActions(harness.dispatch, api);
    const expectedError = new Error("create failed");
    const createInput: CreateTaskInput = {
      title: "will fail",
      taskType: { kind: "daily" },
    };

    api.createTask.mockRejectedValueOnce(expectedError);

    await expect(actions.createTask(createInput)).rejects.toThrow("create failed");

    const state = harness.getState();
    expect(state.loading).toBe(false);
    expect(state.error).toBe("create failed");
  });

  it("dispatches toggleExpand without API calls", async () => {
    // 仕様: 展開トグルは表示状態のみの変更で、バックエンド呼び出しを行わない。
    const api = createApiMock();
    const initialState: TasksState = {
      ...initialTasksState,
      tasks: [createTask("1"), createTask("2"), createTask("3"), createTask("4"), createTask("5")],
      isExpanded: false,
    };
    const harness = createHarness(initialState);
    const actions = createTasksActions(harness.dispatch, api);

    actions.toggleExpand();

    expect(harness.getState().isExpanded).toBe(true);
    expect(api.listTasks).not.toHaveBeenCalled();
    expect(api.createTask).not.toHaveBeenCalled();
  });

  it("opens and closes dialogs by mutating local dialog state only", async () => {
    // 仕様: ダイアログ開閉アクションは UI 状態だけ変更し、Task API を叩かない。
    const api = createApiMock();
    const initialState: TasksState = {
      ...initialTasksState,
      tasks: [createTask("1"), createTask("2")],
      isExpanded: true,
    };
    const harness = createHarness(initialState);
    const actions = createTasksActions(harness.dispatch, api);

    actions.openCreateDialog();
    expect(harness.getState().dialog).toEqual({
      isOpen: true,
      mode: "create",
      taskId: null,
    });

    actions.openEditDialog("2");
    expect(harness.getState().dialog).toEqual({
      isOpen: true,
      mode: "edit",
      taskId: "2",
    });

    actions.closeDialog();
    expect(harness.getState().dialog).toEqual(initialTasksState.dialog);
    expect(api.listTasks).not.toHaveBeenCalled();
    expect(api.createTask).not.toHaveBeenCalled();
    expect(api.updateTask).not.toHaveBeenCalled();
  });
});
