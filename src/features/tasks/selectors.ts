import type { Task } from "../../shared/types/task";
import { compareTaskSortKeys, toTaskSortKey } from "./domain/taskOrdering";

export const INITIAL_VISIBLE_TASK_COUNT = 4;
export const MAX_EXPANDED_VISIBLE_TASK_COUNT = 9;

interface LayoutMeta {
  showExpandButton: boolean;
  requiresScroll: boolean;
}

export function sortTasks(tasks: readonly Task[], now: Date = new Date()): Task[] {
  return [...tasks].sort((left, right) =>
    compareTaskSortKeys(toTaskSortKey(left, now), toTaskSortKey(right, now)),
  );
}

export function countActiveTasks(tasks: readonly Task[]): number {
  return tasks.filter((task) => !task.completion).length;
}

export function canExpandTaskList(activeCount: number, totalCount: number): boolean {
  const hasCompletedTasks = totalCount > activeCount;
  return activeCount > INITIAL_VISIBLE_TASK_COUNT || hasCompletedTasks;
}

export function selectVisibleTasks(sortedTasks: readonly Task[], isExpanded: boolean): Task[] {
  if (isExpanded) {
    // 展開時は全件を返し、9件上限はCSSスクロール領域で制御する。
    return [...sortedTasks];
  }

  const activeTasks = sortedTasks.filter((task) => !task.completion);
  return activeTasks.slice(0, INITIAL_VISIBLE_TASK_COUNT);
}

export function selectLayoutMeta(activeCount: number, totalCount: number, isExpanded: boolean): LayoutMeta {
  return {
    showExpandButton: canExpandTaskList(activeCount, totalCount),
    // スクロールは展開時のみ有効。折りたたみ状態では常に4件表示に固定する。
    requiresScroll: isExpanded && totalCount > MAX_EXPANDED_VISIBLE_TASK_COUNT,
  };
}

export function normalizeExpandedState(isExpanded: boolean, activeCount: number, totalCount: number): boolean {
  if (!canExpandTaskList(activeCount, totalCount)) {
    return false;
  }

  return isExpanded;
}
