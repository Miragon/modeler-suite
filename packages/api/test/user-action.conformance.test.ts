// @vitest-environment jsdom
/**
 * The user-action case deletes a selected element with Delete on the focused canvas, and redoes
 * such a delete, so those legs run here, in jsdom, against the reference modeler mounted into
 * attachedHost(): the conforming reference passes them without a skip or an advisory, a variant
 * whose import runs at once only during a delete advises exactly once, from the user-action case,
 * and whatever keeps the case from pressing Delete on the canvas is reported as a skip.
 */
import { describe, expect, test } from "vitest";

import { CASE, expectAdvisoryOnly, harness, mounted, runCase } from "./support.js";

describe("the user-action case in a DOM", () => {
  test("the conforming reference, mounted, deletes, undoes and redoes with its listener's import waiting: nothing fails, skips or advises", async () => {
    await expect(runCase(CASE.userAction, mounted())).resolves.toEqual({});
  });

  test("a second canonical text that is what the delete and the redo leave → nothing fails, skips or advises: an action that leaves the imported document is no import inside it", async () => {
    const leftByTheDelete = mounted(
      {},
      { canonicalTexts: ["alpha\nbeta\ngamma\n", "beta\ngamma\n", "title: Tea\nalpha\n"] },
    );
    await expect(runCase(CASE.userAction, leftByTheDelete)).resolves.toEqual({});
  });

  test("an import that runs at once only during a delete → an advisory from the user-action case, naming the delete", async () => {
    const advice = await expectAdvisoryOnly(
      mounted({ importDuringDeleteRunsAtOnce: true }),
      CASE.userAction,
      "sequential",
    );
    expect(advice).toMatch(
      /importing a different document \(canonicalTexts\[1\]\) from the selection listener during a delete of the selected element 'alpha' \(Delete on the focused canvas\) ran before the action had finished/,
    );
    expect(advice).not.toMatch(/during an undo|during a redo/);
  });

  test("an import that runs at once during every command → one advisory naming the delete, the undo and the redo", async () => {
    const advice = await expectAdvisoryOnly(
      mounted({ importDuringCommandRunsAtOnce: true }),
      CASE.userAction,
      "sequential",
    );
    for (const action of [
      "a delete of the selected element 'alpha'",
      "an undo of the create of the selected element 'zz-\\d+'",
      "a redo of the delete of the selected element 'alpha'",
    ]) {
      expect(advice).toMatch(new RegExp(`during ${action}.* ran before the action had finished`));
    }
  });
});

describe("whatever keeps the user-action case from pressing Delete on the canvas is reported as a skip", () => {
  test("a canvas that binds no key → a skip: Delete and Backspace left the revealed element in place", async () => {
    const outcome = await runCase(CASE.userAction, mounted({ noCanvasKeys: true }));
    expect(outcome?.advisories).toBeUndefined();
    expect(outcome?.skipped).toBe(
      "Delete and Backspace on the focused canvas left the revealed element 'alpha' in place — a delete and the redo of a delete were not checked",
    );
  });

  test("a create() that mounts into no attachedHost() → a skip naming attachedHost()", async () => {
    const outcome = await runCase(CASE.userAction, harness());
    expect(outcome?.skipped).toMatch(
      /^create\(\) mounted the modeler into no attachedHost\(\) that holds a focusable <svg> .*; a delete and the redo of a delete were not checked$/,
    );
  });
});
