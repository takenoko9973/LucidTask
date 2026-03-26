import type { CreateTaskInput, Task, TaskId, UpdateTaskInput } from "../../../shared/types/task";

export interface TasksState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  initialized: boolean;
  isExpanded: boolean;
}

export interface TasksViewModel {
  visibleTasks: Task[];
  totalCount: number;
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
  openCreateDialog: () => Promise<void>;
  openEditDialog: (id: TaskId) => Promise<void>;
}
