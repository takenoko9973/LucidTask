import type { Task, TaskType } from "../../../shared/types/task";
import { getTasksMessages, type TaskDialogMessages } from "./tasksI18n";

export type TaskDialogMode = "create" | "edit";
export type TaskDialogTypeKind = TaskType["kind"];

export interface TaskDialogRoute {
  mode: TaskDialogMode;
  taskId?: string;
}

export interface TaskDialogFormSnapshot {
  title: string;
  taskTypeKind: TaskDialogTypeKind;
  deadlineAt: string;
  isPinned: boolean;
  error: string | null;
}

type TaskDialogErrorMessages = Pick<
  TaskDialogMessages,
  "taskIdRequired" | "requiredTitle" | "requiredDeadline" | "taskNotFound"
>;

const DEFAULT_TASK_DIALOG_ERRORS: TaskDialogErrorMessages = {
  taskIdRequired: getTasksMessages("en").dialog.taskIdRequired,
  requiredTitle: getTasksMessages("en").dialog.requiredTitle,
  requiredDeadline: getTasksMessages("en").dialog.requiredDeadline,
  taskNotFound: getTasksMessages("en").dialog.taskNotFound,
};

const CREATE_DIALOG_DEFAULT_SNAPSHOT: TaskDialogFormSnapshot = {
  title: "",
  taskTypeKind: "deadline",
  deadlineAt: "",
  isPinned: false,
  error: null,
};

function createTaskDialogSnapshot(
  overrides: Partial<TaskDialogFormSnapshot> = {},
): TaskDialogFormSnapshot {
  return {
    ...CREATE_DIALOG_DEFAULT_SNAPSHOT,
    ...overrides,
  };
}

function toLocalDateTimeInputValue(isoDateTime: string): string {
  const source = new Date(isoDateTime);
  if (Number.isNaN(source.getTime())) {
    return "";
  }
  const shifted = new Date(source.getTime() - source.getTimezoneOffset() * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

export function buildTaskDialogInitialSnapshot(
  route: TaskDialogRoute,
  tasks: readonly Task[],
  errors: TaskDialogErrorMessages = DEFAULT_TASK_DIALOG_ERRORS,
): TaskDialogFormSnapshot {
  if (route.mode === "create") {
    return createTaskDialogSnapshot();
  }

  const taskId = route.taskId?.trim();
  if (!taskId) {
    return createTaskDialogSnapshot({ error: errors.taskIdRequired });
  }

  const targetTask = tasks.find((task) => task.id === taskId);
  if (!targetTask) {
    return createTaskDialogSnapshot({ error: errors.taskNotFound(taskId) });
  }

  return {
    title: targetTask.title,
    taskTypeKind: targetTask.taskType.kind,
    deadlineAt:
      targetTask.taskType.kind === "deadline"
        ? toLocalDateTimeInputValue(targetTask.taskType.deadlineAt)
        : "",
    isPinned: targetTask.isPinned,
    error: null,
  };
}

export function validateTaskDialogForm(
  title: string,
  taskTypeKind: TaskDialogTypeKind,
  deadlineAt: string,
  errors: TaskDialogErrorMessages = DEFAULT_TASK_DIALOG_ERRORS,
): string | null {
  if (!title.trim()) {
    return errors.requiredTitle;
  }
  if (taskTypeKind === "deadline" && !deadlineAt) {
    return errors.requiredDeadline;
  }
  return null;
}

export function toTaskType(kind: TaskDialogTypeKind, deadlineAt: string): TaskType {
  if (kind === "daily") {
    return { kind: "daily" };
  }
  return {
    kind: "deadline",
    deadlineAt: new Date(`${deadlineAt}:00`).toISOString(),
  };
}
