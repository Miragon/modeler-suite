# CLAUDE.md

TypeScript modeler for the board: a canvas of a repository's own files. Models are shown and edited
in place, each by an editor the host hands in and each saved in its own file, next to notes,
images, groups and arrows. The board stores where a file sits, never what is in it. The file is a
`.board` text, one JSON line per element. Unlike every other modeler of the suite its canvas is
[React Flow](https://github.com/xyflow/xyflow) (`@xyflow/react`, MIT) on React, not diagram-js: it
lays out HTML nodes that hold whole editors.

**Work in progress.** The board was built and measured in designIQ
(`apps/web/src/notations/board` there, at commit `ce12684`), and its canvas was moved here as it
was measured. The move is done and was reviewed; the apps around the board are not built.
[State of the port](#state-of-the-port) says what is in the tree, what was run on it and what is
still to come.

This modeler is `modelers/board` in the Miragon modeler suite. The suite's
[`CLAUDE.md`](../../CLAUDE.md) holds the rules for every modeler (setup, commands, commits and
signing, exact pins, releases, the design system, the contract and shell boundaries); this file
adds what is special to the board and names where the board deviates from them. Run its scripts
from the repository root as `npm run board <script>`, or as `npm run <script>` inside
`modelers/board`, after `npm run build:shared`: the board reads the contract's `dist`.

## State of the port

In the tree: `schema-model`; the renderer with its document half (`store/`, `host/`,
`arming/arm-rules.ts`, `arming/types.ts`), the canvas, moved from designIQ and cut over to the
host interface (every other folder of `packages/renderer/src`), the contract factory with the
options `host` and `liveDocument`, and the stylesheet on the design system's roles;
`CONTRIBUTING.md` and `.claude/rules/package-json-fixed-versions.md`; 16 unit files with 289
tests and 15 browser files with 660 tests.

Read the browser count by what it stands on: 297 tests run the arm rules on a bench of fakes (73
scripts, each run once and read by four tests, plus five), 82 hold static markup under the sheet,
7 a bare React Flow, 73 are the contract's kit, and 201 are in the eleven files that mount a
board. Every editor in them is the recording stand-in of `createTestHost`. No test mounts an
editor that draws, and a synthetic event ignores `inert`: no test can fail when a preview takes
real input or when the pointer math of an armed editor is off.

**After the move, a review.** Seven reviewers looked for what is wrong with the moved board. What
they found is fixed and under a test, or stands under [Deferred](#deferred) as it was measured.
The fixes changed seams the move had kept still; a further change to one of them is recorded
here. The public API: `BoardImages.taken`, a `BoardImages.store` that may return a promise, a
`BoardModels.open` that may resolve to `undefined`, `BoardStore.amend` with the origin
`BOARD_AMEND`, and the exports `takenIn` and `ImageNames`. Inside: `runtime/board-context.tsx`
has the type `HeldMoves` and two optional callbacks in the pattern of `onFlow`, `onArming` and
`onHeldMoves`, through which the factory asks whether the board moves to arm a node and ends an
arrow-key move that still rests (`useBoard` reads `onHeldMoves` from the board context, so it
runs only under `BoardProvider`); `placeHost` takes the board's log and `createImportQueue` an
`ImportCanvas` as a fifth parameter; `surface/place-host.ts` exports `contained` and
`callEditor`, and `gestures/images.ts` exports `setBoardEnded`, which the factory's `destroy()`
calls.

**What was run, and what was not.** On the machine the review's fixes were integrated on, with
the tree as it stands: `npm run board lint`, `test`, `depcruise` and `format:check` pass, the
checksums of the theme files verify, and the browser project passes five runs in a row and one
shuffled run through the local sandbox config (see [Commands](#commands)). Not run:
`npm run board test:browser` with the committed config (that machine must not start Chromium
without its sandbox), CI, brand-lint (the `miragon-brand` plugin was not on that machine) and
designIQ's batteries.

**CI and the root scripts with this branch.** The suite has no state for a modeler without apps:
a pull request with this branch cannot pass `ci-ok`, and on `main` the branch would fail every
later pull request. By a reading of the workflows and a run of `ci-paths.sh`, not by a CI run:

- `shared-test` fails in `npm run test:plugin`: `test/modeler-collection.test.ts` reads
  `modelers/board/apps/vscode/package.json` and fails while it is collected, so none of its tests
  runs and its guard for the seven published extensions is off. Nothing else fails in that script
  (13 files and 286 tests pass here). The job runs for every pull request, a docs-only one too.
- `modeler-check (board)` fails at `build:webapp` (no such script), `modeler-e2e (board)` at
  `test:e2e`, `vscode-smoke (board)` at `test:vscode` and in the action that reads
  `apps/vscode/package.json`. `modeler-test-browser (board)` runs the committed browser config,
  which nobody has run.
- After a merge a change of the lockfile reaches every modeler, so every Dependabot pull request
  runs the board's failing jobs, and the weekly smoke fails every Monday and opens its issue.
- The board is in the root `modelers` alias: `npm test` stops in `test:shared` before any
  modeler's unit tests run, `npm run build` fails in `build:apps`, and `npm run test:e2e`,
  `npm run package:vscode` and `npm run modelers <an app's script>` exit 1.

Business Model Canvas and C4 each arrived complete in one pull request. Either this branch stays
off `main` until the apps exist, or the suite gets one in-progress marker that `ci-paths.sh`, the
root `modelers` alias and `test/modeler-collection.test.ts` all read: the owner's to settle.

**Still to come:** `apps/webapp`, `apps/vscode`, the Orca plugin, `e2e/`, `example/`, `docs/`, a
README per package, and the root files a modeler arrives with: the board's rows in the suite's
`CLAUDE.md` (paths, aliases, the DOM-free table, the commit scopes) and its sentences that are
untrue with the board in the tree ("all seven", "one notation on diagram-js", "a skipped case or
an advisory fails the run"), the root `CONTRIBUTING.md` and `README.md`, the issue templates, the
release-please components and manifest, `.miragon/product-shots.yaml`, the docs site,
`netlify.toml` and the entry in the modeler collection.

**Without a test**: the gestures and behaviours the test README lists under "Without a test",
among them the group that takes a dragged node, the resize of a model and of an image node, and
the toolbar's buttons for the zoom, the fit and a group.

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
  `canvas/`, `nodes/`, `edges/`, `surface/` and `collaborative/`, nor any other file of
  `arming/`, nor `geometry.ts`). That rule names paths: a new folder or top-level file of `src`
  that is not of the document half is added to its `to`, and `test/layers.test.ts` fails until it
  is. `eslint.config.js` adds `eslint-plugin-react-hooks` for the renderer (`rules-of-hooks` an
  error, `exhaustive-deps` a warning).
- **Dependencies.** Exact pins and no ranged peers while nothing is published (the Business Model
  Canvas rule; see `.claude/rules/package-json-fixed-versions.md`). The renderer depends on
  `@xyflow/react`, `react`, `react-dom`, `yjs`, `lucide-react`, `markdown-it`, `dompurify` and
  `@miragon/modeler-api`; the pin on the contract has its two `extra-files` entries in
  `release-please-config.json`. There must be one copy each of `yjs`, `react`, `react-dom` and
  `@xyflow/react` under this modeler: the store tells its elements by `instanceof Y.Map`, and a
  second React breaks every hook. `test/single-copy.test.ts` reads the lockfile for it, the job
  ranged peers do in the published modelers.
- **A bump is a change of what was measured.** A new version of `@xyflow/react`, `react`,
  `react-dom`, `yjs`, `markdown-it` or `dompurify` falls under
  [the rule of this port](#the-rule-of-this-port-moved-as-measured). The suite's Dependabot
  groups every production minor and patch update and labels the pull request for auto-merge (by
  reading `.github/dependabot.yml` and `dependabot-automerge-eligibility.yml`), so once CI is
  green on `main` only the tests here stand between such a bump and its merge. An ignore entry,
  or a group that is never auto-merged, is a root change and the owner's to make.
- **React Flow internals.** The arming, the gestures, the placement, the overlay surface, the
  canvas's keys and the toolbar read React Flow's internal store (`useStoreApi`): `transform`,
  `panZoom`, `nodeLookup` with `internals.positionAbsolute` and `measured`, `nodes`, `edges`,
  `domNode`, `width`, `height`, `minZoom`, `maxZoom`, `fitViewQueued`, `connection`,
  `nodesSelectionActive`, `multiSelectionActive` and `addSelectedNodes`. The board was measured on
  12.12.1, the version pinned. `test/browser/react-flow-internals.browser.test.tsx` names these
  fifteen fields and holds what the board reads of a connection in progress (`pointer` in px of
  the board's element, `fromHandle.id`, `fromNode.id`, `toHandle`, and `previous.connection` in
  the store update that ends it), so a bump that renames or reshapes one fails there first.
  Whoever reads a new field adds it there.

## The `.board` format (`packages/schema-model`)

One JSON header line (`format`, `version`, `meta`), then one JSON line per element sorted by id,
keys sorted at every depth, a trailing newline: the same board gives the same bytes, and a change
of one element changes one line. It is designIQ's house format for element-wise documents, and the
two implementations write the same bytes for the same board, so `BOARD_FORMAT` is never renamed.

- `parseBoardText` is strict: it answers `{ ok: false, reason }` for a text that holds anything
  `encodeBoard` would not write back (a line that is no JSON, a second header, a repeated id, a
  header of another version, a key named `__proto__` at any depth of a line), and keeps
  attributes and element kinds it does not know. An empty text is a new board. `encodeBoard` is
  canonical.
- The reader tests the keys of the parsed line, not the line's text. A value that is exactly
  `__proto__` (a note's text, an arrow's label, a group's name, a file, the title, an arrow's
  end) is content like any other and is written back. A key of that name is refused however the
  line spells it, a JSON escape included, because `encodeBoard` would assign it as a prototype
  and drop it. An element whose id is `__proto__` is refused as well: an id is the key of its
  element in every map a board keeps. designIQ's reader (`packages/notations/board.ts` there)
  does the same, and a change to one is a change to both. `decodeBoard`, the total reader,
  refuses nothing: such a key in a line it reads is dropped by the next `encodeBoard`.
- A live document has no reader, so a peer can still hand in an element under that id. The
  document half keeps its elements on objects without a prototype, and so do the arrow-key moves
  that wait (`noMoves()` in `flow/board-flow.tsx`, under a test). The board itself makes no such
  id.
- An element is drawn only when it has the shape of a node or an arrow (`isNodeAttrs`,
  `isEdgeAttrs` in `view.ts`: `"kind": "node"` or `"edge"` and the fields that go with it).
  Anything else stays in the document untouched and off the canvas.
- A node of type `model` or `image` holds the repository-relative path of its file (`file`) and
  nothing of the file's content. Positions are integers; a member of a group is positioned
  relative to the group; `z` is a fractional index, ties broken by element id.

## The public API

One factory, `createCollaborativeModeler(options)`, with two options of the board's own, `host`
and `liveDocument`, plus the document half's exports (the store, the actions, the arm rules). No
React component, no React Flow type and no designIQ type crosses the boundary, so a host need not
share a copy of React or React Flow with the board. Whoever hands the package a `Y.Doc` must load
the same copy of `yjs` as the package: through `liveDocument`, and through every exported
function of the store and the document (`createBoardStore`, `boardText`, `readSnapshot`,
`reconcileSnapshot`). A document made with another copy is read as elements without attributes,
with no error.

```ts
import { createCollaborativeModeler } from "@miragon/board-renderer";
import "@miragon/board-renderer/assets/board.css";

const modeler = createCollaborativeModeler({ host }); // every part of `host` is optional
modeler.attachTo(element); // in the document, with a size
await modeler.importText(text); // an empty text is a new board
const stop = modeler.onContentChanged(() => save(modeler.exportText()));
// when the board goes: stop(); modeler.destroy();
```

- **The change event.** `onContentChanged` reports the board's gestures, its undo and redo, and
  its amends (origins `BOARD_LOCAL`, the undo manager, `BOARD_AMEND`), and nothing else. An amend
  (`store.amend`) is a change of the board that is nobody's gesture: reported, and never on the
  history. A transaction of any other origin (a peer's update, an import, a host's write) calls
  no listener and refreshes the text the next gesture is compared with. That holds without
  `liveDocument` too, and it changes an outcome there: after a host wrote into `board.store.doc`
  under another origin, a gesture that writes what that write left is no change
  (`contract-edges.browser.test.ts` pins it without the option, `live-document.browser.test.ts`
  with it). A listener that an earlier listener of the same delivery unsubscribed is not called,
  for the change event and for `elements.onSelection`.
- **`liveDocument`.** The board works on the host's `Y.Doc` in place of one of its own and never
  destroys it; `destroy()` still takes the board's observers and its undo manager off it.
  `importText` reconciles into the shared document under an origin of its own, so a sync provider
  sends it on as this client's change, and it empties only this board's history. The view is
  fitted once, unless `fitOnImport` is false: in `attachTo` when the document has a node by then,
  otherwise when a change that is not this board's own gives it its first node (a sync provider
  hands its document out before its first sync). A view the host set or an import before that
  takes the place of this fit. A first node of this board's own gesture is left where the person
  put it, and nothing is fitted after it: the fit is not capped at 100 %, and one new note would
  fill the box at about 300 %. One document takes one board per page: the origins are one value
  for every board store, so a write through another store on the same document under them counts
  as this board's. Attribute values are plain JSON; a nested Yjs type as a value is not
  supported.
- **Imports and what the canvas holds back.** An accepted `importText` gives up an arrow-key move
  that still waits for its 400 ms rest: nothing of it is written, reported or put on the history,
  and the moved nodes stand where the document has them again. A refused import leaves the move
  waiting. An accepted import does not fit while a model is armed or the board moves to arm one,
  as long as that model is still in the document: the view stays and the editor hears nothing,
  so a host needs no `fitOnImport: false` to keep an editor armed across its own re-imports. An
  import that takes the armed model away fits as usual.
- **`destroy()`** stops every delivery at once, gives up an image that is still read or stored
  (no node is written for it), writes a resting arrow-key move into the document before it
  returns (no listener hears of it), and unmounts the canvas a microtask later, so that a host
  may call it from a listener a React event handler is still running. So it returns before the
  editors are destroyed, and nothing tells the host when they are: a host that writes
  `modeler.destroy(); hub.destroy();` ends every session under an editor that is still bound. An
  import that waits for a canvas that has not mounted is rejected one macrotask after a
  `destroy()`.
- **Host code never takes the board down** where the board calls it while it renders or writes:
  `options.freeArea.insets()`, a host's `list()` and `describe()`. A call that throws is reported
  once through `console.error` with the prefix `[board]` and answered with what the board had
  (the insets it gave last or none, the last list or the empty one, the file name). An editor's
  calls go to the board's log (see [What is left with the host](#what-is-left-with-the-host));
  [Deferred](#deferred) names what is not contained.

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

## The rule of this port: moved as measured

The canvas was measured in designIQ with the product's editors: 1375 rows of the editor batteries,
193 of the arm rules, 145 of the board features. Those rows need designIQ's product editors and
run again only when designIQ consumes this package. Until then a change of behaviour here is a
change nobody measures, so the canvas is a **move**, not a rewrite, and the rule holds for every
change until the batteries have run against this package.

A line of a moved file may change only for one of five reasons:

1. An import that cannot exist in the suite (designIQ's packages, the new layout, the `.js`
   specifier).
2. A TypeScript flag of the suite (`exactOptionalPropertyTypes`: an optional member is
   `x?: T | undefined`; `verbatimModuleSyntax`; `noImplicitOverride`).
3. The 150 lines per function. A split is an extraction: whole statements move, closure variables
   become fields of one state object, hooks are called where the code stood. No early return is
   added, no condition reordered, no comment dropped. Never mark a long function with an ESLint
   directive: the one directive in the packages is the original `no-control-regex` in
   `canvas/presence-format.ts`.
4. The host interface: what designIQ's hub gave, the board now asks of `host`.
5. A fix the owner decided on, with a test that fails without it. The fixes of the review are
   these.

What may not change in passing: the logic, the order of statements, of hooks and of effects, the
timing (`flushSync`, the microtask in `destroy()`, the import queue), the DOM (class names, data
attributes, nesting), the selectors the code reads, the props `<ReactFlow>` gets, and the
comments. A moved file is copied and edited in place, never retyped.

The comments stay too, also where they cite what did not move: designIQ's notes `react-flow.md`
and `sync.md` (in neither repository), its bench and its README, `module/kit-main.ts` (here
`test/browser/conformance.browser.test.ts`), `board-doc.ts` (here `store/board-store.ts`), the
hub, the product's editors, the strategies `counter`, `iframe` and `shim`, a sheet that hides an
editor's chrome (the host's now) and the selector `.board-popup-host`, which nothing here writes.
The splits moved every comment with its statements, so some point at a neighbour ("this module",
"above", `board.tsx` for what stands in `click-ownership.ts` and `canvas-keys.ts`). The one
moved file whose comments were changed for the language is `canvas/presence-format.ts`, which
came from `apps/web/src/lib/presence-format.ts` of designIQ, outside its board folder. A review
of the comments is deferred, not forgotten.

## What is left with the host

`options.host` has four parts, each optional and independent (`host/types.ts`; the JSDoc there is
the specification). Without any of them the board is one of notes, groups and arrows.

- **`models`: the editors.** The board has no editor and knows none: no selector or call in this
  package may name diagram-js, dmn-js or any other editor. `models.list()` and `onChange` feed the
  model picker, `describe(path)` gives the title and kind (default: the file name up to its first
  dot, no kind), and `open(context)` returns an `EmbeddedEditor`, a promise of one, or `undefined`
  (at once or as what the promise resolves to) when the host cannot show the file. `open` is
  called for every model node whose path is not empty, whatever kind of file that is. A board in
  a node of a board is not supported: a host answers `undefined` for a board file. The order the
  surface keeps is what the measurements rest on:
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
  file it only cancels the browser's default, which would leave the page.
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
- **Not run:** designIQ's product editors (bpmn-js and dmn-js are not in this repository), the
  other five modelers, touch and pen, Firefox and WebKit, many model nodes at once. Such a
  battery can run in the board's own browser project with config changes only: only designIQ's
  product editors and its 1375 rows need designIQ.

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
- Removed after the review, because nothing writes what they select, and kept out by
  `styles.scope.test.ts`: `.board-toolbar label` (a bench that mounts `ToolbarLead` brings that
  rule in its own sheet), `.react-flow__edge.updating .react-flow__edge-path` (it needs the
  `onReconnect` prop the board does not pass) and `.react-flow__edge-text` (the label of React
  Flow's `BaseEdge`; the board draws its labels in `EdgeLabelRenderer`). Whoever passes
  `onReconnect` or draws a label through `BaseEdge` writes the rule again.

A host may add classes and data attributes of its own to the `.board-engine` it was given, never a
position or a size.

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

## Tests

[`packages/renderer/test/README.md`](packages/renderer/test/README.md) says what each test file
holds, how the arming traces are recorded anew, how the conformance harness is built, and what a
browser test of the board has to know (synthetic input, the lazy parts, the module-level state,
the window). Read it before you write a test. Here are the two projects and the rules.

- `npm run board test` (project `unit`, Node): the format, the order keys and the view
  (`packages/schema-model/test/`); the store, the actions, the arm rules, the board file at rest,
  under a Git merge and under two peers on one live document; and of the canvas side what needs
  no browser: how the board reads a host (`host-defaults`), the parts of the contract factory
  (`collaborative-parts`), the two sheets (`theme.sync`, `styles.scope`), the reach of the
  dependency rule (`layers`), the one copy of each shared library (`single-copy`), the arming
  fixture as a file (`arming-fixture`).
- `npm run board test:browser` (project `browser`, Chromium, a window of 1280 x 800) runs
  `packages/renderer/test/browser/**/*.test.{ts,tsx}`: React Flow measures its nodes, so nothing
  of the canvas runs in jsdom or Node. Fifteen files: the arm rules on a bench of fakes
  (`arming`), the sheet on static markup (`styles`), React Flow's store (`react-flow-internals`),
  the contract's kit (`conformance`), and boards mounted through the entry (`toolchain`,
  `canvas`, `canvas-behaviour`, `chrome`, `nodes`, `images`, `overlay-surface`, `hostile-host`,
  `contract-edges`, `embedded-model`, `live-document`).

**The arming traces.** `test/browser/fixtures/arming-traces.json` was recorded from
`createBoardArming` while it was still one function, and the split was accepted because the six
parts give the same bytes. `arming.browser.test.ts` imports the file and compares it itself: no
run writes it, not with `-u` either, and without the file the test fails, in the unit project
too (`arming-fixture.test.ts`). A wanted change of the rules is recorded anew on purpose (the
README says how), and the pull request says which traces moved and why. Three traces were
recorded anew after the move, because their scripts passed with what their names claim removed;
the other 70 are the bytes of the move. The traces do not hold everything a caller can see: of
139 single edits of the parts that a review made, 37 pass, and the README names them.

**The conformance kit and its pinned skips** (`test/browser/conformance.browser.test.ts`). The
suite's rule is zero: a skipped case or an advisory fails a renderer's run, because its test
passes an `onSkip` that throws. The board binds the kit with seven skips pinned instead, and that
is a deviation with an end, not a new rule. The kit is bound twice, on a board with a document of
its own and on a board on a live document of the host; each block has 36 cases and its own pinned
skips, today the same seven:

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
unfinished: see [Deferred](#deferred). Two of the seven are met in part elsewhere: the file's
third block runs the drop case alone, with a drag that is held and dropped (it stays on the list
because the kit has one `startGesture` for three cases), and one leg of
`destroy from a listener`, a listener unsubscribed during a delivery, is checked in
`contract-edges.browser.test.ts`.

A skip is pinned with the reason the kit gives, word for word. The list is checked in both
directions (a skip that is not on it throws, and a listed case that stops skipping fails until
its name is removed), an advisory throws, and the list may only shrink: never add a name to make
a run pass. No root test asks a renderer for a throwing `onSkip`, so the pin is the board's own
to keep. A skip is the kit's word for a case it could not verify, or not all of: Vitest counts
all 36 cases of a block as passed. Of them 28 verify something, seven report through `onSkip`,
and one has nothing to verify (the board has no setting outside its elements, so the kit's case
for a change of the configuration loops over nothing). The harness changes the board through
calls on the store, so the kit proves the document and the change event, not that the toolbar or
a drag reaches the store. The merge kit is not registered: the board has no text merge.

Chromium may log "ResizeObserver loop completed with undelivered notifications" while the kit
runs. It failed no test; if a kit case ever reports it as an advisory, that is a flicker with
this cause (the README has what was measured), never to be answered with a longer skip list.

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
never committed: add `modelers/*/vitest.sandbox.config.ts` to your own `.git/info/exclude`, which
no clone brings along. The file is the browser project of `vitest.config.ts` as a config of its
own: the same `optimizeDeps.include`, the same `test` block (`name`, `include`, `browser` with its
`viewport`), and two differences, a cache folder from the environment and the sandbox:

```ts
const cacheDir = process.env.BOARD_VITE_CACHE;

export default defineConfig({
  ...(cacheDir ? { cacheDir } : {}),
  // optimizeDeps and test as in vitest.config.ts, with this provider in test.browser:
  // provider: playwright({ launchOptions: { chromiumSandbox: true } }),
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
nothing.

## Deferred

Known, decided against for now, and not bugs. One that changes measured behaviour or adds
behaviour comes with a browser test of its own.

**Kept as measured, against a habit of the suite.** Each looks like a slip and is as measured;
changing one in passing is a regression nobody would see.

- **Module-level state, one per page.** The notices (`gestures/notices.ts`), the groups that would
  take a dragged node (`receiving.ts`), the note that opens its editor when it mounts
  (`edit-request.ts`) and the last place a node was added (`placement.ts`). Two boards on one page
  share them: the Text button of one opened the note's editor in the other. (`nodeTypes` and
  `edgeTypes` in `canvas/board.tsx` are module-level for another reason: a new object per render
  would remount every node. The boards that were destroyed, in `gestures/images.ts`, are kept
  per board.)
- **Lazy parts.** Every node type, both edge types, the toolbar, the board gestures and the
  presence layer load through `React.lazy` behind `Slot` (an error boundary and a `Suspense`): a
  part that fails shows its error where it would be and nothing else stops. `markdown-it` and
  `dompurify` load by `import()` with the first note. So neither `board.mounted` nor a resolved
  `importText` means that the parts are drawn.
- **Page-level listeners and reads.** `document` paste and `window` dragover and drop
  (`canvas/board-gestures.tsx`); `window` pointerdown, pointerup, pointercancel, blur and a capture
  keydown that stops keys aimed at a board that moves (`arming/zoom-guards.ts`); the motion tokens
  read off `document.documentElement` and `prefers-reduced-motion` (`arming/arming-motion.ts`);
  a page-wide query for a node that is still armed (`arming/arming-transitions.ts`). The window
  drop listener will collide with a web app's drop zone, and the capture keydown is against the
  contract's "never stops a key it does not act on".
- **The board's own toolbar**, inside React Flow's panel: the Done control, the zoom buttons, the
  add actions, delete and the notices. The shell's chrome does not apply to the board as it is;
  a view and command surface for a host's chrome, and a way to switch the toolbar off, are not
  built. **`lucide-react`** for the icons, where the suite's renderers copy icon geometry.
- **The fit.** Not capped at 100 %, `FIT_PADDING` applied inside the host's insets,
  `freeArea.center` accepted and not read: a new node lands in the middle of what the board
  shows. The padding's 88 px at the top are clear of a one-row toolbar only: on a board under
  about 720 px the toolbar wraps and the fitted content starts 7 px under it, under three rows
  47 px (the arming follows the real band, the fit does not). React Flow centres the content in
  the whole box and moves it only as far as a side's padding asks, so a wide board stands in the
  middle of the full height and a high one starts right under the band;
  `collaborative-parts.test.ts` pins both.
- **The bench seams**, unexported. Dead when the factory mounts the board (it passes no bench and
  `arm: null`): `BoardBench`, `inputScope: "page"`, `setScreenGeometry`, the URL arm in
  `BoardArming.watch()` and, in effect, `onBeforeDelete` (`canvas/click-ownership.ts`): it
  refuses a delete only when a key reaches the board while the focus is on `<body>` after a press
  inside the armed editor, which no real key does with `inputScope: "board"`. Kept up by the
  canvas and read by no host: the counters, the log and the registry of the surfaces. designIQ's
  batteries need exactly these hooks; whether the package gets a second entry for them, or they
  go, is undecided. A test of this package reaches them with `boardRuntimeOf`.

**Not built.**

- A viewer mount, the `appearance` surface and themes, an image export, a three-way text merge.
- Gestures under the contract: a gesture tracker, a selection of the board's own that empties at a
  drag's start, a cancel that makes a drop write nothing, an armed tool, a create by a held
  gesture. The board adds by click; the one drag that creates is an arrow drawn from a handle.
- An adapter that mounts a modeler of the suite as an embedded editor (what it needs is under
  [Real editors, as measured](#real-editors-as-measured)), and a test file with a real editor
  and real input, once it is settled whether the board's tests may depend on a modeler of the
  suite.
- An end signal for a host: a promise on `BoardHandle` that settles when the canvas is gone.
- State per board, listeners of the board's own, the fit capped and aware of the toolbar's
  height, `freeArea.center` read.
- A design-system review: copied Lucide geometry, icon sizes, handles and tints, note colours in
  dark, `z-index: 2000` on the edge labels, the tap highlight and the text size adjustment on
  `.board-root`, a colour of its own for `.board-node__header`, and the comments that cite
  designIQ's documents or a file their statements left with a split.
- Publishing: ranged peers for `yjs`, `react`, `react-dom` and `@xyflow/react` with exact
  mirrors, a build, a release-please component, a notice for `dompurify` and one for Tailwind's
  preflight (MIT), of which `assets/board-base.css` is a scoped copy.

**Found in the moved code and left as it was measured.** Each is a change of behaviour, so each
wants its own decision and its own test.

- **A line nested deeper than the call stack** (20,000 arrays) is accepted by `parseBoardText`,
  and `encodeBoard` then throws a `RangeError`. The same in designIQ's reader.
- **`elements.reveal(id)`** selects on the canvas only what the canvas already draws: an element
  revealed in the task of the gesture that made it, or before `attachTo`, is in `selection()` and
  not selected on the canvas.
- **`getViewState()`** answers the last view right after `destroy()` and
  `{ x: 0, y: 0, zoom: 1 }` once the canvas is gone (pinned as built in
  `contract-edges.browser.test.ts`): a host reads the view before it destroys the board.
- **A resting arrow-key move** is not in `exportText()` and not reported until it is written,
  400 ms after the last key.
- **An import before `attachTo`** is never fitted.
- **A nested Yjs type as an attribute value** of a live document makes `importText` throw in the
  middle of its write (`sameValue` in `store/document.ts`).
- **A listener of the store that throws inside an import's transaction** makes `importText`
  reject although the document was already written, which L7 forbids. Today only the canvas's
  React subscriptions listen there.
- **A box below 1 x 1.** `writeGeometry` and `writeGroupResize` write the box React Flow's resizer
  hands them as it is: a resize that a script starts before the node was measured gives a
  negative size.
- **Host code that is not contained.** `onChange` of the models, the references and the images
  (the one of the references in `Canvas`, above every `Slot`: a throw takes the whole canvas), a
  `describe()` that answers null, a list entry that is no string, `images.read()` that throws or
  answers a new Blob per call, `presence.onRemote` and `setLocal`. There is no error boundary
  under `.board-module`, and `board.mounted` never settles if the canvas itself fails. By
  reading, not run.
- **`relocate()` called again and again inside `open()`** ends the board (17 opens, no toolbar),
  and a `relocate()` to a path another node shows gives two editors on one path.
- **The first fit of a hosted editor** is made while the board scales it. A cure on the board's
  side (opening the editor in an unscaled place and moving it into the node after `ready`)
  changes measured behaviour.
- **The keys after a press on the pane.** While a model is armed, a pan leaves the node armed and
  the focus on the pane: Control + Z then runs the board's undo, not the model's, until a click
  in the editor. The toolbar's delete button is enabled while a node is armed and removes
  nothing.
- **The view after an armed node is removed** stays where the arming left it (zoom 1).
- **A model node's header** has no signal that makes it follow a host whose `describe` answers
  later, and the Done control does not follow a `relocate()` of the armed node until the toolbar
  renders again (both by reading, not run).
- **The double-click on Done.** `nodes/model-node.tsx` stops the `dblclick` event of its button,
  and its comment says that the second click of a double-click on Done must not arm the node
  again. By reading, not run with real input: React commits between the two clicks, the second
  lands on the button that says Edit by then, and the node is armed again.
- **The moving guard of the keys** (`canvas/canvas-keys.ts`) is never reached while the zoom
  guards are attached: their capture listener on `window` stops the key first.
- **In the arming**, pinned by a scenario each: a press held in the armed editor stays held when
  the guards are detached under it; `urlPending` stays true when the watch is undone before the
  URL's arm ran, and `whenRest()` then never resolves (a bench seam); a wheel with no vertical
  part ends a running move.
- **Images.** `assetPath` asks for `assets/<name>`, `-2`, `-3` and so on with no bound: a host
  that calls every path in use stops the page. An image whose bytes are on their way shows the
  missing-file figure until `onChange`.
- **Presence.** `safePresenceLabel` cuts a name at 24 UTF-16 units and can split a surrogate
  pair. A peer's cursor and outline disappear under a node this person selected: React Flow
  raises the selected wrapper to `z-index: 1000`, and `.board-presence` stays at 5.
- **The ground of a failed editor.** `.board-engine--failed` sets the destructive tint, but
  `.board-engine.board-engine` sets the canvas ground at a higher weight, so a failed editor
  shows its message on white. A fix is one selector, with a line in `styles.browser.test.ts`.
- **The window where the board is meant.** The breakpoint and `60vw` read the window: in a window
  of 1280 px a board of 400 px gets a notice of 560 px, which ends 175 px beyond the board with
  its dismiss button out of reach, and a Done control of 200 px, which makes the toolbar three
  rows. The notices also lie over the armed editor (`z-index` 5 over the layer's 4).
- **The board's own React Flow rules reach a hosted React Flow.** The rules that start at
  `.board-root .react-flow…` and the `--xy-*` values carry no `:not(:where(.board-engine *))`: an
  editor that is itself on React Flow gets the board's handles and edge colours, and the content
  of its group nodes takes no pointer.
- **A selected or hovered group** carries React Flow's own shadow, a square hairline in #1A192B
  around the rounded frame: the one colour on the board's elements that is neither a role nor a
  token.
- **The base's cost on a large hosted editor**: about 52 ms more style time for 32,000 elements
  below `.board-engine` (126.6 ms against 74.8 ms without the base layer, median of nine).
  `@scope (.board-root) to (.board-engine > *)` would exclude without the walk up the ancestors,
  and would give a board in a board its base.
- **Declarations that are overridden or without effect**, kept as moved: the first `.board-text`,
  `.board-image`, `.board-group` and `.board-group__label` blocks, which later blocks override,
  and `transform-origin: 0 0` on `.board-engine`, which served the counter strategy.

## Conventions

- Relative imports end in `.js`. An optional member is `x?: T | undefined`. No `@designiq/*`
  import.
- New code is in the suite's style: plain English, British spelling, no em dash as a connector, a
  comment only for a why. A moved comment stays as it is.
- UI copy is English. Icons are Lucide (`lucide-react`), `aria-hidden` beside a text or under an
  `aria-label`.
- Conventional Commits with the scope `board`.
