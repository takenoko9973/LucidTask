import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { CreateTaskInput, Task, UpdateTaskInput } from "../../../shared/types/task";
import "../styles/task-dialog.css";
import {
  buildTaskDialogInitialSnapshot,
  toTaskType,
  validateTaskDialogForm,
  type TaskDialogRoute,
  type TaskDialogTypeKind,
} from "./taskDialogModel";
import { getTasksMessages, type TasksLocale } from "./tasksI18n";

export type { TaskDialogRoute } from "./taskDialogModel";

interface TaskDialogProps {
  route: TaskDialogRoute | null;
  locale: TasksLocale;
  tasks: readonly Task[];
  onClose: () => void;
  onCreateTask: (input: CreateTaskInput) => Promise<unknown>;
  onUpdateTask: (input: UpdateTaskInput) => Promise<unknown>;
  onDeleteTask: (id: string) => Promise<unknown>;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function TaskDialog({
  route,
  locale,
  tasks,
  onClose,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
}: TaskDialogProps) {
  const messages = getTasksMessages(locale);
  const dialogErrors = useMemo(
    () => ({
      taskIdRequired: messages.dialog.taskIdRequired,
      requiredTitle: messages.dialog.requiredTitle,
      requiredDeadline: messages.dialog.requiredDeadline,
      taskNotFound: messages.dialog.taskNotFound,
    }),
    [
      messages.dialog.requiredDeadline,
      messages.dialog.requiredTitle,
      messages.dialog.taskIdRequired,
      messages.dialog.taskNotFound,
    ],
  );
  const [title, setTitle] = useState("");
  const [taskTypeKind, setTaskTypeKind] = useState<TaskDialogTypeKind>("deadline");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);

  useEffect(() => {
    if (!route) {
      return;
    }
    const snapshot = buildTaskDialogInitialSnapshot(route, tasks, dialogErrors);
    setTitle(snapshot.title);
    setTaskTypeKind(snapshot.taskTypeKind);
    setDeadlineAt(snapshot.deadlineAt);
    setIsPinned(snapshot.isPinned);
    setError(snapshot.error);
    setIsDeleteConfirming(false);
  }, [dialogErrors, route, tasks]);

  const modeLabel = useMemo(
    () => (route?.mode === "create" ? messages.dialog.modeCreate : messages.dialog.modeEdit),
    [messages.dialog.modeCreate, messages.dialog.modeEdit, route?.mode],
  );

  if (!route) {
    return null;
  }

  const resolveEditTaskId = (): string | null => {
    if (route.mode !== "edit") {
      return null;
    }

    const taskId = route.taskId?.trim();
    if (!taskId) {
      setError(messages.dialog.taskIdRequired);
      return null;
    }

    return taskId;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateTaskDialogForm(title, taskTypeKind, deadlineAt, dialogErrors);
    if (validationError) {
      setError(validationError);
      return;
    }

    const editTaskId = route.mode === "edit" ? resolveEditTaskId() : null;
    if (route.mode === "edit" && !editTaskId) {
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const taskType = toTaskType(taskTypeKind, deadlineAt);
      if (route.mode === "create") {
        await onCreateTask({
          title: title.trim(),
          taskType,
          isPinned,
        });
      } else {
        if (!editTaskId) {
          setError(messages.dialog.taskIdRequired);
          return;
        }
        await onUpdateTask({
          id: editTaskId,
          title: title.trim(),
          taskType,
          isPinned,
        });
      }

      onClose();
    } catch (submitError) {
      setError(toErrorMessage(submitError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const taskId = resolveEditTaskId();
    if (!taskId) {
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      await onDeleteTask(taskId);
      onClose();
    } catch (deleteError) {
      setError(toErrorMessage(deleteError));
    } finally {
      setIsSaving(false);
    }
  };

  const showDeleteConfirm = () => {
    if (!resolveEditTaskId()) {
      return;
    }
    setIsDeleteConfirming(true);
    setError(null);
  };

  const hideDeleteConfirm = () => {
    if (isSaving) {
      return;
    }
    setIsDeleteConfirming(false);
  };

  return (
    <div className="task-dialog-modal" role="presentation">
      <button
        type="button"
        className="task-dialog-modal__backdrop"
        aria-label={messages.dialog.closeAria}
        onClick={() => {
          if (!isSaving) {
            onClose();
          }
        }}
      />
      <section
        className="task-dialog task-dialog--modal"
        aria-label={modeLabel}
        role="dialog"
        aria-modal="true"
      >
        <div className="task-dialog__panel" data-testid="task-dialog-panel">
          <h1 className="task-dialog__title">{modeLabel}</h1>
          <form className="task-dialog__form" onSubmit={handleSubmit}>
            <label className="task-dialog__field">
              <span>{messages.dialog.titleLabel}</span>
              <input
                type="text"
                className="task-dialog__input"
                value={title}
                disabled={isSaving}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>

            <fieldset className="task-dialog__fieldset" disabled={isSaving}>
              <legend>{messages.dialog.typeLegend}</legend>
              <label className="task-dialog__choice">
                <input
                  type="radio"
                  name="task-type"
                  value="daily"
                  checked={taskTypeKind === "daily"}
                  onChange={() => setTaskTypeKind("daily")}
                />
                {messages.dialog.typeDaily}
              </label>
              <label className="task-dialog__choice">
                <input
                  type="radio"
                  name="task-type"
                  value="deadline"
                  checked={taskTypeKind === "deadline"}
                  onChange={() => setTaskTypeKind("deadline")}
                />
                {messages.dialog.typeDeadline}
              </label>
            </fieldset>

            {taskTypeKind === "deadline" ? (
              <label className="task-dialog__field">
                <span>{messages.dialog.deadlineLabel}</span>
                <input
                  type="datetime-local"
                  className="task-dialog__input"
                  value={deadlineAt}
                  disabled={isSaving}
                  onChange={(event) => setDeadlineAt(event.target.value)}
                />
              </label>
            ) : null}

            <label className="task-dialog__choice">
              <input
                type="checkbox"
                checked={isPinned}
                disabled={isSaving}
                onChange={(event) => setIsPinned(event.target.checked)}
              />
              {messages.dialog.pinLabel}
            </label>

            {error ? (
              <p className="task-dialog__status task-dialog__status--error" role="alert">
                {error}
              </p>
            ) : null}

            {isDeleteConfirming ? (
              <div className="task-dialog__delete-confirm" role="alertdialog" aria-live="assertive">
                <p className="task-dialog__delete-confirm-message">{messages.dialog.deleteConfirm}</p>
                <div className="task-dialog__delete-confirm-actions">
                  <button
                    type="button"
                    className="task-dialog__button task-dialog__button--ghost"
                    disabled={isSaving}
                    onClick={hideDeleteConfirm}
                  >
                    {messages.dialog.cancel}
                  </button>
                  <button
                    type="button"
                    className="task-dialog__button task-dialog__button--danger"
                    disabled={isSaving}
                    onClick={handleDelete}
                  >
                    {isSaving ? messages.dialog.saving : messages.dialog.delete}
                  </button>
                </div>
              </div>
            ) : (
              <div className="task-dialog__actions">
                {route.mode === "edit" ? (
                  <button
                    type="button"
                    className="task-dialog__button task-dialog__button--danger"
                    disabled={isSaving}
                    onClick={showDeleteConfirm}
                  >
                    {messages.dialog.delete}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="task-dialog__button task-dialog__button--ghost"
                  disabled={isSaving}
                  onClick={onClose}
                >
                  {messages.dialog.cancel}
                </button>
                <button type="submit" className="task-dialog__button" disabled={isSaving}>
                  {isSaving ? messages.dialog.saving : messages.dialog.save}
                </button>
              </div>
            )}
          </form>
        </div>
      </section>
    </div>
  );
}
