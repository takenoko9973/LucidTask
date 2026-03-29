export const TASK_WIDGET_TEST_IDS = {
  taskCard: "task-card",
  completeTaskButton: "complete-task-button",
  createTaskButton: "create-task-button",
} as const;

export const TASK_WIDGET_CLASSES = {
  taskList: "tasks-list",
  taskListScrollable: "tasks-list--scrollable",
} as const;

export const TASK_WIDGET_SELECTORS = {
  taskCard: "[data-task-card='true']",
  taskList: `.${TASK_WIDGET_CLASSES.taskList}`,
} as const;

interface ActiveTaskTitleText {
  noActiveTitle: string;
  taskSingular: string;
  taskPlural: string;
}

export function formatActiveTaskTitle(activeCount: number, text: ActiveTaskTitleText): string {
  if (activeCount === 0) {
    return text.noActiveTitle;
  }

  const suffix = activeCount === 1 ? text.taskSingular : text.taskPlural;
  return `${activeCount} ${suffix}`;
}

export function toTaskListClassName(requiresScroll: boolean): string {
  if (!requiresScroll) {
    return TASK_WIDGET_CLASSES.taskList;
  }

  return `${TASK_WIDGET_CLASSES.taskList} ${TASK_WIDGET_CLASSES.taskListScrollable}`;
}
