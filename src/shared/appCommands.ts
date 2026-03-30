import { invoke } from "@tauri-apps/api/core";
import type { TaskId } from "./types/task";

export const APP_COMMANDS = {
  quitApplication: "quit_app",
  getAutostartEnabled: "get_autostart_enabled",
  setAutostartEnabled: "set_autostart_enabled",
  showContextMenu: "show_context_menu",
} as const;

export type NativeContextMenuLocale = "ja" | "en";

export type ShowContextMenuInput =
  | {
      kind: "app";
      x: number;
      y: number;
      locale: NativeContextMenuLocale;
    }
  | {
      kind: "task";
      x: number;
      y: number;
      locale: NativeContextMenuLocale;
      taskId: TaskId;
      isPinned: boolean;
      isCompleted: boolean;
    };

export type NativeMenuActionPayload =
  | {
      action: "set-locale";
      locale: NativeContextMenuLocale;
    }
  | {
      action: "task-edit";
      taskId: TaskId;
    }
  | {
      action: "task-pin-toggle";
      taskId: TaskId;
      nextIsPinned: boolean;
    }
  | {
      action: "task-delete";
      taskId: TaskId;
    };

export async function quitApplication(): Promise<void> {
  await invoke(APP_COMMANDS.quitApplication);
}

export async function getAutostartEnabled(): Promise<boolean> {
  return invoke<boolean>(APP_COMMANDS.getAutostartEnabled);
}

export async function setAutostartEnabled(enabled: boolean): Promise<boolean> {
  return invoke<boolean>(APP_COMMANDS.setAutostartEnabled, { enabled });
}

export async function showContextMenu(input: ShowContextMenuInput): Promise<void> {
  await invoke(APP_COMMANDS.showContextMenu, { input });
}
