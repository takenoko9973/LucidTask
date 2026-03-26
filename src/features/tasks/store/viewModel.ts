import { useMemo } from "react";

import { selectLayoutMeta, selectVisibleTasks, sortTasks } from "../selectors";
import { useTasksState } from "./context";
import type { TasksViewModel } from "./types";

export function useTasksViewModel(): TasksViewModel {
  const { tasks, isExpanded } = useTasksState();

  const sortedTasks = useMemo(() => sortTasks(tasks), [tasks]);
  const visibleTasks = useMemo(
    () => selectVisibleTasks(sortedTasks, isExpanded),
    [sortedTasks, isExpanded],
  );
  const layoutMeta = useMemo(
    () => selectLayoutMeta(sortedTasks.length, isExpanded),
    [sortedTasks.length, isExpanded],
  );

  return {
    visibleTasks,
    totalCount: sortedTasks.length,
    showExpandButton: layoutMeta.showExpandButton,
    requiresScroll: layoutMeta.requiresScroll,
    isExpanded,
  };
}
