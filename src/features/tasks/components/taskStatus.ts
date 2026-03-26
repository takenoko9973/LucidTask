import type { Task } from "../../../shared/types/task";
import { isDueTodayOrOverdue } from "../domain/taskOrdering";

export type TaskIndicatorKind = "pinned" | "overdue-or-today" | "daily" | "future-deadline";

export interface TaskIndicator {
  kind: TaskIndicatorKind;
  label: string;
  className: string;
}

const INDICATOR_META: Record<TaskIndicatorKind, Pick<TaskIndicator, "label" | "className">> = {
  pinned: { label: "Pinned", className: "task-card__indicator--pinned" },
  "overdue-or-today": { label: "Due", className: "task-card__indicator--due" },
  daily: { label: "Daily", className: "task-card__indicator--daily" },
  "future-deadline": { label: "Upcoming", className: "task-card__indicator--future" },
};

function buildIndicator(kind: TaskIndicatorKind): TaskIndicator {
  return {
    kind,
    ...INDICATOR_META[kind],
  };
}

export function getTaskIndicator(task: Task, now: Date = new Date()): TaskIndicator {
  // 表示優先度は仕様のソート優先度に合わせる（固定 > daily > 期限系）。
  if (task.isPinned) {
    return buildIndicator("pinned");
  }

  if (task.taskType.kind === "daily") {
    return buildIndicator("daily");
  }

  if (isDueTodayOrOverdue(task.taskType.deadlineAt, now)) {
    return buildIndicator("overdue-or-today");
  }

  return buildIndicator("future-deadline");
}
