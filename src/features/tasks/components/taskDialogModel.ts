import type { Task, TaskType } from "../../../shared/types/task";
import { getTasksMessages, type TaskDialogMessages } from "./tasksI18n";

export type TaskDialogMode = "create" | "edit";
export type TaskDialogTypeKind = TaskType["kind"];
export const TASK_DIALOG_DEADLINE_STEP_MINUTES = 15;

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
  now: Date = new Date(),
): TaskDialogFormSnapshot {
  if (route.mode === "create") {
    return createTaskDialogSnapshot({
      deadlineAt: resolveDefaultTaskDialogDeadlineInput(now),
    });
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

export function buildTaskDialogRouteKey(route: TaskDialogRoute | null): string | null {
  if (!route) {
    return null;
  }
  if (route.mode === "create") {
    return "create";
  }

  const taskId = route.taskId?.trim() ?? "";
  return `edit:${taskId}`;
}

export function shouldResetTaskDialogForm(
  previousRouteKey: string | null,
  nextRouteKey: string | null,
): boolean {
  if (!nextRouteKey) {
    return false;
  }

  return previousRouteKey !== nextRouteKey;
}

export interface TaskDialogDeadlineParts {
  date: string;
  time: string;
}

export function splitTaskDialogDeadlineInput(deadlineAt: string): TaskDialogDeadlineParts {
  const [date = "", time = ""] = deadlineAt.split("T");
  if (!date) {
    return { date: "", time: "" };
  }
  return { date, time: time.slice(0, 5) };
}

export function joinTaskDialogDeadlineInput(date: string, time: string): string {
  if (!date || !time) {
    return "";
  }
  return `${date}T${time}`;
}

export function buildTaskDialogDeadlineTimeOptions(
  stepMinutes: number = TASK_DIALOG_DEADLINE_STEP_MINUTES,
): string[] {
  const options: string[] = [];
  const safeStep = Math.max(1, Math.floor(stepMinutes));
  const totalMinutesInDay = 24 * 60;

  for (let minute = 0; minute < totalMinutesInDay; minute += safeStep) {
    const hour = Math.floor(minute / 60);
    const minuteInHour = minute % 60;
    options.push(`${String(hour).padStart(2, "0")}:${String(minuteInHour).padStart(2, "0")}`);
  }

  return options;
}

export function resolveDefaultTaskDialogDeadlineTime(
  now: Date = new Date(),
  stepMinutes: number = TASK_DIALOG_DEADLINE_STEP_MINUTES,
): string {
  return resolveDefaultTaskDialogDeadlineParts(now, stepMinutes).time;
}

export function resolveDefaultTaskDialogDeadlineInput(
  now: Date = new Date(),
  stepMinutes: number = TASK_DIALOG_DEADLINE_STEP_MINUTES,
): string {
  const parts = resolveDefaultTaskDialogDeadlineParts(now, stepMinutes);
  return joinTaskDialogDeadlineInput(parts.date, parts.time);
}

function resolveDefaultTaskDialogDeadlineParts(
  now: Date,
  stepMinutes: number,
): TaskDialogDeadlineParts {
  const safeStep = Math.max(1, Math.floor(stepMinutes));
  const totalMinutesInDay = 24 * 60;
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  // 現在時刻「以降」で最も近い枠を選ぶため、常に切り上げる。
  const roundedMinute = Math.ceil(currentMinute / safeStep) * safeStep;
  // 24:00を超えた場合は翌日に繰り上げる。
  const dayOffset = Math.floor(roundedMinute / totalMinutesInDay);
  const normalizedMinute = roundedMinute % totalMinutesInDay;
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  const hour = Math.floor(normalizedMinute / 60);
  const minute = normalizedMinute % 60;
  return {
    date: formatLocalDate(date),
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
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
