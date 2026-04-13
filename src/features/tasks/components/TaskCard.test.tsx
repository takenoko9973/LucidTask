import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TaskCard } from "./TaskCard";
import { TASK_WIDGET_TEST_IDS } from "./tasksWidgetConstants";

describe("TaskCard", () => {
  it("renders ellipsis-ready title with native tooltip", () => {
    const longTitle = "this is a very long task title that should be cut by ellipsis in a single line";
    const markup = renderToStaticMarkup(
      <TaskCard
        locale="ja"
        task={{
          id: "task-1",
          title: longTitle,
          taskType: { kind: "daily" },
          isPinned: false,
        }}
      />,
    );

    expect(markup).toContain('class="task-card__title"');
    expect(markup).toContain(`title="${longTitle}"`);
    expect(markup).toContain(`data-testid="${TASK_WIDGET_TEST_IDS.completeTaskButton}"`);
    expect(markup).not.toContain('data-testid="edit-task-button"');
    expect(markup).not.toContain('data-testid="pin-task-button"');
  });

  it("renders pin icon for pinned tasks", () => {
    const markup = renderToStaticMarkup(
      <TaskCard
        locale="ja"
        task={{
          id: "task-2",
          title: "Pinned task",
          taskType: { kind: "deadline", deadlineAt: "2026-03-30T09:00:00+09:00" },
          isPinned: true,
        }}
      />,
    );

    expect(markup).toContain("task-card__pin-icon");
  });

  it("renders active check style and keeps daily indicator when task is completed", () => {
    // 仕様: 完了後も daily/deadline の種別表示は維持しつつ、復帰できるチェック状態を示す。
    const markup = renderToStaticMarkup(
      <TaskCard
        locale="ja"
        task={{
          id: "task-3",
          title: "Done task",
          taskType: { kind: "daily" },
          isPinned: false,
          completion: {
            kind: "daily",
            completedAt: "2026-03-26T10:30:00+09:00",
            businessDay: "2026-03-26",
          },
        }}
      />,
    );

    expect(markup).toContain("task-card--completed");
    expect(markup).toContain(`data-testid="${TASK_WIDGET_TEST_IDS.completeTaskButton}"`);
    expect(markup).toContain("task-card__complete--active");
    expect(markup).toContain("task-card__checkmark--active");
    expect(markup).toContain("task-card__indicator--daily");
  });

  it("renders deadline helper text under title", () => {
    const markup = renderToStaticMarkup(
      <TaskCard
        locale="ja"
        now={new Date("2026-04-01T12:00:00+09:00")}
        task={{
          id: "task-4",
          title: "Deadline task",
          taskType: { kind: "deadline", deadlineAt: "2026-04-02T11:00:00+09:00" },
          isPinned: false,
        }}
      />,
    );

    expect(markup).toContain("あと23時間");
    expect(markup).toContain("task-card__deadline");
  });
});
