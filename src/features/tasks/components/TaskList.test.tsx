import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Task } from "../../../shared/types/task";
import { TaskList } from "./TaskList";

function createDailyTask(id: number): Task {
  return {
    id: `task-${id}`,
    title: `task-${id}`,
    taskType: { kind: "daily" },
    isPinned: false,
  };
}

describe("TaskList", () => {
  it("renders exactly the visible tasks", () => {
    const tasks = Array.from({ length: 4 }, (_, index) => createDailyTask(index));
    const markup = renderToStaticMarkup(
      <TaskList tasks={tasks} requiresScroll={false} onEditTask={() => undefined} />,
    );

    const count = (markup.match(/data-testid="task-card"/g) ?? []).length;
    const editButtons = (markup.match(/data-testid="edit-task-button"/g) ?? []).length;
    expect(count).toBe(4);
    expect(editButtons).toBe(4);
  });

  it("enables scroll class when requiresScroll is true", () => {
    const tasks = Array.from({ length: 9 }, (_, index) => createDailyTask(index));
    const markup = renderToStaticMarkup(
      <TaskList tasks={tasks} requiresScroll onEditTask={() => undefined} />,
    );

    expect(markup).toContain('class="tasks-list tasks-list--scrollable"');
  });
});
