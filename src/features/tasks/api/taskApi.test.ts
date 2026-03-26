import { beforeEach, describe, expect, it, vi } from "vitest";

import { TASK_COMMANDS } from "../../../shared/ipc";
import type { Task } from "../../../shared/types/task";
import { taskApi } from "./taskApi";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const invokeMock = vi.mocked(invoke);

describe("taskApi", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("calls list_tasks without payload", async () => {
    const tasks: Task[] = [
      {
        id: "task-1",
        title: "list",
        taskType: { kind: "daily" },
        isPinned: false,
      },
    ];
    invokeMock.mockResolvedValueOnce(tasks);

    const result = await taskApi.listTasks();

    expect(invokeMock).toHaveBeenCalledWith(TASK_COMMANDS.listTasks);
    expect(result).toEqual(tasks);
  });

  it("calls create_task with create payload", async () => {
    const createdTask: Task = {
      id: "task-2",
      title: "created",
      taskType: {
        kind: "deadline",
        deadlineAt: "2026-03-27T09:00:00+09:00",
      },
      isPinned: true,
    };
    const payload = {
      title: "created",
      taskType: createdTask.taskType,
      isPinned: true,
    };
    invokeMock.mockResolvedValueOnce(createdTask);

    const result = await taskApi.createTask(payload);

    expect(invokeMock).toHaveBeenCalledWith(TASK_COMMANDS.createTask, payload);
    expect(result).toEqual(createdTask);
  });

  it("calls set_task_pinned with id and isPinned", async () => {
    const updatedTask: Task = {
      id: "task-3",
      title: "pin",
      taskType: { kind: "daily" },
      isPinned: true,
    };
    invokeMock.mockResolvedValueOnce(updatedTask);

    const result = await taskApi.setTaskPinned("task-3", true);

    expect(invokeMock).toHaveBeenCalledWith(TASK_COMMANDS.setTaskPinned, {
      id: "task-3",
      isPinned: true,
    });
    expect(result).toEqual(updatedTask);
  });

  it("calls cleanup_completed_tasks without payload", async () => {
    invokeMock.mockResolvedValueOnce(2);

    const removedCount = await taskApi.cleanupCompletedTasks();

    expect(invokeMock).toHaveBeenCalledWith(TASK_COMMANDS.cleanupCompletedTasks);
    expect(removedCount).toBe(2);
  });

  it("calls open_task_dialog with mode payload", async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await taskApi.openTaskDialog({ mode: "create" });

    expect(invokeMock).toHaveBeenCalledWith(TASK_COMMANDS.openTaskDialog, {
      mode: "create",
    });
  });
});
