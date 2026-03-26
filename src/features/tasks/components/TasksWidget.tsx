import { useTasksActions, useTasksState, useTasksViewModel } from "../store";
import "../styles/tasks-widget.css";
import { TasksWidgetView } from "./TasksWidgetView";

export function TasksWidget() {
  const state = useTasksState();
  const actions = useTasksActions();
  const viewModel = useTasksViewModel();

  if (!state.initialized && state.loading) {
    // 初回同期中のみローディングを出す。初期化後の更新操作は一覧を維持してちらつきを防ぐ。
    return (
      <section className="tasks-widget" aria-label="Tasks widget">
        <p className="tasks-widget__status">Loading tasks...</p>
      </section>
    );
  }

  if (state.error && !state.loading) {
    return (
      <section className="tasks-widget" aria-label="Tasks widget">
        <p className="tasks-widget__status" role="alert">
          {state.error}
        </p>
      </section>
    );
  }

  return <TasksWidgetView viewModel={viewModel} onToggleExpand={actions.toggleExpand} />;
}
