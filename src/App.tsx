import { useEffect, useRef } from "react";
import { TaskDialog, parseTaskDialogRoute } from "./features/tasks/components/TaskDialog";
import { useWidgetWindowSizing } from "./features/tasks/components/useWidgetWindowSizing";
import { TasksProvider, TasksWidget, useTasksActions, useTasksState } from "./features/tasks";
import { TASK_EVENTS } from "./shared/events";
import "./App.css";

const COMPLETED_TASK_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function reportBackgroundError(operation: string, error: unknown) {
  console.error(`[tasks] ${operation} failed`, error);
}

function runBackground(operation: string, effect: () => Promise<unknown>) {
  void effect().catch((error) => {
    reportBackgroundError(operation, error);
  });
}

function TasksBootstrap() {
  const actions = useTasksActions();
  const state = useTasksState();
  const containerRef = useRef<HTMLElement | null>(null);

  useWidgetWindowSizing({
    containerRef,
    watchValues: [state.tasks.length, state.isExpanded, state.loading, state.error],
  });

  useEffect(() => {
    runBackground("initialize", () => actions.initialize());
    runBackground("startup cleanup", () => actions.cleanupCompletedTasks());

    const intervalId = window.setInterval(() => {
      runBackground("interval cleanup", () => actions.cleanupCompletedTasks());
    }, COMPLETED_TASK_CLEANUP_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [actions]);

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const stopListening = await listen(TASK_EVENTS.mutated, () => {
          runBackground("sync after task dialog", () => actions.initialize());
        });

        if (isDisposed) {
          stopListening();
          return;
        }

        unlisten = stopListening;
      } catch {
        // ブラウザ単体実行時はイベント購読をスキップする。
      }
    })();

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [actions]);

  return (
    <main className="container" ref={containerRef}>
      <TasksWidget />
    </main>
  );
}

function MainWidgetApp() {
  return (
    <TasksProvider>
      <TasksBootstrap />
    </TasksProvider>
  );
}

function App() {
  const taskDialogRoute =
    typeof window === "undefined" ? null : parseTaskDialogRoute(window.location.search);
  if (taskDialogRoute) {
    return <TaskDialog initialRoute={taskDialogRoute} />;
  }

  return <MainWidgetApp />;
}

export default App;
