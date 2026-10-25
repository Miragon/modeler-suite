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

| Law | Requirement                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | `importText` is **silent**: no change events, undo history erased without emitting, also over existing history and foreign content; an interaction open during an import (a label editor with typed input) never commits        |
| L2  | `exportText` is **canonical**: deterministic, a byte fixpoint on canonical input, idempotent otherwise                                                                                                                          |
| L3  | `onContentChanged` fires for **every** user-visible change (element commands, config/axis/title edits, undo/redo) and nothing else; inside a listener `exportText()` already returns the new document                           |
| L4  | undo directly after an import is a defined **no-op**, never a stale-history mutation                                                                                                                                            |
| L5  | view state survives a re-import; an import leaves the view **fitted** to the content; the readback may be a normalised form of what was set; a host's view change (`setViewState`, a fit) never **commits** an open interaction |
| L6  | `exportText` is total after a successful import; foreign content is **preserved** through import → export, never dropped, never a throw                                                                                         |
| L7  | EVERY rejected import leaves no trace (previous document still rendered and exported, no events, undo history untouched), and the modeler **stays usable**                                                                      |

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

Until a renderer ships the aligned names, a host keeps passing that
renderer's own names, or passes both: a renderer that accepts the aligned
names takes them over its own. Its own names then stay accepted as DEPRECATED
aliases for one minor release of that renderer, then go: `freeRectInsets`
(Wardley, Event Storming, Context Maps) is `freeArea: { insets }`,
`freeRectCenter` (Team Topologies, Value Chain) is `freeArea: { center }`, and
Wardley's `keyboard: { undoRedo }` is `undoRedoKeys`. A renderer given only
`center` that needs the rectangle itself (a pan constraint) works there as it
does without the option: no host chrome, with whatever margins of its own it
uses then. A viewer factory takes the same type and ignores `undoRedoKeys`.
The kit's `create()` keeps `fitOnImport` at its default: L5 checks the
modeler's own fit.

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
skip; without `commitInteraction` only its commit halves do. The keys case
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
an import, keep-open across a host's view change, keys that stay on the canvas),
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
cases need none; the keys case needs one, so a second suite
([`test/keys.conformance.test.ts`](test/keys.conformance.test.ts), jsdom) mounts
the reference into `attachedHost()`, runs every case on it, and holds the keys
saboteurs.

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
  `setViewState` (or a host's fit) the interaction is still open with its typed
  input, and the user's commit writes what it would have written without the
  view change (today: L5 RECOMMENDED, advisory in the L5 interaction case).
- **Keys stay on the canvas:** a key acts only while the canvas holds the
  focus; a key aimed at the host's controls and editors or at `<body>` is left
  alone, and a keydown or keyup without a key throws nothing (today:
  RECOMMENDED since 1.4, advisory in the keys case).

## License

MIT
