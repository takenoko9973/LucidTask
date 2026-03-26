import type { Dispatch } from "react";

import type { Task } from "../../../shared/types/task";
import type { TaskApi } from "../api/taskApi";
import type { TasksAction } from "./reducer";
import type { TasksActions } from "./types";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function runManagedOperation<TResult>(
  dispatch: Dispatch<TasksAction>,
  operation: () => Promise<TResult>,
): Promise<TResult> {
  // 全API操作で loading/error の遷移を統一し、画面状態の分岐を減らす。
  dispatch({ type: "tasks/operationStarted" });

  try {
    const result = await operation();
    dispatch({ type: "tasks/operationFinished" });
    return result;
  } catch (error) {
    dispatch({ type: "tasks/operationFailed", error: toErrorMessage(error) });
    throw error;
  }
}

async function runUpsertTaskOperation(
  dispatch: Dispatch<TasksAction>,
  operation: () => Promise<Task>,
): Promise<Task> {
  return runManagedOperation(dispatch, async () => {
    const task = await operation();
    dispatch({ type: "tasks/upsertTask", task });
    return task;
  });
}

async function runReplaceTasksOperation(
  dispatch: Dispatch<TasksAction>,
  operation: () => Promise<Task[]>,
): Promise<Task[]> {
  return runManagedOperation(dispatch, async () => {
    const tasks = await operation();
    dispatch({ type: "tasks/replaceTasks", tasks });
    return tasks;
  });
}

export function createTasksActions(dispatch: Dispatch<TasksAction>, api: TaskApi): TasksActions {
  return {
    async initialize() {
      await runManagedOperation(dispatch, async () => {
        const tasks = await api.listTasks();
        dispatch({ type: "tasks/replaceTasks", tasks });
        dispatch({ type: "tasks/initialized" });
      });
    },
    async createTask(input) {
      return runUpsertTaskOperation(dispatch, () => api.createTask(input));
    },
    async updateTask(input) {
      return runUpsertTaskOperation(dispatch, () => api.updateTask(input));
    },
    async deleteTask(id) {
      return runReplaceTasksOperation(dispatch, () => api.deleteTask(id));
    },
    async completeTask(id) {
      return runReplaceTasksOperation(dispatch, () => api.completeTask(id));
    },
    async setTaskPinned(id, isPinned) {
      return runUpsertTaskOperation(dispatch, () => api.setTaskPinned(id, isPinned));
    },
    async cleanupCompletedTasks() {
      // cleanup は削除件数のみ返す契約のため tasks 配列は更新しない。
      return runManagedOperation(dispatch, async () => api.cleanupCompletedTasks());
    },
    toggleExpand() {
      dispatch({ type: "tasks/toggleExpand" });
    },
  };
}
