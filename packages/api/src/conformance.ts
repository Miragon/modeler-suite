/**
 * The conformance test kit — every law of the CollaborativeModeler contract
 * as an executable case. A modeler repo supplies a small HARNESS (how to
 * create an instance, canonical sample texts, scripted user mutations) and
 * binds the cases to its own test runner:
 *
 *   import { conformanceCases, registerConformance } from "@miragon/modeler-api/conformance";
 *   registerConformance(harness, test);            // node:test, vitest, jest — any (name, fn) runner
 *
 * The runner must run the cases one after another, as node:test, vitest and
 * jest do within a file unless told otherwise (no `test.concurrent`): the
 * keys case moves the focus and dispatches keys in the one document every
 * mounted instance listens to.
 *
 * Cases throw plain Errors on violation, so the kit has no runner or
 * assertion-library dependency. A case that CANNOT (fully) run because the
 * harness left an optional field undefined resolves with `{ skipped }` and
 * registerConformance reports it (console.warn by default) — a law the kit
 * did not verify is never a silent green. A RECOMMENDATION the modeler does
 * not follow resolves with `{ advisories }`, reported the same way and never
 * a failure: a recommendation becomes a law only in a major release.
 */
import {
  apiVersionsCompatible,
  type AppearanceRequest,
  type AppearanceSurface,
  type AppearanceTheme,
  type CollaborativeModeler,
  type ElementBounds,
  type ElementsSurface,
  MODELER_API_VERSION,
} from "./index.js";

export { apiVersionsCompatible };

export interface UserMutation {
  /** names the failing mutation in the kit's error message */
  name: string;
  run(modeler: CollaborativeModeler): Promise<void> | void;
}

export interface ConformanceHarness {
  /**
   * a fresh EDITABLE modeler, attached to a host element that is IN the
   * document with a non-zero size (`attachedHost()` below) — diagram-js
   * engines compute viewboxes from the host's client size, so a detached
   * or 0×0 host yields NaN view state; they also need a real browser
   * (vitest browser mode / Playwright), jsdom has no getBBox. Keep
   * `fitOnImport` at its default: the L5 cases check the modeler's own fit.
   * The keys case and the delete of the user-action case find the canvas
   * in the host `attachedHost()` made during this call (or take the one
   * `canvasElement` names): mount into one, or those cases report a skip
   */
  create(): Promise<CollaborativeModeler>;
  /** a fresh READ-ONLY instance (`meta.editable === false`) — the viewer
   *  mount hosts use on read-only surfaces; absent = the package ships no
   *  viewer and the viewer case is reported as skipped. The keys case aims
   *  its keys at the viewer too: mount it as `create()` does */
  createReadonly?(): Promise<CollaborativeModeler>;
  /**
   * the focusable element `modeler` (from `create()` or `createReadonly()`)
   * placed in its host to take its keys: the keys case aims the keys that
   * must act at it, and the host's controls it puts next to it and into the
   * `attachedHost()` it lies in; the user-action case presses Delete on it
   * to delete a selected element. `undefined` = the focusable `<svg>` (one
   * with a `tabindex`, diagram-js's canvas) in the one `attachedHost()` the
   * call mounted into. A modeler that takes its keys on another element (a
   * `<div>`, a `<canvas>`) names it here; `null` or `undefined` returned, or
   * an element outside every `attachedHost()`, is reported as a skip
   */
  canvasElement?(modeler: CollaborativeModeler): Element | null | undefined;
  /**
   * CANONICAL sample documents of the notation (>= 2, distinct, at least one
   * rendering an element, ideally several covering config/axis content too)
   * — exactly what exportText emits. Obtain them by exporting a hand-authored
   * document and REVIEWING the bytes, not by pasting whatever the current
   * build prints: L2 only proves the serializer is a fixpoint of the texts
   * you vouch for
   */
  canonicalTexts: string[];
  /** importable but non-canonical inputs (hand-authored variants); the kit
   *  verifies canonicalization is IDEMPOTENT on them, not byte-stable.
   *  `undefined` = skipped; `[]` = the notation has no loose form */
  looseTexts?: string[];
  /**
   * NON-importable inputs (half-typed peer text, wrong notation) — the kit
   * verifies importText REJECTS, leaves no trace and stays usable (L7).
   * `undefined` = not provided (the L7 cases report a SKIP); `[]` = the
   * deliberate statement that this notation has no LISTED non-importable
   * text (the lenient line DSLs keep every line, so nothing rejects). The
   * probes below run either way, so a parser that does reject some input
   * is held to L7 on it
   */
  invalidTexts?: string[];
  /**
   * extra inputs for the L7 probe case, on top of the probes the kit derives
   * from every canonical text: its first half, its first third, the text
   * without its last character and the text followed by a NUL character.
   * Unlike `invalidTexts`, a probe need not reject: one that imports must
   * be silent (L1) with `exportText` total (L6), one that rejects must leave
   * no trace (L7). Add the damaged forms your parser is likely to meet (a
   * cut-off JSON object, an unclosed block). `undefined` and `[]` both mean
   * "the derived probes only" — the probe case never skips
   */
  probeTexts?: string[];
  /**
   * importable documents carrying content the modeler does NOT understand
   * (vendor extensions, unknown lines, unknown JSON keys), each with the
   * fragments that must come back from an import → export round-trip (L6).
   * `undefined` = skipped; `[]` = the notation has no foreign form
   */
  foreignTexts?: Array<{ text: string; mustSurvive: string[] }>;
  /**
   * a NON-default view state the modeler accepts — a panned/zoomed viewport
   * (e.g. a viewbox) that differs from what an import leaves; L5 cannot tell
   * a restore from a no-op without one. The kit never compares a readback
   * with this literal: it sets it, reads the modeler's own (possibly
   * normalised) state back, and requires THAT to survive a re-import and to
   * be settable itself. `undefined` = L5 is reported as skipped
   */
  viewState?: unknown;
  /** wait until deferred/debounced change events have been delivered —
   *  MUST outlast the modeler's event debounce; defaults to one macrotask */
  settle?(): Promise<void>;
  /**
   * perform ONE user-visible atomic ELEMENT command through the modeler's
   * own commands: ADD an element — never rename or delete one (the elements
   * cases treat it as an edit unrelated to the existing elements and compare
   * the ids two instances allocate for it, and L4 builds undo history from
   * it, so it must be undoable). Let each call's element differ in content
   * from the previous one (a counter the harness shares across instances,
   * as the reference harness does): the collision case compares the ids two
   * fresh instances allocate for one new element each, and an id derived
   * from identical content (one that spells out the element's name)
   * collides by design. The kit also runs it once on a
   * fresh instance BEFORE the first import; a throw there is tolerated, and
   * so is a call that never settles (a mutate waiting for the change event
   * of a command the modeler ignores without a document): the kit stops
   * waiting after 2 s — what a command does without a document is the
   * modeler's choice
   */
  mutate(modeler: CollaborativeModeler): Promise<void> | void;
  /**
   * user-visible changes that do NOT run through an element command:
   * config/axis/title/style/size edits that live in the document. A notation
   * with such surfaces MUST list them — the kit cannot see what the canvas
   * offers, and a modeler that only forwards its command stack passes
   * `mutate` while a host loses exactly these edits. `undefined` = skipped;
   * `[]` = the notation has no such surface
   */
  configMutations?: UserMutation[];
  /** trigger the modeler's undo; `undefined` = the notation has no undo
   *  (the undo cases, and the undo and the redo of the user-action case, are
   *  reported as skipped) */
  undo?(modeler: CollaborativeModeler): Promise<void> | void;
  /** trigger the modeler's redo; `undefined` with `undo` defined = the redo
   *  half of the undo/redo case and the redo of the user-action case are
   *  reported as skipped */
  redo?(modeler: CollaborativeModeler): Promise<void> | void;
  /**
   * move ONE element read from `canonicalTexts[0]` (imported, then one
   * `mutate` added an element) through the modeler's own commands, the way
   * a user drags it, far enough that its box changes position after any
   * snapping, rounding or clamping — and return that element's id
   * (ElementInfo.id). The bounds case requires `elements.bounds` to report
   * the moved box. `undefined` = that half of the bounds case is reported as
   * skipped (only when the modeler has `bounds`)
   */
  moveElement?(modeler: CollaborativeModeler): Promise<string> | string;
  /**
   * open an INTERACTION on an element of `canonicalTexts[0]` (already
   * imported) the way a user does — its label editor, or a popup with an
   * input — and type input WITHOUT committing it (no Enter, no blur). The
   * kit then imports over it (L1) and changes the view over it (L5), and
   * neither may commit it. Type the same input on every call, one the
   * serializer writes verbatim: the L5 case looks for it in the export and
   * compares what a commit writes with and without a view change in
   * between. `undefined` = the L1 and L5 interaction cases are reported as
   * skipped
   */
  openInteraction?(modeler: CollaborativeModeler): Promise<void> | void;
  /**
   * the interaction open right now — the element it edits and its
   * uncommitted input — or `undefined` when none is open. The kit reads it
   * before and after a re-import of the same text to check the RECOMMENDED
   * keep-and-reopen (an advisory, never a failure). `undefined` = that half
   * of the L1 interaction case is reported as skipped
   */
  interactionState?(modeler: CollaborativeModeler): InteractionState | undefined;
  /**
   * commit the interaction `openInteraction` opened, the way a user does
   * (Enter, or a click on the canvas). The L5 interaction case commits once
   * without a view change, proving the typed input changes the document,
   * and once after a host's view change, checking the RECOMMENDED keep-open
   * (an advisory, never a failure). `undefined` = both halves are reported
   * as skipped
   */
  commitInteraction?(modeler: CollaborativeModeler): Promise<void> | void;
  /**
   * hold a GESTURE on `canonicalTexts[0]` (imported, nothing else running) the way a user does,
   * and resolve while it runs: `"move"` presses an element and moves it past the drag threshold,
   * `"create"` takes a palette entry that creates an element and holds its preview over free
   * canvas, `"createOffCanvas"` holds the same preview over the palette. The kit then drops or
   * cancels it, also after an import (`HeldGesture`). Drive the modeler's own pointer handling
   * (real DOM events), not its commands: the cases check what an import does to a drag the
   * modeler runs. The drop case holds a `"move"`, and the drag-start case a `"move"` and a
   * `"create"`, with the first listed element revealed (selected): the start then clears that
   * selection. `undefined` = the L1 gesture case, the drop case, the drag-start case and the
   * interaction case are reported as skipped
   */
  startGesture?(
    modeler: CollaborativeModeler,
    kind: GestureKind,
  ): Promise<HeldGesture> | HeldGesture;
  /**
   * arm a palette tool that waits for its next press (the lasso, the hand tool) the way a user
   * does, without pressing on the canvas. The interaction case requires `interaction.active()` to
   * stay false. `undefined` = that half of the interaction case is reported as skipped
   */
  armTool?(modeler: CollaborativeModeler): Promise<void> | void;
  /**
   * hold a PAN on `canonicalTexts[0]` (imported, the view as the import fitted it, nothing else
   * running) the way a user does (a press on empty canvas, or the hand tool), moved past the drag
   * threshold by one STEP: a fixed distance in screen pixels. `HeldPan.move()` moves the pointer
   * by the same step again, in the same direction, so the kit can tell a pan that goes on from the
   * view an import left from one that puts the view from before the import back. `undefined` = the
   * pan case is reported as skipped
   */
  startPan?(modeler: CollaborativeModeler): Promise<HeldPan> | HeldPan;
  /**
   * the modeler's image export as a host saves it (its SVG): the appearance case requires it to
   * stay byte-identical under every `appearance.set`, since exports are always light. `undefined`
   * = that half of the appearance case is reported as skipped
   */
  exportImage?(modeler: CollaborativeModeler): Promise<string> | string;
}

/** the gestures `ConformanceHarness.startGesture` holds */
export type GestureKind = "move" | "create" | "createOffCanvas";

/** a gesture `ConformanceHarness.startGesture` holds, until the kit ends it */
export interface HeldGesture {
  /**
   * release it where it applies, the way the user does: the moved element lands on a new
   * position, the preview of a create on free canvas (an off-canvas preview is brought there
   * first, then placed). A drop of a gesture the modeler still runs changes the document: the
   * cases rely on that to see whether an import left the gesture running
   */
  drop(): Promise<void> | void;
  /** cancel it the way the user does (Escape) */
  cancel(): Promise<void> | void;
}

/** a pan `ConformanceHarness.startPan` holds, until the kit releases it */
export interface HeldPan {
  /** move the pointer by one more step, as far and in the direction `startPan` moved it */
  move(): Promise<void> | void;
  /** release the pointer */
  drop(): Promise<void> | void;
}

/** an interaction in progress, as `ConformanceHarness.interactionState` reports it */
export interface InteractionState {
  /** the stable id of the element the interaction edits (ElementInfo.id) */
  elementId: string;
  /** the uncommitted input, when the interaction has one */
  text?: string;
}

export interface CaseOutcome {
  /** the case could not (fully) verify its law — the harness left the field
   *  it needs undefined, or the modeler has no such optional surface; the
   *  reason names which */
  skipped?: string;
  /**
   * RECOMMENDED behaviour the modeler does not show. The case passed — the
   * contract only recommends what is missing (a candidate for a law in the
   * next major) — and registerConformance reports each advice through
   * `onAdvisory`, never as a failure
   */
  advisories?: string[];
}

export interface ConformanceCase {
  name: string;
  run(harness: ConformanceHarness): Promise<CaseOutcome | void>;
}

interface AttachedHost {
  /** counts every host attachedHost() made, so a case can tell the ones made during one `create()` */
  serial: number;
  host: HTMLElement;
  wrapper: HTMLElement;
}

let nextHostSerial = 0;
/** the hosts attachedHost() made that are still in the document: the keys case finds the canvas of
 *  the modeler `create()` mounted there, and hides or disables the host the way a host page does */
let attachedHosts: AttachedHost[] = [];

/**
 * a host element of the given size, attached to the document — what
 * `create()` should mount into (browser only). The returned element sits
 * INSIDE a sized wrapper: the Miragon renderers restyle the container they
 * are given to 100% × 100%, which then resolves against the wrapper
 */
export function attachedHost(width = 800, height = 600): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `width:${width}px;height:${height}px;position:absolute;left:0;top:0;overflow:hidden`;
  const host = document.createElement("div");
  host.style.cssText = "width:100%;height:100%";
  wrapper.append(host);
  document.body.append(wrapper);
  attachedHosts = attachedHosts.filter((entry) => entry.wrapper.isConnected);
  attachedHosts.push({ serial: nextHostSerial++, host, wrapper });
  return host;
}

function fail(message: string): never {
  throw new Error(`modeler-api conformance: ${message}`);
}

const skip = (reason: string): CaseOutcome => ({ skipped: reason });

function exportOrFail(modeler: CollaborativeModeler, when: string): string {
  try {
    return modeler.exportText();
  } catch (e) {
    fail(`exportText threw ${when}: ${String(e)}`);
  }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

type BoundedElements = ElementsSurface & { bounds(id: string): ElementBounds | undefined };

const hasBounds = (elements: ElementsSurface): elements is BoundedElements =>
  typeof elements.bounds === "function";

const isFiniteBox = (box: ElementBounds | undefined): box is ElementBounds =>
  box !== undefined &&
  [box.x, box.y, box.width, box.height].every((n) => typeof n === "number" && Number.isFinite(n)) &&
  box.width >= 0 &&
  box.height >= 0;

const describeBox = (box: ElementBounds | undefined): string =>
  box === undefined
    ? "undefined"
    : `{ x: ${box.x}, y: ${box.y}, width: ${box.width}, height: ${box.height} }`;

type ContentBounded = CollaborativeModeler & { contentBounds(): ElementBounds | undefined };

const hasContentBounds = (m: CollaborativeModeler): m is ContentBounded =>
  typeof m.contentBounds === "function";

/**
 * how far a content edge may fall short of an element's edge: a box measured on the live SVG
 * (`getBBox`) comes back in float32, which rounds 123.4 to 123.4000015…, and that rounding grows
 * with the coordinate. A thousandth of a unit, or 2^-20 of the edge where that is more, stays far
 * below a pixel and far below what a stale or unsized box misses by
 */
const edgeTolerance = (edge: number): number => Math.max(1e-3, Math.abs(edge) * 2 ** -20);

const covers = (outer: ElementBounds, inner: ElementBounds): boolean => {
  const right = outer.x + outer.width;
  const bottom = outer.y + outer.height;
  return (
    inner.x >= outer.x - edgeTolerance(outer.x) &&
    inner.y >= outer.y - edgeTolerance(outer.y) &&
    inner.x + inner.width <= right + edgeTolerance(right) &&
    inner.y + inner.height <= bottom + edgeTolerance(bottom)
  );
};

/** `contentBounds()` copied, or `undefined` — a throw, a non-finite box or a negative size fails */
function contentBoxOf(m: ContentBounded, when: string): ElementBounds | undefined {
  let box: ElementBounds | undefined;
  try {
    box = m.contentBounds();
  } catch (e) {
    fail(`contentBounds() threw ${when}: ${String(e)}`);
  }
  if (box === undefined) return undefined;
  if (!isFiniteBox(box)) {
    fail(
      `contentBounds() ${when} is ${describeBox(box)} — the content box must be finite with a non-negative size, or undefined when there is nothing to fit`,
    );
  }
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

/**
 * the content box around everything the elements surface lists: defined as
 * soon as one element is listed, and around each element's own box. An
 * element box that is itself broken is the bounds case's failure, not this one's
 */
function expectContentAroundElements(m: ContentBounded, when: string): ElementBounds | undefined {
  const box = contentBoxOf(m, when);
  const listed = m.elements?.list() ?? [];
  if (box === undefined) {
    if (listed.length > 0) {
      fail(
        `contentBounds() ${when} is undefined while elements.list() reports ${listed.length} element(s) — undefined means there is nothing to fit`,
      );
    }
    return undefined;
  }
  if (m.elements && hasBounds(m.elements)) {
    for (const { id } of listed) {
      const element = m.elements.bounds(id);
      if (!isFiniteBox(element)) continue;
      if (!covers(box, element)) {
        fail(
          `contentBounds() ${when} is ${describeBox(box)}, which does not cover elements.bounds('${id}') = ${describeBox(element)} — the content box holds every element (and reads the live canvas)`,
        );
      }
    }
  }
  return box;
}

/** every listed element's box, copied — a listed id without a finite box fails */
function boxesOf(elements: BoundedElements, when: string): Map<string, ElementBounds> {
  const boxes = new Map<string, ElementBounds>();
  for (const { id } of elements.list()) {
    const box = elements.bounds(id);
    if (!isFiniteBox(box)) {
      fail(
        `elements.bounds('${id}') ${when} is ${describeBox(box)} — every listed id must give a finite box with a non-negative size`,
      );
    }
    boxes.set(id, { x: box.x, y: box.y, width: box.width, height: box.height });
  }
  return boxes;
}

/** a view state with NaN/Infinity is what a detached or 0×0 host produces */
function assertFinite(state: unknown, when: string): void {
  const json = JSON.stringify(state, (_k, v: unknown) =>
    typeof v === "number" && !Number.isFinite(v) ? "__non_finite__" : v,
  );
  if (json?.includes("__non_finite__")) {
    fail(
      `getViewState() ${when} contains a non-finite number — the host has no size (mount into attachedHost())`,
    );
  }
}

const defaultSettle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** how long the pre-import case waits for `mutate` on an instance without a document */
const PRE_IMPORT_CALL_BOUND_MS = 2000;

/** run a harness call whose throw and whose hang are both tolerated: it gets
 *  `ms` to settle, then the kit moves on (the call may keep running) */
async function toleratedCall(action: () => Promise<void> | void, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const call = Promise.resolve()
    .then(action)
    .catch(() => undefined);
  const bound = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([call, bound]);
  } finally {
    clearTimeout(timer);
  }
}

/** count invocations of onContentChanged around an action — settle-aware, so
 *  debounced engines neither hide an echo nor fail a legitimate event; the
 *  export seen INSIDE the last delivery is returned too (L3's ordering rule) */
async function changeEvents(
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

/** an id or a name reduced to its letters and digits, lower case — `component_new_component` and
 *  `New Component` share `newcomponent` */
const lettersAndDigits = (value: string): string =>
  value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const secondText = (h: ConformanceHarness): string =>
  h.canonicalTexts[1] ?? h.canonicalTexts[0] ?? "";

/** the harness's user mutations: the element command first, then every config edit */
const mutationsOf = (h: ConformanceHarness): UserMutation[] => [
  { name: "mutate (element command)", run: (m) => h.mutate(m) },
  ...(h.configMutations ?? []),
];

const sortedIds = (m: CollaborativeModeler): string[] | undefined =>
  m.elements ? [...m.elements.list().map((e) => e.id)].sort() : undefined;

/** element id → name; `undefined` without an elements surface */
const namesById = (m: CollaborativeModeler): Map<string, string | undefined> | undefined =>
  m.elements ? new Map(m.elements.list().map((e) => [e.id, e.name])) : undefined;

async function importOrFail(m: CollaborativeModeler, text: string, failure: string): Promise<void> {
  await m.importText(text).catch((e: unknown) => fail(`${failure}: ${String(e)}`));
}

interface Probe {
  /** where the probe comes from, for the failure message */
  label: string;
  text: string;
}

const describeProbe = (probe: Probe): string => {
  const excerpt = probe.text.length > 40 ? `${probe.text.slice(0, 40)}…` : probe.text;
  return `${probe.label} (${JSON.stringify(excerpt)})`;
};

/**
 * damaged forms of every canonical text — what a host re-imports while a
 * peer is still typing (cut mid-way, the last character missing) or after a
 * transport glitch (a trailing NUL) — plus the harness's own probeTexts.
 * Cuts fall on code points, never inside a surrogate pair; duplicates are
 * dropped so each input runs once
 */
function probesOf(h: ConformanceHarness): Probe[] {
  const probes: Probe[] = [];
  h.canonicalTexts.forEach((text, index) => {
    const source = `canonicalTexts[${index}]`;
    const codePoints = Array.from(text);
    const cut = (length: number): string => codePoints.slice(0, length).join("");
    probes.push(
      { label: `the first half of ${source}`, text: cut(Math.floor(codePoints.length / 2)) },
      { label: `the first third of ${source}`, text: cut(Math.floor(codePoints.length / 3)) },
      { label: `${source} without its last character`, text: cut(codePoints.length - 1) },
      { label: `${source} followed by a NUL character`, text: `${text}\u0000` },
    );
  });
  (h.probeTexts ?? []).forEach((text, index) =>
    probes.push({ label: `probeTexts[${index}]`, text }),
  );
  const seen = new Set<string>();
  return probes.filter((probe) => {
    if (seen.has(probe.text)) return false;
    seen.add(probe.text);
    return true;
  });
}

/**
 * import the first canonical text that renders at least one element (an
 * empty document has no fitted view — renderers leave the viewport alone),
 * and return it; without an elements surface the first text is used
 */
async function importContentText(h: ConformanceHarness, m: CollaborativeModeler): Promise<string> {
  for (const text of h.canonicalTexts) {
    await m.importText(text);
    if (!m.elements || m.elements.list().length > 0) return text;
  }
  fail(
    "L5 needs a canonical text that renders at least one element — an empty document has no fitted view",
  );
}

export function conformanceCases(): ConformanceCase[] {
  return [
    {
      name: "meta declares the notation, editability and a compatible apiVersion",
      async run(h) {
        const m = await h.create();
        try {
          if (!m.meta.notation) fail("meta.notation is empty");
          if (m.meta.editable !== true)
            fail("create() must return an EDITABLE modeler (meta.editable === true)");
          if (!apiVersionsCompatible(m.meta.apiVersion, MODELER_API_VERSION)) {
            fail(`apiVersion ${m.meta.apiVersion} is not compatible with ${MODELER_API_VERSION}`);
          }
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "calls before the first import never wedge the instance",
      async run(h) {
        const m = await h.create();
        let control: CollaborativeModeler | undefined;
        try {
          // what these return without a document is the modeler's choice —
          // only the instance has to survive them
          try {
            m.exportText();
          } catch {
            // a throw before the first import is allowed
          }
          await toleratedCall(() => h.mutate(m), PRE_IMPORT_CALL_BOUND_MS);
          await (h.settle ?? defaultSettle)();
          control = await h.create();
          const texts = h.canonicalTexts.length > 0 ? h.canonicalTexts.slice(0, 2) : [""];
          let last = "";
          for (const [index, text] of texts.entries()) {
            const source = `canonicalTexts[${index}]`;
            // the oracle is a fresh instance's export of the same text: this
            // case isolates the pre-import calls — a non-canonical serializer
            // fails L2, not here
            await control.importText(text);
            const expected = exportOrFail(
              control,
              `after importing ${source} into a fresh instance`,
            );
            await importOrFail(
              m,
              text,
              `importText(${source}) rejected on an instance that ran exportText() and a user command before its first import (wedged)`,
            );
            last = exportOrFail(
              m,
              `after importing ${source} into an instance used before its first import`,
            );
            if (last !== expected) {
              fail(
                `importText(${source}) on an instance that ran exportText() and a user command before its first import did not render that document:\n--- expected (a fresh instance's export)\n${expected}\n--- got\n${last}`,
              );
            }
          }
          const { calls } = await changeEvents(h, m, () => h.mutate(m));
          if (calls === 0) {
            fail(
              "a user mutation fired no onContentChanged on an instance used before its first import (wedged)",
            );
          }
          if (
            exportOrFail(m, "after a user mutation on an instance used before its first import") ===
            last
          ) {
            fail(
              "a user mutation did not apply on an instance used before its first import (wedged)",
            );
          }
        } finally {
          m.destroy();
          control?.destroy();
        }
      },
    },
    {
      name: "L1: importText is silent (no change events, for canonical, loose and foreign inputs)",
      async run(h) {
        const m = await h.create();
        try {
          const texts = [
            ...h.canonicalTexts,
            ...(h.looseTexts ?? []),
            ...(h.foreignTexts ?? []).map((f) => f.text),
          ];
          for (const text of texts) {
            const { calls } = await changeEvents(h, m, () =>
              m.importText(text).then(() => undefined),
            );
            if (calls > 0) fail(`importText fired onContentChanged ${calls}x`);
          }
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "L1: importText over EXISTING undo history is silent too",
      async run(h) {
        // diagram-js' commandStack.clear() emits 'changed' whether or not the
        // stack is empty — but an engine that only emits when it has something
        // to clear would pass the fresh-instance case above
        const m = await h.create();
        try {
          await m.importText(h.canonicalTexts[0] ?? "");
          await h.mutate(m);
          await (h.settle ?? defaultSettle)();
          const { calls } = await changeEvents(h, m, () =>
            m.importText(secondText(h)).then(() => undefined),
          );
          if (calls > 0)
            fail(`importText over a non-empty undo history fired onContentChanged ${calls}x`);
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "L1: an interaction open during importText never commits",
      async run(h) {
        if (!h.openInteraction) {
          return skip(
            "openInteraction is undefined — an interaction open during an import (a label editor with typed input) was not verified",
          );
        }
        const openInteraction = h.openInteraction;
        const first = h.canonicalTexts[0] ?? "";
        const second = h.canonicalTexts[1];
        const m = await h.create();
        try {
          // the oracles come from the modeler's OWN serializer: this case
          // isolates the interaction — a non-canonical serializer fails L2
          const legs: Array<{ text: string; expected: string; what: string }> = [];
          // a DIFFERENT document usually removes the edited element (a commit
          // would land on a removed element); the SAME document keeps it (a
          // commit would write the typed input into the re-imported document)
          if (second !== undefined) {
            await m.importText(second);
            const expected = exportOrFail(m, "after importing canonicalTexts[1]");
            legs.push({ text: second, expected, what: "a different document (canonicalTexts[1])" });
          }
          await m.importText(first);
          const firstExport = exportOrFail(m, "after importing canonicalTexts[0]");
          legs.push({
            text: first,
            expected: firstExport,
            what: "the same document again (canonicalTexts[0])",
          });
          let advice: string | undefined;
          for (const [index, leg] of legs.entries()) {
            await m.importText(first);
            await openInteraction(m);
            await (h.settle ?? defaultSettle)();
            const opened = h.interactionState?.(m);
            if (h.interactionState && opened === undefined) {
              fail(
                "interactionState reports no interaction after openInteraction — the case proves nothing",
              );
            }
            const { calls } = await changeEvents(h, m, () =>
              m.importText(leg.text).then(() => undefined),
            );
            if (calls > 0) {
              fail(
                `importing ${leg.what} over an open interaction fired onContentChanged ${calls}x — the interaction committed during or because of the import (if every import emits, see the L1 cases first)`,
              );
            }
            const reopened = h.interactionState?.(m);
            if (
              exportOrFail(m, `after importing ${leg.what} over an open interaction`) !==
              leg.expected
            ) {
              fail(
                `importing ${leg.what} over an open interaction did not leave that document — the interaction's input was applied to it`,
              );
            }
            if (h.undo) {
              await h.undo(m);
              await (h.settle ?? defaultSettle)();
              if (
                exportOrFail(m, `after an undo that followed importing ${leg.what}`) !==
                leg.expected
              ) {
                fail(
                  `undo after importing ${leg.what} over an open interaction changed the document — the interaction was committed onto the fresh undo history (L4)`,
                );
              }
            }
            const sameDocument = index === legs.length - 1;
            const kept =
              reopened?.elementId === opened?.elementId && reopened?.text === opened?.text;
            if (sameDocument && opened !== undefined && !kept) {
              const input =
                opened.text === undefined ? "" : ` with the input ${JSON.stringify(opened.text)}`;
              const after =
                reopened === undefined ? "closed it" : `left ${JSON.stringify(reopened)} open`;
              advice = `an interaction on '${opened.elementId}'${input} did not survive a re-import of the same document (the import ${after}) — RECOMMENDED: keep the typed input and reopen the interaction on the element with the same id, so a remote re-import does not cost the user what they were typing`;
            }
          }
          const unverified = [
            ...(second === undefined
              ? [
                  "canonicalTexts holds one text — importing a DIFFERENT document over an open interaction was not verified (add a second canonical text)",
                ]
              : []),
            ...(h.interactionState
              ? []
              : [
                  "interactionState is undefined — the RECOMMENDED keep-and-reopen of an interaction across an import was not checked (pass interactionState to check it)",
                ]),
          ];
          return {
            ...(unverified.length > 0 ? { skipped: unverified.join("; ") } : {}),
            ...(advice === undefined ? {} : { advisories: [advice] }),
          };
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "L1 (recommended, 1.5): an accepted import cancels a running gesture, its release included, and a rejected one leaves it running",
      run: importCancelsGestures,
    },
    {
      name: "drop (recommended, 1.6): an import from the change listener of a drop waits until the drop has ended, and its Promise settles after the import",
      run: importWaitsForTheDrop,
    },
    {
      name: "user action (recommended, 1.6): an import from the selection listener of a delete, an undo or a redo waits until the command has finished, and imports keep their call order",
      run: importWaitsForTheUsersCommand,
    },
    {
      name: "drag start (recommended, 1.6): an import from the selection listener at the start of a move or a palette create runs once the drag has started, and then ends it",
      run: importAtADragsStart,
    },
    {
      name: "pan (recommended, 1.6): a pan is no gesture, and it runs on through an import from the view the import left",
      run: panRunsOnThroughAnImport,
    },
    {
      name: "interaction (when present, 1.5): active() follows every gesture to its drop and its cancel, never an armed tool, and onChange reports each change once",
      run: interactionFollowsGestures,
    },
    {
      name: "L2: canonical texts are byte fixpoints of import → export",
      async run(h) {
        if (h.canonicalTexts.length === 0) fail("harness provides no canonicalTexts");
        const m = await h.create();
        try {
          for (const text of h.canonicalTexts) {
            await m.importText(text);
            const out = m.exportText();
            if (out !== text)
              fail(
                `export after import differs from the canonical input:\n--- in\n${text}\n--- out\n${out}`,
              );
            if (m.exportText() !== out)
              fail("exportText is not deterministic — two exports of one document differ");
          }
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "L2: canonicalization of loose input is idempotent",
      async run(h) {
        if (h.looseTexts === undefined)
          return skip("looseTexts is undefined — pass [] if the notation has no loose form");
        if (h.looseTexts.length === 0) return;
        const m = await h.create();
        try {
          for (const text of h.looseTexts) {
            await m.importText(text);
            const canonical = m.exportText();
            await m.importText(canonical);
            const again = m.exportText();
            if (again !== canonical) fail("canonicalization is not idempotent on loose input");
          }
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "L3: a scripted user mutation fires onContentChanged, and the export already reflects it inside the listener",
      async run(h) {
        const m = await h.create();
        try {
          await m.importText(h.canonicalTexts[0] ?? "");
          const before = m.exportText();
          const { calls, exportAtEmit } = await changeEvents(h, m, () => h.mutate(m));
          if (calls === 0) fail("a user mutation fired no onContentChanged");
          const after = m.exportText();
          if (after === before)
            fail("the harness mutation did not change the export — the case proves nothing");
          if (exportAtEmit !== after) {
            fail(
              "exportText() inside the onContentChanged listener did not return the post-change document (emit before apply)",
            );
          }
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "L3: config/axis edits fire onContentChanged too, with the export already updated",
      async run(h) {
        if (h.configMutations === undefined) {
          return skip(
            "configMutations is undefined — pass [] if the notation has no config/axis/title surface",
          );
        }
        for (const mutation of h.configMutations) {
          const m = await h.create();
          try {
            await m.importText(h.canonicalTexts[0] ?? "");
            const before = m.exportText();
            const { calls, exportAtEmit } = await changeEvents(h, m, () => mutation.run(m));
            if (calls === 0) fail(`config mutation "${mutation.name}" fired no onContentChanged`);
            const after = m.exportText();
            if (after === before) {
              fail(
                `config mutation "${mutation.name}" did not change the export — the case proves nothing`,
              );
            }
            if (exportAtEmit !== after) {
              fail(
                `exportText() inside the listener of config mutation "${mutation.name}" did not return the post-change document`,
              );
            }
          } finally {
            m.destroy();
          }
        }
      },
    },
    {
      name: "L3: unsubscribe stops delivery",
      async run(h) {
        const m = await h.create();
        try {
          await m.importText(h.canonicalTexts[0] ?? "");
          let calls = 0;
          const off = m.onContentChanged(() => {
            calls += 1;
          });
          off();
          await h.mutate(m);
          await (h.settle ?? defaultSettle)();
          if (calls > 0) fail("onContentChanged delivered after unsubscribe");
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "L3: undo and redo fire onContentChanged and restore the export",
      async run(h) {
        if (!h.undo) return skip("undo is undefined — the notation declares no undo");
        const undo = h.undo;
        const m = await h.create();
        try {
          await m.importText(h.canonicalTexts[0] ?? "");
          const before = m.exportText();
          await h.mutate(m);
          await (h.settle ?? defaultSettle)();
          const mutated = m.exportText();
          const undone = await changeEvents(h, m, () => undo(m));
          if (undone.calls === 0)
            fail("undo fired no onContentChanged — the host would never export the undone state");
          if (m.exportText() !== before)
            fail("undo of a single mutation did not restore the pre-mutation export");
          if (undone.exportAtEmit !== before)
            fail("exportText() inside the undo listener did not return the undone document");
          if (!h.redo)
            return skip(
              "redo is undefined — the redo half of this case was not verified (pass redo to verify it)",
            );
          const redo = h.redo;
          const redone = await changeEvents(h, m, () => redo(m));
          if (redone.calls === 0) fail("redo fired no onContentChanged");
          if (m.exportText() !== mutated) fail("redo did not restore the mutated export");
          if (redone.exportAtEmit !== mutated)
            fail("exportText() inside the redo listener did not return the redone document");
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "L4: undo directly after an import is a no-op",
      async run(h) {
        if (!h.undo) return skip("undo is undefined — the notation declares no undo");
        const first = h.canonicalTexts[0];
        const second = h.canonicalTexts[1];
        if (first === undefined || second === undefined || first === second) {
          fail(
            "the L4 case needs TWO DISTINCT canonicalTexts — with one, stale undo is undetectable",
          );
        }
        const m = await h.create();
        try {
          await m.importText(first);
          await h.mutate(m); // real history exists…
          await h.mutate(m); // …more than one entry deep…
          // leg 1 — GUARANTEED id coincidence: re-import the mutated document
          // itself. A stale diagram-js stack whose revert removes the created
          // shape by id is a silent no-op on any other document and deletes a
          // re-imported element on this one — the tt drift as it really bites
          const mutated = m.exportText();
          await m.importText(mutated);
          const baselineSame = m.exportText();
          const idsSame = sortedIds(m);
          const { calls } = await changeEvents(h, m, () => h.undo!(m));
          if (calls > 0)
            fail(
              "undo directly after importText fired onContentChanged — history housekeeping is not a change",
            );
          if (m.exportText() !== baselineSame || (idsSame && !same(idsSame, sortedIds(m)))) {
            fail(
              "undo after importText removed a re-imported element by id coincidence (stale history applied)",
            );
          }
          // leg 2 — a DIFFERENT document replaces the doc; a snapshot-restoring
          // stale stack would resurrect the previous one
          await h.mutate(m);
          await m.importText(second);
          // baseline via the modeler's OWN serializer: this case isolates the
          // undo law — a non-canonical serializer must fail L2, not here
          const baseline = m.exportText();
          await h.undo(m);
          await h.undo(m); // drain a stale multi-entry history too
          if (m.exportText() !== baseline) {
            fail(
              "undo after importText mutated the freshly imported document (stale history applied)",
            );
          }
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "L5: getViewState never throws before the first import",
      async run(h) {
        const m = await h.create();
        try {
          let state: unknown;
          try {
            state = m.getViewState();
          } catch (e) {
            fail(`getViewState threw before the first import: ${String(e)}`);
          }
          if (state !== undefined) assertFinite(state, "before the first import");
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "L5: view state round-trips across a re-import, an import fits the view — and none of it is document content",
      async run(h) {
        if (h.viewState === undefined) {
          return skip(
            "viewState is undefined — supply a panned/zoomed state, a no-op setViewState is otherwise undetectable",
          );
        }
        const alt = h.viewState;
        const m = await h.create();
        try {
          const text = await importContentText(h, m);
          const doc = m.exportText();
          const fitted = m.getViewState();
          assertFinite(fitted, "after the first import");
          // the modeler's OWN readback is the oracle from here on — a
          // diagram-js viewbox comes back rounded and enriched (scale, inner,
          // outer), never byte-equal to the harness literal
          m.setViewState(alt);
          const applied = m.getViewState();
          assertFinite(applied, "after setViewState");
          if (same(applied, fitted)) {
            fail(
              "setViewState(viewState) had no effect — supply a state that differs from the fitted view",
            );
          }
          await m.importText(text);
          if (!same(m.getViewState(), fitted)) {
            fail(
              "an import must leave the view FITTED to the content (the same state the first import produced)",
            );
          }
          // the host restores with what IT read back before the re-import —
          // the readback must be settable and yield itself again
          const { calls } = await changeEvents(h, m, () => m.setViewState(applied));
          if (calls > 0)
            fail("setViewState fired onContentChanged — view state is not document content");
          if (m.exportText() !== doc)
            fail("setViewState changed the export — view state leaked into the document");
          if (!same(m.getViewState(), applied)) {
            fail(
              "view state did not survive re-import + restore (setting the modeler's own readback must yield that readback)",
            );
          }
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "L5: a host's view change never commits an open interaction",
      async run(h) {
        if (!h.openInteraction) {
          return skip(
            "openInteraction is undefined — a host's view change over an open interaction (a label editor with typed input) was not verified",
          );
        }
        if (h.viewState === undefined) {
          return skip(
            "viewState is undefined — a host's view change over an open interaction was not verified (supply a panned/zoomed state)",
          );
        }
        const openInteraction = h.openInteraction;
        const commitInteraction = h.commitInteraction;
        const viewState = h.viewState;
        const settle = h.settle ?? defaultSettle;
        const first = h.canonicalTexts[0] ?? "";
        const m = await h.create();
        try {
          await m.importText(first);
          const doc = exportOrFail(m, "after importing canonicalTexts[0]");
          const open = async (): Promise<InteractionState | undefined> => {
            await openInteraction(m);
            await settle();
            const opened = h.interactionState?.(m);
            if (h.interactionState && opened === undefined) {
              fail(
                "interactionState reports no interaction after openInteraction — the case proves nothing",
              );
            }
            return opened;
          };
          // the document a commit writes WITHOUT a view change: proof that the
          // typed input is real, and the oracle for the commit after one
          let committed: string | undefined;
          if (commitInteraction) {
            const typed = (await open())?.text;
            await commitInteraction(m);
            await settle();
            committed = exportOrFail(m, "after committing the interaction");
            if (committed === doc || (typed && !committed.includes(typed))) {
              fail(
                "committing the interaction openInteraction opened did not write its typed input into the export — the case proves nothing (commitInteraction must commit the way a user does, openInteraction type input the serializer writes verbatim)",
              );
            }
            await importOrFail(
              m,
              first,
              "re-importing canonicalTexts[0] after the commit rejected",
            );
          }
          const opened = await open();
          const view = m.getViewState();
          const { calls } = await changeEvents(h, m, () => m.setViewState(viewState));
          if (calls > 0) {
            fail(
              `setViewState over an open interaction fired onContentChanged ${calls}x — the host's view change committed it (L5; if every setViewState emits, see the L5 round-trip case first)`,
            );
          }
          if (exportOrFail(m, "after setViewState over an open interaction") !== doc) {
            fail(
              "setViewState over an open interaction changed the export — the host's view change committed it (L5)",
            );
          }
          if (same(m.getViewState(), view)) {
            fail(
              "setViewState(viewState) had no effect over an open interaction — the case proves nothing (supply a state that differs from the fitted view)",
            );
          }
          const after = h.interactionState?.(m);
          let advice: string | undefined;
          if (
            opened !== undefined &&
            (after?.elementId !== opened.elementId || after?.text !== opened.text)
          ) {
            const input =
              opened.text === undefined ? "" : ` with the input ${JSON.stringify(opened.text)}`;
            const what = after === undefined ? "closed it" : `left ${JSON.stringify(after)} open`;
            advice = `an interaction on '${opened.elementId}'${input} did not survive a host's view change (setViewState ${what}) — RECOMMENDED: keep it open with its typed input, so the user's commit afterwards writes what it would have written without the view change`;
          } else if (commitInteraction && committed !== undefined) {
            await commitInteraction(m);
            await settle();
            const out = exportOrFail(m, "after committing the interaction after a view change");
            if (out !== committed) {
              advice = `committing an interaction after a host's view change wrote another document than committing it without one — RECOMMENDED: keep it open with its typed input across a view change (if openInteraction types different input per call, this advice is the harness's):\n--- committed without a view change\n${committed}\n--- committed after setViewState\n${out}`;
            }
          }
          return {
            ...(commitInteraction
              ? {}
              : {
                  skipped:
                    "commitInteraction is undefined — that the typed input changes the document (without it the case may prove nothing) and that it still commits after the view change were not checked (pass commitInteraction to check both)",
                }),
            ...(advice === undefined ? {} : { advisories: [advice] }),
          };
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "elements (when present): stable ids across re-imports and unrelated edits, reveal and selection semantics",
      async run(h) {
        const m = await h.create();
        try {
          const text = h.canonicalTexts[0] ?? "";
          await m.importText(text);
          const elements = m.elements;
          if (!elements)
            return skip("the modeler exposes no elements surface (optional) — nothing to verify");
          const ids = elements.list().map((e) => e.id);
          if (new Set(ids).size !== ids.length) fail("element ids are not unique");
          await m.importText(text);
          const again = elements.list().map((e) => e.id);
          if (!same([...ids].sort(), [...again].sort()))
            fail("element ids are not stable across re-imports of the same text");
          if (elements.reveal("__modeler_api_no_such_id__") !== false)
            fail("reveal(unknown id) must return false");
          const firstId = ids[0];
          if (firstId !== undefined) {
            const deliveries: string[][] = [];
            const off = elements.onSelection((selected) => deliveries.push([...selected]));
            const { calls } = await changeEvents(h, m, () => {
              if (elements.reveal(firstId) !== true) fail("reveal(known id) must return true");
            });
            if (calls > 0)
              fail("reveal fired onContentChanged — revealing is view behavior, not an edit");
            if (!deliveries.some((d) => d.includes(firstId))) {
              fail(
                `reveal('${firstId}') delivered no selection containing the id — is it a selectable element (not a root or a label)?`,
              );
            }
            for (const d of deliveries) {
              for (const id of d) {
                if (!again.includes(id)) {
                  fail(
                    `onSelection reported an id that is not an element: '${id}' (label ids must resolve to their target)`,
                  );
                }
              }
            }
            if (!elements.selection().includes(firstId))
              fail("selection() does not contain the revealed id");
            const seen = deliveries.length;
            off();
            // a DIFFERENT selection after the unsubscribe — re-revealing the
            // same id would be deduplicated by many engines and prove nothing
            const otherId = ids[1];
            if (otherId !== undefined) elements.reveal(otherId);
            else await h.mutate(m);
            await (h.settle ?? defaultSettle)();
            if (deliveries.length !== seen) fail("onSelection delivered after unsubscribe");
          }
          // an edit to ANOTHER element must not renumber existing ids: every id
          // still exists AND (where the notation has names) still names the
          // same element — a positional scheme keeps the id strings while
          // shifting what they point at
          const namesBefore = new Map(elements.list().map((e) => [e.id, e.name]));
          await h.mutate(m);
          await (h.settle ?? defaultSettle)();
          const afterEdit = new Map(elements.list().map((e) => [e.id, e.name]));
          if (afterEdit.size <= namesBefore.size) {
            fail(
              "the harness mutate must ADD an element (the elements case verifies ids under an unrelated edit)",
            );
          }
          for (const [id, name] of namesBefore) {
            if (!afterEdit.has(id)) {
              fail(
                `element id '${id}' vanished after an unrelated edit — ids must survive edits to other elements`,
              );
            }
            if (name !== undefined && afterEdit.get(id) !== name) {
              fail(
                `element id '${id}' names a different element after an unrelated edit ('${name}' → '${String(afterEdit.get(id))}')`,
              );
            }
          }
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "elements (when present): ids and names survive export → import, in this and in a fresh instance",
      async run(h) {
        const m = await h.create();
        const others: CollaborativeModeler[] = [];
        try {
          await m.importText(h.canonicalTexts[0] ?? "");
          const elements = m.elements;
          if (!elements)
            return skip("the modeler exposes no elements surface (optional) — nothing to verify");
          // the element the session just created is the one an in-memory id
          // scheme gives away: its id was never read back from a text
          await h.mutate(m);
          await (h.settle ?? defaultSettle)();
          const session = new Map(elements.list().map((e) => [e.id, e.name]));
          const exported = exportOrFail(m, "after a user mutation");
          const expectSessionIds = (target: CollaborativeModeler, where: string): void => {
            const after = namesById(target);
            if (!after) fail(`${where} exposes no elements surface — the editor does`);
            for (const [id, name] of session) {
              if (!after.has(id)) {
                fail(
                  `element id '${id}' is gone after export → import ${where} — the id a session reports must be the element's id in the document (write it back)`,
                );
              }
              // an empty name and an absent one are the same across the
              // serializer: the contract fixes ids, not how a parser reports
              // an element without a label
              if (name !== undefined && (after.get(id) ?? "") !== name) {
                fail(
                  `element id '${id}' names a different element after export → import ${where} ('${name}' → '${String(after.get(id))}')`,
                );
              }
            }
          };
          await importOrFail(m, exported, "importText rejected the modeler's own export");
          expectSessionIds(m, "into the same instance");
          const fresh = await h.create();
          others.push(fresh);
          await importOrFail(fresh, exported, "a fresh instance rejected the modeler's own export");
          expectSessionIds(fresh, "into a fresh instance");
          if (h.createReadonly) {
            const viewer = await h.createReadonly();
            others.push(viewer);
            await importOrFail(viewer, exported, "the viewer rejected the editor's export");
            if (viewer.elements) expectSessionIds(viewer, "into the viewer");
          }
        } finally {
          m.destroy();
          for (const other of others) other.destroy();
        }
      },
    },
    {
      name: "elements (when present, recommended): ids created on two peers at the same time do not collide",
      async run(h) {
        const text = h.canonicalTexts[0] ?? "";
        const peers: CollaborativeModeler[] = [];
        try {
          // two peers start from the same document and each creates one
          // element — what happens when two users add an element at once
          const created: Array<Map<string, string | undefined>> = [];
          for (let count = 0; count < 2; count += 1) {
            const peer = await h.create();
            peers.push(peer);
            await peer.importText(text);
            if (!peer.elements)
              return skip("the modeler exposes no elements surface (optional) — nothing to verify");
            const before = new Set(peer.elements.list().map((e) => e.id));
            await h.mutate(peer);
            await (h.settle ?? defaultSettle)();
            const added = new Map(
              peer.elements
                .list()
                .filter((e) => !before.has(e.id))
                .map((e) => [e.id, e.name]),
            );
            if (added.size === 0) {
              fail(
                "the harness mutate must ADD an element (the elements cases compare the ids two instances allocate)",
              );
            }
            created.push(added);
          }
          const [
            onFirst = new Map<string, string | undefined>(),
            onSecond = new Map<string, string | undefined>(),
          ] = created;
          const shared = [...onFirst.keys()].filter((id) => onSecond.has(id));
          // an id derived from the content (OWM's component_<slug>) collides
          // when both peers create the same named element — by design, and the
          // merge reconciles identical content anyway; only an id allocated
          // regardless of the content is the recommendation's concern. An id
          // that spells out its element's name counts as derived from it
          const derivedFromContent = (id: string): boolean => {
            const name = onFirst.get(id) ?? "";
            if (name === "" || name !== (onSecond.get(id) ?? "")) return false;
            const spelled = lettersAndDigits(name);
            return spelled !== "" && lettersAndDigits(id).includes(spelled);
          };
          const allocated = shared.filter((id) => !derivedFromContent(id));
          const quoted = (ids: string[]): string => ids.map((id) => `'${id}'`).join(", ");
          if (allocated.length > 0) {
            return {
              advisories: [
                `two instances that imported the same document and each created one element, not of the same name, allocated the same id (${quoted(allocated)}) — RECOMMENDED: allocate ids for new elements that do not collide across peers (random or peer-scoped, not a per-instance counter); once both edits merge, two elements share one id`,
              ],
            };
          }
          if (shared.length > 0) {
            return skip(
              `both instances created an element of the same name and allocated the same id, one derived from that name (${quoted(shared)}) — such ids collide for identical content by design, so the check is inconclusive: let mutate's elements differ in content (a counter the harness shares across instances)`,
            );
          }
        } finally {
          for (const peer of peers) peer.destroy();
        }
      },
    },
    {
      name: "elements.bounds (when present): a finite box in diagram coordinates for every listed id, undefined for an unknown one, live after a new element and a move",
      async run(h) {
        const text = h.canonicalTexts[0] ?? "";
        const settle = h.settle ?? defaultSettle;
        const m = await h.create();
        let viewer: CollaborativeModeler | undefined;
        try {
          await m.importText(text);
          const elements = m.elements;
          if (!elements)
            return skip("the modeler exposes no elements surface (optional) — nothing to verify");
          if (!hasBounds(elements))
            return skip("the modeler exposes no elements.bounds (optional) — nothing to verify");
          boxesOf(elements, "after an import");
          if (elements.bounds("__modeler_api_no_such_id__") !== undefined)
            fail("elements.bounds(unknown id) must return undefined");
          // what a box cached at the last import gives away: an element the
          // session created has none, a moved one keeps its old position
          const imported = new Set(elements.list().map((e) => e.id));
          await h.mutate(m);
          await settle();
          for (const { id } of elements.list().filter((e) => !imported.has(e.id))) {
            const box = elements.bounds(id);
            if (!isFiniteBox(box)) {
              fail(
                `elements.bounds('${id}') of an element created in the session is ${describeBox(box)} — bounds must read the live canvas, not the last import`,
              );
            }
          }
          const unverified: string[] = [];
          if (h.moveElement) {
            const before = boxesOf(elements, "before a move");
            const movedId = await h.moveElement(m);
            await settle();
            const was = before.get(movedId);
            if (was === undefined)
              fail(
                `moveElement returned '${movedId}', an id elements.list() did not report before the move`,
              );
            const box = boxesOf(elements, "after a move").get(movedId);
            if (box === undefined)
              fail(`'${movedId}' is gone from elements.list() after moveElement moved it`);
            if (box.x === was.x && box.y === was.y) {
              fail(
                `elements.bounds('${movedId}') did not follow a move made through the modeler's own commands (still ${describeBox(was)}) — bounds must read the live canvas, not the last import (or moveElement did not move the element)`,
              );
            }
          } else {
            unverified.push(
              "moveElement is undefined — that a box follows a move was not verified",
            );
          }
          if (h.viewState !== undefined) {
            const atRest = boxesOf(elements, "before a view change");
            m.setViewState(h.viewState);
            for (const [id, box] of boxesOf(elements, "after setViewState")) {
              if (!same(box, atRest.get(id))) {
                fail(
                  `elements.bounds('${id}') changed with the view (${describeBox(atRest.get(id))} → ${describeBox(box)}) — boxes are in diagram coordinates, which zoom and scroll leave alone`,
                );
              }
            }
          } else {
            unverified.push(
              "viewState is undefined — that boxes are independent of the view was not verified",
            );
          }
          if (h.createReadonly) {
            viewer = await h.createReadonly();
            await importOrFail(viewer, text, "the viewer rejected canonicalTexts[0]");
            if (viewer.elements && hasBounds(viewer.elements)) {
              boxesOf(viewer.elements, "on the viewer after an import");
              if (viewer.elements.bounds("__modeler_api_no_such_id__") !== undefined)
                fail("the viewer's elements.bounds(unknown id) must return undefined");
            }
          }
          if (unverified.length > 0) return skip(unverified.join("; "));
        } finally {
          m.destroy();
          viewer?.destroy();
        }
      },
    },
    {
      name: "contentBounds (when present): a finite box in diagram coordinates around every listed element, live after a new element, unchanged by zoom and scroll",
      async run(h) {
        const settle = h.settle ?? defaultSettle;
        const m = await h.create();
        let viewer: CollaborativeModeler | undefined;
        try {
          if (!hasContentBounds(m))
            return skip("the modeler exposes no contentBounds (optional, 1.3) — nothing to verify");
          contentBoxOf(m, "before the first import");
          for (const [index, text] of h.canonicalTexts.entries()) {
            await importOrFail(m, text, `importText(canonicalTexts[${index}]) rejected`);
            expectContentAroundElements(m, `after importing canonicalTexts[${index}]`);
          }
          // a box cached at the last import gives itself away here: the
          // element the session created lies outside it, or it has none
          await importOrFail(
            m,
            h.canonicalTexts[0] ?? "",
            "importText(canonicalTexts[0]) rejected",
          );
          await h.mutate(m);
          await settle();
          const atRest = expectContentAroundElements(m, "after a user mutation added an element");
          const unverified: string[] = [];
          if (h.viewState !== undefined) {
            m.setViewState(h.viewState);
            const viewed = contentBoxOf(m, "after setViewState");
            if (!same(viewed, atRest)) {
              fail(
                `contentBounds() changed with the view (${describeBox(atRest)} → ${describeBox(viewed)}) — the content box is in diagram coordinates, which zoom and scroll leave alone`,
              );
            }
          } else {
            unverified.push(
              "viewState is undefined — that the content box is independent of the view was not verified",
            );
          }
          if (!m.elements || !hasBounds(m.elements)) {
            unverified.push(
              "the modeler exposes no elements.bounds — that the content box covers every element was not verified",
            );
          }
          if (h.createReadonly) {
            viewer = await h.createReadonly();
            if (hasContentBounds(viewer)) {
              contentBoxOf(viewer, "on the viewer before the first import");
              await importOrFail(
                viewer,
                h.canonicalTexts[0] ?? "",
                "the viewer rejected canonicalTexts[0]",
              );
              expectContentAroundElements(viewer, "on the viewer after an import");
            }
          }
          if (unverified.length > 0) return skip(unverified.join("; "));
        } finally {
          m.destroy();
          viewer?.destroy();
        }
      },
    },
    {
      name: "L6: export is total after imports, user mutations and undo",
      async run(h) {
        const m = await h.create();
        try {
          await m.importText(h.canonicalTexts[0] ?? "");
          for (const mutation of mutationsOf(h)) {
            await mutation.run(m);
            exportOrFail(m, `after ${mutation.name}`);
          }
          if (h.undo) {
            await h.undo(m);
            exportOrFail(m, "after an undo");
          }
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "L6: foreign content survives an import → export round-trip",
      async run(h) {
        if (h.foreignTexts === undefined) {
          return skip("foreignTexts is undefined — pass [] if the notation has no foreign form");
        }
        if (h.foreignTexts.length === 0) return;
        const m = await h.create();
        try {
          await foreignRoundTrips(h, m, "");
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "L7: a rejected import leaves no trace",
      async run(h) {
        if (h.invalidTexts === undefined) {
          return skip(
            "invalidTexts is undefined — pass [] if the notation has no non-importable text",
          );
        }
        if (h.invalidTexts.length === 0) return;
        const m = await h.create();
        try {
          const text = h.canonicalTexts[0] ?? "";
          await m.importText(text);
          const beforeEdit = m.exportText();
          // with undo history on the stack: a rejected import must leave it
          // intact too (an engine that erases history BEFORE parsing does not)
          if (h.undo) {
            await h.mutate(m);
            await (h.settle ?? defaultSettle)();
          }
          const doc = m.exportText();
          const ids = sortedIds(m);
          for (const bad of h.invalidTexts) {
            let rejected = false;
            const { calls } = await changeEvents(h, m, () =>
              m.importText(bad).then(
                () => undefined,
                () => {
                  rejected = true;
                },
              ),
            );
            if (!rejected) fail("importText resolved for a non-importable input — it must REJECT");
            if (calls > 0) fail("a rejected import fired onContentChanged");
            if (m.exportText() !== doc)
              fail("a rejected import changed the document — the previous state must stay intact");
            if (ids && !same(ids, sortedIds(m))) {
              fail(
                "a rejected import changed the rendered elements — the canvas must keep the previous document",
              );
            }
          }
          if (h.undo) {
            await h.undo(m);
            if (m.exportText() !== beforeEdit) {
              fail(
                "a rejected import erased the undo history — the previous document's history must stay intact",
              );
            }
          }
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "L7: the modeler stays usable after a rejected import",
      async run(h) {
        if (h.invalidTexts === undefined) {
          return skip(
            "invalidTexts is undefined — pass [] if the notation has no non-importable text",
          );
        }
        const bad = h.invalidTexts[0];
        if (bad === undefined) return;
        const m = await h.create();
        try {
          await m.importText(h.canonicalTexts[0] ?? "");
          await m.importText(bad).then(
            () => fail("importText resolved for a non-importable input — it must REJECT"),
            () => undefined,
          );
          const next = secondText(h);
          await m
            .importText(next)
            .catch((e) =>
              fail(`the next VALID import after a rejection did not render: ${String(e)}`),
            );
          if (m.exportText() !== next)
            fail("the next valid import after a rejection did not replace the document");
          const before = m.exportText();
          const { calls } = await changeEvents(h, m, () => h.mutate(m));
          if (calls === 0)
            fail("a user mutation after a rejected import fired no onContentChanged (wedged)");
          if (exportOrFail(m, "after a mutation that followed a rejected import") === before) {
            fail("a user mutation after a rejected import did not apply (wedged)");
          }
          if (h.undo) {
            await h.undo(m);
            exportOrFail(m, "after an undo that followed a rejected import");
          }
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "L7: every rejection of a derived probe leaves no trace",
      async run(h) {
        const base = h.canonicalTexts[0] ?? "";
        const m = await h.create();
        try {
          await m.importText(base);
          // the baseline comes from the modeler's OWN serializer: this case
          // isolates the rejection path — a non-canonical serializer fails L2
          const baseline = exportOrFail(m, "after importing canonicalTexts[0]");
          const baseIds = sortedIds(m);
          let previous: Probe | undefined;
          const reimportBase = async (): Promise<void> => {
            if (previous === undefined) return;
            const after = `after importing ${describeProbe(previous)}`;
            await importOrFail(m, base, `the next valid import ${after} did not render`);
            const doc = exportOrFail(m, `on the next valid import ${after}`);
            if (doc !== baseline || (baseIds && !same(baseIds, sortedIds(m)))) {
              fail(`the next valid import ${after} did not replace the document (wedged)`);
            }
          };
          const mutateAndExpectApplied = async (): Promise<string> => {
            await h.mutate(m);
            await (h.settle ?? defaultSettle)();
            const doc = exportOrFail(m, "after a user mutation");
            if (doc === baseline) {
              fail(
                previous === undefined
                  ? "the harness mutation did not change the export — the case proves nothing"
                  : `a user mutation after importing ${describeProbe(previous)} did not apply (wedged)`,
              );
            }
            return doc;
          };
          for (const probe of probesOf(h)) {
            await reimportBase();
            // a document WITH undo history: a rejection must keep both
            const doc = await mutateAndExpectApplied();
            const ids = sortedIds(m);
            const what = `importText(${describeProbe(probe)})`;
            let rejected = false;
            const { calls } = await changeEvents(h, m, () =>
              m.importText(probe.text).then(
                () => undefined,
                () => {
                  rejected = true;
                },
              ),
            );
            if (rejected) {
              if (calls > 0) fail(`a rejected ${what} fired onContentChanged ${calls}x (L7)`);
              if (exportOrFail(m, `after a rejected ${what}`) !== doc) {
                fail(
                  `a rejected ${what} changed the document — the previous state must stay intact (L7)`,
                );
              }
              if (ids && !same(ids, sortedIds(m))) {
                fail(
                  `a rejected ${what} changed the rendered elements — the canvas must keep the previous document (L7)`,
                );
              }
              if (h.undo) {
                await h.undo(m);
                if (
                  exportOrFail(m, `after an undo that followed a rejected ${what}`) !== baseline
                ) {
                  fail(
                    `a rejected ${what} erased the undo history — the previous document's history must stay intact (L7)`,
                  );
                }
              }
            } else {
              if (calls > 0)
                fail(
                  `${what} resolved and fired onContentChanged ${calls}x — an import is silent (L1)`,
                );
              exportOrFail(m, `after ${what} resolved (L6)`);
            }
            previous = probe;
          }
          await reimportBase();
          await mutateAndExpectApplied();
        } finally {
          m.destroy();
        }
      },
    },
    {
      name: "viewer (when shipped): read-only, silent, canonical, fits, reveals, keeps foreign content, unshaken by a rejected import",
      async run(h) {
        if (!h.createReadonly)
          return skip("createReadonly is undefined — the package ships no viewer mount");
        const v = await h.createReadonly();
        try {
          if (v.meta.editable !== false)
            fail("createReadonly() must return a viewer (meta.editable === false)");
          try {
            const fresh = v.getViewState();
            if (fresh !== undefined) assertFinite(fresh, "on the viewer before the first import");
          } catch (e) {
            fail(`the viewer's getViewState threw before the first import: ${String(e)}`);
          }
          let calls = 0;
          const off = v.onContentChanged(() => {
            calls += 1;
          });
          try {
            for (const text of h.canonicalTexts) {
              await v
                .importText(text)
                .catch((e) => fail(`the viewer rejected a canonical text: ${String(e)}`));
              if (exportOrFail(v, "on the viewer") !== text)
                fail("the viewer's export is not the canonical text");
            }
            const doc = v.exportText();
            const ids = sortedIds(v);
            if (v.elements) {
              const firstId = v.elements.list()[0]?.id;
              if (firstId !== undefined) {
                const deliveries: string[][] = [];
                const offSel = v.elements.onSelection((s) => deliveries.push([...s]));
                if (v.elements.reveal(firstId) !== true)
                  fail("the viewer's reveal(known id) must return true");
                await (h.settle ?? defaultSettle)();
                if (!deliveries.some((d) => d.includes(firstId)))
                  fail("the viewer's reveal delivered no selection containing the id");
                if (!v.elements.selection().includes(firstId))
                  fail("the viewer's selection() does not contain the revealed id");
                offSel();
              }
              if (v.elements.reveal("__modeler_api_no_such_id__") !== false)
                fail("the viewer's reveal(unknown id) must return false");
            }
            for (const bad of h.invalidTexts ?? []) {
              await v.importText(bad).then(
                () => fail("the viewer resolved a non-importable input — it must REJECT"),
                () => undefined,
              );
              if (v.exportText() !== doc) fail("a rejected import changed the viewer's document");
              if (ids && !same(ids, sortedIds(v)))
                fail("a rejected import changed the viewer's rendered elements");
            }
            await foreignRoundTrips(h, v, "the viewer's ");
            if (h.viewState !== undefined) {
              const text = await importContentText(h, v);
              const fitted = v.getViewState();
              assertFinite(fitted, "on the viewer after import");
              v.setViewState(h.viewState);
              const applied = v.getViewState();
              if (same(applied, fitted)) fail("the viewer's setViewState had no effect");
              await v.importText(text);
              if (!same(v.getViewState(), fitted))
                fail("the viewer's import must leave the view fitted (L5)");
              v.setViewState(applied);
              if (!same(v.getViewState(), applied))
                fail("setting the viewer's own readback did not yield that readback");
            }
            await (h.settle ?? defaultSettle)();
            if (calls > 0)
              fail(`the viewer fired onContentChanged ${calls}x — a viewer never changes content`);
          } finally {
            off();
          }
        } finally {
          v.destroy();
          v.destroy(); // must not throw — same as the editor
        }
      },
    },
    {
      name: "appearance (when present, 1.5): a theme is view state, and a theme the modeler does not list draws themes[0], whatever mode the page shows",
      run: appearanceIsViewState,
    },
    {
      name: "keys (recommended): a key aimed at the host's controls and editors or at <body> is left alone, a keydown or keyup without a key throws nothing, a key on the focused canvas acts",
      run: keysStayOnTheCanvas,
    },
    {
      name: "destroy is safe to call twice",
      async run(h) {
        const m = await h.create();
        m.destroy();
        m.destroy(); // must not throw
      },
    },
  ];
}

/** the L6 foreign-content round-trips, on an editor or a viewer */
async function foreignRoundTrips(
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

/** where the keys case looks for the canvas: the focusable `<svg>` diagram-js places in the host */
const CANVAS_SELECTOR = "svg[tabindex]";

/** a key a canvas might bind, as a keyboard event carries it */
interface KeyStroke {
  key: string;
  code: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

const NAMED_CODES: Record<string, string> = {
  " ": "Space",
  "+": "Equal",
  "=": "Equal",
  "-": "Minus",
  "!": "Digit1",
};

const codeOf = (key: string): string => {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^\d$/.test(key)) return `Digit${key}`;
  return NAMED_CODES[key] ?? key;
};

const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

/**
 * the keys the Miragon canvases and diagram-js's keyboard bind: editing, nudging (Shift: a larger
 * step), Enter, Escape, Space and Tab, the single-key tools of diagram-js and the renderers,
 * Shift+1 (fit), and every shortcut (clipboard, undo, zoom, Ctrl/Meta+Arrow moving the canvas)
 * once with Ctrl and once with Meta, since a renderer may read either
 */
const KEY_STROKES: KeyStroke[] = [
  ...[
    "Backspace",
    "Delete",
    ...ARROWS,
    "Enter",
    "Escape",
    " ",
    "Tab",
    "a",
    "c",
    "e",
    "h",
    "l",
    "n",
    "p",
    "s",
    "u",
  ].map((key) => ({ key, code: codeOf(key) })),
  ...ARROWS.map((key) => ({ key, code: key, shiftKey: true })),
  { key: "!", code: codeOf("!"), shiftKey: true },
  ...[
    { key: "a" },
    { key: "c" },
    { key: "v" },
    { key: "x" },
    { key: "d" },
    { key: "z" },
    { key: "Z", shiftKey: true },
    { key: "y" },
    { key: "+" },
    { key: "=" },
    { key: "-" },
    { key: "0" },
    ...ARROWS.flatMap((key) => [{ key }, { key, shiftKey: true }]),
  ].flatMap((stroke) => [
    { ...stroke, code: codeOf(stroke.key), ctrlKey: true },
    { ...stroke, code: codeOf(stroke.key), metaKey: true },
  ]),
];

const describeStroke = (stroke: KeyStroke): string =>
  [
    stroke.ctrlKey ? "Ctrl" : "",
    stroke.metaKey ? "Meta" : "",
    stroke.shiftKey ? "Shift" : "",
    stroke.key === " " ? "Space" : stroke.key === "!" ? "1" : stroke.key,
  ]
    .filter((part) => part !== "")
    .join("+");

/** where the keys case aims a key, and how the page gets there */
interface KeyTarget {
  /** names the target in the advisory */
  what: string;
  element: Element;
  /** moves the focus the way the page does; returns what undoes it */
  enter(): () => void;
}

type Focusable = Element & HTMLOrSVGElement;

const focusOn = (element: Element): void => {
  (element as Focusable).focus({ preventScroll: true });
};

/** the focus leaves whatever holds it and falls to <body> */
const blurActive = (doc: Document): void => {
  const active = doc.activeElement;
  if (active !== null && active !== doc.body) (active as Focusable).blur();
};

const stayPut = (): void => undefined;

/**
 * focusable stand-ins for a host's chrome and editors, in a box appended to `parent`: a button, the
 * text fields, a contenteditable, an editor inside a `.monaco-editor` and, where the browser has
 * EditContext (Chromium), an element that types through one, as Monaco 0.55 does there
 */
function hostControls(parent: HTMLElement, where: string): { targets: KeyTarget[]; box: Element } {
  const doc = parent.ownerDocument;
  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = "Host button";
  const input = doc.createElement("input");
  input.value = "host text";
  const textarea = doc.createElement("textarea");
  textarea.value = "host text";
  const select = doc.createElement("select");
  for (const label of ["one", "two"]) {
    const option = doc.createElement("option");
    option.textContent = label;
    select.append(option);
  }
  const editable = doc.createElement("div");
  editable.setAttribute("contenteditable", "true");
  editable.textContent = "host text";
  const monaco = doc.createElement("div");
  monaco.className = "monaco-editor";
  const monacoInput = doc.createElement("div");
  monacoInput.className = "native-edit-context";
  monacoInput.setAttribute("role", "textbox");
  monacoInput.tabIndex = 0;
  monaco.append(monacoInput);
  const box = doc.createElement("div");
  box.append(button, input, textarea, select, editable, monaco);
  const controls: Array<[string, HTMLElement]> = [
    ["a host <button>", button],
    ["a host text <input>", input],
    ["a host <textarea>", textarea],
    ["a host <select>", select],
    ["a host contenteditable", editable],
    ["a focusable element in a host .monaco-editor", monacoInput],
  ];
  const EditContextClass = (globalThis as { EditContext?: new () => object }).EditContext;
  if (typeof EditContextClass === "function") {
    const editor = doc.createElement("div");
    editor.tabIndex = 0;
    Object.assign(editor, { editContext: new EditContextClass() });
    box.append(editor);
    controls.push(["a host EditContext editor", editor]);
  }
  parent.append(box);
  const targets = controls.map(([what, element]) => ({
    what: `${what} ${where}`,
    element,
    enter: () => {
      focusOn(element);
      return stayPut;
    },
  }));
  return { targets, box };
}

/** <body> as a key's target: nothing focused, right after the canvas had the focus, and while the
 *  host hides the modeler or makes it inert */
function bodyTargets(doc: Document, canvas: Element, wrapper: HTMLElement): KeyTarget[] {
  const body = doc.body;
  const hideWith = (hide: () => () => void) => (): (() => void) => {
    focusOn(canvas);
    const show = hide();
    // a browser moves the focus off a hidden or inert element only at its next rendering update
    blurActive(doc);
    return show;
  };
  return [
    {
      what: "<body> with nothing focused",
      element: body,
      enter: () => {
        blurActive(doc);
        return stayPut;
      },
    },
    {
      what: "<body> right after the canvas lost the focus",
      element: body,
      enter: () => {
        focusOn(canvas);
        blurActive(doc);
        return stayPut;
      },
    },
    {
      what: "<body> while the host hides the modeler (display: none)",
      element: body,
      enter: hideWith(() => {
        const display = wrapper.style.display;
        wrapper.style.display = "none";
        return () => {
          wrapper.style.display = display;
        };
      }),
    },
    {
      what: "<body> while the host makes the modeler inert",
      element: body,
      enter: hideWith(() => {
        wrapper.setAttribute("inert", "");
        return () => wrapper.removeAttribute("inert");
      }),
    },
  ];
}

const listed = (parts: string[]): string =>
  parts.length < 2 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

/** how many findings the advisory spells out; the rest it counts */
const SHOWN_KEY_FINDINGS = 12;

const selectionOf = (m: CollaborativeModeler): string =>
  m.elements ? JSON.stringify([...m.elements.selection()].sort()) : "";

/** what the keys case aims its keys at: the editable modeler, then the viewer */
type KeyedInstance = "modeler" | "viewer";

/** the canvas an instance takes its keys on, and the attachedHost() it lies in */
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
function mountedCanvas(
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

/**
 * one instance of the keys case: mounted into `attachedHost()`, it imports `canonicalTexts[0]`,
 * gets undo history (`mutate`, the editable modeler only) and a selection (`elements.reveal`), and
 * then sees every key of KEY_STROKES aimed at host controls beside its container, inside it and
 * next to its canvas, and at <body>. Each must leave the document, the change events, the
 * selection, `defaultPrevented` and the propagation alone; a keydown or keyup without a key must
 * throw nothing. What it finds goes to `findings`, prefixed for the viewer. On the editable
 * modeler, Delete or Backspace on the focused canvas must then remove the revealed element:
 * without that proof the case cannot tell a key the modeler leaves alone from one it never sees.
 * Returns why the keys were not (fully) verified, if they were not
 */
async function aimKeysAt(
  h: ConformanceHarness,
  instance: KeyedInstance,
  create: () => Promise<CollaborativeModeler>,
  findings: string[],
): Promise<string | undefined> {
  const settle = h.settle ?? defaultSettle;
  const text = h.canonicalTexts[0] ?? "";
  const editable = instance === "modeler";
  const found = (finding: string): void => {
    findings.push(editable ? finding : `the viewer: ${finding}`);
  };
  const firstSerial = nextHostSerial;
  const m = await create();
  const cleanups: Array<() => void> = [];
  try {
    await importOrFail(
      m,
      text,
      editable ? "importText(canonicalTexts[0]) rejected" : "the viewer rejected canonicalTexts[0]",
    );
    const mount = mountedCanvas(h, m, instance, firstSerial);
    if (typeof mount === "string") return mount;
    const { canvas, host, wrapper } = mount;
    const doc = host.ownerDocument;
    const view = doc.defaultView ?? window;

    const propagated = new WeakSet<Event>();
    const reachedWindow = (event: Event): void => {
      propagated.add(event);
    };
    view.addEventListener("keydown", reachedWindow);
    view.addEventListener("keyup", reachedWindow);
    cleanups.push(() => {
      view.removeEventListener("keydown", reachedWindow);
      view.removeEventListener("keyup", reachedWindow);
    });
    let changes = 0;
    cleanups.push(
      m.onContentChanged(() => {
        changes += 1;
      }),
    );
    // only while the kit dispatches: an error the modeler throws from a key listener reaches no
    // caller, so the window's error event is the one place to see it
    const thrownBy = (dispatch: () => void): string[] => {
      const thrown: string[] = [];
      const onError = (event: ErrorEvent): void => {
        thrown.push(String(event.error ?? event.message));
        event.preventDefault();
      };
      view.addEventListener("error", onError);
      try {
        dispatch();
      } finally {
        view.removeEventListener("error", onError);
      }
      return thrown;
    };
    const press = (
      target: Element,
      stroke: KeyStroke,
    ): { prevented: boolean; stopped: boolean; thrown: string[] } => {
      const init = { ...stroke, bubbles: true, cancelable: true, composed: true };
      const down = new view.KeyboardEvent("keydown", init);
      const up = new view.KeyboardEvent("keyup", init);
      const thrown = thrownBy(() => {
        target.dispatchEvent(down);
        target.dispatchEvent(up);
      });
      return {
        prevented: down.defaultPrevented || up.defaultPrevented,
        stopped: !propagated.has(down) || !propagated.has(up),
        thrown,
      };
    };

    let revealed: string | undefined;
    const setUp = async (): Promise<void> => {
      await importOrFail(m, text, "re-importing canonicalTexts[0] rejected");
      // undo history and a selection: what Cmd/Ctrl+Z, Delete and the arrows act on
      if (editable) await h.mutate(m);
      await settle();
      revealed = m.elements?.list()[0]?.id;
      if (revealed !== undefined) m.elements?.reveal(revealed);
      await settle();
    };
    await setUp();

    // beside the modeler, inside the element the host gave it, and next to the canvas in the
    // element that holds it, where a host's overlays (diagram-js overlays) put their editors
    const placements: Array<[HTMLElement, string]> = [
      [doc.body, "beside the modeler"],
      [host, "inside the modeler's container"],
    ];
    const canvasHolder = canvas.parentElement;
    if (canvasHolder !== null && canvasHolder !== host) {
      placements.push([canvasHolder, "next to the canvas"]);
    }
    const controls = placements.map(([parent, where]) => hostControls(parent, where));
    for (const { box } of controls) cleanups.push(() => box.remove());
    const outside = controls[0]?.targets ?? [];

    const targets = [
      ...controls.flatMap((placed) => placed.targets),
      ...bodyTargets(doc, canvas, wrapper),
    ];
    for (const target of targets) {
      const leave = target.enter();
      let dirty = false;
      try {
        const last = { doc: exportOrFail(m, `with the focus on ${target.what}`), changes };
        for (const stroke of KEY_STROKES) {
          const key = `${describeStroke(stroke)} on ${target.what}`;
          const selection = selectionOf(m);
          const { prevented, stopped, thrown } = press(target.element, stroke);
          const changed = [
            ...(changes !== last.changes ? ["fired onContentChanged"] : []),
            ...(exportOrFail(m, `after ${key}`) !== last.doc ? ["changed the document"] : []),
            ...(selectionOf(m) !== selection ? ["changed the selection"] : []),
          ];
          const effects = [
            ...changed,
            ...(prevented ? ["prevented it"] : []),
            ...(stopped ? ["stopped its propagation"] : []),
            ...thrown.map((error) => `threw ${error}`),
          ];
          if (effects.length > 0) found(`${key} ${listed(effects)}`);
          // the keys after it would be judged against a state it changed: one finding per target
          // is enough, and a fresh document per key would take a non-conforming modeler too long
          dirty = changed.length > 0;
          if (dirty) break;
        }
        if (!dirty) {
          await settle();
          if (exportOrFail(m, `once the keys on ${target.what} settled`) !== last.doc) {
            found(`a key on ${target.what} changed the document once it settled`);
            dirty = true;
          } else if (changes !== last.changes) {
            found(`a key on ${target.what} fired onContentChanged once it settled`);
            dirty = true;
          }
        }
      } finally {
        leave();
      }
      if (dirty) await setUp();
    }

    const keyless: Array<[string, Element, () => void]> = [
      ["the focused canvas", canvas, () => focusOn(canvas)],
      ["<body> with nothing focused", doc.body, () => blurActive(doc)],
      ...outside
        .slice(0, 2)
        .map((target): [string, Element, () => void] => [
          target.what,
          target.element,
          () => target.enter(),
        ]),
    ];
    for (const [what, element, enter] of keyless) {
      enter();
      for (const type of ["keydown", "keyup"]) {
        const thrown = thrownBy(() =>
          element.dispatchEvent(new view.Event(type, { bubbles: true, cancelable: true })),
        );
        for (const error of thrown) found(`a ${type} without a key on ${what} threw ${error}`);
      }
    }

    // a viewer edits nothing, so no key has to act on it
    if (!editable) return undefined;
    if (!m.elements) {
      return "the modeler exposes no elements surface (optional) — that Delete on the focused canvas removes a revealed element was not verified, so the case cannot tell a key the modeler leaves alone from one it never sees";
    }
    await setUp();
    focusOn(canvas);
    if (revealed === undefined) {
      return "elements.list() reports no element after importing canonicalTexts[0] and one mutate — that Delete on the focused canvas removes a revealed element was not verified, so the case cannot tell a key the modeler leaves alone from one it never sees";
    }
    if (doc.activeElement !== canvas) {
      return "the canvas did not take the focus — that a key on the focused canvas acts was not verified, so the case cannot tell a key the modeler leaves alone from one it never sees";
    }
    const before = exportOrFail(m, `with '${revealed}' revealed`);
    for (const key of ["Delete", "Backspace"]) {
      press(canvas, { key, code: key });
      await settle();
      if (exportOrFail(m, `after ${key} on the focused canvas`) !== before) return undefined;
    }
    return `Delete and Backspace on the focused canvas, with '${revealed}' revealed (selected), left the document as it was — the case cannot tell a key the modeler leaves alone from one it never sees`;
  } finally {
    for (const cleanup of cleanups) cleanup();
    m.destroy();
  }
}

/**
 * the keys case: the editable modeler and, when the harness has one, the viewer, each mounted into
 * `attachedHost()`, see every key of KEY_STROKES aimed at host controls and at <body> (aimKeysAt).
 * What they do with those keys is one advisory, since 1.4 only RECOMMENDS leaving them alone; what
 * the case could not verify is one skip
 */
async function keysStayOnTheCanvas(h: ConformanceHarness): Promise<CaseOutcome> {
  if (typeof document === "undefined") {
    return skip(
      "no DOM — keys need a document to be aimed at (run the kit in a browser, the modeler mounted into attachedHost())",
    );
  }
  const findings: string[] = [];
  const unverified: string[] = [];
  const modelerGap = await aimKeysAt(h, "modeler", () => h.create(), findings);
  if (modelerGap !== undefined) unverified.push(modelerGap);
  if (h.createReadonly) {
    const createViewer = (): Promise<CollaborativeModeler> =>
      h.createReadonly?.() ?? fail("createReadonly went away during the keys case");
    const viewerGap = await aimKeysAt(h, "viewer", createViewer, findings);
    if (viewerGap !== undefined) unverified.push(viewerGap);
  }
  const more =
    findings.length > SHOWN_KEY_FINDINGS
      ? `; and ${findings.length - SHOWN_KEY_FINDINGS} more`
      : "";
  return {
    ...(unverified.length === 0 ? {} : { skipped: unverified.join("; ") }),
    ...(findings.length === 0
      ? {}
      : {
          advisories: [
            `keys left the canvas: ${findings.slice(0, SHOWN_KEY_FINDINGS).join("; ")}${more} — RECOMMENDED: act on a key only while the canvas holds the focus (its target is the canvas or lies inside it), leave every other key alone (no command, no change of the document or the selection, no preventDefault, no stopPropagation) and ignore a keydown or keyup without a key`,
          ],
        }),
  };
}

const GESTURE_KINDS: readonly GestureKind[] = ["move", "create", "createOffCanvas"];

/**
 * how long the gesture, drop, user-action, drag-start and pan cases wait for an import called
 * while the user holds something or acts. A modeler may let that import wait (for the gesture's
 * drop instead of cancelling it, for the pan's release, or for something an action never ends):
 * without a bound the case would never reach the release, and a missed recommendation would hang
 * the run instead of advising
 */
const HELD_IMPORT_BOUND_MS = 2000;

/** how a Promise came out within a bound: resolved, rejected with this reason, or not settled yet */
type BoundedOutcome =
  { unsettled: true; rejected?: undefined } | { unsettled?: undefined; rejected?: string };

/** the Promise's outcome once it settles, or `unsettled` after `ms` (it may still settle later) */
async function settledWithin(promise: Promise<unknown>, ms: number): Promise<BoundedOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<BoundedOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ unsettled: true }), ms);
  });
  try {
    return await Promise.race([
      promise.then(
        (): BoundedOutcome => ({}),
        (e: unknown): BoundedOutcome => ({ rejected: String(e) }),
      ),
      bound,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** what one leg of the gesture, drop, user-action, drag-start or pan case found */
interface LegFindings {
  findings: string[];
  /** the leg's import waited for the user: the case advises on it and runs no further leg, whose
   *  imports would queue behind one that may never settle */
  stop?: true;
}

const doNothing = (): void => undefined;

/**
 * `importText(text)` started while the kit counts change events, and waited for up to
 * HELD_IMPORT_BOUND_MS: the count, the import's Promise (to wait for again after a release) and
 * how it came out
 */
async function importWhileHeld(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  text: string,
  onResolve: () => void = doNothing,
): Promise<{ calls: number; importing: Promise<unknown>; outcome: BoundedOutcome }> {
  let importing: Promise<unknown> = Promise.resolve();
  let outcome: BoundedOutcome = {};
  const { calls } = await changeEvents(h, m, async () => {
    importing = m.importText(text).then(onResolve);
    outcome = await settledWithin(importing, HELD_IMPORT_BOUND_MS);
  });
  return { calls, importing, outcome };
}

/** one advisory from a case's findings: the first SHOWN_KEY_FINDINGS spelled out, the rest counted */
function adviseOn(findings: string[], lead: string, recommendation: string): CaseOutcome {
  if (findings.length === 0) return {};
  const more =
    findings.length > SHOWN_KEY_FINDINGS
      ? `; and ${findings.length - SHOWN_KEY_FINDINGS} more`
      : "";
  return {
    advisories: [
      `${lead}: ${findings.slice(0, SHOWN_KEY_FINDINGS).join("; ")}${more} — ${recommendation}`,
    ],
  };
}

/** a case's advisory and what it could not verify, in one outcome */
const outcomeOf = (advised: CaseOutcome, unverified: string[]): CaseOutcome => ({
  ...(unverified.length === 0 ? {} : { skipped: unverified.join("; ") }),
  ...advised,
});

/** what a harness step threw, or `undefined` */
async function errorOf(step: () => Promise<void> | void): Promise<string | undefined> {
  try {
    await step();
    return undefined;
  } catch (e) {
    return String(e);
  }
}

/** errors that reached the window while the kit listened: a throw in a pointer listener reaches no caller */
interface WindowErrors {
  readonly errors: string[];
  stop(): void;
}

function listenForWindowErrors(): WindowErrors {
  const errors: string[] = [];
  if (typeof window === "undefined") return { errors, stop: doNothing };
  const onError = (event: ErrorEvent): void => {
    errors.push(String(event.error ?? event.message));
    event.preventDefault();
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    errors.push(String(event.reason));
    event.preventDefault();
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return {
    errors,
    stop: () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    },
  };
}

/** what `interaction.onChange` delivered while the kit watched */
interface InteractionWatch {
  readonly delivered: boolean[];
  /** deliveries during which `active()` returned another value than the listener got */
  mismatches: number;
  stop(): void;
}

function watchInteraction(m: CollaborativeModeler): InteractionWatch | undefined {
  const interaction = m.interaction;
  if (!interaction) return undefined;
  const watch: InteractionWatch = { delivered: [], mismatches: 0, stop: doNothing };
  watch.stop = interaction.onChange((active) => {
    watch.delivered.push(active);
    if (interaction.active() !== active) watch.mismatches += 1;
  });
  return watch;
}

/** a document the gesture cases import while the user holds something on `canonicalTexts[0]` */
interface ImportedLeg {
  text: string;
  what: string;
}

/** a different document, which usually removes what the user holds, then the same one again */
function importedLegs(h: ConformanceHarness): ImportedLeg[] {
  const second = h.canonicalTexts[1];
  return [
    ...(second === undefined
      ? []
      : [{ text: second, what: "a different document (canonicalTexts[1])" }]),
    { text: h.canonicalTexts[0] ?? "", what: "the same document (canonicalTexts[0])" },
  ];
}

const oneTextOnly = (h: ConformanceHarness, what: string): string[] =>
  h.canonicalTexts[1] === undefined
    ? [
        `canonicalTexts holds one text — ${what} of a DIFFERENT document was not checked (add a second canonical text)`,
      ]
    : [];

/**
 * two view states alike up to float noise: the same JSON shape, each number within a millionth of
 * its size. A pan computes the same view along another path of float operations after an import
 */
function closeTo(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => closeTo(value, b[index]));
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const keys = Object.keys(a).sort();
    if (!same(keys, Object.keys(b).sort())) return false;
    return keys.every((key) =>
      closeTo((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  }
  return a === b;
}

type GestureStarter = NonNullable<ConformanceHarness["startGesture"]>;

/**
 * the proof the gesture cases stand on: a drop the modeler still runs changes the document. Without
 * it, a drop after an import that applied nothing could be a gesture the import cancelled as well
 * as a harness whose drop never lands
 */
async function expectDropApplies(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  startGesture: GestureStarter,
  kind: GestureKind,
): Promise<void> {
  await importOrFail(m, h.canonicalTexts[0] ?? "", "importText(canonicalTexts[0]) rejected");
  await (h.settle ?? defaultSettle)();
  const doc = exportOrFail(m, "after importing canonicalTexts[0]");
  const held = await startGesture(m, kind);
  await held.drop();
  await (h.settle ?? defaultSettle)();
  if (exportOrFail(m, `after startGesture(modeler, "${kind}") and its drop`) === doc) {
    fail(
      `startGesture(modeler, "${kind}") and drop() left the document as it was — the case proves nothing (drop() releases the gesture where it applies, so a drop the modeler still runs changes the document)`,
    );
  }
}

/** one gesture held over an accepted import of `leg`, then dropped; what the recommendation finds */
async function importDuringGesture(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  startGesture: GestureStarter,
  kind: GestureKind,
  leg: ImportedLeg,
  expected: string,
): Promise<LegFindings> {
  const settle = h.settle ?? defaultSettle;
  const during = `${leg.what} imported during a ${kind} gesture`;
  const findings: string[] = [];
  const watch = watchInteraction(m);
  const errors = listenForWindowErrors();
  try {
    const held = await startGesture(m, kind);
    const mark = watch?.delivered.length ?? 0;
    let beforeResolve: boolean[] = [];
    const {
      calls,
      importing,
      outcome: imported,
    } = await importWhileHeld(h, m, leg.text, () => {
      beforeResolve = watch?.delivered.slice(mark) ?? [];
    });
    if (calls > 0) {
      fail(
        `importing ${leg.what} during a ${kind} gesture fired onContentChanged ${calls}x before the drop — an import is silent (L1; if every import emits, see the L1 cases first)`,
      );
    }
    if (imported.unsettled) {
      findings.push(
        `importing ${leg.what} during a ${kind} gesture had not settled ${HELD_IMPORT_BOUND_MS / 1000} s later — the import waited for the gesture to end instead of cancelling it`,
      );
      const thrown = await errorOf(() => held.drop());
      if (thrown !== undefined) findings.push(`the drop after ${during} threw ${thrown}`);
      const released = await settledWithin(importing, HELD_IMPORT_BOUND_MS);
      if (released.unsettled) {
        findings.push(
          `${during} had not settled ${HELD_IMPORT_BOUND_MS / 1000} s after the drop either`,
        );
      } else if (released.rejected !== undefined) {
        fail(`importText(${leg.what}) rejected during a ${kind} gesture: ${released.rejected}`);
      }
      return { findings, stop: true };
    }
    if (imported.rejected !== undefined) {
      fail(`importText(${leg.what}) rejected during a ${kind} gesture: ${imported.rejected}`);
    }
    if (m.interaction?.active()) {
      findings.push(`interaction.active() was still true after ${during}`);
    } else if (watch && !same(beforeResolve, [false])) {
      findings.push(
        `interaction.onChange delivered ${JSON.stringify(beforeResolve)} between the start of a ${kind} gesture and the resolve of an import that ended it (once false)`,
      );
    }
    let thrown: string | undefined;
    const dropped = await changeEvents(h, m, async () => {
      thrown = await errorOf(() => held.drop());
    });
    if (thrown !== undefined) findings.push(`the drop after ${during} threw ${thrown}`);
    for (const error of errors.errors) {
      findings.push(`an error reached the window around ${during} and its drop: ${error}`);
    }
    const out = exportOrFail(m, `after the drop that followed ${during}`);
    if (dropped.calls > 0 || out !== expected) {
      findings.push(
        `the drop after ${during} applied the ${kind}${dropped.calls > 0 ? ` (onContentChanged ${dropped.calls}x)` : ""}, so the export is no longer the imported document`,
      );
    }
    if (h.undo && out === expected) {
      await h.undo(m);
      await settle();
      if (exportOrFail(m, `after an undo that followed ${during}`) !== expected) {
        findings.push(
          `an undo after the drop that followed ${during} changed the document — the gesture left a command on the fresh undo history (L4)`,
        );
      }
    }
    const before = exportOrFail(m, `before the next mutate after ${during}`);
    const next = await changeEvents(h, m, () => h.mutate(m));
    if (next.calls === 0 || exportOrFail(m, `after the next mutate after ${during}`) === before) {
      findings.push(
        `the next mutate after the drop that followed ${during} did not apply (wedged)`,
      );
    }
  } finally {
    errors.stop();
    watch?.stop();
  }
  return { findings };
}

/** one gesture held over a rejected import, then dropped: it should still apply */
async function rejectionDuringGesture(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  startGesture: GestureStarter,
  kind: GestureKind,
  invalid: string,
): Promise<LegFindings> {
  const findings: string[] = [];
  await importOrFail(m, h.canonicalTexts[0] ?? "", "importText(canonicalTexts[0]) rejected");
  await (h.settle ?? defaultSettle)();
  const doc = exportOrFail(m, "after importing canonicalTexts[0]");
  const watch = watchInteraction(m);
  const errors = listenForWindowErrors();
  try {
    const held = await startGesture(m, kind);
    const mark = watch?.delivered.length ?? 0;
    const { calls, importing, outcome: rejection } = await importWhileHeld(h, m, invalid);
    if (rejection.unsettled) {
      findings.push(
        `importing invalidTexts[0] during a ${kind} gesture had not settled ${HELD_IMPORT_BOUND_MS / 1000} s later — the import waited for the gesture to end instead of rejecting and leaving it running`,
      );
      await errorOf(() => held.drop());
      const released = await settledWithin(importing, HELD_IMPORT_BOUND_MS);
      if (!released.unsettled && released.rejected === undefined) {
        fail(
          `importText(invalidTexts[0]) resolved after a ${kind} gesture it waited for — a non-importable input REJECTS (L7)`,
        );
      }
      return { findings, stop: true };
    }
    if (rejection.rejected === undefined) {
      fail(
        `importText(invalidTexts[0]) resolved during a ${kind} gesture — a non-importable input REJECTS (L7)`,
      );
    }
    if (calls > 0) {
      fail(`a rejected import during a ${kind} gesture fired onContentChanged ${calls}x (L7)`);
    }
    if (exportOrFail(m, `after a rejected import during a ${kind} gesture`) !== doc) {
      fail(`a rejected import during a ${kind} gesture changed the document (L7)`);
    }
    let ended = false;
    if (m.interaction && !m.interaction.active()) {
      ended = true;
      findings.push(
        `a rejected import ended a ${kind} gesture (interaction.active() turned false)`,
      );
    } else if (watch && watch.delivered.length > mark) {
      findings.push(
        `interaction.onChange delivered ${JSON.stringify(watch.delivered.slice(mark))} during a rejected import while a ${kind} gesture ran`,
      );
    }
    let thrown: string | undefined;
    const dropped = await changeEvents(h, m, async () => {
      thrown = await errorOf(() => held.drop());
    });
    if (thrown !== undefined) {
      findings.push(`the drop of a ${kind} gesture after a rejected import threw ${thrown}`);
    }
    for (const error of errors.errors) {
      findings.push(
        `an error reached the window around a rejected import during a ${kind} gesture and its drop: ${error}`,
      );
    }
    const applied =
      dropped.calls > 0 && exportOrFail(m, `after the drop of a ${kind} gesture`) !== doc;
    if (!applied && !ended) {
      findings.push(
        `the drop of a ${kind} gesture after a rejected import applied nothing — the rejected import ended the gesture`,
      );
    }
  } finally {
    errors.stop();
    watch?.stop();
  }
  return { findings };
}

/**
 * the L1 gesture case: per kind, a gesture held over an accepted import of another document and of
 * the same one, then dropped, and one held over a rejected import. A change event before the drop
 * fails (L1, L7); what the drop does, and what `interaction` reports around the import, is one
 * advisory, since 1.5 only RECOMMENDS the cancel
 */
async function importCancelsGestures(h: ConformanceHarness): Promise<CaseOutcome> {
  if (!h.startGesture) {
    return skip(
      "startGesture is undefined — that an import cancels a running gesture (L1, RECOMMENDED since 1.5) was not checked",
    );
  }
  const startGesture = h.startGesture;
  const first = h.canonicalTexts[0] ?? "";
  const invalid = h.invalidTexts?.[0];
  const findings: string[] = [];
  let stopped = false;
  for (const kind of GESTURE_KINDS) {
    if (stopped) break;
    const m = await h.create();
    try {
      await expectDropApplies(h, m, startGesture, kind);
      for (const leg of importedLegs(h)) {
        await importOrFail(m, leg.text, `importText(${leg.what}) rejected`);
        // the oracle comes from the modeler's OWN serializer: a non-canonical one fails L2
        const expected = exportOrFail(m, `after importing ${leg.what}`);
        await importOrFail(m, first, "importText(canonicalTexts[0]) rejected");
        await (h.settle ?? defaultSettle)();
        const outcome = await importDuringGesture(h, m, startGesture, kind, leg, expected);
        findings.push(...outcome.findings);
        stopped = outcome.stop === true;
        if (stopped) break;
      }
      if (!stopped && invalid !== undefined) {
        const outcome = await rejectionDuringGesture(h, m, startGesture, kind, invalid);
        findings.push(...outcome.findings);
        stopped = outcome.stop === true;
      }
    } finally {
      m.destroy();
    }
  }
  return outcomeOf(
    adviseOn(
      findings,
      "a running gesture met an import",
      "RECOMMENDED (L1, since 1.5): an accepted import first cancels a running gesture the way Escape does, with no change event and no exception, the release after the import included, nothing applied to an element the import removed, and interaction.active() false with one onChange(false) before importText resolves; a rejected import leaves the gesture running",
    ),
    [
      ...oneTextOnly(h, "an import during a gesture"),
      ...(h.invalidTexts === undefined
        ? [
            "invalidTexts is undefined — that a rejected import leaves a running gesture running was not checked (pass [] if the notation has no non-importable text)",
          ]
        : []),
    ],
  );
}

/** a document the drop case imports from the change listener of a drop */
interface DropLeg {
  what: string;
  /** the text, read inside the listener: an echo imports the drop's own document */
  text(m: CollaborativeModeler): string;
  /** the modeler's own export of that text, where the kit knows it before the drop */
  expected?: string;
}

/** how an import a listener called during the user's action came out */
interface ListenerImportResult {
  /** `exportText()` when its Promise resolved */
  exported?: string;
  rejected?: string;
  /** it had not settled within HELD_IMPORT_BOUND_MS */
  unsettled?: true;
}

/** the import's outcome, or `unsettled` once HELD_IMPORT_BOUND_MS have passed */
async function withinTheBound(
  result: Promise<ListenerImportResult>,
): Promise<ListenerImportResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      result,
      new Promise<ListenerImportResult>((resolve) => {
        timer = setTimeout(() => resolve({ unsettled: true }), HELD_IMPORT_BOUND_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** `exportText()`, or `undefined` where it throws: read in a Promise's callback, where a throw
 *  would reach no case */
function exportedNow(m: CollaborativeModeler): string | undefined {
  try {
    return m.exportText();
  } catch {
    return undefined;
  }
}

/** `importText(text)` from a listener, its outcome caught at once: a rejection nobody awaits yet
 *  would reach the window as an unhandled one */
function importFromAListener(
  m: CollaborativeModeler,
  text: string,
  onSettled: () => void = doNothing,
): Promise<ListenerImportResult> {
  return m.importText(text).then(
    () => {
      onSettled();
      return { exported: exportedNow(m) };
    },
    (e: unknown) => {
      onSettled();
      return { rejected: String(e) };
    },
  );
}

/** a move held on `canonicalTexts[0]` with a selection, dropped, and an import from its change listener */
async function importFromTheDrop(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  startGesture: GestureStarter,
  leg: DropLeg,
): Promise<LegFindings> {
  const settle = h.settle ?? defaultSettle;
  const during = `importing ${leg.what} from the change listener of a drop`;
  const findings: string[] = [];
  await importOrFail(m, h.canonicalTexts[0] ?? "", "importText(canonicalTexts[0]) rejected");
  // a selection from before the drag: diagram-js restores it once the move has run, on the
  // shapes it held, which an import from the listener removes (#248)
  const selected = m.elements?.list()[0]?.id;
  if (selected !== undefined) m.elements?.reveal(selected);
  await settle();
  let called:
    | {
        text: string;
        before: string;
        after: string;
        result: Promise<ListenerImportResult>;
      }
    | undefined;
  let settled = false;
  let changesAfterTheImport = 0;
  // the contract does not say that an unsubscribe may be called twice, so the case calls it once
  let unsubscribe: (() => void) | undefined = m.onContentChanged(() => {
    if (settled) changesAfterTheImport += 1;
    if (called !== undefined) return;
    const before = m.exportText();
    const text = leg.text(m);
    const result = importFromAListener(m, text, () => {
      settled = true;
    });
    called = { text, before, after: m.exportText(), result };
  });
  const errors = listenForWindowErrors();
  try {
    const held = await startGesture(m, "move");
    const thrown = await errorOf(() => held.drop());
    await settle();
    if (called === undefined) {
      fail(
        'the drop of a move gesture fired no onContentChanged — the case proves nothing (startGesture(modeler, "move") and drop() move an element through the modeler\'s own pointer handling)',
      );
    }
    const call = called;
    const result = await withinTheBound(call.result);
    await settle();
    if (thrown !== undefined) findings.push(`the drop threw ${thrown} while ${during}`);
    for (const error of errors.errors) {
      findings.push(`an error reached the window while ${during}: ${error}`);
    }
    if (result.unsettled) {
      findings.push(
        `${during} did not settle within ${HELD_IMPORT_BOUND_MS / 1000} s of the drop — it waits for something the drop never ends`,
      );
      return { findings, stop: true };
    }
    if (call.after !== call.before) {
      findings.push(
        `${during} replaced the document before the drop had ended (exportText() returned the imported document right after the call)`,
      );
    }
    const expected = leg.expected ?? call.text;
    if (result.rejected !== undefined) {
      findings.push(`${during} rejected: ${result.rejected}`);
    } else if (result.exported !== expected) {
      findings.push(
        `when the Promise of ${during} settled, exportText() did not return the imported document — the Promise settled before the import had run`,
      );
    }
    const out = exportOrFail(m, `once ${during} had settled`);
    if (result.exported === expected && out !== expected) {
      findings.push(`a step of the drop changed the document after ${during}`);
    }
    if (changesAfterTheImport > 0) {
      findings.push(`onContentChanged fired ${changesAfterTheImport}x once ${during} had settled`);
    }
    if (m.interaction?.active()) {
      findings.push(`interaction.active() was still true after the drop and ${during}`);
    }
    if (h.undo && result.rejected === undefined) {
      await h.undo(m);
      await settle();
      if (exportOrFail(m, `after an undo that followed ${during}`) !== out) {
        findings.push(
          `an undo after ${during} changed the document — the drop's command stayed on the fresh undo history (L4)`,
        );
      }
    }
    unsubscribe();
    unsubscribe = undefined;
    const before = exportOrFail(m, `before the next mutate after ${during}`);
    const next = await changeEvents(h, m, () => h.mutate(m));
    if (next.calls === 0 || exportOrFail(m, `after the next mutate after ${during}`) === before) {
      findings.push(`the next mutate after ${during} did not apply (wedged)`);
    }
  } finally {
    unsubscribe?.();
    errors.stop();
  }
  return { findings };
}

/**
 * the drop case: a host that imports from `onContentChanged` meets the drop of a move while the
 * drop still runs. Its import waits until the drop has ended (#248), and its Promise settles once
 * the import has run. 1.6 only RECOMMENDS it, so what the case finds is one advisory
 */
async function importWaitsForTheDrop(h: ConformanceHarness): Promise<CaseOutcome> {
  if (!h.startGesture) {
    return skip(
      "startGesture is undefined — that an import from the change listener of a drop waits until the drop has ended (RECOMMENDED since 1.6) was not checked",
    );
  }
  const startGesture = h.startGesture;
  const second = h.canonicalTexts[1];
  const findings: string[] = [];
  const m = await h.create();
  try {
    const legs: DropLeg[] = [];
    if (second !== undefined) {
      await importOrFail(m, second, "importText(canonicalTexts[1]) rejected");
      legs.push({
        what: "a different document (canonicalTexts[1])",
        text: () => second,
        expected: exportOrFail(m, "after importing canonicalTexts[1]"),
      });
    }
    legs.push({
      what: "the drop's own document (an echo)",
      text: (modeler) => modeler.exportText(),
    });
    for (const leg of legs) {
      const outcome = await importFromTheDrop(h, m, startGesture, leg);
      findings.push(...outcome.findings);
      if (outcome.stop) break;
    }
    return outcomeOf(
      adviseOn(
        findings,
        "an import met a running drop",
        "RECOMMENDED (since 1.6): an importText called during a running drop (from onContentChanged, a selection held from before the drag) waits until the drop has ended, so no step of the drop meets a replaced document, and its Promise settles once the import has run",
      ),
      [
        ...oneTextOnly(h, "an import from the change listener of a drop"),
        ...(m.elements
          ? []
          : [
              "the modeler exposes no elements surface (optional) — the drop ran without a selection from before the drag",
            ]),
      ],
    );
  } finally {
    m.destroy();
  }
}

/** what the user-action case reports without a DOM: its delete presses a key on the canvas */
const USER_ACTION_WITHOUT_DOM =
  "no DOM — a delete and the redo of a delete were not checked (both press Delete on the focused canvas: run the kit in a browser, the modeler mounted into attachedHost())";

/** what the user-action case could not check when it finds no canvas to press Delete on */
const NO_DELETE = "a delete and the redo of a delete were not checked";

/** Delete or Backspace on the canvas, as the keys case presses it */
function pressOn(canvas: Element, key: string): void {
  const view = canvas.ownerDocument.defaultView ?? window;
  const init = { key, code: key, bubbles: true, cancelable: true, composed: true };
  canvas.dispatchEvent(new view.KeyboardEvent("keydown", init));
  canvas.dispatchEvent(new view.KeyboardEvent("keyup", init));
}

/** the canvas focused, or why it would not take the focus */
function focusTheCanvas(canvas: Element): string | undefined {
  focusOn(canvas);
  return canvas.ownerDocument.activeElement === canvas
    ? undefined
    : `the canvas did not take the focus — ${NO_DELETE}`;
}

/** an unsubscribe that runs at most once: the contract does not say that a second call is harmless */
function once(unsubscribe: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    unsubscribe();
  };
}

/** what one leg of the user-action or the drag-start case found, and what it could not check */
interface ActionLegFindings extends LegFindings {
  unverified?: string;
}

/** a document a leg imports while the user's action runs, with the modeler's own export of it */
interface ImportedDocument extends ImportedLeg {
  expected: string;
}

/**
 * imports the document a leg imports later, for the oracle: the modeler's OWN export of it (a
 * non-canonical one fails L2). A session's own export is no oracle: a renderer may list an element
 * created in the session elsewhere than the export after importing that text does
 */
async function theDocumentToImport(
  h: ConformanceHarness,
  m: CollaborativeModeler,
): Promise<ImportedDocument> {
  const [leg = { text: h.canonicalTexts[0] ?? "", what: "canonicalTexts[0]" }] = importedLegs(h);
  await importOrFail(m, leg.text, `importText(${leg.what}) rejected`);
  return { ...leg, expected: exportOrFail(m, `after importing ${leg.what}`) };
}

/** a user's action, during which the selection listener imports a document */
interface ActionLeg {
  /** the action, as a finding names it */
  what: string;
  /** what the listener imports */
  imported: ImportedDocument;
  /** runs the action, whose synchronous part has run when it returns; `heard()` tells whether the
   *  selection listener has imported yet */
  act(heard: () => boolean): Promise<void> | void;
}

/** the next `mutate` changes the document, and an undo brings it back: no action left anything
 *  half done */
async function nextMutateApplies(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  after: string,
): Promise<string[]> {
  const settle = h.settle ?? defaultSettle;
  const before = exportedNow(m);
  if (before === undefined) return [`exportText() threw after ${after}`];
  let thrown: string | undefined;
  const next = await changeEvents(h, m, async () => {
    thrown = await errorOf(() => h.mutate(m));
  });
  if (thrown !== undefined) return [`the next mutate after ${after} threw ${thrown}`];
  if (next.calls === 0 || exportedNow(m) === before) {
    return [`the next mutate after ${after} did not apply (wedged)`];
  }
  const undo = h.undo;
  if (!undo) return [];
  const undoThrown = await errorOf(() => undo(m));
  await settle();
  if (undoThrown !== undefined) {
    return [`an undo of the next mutate after ${after} threw ${undoThrown}`];
  }
  return exportedNow(m) === before
    ? []
    : [`an undo of the next mutate after ${after} did not bring the document back (wedged)`];
}

/** an undo right after an import changes nothing (L4): what it found instead */
async function undoAfterTheImport(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  imported: string,
  after: string,
  what: string,
): Promise<string[]> {
  const undo = h.undo;
  if (!undo) return [];
  const thrown = await errorOf(() => undo(m));
  await (h.settle ?? defaultSettle)();
  if (thrown !== undefined) return [`an undo after ${after} threw ${thrown}`];
  return exportedNow(m) === imported
    ? []
    : [
        `an undo after ${after} changed the document — ${what} stayed on the fresh undo history (L4)`,
      ];
}

/**
 * `leg`'s action on the current document, while the selection listener imports `leg.imported` on
 * its first delivery: the export tells whether the import has run, and when
 */
async function importFromTheSelectionListener(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  elements: ElementsSurface,
  leg: ActionLeg,
): Promise<ActionLegFindings> {
  const settle = h.settle ?? defaultSettle;
  const { text, expected } = leg.imported;
  const during = `importing ${leg.imported.what} from the selection listener during ${leg.what}`;
  const findings: string[] = [];
  let result: Promise<ListenerImportResult> | undefined;
  let settled = false;
  let changesAfterTheImport = 0;
  const offSelection = once(
    elements.onSelection(() => {
      if (result !== undefined) return;
      result = importFromAListener(m, text, () => {
        settled = true;
      });
    }),
  );
  const offChanges = once(
    m.onContentChanged(() => {
      if (settled) changesAfterTheImport += 1;
    }),
  );
  const errors = listenForWindowErrors();
  try {
    let heardRightAfter = false;
    let exportRightAfter: string | undefined;
    const thrown = await errorOf(async () => {
      const acting = leg.act(() => result !== undefined);
      heardRightAfter = result !== undefined;
      exportRightAfter = exportedNow(m);
      await acting;
    });
    if (result === undefined) {
      return {
        findings,
        unverified: `the selection listener heard nothing during ${leg.what}${thrown === undefined ? "" : `, which threw ${thrown}`} — that an import from it waits until the action has finished was not checked`,
      };
    }
    const outcome = await withinTheBound(result);
    await settle();
    if (thrown !== undefined) {
      findings.push(
        `${leg.what} threw ${thrown} once its selection listener had called importText(${leg.imported.what})`,
      );
    }
    for (const error of errors.errors) {
      findings.push(`an error reached the window around ${during}: ${error}`);
    }
    if (outcome.unsettled) {
      findings.push(
        `${during} had not settled ${HELD_IMPORT_BOUND_MS / 1000} s later — it waits for something the action never ends`,
      );
      return { findings, stop: true };
    }
    // the listener heard the action while it ran, so an export that already shows the imported
    // document means the import ran inside it
    if (heardRightAfter && exportRightAfter === expected) {
      findings.push(
        `${during} ran before the action had finished (exportText() returned the imported document as soon as the action had returned)`,
      );
    }
    if (outcome.rejected !== undefined) {
      findings.push(`${during} rejected: ${outcome.rejected}`);
    } else if (outcome.exported !== expected) {
      findings.push(
        `when the Promise of ${during} settled, exportText() did not return the imported document — the Promise settled before the import had run, or the action went on and changed the imported document`,
      );
    }
    const out = exportedNow(m);
    if (out === undefined) {
      findings.push(`exportText() threw once ${during} had settled`);
      return { findings };
    }
    if (outcome.exported === expected && out !== expected) {
      findings.push(`a step of ${leg.what} changed the document after ${during}`);
    }
    if (changesAfterTheImport > 0) {
      findings.push(`onContentChanged fired ${changesAfterTheImport}x once ${during} had settled`);
    }
    offChanges();
    if (outcome.rejected === undefined) {
      findings.push(...(await undoAfterTheImport(h, m, out, during, "the action")));
    }
  } finally {
    offSelection();
    offChanges();
    errors.stop();
  }
  findings.push(...(await nextMutateApplies(h, m, during)));
  return { findings };
}

/** the revealed first element of `canonicalTexts[0]`, deleted with Delete on the focused canvas */
async function deleteOfASelectedElement(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  elements: ElementsSurface,
  canvas: Element,
): Promise<ActionLegFindings> {
  const settle = h.settle ?? defaultSettle;
  const imported = await theDocumentToImport(h, m);
  await importOrFail(m, h.canonicalTexts[0] ?? "", "importText(canonicalTexts[0]) rejected");
  await settle();
  const target = elements.list()[0]?.id;
  if (target === undefined) {
    return {
      findings: [],
      unverified: `elements.list() reports no element after importing canonicalTexts[0] — ${NO_DELETE}`,
    };
  }
  elements.reveal(target);
  await settle();
  const unfocused = focusTheCanvas(canvas);
  if (unfocused !== undefined) return { findings: [], unverified: unfocused };
  const before = exportOrFail(m, `with '${target}' revealed`);
  const outcome = await importFromTheSelectionListener(h, m, elements, {
    what: `a delete of the selected element '${target}' (Delete on the focused canvas)`,
    imported,
    act: (heard) => {
      pressOn(canvas, "Delete");
      if (!heard()) pressOn(canvas, "Backspace");
    },
  });
  if (outcome.unverified !== undefined && exportedNow(m) === before) {
    return {
      findings: outcome.findings,
      unverified: `Delete and Backspace on the focused canvas left the revealed element '${target}' in place — ${NO_DELETE}`,
    };
  }
  return outcome;
}

/** `mutate`'s new element, revealed, and the undo that removes it again */
async function undoOfASelectedCreate(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  elements: ElementsSurface,
  undo: NonNullable<ConformanceHarness["undo"]>,
): Promise<ActionLegFindings> {
  const settle = h.settle ?? defaultSettle;
  const imported = await theDocumentToImport(h, m);
  await importOrFail(m, h.canonicalTexts[0] ?? "", "importText(canonicalTexts[0]) rejected");
  await settle();
  const listed = new Set(elements.list().map((element) => element.id));
  await h.mutate(m);
  await settle();
  const created = elements.list().find((element) => !listed.has(element.id))?.id;
  if (created === undefined || !elements.reveal(created)) {
    return {
      findings: [],
      unverified:
        "elements.list() reports no new element after mutate that reveal() selects — an undo was not checked",
    };
  }
  await settle();
  return importFromTheSelectionListener(h, m, elements, {
    what: `an undo of the create of the selected element '${created}'`,
    imported,
    act: () => undo(m),
  });
}

/** the first element of `canonicalTexts[0]` deleted, its delete undone, the element revealed again
 *  and the delete redone */
async function redoOfADelete(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  elements: ElementsSurface,
  canvas: Element,
  undo: NonNullable<ConformanceHarness["undo"]>,
  redo: NonNullable<ConformanceHarness["redo"]>,
): Promise<ActionLegFindings> {
  const settle = h.settle ?? defaultSettle;
  const imported = await theDocumentToImport(h, m);
  await importOrFail(m, h.canonicalTexts[0] ?? "", "importText(canonicalTexts[0]) rejected");
  await settle();
  const target = elements.list()[0]?.id;
  if (target === undefined) {
    return {
      findings: [],
      unverified: `elements.list() reports no element after importing canonicalTexts[0] — ${NO_DELETE}`,
    };
  }
  elements.reveal(target);
  await settle();
  const unfocused = focusTheCanvas(canvas);
  if (unfocused !== undefined) return { findings: [], unverified: unfocused };
  const before = exportOrFail(m, `with '${target}' revealed`);
  for (const key of ["Delete", "Backspace"]) {
    pressOn(canvas, key);
    await settle();
    if (exportOrFail(m, `after ${key} on the focused canvas`) !== before) break;
  }
  if (exportOrFail(m, "after Delete and Backspace on the focused canvas") === before) {
    return {
      findings: [],
      unverified: `Delete and Backspace on the focused canvas left the revealed element '${target}' in place — ${NO_DELETE}`,
    };
  }
  await undo(m);
  await settle();
  // the element back under its id is all the redo needs: the contract leaves the undone document's
  // bytes to the modeler (an element may come back elsewhere in the text)
  if (!elements.reveal(target)) {
    return {
      findings: [],
      unverified: `an undo of the delete of '${target}' did not bring it back for reveal() — the redo of a delete was not checked`,
    };
  }
  await settle();
  return importFromTheSelectionListener(h, m, elements, {
    what: `a redo of the delete of the selected element '${target}'`,
    imported,
    act: () => redo(m),
  });
}

/**
 * two imports: the first from the change listener of `mutate`'s command (an echo of its document),
 * the second a microtask later, once the command has returned and while the first may still wait.
 * The second carries the document from before the command, so the export tells their order
 */
async function importsKeepTheirCallOrder(
  h: ConformanceHarness,
  m: CollaborativeModeler,
): Promise<ActionLegFindings> {
  const settle = h.settle ?? defaultSettle;
  await importOrFail(m, h.canonicalTexts[0] ?? "", "importText(canonicalTexts[0]) rejected");
  await settle();
  const text = exportOrFail(m, "before mutate");
  const during =
    "two imports, an echo from the change listener of mutate and the document from before it called once the command had returned";
  const findings: string[] = [];
  const settledInOrder: string[] = [];
  let echo: string | undefined;
  let first: Promise<ListenerImportResult> | undefined;
  let second: Promise<ListenerImportResult> | undefined;
  let settled = false;
  let changesAfterTheImports = 0;
  const offChanges = once(
    m.onContentChanged(() => {
      if (settled) changesAfterTheImports += 1;
      if (first !== undefined) return;
      echo = exportedNow(m);
      if (echo === undefined) return;
      first = importFromAListener(m, echo, () => settledInOrder.push("the echo"));
      void Promise.resolve().then(() => {
        second = importFromAListener(m, text, () =>
          settledInOrder.push("the document from before"),
        );
      });
    }),
  );
  const errors = listenForWindowErrors();
  try {
    const thrown = await errorOf(() => h.mutate(m));
    await settle();
    if (first === undefined || second === undefined) {
      return {
        findings,
        unverified:
          "mutate fired no onContentChanged that exportText() could follow — the call order of two imports was not checked",
      };
    }
    const both = await withinTheBound(
      Promise.all([first, second]).then(([a, b]) => ({ rejected: a.rejected ?? b.rejected })),
    );
    settled = true;
    await settle();
    if (thrown !== undefined) findings.push(`mutate threw ${thrown} during ${during}`);
    for (const error of errors.errors) {
      findings.push(`an error reached the window around ${during}: ${error}`);
    }
    if (both.unsettled) {
      findings.push(
        `${during} had not settled ${HELD_IMPORT_BOUND_MS / 1000} s later — they wait for something the command never ends`,
      );
      return { findings, stop: true };
    }
    if (both.rejected !== undefined) findings.push(`${during}: one rejected: ${both.rejected}`);
    if (!same(settledInOrder, ["the echo", "the document from before"])) {
      findings.push(
        `${during} settled in the order ${JSON.stringify(settledInOrder)}, not in the order they were called`,
      );
    }
    const out = exportedNow(m);
    if (out === undefined) {
      findings.push(`exportText() threw once ${during} had settled`);
      return { findings };
    }
    if (both.rejected === undefined && out !== text) {
      findings.push(
        out === echo
          ? `${during} did not keep their call order: the echo, called first, replaced the document called second`
          : `once ${during} had settled, exportText() did not return the document called second`,
      );
    }
    if (changesAfterTheImports > 0) {
      findings.push(`onContentChanged fired ${changesAfterTheImports}x once ${during} had settled`);
    }
    offChanges();
    if (both.rejected === undefined) {
      findings.push(...(await undoAfterTheImport(h, m, out, during, "the command")));
    }
  } finally {
    offChanges();
    errors.stop();
  }
  findings.push(...(await nextMutateApplies(h, m, during)));
  return { findings };
}

/**
 * the user-action case: a host that imports from a listener the user's action calls meets the
 * action while it runs. From the selection listener of a delete, an undo and a redo that remove a
 * selected element, the import waits until the command has finished, and so do two imports from the
 * change listener of a command, which keep their call order. 1.6 only RECOMMENDS it, so what the
 * case finds is one advisory
 */
async function importWaitsForTheUsersCommand(h: ConformanceHarness): Promise<CaseOutcome> {
  const findings: string[] = [];
  const unverified = oneTextOnly(h, "an import from the selection listener during a command");
  let stopped = false;
  /** each leg on an instance of its own: one whose import ran inside the action may be left broken */
  const onAFreshInstance = async (
    leg: (m: CollaborativeModeler, firstSerial: number) => Promise<ActionLegFindings>,
  ): Promise<void> => {
    if (stopped) return;
    const firstSerial = nextHostSerial;
    const m = await h.create();
    try {
      const outcome = await leg(m, firstSerial);
      findings.push(...outcome.findings);
      if (outcome.unverified !== undefined) unverified.push(outcome.unverified);
      stopped = outcome.stop === true;
    } finally {
      m.destroy();
    }
  };
  const noElements: ActionLegFindings = {
    findings: [],
    unverified:
      "the modeler exposes no elements surface (optional) — imports from the selection listener during a delete, an undo and a redo were not checked",
  };
  /** the leg with the modeler's elements and the canvas it takes its keys on */
  const onTheCanvas =
    (
      leg: (
        m: CollaborativeModeler,
        elements: ElementsSurface,
        canvas: Element,
      ) => Promise<ActionLegFindings>,
    ) =>
    async (m: CollaborativeModeler, firstSerial: number): Promise<ActionLegFindings> => {
      const elements = m.elements;
      if (!elements) return noElements;
      await importOrFail(m, h.canonicalTexts[0] ?? "", "importText(canonicalTexts[0]) rejected");
      const mount = mountedCanvas(h, m, "modeler", firstSerial, NO_DELETE);
      if (typeof mount === "string") return { findings: [], unverified: mount };
      return leg(m, elements, mount.canvas);
    };
  const { undo, redo } = h;
  const withoutDom = typeof document === "undefined";
  if (withoutDom) unverified.push(USER_ACTION_WITHOUT_DOM);
  else {
    await onAFreshInstance(
      onTheCanvas((m, elements, canvas) => deleteOfASelectedElement(h, m, elements, canvas)),
    );
  }
  if (undo) {
    await onAFreshInstance((m) =>
      m.elements ? undoOfASelectedCreate(h, m, m.elements, undo) : Promise.resolve(noElements),
    );
  } else {
    unverified.push("undo is undefined — an undo and the redo of a delete were not checked");
  }
  if (undo && redo && !withoutDom) {
    await onAFreshInstance(
      onTheCanvas((m, elements, canvas) => redoOfADelete(h, m, elements, canvas, undo, redo)),
    );
  } else if (undo && !redo) {
    unverified.push("redo is undefined — the redo of a delete was not checked");
  }
  await onAFreshInstance((m) => importsKeepTheirCallOrder(h, m));
  return outcomeOf(
    adviseOn(
      findings,
      "an import met the user's running command",
      "RECOMMENDED (since 1.6): an importText called during a running user action (from the selection listener of a delete, an undo or a redo, from the change listener of a command) waits until the action has finished and settles after that import, and imports keep their call order, also one called once the action has returned while an earlier one still waits",
    ),
    [...new Set(unverified)],
  );
}

/** the gestures whose start the drag-start case imports at: diagram-js activates a move once the
 *  press has passed the drag threshold, a palette create at once */
const DRAG_START_KINDS: readonly GestureKind[] = ["move", "create"];

/** a gesture started with a selection, while the selection listener imports when the start clears it */
async function importAtTheStart(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  elements: ElementsSurface,
  startGesture: GestureStarter,
  kind: GestureKind,
): Promise<ActionLegFindings> {
  const settle = h.settle ?? defaultSettle;
  const first = h.canonicalTexts[0] ?? "";
  const [leg] = importedLegs(h);
  if (leg === undefined) return { findings: [] };
  await importOrFail(m, leg.text, `importText(${leg.what}) rejected`);
  // the oracle comes from the modeler's OWN serializer: a non-canonical one fails L2
  const expected = exportOrFail(m, `after importing ${leg.what}`);
  await importOrFail(m, first, "importText(canonicalTexts[0]) rejected");
  await settle();
  // a selection the drag's start clears: diagram-js's Dragging.move empties it while it activates
  // the drag, and reads the drag again once the selection listeners have run (#336)
  const selected = elements.list()[0]?.id;
  if (selected === undefined || !elements.reveal(selected)) {
    return {
      findings: [],
      unverified: `elements.list() reports no element of canonicalTexts[0] that reveal() selects — an import at the start of a ${kind} was not checked`,
    };
  }
  await settle();
  const during = `importing ${leg.what} from the selection listener at the start of a ${kind}`;
  const findings: string[] = [];
  let result: Promise<ListenerImportResult> | undefined;
  let changes = 0;
  const offSelection = once(
    elements.onSelection(() => {
      if (result === undefined) result = importFromAListener(m, leg.text);
    }),
  );
  const offChanges = once(
    m.onContentChanged(() => {
      changes += 1;
    }),
  );
  const errors = listenForWindowErrors();
  try {
    let held: HeldGesture | undefined;
    const thrown = await errorOf(async () => {
      held = await startGesture(m, kind);
    });
    if (result === undefined) {
      if (held) await errorOf(() => held?.cancel());
      return {
        findings,
        unverified: `the selection listener heard nothing at the start of a ${kind} with '${selected}' revealed${thrown === undefined ? "" : `, and startGesture threw ${thrown}`} — an import at a drag's start was not checked`,
      };
    }
    const outcome = await withinTheBound(result);
    if (thrown !== undefined)
      findings.push(`the start of a ${kind} threw ${thrown} while ${during}`);
    if (outcome.unsettled) {
      findings.push(
        `${during} had not settled ${HELD_IMPORT_BOUND_MS / 1000} s later — the import waited for the drag to end instead of ending it once the drag had started`,
      );
      if (held) {
        const dropThrown = await errorOf(() => held?.drop());
        if (dropThrown !== undefined) findings.push(`the drop after ${during} threw ${dropThrown}`);
      }
      if ((await withinTheBound(result)).unsettled) {
        findings.push(
          `${during} had not settled ${HELD_IMPORT_BOUND_MS / 1000} s after the drop either`,
        );
      }
      return { findings, stop: true };
    }
    if (outcome.rejected !== undefined) {
      findings.push(`${during} rejected: ${outcome.rejected}`);
    } else if (outcome.exported !== expected) {
      findings.push(
        `when the Promise of ${during} settled, exportText() did not return the imported document`,
      );
    }
    if (m.interaction?.active()) {
      findings.push(
        `interaction.active() was still true once ${during} had settled — the import did not end the drag`,
      );
    }
    const beforeTheDrop = changes;
    if (beforeTheDrop > 0) {
      findings.push(
        `onContentChanged fired ${beforeTheDrop}x between the start of a ${kind} and its drop while ${during}`,
      );
    }
    if (held) {
      const dropThrown = await errorOf(() => held?.drop());
      if (dropThrown !== undefined) findings.push(`the drop after ${during} threw ${dropThrown}`);
    }
    await settle();
    const dropped = changes - beforeTheDrop;
    for (const error of errors.errors) {
      findings.push(`an error reached the window around ${during}: ${error}`);
    }
    const out = exportedNow(m);
    if (out === undefined) {
      findings.push(`exportText() threw after the drop that followed ${during}`);
      return { findings };
    }
    if (outcome.rejected === undefined && (dropped > 0 || out !== expected)) {
      findings.push(
        `the drop after ${during} applied the ${kind}${dropped > 0 ? ` (onContentChanged ${dropped}x)` : ""} — the import did not end the drag it met at its start`,
      );
    }
    offChanges();
    if (out === expected) {
      findings.push(...(await undoAfterTheImport(h, m, out, during, "the drag")));
    }
  } finally {
    offSelection();
    offChanges();
    errors.stop();
  }
  findings.push(...(await nextMutateApplies(h, m, during)));
  return { findings };
}

/**
 * the drag-start case: a host that imports from the selection listener meets the start of a drag,
 * which empties the selection while diagram-js activates the drag. The import waits until the drag
 * has started, then ends it as an accepted import ends any running gesture (#336). Per kind it first
 * proves that a drop applies; 1.6 only RECOMMENDS the rest, so what the case finds is one advisory
 */
async function importAtADragsStart(h: ConformanceHarness): Promise<CaseOutcome> {
  if (!h.startGesture) {
    return skip(
      "startGesture is undefined — that an import from the selection listener at a drag's start runs once the drag has started and then ends it (RECOMMENDED since 1.6) was not checked",
    );
  }
  const startGesture = h.startGesture;
  const findings: string[] = [];
  const unverified = oneTextOnly(h, "an import at a drag's start");
  for (const kind of DRAG_START_KINDS) {
    const m = await h.create();
    try {
      const elements = m.elements;
      if (!elements) {
        unverified.push(
          "the modeler exposes no elements surface (optional) — an import from the selection listener at a drag's start was not checked",
        );
        break;
      }
      await expectDropApplies(h, m, startGesture, kind);
      const outcome = await importAtTheStart(h, m, elements, startGesture, kind);
      findings.push(...outcome.findings);
      if (outcome.unverified !== undefined) unverified.push(outcome.unverified);
      if (outcome.stop) break;
    } finally {
      m.destroy();
    }
  }
  return outcomeOf(
    adviseOn(
      findings,
      "an import met the start of a drag",
      "RECOMMENDED (since 1.6): an importText called while a drag starts (from the selection listener diagram-js calls as it activates a move or a palette create) waits until the drag has started and then ends it as it ends any running gesture: nothing throws, the import applies and settles, interaction.active() is false, and the drop applies nothing",
    ),
    unverified,
  );
}

/**
 * the pan case: a pan held over an accepted import of another document and of the same one. The
 * pan is no gesture, and it runs on from the view the import left: the same document fits the same
 * view, so the pan's next step must bring the view where its first step had brought it. A change
 * event fails (L1, L3); the rest is one advisory, since 1.6 only RECOMMENDS it
 */
async function panRunsOnThroughAnImport(h: ConformanceHarness): Promise<CaseOutcome> {
  if (!h.startPan) {
    return skip(
      "startPan is undefined — that a pan is no gesture and runs on through an import (RECOMMENDED since 1.6) was not checked",
    );
  }
  const startPan = h.startPan;
  const settle = h.settle ?? defaultSettle;
  const first = h.canonicalTexts[0] ?? "";
  const findings: string[] = [];
  const m = await h.create();
  try {
    for (const leg of importedLegs(h)) {
      await importOrFail(m, leg.text, `importText(${leg.what}) rejected`);
      const expected = exportOrFail(m, `after importing ${leg.what}`);
      await importOrFail(m, first, "importText(canonicalTexts[0]) rejected");
      await settle();
      const atRest = m.getViewState();
      const watch = watchInteraction(m);
      const errors = listenForWindowErrors();
      try {
        const pan = await startPan(m);
        const panned = m.getViewState();
        if (closeTo(panned, atRest)) {
          fail(
            "startPan left the view as the import had fitted it — the case proves nothing (startPan presses on the canvas and moves past the drag threshold, so the view pans)",
          );
        }
        let activeDuringPan = m.interaction?.active() === true;
        const { calls, importing, outcome } = await importWhileHeld(h, m, leg.text);
        if (calls > 0) {
          fail(
            `importing ${leg.what} during a pan fired onContentChanged ${calls}x — an import is silent (L1; if every import emits, see the L1 cases first)`,
          );
        }
        if (outcome.unsettled) {
          findings.push(
            `importing ${leg.what} during a pan had not settled ${HELD_IMPORT_BOUND_MS / 1000} s later — the import waited for the pan to end instead of leaving it running`,
          );
          await errorOf(() => pan.drop());
          const released = await settledWithin(importing, HELD_IMPORT_BOUND_MS);
          if (released.unsettled) {
            findings.push(
              `importing ${leg.what} during a pan had not settled ${HELD_IMPORT_BOUND_MS / 1000} s after the pan's release either`,
            );
          } else if (released.rejected !== undefined) {
            fail(`importText(${leg.what}) rejected during a pan: ${released.rejected}`);
          }
          break;
        }
        if (outcome.rejected !== undefined) {
          fail(`importText(${leg.what}) rejected during a pan: ${outcome.rejected}`);
        }
        const imported = m.getViewState();
        const moveThrown = await errorOf(() => pan.move());
        const after = m.getViewState();
        activeDuringPan ||= m.interaction?.active() === true;
        if (closeTo(after, imported)) {
          findings.push(
            `a pan stopped when ${leg.what} was imported during it (its next step left the view where the import had put it)`,
          );
        } else if (closeTo(imported, atRest) && !closeTo(after, panned)) {
          findings.push(
            `a pan's next step after ${leg.what} was imported during it did not go on from the view the import left: it put the view where the pan would have brought the view from before the import`,
          );
        }
        if (moveThrown !== undefined) {
          findings.push(`a pan's next step after an import of ${leg.what} threw ${moveThrown}`);
        }
        let dropThrown: string | undefined;
        const dropped = await changeEvents(h, m, async () => {
          dropThrown = await errorOf(() => pan.drop());
        });
        if (dropped.calls > 0) {
          fail(
            `releasing a pan fired onContentChanged ${dropped.calls}x — a pan changes the view, never the document (L3)`,
          );
        }
        if (dropThrown !== undefined) {
          findings.push(`releasing a pan after an import of ${leg.what} threw ${dropThrown}`);
        }
        for (const error of errors.errors) {
          findings.push(
            `an error reached the window during a pan over an import of ${leg.what}: ${error}`,
          );
        }
        if (activeDuringPan) findings.push("interaction.active() was true during a pan");
        else if (watch && watch.delivered.length > 0) {
          findings.push(
            `interaction.onChange delivered ${JSON.stringify(watch.delivered)} during a pan`,
          );
        }
        if (exportOrFail(m, `after a pan over an import of ${leg.what}`) !== expected) {
          findings.push(`a pan over an import of ${leg.what} changed the document`);
        }
        const before = exportOrFail(m, "before the next mutate after a pan");
        const next = await changeEvents(h, m, () => h.mutate(m));
        if (next.calls === 0 || exportOrFail(m, "after the next mutate after a pan") === before) {
          findings.push(
            `the next mutate after a pan over an import of ${leg.what} did not apply (wedged)`,
          );
        }
      } finally {
        errors.stop();
        watch?.stop();
      }
    }
  } finally {
    m.destroy();
  }
  return outcomeOf(
    adviseOn(
      findings,
      "a pan met an import",
      "RECOMMENDED (since 1.6): a pan is no gesture (interaction.active() stays false and onChange is not called), and an import leaves it running: it goes on from the current view (the one the import left, or one the host sets after it) and never puts a view from before back",
    ),
    oneTextOnly(h, "an import during a pan"),
  );
}

/**
 * the interaction case: `active()` and `onChange` follow every kind of gesture to its drop and to
 * its cancel, stay quiet for an armed tool, stop after the unsubscribe and after `destroy()`, and
 * the viewer reports no gesture. Every rule is stated by the contract, so each one fails
 */
async function interactionFollowsGestures(h: ConformanceHarness): Promise<CaseOutcome | void> {
  const settle = h.settle ?? defaultSettle;
  const first = h.canonicalTexts[0] ?? "";
  const others: CollaborativeModeler[] = [];
  const m = await h.create();
  try {
    const interaction = m.interaction;
    if (!interaction) {
      return skip("the modeler exposes no interaction surface (optional, 1.5) — nothing to verify");
    }
    if (!h.startGesture) {
      return skip(
        "startGesture is undefined — that interaction.active() follows every gesture was not verified",
      );
    }
    const startGesture = h.startGesture;
    if (interaction.active()) fail("interaction.active() is true before the first import");
    await importOrFail(m, first, "importText(canonicalTexts[0]) rejected");
    await settle();
    if (interaction.active()) fail("interaction.active() is true at rest after an import");
    const watch = watchInteraction(m);
    if (!watch) fail("the interaction surface went away");
    for (const kind of GESTURE_KINDS) {
      for (const end of ["drop", "cancel"] as const) {
        await importOrFail(m, first, "importText(canonicalTexts[0]) rejected");
        await settle();
        const mark = watch.delivered.length;
        const since = (): string => JSON.stringify(watch.delivered.slice(mark));
        const held = await startGesture(m, kind);
        if (!interaction.active()) {
          fail(`interaction.active() is false while a ${kind} gesture is held`);
        }
        if (since() !== "[true]") {
          fail(
            `interaction.onChange delivered ${since()} when a ${kind} gesture started — once true`,
          );
        }
        await held[end]();
        if (interaction.active()) {
          fail(`interaction.active() is still true after the ${end} of a ${kind} gesture`);
        }
        await settle();
        if (since() !== "[true,false]") {
          fail(
            `interaction.onChange delivered ${since()} from the start of a ${kind} gesture to its ${end} — once true, then once false`,
          );
        }
      }
    }
    if (watch.mismatches > 0) {
      fail(
        `inside an interaction.onChange listener active() returned another value than the listener got (${watch.mismatches}x) — it already returns the new value there`,
      );
    }
    const late: boolean[] = [];
    const unsubscribe = interaction.onChange((active) => late.push(active));
    unsubscribe();
    await importOrFail(m, first, "importText(canonicalTexts[0]) rejected");
    const held = await startGesture(m, "move");
    await held.cancel();
    await settle();
    if (late.length > 0) fail("interaction.onChange delivered after its unsubscribe");
    const unverified: string[] = [];
    if (h.armTool) {
      await importOrFail(m, first, "importText(canonicalTexts[0]) rejected");
      await settle();
      const mark = watch.delivered.length;
      await h.armTool(m);
      await settle();
      if (interaction.active() || watch.delivered.length > mark) {
        fail(
          `a palette tool that is only armed counted as a gesture (active() ${String(interaction.active())}, onChange delivered ${JSON.stringify(watch.delivered.slice(mark))}) — no gesture runs until its press`,
        );
      }
      await importOrFail(m, first, "importText(canonicalTexts[0]) rejected with a tool armed");
      await settle();
      if (interaction.active() || watch.delivered.length > mark) {
        fail(
          `an import with a palette tool armed changed interaction (active() ${String(interaction.active())}, onChange delivered ${JSON.stringify(watch.delivered.slice(mark))})`,
        );
      }
    } else {
      unverified.push(
        "armTool is undefined — that a palette tool that is only armed is no gesture was not verified",
      );
    }
    const destroyed = await h.create();
    let afterDestroy: InteractionWatch | undefined;
    let mark = 0;
    try {
      await importOrFail(destroyed, first, "importText(canonicalTexts[0]) rejected");
      afterDestroy = watchInteraction(destroyed);
      await startGesture(destroyed, "move");
      mark = afterDestroy?.delivered.length ?? 0;
    } finally {
      destroyed.destroy();
    }
    await settle();
    if (afterDestroy && afterDestroy.delivered.length > mark) {
      fail(
        `interaction.onChange delivered ${JSON.stringify(afterDestroy.delivered.slice(mark))} after destroy() — nothing is called after destroy()`,
      );
    }
    if (h.createReadonly) {
      const viewer = await h.createReadonly();
      others.push(viewer);
      if (viewer.interaction?.active()) {
        fail("the viewer's interaction.active() is true before the first import");
      }
      await importOrFail(viewer, first, "the viewer rejected canonicalTexts[0]");
      if (viewer.interaction?.active()) {
        fail(
          "the viewer's interaction.active() is true after an import — a viewer has no editing gesture",
        );
      }
    }
    if (unverified.length > 0) return skip(unverified.join("; "));
  } finally {
    m.destroy();
    for (const other of others) other.destroy();
  }
}

const KNOWN_THEMES: readonly AppearanceTheme[] = ["light", "dark"];

/** a theme and a contrast no modeler knows, as an untyped host may send them */
const UNKNOWN_THEME = "sepia" as AppearanceTheme;
const UNKNOWN_CONTRAST = "maximal" as AppearanceRequest["contrast"];

/** `appearance.themes`, checked: non-empty, without duplicates, only "light" and "dark" */
function themesOf(appearance: AppearanceSurface, who: string): AppearanceTheme[] {
  const themes: unknown = appearance.themes;
  if (!Array.isArray(themes) || themes.length === 0) {
    fail(
      `${who}appearance.themes is ${JSON.stringify(themes)} — the themes the modeler can draw, a non-empty list`,
    );
  }
  if (new Set(themes).size !== themes.length) {
    fail(`${who}appearance.themes lists a theme twice: ${JSON.stringify(themes)}`);
  }
  const unknown = themes.filter((theme) => !KNOWN_THEMES.includes(theme as AppearanceTheme));
  if (unknown.length > 0) {
    fail(`${who}appearance.themes lists ${JSON.stringify(unknown)} — a theme is "light" or "dark"`);
  }
  return [...(themes as AppearanceTheme[])];
}

const describeRequest = (request: AppearanceRequest): string => {
  const contrast = request.contrast === undefined ? "" : `, contrast: "${request.contrast}"`;
  return `appearance.set({ theme: "${request.theme}"${contrast} })`;
};

/** the properties of an element's computed style that hold a colour */
const COLOUR_PROPERTIES = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "fill",
  "stroke",
  "stop-color",
  "flood-color",
  "box-shadow",
] as const;

interface PaintedElement {
  element: Element;
  colours: string[];
}

/** every element in the host with its computed colours, once the colour transitions have run */
function paintedIn(host: HTMLElement): PaintedElement[] {
  // a transition shows the colour it starts from until it has run: a request draws its end
  const animations =
    typeof host.getAnimations === "function" ? host.getAnimations({ subtree: true }) : [];
  for (const animation of animations) {
    if ("transitionProperty" in animation) animation.finish();
  }
  const view = host.ownerDocument.defaultView ?? window;
  return [...host.querySelectorAll("*")].map((element) => {
    const style = view.getComputedStyle(element);
    return {
      element,
      colours: COLOUR_PROPERTIES.map((property) => style.getPropertyValue(property)),
    };
  });
}

const describeElement = (element: Element): string => {
  const classes = (element.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter((name) => name !== "")
    .slice(0, 3)
    .map((name) => `.${name}`)
    .join("");
  return `<${element.tagName.toLowerCase()}>${classes}`;
};

/** where two paintings of the host differ, or `undefined` */
function colourDifference(
  reference: PaintedElement[],
  painted: PaintedElement[],
): string | undefined {
  if (reference.length !== painted.length) {
    return `the host holds ${painted.length} elements, ${reference.length} in the reference`;
  }
  for (const [index, { element, colours }] of painted.entries()) {
    const expected = reference[index]?.colours ?? [];
    for (const [position, property] of COLOUR_PROPERTIES.entries()) {
      if (colours[position] !== expected[position]) {
        return `${describeElement(element)} has ${property} ${colours[position]}, the reference ${expected[position]}`;
      }
    }
  }
  return undefined;
}

/** the attachedHost() a modeler made since `firstSerial` lies in, or why the kit cannot tell */
function hostOfTheModeler(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  firstSerial: number,
): HTMLElement | string {
  const live = attachedHosts.filter((entry) => entry.wrapper.isConnected);
  if (h.canvasElement) {
    const named = h.canvasElement(m);
    const mount = named ? live.find((entry) => entry.host.contains(named)) : undefined;
    return (
      mount?.host ??
      "the canvas canvasElement() names lies in no attachedHost() — the computed colours were not compared"
    );
  }
  const made = live.filter(
    (entry) => entry.serial >= firstSerial && entry.host.childElementCount > 0,
  );
  const [mount] = made;
  if (mount && made.length === 1) return mount.host;
  return made.length === 0
    ? "create() mounted the modeler into no attachedHost() — the computed colours were not compared (mount into attachedHost())"
    : `create() filled ${made.length} attachedHost() elements — the kit cannot tell which one holds the modeler, so the computed colours were not compared`;
}

/** puts `<html>` into a mode the way a host page does; `null` removes the attribute */
function pageMode(theme: string | null, contrast: string | null): void {
  const root = document.documentElement;
  for (const [name, value] of [
    ["data-cd-theme", theme],
    ["data-cd-kontrast", contrast],
  ] as const) {
    if (value === null) root.removeAttribute(name);
    else root.setAttribute(name, value);
  }
}

/**
 * the appearance case's DOM half: the computed colours of everything in the modeler's
 * attachedHost(). The reference is a request for `themes[0]` on a page without `data-cd-theme`,
 * once per contrast; a request for a theme `themes` does not list, on a page in the other mode with
 * high contrast, must draw the reference of its contrast, also after a re-import. A listed theme
 * other than `themes[0]` must draw something else. Returns why the colours were not compared
 */
async function coloursFollowTheRequest(
  h: ConformanceHarness,
  themes: AppearanceTheme[],
): Promise<string | undefined> {
  if (typeof document === "undefined") {
    return "no DOM — the computed colours were not compared (run the kit in a browser, the modeler mounted into attachedHost())";
  }
  const root = document.documentElement;
  const page = {
    theme: root.getAttribute("data-cd-theme"),
    contrast: root.getAttribute("data-cd-kontrast"),
  };
  const firstSerial = nextHostSerial;
  const m = await h.create();
  try {
    const appearance = m.appearance;
    if (!appearance) fail("the appearance surface went away on a second instance");
    const host = hostOfTheModeler(h, m, firstSerial);
    if (typeof host === "string") return host;
    const [lead = "light"] = themes;
    const other: AppearanceTheme = lead === "light" ? "dark" : "light";
    const first = h.canonicalTexts[0] ?? "";
    pageMode(null, null);
    await importOrFail(m, first, "importText(canonicalTexts[0]) rejected");
    await (h.settle ?? defaultSettle)();
    const paintedFor = (contrast: "normal" | "high"): PaintedElement[] => {
      appearance.set({ theme: lead, contrast });
      return paintedIn(host);
    };
    const reference = { normal: paintedFor("normal"), high: paintedFor("high") };
    const expectReference = (contrast: "normal" | "high", when: string): void => {
      const difference = colourDifference(reference[contrast], paintedIn(host));
      if (difference !== undefined) {
        fail(
          `${when}, the modeler drew other colours than for ${describeRequest({ theme: lead, contrast })} on a page without data-cd-theme: ${difference} — a theme themes does not list draws themes[0], and the request's contrast holds, whatever mode the page shows`,
        );
      }
    };
    pageMode(other, "hoch");
    const onThePage = `on a page in the other mode (data-cd-theme="${other}" and data-cd-kontrast="hoch" on <html>)`;
    const unlisted = [...KNOWN_THEMES.filter((theme) => !themes.includes(theme)), UNKNOWN_THEME];
    for (const theme of unlisted) {
      for (const contrast of ["normal", "high"] as const) {
        const request = { theme, contrast };
        appearance.set(request);
        expectReference(contrast, `after ${describeRequest(request)} ${onThePage}`);
      }
    }
    // a re-import draws the canvas anew, so the reference for it is drawn again afterwards, on
    // the same elements
    for (const contrast of ["normal", "high"] as const) {
      const request = { theme: unlisted[0] ?? UNKNOWN_THEME, contrast };
      pageMode(other, "hoch");
      appearance.set(request);
      await importOrFail(m, first, "re-importing canonicalTexts[0] rejected");
      await (h.settle ?? defaultSettle)();
      const reimported = paintedIn(host);
      pageMode(null, null);
      appearance.set({ theme: lead, contrast });
      const difference = colourDifference(paintedIn(host), reimported);
      if (difference !== undefined) {
        fail(
          `after ${describeRequest(request)} and a re-import ${onThePage}, the modeler drew other colours than for ${describeRequest({ theme: lead, contrast })} on a page without data-cd-theme: ${difference} — a request holds across every later import`,
        );
      }
    }
    pageMode(null, null);
    for (const theme of themes.filter((listed) => listed !== lead)) {
      const doc = exportOrFail(m, "before a request for a listed theme");
      const image = h.exportImage ? await h.exportImage(m) : undefined;
      // the re-imports above drew the canvas anew, so its light reference is drawn again first
      const leadOnThisCanvas = paintedFor("normal");
      appearance.set({ theme, contrast: "normal" });
      if (colourDifference(leadOnThisCanvas, paintedIn(host)) === undefined) {
        fail(
          `appearance.themes lists "${theme}", but ${describeRequest({ theme })} drew the colours of "${lead}" — a modeler draws every theme it lists`,
        );
      }
      if (exportOrFail(m, `after ${describeRequest({ theme })}`) !== doc) {
        fail(`${describeRequest({ theme })} changed exportText() — exports are always light`);
      }
      if (h.exportImage && (await h.exportImage(m)) !== image) {
        fail(`${describeRequest({ theme })} changed the image export — exports are always light`);
      }
    }
    return undefined;
  } finally {
    pageMode(page.theme, page.contrast);
    m.destroy();
  }
}

/** the appearance case's interaction half: a request over an open interaction commits nothing */
async function appearanceOverAnInteraction(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  appearance: AppearanceSurface,
  themes: AppearanceTheme[],
): Promise<string | undefined> {
  const openInteraction = h.openInteraction;
  if (!openInteraction) return undefined;
  const settle = h.settle ?? defaultSettle;
  const first = h.canonicalTexts[0] ?? "";
  const request: AppearanceRequest = { theme: themes[0] ?? "light", contrast: "high" };
  await importOrFail(m, first, "re-importing canonicalTexts[0] rejected");
  appearance.set({ theme: request.theme, contrast: "normal" });
  const doc = exportOrFail(m, "after importing canonicalTexts[0]");
  let committed: string | undefined;
  if (h.commitInteraction) {
    await openInteraction(m);
    await settle();
    await h.commitInteraction(m);
    await settle();
    committed = exportOrFail(m, "after committing the interaction");
    await importOrFail(m, first, "re-importing canonicalTexts[0] after the commit rejected");
  }
  await openInteraction(m);
  await settle();
  const opened = h.interactionState?.(m);
  const { calls } = await changeEvents(h, m, () => appearance.set(request));
  if (
    calls > 0 ||
    exportOrFail(m, `after ${describeRequest(request)} over an open interaction`) !== doc
  ) {
    fail(
      `${describeRequest(request)} over an open interaction committed it${calls > 0 ? ` (onContentChanged ${calls}x)` : ""} — like a host's view change, a request never commits an interaction in progress`,
    );
  }
  const after = h.interactionState?.(m);
  if (
    opened !== undefined &&
    (after?.elementId !== opened.elementId || after?.text !== opened.text)
  ) {
    const what = after === undefined ? "closed it" : `left ${JSON.stringify(after)} open`;
    return `an interaction on '${opened.elementId}' did not survive ${describeRequest(request)} (the request ${what}) — RECOMMENDED: keep it open with its typed input, so the user's commit afterwards writes what it would have written without the request`;
  }
  if (h.commitInteraction && committed !== undefined && committed !== doc) {
    await h.commitInteraction(m);
    await settle();
    const out = exportOrFail(
      m,
      `after committing the interaction after ${describeRequest(request)}`,
    );
    if (out !== committed) {
      return `committing an interaction after ${describeRequest(request)} wrote another document than committing it without one — RECOMMENDED: keep it open with its typed input across a request:\n--- committed without a request\n${committed}\n--- committed after the request\n${out}`;
    }
  }
  return undefined;
}

/**
 * the appearance case: `themes` is a fixed, valid list on every instance and the viewer, and every
 * request (light, dark, high contrast, a theme and a contrast no modeler knows) is view state: no
 * throw, no change event, both exports, the view, the selection and the undo history as they were.
 * In a DOM the computed colours follow the request, not the page (coloursFollowTheRequest). Every
 * rule but the keep-open of an interaction is stated by the contract, so each one fails
 */
async function appearanceIsViewState(h: ConformanceHarness): Promise<CaseOutcome> {
  const settle = h.settle ?? defaultSettle;
  const first = h.canonicalTexts[0] ?? "";
  const others: CollaborativeModeler[] = [];
  const m = await h.create();
  try {
    const appearance = m.appearance;
    if (!appearance) {
      return skip("the modeler exposes no appearance surface (optional, 1.5) — nothing to verify");
    }
    const themes = themesOf(appearance, "");
    if (!same(themesOf(appearance, "a second read of "), themes)) {
      fail("appearance.themes changed between two reads — it is fixed before the modeler runs");
    }
    const unverified: string[] = [];
    const another = await h.create();
    others.push(another);
    if (!another.appearance || !same(themesOf(another.appearance, "another instance's "), themes)) {
      fail(
        "another instance of the modeler reports other appearance.themes — they are the same on every instance",
      );
    }
    if (h.createReadonly) {
      const viewer = await h.createReadonly();
      others.push(viewer);
      if (viewer.appearance) {
        if (!same(themesOf(viewer.appearance, "the viewer's "), themes)) {
          fail(
            "the viewer reports other appearance.themes than the modeler — they are the same on the viewer",
          );
        }
      } else {
        unverified.push("the viewer exposes no appearance surface — its themes were not compared");
      }
    } else {
      unverified.push("createReadonly is undefined — the viewer's themes were not compared");
    }
    const lead = themes[0] ?? "light";
    const beforeImport = await errorOf(() => appearance.set({ theme: lead }));
    if (beforeImport !== undefined) {
      fail(`${describeRequest({ theme: lead })} threw before the first import: ${beforeImport}`);
    }
    await importOrFail(m, first, "importText(canonicalTexts[0]) rejected");
    const imported = exportOrFail(m, "after importing canonicalTexts[0]");
    await h.mutate(m);
    await settle();
    const revealed = m.elements?.list()[0]?.id;
    if (revealed !== undefined) m.elements?.reveal(revealed);
    if (h.viewState !== undefined) m.setViewState(h.viewState);
    await settle();
    const doc = exportOrFail(m, "after a user mutation");
    const image = h.exportImage ? await h.exportImage(m) : undefined;
    const view = m.getViewState();
    const selection = selectionOf(m);
    const requests: AppearanceRequest[] = [
      { theme: "light" },
      { theme: "dark" },
      { theme: "light", contrast: "high" },
      { theme: "dark", contrast: "high" },
      { theme: UNKNOWN_THEME },
      { theme: lead, contrast: UNKNOWN_CONTRAST },
      { theme: lead, contrast: "normal" },
    ];
    for (const request of requests) {
      const what = describeRequest(request);
      let thrown: string | undefined;
      const { calls } = await changeEvents(h, m, async () => {
        thrown = await errorOf(() => appearance.set(request));
      });
      if (thrown !== undefined) fail(`${what} threw: ${thrown} — set never throws`);
      if (calls > 0) {
        fail(
          `${what} fired onContentChanged ${calls}x — the appearance is view state, never document (L3)`,
        );
      }
      if (exportOrFail(m, `after ${what}`) !== doc) fail(`${what} changed exportText()`);
      if (h.exportImage && (await h.exportImage(m)) !== image) {
        fail(
          `${what} changed the image export — exports are always light, whatever the modeler draws`,
        );
      }
      if (!same(m.getViewState(), view)) fail(`${what} changed the view state`);
      if (selectionOf(m) !== selection) fail(`${what} changed the selection`);
    }
    if (h.undo) {
      await h.undo(m);
      await settle();
      if (exportOrFail(m, "after an undo that followed the requests") !== imported) {
        fail(
          "an undo after the appearance requests did not undo the user mutation before them — the requests changed the undo history",
        );
      }
    }
    if (!h.exportImage) {
      unverified.push(
        "exportImage is undefined — that the image export stays byte-identical was not verified",
      );
    }
    const advice = await appearanceOverAnInteraction(h, m, appearance, themes);
    if (!h.openInteraction) {
      unverified.push(
        "openInteraction is undefined — that a request never commits an open interaction was not verified",
      );
    }
    const colourGap = await coloursFollowTheRequest(h, themes);
    if (colourGap !== undefined) unverified.push(colourGap);
    return outcomeOf(advice === undefined ? {} : { advisories: [advice] }, unverified);
  } finally {
    m.destroy();
    for (const other of others) other.destroy();
  }
}

export interface RegisterOptions {
  /** how a SKIPPED case is reported — a law the kit could not (fully) verify
   *  because the harness left its field undefined. Default: console.warn */
  onSkip?: (caseName: string, reason: string) => void;
  /** how an ADVISORY is reported — a RECOMMENDED behaviour the modeler does
   *  not show; the case still passes. Called once per advice. Default:
   *  console.warn */
  onAdvisory?: (caseName: string, advice: string) => void;
}

/**
 * bind every case to a (name, fn) test runner — node:test, vitest, jest —
 * that runs them one after another: the keys case moves the focus and
 * dispatches keys in the one document every mounted instance listens to, so
 * a case running beside it would see its keys or lose its focus. A case's
 * advisories are reported before its skip, so an `onSkip` that throws does
 * not hide them
 */
export function registerConformance(
  harness: ConformanceHarness,
  test: (name: string, fn: () => Promise<void>) => unknown,
  options: RegisterOptions = {},
): void {
  const onSkip =
    options.onSkip ??
    ((name: string, reason: string) => {
      console.warn(`modeler-api conformance: SKIPPED "${name}" — ${reason}`);
    });
  const onAdvisory =
    options.onAdvisory ??
    ((name: string, advice: string) => {
      console.warn(`modeler-api conformance: ADVISORY "${name}" — ${advice}`);
    });
  for (const conformanceCase of conformanceCases()) {
    test(`conformance: ${conformanceCase.name}`, async () => {
      const outcome = await conformanceCase.run(harness);
      for (const advice of outcome?.advisories ?? []) onAdvisory(conformanceCase.name, advice);
      if (outcome?.skipped) onSkip(conformanceCase.name, outcome.skipped);
    });
  }
}
