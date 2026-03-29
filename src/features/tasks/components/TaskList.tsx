import type { Task } from "../../../shared/types/task";
import { TaskCard, type TaskContextMenuPoint } from "./TaskCard";
import type { TasksLocale } from "./tasksI18n";
import { toTaskListClassName } from "./tasksWidgetConstants";

interface TaskListProps {
  tasks: readonly Task[];
  locale: TasksLocale;
  requiresScroll: boolean;
  onRequestTaskContextMenu: (task: Task, point: TaskContextMenuPoint) => void;
  onCompleteTask: (taskId: string) => void;
  now?: Date;
}

export function TaskList({ tasks, locale, requiresScroll, onRequestTaskContextMenu, onCompleteTask, now }: TaskListProps) {
  // 10件以上かつ展開時にのみ、selectors由来の requiresScroll でスクロールを有効化する。
  const listClassName = toTaskListClassName(requiresScroll);

  return (
    <ul className={listClassName} data-testid="tasks-list">
      {tasks.map((task) => (
        <li key={task.id} className="tasks-list__item">
          <TaskCard
            task={task}
            locale={locale}
            now={now}
            onRequestContextMenu={onRequestTaskContextMenu}
            onComplete={(targetTask) => onCompleteTask(targetTask.id)}
          />
        </li>
      ))}
    </ul>
  );
}
