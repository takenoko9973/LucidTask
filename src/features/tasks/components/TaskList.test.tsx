import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Task } from "../../../shared/types/task";
import { TaskList } from "./TaskList";
import { TASK_WIDGET_TEST_IDS, toTaskListClassName } from "./tasksWidgetConstants";

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
    // 仕様: TaskList は受け取った配列をそのまま描画し、件数を増減しない。
    const tasks = Array.from({ length: 4 }, (_, index) => createDailyTask(index));
    const markup = renderToStaticMarkup(
      <TaskList
        tasks={tasks}
        locale="ja"
        requiresScroll={false}
        onRequestTaskContextMenu={() => undefined}
        onCompleteTask={() => undefined}
      />,
    );

    const count = (markup.match(new RegExp(`data-testid="${TASK_WIDGET_TEST_IDS.taskCard}"`, "g")) ?? []).length;
    const completeButtons =
      (markup.match(new RegExp(`data-testid="${TASK_WIDGET_TEST_IDS.completeTaskButton}"`, "g")) ?? []).length;
    expect(count).toBe(4);
    expect(completeButtons).toBe(4);
    expect(markup).not.toContain('data-testid="edit-task-button"');
  });

  it("enables scroll class when requiresScroll is true", () => {
    // 仕様: スクロール可否は selector 層の bool 値だけで決まる。
    const tasks = Array.from({ length: 9 }, (_, index) => createDailyTask(index));
    const markup = renderToStaticMarkup(
      <TaskList
        tasks={tasks}
        locale="ja"
        requiresScroll
        onRequestTaskContextMenu={() => undefined}
        onCompleteTask={() => undefined}
      />,
    );

    expect(markup).toContain(`class="${toTaskListClassName(true)}"`);
  });
});
