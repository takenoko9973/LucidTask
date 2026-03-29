export interface WidgetWindowSize {
  width: number;
  height: number;
}

interface WidgetSizeSyncControllerOptions {
  applySize: (size: WidgetWindowSize) => Promise<void>;
  reportError?: (error: unknown) => void;
}

export interface WidgetSizeSyncController {
  requestSize: (size: WidgetWindowSize) => void;
  dispose: () => void;
}

function isSameSize(left: WidgetWindowSize, right: WidgetWindowSize): boolean {
  return left.width === right.width && left.height === right.height;
}

export function createWidgetSizeSyncController(
  options: WidgetSizeSyncControllerOptions,
): WidgetSizeSyncController {
  let isDisposed = false;
  let isRunning = false;
  let pendingSize: WidgetWindowSize | null = null;
  let lastAppliedSize: WidgetWindowSize | null = null;

  const run = async () => {
    if (isRunning) {
      return;
    }
    isRunning = true;

    try {
      while (!isDisposed && pendingSize !== null) {
        const nextSize = pendingSize;
        pendingSize = null;

        if (lastAppliedSize !== null && isSameSize(lastAppliedSize, nextSize)) {
          continue;
        }

        try {
          await options.applySize(nextSize);
          if (!isDisposed) {
            lastAppliedSize = nextSize;
          }
        } catch (error) {
          options.reportError?.(error);
        }
      }
    } finally {
      isRunning = false;
    }
  };

  return {
    requestSize(size) {
      if (isDisposed) {
        return;
      }
      pendingSize = {
        width: size.width,
        height: size.height,
      };
      void run();
    },
    dispose() {
      isDisposed = true;
      pendingSize = null;
    },
  };
}
