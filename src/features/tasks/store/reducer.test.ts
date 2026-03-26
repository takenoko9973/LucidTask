import { describe, expect, it } from "vitest";

import type { Task } from "../../../shared/types/task";
import { initialTasksState, tasksReducer } from "./reducer";

function createTask(id: string): Task {
  return {
    id,
    title: id,
    taskType: { kind: "daily" },
    isPinned: false,
  };
}

describe("tasksReducer", () => {
  it("collapses expanded state when replaceTasks result has 4 tasks or fewer", () => {
    const state = {
      ...initialTasksState,
      isExpanded: true,
      tasks: [createTask("a"), createTask("b"), createTask("c"), createTask("d"), createTask("e")],
    };

    const nextState = tasksReducer(state, {
      type: "tasks/replaceTasks",
      tasks: [createTask("a"), createTask("b"), createTask("c"), createTask("d")],
    });

    expect(nextState.isExpanded).toBe(false);
  });

  it("toggles expansion only when task count is greater than 4", () => {
    const collapsedWithFour = tasksReducer(
      {
        ...initialTasksState,
        tasks: [createTask("a"), createTask("b"), createTask("c"), createTask("d")],
      },
      { type: "tasks/toggleExpand" },
    );
    expect(collapsedWithFour.isExpanded).toBe(false);

    const toggledWithFive = tasksReducer(
      {
        ...initialTasksState,
        tasks: [createTask("a"), createTask("b"), createTask("c"), createTask("d"), createTask("e")],
      },
      { type: "tasks/toggleExpand" },
    );
    expect(toggledWithFive.isExpanded).toBe(true);
  });

  it("upserts existing tasks by id", () => {
    const state = {
      ...initialTasksState,
      tasks: [createTask("task-1")],
    };

    const nextState = tasksReducer(state, {
      type: "tasks/upsertTask",
      task: {
        ...createTask("task-1"),
        title: "updated",
      },
    });

    expect(nextState.tasks).toHaveLength(1);
    expect(nextState.tasks[0]?.title).toBe("updated");
  });
});
