import { describe, expect, it } from "vitest";

import {
  formatActiveTaskTitle,
  TASK_WIDGET_CLASSES,
  toTaskListClassName,
} from "./tasksWidgetConstants";
import { getTasksMessages } from "./tasksI18n";

describe("tasksWidgetConstants", () => {
  const widgetMessages = getTasksMessages("ja").widget;

  it("formats empty active count title", () => {
    // 仕様: 未完了0件のときは固定文言を表示する。
    expect(formatActiveTaskTitle(0, widgetMessages)).toBe(widgetMessages.noActiveTitle);
  });

  it("formats singular/plural active count title", () => {
    // 仕様: 1件は単数、それ以外は複数文言で表示する。
    expect(formatActiveTaskTitle(1, widgetMessages)).toBe(`1 ${widgetMessages.taskSingular}`);
    expect(formatActiveTaskTitle(3, widgetMessages)).toBe(`3 ${widgetMessages.taskPlural}`);
  });

  it("builds task list class name from requiresScroll flag", () => {
    // 仕様: スクロールが必要なときのみ scrollable クラスを追加する。
    expect(toTaskListClassName(false)).toBe(TASK_WIDGET_CLASSES.taskList);
    expect(toTaskListClassName(true)).toBe(
      `${TASK_WIDGET_CLASSES.taskList} ${TASK_WIDGET_CLASSES.taskListScrollable}`,
    );
  });
});
