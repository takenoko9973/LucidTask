import { useMemo } from "react";

import { countActiveTasks, selectLayoutMeta, selectVisibleTasks, sortTasks } from "../selectors";
import { useTasksState } from "./context";
import type { TasksViewModel } from "./types";

export function useTasksViewModel(): TasksViewModel {
  const { tasks, isExpanded } = useTasksState();

  const sortedTasks = useMemo(() => sortTasks(tasks), [tasks]);
  const activeCount = useMemo(() => countActiveTasks(sortedTasks), [sortedTasks]);
  const visibleTasks = useMemo(
    () => selectVisibleTasks(sortedTasks, isExpanded),
    [sortedTasks, isExpanded],
  );
  const layoutMeta = useMemo(
    () => selectLayoutMeta(activeCount, sortedTasks.length, isExpanded),
    [activeCount, sortedTasks.length, isExpanded],
  );

  return {
    visibleTasks,
    totalCount: sortedTasks.length,
    activeCount,
    showExpandButton: layoutMeta.showExpandButton,
    requiresScroll: layoutMeta.requiresScroll,
    isExpanded,
  };
}
