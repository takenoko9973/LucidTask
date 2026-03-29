import type { CreateTaskInput, Task, TaskId, UpdateTaskInput } from "../../../shared/types/task";

export type TasksDialogMode = "create" | "edit";

export interface TasksDialogState {
  isOpen: boolean;
  mode: TasksDialogMode;
  taskId: TaskId | null;
}

export interface TasksState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  initialized: boolean;
  isExpanded: boolean;
  dialog: TasksDialogState;
}

export interface TasksViewModel {
  visibleTasks: Task[];
  totalCount: number;
  activeCount: number;
  showExpandButton: boolean;
  requiresScroll: boolean;
  isExpanded: boolean;
}

export interface TasksActions {
  initialize: () => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  updateTask: (input: UpdateTaskInput) => Promise<Task>;
  deleteTask: (id: TaskId) => Promise<Task[]>;
  completeTask: (id: TaskId) => Promise<Task[]>;
  setTaskPinned: (id: TaskId, isPinned: boolean) => Promise<Task>;
  cleanupCompletedTasks: () => Promise<number>;
  toggleExpand: () => void;
  openCreateDialog: () => void;
  openEditDialog: (id: TaskId) => void;
  closeDialog: () => void;
}
