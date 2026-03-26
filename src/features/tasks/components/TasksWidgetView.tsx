import type { TasksViewModel } from "../store";
import { ExpandToggle } from "./ExpandToggle";
import { TaskList } from "./TaskList";

interface TasksWidgetViewProps {
  viewModel: TasksViewModel;
  onToggleExpand: () => void;
  now?: Date;
}

export function TasksWidgetView({ viewModel, onToggleExpand, now }: TasksWidgetViewProps) {
  if (viewModel.totalCount === 0) {
    return (
      <section className="tasks-widget" aria-label="Tasks widget">
        <p className="tasks-widget__empty">No active tasks.</p>
      </section>
    );
  }

  return (
    <section className="tasks-widget" aria-label="Tasks widget">
      <TaskList tasks={viewModel.visibleTasks} requiresScroll={viewModel.requiresScroll} now={now} />
      <ExpandToggle
        show={viewModel.showExpandButton}
        isExpanded={viewModel.isExpanded}
        onToggle={onToggleExpand}
      />
    </section>
  );
}
