// @vitest-environment jsdom
/**
 * A browser harness starts a gesture with pointer events, so what the modeler throws from its
 * pointer handler reaches the window, not the harness, and a browser's test runner fails the whole
 * run on an error that reaches the window unhandled. Here, in jsdom, the reference modeler starts
 * its gesture inside a DOM listener, the same way: a teardown inside the listener of the start
 * throws there. The interaction case, whose law such a modeler keeps, must keep that error from
 * the page, and the destroy case must report it as its advisory.
 */
import { expect, test } from "vitest";

import {
  type CaseOutcome,
  type ConformanceHarness,
  conformanceCases,
  type HeldGesture,
} from "../src/conformance.js";
import type { ReferenceModeler } from "./reference-modeler.js";
import { CASE, mounted } from "./support.js";

/** holds the gesture inside a pointer handler, as a browser harness does */
const startInAPointerHandler: NonNullable<ConformanceHarness["startGesture"]> = (m, kind) => {
  let held: HeldGesture | undefined;
  const target = document.createElement("div");
  document.body.append(target);
  target.addEventListener("pointerdown", () => {
    held = (m as ReferenceModeler).holdGesture(kind);
  });
  target.dispatchEvent(new Event("pointerdown"));
  target.remove();
  return {
    drop: () => held?.drop(),
    cancel: () => held?.cancel(),
  };
};

async function runCase(name: string, h: ConformanceHarness): Promise<CaseOutcome | undefined> {
  const found = conformanceCases().find((c) => c.name === name);
  if (!found) throw new Error(`the kit has no case "${name}"`);
  return (await found.run(h)) ?? undefined;
}

test("a teardown inside the listener of a drag's start throws from the pointer handler: the interaction case keeps the error from the page and passes, and the destroy case advises it", async () => {
  const h = mounted(
    { destroyTearsDownInsideTheAction: true },
    { startGesture: startInAPointerHandler },
  );
  const reachedTheWindow: ErrorEvent[] = [];
  const record = (event: ErrorEvent): void => {
    reachedTheWindow.push(event);
  };
  window.addEventListener("error", record);
  let interaction: CaseOutcome | undefined;
  let destroy: CaseOutcome | undefined;
  try {
    interaction = await runCase(CASE.interaction, h);
    const thrownInTheInteractionCase = reachedTheWindow.length;
    expect(thrownInTheInteractionCase).toBeGreaterThan(0);
    destroy = await runCase(CASE.destroyFromListener, h);
  } finally {
    window.removeEventListener("error", record);
  }
  expect(
    reachedTheWindow
      .filter((event) => !event.defaultPrevented)
      .map((event) => String(event.error ?? event.message)),
  ).toEqual([]);
  expect(interaction?.skipped).toBeUndefined();
  expect(interaction?.advisories).toBeUndefined();
  expect(destroy?.skipped).toBeUndefined();
  expect(destroy?.advisories).toHaveLength(1);
  for (const kind of ["move", "create"]) {
    expect(destroy?.advisories?.[0]).toMatch(
      new RegExp(
        `an error reached the window after destroy\\(\\) from elements\\.onSelection at the start of a ${kind}: TypeError: Cannot read properties of null \\(reading 'cursor'\\)`,
      ),
    );
  }
});
