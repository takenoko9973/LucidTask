import { useEffect, type RefObject } from "react";

interface UseWidgetWindowSizingOptions {
  containerRef: RefObject<HTMLElement | null>;
  watchValues: readonly unknown[];
}

export function useWidgetWindowSizing({ containerRef, watchValues }: UseWidgetWindowSizingOptions) {
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) {
      return;
    }

    let isDisposed = false;
    let frameId: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let lastAppliedWidth = 0;
    let lastAppliedHeight = 0;

    const scheduleResize = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        void applySize();
      });
    };

    const applySize = async () => {
      if (isDisposed) {
        return;
      }

      const bodyRect = document.body.getBoundingClientRect();
      const width = Math.max(1, Math.ceil(bodyRect.width));
      const height = Math.max(1, Math.ceil(bodyRect.height));

      if (width === lastAppliedWidth && height === lastAppliedHeight) {
        return;
      }

      try {
        const { LogicalSize, getCurrentWindow } = await import("@tauri-apps/api/window");
        if (isDisposed) {
          return;
        }

        await getCurrentWindow().setSize(new LogicalSize(width, height));
        lastAppliedWidth = width;
        lastAppliedHeight = height;
      } catch {
        // ブラウザ実行やテスト環境ではwindow APIが存在しないため無視する。
      }
    };

    const currentContainer = containerRef.current;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        scheduleResize();
      });
      resizeObserver.observe(currentContainer);
    }

    window.addEventListener("resize", scheduleResize);
    scheduleResize();

    return () => {
      isDisposed = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", scheduleResize);
      resizeObserver?.disconnect();
    };
  }, [containerRef, ...watchValues]);
}
