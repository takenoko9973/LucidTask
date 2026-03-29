import { describe, expect, it, vi } from "vitest";

import {
  createWidgetSizeSyncController,
  type WidgetWindowSize,
} from "./widgetSizeSyncController";

function createWidgetWindowSize(width = 420, height = 320): WidgetWindowSize {
  return { width, height };
}

function createDeferred<T>() {
  let resolve: ((value: T | PromiseLike<T>) => void) | null = null;
  let reject: ((reason?: unknown) => void) | null = null;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    resolve: (value: T) => resolve?.(value),
    reject: (reason?: unknown) => reject?.(reason),
  };
}

async function waitForAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("createWidgetSizeSyncController", () => {
  it("applies the initial requested size once", async () => {
    // 準備
    const applySize = vi.fn().mockResolvedValue(undefined);
    const controller = createWidgetSizeSyncController({ applySize });

    // 実行
    controller.requestSize(createWidgetWindowSize(430, 330));
    await waitForAsyncWork();

    // 検証
    expect(applySize).toHaveBeenCalledTimes(1);
    expect(applySize).toHaveBeenCalledWith(createWidgetWindowSize(430, 330));
  });

  it("does not reapply when the same size is requested repeatedly", async () => {
    // 準備
    const applySize = vi.fn().mockResolvedValue(undefined);
    const controller = createWidgetSizeSyncController({ applySize });
    const size = createWidgetWindowSize(420, 300);

    // 実行
    controller.requestSize(size);
    await waitForAsyncWork();
    controller.requestSize(size);
    await waitForAsyncWork();

    // 検証
    expect(applySize).toHaveBeenCalledTimes(1);
  });

  it("coalesces in-flight updates to the latest requested size", async () => {
    // 準備
    const firstApply = createDeferred<void>();
    const applySize = vi
      .fn<(size: WidgetWindowSize) => Promise<void>>()
      .mockImplementationOnce(async () => firstApply.promise)
      .mockResolvedValue(undefined);
    const controller = createWidgetSizeSyncController({ applySize });

    // 実行
    controller.requestSize(createWidgetWindowSize(420, 320));
    await waitForAsyncWork();
    controller.requestSize(createWidgetWindowSize(500, 320));
    controller.requestSize(createWidgetWindowSize(510, 330));
    await waitForAsyncWork();
    firstApply.resolve(undefined);
    await waitForAsyncWork();

    // 検証
    expect(applySize).toHaveBeenCalledTimes(2);
    expect(applySize.mock.calls[1]?.[0]).toEqual(createWidgetWindowSize(510, 330));
  });

  it("ignores all future requests after dispose", async () => {
    // 準備
    const applySize = vi.fn().mockResolvedValue(undefined);
    const controller = createWidgetSizeSyncController({ applySize });

    // 実行
    controller.dispose();
    controller.requestSize(createWidgetWindowSize(420, 320));
    await waitForAsyncWork();

    // 検証
    expect(applySize).not.toHaveBeenCalled();
  });

  it("reports apply errors once and does not auto-retry without a new request", async () => {
    // 準備
    const reportError = vi.fn();
    const applySize = vi.fn().mockRejectedValue(new Error("setSize failed"));
    const controller = createWidgetSizeSyncController({ applySize, reportError });

    // 実行
    controller.requestSize(createWidgetWindowSize(420, 320));
    await waitForAsyncWork();
    await waitForAsyncWork();

    // 検証
    expect(applySize).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it("retries the same size only when a new request arrives after failure", async () => {
    // 準備
    const applySize = vi
      .fn<(size: WidgetWindowSize) => Promise<void>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue(undefined);
    const controller = createWidgetSizeSyncController({ applySize });
    const size = createWidgetWindowSize(460, 340);

    // 実行
    controller.requestSize(size);
    await waitForAsyncWork();
    controller.requestSize(size);
    await waitForAsyncWork();

    // 検証
    expect(applySize).toHaveBeenCalledTimes(2);
  });
});

