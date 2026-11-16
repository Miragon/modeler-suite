# The board's renderer

A part of the board's guide, moved here from [`CLAUDE.md`](../CLAUDE.md) as it was written. That
file keeps what every change needs and names
[every part's document](../CLAUDE.md#the-parts-and-their-documents).
What is found out or changed about the layout of `packages/renderer/src`, about what the renderer
leaves with its host and about its sheets is written here. The rule of the port, the DOM contract
and the renderer's tests stay in `CLAUDE.md`.

## Layout of `packages/renderer/src`

Four layers: the document half, the runtime, the canvas, the contract. A file imports from its own
layer and from the layers before it. `npm run board depcruise` enforces the first step
(`document-half-no-canvas`) and reports any cycle; the other steps are how the code stands today,
and a split must keep them.

| Folder                  | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Layer                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `store/`                | `document.ts` (the board as a live Yjs document, one `Y.Map` per element), `board-store.ts` (what a canvas reads and writes: one gesture is one transaction, an amend one that is never on the history, the undo manager), `actions.ts` (what the board's features write into the document)                                                                                                                                                                                                                                                                                                                                                           | document half          |
| `host/`                 | `types.ts` (the public host and embedded-editor types), `defaults.ts` (how the board reads a host: the answer of a host that offers nothing, and a host's `list()` and `describe()` contained)                                                                                                                                                                                                                                                                                                                                                                                                                                                        | document half          |
| `arming/`               | `arm-rules.ts` and `types.ts` (the arm rules as pure functions: document half), `arming-api.ts` (the records and the two sides of the arming module), `armed-editor.ts`, `board-arming.ts` (the rules at work: its header says what they do, and it composes the six parts), `arming-state.ts` (what the parts share, one object), `arming-motion.ts` (the move: one viewport write per frame), `arming-placement.ts` (where a node is armed), `arming-transitions.ts` (arming and disarming), `zoom-guards.ts` (a zoom the board sees coming: the wheel, press and key listeners), `viewport-watch.ts` (a zoom nobody saw coming, and the URL's arm) | document half, runtime |
| `runtime/`              | `options.ts`, `counters.ts`, `surface.ts` (types), `board-context.tsx` (the runtime made once outside React, the provider, `Slot`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | runtime                |
| `flow/`                 | `flow-types.ts`, `derived-arrows.ts` (pure), `board-flow.tsx` (the document in React Flow's controlled mode, and the arrow-key moves that wait for their rest)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | runtime                |
| `gestures/`             | notices, the groups that would take a dragged node, the edit request, where a new node goes, the board zoom for CSS, the image import                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | runtime                |
| `parts/`, `geometry.ts` | `inline-edit.tsx` (a short text edited where it stands); how the board reads the screen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | runtime                |
| `canvas/`               | `board.tsx` (`<ReactFlow>` and the slots), `click-ownership.ts` and `canvas-keys.ts` (the two hooks cut out of `Canvas`: whose click and whose delete it is beside an armed editor; the board's keys on the pane), the toolbar, the gestures that belong to no node, the presence layer with `presence-format.ts`                                                                                                                                                                                                                                                                                                                                     | canvas                 |
| `nodes/`, `edges/`      | what a node and an arrow draw; `note-markdown.ts` renders a note's Markdown sanitised                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | canvas                 |
| `surface/`              | `overlay-surface.tsx` (a host's editor in a model node, moved into a screen-space layer while the node is armed), `place-host.ts` (where that editor's element stands: `placeHost`, called from the component's effects and from every tick of React Flow's store; `contained` and `callEditor`, the one way the board calls into a host's editor; and the record type `OverlayRuntime`)                                                                                                                                                                                                                                                              | canvas                 |
| `collaborative/`        | `api.ts` (the public types and `NOTATION`), `collaborative.tsx` (the contract factory: the state of one board, the runtime, the change event and the returned modeler), its parts `view.ts` (the view, the fit and `BoardSession`, the state the parts share), `selection.ts`, `imports.ts` (the import queue) and `elements.ts`, `internals.ts` (the runtime behind a board, for this package's tests only)                                                                                                                                                                                                                                          | contract               |
| `assets/`, `theme/`     | `board.css` (the one exported sheet) and `board-base.css` (its base, which it imports into the layer `board-base`); the two vendored token files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |                        |
| `index.ts`, `css.d.ts`  | the entry (it imports the sheet) and the module declaration for `*.css`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |                        |

Four functions were over the suite's 150 lines and were split by extraction. A change in a part
is a change of measured behaviour, and each split has the test that says so:

- `createBoardArming` is six parts that `board-arming.ts` composes. They import each other one
  way only: `arming-state.ts`, then `arming-motion.ts` and `arming-placement.ts`, then
  `arming-transitions.ts`, then `zoom-guards.ts` and `viewport-watch.ts`, then `board-arming.ts`.
  They share one `ArmingState` object, which `viewport-watch.ts` calls `armingState` because
  `state` is React Flow's there. `arming.browser.test.ts` says whether a trace moved.
- `Canvas` (`canvas/board.tsx`) calls `useClickOwnership` and `useCanvasKeys` where their code
  stood, so its 22 hooks register in the measured order. `canvas.browser.test.tsx` notices 24 of
  32 single edits of the three files that a review tried; the test README names the eight it
  cannot see.
- `OverlaySurface` hands its placement to `placeHost`. `surface/place-host.ts` declares
  `OverlayRuntime` and `overlay-surface.tsx` re-exports it: declared in the component's file, the
  two would import each other, and dependency-cruiser counts a type-only import as a cycle.
  `overlay-surface.browser.test.tsx` holds the order of the calls.
- The contract factory's parts take one session object and never import `collaborative.tsx`
  (`BoardSession` is declared in `view.ts` for that). `selection.ts`, `imports.ts` and
  `elements.ts` take only types from the other parts, so they load without React, and a unit
  test imports the parts, never the factory. The conformance kit and
  `collaborative-parts.test.ts` hold the split.

`runtime/options.ts`, `arming/arming-api.ts` and `runtime/counters.ts` import each other in that
one direction only: designIQ had their types in one file, and put together again they are a
cycle. `collaborative/internals.ts` is not exported from the entry: a test reads a mounted
board's runtime with `boardRuntimeOf(modeler)`, and no host can.

## What is left with the host

`options.host` has four parts, each optional and independent (`host/types.ts`; the JSDoc there is
the specification). Without any of them the board is one of notes, groups and arrows.

- **`models`: the editors.** The board has no editor and knows none: no selector or call in this
  package may name diagram-js, dmn-js or any other editor. `models.list()` and `onChange` feed the
  model picker, `describe(path)` gives the title and kind (default: the file name up to its first
  dot, no kind), and `open(context)` returns an `EmbeddedEditor`, a promise of one, or `undefined`
  (at once or as what the promise resolves to) when the host cannot show the file. `open` is
  called for every model node whose path is not empty, whatever kind of file that is. A board in
  a node of a board is not supported: a host answers `undefined` for a board file. That is still
  the board's rule, and the host package no longer answers `undefined`: a file without an editor,
  a board file among them, gets a card ([The host package](host.md#the-host-package-packageshost)).
  The order the surface keeps is what the measurements rest on:
  - Mount: the board creates the element (`.board-engine`), appends it to the node, calls `open`
    synchronously, and once the editor is there places the element, calls `focus()` if the node is
    armed, and takes `editor.ready` as the node's ready. From `open`, `undefined`, a throw and a
    rejection all end in `.board-engine--failed` with the message as its text, and so does a value
    that is no editor (no `ready` promise, no `release` or `destroy` function), with the text
    `<path>: the host returned no editor`; the board calls nothing on such a value. There is no
    loading look and no retry.
  - Armed: the element moves into `.board-overlay-layer`, a child of the board outside its scaled
    viewport, at board zoom exactly 1, and the board sizes it there. The editor must survive that
    re-parenting. Nothing clips the element in the layer: an editor clips itself.
  - Disarmed: `editor.release()` first, while `context.armed()` still answers true and the element
    is still in the layer; then the flag, `data-armed`, the `onArmedChange` listeners; then the
    element goes back into the node.
  - Unmount: `editor.destroy()` once, then the element is removed. A node that goes while it is
    armed (removed by the person, by an import or by a peer, or with the whole board) gets
    `release()` first, still armed and still in the layer, and no `onArmedChange`. The arming
    ends with it: the node component's unmount clears the armed id (`nodes/model-node.tsx`), so
    the Done control is off and an undo brings the node back as a preview. The id is cleared with
    React's commit of the removal, not inside the document's transaction: whoever asks right
    after a write asks `runtime.isModel(armedId)` too.
  - `context.relocate(path)` is nobody's gesture. It writes the node's new path through
    `store.amend`: one change that `onContentChanged` reports and that is on no history, so an
    undo afterwards takes back the gesture before it and leaves the new path. A new path is no
    removal: an armed node stays armed, its old editor gets `destroy()` with no `release()`
    before it, and its new editor gets `focus()` twice (the move into the layer, and a node armed
    from its first moment).
  - An editor is host code. A throw from `release()`, `focus()`, `destroy()` or an
    `onArmedChange` listener is one line in the board's log
    (`<node id>: the editor's release() failed: <message>`) and the surface goes on: the node is
    armed or disarmed all the same, the listeners after a failing one are still told, and the
    element of an editor whose `destroy()` threw is removed. Every call into an editor goes
    through `callEditor` or `contained` of `surface/place-host.ts`; a new call goes through them
    too.
  - Nothing a person sees waits for `ready`. An editor whose `ready` rejects counts as failed
    (`runtime.mounted(id)` is false, the board's log has the message), and the node keeps what
    the editor drew.
- **Layout px, never client rects.** `open()` is always called with the element in the node, in a
  subtree the board scales with a CSS transform: its layout size (`clientWidth`, `offsetWidth`)
  is the node body's at any board zoom, its client rect is not. An editor that fits or places its
  own chrome by `getBoundingClientRect()` comes out wrong on a board that is not at zoom 1 and
  stays wrong once armed, because the node is armed at the same layout size and no resize fires.
  An editor or its adapter reads layout px and lays out again in `focus()`, the one call that
  comes after the move into the layer. `focus` is optional in the type and needed in practice:
  without it the focus is on `<body>` after the arming and neither the editor nor the board gets
  the keys.
- **`focus()` comes before the box.** `placeHost` (`surface/place-host.ts`) appends the element
  to the layer, calls the editor's `focus()` and only then writes the element's left, top, width
  and height. For the length of that call the element is in the layer without a box of its own
  and fills the whole board. An editor that lays out from client rects inside `focus()`
  therefore measures the board, and no resize corrects it afterwards, since the layout size
  before and after is the same. So the sentence above and the JSDoc of `host/types.ts`
  (`EmbeddedEditorContext.element`, `EmbeddedEditor.focus`) are wrong for anything that reads
  the element's box. Measured with C4's breadcrumb bar in a 420 px node that was a preview at
  50 %: laid out inside `focus()` the bar is 396 px wide with no name cut and one name at 0 px;
  laid out a microtask later it is the bar the modeler has alone (395.67 px, names cut to
  26 px). An adapter lays out a microtask after `focus()`, as
  `apps/editors/src/notations/c4.ts` does. Writing the box before the call is a change of the
  renderer's measured order and was not made.
- **The preview chrome rules.** A full editor is mounted from the start and its preview is `inert`
  and scaled with the board. Hiding the editor's own chrome in a preview (a palette, a context pad,
  popups) is the host's: rules of the host's sheet on `.board-engine[data-armed="false"]`.
  `board.css` has none and names no editor, and `styles.scope.test.ts` keeps it so. A host that
  forgets them shows palettes in every preview, and no test of the suite can notice. designIQ's
  sheet (`board.css` of its board folder at `ce12684`, the three rules under "Preview: the full
  modeler is mounted from the start") has two sets of selectors for diagram-js, dmn-js and the
  Wardley editor, which a host takes over as they are. For an editor whose first fit measures its
  own chrome and leaves room for it, as designIQ's own editors do, the chrome gets
  `visibility: hidden !important`, so that the boxes keep their size and arming moves nothing.
  For an editor whose chrome lies over its canvas and takes no part in its fit, the chrome gets
  `display: none !important` (mind the two class names that differ between the sets). Chrome in
  the layout flow (`.view-drd`) is hidden and keeps its room in both. A host with both kinds of
  editor tells them apart by an attribute of its own on the element; designIQ wrote
  `data-mount="product"`. Neither set hides `.bjs-powered-by`: the bpmn.io mark stays in every
  state, it is the licence's condition for bpmn-js and dmn-js. Both assume a `release()` that
  empties the selection: neither hides a selection outline.
- **`references`: the reference parsing.** The board parses no model. The host lists
  `{ from, to, relation }` between files, and `flow/derived-arrows.ts` maps them to the nodes that
  show those files: dashed arrows that are drawn and never stored, never selected and never in
  `elements.list()`. Resting the parsing (designIQ waited 300 ms), caching and filtering it are
  the host's: a reference of a file to itself and one to an image are drawn.
- **`images`.** `read(path)` is synchronous: the bytes or `undefined` (the missing-file figure;
  there is no answer for "still loading"), asked again after `onChange`, and the SAME `Blob` for
  a path until then. Without `store` the board shows no Image button and answers a pasted or
  dropped image with a notice. `store(path, bytes)` may return a promise: the image node is
  written once it returned or resolved, the files of one paste, drop or pick are stored one after
  the other, and a throw or a rejection is a refused notice with the error's message, and no
  node. For a free name (`assets/<name>`, then `-2`, `-3` and so on) the board asks `taken(path)`
  where the host has one and `read(path) !== undefined` where it has not: a host that loads its
  images when a node shows them offers `taken`, or a new image replaces a file it has not loaded.
  A board that is destroyed while a picture's size is still read calls no `store` for it. One
  that is destroyed while a `store` is pending writes no node when it settles: a file the host
  stored is the repository's, and no node shows it. Pasted, dropped and picked alike, since
  `destroy()` says that the board is gone and no part of the canvas does. A paste and a file
  dropped inside the armed editor are the editor's: the board takes neither, and of a dropped
  file it only cancels the browser's default, which would leave the page. In VS Code a dragged
  file reaches the page only with Shift held
  ([The webview half](vscode.md#the-webview-half-srcwebview)).
- **`presence`.** The cursors and selections of the people on this board. All of it is untrusted
  input: `canvas/presence-format.ts` sanitises the name and takes hex colours only, a peer list
  that is no array is nobody, and an entry that is no object or names no `user` is skipped.
- **The page.** The element a board is attached to and its ancestors carry no `transform` and
  nothing else that makes an element the containing block of its fixed descendants (`filter`,
  `perspective`, `contain`, `will-change`), or a `position: fixed` popup of the armed editor is
  placed against that ancestor (measured with `transform: translate(0px, 0px)`: a popup 149 px
  right of and 89 px below the pointer). `.board-root__canvas` has `z-index: 1` and `.board-root`
  forms no stacking context, so that such a popup can lie over what stands beside the board: a
  host's own positioned overlay over the board needs `z-index: 2` or more.

How the board reads a host: through `modelListOf`, `imagesOf`, `referencesOf` and `describeModel`
of `host/defaults.ts`, as external stores (`useSyncExternalStore`). They hand out one wrapper per
part of a host, so a host keeps `host.models`, `host.images` and `host.references` the same
objects for its life. `list()` of the models and of the references runs while React renders and
is contained there: a new array with the same entries is answered with the array handed out
before, so a host that builds its list per call costs a comparison and no render, and a throw or
an answer that is no array is answered with the list that came back last. `describeModel` answers
a throwing `describe()` with the file name and never asks a host for an empty path.

What the interface has no place for, for whoever rewrites designIQ's integration on it: a
synchronous end of the board, a retry after a failed `open`, a loading look for a model, a
loading answer for an image, a refusal to arm one model (read only), and the board's log for an
editor's own errors.

The arm rules decide when a model takes input (`arming/arm-rules.ts`, pure and unit-tested; the
header of `arming/board-arming.ts` says how they run). The factory mounts with the default
`exact1`, `disarm`, `stay`: a model is edited at board zoom exactly 1, the board moves there first
while the node is still a preview, and a zoom of the board disarms the node before its first tick.

### Real editors, as measured

A review mounted two of the suite's modelers from source through `models.open` (Business Model
Canvas and Team Topologies, on diagram-js 15.28.1) and drove them with real input, Playwright's
mouse and keyboard, in scratch files that are not in the tree. Each scenario ran once, the
pointer and pan parts also at a device pixel ratio of 1.25 and 2.

- **What holds.** A preview's net scale equals the board zoom (480 x 304.8 px for an 800 x 508
  element at 0.6), and a real click, a hover and a click on its palette reach nothing in the
  editor. Armed by a real double-click, the element is in the layer at board zoom exactly 1 and
  0 px off the node body, and every number equals the same modeler alone in a box of that size:
  the place of the context pad, a drag read against the SVG's screen matrix (0 diagram units of
  difference), the label editor within 0.4 px, a fixed popup 1 px from the pointer. A pan while
  armed moves the element with its node; a real wheel on the pane disarms before the zoom; the
  editor's own view is the same bytes through preview, armed, pan, disarm and arming again. With
  the focus in the editor, undo, redo and delete are the editor's alone.
- **The first fit is the defect at the seam** (the layout px rule above). Team Topologies fits by
  client rect: its first view had scale 0.681 alone and at board zoom 1, 0.435 at board zoom
  0.5, and it kept that view once armed. Business Model Canvas lays its title button out from
  client rects: laid out in a preview at 0.6 and then armed, the button stood 22.81 px above its
  title. By a grep, not a run, the other five modelers read client rects too.
- **What an adapter needs and `@miragon/modeler-api` 1.7 does not offer.** `release()`: from the
  DOM it works for a diagram-js modeler (an Escape `keyup` on `document`, a click on
  `.djs-container > svg`, a blur); doing nothing leaves the selection with its context pad and
  outline, and `importText(exportText())` empties the editor's history with it. `focus()`:
  `canvas.focus()` or the svg's own. A fit in layout px: `setViewState(getViewState())` inside
  `focus()` made Business Model Canvas lay its title button out again; for Team Topologies' fit
  the contract has nothing, so the modeler itself has to fit on its canvas size. `ready` is the
  promise of `importText`. A modeler's own label editor commits on the blur the re-parenting
  causes.
- **All seven, as a kept battery.** What the review ran in scratch for two modelers is in the
  tree for all seven, on the host package's adapter:
  `apps/editors/test/browser/real-editors.browser.test.ts` mounts the seven modelers through the
  registry in a board on a memory backend and drives them with `commands.realInput`. For each of
  the seven, on a board fitted at about 36 % and on one at 50 %: the editor reaches
  `data-embed-state="ready"`; its view equals the same adapter alone in a box of the node's
  layout size (800 x 508); a preview shows none of its chrome, and a real click on one of its
  shapes selects nothing. From a preview at 50 %: a real double-click arms it (in
  `.board-overlay-layer`, board zoom exactly 1, the focus on the editor's svg, the view
  unchanged); a real click and Delete write its file once and leave the board's text and change
  count alone; Done leaves no selection, no open pad, no further write and no chrome; and a
  real turn of the wheel on the board's pane ends an editing as Done does, with the board
  zoomed after it and nothing written. Once each: three Team Topologies nodes load the module
  once; the second suffixes (`.wmap`, `.ttm.json`, `.cm.json`, `.vc`) open their editors; a real
  drag of one Wardley component changes one line of a file with a comment in it, and a second
  node on that file draws the move and writes nothing; a change from outside while Value Chain
  is armed is drawn with the view state and the arming kept and nothing written back; C4's
  breadcrumb bar in a 420 px node. Every
  test ends on an empty list of window errors, unhandled rejections, `console.error` calls and
  lines of the board's log. The first fit, the defect at the seam above, is the adapter's now
  (see [The host package](host.md#the-host-package-packageshost)), which is why the views are equal.
- **Not run:** designIQ's product editors (bpmn-js and dmn-js are not in this repository), touch
  and pen, Firefox and WebKit, a device pixel ratio other than 1 for the seven as a kept test (a
  review ran their previews and their arming at 1.25 and 2 once), more than seven model nodes on
  one board. Only designIQ's product editors and its 1375 rows need designIQ.

## Stylesheet and theme files

- **Two theme files, not three.** `src/theme/` vendors `cd-tokens.generated.css` and
  `cd-tokens.generated.json`, unchanged, with their entries in `.miragon/brand-assets.yaml` and
  `.miragon/brand-assets.sha256`. Never edit or reformat them: re-copy them with the
  `miragon-brand` plugin's `scripts/brand-assets.mjs`. The board's entries in the two `.miragon`
  files were written by hand, since the plugin was not on the machine (the files are byte for
  byte Business Model Canvas's and the checksums verify): whoever has the plugin should run the
  script once and see that it writes the same lines.
- **`cd-canvas.css` is absent on purpose.** The suite's rule says every renderer vendors three
  files; the board deviates, and no check asks for the third. That file holds the role classes of
  the SVG renderers and maps the variables of diagram-js and bpmn-js to the roles. A React Flow
  canvas has none of them, and imported into a board's page the file would restyle the diagram-js
  editors a host mounts in the board's nodes. Whether to vendor it unread for uniformity is an
  open question to the suite's owner; until it is answered, do not add it (`theme.sync.test.ts`
  fails on a third file in `theme/`).
- **`assets/board.css`** is the one exported sheet. It starts with three imports, in this order:
  the tokens into the layer `board-tokens`, React Flow's sheet unlayered, and
  `assets/board-base.css` into the layer `board-base`. One alias block on `.board-root` then
  declares 23 colour names and 2 font names as `--board-*`: the 22 colour names the sheet read on
  designIQ's page and one of the board's own, `--board-primary-fill`. Every rule reads those,
  `--cd-ui-*` roles and the mode-independent tokens (`--cd-radius-*`, `--cd-shadow-*`,
  `--cd-motion-*`, `--cd-ease`), and no colour literal. Each alias reads the role whose light
  value is the one the name had on designIQ's page (`theme.sync.test.ts` holds the whole table),
  so the light picture is the measured one. Three aliases are the same in both modes, as guide §8
  has it for a primary button: `--board-primary-fill` (`--cd-blau`), `--board-primary-hover`
  (`--cd-blau-link`) and `--board-primary-foreground` (`--cd-weiss`). The fill is read by the two
  Done buttons and by nothing else: the toolbar's (`.board-toolbar__done`) and the armed node's
  (`.board-node__arm`). `--board-primary` stays the role `--cd-ui-interaktion` for rings, marks,
  lines and tints. On designIQ's page one name did both jobs; the role turns to #6B8AFF on a dark
  page, where white on it is 3.13:1. Nothing is declared on `:root`, `html` or `body`.
  `--board-zoom` is no alias: the canvas sets it on the two edge layers.
- **What the sheet does to the page it is loaded in.** It brings React Flow's sheet unlayered and
  page-wide: on a host that layers its CSS, that import overrides the host's layered look of a
  React Flow of its own (none of it on a host with unlayered CSS). The tokens come in a layer, so
  a host's own tokens win only when they are unlayered. Load the sheet unlayered, as the entry
  does, or in a layer that comes after every reset of the host: in a layer before a reset layer,
  or beside an unlayered `* { margin: 0; padding: 0 }`, the board loses its paddings, borders and
  grounds.
- **`assets/board-base.css`** is the base the sheet was measured on, for the board's own elements
  only: Tailwind 4.3.5's preflight (MIT; its notice is the file's first comment) without its
  `html` rule, and the two declarations designIQ's ui-kit put on every element (`border-color`,
  `outline-color`). Every selector is `.board-root :where(SELECTOR):not(:where(.board-engine *))`:
  the `.board-engine` the board hands a host is reset, what the host puts below it is not. A
  pseudo-element stands behind the `:not()`, never inside `:where()`, where it matches nothing.
  `:where()` leaves every rule at the weight of one class, so the order of the rules is part of
  the file. On `.board-root` it sets what designIQ's page gave by inheritance (a font size of
  16 px, a line height of 1.5, `tab-size: 4`, `-webkit-font-smoothing: antialiased`). As a layer
  it loses to every unlayered rule: to React Flow's, to the board's own and to a host's.
- **Inheritance goes both ways.** `.board-root` pins the font family, size, line height, tab size,
  colour, ground and smoothing, and nothing else: a host body with a font weight, a letter
  spacing, `text-align` or `text-transform` of its own reaches the node titles, the toolbar, the
  notes and the labels. A host page that styles bare elements outside a layer (`button`, `h1`,
  `header`, `code`, `*`) reaches the board's elements: `header { color: #fff }` gives a node title
  white on its light ground. The other way, what a host's editor puts below `.board-engine`
  inherits the board's type (its font stack, 16 px, line height 1.5, colour, `tab-size: 4`), not
  its page's, and in a preview `cursor: grab` and `user-select: none`.
- **Reduced motion.** The last rule of `board.css` stills the board's own elements under
  `prefers-reduced-motion: reduce`, scoped as the base is. On designIQ's page that rule stood on
  `*` and reached the hosted editors too; stilling an editor is the host's now.
- **What the sheets do not set.** `color-scheme` (designIQ's page set `light`; here the page's
  value applies, and under `data-cd-theme` the tokens set one), the two touch declarations of
  preflight's `html` rule (`-webkit-text-size-adjust`, `-webkit-tap-highlight-color`), and
  `-moz-osx-font-smoothing`, which designIQ's page had (by reading). Whether `.board-root` gets
  them is an open decision. `.board-root` itself is not reset: the base starts below it.
- **The breakpoint reads the window, not the board.** Up to a window of 760 px the Done control
  is 130 px wide, above it 200 px, and a notice is at most `min(560px, 60vw)`. The browser
  project runs in a window of 1280 x 800 (`browser.viewport` in both Vitest configs; Vitest's own
  default is 414 x 896, where only the narrow branch is laid out), and `styles.browser.test.ts`
  narrows the frame for the narrow branch.
- **Dark is not designed**, with one exception that a test holds. Under `data-cd-theme="dark"`,
  on `<html>` or on the element the board is attached to, the two Done buttons keep the fixed
  blue under white text (5.47:1). Everything else follows the page's roles, unreviewed, until an
  appearance surface exists. That includes the ground under a host's editor: `.board-node__body`
  and `.board-engine` read `--cd-ui-plot`, #1D1D1D in dark. A host on a dark page that mounts
  editors that draw light writes `data-cd-theme="light"` on the element it attaches the board to;
  the board is then the light picture (`styles.browser.test.ts` holds it).
- **How the unchanged picture was checked.** By the alias table, and once, not as a kept test,
  by comparing every computed value of a static board under designIQ's page sheet and under this
  one in Chromium: no box differed, and no property of the board's elements but those named
  above. The review's two changes to the sheet were compared the same way against the sheet
  before them: no difference in light. Not against designIQ's live page.
- An app that bundles the package is to import the sheet by name as well
  (`@miragon/board-renderer/assets/board.css`), as the Business Model Canvas web app does with its
  renderer's: the package marks only its CSS as having side effects, and Rollup then leaves out
  the import inside a barrel. Its third-party notices then need Tailwind's (MIT), for the base.
  The web app's built sheet does not keep that notice (`grep -c tailwindcss dist/assets/index-*.css`
  prints 0: Vite's CSS minifier drops the comment), so the build's notices file carries it: the
  generator finds the base by its first comment in the bundled source and quotes Tailwind's
  licence (`COPIED_WORKS`, [The suite's editors](editors.md#the-suites-editors-appseditors)).
- **A `*.css` declaration per workspace.** The renderer's entry imports its sheet, so every
  workspace whose type check reaches `@miragon/board-renderer` declares `*.css` among its own
  modules (a `css.d.ts`), and `*.css?base` as well where it imports `board-suite-editors/base`,
  which is read as source. TypeScript 6 fails the program otherwise (TS2882).
- **Several renderer sheets on one page.** Every renderer sheet of the suite imports diagram-js's
  sheet and the vendored `cd-canvas.css` after its tokens. With several renderers on a page, each
  later copy of that base comes after an earlier renderer's own rules and overrides them at
  equal weight: Context Maps' open context pad computed `block` in place of `flex` once another
  sheet followed its own (a build without the cure has eight copies of the base).
  `apps/editors/build/css-base.mjs` empties the two imports wherever they are written
  (`cssBaseAliases` for Vite and Vitest, an alias because a plugin's `resolveId` does not reach
  a sheet's `@import`; `cssBaseOnce` for esbuild), and a page loads the base once, before any
  renderer sheet, through `board-suite-editors/base`: `diagram-js/assets/diagram-js.css?base`
  and the copy of `cd-canvas.css` in Business Model Canvas's renderer, two specifiers the helper
  does not catch, then the host package's `embed.css`. The seven copies of `cd-canvas.css` are
  the same bytes (`base.sync.test.ts`). `build-helpers.test.ts` holds the cure and, as a
  control, the eight copies; `sheets.browser.test.ts` and
  `sheets.context-maps-last.browser.test.ts` hold the computed `flex` with Context Maps loaded
  first and last, a page each. The board itself still vendors no `cd-canvas.css`.
