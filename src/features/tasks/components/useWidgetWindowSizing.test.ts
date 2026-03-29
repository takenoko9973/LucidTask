import { describe, expect, it } from "vitest";

import {
  getDialogNaturalSize,
  isWidgetResizeUnsupportedError,
  resolveRequestedWindowSize,
} from "./useWidgetWindowSizing";

function createError(message: string): Error {
  return new Error(message);
}

describe("isWidgetResizeUnsupportedError", () => {
  it("returns true for browser dynamic import failure", () => {
    // 準備
    const error = createError("Failed to fetch dynamically imported module");

    // 実行
    const result = isWidgetResizeUnsupportedError(error);

    // 検証
    expect(result).toBe(true);
  });

  it("returns true for tauri internals missing error", () => {
    // 準備
    const error = createError("__TAURI_INTERNALS__ is not defined");

    // 実行
    const result = isWidgetResizeUnsupportedError(error);

    // 検証
    expect(result).toBe(true);
  });

  it("returns true for set_size permission denied", () => {
    // 準備
    const error = createError(
      "window.set_size not allowed. Permissions associated with this command: core:window:allow-set-size",
    );

    // 実行
    const result = isWidgetResizeUnsupportedError(error);

    // 検証
    expect(result).toBe(true);
  });

  it("returns false for unrelated resize failures", () => {
    // 準備
    const error = createError("unexpected io timeout");

    // 実行
    const result = isWidgetResizeUnsupportedError(error);

    // 検証
    expect(result).toBe(false);
  });
});

describe("getDialogNaturalSize", () => {
  it("returns null when dialog panel is missing", () => {
    // 実行
    const size = getDialogNaturalSize(null);

    // 検証
    expect(size).toBeNull();
  });

  it("calculates natural size using scroll dimensions and margin", () => {
    // 準備
    const panel = {
      scrollWidth: 420,
      scrollHeight: 360,
    };

    // 実行
    const size = getDialogNaturalSize(panel);

    // 検証
    expect(size).toEqual({
      width: 444,
      height: 384,
    });
  });

  it("supports zero margin for boundary validation", () => {
    // 準備
    const panel = {
      scrollWidth: 300,
      scrollHeight: 240,
    };

    // 実行
    const size = getDialogNaturalSize(panel, 0);

    // 検証
    expect(size).toEqual({
      width: 300,
      height: 240,
    });
  });
});

describe("resolveRequestedWindowSize", () => {
  it("uses body size when dialog is absent", () => {
    // 準備
    const bodyRect = {
      width: 401.2,
      height: 300.1,
    };

    // 実行
    const size = resolveRequestedWindowSize(bodyRect, null);

    // 検証
    expect(size).toEqual({
      width: 402,
      height: 301,
    });
  });

  it("prefers larger dialog size over body size", () => {
    // 準備
    const bodyRect = {
      width: 420,
      height: 280,
    };
    const dialogSize = {
      width: 444,
      height: 384,
    };

    // 実行
    const size = resolveRequestedWindowSize(bodyRect, dialogSize);

    // 検証
    expect(size).toEqual({
      width: 420,
      height: 384,
    });
  });

  it("keeps larger body axis when dialog is smaller on that axis", () => {
    // 準備
    const bodyRect = {
      width: 460,
      height: 320,
    };
    const dialogSize = {
      width: 444,
      height: 384,
    };

    // 実行
    const size = resolveRequestedWindowSize(bodyRect, dialogSize);

    // 検証
    expect(size).toEqual({
      width: 460,
      height: 384,
    });
  });

  it("does not expand width when dialog is wider than body", () => {
    // 準備
    const bodyRect = {
      width: 380,
      height: 300,
    };
    const dialogSize = {
      width: 444,
      height: 360,
    };

    // 実行
    const size = resolveRequestedWindowSize(bodyRect, dialogSize);

    // 検証
    expect(size).toEqual({
      width: 380,
      height: 360,
    });
  });
});

