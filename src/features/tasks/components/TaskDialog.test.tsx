import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Task } from "../../../shared/types/task";
import { getTasksMessages } from "./tasksI18n";
import { TaskDialog, type TaskDialogRoute } from "./TaskDialog";
import { buildTaskDialogDeadlineTimeOptions } from "./taskDialogModel";

function createTask(id: string, title = id): Task {
  return {
    id,
    title,
    taskType: { kind: "daily" },
    isPinned: false,
  };
}

function createRoute(route: TaskDialogRoute): TaskDialogRoute {
  return route;
}

describe("TaskDialog", () => {
  const messages = getTasksMessages("ja");
  const deadlineTimeOptions = buildTaskDialogDeadlineTimeOptions();

  it("returns no markup when route is null", () => {
    // 準備
    const tasks: Task[] = [];

    // 実行
    const markup = renderToStaticMarkup(
      <TaskDialog
        route={null}
        locale="ja"
        tasks={tasks}
        onClose={() => undefined}
        onCreateTask={async () => createTask("created")}
        onUpdateTask={async () => createTask("updated")}
        onDeleteTask={async () => []}
      />,
    );

    // 検証
    expect(markup).toBe("");
  });

  it("renders create mode dialog", () => {
    // 準備
    const route = createRoute({ mode: "create" });

    // 実行
    const markup = renderToStaticMarkup(
      <TaskDialog
        route={route}
        locale="ja"
        tasks={[]}
        onClose={() => undefined}
        onCreateTask={async () => createTask("created")}
        onUpdateTask={async () => createTask("updated")}
        onDeleteTask={async () => []}
      />,
    );

    // 検証
    expect(markup).toContain(messages.dialog.modeCreate);
    expect(markup).toContain("task-dialog-modal");
    expect(markup).toContain('type="date"');
    expect(markup).toContain("<select");
    expect(markup).toContain("<option");
    expect(markup).toContain(deadlineTimeOptions[0] ?? "00:00");
    expect(markup).toContain(deadlineTimeOptions[1] ?? "00:15");
    expect(markup).not.toContain(messages.dialog.delete);
    expect(markup).not.toContain(messages.dialog.deleteConfirm);
    expect(markup).not.toContain("Confirm");
  });

  it("renders edit mode dialog shell", () => {
    // 準備
    const route = createRoute({ mode: "edit", taskId: "task-2" });
    const tasks: Task[] = [{ ...createTask("task-2", "Refine widget"), isPinned: true }];

    // 実行
    const markup = renderToStaticMarkup(
      <TaskDialog
        route={route}
        locale="ja"
        tasks={tasks}
        onClose={() => undefined}
        onCreateTask={async () => createTask("created")}
        onUpdateTask={async () => createTask("updated")}
        onDeleteTask={async () => []}
      />,
    );

    // 検証
    expect(markup).toContain(messages.dialog.modeEdit);
    expect(markup).toContain(messages.dialog.delete);
    expect(markup).not.toContain(messages.dialog.deleteConfirm);
    expect(markup).toContain(messages.dialog.cancel);
    expect(markup).toContain(messages.dialog.save);
  });

  it("disables pin control when editing a completed task", () => {
    // 仕様: 完了タスク編集では pin 更新は不可。
    const route = createRoute({ mode: "edit", taskId: "task-3" });
    const tasks: Task[] = [
      {
        ...createTask("task-3", "Done task"),
        completion: {
          kind: "daily",
          completedAt: new Date("2026-04-03T12:00:00.000Z").toISOString(),
          businessDay: "2026-04-03",
        },
      },
    ];

    const markup = renderToStaticMarkup(
      <TaskDialog
        route={route}
        locale="ja"
        tasks={tasks}
        onClose={() => undefined}
        onCreateTask={async () => createTask("created")}
        onUpdateTask={async () => createTask("updated")}
        onDeleteTask={async () => []}
      />,
    );

    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain('type="checkbox" disabled=""');
  });
});
