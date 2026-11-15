import { describe, expect, it } from "vitest";
import { INVALID_STATUS_DELAY_MS, defaultMessages } from "@miragon/modeler-shell/core";
import { BOARD_NAME, createBoardLock, invalidStatus, type LockedShell } from "../src/invalid.js";

/** The shell as far as the lock drives it, with every call written down. */
function fakeShell() {
  const calls: string[] = [];
  const canvas = { inert: false };
  const shell: LockedShell = {
    canvas,
    messages: { invalidFile: (name) => `Not a valid ${name}.` },
    setReadOnly(readOnly, options) {
      calls.push(`readOnly ${readOnly} ${options?.delayMs ?? "at once"}`);
    },
    setStatus(status, options) {
      calls.push(`status ${status?.text ?? "none"} ${options?.delayMs ?? "at once"}`);
    },
  };
  return { shell, calls, canvas };
}

describe("the lock of a board whose text was refused", () => {
  it("makes the slot inert at once, and shows the shell's marks and the reason after the delay", () => {
    const { shell, calls, canvas } = fakeShell();
    const lock = createBoardLock(shell);
    expect(lock.locked()).toBe(false);

    lock.refused("line 3 is no JSON");
    expect(canvas.inert).toBe(true);
    expect(lock.locked()).toBe(true);
    expect(calls).toEqual([
      `readOnly true ${INVALID_STATUS_DELAY_MS}`,
      `status Not a valid ${BOARD_NAME}. Line 3 is no JSON. ${INVALID_STATUS_DELAY_MS}`,
    ]);
  });

  it("is undone by the next accepted text", () => {
    const { shell, calls, canvas } = fakeShell();
    const lock = createBoardLock(shell);
    lock.refused("line 3 is no JSON");
    calls.length = 0;

    lock.accepted();
    expect(canvas.inert).toBe(false);
    expect(lock.locked()).toBe(false);
    expect(calls).toEqual(["readOnly false at once", "status none at once"]);
  });

  it("names the reason of the last refused text", () => {
    const { shell, calls } = fakeShell();
    const lock = createBoardLock(shell);
    lock.refused("line 3 is no JSON");
    lock.refused("line 7 repeats the element id n_note");
    expect(calls.at(-1)).toBe(
      `status Not a valid board. Line 7 repeats the element id n_note. ${INVALID_STATUS_DELAY_MS}`,
    );
  });

  it("stays on for a document the host opened read only, without a status", () => {
    const { shell, calls, canvas } = fakeShell();
    const lock = createBoardLock(shell);
    lock.readOnlyDocument();
    expect(calls).toEqual(["readOnly true at once"]);
    expect(canvas.inert).toBe(true);

    lock.refused("line 2 is a second header");
    lock.accepted();
    expect(canvas.inert).toBe(true);
    expect(lock.locked()).toBe(true);
    expect(calls.slice(-2)).toEqual(["readOnly true at once", "status none at once"]);
  });
});

describe("what the status box says", () => {
  it("is the shell's sentence about the file, then the reader's reason as a sentence", () => {
    expect(invalidStatus({ messages: defaultMessages }, "line 12 is no JSON")).toBe(
      "This file isn't a valid board right now. The diagram shows the last valid version and is " +
        "read-only until you fix the text. Line 12 is no JSON.",
    );
    expect(
      invalidStatus(
        { messages: { invalidFile: () => "No." } },
        "the text has no header line: not a board file",
      ),
    ).toBe("No. The text has no header line: not a board file.");
    expect(invalidStatus({ messages: { invalidFile: () => "No." } }, "Ends in a stop.")).toBe(
      "No. Ends in a stop.",
    );
  });
});
