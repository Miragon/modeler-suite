import type { CollaborativeModeler } from "../index.js";
import type { CaseOutcome, ConformanceHarness, InteractionState } from "./harness.js";
import { hostMadeSince } from "./hosts.js";

export function fail(message: string): never {
  throw new Error(`modeler-api conformance: ${message}`);
}

export const skip = (reason: string): CaseOutcome => ({ skipped: reason });

export function exportOrFail(modeler: CollaborativeModeler, when: string): string {
  try {
    return modeler.exportText();
  } catch (error) {
    fail(`exportText threw ${when}: ${String(error)}`);
  }
}

export const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

/** a view state with NaN/Infinity is what a detached or 0×0 host produces */
export function assertFinite(state: unknown, when: string): void {
  const json = JSON.stringify(state, (_key, value: unknown) =>
    typeof value === "number" && !Number.isFinite(value) ? "__non_finite__" : value,
  );
  if (json?.includes("__non_finite__")) {
    fail(
      `getViewState() ${when} contains a non-finite number — the host has no size (mount into attachedHost())`,
    );
  }
}

const defaultSettle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export const settleOf = (harness: ConformanceHarness): (() => Promise<void>) =>
  harness.settle ?? defaultSettle;

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
  const settle = settleOf(harness);
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

export const firstText = (harness: ConformanceHarness): string => harness.canonicalTexts[0] ?? "";

export const secondText = (harness: ConformanceHarness): string =>
  harness.canonicalTexts[1] ?? harness.canonicalTexts[0] ?? "";

export const UNKNOWN_ELEMENT_ID = "__modeler_api_no_such_id__";

export const sortedIds = (modeler: CollaborativeModeler): string[] | undefined =>
  modeler.elements ? [...modeler.elements.list().map((element) => element.id)].sort() : undefined;

export async function importOrFail(
  modeler: CollaborativeModeler,
  text: string,
  failure: string,
): Promise<void> {
  await modeler.importText(text).catch((error: unknown) => fail(`${failure}: ${String(error)}`));
}

export const importFirstText = (
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
  failure = "importText(canonicalTexts[0]) rejected",
): Promise<void> => importOrFail(modeler, firstText(harness), failure);

/**
 * import the first canonical text that renders at least one element (an
 * empty document has no fitted view — renderers leave the viewport alone),
 * and return it; without an elements surface the first text is used
 */
export async function importContentText(
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
): Promise<string> {
  for (const text of harness.canonicalTexts) {
    await modeler.importText(text);
    if (!modeler.elements || modeler.elements.list().length > 0) return text;
  }
  fail(
    "L5 needs a canonical text that renders at least one element — an empty document has no fitted view",
  );
}

export async function foreignRoundTrips(
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
  who: string,
): Promise<void> {
  for (const { text, mustSurvive } of harness.foreignTexts ?? []) {
    if (mustSurvive.length === 0)
      fail("a foreignTexts entry must name at least one fragment in mustSurvive");
    await modeler.importText(text); // warnings allowed — a throw is the violation
    const first = exportOrFail(modeler, `${who}after importing a document with foreign content`);
    for (const fragment of mustSurvive) {
      if (!first.includes(fragment))
        fail(`${who}foreign content was dropped on import → export: '${fragment}' is missing`);
    }
    await modeler.importText(first);
    const second = exportOrFail(
      modeler,
      `${who}after re-importing its own export of foreign content`,
    );
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

export const selectionOf = (modeler: CollaborativeModeler): string =>
  modeler.elements ? JSON.stringify([...modeler.elements.selection()].sort()) : "";

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
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
  instance: KeyedInstance,
  firstSerial: number,
  unverified = "keys were not verified",
): MountedCanvas | string {
  const search = hostMadeSince(harness, modeler, firstSerial, (host) =>
    host.querySelector(CANVAS_SELECTOR),
  );
  switch (search.kind) {
    case "found":
      return { canvas: search.element, host: search.mount.host, wrapper: search.mount.wrapper };
    case "unnamed":
      return `canvasElement() names no canvas for the ${instance}; ${unverified}`;
    case "outside":
      return `the canvas canvasElement() names for the ${instance} lies in no attachedHost() — the kit puts host controls into that host and hides it; ${unverified}`;
  }
  const made = instance === "modeler" ? "create()" : "createReadonly()";
  return search.count === 0
    ? `${made} mounted the ${instance} into no attachedHost() that holds a focusable <svg> (one with a tabindex, diagram-js's canvas) — mount into one, or name the canvas with canvasElement; ${unverified}`
    : `${made} made ${search.count} attachedHost() elements that hold a focusable <svg> — the kit cannot tell which one is the ${instance}'s canvas (run the cases one after another, or name the canvas with canvasElement); ${unverified}`;
}

/**
 * opens the harness's interaction and reads it back; an `interactionState` that reports none fails,
 * since the case would prove nothing
 */
export async function openAndRead(
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
  openInteraction: NonNullable<ConformanceHarness["openInteraction"]>,
): Promise<InteractionState | undefined> {
  await openInteraction(modeler);
  await settleOf(harness)();
  const opened = harness.interactionState?.(modeler);
  if (harness.interactionState && opened === undefined) {
    fail("interactionState reports no interaction after openInteraction — the case proves nothing");
  }
  return opened;
}

export const interactionKept = (
  opened: InteractionState,
  after: InteractionState | undefined,
): boolean => after?.elementId === opened.elementId && after?.text === opened.text;

/** what a step did to an interaction it did not keep, as an advice names it */
export const leftOpen = (after: InteractionState | undefined): string =>
  after === undefined ? "closed it" : `left ${JSON.stringify(after)} open`;

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

/** what `promise` settles with, or `onTimeout` once `ms` have passed without it settling */
export async function raceTheBound<T>(promise: Promise<T>, onTimeout: T, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout), ms);
  });
  try {
    return await Promise.race([promise, bound]);
  } finally {
    clearTimeout(timer);
  }
}

export async function errorOf(step: () => Promise<void> | void): Promise<string | undefined> {
  try {
    await step();
    return undefined;
  } catch (error) {
    return String(error);
  }
}
