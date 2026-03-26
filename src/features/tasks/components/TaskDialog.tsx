import { useEffect, useMemo, useState, type FormEvent } from "react";

import { TASK_EVENTS } from "../../../shared/events";
import type { OpenTaskDialogInput, TaskDialogMode } from "../../../shared/ipc";
import type { CreateTaskInput, Task, TaskType, UpdateTaskInput } from "../../../shared/types/task";
import { taskApi } from "../api/taskApi";
import "../styles/task-dialog.css";

type DialogTaskType = TaskType["kind"];

export interface TaskDialogRoute {
  mode: TaskDialogMode;
  taskId?: string;
}

function normalizeDialogRoute(route: OpenTaskDialogInput): TaskDialogRoute | null {
  const taskId = route.taskId?.trim();
  if (route.mode === "edit" && !taskId) {
    return null;
  }

  if (route.mode === "create") {
    return { mode: "create" };
  }

  return { mode: "edit", taskId };
}

export function parseTaskDialogRoute(search: string): TaskDialogRoute | null {
  const params = new URLSearchParams(search);
  if (params.get("view") !== "task-dialog") {
    return null;
  }

  const mode = params.get("mode");
  if (mode !== "create" && mode !== "edit") {
    return null;
  }

  const taskId = params.get("taskId")?.trim();
  if (mode === "edit" && !taskId) {
    return null;
  }

  return mode === "create" ? { mode } : { mode, taskId };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function toLocalDateTimeInputValue(isoDateTime: string): string {
  const source = new Date(isoDateTime);
  if (Number.isNaN(source.getTime())) {
    return "";
  }

  const shifted = new Date(source.getTime() - source.getTimezoneOffset() * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

function toTaskType(kind: DialogTaskType, deadlineAt: string): TaskType {
  if (kind === "daily") {
    return { kind: "daily" };
  }

  return {
    kind: "deadline",
    deadlineAt: new Date(`${deadlineAt}:00`).toISOString(),
  };
}

function toDialogPath(route: TaskDialogRoute): string {
  const params = new URLSearchParams({
    view: "task-dialog",
    mode: route.mode,
  });

  if (route.mode === "edit" && route.taskId) {
    params.set("taskId", route.taskId);
  }

  return `${window.location.pathname}?${params.toString()}`;
}

function getTaskTypeKind(task: Task): DialogTaskType {
  return task.taskType.kind;
}

export function TaskDialog({ initialRoute }: { initialRoute: TaskDialogRoute }) {
  const [route, setRoute] = useState<TaskDialogRoute>(initialRoute);
  const [title, setTitle] = useState("");
  const [taskTypeKind, setTaskTypeKind] = useState<DialogTaskType>("daily");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isDisposed = false;

    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<OpenTaskDialogInput>(TASK_EVENTS.dialogRoute, (event) => {
          if (isDisposed) {
            return;
          }

          const nextRoute = normalizeDialogRoute(event.payload);
          if (!nextRoute) {
            return;
          }

          setRoute(nextRoute);
        });
      } catch {
        // テストやブラウザ単体実行では購読をスキップする。
      }
    })();

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    window.history.replaceState(null, "", toDialogPath(route));
  }, [route]);

  useEffect(() => {
    let isDisposed = false;
    setError(null);

    if (route.mode === "create") {
      setTitle("");
      setTaskTypeKind("daily");
      setDeadlineAt("");
      setIsPinned(false);
      setIsLoading(false);
      return () => {
        isDisposed = true;
      };
    }

    setIsLoading(true);
    void taskApi
      .listTasks()
      .then((tasks) => {
        if (isDisposed) {
          return;
        }

        const targetTask = tasks.find((task) => task.id === route.taskId);
        if (!targetTask) {
          setError(`Task not found: ${route.taskId}`);
          return;
        }

        setTitle(targetTask.title);
        const taskKind = getTaskTypeKind(targetTask);
        setTaskTypeKind(taskKind);
        setDeadlineAt(
          targetTask.taskType.kind === "deadline"
            ? toLocalDateTimeInputValue(targetTask.taskType.deadlineAt)
            : "",
        );
        setIsPinned(targetTask.isPinned);
      })
      .catch((loadError) => {
        if (isDisposed) {
          return;
        }

        setError(toErrorMessage(loadError));
      })
      .finally(() => {
        if (isDisposed) {
          return;
        }

        setIsLoading(false);
      });

    return () => {
      isDisposed = true;
    };
  }, [route]);

  const modeLabel = useMemo(() => (route.mode === "create" ? "Add task" : "Edit task"), [route.mode]);

  const closeDialog = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch {
      // テストやブラウザ単体実行ではwindow APIがないため何もしない。
    }
  };

  const emitMutated = async () => {
    try {
      const { emit } = await import("@tauri-apps/api/event");
      await emit(TASK_EVENTS.mutated);
    } catch {
      // テストやブラウザ単体実行ではemitをスキップする。
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      const normalizedTitle = title.trim();
      if (!normalizedTitle) {
        setError("Task title is required.");
        return;
      }

      if (taskTypeKind === "deadline" && !deadlineAt) {
        setError("Deadline is required for deadline tasks.");
        return;
      }

      const taskType = toTaskType(taskTypeKind, deadlineAt);
      if (route.mode === "create") {
        const createInput: CreateTaskInput = {
          title: normalizedTitle,
          taskType,
          isPinned,
        };
        await taskApi.createTask(createInput);
      } else {
        if (!route.taskId) {
          setError("taskId is required in edit mode.");
          return;
        }

        const updateInput: UpdateTaskInput = {
          id: route.taskId,
          title: normalizedTitle,
          taskType,
          isPinned,
        };
        await taskApi.updateTask(updateInput);
      }

      await emitMutated();
      await closeDialog();
    } catch (submitError) {
      setError(toErrorMessage(submitError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="task-dialog">
      <section className="task-dialog__panel" aria-label="Task dialog">
        <h1 className="task-dialog__title">{modeLabel}</h1>
        <form className="task-dialog__form" onSubmit={handleSubmit}>
          <label className="task-dialog__field">
            <span>Title</span>
            <input
              type="text"
              className="task-dialog__input"
              value={title}
              disabled={isSaving || isLoading}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <fieldset className="task-dialog__fieldset" disabled={isSaving || isLoading}>
            <legend>Type</legend>
            <label className="task-dialog__choice">
              <input
                type="radio"
                name="task-type"
                value="daily"
                checked={taskTypeKind === "daily"}
                onChange={() => setTaskTypeKind("daily")}
              />
              Daily
            </label>
            <label className="task-dialog__choice">
              <input
                type="radio"
                name="task-type"
                value="deadline"
                checked={taskTypeKind === "deadline"}
                onChange={() => setTaskTypeKind("deadline")}
              />
              Deadline
            </label>
          </fieldset>

          {taskTypeKind === "deadline" ? (
            <label className="task-dialog__field">
              <span>Deadline</span>
              <input
                type="datetime-local"
                className="task-dialog__input"
                value={deadlineAt}
                disabled={isSaving || isLoading}
                onChange={(event) => setDeadlineAt(event.target.value)}
              />
            </label>
          ) : null}

          <label className="task-dialog__choice">
            <input
              type="checkbox"
              checked={isPinned}
              disabled={isSaving || isLoading}
              onChange={(event) => setIsPinned(event.target.checked)}
            />
            Pin this task
          </label>

          {isLoading ? <p className="task-dialog__status">Loading task...</p> : null}
          {error ? (
            <p className="task-dialog__status task-dialog__status--error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="task-dialog__actions">
            <button type="button" className="task-dialog__button task-dialog__button--ghost" onClick={closeDialog}>
              Cancel
            </button>
            <button type="submit" className="task-dialog__button" disabled={isSaving || isLoading}>
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
