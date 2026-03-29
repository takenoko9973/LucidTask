import type { Task } from "../../../shared/types/task";
import { canExpandTaskList, countActiveTasks, normalizeExpandedState } from "../selectors";
import type { TasksDialogState, TasksState } from "./types";

export type TasksAction =
  | { type: "tasks/operationStarted" }
  | { type: "tasks/operationFinished" }
  | { type: "tasks/operationFailed"; error: string }
  | { type: "tasks/initialized" }
  | { type: "tasks/replaceTasks"; tasks: Task[] }
  | { type: "tasks/upsertTask"; task: Task }
  | { type: "tasks/toggleExpand" }
  | { type: "tasks/openCreateDialog" }
  | { type: "tasks/openEditDialog"; id: string }
  | { type: "tasks/closeDialog" };

const closedDialogState: TasksDialogState = {
  isOpen: false,
  mode: "create",
  taskId: null,
};

function normalizeDialogState(dialog: TasksDialogState, tasks: Task[]): TasksDialogState {
  if (!dialog.isOpen || dialog.mode !== "edit" || !dialog.taskId) {
    return dialog;
  }
  const hasTargetTask = tasks.some((task) => task.id === dialog.taskId);
  return hasTargetTask ? dialog : closedDialogState;
}

export const initialTasksState: TasksState = {
  tasks: [],
  loading: false,
  error: null,
  initialized: false,
  isExpanded: false,
  dialog: closedDialogState,
};

function withNormalizedExpansion(state: TasksState, tasks: Task[]): TasksState {
  const activeCount = countActiveTasks(tasks);
  // タスク数が閾値を下回ったときに展開状態を自動補正する。
  return {
    ...state,
    tasks,
    isExpanded: normalizeExpandedState(state.isExpanded, activeCount, tasks.length),
    dialog: normalizeDialogState(state.dialog, tasks),
  };
}

function upsertTask(tasks: Task[], updatedTask: Task): Task[] {
  // create/update/setPinned の単一Taskレスポンスを共通で反映する。
  const targetIndex = tasks.findIndex((task) => task.id === updatedTask.id);
  if (targetIndex === -1) {
    return [...tasks, updatedTask];
  }

  const nextTasks = [...tasks];
  nextTasks[targetIndex] = updatedTask;
  return nextTasks;
}

export function tasksReducer(state: TasksState, action: TasksAction): TasksState {
  switch (action.type) {
    case "tasks/operationStarted":
      return {
        ...state,
        loading: true,
        error: null,
      };
    case "tasks/operationFinished":
      return {
        ...state,
        loading: false,
      };
    case "tasks/operationFailed":
      return {
        ...state,
        loading: false,
        error: action.error,
      };
    case "tasks/initialized":
      return {
        ...state,
        initialized: true,
      };
    case "tasks/replaceTasks":
      return withNormalizedExpansion(state, action.tasks);
    case "tasks/upsertTask":
      return withNormalizedExpansion(state, upsertTask(state.tasks, action.task));
    case "tasks/toggleExpand":
      if (!canExpandTaskList(countActiveTasks(state.tasks), state.tasks.length)) {
        return {
          ...state,
          isExpanded: false,
        };
      }

      return {
        ...state,
        isExpanded: !state.isExpanded,
      };
    case "tasks/openCreateDialog":
      return {
        ...state,
        dialog: {
          isOpen: true,
          mode: "create",
          taskId: null,
        },
      };
    case "tasks/openEditDialog":
      return {
        ...state,
        dialog: {
          isOpen: true,
          mode: "edit",
          taskId: action.id,
        },
      };
    case "tasks/closeDialog":
      return {
        ...state,
        dialog: closedDialogState,
      };
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
}
