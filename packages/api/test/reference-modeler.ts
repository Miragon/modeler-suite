/**
 * A minimal CONFORMING modeler over a toy "lines" notation (document = an
 * optional `title: …` line, then lines; canonical = title first, lines sorted,
 * trailing newline). Each line is an element whose id is the line's text,
 * unless the line names another one with a ` #id` suffix — the serializer
 * writes that suffix back whenever an element's id differs from its text (a
 * renamed element keeps its id). Element n sits in row n of the canvas; a
 * moved one carries its offset from there as an ` @x,y` suffix. Mounted with
 * `attachTo`, it draws a focusable `<svg>` canvas in a container of its own,
 * as diagram-js does; its keys (Delete and Backspace remove the selection,
 * Cmd/Ctrl+Z undoes, Cmd/Ctrl+A selects all, Escape clears the selection)
 * act only on a key aimed at the canvas. The harness holds its gestures, its
 * pan and its lasso by calls (`holdGesture`, `holdPan`, `armLasso`), which
 * `interaction` reports as a pointer would; an accepted import cancels a held
 * gesture, a rejected one and a pan run on, and an import called during a drop
 * waits for it. Its colours resolve from the page's `data-cd-theme` and
 * `data-cd-kontrast` until `appearance.set` writes its own on the container,
 * as on the Miragon design tokens. It is the
 * kit's reference subject, plus deliberately BROKEN variants: one per
 * real-world drift the contract exists to prevent AND one per case in the
 * kit, so the kit's own CI proves every case bites. Each variant must fail exactly its law's case set. Eight
 * variants are NOT flaws but legitimate implementation choices the kit must
 * accept (a diagram-js style enriched view-state readback, commands ignored
 * before the first import, an empty name that reads back absent, a content
 * box measured in float32, a content box around a plot drawn without
 * elements, canvas keys taken in the capture phase, a canvas that is a
 * focusable `<div>`, a modeler that lists and draws dark) — they must fail
 * nothing. Twenty-four variants ignore a RECOMMENDATION — they must fail
 * nothing and advise once.
 */
import type { GestureKind, HeldGesture, HeldPan } from "../src/conformance.js";
import type {
  AppearanceContrast,
  AppearanceSurface,
  AppearanceTheme,
  CollaborativeModeler,
  ElementBounds,
  ElementsSurface,
  ImportResult,
  InteractionSurface,
  ModelerMeta,
} from "../src/index.js";
import { MODELER_API_VERSION } from "../src/index.js";

export interface Flaws {
  /** meta.apiVersion of a foreign major */
  incompatibleApiVersion?: boolean;
  /** fire onContentChanged from importText (the wardley importDSL echo) */
  echoImport?: boolean;
  /** fire the import echo ONLY when undo history exists (an engine that emits from clear() when there is something to clear) */
  echoOnHistoryOnly?: boolean;
  /** fire the import echo only for documents carrying foreign content (a migration path that emits) */
  echoOnForeignOnly?: boolean;
  /** export stamps extra content — NOT a fixpoint of its own parser */
  nonCanonicalExport?: boolean;
  /** keep the undo stack across imports; undo RESTORES a snapshot (the tt stale-undo, snapshot form) */
  staleUndo?: boolean;
  /** keep the undo stack across imports; undo REMOVES the created element by id — a diagram-js style
   *  delta revert that is a silent no-op unless the re-imported document contains the id */
  staleUndoDelta?: boolean;
  /** undo on an EMPTY stack still emits onContentChanged */
  undoOnEmptyEmits?: boolean;
  /** ignore unsubscribes */
  leakyUnsubscribe?: boolean;
  /** drop every line the parser does not understand (a stripping schema) */
  dropForeign?: boolean;
  /** a rejected import blanks the canvas and wedges the parser for good */
  wedgeAfterReject?: boolean;
  /** a rejected import erases the undo history before rejecting */
  rejectClearsUndo?: boolean;
  /** undo restores the document but never emits */
  silentUndo?: boolean;
  /** redo restores the document but never emits */
  silentRedo?: boolean;
  /** setViewState is ignored (a modeler without view-state support) */
  noopViewState?: boolean;
  /** an import keeps the previous viewport instead of fitting the content */
  noFitOnImport?: boolean;
  /** NOT a flaw: getViewState returns the state enriched with derived keys (scale, inner, outer — the diagram-js viewbox shape) */
  enrichedViewStateReadback?: boolean;
  /** the enriched readback is NOT accepted by setViewState (only the literal shape is) */
  readbackNotSettable?: boolean;
  /** getViewState throws before the first import */
  viewStateThrowsBeforeImport?: boolean;
  /** reveal/commands never deliver a selection */
  deadSelection?: boolean;
  /** onSelection unsubscribes are ignored */
  leakySelectionUnsubscribe?: boolean;
  /** the title edit changes the export but never emits (a config edit outside the command stack) */
  configEditSilent?: boolean;
  /** onContentChanged fires BEFORE the command is applied */
  emitBeforeApply?: boolean;
  /** the element command never emits */
  silentMutation?: boolean;
  /** setViewState emits a change event */
  viewStateEmits?: boolean;
  /** an invalid input resolves (importing nothing) instead of rejecting */
  rejectResolves?: boolean;
  /** an invalid input rejects but clears the document first */
  rejectMutatesDoc?: boolean;
  /** reveal(unknown id) returns true */
  revealUnknownTrue?: boolean;
  /** exportText throws once a command ran */
  exportThrowsAfterMutate?: boolean;
  /** element ids are positional (renumbered from the end on every change) */
  positionalIds?: boolean;
  /** a second destroy() throws */
  destroyThrowsTwice?: boolean;
  /** the viewer emits change events on import */
  viewerEmits?: boolean;
  /** the viewer's importText throws (no command stack registered) */
  viewerImportThrows?: boolean;
  /** the viewer registers no selection service: reveal returns false for every id */
  viewerCannotReveal?: boolean;
  /** the viewer's import keeps the previous viewport */
  viewerKeepsView?: boolean;
  /** the viewer drops foreign content */
  viewerDropsForeign?: boolean;
  /** the viewer selects but never delivers onSelection */
  viewerDeadSelectionEvents?: boolean;
  /** an element created in the session gets an in-memory id the serializer never writes back — after
   *  export → import it carries the id its text derives */
  idsChangeOnExport?: boolean;
  /** NOT a law violation, a missed recommendation: created elements get ids from a per-instance counter
   *  (`line_1` on every peer) — written back, so they round-trip, but two peers collide */
  counterIds?: boolean;
  /** exportText() or a command before the first import wedges the parser for good */
  wedgeOnPreImportCall?: boolean;
  /** a truncated text (no trailing newline) rejects, but blanks the document first — invisible to the
   *  L7 cases while invalidTexts is [] */
  probeRejectionLeavesTrace?: boolean;
  /** an import commits the open label editor once it has rendered (diagram-js directEditing completing
   *  on the viewbox change) — onto the re-imported element, or onto a removed one */
  commitInteractionOnImport?: boolean;
  /** NOT a law violation, a missed recommendation: an import closes the open label editor and drops
   *  the typed input instead of reopening it on the element with the same id */
  dropInteractionOnImport?: boolean;
  /** a host's view change commits the open label editor (diagram-js directEditing completing on
   *  `canvas.viewbox.changing` — the drift every renderer built against contract 1.1 ships: a restore
   *  after a peer's re-import writes the half-typed label into the shared text) */
  commitInteractionOnViewChange?: boolean;
  /** a host's view change commits the open label editor while the change events are muted, the way
   *  a renderer mutes them for its own programmatic updates: no event, but the export changed */
  silentCommitInteractionOnViewChange?: boolean;
  /** NOT a law violation, a missed recommendation: a host's view change closes the open label editor
   *  and drops the typed input */
  dropInteractionOnViewChange?: boolean;
  /** NOT a flaw: a command before the first import does nothing — no element, no change event (a
   *  harness mutate that waits for that event never settles) */
  ignoresCommandsBeforeImport?: boolean;
  /** NOT a flaw: an element without a label (a `~` line) reports the name "" when created in the
   *  session and no name at all when read from a text */
  blankNamesReadBackAbsent?: boolean;
  /** elements.bounds answers from a table filled at the last import — an element created in the
   *  session has no box until the next import (the host workaround the surface replaces) */
  boundsOfImportedOnly?: boolean;
  /** elements.bounds keeps the box each element had when it was first asked for — a moved
   *  element is outlined where it was */
  boundsFrozenAtFirstRead?: boolean;
  /** elements.bounds answers an empty box for an id it does not know */
  boundsForUnknownIds?: boolean;
  /** elements.bounds reports screen coordinates — the box moves with zoom and scroll */
  boundsInViewCoordinates?: boolean;
  /** an import reads each element's box before its layout placed it: an element read from a text
   *  has a NaN position, one created in the session is placed live */
  boundsUnplacedOnImport?: boolean;
  /** elements.bounds spans the box from its right edge to its left one: a negative width */
  boundsSignedSize?: boolean;
  /** a move re-creates the element under a fresh id (a delete + create pair), so a host loses the
   *  element it outlined */
  moveChangesId?: boolean;
  /** contentBounds answers the box measured at the last import — an element created in the session
   *  lies outside it (designIQ's cached plot box, before the contract had the surface) */
  contentBoundsOfImportedOnly?: boolean;
  /** contentBounds reports screen coordinates — the box moves with zoom and scroll */
  contentBoundsInViewCoordinates?: boolean;
  /** contentBounds spans the elements' positions, not their sizes: their right and bottom edges
   *  stick out of it */
  contentBoundsOfPositionsOnly?: boolean;
  /** contentBounds measures before anything was drawn: a NaN box before the first import */
  contentBoundsUnmeasuredBeforeImport?: boolean;
  /** contentBounds answers undefined whatever the canvas shows — the host never fits */
  contentBoundsAlwaysUndefined?: boolean;
  /** NOT a flaw: the canvas sits at fractional diagram coordinates and contentBounds measures it
   *  on the live SVG (`getBBox`), whose float32 edges fall a few millionths short of the element
   *  boxes */
  contentBoundsMeasuredInFloat32?: boolean;
  /** NOT a flaw: contentBounds also holds what the notation always draws (Wardley's plot with its
   *  axes), so it is a box before the first import and on a document without elements */
  contentBoundsWithPlot?: boolean;
  /** NOT a law violation, a missed recommendation: every key acts on the canvas wherever it is
   *  aimed — a document-wide listener without a target check */
  documentWideKeys?: boolean;
  /** NOT a law violation, a missed recommendation: a key aimed at <body> counts as the canvas's, so
   *  Backspace deletes the selection with nothing focused, even while the host hides the canvas */
  bodyKeysAreCanvasKeys?: boolean;
  /** NOT a law violation, a missed recommendation: a key aimed anywhere in the host element counts
   *  as the canvas's, so an editor the host places in the modeler's container loses its keys */
  hostKeysAreCanvasKeys?: boolean;
  /** NOT a law violation, a missed recommendation: a key aimed anywhere in the modeler's own
   *  container counts as the canvas's, so an editor in a host's overlay next to the canvas loses
   *  its keys */
  containerKeysAreCanvasKeys?: boolean;
  /** NOT a law violation, a missed recommendation: only text fields (input, textarea, select,
   *  contenteditable) keep their keys — a host button, an EditContext and a Monaco editor lose them */
  onlyTextFieldsKeepKeys?: boolean;
  /** NOT a law violation, a missed recommendation: Cmd/Ctrl+C, X and V are prevented wherever they
   *  are aimed, so a host text field loses its native copy and paste, though nothing else happens */
  preventsClipboardKeysEverywhere?: boolean;
  /** NOT a law violation, a missed recommendation: a capture-phase listener stops every key aimed
   *  outside the canvas, so the host's own listeners never see it */
  stopsKeysOutsideCanvas?: boolean;
  /** NOT a law violation, a missed recommendation: Escape clears the selection wherever it is aimed,
   *  without preventing it */
  escapeAnywhereClearsSelection?: boolean;
  /** NOT a law violation, a missed recommendation: a keydown without a key (autofill) throws, the
   *  key read before any guard */
  keylessKeyThrows?: boolean;
  /** NOT a flaw: the canvas takes its keys in the capture phase on the window, with the same target
   *  check */
  keysInCapturePhase?: boolean;
  /** the canvas binds no key at all: the keys case cannot see a key act, so it reports a skip */
  noCanvasKeys?: boolean;
  /** NOT a flaw: the canvas is a focusable `<div>`, not an `<svg>`, so a harness names it with
   *  `canvasElement` */
  canvasIsDiv?: boolean;
  /** NOT a law violation, a missed recommendation: the keys that move the canvas or zoom it
   *  (Shift+Arrow, Cmd/Ctrl+Arrow, Cmd/Ctrl+=) are prevented wherever they are aimed, as a
   *  document-wide diagram-js KeyboardMove would */
  canvasMoveKeysAnywhere?: boolean;
  /** NOT a law violation, a missed recommendation: Cmd/Ctrl+V aimed anywhere pastes a line a
   *  macrotask later, so the key itself leaves the document as it was */
  deferredPasteAnywhere?: boolean;
  /** NOT a law violation, a missed recommendation: a keyup aimed outside the canvas is prevented */
  preventsKeyupOutsideCanvas?: boolean;
  /** NOT a law violation, a missed recommendation: the viewer (only) pans on an arrow aimed anywhere
   *  and prevents it */
  viewerTakesArrowsAnywhere?: boolean;

  // ── the gesture cancel of L1 (1.5) ─────────────────────────────────────────
  /** NOT a law violation, a missed recommendation: an accepted import leaves a running gesture
   *  running, so its drop applies to the imported document, or throws on the element it removed */
  importKeepsGesture?: boolean;
  /** NOT a law violation, a missed recommendation: a rejected import ends a running gesture too */
  rejectedImportEndsGesture?: boolean;
  /** NOT a law violation, a missed recommendation: an import called while a gesture runs waits
   *  until its drop or its cancel instead of cancelling it */
  importWaitsForGesture?: boolean;
  /** an accepted import applies a running move before it replaces the document: a change event
   *  from the import */
  importDuringGestureEmits?: boolean;
  /** a drop ends the gesture and applies nothing: no case can tell a cancelled gesture from it */
  dropsNothing?: boolean;

  // ── an import from the change listener of a drop (1.6, #248) ───────────────
  /** NOT a law violation, a missed recommendation: an import called during a drop runs at once,
   *  and the drop's next step, which selects the moved element again, throws on the element the
   *  import removed (diagram-js's SelectionBehavior) */
  importDuringDropRunsAtOnce?: boolean;
  /** NOT a law violation, a missed recommendation: an import called during a drop waits for the
   *  drop, but its Promise resolves at once */
  importDuringDropSettlesEarly?: boolean;
  /** NOT a law violation, a missed recommendation: an import called during a drop never settles,
   *  and every later import waits behind it, since imports keep their call order */
  importDuringDropNeverSettles?: boolean;

  // ── an import during any other action of the user (1.6, #285, #305, #336) ──
  /** NOT a law violation, a missed recommendation: an import called while a command runs (a
   *  delete, an undo, a redo) runs at once, and the command goes on: it records its step after the
   *  import and fires its change event */
  importDuringCommandRunsAtOnce?: boolean;
  /** NOT a law violation, a missed recommendation: an import called while a command runs waits for
   *  it, but its Promise resolves at once */
  importDuringCommandSettlesEarly?: boolean;
  /** NOT a law violation, a missed recommendation: an import called while a command runs never
   *  settles, and every later import waits behind it */
  importDuringCommandNeverSettles?: boolean;
  /** NOT a law violation, a missed recommendation: only an import called while a delete runs runs
   *  at once, which the user-action case meets with a key on the canvas, so in a DOM only */
  importDuringDeleteRunsAtOnce?: boolean;
  /** NOT a law violation, a missed recommendation: an import called once the user's action has
   *  returned runs at once, ahead of an earlier one that still waits for that action */
  waitingImportsOvertaken?: boolean;
  /** NOT a flaw, a choice the kit must accept (Value Chain's): the microtask that runs the waiting
   *  imports is queued when the action starts, so it runs ahead of every microtask a listener
   *  queues during the action */
  flushQueuedAtTheActionsStart?: boolean;
  /** NOT a law violation, a missed recommendation: an import called while a drag activates runs at
   *  once, and its cancel takes the drag away under the activation, which then throws (diagram-js's
   *  Dragging.move reads the drag again after the selection listeners) */
  importAtDragStartRunsAtOnce?: boolean;
  /** NOT a law violation, a missed recommendation: an import called while a drag activates waits
   *  until the drag's drop instead of ending the drag once it has started */
  importAtDragStartWaitsForTheDrop?: boolean;

  // ── a pan (1.6) ────────────────────────────────────────────────────────────
  /** NOT a law violation, a missed recommendation: interaction reports a pan as a gesture */
  panIsGesture?: boolean;
  /** NOT a law violation, a missed recommendation: an import ends a running pan */
  importEndsPan?: boolean;
  /** NOT a law violation, a missed recommendation: a pan keeps the view it started from and puts
   *  it back on its next step after an import, undoing the import's fit */
  panJumpsBack?: boolean;
  /** releasing a pan fires onContentChanged */
  panEmits?: boolean;
  /** NOT a law violation, a missed recommendation (1.5 let a pan count as a gesture): an import
   *  called during a pan waits until the pan's release */
  importWaitsForPan?: boolean;

  // ── interaction (1.5) ──────────────────────────────────────────────────────
  /** interaction.active() is false whatever runs; onChange still fires */
  interactionNeverActive?: boolean;
  /** onChange(true) fires twice when a gesture starts */
  interactionReportsTwice?: boolean;
  /** onChange runs before active() returns the new value */
  interactionStaleInListener?: boolean;
  /** interaction.onChange unsubscribes are ignored */
  leakyInteractionUnsubscribe?: boolean;
  /** an armed palette tool counts as a gesture */
  armedToolIsGesture?: boolean;
  /** interaction.active() is true until the first import */
  activeBeforeImport?: boolean;
  /** Escape ends the gesture without telling onChange */
  cancelNotReported?: boolean;
  /** destroy() ends a held gesture and still calls onChange(false) */
  reportsAfterDestroy?: boolean;
  /** the viewer's interaction.active() is true */
  viewerReportsGesture?: boolean;

  // ── appearance (1.5) ───────────────────────────────────────────────────────
  /** NOT a flaw: the modeler lists and draws dark too */
  listsDark?: boolean;
  /** appearance.themes is empty */
  themesEmpty?: boolean;
  /** appearance.themes lists light twice */
  themesDuplicated?: boolean;
  /** appearance.themes lists a theme the contract does not know */
  themesUnknown?: boolean;
  /** appearance.themes is another list on every second read */
  themesVaryByRead?: boolean;
  /** the viewer lists other themes than the modeler */
  viewerThemesDiffer?: boolean;
  /** appearance.set throws for a theme the contract does not know (an untyped host's) */
  appearanceThrowsOnUnknown?: boolean;
  /** appearance.set throws before the first import */
  appearanceThrowsBeforeImport?: boolean;
  /** appearance.set fires onContentChanged */
  appearanceEmits?: boolean;
  /** exportText() writes the drawn appearance into the document */
  appearanceInExport?: boolean;
  /** the SVG export carries the drawn appearance */
  appearanceInImage?: boolean;
  /** appearance.set zooms the view */
  appearanceMovesView?: boolean;
  /** appearance.set clears the selection */
  appearanceClearsSelection?: boolean;
  /** appearance.set erases the undo history */
  appearanceClearsUndo?: boolean;
  /** appearance.set commits the open label editor */
  appearanceCommitsInteraction?: boolean;
  /** NOT a law violation, a missed recommendation: appearance.set closes the open label editor and
   *  drops the typed input */
  appearanceDropsInteraction?: boolean;
  /** appearance.set does nothing and leaves the roles to the page (a DOM-only failure) */
  appearanceDoesNothing?: boolean;
  /** appearance.set draws the requested theme even when themes does not list it */
  appearanceDrawsUnlistedTheme?: boolean;
  /** a request for normal contrast leaves the page's high contrast through */
  appearanceKeepsPageContrast?: boolean;
  /** an import forgets the drawn appearance, so the page's mode shows through again */
  appearanceForgottenOnImport?: boolean;
  /** themes lists dark, but a request for it draws light */
  listsDarkDrawsLight?: boolean;
  /** NOT a flaw: a re-import draws one element more into the container than the first import, as
   *  Value Chain's canvas does */
  reimportDrawsOneMore?: boolean;
}

export interface ReferenceModeler extends CollaborativeModeler {
  /** the "user command" the harness drives element mutations with */
  addLine(text: string): void;
  /** the config edit outside the command stack */
  setTitle(title: string): void;
  /** the modeler's own undo / redo */
  undoCommand(): void;
  redoCommand(): void;
  /** open the label editor on an element and type into it — input nothing has committed yet */
  editLabel(elementId: string, typed: string): void;
  /** the open label editor, if any */
  openLabelEditor(): { elementId: string; text: string } | undefined;
  /** commit the open label editor: renames its element, an undoable command */
  commitLabel(): void;
  /** move an element by an offset, an undoable command */
  moveLine(elementId: string, dx: number, dy: number): void;
  /** the focusable element `attachTo` drew to take the keys, while mounted */
  canvasElement(): Element | undefined;
  /** the pointer holds a gesture: a move of the first element, or a create */
  holdGesture(kind: GestureKind): HeldGesture;
  /** the palette's lasso waits for its next press */
  armLasso(): void;
  /** the pointer pans the view by one step, and by one more on every move */
  holdPan(): HeldPan;
  /** the image export: the document as an SVG */
  exportSvg(): string;
}

interface View {
  zoom: number;
  scrollX: number;
}

interface Entry {
  readonly id: string;
  readonly text: string;
  /** created by a command in this session, not read from a text */
  readonly created?: boolean;
  /** moved off its row by this offset */
  readonly at?: { x: number; y: number };
}

/** a line naming its element's id: `text #id` */
const ID_SUFFIX = /^(.*\S) #(\S+)$/;
/** a line placing its element off its row: `text @x,y` */
const AT_SUFFIX = /^(.*\S) @(-?\d+),(-?\d+)$/;
const ROW_HEIGHT = 40;
/** what `contentBoundsWithPlot` always draws, wherever the elements are */
const PLOT: ElementBounds = { x: -20, y: -16, width: 240, height: 180 };
/** how far one step of a pan scrolls the view */
const PAN_STEP = 10;
const KNOWN_THEMES: readonly AppearanceTheme[] = ["light", "dark"];

/**
 * the reference's colours, the way the design tokens resolve them: from the page's mode while the
 * root carries none (before the first `appearance.set`), from the root's mode once it does. The
 * root's rules are the more specific ones, so they win over the page's
 */
const REFERENCE_STYLES = `
html[data-cd-theme="dark"] .reference-canvas { color: rgb(236, 236, 236); background-color: rgb(29, 29, 29); }
html[data-cd-kontrast="hoch"] .reference-canvas { outline-color: rgb(255, 255, 255); }
.reference-root[data-cd-theme="light"] .reference-canvas { color: rgb(29, 29, 29); background-color: rgb(249, 247, 247); }
.reference-root[data-cd-theme="dark"] .reference-canvas { color: rgb(236, 236, 236); background-color: rgb(18, 18, 18); }
.reference-root[data-cd-kontrast="normal"] .reference-canvas { outline-color: rgb(143, 138, 138); }
.reference-root[data-cd-kontrast="hoch"] .reference-canvas { outline-color: rgb(29, 29, 29); }
`;

function addReferenceStyles(doc: Document): void {
  if (doc.getElementById("reference-modeler-styles")) return;
  const style = doc.createElement("style");
  style.id = "reference-modeler-styles";
  style.textContent = REFERENCE_STYLES;
  doc.head.append(style);
}

const float32 = (box: ElementBounds): ElementBounds => ({
  x: Math.fround(box.x),
  y: Math.fround(box.y),
  width: Math.fround(box.width),
  height: Math.fround(box.height),
});

const union = (a: ElementBounds, b: ElementBounds): ElementBounds => {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
};

export function createReferenceModeler(flaws: Flaws = {}, editable = true): ReferenceModeler {
  let title = "";
  let entries: Entry[] = [];
  let undoStack: Array<{ undo(): void; redo(): void }> = [];
  let redoStack: Array<{ undo(): void; redo(): void }> = [];
  const fittedView: View = { zoom: 1, scrollX: 0 };
  let view: View | undefined; // undefined before the first import
  const listeners = new Set<() => void>();
  let selection: string[] = [];
  const selectionListeners = new Set<(ids: string[]) => void>();
  let wedged = false;
  let mutated = false;
  let destroyed = false;
  let imported = false;
  let createdCount = 0;
  let labelEditor: { elementId: string; text: string } | undefined;
  const keepsHistory = Boolean(flaws.staleUndo || flaws.staleUndoDelta);
  /** the gesture the pointer holds; an import or its own end clears it */
  let gesture:
    { kind: GestureKind; elementId: string | undefined; previousSelection: string[] } | undefined;
  let pan: { from: number; steps: number } | undefined;
  let lassoArmed = false;
  /** a user's action runs (a drop, a drag's activation, a command): an import called now waits
   *  until the action has returned, and the import after it waits behind it */
  let actionDepth = 0;
  let dropping = false;
  let activating = false;
  let commandDepth = 0;
  let deleting = false;
  const waitingImports: Array<() => void> = [];
  let flushQueued = false;
  const runWaitingImports = (): void => {
    while (actionDepth === 0 && waitingImports.length > 0) waitingImports.shift()?.();
  };
  /** like the renderers, the imports run in the microtask after the action, once its code returned */
  const queueTheFlush = (): void => {
    if (flushQueued) return;
    flushQueued = true;
    queueMicrotask(() => {
      flushQueued = false;
      runWaitingImports();
    });
  };
  const queueWaitingImports = (): void => {
    if (waitingImports.length > 0) queueTheFlush();
  };
  const asUserAction = <T>(work: () => T): T => {
    if (actionDepth === 0 && flaws.flushQueuedAtTheActionsStart) queueTheFlush();
    actionDepth += 1;
    try {
      return work();
    } finally {
      actionDepth -= 1;
      if (actionDepth === 0) queueWaitingImports();
    }
  };
  const asCommand = <T>(work: () => T): T =>
    asUserAction(() => {
      commandDepth += 1;
      try {
        return work();
      } finally {
        commandDepth -= 1;
      }
    });
  /** imports that wait for the user's gesture or pan to end (the flawed variants) */
  const afterTheUser: Array<() => void> = [];
  const runWhatWaitedForTheUser = (): void => {
    for (const work of afterTheUser.splice(0)) work();
  };
  /** an import that never settles holds every later one (importDuringDropNeverSettles) */
  let importsStuck = false;
  let droppedCount = 0;
  const interactionListeners = new Set<(active: boolean) => void>();
  /** what interaction reported last */
  let reportedActive = Boolean(
    flaws.activeBeforeImport || (!editable && flaws.viewerReportsGesture),
  );
  let drawn: { theme: AppearanceTheme; contrast: AppearanceContrast } | undefined;
  let mountedRoot: Element | undefined;

  let muted = false;
  const emit = (): void => {
    if (muted) return;
    for (const cb of listeners) cb();
  };
  const select = (ids: string[]): void => {
    if (JSON.stringify(ids) === JSON.stringify(selection)) return; // engines deduplicate
    selection = ids;
    if (flaws.deadSelection || (!editable && flaws.viewerDeadSelectionEvents)) return;
    for (const cb of selectionListeners) cb(selection);
  };
  const lineOf = (entry: Entry): string => {
    const named =
      entry.id === entry.text || flaws.idsChangeOnExport
        ? entry.text
        : `${entry.text} #${entry.id}`;
    return entry.at ? `${named} @${entry.at.x},${entry.at.y}` : named;
  };
  const entryOf = (line: string): Entry => {
    const placed = AT_SUFFIX.exec(line);
    const rest = placed ? (placed[1] ?? line) : line;
    const named = ID_SUFFIX.exec(rest);
    const entry = named
      ? { text: named[1] ?? rest, id: named[2] ?? rest }
      : { id: rest, text: rest };
    return placed ? { ...entry, at: { x: Number(placed[2]), y: Number(placed[3]) } } : entry;
  };
  const canonical = (): string => {
    const body = entries.map(lineOf).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const stamp =
      flaws.appearanceInExport && drawn ? [`% drawn: ${drawn.theme} ${drawn.contrast}`] : [];
    const out = [...(title ? [`title: ${title}`] : []), ...body, ...stamp];
    return out.length === 0 ? "" : `${out.join("\n")}\n`;
  };
  const nameOf = (entry: Entry | undefined): string | undefined => {
    if (!flaws.blankNamesReadBackAbsent || !entry?.text.startsWith("~")) return entry?.text;
    return entry.created ? "" : undefined;
  };
  const ids = (): string[] =>
    flaws.positionalIds
      ? entries.map((_e, i) => `l${entries.length - i}`)
      : entries.map((e) => e.id);
  /** an element the command removed leaves the selection while the command runs, as diagram-js's
   *  Selection drops a removed shape */
  const deselectRemoved = (): void => {
    const present = ids();
    select(selection.filter((id) => present.includes(id)));
  };
  /** where an element is drawn: row n, moved by its offset, 8 units per character */
  const drawnBox = (e: Entry, row: number): ElementBounds => {
    const box = {
      x: e.at?.x ?? 0,
      y: row * ROW_HEIGHT + (e.at?.y ?? 0),
      width: 8 * Math.max(1, e.text.length),
      height: 24,
    };
    if (!flaws.contentBoundsMeasuredInFloat32) return box;
    return {
      x: box.x * 1.1 + 0.3,
      y: box.y * 1.1 + 0.3,
      width: box.width * 1.1,
      height: box.height * 1.1,
    };
  };
  /** the box as the screen shows it at the current view */
  const inView = (box: ElementBounds): ElementBounds =>
    view === undefined
      ? box
      : {
          x: box.x * view.zoom - view.scrollX,
          y: box.y * view.zoom,
          width: box.width * view.zoom,
          height: box.height * view.zoom,
        };
  const liveBoxes = (): Map<string, ElementBounds> => {
    const reported = ids();
    return new Map(
      entries.map((e, row) => {
        const drawn = drawnBox(e, row);
        const unplaced = flaws.boundsUnplacedOnImport && !e.created;
        const box = {
          x: unplaced ? Number.NaN : flaws.boundsSignedSize ? drawn.x + drawn.width : drawn.x,
          y: unplaced ? Number.NaN : drawn.y,
          width: flaws.boundsSignedSize ? -drawn.width : drawn.width,
          height: drawn.height,
        };
        return [reported[row] ?? e.id, box];
      }),
    );
  };
  let importedBoxes = new Map<string, ElementBounds>();
  const firstReadBoxes = new Map<string, ElementBounds>();
  const boundsOf = (id: string): ElementBounds | undefined => {
    if (flaws.boundsOfImportedOnly) return importedBoxes.get(id);
    const live = liveBoxes().get(id);
    if (live === undefined)
      return flaws.boundsForUnknownIds ? { x: 0, y: 0, width: 0, height: 0 } : undefined;
    if (flaws.boundsFrozenAtFirstRead) {
      if (!firstReadBoxes.has(id)) firstReadBoxes.set(id, live);
      return firstReadBoxes.get(id);
    }
    return flaws.boundsInViewCoordinates ? inView(live) : live;
  };
  /** the box around every drawn element, `undefined` without one */
  const drawnContent = (): ElementBounds | undefined => {
    const boxes = entries.map(drawnBox);
    if (boxes.length === 0) return undefined;
    const sized = !flaws.contentBoundsOfPositionsOnly;
    const left = Math.min(...boxes.map((b) => b.x));
    const top = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + (sized ? b.width : 0)));
    const bottom = Math.max(...boxes.map((b) => b.y + (sized ? b.height : 0)));
    return { x: left, y: top, width: right - left, height: bottom - top };
  };
  let importedContent: ElementBounds | undefined;
  const contentBounds = (): ElementBounds | undefined => {
    if (flaws.contentBoundsAlwaysUndefined) return undefined;
    if (!imported && flaws.contentBoundsUnmeasuredBeforeImport) {
      return { x: Number.NaN, y: Number.NaN, width: Number.NaN, height: Number.NaN };
    }
    const drawn = flaws.contentBoundsOfImportedOnly ? importedContent : drawnContent();
    const content = flaws.contentBoundsWithPlot ? (drawn ? union(PLOT, drawn) : PLOT) : drawn;
    if (content === undefined) return undefined;
    if (flaws.contentBoundsInViewCoordinates) return inView(content);
    return flaws.contentBoundsMeasuredInFloat32 ? float32(content) : content;
  };
  /** a pre-import call the wedging variant never recovers from */
  const touchBeforeImport = (): void => {
    if (flaws.wedgeOnPreImportCall && !imported) wedged = true;
  };
  const commitLabel = (): void => {
    const edit = labelEditor;
    if (!edit) return;
    labelEditor = undefined;
    // committed onto a removed element, the change still fires — diagram-js
    // updates the detached shape through the command stack
    asCommand(() => {
      const before = entries;
      const reported = ids();
      entries = entries.map((e, i) =>
        reported[i] === edit.elementId
          ? { id: e.id, text: edit.text, ...(e.at ? { at: e.at } : {}) }
          : e,
      );
      const after = entries;
      undoStack.push({
        undo: () => {
          entries = before;
        },
        redo: () => {
          entries = after;
        },
      });
      redoStack = [];
      emit();
    });
  };
  const enriched = (v: View): Record<string, unknown> => ({
    ...v,
    zoom: Math.round(v.zoom * 1000) / 1000,
    scale: v.zoom,
    inner: { width: 100 },
    outer: { width: 800 },
  });
  /** removes the elements with these ids in one undoable command */
  const removeElements = (doomed: string[]): void =>
    asCommand(() => {
      const reported = ids();
      const before = entries;
      entries = entries.filter((_entry, row) => !doomed.includes(reported[row] ?? ""));
      if (entries.length === before.length) return;
      const after = entries;
      deleting = true;
      try {
        deselectRemoved();
      } finally {
        deleting = false;
      }
      undoStack.push({
        undo: () => {
          entries = before;
        },
        redo: () => {
          entries = after;
        },
      });
      redoStack = [];
      emit();
    });
  /** what a key aimed at the canvas does */
  const actOnCanvasKey = (event: KeyboardEvent): void => {
    if (!editable || flaws.noCanvasKeys) return;
    const shortcut = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (key === "delete" || key === "backspace") {
      if (selection.length === 0) return;
      event.preventDefault();
      removeElements(selection);
    } else if (shortcut && (key === "z" || key === "y")) {
      event.preventDefault();
      if (key === "z" && !event.shiftKey) modeler.undoCommand();
      else modeler.redoCommand();
    } else if (shortcut && key === "a") {
      event.preventDefault();
      select(ids());
    } else if (key === "escape") {
      select([]);
    }
  };
  /** tells interaction's listeners that a gesture started or ended */
  const report = (active: boolean): void => {
    if (destroyed || active === reportedActive) return;
    if (!flaws.interactionStaleInListener) reportedActive = active;
    for (const listener of [...interactionListeners]) {
      listener(active);
      if (flaws.interactionReportsTwice && active) listener(active);
    }
    reportedActive = active;
  };
  const endGesture = (): void => {
    gesture = undefined;
    report(false);
  };
  /** draws the requested appearance on the root, so the reference's colours resolve there */
  const paint = (): void => {
    if (!mountedRoot || !drawn || flaws.appearanceDoesNothing) return;
    mountedRoot.setAttribute("data-cd-theme", drawn.theme);
    if (drawn.contrast === "high") mountedRoot.setAttribute("data-cd-kontrast", "hoch");
    else if (flaws.appearanceKeepsPageContrast) mountedRoot.removeAttribute("data-cd-kontrast");
    else mountedRoot.setAttribute("data-cd-kontrast", "normal");
  };
  /** a held gesture's drop: the move or the create it shows, then what follows it */
  const drop = (held: NonNullable<typeof gesture>): void => {
    if (gesture !== held) return;
    if (flaws.dropsNothing) {
      endGesture();
      runWhatWaitedForTheUser();
      return;
    }
    asUserAction(() => {
      dropping = true;
      try {
        if (held.kind === "move") {
          const id = held.elementId ?? "";
          // diagram-js's moveShape on a shape an import removed
          if (!ids().includes(id))
            throw new TypeError("Cannot read properties of null (reading 'children')");
          modeler.moveLine(id, 40, 24);
          // the drop selects the moved element again, as diagram-js does once the move has run,
          // when something was selected before the drag
          if (held.previousSelection.length > 0) {
            if (!ids().includes(id))
              throw new TypeError("Cannot read properties of undefined (reading 'id')");
            select([id]);
          }
        } else {
          droppedCount += 1;
          modeler.addLine(`dropped-${droppedCount}`);
        }
      } finally {
        dropping = false;
        endGesture();
        runWhatWaitedForTheUser();
      }
    });
  };
  let mountedCanvas: Element | undefined;
  let pastes = 0;
  /** draws the focusable canvas into the host and binds its keys; returns the teardown */
  const mountCanvas = (host: Element): (() => void) => {
    const doc = host.ownerDocument;
    addReferenceStyles(doc);
    const container = doc.createElement("div");
    container.setAttribute("class", "reference-root");
    const canvas = flaws.canvasIsDiv
      ? doc.createElement("div")
      : doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    canvas.setAttribute("tabindex", "0");
    canvas.setAttribute("class", "reference-canvas");
    container.append(canvas);
    host.append(container);
    mountedCanvas = canvas;
    mountedRoot = container;
    paint();
    const takesKey = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return false;
      if (flaws.documentWideKeys || canvas.contains(target)) return true;
      if (flaws.bodyKeysAreCanvasKeys && target === doc.body) return true;
      if (flaws.hostKeysAreCanvasKeys && host.contains(target)) return true;
      if (flaws.containerKeysAreCanvasKeys && container.contains(target)) return true;
      return (
        Boolean(flaws.onlyTextFieldsKeepKeys) &&
        !(target instanceof Element && target.closest("input, textarea, select, [contenteditable]"))
      );
    };
    const onKeydown = (event: Event): void => {
      const keyEvent = event as KeyboardEvent;
      if (flaws.keylessKeyThrows) keyEvent.key.toLowerCase();
      if (typeof keyEvent.key !== "string" || event.defaultPrevented) return;
      const shortcut = keyEvent.ctrlKey || keyEvent.metaKey;
      const arrow = keyEvent.key.startsWith("Arrow");
      if (flaws.viewerTakesArrowsAnywhere && !editable && arrow) event.preventDefault();
      if (flaws.canvasMoveKeysAnywhere && (arrow ? shortcut || keyEvent.shiftKey : false)) {
        event.preventDefault();
      }
      if (flaws.canvasMoveKeysAnywhere && shortcut && keyEvent.key === "=") event.preventDefault();
      if (flaws.deferredPasteAnywhere && editable && shortcut && keyEvent.key === "v") {
        pastes += 1;
        const pasted = `pasted-${pastes}`;
        setTimeout(() => modeler.addLine(pasted), 0);
      }
      if (takesKey(event.target)) {
        actOnCanvasKey(keyEvent);
        return;
      }
      const clipboardShortcut = shortcut && ["c", "x", "v"].includes(keyEvent.key.toLowerCase());
      if (flaws.preventsClipboardKeysEverywhere && clipboardShortcut) event.preventDefault();
      if (flaws.escapeAnywhereClearsSelection && keyEvent.key === "Escape") select([]);
    };
    const onKeyup = (event: Event): void => {
      if (!takesKey(event.target)) event.preventDefault();
    };
    const stopOutsideCanvas = (event: Event): void => {
      if (!takesKey(event.target)) event.stopPropagation();
    };
    const capture = Boolean(flaws.keysInCapturePhase);
    const listener: EventTarget = capture ? (doc.defaultView ?? doc) : doc;
    listener.addEventListener("keydown", onKeydown, capture);
    if (flaws.preventsKeyupOutsideCanvas) doc.addEventListener("keyup", onKeyup);
    if (flaws.stopsKeysOutsideCanvas) doc.addEventListener("keydown", stopOutsideCanvas, true);
    return () => {
      listener.removeEventListener("keydown", onKeydown, capture);
      doc.removeEventListener("keyup", onKeyup);
      doc.removeEventListener("keydown", stopOutsideCanvas, true);
      container.remove();
      mountedCanvas = undefined;
      mountedRoot = undefined;
    };
  };
  let unmountCanvas: (() => void) | undefined;

  const meta: ModelerMeta = {
    notation: "lines",
    apiVersion: flaws.incompatibleApiVersion ? "9.9.9" : MODELER_API_VERSION,
    editable,
  };

  const elements: ElementsSurface = {
    list: () => ids().map((id, i) => ({ id, name: nameOf(entries[i]) })),
    reveal: (id) => {
      if (!editable && flaws.viewerCannotReveal) return false;
      const known = ids().includes(id);
      if (known) select([id]);
      return flaws.revealUnknownTrue ? true : known;
    },
    selection: () => [...selection],
    onSelection: (cb) => {
      selectionListeners.add(cb);
      return () => {
        if (!flaws.leakySelectionUnsubscribe) selectionListeners.delete(cb);
      };
    },
    bounds: boundsOf,
  };

  const interaction: InteractionSurface = {
    active: () => (flaws.interactionNeverActive ? false : reportedActive),
    onChange: (listener) => {
      interactionListeners.add(listener);
      return () => {
        if (!flaws.leakyInteractionUnsubscribe) interactionListeners.delete(listener);
      };
    },
  };

  const listedThemes: AppearanceTheme[] = flaws.themesEmpty
    ? []
    : flaws.themesDuplicated
      ? ["light", "light"]
      : flaws.themesUnknown
        ? ["light", "sepia" as AppearanceTheme]
        : flaws.listsDark || flaws.listsDarkDrawsLight || (!editable && flaws.viewerThemesDiffer)
          ? ["light", "dark"]
          : ["light"];
  let themeReads = 0;
  const appearance: AppearanceSurface = {
    get themes(): readonly AppearanceTheme[] {
      themeReads += 1;
      return flaws.themesVaryByRead && themeReads % 2 === 0 ? ["light", "dark"] : listedThemes;
    },
    set(request): void {
      if (flaws.appearanceThrowsBeforeImport && !imported) throw new Error("no canvas to draw on");
      if (flaws.appearanceThrowsOnUnknown && !KNOWN_THEMES.includes(request.theme)) {
        throw new Error(`unknown theme ${String(request.theme)}`);
      }
      const listed = listedThemes.includes(request.theme);
      const theme =
        flaws.appearanceDrawsUnlistedTheme || listed ? request.theme : (listedThemes[0] ?? "light");
      drawn = {
        theme: flaws.listsDarkDrawsLight ? "light" : theme,
        contrast: request.contrast === "high" ? "high" : "normal",
      };
      paint();
      if (flaws.appearanceEmits) emit();
      if (flaws.appearanceMovesView && view !== undefined) view = { ...view, zoom: view.zoom + 1 };
      if (flaws.appearanceClearsSelection) select([]);
      if (flaws.appearanceClearsUndo) {
        undoStack = [];
        redoStack = [];
      }
      if (flaws.appearanceCommitsInteraction) commitLabel();
      if (flaws.appearanceDropsInteraction) labelEditor = undefined;
    },
  };

  /** the import itself: it throws where importText rejects */
  const runImport = (text: string): ImportResult => {
    if (!editable && flaws.viewerImportThrows) throw new Error("No provider for commandStack");
    if (wedged) throw new Error("lines notation: parser wedged");
    const foreign = text.includes("%");
    if (
      flaws.echoImport ||
      (flaws.echoOnHistoryOnly && undoStack.length > 0) ||
      (flaws.echoOnForeignOnly && foreign) ||
      (!editable && flaws.viewerEmits)
    ) {
      emit(); // the drift: engines that emit while importing
    }
    const raw = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    // the toy notation's invalid form: a "!" line — rejected BEFORE any
    // state changes (L7: a rejected import leaves no trace)
    if (raw.some((line) => line.startsWith("!"))) {
      if (flaws.rejectResolves) return { warnings: ["ignored invalid input"] };
      if (flaws.rejectMutatesDoc) entries = [];
      if (flaws.rejectClearsUndo) undoStack = [];
      if (flaws.wedgeAfterReject) {
        wedged = true;
        entries = [];
      }
      if (flaws.rejectedImportEndsGesture && gesture) endGesture();
      throw new Error("lines notation: '!' lines are not importable");
    }
    // the flawed parser treats a text without its final newline as
    // truncated — and blanks the canvas before it rejects
    if (flaws.probeRejectionLeavesTrace && text !== "" && !text.endsWith("\n")) {
      entries = [];
      throw new Error("lines notation: truncated input");
    }
    // the text passed: a running gesture ends the way Escape ends it, before the
    // document it holds is replaced (L1, RECOMMENDED); a pan runs on
    if (gesture) {
      if (flaws.importDuringGestureEmits) emit();
      if (!flaws.importKeepsGesture) endGesture();
    }
    if (flaws.importEndsPan) pan = undefined;
    if (flaws.activeBeforeImport && !imported) report(false);
    const titleLine = raw.find((line) => line.startsWith("title: "));
    title = titleLine ? titleLine.slice("title: ".length) : "";
    const body = raw.filter((line) => !line.startsWith("title: "));
    // foreign content ('%' lines) is preserved as plain lines — unless the
    // stripping flaw drops what it does not understand
    const drops = flaws.dropForeign || (!editable && flaws.viewerDropsForeign);
    entries = (drops ? body.filter((line) => !line.startsWith("%")) : body).map(entryOf);
    if (!keepsHistory) {
      undoStack = [];
      redoStack = [];
    }
    // an import fits the view to the content (L5) — unless a flaw keeps it
    const keeps = flaws.noFitOnImport || (!editable && flaws.viewerKeepsView);
    if (!keeps || view === undefined) view = { ...fittedView };
    const reimport = imported;
    imported = true;
    importedBoxes = liveBoxes();
    importedContent = drawnContent();
    if (flaws.reimportDrawsOneMore && reimport && mountedRoot) {
      if (mountedRoot.querySelector(".reference-extra") === null) {
        const extra = mountedRoot.ownerDocument.createElement("span");
        extra.setAttribute("class", "reference-extra");
        mountedRoot.append(extra);
      }
    }
    if (flaws.appearanceForgottenOnImport) {
      mountedRoot?.removeAttribute("data-cd-theme");
      mountedRoot?.removeAttribute("data-cd-kontrast");
    }
    // the flawed import completes the open label editor once it rendered
    if (flaws.commitInteractionOnImport) commitLabel();
    // an import never commits an open label editor (L1): it stays open on
    // the element with the same id — with that element gone there is
    // nothing to reopen it on
    const target = labelEditor?.elementId;
    if (flaws.dropInteractionOnImport || target === undefined || !ids().includes(target)) {
      labelEditor = undefined;
    }
    return { warnings: [] };
  };
  /** the element command the harness's mutate runs */
  const addTheLine = (text: string): void => {
    // the conforming id is the one the text derives on every import; the
    // counter variant writes its id back, the in-memory variant does not
    createdCount += 1;
    const id = flaws.counterIds
      ? `line_${createdCount}`
      : flaws.idsChangeOnExport
        ? `tmp_${text}`
        : text;
    // snapshot-based undo, like real command stacks: undoing RESTORES the
    // pre-command document — kept across imports (staleUndo) that means
    // resurrecting the pre-import document, the exact tt drift. The delta
    // variant removes the created element by ID instead — a no-op on any
    // document that lacks it, a deletion on one that carries it
    const before = entries;
    if (flaws.emitBeforeApply) emit();
    entries = [...entries, { id, text, created: true }];
    const after = entries;
    mutated = true;
    undoStack.push(
      flaws.staleUndoDelta
        ? {
            undo: () => {
              entries = entries.filter((e) => e.id !== id);
            },
            redo: () => {
              entries = [...entries, { id, text }];
            },
          }
        : {
            undo: () => {
              entries = before;
            },
            redo: () => {
              entries = after;
            },
          },
    );
    redoStack = [];
    select([ids()[entries.length - 1] ?? id]);
    if (!flaws.emitBeforeApply && !flaws.silentMutation) emit();
  };
  const asError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));
  const importNow = (text: string): Promise<ImportResult> => {
    try {
      return Promise.resolve(runImport(text));
    } catch (e) {
      return Promise.reject(asError(e));
    }
  };
  /** the import, once something runs what `queue` holds */
  const importLater = (queue: Array<() => void>, text: string): Promise<ImportResult> =>
    new Promise((resolve, reject) => {
      queue.push(() => {
        try {
          resolve(runImport(text));
        } catch (e) {
          reject(asError(e));
        }
      });
    });

  const modeler: ReferenceModeler = {
    meta,
    elements,
    contentBounds,
    interaction,
    appearance,
    attachTo(host: Element): void {
      unmountCanvas?.();
      unmountCanvas = mountCanvas(host);
    },
    importText(text: string): Promise<ImportResult> {
      if (importsStuck) return new Promise(() => undefined);
      const duringACommand = !dropping && !activating && commandDepth > 0;
      const runsAtOnce = dropping
        ? flaws.importDuringDropRunsAtOnce
        : activating
          ? flaws.importAtDragStartRunsAtOnce
          : duringACommand &&
            (flaws.importDuringCommandRunsAtOnce ||
              (deleting && flaws.importDuringDeleteRunsAtOnce));
      if (runsAtOnce) return importNow(text);
      if (
        (dropping && flaws.importDuringDropNeverSettles) ||
        (duringACommand && flaws.importDuringCommandNeverSettles)
      ) {
        importsStuck = true;
        return new Promise(() => undefined);
      }
      if (dropping && flaws.importDuringDropSettlesEarly) {
        setTimeout(() => {
          try {
            runImport(text);
          } catch {
            // the flawed modeler reports nothing: its Promise has resolved already
          }
        }, 0);
        return Promise.resolve({ warnings: [] });
      }
      if (duringACommand && flaws.importDuringCommandSettlesEarly) {
        waitingImports.push(() => {
          try {
            runImport(text);
          } catch {
            // the flawed modeler reports nothing: its Promise has resolved already
          }
        });
        return Promise.resolve({ warnings: [] });
      }
      if (activating && flaws.importAtDragStartWaitsForTheDrop) {
        return importLater(afterTheUser, text);
      }
      // an import called during the user's action waits until the action has finished (1.6,
      // RECOMMENDED), so nothing the action still does meets the replaced document, and the imports
      // keep their call order
      if (actionDepth > 0 || (waitingImports.length > 0 && !flaws.waitingImportsOvertaken)) {
        const later = importLater(waitingImports, text);
        if (actionDepth === 0) queueWaitingImports();
        return later;
      }
      if ((flaws.importWaitsForGesture && gesture) || (flaws.importWaitsForPan && pan)) {
        return importLater(afterTheUser, text);
      }
      return importNow(text);
    },
    exportText(): string {
      touchBeforeImport();
      if (flaws.exportThrowsAfterMutate && mutated)
        throw new Error("BpmnDiOrdering: cannot serialize");
      // the broken variant stamps a footer line — a serializer that is not a
      // fixpoint of its own parser (every open/export round-trip grows the file)
      return flaws.nonCanonicalExport ? `${canonical()}# exported\n` : canonical();
    },
    onContentChanged(cb) {
      listeners.add(cb);
      return () => {
        if (!flaws.leakyUnsubscribe) listeners.delete(cb);
      };
    },
    getViewState: () => {
      if (view === undefined) {
        if (flaws.viewStateThrowsBeforeImport) throw new Error("no viewbox yet");
        return undefined;
      }
      // the diagram-js viewbox shape: the requested box plus derived keys,
      // rounded — a legitimate readback the kit must accept
      return flaws.enrichedViewStateReadback || flaws.readbackNotSettable
        ? enriched(view)
        : { ...view };
    },
    setViewState(state) {
      if (flaws.viewStateEmits) emit();
      if (flaws.commitInteractionOnViewChange) commitLabel();
      if (flaws.silentCommitInteractionOnViewChange) {
        muted = true;
        commitLabel();
        muted = false;
      }
      if (flaws.dropInteractionOnViewChange) labelEditor = undefined;
      if (flaws.noopViewState) return;
      if (state !== null && typeof state === "object") {
        // the flawed setter only takes the literal shape, never its own readback
        if (flaws.readbackNotSettable && "scale" in state) return;
        const { zoom, scrollX } = state as Partial<View>;
        view = { zoom: zoom ?? 1, scrollX: scrollX ?? 0 };
      }
    },
    destroy() {
      if (destroyed && flaws.destroyThrowsTwice) throw new Error("already destroyed");
      if (flaws.reportsAfterDestroy && gesture) {
        for (const listener of [...interactionListeners]) listener(false);
      }
      destroyed = true;
      unmountCanvas?.();
      unmountCanvas = undefined;
      labelEditor = undefined;
      gesture = undefined;
      pan = undefined;
      listeners.clear();
      selectionListeners.clear();
      interactionListeners.clear();
    },

    addLine(text: string): void {
      if (!editable) throw new Error("a viewer accepts no commands");
      touchBeforeImport();
      if (wedged) throw new Error("lines notation: parser wedged");
      if (flaws.ignoresCommandsBeforeImport && !imported) return;
      asCommand(() => addTheLine(text));
    },
    setTitle(next: string): void {
      asCommand(() => {
        title = next;
        if (!flaws.configEditSilent) emit();
      });
    },
    undoCommand(): void {
      asCommand(() => {
        const step = undoStack.pop();
        if (!step) {
          if (flaws.undoOnEmptyEmits) emit();
          return;
        }
        step.undo();
        deselectRemoved();
        redoStack.push(step);
        if (!flaws.silentUndo) emit();
      });
    },
    redoCommand(): void {
      asCommand(() => {
        const step = redoStack.pop();
        if (!step) return;
        step.redo();
        deselectRemoved();
        undoStack.push(step);
        if (!flaws.silentRedo) emit();
      });
    },
    editLabel(elementId: string, typed: string): void {
      if (!editable) throw new Error("a viewer accepts no commands");
      labelEditor = { elementId, text: typed };
    },
    openLabelEditor: () => (labelEditor ? { ...labelEditor } : undefined),
    commitLabel,
    canvasElement(): Element | undefined {
      return mountedCanvas;
    },
    holdGesture(kind: GestureKind): HeldGesture {
      if (!editable) throw new Error("a viewer accepts no commands");
      if (!imported) throw new Error("lines notation: no document to hold a gesture on");
      const held = {
        kind,
        elementId: kind === "move" ? ids()[0] : undefined,
        previousSelection: [...selection],
      };
      gesture = held;
      // diagram-js activates the drag: it empties the selection, whose listeners may import, and
      // then reads the drag again
      asUserAction(() => {
        activating = true;
        try {
          select([]);
          if (gesture !== held)
            throw new TypeError("Cannot read properties of null (reading 'cursor')");
          report(true);
        } finally {
          activating = false;
        }
      });
      return {
        drop: () => drop(held),
        cancel: () => {
          if (gesture !== held) return;
          gesture = undefined;
          if (!flaws.cancelNotReported) report(false);
          runWhatWaitedForTheUser();
        },
      };
    },
    armLasso(): void {
      lassoArmed = true;
      if (flaws.armedToolIsGesture) report(lassoArmed);
    },
    holdPan(): HeldPan {
      if (view === undefined) throw new Error("lines notation: no view to pan");
      const held = { from: view.scrollX, steps: 1 };
      pan = held;
      view = { ...view, scrollX: view.scrollX + PAN_STEP };
      if (flaws.panIsGesture) report(true);
      return {
        move: () => {
          if (pan !== held || view === undefined) return;
          held.steps += 1;
          const scrollX = flaws.panJumpsBack
            ? held.from + held.steps * PAN_STEP
            : view.scrollX + PAN_STEP;
          view = { ...view, scrollX };
        },
        drop: () => {
          if (pan !== held) return;
          pan = undefined;
          if (flaws.panIsGesture) report(false);
          if (flaws.panEmits) emit();
          runWhatWaitedForTheUser();
        },
      };
    },
    exportSvg(): string {
      const drawnAs =
        flaws.appearanceInImage && drawn
          ? ` data-cd-theme="${drawn.theme}" data-contrast="${drawn.contrast}"`
          : "";
      const text = canonical().replace(/&/g, "&amp;").replace(/</g, "&lt;");
      return `<svg xmlns="http://www.w3.org/2000/svg"${drawnAs}><text>${text}</text></svg>`;
    },

    moveLine(elementId: string, dx: number, dy: number): void {
      if (!editable) throw new Error("a viewer accepts no commands");
      asCommand(() => {
        const before = entries;
        const reported = ids();
        entries = entries.map((e, i) =>
          reported[i] === elementId
            ? {
                ...e,
                ...(flaws.moveChangesId ? { id: `${e.id}_moved` } : {}),
                at: { x: (e.at?.x ?? 0) + dx, y: (e.at?.y ?? 0) + dy },
              }
            : e,
        );
        const after = entries;
        undoStack.push({
          undo: () => {
            entries = before;
          },
          redo: () => {
            entries = after;
          },
        });
        redoStack = [];
        emit();
      });
    },
  };
  return modeler;
}
