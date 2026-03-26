import type { TaskId } from "../../../shared/types/task";
import type { TasksViewModel } from "../store";
import { ExpandToggle } from "./ExpandToggle";
import { TaskList } from "./TaskList";

interface TasksWidgetViewProps {
  viewModel: TasksViewModel;
  onToggleExpand: () => void;
  onOpenCreateDialog: () => void;
  onOpenEditDialog: (id: TaskId) => void;
  now?: Date;
}

export function TasksWidgetView({
  viewModel,
  onToggleExpand,
  onOpenCreateDialog,
  onOpenEditDialog,
  now,
}: TasksWidgetViewProps) {
  if (viewModel.totalCount === 0) {
    return (
      <section className="tasks-widget" aria-label="Tasks widget">
        <p className="tasks-widget__empty">No active tasks.</p>
        <button type="button" className="tasks-create-button" onClick={onOpenCreateDialog}>
          Add task
        </button>
      </section>
    );
  }

  return (
    <section className="tasks-widget" aria-label="Tasks widget">
      <div className="tasks-widget__actions">
        <button
          type="button"
          className="tasks-create-button"
          data-testid="create-task-button"
          onClick={onOpenCreateDialog}
        >
          Add task
        </button>
      </div>
      <TaskList
        tasks={viewModel.visibleTasks}
        requiresScroll={viewModel.requiresScroll}
        onEditTask={onOpenEditDialog}
        now={now}
      />
      <ExpandToggle
        show={viewModel.showExpandButton}
        isExpanded={viewModel.isExpanded}
        onToggle={onToggleExpand}
      />
    </section>
  );
}
