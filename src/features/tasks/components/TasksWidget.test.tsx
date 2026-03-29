import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NativeMenuActionPayload } from "../../../shared/appCommands";
import type { Task } from "../../../shared/types/task";
import type { TasksActions, TasksState, TasksViewModel } from "../store";
import { getTasksMessages } from "./tasksI18n";
import { applyNativeMenuAction, TasksWidget } from "./TasksWidget";

vi.mock("../store", () => ({
  useTasksState: vi.fn(),
  useTasksActions: vi.fn(),
  useTasksViewModel: vi.fn(),
}));

import { useTasksActions, useTasksState, useTasksViewModel } from "../store";

const useTasksStateMock = vi.mocked(useTasksState);
const useTasksActionsMock = vi.mocked(useTasksActions);
const useTasksViewModelMock = vi.mocked(useTasksViewModel);

function createTask(id: string, title = id): Task {
  return {
    id,
    title,
    taskType: { kind: "daily" },
    isPinned: false,
  };
}

function createState(partial: Partial<TasksState>): TasksState {
  return {
    tasks: [],
    loading: false,
    error: null,
    initialized: true,
    isExpanded: false,
    dialog: {
      isOpen: false,
      mode: "create",
      taskId: null,
    },
    ...partial,
  };
}

function createViewModel(partial: Partial<TasksViewModel>): TasksViewModel {
  return {
    visibleTasks: [],
    totalCount: 0,
    activeCount: 0,
    showExpandButton: false,
    requiresScroll: false,
    isExpanded: false,
    ...partial,
  };
}

function createActions(): TasksActions {
  return {
    initialize: vi.fn(async () => undefined),
    createTask: vi.fn(async () => createTask("created")),
    updateTask: vi.fn(async () => createTask("updated")),
    deleteTask: vi.fn(async () => []),
    completeTask: vi.fn(async () => []),
    setTaskPinned: vi.fn(async () => createTask("pinned")),
    cleanupCompletedTasks: vi.fn(async () => 0),
    toggleExpand: vi.fn(),
    openCreateDialog: vi.fn(),
    openEditDialog: vi.fn(),
    closeDialog: vi.fn(),
  };
}

describe("TasksWidget", () => {
  const messages = getTasksMessages("ja");

  beforeEach(() => {
    useTasksActionsMock.mockReset();
    useTasksStateMock.mockReset();
    useTasksViewModelMock.mockReset();
  });

  it("renders loading state only during first initialization", () => {
    // 準備
    useTasksActionsMock.mockReturnValue(createActions());
    useTasksStateMock.mockReturnValue(createState({ initialized: false, loading: true }));
    useTasksViewModelMock.mockReturnValue(createViewModel({}));

    // 実行
    const markup = renderToStaticMarkup(<TasksWidget />);

    // 検証
    expect(markup).toContain(messages.widget.loading);
  });

  it("renders task dialog modal when dialog state is open", () => {
    // 準備
    useTasksActionsMock.mockReturnValue(createActions());
    useTasksStateMock.mockReturnValue(
      createState({
        tasks: [createTask("task-1", "Dialog target")],
        dialog: {
          isOpen: true,
          mode: "edit",
          taskId: "task-1",
        },
      }),
    );
    useTasksViewModelMock.mockReturnValue(createViewModel({ totalCount: 1, visibleTasks: [createTask("task-1")] }));

    // 実行
    const markup = renderToStaticMarkup(<TasksWidget />);

    // 検証
    expect(markup).toContain("task-dialog-modal");
    expect(markup).toContain(messages.dialog.modeEdit);
  });

  it("renders fatal error state only before initialization", () => {
    // 準備
    useTasksActionsMock.mockReturnValue(createActions());
    useTasksStateMock.mockReturnValue(
      createState({
        initialized: false,
        loading: false,
        error: "failed to initialize",
      }),
    );
    useTasksViewModelMock.mockReturnValue(createViewModel({}));

    // 実行
    const markup = renderToStaticMarkup(<TasksWidget />);

    // 検証
    expect(markup).toContain("failed to initialize");
    expect(markup).not.toContain("data-testid=\"create-task-button\"");
  });

  it("applies native locale action by calling locale setter", () => {
    // 仕様: ネイティブメニューの言語選択イベントはlocale切替へ反映される。
    const setLocale = vi.fn();
    const openEditDialog = vi.fn();
    const setTaskPinned = vi.fn(async () => undefined);
    const payload: NativeMenuActionPayload = { action: "set-locale", locale: "en" };

    applyNativeMenuAction(payload, { setLocale, openEditDialog, setTaskPinned });

    expect(setLocale).toHaveBeenCalledWith("en");
    expect(openEditDialog).not.toHaveBeenCalled();
    expect(setTaskPinned).not.toHaveBeenCalled();
  });

  it("applies native task actions to existing handlers", () => {
    // 仕様: ネイティブメニューの task edit/pin action は既存actionsへ委譲する。
    const setLocale = vi.fn();
    const openEditDialog = vi.fn();
    const setTaskPinned = vi.fn(async () => undefined);

    applyNativeMenuAction(
      { action: "task-edit", taskId: "task-1" },
      { setLocale, openEditDialog, setTaskPinned },
    );
    applyNativeMenuAction(
      { action: "task-pin-toggle", taskId: "task-2", nextIsPinned: true },
      { setLocale, openEditDialog, setTaskPinned },
    );

    expect(openEditDialog).toHaveBeenCalledWith("task-1");
    expect(setTaskPinned).toHaveBeenCalledWith("task-2", true);
    expect(setLocale).not.toHaveBeenCalled();
  });
});

