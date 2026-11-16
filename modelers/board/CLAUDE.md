# CLAUDE.md

TypeScript modeler for the board: a canvas of a repository's own files. Models are shown and edited
in place, each by an editor the host hands in and each saved in its own file, next to notes,
images, groups and arrows. The board stores where a file sits, never what is in it. The file is a
`.board` text, one JSON line per element. Unlike every other modeler of the suite its canvas is
[React Flow](https://github.com/xyflow/xyflow) (`@xyflow/react`, MIT) on React, not diagram-js: it
lays out HTML nodes that hold whole editors.

**Work in progress.** The board was built and measured in designIQ (`apps/web/src/notations/board`
there, at commit `ce12684`), and its canvas was moved here as it was measured. The move is done and
was reviewed. Of the apps around the board four increments are in the tree: a web app on an example
repository, a VS Code extension whose smoke passes in a real VS Code inside the suite's Docker
runner, what the suite's CI asks of a modeler, and daily use in VS Code, which was walked through in
a real VS Code in that runner and not yet by a person. Nothing of the board is published, the
suite's releases hold it back, and no pull request is open. [State of the port](#state-of-the-port)
says what is in the tree and what is still to come; [`docs/state.md`](docs/state.md) says what was
run on it, what a merge publishes and what holds the board back.

This modeler is `modelers/board` in the Miragon modeler suite. The suite's
[`CLAUDE.md`](../../CLAUDE.md) holds the rules for every modeler (setup, commands, commits and
signing, exact pins, releases, the design system, the contract and shell boundaries); this file
adds what is special to the board and names where the board deviates from them. Run its scripts
from the repository root as `npm run board <script>`, or as `npm run <script>` inside
`modelers/board`, after `npm run build:shared`: the board reads the contract's `dist`.

## The parts and their documents

This file and the documents under [`docs/`](docs/) are the board's guide. This file keeps what
every change needs: the state, the packages and their boundaries, the format, the public API, the
rule of the port, the DOM contract, the tests and the commands in short, what is deferred and the
conventions. What belongs to one part is in that part's document, moved there as it was written:

| Part                                                                                                                                                                                                                                         | Document                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| The renderer beyond what every change needs (`packages/renderer`): the layout of its sources, what is left with the host, real editors as measured, the stylesheet and theme files                                                           | [`docs/renderer.md`](docs/renderer.md)       |
| The files port (`packages/files`)                                                                                                                                                                                                            | [`docs/files.md`](docs/files.md)             |
| The host package (`packages/host`)                                                                                                                                                                                                           | [`docs/host.md`](docs/host.md)               |
| The suite's editors and the third-party notices of a build (`apps/editors`)                                                                                                                                                                  | [`docs/editors.md`](docs/editors.md)         |
| The web app and the example (`apps/webapp`, `example/`)                                                                                                                                                                                      | [`docs/webapp.md`](docs/webapp.md)           |
| The board inside the shell (`apps/ide-editor`), with the three deviations under the shell                                                                                                                                                    | [`docs/ide-editor.md`](docs/ide-editor.md)   |
| The VS Code extension (`apps/vscode`): its two halves, the webview test page, the smoke, what was taken for granted about VS Code and how it came out, for daily use as well, saving as measured, and how a walk is run in the Docker runner | [`docs/vscode.md`](docs/vscode.md)           |
| The e2e projects (`e2e`)                                                                                                                                                                                                                     | [`docs/e2e.md`](docs/e2e.md)                 |
| Boards with many models: the bench's numbers at 7, 60 and 200 models, where the time goes, and what they ask for (nothing of it built)                                                                                                       | [`docs/many-models.md`](docs/many-models.md) |
| The four increments of the apps against their plans, their leads' decisions, and what each found and did not change                                                                                                                          | [`docs/increments.md`](docs/increments.md)   |
| The record of the state: what was run, the reviews, CI, what a merge publishes and what holds the board back                                                                                                                                 | [`docs/state.md`](docs/state.md)             |

Write a part's facts into its document. This file gets the state, the counts and a pointer, and a
new part gets a document and a row here. The documents are under `docs/` because Markdown there
runs no job of CI (`classify` in `.github/scripts/ci-paths.sh`), lies in no release component and
goes into no VSIX, no web build and no package. `apps/vscode/README.md` is no such document: it is
the extension's README for a person who installs it, and the VSIX carries it.

## State of the port

In the tree: `schema-model`; the renderer with its document half (`store/`, `host/`,
`arming/arm-rules.ts`, `arming/types.ts`), the canvas, moved from designIQ and cut over to the host
interface (every other folder of `packages/renderer/src`), the contract factory with the options
`host` and `liveDocument`, and the stylesheet on the design system's roles; `CONTRIBUTING.md` and
`.claude/rules/package-json-fixed-versions.md`. With the first increment of the apps:
`packages/files` and `packages/host` (what every host of a board shares), `apps/editors` (the seven
modelers of the suite as the editors of model nodes), `apps/webapp` on the example repository
`example/`, and `e2e/` with the project `webapp`. With the second: `apps/ide-editor` (the board
inside the suite's shell), `apps/vscode` (the extension, a host half in Node and a webview half),
the webview test page `e2e/webview` with the project `vscode-webview`, and a files port that is fit
for a disk (`PROTOCOL` 2). With the third: the web app inside the shell's web column (a start
screen, a board that is made new or opened from a file, the example, the board as a download), the
third-party notices of both builds, written by the build from what it bundled
(`apps/editors/build/notices*.mjs`), the extension's README, CHANGELOG and icon, and in the root the
eight release components, the entry in `PENDING_FIRST_PUBLISH`, the path rule `reaches_board` and
the board's rows and sentences in the suite's documents. With the fourth, daily use in VS Code:
`PROTOCOL` 3 of the files port (a welcome, a file the host shows, a word for a dropped edit, reads
answered together and bounds on what a page asks of a host); in the host package a card for a file
no editor covers, a model that keeps its editor when its file moves, with `followMoves` for the
image nodes, and words in the node for an edit that was dropped; the board's view kept by its host
and restored in the place of the first fit where it still shows the board, and the shortcuts dialog
naming the drop of a picture that reaches the board (in VS Code with Shift held); in the extension a
file followed when a person renames or moves it in VS Code, a file no notation covers opened in VS
Code's own editor, an entry in the Problems view for a board text that cannot be read, the commands
New Empty Board, New Board from Example and Open Source to the Side with a walkthrough, and the
setting `miragon.board.saveModelsWithBoard` (off by default), which makes a person's save of a board
also save the models that board made dirty; and in the root the hold that keeps a release from
publishing anything of the board. No increment changed a file of `packages/renderer/src` or
`packages/schema-model/src`. 77 unit files with 1621 tests, 27 browser files with 951 tests, 36
Playwright tests, and the smoke of the extension in a real VS Code, with steps for daily use. **The
fourth increment was walked through in a real VS Code, in the suite's Docker runner on 1.146.0 and
1.96.0 on Linux, and by no person yet**: of the sixteen things it takes for granted about VS Code
ten were seen as assumed, two differed and changed the index and the fake, and four were seen in
part ([`docs/vscode.md`](docs/vscode.md#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code)).
A review walked it again, and a closing round changed what it found, around an edit that crosses
a rename, what the setting saves, the kept view and what waits for a host
([`docs/vscode.md`](docs/vscode.md#the-review-of-the-fourth-increment-in-a-real-vs-code)).

Read the browser count by what it stands on. 662 tests are the renderer's: 297 run the arm rules on
a bench of fakes (73 scripts, each run once and read by four tests, plus five), 82 hold static
markup under the sheet, 7 a bare React Flow, 73 are the contract's kit, 202 are in the eleven files
that mount a board, and one holds a filter of the test support. Every editor in them is the
recording stand-in of `createTestHost` and every input is synthetic, which ignores `inert`: none of
them can fail when a preview takes real input or when the pointer math of an armed editor is off.
That is held outside the renderer, with real mouse and keyboard input (`commands.realInput`): 140
tests of `packages/host` (8 of the command itself, 132 on a stand-in modeler of the contract that
draws boxes, alone and on the real board), 62 of `apps/editors` (58 with the seven real modelers on
a board, among them a renamed folder that moves all seven and Wardley Maps renamed while it is
armed, 2 for the order of their sheets, 2 for the watch the battery ends every test on), 40 of
`apps/webapp` and 47 of `apps/ide-editor` (the board under the shell's real `mountShell`, in the
IDE column and in the web column).

**The record is in [`docs/state.md`](docs/state.md):** what the review after the move changed,
what was run on this tree and what was not, the reviews of the four increments, what a
first CI run will show, what a merge publishes and what holds a publish of the board back. Where
each increment differs from its plan, what its lead decided and what it found and did not change
is in [`docs/increments.md`](docs/increments.md).

**Still to come:** the owner's own walk with the VSIX, and with it what the walk in the runner did
not reach (a drag from a file manager, the native file dialog, another extension's editor for a
shown file, macOS and Windows); of daily use in VS Code what is not built (a model armed in an
editor narrower than its node, a file below a renamed folder that the list does not hold, a board
that is not open when its files move, the file of a card that moves, the picker leaving links out, a
budget in numbers for the new files of one editor, an undo that leaves a move alone); the owner's answers on the setting's name and
default and on the hold; one chrome, the end of the [three
deviations](docs/ide-editor.md#three-deviations-under-the-shell-each-with-an-end); the Orca plugin,
a demo and screenshots under `docs/` and the board's page on the docs site, a README per package,
`.miragon/product-shots.yaml` with the store images, `netlify.toml` and a site, a folder of the
person's own behind the web app, an icon of the board's own, and, after the first publish, the entry
in the modeler collection with its walkthrough step.

**Without a test**: the gestures and behaviours the test README lists under "Without a test",
among them the group that takes a dragged node, the resize of a model and of an image node, and
the toolbar's buttons for the zoom, the fit and a group; and what the sections on the files
port, the host package, the suite's editors and the web app name as without a test.

## Packages

Every workspace is `private`: the modeler publishes nothing to npm. The packages export their
TypeScript source (`"exports": { ".": "./src/index.ts" }`), have no `dist`, and `build` is a type
check.

| Package                       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | DOM |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `@miragon/board-schema-model` | The file format and its strict reader (`format.ts`), the elements of a board (`types.ts`), their paint order as fractional indices (`order.ts`), what a canvas draws of a snapshot (`view.ts`)                                                                                                                                                                                                                                                                                                                                                                                                             | no  |
| `@miragon/board-renderer`     | The board as a live document on Yjs, its store and actions, the arm rules, the React Flow canvas, the contract factory `createCollaborativeModeler`, the stylesheet (`@miragon/board-renderer/assets/board.css`)                                                                                                                                                                                                                                                                                                                                                                                           | yes |
| `@miragon/board-files`        | The files of a repository as a board's page reads and writes them: the port `BoardFiles`, the protocol between a page and the host that keeps the files, its client (`createFilesClient`) and its server (`serveFiles`, which keeps every path a page sends inside the repository's root, out of its dot folders and on the files the host's rule lets a board reach), a memory backend, and `connectBackend` for a host whose files are in the page. The protocol is `PROTOCOL` 3: a page may ask the host to show a file it cannot read, is told why an edit was dropped, and is bounded in what it asks | no  |
| `@miragon/board-host`         | What every host of a board shares: a modeler of `@miragon/modeler-api` as the editor of a model node (`embedModeler`), its binding to a text session (`bindTextSession`), the facade a host's `open()` returns at once (`openEditor`), a board host from the files of a repository and a registry of editors (`createFilesHost`, `modelsFrom`, `imagesFrom`), the registry's types, a card for a file no editor covers (`openCard`), `followMoves` for the image nodes of a board whose files move, and the sheet `@miragon/board-host/assets/embed.css`                                                   | yes |

Five app workspaces stand on the packages. They are no packages: nothing under `packages/`
imports one.

| Workspace                               | What                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `board-suite-editors` (`apps/editors`)  | The seven modelers of the suite as the editors of a board's model nodes: the suffix table (`./suffixes`, plain data without an import, for a host in Node), the registry `SUITE_EDITORS` (`.`), the shared sheet base (`./base`), `./zod-jitless` for a page under a CSP without eval, and the build helpers (`./build/*`). The one workspace of the board that imports another modeler                                                                      |
| `board-ide-editor` (`apps/ide-editor`)  | The board inside the suite's shell for an IDE host: `mountBoardEditor(host, options)` (`.`) and the sheet that makes one picture of the shell's chrome and the board's toolbar (`./app.css`). It imports the shell and is handed its editors: no source of it imports `apps/editors`                                                                                                                                                                         |
| `board-modeler` (`apps/vscode`)         | The VS Code extension `miragon-gmbh.board-modeler` (a preview, `engines.vscode` `^1.96.0`): the custom editor `board.boardEditor` for `*.board`. Its host half is every source outside `src/webview` and runs in Node; `src/webview` is the page, bundled into one script and one sheet. It contributes three commands (New Empty Board, New Board from Example, Open Source to the Side), the setting `miragon.board.saveModelsWithBoard` and a walkthrough |
| `@miragon/board-webapp` (`apps/webapp`) | The board inside the shell's web column: a start screen, a board that is made new or opened from a file, the example repository `example/` held in memory, and the board as a download; a Vite app on port 5184 (strict)                                                                                                                                                                                                                                     |
| `@miragon/board-e2e` (`e2e`)            | Playwright, with the projects `webapp` and `vscode-webview`, and the webview test page (`e2e/webview`, a Vite page on port 5194, strict)                                                                                                                                                                                                                                                                                                                     |

- **Boundaries.** `schema-model` and `files` are the DOM-free packages
  (`modelerSuite.domFreePackages`). `files` has no dependency, and its own `tsconfig.json` has no
  DOM lib: `npx tsc -p packages/files/tsconfig.json` is the check that it uses nothing of a browser
  (`Blob`, `btoa`, `atob` and `MessageChannel` come from the Node types and exist in a page as
  well). Eight rules of the board's own in `.dependency-cruiser.cjs` add what the presets do not
  stop. Two are the renderer's: `schema-model-no-canvas-libraries` (no React, React Flow or Yjs in
  the schema model) and `document-half-no-canvas` (`store/`, `host/`, `arming/arm-rules.ts` and
  `arming/types.ts` import neither React nor React Flow, nor anything under `runtime/`, `flow/`,
  `gestures/`, `parts/`, `canvas/`, `nodes/`, `edges/`, `surface/` and `collaborative/`, nor any
  other file of `arming/`, nor `geometry.ts`). That rule names paths: a new folder or top-level
  file of `src` that is not of the document half is added to its `to`, and `test/layers.test.ts`
  fails until it is. Four came with the first increment of the apps. `packages-no-other-modeler`:
  no file under `packages/` and no app but `apps/editors` imports another modeler, tests included,
  neither a package of one by its name nor a file of one by a relative path, which the cruiser
  names `../<modeler>/...` from here; the contract and the shell are no modelers. The rule first
  caught the name alone, and a relative import from `packages/host/src` into
  `../wardley-maps/packages/renderer/src` passed the cruise and ESLint. `packages-no-apps`: no
  package imports an app workspace, by its path or by its name, or `apps/editors` would bring the
  seven renderers in unseen; the rule names every app workspace, and its test reads their names
  from disk. `files-no-canvas-libraries`: no React, React Flow or Yjs in `files`, and nothing of
  the board's renderer or host package. `host-no-editor-libraries`: no diagram-js, no React and no
  React Flow in the sources of `packages/host`, not as a type either; its tests mount the real
  board and are left alone. Two came with the extension. `ide-editor-no-suite-editors`: no source
  of `apps/ide-editor` imports `apps/editors`, by name or by path, since the seven renderers would
  come in through it; its tests may take an editor from there. `vscode-host-no-page-code`: no
  source of `apps/vscode` outside `src/webview` imports React, React Flow, Yjs, diagram-js or a DOM
  library, the board's renderer or its host package, one of the shell's entries for a page (`.`,
  `ide`, `diagram-js`, `export`, `vscode/webview`, `orca/webview`, `shell.css`), anything of
  `apps/ide-editor`, or anything of `apps/editors` but the suffix table, not as a type either. What
  a host in Node reads stays open: `@miragon/board-files`, `@miragon/board-schema-model`, the
  contract, and the shell's `vscode/extension`, `core` and `testing/*`. Since the fourth increment
  the host half reads `@miragon/board-schema-model` at runtime (the board's reader, for the
  Problems view and for the example) and the files of `example/` as texts; the rule is unchanged.
  A host file that needs something the rule forbids changes the rule and its test, with the
  reason.
  `npm run board depcruise` cruises `packages` and `apps` and leaves out the apps' build output
  (`^apps/[^/]+/dist/`): the web app's build is code-split and its chunks import each other in
  circles, 14 `no-circular` errors without the exclusion. No wider pattern: `(^|/)dist/` would also
  hide the contract's `dist` from `dom-free-contract-types-only`.
  `apps/editors/test/cruise-rules.test.ts` holds the reach of the six rules for packages and apps
  and of the exclusion against the workspaces the suite has today; for the shell it reads the
  export map, so an entry the shell adds fails there until it is decided as a page's or a host's.
  The exclusion also leaves out the extension's bundles. `@miragon/board-host` imports
  `@miragon/board-files`, and types only from `@miragon/board-renderer` and `@miragon/modeler-api`;
  it names no renderer of the suite, no diagram-js, no shell and no React. The rules and the
  preset's `packages-no-shell` hold that sentence but for one part: that the renderer and the
  contract are imported for their types alone is how the code stands, and no rule asks for it.
  `eslint.config.js` adds `eslint-plugin-react-hooks` for the renderer (`rules-of-hooks` an error,
  `exhaustive-deps` a warning).
- **The owner's open decision: may an app workspace of the board depend on the other modelers'
  renderers?** Not answered by the owner. The tree is built on the plan's recommendation, and the
  lead of the second increment let it stand (L8 under
  [The second increment of the apps against its plan](docs/increments.md#the-second-increment-of-the-apps-against-its-plan)):
  yes, in `apps/editors` and nowhere else, kept so by `packages-no-other-modeler`. `apps/vscode`
  bundles the editors through `apps/editors` and names no other modeler itself. If the answer is
  no, what goes is the 13 pins of `apps/editors/package.json` on the other modelers, the 15
  `extra-files` entries under the other modelers' components that name `apps/editors` (the
  lockfile's copy of each pin, and the manifest's as well for the two on Team Topologies), the
  rule's exception for `apps/editors`, the path rule of CI, and with them the notation modules,
  their
  battery and every model the web app and the extension draw: `apps/webapp` takes `SUITE_EDITORS`
  in `src/session.ts`, `board-suite-editors/base` in `src/app.ts`, the suffix table in
  `src/reach.ts` and `test/example.test.ts` and the build helpers in `vite.config.ts` and
  `scripts/check-build.mjs`; `apps/vscode` takes the
  suffix table in its host half, `SUITE_EDITORS`, the base and `zod-jitless` in its webview, and
  `webviewBundle` in its build; the test page `e2e/webview` takes the build helpers.
- **Dependencies.** Exact pins and no ranged peers while nothing is published (the Business Model
  Canvas rule; see `.claude/rules/package-json-fixed-versions.md`). The renderer depends on
  `@xyflow/react`, `react`, `react-dom`, `yjs`, `lucide-react`, `markdown-it`, `dompurify` and
  `@miragon/modeler-api`; `packages/host` pins the contract as well, and `apps/editors` pins
  thirteen packages of the other modelers (the seven renderers and the six packages its text rules
  call: `wardley-dsl`, `wardley-schema-model`, `value-chain-schema-model`,
  `business-model-canvas-dsl`, `team-topologies-schema-model`, `context-maps-schema-model`) beside
  `diagram-js`, `didi`, `tiny-svg` and `zod`. Every pin on a release component has its
  `extra-files` entries in `release-please-config.json` (see the release components below).
  The tests of `apps/editors` import
  `@miragon/board-files`, `@miragon/board-renderer` and `@miragon/board-schema-model` without a
  line in its manifest; they resolve through the workspace links, as the test-only imports of the
  other modelers' `e2e` workspaces do, and no check asks for more. So do the browser test of
  `apps/ide-editor` (`board-suite-editors`) and the test page and specs of `e2e`
  (`@miragon/board-files`, `board-ide-editor` and files of `apps/vscode` and `apps/webapp`).
  `apps/ide-editor`, `apps/vscode`, `apps/webapp` and `e2e` pin the shell (0.14.2), and
  `apps/vscode` and `apps/webapp` pin `board-ide-editor`. `apps/editors` has `esbuild` as a
  devDependency, for the test of its bundle options and for the notices tests. The devDependencies
  of `apps/vscode` are what the smoke and the VSIX need: `@vscode/vsce`, `@vscode/test-electron`,
  `playwright-core` on the root's `playwright` version, and `@types/vscode` 1.96.0, equal to the
  `engines.vscode` floor, which vsce checks. There must be one copy each of `yjs`, `react`,
  `react-dom` and `@xyflow/react` under this modeler: the store tells its elements by
  `instanceof Y.Map`, and a second React breaks every hook. `test/single-copy.test.ts` reads the
  lockfile for it, the job ranged peers do in the published modelers.
- **Release components.** Eight, in the Business Model Canvas pattern, one per workspace the
  extension or the web app bundles: `board-schema-model`, `board-renderer`, `board-files`,
  `board-host`, `board-editors` (`apps/editors`), `board-ide-editor`, `board-vscode` and
  `board-webapp`, each with `initial-version` 0.1.0 and at 0.0.0 in
  `.release-please-manifest.json` and in its `package.json`. `e2e` and the workspace root are no
  components. The eight carry 28 `extra-files` entries: a component's version in the lockfile and
  the lockfile's copy of every pin on it; the pins in the manifests are moved by release-please's
  `node-workspace` plugin, since both ends are components. Under other components 22 entries name
  a workspace of the board: the lockfile's copy of the two pins on the contract (the renderer's
  and the host package's) and of the three pins of `apps/ide-editor`, `apps/vscode` and
  `apps/webapp` on the shell; both entries, manifest and lockfile, for the shell pin of `e2e`,
  which is no component; and for the thirteen pins of `apps/editors` on the other modelers the
  lockfile's copy of each, with the manifest's as well for the two on Team Topologies, whose
  packages are no components of their own. `test/release-config.test.ts` names every missing or
  stale one: a further pin on a workspace package is a manifest line, an `npm install` and the
  entry that test then asks for. No workspace but the extension has a `CHANGELOG.md`:
  release-please writes each with the component's first release. Remove `initial-version` once
  the components have been released. While `board` is in `HELD_BACK` of
  `.github/scripts/release-plan.mjs` a release tags the eight and publishes nothing of them;
  `test/release-config.test.ts` fails for a component at 0.0.0 that names no `initial-version`.
  What a release of them publishes is under
  [CI and what a merge publishes](docs/state.md#ci-and-what-a-merge-publishes).
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
  calls go to the board's log (see [What is left with the host](docs/renderer.md#what-is-left-with-the-host));
  [Deferred](#deferred) names what is not contained.

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

A host with chrome of its own may put two rules of its own sheet on the toolbar: a start margin on
`.board-toolbar` (it is React Flow's panel at `top: 0; left: 0` with a margin of 15 px), to clear
the host's control in that corner, and `display: none` on
`.board-toolbar__group[aria-label="Zoom"]` where the host has a zoom control of its own. With both,
the toolbar starts at the margin, the Zoom group has no box, the Done control keeps its size and
its place at the start of the toolbar, and the toolbar's top and bottom edge are where they were,
so the band the arm rules keep free is unchanged. `chrome.browser.test.tsx` holds exactly that,
with the two rules loaded as a style element, and `apps/ide-editor` writes them under `.cd-shell`.
Nothing else of the toolbar is a host's to restyle, and the Done control is never hidden: it is how
a person leaves an armed model.

## Tests

[`packages/renderer/test/README.md`](packages/renderer/test/README.md) says what each test file
holds, how the arming traces are recorded anew, how the conformance harness is built, and what a
browser test of the board has to know (synthetic input, the lazy parts, the module-level state,
the window). Read it before you write a test. Here are the two projects and the rules.

- `npm run board test` (project `unit`, Node) runs `packages/*/test/**/*.test.ts` and
  `apps/*/test/**/*.test.ts` without the `test/browser` folders: 77 files, 1621 tests. The module
  `vscode`, which exists only inside the editor, resolves there to
  `apps/vscode/test/__mocks__/vscode.ts`: the module a test imports by its path for the control
  surface `vscodeMock`, so a registration of the host and a test's question share one state. The
  sources stay typed against `@types/vscode`.
  - The schema model and the renderer (16 files, 290 tests): the format, the order keys and the
    view (`packages/schema-model/test/`); the store, the actions, the arm rules, the board file
    at rest, under a Git merge and under two peers on one live document; and of the canvas side
    what needs no browser: how the board reads a host (`host-defaults`), the parts of the
    contract factory (`collaborative-parts`), the two sheets (`theme.sync`, `styles.scope`), the
    reach of the dependency rule (`layers`), the one copy of each shared library
    (`single-copy`), the arming fixture as a file (`arming-fixture`).
  - The files of `packages/files`, `packages/host`, `apps/editors`, `apps/webapp`,
    `apps/ide-editor` and `apps/vscode` are listed in the documents of those parts, each under
    "Tests of this part" ([The parts and their documents](#the-parts-and-their-documents)).
- `npm run board test:browser` (project `browser`, Chromium, a window of 1280 x 800) runs
  `packages/renderer/test/browser`, `packages/host/test/browser` and `apps/*/test/browser`, each
  `**/*.test.{ts,tsx}`: 27 files, 951 tests. React Flow measures its nodes, so nothing of the
  canvas runs in jsdom or Node, and no diagram-js renderer mounts there either (Business Model
  Canvas's import throws `activeLayer.getBBox is not a function` under jsdom).
  - The renderer's fifteen files (662 tests): the arm rules on a bench of fakes (`arming`), the
    sheet on static markup (`styles`), React Flow's store (`react-flow-internals`), the
    contract's kit (`conformance`), and boards mounted through the entry (`toolchain`, `canvas`,
    `canvas-behaviour`, `chrome`, `nodes`, `images`, `overlay-surface`, `hostile-host`,
    `contract-edges`, `embedded-model`, `live-document`).
  - The files of `packages/host`, `apps/editors`, `apps/ide-editor` and `apps/webapp` are listed
    in the documents of those parts, each under "Tests of this part".
- Both projects take the other modelers from their sources through
  `apps/editors/build/aliases.mjs`, so no other modeler is built first, and the browser project
  pre-bundles what `apps/editors/build/prebundle.mjs` reads from those sources.
  `vitest.config.ts` exports the browser project as `browserProject`.
- `npm run board test:e2e` (Playwright) runs 36 tests in two projects, `webapp` (10) and
  `vscode-webview` (26): [`docs/e2e.md`](docs/e2e.md#tests-of-this-part).
- `npm run board test:vscode` runs the smoke: one test, the packed extension in a real VS Code
  ([The smoke in a real VS Code](docs/vscode.md#the-smoke-in-a-real-vs-code-test-smoke)). Its files are in
  `apps/vscode/test-smoke`, which no other project collects.
- A scratch config that applies single edits in memory sets `fsModuleCache: false`: Vitest keeps
  transformed modules on disk by a file's own text and would serve one run's edit to the next
  ([The board inside the shell](docs/ide-editor.md#the-board-inside-the-shell-appside-editor),
  Tried against the tests).

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
  `test` · `depcruise` · `format` · `format:check`. The type check is a chain: the board's strict
  project (`tsconfig.json`: the packages, the web app's sources and tests, the test support),
  `apps/webapp/tsconfig.config.json` (the Vite config), `apps/editors` under its own weaker flags,
  `apps/ide-editor`, `apps/vscode` (with the types of `vscode` 1.96.0) and `e2e` (its specs, the
  webview test page and that page's Vite config).
- `npm run board dev:webapp`, then http://localhost:5184 (the port is strict). The dev server
  writes `apps/webapp/node_modules/.vite`.
- `npm run board build:webapp`, then `npm run check:build -w modelers/board/apps/webapp`. The
  build writes its third-party notices and fails when they are not whole; the check holds them
  against the build's source maps.
- `npm run board build:vscode` builds the extension's two bundles into `apps/vscode/dist`
  (unminified, with source maps), `npm run board dev:vscode` watches them, and
  `npm run board package:vscode` writes `apps/vscode/board-modeler.vsix` (vsce runs the production
  build itself and packs offline) and then runs the notices check. Each build writes the notices
  into `dist`. esbuild prints an `ignored-bare-import` warning for the shell's chunks in each: no
  failure.
- `npm run check:notices -w modelers/board/apps/vscode`: the notices of `dist` and of the packed
  VSIX against a fresh measurement of the bundles, and the VSIX's papers; `package:vscode` runs it
  as its last step. `-- --vsix <file>` checks another VSIX. After a change of a dependency in any
  modeler, `npm run board build:webapp` with its check and `npm run board package:vscode` say
  whether the notices still hold.
- `npm run dev:webview -w modelers/board/e2e`, then http://127.0.0.1:5194/webview-test.html?host:
  the extension's webview as a page, with the extension's plumbing in the page (the port is
  strict). It writes `e2e/node_modules/.vite`.
- `npm run board test:browser`: the committed browser project. The root's `npm run test:browser`
  runs it with every other modeler's.
- `npm run board test:e2e`: the committed Playwright config, which starts both dev servers itself.
  Flags go to the workspace: `npm run test:e2e -w modelers/board/e2e -- --project=vscode-webview`.
- `npm run board test:vscode`: the smoke, the packed extension in a real VS Code. It opens a VS
  Code window, so it needs a display (CI runs it under `xvfb-run -a`), downloads VS Code into
  `~/.cache/miragon-modeler-shell/vscode-test` on its first run, and must not run twice at once.
  `VSCODE_VERSION=1.96.0` picks the VS Code (default: the newest stable the manifest allows),
  `VSCODE_SMOKE_VSIX=<file>` tests a VSIX that is packed already, `VSCODE_SMOKE_KEEP=1` keeps the
  profile and VS Code's logs. The screenshots land in `test-results/vscode-smoke`.
- `npm run board test:vscode:docker`: the same in the suite's Docker runner, with no window on the
  machine. Options go to the workspace:
  `npm run test:vscode:docker -w @miragon/board-modeler-workspace -- --env VSCODE_VERSION=1.96.0`.
  The runner hands the container only what `--env` names.
- `sha256sum -c .miragon/brand-assets.sha256` from the root: the vendored theme files.

**A change to another modeler runs the board's jobs.** `reaches_board` in
`.github/scripts/ci-paths.sh` adds the board to the modelers a change reaches when a path lies
under another modeler's `packages/` or `example/` or is its `apps/vscode/package.json`. These are
the three things the board reads of a modeler: `apps/editors` bundles the packages from source,
`text-rules.test.ts` and the browser battery read the example files, and `suffixes.sync.test.ts`
reads the `customEditors` of each extension's manifest. `test/ci-paths.test.ts` holds each of the
three and their limits: a source file of another extension, another app's manifest and a
modeler's `docs/example/` do not reach the board. Whoever makes the board read something else of a
modeler adds it to that rule and to its test. Before pushing such a change, run
`npm run board lint`, `npm run board test` and `npm run board test:browser` (the battery with the
seven real editors is `apps/editors/test/browser`), and `npm run board build:webapp` and
`package:vscode` when a dependency or a legal comment changed: the notices stop a production build
for a package or a copied work they do not know
([The suite's editors](docs/editors.md#the-suites-editors-appseditors)).

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

The local config of Playwright Test, `modelers/board/e2e/playwright.sandbox.config.ts`, and how
the two e2e projects run through it are in
[`docs/e2e.md`](docs/e2e.md#the-local-config-of-playwright-test).

`BOARD_VITE_CACHE` lets several people run it at once without sharing Vite's pre-bundle. A path
with a `node_modules` segment keeps Vite from warning about Vitest's own pre-bundle ("The above
dynamic import cannot be analyzed"); without one the warning comes with every run and fails
nothing.

A real VS Code on such a machine runs only inside the suite's Docker runner, one run at a time:
[`docs/vscode.md`](docs/vscode.md#a-real-vs-code-in-the-docker-runner) says how, also for a
working tree with uncommitted work.

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
  add actions, delete and the notices. Under the shell the board keeps this toolbar and the shell
  stands around it, with three rules of the app's sheet between the two (`apps/ide-editor`); a view
  and command surface for a host's chrome, and a way to switch the toolbar off, are not built.
  **`lucide-react`** for the icons, where the suite's renderers copy icon geometry.
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
- For a host of files: an acknowledgement of a write the place took, and a text merge for an edit
  that crosses a change from outside (the edit is dropped whole). Built with the second increment:
  a retry for a model whose file comes later, the version of a text, `settled()` on the port, the
  rule of what a page reaches, and a host's own line for an invalid file. Built with the third: an
  end of the web app that waits for the board's editors, and the notices of both builds. Built
  with the fourth: words for an edit that was dropped, a file the host shows, the bounds on what
  a page asks of a host, and a moved file's editor kept. Still not built: a budget in numbers
  for the new files of one editor, and a move told for a file a page can only have shown.
- In the VS Code extension: the owner's own walk with the VSIX; a model armed in an editor
  narrower than its node; following a file
  that another program moves, a file below a renamed folder that the list does not hold, and
  the files of a board that is not open; a file dragged from VS Code's Explorer onto the board
  (it carries addresses and no file), and a drop of a picture without Shift, which VS Code takes
  for itself; saving every edit of a model at once; an export; a theme but light; an icon of the
  board's own (the extension shows the Miragon comet until the Miragon modeler icon set has a
  board icon, which is a pull request in Miragon/corporate-identity; then the file is copied
  from the set and the checksum in `apps/vscode/test/papers.test.ts` replaced). Built with the
  fourth increment and seen in a real VS Code in the runner: following a file a person renames
  or moves in VS Code, saving the models with the board as a setting, the view kept across a
  reload and a restart, an entry in the Problems view, the New Board commands with a
  walkthrough, and a card for a file no notation of the suite covers. Not built: an undo on a
  board that leaves a move alone (each Control+Z after a rename takes one node's new path
  back).
- In the web app: a link in the address that carries a board, a Share action, an export but the
  board file, a link to the third-party notices of the build, a Netlify site (`netlify.toml`), a
  folder of the person's own behind the page, and a guard for a file dropped beside the board.
- The apps of the later increments: the Orca plugin, arrows derived from model
  references (`host.references`), and what a bare renderer in a node does not offer: by the plan's
  reading of the modelers' apps, not tried here, a Business Model Canvas title or notes, C4's
  inspector and views dialog, and any menu or export of a hosted modeler.
- An end signal for a host: a promise on `BoardHandle` that settles when the canvas is gone.
- State per board, listeners of the board's own, the fit capped and aware of the toolbar's
  height, `freeArea.center` read.
- A design-system review: copied Lucide geometry, icon sizes, handles and tints, note colours in
  dark, `z-index: 2000` on the edge labels, the tap highlight and the text size adjustment on
  `.board-root`, a colour of its own for `.board-node__header`, and the comments that cite
  designIQ's documents or a file their statements left with a split.
- Publishing to npm: ranged peers for `yjs`, `react`, `react-dom` and `@xyflow/react` with exact
  mirrors, and a build.
- What a modeler has beside its code: a demo and screenshots under `docs/` and a page on the docs
  site, the store images (`.miragon/product-shots.yaml`), and, after the first publish, the entry
  in the modeler collection with its walkthrough step.
- A list of allowed licences that the suite owns: the board's is in
  `apps/editors/build/notices.mjs`.

**Found while the increments of the apps were built, and not changed**, in the renderer, the
shell, the suite's tooling and other modelers, each its owner's to decide: the four lists are in
[`docs/increments.md`](docs/increments.md#found-while-the-increments-were-built-and-not-changed),
and an increment adds its own there. **Found in a real VS Code, and not changed:**
[`docs/vscode.md`](docs/vscode.md#found-in-a-real-vs-code).

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
- A part's facts are written into that part's document under `docs/`; this file gets the state,
  the counts and a pointer ([The parts and their documents](#the-parts-and-their-documents)).
