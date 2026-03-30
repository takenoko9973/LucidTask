import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Task } from "../../../shared/types/task";
import { getTasksMessages } from "./tasksI18n";
import { TaskDialog, type TaskDialogRoute } from "./TaskDialog";

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
    expect(markup).toContain("datetime-local");
    expect(markup).not.toContain(messages.dialog.delete);
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
    expect(markup).toContain(messages.dialog.cancel);
    expect(markup).toContain(messages.dialog.save);
  });
});
