import { Pin } from "lucide-react";

import type { Task } from "../../../shared/types/task";
import { getTaskDeadlineText } from "./taskDeadlineText";
import { getTaskIndicator } from "./taskStatus";
import { getTasksMessages, type TasksLocale } from "./tasksI18n";
import { TASK_WIDGET_TEST_IDS } from "./tasksWidgetConstants";

export interface TaskContextMenuPoint {
  x: number;
  y: number;
}

interface TaskCardProps {
  task: Task;
  locale: TasksLocale;
  now?: Date;
  onRequestContextMenu?: (task: Task, point: TaskContextMenuPoint) => void;
  onComplete?: (task: Task) => void;
}

export function TaskCard({ task, locale, now, onRequestContextMenu, onComplete }: TaskCardProps) {
  const messages = getTasksMessages(locale);
  const indicator = getTaskIndicator(task, now, locale);
  const isCompleted = Boolean(task.completion);
  const deadlineText = getTaskDeadlineText(task, now, locale);

  return (
    <article
      className={`task-card${isCompleted ? " task-card--completed" : ""}`}
      data-testid={TASK_WIDGET_TEST_IDS.taskCard}
      data-task-card="true"
      data-indicator={indicator.kind}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onRequestContextMenu?.(task, { x: event.clientX, y: event.clientY });
      }}
    >
      {task.isPinned ? (
        <span className="task-card__pin-icon" aria-label={messages.card.pinnedAria}>
          <Pin size={12} />
        </span>
      ) : null}
      <div className={`task-card__indicator ${indicator.className}`}>
        <span className="task-card__indicator-dot" aria-hidden="true" />
        <span className="task-card__indicator-label">{indicator.label}</span>
      </div>
      <div className="task-card__content">
        <p className="task-card__title" title={task.title}>
          {task.title}
        </p>
        {deadlineText ? <p className="task-card__deadline">{deadlineText}</p> : null}
      </div>
      <div className="task-card__actions">
        <button
          type="button"
          className={`task-card__complete${isCompleted ? " task-card__complete--active" : ""}`}
          data-testid={TASK_WIDGET_TEST_IDS.completeTaskButton}
          aria-label={isCompleted ? messages.card.restoreAria : messages.card.completeAria}
          onClick={() => onComplete?.(task)}
        >
          <span
            className={`task-card__checkmark${isCompleted ? " task-card__checkmark--active" : ""}`}
            aria-hidden="true"
          >
            {isCompleted ? "✓" : ""}
          </span>
        </button>
      </div>
    </article>
  );
}
