import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useReducer } from "react";

import { taskApi, type TaskApi } from "../api/taskApi";
import { createTasksActions } from "./actions";
import { initialTasksState, tasksReducer } from "./reducer";
import type { TasksActions, TasksState } from "./types";

interface TasksProviderProps {
  children: ReactNode;
  api?: TaskApi;
}

const TasksStateContext = createContext<TasksState | undefined>(undefined);
const TasksActionsContext = createContext<TasksActions | undefined>(undefined);

export function TasksProvider({ children, api = taskApi }: TasksProviderProps) {
  const [state, dispatch] = useReducer(tasksReducer, initialTasksState);
  const actions = useMemo(() => createTasksActions(dispatch, api), [dispatch, api]);

  return (
    <TasksStateContext.Provider value={state}>
      <TasksActionsContext.Provider value={actions}>{children}</TasksActionsContext.Provider>
    </TasksStateContext.Provider>
  );
}

export function useTasksState(): TasksState {
  const context = useContext(TasksStateContext);
  if (!context) {
    throw new Error("useTasksState must be used within a TasksProvider.");
  }

  return context;
}

export function useTasksActions(): TasksActions {
  const context = useContext(TasksActionsContext);
  if (!context) {
    throw new Error("useTasksActions must be used within a TasksProvider.");
  }

  return context;
}
