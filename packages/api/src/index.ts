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
export const MODELER_API_VERSION = "1.5.0"; // x-release-please-version

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
 *     RECOMMENDED (1.5): a GESTURE (a drag or a placement the modeler runs
 *     for the pointer, also while its preview is off the canvas; defined on
 *     `InteractionSurface`) that runs when an import replaces the document
 *     is cancelled first, the way Escape cancels it, and so is a press that
 *     has not reached the drag threshold yet. No change event comes from it
 *     and no exception, the pointer's release after the import included;
 *     nothing is applied to an element the import removed, and the export
 *     is the imported document. The cancel belongs to an import that is
 *     accepted: it comes after the text passed the modeler's checks, before
 *     the canvas is cleared, so a rejected import (L7, which hosts meet on
 *     every sync of half-typed peer text) leaves a running gesture, and
 *     `interaction.active()`, as they were. diagram-js does not end a drag
 *     on `diagram.clear()`: the drop then throws on a removed shape and
 *     loses the move (or leaves the command stack stuck), so a renderer
 *     calls `dragging.cancel(false)` before the import clears the canvas
 *     (`false`: no restore of the drag's previous selection, whose shapes
 *     the import replaces).
 *     RECOMMENDED (1.6): an `importText` called while a DROP runs (a host
 *     that imports from `onContentChanged`, which the drop's command fires)
 *     waits until the drop has ended, so no later step of the drop meets the
 *     replaced document (diagram-js's `SelectionBehavior` selects the moved
 *     shape again after the move and throws on one the import removed); its
 *     Promise settles after that import, nothing of the drop applies to the
 *     imported document, and the drop's command stays off its fresh undo
 *     history (L4). A PAN is no gesture: an import leaves a running pan
 *     running, and the pan goes on from the view the import left, never
 *     putting the view from before the import back (`InteractionSurface`).
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
   *  host may export or route a command before its first document arrives.
   *  RECOMMENDED (1.5): an accepted import first cancels a gesture the user
   *  holds; a rejected one leaves it running (L1). RECOMMENDED (1.6): one
   *  called while a drop runs waits until the drop has ended and settles after
   *  that import, and one called during a pan leaves the pan running (L1) */
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

  /** optional (1.5): whether the user holds a gesture on the canvas, so a
   *  host defers a remote re-import until it ends (`InteractionSurface`) */
  readonly interaction?: InteractionSurface;

  /** optional (1.5): the themes the modeler can draw and the host's request
   *  for one (`AppearanceSurface`) */
  readonly appearance?: AppearanceSurface;

  /** tear down DOM + listeners; further calls on the instance are undefined
   *  behavior, but a second destroy() must not throw */
  destroy(): void;
}

/**
 * Optional interaction surface (1.5): whether the user holds a GESTURE on
 * the canvas right now. A host with a live sync defers a remote re-import
 * while one runs, instead of reading the engine's DOM (diagram-js's
 * `djs-drag-active`, `djs-dragger` and `djs-cursor-grabbing` classes) and
 * sending a synthetic Escape. Hosts feature-detect it
 * (`modeler.interaction !== undefined`).
 *
 * A GESTURE is a drag or a placement the modeler runs for the pointer. It
 * starts when a press on the canvas moves past the drag threshold (a move,
 * resize, connect, bendpoint, lasso or space-tool drag), or when an entry of
 * the modeler's own chrome (the palette, the context pad), clicked or
 * dragged, starts a preview that follows the pointer (a create, an append, a
 * connect, a placement such as Wardley's evolve). It runs until its drop
 * (the release, or the click that places what the preview shows) or its
 * cancel (Escape, or an import: L1). A preview still off the canvas, the
 * pointer over the palette, runs too. No gesture: a press that has not
 * reached the drag threshold yet, a palette tool that only waits for its
 * next press (an armed hand, lasso, space or global-connect tool; the press
 * that starts its drag starts the gesture), an open label editor or popup
 * (L1 keeps it across an import, and a host that waited for it would hold
 * every remote change while the user types), and keys. A drag that only pans
 * the view is none either (RECOMMENDED since 1.6; 1.5 said it MAY count):
 * `active()` stays false while the user pans, although diagram-js's hand
 * tool runs on the same dragging service, and an import leaves the pan
 * running (L1). A viewer has no editing gesture: one that exposes the surface
 * reports false, a pan included.
 *
 * A host that defers re-imports while `active()` is true applies the newest
 * remote state once `onChange` reports false. It may still import during a
 * gesture (after a timeout of its own, or for a file the user opens): the
 * RECOMMENDED cancel of L1 then ends the gesture, and that import replaces
 * the remote state the host deferred. The contract defines no imports that
 * overlap, so a host starts each import once the one before has settled.
 */
export interface InteractionSurface {
  /** true from a gesture's start until its drop or cancel, false otherwise:
   *  at rest, before the first import and while a palette tool is only
   *  armed. Synchronous; never throws */
  active(): boolean;
  /**
   * called with the new value each time `active()` changes: once with true
   * when a gesture starts and once with false when it ends, never twice in a
   * row with the same value, and never for a tool that is only armed. Inside
   * the listener `active()` already returns that value. It runs
   * synchronously where the gesture ends, which can be inside `importText`
   * (the cancel of L1) or inside a pointer event handler, so a host that
   * imports in response never calls `importText` from the listener: it
   * queues the import behind any import still pending, which a microtask
   * alone does not do. Returns the unsubscribe; nothing is called after
   * `destroy()`
   */
  onChange(cb: (active: boolean) => void): () => void;
}

/** a theme a modeler can draw: a value of the Miragon guide's
 *  `data-cd-theme` (§13.3); "system" is the host's to resolve, never a theme */
export type AppearanceTheme = "light" | "dark";

/** the contrast a host requests: "high" is the Miragon guide's
 *  `data-cd-kontrast="hoch"` (§13.3) */
export type AppearanceContrast = "normal" | "high";

/** what a host requests through `AppearanceSurface.set` */
export interface AppearanceRequest {
  theme: AppearanceTheme;
  /** default "normal" */
  contrast?: AppearanceContrast | undefined;
}

/**
 * Optional appearance surface (1.5): the themes the modeler can draw and the
 * host's request for one (Miragon guide §13.3, row "Eingebettet", and
 * §13.5). Hosts feature-detect it (`modeler.appearance !== undefined`). A
 * modeler without it draws light only: a host treats it as
 * `themes: ["light"]` and requests nothing. Such a modeler takes its mode
 * from the page around it (a renderer on the Miragon design tokens resolves
 * its roles at the nearest `data-cd-theme` above it), so a host whose page
 * can be dark keeps it light itself: it writes `data-cd-theme="light"`, and
 * `data-cd-kontrast="hoch"` for high contrast, on the element it passes to
 * `attachTo` (guide §13.3: in a foreign page the attributes sit on the
 * modeler's container).
 *
 * The host decides in one place (guide §13.5): it requests only a theme
 * `themes` lists (`themes[0]` when the one it wants is missing; the modeler
 * shell's `resolveAppearance(requested, themes)` decides this) and draws its
 * own chrome around the canvas in the theme the modeler draws, so no surface
 * is half dark.
 *
 * The appearance is view state, never document: `set` fires no
 * `onContentChanged` (L3), leaves `exportText()` byte-identical and every
 * image export the modeler offers too (exports are always light, guide
 * §10.7), and leaves the undo history, the view state and the selection as
 * they were. Like a host's view change (L5) it never commits an interaction
 * in progress; RECOMMENDED: the interaction stays open with its typed input.
 */
export interface AppearanceSurface {
  /**
   * the themes the modeler can draw, the one it falls back to first:
   * non-empty, without duplicates. Fixed before the modeler runs (guide
   * §13.5): readable as soon as the factory returns, before `attachTo`, so a
   * host paints its first frame in the right mode, and the same on every
   * read, on every instance of the package and on its viewer. A light-only
   * modeler reports `["light"]`. The Miragon modelers list "light" first and
   * move to `["light", "dark"]` in one release, never one of them alone
   * (guide §13.5)
   */
  readonly themes: readonly AppearanceTheme[];
  /**
   * the host's request: the modeler draws `theme` when `themes` lists it and
   * `themes[0]` otherwise, so a light-only modeler stays light when dark is
   * requested, whatever mode the page around it shows. The contrast always
   * applies: "high" draws the modeler's high-contrast form in the theme it
   * draws (a light-only modeler under a dark high-contrast host: light with
   * high contrast), "normal" or none draws normal contrast. Each call
   * replaces the previous request whole, so a request without `contrast`
   * ends high contrast. A theme or contrast the modeler does not know (from
   * an untyped host) counts as an unlisted theme or as normal contrast;
   * `set` never throws.
   *
   * Callable as soon as the factory returns, before `attachTo` and before
   * the first import (the first frame then shows the requested appearance),
   * and at any time until `destroy()`. It applies before it returns, without
   * a re-import, and holds across every later import until the next `set`.
   * Until the first `set` the modeler draws as it does without the surface.
   * How it draws a theme is its own: a renderer on the Miragon design tokens
   * writes `data-cd-theme` and, for high contrast, `data-cd-kontrast="hoch"`
   * on the root element of what it draws, so the token CSS resolves its
   * roles there and not from the page
   */
  set(appearance: AppearanceRequest): void;
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
 * Every Miragon renderer takes these names and no others: the renderers'
 * own earlier names (`freeRectInsets`, `freeRectCenter` and Wardley's
 * `keyboard: { undoRedo }`) are gone since wardley-renderer 0.12.0,
 * event-storming-renderer 0.6.0, team-topologies-renderer 0.15.0,
 * context-maps-renderer 0.7.0 and value-chain-renderer 0.8.0. A host that
 * still passes one gets the option's default (TypeScript rejects the name
 * in an object literal).
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
