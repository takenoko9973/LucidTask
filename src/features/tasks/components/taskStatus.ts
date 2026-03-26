import type { Task } from "../../../shared/types/task";

export type TaskIndicatorKind = "pinned" | "overdue-or-today" | "daily" | "future-deadline";

export interface TaskIndicator {
  kind: TaskIndicatorKind;
  label: string;
  className: string;
}

function toLocalDateValue(date: Date): number {
  // 期限超過/当日判定を日単位で行うため、時刻を落とした比較キーを作る。
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function isDueTodayOrOverdue(deadlineAt: string, now: Date): boolean {
  const deadlineDate = new Date(deadlineAt);
  if (Number.isNaN(deadlineDate.getTime())) {
    return false;
  }

  return toLocalDateValue(deadlineDate) <= toLocalDateValue(now);
}

export function getTaskIndicator(task: Task, now: Date = new Date()): TaskIndicator {
  // 表示優先度は仕様のソート優先度に合わせる（固定 > daily > 期限系）。
  if (task.isPinned) {
    return {
      kind: "pinned",
      label: "Pinned",
      className: "task-card__indicator--pinned",
    };
  }

  if (task.taskType.kind === "daily") {
    return {
      kind: "daily",
      label: "Daily",
      className: "task-card__indicator--daily",
    };
  }

  if (isDueTodayOrOverdue(task.taskType.deadlineAt, now)) {
    return {
      kind: "overdue-or-today",
      label: "Due",
      className: "task-card__indicator--due",
    };
  }

  return {
    kind: "future-deadline",
    label: "Upcoming",
    className: "task-card__indicator--future",
  };
}
