import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  APP_COMMANDS,
  getAutostartEnabled,
  quitApplication,
  setAutostartEnabled,
  showContextMenu,
} from "./appCommands";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const invokeMock = vi.mocked(invoke);

describe("appCommands", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("calls quit_app command", async () => {
    // 仕様: アプリ終了は quit_app IPC を引数なしで呼び出す。
    invokeMock.mockResolvedValueOnce(undefined);

    await quitApplication();

    expect(invokeMock).toHaveBeenCalledWith(APP_COMMANDS.quitApplication);
  });

  it("calls get_autostart_enabled command", async () => {
    // 仕様: 自動起動状態は bool で取得する。
    invokeMock.mockResolvedValueOnce(true);

    const enabled = await getAutostartEnabled();

    expect(enabled).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith(APP_COMMANDS.getAutostartEnabled);
  });

  it("calls set_autostart_enabled command with enabled payload", async () => {
    // 仕様: 自動起動状態は toggle ではなく set(enabled) で同期する。
    invokeMock.mockResolvedValueOnce(false);

    const enabled = await setAutostartEnabled(false);

    expect(enabled).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith(APP_COMMANDS.setAutostartEnabled, { enabled: false });
  });

  it("calls show_context_menu command with app payload", async () => {
    // 仕様: ネイティブ右クリック表示は show_context_menu IPC に payload を渡して委譲する。
    invokeMock.mockResolvedValueOnce(undefined);

    await showContextMenu({
      kind: "app",
      x: 80,
      y: 120,
      locale: "ja",
    });

    expect(invokeMock).toHaveBeenCalledWith(APP_COMMANDS.showContextMenu, {
      input: {
        kind: "app",
        x: 80,
        y: 120,
        locale: "ja",
      },
    });
  });
});
