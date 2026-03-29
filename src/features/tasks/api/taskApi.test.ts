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

    expect(invokeMock).toHaveBeenCalledWith(TASK_COMMANDS.createTask, { input: payload });
    expect(result).toEqual(createdTask);
  });

  it("calls update_task with input wrapper payload", async () => {
    const updatedTask: Task = {
      id: "task-3",
      title: "updated",
      taskType: { kind: "daily" },
      isPinned: false,
    };
    const payload = {
      id: "task-3",
      title: "updated",
      isPinned: false,
    };
    invokeMock.mockResolvedValueOnce(updatedTask);

    const result = await taskApi.updateTask(payload);

    expect(invokeMock).toHaveBeenCalledWith(TASK_COMMANDS.updateTask, {
      input: payload,
    });
    expect(result).toEqual(updatedTask);
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

  it("calls complete_task with raw payload (no input wrapper)", async () => {
    // 仕様: complete_task は { input } ではなく { id } を直接渡す。
    const completedTask: Task = {
      id: "task-4",
      title: "done",
      taskType: { kind: "daily" },
      isPinned: false,
      completedAt: "2026-03-29T10:00:00+09:00",
    };
    invokeMock.mockResolvedValueOnce([completedTask]);

    const result = await taskApi.completeTask("task-4");

    expect(invokeMock).toHaveBeenCalledWith(TASK_COMMANDS.completeTask, { id: "task-4" });
    expect(result).toEqual([completedTask]);
  });

  it("calls delete_task with raw payload (no input wrapper)", async () => {
    // 仕様: delete_task も complete_task と同様に id 直渡し契約。
    const taskAfterDelete: Task = {
      id: "task-5",
      title: "keep",
      taskType: { kind: "daily" },
      isPinned: false,
    };
    invokeMock.mockResolvedValueOnce([taskAfterDelete]);

    const result = await taskApi.deleteTask("task-4");

    expect(invokeMock).toHaveBeenCalledWith(TASK_COMMANDS.deleteTask, { id: "task-4" });
    expect(result).toEqual([taskAfterDelete]);
  });

  it("calls cleanup_completed_tasks without payload", async () => {
    invokeMock.mockResolvedValueOnce(2);

    const removedCount = await taskApi.cleanupCompletedTasks();

    expect(invokeMock).toHaveBeenCalledWith(TASK_COMMANDS.cleanupCompletedTasks);
    expect(removedCount).toBe(2);
  });
});
