import { useEffect, useRef } from "react";
import { useWidgetWindowSizing } from "./features/tasks/components/useWidgetWindowSizing";
import { TasksProvider, TasksWidget, useTasksActions, useTasksState } from "./features/tasks";
import "./App.css";

const TASKS_MAINTENANCE_INTERVAL_MS = 60 * 1000;

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
  const isMaintenanceRunningRef = useRef(false);

  useWidgetWindowSizing({
    containerRef,
    watchValues: [
      state.tasks.length,
      state.isExpanded,
      state.loading,
      state.error,
      state.dialog.isOpen,
      state.dialog.mode,
      state.dialog.taskId,
    ],
  });

  useEffect(() => {
    const runMaintenanceCycle = () => {
      runBackground("tasks maintenance", async () => {
        if (isMaintenanceRunningRef.current) {
          return;
        }

        isMaintenanceRunningRef.current = true;
        try {
          await actions.cleanupCompletedTasks();
          await actions.initialize();
        } finally {
          isMaintenanceRunningRef.current = false;
        }
      });
    };

    runMaintenanceCycle();

    const intervalId = window.setInterval(() => {
      runMaintenanceCycle();
    }, TASKS_MAINTENANCE_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
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
  return <MainWidgetApp />;
}

export default App;
