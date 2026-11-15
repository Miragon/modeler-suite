# CLAUDE.md

TypeScript modeler for the board: a canvas of a repository's own files. Models are shown and edited
in place, each by an editor the host hands in and each saved in its own file, next to notes,
images, groups and arrows. The board stores where a file sits, never what is in it. The file is a
`.board` text, one JSON line per element. Unlike every other modeler of the suite its canvas is
[React Flow](https://github.com/xyflow/xyflow) (`@xyflow/react`, MIT) on React, not diagram-js: it
lays out HTML nodes that hold whole editors.

**Work in progress, in the middle of a port.** The board was built and measured in designIQ
(`apps/web/src/notations/board` there, at commit `ce12684`) and is moved here step by step.
[State of the port](#state-of-the-port) says what is in the tree and what is still to come. Where
this file describes something that is not built yet, it says "planned" or "still to come".

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
  `packages/renderer/src`, the stylesheet and the two theme files. It type-checks, and ESLint,
  dependency-cruiser and Prettier pass.
- The public API in its declared shape (`src/index.ts`, `host/types.ts`, `collaborative/api.ts`).
- The test support (`test/support/`) and the first tests of the canvas (see [Tests](#tests)): a
  board mounts in Chromium through the public factory, and a model node opens, arms, releases and
  destroys a host's editor. **Nothing else the canvas does is under a test here yet**: not the arm
  rules at work, the keys, the toolbar, the nodes, the stylesheet or the contract's laws.

Still to come, the rest of the port:

- Five work packages. The first four each end with one of the marked lint lines removed (see
  below); they share no file.

  | Package | Owns                              | Still to come                                                                                                                                                                                                 |
  | ------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | P1      | `arming/board-arming.ts`          | `createBoardArming` split into `arming-state.ts`, `arming-motion.ts`, `arming-placement.ts`, `arming-transitions.ts`, `zoom-guards.ts` and `viewport-watch.ts`, proven by traces recorded before the split    |
  | P2      | `canvas/`, `flow/board-flow.tsx`  | `Canvas` split into the hooks `useClickOwnership` and `useCanvasKeys`; tests of the keys, the click ownership, the toolbar, the derived arrows and presence                                                   |
  | P3      | `nodes/`, `edges/`, `surface/`    | the placement taken out of `OverlaySurface` into `surface/place-host.ts`; the call-order test of the surface; tests of the nodes                                                                              |
  | P4      | `collaborative/collaborative.tsx` | the contract's conformance kit bound to the factory; the factory split into `selection.ts`, `view.ts`, `imports.ts` and `elements.ts`; the option `liveDocument`, which is declared and **not read yet**      |
  | P5      | `assets/`                         | the stylesheet on the design system's roles and on a base of its own, the rules that leave it, its drift and scope tests (see [Stylesheet and theme files](#stylesheet-and-theme-files) for what it is today) |

- The gate of the port: every marked lint line gone, and the conformance kit green three runs in a
  row with exactly the pinned skips (see [Tests](#tests)).

Still to come after the port: `apps/webapp`, `apps/vscode`, the Orca plugin, `e2e/`, `example/`,
`docs/`, the entry in the modeler collection and the board's row in the suite's `CLAUDE.md`. Until
`apps/vscode` exists, `npm run test:plugin` fails in `test/modeler-collection.test.ts` and in
nothing else. The board has no `build:webapp`, `package:vscode`, `test:e2e` or `test:vscode`
script, so `npm run modelers <script>` fails at the board for those.

**The four marked lint lines.** Four functions are over the suite's 150 lines per function and
carry `// eslint-disable-next-line max-lines-per-function -- port: split by P<n>`:
`createBoardArming` (P1), `Canvas` (P2), `OverlaySurface` (P3) and `createCollaborativeModeler`
(P4). `grep -rn "port: split by" modelers/board/packages` lists them. A line goes with its split;
never add a fifth.

**Frozen for the port.** The seams between the work packages do not change while they run: the
public API, `runtime/`, `arming/arming-api.ts`, `arming/armed-editor.ts`, `flow/flow-types.ts`,
`flow/derived-arrows.ts`, `host/defaults.ts`, `gestures/`, `parts/inline-edit.tsx`, `geometry.ts`,
`collaborative/internals.ts`, `test/support/`, the export names and props of the lazily loaded
components (`ModelNode`, `TextNode`, `ImageNode`, `GroupNode`, `ArrowEdge`, `DerivedEdge`,
`Toolbar`, `BoardGestures`, `BoardPresenceLayer`, `OverlaySurface`, `Board`) and the
[DOM contract](#dom-contract). A change to one of them is recorded here. None so far.

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
- **React Flow internals.** The arming, the gestures, the placement and the overlay surface read
  React Flow's internal store (`useStoreApi`): `transform`, `panZoom`, `nodeLookup` with
  `internals.positionAbsolute` and `measured`, `domNode`, `width`, `height`, `minZoom`, `maxZoom`,
  `fitViewQueued`, `connection`, `nodesSelectionActive`, `multiSelectionActive` and
  `addSelectedNodes`. The board was measured on 12.12.1, the version pinned.
  `test/browser/react-flow-internals.browser.test.tsx` names these fields, so a bump of
  `@xyflow/react` that renames or reshapes one fails there first.

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

| Folder                  | What                                                                                                                                                                                                                                             | Layer                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `store/`                | `document.ts` (the board as a live Yjs document, one `Y.Map` per element), `board-store.ts` (what a canvas reads and writes: one gesture is one transaction, the undo manager), `actions.ts` (what the board's features write into the document) | document half          |
| `host/`                 | `types.ts` (the public host and embedded-editor types), `defaults.ts` (how the board reads a host, with the answer of a host that offers nothing)                                                                                                | document half          |
| `arming/`               | `arm-rules.ts` and `types.ts` (the arm rules as pure functions: document half), `arming-api.ts` (the records and the two sides of the arming module), `armed-editor.ts`, `board-arming.ts` (the rules at work: moves the board, guards the zoom) | document half, runtime |
| `runtime/`              | `options.ts`, `counters.ts`, `surface.ts` (types), `board-context.tsx` (the runtime made once outside React, the provider, `Slot`)                                                                                                               | runtime                |
| `flow/`                 | `flow-types.ts`, `derived-arrows.ts` (pure), `board-flow.tsx` (the document in React Flow's controlled mode)                                                                                                                                     | runtime                |
| `gestures/`             | notices, the groups that would take a dragged node, the edit request, where a new node goes, the board zoom for CSS, the image import                                                                                                            | runtime                |
| `parts/`, `geometry.ts` | `inline-edit.tsx` (a short text edited where it stands); how the board reads the screen                                                                                                                                                          | runtime                |
| `canvas/`               | `board.tsx` (`<ReactFlow>` and the slots), the toolbar, the gestures that belong to no node, the presence layer                                                                                                                                  | canvas                 |
| `nodes/`, `edges/`      | what a node and an arrow draw; `note-markdown.ts` renders a note's Markdown sanitised                                                                                                                                                            | canvas                 |
| `surface/`              | `overlay-surface.tsx`: a host's editor in a model node, moved into a screen-space layer while the node is armed                                                                                                                                  | canvas                 |
| `collaborative/`        | `api.ts` (the public types and `NOTATION`), `collaborative.tsx` (the contract factory), `internals.ts` (the runtime behind a board, for this package's tests only)                                                                               | contract               |
| `assets/`, `theme/`     | `board.css`; the two vendored token files                                                                                                                                                                                                        |                        |
| `index.ts`, `css.d.ts`  | the entry (it imports the sheet) and the module declaration for `*.css`                                                                                                                                                                          |                        |

- `runtime/options.ts`, `arming/arming-api.ts` and `runtime/counters.ts` import each other in that
  one direction only. designIQ had their types in one file; put together again they are a cycle.
- `collaborative/internals.ts` is not exported from the entry: a test reads a mounted board's
  runtime with `boardRuntimeOf(modeler)`, and no host can.
- The public API is one factory, `createCollaborativeModeler(options)`, with two options of the
  board's own, `host` and `liveDocument`, plus the document half's exports. No React component, no
  React Flow type and no designIQ type crosses the boundary, so a host need not share a copy of
  React or React Flow with the board. Only `liveDocument` asks a host for the same copy of `yjs`.

## The rule of this port: moved as measured

The canvas was measured in designIQ with the product's editors: 1375 rows of the editor batteries,
193 of the arm rules, 145 of the board features. Those batteries need designIQ's editors and run
again only when designIQ consumes this package. Until then a change of behaviour here is a change
nobody measures, so the canvas is a **move**, not a rewrite.

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
  keydown that stops keys aimed at a board that moves (`arming/board-arming.ts`); the motion tokens
  read off `document.documentElement`, `prefers-reduced-motion`, and a page-wide query for a node
  that is still armed.
- **The board's own toolbar**, inside React Flow's panel: the Done control, the zoom buttons, the
  add actions, delete and the notices. The shell's chrome does not apply to the board as it is.
- **`lucide-react`** for the icons, where the suite's renderers copy icon geometry.
- **The fit.** Not capped at 100 %, `FIT_PADDING` (clear of the toolbar's band) applied inside the
  host's insets, `freeArea.center` accepted and not read: a new node lands in the middle of what
  the board shows.
- **The bench seams**, unexported. Dead when the factory mounts the board (it passes no bench and
  `arm: null`): `BoardBench`, `inputScope: "page"`, `setScreenGeometry` and the URL arm in
  `BoardArming.watch()`. Kept up by the canvas and read by no host: the counters, the log and the
  registry of the surfaces (`registerSurface`, `surface`, `mounted`, `reportMount`). designIQ's
  batteries need exactly these hooks; whether the package gets a second entry for them is
  undecided. A test of this package reaches them with `boardRuntimeOf`.

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
    armed, and takes `editor.ready` as the node's ready. `undefined`, a throw and a rejection all
    end in `.board-engine--failed` with the message as its text.
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
  popups) is the host's: a rule of the host's sheet on `.board-engine[data-armed="false"]`. A host
  that forgets it shows palettes in every preview, and no test of the suite can notice. Today
  `board.css` still carries designIQ's rules of this kind for its own editors; they leave with P5.
  Until then the first of them matches every host's editor: it was written for every editor but
  designIQ's own (`:not([data-mount="product"])`), and the element no longer carries `data-mount`.
  It takes a diagram-js palette out of a preview with `display: none`, where designIQ's own editor
  had it hidden with `visibility: hidden`, so that arming moved nothing.
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
- Gone with the move: `data-mount`, `data-notation`, `.board-node__strategy`. Nothing writes
  `.board-stub` or `.board-frame` any more; their rules are still in the sheet until P5.

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
  uniformity is an open question to the suite's owner; until it is answered, do not add it.
- **`assets/board.css` today** is designIQ's sheet with two imports in front (the tokens in the
  layer `board-tokens`, then React Flow's own sheet). It still reads 22 colour names and 2 font
  names of designIQ's ui-kit (`--background`, `--primary`, `--border`, `--designiq-font-sans` and
  so on) that nothing in the suite defines, it was measured on a page with Tailwind's preflight,
  and it still holds the bench's rules and the preview chrome rules for designIQ's editors. Every
  declaration that reads one of those names falls back to its initial or inherited value here, so
  a board mounted in the suite today is not yet the picture that was measured.
- **Planned (P5), not built:** one alias block on `.board-root` that gives each of those names a
  `--board-*` variable reading the role whose light value equals what the name had in designIQ, so
  the light picture stays; a scoped and layered base `assets/board-base.css` in place of the
  preflight; the bench's and the editors' rules removed; a drift test and a scope test. The sheet
  is then to read only `--cd-ui-*` roles and the mode-independent tokens, as the suite asks. Dark
  is not designed: the aliases are chosen for equal light values, and a board on a dark page will
  follow the page's roles until an appearance surface exists.
- An app that bundles the package is to import the sheet by name as well
  (`@miragon/board-renderer/assets/board.css`), as the Business Model Canvas web app does with its
  renderer's: the package marks only its CSS as having side effects, and Rollup then leaves out
  the import inside a barrel.

## Tests

- `npm run board test` (project `unit`, Node). `packages/schema-model/test/` covers the format,
  the order keys and the view. `packages/renderer/test/` covers the store, the actions, the arm
  rules, and the board file at rest, under a Git merge and under two peers on one live document;
  of the canvas side its pure parts: `derived-arrows.test.ts`, `host-defaults.test.ts` and
  `single-copy.test.ts`.
- `npm run board test:browser` (project `browser`, Chromium) runs
  `packages/renderer/test/browser/**/*.test.{ts,tsx}`: React Flow measures its nodes, so nothing
  of the canvas runs in jsdom or Node. Two files so far. `toolchain.browser.test.tsx`: a board of
  notes mounts with its sheet and a pane that takes the focus, a model node asks the host once for
  its editor, a double-click arms it at board zoom 1 in the layer, a zoom of the board releases
  it, and `exportText()` gives back the imported text. `react-flow-internals.browser.test.tsx`:
  the fields of React Flow's store the board reads.
- `packages/renderer/test/support/`: `board-texts.ts` (the texts designIQ's bench measured the
  board with, byte for byte: never edited by hand), `test-host.ts` (`createTestHost`: a host in
  memory whose editors record `open`, `armed`, `release`, `focus` and `destroy`), `mount-board.ts`
  (`mountBoard(text, options)`: a board through the entry, in the kit's 800 x 600 host element)
  and `pointer.ts` (`click`, `doubleClick`, `key`).
- Still to come: the tests of the five work packages, the conformance kit among them (see
  [State of the port](#state-of-the-port)).

**The conformance kit and its pinned skips (planned, P4; not in the tree).** The suite's rule is
zero: a skipped case or an advisory fails a renderer's run, because its test passes an `onSkip`
that throws. The board is to bind the kit with eight skips pinned instead, and that is a deviation
with an end, not a new rule:

| Skipped case (its name up to the first colon) | What it waits for                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `L1 (recommended, 1.5)`                       | the harness hook `startGesture`: a gesture a harness can hold and cancel |
| `drop (recommended, 1.6)`                     | `startGesture`                                                           |
| `drag start (recommended, 1.6)`               | `startGesture`                                                           |
| `destroy from a listener (recommended, 1.6)`  | the gesture hooks, for the legs it cannot check without them             |
| `interaction (when present, 1.5)`             | the `interaction` surface                                                |
| `pan (recommended, 1.6)`                      | the harness hook `startPan`                                              |
| `viewer (when shipped)`                       | a viewer mount (the harness hook `createReadonly`)                       |
| `appearance (when present, 1.5)`              | the `appearance` surface                                                 |

The hooks stay unfilled because the board lacks what they drive, not because the harness is
unfinished: see [Deferred](#deferred). `pan` may be the exception. By a reading of d3-zoom, not by
a run, the hook `startPan` alone may be enough; it is tried only after the gate.

The plan for that test: the list is checked in both directions (a skip that is not on it throws,
and a listed case that stops skipping fails until its name is removed), an advisory throws, and the
list may only shrink. Expected is the parity designIQ's own harness has: 36 cases, these eight
skips, no advisory. That was seen in designIQ and in a scratch copy during the design, not yet in
this tree. The merge kit is not registered: the board has no text merge.

Notes for whoever writes a browser test:

- `mountBoard` resolves once the toolbar, a wrapper per node and every lazily loaded part are in
  place. It does not wait for what answers later: an editor's `ready` (poll
  `runtime.mounted(nodeId)`) and a note's rendered Markdown.
- Without it: `attachTo(element)` wants an element that is in the document and has a size.
  `modeler.board.mounted` resolves once React Flow's viewport exists and never rejects;
  `importText` called after `attachTo` waits for it (10 s at most) and then one macrotask. Neither
  waits for the lazy parts.
- `exportText()` is canonical, so only a text in canonical form comes back byte for byte.
- Every synthetic `MouseEvent` needs `view: window`: d3-zoom and d3-drag, which React Flow pans,
  zooms and drags with, bind their move and release listeners on `event.view`. A click needs its
  press before it: the board asks where a click began. `pointer.ts` does both.
- A host for a test keeps its parts and its arrays stable (see
  [What is left with the host](#what-is-left-with-the-host)), or React subscribes anew on every
  render. `createTestHost` does.
- `optimizeDeps.include` in `vitest.config.ts` names the twelve dependencies that are pre-bundled
  up front. If a run prints "optimized dependencies changed. reloading", add the dependency there.
- Chromium may log "ResizeObserver loop completed with undelivered notifications" as a window
  error while the kit runs. It was seen in designIQ's harness and in the design's scratch runs, not
  in the mounts here, and it failed no test; `canvas/board.tsx` says what the board does against
  it for a resize. If Vitest ever counts it as an unhandled error, filter exactly that message and
  record it here.

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
with a `node_modules` segment keeps Vite from warning about Vitest's own pre-bundle on every cold
start. Keep the two `optimizeDeps.include` lists identical.

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
  and tints, note colours in dark, the window breakpoint and `60vw`, `z-index: 2000`, and the
  comments that cite designIQ's documents.
- Publishing: ranged peers for `yjs`, `react`, `react-dom` and `@xyflow/react` with exact
  mirrors, a build, a release-please component, a notice for `dompurify`.

## Conventions

- Relative imports end in `.js`. An optional member is `x?: T | undefined`. No `@designiq/*`
  import.
- New code is in the suite's style: plain English, British spelling, no em dash as a connector, a
  comment only for a why. A moved comment stays as it is.
- While the work packages run, format only the files you own (`npx prettier --write <files>`), not
  the folder.
- UI copy is English. Icons are Lucide (`lucide-react`), `aria-hidden` beside a text or under an
  `aria-label`.
- Conventional Commits with the scope `board`.
