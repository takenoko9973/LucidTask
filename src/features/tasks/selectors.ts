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

export function selectVisibleTasks(sortedTasks: readonly Task[], isExpanded: boolean): Task[] {
  if (isExpanded) {
    // 展開時は全件を返し、9件上限はCSSスクロール領域で制御する。
    return [...sortedTasks];
  }

  return sortedTasks.slice(0, INITIAL_VISIBLE_TASK_COUNT);
}

export function selectLayoutMeta(totalCount: number, isExpanded: boolean): LayoutMeta {
  return {
    showExpandButton: totalCount > INITIAL_VISIBLE_TASK_COUNT,
    // スクロールは展開時のみ有効。折りたたみ状態では常に4件表示に固定する。
    requiresScroll: isExpanded && totalCount > MAX_EXPANDED_VISIBLE_TASK_COUNT,
  };
}

export function normalizeExpandedState(isExpanded: boolean, totalCount: number): boolean {
  // 件数が4以下に減ったら仕様どおり自動で折りたたみに戻す。
  if (totalCount <= INITIAL_VISIBLE_TASK_COUNT) {
    return false;
  }

  return isExpanded;
}
