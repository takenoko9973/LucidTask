import { invoke } from "@tauri-apps/api/core";

import {
  TASK_COMMANDS,
  type OpenTaskDialogInput,
  type TaskCommandPayloads,
  type TaskCommandResponses,
} from "../../../shared/ipc";
import type { CreateTaskInput, Task, TaskId, UpdateTaskInput } from "../../../shared/types/task";

type TaskCommand = keyof TaskCommandPayloads & keyof TaskCommandResponses;

async function invokeTaskCommand<TCommand extends TaskCommand>(
  command: TCommand,
  payload?: TaskCommandPayloads[TCommand],
): Promise<TaskCommandResponses[TCommand]> {
  // commandごとのpayload/responseを型で結び、IPC契約の食い違いをコンパイル時に検出する。
  if (typeof payload === "undefined") {
    return invoke<TaskCommandResponses[TCommand]>(command);
  }

  return invoke<TaskCommandResponses[TCommand]>(command, payload as Record<string, unknown>);
}

export interface TaskApi {
  listTasks: () => Promise<Task[]>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  updateTask: (input: UpdateTaskInput) => Promise<Task>;
  deleteTask: (id: TaskId) => Promise<Task[]>;
  completeTask: (id: TaskId) => Promise<Task[]>;
  setTaskPinned: (id: TaskId, isPinned: boolean) => Promise<Task>;
  cleanupCompletedTasks: () => Promise<number>;
  openTaskDialog: (input: OpenTaskDialogInput) => Promise<void>;
}

export const taskApi: TaskApi = {
  async listTasks() {
    return invokeTaskCommand(TASK_COMMANDS.listTasks);
  },
  async createTask(input) {
    return invokeTaskCommand(TASK_COMMANDS.createTask, input);
  },
  async updateTask(input) {
    return invokeTaskCommand(TASK_COMMANDS.updateTask, input);
  },
  async deleteTask(id) {
    return invokeTaskCommand(TASK_COMMANDS.deleteTask, { id });
  },
  async completeTask(id) {
    return invokeTaskCommand(TASK_COMMANDS.completeTask, { id });
  },
  async setTaskPinned(id, isPinned) {
    return invokeTaskCommand(TASK_COMMANDS.setTaskPinned, { id, isPinned });
  },
  async cleanupCompletedTasks() {
    return invokeTaskCommand(TASK_COMMANDS.cleanupCompletedTasks);
  },
  async openTaskDialog(input) {
    return invokeTaskCommand(TASK_COMMANDS.openTaskDialog, input);
  },
};
