# @miragon/modeler-api

ONE interface every Miragon modeler implements: the collaborative-modeler
contract and its conformance test kit.

## Why

Embedding a modeler in a collaborative host (a shared Y.Text, re-imports on
every remote change) exposes behavioral details that are invisible in
standalone use. Before this contract existed, each drift had to be discovered
per modeler, against its engine internals:

- an `importDSL` that ran `commandStack.clear()` **emitting** a change event:
  unsuppressed, opening a hand-authored file re-exported the canonical
  serialization over it;
- an import that left the undo stack on stale, removed shapes: undo after a
  co-editor's change silently no-op'd or deleted re-imported shapes by id
  coincidence;
- a serializer that was not a byte fixpoint of its own parser;
- config/axis edits that fired their own event instead of the command stack,
  so a host observing only the stack lost them.

This package turns those lessons into **laws** (see the JSDoc on
`CollaborativeModeler`) and ships a **conformance kit** that makes every law
an executable test the modeler repo runs in its own CI. Drift fails the
modeler's build, not a downstream integration review.

## The contract (1.x)

```ts
import type { CollaborativeModeler } from "@miragon/modeler-api";
```

| Law | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| L1  | `importText` is **silent**: no change events, undo history erased without emitting, also over existing history and foreign content; an interaction open during an import (a label editor with typed input) never commits; RECOMMENDED (1.5): an accepted import first cancels a running gesture; RECOMMENDED (1.6): an import called during a running user action (a drop, the start of a drag, a command) waits until the action has finished, imports keep their call order, and a pan runs on through an import |
| L2  | `exportText` is **canonical**: deterministic, a byte fixpoint on canonical input, idempotent otherwise                                                                                                                                                                                                                                                                                                                                                                                                             |
| L3  | `onContentChanged` fires for **every** user-visible change (element commands, config/axis/title edits, undo/redo) and nothing else; inside a listener `exportText()` already returns the new document                                                                                                                                                                                                                                                                                                              |
| L4  | undo directly after an import is a defined **no-op**, never a stale-history mutation                                                                                                                                                                                                                                                                                                                                                                                                                               |
| L5  | view state survives a re-import; an import leaves the view **fitted** to the content; the readback may be a normalised form of what was set; a host's view change (`setViewState`, a fit) never **commits** an open interaction                                                                                                                                                                                                                                                                                    |
| L6  | `exportText` is total after a successful import; foreign content is **preserved** through import → export, never dropped, never a throw                                                                                                                                                                                                                                                                                                                                                                            |
| L7  | EVERY rejected import leaves no trace (previous document still rendered and exported, no events, undo history untouched), and the modeler **stays usable**                                                                                                                                                                                                                                                                                                                                                         |

View state is never part of the document: `setViewState` fires no change
events and `exportText` is independent of it.

Calls made before the first import (`exportText()`, a user command) may
return or throw whatever the modeler defines, but never wedge the instance:
the first `importText` still renders and resolves as specified.

`meta.editable` tells a viewer mount from an editor: a package that ships a
`NavigatedViewer`/`Viewer` exposes it under the same contract with
`editable: false`: it imports, exports, reveals and reports view state like
the editor and never fires `onContentChanged`, so hosts mount it on read-only
surfaces without per-package knowledge. A viewer must import without a
command stack of its own, or register one: the kit's viewer case fails a
`NavigatedViewer` whose import clears a stack it never registered.

Optional `elements` surface (stable ids, `reveal`, a synchronous `selection()`
and selection events) powers host features like anchored todos, `?element=`
deep links and the selection half of live presence. Ids are ELEMENT ids
(a label shape resolves to its target) and survive edits to other elements:
positional ids that renumber when a line is inserted above break every anchor
below. The id a session reports is the element's id in the DOCUMENT: after
`exportText()` → `importText()`, in this instance or any other (a peer, the
viewer, the next session), the element carries the same id. An element
created in the session gets an id the serializer writes back, never one that
lives only in memory. RECOMMENDED: when two peers create different elements
at the same time, their ids do not collide: random or peer-scoped ids, not a
per-instance counter such as `event_1`. An id derived from the content (OWM's
`component_<slug>`) collides only when both users create the same content,
which the merge has to reconcile anyway.

Optional `elements.bounds(id)` (1.2) gives the element's box in DIAGRAM
coordinates (`{ x, y, width, height }`, the canvas's own space, which zoom and
scroll leave alone), or `undefined` for an id `list()` does not report. Hosts
feature-detect it (`typeof modeler.elements?.bounds === "function"`) for
presence outlines and todo markers instead of reaching into the engine. It
reads the live canvas: an element created, moved, resized or renamed in the
session has its current box at once, not the one of the last import. The box
is the element's own shape (a connection: the box around its waypoints),
without an external label.

Optional `contentBounds()` (1.3) gives the box of the CONTENT in diagram
coordinates: what a host fits the view to when it fits itself
(`fitOnImport: false`, the modeler shell's viewport), or `undefined` while
there is nothing to fit (an empty diagram). Hosts feature-detect it
(`typeof modeler.contentBounds === "function"`) instead of reaching into a
renderer's services (Wardley's `panConstraint`). The content is everything the
canvas draws of the document: the box covers every `elements.bounds` box and
whatever the notation always draws (Wardley's plot with its axes, so a map
without components still has a box and `undefined` is no emptiness test). It
is tight, with no padding of its own: a host's fit adds its margins. Like
`elements.bounds` it ignores zoom and scroll, reads the live canvas, and before
the first import returns `undefined` or a box without throwing. A browser
measures SVG text differently at each zoom (Chromium lays it out at the scaled
font size), so a renderer computes the box from its model, or measures it once
per content change and keeps it across view changes. A viewer that exposes it
follows the same rules. It sits on the modeler next to the view state rather
than on `elements`: a fit frames the whole canvas, and a notation without
addressable elements still has content to fit.

An interaction in progress during an import (an open label editor, a popup
with typed input) never commits during or because of it (L1): no change
event, nothing in the imported document or on its undo history, nothing
applied to an element the import removed. RECOMMENDED: keep the typed input
and reopen the interaction on the element with the same id when it is still
there, since hosts re-import remote states while the user is typing.

A **gesture** is a drag or a placement the modeler runs for the pointer: from
the moment a press on the canvas moves past the drag threshold (a move, resize,
connect, bendpoint, lasso or space-tool drag), or an entry of the modeler's own
chrome (the palette, the context pad), clicked or dragged, starts a preview that
follows the pointer (a create, an append, a connect, a placement such as
Wardley's evolve), until its drop or its cancel. A preview still off the
canvas, the pointer over the palette, counts. An import that replaces the
document cancels a running gesture first, the way Escape cancels it (L1, 1.5,
RECOMMENDED), and it also ends a press that has not reached the drag threshold
yet. No change event comes from it and no exception, the pointer's release
after the import included; nothing is applied to an element the import
removed, and the export is the imported document. Hosts re-import a peer's text
whenever it arrives, also while the user drags. diagram-js does not end a drag
on `diagram.clear()`: the drop then throws on a removed shape
(`Cannot read properties of null` in `moveShape`) and loses the move, or leaves
the command stack stuck, so a renderer calls `dragging.cancel(false)` before its
import clears the canvas (`false`: no restore of the drag's previous selection,
whose shapes the import replaces). The cancel belongs to an import that is
accepted: it comes after the text passed the modeler's checks. A rejected
import (L7) leaves a running gesture as it was, since hosts re-import half-typed
peer text on every sync and would otherwise end the user's drag each time.

An import called during a running user action waits until the action has
finished (1.6, RECOMMENDED). A user action is what the modeler does for one
input of the user: a drop, the start of a drag, a click append, a keyboard
create, a label commit, a press that commits a label, a command with an undo or
a redo, each with the steps it schedules for later (the label editor a create
opens a task after its drop). A host that imports from `onContentChanged` or
`elements.onSelection` does so in the middle of the action, which goes on once
the listener has returned. diagram-js's `SelectionBehavior` selects a moved
shape again after the drop, and throws on a shape the import removed when
something was selected before the drag; a keyboard create opens the label
editor of its new element; a delete, an undo or a redo that removes a selected
element changes the selection in the middle of its command; and at a drag's
start diagram-js's `Dragging.move` empties the selection and then reads the
drag again, which throws once an import from the selection listener has ended
it. So the import runs once the action has finished, and the Promise
`importText` returned settles after that import: when it resolves,
`exportText()` returns the imported document. Nothing of the action applies to
it, and the action's command stays off its fresh undo history (L4). After the
start of a drag the import then ends the drag, as an accepted import ends any
running gesture. A press that commits a label and starts a drag is no
exception: the import that commit triggers ends that drag and does not wait for
its drop. Imports keep their call order: one called while an earlier one
waits, also once the action has returned, runs after it.

A pan is no gesture (1.6, RECOMMENDED; 1.5 said a pan MAY count): a drag that
only moves the view holds nothing an import replaces, and a host that defers its
re-imports while a gesture runs would hold every remote change while the user
only looks around. An import leaves a running pan running, and the pan goes on
from the current view: the one the import left, or one the host sets after it
(`setViewState`, the restore of L5) or while the pan runs. diagram-js's hand
tool keeps the diagram point it started on under the pointer, so without a new
start point its next move puts the view from before back and undoes the
import's fit or the host's restore.

Optional `interaction` (1.5) tells a host whether the user holds a gesture
right now: `active()`, and `onChange(cb)`, whose listener gets the new value.
`active()` is true from a gesture's start until its drop or cancel, and false
otherwise: at rest, during a press that has not reached the drag threshold, and
while a palette tool (hand, lasso, space, global connect) only waits for its
next press. An open label editor or popup is no gesture: L1 keeps it across an
import, and a host that waited for it would hold every remote change while the
user types. A pan is none either (RECOMMENDED since 1.6, see above), although
diagram-js's hand tool runs on the same dragging service. `onChange` fires once
each way and never twice in a row with the same value; inside the listener
`active()` already returns the new value, and nothing is called once
`destroy()` has been called, also for a gesture that `destroy()` itself ends. A
viewer has no editing gesture: one that exposes the surface reports false
(RECOMMENDED since 1.6 also during a pan, which 1.5 left aside). Hosts
feature-detect it (`modeler.interaction !== undefined`) and defer a remote
re-import while a gesture runs, instead of reading diagram-js's DOM classes
(`djs-drag-active`, `djs-dragger`, `djs-cursor-grabbing`) and sending a
synthetic Escape after a timeout.

The listener can run inside `importText` (the cancel above) or inside a
pointer event handler, so a host never calls `importText` from it. The
contract defines no imports that overlap (1.6 only RECOMMENDS that a modeler
runs them in call order), so a host starts each import once the one before has
settled; a microtask alone does not wait for that. A host that
imports during a gesture anyway (after a timeout of its own, or for a file the
user opens) relies on the cancel above, and that import takes the place of the
deferred one.

What a host imports after the gesture is the shared document's current text,
not the remote text that arrived during the gesture. The drop that ends a
gesture is the user's own change, which the host writes into the shared
document from `onContentChanged`; the remote text does not hold it, so
importing that text would move the drop back on the canvas and, with the next
export, for every peer. The host therefore keeps a flag instead of the text,
and its import reads the shared text when it starts, not inside the listener:
the contract does not order `onChange(false)` and the drop's change event, and
a renderer may report the end before it runs the drop's command in the same
handler (Event Storming's point drop on a drawing does). That handler has
returned by the time a queued import starts, so the read holds the drop when
two things happened inside the handler: the renderer fired the drop's change
event, as every Miragon renderer does from the drop's command, and the host
wrote the change into the shared document before its `onContentChanged`
listener returned (L3: `exportText()` already returns the change there). A host
that writes later, after an `await` or a debounce, flushes that write before a
queued import reads the shared text.

The host merges every local change into the shared document against the text
it last imported or exported, which is what the canvas held before the change,
and never writes the export over the shared text whole: the export lacks every
remote change the canvas has not shown yet, one a gesture holds back, one whose
import still waits in the queue or for the user's running action to finish, and
one whose text the modeler rejected (L7, a peer's half-typed text). While the
canvas shows the shared text, the merge writes what a whole write would. One
queue for every import the host makes, and the merge in its change listener,
cover all of this:

```ts
let remoteWaits = false;
let base = "";
let queue: Promise<unknown> = Promise.resolve();

function importNow(readText: () => string): Promise<ImportResult> {
  remoteWaits = false;
  const result = queue.then(async () => {
    const text = readText();
    const imported = await modeler.importText(text);
    base = text;
    return imported;
  });
  queue = result.catch(() => undefined); // a rejected text (L7) keeps the queue going
  return result;
}

function applyRemote(): void {
  if (modeler.interaction?.active()) remoteWaits = true;
  else importNow(sharedText).catch(reportRejectedText);
}

modeler.interaction?.onChange((active) => {
  if (!active && remoteWaits) importNow(sharedText).catch(reportRejectedText);
});

modeler.onContentChanged(() => {
  const exported = modeler.exportText();
  mergeLocalChange(base, exported);
  base = exported;
});
```

`applyRemote` runs for each change a peer makes to the shared document,
`sharedText` returns that document's current text, and
`mergeLocalChange(base, exported)` merges the change from `base` to `exported`
into it before it returns. An import moves `base` once its Promise resolves,
not when it reads the text: until then the canvas holds the document before it
(an import waits for the user's running action, 1.6), and a change event the
action fires meanwhile changes that document. A rejected import (L7) leaves
`base` where it was. For a file the user opens, the host calls
`importNow(() => fileText)`.

A view change the HOST makes (`setViewState`, or a fit its chrome applies to
the canvas) never commits an interaction in progress either (L5, since 1.2):
no change event, the export unchanged. Hosts restore the viewport after every
remote re-import and refit when their chrome changes; a modeler that completes
its label editor on every viewbox change (diagram-js's direct-editing pattern,
which every renderer built against contract 1.1 follows) writes the half-typed
label into the shared document for every peer. RECOMMENDED: the interaction
stays open with its typed input, so the user's commit afterwards writes what it
would have written without the view change.

**Keys stay on the canvas** (1.4, RECOMMENDED). A modeler acts on a key only
while its canvas holds the focus: the key's target is the focusable element the
modeler placed in the host to take its keys (diagram-js: the canvas `<svg>`,
`tabindex="0"`) or lies inside it. Every other key is the page's:

- a key aimed at the host's chrome or at a host editor (a button, a text input,
  a select, a contenteditable, an EditContext or Monaco editor), whether it sits
  beside the modeler's container, inside it, or next to the canvas in a host's
  overlay;
- a key whose target is `<body>`: nothing is focused after a load, after a
  click on page text, and while the host hides the canvas (`display: none`) or
  makes it `inert`.

The modeler leaves such a key alone: no command, no change of the document or
the selection, no `preventDefault()` and no `stopPropagation()`, in the capture
phase too. A keydown or keyup without a string `key` (browser autofill
dispatches both) is ignored without an error. The rule holds for the viewer
mount as for the editable one. Hosts embed modelers next to their own editors
and toolbars: a key the canvas takes from there deletes the selection while the
user types, undoes the last edit from a toolbar button or swallows Cmd/Ctrl+C
in a text field. The modeler's own chrome (its palette, context pad, label
editor) handles its keys as it sees fit, and a host that wants keyboard editing
hands the canvas the focus (a click on it, Tab, or `focus()` on the canvas
element).

Optional `appearance` (1.5) lets an embedding host ask for a mode (Miragon
guide §13.3, row "Eingebettet", and §13.5): `themes`, the themes the modeler
can draw, and `set({ theme, contrast })`. `themes` is non-empty, without
duplicates and fixed before the modeler runs: readable as soon as the factory
returns, before `attachTo`, and the same on every read, on every instance of
the package and on its viewer, so a host paints its first frame in the right
mode. `set` draws `theme` when `themes` lists it and `themes[0]` otherwise, so
**a light-only modeler (`themes: ["light"]`) stays light when dark is
requested**, whatever mode the page around it shows. The contrast always
applies (`"high"` is the guide's `data-cd-kontrast="hoch"`): a light-only
modeler under a dark high-contrast host draws light with high contrast. Each
call replaces the whole request, so one without `contrast` means normal
contrast; a theme or contrast the modeler does not know (from an untyped host)
counts as an unlisted theme or as normal contrast, and `set` never throws. It
may be called before `attachTo` and before the first import, applies before it
returns, without a re-import, and holds across later imports until the next
`set`; until the first one the modeler draws as it does without the surface.

The appearance is view state, never document: `set` fires no
`onContentChanged`, leaves `exportText()` and every image export
byte-identical (exports are always light, guide §10.7), and leaves the undo
history, the view state and the selection as they were. Like a host's view
change (L5) it never commits an interaction in progress; RECOMMENDED: the
interaction stays open with its typed input. How a modeler draws a theme is its
own: a renderer on the Miragon design tokens writes `data-cd-theme` and, for
high contrast, `data-cd-kontrast="hoch"` on the root element of what it draws,
so the token CSS resolves its roles there and not from the host page.

Hosts feature-detect it and decide in one place (guide §13.5). A modeler
without the surface draws light only: the host treats it as
`themes: ["light"]` and requests nothing. It takes its mode from the page
around it, though (a renderer on the Miragon design tokens resolves its roles at
the nearest `data-cd-theme` above it), so a host whose page can be dark keeps it
light itself: `data-cd-theme="light"`, and `data-cd-kontrast="hoch"` for high
contrast, on the element it passes to `attachTo` (guide §13.3: in a foreign page
the attributes sit on the modeler's container). The host requests only a theme
`themes` lists and draws its own chrome around the canvas in that theme, so no
surface is half dark:

```ts
const themes = modeler.appearance?.themes ?? ["light"];
const theme = themes.includes(wanted) ? wanted : (themes[0] ?? "light");
if (modeler.appearance) {
  modeler.appearance.set({ theme, contrast: highContrast ? "high" : "normal" });
} else {
  container.dataset.cdTheme = "light";
  if (highContrast) container.dataset.cdKontrast = "hoch";
  else delete container.dataset.cdKontrast;
}
paintHostChrome(theme);
```

The modeler shell's `resolveAppearance(requested, themes)`
(`@miragon/modeler-shell/core`) makes the same decision on the shell's
`{ theme, kontrast?: "hoch" }`; a host on the shell passes
`contrast: "high"` for `kontrast: "hoch"`. The Miragon modelers report
`["light"]` and move to `["light", "dark"]` in one release, never one of them
alone (guide §13.5).

## Factory options

`CollaborativeModelerOptions` (1.2) names the options a host has to feed a
renderer's contract factory (`createCollaborativeModeler`,
`createCollaborativeViewer`), the same for every notation, so a host can pass
every notation one object. The contract defines them; each renderer adopts
them in its own release, next to its own options (diagram-js
`additionalModules`). Adopting them is part of moving a renderer to contract
1.2: `meta.apiVersion` follows the `@miragon/modeler-api` version the renderer
pins, and no kit case checks the options (the harness's `create()` builds the
instance), so a renderer that reports 1.2.0 without them silently ignores a
host's aligned options.

| Option         | Meaning                                                                                                                                                                                                                                                          | Default             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `freeArea`     | the part of the canvas no host chrome covers: `{ insets }` (px from the container's edges, e.g. `shell.fitInsets()`) or `{ center }` (diagram coordinates, e.g. `viewport.freeRectCenter()`), each a function, never both; keyboard creation lands in its centre | the whole container |
| `fitOnImport`  | fit the content after every import (the fitted view of L5), into the free rectangle or with the renderer's own padding (see below); `false` when the host's chrome fits it itself                                                                                | `true`              |
| `undoRedoKeys` | bind Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y to the canvas history; `false` when the host owns the document's history (VS Code)                                                                                                                              | `true`              |

```ts
import type { CollaborativeModelerOptions } from "@miragon/modeler-api";

const options: CollaborativeModelerOptions = {
  freeArea: { insets: () => shell.fitInsets() }, // or { center: () => viewport.freeRectCenter() }
  fitOnImport: false, // the shell's viewport fits after every import
  undoRedoKeys: false, // VS Code owns the history
};
```

Every Miragon renderer takes these names and no others. The renderers' own
earlier names (`freeRectInsets`, `freeRectCenter` and Wardley's
`keyboard: { undoRedo }`) are gone since wardley-renderer 0.12.0,
event-storming-renderer 0.6.0, team-topologies-renderer 0.15.0,
context-maps-renderer 0.7.0 and value-chain-renderer 0.8.0: a host that still
passes one gets the option's default (TypeScript rejects the name in an object
literal). A renderer given only `center` that needs the rectangle itself (a pan
constraint) works there as it does without the option: no host chrome, with
whatever margins of its own it uses then. A viewer factory takes the same type
and ignores `undoRedoKeys`. The kit's `create()` keeps `fitOnImport` at its
default: L5 checks the modeler's own fit.

The post-import fit (`fitOnImport`, L5's fitted view) MAY use the free area:
given `insets` a renderer may fit into the free rectangle (Wardley, Context
Maps) or keep its own fit (Event Storming, Team Topologies, Value Chain), and
given only `center`, which names no rectangle, it MAY fit as it does without
the option, keeping the padding it uses then (Context Maps keeps the room its
palette needs, and a test pins it). All five published renderers conform to
this reading; no kit case checks it, since `create()` takes no options. A host
whose first view must leave its chrome free passes `fitOnImport: false` and
fits itself, to `contentBounds()` where the renderer has it.

## The conformance kit

```ts
// e.g. test/conformance.browser.test.ts in a modeler repo (any (name, fn) runner that runs the cases one after another)
import { attachedHost, registerConformance } from "@miragon/modeler-api/conformance";
import { test } from "vitest";

registerConformance(
  {
    create: async () => mountMyModeler(attachedHost()), // IN the document, sized (see below)
    createReadonly: async () => mountMyViewer(attachedHost()), // the viewer mount, if the package ships one
    canonicalTexts: [CANONICAL_SAMPLE_A, CANONICAL_SAMPLE_B], // two DISTINCT, REVIEWED ones: the undo law needs them
    looseTexts: [HAND_AUTHORED_SAMPLE],
    invalidTexts: [HALF_TYPED_SAMPLE], // [] if NOTHING is non-importable (a lenient line DSL)
    foreignTexts: [{ text: SAMPLE_WITH_VENDOR_EXTENSION, mustSurvive: ["x-vendor: keep-me"] }],
    viewState: { x: 120, y: 80, width: 640, height: 480 }, // a panned/zoomed viewport, not the fitted one (the kit compares readbacks, never this literal)
    mutate: (m) => addOneElement(m), // undoable; adds, never renames or deletes
    configMutations: [{ name: "axis labels", run: (m) => renameEvolutionAxis(m) }], // [] if the notation has none
    undo: (m) => triggerUndo(m),
    redo: (m) => triggerRedo(m),
    moveElement: (m) => dragFirstElement(m), // optional: move one element by its own commands, return its id
    probeTexts: [CUT_OFF_SAMPLE], // optional: damaged forms your parser meets, on top of the derived probes
    openInteraction: (m) => typeIntoLabelEditor(m, "typed, not committed"), // open an editor, type, do NOT commit
    interactionState: (m) => readOpenLabelEditor(m), // { elementId, text } | undefined
    commitInteraction: (m) => pressEnterInLabelEditor(m), // optional: commit what openInteraction typed
    canvasElement: (m) => canvasOf(m), // optional: the element that takes the keys, if not diagram-js's focusable <svg>
    startGesture: (m, kind) => holdGesture(m, kind), // "move" | "create" | "createOffCanvas", held by real pointer events: { drop, cancel }
    armTool: (m) => armLasso(m), // a palette tool that waits for its next press
    startPan: (m) => holdPan(m), // a pan moved one step past the drag threshold: { move, drop }
    exportImage: (m) => saveSvg(m), // the SVG export, as a host saves it
    // engines that debounce change delivery: make this outlast the debounce
    settle: () => new Promise((r) => setTimeout(r, 50)),
  },
  test,
  { onSkip: reportSkip, onAdvisory: reportAdvisory }, // optional: both default to console.warn
);
```

**Run it in a real browser.** diagram-js engines compute viewboxes from the
host's client size and use `getBBox`, which jsdom lacks and a detached or 0×0
element turns into NaN: mount into `attachedHost()` (a sized element appended
to `document.body`) under vitest browser mode / Playwright (the modeler
repos' `test:browser` project), not under the unit project. The keys case
finds the canvas in the `attachedHost()` that `create()` (and
`createReadonly()`) mounted into: the focusable `<svg>` diagram-js places
there, or the element `canvasElement` names for a modeler that takes its keys
elsewhere.

**Run the cases one after another.** `registerConformance` registers one test
per case; run them in order (the default of vitest, jest and node:test within a
file), never with `test.concurrent`. The keys case moves the focus and
dispatches keys in the one document every mounted instance listens to: a case
running beside it would see those keys or lose its focus, and the keys case
could not tell which `attachedHost()` holds its modeler.

**Canonical texts are yours to vouch for.** L2 proves `exportText` is a
fixpoint of the texts you provide. Obtain them by exporting a hand-authored
document and reviewing the bytes; pasting whatever the current build prints
proves only that it agrees with itself.

**Nothing skips silently.** A case whose harness field is `undefined` reports
a SKIP (`console.warn` by default, `registerConformance(h, test, { onSkip })`
to route it) instead of passing. An explicit `[]` (`invalidTexts`,
`foreignTexts`, `configMutations`, `looseTexts`) is a statement that the
notation has no such form and skips nothing. Without `openInteraction` the
L1 interaction case reports a skip; with `openInteraction` but without
`interactionState` only its keep-and-reopen half does. A modeler without
`elements.bounds` skips the bounds case; with it, a harness without
`moveElement` skips only its move half, one without `viewState` only its
diagram-coordinates half. A modeler without `contentBounds` skips the
content-bounds case; with it, a harness without `viewState` skips only its
view half, and a modeler without `elements.bounds` only its covering half.
Without `openInteraction` or `viewState` the L5 interaction case reports a
skip; without `commitInteraction` only its commit halves do. The cases of the
1.5 surfaces and the 1.6 gesture rules have their own skips (see
[their section](#cases-for-the-15-surfaces-and-the-gesture-rules-of-16)). The keys case
reports a skip without a DOM and when it cannot find the canvas: `create()` or
`createReadonly()` mounted into no `attachedHost()` holding a focusable `<svg>`
(or into two), or `canvasElement` names no element or one outside every
`attachedHost()`. After its other checks it also reports one when it cannot see
a key act on the editable modeler: a modeler without `elements`, a canvas that
does not take the focus, or Delete and Backspace that leave the revealed
element in place. A case reports its advisories before its skip, so an
`onSkip` that throws still shows what the keys case found.

**Every rejection is probed.** `invalidTexts` lists what MUST reject; the kit
does not take `[]` on trust. The L7 probe case derives damaged forms from
every canonical text (its first half, its first third, the text without its
last character, the text followed by a NUL character) plus your optional
`probeTexts`, and imports each over a document with undo history. A probe may
import or reject: one that imports must be silent (L1) with `exportText`
total (L6); one that rejects must leave the document, its element ids, the
change events and the undo history untouched (L7). After every probe the next
valid import must render and the next user command must apply. The case runs
for every harness and never skips.

**Calls before the first import.** A fresh instance gets `exportText()` and
one `mutate` before any document. Both may throw or return anything, and the
`mutate` may never settle: the kit waits 2 s for it, so a harness that waits
for its command's change event still runs. Then
importing the first two canonical texts must render each exactly like a
fresh instance does, and the next `mutate` must emit and apply.

**Interactions open during an import.** `openInteraction` opens an editor on
an element of `canonicalTexts[0]` and types without committing. The kit then
imports over it twice: a different document (`canonicalTexts[1]`, the edited
element is usually gone; a harness with one canonical text reports that leg
as skipped) and the same document again (the element is still there). Each
import requires no change event, the imported document as the export and an undo
that changes nothing (L1, L4). `interactionState` lets it check the
recommended keep-and-reopen on the same-document import.

**Interactions open during a host's view change.** On a fresh import of
`canonicalTexts[0]` the kit opens the interaction, commits it with
`commitInteraction` and requires the export to change and to contain the typed
input (`interactionState().text`), proof the case can see a commit. It then
re-imports, opens the interaction again and calls `setViewState(viewState)`:
no change event, the export unchanged (L5), and the view really changed. The
RECOMMENDED keep-open is an advisory: `interactionState` must still report the
same element and input, and `commitInteraction` must then write the same
document as without the view change, so `openInteraction` types the same
input on every call.

**Keys stay on the canvas.** The keys case imports `canonicalTexts[0]`, runs
`mutate` (undo history for Cmd/Ctrl+Z) and reveals the first listed element (a
selection for Delete and the arrows). It then puts focusable host controls
beside the modeler, inside the host element and next to the canvas (a button, a
text input, a textarea, a select, a contenteditable, a focusable element in a
`.monaco-editor` and, where the browser has EditContext, an EditContext editor)
and aims the keys the Miragon canvases and diagram-js's keyboard bind at each
of them, the focus on that control, and at `<body>`: with nothing focused,
right after the canvas lost the focus, and while the host element's wrapper is
`display: none` or `inert`. The keys are Backspace, Delete, the arrows (plain
and with Shift), Enter, Escape, Space, Tab, the single-key tools
(`a c e h l n p s u`), Shift+1, and `a c v x d z`, Shift+Z, `y`, `+`, `=`, `-`,
`0` and the arrows (plain and with Shift) once with Ctrl and once with Meta.
Each key must leave the export, the change events, the selection,
`defaultPrevented` and its propagation to the window as they were; a keydown and
a keyup without a key, on the focused canvas, on `<body>` and on a host button
and input, must throw nothing. What it finds is one advisory; after the first
key that changed something on a control it moves to the next, on a fresh
document. Last, Delete (or Backspace) on the focused canvas must change the
document, the revealed element removed: proof that the case's keys reach the
modeler at all. With `createReadonly` it then mounts the viewer, imports and
reveals the same way and aims the same keys at the same targets; the viewer
edits nothing, so no key has to act on it. The case checks the canvas at rest:
no tool, popup or editor of the modeler's own is open (a draw tool, a context
pad, a label editor), since the kit cannot open one; the renderers' own tests
cover those modes.

**Recommendations are advisories.** Where the contract only RECOMMENDS
(collision-free ids across peers, keep-and-reopen of an open interaction across
an import, keep-open across a host's view change and across `appearance.set`,
keys that stay on the canvas, the gesture cancel of 1.5, and the user's running
action that an import waits for (a drop, a command, a drag's start), the call
order of imports and the pan that runs on through an import, all of 1.6),
the kit reports what it finds as an ADVISORY through `onAdvisory` (`console.warn` by default) and never
fails: a recommendation becomes a law, with a failing case, only in a major
release. The collision check imports the same canonical text into two fresh
instances, runs `mutate` once on each and advises when both allocate the same
id, unless both new elements carry the same name and the id spells it out
(its letters and digits contain the name's, as `component_new_component` does
for "New Component"). Such an id is derived from the content and collides for
identical content by design, so the check reports a skip instead: let
`mutate`'s elements differ in content (a counter the harness shares across
instances, as the reference harness does).

**View state is compared by readback.** The kit never compares
`getViewState()` with your `viewState` literal: it sets it, reads the
modeler's own (possibly normalised) state back, and requires that readback
to survive a re-import: a diagram-js viewbox that comes back rounded with
`scale`/`inner`/`outer` is fine.

**Element boxes are verified live.** With `elements.bounds` present, every
listed id must give a finite box with a non-negative size and an unknown id
`undefined`: after an import, after `mutate` (the new element has its box at
once) and after `moveElement` (the moved element's box changed position).
`setViewState(viewState)` must leave every box as it was: they are diagram
coordinates. A viewer that exposes `bounds` is held to the same listing rules.

**The content box is verified around every element.** With `contentBounds`
present, it must not throw and must give `undefined` or a finite box with a
non-negative size before the first import; after importing each canonical text
and after `mutate` it must give a finite box as soon as an element is listed,
and that box must cover every element's finite `elements.bounds` box (the new
element included, so a box measured at the last import fails), give or take
what float32 rounding takes off a box measured on the live SVG (`getBBox`): a
thousandth of a unit, or 2^-20 of the edge where that is more.
`setViewState(viewState)` must leave it as it was. A viewer that exposes `contentBounds` is held to the
same rules after an import.

**Element identity is verified through names.** After an unrelated edit, and
after an export → import into the same instance, a fresh instance and the
viewer, every id the session reported must still exist and, where the
notation has names, still name the same element; a notation whose elements
carry no names is verified for id existence only.

The kit throws plain `Error`s, with no assertion-library or runner dependency.
Its own CI proves it bites: a conforming reference modeler
([`test/reference-modeler.ts`](test/reference-modeler.ts), also the model
for a harness) passes every case and advises nothing, one deliberately broken
variant per historical drift AND per kit case fails exactly the case set that
encodes the violated law (not every individual assertion has a saboteur;
every case does), and one variant per recommendation fails nothing and
advises exactly once. That suite runs without a DOM, which proves the other
cases need none; the keys case, the colour half of the appearance case and the
delete of the user-action case need one, so three more suites (jsdom) mount the
reference into `attachedHost()`:
[`test/keys.conformance.test.ts`](test/keys.conformance.test.ts) runs every case
on it and holds the keys saboteurs,
[`test/appearance.conformance.test.ts`](test/appearance.conformance.test.ts)
holds the saboteurs that leave the page's mode through, and
[`test/user-action.conformance.test.ts`](test/user-action.conformance.test.ts)
those whose import runs inside a delete.

### Cases for the 1.5 surfaces and the gesture rules of 1.6

The kit checks `interaction`, the gesture cancel of L1, the user's actions an
import waits for (a drop, a delete, an undo, a redo, a drag's start), the call
order of imports, the pan and `appearance` with seven cases and four optional
harness fields. The user-action case needs none of the four: it drives
`elements`, `undo`, `redo` and `mutate`, and presses Delete on the canvas the
keys case finds.

The harness fields:

- `startGesture(modeler, kind)` holds a gesture on `canonicalTexts[0]`
  (imported) the way a user does, with real pointer events, and resolves while
  it runs, with `drop()` and `cancel()` (Escape). The kinds: `"move"` (a press
  on an element, moved past the drag threshold), `"create"` (a palette entry
  that creates an element, its preview held over free canvas) and
  `"createOffCanvas"` (the same preview held over the palette). `drop()`
  releases the gesture where it applies: the moved element lands on a new
  position, a create on free canvas (the off-canvas preview is brought there
  first). So a drop the modeler still runs changes the document, and a drop
  that changes nothing shows a gesture that has ended.
- `armTool(modeler)` arms a palette tool that waits for its next press (the
  lasso or the hand tool) without pressing.
- `startPan(modeler)` holds a pan (a press on empty canvas, or the hand tool)
  moved past the drag threshold by one step, a fixed distance in screen pixels,
  with `move()`, which moves the pointer by the same step again, and `drop()`.
- `exportImage(modeler)` returns the modeler's SVG export, as a host saves it.

The cases:

- **The L1 gesture case** (RECOMMENDED since 1.5, an advisory): an import
  cancels a running gesture. For each kind it first proves that a drop applies:
  held and dropped without an import, the gesture changes the document. Then it
  holds the gesture, imports `canonicalTexts[1]` (the held element is usually
  gone) and drops; and on a fresh import of `canonicalTexts[0]`, the same with
  `canonicalTexts[0]` itself (the element is back under its id, as a new
  shape). A change event before the drop fails (L1). The rest is the advisory:
  the drop and every handler it runs throw nothing (the case listens for the
  window's `error` and `unhandledrejection` events), fire no change event and
  leave the imported document as the export, an undo changes nothing (L4) and
  the next `mutate` applies. With `interaction`, the cancel shows: `active()`
  is false and `onChange(false)` came once before `importText` resolves. With
  an entry in `invalidTexts`, a rejected import during the gesture must reject
  without a trace (L7, a failure), and leaves the gesture running (the
  advisory): with `interaction`, `active()` stays true and no `onChange`
  comes, and the drop applies. Resize, connect and lasso drags and the context
  pad's previews stay with the renderers' own tests.
- **The drop case** (RECOMMENDED since 1.6, an advisory): an import from the
  change listener of a drop waits until the drop has ended. On
  `canonicalTexts[0]`, with the first listed element revealed (a selection
  held from before the drag, which diagram-js's `SelectionBehavior` brings
  back after the move), it holds a `"move"`, and its `onContentChanged`
  listener imports `canonicalTexts[1]` on the first change of the drop; then
  the same with the drop's own document, read inside the listener (an echo).
  A drop that fires no change event fails (the case would prove nothing). The
  advisory: the drop and its handlers throw nothing, `exportText()` right
  after the call in the listener is still the drop's document (the import has
  not run yet), the import resolves, and when its Promise settles
  `exportText()` returns the imported document; afterwards no step of the drop
  changes it, no change event fires, `interaction.active()` is false, an undo
  changes nothing (L4) and the next `mutate` applies.
- **The user-action case** (RECOMMENDED since 1.6, an advisory): an import from
  the selection listener of a command waits until the command has finished,
  and imports keep their call order. Each leg runs on a fresh instance, and in
  each `elements.onSelection` imports `canonicalTexts[1]` on its first
  delivery, in the middle of the command: a delete (on `canonicalTexts[0]`,
  the first listed element revealed, Delete on the focused canvas, Backspace
  where Delete does nothing; a delete without the listener comes first, and a
  fresh import of `canonicalTexts[0]` with the element revealed again), an
  undo (`mutate`'s new element revealed and the create undone) and a redo (the
  delete of the first element undone, the element revealed again and the
  delete redone). The advisory: the action and its handlers throw nothing (the
  window's `error` and `unhandledrejection` events too), `exportText()` right
  after the `importText` call in the listener is still the action's document,
  and right after the action has returned it is not the imported document yet,
  where the action alone leaves another document (the import did not run
  inside the action); the import resolves, and when its Promise settles
  `exportText()` returns the imported document; afterwards no step of the
  action changes it, no change event fires, an undo changes nothing (L4), and
  the next `mutate` applies and an undo takes it back. Last, the call order:
  the change listener of `mutate` imports the document from before the
  command, and as soon as `mutate` has returned (a microtask after that
  listener, where `mutate` returns before its command has run) the case
  imports an echo of the command's document, which it read in the listener.
  The export then tells that the first import still waits. Both settle in the
  order they were called, and the export is not the document called first. A
  click append and a keyboard create stay with the renderers' own tests: the
  kit has no harness field to drive them. A label commit, which
  `openInteraction` and `commitInteraction` drive, stays there too for now.
- **The drag-start case** (RECOMMENDED since 1.6, an advisory): an import from
  the selection listener at a drag's start runs once the drag has started, and
  then ends it ([#336](https://github.com/Miragon/modeler-suite/issues/336)).
  For a `"move"` and a `"create"` it first proves that a drop applies, as the
  L1 gesture case does. Then, on `canonicalTexts[0]` with the first listed
  element revealed, it starts the gesture: diagram-js's `Dragging.move` empties
  the selection while it activates the drag (a move once it passes the drag
  threshold, a palette create at once) and reads the drag again afterwards,
  and `elements.onSelection` imports `canonicalTexts[1]` on its first
  delivery. The advisory: the start and its handlers throw nothing, the import
  resolves, and when its Promise settles `exportText()` returns the imported
  document and `interaction.active()` is false; no change event fires before
  the drop or after it, the drop applies nothing, an undo changes nothing (L4),
  and the next `mutate` applies and an undo takes it back.
- **The pan case** (RECOMMENDED since 1.6, an advisory): a pan is no gesture,
  and it runs on through an import from the current view: the one the import
  left, or the one the host restores after it. For `canonicalTexts[1]` and
  `canonicalTexts[0]` it holds a pan on a fresh import of `canonicalTexts[0]`,
  imports the text and moves the pan one more step. Then it does the same as a
  host that keeps the user's viewport (L5): it takes `getViewState()` during the
  pan, before the import, and passes it to `setViewState` after the import,
  before the step. A `startPan` that leaves the view as it was fails (the case
  would prove nothing), and so does a change event from the import (L1) or from
  the pan's release (L3: a pan changes the view, never the document). The
  advisory: `interaction.active()` stays false and `onChange` is not called, the
  pan's next step after the import moves the view, and where the import left
  the view as it was before the pan (the same document fits the same view, L5)
  that step brings the view where the pan's first step had brought it, up to
  float noise: a pan that puts the view from before the import back lands one
  step further. The host's restore takes while the pan is held: `getViewState()`
  no longer reads back the view the import left. After it, the step moves the
  restored view as the pan's first step moved the view before the import: each
  number of the view state's readback changes by as much as it changed in that
  first step, up to float noise (where the readbacks differ in shape, or the
  first step changes a value that is no number, the step only has to move the
  view). A pan that only the import re-anchors goes on from the view the import
  left instead and undoes the restore. The release throws nothing, the export is
  the imported document and the next `mutate` applies.
- **The interaction case** (the surface's rules, failures): `active()` follows
  every gesture. It is false before the first import and at rest; for each kind
  it is true while the gesture is held, with one `onChange(true)`, and false
  after `drop()`, with one `onChange(false)`, and the same with `cancel()`.
  With a tool armed it stays false and the listener is not called, also through
  an import. Inside the listener `active()` returns the value the listener got,
  the unsubscribe ends delivery, and nothing is delivered after `destroy()`,
  with a gesture held when it comes. A viewer that exposes the surface reports
  false, before and after an import.
- **The appearance case** (failures, apart from the keep-open advisory): a
  theme is view state, and an unlisted one falls back to `themes[0]`. `themes`
  is non-empty, without duplicates, only `"light"` and `"dark"`, and the same
  on every read, on a second instance and on the viewer; `set` before the
  first import throws nothing. Then, on `canonicalTexts[0]` with one `mutate`,
  a revealed element and `setViewState(viewState)`, it requests light, dark,
  both with high contrast, a theme no modeler knows and a contrast no modeler
  knows: no throw, no change event, `exportText()` and `exportImage()`
  byte-identical, and the view state readback and the selection as they were;
  an undo afterwards still undoes the `mutate`. In a DOM, the case compares the
  computed colours of every element in the modeler's `attachedHost()` (on a
  fresh instance, once its colour transitions have run). The reference is a
  request for `themes[0]`, once with each contrast, on a page without
  `data-cd-theme`. Then it puts the page into the other mode, with
  `data-cd-theme="dark"` and `data-cd-kontrast="hoch"` on `<html>`, and
  requests a theme `themes` does not list (`"dark"` for a light-only modeler,
  and a theme no modeler knows), once with each contrast: the colours equal the
  reference of the same contrast. After a re-import on that page they equal a
  request for `themes[0]` with the same contrast on the plain page, drawn on the
  re-imported canvas. So a light-only modeler stays light when dark is requested
  on a dark page, a request for normal contrast holds on a high-contrast page,
  and a `set` that does nothing and leaves the roles to the page fails. A
  modeler that lists `"dark"` draws it: on a page without `data-cd-theme`, some
  computed colour differs from light, while both exports stay byte-identical
  (guide §13.4: the SVG export in dark mode equals the light one). With
  `openInteraction`, a `set` over the open interaction commits nothing (a
  failure), and the keep-open is an advisory of this case, checked as the L5
  interaction case checks it after a view change. The page gets its own mode
  back after the case.

An import that the gesture, drop, user-action, drag-start or pan case calls
while the user holds something or acts gets 2 s to settle. One that has not
settled by then is waiting for the gesture's drop (instead of cancelling the
gesture), for the pan's release, for the drop of a drag whose start it met, or
for a step the action never ends. The case advises on it, releases what it
holds, waits for the import once more and runs no further leg, so such a
modeler advises instead of hanging the run.

A modeler without `interaction` or `appearance` skips that case. A harness
without `startGesture` skips the gesture, drop, drag-start and interaction
cases, one without `startPan` the pan case; one without `armTool`, `exportImage` or
`openInteraction` skips only the half that reads it, and one without
`createReadonly`, or whose viewer has no `appearance`, skips the viewer half
of the appearance case. One canonical text skips the legs of another document,
`invalidTexts` left undefined the rejected leg of the gesture case, and a run
without a DOM the colour half of the appearance case and the delete and the
redo of the user-action case (the node suite of the kit's own CI). The
user-action case also skips its legs from the selection listener for a modeler
without `elements` (the call order still runs), its undo and its redo without
`undo`, and its redo without `redo`; it reports a skip when it cannot find or
focus the canvas (as the keys case does), when `elements.list()` reports no
element of `canonicalTexts[0]`, when Delete and Backspace leave the revealed
element in place, when the selection listener hears nothing during an action,
for its undo when `mutate` adds no element that `reveal()` selects, and for
its redo when an undo of the delete does not bring the element back for
`reveal()`. Its call order reports a skip when no change event of `mutate`
comes with an export other than the document from before, and when the first
import has already run once the second is called. The drag-start case skips
for a modeler without `elements`, when `reveal()` selects no element of
`canonicalTexts[0]`, and when the selection listener hears nothing at the
start. Each case has its
saboteurs, the appearance case among them a `set` that does nothing and leaves
the roles to the page.

## Versioning

One identity: `MODELER_API_VERSION` IS the npm package version: release-please
rewrites the constant on every release (`extra-files`) and a test pins it to
`package.json` exactly. Modelers pin the package and put the constant into
`meta.apiVersion`; hosts match on the major (`apiVersionsCompatible`).
Releases are tagged `modeler-api-vX.Y.Z`.

Hosts bind from the package root, which carries no kit code (since 1.2;
`@miragon/modeler-api/conformance` re-exports `apiVersionsCompatible`, so 1.1
imports keep working):

```ts
import { apiVersionsCompatible, MODELER_API_VERSION } from "@miragon/modeler-api";

if (!apiVersionsCompatible(modeler.meta.apiVersion, MODELER_API_VERSION)) refuseToMount(modeler);
```

The contract is first published as 1.0.0, never 0.x: under 0.x,
`apiVersionsCompatible` matches on the minor too, which would turn every
additive surface into a lockstep release across all modelers and their
hosts. A new optional surface (a structured snapshot lane alongside the text
lane, richer element info) is a minor, and hosts feature-detect it. A new
required member or a stricter law is a major. A minor may still add a case
that enforces what the contract text already states; a requirement the text
does not state yet ships as a RECOMMENDATION with an advisory, so no
conforming modeler turns red in a minor. A case that needs a new optional
harness field (`openInteraction`) reports a skip until the harness provides
it, and a check the harness cannot feed conclusively (the collision check
when both peers' new elements share a name their id spells out) reports a
skip too; a suite whose `onSkip` throws, to keep every law verified, turns red on
that upgrade by its own choice, and the skip names what to add or change.

1.5 follows these rules: `interaction` and `appearance` are optional surfaces
that hosts feature-detect, and the gesture cancel of L1 is a RECOMMENDATION
whose case only advises. A 1.4 modeler stays a conforming 1.5 modeler.

1.6 follows them too. The kit gains the cases of the 1.5 surfaces (see
[Cases for the 1.5 surfaces and the gesture rules of 1.6](#cases-for-the-15-surfaces-and-the-gesture-rules-of-16))
with four optional harness fields, each reported as a skip until a harness
provides it; their failures enforce only what 1.5 states. Three requirements
the text did not state ship as RECOMMENDATIONS whose cases only advise: an
import called during a running user action (a drop, the start of a drag, a
command) waits until the action has finished, imports keep their call order,
and a pan is no gesture and runs on through an import (1.5 said a pan MAY
count). A 1.5 modeler stays a conforming 1.6 modeler. The Miragon renderers and the new-modeler template,
whose harnesses fail on every skip and every advisory, fill the four fields
before the cases land, and every one of them passes the cases.

### Candidates for 2.0

Recommendations today, proposed as hard laws for the next major:

- **Collision-free element ids across peers:** two instances that import the
  same document and each create a different element never allocate the same
  id for them; ids derived from the content (OWM's `component_<slug>`) meet
  this by construction and collide only for identical content (today:
  `ElementInfo.id` RECOMMENDED, advisory in the elements collision case).
- **Keep and reopen an interaction across an import:** an interaction open
  during an import is reopened, with its typed input, on the element with the
  same id when that element is still there (today: L1 RECOMMENDED, advisory in
  the L1 interaction case).
- **Keep an interaction open across a host's view change:** after
  `setViewState` (or a host's fit, or since 1.5 `appearance.set`) the
  interaction is still open with its typed input, and the user's commit writes
  what it would have written without the view change (today: L5 RECOMMENDED,
  advisory in the L5 interaction case; for `appearance.set` RECOMMENDED on
  `AppearanceSurface`, advisory in the appearance case).
- **Keys stay on the canvas:** a key acts only while the canvas holds the
  focus; a key aimed at the host's controls and editors or at `<body>` is left
  alone, and a keydown or keyup without a key throws nothing (today:
  RECOMMENDED since 1.4, advisory in the keys case).
- **An import cancels a running gesture:** a gesture (a drag or a placement
  the modeler runs for the pointer, as defined under the laws) that runs when
  an accepted import replaces the document is cancelled first, with no change
  event, no exception and nothing applied to a removed element, and a rejected
  import leaves it running (today: L1 RECOMMENDED since 1.5, advisory in the
  L1 gesture case). The `interaction` surface stays optional.
- **An import waits for the user's running action:** an `importText` called
  during a running user action (a drop, the start of a drag, a click append, a
  keyboard create, a label commit, a press that commits a label, a command with
  an undo or a redo, with the steps it schedules; from `onContentChanged` or
  `elements.onSelection`) runs once the action has finished, so no later step
  of the action meets the replaced document; its Promise settles after that
  import, and imports run in call order. After a drag's start the import ends
  the drag, and the drag a press starts after it committed a label ends with
  the import that commit triggers instead of waiting for its drop (today: L1
  RECOMMENDED since 1.6, advisory in the drop, user-action and drag-start
  cases).
- **A pan is no gesture of its own:** a drag that only moves the view leaves
  `interaction.active()` false, on the viewer too; an import leaves it running,
  and it goes on from the current view: the one the import left, or one the
  host sets after it under L5 (today: RECOMMENDED since 1.6, advisory in the
  pan case; 1.5 said a pan MAY count as a gesture).

## Roadmap

- Next, in wave 4 ([#170](https://github.com/Miragon/modeler-suite/issues/170)):
  designIQ replaces the DOM reading of gestures and the synthetic Escape that
  [Miragon/design-iq#307](https://github.com/Miragon/design-iq/pull/307) added
  with the host snippet under `interaction`, which imports the shared
  document's current text after a gesture and so keeps the user's own drop
  ([#287](https://github.com/Miragon/modeler-suite/issues/287)). designIQ's
  change listener writes a local change after an `await` today; with the
  snippet it writes before the listener returns, or flushes that write before
  the import reads the text.
- Dark mode, on hold since 2026-10-29 and a topic of its own later:
  [#331](https://github.com/Miragon/modeler-suite/issues/331) collects what the
  first attempt found and how to start again, and is the open tracker (#47 and
  its sub-issues are closed). Each renderer draws a dark canvas while its
  `themes` stays `["light"]`; then one release moves all five to
  `["light", "dark"]` together, with the `miragon.<modeler>.colorTheme` setting
  of each VS Code extension.
- Dropped from the roadmap:
  - a channel for messages to the host (an `onNotify` with severity, text and
    action): no renderer produces user messages, and the feedback on an action
    belongs to the host that ran it, so an embedding host owns all feedback;
    guide §5.2 and §9 follow;
  - a `view` surface: `getViewState` and `setViewState` (L5) and
    `contentBounds()` (1.3) give a host the view and what to fit it to;
  - a `history` surface: the undo history belongs to the host's document
    (guide §13.5); a host that owns it passes `undoRedoKeys: false` and undoes
    through its document, and L4 defines undo across an import.

## License

MIT
