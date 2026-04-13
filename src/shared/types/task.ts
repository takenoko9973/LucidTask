export type TaskId = string;
export type IsoDateTimeString = string;
export type BusinessDayString = string;

export type TaskType =
  | {
      kind: "deadline";
      deadlineAt: IsoDateTimeString;
    }
  | {
      kind: "daily";
    };

export type TaskCompletion =
  | {
      kind: "deadline";
      completedAt: IsoDateTimeString;
    }
  | {
      kind: "daily";
      completedAt: IsoDateTimeString;
      businessDay: BusinessDayString;
    };

export interface Task {
  id: TaskId;
  title: string;
  taskType: TaskType;
  isPinned: boolean;
  completion?: TaskCompletion;
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
