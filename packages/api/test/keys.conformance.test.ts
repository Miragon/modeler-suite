// @vitest-environment jsdom
/**
 * The keys case needs a document to aim keys at, so it runs here, in jsdom, against the reference
 * modeler mounted into attachedHost(): mounted, the conforming reference passes every case, skips
 * nothing and advises nothing; each variant that misses the recommendation fails nothing and
 * advises exactly once, from the keys case; and every reason the case cannot verify the keys is
 * reported as a skip. The cases run one after the other, because every mounted modeler listens to
 * the one document the keys case dispatches in.
 */
import { describe, expect, test } from "vitest";

import {
  attachedHost,
  type CaseOutcome,
  type ConformanceHarness,
  conformanceCases,
  registerConformance,
} from "../src/conformance.js";
import type { CollaborativeModeler } from "../src/index.js";
import { createReferenceModeler, type Flaws, type ReferenceModeler } from "./reference-modeler.js";
import { CASE, harness, runCases } from "./support.js";

/** the reference harness, every editing instance mounted into attachedHost() */
function mounted(
  flaws: Flaws = {},
  overrides: Partial<ConformanceHarness> = {},
): ConformanceHarness {
  return harness(flaws, {
    create: async () => {
      const m = createReferenceModeler(flaws);
      m.attachTo(attachedHost());
      return m;
    },
    ...overrides,
  });
}

const keysCase = conformanceCases().find((c) => c.name === CASE.keys);

async function runKeysCase(h: ConformanceHarness): Promise<CaseOutcome | undefined> {
  if (!keysCase) throw new Error(`the kit has no case "${CASE.keys}"`);
  return (await keysCase.run(h)) ?? undefined;
}

const press = (target: Element, key: string): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe("the conforming reference modeler, mounted", () => {
  registerConformance(mounted(), test, {
    onSkip: (name, reason) => {
      throw new Error(`the mounted harness must skip nothing — "${name}" skipped: ${reason}`);
    },
    onAdvisory: (name, advice) => {
      throw new Error(
        `the conforming reference follows every recommendation — "${name}" advised: ${advice}`,
      );
    },
  });

  test("its canvas takes a key aimed at it and leaves one aimed at <body> alone", async () => {
    const host = attachedHost();
    const m = createReferenceModeler();
    m.attachTo(host);
    try {
      await m.importText("alpha\nbeta\n");
      m.elements?.reveal("alpha");
      const canvas = host.querySelector("svg[tabindex]");
      if (!canvas) throw new Error("the reference drew no focusable canvas");
      expect(press(document.body, "Delete").defaultPrevented).toBe(false);
      expect(m.exportText()).toBe("alpha\nbeta\n");
      expect(press(canvas, "Delete").defaultPrevented).toBe(true);
      expect(m.exportText()).toBe("beta\n");
    } finally {
      m.destroy();
    }
    expect(host.querySelector("svg")).toBeNull();
  });

  test("a canvas that takes its keys in the capture phase fails nothing and advises nothing", async () => {
    const outcomes = await runCases(mounted({ keysInCapturePhase: true }), "sequential");
    expect(outcomes.filter((r) => r.failed).map((r) => r.name)).toEqual([]);
    expect(outcomes.flatMap((r) => r.outcome?.advisories ?? [])).toEqual([]);
  });

  test("the keys case leaves the page as it found it: no host controls, nothing hidden, nothing inert", async () => {
    await runKeysCase(mounted({ bodyKeysAreCanvasKeys: true }));
    expect(document.querySelector(".monaco-editor, button, input, textarea, select")).toBeNull();
    expect(document.querySelector("[inert]")).toBeNull();
    const hidden = [...document.body.querySelectorAll<HTMLElement>("body > div")].filter(
      (wrapper) => wrapper.style.display === "none",
    );
    expect(hidden).toEqual([]);
  });
});

describe("variants that miss the recommendation fail nothing and advise exactly once, from the keys case", () => {
  /** no failure anywhere, and one advisory — from the keys case; returns its advice */
  const expectKeysAdvisory = async (flaws: Flaws): Promise<string> => {
    const outcomes = await runCases(mounted(flaws), "sequential");
    expect(outcomes.filter((r) => r.failed).map((r) => r.name)).toEqual([]);
    const advised = outcomes.flatMap((r) =>
      (r.outcome?.advisories ?? []).map((advice): [string, string] => [r.name, advice]),
    );
    expect(advised.map(([name]) => name)).toEqual([CASE.keys]);
    return advised[0]?.[1] ?? "";
  };
  /** the advice without the recommendation it closes with */
  const findingsOf = (advice: string): string => advice.split(" — RECOMMENDED:")[0] ?? "";

  test("keys taken wherever they are aimed (a document-wide listener) → an advisory naming host controls and <body>", async () => {
    const advice = await expectKeysAdvisory({ documentWideKeys: true });
    expect(advice).toMatch(
      /^keys left the canvas: Backspace on a host <button> beside the modeler fired onContentChanged, changed the document, changed the selection and prevented it;/,
    );
    expect(advice).toMatch(/Backspace on a host text <input> beside the modeler fired/);
    expect(advice).toMatch(/; and \d+ more — RECOMMENDED: act on a key only while the canvas/);
  });

  test("keys aimed at <body> taken as the canvas's → an advisory for every <body> variant, the hidden and the inert modeler included", async () => {
    const advice = await expectKeysAdvisory({ bodyKeysAreCanvasKeys: true });
    for (const body of [
      "<body> with nothing focused",
      "<body> right after the canvas lost the focus",
      "<body> while the host hides the modeler \\(display: none\\)",
      "<body> while the host makes the modeler inert",
    ]) {
      expect(advice).toMatch(new RegExp(`Backspace on ${body} fired onContentChanged`));
    }
    expect(findingsOf(advice)).not.toMatch(/host </);
  });

  test("keys aimed anywhere in the element the host gave the modeler taken as the canvas's → an advisory for the host's editors inside it", async () => {
    const advice = await expectKeysAdvisory({ hostKeysAreCanvasKeys: true });
    expect(advice).toMatch(/Backspace on a host <button> inside the modeler's container fired/);
    expect(advice).toMatch(/a focusable element in a host \.monaco-editor inside the modeler's/);
    expect(advice).toMatch(/Backspace on a host <button> next to the canvas <svg> fired/);
    expect(findingsOf(advice)).not.toMatch(/beside the modeler|<body>/);
  });

  test("keys aimed anywhere in the modeler's own container taken as the canvas's → an advisory for a host's overlay editors next to the canvas", async () => {
    const advice = await expectKeysAdvisory({ containerKeysAreCanvasKeys: true });
    expect(advice).toMatch(
      /^keys left the canvas: Backspace on a host <button> next to the canvas <svg> fired onContentChanged/,
    );
    expect(advice).toMatch(
      /a focusable element in a host \.monaco-editor next to the canvas <svg> fired/,
    );
    expect(findingsOf(advice)).not.toMatch(
      /beside the modeler|inside the modeler's container|<body>/,
    );
  });

  test("only text fields keeping their keys → an advisory for a host button, a Monaco editor and <body>", async () => {
    const advice = await expectKeysAdvisory({ onlyTextFieldsKeepKeys: true });
    expect(advice).toMatch(/Backspace on a host <button> beside the modeler fired/);
    expect(advice).toMatch(/Backspace on a focusable element in a host \.monaco-editor beside/);
    expect(findingsOf(advice)).not.toMatch(/text <input>|<textarea>|<select>|contenteditable/);
  });

  test("Cmd/Ctrl+C, X and V prevented in host fields, with nothing else done → an advisory that names the prevented keys", async () => {
    const advice = await expectKeysAdvisory({ preventsClipboardKeysEverywhere: true });
    expect(advice).toMatch(
      /^keys left the canvas: Ctrl\+c on a host <button> beside the modeler prevented it; Meta\+c on a host <button> beside the modeler prevented it;/,
    );
    expect(findingsOf(advice)).not.toMatch(/changed|fired|stopped/);
  });

  test("keys outside the canvas stopped in the capture phase → an advisory that names the stopped propagation", async () => {
    const advice = await expectKeysAdvisory({ stopsKeysOutsideCanvas: true });
    expect(advice).toMatch(
      /^keys left the canvas: Backspace on a host <button> beside the modeler stopped its propagation;/,
    );
    expect(findingsOf(advice)).not.toMatch(/changed|fired|prevented/);
  });

  test("Escape anywhere clearing the selection, unprevented → an advisory that names the selection", async () => {
    const advice = await expectKeysAdvisory({ escapeAnywhereClearsSelection: true });
    expect(advice).toMatch(
      /^keys left the canvas: Escape on a host <button> beside the modeler changed the selection;/,
    );
    expect(findingsOf(advice)).not.toMatch(/document|fired|prevented|stopped/);
  });

  test("a keydown without a key that throws → an advisory that names the error, on the canvas and on <body>", async () => {
    const advice = await expectKeysAdvisory({ keylessKeyThrows: true });
    expect(advice).toMatch(/a keydown without a key on the focused canvas threw TypeError/);
    expect(advice).toMatch(
      /a keydown without a key on <body> with nothing focused threw TypeError/,
    );
    expect(findingsOf(advice)).not.toMatch(/changed|fired|prevented|stopped/);
  });
});

describe("whatever keeps the keys case from seeing a key act is reported as a skip", () => {
  test("a canvas that binds no key → a skip: Delete and Backspace left the document as it was", async () => {
    const outcome = await runKeysCase(mounted({ noCanvasKeys: true }));
    expect(outcome?.advisories).toBeUndefined();
    expect(outcome?.skipped).toMatch(
      /^Delete and Backspace on the focused canvas, with '[^']+' revealed \(selected\), left the document as it was/,
    );
  });

  test("a modeler without an elements surface (optional) → a skip: nothing to reveal and delete", async () => {
    const withoutElements = async (): Promise<CollaborativeModeler> => {
      const m = createReferenceModeler();
      m.attachTo(attachedHost());
      const { elements: _dropped, ...rest } = m;
      return rest;
    };
    const outcome = await runKeysCase(mounted({}, { create: withoutElements }));
    expect(outcome?.skipped).toMatch(/^the modeler exposes no elements surface \(optional\)/);
  });

  test("an elements surface that lists nothing → a skip: no element to reveal", async () => {
    const listsNothing = async (): Promise<CollaborativeModeler> => {
      const m = createReferenceModeler();
      m.attachTo(attachedHost());
      if (!m.elements) throw new Error("the reference exposes an elements surface");
      return { ...m, elements: { ...m.elements, list: () => [] } };
    };
    const outcome = await runKeysCase(mounted({}, { create: listsNothing }));
    expect(outcome?.skipped).toMatch(/^elements\.list\(\) reports no element/);
  });

  test("a canvas that does not take the focus → a skip", async () => {
    const unfocusable = async (): Promise<ReferenceModeler> => {
      const m = createReferenceModeler();
      const host = attachedHost();
      m.attachTo(host);
      const canvas = host.querySelector<SVGSVGElement>("svg[tabindex]");
      if (canvas) canvas.focus = () => undefined;
      return m;
    };
    const outcome = await runKeysCase(mounted({}, { create: unfocusable }));
    expect(outcome?.skipped).toMatch(/^the canvas <svg> did not take the focus/);
  });

  test("a create() that mounts into no attachedHost() → a skip naming attachedHost()", async () => {
    const outcome = await runKeysCase(harness());
    expect(outcome?.skipped).toMatch(/^create\(\) mounted the modeler into no attachedHost\(\)/);
  });

  test("a create() that fills two attachedHost() elements with a canvas → a skip: the canvas is ambiguous", async () => {
    const decoys: ReferenceModeler[] = [];
    const twoCanvases = async (): Promise<ReferenceModeler> => {
      const decoy = createReferenceModeler();
      decoy.attachTo(attachedHost());
      decoys.push(decoy);
      const m = createReferenceModeler();
      m.attachTo(attachedHost());
      return m;
    };
    try {
      const outcome = await runKeysCase(mounted({}, { create: twoCanvases }));
      expect(outcome?.skipped).toMatch(/^create\(\) made 2 attachedHost\(\) elements/);
    } finally {
      for (const decoy of decoys) decoy.destroy();
    }
  });
});
