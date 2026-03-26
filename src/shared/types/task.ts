export type TaskId = string;
export type IsoDateTimeString = string;

export type TaskType =
  | {
      kind: "deadline";
      deadlineAt: IsoDateTimeString;
    }
  | {
      kind: "daily";
    };

export interface Task {
  id: TaskId;
  title: string;
  taskType: TaskType;
  isPinned: boolean;
}

export interface CreateTaskInput {
  title: string;
  taskType: TaskType;
  isPinned?: boolean;
}

export interface UpdateTaskInput {
  id: TaskId;
  title?: string;
  taskType?: TaskType;
  isPinned?: boolean;
}

