import type { CollaborativeModeler } from "../index.js";
import { attachedHosts, type CaseOutcome, type ConformanceHarness } from "./harness.js";

export function fail(message: string): never {
  throw new Error(`modeler-api conformance: ${message}`);
}

export const skip = (reason: string): CaseOutcome => ({ skipped: reason });

export function exportOrFail(modeler: CollaborativeModeler, when: string): string {
  try {
    return modeler.exportText();
  } catch (e) {
    fail(`exportText threw ${when}: ${String(e)}`);
  }
}

export const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** a view state with NaN/Infinity is what a detached or 0×0 host produces */
export function assertFinite(state: unknown, when: string): void {
  const json = JSON.stringify(state, (_k, v: unknown) =>
    typeof v === "number" && !Number.isFinite(v) ? "__non_finite__" : v,
  );
  if (json?.includes("__non_finite__")) {
    fail(
      `getViewState() ${when} contains a non-finite number — the host has no size (mount into attachedHost())`,
    );
  }
}

export const defaultSettle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * count invocations of onContentChanged around an action — settle-aware, so
 * debounced engines neither hide an echo nor fail a legitimate event; the
 * export seen INSIDE the last delivery is returned too (L3's ordering rule)
 */
export async function changeEvents(
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
  action: () => Promise<void> | void,
): Promise<{ calls: number; exportAtEmit: string | undefined }> {
  const settle = harness.settle ?? defaultSettle;
  let calls = 0;
  let exportAtEmit: string | undefined;
  const off = modeler.onContentChanged(() => {
    calls += 1;
    exportAtEmit = modeler.exportText();
  });
  try {
    await action();
    await settle();
  } finally {
    off();
  }
  return { calls, exportAtEmit };
}

export const secondText = (h: ConformanceHarness): string =>
  h.canonicalTexts[1] ?? h.canonicalTexts[0] ?? "";

export const sortedIds = (m: CollaborativeModeler): string[] | undefined =>
  m.elements ? [...m.elements.list().map((e) => e.id)].sort() : undefined;

export async function importOrFail(
  m: CollaborativeModeler,
  text: string,
  failure: string,
): Promise<void> {
  await m.importText(text).catch((e: unknown) => fail(`${failure}: ${String(e)}`));
}

/**
 * import the first canonical text that renders at least one element (an
 * empty document has no fitted view — renderers leave the viewport alone),
 * and return it; without an elements surface the first text is used
 */
export async function importContentText(
  h: ConformanceHarness,
  m: CollaborativeModeler,
): Promise<string> {
  for (const text of h.canonicalTexts) {
    await m.importText(text);
    if (!m.elements || m.elements.list().length > 0) return text;
  }
  fail(
    "L5 needs a canonical text that renders at least one element — an empty document has no fitted view",
  );
}

export async function foreignRoundTrips(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  who: string,
): Promise<void> {
  for (const { text, mustSurvive } of h.foreignTexts ?? []) {
    if (mustSurvive.length === 0)
      fail("a foreignTexts entry must name at least one fragment in mustSurvive");
    await m.importText(text); // warnings allowed — a throw is the violation
    const first = exportOrFail(m, `${who}after importing a document with foreign content`);
    for (const fragment of mustSurvive) {
      if (!first.includes(fragment))
        fail(`${who}foreign content was dropped on import → export: '${fragment}' is missing`);
    }
    await m.importText(first);
    const second = exportOrFail(m, `${who}after re-importing its own export of foreign content`);
    if (second !== first)
      fail(`${who}foreign content did not survive a second import → export round-trip`);
  }
}

const CANVAS_SELECTOR = "svg[tabindex]";

export type Focusable = Element & HTMLOrSVGElement;

export const focusOn = (element: Element): void => {
  (element as Focusable).focus({ preventScroll: true });
};

const SHOWN_FINDINGS = 12;

export const selectionOf = (m: CollaborativeModeler): string =>
  m.elements ? JSON.stringify([...m.elements.selection()].sort()) : "";

export type KeyedInstance = "modeler" | "viewer";

interface MountedCanvas {
  canvas: Element;
  host: HTMLElement;
  wrapper: HTMLElement;
}

/**
 * the canvas of an instance made after `firstSerial`: the element `canvasElement` names, or else
 * the focusable `<svg>` in the one attachedHost() made since; a string says why the kit cannot tell,
 * ending in what `unverified` names
 */
export function mountedCanvas(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  instance: KeyedInstance,
  firstSerial: number,
  unverified = "keys were not verified",
): MountedCanvas | string {
  const live = attachedHosts.filter((entry) => entry.wrapper.isConnected);
  if (h.canvasElement) {
    const named = h.canvasElement(m);
    if (!named) return `canvasElement() names no canvas for the ${instance}; ${unverified}`;
    const mount = live.find((entry) => entry.host.contains(named));
    return mount === undefined
      ? `the canvas canvasElement() names for the ${instance} lies in no attachedHost() — the kit puts host controls into that host and hides it; ${unverified}`
      : { canvas: named, host: mount.host, wrapper: mount.wrapper };
  }
  const made = instance === "modeler" ? "create()" : "createReadonly()";
  const mounts = live.filter(
    (entry) => entry.serial >= firstSerial && entry.host.querySelector(CANVAS_SELECTOR) !== null,
  );
  const [mount] = mounts;
  const canvas = mount?.host.querySelector(CANVAS_SELECTOR);
  if (mount && canvas && mounts.length === 1) {
    return { canvas, host: mount.host, wrapper: mount.wrapper };
  }
  return mount === undefined
    ? `${made} mounted the ${instance} into no attachedHost() that holds a focusable <svg> (one with a tabindex, diagram-js's canvas) — mount into one, or name the canvas with canvasElement; ${unverified}`
    : `${made} made ${mounts.length} attachedHost() elements that hold a focusable <svg> — the kit cannot tell which one is the ${instance}'s canvas (run the cases one after another, or name the canvas with canvasElement); ${unverified}`;
}

export function adviseOn(findings: string[], lead: string, recommendation: string): CaseOutcome {
  if (findings.length === 0) return {};
  const more =
    findings.length > SHOWN_FINDINGS ? `; and ${findings.length - SHOWN_FINDINGS} more` : "";
  return {
    advisories: [
      `${lead}: ${findings.slice(0, SHOWN_FINDINGS).join("; ")}${more} — ${recommendation}`,
    ],
  };
}

export const outcomeOf = (advised: CaseOutcome, unverified: string[]): CaseOutcome => ({
  ...(unverified.length === 0 ? {} : { skipped: unverified.join("; ") }),
  ...advised,
});

export async function errorOf(step: () => Promise<void> | void): Promise<string | undefined> {
  try {
    await step();
    return undefined;
  } catch (e) {
    return String(e);
  }
}
