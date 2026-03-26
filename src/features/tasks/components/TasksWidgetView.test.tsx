import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Task } from "../../../shared/types/task";
import type { TasksViewModel } from "../store";
import { TasksWidgetView } from "./TasksWidgetView";

function createDailyTask(id: number): Task {
  return {
    id: `task-${id}`,
    title: `task-${id}`,
    taskType: { kind: "daily" },
    isPinned: false,
  };
}

function createViewModel(partial: Partial<TasksViewModel>): TasksViewModel {
  return {
    visibleTasks: [],
    totalCount: 0,
    showExpandButton: false,
    requiresScroll: false,
    isExpanded: false,
    ...partial,
  };
}

describe("TasksWidgetView", () => {
  it("renders 4 cards in collapsed mode", () => {
    const viewModel = createViewModel({
      visibleTasks: Array.from({ length: 4 }, (_, index) => createDailyTask(index)),
      totalCount: 8,
      showExpandButton: true,
      isExpanded: false,
    });
    const markup = renderToStaticMarkup(
      <TasksWidgetView viewModel={viewModel} onToggleExpand={() => undefined} />,
    );

    const cardCount = (markup.match(/data-testid="task-card"/g) ?? []).length;
    expect(cardCount).toBe(4);
    expect(markup).toContain("Show more");
  });

  it("renders up to 9 cards and keeps expand button in expanded mode", () => {
    const viewModel = createViewModel({
      visibleTasks: Array.from({ length: 9 }, (_, index) => createDailyTask(index)),
      totalCount: 12,
      showExpandButton: true,
      requiresScroll: true,
      isExpanded: true,
    });
    const markup = renderToStaticMarkup(
      <TasksWidgetView viewModel={viewModel} onToggleExpand={() => undefined} />,
    );

    const cardCount = (markup.match(/data-testid="task-card"/g) ?? []).length;
    expect(cardCount).toBe(9);
    expect(markup).toContain('class="tasks-list tasks-list--scrollable"');
    expect(markup).toContain("Show less");
  });

  it("hides expand button when task count is 4 or fewer", () => {
    const viewModel = createViewModel({
      visibleTasks: Array.from({ length: 4 }, (_, index) => createDailyTask(index)),
      totalCount: 4,
      showExpandButton: false,
      isExpanded: false,
    });
    const markup = renderToStaticMarkup(
      <TasksWidgetView viewModel={viewModel} onToggleExpand={() => undefined} />,
    );

    expect(markup).not.toContain("expand-toggle");
  });
});
