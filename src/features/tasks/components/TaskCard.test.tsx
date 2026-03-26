import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TaskCard } from "./TaskCard";

describe("TaskCard", () => {
  it("renders ellipsis-ready title with native tooltip", () => {
    const longTitle = "this is a very long task title that should be cut by ellipsis in a single line";
    const markup = renderToStaticMarkup(
      <TaskCard
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
  });

  it("renders pinned indicator for pinned tasks", () => {
    const markup = renderToStaticMarkup(
      <TaskCard
        task={{
          id: "task-2",
          title: "Pinned task",
          taskType: { kind: "deadline", deadlineAt: "2026-03-30T09:00:00+09:00" },
          isPinned: true,
        }}
      />,
    );

    expect(markup).toContain('data-indicator="pinned"');
    expect(markup).toContain("Pinned");
  });
});
