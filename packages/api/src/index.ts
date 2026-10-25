/**
 * @miragon/modeler-api — ONE interface every Miragon modeler implements.
 *
 * The contract encodes, as REQUIREMENTS, the behavioral drift that had to be
 * discovered per modeler against engine internals before it existed:
 * an `importDSL` that emitted change events (rewriting hand-authored files on
 * open), an import that left the undo stack on stale removed shapes, a
 * serializer that was not a byte fixpoint. A host embedding a conforming
 * modeler needs no per-engine suppression tricks — the laws below hold.
 *
 * The conformance test kit (`@miragon/modeler-api/conformance`) turns each
 * law into an executable case the modeler repo runs in its own CI.
 */

/** the semver of THIS contract — a modeler declares the version it implements
 *  in `meta.apiVersion`; hosts check compatibility with `apiVersionsCompatible`
 *  (same major; while 0.x, the same minor too). The constant IS the
 *  package version: release-please rewrites the literal below on every
 *  release (release-please-config.json `extra-files`), and the kit's own
 *  test pins it to package.json exactly. Modelers pin the npm package; the
 *  constant is what travels in `meta`. */
export const MODELER_API_VERSION = "1.4.0"; // x-release-please-version

/**
 * apiVersion compatibility: same major — and, while the contract is 0.x,
 * the same minor too (pre-1.0 minors may break; bump-minor-pre-major).
 * Hosts call it at bind time with `meta.apiVersion` and their own
 * MODELER_API_VERSION; it lives in the package root so that check never
 * pulls the conformance kit into a host bundle (`/conformance` re-exports it)
 */
export function apiVersionsCompatible(a: string, b: string): boolean {
  const [aMajor = "", aMinor = ""] = a.split(".");
  const [bMajor = "", bMinor = ""] = b.split(".");
  if (aMajor !== bMajor) return false;
  return aMajor !== "0" || aMinor === bMinor;
}

export interface ModelerMeta {
  /** stable notation id, e.g. "wardley", "team-topology", "event-storming" */
  readonly notation: string;
  /** the MODELER_API_VERSION this modeler implements — compatible when the
   *  major matches and, while the contract is 0.x, the minor too (pre-1.0
   *  minors may break: bump-minor-pre-major) */
  readonly apiVersion: string;
  /**
   * true on an editing mount (the package's Modeler), false on a VIEWER
   * (its NavigatedViewer/Viewer): a viewer never fires `onContentChanged`,
   * accepts no user commands, and still imports, exports, reveals and
   * reports view state exactly like the editor — hosts mount it on
   * read-only surfaces (an MCP-App widget in read-only mode) without
   * per-package knowledge or a command-stack shim.
   */
  readonly editable: boolean;
}

export interface ImportResult {
  /** non-fatal notes from the import (unknown lines kept, migrations run) */
  warnings: string[];
}

export interface ElementInfo {
  /**
   * stable element id — identical across re-imports of the same text AND
   * untouched by edits to OTHER elements: hosts anchor todos, presence and
   * `?element=` deep links to it, so an id that renumbers when a line is
   * inserted above (positional edge ids) breaks every anchor below it. An
   * element without an id in the text gets one the serializer WRITES BACK.
   *
   * The id a session reports IS the element's id in the document: after
   * `exportText()` → `importText()` — in this instance or in any other one
   * (a peer, the viewer, the next session) — the element carries the same
   * id. An id that lives only in memory anchors nothing: the todo or deep
   * link a host stored against it points nowhere once the text travels.
   *
   * RECOMMENDED: when two peers create different elements at the same time,
   * their ids do not collide. An id allocated regardless of the content —
   * a per-instance counter (`event_1` on both peers) — does: once both edits
   * merge into one document, two elements share one id; random or
   * peer-scoped ids do not. An id derived from the content (OWM's
   * `component_<slug>`) collides only when both users create the same
   * content, which the merge has to reconcile anyway.
   */
  id: string;
  /** human label, when the notation has one */
  name?: string;
}

/** a box in diagram coordinates: an element's, as `ElementsSurface.bounds`
 *  reports it, or the content's, as `CollaborativeModeler.contentBounds` does */
export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Optional element surface — what a host needs for anchored todos, `?element=`
 * deep links and the selection half of live presence. Absent = the notation
 * has no addressable element identity. Ids are ELEMENT ids throughout: a
 * shape that only labels another element (diagram-js external labels) is
 * reported and revealed as its target, never under its own label id.
 */
export interface ElementsSurface {
  /** every addressable element currently on the canvas */
  list(): ElementInfo[];
  /** select + scroll the element into view; false when the id is unknown.
   *  Revealing is view behavior: it delivers a selection, never a change event */
  reveal(id: string): boolean;
  /** the current selection as stable element ids — synchronous, so a host
   *  can read it at the moment of a click (a deep link carrying the
   *  selection) without caching every delivery */
  selection(): string[];
  /** selection changes as STABLE element ids; returns the unsubscribe */
  onSelection(cb: (ids: string[]) => void): () => void;
  /**
   * the element's box in DIAGRAM coordinates — the canvas's own coordinate
   * space, which zoom and scroll leave alone (a host maps it to the screen
   * with the current view, or draws in a layer that moves with the canvas) —
   * or `undefined` for an id `list()` does not report. Optional (1.2): hosts
   * feature-detect it for presence outlines and todo markers instead of
   * reaching into the engine.
   *
   * It reads the LIVE canvas: an element created, moved, resized or renamed
   * in this session has its current box at once, not the one of the last
   * import — a host outlining a peer's selection would otherwise draw it
   * where the element was, or not at all, until the next import. The box is
   * the element's own shape (a connection: the box around its waypoints); an
   * external label is not part of it.
   */
  bounds?(id: string): ElementBounds | undefined;
}

/**
 * The collaborative-modeler contract. The LAWS (verified by the conformance
 * kit) are part of the interface:
 *
 *  L1 SILENT IMPORT — `importText` never fires `onContentChanged` and erases
 *     the undo history without emitting — also when history exists. Hosts
 *     re-import remote states on every sync; an import echo would re-export
 *     the canonical serialization over half-typed peer text.
 *     An interaction in progress when an import runs (an open label editor,
 *     a popup with typed input) never commits during or because of the
 *     import: no change event comes from it, its input lands neither in the
 *     imported document nor on its fresh undo history, and nothing is
 *     applied to an element the import removed. RECOMMENDED: keep the typed
 *     input and reopen the interaction on the element with the same id when
 *     that element is still there after the import — a remote re-import
 *     should not cost the user what they were typing.
 *  L2 CANONICAL FIXPOINT — `exportText` is deterministic, and for any text t:
 *     with c = exportText() after importText(t), importText(c) followed by
 *     exportText() returns c byte-for-byte. Canonicalization is idempotent;
 *     opening a file never rewrites it.
 *  L3 ONE CHANGE EVENT — every user-visible atomic change (element commands
 *     AND config/axis/title/style edits that live in the document, AND
 *     undo/redo) fires `onContentChanged` at least once, and nothing else
 *     does: not `importText`, not undo-history housekeeping, not view or
 *     selection changes. When a listener runs, `exportText()` ALREADY
 *     returns the post-change serialization — hosts export inside the
 *     listener; an emit-before-apply would lose the last edit.
 *  L4 DEFINED UNDO ACROSS IMPORTS — undo directly after an `importText` is a
 *     no-op: it must never mutate or resurrect shapes from the pre-import
 *     document (id coincidence included).
 *  L5 VIEW-STATE ROUND-TRIP — `getViewState`/`setViewState` survive a
 *     re-import: snapshot before, restore after, viewport unchanged. An
 *     import leaves the view FITTED to the content (the defined post-import
 *     view, the same for the same document and host — a host that wants to
 *     keep the user's viewport across a remote re-import snapshots before
 *     and restores after, and one that fits the view itself passes
 *     `fitOnImport: false` and fits to `contentBounds()`, 1.3, where the
 *     modeler has it); before the first import `getViewState()` returns
 *     `undefined` or a state `setViewState` accepts, and never throws. The
 *     readback may be a NORMALISED form of what was set (a diagram-js
 *     viewbox comes back rounded, with scale/inner/outer) — what must hold
 *     is that setting a readback yields that readback again.
 *     A view change the HOST makes — `setViewState`, or a fit its chrome
 *     applies to the canvas — never commits an interaction in progress (an
 *     open label editor, a popup with typed input): no change event, the
 *     export unchanged. Hosts restore the viewport after every remote
 *     re-import and refit when their chrome changes; a commit there writes
 *     the half-typed input into the shared document for every peer.
 *     RECOMMENDED: the interaction stays open with its typed input, so the
 *     user's own commit afterwards writes what it would have written without
 *     the view change.
 *  L6 EXPORT IS TOTAL AFTER IMPORT — after a successful import (and any
 *     sequence of user commands and undos), `exportText` succeeds. Foreign or
 *     auxiliary content the modeler does not understand is PRESERVED through
 *     import → export (it comes back in the export, canonicalised like the
 *     rest), never dropped and never a reason to throw.
 *  L7 REJECTED IMPORTS LEAVE NO TRACE — `importText` on non-importable text
 *     REJECTS (resolve-with-warnings means "imported, with notes"; rejection
 *     means "nothing imported"). This holds for EVERY rejection, whatever
 *     the input (a truncated or half-typed text included): afterwards the
 *     previously imported document is still rendered with its elements,
 *     `exportText` still returns it, no change event has fired and the undo
 *     history is untouched.
 *     The modeler stays USABLE: the next valid import renders, the next user
 *     command applies. Hosts re-import half-typed peer text on every sync —
 *     "blank (or wedged) until healed" is not an acceptable failure mode.
 *
 *  View state is NEVER part of the document: `setViewState` fires no change
 *  events and `exportText` is independent of it.
 *
 *  KEYS STAY ON THE CANVAS (1.4, RECOMMENDED) — a modeler acts on a key only
 *  while its CANVAS holds the focus: the key's target is the focusable
 *  element the modeler placed in the host to take its keys (diagram-js: the
 *  canvas `<svg>`, `tabindex="0"`) or lies inside it. Every other key is the
 *  page's: one aimed at the host's chrome or at a host editor (a button, a
 *  text input, a select, a contenteditable, an EditContext or Monaco
 *  editor), beside the modeler's container, inside it or next to the canvas
 *  in a host's overlay, and one whose target is `<body>` (nothing focused:
 *  after a load, after a click on page text, while the host hides the canvas
 *  or makes it inert). The modeler leaves such a key alone: no command, no
 *  change of the document or the selection, no `preventDefault()` and no
 *  `stopPropagation()`, in the capture phase too. A keydown or keyup
 *  without a string `key` (browser autofill dispatches both) is ignored
 *  without an error. The rule holds for the viewer mount too. Hosts embed
 *  modelers next to their own editors and toolbars: a key the canvas takes
 *  from there deletes the selection while the user types, undoes the last
 *  edit from a toolbar button or swallows Cmd/Ctrl+C in a text field. The
 *  modeler's own chrome (its palette, context pad, label editor) handles its
 *  keys as it sees fit; a host that wants keyboard editing hands the canvas
 *  the focus (a click on it, Tab, or `focus()` on the canvas element).
 */
export interface CollaborativeModeler {
  readonly meta: ModelerMeta;

  /** mount the canvas into a host element (once, before the first import).
   *  The host must be attached to the document with a non-zero size — a
   *  detached or 0×0 element gives diagram-js engines NaN viewboxes.
   *  Calls made between mounting and the first import (`exportText()`, a
   *  user command) return whatever the modeler defines, or throw (only
   *  `getViewState` never does, L5), but they never wedge the instance:
   *  the first `importText` still behaves exactly as specified. RECOMMENDED
   *  (1.4): the canvas placed here takes keys only while it holds the focus
   *  (KEYS STAY ON THE CANVAS above) */
  attachTo(host: Element): void;

  /** parse + render `text` — SILENT per L1, the view fitted to the content
   *  per L5; resolves when rendered, REJECTS when nothing was imported (L7).
   *  This holds for the first import too, whatever was called before it — a
   *  host may export or route a command before its first document arrives */
  importText(text: string): Promise<ImportResult>;

  /** the canonical serialization of the current document (L2, L6) */
  exportText(): string;

  /** subscribe to user-visible model changes (L3); returns the unsubscribe */
  onContentChanged(cb: () => void): () => void;

  /** opaque viewport snapshot (zoom/scroll) — JSON-serializable (L5) */
  getViewState(): unknown;
  setViewState(state: unknown): void;

  /**
   * the box of the CONTENT in diagram coordinates — what a host fits the
   * view to when it fits itself (`fitOnImport: false`, the modeler shell's
   * viewport) — or `undefined` while there is nothing to fit (an empty
   * diagram). Optional (1.3): hosts feature-detect it (`typeof
   * modeler.contentBounds === "function"`) instead of reaching into a
   * renderer's services; a renderer's own fit stays its business (L5).
   *
   * The content is everything the canvas draws of the document: the box
   * covers every box `elements.bounds` reports, and whatever the notation
   * always draws (Wardley's plot with its axes — a map without components
   * still has a box, so `undefined` is no emptiness test). It is tight: no
   * padding and no room for chrome of its own, since a host's fit adds its
   * margins (the shell's fit insets) on top. Like `elements.bounds` it is in
   * the canvas's own coordinate space, which zoom and scroll leave alone,
   * and it reads the LIVE canvas: an element created or moved in this
   * session counts at once. A browser measures SVG text differently at each
   * zoom (Chromium lays it out at the scaled font size), so a renderer
   * computes the box from its model, or measures it once per content change
   * and keeps it across view changes. Before the first import it returns
   * `undefined` or a box, and never throws. A viewer that exposes it follows
   * the same rules. It sits next to the view state rather than on `elements`: a fit
   * frames the whole canvas, and a notation without addressable elements
   * still has content to fit.
   */
  contentBounds?(): ElementBounds | undefined;

  readonly elements?: ElementsSurface;

  /** tear down DOM + listeners; further calls on the instance are undefined
   *  behavior, but a second destroy() must not throw */
  destroy(): void;
}

/** px the host's chrome covers along the edges of the modeler's container */
export interface FreeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** a point in diagram coordinates */
export interface DiagramPoint {
  x: number;
  y: number;
}

/**
 * The FREE AREA: the part of the canvas no host chrome covers (Miragon
 * guide §5.9). Keyboard creation places a new element in its centre (§5.5)
 * and a renderer that constrains panning keeps the content reachable around
 * it, so both agree with a host that fits into the same rectangle. A host
 * passes ONE of two forms, each a function the renderer reads whenever it
 * needs it (the chrome changes when an inspector or a legend opens):
 *
 *  - `insets`: what the chrome covers, in px from the container's edges
 *    (the modeler shell's `shell.fitInsets()`); the renderer computes the
 *    centre itself, the way a fit does;
 *  - `center`: the centre itself, in diagram coordinates, `undefined` while
 *    there is none (a 0×0 container) — the shell's `viewport.freeRectCenter()`.
 *
 * A renderer accepts both. One that needs the rectangle itself (a pan
 * constraint) and is given only `center` works there as it does without
 * the option: it assumes no host chrome, with whatever margins of its own
 * it uses then.
 *
 * The post-import fit (`fitOnImport`, L5's fitted view) MAY use the free
 * area: given `insets` a renderer may fit into the free rectangle or keep
 * its own fit, and given only `center`, which names no rectangle, it MAY fit
 * as it does without the option, keeping the padding it uses then (Context
 * Maps keeps the room its palette needs) — the reading all five published
 * renderers conform to, which no kit case checks; a host whose first view
 * must leave its chrome free passes `fitOnImport: false` and fits itself.
 */
export type FreeArea =
  | { insets: () => FreeAreaInsets; center?: never }
  | { center: () => DiagramPoint | undefined; insets?: never };

/**
 * The options a renderer's contract factory takes under THESE names once it
 * implements contract 1.2, so a host feeds every notation the same object
 * instead of one spelling per renderer. A renderer extends the type with its
 * own options (diagram-js `additionalModules`); the contract fixes names,
 * meaning and defaults. A viewer factory takes the same type and ignores
 * what has no meaning without editing (`undoRedoKeys`).
 *
 * Each renderer adopts them in its own release, as part of its move to 1.2:
 * `meta.apiVersion` follows the pinned package and no kit case checks the
 * options, so the version alone does not tell a host they are honoured.
 * Until a renderer ships them, a host passes the renderer's own names, or
 * both. Those names then stay accepted as DEPRECATED aliases for one minor
 * release of that renderer, then go: `freeRectInsets` (Wardley, Event
 * Storming, Context Maps) is `freeArea: { insets }`, `freeRectCenter` (Team
 * Topologies, Value Chain) is `freeArea: { center }`, and Wardley's
 * `keyboard: { undoRedo }` is `undoRedoKeys`. Given both, the aligned name
 * wins.
 */
export interface CollaborativeModelerOptions {
  /** where the host's chrome leaves the canvas free; default: the whole container */
  freeArea?: FreeArea | undefined;
  /**
   * fit the content into the view after every import — default true, the
   * fitted view L5 defines. A host whose chrome fits the content itself
   * (the modeler shell's viewport fits into the free area) passes false:
   * the post-import view is then the host's to set, and L5's fit is the
   * host's fit. The conformance kit runs with the default. Whether the
   * renderer's own fit uses `freeArea` is its choice (see `FreeArea`): with
   * `insets` it may fit into the free rectangle, with only `center` it may
   * keep the padding it uses without the option
   */
  fitOnImport?: boolean | undefined;
  /**
   * bind Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y to the canvas history —
   * default true. A host that owns the document's history (VS Code) passes
   * false, and the keys reach it unprevented; text fields keep their own
   * undo either way
   */
  undoRedoKeys?: boolean | undefined;
}
