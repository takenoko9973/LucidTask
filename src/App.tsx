import { useEffect } from "react";
import { TasksProvider, TasksWidget, useTasksActions } from "./features/tasks";
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

  return (
    <main className="container">
      <TasksWidget />
    </main>
  );
}

function App() {
  return (
    <TasksProvider>
      <TasksBootstrap />
    </TasksProvider>
  );
}

export default App;
