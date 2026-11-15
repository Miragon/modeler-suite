# CLAUDE.md

TypeScript modeler for the board: a canvas of a repository's own files. Models are shown and edited
in place, each by an editor the host hands in and each saved in its own file, next to notes,
images, groups and arrows. The board stores where a file sits, never what is in it. The file is a
`.board` text, one JSON line per element. Unlike every other modeler of the suite its canvas is
[React Flow](https://github.com/xyflow/xyflow) (`@xyflow/react`, MIT) on React, not diagram-js: it
lays out HTML nodes that hold whole editors.

**Work in progress.** The board was built and measured in designIQ
(`apps/web/src/notations/board` there, at commit `ce12684`), and its canvas was moved here as it
was measured. That move is done; the apps around the board are not.
[State of the port](#state-of-the-port) says what is in the tree, what was run on it and what is
still to come. Where this file describes something that is not built yet, it says "planned" or
"still to come".

This modeler is `modelers/board` in the Miragon modeler suite. The suite's
[`CLAUDE.md`](../../CLAUDE.md) holds the rules for every modeler (setup, commands, commits and
signing, exact pins, releases, the design system, the contract and shell boundaries); this file
adds what is special to the board and names where the board deviates from them. Run its scripts
from the repository root as `npm run board <script>`, or as `npm run <script>` inside
`modelers/board`.

## State of the port

In the tree:

- `schema-model` and the document half of the renderer (`store/`, `arming/arm-rules.ts`,
  `arming/types.ts`), with their unit tests.
- The canvas, moved from designIQ and cut over to the host interface: every other folder of
  `packages/renderer/src`.
- The public API in its declared shape (`src/index.ts`, `host/types.ts`, `collaborative/api.ts`),
  the option `liveDocument` included.
- The four functions that were over the suite's 150 lines per function, each split by extraction
  (reason 3 of [the rule of this port](#the-rule-of-this-port-moved-as-measured)):

  | Function                                                         | Cut into                                                                                                                                                                                              | What holds the split                                                                                        |
  | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
  | `createBoardArming` (`arming/board-arming.ts`)                   | six parts, cut statement by statement, which `board-arming.ts` composes: `arming-state.ts`, `arming-motion.ts`, `arming-placement.ts`, `arming-transitions.ts`, `zoom-guards.ts`, `viewport-watch.ts` | `arming.browser.test.ts`: 73 scripted scenarios against traces that were recorded while it was one function |
  | `Canvas` (`canvas/board.tsx`)                                    | two hooks, `useClickOwnership` (`click-ownership.ts`) and `useCanvasKeys` (`canvas-keys.ts`), called where the code stood, so its 22 hooks register in the measured order                             | `canvas.browser.test.tsx`                                                                                   |
  | `OverlaySurface` (`surface/overlay-surface.tsx`)                 | the placement, `placeHost` in `surface/place-host.ts`                                                                                                                                                 | `overlay-surface.browser.test.tsx`, which passed unchanged before the split and after it                    |
  | `createCollaborativeModeler` (`collaborative/collaborative.tsx`) | `selection.ts`, `view.ts`, `imports.ts` and `elements.ts`                                                                                                                                             | the conformance kit, green before the split and after it, and `collaborative-parts.test.ts`                 |

- The stylesheet on its own feet: `assets/board.css` reads the design system's roles through one
  alias block on `.board-root`, `assets/board-base.css` is the base it was measured on, and the
  bench's rules and the preview chrome rules for designIQ's editors are gone (see
  [Stylesheet and theme files](#stylesheet-and-theme-files)).
- The contract's conformance kit bound to the factory
  (`test/browser/conformance.browser.test.ts`): 36 cases, seven of them pinned as skips, no
  advisory (see [Tests](#tests)).
- The tests of all of it: 14 unit files with 239 tests and 11 browser files with 480 tests.

**What was run, and what was not.** On the machine the move was made on, with the tree as it
stands: `npm run board lint`, `test`, `depcruise` and `format:check` pass, the checksums of the
theme files verify, and the browser project passes three runs in a row through the local sandbox
config (see [Commands](#commands)). Not run: `npm run board test:browser` with the committed
config (that machine must not start Chromium without its sandbox), CI, brand-lint (the
`miragon-brand` plugin was not on that machine) and designIQ's batteries, which need designIQ's
editors.

**Without a test here**, by a reading of the test files: a node dragged with the pointer (and with
it the group that takes the node or lets it go), an arrow drawn from a handle, the grips of a
selected arrow, an image dropped on the window, the resize of a model and of an image node, and
the toolbar's buttons for the zoom, a note and a group. What those gestures write is under a test
(`writeDrop`, `addNode` and the other actions, in the unit tests and through the kit); the
gestures themselves are not.

Still to come: `apps/webapp`, `apps/vscode`, the Orca plugin, `e2e/`, `example/`, `docs/`, the
entry in the modeler collection and the board's row in the suite's `CLAUDE.md`. Until
`apps/vscode` exists, `npm run test:plugin` fails in `test/modeler-collection.test.ts` and in
nothing else. The board has no `build:webapp`, `package:vscode`, `test:e2e` or `test:vscode`
script, so `npm run modelers <script>` fails at the board for those.

**No marked lint line.** The four functions above carried
`// eslint-disable-next-line max-lines-per-function -- port: split by P<n>` until their split.
`grep -rn "port: split by" modelers/board/packages` prints nothing now, and the one directive left
in the packages is the original `no-control-regex` in `canvas/presence-format.ts`. Never add one
for a function's length: a function over the limit is split by extraction.

**Frozen for the port.** While the five work packages of the move ran side by side, the seams
between them did not change: the public API, `runtime/`, `arming/arming-api.ts`,
`arming/armed-editor.ts`, `flow/flow-types.ts`, `flow/derived-arrows.ts`, `host/defaults.ts`,
`gestures/`, `parts/inline-edit.tsx`, `geometry.ts`, `collaborative/internals.ts`, the four files
the foundation left in `test/support/`, the export names and props of the lazily loaded components
(`ModelNode`, `TextNode`, `ImageNode`, `GroupNode`, `ArrowEdge`, `DerivedEdge`, `Toolbar`,
`BoardGestures`, `BoardPresenceLayer`, `OverlaySurface`, `Board`) and the
[DOM contract](#dom-contract). A change to one of them was to be recorded here. None was made: the
packages and their integration ended with every one of these as the foundation of the move left
it. Two sentences of the public JSDoc say something else than what is built and wait for the
owner's decision, not for an edit in passing: what a rejected `EmbeddedEditor.ready` shows (see
[What is left with the host](#what-is-left-with-the-host)) and what keeps the fit of a live
document away (see `liveDocument` under [Layout](#layout-of-packagesrenderersrc)).

## Packages

Every workspace is `private`: the modeler publishes nothing to npm. The packages export their
TypeScript source (`"exports": { ".": "./src/index.ts" }`), have no `dist`, and `build` is a type
check.

| Package                       | Purpose                                                                                                                                                                                                          | DOM |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `@miragon/board-schema-model` | The file format and its strict reader (`format.ts`), the elements of a board (`types.ts`), their paint order as fractional indices (`order.ts`), what a canvas draws of a snapshot (`view.ts`)                   | no  |
| `@miragon/board-renderer`     | The board as a live document on Yjs, its store and actions, the arm rules, the React Flow canvas, the contract factory `createCollaborativeModeler`, the stylesheet (`@miragon/board-renderer/assets/board.css`) | yes |

- **Boundaries.** `schema-model` is the suite's DOM-free package (`modelerSuite.domFreePackages`).
  Two rules of the board's own in `.dependency-cruiser.cjs` add what the presets do not stop:
  `schema-model-no-canvas-libraries` (no React, React Flow or Yjs in the schema model) and
  `document-half-no-canvas` (`store/`, `host/`, `arming/arm-rules.ts` and `arming/types.ts` import
  neither React nor React Flow, nor anything under `runtime/`, `flow/`, `gestures/`, `parts/`,
  `canvas/`, `nodes/`, `edges/`, `surface/` and `collaborative/`). `eslint.config.js` adds
  `eslint-plugin-react-hooks` for the renderer (`rules-of-hooks` an error, `exhaustive-deps` a
  warning).
- **Dependencies.** Exact pins and no ranged peers while nothing is published (the Business Model
  Canvas rule). The renderer depends on `@xyflow/react`, `react`, `react-dom`, `yjs`,
  `lucide-react`, `markdown-it`, `dompurify` and `@miragon/modeler-api`; the pin on the contract
  has its two `extra-files` entries in `release-please-config.json`. There must be one copy each of
  `yjs`, `react`, `react-dom` and `@xyflow/react` under this modeler: the store tells its elements
  by `instanceof Y.Map`, and a second React breaks every hook. `test/single-copy.test.ts` reads
  the lockfile for it, the job ranged peers do in the published modelers.
- **React Flow internals.** The arming, the gestures, the placement, the overlay surface, the
  canvas's keys and the toolbar read React Flow's internal store (`useStoreApi`): `transform`,
  `panZoom`, `nodeLookup` with `internals.positionAbsolute` and `measured`, `nodes`, `edges`,
  `domNode`, `width`, `height`, `minZoom`, `maxZoom`, `fitViewQueued`, `connection`,
  `nodesSelectionActive`, `multiSelectionActive` and `addSelectedNodes`. The board was measured on
  12.12.1, the version pinned. `test/browser/react-flow-internals.browser.test.tsx` names these
  fifteen fields, so a bump of `@xyflow/react` that renames or reshapes one fails there first.
  Whoever reads a new field adds it there.

## The `.board` format (`packages/schema-model`)

One JSON header line (`format`, `version`, `meta`), then one JSON line per element sorted by id,
keys sorted at every depth, a trailing newline: the same board gives the same bytes, and a change
of one element changes one line. It is designIQ's house format for element-wise documents, and the
two implementations write the same bytes for the same board, so `BOARD_FORMAT` is never renamed.

- `parseBoardText` is strict: it answers `{ ok: false, reason }` for a text that holds anything
  `encodeBoard` would not write back (a line that is no JSON, a second header, a repeated id, a
  header of another version), and keeps attributes and element kinds it does not know. An empty
  text is a new board. `encodeBoard` is canonical.
- An element is drawn only when it has the shape of a node or an arrow (`isNodeAttrs`,
  `isEdgeAttrs` in `view.ts`: `"kind": "node"` or `"edge"` and the fields that go with it).
  Anything else stays in the document untouched and off the canvas.
- A node of type `model` or `image` holds the repository-relative path of its file (`file`) and
  nothing of the file's content. Positions are integers; a member of a group is positioned
  relative to the group; `z` is a fractional index, ties broken by element id.

## Layout of `packages/renderer/src`

Four layers: the document half, the runtime, the canvas, the contract. A file imports from its own
layer and from the layers before it. `npm run board depcruise` enforces the first step
(`document-half-no-canvas`, which names the folders) and reports any cycle; the other steps are
how the code stands today, and a split must keep them.

| Folder                  | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Layer                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `store/`                | `document.ts` (the board as a live Yjs document, one `Y.Map` per element), `board-store.ts` (what a canvas reads and writes: one gesture is one transaction, the undo manager), `actions.ts` (what the board's features write into the document)                                                                                                                                                                                                                                                                                                                                                                                                      | document half          |
| `host/`                 | `types.ts` (the public host and embedded-editor types), `defaults.ts` (how the board reads a host, with the answer of a host that offers nothing)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | document half          |
| `arming/`               | `arm-rules.ts` and `types.ts` (the arm rules as pure functions: document half), `arming-api.ts` (the records and the two sides of the arming module), `armed-editor.ts`, `board-arming.ts` (the rules at work: its header says what they do, and it composes the six parts), `arming-state.ts` (what the parts share, one object), `arming-motion.ts` (the move: one viewport write per frame), `arming-placement.ts` (where a node is armed), `arming-transitions.ts` (arming and disarming), `zoom-guards.ts` (a zoom the board sees coming: the wheel, press and key listeners), `viewport-watch.ts` (a zoom nobody saw coming, and the URL's arm) | document half, runtime |
| `runtime/`              | `options.ts`, `counters.ts`, `surface.ts` (types), `board-context.tsx` (the runtime made once outside React, the provider, `Slot`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | runtime                |
| `flow/`                 | `flow-types.ts`, `derived-arrows.ts` (pure), `board-flow.tsx` (the document in React Flow's controlled mode)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | runtime                |
| `gestures/`             | notices, the groups that would take a dragged node, the edit request, where a new node goes, the board zoom for CSS, the image import                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | runtime                |
| `parts/`, `geometry.ts` | `inline-edit.tsx` (a short text edited where it stands); how the board reads the screen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | runtime                |
| `canvas/`               | `board.tsx` (`<ReactFlow>` and the slots), `click-ownership.ts` and `canvas-keys.ts` (the two hooks cut out of `Canvas`: whose click and whose delete it is beside an armed editor; the board's keys on the pane), the toolbar, the gestures that belong to no node, the presence layer with `presence-format.ts`                                                                                                                                                                                                                                                                                                                                     | canvas                 |
| `nodes/`, `edges/`      | what a node and an arrow draw; `note-markdown.ts` renders a note's Markdown sanitised                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | canvas                 |
| `surface/`              | `overlay-surface.tsx` (a host's editor in a model node, moved into a screen-space layer while the node is armed), `place-host.ts` (where that editor's element stands: `placeHost`, called from the component's effects and from every tick of React Flow's store, and the record type `OverlayRuntime`)                                                                                                                                                                                                                                                                                                                                              | canvas                 |
| `collaborative/`        | `api.ts` (the public types and `NOTATION`), `collaborative.tsx` (the contract factory: the state of one board, the runtime, the change event and the returned modeler), its parts `view.ts` (the view, the fit and `BoardSession`, the state the parts share), `selection.ts`, `imports.ts` (the import queue) and `elements.ts`, `internals.ts` (the runtime behind a board, for this package's tests only)                                                                                                                                                                                                                                          | contract               |
| `assets/`, `theme/`     | `board.css` (the one exported sheet) and `board-base.css` (its base, which it imports into the layer `board-base`); the two vendored token files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |                        |
| `index.ts`, `css.d.ts`  | the entry (it imports the sheet) and the module declaration for `*.css`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |                        |

- `runtime/options.ts`, `arming/arming-api.ts` and `runtime/counters.ts` import each other in that
  one direction only. designIQ had their types in one file; put together again they are a cycle.
- The parts of the arming import each other one way only: `arming-state.ts`, then
  `arming-motion.ts` and `arming-placement.ts`, then `arming-transitions.ts`, then
  `zoom-guards.ts` and `viewport-watch.ts`, then `board-arming.ts`. They share one `ArmingState`
  object, which `viewport-watch.ts` calls `armingState` because `state` is React Flow's there. A
  change in a part is a change of measured behaviour: `arming.browser.test.ts` says whether a
  trace moved.
- `surface/place-host.ts` declares `OverlayRuntime` and `overlay-surface.tsx` re-exports it:
  declared in the component's file, the two would import each other, and dependency-cruiser counts
  a type-only import as a cycle.
- The parts of the contract factory take one session object and never import `collaborative.tsx`.
  `BoardSession` is declared in `view.ts`, because a type import from a part back into the factory
  is a cycle. `selection.ts`, `imports.ts` and `elements.ts` take only types from the other parts,
  so they load without React; `view.ts` loads React Flow and the runtime for the fit. A unit test
  imports the parts, never the factory.
- `collaborative/internals.ts` is not exported from the entry: a test reads a mounted board's
  runtime with `boardRuntimeOf(modeler)`, and no host can.
- The public API is one factory, `createCollaborativeModeler(options)`, with two options of the
  board's own, `host` and `liveDocument`, plus the document half's exports. No React component, no
  React Flow type and no designIQ type crosses the boundary, so a host need not share a copy of
  React or React Flow with the board. Only `liveDocument` asks a host for the same copy of `yjs`.
- **`liveDocument`.** With the option the board works on the host's `Y.Doc` in place of one of its
  own and never destroys it; `destroy()` still takes the board's observers and its undo manager
  off it. The view is fitted once in `attachTo`, before the canvas renders, unless `fitOnImport`
  is false or `setViewState` or an import chose a view before. A transaction of any origin but
  `BOARD_LOCAL` and the undo manager's (a peer's update, an import) calls no `onContentChanged`
  and refreshes the text the next gesture is compared with; that holds without the option too and
  changes no outcome there. `importText` reconciles into the shared document under an origin of
  its own, so a sync provider sends it on as this client's change, and it empties only this
  board's history. The JSDoc of the option in `collaborative/api.ts` names `fitOnImport` and a
  view the host set as what keeps the fit away, and not an import before the attach; which
  wording stands is the owner's to settle.

## The rule of this port: moved as measured

The canvas was measured in designIQ with the product's editors: 1375 rows of the editor batteries,
193 of the arm rules, 145 of the board features. Those batteries need designIQ's editors and run
again only when designIQ consumes this package. Until then a change of behaviour here is a change
nobody measures, so the canvas is a **move**, not a rewrite. The rule did not end with the move:
it holds for every change until the batteries have run against this package.

A line of a moved file may change only for one of four reasons:

1. An import that cannot exist in the suite (designIQ's packages, the new layout, the `.js`
   specifier).
2. A TypeScript flag of the suite (`exactOptionalPropertyTypes`: an optional member is
   `x?: T | undefined`; `verbatimModuleSyntax`; `noImplicitOverride`).
3. The 150 lines per function. A split is an extraction: whole statements move, closure variables
   become fields of one state object, hooks are called where the code stood. No early return is
   added, no condition reordered, no comment dropped.
4. The host interface: what designIQ's hub gave, the board now asks of `host`.

What may not change: the logic, the order of statements, of hooks and of effects, the timing
(`flushSync`, the microtask in `destroy()`, the import queue), the DOM (class names, data
attributes, nesting), the selectors the code reads, the props `<ReactFlow>` gets, and the comments.
No new behaviour comes in with the port. A moved file is copied and edited in place, never retyped.

The comments stay too, also where they cite what did not move: designIQ's notes `react-flow.md` and
`sync.md` (in neither repository), sections of its bench README, `module/kit-main.ts`,
`strategies/index.ts`, `native-geometry.ts`, `lib/presence-canvas.ts`, the hub, the bench's Files
panel and `hooks.engine`, the product's editors, and the strategies `counter`, `iframe` and `shim`.
Where `surface/overlay-surface.tsx` says that the sheet hides an editor's chrome with the flag,
that sheet is the host's now. The selector `ARMED_EDITOR` still names `.board-popup-host`, which
nothing here writes. A review of these is deferred, not forgotten.

The splits moved every comment with its statements, so some now point at a neighbour. The header
of `arming/board-arming.ts` still says "this module" of the move and of the zoom guards, which
stand in `arming-motion.ts` and `zoom-guards.ts`, and the field comment "this module is writing
the viewport" stands in `arming-state.ts`. Two comments on the props of `<ReactFlow>` in
`canvas/board.tsx` say "(see above)" and "(above)" for what stands in `click-ownership.ts` and
`canvas-keys.ts`, and `canvas-keys.ts` says "switched off below" for props that are in
`board.tsx`; `nodes/model-node.tsx` and `assets/board.css` cite `board.tsx` for the click
ownership and for the keys. `collaborative/collaborative.tsx` names `module/kit-main.ts` as what
runs the kit (here it is `test/browser/conformance.browser.test.ts`) and cites `board-doc.ts`
(now `store/board-store.ts`). The head comment of `assets/board.css` still names
`src/notations/board`, the ui-kit and `board-spike.css`.

## Kept as measured

Each of these is against a habit of the suite or looks like a slip. Each is as measured, and
changing one in passing is a regression nobody would see. They are listed with their cost under
[Deferred](#deferred).

- **Module-level state, one per page.** The notices (`gestures/notices.ts`), the groups that would
  take a dragged node (`receiving.ts`), the note that opens its editor when it mounts
  (`edit-request.ts`) and the last place a node was added (`placement.ts`). Two boards on one page
  share them. `nodeTypes` and `edgeTypes` in `canvas/board.tsx` are module-level for another
  reason: a new object per render would remount every node.
- **Lazy parts.** Every node type, both edge types, the toolbar, the board gestures and the
  presence layer load through `React.lazy` behind `Slot` (an error boundary and a `Suspense`): a
  part that fails shows its error where it would be and nothing else stops. `markdown-it` and
  `dompurify` load by `import()` with the first note. So neither `board.mounted` nor a resolved
  `importText` means that the parts are drawn.
- **Page-level listeners and reads.** `document` paste and `window` dragover and drop
  (`canvas/board-gestures.tsx`); `window` pointerdown, pointerup, pointercancel, blur and a capture
  keydown that stops keys aimed at a board that moves (`arming/zoom-guards.ts`); the motion tokens
  read off `document.documentElement` and `prefers-reduced-motion` (`arming/arming-motion.ts`);
  a page-wide query for a node that is still armed (`arming/arming-transitions.ts`).
- **The board's own toolbar**, inside React Flow's panel: the Done control, the zoom buttons, the
  add actions, delete and the notices. The shell's chrome does not apply to the board as it is.
- **`lucide-react`** for the icons, where the suite's renderers copy icon geometry.
- **The fit.** Not capped at 100 %, `FIT_PADDING` (clear of the toolbar's band) applied inside the
  host's insets, `freeArea.center` accepted and not read: a new node lands in the middle of what
  the board shows. React Flow centres the content in the whole box at the zoom the padded room
  allows and moves it only as far as a side's padding asks, so a wide board stands in the middle
  of the full height and a high one starts right under the toolbar's band;
  `collaborative-parts.test.ts` pins both.
- **Focus twice, and no release at the end.** A node that is armed when its path changes gets
  `focus()` twice from its new editor (the move into the layer, and a node armed from its first
  moment). A node removed or a board destroyed while armed gets `destroy()` without a `release()`
  before it. Both are pinned in `overlay-surface.browser.test.tsx`.
- **The bench seams**, unexported. Dead when the factory mounts the board (it passes no bench and
  `arm: null`): `BoardBench`, `inputScope: "page"`, `setScreenGeometry`, the URL arm in
  `BoardArming.watch()` (`arming/viewport-watch.ts`) and, in effect, `onBeforeDelete`
  (`canvas/click-ownership.ts`): it refuses a delete only when a key reaches the board while the
  focus is on `<body>` after a press inside the armed editor, and with `inputScope: "board"` no
  real key does; `canvas.browser.test.tsx` drives it with a key dispatched by hand. Kept up by the
  canvas and read by no host: the counters, the log and the registry of the surfaces
  (`registerSurface`, `surface`, `mounted`, `reportMount`). designIQ's batteries need exactly
  these hooks; whether the package gets a second entry for them is undecided. A test of this
  package reaches them with `boardRuntimeOf`.

## What is left with the host

`options.host` has four parts, each optional and independent (`host/types.ts`; the JSDoc there is
the specification). Without any of them the board is one of notes, groups and arrows.

- **`models`: the editors.** The board has no editor and knows none: no selector or call in this
  package may name diagram-js, dmn-js or any other editor. `models.list()` and `onChange` feed the
  model picker, `describe(path)` gives the title and kind (default: the file name up to its first
  dot, no kind), and `open(context)` returns an `EmbeddedEditor`, a promise of one, or `undefined`
  when the host cannot show the file. The order the surface keeps is what the measurements rest on:
  - Mount: the board creates the element (`.board-engine`), appends it to the node, calls `open`
    synchronously, and once the editor is there places the element, calls `focus()` if the node is
    armed, and takes `editor.ready` as the node's ready. From `open`, `undefined`, a throw and a
    rejection all end in `.board-engine--failed` with the message as its text.
  - An editor whose `ready` rejects counts as failed (`runtime.mounted(id)` is false, the board's
    log has the message), and the node shows nothing of it: the element keeps what the editor
    drew. designIQ's surface did the same. The JSDoc of `EmbeddedEditor.ready` says that it
    "rejects with what the node shows instead"; which of the two gives is undecided.
  - Armed: the element moves into `.board-overlay-layer`, a child of the board outside its scaled
    viewport, at board zoom exactly 1 and with no transformed ancestor, and the board sizes it
    there. The editor must survive that re-parenting.
  - Disarmed: `editor.release()` first, while `context.armed()` still answers true and the element
    is still in the layer; then the flag, `data-armed`, the `onArmedChange` listeners; then the
    element goes back into the node.
  - Unmount: `editor.destroy()` once, then the element is removed. `context.relocate(path)` writes
    the node's new path as one gesture, and the editor is opened anew there.
- **The preview chrome rules.** A full editor is mounted from the start and its preview is `inert`
  and scaled with the board. Hiding the editor's own chrome in a preview (a palette, a context pad,
  popups) is the host's: rules of the host's sheet on `.board-engine[data-armed="false"]`.
  `board.css` has none and names no editor, and `styles.scope.test.ts` keeps it so. A host that
  forgets them shows palettes in every preview, and no test of the suite can notice. designIQ's
  sheet had two sets, which a host takes over as they are. For an editor whose first fit measures
  its own chrome and leaves room for it, as designIQ's own editors do, the chrome is hidden and
  not removed, so that the boxes keep their size and arming moves nothing (the first block
  below). For an editor whose chrome lies over its canvas and takes no part in its fit, the chrome
  is taken out (the second block; mind the two class names that differ). Chrome in the layout
  flow is hidden and keeps its room in both cases: the decision table's View DRD bar is 49 px
  above the table. A host with both kinds of editor tells them apart by an attribute of its own on
  the element; designIQ wrote `data-mount="product"`. Neither set hides `.bjs-powered-by`: the
  bpmn.io mark stays in every state, it is the licence's condition for bpmn-js and dmn-js.

  ```css
  .board-engine[data-armed="false"]
    :is(
      .djs-palette,
      .djs-context-pad,
      .djs-popup-parent,
      .djs-hover-tooltip,
      .djs-direct-editing-parent,
      .djs-search-container,
      .dmn-definitions,
      .dmn-sim-decision-requirements-diagram-panel,
      .wardley-explore-hint
    ) {
    visibility: hidden !important;
  }
  .board-engine[data-armed="false"] .view-drd {
    visibility: hidden !important;
  }
  ```

  ```css
  .board-engine[data-armed="false"]
    :is(
      .djs-palette,
      .djs-context-pad-parent,
      .djs-popup-parent,
      .djs-hover-tooltip-container,
      .djs-direct-editing-parent,
      .djs-search-container,
      .dmn-definitions,
      .dmn-sim-decision-requirements-diagram-panel,
      .wardley-explore-hint
    ) {
    display: none !important;
  }
  .board-engine[data-armed="false"] .view-drd {
    visibility: hidden !important;
  }
  ```

- **`references`: the reference parsing.** The board parses no model. The host lists
  `{ from, to, relation }` between files, and `flow/derived-arrows.ts` maps them to the nodes that
  show those files: dashed arrows that are drawn and never stored, never selected and never in
  `elements.list()`. Resting the parsing (designIQ waited 300 ms) and caching it are the host's.
- **`images`.** `read(path)` is synchronous: the bytes or `undefined`, asked again after
  `onChange`. Without `store` the board shows no Image button and answers a pasted or dropped image
  with a notice.
- **`presence`.** The cursors and selections of the people on this board. The names and colours are
  untrusted input: `canvas/presence-format.ts` sanitises the name and takes hex colours only.

How the board reads a host: through `modelListOf`, `imagesOf`, `referencesOf` and `describeModel`
of `host/defaults.ts`, as external stores (`useSyncExternalStore`). They hand out one wrapper per
part of a host, so a host keeps `host.models`, `host.images` and `host.references` the same objects
for its life, and returns the same array from `list()` until it reported `onChange`.

The arm rules decide when a model takes input (`arming/arm-rules.ts`, pure and unit-tested; the
header of `arming/board-arming.ts` says how they run). The factory mounts with the default
`exact1`, `disarm`, `stay`: a model is edited at board zoom exactly 1, the board moves there first
while the node is still a preview, and a zoom of the board disarms the node before its first tick.

## DOM contract

TSX, the stylesheet and the tests are written against these names; they are designIQ's at
`ce12684` and do not change in the port.

- `div.board-module` (appended by `attachTo`, inline width and height 100 %) >
  `.board-root[data-embedded]` > `.board-root__canvas` > `.react-flow[data-board-view]` >
  `.react-flow__pane` (`tabindex="0"`, `aria-label="Board"`: it takes the board's keys).
- `.react-flow__node[data-id]`: React Flow's wrapper of a node.
- A model node: `.board-node[data-armed][data-strategy="overlay"]` > `header.board-node__header`
  (32 px high: `.board-node__grip`, `.board-node__title`, `.board-node__notation`,
  `button.board-node__arm`) + `.board-node__body` > `.board-surface[data-surface="overlay"]` >
  `.board-surface__slot` >
  `.board-engine[data-strategy="overlay"][data-armed][data-layout="preview"|"overlay"]`. The body
  is `inert` in a preview and carries `nodrag`, `nopan`, `nowheel` and `nokey` while armed.
- `.board-engine--failed` (its text is the message), `.board-surface__placeholder` (what stays in
  the node while its editor is in the layer).
- `.board-overlay-layer.nodrag.nopan.nowheel.nokey`: a child of `.react-flow`; it holds the armed
  `.board-engine` and nothing else.
- `.board-toolbar`, `[data-board-done]` (its value is the armed node's id, empty while off),
  `[data-board-zoom]`, `.board-toolbar__models`, `.board-toolbar__delete`, `.board-notices` >
  `.board-notice[data-kind]`, `.board-drop-hint`.
- `.board-text[data-color][data-editing]`, `textarea.board-text__editor`,
  `.board-image[data-missing]`, `.board-group[data-receiving]`, `.board-derived-label[data-rel]`,
  `.board-presence__cursor`, `.board-presence__outline`.
- `.board-slot` (a part that loads), `.board-slot--error` (a part that failed).
- `--board-zoom` on the two edge layers; `.nokey` on whatever keeps its keys from the board.
- Gone with the move: `data-mount`, `data-notation`, `.board-node__strategy`, and the rules of
  `.board-stub` and `.board-frame`, which nothing writes.

A host may add classes and data attributes of its own to the `.board-engine` it was given, never a
position or a size.

## Stylesheet and theme files

- **Two theme files, not three.** `src/theme/` vendors `cd-tokens.generated.css` and
  `cd-tokens.generated.json`, unchanged, with their entries in `.miragon/brand-assets.yaml` and
  `.miragon/brand-assets.sha256`; `.gitattributes` marks them as generated. Never edit or reformat
  them: re-copy them with the `miragon-brand` plugin's `scripts/brand-assets.mjs`. The board's
  entries in the two `.miragon` files were written by hand, since the plugin was not on the
  machine: the files are byte for byte Business Model Canvas's and the checksums verify
  (`sha256sum -c .miragon/brand-assets.sha256` from the root), but whoever has the plugin at the
  version the yaml names should run the script once and see that it writes the same lines.
- **`cd-canvas.css` is absent on purpose.** The suite's rule says every renderer vendors three
  files; the board deviates, and no check asks for the third. That file holds the role classes of
  the SVG renderers (`cd-c-*`) and maps the variables of diagram-js and bpmn-js to the roles. A
  React Flow canvas has none of them, and imported into a board's page the file would restyle the
  diagram-js editors a host mounts in the board's nodes. Whether to vendor it unread for
  uniformity is an open question to the suite's owner; until it is answered, do not add it
  (`theme.sync.test.ts` fails on a third file in `theme/`).
- **`assets/board.css`** is the one exported sheet. It starts with three imports, in this order:
  the tokens into the layer `board-tokens` (a host's own tokens are unlayered and win), React
  Flow's sheet unlayered, and `assets/board-base.css` into the layer `board-base`. One alias block
  on `.board-root` then declares 22 colour names and 2 font names as `--board-*`. Every rule reads
  those, `--cd-ui-*` roles and the mode-independent tokens (`--cd-radius-*`, `--cd-shadow-*`,
  `--cd-motion-*`, `--cd-ease`), and no colour literal. Each alias reads the role whose light
  value is the one the name had on designIQ's page (`--board-background` reads
  `--cd-ui-flaeche`, `--board-secondary` `--cd-ui-grund`, `--board-ring` `--cd-ui-fokus`,
  `--board-primary` `--cd-ui-interaktion`; `theme.sync.test.ts` holds the whole table), so the
  light picture is the measured one. Two aliases are the same in both modes, as guide §8 has it
  for a primary button: `--board-primary-hover` (`--cd-blau-link`) and
  `--board-primary-foreground` (`--cd-weiss`). Nothing is declared on `:root`, `html` or `body`.
  `--board-zoom` is no alias: the canvas sets it on the two edge layers.
- **`assets/board-base.css`** is the base the sheet was measured on, for the board's own elements
  only: Tailwind 4.3.5's preflight (MIT; its notice is the file's first comment) without its
  `html` rule, and the two declarations designIQ's ui-kit put on every element (`border-color`,
  `outline-color`). Every selector is `.board-root :where(SELECTOR):not(:where(.board-engine *))`:
  the `.board-engine` the board hands a host is reset, what the host puts below it is not. A
  pseudo-element stands behind the `:not()`, never inside `:where()`, where it matches nothing.
  `:where()` leaves every rule at the weight of one class, so the order of the rules is part of
  the file: the ui-kit's two declarations stand in a rule of their own directly after the first
  rule, before `table`, and on elements only, as a pseudo-element had neither on the measured
  page. On `.board-root` the file sets what designIQ's page gave by inheritance:
  `font-size: 16px`, `line-height: 1.5`, `tab-size: 4`, `-webkit-font-smoothing: antialiased`. As
  a layer it loses to every unlayered rule: to React Flow's and the board's own, as on the
  measured page, and to a host's. A host page that styles bare elements outside a layer
  (`button`, `h1`, `*`) reaches the board's elements.
- **Reduced motion.** The last rule of `board.css` stills the board's own elements under
  `prefers-reduced-motion: reduce`, scoped as the base is. On designIQ's page that rule stood on
  `*` and reached the hosted editors too; stilling an editor is the host's now.
- **What the sheets do not set.** `color-scheme` (designIQ's page set `light`; here the page's
  value applies, and under `data-cd-theme` the tokens set one), and two declarations of
  preflight's `html` rule that only a touch device shows, `-webkit-text-size-adjust: 100%` and
  `-webkit-tap-highlight-color: transparent`. Whether `.board-root` gets those two is an open
  decision. `.board-root` itself is not reset, the base starts below it; it has no padding,
  border or outline.
- **Dark is not designed.** The aliases were chosen for equal light values. Below
  `data-cd-theme="dark"` the board follows the page's roles, unreviewed, until an appearance
  surface exists.
- **How the unchanged picture was checked.** By the alias table, by a textual diff against
  designIQ's sheet (renamed and formatted, only the imports, the alias block, the removed rules
  and the reduced-motion rule differ), and once, not as a kept test, by comparing every computed
  value of a static board (248 elements with their `::before` and `::after`, 669 properties each)
  under designIQ's page sheet and under this one in Chromium: no box differed, and no property of
  the board's elements but `color-scheme` and the two named above. Not against designIQ's live
  page, and not in dark.
- An app that bundles the package is to import the sheet by name as well
  (`@miragon/board-renderer/assets/board.css`), as the Business Model Canvas web app does with its
  renderer's: the package marks only its CSS as having side effects, and Rollup then leaves out
  the import inside a barrel. Its third-party notices then need Tailwind's (MIT), for the base.

## Tests

- `npm run board test` (project `unit`, Node). `packages/schema-model/test/` covers the format,
  the order keys and the view. `packages/renderer/test/` covers the store, the actions, the arm
  rules, and the board file at rest, under a Git merge and under two peers on one live document.
  Of the canvas side it covers the parts that need no browser:
  - `derived-arrows.test.ts`, `host-defaults.test.ts` and `single-copy.test.ts`.
  - `presence-format.test.ts`: what a peer announces about itself. Hex colours only, anything else
    the design system's quiet text colour; a name without control characters, double quotes and
    backslashes, 24 characters at most, "?" for nothing.
  - `collaborative-parts.test.ts`: the parts of the contract factory without a canvas. What a
    host's view state is taken for, the fit, the names and boxes of the elements, the selection,
    the order of the imports.
  - `theme.sync.test.ts`: the two vendored files against `.miragon/brand-assets.sha256` and no
    third file in `theme/`; no hex, `rgb()` or `hsl()` in either sheet; every `--cd-*` read is a
    role, a mode-independent token or a fixed value of guide §8, and the vendored tokens define
    it; the three imports first; the alias block holds exactly the 24 names and each resolves
    through `hell` (or `fest`) of the JSON to the light value it had in designIQ; no read of a
    name of designIQ's ui-kit and none of an undeclared `--board-*` name.
  - `styles.scope.test.ts`: every selector of both sheets starts at a `.board-*` class, but for
    exactly three that start at `.react-flow__node` and end on a board class; none names `html`,
    `body`, `:root`, `:host`, an editor (`.djs-`, `.dmn-`, `.bjs-`, `.bpmn-`, `.wardley-`,
    `.view-drd`, `data-mount`) or the bench (`.board-stub`, `.board-frame`); every selector of the
    base has the scoped form, with pseudo-elements behind the `:not()`.
- `npm run board test:browser` (project `browser`, Chromium) runs
  `packages/renderer/test/browser/**/*.test.{ts,tsx}`: React Flow measures its nodes, so nothing
  of the canvas runs in jsdom or Node.
  - `toolchain.browser.test.tsx`: a board of notes mounts with its sheet and a pane that takes
    the focus, a model node asks the host once for its editor, a double-click arms it at board
    zoom 1 in the layer, a zoom of the board releases it, and `exportText()` gives back the
    imported text. It also checks the test support itself.
  - `react-flow-internals.browser.test.tsx`: the fields of React Flow's store the board reads.
  - `arming.browser.test.ts`: the arm rules at work on a bench of fakes (React Flow's store as far
    as the rules read it, a runtime that records the armed node, a clock stepped by hand), no
    board mounted. 73 scenarios: armed at once, the move and what interrupts it, the box that
    changes under it, the motion sources, a zoom seen coming and one not seen coming under each
    rule, the way back, the URL's arm, the undo of the guards. Each scenario is held against a
    claim written beside its script and against its trace in
    `test/browser/fixtures/arming-traces.json`.
  - `canvas.browser.test.tsx`: the pane's focus stop and name; Delete and Backspace on the
    focused pane remove the revealed element as one change; Control or Command + Z, Shift + Z and
    Y; `undoRedoKeys: false`; a key aimed at the page, at a button beside the board or at a
    note's textarea is left alone; a press that holds Control or Command adds to the selection;
    beside an armed editor a click inside the layer and the tail of a drag leave selection and
    arming alone, and a click on the bare pane disarms; whose delete it is.
  - `chrome.browser.test.tsx`: the model picker (title and kind, the host's list, one node and
    one change per choice); the Image button and a picked, a pasted and a refused image; the Done
    control; the arrows derived from `host.references`; the presence layer (a peer's cursor,
    name, colour and outline; this person's pointer and selection published, the cursor taken
    back inside an armed editor, null when the board goes).
  - `overlay-surface.browser.test.tsx`: the order the surface keeps. One `open` with the element
    already in the node, before the mount is reported and the surface registered; `mounted` only
    after the editor's `ready`; armed: the listeners with `data-armed` written and the element
    still in the node, then the element in the layer at the node body's rectangle, then
    `focus()`; a pan moves the armed element before `setViewState` returns; a board zoom gives
    `release()` with `armed()` true and the element in the layer, then the flag, then the element
    back in the node without inline styles; one `destroy()` and no element after a removed node,
    a destroyed board and a late editor; `relocate` as one gesture, ignored after the unmount;
    the three failure looks.
  - `nodes.browser.test.tsx`: a model node's header from the host's `describe` and from the file
    name, `inert` and the four classes, the two error texts; an image from the host's bytes and
    its changes; a note's Markdown, what it never draws (raw HTML, a script, a picture), its
    editor (one write per commit, none for an unchanged text, none over a peer's change), its
    toolbar and its resize; a group's name, its zoom variable and its resize with its members;
    an arrow's label; `arrow-shape.ts`.
  - `conformance.browser.test.ts`: the contract's kit (below).
  - `embedded-model.browser.test.ts`: the two checks designIQ's kit page ran beyond the kit. One
    editor of the host in the model node; a double-click arms it at board zoom exactly 1 in the
    overlay layer, and a zoom of the board makes it a preview again.
  - `live-document.browser.test.ts`: the option `liveDocument`.
  - `styles.browser.test.ts`: static markup after the DOM contract with only the sheet imported,
    on a bare page and on a page with `html { font: 13px/1.2 serif }`. The header of a model node
    is 32 px and the body the node minus it; a padded box keeps its set size (a failed
    `.board-engine`, a note's editor, a slot); nothing below `.board-engine` is reset; the base
    stays under React Flow's sheet; thirteen colours of the light picture; and under an emulated
    `prefers-reduced-motion` the board's elements are stilled and a host's editor is not. It
    imports no component, so it waits for nothing.
- `packages/renderer/test/support/`: `board-texts.ts` (the texts designIQ's bench measured the
  board with, byte for byte: never edited by hand), `test-host.ts` (`createTestHost`: a host in
  memory whose editors record `open`, `armed`, `release`, `focus` and `destroy`), `mount-board.ts`
  (`mountBoard(text, options)`: a board through the entry, in the kit's 800 x 600 host element),
  `pointer.ts` (`click`, `doubleClick`, `key`) and `arming-scenarios.ts` (the bench of the arming
  test, its scenarios and `traceText`, which writes the fixture's text).

**The arming traces.** `test/browser/fixtures/arming-traces.json` was recorded from
`createBoardArming` while it was still one function, and the split was accepted because the six
parts give the same bytes. Never update the fixture with `-u`: it would then record whatever the
code does today. A wanted change of the rules is recorded anew on purpose, and the pull request
says which traces moved and why. The fixture holds no list of plain values, so `JSON.stringify`
writes what Prettier accepts; keep it so. Two statements of the arming are under no trace, because
no caller can see them: the guard `if (state.move !== current) return;` in the move's step and
`state.boardElement = null` in the undo of `attach`. The selector of a node that is still armed is
checked by the control test in `arming.browser.test.ts` alone (a runtime that shows a disarm
late), not by a trace.

**The conformance kit and its pinned skips** (`test/browser/conformance.browser.test.ts`). The
suite's rule is zero: a skipped case or an advisory fails a renderer's run, because its test
passes an `onSkip` that throws. The board binds the kit with seven skips pinned instead, and that
is a deviation with an end, not a new rule:

| Skipped case (its name up to the first colon) | What it waits for                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `L1 (recommended, 1.5)`                       | the harness hook `startGesture`: a gesture a harness can hold and cancel |
| `drop (recommended, 1.6)`                     | `startGesture`                                                           |
| `drag start (recommended, 1.6)`               | `startGesture`                                                           |
| `destroy from a listener (recommended, 1.6)`  | the gesture hooks, for the legs it cannot check without them             |
| `interaction (when present, 1.5)`             | the `interaction` surface                                                |
| `viewer (when shipped)`                       | a viewer mount (the harness hook `createReadonly`)                       |
| `appearance (when present, 1.5)`              | the `appearance` surface                                                 |

The hooks stay unfilled because the board lacks what they drive, not because the harness is
unfinished: see [Deferred](#deferred).

The list is checked in both directions (a skip that is not on it throws, and a listed case that
stops skipping fails until its name is removed), an advisory throws, and the list may only shrink.
It is compared whole, so a run of some cases only (`-t`) fails at its end. A skip is the kit's
word for a case it could not verify, or not all of: Vitest counts all 36 cases as passed, and
seven of them report through `onSkip`. The merge kit is not registered: the board has no text
merge.

`pan (recommended, 1.6)` was the eighth name. It left the list when the harness hook `startPan`
was filled, and nothing of the board changed for it: a press on a bare point of the pane, held
and moved 40 px at a time, every event with `view: window`. d3-zoom (3.0.1 here), which React
Flow pans with, re-anchors a held pan when the view is set by a call, so the pan runs on from the
view an import or the host left. The case can fail: with a `move()` that does nothing the kit
reports the pan as stopped, and with a press that never moves it says that the case proves
nothing.

Seen in this tree, always through the sandbox config: 36 cases, the eight skips and no advisory in
19 runs before `startPan` was filled, two of them before the factory was split; 36 cases, the
seven skips and no advisory in each of the 25 runs since.

Notes for whoever writes a browser test:

- `mountBoard` resolves once the toolbar, a wrapper per node and every lazily loaded part that
  shows itself loading are in place. It does not wait for what answers later: an editor's `ready`
  (poll `runtime.mounted(nodeId)`), a note's rendered Markdown, the arrows, React Flow's first
  measure of the nodes, and the silent slots (below).
- Without it: `attachTo(element)` wants an element that is in the document and has a size.
  `modeler.board.mounted` resolves once React Flow's viewport exists and never rejects;
  `importText` called after `attachTo` waits for it (10 s at most) and then one macrotask. Neither
  waits for the lazy parts.
- `exportText()` is canonical, so only a text in canonical form comes back byte for byte.
- Every synthetic `MouseEvent` needs `view: window`: d3-zoom and d3-drag, which React Flow pans,
  zooms and drags with, bind their move and release listeners on `event.view`. A click needs its
  press before it: the board asks where a click began. `pointer.ts` does both. It has no press
  without its click: the tail of a drag (a press on one element, a click on another) is
  dispatched by hand in `canvas.browser.test.tsx`.
- An arrow is drawn only between measured nodes and loads silently: poll for it. React Flow
  measures a node a frame after its wrapper mounts, and its resizer starts from `measured`, from
  0 before the measure, so a synthetic resize that starts too early writes a negative size into
  the file (see [Deferred](#deferred)). Before a resize, wait for an arrow of the board. A
  synthetic resize is a `mousedown` on `.react-flow__resize-control.handle.<side>` and a
  `mousemove` and `mouseup` on `window`.
- A silent slot shows no `.board-slot` while it loads, so `mountBoard` does not wait for the board
  gestures or the presence layer. Wait for what they write: `data-board-view` on `.react-flow`
  (the gestures' listeners are on), `.board-presence` and then `settle()` (the presence layer
  listens). That a lazily loaded part draws nothing shows only after another board has loaded it.
- `elements.reveal(id)` selects through React Flow's change path and is in React Flow's store a
  commit later: before a key that acts on the selection, poll for the wrapper's class `selected`.
  The delete key asks `onBeforeDelete` first, so the document changes a task later: poll
  `exportText()`. Undo and redo by key are synchronous.
- `element.blur()` fires React's `onBlur` in the test page, so a note's and a label's commit need
  no real focus change. A choice in the model picker is `select.value = path` and a bubbling
  `change` event; a picked image is `input.files = dataTransfer.files` and a bubbling `change`;
  a paste is a `ClipboardEvent` whose `clipboardData` is a `DataTransfer`.
- The notices are one list per page. Dismiss them in `afterEach`, or the next board's toolbar
  shows them.
- A host for a test keeps its parts and its arrays stable (see
  [What is left with the host](#what-is-left-with-the-host)), or React subscribes anew on every
  render. `createTestHost` does. A mocked host port must do the same: one that handed out a new
  empty array from every `list()` ended in React's "Maximum update depth exceeded".
- `vi.mock` works in the browser project. To see that an assertion can fail without editing a
  source file, replace one module for your own test file: a factory that spreads
  `importOriginal()`, or one that holds the module's own text with one statement changed.
- Do not add a window `error` or `unhandledrejection` listener in a browser test: while one is
  registered, Vitest stops counting real unhandled errors of that page.
- `optimizeDeps.include` in `vitest.config.ts` names the twelve dependencies that are pre-bundled
  up front. If a run prints "optimized dependencies changed. reloading", add the dependency there.
- Chromium may log "ResizeObserver loop completed with undelivered notifications" as a window
  error while the kit runs. It was seen in designIQ's harness, and here once in 19 runs with the
  verbose reporter (the default reporter does not print it), in the kit's case that mounts two
  boards at once (`elements (when present, recommended)`). It failed no test: Vitest prints a
  window error that carries no error object and does not count it. `canvas/board.tsx` says what
  the board does against the line for a resize. If Vitest ever counts it as an unhandled error,
  filter exactly that message and record it here. Several of the kit's cases listen for window
  errors while they run (the pan case among them) and report one as an advisory, which fails the
  run here. That was not seen; if it shows, it is a flicker with this cause, to be recorded here
  and never answered with a longer skip list.

## Commands

- `npm run board lint` (ESLint and the type check) · `typecheck` · `build` (the same type check) ·
  `test` · `depcruise` · `format` · `format:check`
- `npm run board test:browser`: the committed browser project. The root's `npm run test:browser`
  runs it with every other modeler's.
- `sha256sum -c .miragon/brand-assets.sha256` from the root: the vendored theme files.
- Not there yet: every script of an app (`build:webapp`, `build:vscode`, `package:vscode`,
  `dev:webapp`, `test:e2e`, `test:vscode`).

**Where Chromium must not run without its sandbox** (the Miragon agent VM is such a machine):
Playwright's default launch passes `--no-sandbox` there, so `npm run board test:browser` and
`vitest --project=browser` are never run on it, and neither is Chromium with `--no-sandbox`.
Browser tests run only through a local config, `modelers/board/vitest.sandbox.config.ts`, which is
never committed (`.git/info/exclude` holds `modelers/*/vitest.sandbox.config.ts`). It is the
browser project of `vitest.config.ts` alone, with the sandbox on and a cache folder of one's own:

```ts
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

const cacheDir = process.env.BOARD_VITE_CACHE;

export default defineConfig({
  ...(cacheDir ? { cacheDir } : {}),
  // the same twelve as vitest.config.ts
  optimizeDeps: {
    include: [
      "@miragon/modeler-api",
      "@miragon/modeler-api/conformance",
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@xyflow/react",
      "yjs",
      "lucide-react",
      "markdown-it",
      "dompurify",
    ],
  },
  test: {
    name: "browser",
    include: ["packages/renderer/test/browser/**/*.test.{ts,tsx}"],
    browser: {
      enabled: true,
      provider: playwright({ launchOptions: { chromiumSandbox: true } }),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
```

```sh
cd modelers/board
BOARD_VITE_CACHE=<a folder of your own>/node_modules/.vite-board \
  npx vitest run --config vitest.sandbox.config.ts <test files>
```

`BOARD_VITE_CACHE` lets several people run it at once without sharing Vite's pre-bundle. A path
with a `node_modules` segment keeps Vite from warning about Vitest's own pre-bundle ("The above
dynamic import cannot be analyzed"); without one the warning comes with every run and fails
nothing. Keep the two `optimizeDeps.include` lists identical.

## Deferred

Known, decided against for now, and not bugs. One that changes measured behaviour or adds
behaviour comes with a browser test of its own.

- A viewer mount, the `appearance` surface and themes, an image export, a three-way text merge.
- Gestures under the contract: a gesture tracker, a selection of the board's own that empties at a
  drag's start, a cancel that makes a drop write nothing, an armed tool, a create by a held
  gesture. The board adds by click; the one drag that creates is an arrow drawn from a handle.
- State per board in place of the module-level state; the page-level listeners made the board's
  own. The window drop listener will collide with a web app's drop zone, and the capture keydown
  is against the contract's "never stops a key it does not act on".
- The fit capped at 100 %, `freeArea.center` read, a new node placed in the free area.
- A view and command surface for a host's chrome, and a way to switch the board's toolbar off.
- An adapter that mounts any modeler of the suite as an embedded editor: the contract has no call
  for `release` and `focus` yet.
- The bench seams: a second entry for designIQ's bench, or their removal.
- A design-system review: copied Lucide geometry in place of `lucide-react`, icon sizes, handles
  and tints, note colours in dark, the window breakpoint and `60vw`, `z-index: 2000`, the tap
  highlight and the text size adjustment on `.board-root`, the cost of the base's selectors on a
  board with large editors (not measured), and the comments that cite designIQ's documents or a
  file their statements left with a split.
- Publishing: ranged peers for `yjs`, `react`, `react-dom` and `@xyflow/react` with exact
  mirrors, a build, a release-please component, a notice for `dompurify` and one for Tailwind's
  preflight (MIT), of which `assets/board-base.css` is a scoped copy.

Found in the moved code during the port and left as it was measured. Each is a change of
behaviour, so each wants its own decision and its own test:

- **The ground of a failed editor.** `.board-engine--failed` sets the destructive tint, but
  `.board-engine.board-engine` (twice the class) sets the canvas ground at a higher weight, so a
  failed editor shows its message on white. A fix is one selector, with a line in
  `styles.browser.test.ts`.
- **A box below 1 x 1.** `writeGeometry` (`store/board-store.ts`) and `writeGroupResize`
  (`nodes/group-node.tsx`) write the box React Flow's resizer hands them as it is. A resize that
  a script starts before React Flow measured the node gives a negative size. No person is that
  fast.
- **A rejected `ready`** shows nothing in the node (see
  [What is left with the host](#what-is-left-with-the-host)).
- **A model node's header** reads `describe(path)` when the node renders and has no signal that
  makes it follow a host whose answer comes later (`nodes/model-node.tsx`; by reading, not run).
- **In the arming**, pinned by a scenario each: a press held in the armed editor stays held when
  the guards are detached under it; `urlPending` stays true when the watch is undone before the
  URL's arm ran, and `whenRest()` then never resolves (a bench seam: the factory passes
  `arm: null`); a wheel with no vertical part ends a running move.
- **Presence.** `safePresenceLabel` cuts a name at 24 UTF-16 units and can split a surrogate
  pair; the presence layer reads a peer's `canvas` defensively but not its `user`; the Done
  control does not follow a `relocate()` of the armed node until the toolbar renders again (the
  last two by reading, not run).
- **An import and a listener that throws.** If a listener of the store throws inside the
  transaction of an import, `importText` rejects although the document was already written, which
  L7 forbids for a rejection (`collaborative/imports.ts`). Today only the canvas's React
  subscriptions listen there.

## Conventions

- Relative imports end in `.js`. An optional member is `x?: T | undefined`. No `@designiq/*`
  import.
- New code is in the suite's style: plain English, British spelling, no em dash as a connector, a
  comment only for a why. A moved comment stays as it is.
- UI copy is English. Icons are Lucide (`lucide-react`), `aria-hidden` beside a text or under an
  `aria-label`.
- Conventional Commits with the scope `board`.
