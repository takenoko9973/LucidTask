import type { Task } from "../../../shared/types/task";
import { isDueTodayOrOverdue } from "../domain/taskOrdering";
import { getTasksMessages, type TaskIndicatorMessages, type TasksLocale } from "./tasksI18n";

export type TaskIndicatorKind = "completed" | "overdue-or-today" | "daily" | "future-deadline";

export interface TaskIndicator {
  kind: TaskIndicatorKind;
  label: string;
  className: string;
}

function buildIndicator(kind: TaskIndicatorKind, labels: TaskIndicatorMessages): TaskIndicator {
  const indicatorMeta: Record<TaskIndicatorKind, Pick<TaskIndicator, "label" | "className">> = {
    completed: { label: labels.completed, className: "task-card__indicator--completed" },
    "overdue-or-today": { label: labels.overdueOrToday, className: "task-card__indicator--due" },
    daily: { label: labels.daily, className: "task-card__indicator--daily" },
    "future-deadline": { label: labels.futureDeadline, className: "task-card__indicator--future" },
  };

  return {
    kind,
    ...indicatorMeta[kind],
  };
}

export function getTaskIndicator(
  task: Task,
  now: Date = new Date(),
  locale: TasksLocale = "ja",
): TaskIndicator {
  const labels = getTasksMessages(locale).indicator;
  if (task.taskType.kind === "daily") {
    return buildIndicator("daily", labels);
  }

  if (task.completedAt) {
    return buildIndicator("completed", labels);
  }

  if (isDueTodayOrOverdue(task.taskType.deadlineAt, now)) {
    return buildIndicator("overdue-or-today", labels);
  }

  return buildIndicator("future-deadline", labels);
}
