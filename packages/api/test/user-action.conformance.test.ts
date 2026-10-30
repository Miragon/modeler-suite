// @vitest-environment jsdom
/**
 * The user-action case deletes a selected element with Delete on the focused canvas, and redoes
 * such a delete, so those legs run here, in jsdom, against the reference modeler mounted into
 * attachedHost(): the conforming reference passes them without a skip or an advisory, a variant
 * whose import runs at once only during a delete advises exactly once, from the user-action case,
 * and whatever keeps the case from pressing Delete on the canvas is reported as a skip.
 */
import { describe, expect, test } from "vitest";

import { conformanceCases } from "../src/conformance.js";
import type { Flaws } from "./reference-modeler.js";
import { CASE, harness, mounted, runCases } from "./support.js";

const userActionCase = conformanceCases().find((c) => c.name === CASE.userAction);

async function runUserActionCase(h = mounted()) {
  if (!userActionCase) throw new Error(`the kit has no case "${CASE.userAction}"`);
  return (await userActionCase.run(h)) ?? undefined;
}

/** no failure anywhere, and one advisory, from the user-action case; returns its advice */
async function expectUserActionAdvisory(flaws: Flaws): Promise<string> {
  const outcomes = await runCases(mounted(flaws), "sequential");
  expect(outcomes.filter((r) => r.failed).map((r) => r.name)).toEqual([]);
  const advised = outcomes.flatMap((r) =>
    (r.outcome?.advisories ?? []).map((advice): [string, string] => [r.name, advice]),
  );
  expect(advised.map(([name]) => name)).toEqual([CASE.userAction]);
  return advised[0]?.[1] ?? "";
}

describe("the user-action case in a DOM", () => {
  test("the conforming reference, mounted, deletes, undoes and redoes with its listener's import waiting: nothing fails, skips or advises", async () => {
    await expect(runUserActionCase()).resolves.toEqual({});
  });

  test("a second canonical text that is what the delete and the redo leave → nothing fails, skips or advises: an action that leaves the imported document is no import inside it", async () => {
    const leftByTheDelete = mounted(
      {},
      { canonicalTexts: ["alpha\nbeta\ngamma\n", "beta\ngamma\n", "title: Tea\nalpha\n"] },
    );
    await expect(runUserActionCase(leftByTheDelete)).resolves.toEqual({});
  });

  test("an import that runs at once only during a delete → an advisory from the user-action case, naming the delete", async () => {
    const advice = await expectUserActionAdvisory({ importDuringDeleteRunsAtOnce: true });
    expect(advice).toMatch(
      /importing a different document \(canonicalTexts\[1\]\) from the selection listener during a delete of the selected element 'alpha' \(Delete on the focused canvas\) ran before the action had finished/,
    );
    expect(advice).not.toMatch(/during an undo|during a redo/);
  });

  test("an import that runs at once during every command → one advisory naming the delete, the undo and the redo", async () => {
    const advice = await expectUserActionAdvisory({ importDuringCommandRunsAtOnce: true });
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
    const outcome = await runUserActionCase(mounted({ noCanvasKeys: true }));
    expect(outcome?.advisories).toBeUndefined();
    expect(outcome?.skipped).toBe(
      "Delete and Backspace on the focused canvas left the revealed element 'alpha' in place — a delete and the redo of a delete were not checked",
    );
  });

  test("a create() that mounts into no attachedHost() → a skip naming attachedHost()", async () => {
    const outcome = await runUserActionCase(harness());
    expect(outcome?.skipped).toMatch(
      /^create\(\) mounted the modeler into no attachedHost\(\) that holds a focusable <svg> .*; a delete and the redo of a delete were not checked$/,
    );
  });
});
