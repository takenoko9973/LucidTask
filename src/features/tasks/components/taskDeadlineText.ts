import type { Task } from "../../../shared/types/task";
import { getTasksMessages, type TasksLocale } from "./tasksI18n";

export function getTaskDeadlineText(
  task: Task,
  now: Date = new Date(),
  locale: TasksLocale = "ja",
): string | null {
  if (task.taskType.kind !== "deadline") {
    return null;
  }
  const messages = getTasksMessages(locale).deadline;

  const deadlineTimestamp = Date.parse(task.taskType.deadlineAt);
  if (Number.isNaN(deadlineTimestamp)) {
    return null;
  }

  const diffMs = deadlineTimestamp - now.getTime();
  if (diffMs < 0) {
    return messages.overdue;
  }

  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 60) {
    return messages.minutes(diffMinutes);
  }

  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  if (diffHours < 24) {
    return messages.hours(diffHours);
  }

  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return messages.days(diffDays);
}
