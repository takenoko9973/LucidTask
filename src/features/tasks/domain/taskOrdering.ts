import type { Task } from "../../../shared/types/task";

export type TaskSortGroup = 0 | 1 | 2 | 3;

export interface TaskSortKey {
  group: TaskSortGroup;
  deadlineValue: number;
  title: string;
  id: string;
}

const DAILY_SORT_VALUE = Number.POSITIVE_INFINITY;

export function toLocalDateValue(date: Date): number {
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
}

export function toDeadlineTimestamp(deadlineAt: string): number {
  const timestamp = Date.parse(deadlineAt);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

export function isDueTodayOrOverdue(deadlineAt: string, now: Date): boolean {
  const deadlineDate = new Date(deadlineAt);
  if (Number.isNaN(deadlineDate.getTime())) {
    return false;
  }

  return toLocalDateValue(deadlineDate) <= toLocalDateValue(now);
}

export function toTaskSortKey(task: Task, now: Date): TaskSortKey {
  // group: 0=固定, 1=期限超過/当日, 2=daily, 3=未来期限
  if (task.isPinned) {
    return {
      group: 0,
      deadlineValue:
        task.taskType.kind === "deadline" ? toDeadlineTimestamp(task.taskType.deadlineAt) : DAILY_SORT_VALUE,
      title: task.title,
      id: task.id,
    };
  }

  if (task.taskType.kind === "daily") {
    return {
      group: 2,
      deadlineValue: DAILY_SORT_VALUE,
      title: task.title,
      id: task.id,
    };
  }

  return {
    group: isDueTodayOrOverdue(task.taskType.deadlineAt, now) ? 1 : 3,
    deadlineValue: toDeadlineTimestamp(task.taskType.deadlineAt),
    title: task.title,
    id: task.id,
  };
}

export function compareTaskSortKeys(left: TaskSortKey, right: TaskSortKey): number {
  if (left.group !== right.group) {
    return left.group - right.group;
  }

  if (left.deadlineValue !== right.deadlineValue) {
    return left.deadlineValue - right.deadlineValue;
  }

  const titleCompare = left.title.localeCompare(right.title);
  if (titleCompare !== 0) {
    return titleCompare;
  }

  return left.id.localeCompare(right.id);
}
