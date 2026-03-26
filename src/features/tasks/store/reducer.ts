import type { Task } from "../../../shared/types/task";
import { INITIAL_VISIBLE_TASK_COUNT, normalizeExpandedState } from "../selectors";
import type { TasksState } from "./types";

export type TasksAction =
  | { type: "tasks/operationStarted" }
  | { type: "tasks/operationFinished" }
  | { type: "tasks/operationFailed"; error: string }
  | { type: "tasks/initialized" }
  | { type: "tasks/replaceTasks"; tasks: Task[] }
  | { type: "tasks/upsertTask"; task: Task }
  | { type: "tasks/toggleExpand" };

export const initialTasksState: TasksState = {
  tasks: [],
  loading: false,
  error: null,
  initialized: false,
  isExpanded: false,
};

function withNormalizedExpansion(state: TasksState, tasks: Task[]): TasksState {
  // タスク数が閾値を下回ったときに展開状態を自動補正する。
  return {
    ...state,
    tasks,
    isExpanded: normalizeExpandedState(state.isExpanded, tasks.length),
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
      if (state.tasks.length <= INITIAL_VISIBLE_TASK_COUNT) {
        return {
          ...state,
          isExpanded: false,
        };
      }

      return {
        ...state,
        isExpanded: !state.isExpanded,
      };
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
}
