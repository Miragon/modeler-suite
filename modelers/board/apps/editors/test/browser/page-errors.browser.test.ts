/**
 * The watch the battery ends every test on: what it lists, and the one line it leaves out. A test
 * of its own, because a watch that lists nothing passes every test that expects an empty list.
 */
import { afterEach, expect, it } from "vitest";
import { watchPageErrors, type PageErrors } from "./support/page-errors.js";

const RESIZE_OBSERVER = "ResizeObserver loop completed with undelivered notifications.";

let errors: PageErrors | undefined;

afterEach(() => {
  errors?.stop();
  errors = undefined;
});

it("lists a console.error, a line of the board's log and a window error without an error object", () => {
  errors = watchPageErrors();

  console.error("the palette failed", new TypeError("no such tool"));
  console.debug("[board]", "n_map: the editor's release() failed: gone");
  console.debug("not the board's");
  // as a browser reports an error of a script it may not read: a message and no error object
  window.dispatchEvent(new ErrorEvent("error", { message: "Script error." }));

  expect(errors.list()).toEqual([
    "console.error: the palette failed TypeError: no such tool",
    "the board's log: n_map: the editor's release() failed: gone",
    // Vitest's runner listens first, and prints a window error that carries no error object
    "console.error: Error: Script error.",
    "window error: Script error.",
  ]);
});

it("leaves out Chromium's ResizeObserver line, from the window and as Vitest prints it", () => {
  errors = watchPageErrors();

  window.dispatchEvent(new ErrorEvent("error", { message: RESIZE_OBSERVER }));

  expect(errors.list()).toEqual([]);
});
