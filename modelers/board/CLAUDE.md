# CLAUDE.md

TypeScript modeler for the board: a canvas of a repository's own files. Models are shown and edited
in place, each by an editor the host hands in and each saved in its own file, next to notes,
images, groups and arrows. The board stores where a file sits, never what is in it. The file is a
`.board` text, one JSON line per element. Unlike every other modeler of the suite its canvas is
[React Flow](https://github.com/xyflow/xyflow) (`@xyflow/react`, MIT) on React, not diagram-js: it
lays out HTML nodes that hold whole editors.

**Work in progress.** The board was built and measured in designIQ
(`apps/web/src/notations/board` there, at commit `ce12684`), and its canvas was moved here as it
was measured. The move is done and was reviewed. Of the apps around the board the first
increment is in the tree: a web app that shows an example repository in memory, with the seven
modelers of the suite as the editors of its model nodes. There is no VS Code extension yet.
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
`CONTRIBUTING.md` and `.claude/rules/package-json-fixed-versions.md`. With the first increment of
the apps: `packages/files` and `packages/host` (what every host of a board shares),
`apps/editors` (the seven modelers of the suite as the editors of model nodes), `apps/webapp` on
the example repository `example/`, and `e2e/` with the project `webapp`. That increment changed
no file of `packages/renderer/src` or `packages/schema-model/src`. 38 unit files with 734 tests,
23 browser files with 784 tests, and 2 Playwright tests.

Read the browser count by what it stands on. 661 tests are the renderer's: 297 run the arm rules
on a bench of fakes (73 scripts, each run once and read by four tests, plus five), 82 hold static
markup under the sheet, 7 a bare React Flow, 73 are the contract's kit, 201 are in the eleven
files that mount a board, and one holds a filter of the test support. Every editor in them is the
recording stand-in of `createTestHost` and every input is synthetic, which ignores `inert`: none
of them can fail when a preview takes real input or when the pointer math of an armed editor is
off. That is held outside the renderer, with real mouse and keyboard input
(`commands.realInput`): 57 tests of `packages/host` (8 of the command itself, 49 on a stand-in
modeler of the contract that draws boxes, alone and on the real board), 53 of `apps/editors` (49
with the seven real modelers on a board, 2 for the order of their sheets, 2 for the watch the
battery ends every test on) and 13 of `apps/webapp`.

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

**What was run, and what was not.** On the machine the first increment of the apps was
integrated on (the Miragon agent VM), with the tree as it stands:

- `npm run board lint`, `test` (38 files, 734 tests), `depcruise` (no violation, with and without a
  built web app in the tree) and `format:check` pass; so do the root tests
  `test/modeler-boundaries.test.ts` and `test/release-config.test.ts` (82 tests), and the checksums
  of the theme files verify.
- The whole browser project passes five runs in a row through the local sandbox config (23 files,
  784 tests each; see [Commands](#commands)), one shuffled run and one run on a cold Vite cache.
  Before the review's fixes, at 774 tests, it also passed four shuffled runs and twelve runs with
  three at once.
- The e2e project passes three runs in a row through the local Playwright sandbox config (2 tests
  each), on the dev server it starts.
- `npm run board build:webapp` and the web app's `check:build` pass, and the dev server serves its
  page and its modules on port 5184.
- No Chromium command line carried `--no-sandbox` in any sample of the process table taken during
  these runs. While the work packages of the increment ran side by side, one system-wide sample
  showed 160 of 448 Chromium command lines with the flag. The run it came from was not found; a
  sample attributed by parent chain to the board's own runs at that time had none.
- Not run: `npm run board test:browser` and `test:e2e` with the committed configs (that machine
  must not start Chromium without its sandbox), CI, brand-lint (the `miragon-brand` plugin was not
  on that machine), designIQ's batteries, and any browser but Chromium. The web app was opened by
  tests and by the review below, which drove it with Playwright; its owner has not opened it.

**A review of the increment.** After the increment was integrated, an independent reviewer ran its
gate again, drove the web app with Playwright's mouse and keyboard (the dev server and the built
app, at 1600 x 1000, 760 x 600 and 400 x 800, and at a device pixel ratio of 1.25 and 2, in scratch
specs that are not in the tree), read the code, and tried 17 single edits of the sources and 25
malformed messages against it. All seven notations passed every step there: the preview, the
arming, a drag, a label, a delete, Done, a zoom of the board and a reload, each with its own file
written and never the board's. What the review found:

- **Fixed, each under a test.** `packages-no-other-modeler` caught an import by a package's name
  only, and nothing kept diagram-js and React out of the host package's sources
  ([Packages](#packages)). The files server stored a file for a create whose bytes were `null` or a
  number, served a request whose id was `NaN`, took a path with a line break in it, and took a new
  file that was a dot file, ended in a dot or carried a device name of Windows, at any size
  ([The files port](#the-files-port-packagesfiles)). The web app kept the bytes of every picture
  ever added, and a picture the browser had not kept was a hole without a word after a reload
  ([The web app](#the-web-app-and-the-example-appswebapp-example-e2e)).
- **Under a test now**, where this guide had said without one: a zoom of the board as the end of an
  edit for all seven modelers, a second node on one file, and a change from outside while a real
  editor is armed ([Real editors, as measured](#real-editors-as-measured)).
- **Named and not changed:** what a page may reach inside the repository's root, which is the
  owner's to settle before a host with a disk is written (The files port); the notices the web
  app's build lacks, an armed editor in a window narrower than its node, and the invalid line's
  advice in a host that has no editor for the file (The web app).
  **CI and the root scripts with this branch.** The suite has no state for a modeler without a VS
  Code extension: a pull request with this branch cannot pass `ci-ok`, and on `main` the branch
  would fail every later pull request. By a reading of the workflows (and, before the apps, a run
  of `ci-paths.sh`), not by a CI run:

- `shared-test` fails in `npm run test:plugin`: `test/modeler-collection.test.ts` reads
  `modelers/board/apps/vscode/package.json` and fails while it is collected, so none of its tests
  runs and its guard for the seven published extensions is off. Nothing else fails in that script
  (13 files and 289 tests pass here). The job runs for every pull request, a docs-only one too.
- `modeler-check (board)` has its scripts up to the web app's build and `check:build`, each of
  which passes here, and fails at `package:vscode` (no such script). `vscode-smoke (board)` fails
  at `test:vscode` and in the action that reads `apps/vscode/package.json`.
  `modeler-test-browser (board)` and `modeler-e2e (board)` run the committed browser and
  Playwright configs, which nobody has run: the machine the apps were built on runs both only
  through local configs that keep Chromium's sandbox.
- After a merge a change of the lockfile reaches every modeler, so every Dependabot pull request
  runs the board's failing jobs, and the weekly smoke fails every Monday and opens its issue.
- The board is in the root `modelers` alias: `npm test` stops in `test:shared` before any
  modeler's unit tests run, `npm run build` fails in `build:apps` at `build:vscode`, and
  `npm run package:vscode` and `npm run modelers <a script of the extension>` exit 1.

Business Model Canvas and C4 each arrived complete in one pull request. Either this branch stays
off `main` until the apps exist, or the suite gets one in-progress marker that `ci-paths.sh`, the
root `modelers` alias and `test/modeler-collection.test.ts` all read: the owner's to settle.

**Still to come:** `apps/ide-editor` (the board inside the shell), `apps/vscode` with the e2e
project `vscode-webview`, the Orca plugin, `docs/`, a README per package, a third-party notices
file for the web app, and the root files a modeler arrives with: the board's rows in the suite's
`CLAUDE.md` (paths, aliases, the DOM-free table, the commit scopes) and its sentences that are
untrue with the board in the tree ("all seven", "one notation on diagram-js", "a skipped case or
an advisory fails the run"), the root `CONTRIBUTING.md` and `README.md`, the issue templates, the
release-please components and manifest, `.miragon/product-shots.yaml`, the docs site,
`netlify.toml` and the entry in the modeler collection.

**Without a test**: the gestures and behaviours the test README lists under "Without a test",
among them the group that takes a dragged node, the resize of a model and of an image node, and
the toolbar's buttons for the zoom, the fit and a group; and what the sections on the files
port, the host package, the suite's editors and the web app name as without a test.

## Packages

Every workspace is `private`: the modeler publishes nothing to npm. The packages export their
TypeScript source (`"exports": { ".": "./src/index.ts" }`), have no `dist`, and `build` is a type
check.

| Package                       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                  | DOM |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `@miragon/board-schema-model` | The file format and its strict reader (`format.ts`), the elements of a board (`types.ts`), their paint order as fractional indices (`order.ts`), what a canvas draws of a snapshot (`view.ts`)                                                                                                                                                                                                                                           | no  |
| `@miragon/board-renderer`     | The board as a live document on Yjs, its store and actions, the arm rules, the React Flow canvas, the contract factory `createCollaborativeModeler`, the stylesheet (`@miragon/board-renderer/assets/board.css`)                                                                                                                                                                                                                         | yes |
| `@miragon/board-files`        | The files of a repository as a board's page reads and writes them: the port `BoardFiles`, the protocol between a page and the host that keeps the files, its client (`createFilesClient`) and its server (`serveFiles`, which keeps every path a page sends inside the repository's root), a memory backend, and `connectBackend` for a host whose files are in the page                                                                 | no  |
| `@miragon/board-host`         | What every host of a board shares: a modeler of `@miragon/modeler-api` as the editor of a model node (`embedModeler`), its binding to a text session (`bindTextSession`), the facade a host's `open()` returns at once (`openEditor`), a board host from the files of a repository and a registry of editors (`createFilesHost`, `modelsFrom`, `imagesFrom`), the registry's types, and the sheet `@miragon/board-host/assets/embed.css` | yes |

Three app workspaces stand on the packages. They are no packages: nothing under `packages/`
imports one.

| Workspace                               | What                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `board-suite-editors` (`apps/editors`)  | The seven modelers of the suite as the editors of a board's model nodes: the suffix table (`./suffixes`, plain data without an import, for a host in Node), the registry `SUITE_EDITORS` (`.`), the shared sheet base (`./base`), `./zod-jitless` for a page under a CSP without eval, and the build helpers (`./build/*`). The one workspace of the board that imports another modeler |
| `@miragon/board-webapp` (`apps/webapp`) | The board on the example repository `example/`, held in memory: a Vite app on port 5184 (strict)                                                                                                                                                                                                                                                                                        |
| `@miragon/board-e2e` (`e2e`)            | Playwright, with the project `webapp`                                                                                                                                                                                                                                                                                                                                                   |

- **Boundaries.** `schema-model` and `files` are the DOM-free packages
  (`modelerSuite.domFreePackages`). `files` has no dependency, and its own `tsconfig.json` has no
  DOM lib: `npx tsc -p packages/files/tsconfig.json` is the check that it uses nothing of a browser
  (`Blob`, `btoa`, `atob` and `MessageChannel` come from the Node types and exist in a page as
  well). Six rules of the board's own in `.dependency-cruiser.cjs` add what the presets do not
  stop. Two are the renderer's: `schema-model-no-canvas-libraries` (no React, React Flow or Yjs in
  the schema model) and `document-half-no-canvas` (`store/`, `host/`, `arming/arm-rules.ts` and
  `arming/types.ts` import neither React nor React Flow, nor anything under `runtime/`, `flow/`,
  `gestures/`, `parts/`, `canvas/`, `nodes/`, `edges/`, `surface/` and `collaborative/`, nor any
  other file of `arming/`, nor `geometry.ts`). That rule names paths: a new folder or top-level
  file of `src` that is not of the document half is added to its `to`, and `test/layers.test.ts`
  fails until it is. Four came with the apps. `packages-no-other-modeler`: no file under
  `packages/` and no app but `apps/editors` imports another modeler, tests included, neither a
  package of one by its name nor a file of one by a relative path, which the cruiser names
  `../<modeler>/...` from here; the contract and the shell are no modelers. The rule first caught
  the name alone, and a relative import from `packages/host/src` into
  `../wardley-maps/packages/renderer/src` passed the cruise and ESLint. `packages-no-apps`: no
  package imports an app workspace, or `apps/editors` would bring the seven renderers in unseen.
  `files-no-canvas-libraries`: no React, React Flow or Yjs in `files`, and nothing of the board's
  renderer or host package. `host-no-editor-libraries`: no diagram-js, no React and no React Flow
  in the sources of `packages/host`, not as a type either; its tests mount the real board and are
  left alone. `npm run board depcruise` cruises `packages` and `apps` and leaves out the apps'
  build output (`^apps/[^/]+/dist/`): the web app's build is code-split and its chunks import each
  other in circles, 14 `no-circular` errors without the exclusion. No wider pattern: `(^|/)dist/`
  would also hide the contract's `dist` from `dom-free-contract-types-only`.
  `apps/editors/test/cruise-rules.test.ts` holds the reach of the four rules and of the exclusion
  against the workspaces the suite has today. `@miragon/board-host` imports `@miragon/board-files`,
  and types only from `@miragon/board-renderer` and `@miragon/modeler-api`; it names no renderer of
  the suite, no diagram-js, no shell and no React. The rules and the preset's `packages-no-shell`
  hold that sentence but for one part: that the renderer and the contract are imported for their
  types alone is how the code stands, and no rule asks for it. `eslint.config.js` adds
  `eslint-plugin-react-hooks` for the renderer (`rules-of-hooks` an error, `exhaustive-deps` a
  warning).
- **The owner's open decision: may an app workspace of the board depend on the other modelers'
  renderers?** Not answered. The tree is built on the plan's recommendation: yes, in
  `apps/editors` and nowhere else, kept so by `packages-no-other-modeler`. If the answer is no,
  what goes is the 13 pins of `apps/editors/package.json` on the other modelers, 26 of the 28
  `extra-files` entries this increment added (all but the two for `packages/host`'s pin on the
  contract), the rule's exception for `apps/editors`, and with them the notation modules, their
  battery and every model the web app draws: `apps/webapp` takes `SUITE_EDITORS` and
  `board-suite-editors/base` in `src/app.ts`, the suffix table in `test/example.test.ts` and
  the three build helpers in `vite.config.ts`.
- **Dependencies.** Exact pins and no ranged peers while nothing is published (the Business Model
  Canvas rule; see `.claude/rules/package-json-fixed-versions.md`). The renderer depends on
  `@xyflow/react`, `react`, `react-dom`, `yjs`, `lucide-react`, `markdown-it`, `dompurify` and
  `@miragon/modeler-api`; `packages/host` pins the contract as well, and `apps/editors` pins
  thirteen packages of the other modelers (the seven renderers and the six packages its text
  rules call: `wardley-dsl`, `wardley-schema-model`, `value-chain-schema-model`,
  `business-model-canvas-dsl`, `team-topologies-schema-model`, `context-maps-schema-model`)
  beside `diagram-js`, `didi`, `tiny-svg` and `zod`. Every pin on a release component has its
  two `extra-files` entries in `release-please-config.json`: `test/release-config.test.ts` names
  each missing one, and a further pin on a workspace package is a manifest line, an
  `npm install` and the two entries that test then asks for. The tests of `apps/editors` import
  `@miragon/board-files`, `@miragon/board-renderer` and `@miragon/board-schema-model` without a
  line in its manifest; they resolve through the workspace links, as the test-only imports of
  the other modelers' `e2e` workspaces do, and no check asks for more. There must be one copy
  each of `yjs`, `react`, `react-dom` and `@xyflow/react` under this modeler: the store tells
  its elements by `instanceof Y.Map`, and a second React breaks every hook.
  `test/single-copy.test.ts` reads the lockfile for it, the job ranged peers do in the published
  modelers.
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
  (see [The host package](#the-host-package-packageshost)), which is why the views are equal.
- **Not run:** designIQ's product editors (bpmn-js and dmn-js are not in this repository), touch
  and pen, Firefox and WebKit, a device pixel ratio other than 1 for the seven as a kept test (a
  review ran their previews and their arming at 1.25 and 2 once), more than seven model nodes on
  one board. Only designIQ's product editors and its 1375 rows need designIQ.

## The files port (`packages/files`)

`src/port.ts` is what a page asks for (`BoardFiles`, `TextSession`), `src/server.ts` what a host
implements with its own file API (`FilesBackend`, `BackendText`), and `src/protocol.ts` the
messages between the two. `src/client.ts` is the page's side, `src/memory.ts` a backend in
memory (the web app's repository and every test's double), `src/local.ts` `connectBackend`:
client and server on a `MessageChannel` of the page's own, so that a host in the page runs the
same path checks and the same message order as one behind a webview. `src/paths.ts` has the path
rules. The entry exports `createFilesClient`, `connectBackend`, `createMemoryBackend`,
`serveFiles`, `bySuffix`, `isNewAssetPath`, `repoPath`, `fromBase64`, `toBase64`,
`isBoardMessage`, `PROTOCOL`, `NEW_FILE_LIMIT_BYTES` and the types.

- **The messages are frozen.** Every type starts with `board.`, so they share a webview's
  channel with the shell's. The VS Code host of the next increment is written against the names
  and shapes: a change to one is a new `PROTOCOL`, and a table in `protocol.test.ts` fails the
  type check when a type is added and not listed.
- **The rules both sides keep.** Nothing is pushed before the hello. Whatever the page awaits
  carries a `requestId`, a whole number, and ends in its answer or in `board.failed`; a request
  with any other id (none, a text, a fraction, `NaN`) is dropped, since no answer could reach it.
  The page never gets its own edit back; the other sessions on the path hear it at once, in the
  page. A write the place refused is answered with the text the place has, once the last write of
  that path settled. One path is one subscription at the host however many nodes show it.
- **A hello starts the life of a page.** A second hello on the same channel (a reloaded
  webview) closes what the page before had open and sends the list again; an answer that was
  awaited across it is never sent. A hello of another protocol is none: every request is then
  failed with a message that names both numbers. A request before the hello is answered with
  `board.failed` ("the page has not said hello"); an edit and a close before it are dropped. The
  client says hello once, when it is made, so a server listens before the page starts.
- **Paths.** `repoPath` refuses whatever is no repository-relative path with forward slashes (no
  string, empty, more than 1024 characters, a backslash, a control character such as a NUL or a
  line break, a scheme or a drive letter, an absolute path, a segment that is empty, `.` or `..`).
  The server runs it on every path before a backend sees one. A backend refuses a path that is in
  use: the server does not check the list.
- **A new file** is taken only as `assets/<name>` with a name of letters, digits, dot, dash and
  underscore, which is what the board makes of a picture's name, and not as a dot file
  (`.gitignore`), a name that ends in a dot, which Windows drops, or a device name of Windows
  (`nul`, `con.png`, `COM1.svg`). Its bytes are a base64 text: any other value is refused, where
  `atob` would take `null` for the four letters of its name and store three bytes. They are at most
  `NEW_FILE_LIMIT_BYTES`, 10 MiB, the board's own limit for a picture; the files package cannot
  import the board, and `packages/host/test/files-host.test.ts` holds the two numbers equal. A type
  that is no text is taken for none. One refused name is one the board itself makes: a picture a
  person called `aux.png` or `con.png` is answered with "a new file cannot have this name", which
  the board puts into its notice.
- **The path check reads the path's text and nothing else.** It keeps a path inside the
  repository's root and does not say that the file is one a page should have. `.git/config`,
  `.git/hooks/pre-commit`, `.env`, `.vscode/settings.json`, a name with percent signs
  (`%2e%2e/secret`), `models/a.owm.` and a path through a link that leads out of the root all pass
  and reach the backend's `openText` and `readBytes`, and a text that is open is written by
  `board.text.edit` (a review sent each to a recording backend; of 21 paths that lie outside the
  root as a text none got there). The memory backend has only its own files, so the web app is not
  exposed. A backend with a disk checks a path again: against what it lists, against links, and
  against how its file system folds names. Whether the server does part of that for every backend
  is **open, and the owner's to settle before the VS Code backend is written**. Either it serves
  `openText` and `readBytes` only for a path of `backend.list()`, whose list then has to be
  complete before the first hello is answered (a node whose file is not listed yet fails, and the
  facade has no retry); or `repoPath` refuses a segment that starts with a dot, which keeps a model
  in a dot folder off every board.
- **Writes.** A place gets the writes of one path one at a time and in the page's order, and
  `close()` after the last of them, also when the page went in the middle of one. `false` and a
  rejection both mean refused.
- **A file that goes.** Its sessions hear `onAvailable(false)` and keep their text; a write does
  nothing meanwhile; when the file is back they hear `onAvailable(true)` and then its text. A
  reader that comes while the file is gone is rejected with `<path> is gone`: a session cannot
  say that its file was gone before it was made.
- **`connectBackend`.** Each message is a task: `paths()` is empty until the hello was answered,
  and `onPaths` says when the list is there. `dispose()` ends client and server in one call and
  drops what the page posted in that task.
- **Messages a node may show** (the facade prints them behind "This file could not be opened."):
  "this path is outside the repository", "a new file goes into assets/", "`<path>` exists
  already", "`<path>` is no text file of this repository", "`<path>` is gone", "the page has not
  said hello", "the files were closed", "a new file cannot have this name", "the bytes of the new
  file are no base64 text", "a new file may have up to 10 MiB".
- **Known and not cured.** The protocol has no version of a text and no acknowledgement: an edit
  and a change from outside that cross leave the page showing the outside text and the place
  holding the page's edit, until the next change of either (run once in scratch on the test
  channel; a cure needs a version or an acknowledgement, a new `PROTOCOL`). `BoardFiles` has no
  flush, so a caller cannot wait for a write to land before it disposes, and `TextSession`
  cannot be asked whether its file is there. The memory backend's `writes` is a log for tests
  and grows with every write: whoever keeps a backend for long empties it, as the web app does.
- **Without a test:** `port.start()` in `local.ts`, which only a browser needs (the browser files
  of `packages/host` and of the apps run through `connectBackend`), and the two `port.close()`
  calls there. Of 110 single edits of the sources that were tried against the tests, those two
  pass. A review's edit that let a create decode any value as its bytes passed as well; it fails
  now, as do twelve further edits of the path rules and of the server's checks of a message.

## The host package (`packages/host`)

`@miragon/board-host` is what a host of a board needs and the renderer does not have: the
adapter under [Real editors, as measured](#real-editors-as-measured), built once for every
modeler of the contract. It names no renderer: a modeler comes in through a registry entry, and
everything done to it goes through the contract plus three things the contract has no call for:
a fit in layout px through the diagram's `canvas` service, the focus (`canvas.focus()`), and the
release from the DOM (`releaseDiagramJs`). A modeler without a `diagram` is mounted and bound
all the same and gets no fit and no focus.

- **The registry (`src/registry.ts`).** An `EditorEntry` is
  `{ notation, kind, suffixes, insets?, load() }`; `load()` yields an `EditorModule`
  `{ create(options), text?(modeler), relayout?(modeler) }`. An entry's code is loaded once,
  however many nodes show the notation, and a failed load is tried again by the next node.
  `notation` is checked against `meta.notation` of the modeler `create` made; another one is a
  failed editor. `insets` is the room of the notation's own palette in the first fit (default
  `EDITOR_INSETS`: 64 px at the top, 24 px at the other sides).
- **The text rules.** `TextRules` is one object per mounted modeler: `exported(reconciled)` is
  the text to write for the canvas as it is, given the text the file has (a notation keeps a
  file's comments and order there); `same(text, reconciled)` says that a text draws what the
  canvas shows, so it is not imported and the editor keeps its history; `imported()` runs after
  an accepted import and before the view is put back. Without `text` the modeler's own export is
  written and two texts are the same when their bytes are. `same` may throw for a text it cannot
  read: that counts as not the same, and the import says what is wrong. `text(modeler)` is
  called once per mounted modeler, `exported` once per change event and only after the first
  text was accepted.
- **The binding (`bindTextSession`).** Imports run one after the other and read the session's
  text when they start, so the canvas always ends on what the file has: a text that waited
  behind a gesture or behind another import is not imported over what this session wrote
  meanwhile. A re-import keeps the view: the view state the contract answers, while the picture
  is drawn anew and its scale may come out rounded (Value Chain's first fit drew 0.759596, the
  re-import 0.76). A change on the canvas is one write, and none when the
  text did not change, before the first text was accepted, while the last text was refused, or
  into a read-only file. A change from outside waits for the end of a gesture the person holds
  (`interaction`). A host with another kind of document passes its own `BindModel` to
  `embedModeler`; the adapter fits on the first `{ kind: "ok" }` such a binding reports.
- **A limit of every text host.** A change from outside that arrives while a person holds a
  gesture is overwritten by that gesture's drop: the write is made from the text the canvas was
  last reconciled with. The contract asks for a merge there, and the board has no text merge.
- **What the adapter writes** on the `.board-engine` it is given, classes and data attributes
  only: `data-embed="diagram-js"` and `data-notation` once the editor is mounted,
  `data-embed-state` = `loading`, `ready`, `invalid`, `gone` or `failed` from the first moment,
  and two children, `div.board-host-state` (what the node says about its file) and
  `div.board-host-editor` (the modeler's host element: absolute, inset 0, clipped, a stacking
  context of its own). It sets no position and no size on the element, and takes everything back
  on destroy.
- **The states.** `loading`: the code or the text is on its way; the board has no loading look,
  so the facade says it in the element. `ready`: the canvas shows the file. `invalid`: the
  modeler refused the file's text; the last canvas stays in sight under a line whose `title` is
  the modeler's reason, nothing is written, and the next valid text is imported. `gone`: the
  file went away; the board keeps the node, and the file's next text brings it back. `failed`:
  the editor could not be made (a path outside the repository, a file that is no text, code that
  did not load, another notation), with the message. While the state is `invalid` or `gone` the
  editor is `inert`: a change of such a canvas could not be written and the next text would
  replace it. A file that is not there when the board opens stays `failed` until its node is
  mounted anew: there is no retry. The line of an invalid file reads "This file cannot be shown
  as it is. Open it in its own editor to repair it.", which is advice for a host that has such
  an editor; a host cannot set the line's text.
- **The first fit** is the adapter's, never the modeler's (`create({ fitOnImport: false })`):
  the content centred in the element minus the entry's insets, at most at 100 %, from the
  canvas's layout size. It is made once, for the first text the modeler accepts, also when a
  text before it was refused; every later import keeps the view the person has.
- **The sheet `@miragon/board-host/assets/embed.css`** is loaded by the page beside the board's
  sheet. It has the one preview rule, opt-in by the attribute the adapter writes:
  `.board-engine[data-armed="false"][data-embed="diagram-js"] .djs-container > :not(svg):not(.djs-overlay-container) { display: none !important; }`.
  An editor's chrome lies over its canvas and takes no part in its fit, so it goes without
  keeping its room; an editor a host mounts another way is not reached. The sheet names
  diagram-js and no renderer, and it reads the page's roles (`--cd-ui-plot`, `--cd-ui-text`,
  `--cd-ui-text-leise`, `--cd-ui-danger-flaeche`, `--cd-ui-warning-flaeche`) and no colour
  literal. The state line lies over the editor whatever z-index the editor's chrome has: the
  editor's host element isolates its own stacking.
- **Release and focus.** `release()` leaves nothing selected, open or focused below the element:
  an Escape `keyup` on the document, a click on `.djs-container > svg`, a blur of what has the
  focus inside, and the text selection inside removed. It touches neither the focus nor the
  selected text outside the element. `focus()` calls the notation's `relayout` first and then
  gives the canvas the keys; the element has no box of its own at that moment (see
  [What is left with the host](#what-is-left-with-the-host)), so a `relayout` that measures
  defers itself by a microtask.
- **`containHistoryKeys`** (a host that owns the document's history, VS Code): Control or
  Command with Z or Y from inside an armed editor never reaches the window. The listener is on
  the document, as the last stop before the window, because Wardley Maps and Team Topologies
  take their undo in a listener on the document; on the element it would keep the key from
  them. A test holds that the editor still undoes.
- **The host from files.** `createFilesHost({ files, editors })` gives the board `models` and
  `images` and keeps them the same objects; `dispose()` ends what it listens to on the port and
  leaves the port to its owner. The model list is the port's paths with a registered suffix, the
  same array until the port has a new list. `describe(path)`: the kind is the entry's, the title
  is the file name without the matched suffix, `<name> in <folder>` where two listed files share
  the name, and with the suffix kept where they also share the folder (the example's
  `sample.tt` and `sample.cm` are titled "sample.tt in models" and "sample.cm in models").
  `open()` answers undefined for a path without an entry, a `.board` among them. A file that
  moves is followed with `context.relocate`: one change of the board per node that shows it.
- **The images.** `read(path)` loads the bytes when a node first asks and hands out the same
  Blob until `onChange`; a changed image keeps its old Blob until the new bytes are there; an
  image that goes is told. `taken(path)` answers from the port's list, loaded or not. `store` is
  there only where the port can create a file; it has the bytes at hand before it tells, so the
  node that is written next draws at once, and it passes the port's refusal on (a path in use, a
  path outside the repository, a path outside `assets/`).
- **Tried against the tests:** about a hundred single-statement changes of the sources, applied
  by a Vite plugin in a scratch config so that no file of the tree changed. Eleven passed at
  first and are each held by a test since; one, the state attribute written under another name,
  did not finish inside its 300 s limit and has no result.

## The suite's editors (`apps/editors`)

`board-suite-editors` is the one workspace of the board that imports another modeler, and
`packages-no-other-modeler` keeps it so (the open decision is under [Packages](#packages)).

- **The registry.** `SUITE_EDITORS` has one entry per notation, in the order of
  `SUITE_SUFFIXES`: wardley (`.wmap`, `.owm`), event-storming (`.storm`), team-topologies (`.tt`,
  `.ttm.json`), context-maps (`.cm`, `.cm.json`), value-chain (`.vc`, `.vc.json`), c4 (`.c4`),
  business-model-canvas (`.bmc`). `notation` is the renderer's `meta.notation`. C4's `.dsl` and
  the `.png` editors are left out until it is decided whether a board shows them;
  `suffixes.sync.test.ts` holds the table against the `customEditors` of the seven extension
  manifests, so a suffix a modeler adds fails there. Each `load()` is a literal dynamic import of
  `src/notations/<notation>.ts`, so a bundler makes a chunk per notation and a board without a
  Wardley map never loads the Wardley renderer. C4 and Business Model Canvas carry insets of 24,
  24, 24 and 80 px at the left, where their palette is a column; the others take the host's
  default with 64 px at the top. The left inset is a choice seen in two screenshots, not a
  measurement.
- **The declared face.** The workspace's `.` export has a `types` condition, the hand-written
  `index.d.ts`, before its source. The board's strict project and the apps read the declaration
  and never follow into another modeler's source under their own flags (checked:
  `tsc -p tsconfig.json --listFiles` names no file of another modeler); a bundler takes
  `src/registry.ts`. `apps/editors` has its own tsconfig with the weakest renderer's flags and
  one path per entry of `build/aliases.mjs` (`aliases.sync.test.ts`), and
  `npx tsc -p apps/editors/tsconfig.json` (`npm run typecheck -w apps/editors`, in the
  board's `typecheck` chain) is the one check of the notation modules against the other
  modelers' sources and of the declaration against the registry. No other modeler has to be
  built for it. The condition covers `.` only: `./base` is read as source, so an app that
  imports it declares `*.css` and `*.css?base` among its own modules (`apps/webapp/src/css.d.ts`
  does).
- **A notation module** exports `create` (the renderer's `createCollaborativeModeler`), `text`
  (the notation's text rules) and, for C4, `relayout`, and imports the renderer's sheet by name.
  The rules are each modeler's own, as its ide-editor (C4: its webview) has them, written again
  on the packages' public exports and not imported from the other modelers' apps: a change of a
  modeler's rule there has to be made here as well. Wardley Maps patches the file's own text
  (`patchDSL` with the map the text was last written from), so comments and the order of the
  lines stay. Value Chain and Business Model Canvas hand back the file's own text while the
  canvas shows the same model. Team Topologies, Context Maps and Event Storming write what the
  modeler exports, so the first edit of a file that is not in the modeler's canonical form also
  writes whatever the two forms differ in. For the example files a review measured how much that
  is: the first edit of `sample.cm` differs from the file by the edit and one newline at its
  end, that of `order-checkout.storm` by the edit and two blank lines that are dropped (4
  changed lines of 24), and `sample.tt` keeps its formatting and order. Event Storming also
  writes references anew when an element is renamed or removed (`#agg_order` as `Order`): the
  modeler's own rules, written as they are. C4 hands back its text byte for byte and takes a
  text that differs only in formatting or comments with `rebaseText`, which empties its history.
- **The build helpers (`build/`)**, for Vite, Vitest and, in the next increment, esbuild.
  `aliases.mjs` reads the folders under `modelers/*/packages` and maps each package name to its
  `src/index.ts`, every exported subpath of a package before the package (39 entries over 27
  packages), so that no other modeler is built first. `prebundle.mjs` names every third-party
  module those sources load (82), for `optimizeDeps.include`: a dependency Vite meets only when
  a notation loads would reload the page in the middle of a run or of an edit. `css-base.mjs` is
  under [Stylesheet and theme files](#stylesheet-and-theme-files). A new package under any
  modeler's `packages/` adds an alias, and `apps/editors/tsconfig.json` then needs the matching
  path, or `aliases.sync.test.ts` fails for a change made in another modeler.
- **Without a test:** a notation's first fit at any size but 800 x 508 and 420 x 508; the left
  inset of C4 and Business Model Canvas against a narrow node; a label editor, a popup or a held
  drag open at Done or at a zoom; an edit by the palette or the context pad; a change from outside
  while armed for any notation but Value Chain, and a text from outside that the modeler refuses; a
  second node on one file for any notation but Wardley Maps, and an edit in the second that the
  first follows; a moved file that two nodes show; more than seven model nodes on one board; a
  device pixel ratio other than 1; any browser but Chromium; touch. The text rules run on the real
  renderers only for the write of a delete (all seven) and of a move (Wardley);
  `text-rules.test.ts` runs them in Node on stand-in modelers with each notation's real parser and
  serialiser, since no renderer of the suite mounts outside a browser.
- **Run once by a review, with Playwright and not as kept tests**, and each held: a label editor
  that is open at Done commits and is written, for all seven; two Wardley nodes on one file follow
  each other in both directions, and Control + Z in the armed one undoes in both; a change from
  outside while C4 is armed is imported with the view kept and nothing written back; a text from
  outside that C4 refuses shows the line with C4's reason, leaves the last canvas, takes no input
  and writes nothing, and the next valid text repairs it; a moved file that two nodes show is two
  changes of the board; the previews and the arming at a device pixel ratio of 1.25 and 2.

## The web app and the example (`apps/webapp`, `example/`, `e2e/`)

The web app shows `modelers/board/example` as a repository in memory. It mounts no shell and has
no menu and no drop zone of its own: the board's toolbar is its only chrome. It keeps the board
and the changed files in the browser's local storage; there is no disk behind it.

- **`startApp(root, { storage, search })`** (`src/app.ts`; `src/main.ts` calls it with
  `window.localStorage`, or a store in memory where the browser blocks its own, and
  `location.search`). It gives `root` the class `board-page` and two children:
  `div.board-page__board`, which the board is attached to, and `footer.board-page__note` with
  one status line (`.board-page__kept`, `role="status"`; `data-warning` on the footer) and the
  link "Reset the example" (`href="?reset"`, a plain navigation). It builds
  `createMemoryBackend` from the example and what is kept, wraps it (`src/keeping.ts`) so that
  every write the backend took and every new file is kept, then `connectBackend`,
  `createFilesHost({ files, editors: SUITE_EDITORS })` and `createCollaborativeModeler({ host })`,
  imports the kept board text or the example's, and keeps the board text on every
  `onContentChanged`. It returns `{ modeler, ready, destroy() }`.
- **The sheets** are imported by name in `src/app.ts`, in this order:
  `@miragon/board-renderer/assets/board.css`, `board-suite-editors/base` (diagram-js's sheet and
  the canvas mapping once, then the host package's `embed.css`), `./page.css`. Each renderer's
  own sheet comes with the chunk of its notation. `page.css` makes `html`, `body` and
  `.board-page` a column that fills the window, the board above the one line. Nothing above the
  board carries a transform, a filter, a perspective, `contain` or `will-change`, and a test
  walks the ancestors. `index.html` has `data-cd-theme="light"` on `<html>`.
- **Storage (`src/storage.ts`).** Keys `miragon-board-example:board`,
  `miragon-board-example:text:<path>` and `miragon-board-example:bytes:<path>` (JSON
  `{ mime, base64 }`). The example's own text is kept by removing the key, so a change that was
  undone leaves nothing behind. A kept entry that fits no file of the example is left out: a text
  for a path the example does not have, bytes outside `assets/<name>` or over a file of the
  example, a value of another shape. A kept board text the board refuses is answered with the
  example and the line "The board kept in this browser could not be read. This is the example.";
  the kept text stays until the first gesture replaces it. `?reset` in the address forgets every
  key of the prefix before the app starts, and `main.ts` then takes it out of the address. Two tabs
  on one storage are not told apart: the last write wins.
- **Pictures and the room of the storage.** A picture is kept when it is stored, and its node may
  go a moment later. Within one life of the page an undo brings the node back, so the bytes stay;
  at the next start the app forgets every kept picture that no image node of the kept board shows
  (`picturesOf`, `forgetPictures`; a kept text that is no board forgets nothing). Before that the
  storage only grew: a review picked a picture twice and removed its node twice, and both files
  were still kept after a reload, for a board that showed neither, with the reset as the one way to
  free them. A storage that throws never stops the app: the save answers false and the line reads
  "This browser did not keep all of your changes: its storage is blocked or full." for the rest of
  the page's life, whatever a later save does. A picture the browser had no room for is drawn until
  the page goes; after a reload its node shows the missing-file figure and the line reads "A
  picture of this board is missing: this browser did not keep it.", until that node is removed. The
  room is the browser's and the app names no number: in Chromium a review saw a PNG of 4.3 MiB
  drawn and not kept, about 3.7 MB of pictures for one site.
- **The example (`src/example.ts`)** is the folder through `import.meta.glob`: `example.board`
  and `models/**` as `?raw` text, `assets/**/*.svg` as `?raw` text encoded to bytes with the
  type `image/svg+xml`. Vite has no import of a file's bytes, and its `?inline` of an SVG is a
  rewritten data URL: a picture of another type needs a glob of its own, and `example.test.ts`
  fails for a file no glob reads. `example.board` is canonical and holds seven model nodes of
  800 x 540 in two rows, a group "Start here" with the picture and two notes, and an arrow from
  the second note to the Value Chain. `models/` holds copies of the seven modelers' example
  files, made with `cp` and never edited (no kept test compares them with their originals,
  which would fail the board's tests when another modeler edits its example), and
  `assets/miragon-komet-blau.svg` is a copy from `docs/public/logo`. Whoever changes the example
  writes canonical bytes: `example.test.ts` compares the file with
  `encodeBoard(parseBoardText(text))`.
- **The build check.** `npm run check:build -w modelers/board/apps/webapp` after the build runs
  `scripts/build-problems.mjs` on `dist`. The build writes one sheet that `index.html` links and
  one sheet per notation. The check fails unless `<html>` has `data-cd-theme="light"`; the
  linked sheet carries a `.board-root` rule and the preview rule on
  `.board-engine[data-armed=false][data-embed=diagram-js]`; diagram-js's base rule
  `.djs-context-pad.open{display:block}` is in the linked sheet exactly once and in no
  notation's sheet; each of the seven renderer root classes is in some sheet and none comes
  before the first `.djs-context-pad.open`; and the scripts keep the legal comment of
  `lucide-react` and the icon-geometry comments of the Wardley Maps, Context Maps, Value Chain,
  C4 and Business Model Canvas renderers (Event Storming and Team Topologies have none in their
  sources).
- **The e2e project.** `e2e/playwright.config.ts` has one project, `webapp`
  (`**/webapp/**/*.spec.ts`, base URL `http://localhost:5184`, `E2E_PORT` overrides), and starts
  `npm run dev -w apps/webapp -- --port 5184 --strictPort`. Outside CI it takes whatever answers
  on that port for the app. Port 5194 is reserved for the project `vscode-webview`.
- **`destroy()` is synchronous** and ends the host and the files in the call that ends the
  board. The board unmounts its editors a microtask later (see
  [The public API](#the-public-api)), so a write an editor makes while it is released or
  destroyed, a label editor that commits on the blur for instance, goes into a port that is
  already disposed and is dropped without a word. By reading, not run. Nothing in the page
  calls `destroy()`; the tests do.
- **Without a test of the web app itself:** a pasted or a dropped picture (a picked one is held;
  paste and drop are held on the renderer's test host), a group or an arrow made by hand, Done and
  a zoom of the board as the end of an edit (both held for the seven modelers in `apps/editors` and
  on the stand-in in `packages/host`), and a second node on the same file (held for Wardley Maps in
  `apps/editors` and on the stand-in). A review did each of them once in the served page with
  Playwright's mouse and keyboard, a dropped picture excepted, and each worked: a pasted picture
  (`assets/image.png`, drawn and kept), an empty group, an arrow drawn from a handle (one new line
  of the board), the toolbar's zoom-out and a Control + wheel on the pane as the end of an edit for
  all seven, a second node on `models/tea.owm` that follows the first and is followed by it, and a
  reload that keeps all of it.
- **In a window narrower than a model node the armed editor is cut.** A model is edited at board
  zoom exactly 1 (the arm rules), where a node of 800 px does not fit. At 400 x 800 the review
  found the armed Wardley node at left -327 px, the left half of the editor and of its palette off
  the window; at 760 x 600 at left -64 px, with its header under the board's toolbar. A pan of the
  board reaches the rest, and a delete and Done work in both. Arming at the fitted zoom where a
  node does not fit is a change of the measured arm rules and the owner's.
- **A file its modeler refuses** shows the host package's line, which tells the person to open the
  file in its own editor. The web app has none: there only "Reset the example" brings the file
  back, and it forgets every other change with it. The app itself writes no such text; the review
  got there by writing the storage by hand, and found that Wardley Maps and Event Storming take
  the same garbage for an empty canvas in the state `ready`.
- **The notices the build lacks.** The built C4 chunk carries dagre's line "For license information
  please see dagre.esm.js.LEGAL.txt", and the build holds no such file (it is in
  `node_modules/@dagrejs/dagre/dist`, MIT). The built sheet drops Tailwind's notice (see
  [Stylesheet and theme files](#stylesheet-and-theme-files)), and the font files of Geist come
  without the OFL's text. `check:build` looks for none of the three and prints "6 licence comments
  kept". They belong to the notices file that is still to come, and the check should then fail for
  a script that names a licence file the build does not hold.
- **Not known for it:** more than a handful of model nodes at once, any browser but Chromium, and
  touch.

## The first increment of the apps against its plan

The apps are built after a plan, increment by increment. Where the tree differs from the plan
of increment 1, and why:

- **The alias list** maps every exported subpath of a package before the package, not only a
  renderer's sheet: with string aliases `@miragon/board-host/assets/embed.css` would otherwise
  be read as a file below `packages/host/src/index.ts`. It has 39 entries, and
  `apps/editors/tsconfig.json` the same 39 paths, where the plan counted 22.
- **A third dependency rule**, `packages-no-apps`, beside the two the plan asked for; and
  `packages-no-other-modeler` covers every app but `apps/editors`, tests included.
- **`commands.realInput` has no wait**, which the prototypes had: a test polls after the call.
  It has `wheel`, `keydown`, `keyup` and `text` in addition.
- **The files server** hands a place the writes of one path one at a time and answers a refused
  write once the last write of that path settled; a second hello starts the page's life anew; a
  hello of another protocol is none; a backend read that rejects is answered with
  `board.failed`. The plan fixed the messages, which are unchanged, and said none of this. The
  prototype it started from had nine defects that the plan's own test list brought up, each
  repaired under a test.
- **The binding reads the file's text when an import starts**, not the text that came with the
  change event; the first fit is made on the first accepted text, not once the first import
  settled; no write is made before the first text was accepted. Each repairs a defect of the
  prototype.
- **New behaviour the plan did not have:** while a node's state is `invalid` or `gone` its
  editor is `inert`.
- **The text rules are each modeler's own**, as its ide-editor has them. So only Value Chain and
  Business Model Canvas hand back the file's own text for the same canvas; the plan's sentence
  "the JSON notations hand back the file's own text" holds for Value Chain alone.
- **C4's `relayout` runs a microtask after `focus()`**, where the plan has it in `focus()`.
- **Two sheet test files** where the plan names one: a page keeps every sheet it loaded, so each
  load order needs a page of its own.
- **The web app** attaches the board to a child of `#app`, with the line below it in the page's
  flow, so that nothing of the page lies over an armed editor; `startApp` takes `search` and
  does the reset itself; the reset link is a plain navigation; the picture is read as text and
  encoded; the build check is two files with a unit test and reads eight sheets, not one.
- **Made by the integration:** the exclusion of the apps' build output from the cruise;
  `src/keeping.ts`, cut out of `app.ts` so that the wrapper has a unit test, with the memory
  backend's log emptied after every write; `apps/editors/test/cruise-rules.test.ts`; the filter for
  Chromium's ResizeObserver line in the renderer's tests (`test/support/console-complaints.ts`, see
  the test README) and in the watch of `apps/editors`, with a test of each; the limit of 90 s for a
  test or a hook that loads the seven renderers first; and the kept order of the web app's one
  story in a shuffled run.
- **Made after the review:** the second pattern of `packages-no-other-modeler` and the rule
  `host-no-editor-libraries`; in the files package the control characters `repoPath` refuses, the
  names a new file may not have, `NEW_FILE_LIMIT_BYTES`, bytes that must be a base64 text and a
  request id that must be a whole number; in the web app the pictures forgotten at the start, the
  line for a picture that was not kept, and the wording of the line after a refused save (it read
  "does not keep your changes" while a later change was kept); in the battery of `apps/editors` the
  wheel as the end of an edit for all seven, the second node on the Wardley file and the change
  from outside under an armed Value Chain. The messages of the protocol and the declared exports
  are as the plan has them; `NEW_FILE_LIMIT_BYTES` is one export more.

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
  The web app's built sheet does not keep that notice (`grep -c tailwindcss dist/assets/index-*.css`
  prints 0: Vite's CSS minifier drops the comment), and the web app has no notices file yet.
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

## Tests

[`packages/renderer/test/README.md`](packages/renderer/test/README.md) says what each test file
holds, how the arming traces are recorded anew, how the conformance harness is built, and what a
browser test of the board has to know (synthetic input, the lazy parts, the module-level state,
the window). Read it before you write a test. Here are the two projects and the rules.

- `npm run board test` (project `unit`, Node) runs `packages/*/test/**/*.test.ts` and
  `apps/*/test/**/*.test.ts` without the `test/browser` folders: 38 files, 734 tests.
  - The schema model and the renderer (16 files, 290 tests): the format, the order keys and the
    view (`packages/schema-model/test/`); the store, the actions, the arm rules, the board file
    at rest, under a Git merge and under two peers on one live document; and of the canvas side
    what needs no browser: how the board reads a host (`host-defaults`), the parts of the
    contract factory (`collaborative-parts`), the two sheets (`theme.sync`, `styles.scope`), the
    reach of the dependency rule (`layers`), the one copy of each shared library
    (`single-copy`), the arming fixture as a file (`arming-fixture`).
  - `packages/files/test` (5 files, 247 tests): the path rules (`paths`), each side of the
    protocol alone, message by message, against a page that posts whatever it likes and against
    a scripted host (`protocol`), client and server together on a memory backend with more than
    one reader on a path (`fan-out`), the memory backend alone (`memory`) and `connectBackend`
    over a real `MessageChannel` (`local`). `test/support/wire.ts` is the channel in memory they
    share: it copies each message and delivers it later, in order.
  - `packages/host/test` (6 files, 65 tests): the fit, the binding on a session double, the
    registry's load, the model list and `describe`, the images, the host's parts, and the files
    server's limit for a new file against the board's limit for a picture.
    [`packages/host/test/README.md`](packages/host/test/README.md) says what each file holds.
  - `apps/editors/test` (7 files, 75 tests): `suffixes.sync` (the table against the manifests,
    the registry against the table and against `index.d.ts`), `aliases.sync`, `base.sync`,
    `text-rules`, `zod-jitless`, `build-helpers` (two of its tests are Vite builds in memory) and
    `cruise-rules`.
  - `apps/webapp/test` (4 files, 57 tests): `storage` (what is kept, what is left out, a storage
    that refuses, the reset, the pictures a board shows and the kept ones it does not), `keeping` (the repository in memory with its writes kept),
    `example` (the board is canonical, one model per notation, every named file is in the
    folder, the app reads the folder's bytes) and `check-build` (a whole build and one build per
    missing part).
- `npm run board test:browser` (project `browser`, Chromium, a window of 1280 x 800) runs
  `packages/renderer/test/browser`, `packages/host/test/browser` and `apps/*/test/browser`, each
  `**/*.test.{ts,tsx}`: 23 files, 784 tests. React Flow measures its nodes, so nothing of the
  canvas runs in jsdom or Node, and no diagram-js renderer mounts there either (Business Model
  Canvas's import throws `activeLayer.getBBox is not a function` under jsdom).
  - The renderer's fifteen files (661 tests): the arm rules on a bench of fakes (`arming`), the
    sheet on static markup (`styles`), React Flow's store (`react-flow-internals`), the
    contract's kit (`conformance`), and boards mounted through the entry (`toolchain`, `canvas`,
    `canvas-behaviour`, `chrome`, `nodes`, `images`, `overlay-surface`, `hostile-host`,
    `contract-edges`, `embedded-model`, `live-document`).
  - `packages/host/test/browser` (3 files, 57 tests): `embed` (the adapter alone in an element
    the test sizes, scales and arms), `files-host` (the real board on `createFilesHost` over
    `connectBackend(createMemoryBackend(...))`) and `real-input` (the command itself). The
    editor in them is a stand-in modeler of the contract (`test/support/stand-in-modeler.ts`),
    which draws real boxes that take real input; no test of the package imports a renderer of
    the suite.
  - `apps/editors/test/browser` (4 files, 53 tests): `real-editors` (the battery under
    [Real editors, as measured](#real-editors-as-measured)), the two sheet files and
    `page-errors` (the watch itself). Its `support/` folder has `mountBoard` (a board on a
    memory backend with the registry), `mountAlone`, `shownChrome`, `shownView` and
    `watchPageErrors`, which a later browser test may import by relative path.
  - `apps/webapp/test/browser/app.browser.test.ts` (13 tests): `startApp` on a store of the
    test's own; the example shown, a model added from the picker, a Wardley component deleted
    by a real double-click, click and key, a note by the Text button, a picked picture, a second
    start on the same store, `?reset`, a storage that refuses, a picture the browser did not
    keep, a kept picture no node shows, an unreadable kept board, `destroy()`. The five tests
    under "what a person changes" are one story on one store, each going on where the one before
    it ended, and keep their order in a shuffled run (`{ shuffle: false }`): shuffled, the file
    failed 7 of its tests.
- Both projects take the other modelers from their sources through
  `apps/editors/build/aliases.mjs`, so no other modeler is built first, and the browser project
  pre-bundles what `apps/editors/build/prebundle.mjs` reads from those sources.
  `vitest.config.ts` exports the browser project as `browserProject`.
- `npm run board test:e2e` (Playwright, `e2e/tests/webapp/board.spec.ts`, 2 tests): the page
  opens with seven engines ready, the seven kinds in the node headers, the picture drawn and no
  page error; a note is there after a reload, and the reset link brings the example back.

**Real input.** `commands.realInput(ops)` (`test-support/real-input.ts`, registered by
`vitest.config.ts`) sends real mouse and keyboard input through Playwright: `move`, `down`,
`up`, `click`, `dblclick`, `wheel`, `press`, `keydown`, `keyup`, `text`, with `x` and `y` in
client px of the test's window. A synthetic event ignores `inert`, hit testing and the focus, so
a test of a preview or of an armed editor's pointer math uses the command. It has no wait: after
the call a test polls. What a browser test with real editors has to know beyond the renderer's
README: the first test or hook of a page that loads the seven renderers from their sources takes
`LOAD_MS` (90 s, `apps/editors/test/browser/support/board.ts`) as its limit, since under
Vitest's own limits (15 s for a test, 30 s for a hook) the two sheet files timed out in 3 of 9
runs with three whole runs at once, a load average over 30 on 12 cores, and in 0 of 24 with the
limit; `expect.poll` may not be called in a hook, so a board that is mounted in `beforeAll`
waits with `vi.waitFor`; Done leaves the board at 100 %, where the editing took it, so a test
that needs a preview at another zoom sets the view itself; `document.elementFromPoint` skips an
inert preview, so a shape of a preview is found by its rectangle; a page keeps every sheet it
loaded, so a test of another load order is a file of its own; a screenshot can only be written
inside the workspace (a failed browser test writes its own to
`modelers/board/.vitest/attachments`, which the board's `.gitignore` ignores); Context Maps hides
an open context pad that has no entry; and in a test, a `new URL(...)` whose first argument is a
template string (``new URL(`../${path}`, import.meta.url)``) is rewritten by Vite's asset
handling into a path that ends in `undefined`: use `fileURLToPath(new URL("../", import.meta.url))`
and `join`.

**Chromium's ResizeObserver line** ("ResizeObserver loop completed with undelivered
notifications.") is no error of a page. Every watch of a page's errors leaves out exactly that
message: `complaintsOf` of the renderer's test support, `window-errors.ts` of `packages/host`,
`page-errors.ts` of `apps/editors`, the web app's browser file and the e2e spec. The renderer's
test README has what was measured.

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
  `test` · `depcruise` · `format` · `format:check`. The type check is a chain: the board's
  strict project (`tsconfig.json`: the packages, the web app's sources and tests, the test
  support), `apps/webapp/tsconfig.config.json` (the Vite config), `apps/editors` under its own
  weaker flags, and `e2e`.
- `npm run board dev:webapp`, then http://localhost:5184 (the port is strict). The dev server
  writes `apps/webapp/node_modules/.vite`.
- `npm run board build:webapp`, then `npm run check:build -w modelers/board/apps/webapp`.
- `npm run board test:browser`: the committed browser project. The root's `npm run test:browser`
  runs it with every other modeler's.
- `npm run board test:e2e`: the committed Playwright config, which starts the dev server
  itself. Flags go to the workspace: `npm run test:e2e -w modelers/board/e2e -- --project=webapp`.
- `sha256sum -c .miragon/brand-assets.sha256` from the root: the vendored theme files.
- Not there yet: every script of the extension (`build:vscode`, `package:vscode`, `test:vscode`,
  `test:vscode:docker`, `dev:vscode`).

**Where Chromium must not run without its sandbox** (the Miragon agent VM is such a machine):
Playwright's default launch passes `--no-sandbox` there, so `npm run board test:browser`,
`vitest --project=browser` and `npm run board test:e2e` are never run on it, and neither is
Chromium with `--no-sandbox`. Browser tests run only through two local configs, which are never
committed: add `modelers/*/vitest.sandbox.config.ts` and
`modelers/*/e2e/playwright.sandbox.config.ts` to your own `.git/info/exclude`, which no clone
brings along. Prettier does not read that file, so `npm run board format:check` checks both:
keep them formatted.

`modelers/board/vitest.sandbox.config.ts` spreads the exported browser project and replaces the
provider alone, so the two run the same files with the same aliases, pre-bundle list, window and
commands:

```ts
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { browserProject } from "./vitest.config.ts";

const cacheDir = process.env.BOARD_VITE_CACHE;

export default defineConfig({
  ...browserProject,
  ...(cacheDir ? { cacheDir } : {}),
  test: {
    ...browserProject.test,
    browser: {
      ...browserProject.test?.browser,
      provider: playwright({ launchOptions: { chromiumSandbox: true } }),
    },
  },
});
```

```sh
cd modelers/board
BOARD_VITE_CACHE=<a folder of your own>/node_modules/.vite-board \
  npx vitest run --config vitest.sandbox.config.ts <test files>
```

`modelers/board/e2e/playwright.sandbox.config.ts` spreads the committed `playwright.config.ts`
and sets `launchOptions.chromiumSandbox` in `use` and in every project, because a project's own
`launchOptions` replace the shared ones whole:

```ts
import { defineConfig } from "@playwright/test";
import committed from "./playwright.config.ts";

type Use = NonNullable<typeof committed.use>;

const sandboxed = (use: Use | undefined): Use => ({
  ...use,
  launchOptions: { ...use?.launchOptions, chromiumSandbox: true },
});

export default defineConfig({
  ...committed,
  use: sandboxed(committed.use),
  projects: (committed.projects ?? []).map((project) => ({
    ...project,
    use: sandboxed(project.use),
  })),
});
```

```sh
cd modelers/board/e2e
npx playwright test --config playwright.sandbox.config.ts --project=webapp
```

Playwright Test starts that way on the agent VM, with the `webServer` entry too.

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
- For a host of files: a retry for a model whose file is not there when the board opens (the
  facade could try again when the port's list gains the path), a version or an acknowledgement
  in the files protocol, a flush on the port, an end of the web app that waits for the board's
  editors, a server that serves only what its backend lists or refuses dot folders (the open
  decision under [The files port](#the-files-port-packagesfiles)), a text of the host's own for
  the line of an invalid file, and the web app's notices file.
- The apps of the later increments: the board inside the shell (`apps/ide-editor`), the VS Code
  extension, a folder of the person's own behind the web app, arrows derived from model
  references (`host.references`), and what a bare renderer in a node does not offer: by the
  plan's reading of the modelers' apps, not tried here, a Business Model Canvas title or notes,
  C4's inspector and views dialog, and any menu or export of a hosted modeler.
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

**Found while the apps were built, and not changed.** In the renderer, in the suite's tooling
and in other modelers; each is its owner's to decide.

- **`focus()` before the box** ([What is left with the host](#what-is-left-with-the-host)). The
  cure in the renderer is to write the box before the call in `placeHost`, a change of the
  measured order.
- **`EmbeddedEditor.ready`.** The JSDoc of `host/types.ts` does not say that the board reads it
  only for a node that is still there (`surface/overlay-surface.tsx` attaches its handlers after
  the `cancelled` check). A host whose `ready` rejects for a node that went meanwhile gets an
  unhandled rejection unless it marks the promise handled, as the host package's facade does.
- **`relocate` is one amend per node**: a moved file that two nodes show is two changes of the
  board (run once by a review with two nodes on the real renderers, in scratch; the kept test
  holds one change for one node).
- **The preset rule `dom-free-no-renderer`** (`tooling/dependency-cruiser.cjs`) matches relative
  imports into `packages/renderer/src` only. An import of `@miragon/board-renderer` by name from
  a DOM-free package is caught for `files` by the board's own rule and for `schema-model` by
  nothing. A root file.
- **Event Storming**, seen once in an exploratory run and not followed up: after a real Delete of
  a sticky and Control + Z, `exportText()` was not the text from before the delete, and
  `elements.list()` named the restored sticky last. In a board an undo after a delete would
  leave the file with another line order.
- **Business Model Canvas**, seen once: a real drag that drops a sticky where it was fires
  `onContentChanged` while `exportText()` is unchanged. The binding absorbs it: nothing is
  written.
- **C4**, the bare renderer in a narrow box: the breadcrumb bar stands at left 12 px, top 64 px
  and lies over the palette column, alone and in a board alike (measured at 420 px).
- **The example files of Context Maps and Event Storming** (`example/sample.cm`,
  `example/order-checkout.storm` of those modelers) are not in their modeler's canonical form:
  right after `importText(example)`, `exportText()` is another text. Their own editors write
  the export, so the first edit of such a file in a board also writes that difference: one
  newline at the end of `sample.cm`, two dropped blank lines in `order-checkout.storm`.
- **Vitest keeps transformed modules on disk** under the root's `node_modules/.vitest-cache`,
  keyed by the plugins' names and not their options: two runs with a plugin of one name and
  different options answer for each other. The tree's own configs have no such plugin.

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
