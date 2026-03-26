import type { Task } from "../../../shared/types/task";
import { getTaskIndicator } from "./taskStatus";

interface TaskCardProps {
  task: Task;
  now?: Date;
  onEdit?: (task: Task) => void;
}

export function TaskCard({ task, now, onEdit }: TaskCardProps) {
  const indicator = getTaskIndicator(task, now);

  return (
    <article className="task-card" data-testid="task-card" data-indicator={indicator.kind}>
      <div className={`task-card__indicator ${indicator.className}`}>
        <span className="task-card__indicator-dot" aria-hidden="true" />
        <span className="task-card__indicator-label">{indicator.label}</span>
      </div>
      <p className="task-card__title" title={task.title}>
        {task.title}
      </p>
      <button
        type="button"
        className="task-card__edit"
        data-testid="edit-task-button"
        onClick={() => onEdit?.(task)}
      >
        Edit
      </button>
    </article>
  );
}
