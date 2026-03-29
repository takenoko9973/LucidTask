import { invoke } from "@tauri-apps/api/core";

import {
  TASK_COMMANDS,
  type TaskCommandPayloads,
  type TaskCommandResponses,
} from "../../../shared/ipc";
import type { CreateTaskInput, Task, TaskId, UpdateTaskInput } from "../../../shared/types/task";

type TaskCommand = keyof TaskCommandPayloads & keyof TaskCommandResponses;
type TaskPayloadEnvelopeMode = "raw" | "input";

const TASK_COMMAND_PAYLOAD_MODE: Record<TaskCommand, TaskPayloadEnvelopeMode> = {
  [TASK_COMMANDS.listTasks]: "raw",
  [TASK_COMMANDS.createTask]: "input",
  [TASK_COMMANDS.updateTask]: "input",
  [TASK_COMMANDS.deleteTask]: "raw",
  [TASK_COMMANDS.completeTask]: "raw",
  [TASK_COMMANDS.setTaskPinned]: "raw",
  [TASK_COMMANDS.cleanupCompletedTasks]: "raw",
};

function toInvokePayload<TCommand extends TaskCommand>(
  command: TCommand,
  payload: TaskCommandPayloads[TCommand],
): Record<string, unknown> {
  if (TASK_COMMAND_PAYLOAD_MODE[command] === "input") {
    return { input: payload };
  }

  return payload as Record<string, unknown>;
}

async function invokeTaskCommand<TCommand extends TaskCommand>(
  command: TCommand,
  payload?: TaskCommandPayloads[TCommand],
): Promise<TaskCommandResponses[TCommand]> {
  // commandごとのpayload/responseを型で結び、IPC契約の食い違いをコンパイル時に検出する。
  if (typeof payload === "undefined") {
    return invoke<TaskCommandResponses[TCommand]>(command);
  }

  return invoke<TaskCommandResponses[TCommand]>(command, toInvokePayload(command, payload));
}

export interface TaskApi {
  listTasks: () => Promise<Task[]>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  updateTask: (input: UpdateTaskInput) => Promise<Task>;
  deleteTask: (id: TaskId) => Promise<Task[]>;
  completeTask: (id: TaskId) => Promise<Task[]>;
  setTaskPinned: (id: TaskId, isPinned: boolean) => Promise<Task>;
  cleanupCompletedTasks: () => Promise<number>;
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
};
