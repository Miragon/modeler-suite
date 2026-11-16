/**
 * What a `console.error` spy heard, without one line that is nobody's complaint. Chromium reports
 * a ResizeObserver that could not deliver in one frame as a window error without an error object,
 * and Vitest's browser runner prints such an event through `console.error(new Error(message))`.
 * It comes with a resize, on a busy machine more often, so a test that compares everything
 * `console.error` was called with flickers unless it leaves exactly this line out.
 */
export const RESIZE_OBSERVER_LINE = "ResizeObserver loop completed with undelivered notifications.";

const isResizeObserverLine = (first: unknown): boolean =>
  first instanceof Error && first.message === RESIZE_OBSERVER_LINE;

export function complaintsOf(spy: { readonly mock: { readonly calls: unknown[][] } }): unknown[][] {
  return spy.mock.calls.filter((call) => !isResizeObserverLine(call[0]));
}
