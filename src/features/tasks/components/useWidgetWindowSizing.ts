import { useEffect, type RefObject } from "react";

import { createWidgetSizeSyncController, type WidgetWindowSize } from "./widgetSizeSyncController";

interface UseWidgetWindowSizingOptions {
  containerRef: RefObject<HTMLElement | null>;
  watchValues: readonly unknown[];
}

interface DialogPanelSizeSource {
  scrollWidth: number;
  scrollHeight: number;
}

const DIALOG_PANEL_SELECTOR = "[data-testid='task-dialog-panel']";
const DIALOG_WINDOW_MARGIN_PX = 24;

let resizeCapabilityUnavailable = false;

function queryDialogPanel(): HTMLElement | null {
  return document.querySelector<HTMLElement>(DIALOG_PANEL_SELECTOR);
}

export function isWidgetResizeUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("__TAURI_INTERNALS__") ||
    message.includes("Cannot read properties of undefined") ||
    message.includes("window.set_size not allowed") ||
    message.includes("core:window:allow-set-size")
  );
}

export function getDialogNaturalSize(
  panel: DialogPanelSizeSource | null,
  marginPx = DIALOG_WINDOW_MARGIN_PX,
): WidgetWindowSize | null {
  if (!panel) {
    return null;
  }

  return {
    width: Math.max(1, Math.ceil(panel.scrollWidth + marginPx)),
    height: Math.max(1, Math.ceil(panel.scrollHeight + marginPx)),
  };
}

export function resolveRequestedWindowSize(
  bodyRect: Pick<DOMRectReadOnly, "width" | "height">,
  dialogSize: WidgetWindowSize | null,
): WidgetWindowSize {
  const bodySize: WidgetWindowSize = {
    width: Math.max(1, Math.ceil(bodyRect.width)),
    height: Math.max(1, Math.ceil(bodyRect.height)),
  };

  if (!dialogSize) {
    return bodySize;
  }

  return {
    // 横幅は常にウィジェット基準を維持し、ダイアログ表示で幅が跳ねないようにする。
    width: bodySize.width,
    height: Math.max(bodySize.height, dialogSize.height),
  };
}

export function useWidgetWindowSizing({ containerRef, watchValues }: UseWidgetWindowSizingOptions) {
  useEffect(() => {
    if (resizeCapabilityUnavailable || typeof window === "undefined" || !containerRef.current) {
      return;
    }

    let isDisposed = false;
    let frameId: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let dialogResizeObserver: ResizeObserver | null = null;
    let observedDialogPanel: HTMLElement | null = null;
    let windowApiUnavailable = false;

    const resizeController = createWidgetSizeSyncController({
      applySize: async (size) => {
        if (isDisposed || windowApiUnavailable) {
          return;
        }

        try {
          const { LogicalSize, getCurrentWindow } = await import("@tauri-apps/api/window");
          if (isDisposed) {
            return;
          }
          await getCurrentWindow().setSize(new LogicalSize(size.width, size.height));
        } catch (error) {
          // ブラウザ単体実行や権限不足は、再試行しても解消しないため同期を停止する。
          if (isWidgetResizeUnsupportedError(error)) {
            windowApiUnavailable = true;
            resizeCapabilityUnavailable = true;
            return;
          }
          throw error;
        }
      },
      reportError: (error) => {
        console.error("[tasks] widget resize failed", error);
      },
    });

    const observeDialogPanel = () => {
      if (typeof ResizeObserver === "undefined") {
        return;
      }

      const dialogPanel = queryDialogPanel();
      if (dialogPanel === observedDialogPanel) {
        return;
      }

      dialogResizeObserver?.disconnect();
      observedDialogPanel = dialogPanel;

      if (!dialogPanel) {
        dialogResizeObserver = null;
        return;
      }

      dialogResizeObserver = new ResizeObserver(() => {
        scheduleResize();
      });
      dialogResizeObserver.observe(dialogPanel);
    };

    const scheduleResize = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        const bodyRect = document.body.getBoundingClientRect();
        observeDialogPanel();
        const dialogPanel = queryDialogPanel();
        const dialogSize = getDialogNaturalSize(dialogPanel);
        resizeController.requestSize(resolveRequestedWindowSize(bodyRect, dialogSize));
      });
    };

    const currentContainer = containerRef.current;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        scheduleResize();
      });
      resizeObserver.observe(currentContainer);
    }

    window.addEventListener("resize", scheduleResize);
    observeDialogPanel();
    scheduleResize();

    return () => {
      isDisposed = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", scheduleResize);
      resizeObserver?.disconnect();
      dialogResizeObserver?.disconnect();
      resizeController.dispose();
    };
  }, [containerRef, ...watchValues]);
}
