import type { CollaborativeModeler } from "../index.js";

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
  /**
   * a fresh READ-ONLY instance (`meta.editable === false`) — the viewer
   * mount hosts use on read-only surfaces; absent = the package ships no
   * viewer and the viewer case is reported as skipped. The keys case aims
   * its keys at the viewer too: mount it as `create()` does
   */
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
  /**
   * importable but non-canonical inputs (hand-authored variants); the kit
   * verifies canonicalization is IDEMPOTENT on them, not byte-stable.
   * `undefined` = skipped; `[]` = the notation has no loose form
   */
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
  /**
   * wait until deferred/debounced change events have been delivered —
   * MUST outlast the modeler's event debounce; defaults to one macrotask
   */
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
   * modeler's choice. The user-action case calls an import as soon as it
   * returns, while one from the command's change listener waits: run the
   * command before the first `await`, as the user's input does
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
  /**
   * trigger the modeler's undo; `undefined` = the notation has no undo
   * (the undo cases, and the undo and the redo of the user-action case, are
   * reported as skipped)
   */
  undo?(modeler: CollaborativeModeler): Promise<void> | void;
  /**
   * trigger the modeler's redo; `undefined` with `undo` defined = the redo
   * half of the undo/redo case and the redo of the user-action case are
   * reported as skipped
   */
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
   * selection. The destroy case and the interaction case destroy the modeler from a listener while
   * the gesture starts (and then call neither `drop()` nor `cancel()`), and the destroy case also
   * from a listener inside `drop()` (the drop's change event), inside `cancel()` (the end that
   * Escape reports) and inside an `importText` that ends a held `"move"` (its end, which the
   * import's cancel reports): once the pointer or key events that start, drop or cancel the
   * gesture have run, read nothing of the modeler after an `await` (the teardown may run once their
   * handler has returned). `undefined` = the L1 gesture case, the drop case, the drag-start case,
   * the interaction case and the destroy case's legs at the user's input and inside an import are
   * reported as skipped (its leg inside `reveal()` still runs)
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
   * current view (the one an import left, or the one the host restores after it) from one that puts
   * a view from before back. `undefined` = the pan case is reported as skipped
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
   * cases rely on that to see whether an import left the gesture running. The destroy case
   * destroys the modeler from the drop's change listener: once the event that drops has run, read
   * nothing of the modeler after an `await`
   */
  drop(): Promise<void> | void;
  /**
   * cancel it the way the user does (Escape). The destroy case destroys the modeler from the
   * listener of the end that Escape reports: once the key event has run, read nothing of the
   * modeler after an `await`
   */
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
  /**
   * the case could not (fully) verify its law — the harness left the field
   * it needs undefined, or the modeler has no such optional surface; the
   * reason names which
   */
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

export let nextHostSerial = 0;

/**
 * the hosts attachedHost() made that are still in the document: the keys case finds the canvas of
 * the modeler `create()` mounted there, and hides or disables the host the way a host page does
 */
export let attachedHosts: AttachedHost[] = [];

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
