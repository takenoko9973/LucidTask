import { useCallback, useEffect, useRef } from "react";

import { showContextMenu, type ShowContextMenuInput } from "../../../shared/appCommands";
import type { Task } from "../../../shared/types/task";
import type { TasksViewModel } from "../store";
import { ExpandToggle } from "./ExpandToggle";
import { type TaskContextMenuPoint } from "./TaskCard";
import { TaskList } from "./TaskList";
import type { TasksLocale, TaskWidgetMessages } from "./tasksI18n";
import { formatActiveTaskTitle, TASK_WIDGET_SELECTORS, TASK_WIDGET_TEST_IDS } from "./tasksWidgetConstants";

interface TasksWidgetViewProps {
  viewModel: TasksViewModel;
  locale: TasksLocale;
  widgetMessages: TaskWidgetMessages;
  onToggleExpand: () => void;
  onOpenCreateDialog: () => void;
  onCompleteTask: (id: string) => void;
}

function reportNativeMenuError(error: unknown) {
  console.error("[tasks] showContextMenu failed", error);
}

export function createAppContextMenuInput(locale: TasksLocale, x: number, y: number): ShowContextMenuInput {
  return { kind: "app", locale, x, y };
}

export function createTaskContextMenuInput(
  locale: TasksLocale,
  task: Task,
  point: TaskContextMenuPoint,
): ShowContextMenuInput {
  return {
    kind: "task",
    locale,
    x: point.x,
    y: point.y,
    taskId: task.id,
    isPinned: task.isPinned,
    isCompleted: Boolean(task.completedAt),
  };
}

export function TasksWidgetView({
  viewModel,
  locale,
  widgetMessages,
  onToggleExpand,
  onOpenCreateDialog,
  onCompleteTask,
}: TasksWidgetViewProps) {
  const widgetRef = useRef<HTMLElement | null>(null);
  const activeTaskTitle = formatActiveTaskTitle(viewModel.activeCount, widgetMessages);
  const hasTasks = viewModel.totalCount > 0;

  const openAppContextMenu = useCallback(
    (x: number, y: number) => {
      void showContextMenu(createAppContextMenuInput(locale, x, y)).catch(reportNativeMenuError);
    },
    [locale],
  );

  const openTaskContextMenu = useCallback(
    (task: Task, point: TaskContextMenuPoint) => {
      void showContextMenu(createTaskContextMenuInput(locale, task, point)).catch(reportNativeMenuError);
    },
    [locale],
  );

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) {
      return;
    }

    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) {
        return;
      }

      // タスクカードは card 側の onContextMenu でネイティブメニューを開く。
      if (target.closest(TASK_WIDGET_SELECTORS.taskCard)) {
        return;
      }

      // タスク同士の隙間で app メニューが開かないようにする。
      if (target.closest(TASK_WIDGET_SELECTORS.taskList)) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      openAppContextMenu(event.clientX, event.clientY);
    };

    widget.addEventListener("contextmenu", handleContextMenu);
    return () => {
      widget.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [openAppContextMenu]);

  const header = (
    <header className="tasks-widget__header">
      <div className="tasks-widget__drag-handle" role="presentation" aria-hidden="true">
        <p className="tasks-widget__eyebrow">{widgetMessages.eyebrow}</p>
        <h2 className="tasks-widget__title">{activeTaskTitle}</h2>
      </div>
      <button
        type="button"
        className="tasks-create-button"
        data-testid={TASK_WIDGET_TEST_IDS.createTaskButton}
        onClick={onOpenCreateDialog}
      >
        {widgetMessages.addTask}
      </button>
    </header>
  );

  return (
    <section className="tasks-widget" aria-label="Tasks widget" ref={widgetRef}>
      <div className="tasks-widget__drag-strip" data-tauri-drag-region role="presentation" aria-hidden="true" />
      {header}
      {hasTasks ? (
        <TaskList
          tasks={viewModel.visibleTasks}
          locale={locale}
          requiresScroll={viewModel.requiresScroll}
          onRequestTaskContextMenu={openTaskContextMenu}
          onCompleteTask={onCompleteTask}
        />
      ) : (
        <p className="tasks-widget__empty">{widgetMessages.emptyMessage}</p>
      )}
      {hasTasks ? (
        <ExpandToggle
          show={viewModel.showExpandButton}
          isExpanded={viewModel.isExpanded}
          expandLabel={widgetMessages.showMore}
          collapseLabel={widgetMessages.showLess}
          onToggle={onToggleExpand}
        />
      ) : null}
    </section>
  );
}
