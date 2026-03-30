import { useEffect, useMemo, useState } from "react";

import { type NativeMenuActionPayload } from "../../../shared/appCommands";
import { useTasksActions, useTasksState, useTasksViewModel } from "../store";
import "../styles/tasks-widget.css";
import { TaskDialog } from "./TaskDialog";
import {
  getTasksMessages,
  isTasksLocale,
  loadTasksLocale,
  saveTasksLocale,
  type TasksLocale,
} from "./tasksI18n";
import { TasksWidgetView } from "./TasksWidgetView";
import type { TaskId } from "../../../shared/types/task";

function reportUiError(operation: string, error: unknown) {
  console.error(`[tasks] ${operation} failed`, error);
}

export function applyNativeMenuAction(
  payload: NativeMenuActionPayload,
  options: {
    setLocale: (locale: TasksLocale) => void;
    openEditDialog: (taskId: TaskId) => void;
    setTaskPinned: (taskId: TaskId, isPinned: boolean) => Promise<unknown>;
    deleteTask: (taskId: TaskId) => Promise<unknown>;
  },
): void {
  if (payload.action === "set-locale") {
    if (isTasksLocale(payload.locale)) {
      options.setLocale(payload.locale);
    }
    return;
  }

  if (payload.action === "task-edit") {
    options.openEditDialog(payload.taskId);
    return;
  }

  if (payload.action === "task-delete") {
    void options.deleteTask(payload.taskId);
    return;
  }

  void options.setTaskPinned(payload.taskId, payload.nextIsPinned);
}

export function TasksWidget() {
  const state = useTasksState();
  const actions = useTasksActions();
  const viewModel = useTasksViewModel();
  const [locale, setLocale] = useState<TasksLocale>(() => loadTasksLocale());
  const messages = useMemo(() => getTasksMessages(locale), [locale]);

  function handleCompleteTask(id: string) {
    void actions.completeTask(id).catch((error) => {
      reportUiError("completeTask", error);
    });
  }

  function handleChangeLocale(nextLocale: TasksLocale) {
    setLocale(nextLocale);
    saveTasksLocale(nextLocale);
  }

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isDisposed = false;

    async function subscribeNativeMenuActions() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unsubscribe = await listen<NativeMenuActionPayload>("tasks:native-menu-action", (event) => {
          applyNativeMenuAction(event.payload, {
            setLocale: handleChangeLocale,
            openEditDialog: actions.openEditDialog,
            setTaskPinned: (taskId, isPinned) =>
              actions.setTaskPinned(taskId, isPinned).catch((error) => {
                reportUiError("setTaskPinned", error);
              }),
            deleteTask: (taskId) =>
              actions.deleteTask(taskId).catch((error) => {
                reportUiError("deleteTask", error);
              }),
          });
        });

        if (isDisposed) {
          unsubscribe();
          return;
        }

        unlisten = unsubscribe;
      } catch (error) {
        // ブラウザ単体実行ではTauri event APIが利用できないため、購読失敗を許容する。
        reportUiError("listen native menu action", error);
      }
    }

    void subscribeNativeMenuActions();

    return () => {
      isDisposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [actions]);

  const dialogRoute = state.dialog.isOpen
    ? {
        mode: state.dialog.mode,
        ...(state.dialog.taskId ? { taskId: state.dialog.taskId } : {}),
      }
    : null;

  if (!state.initialized && state.loading) {
    // 初回同期中のみローディングを出す。初期化後の更新操作は一覧を維持してちらつきを防ぐ。
    return (
      <section className="tasks-widget" aria-label="Tasks widget">
        <p className="tasks-widget__status">{messages.widget.loading}</p>
      </section>
    );
  }

  if (!state.initialized && state.error && !state.loading) {
    return (
      <section className="tasks-widget" aria-label="Tasks widget">
        <p className="tasks-widget__status" role="alert">
          {state.error}
        </p>
      </section>
    );
  }

  return (
    <>
      <TasksWidgetView
        viewModel={viewModel}
        locale={locale}
        widgetMessages={messages.widget}
        onToggleExpand={actions.toggleExpand}
        onOpenCreateDialog={actions.openCreateDialog}
        onCompleteTask={handleCompleteTask}
      />
      <TaskDialog
        route={dialogRoute}
        locale={locale}
        tasks={state.tasks}
        onClose={actions.closeDialog}
        onCreateTask={actions.createTask}
        onUpdateTask={actions.updateTask}
      />
    </>
  );
}
