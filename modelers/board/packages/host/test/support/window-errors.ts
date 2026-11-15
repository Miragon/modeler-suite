/**
 * What the window reports while a test runs. The renderer's test README warns against a window
 * listener, since Vitest stops counting unhandled errors of a page that has one: a file that
 * watches therefore asserts `errors` itself, after every test.
 */

/** Chromium's line for a ResizeObserver that could not deliver in one frame; it carries no error */
const RESIZE_OBSERVER = "ResizeObserver loop completed with undelivered notifications.";

export interface WindowErrors {
  /** every unhandled error and rejection since the watch began or `errors` was emptied */
  readonly errors: string[];
  stop(): void;
}

export function watchWindowErrors(): WindowErrors {
  const errors: string[] = [];
  const onError = (event: ErrorEvent): void => {
    if (event.message !== RESIZE_OBSERVER) errors.push(`error: ${event.message}`);
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    const { reason } = event;
    errors.push(
      `unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
    );
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return {
    errors,
    stop() {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    },
  };
}
