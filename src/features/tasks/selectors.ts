import type { Task } from "../../shared/types/task";

export const INITIAL_VISIBLE_TASK_COUNT = 4;
export const MAX_EXPANDED_VISIBLE_TASK_COUNT = 9;

type TaskSortGroup = 0 | 1 | 2 | 3;

interface TaskSortKey {
  group: TaskSortGroup;
  deadlineValue: number;
  title: string;
  id: string;
}

interface LayoutMeta {
  showExpandButton: boolean;
  requiresScroll: boolean;
}

const DAILY_SORT_VALUE = Number.POSITIVE_INFINITY;

function toLocalDateValue(date: Date): number {
  // 日単位の比較専用キー。時刻・タイムゾーン差で当日判定がぶれないようにする。
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function toTimestamp(deadlineAt: string): number {
  const timestamp = Date.parse(deadlineAt);
  // 不正な期限値は末尾扱いにして表示全体を壊さない。
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function isDueTodayOrOverdue(deadlineAt: string, now: Date): boolean {
  const deadlineDate = new Date(deadlineAt);
  if (Number.isNaN(deadlineDate.getTime())) {
    return false;
  }

  return toLocalDateValue(deadlineDate) <= toLocalDateValue(now);
}

function taskSortKey(task: Task, now: Date): TaskSortKey {
  // group: 0=固定, 1=期限超過/当日, 2=daily, 3=未来期限
  if (task.isPinned) {
    return {
      group: 0,
      deadlineValue:
        task.taskType.kind === "deadline" ? toTimestamp(task.taskType.deadlineAt) : DAILY_SORT_VALUE,
      title: task.title,
      id: task.id,
    };
  }

  if (task.taskType.kind === "daily") {
    return {
      group: 2,
      deadlineValue: DAILY_SORT_VALUE,
      title: task.title,
      id: task.id,
    };
  }

  return {
    group: isDueTodayOrOverdue(task.taskType.deadlineAt, now) ? 1 : 3,
    deadlineValue: toTimestamp(task.taskType.deadlineAt),
    title: task.title,
    id: task.id,
  };
}

function compareTaskKeys(left: TaskSortKey, right: TaskSortKey): number {
  if (left.group !== right.group) {
    return left.group - right.group;
  }

  if (left.deadlineValue !== right.deadlineValue) {
    return left.deadlineValue - right.deadlineValue;
  }

  const titleCompare = left.title.localeCompare(right.title);
  if (titleCompare !== 0) {
    return titleCompare;
  }

  return left.id.localeCompare(right.id);
}

export function sortTasks(tasks: readonly Task[], now: Date = new Date()): Task[] {
  return [...tasks].sort((left, right) =>
    compareTaskKeys(taskSortKey(left, now), taskSortKey(right, now)),
  );
}

export function selectVisibleTasks(sortedTasks: readonly Task[], isExpanded: boolean): Task[] {
  const visibleCount = isExpanded ? MAX_EXPANDED_VISIBLE_TASK_COUNT : INITIAL_VISIBLE_TASK_COUNT;
  return sortedTasks.slice(0, visibleCount);
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
