import type { Task } from "../../../shared/types/task";
import { TaskCard } from "./TaskCard";

interface TaskListProps {
  tasks: readonly Task[];
  requiresScroll: boolean;
  now?: Date;
}

export function TaskList({ tasks, requiresScroll, now }: TaskListProps) {
  // 10件以上かつ展開時にのみ、selectors由来の requiresScroll でスクロールを有効化する。
  const listClassName = requiresScroll ? "tasks-list tasks-list--scrollable" : "tasks-list";

  return (
    <ul className={listClassName} data-testid="tasks-list">
      {tasks.map((task) => (
        <li key={task.id} className="tasks-list__item">
          <TaskCard task={task} now={now} />
        </li>
      ))}
    </ul>
  );
}
