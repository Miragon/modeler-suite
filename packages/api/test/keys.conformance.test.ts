// @vitest-environment jsdom
/**
 * The keys case needs a document to aim keys at, so it runs here, in jsdom, against the reference
 * modeler mounted into attachedHost(): mounted, the conforming reference passes every case, skips
 * nothing and advises nothing; each variant that misses the recommendation fails nothing and
 * advises exactly once, from the keys case; and every reason the case cannot verify the keys is
 * reported as a skip. The cases run one after the other, because every mounted modeler listens to
 * the one document the keys case dispatches in.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  attachedHost,
  type CaseOutcome,
  type ConformanceHarness,
  conformanceCases,
  registerConformance,
} from "../src/conformance.js";
import type { CollaborativeModeler } from "../src/index.js";
import { createReferenceModeler, type Flaws, type ReferenceModeler } from "./reference-modeler.js";
import { CASE, harness, mounted, runCases } from "./support.js";

/** the canvas the reference drew, as a harness names it with canvasElement */
const referenceCanvas = (m: CollaborativeModeler): Element | undefined =>
  (m as ReferenceModeler).canvasElement();

afterEach(() => {
  vi.unstubAllGlobals();
});

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
      (wrapper) => wrapper.style.display === "none" || wrapper.style.visibility === "hidden",
    );
    expect(hidden).toEqual([]);
  });

  test("the keys case aims keys at <body> while the host hides the modeler with display: none, with visibility: hidden and while it makes it inert", async () => {
    const hidings = new Set<string>();
    const record = (event: Event): void => {
      if (event.target !== document.body) return;
      for (const wrapper of document.body.querySelectorAll<HTMLElement>("body > div")) {
        if (wrapper.style.display === "none") hidings.add("display: none");
        if (wrapper.style.visibility === "hidden") hidings.add("visibility: hidden");
        if (wrapper.hasAttribute("inert")) hidings.add("inert");
      }
    };
    document.addEventListener("keydown", record, true);
    try {
      const outcome = await runKeysCase(mounted());
      expect(outcome?.advisories).toBeUndefined();
    } finally {
      document.removeEventListener("keydown", record, true);
    }
    expect([...hidings].sort()).toEqual(["display: none", "inert", "visibility: hidden"]);
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

  test("keys aimed at <body> taken as the canvas's → an advisory for every <body> variant, the hidden (display: none, visibility: hidden) and the inert modeler included", async () => {
    const advice = await expectKeysAdvisory({ bodyKeysAreCanvasKeys: true });
    for (const body of [
      "<body> with nothing focused",
      "<body> right after the canvas lost the focus",
      "<body> while the host hides the modeler \\(display: none\\)",
      "<body> while the host hides the modeler \\(visibility: hidden\\)",
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
    expect(advice).toMatch(/Backspace on a host <button> next to the canvas fired/);
    expect(findingsOf(advice)).not.toMatch(/beside the modeler|<body>/);
  });

  test("keys aimed anywhere in the modeler's own container taken as the canvas's → an advisory for a host's overlay editors next to the canvas", async () => {
    const advice = await expectKeysAdvisory({ containerKeysAreCanvasKeys: true });
    expect(advice).toMatch(
      /^keys left the canvas: Backspace on a host <button> next to the canvas fired onContentChanged/,
    );
    expect(advice).toMatch(
      /a focusable element in a host \.monaco-editor next to the canvas fired/,
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

  test("the keys that move or zoom the canvas (Shift+Arrow, Cmd/Ctrl+Arrow, Cmd/Ctrl+=) prevented wherever they are aimed → an advisory that names them", async () => {
    const advice = await expectKeysAdvisory({ canvasMoveKeysAnywhere: true });
    expect(advice).toMatch(
      /^keys left the canvas: Shift\+ArrowLeft on a host <button> beside the modeler prevented it;/,
    );
    expect(advice).toMatch(/; Ctrl\+= on a host <button> beside the modeler prevented it;/);
    expect(advice).toMatch(/; Meta\+ArrowLeft on a host <button> beside the modeler prevented it;/);
    expect(advice).toMatch(
      /; Ctrl\+Shift\+ArrowLeft on a host <button> beside the modeler prevented/,
    );
    expect(findingsOf(advice)).not.toMatch(/changed|fired|stopped/);
  });

  test("Cmd/Ctrl+V aimed anywhere pasting a macrotask later → an advisory that names the change once the keys settled", async () => {
    const advice = await expectKeysAdvisory({ deferredPasteAnywhere: true });
    expect(advice).toMatch(
      /^keys left the canvas: a key on a host <button> beside the modeler changed the document once it settled;/,
    );
    expect(findingsOf(advice)).not.toMatch(/prevented|stopped|threw|the viewer/);
  });

  test("a keyup prevented outside the canvas → an advisory that names the prevented key", async () => {
    const advice = await expectKeysAdvisory({ preventsKeyupOutsideCanvas: true });
    expect(advice).toMatch(
      /^keys left the canvas: Backspace on a host <button> beside the modeler prevented it;/,
    );
    expect(findingsOf(advice)).not.toMatch(/changed|fired|stopped/);
  });

  test("a viewer that pans on an arrow aimed anywhere → an advisory for the viewer alone", async () => {
    const advice = await expectKeysAdvisory({ viewerTakesArrowsAnywhere: true });
    expect(advice).toMatch(
      /^keys left the canvas: the viewer: ArrowLeft on a host <button> beside the modeler prevented it;/,
    );
    const findings = findingsOf(advice)
      .replace(/^keys left the canvas: /, "")
      .split("; ");
    expect(findings.filter((finding) => !/^the viewer: |^and \d+ more$/.test(finding))).toEqual([]);
  });

  test("where the browser has EditContext, an EditContext editor is a host control too", async () => {
    vi.stubGlobal("EditContext", class {});
    const advice = await expectKeysAdvisory({ onlyTextFieldsKeepKeys: true });
    expect(advice).toMatch(
      /Backspace on a host EditContext editor beside the modeler fired onContentChanged/,
    );
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

describe("a harness that names the canvas with canvasElement", () => {
  test("a canvas that is a focusable <div>, named by canvasElement → every case passes, nothing skips, nothing advises", async () => {
    const outcomes = await runCases(
      mounted({ canvasIsDiv: true }, { canvasElement: referenceCanvas }),
      "sequential",
    );
    expect(outcomes.filter((r) => r.failed).map((r) => r.name)).toEqual([]);
    expect(outcomes.filter((r) => r.outcome?.skipped !== undefined).map((r) => r.name)).toEqual([]);
    expect(outcomes.flatMap((r) => r.outcome?.advisories ?? [])).toEqual([]);
  });

  test("the same canvas without canvasElement → a skip that points to canvasElement", async () => {
    const outcome = await runKeysCase(mounted({ canvasIsDiv: true }));
    expect(outcome?.skipped).toMatch(
      /^create\(\) mounted the modeler into no attachedHost\(\) that holds a focusable <svg> .* name the canvas with canvasElement;/,
    );
  });

  test("canvasElement tells the modeler's canvas from another one mounted at the same time", async () => {
    const decoys: ReferenceModeler[] = [];
    const besideADecoy = async (): Promise<ReferenceModeler> => {
      const decoy = createReferenceModeler();
      decoy.attachTo(attachedHost());
      decoys.push(decoy);
      const m = createReferenceModeler();
      m.attachTo(attachedHost());
      return m;
    };
    try {
      const outcome = await runKeysCase(
        mounted({}, { create: besideADecoy, canvasElement: referenceCanvas }),
      );
      expect(outcome).toEqual({});
    } finally {
      for (const decoy of decoys) decoy.destroy();
    }
  });

  test("a canvasElement that names nothing → a skip", async () => {
    const outcome = await runKeysCase(mounted({}, { canvasElement: () => null }));
    expect(outcome?.skipped).toMatch(/^canvasElement\(\) names no canvas for the modeler;/);
  });

  test("a canvasElement that names an element outside every attachedHost() → a skip", async () => {
    const stray = document.createElement("div");
    stray.tabIndex = 0;
    document.body.append(stray);
    try {
      const outcome = await runKeysCase(mounted({}, { canvasElement: () => stray }));
      expect(outcome?.skipped).toMatch(
        /^the canvas canvasElement\(\) names for the modeler lies in no attachedHost\(\)/,
      );
    } finally {
      stray.remove();
    }
  });
});

describe("registerConformance", () => {
  test("reports a case's advisories before its skip, so an onSkip that throws does not hide them", async () => {
    const reported: string[] = [];
    const registered = new Map<string, () => Promise<void>>();
    registerConformance(
      mounted({ noCanvasKeys: true, preventsClipboardKeysEverywhere: true }),
      (name, fn) => registered.set(name, fn),
      {
        onSkip: (_name, reason) => {
          reported.push("skip");
          throw new Error(reason);
        },
        onAdvisory: () => {
          reported.push("advisory");
        },
      },
    );
    const runKeys = registered.get(`conformance: ${CASE.keys}`);
    if (!runKeys) throw new Error("registerConformance registered no keys case");
    await expect(runKeys()).rejects.toThrow(/^Delete and Backspace on the focused canvas/);
    expect(reported).toEqual(["advisory", "skip"]);
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
    expect(outcome?.skipped).toMatch(/^the canvas did not take the focus/);
  });

  test("a createReadonly() that mounts the viewer into no attachedHost() → a skip naming the viewer", async () => {
    const unmountedViewer = async (): Promise<CollaborativeModeler> =>
      createReferenceModeler({}, false);
    const outcome = await runKeysCase(mounted({}, { createReadonly: unmountedViewer }));
    expect(outcome?.skipped).toMatch(
      /^createReadonly\(\) mounted the viewer into no attachedHost\(\) that holds a focusable <svg>/,
    );
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
