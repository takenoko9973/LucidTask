import type {
  CreateTaskInput,
  Task,
  TaskId,
  UpdateTaskInput,
} from "./types/task";

export const TASK_COMMANDS = {
  listTasks: "list_tasks",
  createTask: "create_task",
  updateTask: "update_task",
  deleteTask: "delete_task",
  completeTask: "complete_task",
  setTaskPinned: "set_task_pinned",
  cleanupCompletedTasks: "cleanup_completed_tasks",
} as const;

export type TaskCommandName = (typeof TASK_COMMANDS)[keyof typeof TASK_COMMANDS];

export interface TaskCommandPayloads {
  [TASK_COMMANDS.listTasks]: void;
  [TASK_COMMANDS.createTask]: CreateTaskInput;
  [TASK_COMMANDS.updateTask]: UpdateTaskInput;
  [TASK_COMMANDS.deleteTask]: { id: TaskId };
  [TASK_COMMANDS.completeTask]: { id: TaskId };
  [TASK_COMMANDS.setTaskPinned]: { id: TaskId; isPinned: boolean };
  [TASK_COMMANDS.cleanupCompletedTasks]: void;
}

export interface TaskCommandResponses {
  [TASK_COMMANDS.listTasks]: Task[];
  [TASK_COMMANDS.createTask]: Task;
  [TASK_COMMANDS.updateTask]: Task;
  [TASK_COMMANDS.deleteTask]: Task[];
  [TASK_COMMANDS.completeTask]: Task[];
  [TASK_COMMANDS.setTaskPinned]: Task;
  // 72時間クリーンアップで削除された完了タスク件数を返す。
  [TASK_COMMANDS.cleanupCompletedTasks]: number;
}
