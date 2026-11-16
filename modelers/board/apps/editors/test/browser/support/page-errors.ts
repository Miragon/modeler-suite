import { vi } from "vitest";

/**
 * What a page says went wrong while a test ran: a window error, an unhandled rejection, a
 * `console.error`, and a line of a board's log, which holds only what the board caught from an
 * editor. A test asks for the list after its last step and expects it empty.
 */
export interface PageErrors {
  list(): string[];
  stop(): void;
}

const textOf = (value: unknown): string =>
  value instanceof Error ? `${value.name}: ${value.message}` : String(value);

// Chromium's line for a ResizeObserver that could not deliver in one frame. It is a window error
// without an error object, which Vitest's runner also prints through console.error, and it is no
// error of the page: it comes with a resize, on a busy machine more often.
const RESIZE_OBSERVER = "ResizeObserver loop completed with undelivered notifications.";

export function watchPageErrors(): PageErrors {
  const seen: string[] = [];
  const onError = (event: Event): void => {
    const { message, error } = event as ErrorEvent;
    if (!error && message === RESIZE_OBSERVER) return;
    seen.push(`window error: ${error ? textOf(error) : message}`);
  };
  const onRejection = (event: Event): void => {
    seen.push(`unhandled rejection: ${textOf((event as PromiseRejectionEvent).reason)}`);
  };
  // Vitest counts a page's unhandled errors against the run only while the test page has no
  // listener of its own, and it tells by the calls of `window.addEventListener`, which it wraps.
  // These two go past that wrapper, so the run still fails on an error this list also names.
  EventTarget.prototype.addEventListener.call(window, "error", onError);
  EventTarget.prototype.addEventListener.call(window, "unhandledrejection", onRejection);
  const error = vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
    const [first] = parts;
    if (first instanceof Error && first.message === RESIZE_OBSERVER) return;
    seen.push(`console.error: ${parts.map(textOf).join(" ")}`);
  });
  const debug = vi.spyOn(console, "debug").mockImplementation((...parts: unknown[]) => {
    if (parts[0] === "[board]")
      seen.push(`the board's log: ${parts.slice(1).map(textOf).join(" ")}`);
  });
  return {
    list: () => [...seen],
    stop() {
      EventTarget.prototype.removeEventListener.call(window, "error", onError);
      EventTarget.prototype.removeEventListener.call(window, "unhandledrejection", onRejection);
      error.mockRestore();
      debug.mockRestore();
    },
  };
}
