import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Task } from "../../../shared/types/task";
import type { TasksViewModel } from "../store";
import { getTasksMessages } from "./tasksI18n";
import {
  createAppContextMenuInput,
  createTaskContextMenuInput,
  TasksWidgetView,
} from "./TasksWidgetView";
import { TASK_WIDGET_TEST_IDS, toTaskListClassName } from "./tasksWidgetConstants";

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
    activeCount: 0,
    showExpandButton: false,
    requiresScroll: false,
    isExpanded: false,
    ...partial,
  };
}

describe("TasksWidgetView", () => {
  const messages = getTasksMessages("ja");

  it("renders create action in empty state", () => {
    // 仕様: 空状態でも作成CTAとドラッグ帯は常に表示する。
    const viewModel = createViewModel({ totalCount: 0, visibleTasks: [] });
    const markup = renderToStaticMarkup(
      <TasksWidgetView
        viewModel={viewModel}
        locale="ja"
        widgetMessages={messages.widget}
        onToggleExpand={() => undefined}
        onOpenCreateDialog={() => undefined}
        onCompleteTask={() => undefined}
      />,
    );

    expect(markup).toContain(messages.widget.addTask);
    expect(markup).toContain(messages.widget.noActiveTitle);
    expect(markup).toContain("data-tauri-drag-region");
  });

  it("renders 4 cards in collapsed mode", () => {
    // 仕様: 折りたたみ時は4件上限で表示し、残件があれば展開CTAを出す。
    const viewModel = createViewModel({
      visibleTasks: Array.from({ length: 4 }, (_, index) => createDailyTask(index)),
      totalCount: 8,
      activeCount: 8,
      showExpandButton: true,
      isExpanded: false,
    });
    const markup = renderToStaticMarkup(
      <TasksWidgetView
        viewModel={viewModel}
        locale="ja"
        widgetMessages={messages.widget}
        onToggleExpand={() => undefined}
        onOpenCreateDialog={() => undefined}
        onCompleteTask={() => undefined}
      />,
    );

    const cardCount = (markup.match(new RegExp(`data-testid="${TASK_WIDGET_TEST_IDS.taskCard}"`, "g")) ?? []).length;
    const completeButtonCount =
      (markup.match(new RegExp(`data-testid="${TASK_WIDGET_TEST_IDS.completeTaskButton}"`, "g")) ?? []).length;
    expect(cardCount).toBe(4);
    expect(completeButtonCount).toBe(4);
    expect(markup).toContain(messages.widget.showMore);
    expect(markup).toContain(TASK_WIDGET_TEST_IDS.createTaskButton);
    expect(markup).toContain("8 件");
  });

  it("renders all cards and keeps expand button in expanded mode", () => {
    // 仕様: 展開時は全件表示し、表示上限超えでスクロール用クラスを付与する。
    const viewModel = createViewModel({
      visibleTasks: Array.from({ length: 12 }, (_, index) => createDailyTask(index)),
      totalCount: 12,
      activeCount: 12,
      showExpandButton: true,
      requiresScroll: true,
      isExpanded: true,
    });
    const markup = renderToStaticMarkup(
      <TasksWidgetView
        viewModel={viewModel}
        locale="ja"
        widgetMessages={messages.widget}
        onToggleExpand={() => undefined}
        onOpenCreateDialog={() => undefined}
        onCompleteTask={() => undefined}
      />,
    );

    const cardCount = (markup.match(new RegExp(`data-testid="${TASK_WIDGET_TEST_IDS.taskCard}"`, "g")) ?? []).length;
    expect(cardCount).toBe(12);
    expect(markup).toContain(`class="${toTaskListClassName(true)}"`);
    expect(markup).toContain(messages.widget.showLess);
    expect(markup).toContain(TASK_WIDGET_TEST_IDS.createTaskButton);
  });

  it("hides expand button when task count is 4 or fewer", () => {
    const viewModel = createViewModel({
      visibleTasks: Array.from({ length: 4 }, (_, index) => createDailyTask(index)),
      totalCount: 4,
      activeCount: 4,
      showExpandButton: false,
      isExpanded: false,
    });
    const markup = renderToStaticMarkup(
      <TasksWidgetView
        viewModel={viewModel}
        locale="ja"
        widgetMessages={messages.widget}
        onToggleExpand={() => undefined}
        onOpenCreateDialog={() => undefined}
        onCompleteTask={() => undefined}
      />,
    );

    expect(markup).not.toContain("expand-toggle");
  });

  it("shows active task count even when completed tasks are visible", () => {
    // 仕様: タイトル件数は表示総数ではなく未完了件数を示す。
    const viewModel = createViewModel({
      visibleTasks: Array.from({ length: 3 }, (_, index) => createDailyTask(index)),
      totalCount: 3,
      activeCount: 1,
      showExpandButton: false,
      isExpanded: false,
    });
    const markup = renderToStaticMarkup(
      <TasksWidgetView
        viewModel={viewModel}
        locale="ja"
        widgetMessages={messages.widget}
        onToggleExpand={() => undefined}
        onOpenCreateDialog={() => undefined}
        onCompleteTask={() => undefined}
      />,
    );

    expect(markup).toContain("1 件");
  });

  it("builds app context menu payload for native menu command", () => {
    // 仕様: app右クリックは locale付きで show_context_menu(app) payload を作る。
    expect(createAppContextMenuInput("ja", 10, 20)).toEqual({
      kind: "app",
      locale: "ja",
      x: 10,
      y: 20,
    });
  });

  it("builds task context menu payload with task state", () => {
    // 仕様: task右クリックは taskId/isPinned/isCompleted を含めて送る。
    const task: Task = {
      id: "task-1",
      title: "Task",
      taskType: { kind: "daily" },
      isPinned: true,
      completedAt: "2026-03-29T10:00:00+09:00",
    };

    expect(createTaskContextMenuInput("en", task, { x: 50, y: 80 })).toEqual({
      kind: "task",
      locale: "en",
      x: 50,
      y: 80,
      taskId: "task-1",
      isPinned: true,
      isCompleted: true,
    });
  });
});
