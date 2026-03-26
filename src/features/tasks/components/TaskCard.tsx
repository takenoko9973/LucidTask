import type { Task } from "../../../shared/types/task";
import { getTaskIndicator } from "./taskStatus";

interface TaskCardProps {
  task: Task;
  now?: Date;
}

export function TaskCard({ task, now }: TaskCardProps) {
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
    </article>
  );
}
