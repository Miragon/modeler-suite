# CLAUDE.md

TypeScript modeler for the board: a canvas of a repository's own files. Models are shown and edited
in place, each by an editor the host hands in and each saved in its own file, next to notes,
images, groups and arrows. The board stores where a file sits, never what is in it. The file is a
`.board` text, one JSON line per element. Unlike every other modeler of the suite its canvas is
[React Flow](https://github.com/xyflow/xyflow) (`@xyflow/react`, MIT) on React, not diagram-js: it
lays out HTML nodes that hold whole editors.

**Work in progress.** The board was built and measured in designIQ (`apps/web/src/notations/board`
there, at commit `ce12684`), and its canvas was moved here as it was measured. The move is done and
was reviewed. Of the apps around the board three increments are in the tree. The first is a web
app that shows an example repository in memory, with the seven modelers of the suite as the editors
of its model nodes. The second is a VS Code extension: a `.board` file opens in a custom editor inside
the suite's shell, and the models of the workspace are edited in place through VS Code's own text
documents. It packs into a VSIX. The extension was built against stand-ins for VS Code and then
run in a real one, in the suite's Docker runner: its smoke passes there on VS Code 1.146.0 and on
1.96.0, and what the code takes for granted about VS Code was walked through item by item, with
what was seen under [Taken for granted about VS Code](#taken-for-granted-about-vs-code). The third
increment brought what the suite's CI asks of a modeler and nothing of the product beyond it: the
web app inside the suite's shell, the third-party notices of both builds, the extension's papers,
eight release components, and the board's place in the root's tests, documents and path rule.
Nothing of the board is published and no pull request is open.
[State of the port](#state-of-the-port) says what is in the tree, what was run on it, what a merge
would publish and what is still to come.

This modeler is `modelers/board` in the Miragon modeler suite. The suite's
[`CLAUDE.md`](../../CLAUDE.md) holds the rules for every modeler (setup, commands, commits and
signing, exact pins, releases, the design system, the contract and shell boundaries); this file
adds what is special to the board and names where the board deviates from them. Run its scripts
from the repository root as `npm run board <script>`, or as `npm run <script>` inside
`modelers/board`, after `npm run build:shared`: the board reads the contract's `dist`.

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
(`apps/editors/build/notices*.mjs`), the extension's README, CHANGELOG and icon, and in the root
the eight release components, the entry in `PENDING_FIRST_PUBLISH`, the path rule `reaches_board`
and the board's rows and sentences in the suite's documents. No increment changed a file of
`packages/renderer/src` or `packages/schema-model/src`. 69 unit files with 1321 tests, 24 browser
files with 850 tests, 25 Playwright tests, and the smoke of the extension in a real VS Code.

Read the browser count by what it stands on. 662 tests are the renderer's: 297 run the arm rules on
a bench of fakes (73 scripts, each run once and read by four tests, plus five), 82 hold static
markup under the sheet, 7 a bare React Flow, 73 are the contract's kit, 202 are in the eleven files
that mount a board, and one holds a filter of the test support. Every editor in them is the
recording stand-in of `createTestHost` and every input is synthetic, which ignores `inert`: none of
them can fail when a preview takes real input or when the pointer math of an armed editor is off.
That is held outside the renderer, with real mouse and keyboard input (`commands.realInput`): 66
tests of `packages/host` (8 of the command itself, 58 on a stand-in modeler of the contract that
draws boxes, alone and on the real board), 53 of `apps/editors` (49 with the seven real modelers on
a board, 2 for the order of their sheets, 2 for the watch the battery ends every test on), 32 of
`apps/webapp` and 37 of `apps/ide-editor` (the board under the shell's real `mountShell`, in the
IDE column and in the web column).

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

**What was run, and what was not.** On the machine the third increment of the apps was integrated
and closed on (the Miragon agent VM, Node 24.22.3, with CI's Node 22 line as 22.23.5), with the
tree as it stands:

- `npm run board lint`, `test` (69 files, 1321 tests), `depcruise` (no violation) and
  `format:check` pass; so do the root's `npm run test:plugin` whole (14 files, 313 tests) and
  `npm run format:check`, and the checksums of the theme files verify. The commands of CI's job
  `modeler-check (board)` also pass on Node 22.23.5, in CI's order and from a tree without the
  board's build output.
- The whole browser project passes through the local sandbox config, five runs in a row (24 files,
  850 tests each; see [Commands](#commands)), and once more on Node 22.
- Both e2e projects pass through the local Playwright sandbox config, three runs each on the dev
  servers they start: `webapp` (8 tests) and `vscode-webview` (17 tests, two of them on the
  production bundle, which the spec builds itself). Each also passes with CI's settings (`CI=1`:
  one worker, two retries, servers of its own), on Node 24 and on Node 22, with no test retried,
  and `webapp` passes against the built app.
- `npm run board build:webapp` and the web app's `check:build` pass, the notices among what it
  holds. `npm run board build:vscode` and `package:vscode` pass and write
  `apps/vscode/board-modeler.vsix`: 23 files, 1.03 MB, with the notices check on `dist` and on the
  VSIX as its last step (see [The webview half](#the-webview-half-srcwebview)).
- **The extension ran in a real VS Code**, inside the suite's Docker runner, which the owner
  allowed on that machine for exactly this. The smoke passes on VS Code 1.146.0, on 1.96.0 (the
  manifest's minimum) and with a VSIX packed beforehand
  ([The smoke in a real VS Code](#the-smoke-in-a-real-vs-code-test-smoke)). What the code takes
  for granted about VS Code was walked through there on both versions with the second increment,
  with real input, a real folder and a probe in the extension host: most of it holds, and where VS
  Code does something else the code and the fake were changed (what a file watcher names for a
  folder, a paste, the first fit of a board that is covered, the document of a deleted file). The
  list has each item with its outcome, and what the runner could not reach
  ([Taken for granted about VS Code](#taken-for-granted-about-vs-code)). With the third
  increment's tree the smoke passed there again on VS Code 1.146.0 and on 1.96.0, each on a
  snapshot with no built file in it: the runner's `npm ci`, then the smoke, which packs the VSIX
  itself.
- For the seven other modelers the commands of `modeler-check` pass on this branch's lockfile
  (lint, the cruise, the build, the unit tests, the web app's build with its check, the VSIX), on
  Node 22.23.5 and for Context Maps on 24.22.3. None of their sources differs from `main`.
- The docs site builds with the board's row and paragraph in `docs/ci-and-releases.md`: the three
  commands of CI's `docs` job (`npm ci` in `docs/`, the check of the vendored kit, the build with
  `DOCS_BASE`) passed inside the Docker runner's container on a snapshot of the tree, run by the
  review of the third increment and again when the increment was closed. On the machine itself
  only the kit's check ran, since `docs/` is an npm project of its own that is not installed
  there.
- No Chromium command line outside a container carried `--no-sandbox` in any sample of the process
  table taken during these runs, nor in any that the parts of the second and the third increment
  took while they were built; the processes of VS Code inside the runner's container carry the
  flag, and were counted apart by their cgroup. While the work packages of the first increment ran
  side by side, one system-wide sample showed 160 of 448 Chromium command lines with the flag. The
  run it came from was not found; a sample attributed by parent chain to the board's own runs at
  that time had none.
- Not run: `npm run board test:browser` and `test:e2e` with the committed configs (that machine
  must not start Chromium without its sandbox), `npm run board test:vscode` outside the Docker
  runner, CI, brand-lint (the `miragon-brand` plugin was not on that machine), the other
  modelers' browser, e2e, VS Code and Orca jobs, designIQ's batteries, any browser but Chromium,
  and VS Code on macOS or Windows. The web app was opened by tests, by the review of the first
  increment, by the integration of the third and by its review, each of which drove it with
  Playwright and read its screenshots (the start screen, the example, a Wardley map edited in
  place, a new board, the reset in the address over a kept board with its offer, a board opened
  from a single file, the shortcuts dialog, windows of 600, 400, 360 and 320 px); the owner has
  opened neither the web app nor the extension.

**A review of the first increment.** After the first increment was integrated, an independent
reviewer ran its gate again, drove the web app with Playwright's mouse and keyboard (the dev server
and the built app, at 1600 x 1000, 760 x 600 and 400 x 800, and at a device pixel ratio of 1.25 and
2, in scratch specs that are not in the tree), read the code, and tried 17 single edits of the
sources and 25 malformed messages against it. All seven notations passed every step there: the
preview, the arming, a drag, a label, a delete, Done, a zoom of the board and a reload, each with
its own file written and never the board's. What the review found:

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
- **Named and not changed:** the notices the web app's build lacked (written by the build since
  the third increment), an armed editor in a window narrower than its node, and the invalid line's
  advice in a host that has no editor for the file (The web app; the line's text is the host's
  since the second increment). What a page may reach
  inside the repository's root was named as the owner's to settle; the lead of the second increment
  decided it, and it is built (The files port).

**A review of the second increment.** After the extension had run in a real VS Code, an
independent reviewer ran the gate again; tried the files channel as a page that is not the
board's (111 scratch tests against the extension as `activate` registers it on the fake VS Code,
and 36 of the same messages handed to the real extension in VS Code 1.146.0 and 1.96.0); ran a
real VS Code in the runner (the kept smoke, five runs of its own on both versions, and once with
the VSIX installed by `code --install-extension`); drove the webview test page with Playwright's
mouse and keyboard at 1280 x 800, 900 x 600 and 600 x 800, with each of the seven notations armed
and edited in place; and held 30 sentences of this guide against the tree. None of its scripts
is in the tree. It found no way to read or write a file that is no model and no picture. What it
found:

- **Fixed, each under a test and seen again in the runner.** Through a linked folder a page read
  and wrote a model, and read a picture, outside the repository: every folder on the way to a
  file is asked now. A page could write a model larger than a board opens: such a write is
  refused ([The host half](#the-host-half)).
- **Named and not changed.** Nothing bounds how many new files a page stores or how many reads it
  asks for at once, and two names that a folding file system reads as a dot folder
  ([The files port](#the-files-port-packagesfiles)). An armed model does not fit an editor that
  is narrower than its node, and the keys do not come back by themselves after a broken text is
  repaired under an armed model
  ([The board inside the shell](#the-board-inside-the-shell-appside-editor)). The shell shows any
  text of a page as a notification, its policy leaves `base-uri` open, and a refused edit into a
  disposed panel rejects inside it ([Deferred](#deferred)). With the VSIX installed, a `.board`
  file given on the command line at the first start opens as text
  ([The smoke in a real VS Code](#the-smoke-in-a-real-vs-code-test-smoke)).
- **Corrected here**, four sentences the review found untrue: the toolbar's width and where the
  status box stands under the shell, what the smoke's window is to VS Code, and, in the
  extension's README, which files a board lists and reaches.

**A review of the third increment.** After the third increment was integrated, an independent
reviewer played CI from the workflow files in a scratch clone of the tree: every job's commands
that start no browser on Node 22.23.5, and the board's again after a real `npm ci` inside the
Docker runner's container; the browser project and both e2e projects through copies of the
sandbox configs, also on 2 and on 4 cores with a cold cache, in the committed config's
two-project shape and with other fallback fonts; the smoke in the runner on VS Code 1.146.0 and
1.96.0, also on a VSIX packed beforehand; and the docs site's build in the runner's container. It
held the root's additions against 34 made-up diffs and against single edits, drove the built web
app with Playwright's mouse and keyboard (all seven models edited in place, nine odd files from a
disk, a board of 1500 notes, and a reset, an open and a reload in the middle of an edit),
measured the notices again from the source maps and from esbuild's metafile, and held 27
sentences of this guide against the tree. None of its scripts is in the tree. It found nothing
that would fail a job of CI. What it found:

- **Fixed, each under a test.** `?reset` in the address replaced a kept board of the person's own
  with the example and offered nothing back: that board is offered back now, as any replaced
  board is ([The web app](#the-web-app-and-the-example-appswebapp-example-e2e)). The notices
  check asked no section of a copied work: it asks one of every copied work its evidence names
  ([The suite's editors](#the-suites-editors-appseditors)). The extension's README said that the
  extension is on no marketplace, in a file the VSIX carries onto a marketplace's listing: it
  says nothing of where the extension is published now, and a test holds that
  ([The webview half](#the-webview-half-srcwebview), the papers).
- **Named and not changed.** Nothing in the tree holds a publish back once the branch is on
  `main`; the change that would is written down below, under "Nothing keeps an unfinished modeler
  from being published". Below 400 px the board's toolbar runs out of the window, the toast after
  Show example lies over the lower row of models while it shows, and a model node whose file
  could not be opened can still be armed (The web app, Known and not cured). The web app's
  notices check holds no package that brings only a sheet or a font and no work that is copied
  into a sheet (The suite's editors). No root test holds that a component at 0.0.0 names an
  `initial-version` ([Deferred](#deferred)).
- **Corrected here**, two sentences that said the docs site's build had run nowhere.

**CI with this branch.** With the third increment the tree has what the suite's CI asks of a
modeler, by a reading of the workflows and by a run of each job's commands in the form that
machine allows, not by a CI run: no pull request is open.

- `board` is in `PENDING_FIRST_PUBLISH` of `test/modeler-collection.test.ts`: the extension is on
  no marketplace, so the extension pack and its walkthrough leave it out, and the pull request
  after the first publish adds the pack entry and the walkthrough step and takes the board off
  that list. `npm run test:plugin` passes whole, so `shared-test` and the root's `npm test` no
  longer stop at the board.
- For this branch as a pull request `ci-paths.sh affected` reaches everything (`shared`,
  `template` and `docs` true, all eight modelers, the six with an Orca plugin), because the branch
  changes the lockfile, the root manifest, the release config and `ci-paths.sh` itself: every job
  of `ci.yml` runs, 69 with the matrices, five of them the board's (`modeler-check`,
  `modeler-test-browser`, `modeler-e2e`, and `vscode-smoke` on the newest stable VS Code and on
  the manifest's minimum). No workflow lists modelers by hand: the matrices come from
  `ci-paths.sh`, which reads `modelers/*/package.json` and, for Orca, each
  `apps/orca/orca-plugin.json`. The board has none, so it is in no Orca matrix, and nothing asks
  for a `netlify.toml`. Once on `main` the board's smoke also runs every Monday
  (`smoke-weekly.yml`).
- What a first CI run shows, because nothing on that machine can: the committed browser and
  Playwright configs in the Playwright image (Chromium without its sandbox, as root, with that
  image's browsers and fonts); the smoke on the runner image under
  `xvfb-run`; Node 22.22.2 exactly; `pin-npm-dependencies` and the dependency review as actions;
  CodeQL, to which every file of the board is new; and the seven other modelers' browser, e2e, VS
  Code and Orca jobs, the shell's browser and e2e jobs and the three template jobs on this
  branch's lockfile. Against `main` that lockfile adds entries and moves no version another
  modeler installs. What stood in for the two actions, in the review of the third increment: the
  pin action's rules, read at its pinned commit, held against all 87 manifests (exact versions
  only), and npm's advisory endpoint asked about the 31 third-party packages the lockfile adds,
  which named no advisory on 2026-11-15. The plan expects two to four rounds.

**What a merge publishes.** Nothing at the merge itself: `release-please.yml` puts the board into
the suite's one release pull request, `chore: release main`. A squash title of the type `feat` or
`fix` counts for every component whose files the commit touches, so all eight are proposed at
0.1.0, their `initial-version`. When a maintainer merges that release pull request, release-please
tags the eight (`board-<component>-v0.1.0`) and creates a GitHub release for each, and
`release-plan.mjs` lists what lies at or below a released path. Run for the board's eight paths it
printed: npm none (every workspace is `private`), Orca none (there is no `orca-plugin.json`), and
one extension, `board-modeler`. `build / vscode (board-modeler)` then builds and packs the VSIX
and runs the smoke on it; after one approval of the environment `vscode-marketplace`, which is one
for every extension of that release, the VSIX goes to the VS Code Marketplace as
`miragon-gmbh.board-modeler` 0.1.0, and the Open VSX job fails until a namespace owner has
published that VSIX once by hand and registered the trusted publisher
(`docs/ci-and-releases.md`). The web app is deployed nowhere, and the extension pack is unchanged.
By a reading of the workflow and the docs and a run of `release-plan.mjs`; no release was run.

**Nothing keeps an unfinished modeler from being published.** `release-plan.mjs` has no opt-out:
it publishes every workspace with `engines.vscode` at or below a released component, and
`test/release-config.test.ts` asks a component of every such workspace. `private` in the
extension's manifest does not stop `vsce`, `preview` is a label on the Marketplace page, and
`PENDING_FIRST_PUBLISH` only keeps the extension out of the pack. A squash title that releases
nothing (`chore`, `docs`, `refactor`) only delays it: the `node-workspace` plugin gives a component
a patch release when a component it pins releases, and the board's components pin the contract,
the shell and thirteen packages of the other seven modelers, so the next release of any of them
would release the board's extension too (by a reading of the plugin, not run). Between a merge and
the Marketplace stand the maintainer who merges the release pull request, the approval of the
environment and the smoke on the VSIX. So the branch stays off `main` until the owner wants the
extension published; the plan's recommendation is after the increment of daily use in VS Code.
A hold in the tree is a root change of two files and the owner's to make. One was tried in a
scratch copy of the root and is not in the tree: `release-plan.mjs` names the extensions that are
held back (`board-modeler`) and leaves them out of the `vscode` matrix except in the dry run, with
three cases in `test/release-workflow.test.ts` that run the script. Run that way for the board's
eight paths the plan printed no extension. The components then still get their versions, tags and
changelogs with every release, and no VSIX is built or published until the name is taken off the
list. What the tree does hold: the README that the VSIX carries says nothing of where the
extension is published, so it reads true on a listing as well.

**Still to come:** the owner's own walk with the VSIX, and what the walk in the runner did not
reach; daily use in VS Code (files that move, the saving rule, the view kept, a Problems entry,
New Board commands, a notice in words for a dropped edit, the picker leaving links out, a budget
for new files and reads); one chrome, the end of the
[three deviations](#three-deviations-under-the-shell-each-with-an-end); the Orca plugin, `docs/`
and the board's page on the docs site, a README per package, `.miragon/product-shots.yaml` with
the store images, `netlify.toml` and a site, a folder of the person's own behind the web app, an
icon of the board's own, and, after the first publish, the entry in the modeler collection with
its walkthrough step.

**Without a test**: the gestures and behaviours the test README lists under "Without a test",
among them the group that takes a dragged node, the resize of a model and of an image node, and
the toolbar's buttons for the zoom, the fit and a group; and what the sections on the files
port, the host package, the suite's editors and the web app name as without a test.

## Packages

Every workspace is `private`: the modeler publishes nothing to npm. The packages export their
TypeScript source (`"exports": { ".": "./src/index.ts" }`), have no `dist`, and `build` is a type
check.

| Package                       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                              | DOM |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `@miragon/board-schema-model` | The file format and its strict reader (`format.ts`), the elements of a board (`types.ts`), their paint order as fractional indices (`order.ts`), what a canvas draws of a snapshot (`view.ts`)                                                                                                                                                                                                                                                       | no  |
| `@miragon/board-renderer`     | The board as a live document on Yjs, its store and actions, the arm rules, the React Flow canvas, the contract factory `createCollaborativeModeler`, the stylesheet (`@miragon/board-renderer/assets/board.css`)                                                                                                                                                                                                                                     | yes |
| `@miragon/board-files`        | The files of a repository as a board's page reads and writes them: the port `BoardFiles`, the protocol between a page and the host that keeps the files, its client (`createFilesClient`) and its server (`serveFiles`, which keeps every path a page sends inside the repository's root, out of its dot folders and on the files the host's rule lets a board reach), a memory backend, and `connectBackend` for a host whose files are in the page | no  |
| `@miragon/board-host`         | What every host of a board shares: a modeler of `@miragon/modeler-api` as the editor of a model node (`embedModeler`), its binding to a text session (`bindTextSession`), the facade a host's `open()` returns at once (`openEditor`), a board host from the files of a repository and a registry of editors (`createFilesHost`, `modelsFrom`, `imagesFrom`), the registry's types, and the sheet `@miragon/board-host/assets/embed.css`             | yes |

Five app workspaces stand on the packages. They are no packages: nothing under `packages/`
imports one.

| Workspace                               | What                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `board-suite-editors` (`apps/editors`)  | The seven modelers of the suite as the editors of a board's model nodes: the suffix table (`./suffixes`, plain data without an import, for a host in Node), the registry `SUITE_EDITORS` (`.`), the shared sheet base (`./base`), `./zod-jitless` for a page under a CSP without eval, and the build helpers (`./build/*`). The one workspace of the board that imports another modeler |
| `board-ide-editor` (`apps/ide-editor`)  | The board inside the suite's shell for an IDE host: `mountBoardEditor(host, options)` (`.`) and the sheet that makes one picture of the shell's chrome and the board's toolbar (`./app.css`). It imports the shell and is handed its editors: no source of it imports `apps/editors`                                                                                                    |
| `board-modeler` (`apps/vscode`)         | The VS Code extension `miragon-gmbh.board-modeler` (a preview, `engines.vscode` `^1.96.0`): the custom editor `board.boardEditor` for `*.board`. Its host half is every source outside `src/webview` and runs in Node; `src/webview` is the page, bundled into one script and one sheet                                                                                                 |
| `@miragon/board-webapp` (`apps/webapp`) | The board inside the shell's web column: a start screen, a board that is made new or opened from a file, the example repository `example/` held in memory, and the board as a download; a Vite app on port 5184 (strict)                                                                                                                                                                |
| `@miragon/board-e2e` (`e2e`)            | Playwright, with the projects `webapp` and `vscode-webview`, and the webview test page (`e2e/webview`, a Vite page on port 5194, strict)                                                                                                                                                                                                                                                |

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
  contract, and the shell's `vscode/extension`, `core` and `testing/*`. A host file that needs
  something the rule forbids changes the rule and its test, with the reason.
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
  [The second increment of the apps against its plan](#the-second-increment-of-the-apps-against-its-plan)):
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
  the components have been released. What a release of them publishes is under
  [State of the port](#state-of-the-port).
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
messages between the two. `src/client.ts` is the page's side, `src/memory.ts` a backend in memory
(the web app's repository and every test's double), `src/local.ts` `connectBackend`: client and
server on a `MessageChannel` of the page's own, so that a host in the page runs the same path
checks and the same message order as one behind a webview. `src/paths.ts` has the path rules and
the rule a host hands in. The entry exports `createFilesClient`, `connectBackend`,
`createMemoryBackend`, `serveFiles`, `suffixRule`, `PICTURE_SUFFIXES`, `bySuffix`,
`isNewAssetPath`, `repoPath`, `fromBase64`, `toBase64`, `isBoardMessage`, `PROTOCOL`,
`NEW_FILE_LIMIT_BYTES` and the types, `FilesRule` among them.

**Decided by the lead of the second increment, not by the owner, who was told and may turn each
round:** what a page may reach (the dot segments and the host's rule, below) and the version of a
text (`PROTOCOL` 2, below). Both are built, and the VS Code backend is written against them.

- **The messages are frozen, at `PROTOCOL` 2.** Every type starts with `board.`, so they share a
  webview's channel with the shell's. The VS Code host is written against the names and shapes: a
  change to one is a new `PROTOCOL`, and a table in `protocol.test.ts` fails the type check when a
  type is added and not listed. Protocol 1 had no version of a text and no settle. Nothing was
  published with it and no host speaks it: a hello of protocol 1 is answered as every hello of
  another protocol.
- **The rules both sides keep.** Nothing is pushed before the hello. Whatever the page awaits
  carries a `requestId`, a whole number, and ends in its answer or in `board.failed`; a request
  with any other id (none, a text, a fraction, `NaN`) is dropped, since no answer could reach it.
  An answer comes when its own work is done, not in the order of the requests: a page matches it by
  the id. The page never gets its own edit back; the other sessions on the path hear it at once, in
  the page. A write the place refused is answered with the text the place has, once the last write
  of that path settled, and not at all where the page was told a text since it made that write. One
  path is one subscription at the host however many nodes show it.
- **A version of a text.** The host counts it and the page only repeats it. `board.text.opened`
  carries 1, and every `board.text.update` of that open text one more: a change from outside, a
  file that is back, the answer to a refused write. The page's own edits do not count.
  `board.text.edit` carries the last version the page heard, and the server hands the edit to the
  place only while that is still the last version it told, asked when the edit's turn comes. An
  edit made on an older version crossed a text the page had not heard of: it is dropped, the place
  keeps its text, and the update that is already on its way puts that text in the edit's place on
  the page. So after a crossing, page and place hold the same text, and it is the outside's. No
  outside change is lost. The page's own edit is in neither, and the person sees it go, because the
  editor imports the text that took its place; nothing says so in words. The outside wins because
  an edit is a whole text and the board has no text merge. A dropped edit gets no answer of its
  own: that would be one more version and would cost the page whatever it wrote after it heard the
  first. The count is the server's, per open text and per life of a page (a text that is closed and
  opened again starts at 1); a backend never sees it. A change that brings the text the place
  handed out last (a save, an echo that comes late) is no version and no message, unless the file
  was gone.
- **A hello starts the life of a page.** A second hello on the same channel (a reloaded webview)
  closes what the page before had open and sends the list again; an answer that was awaited across
  it is never sent. A hello of another protocol is none: every request is then failed with a
  message that names both numbers. A request before the hello is answered with `board.failed` ("the
  page has not said hello"); an edit and a close before it are dropped. The client says hello once,
  when it is made, so a server listens before the page starts.
- **Paths.** `repoPath` refuses whatever is no repository-relative path with forward slashes (no
  string, empty, more than 1024 characters, a backslash, a control character such as a NUL or a
  line break, a scheme or a drive letter, an absolute path, an empty segment) and every path with a
  segment that starts with a dot, at every depth: `.`, `..`, `.git/config`,
  `.github/workflows/ci.yml`, `.vscode/settings.json`, `.env`, `models/.drafts/tea.owm`. A model in
  a dot folder is on no board. The server runs it on every path before a backend sees one, and
  answers a dot path with a message of its own. A backend refuses a path that is in use: the server
  does not check the list.
- **What a page may reach.** A page reaches only what a board can show.
  `serveFiles(channel, backend, rule)` and `connectBackend(backend, rule)` take the host's rule
  (`FilesRule`: `model(path)` and `picture(path)`), and it is not optional, so that no host forgets
  it. A text is opened only for a path the rule calls a model; bytes are read, and a new file is
  stored, only for a path it calls a picture. A path the rule refuses never reaches the backend and
  is answered with a message of its own. The page is told no other path either: the list, the
  changed bytes and the moves are sent without the paths a board does not reach (a move only where
  both of its paths are reached; a file that moves out of reach is gone for its readers). An edit
  is written only into a path that is open, and so was checked. `suffixRule({ models, pictures })`
  is the rule by the end of a file's name, as `bySuffix` reads it: a host passes the suffixes of
  the editors it shows and `PICTURE_SUFFIXES`, the suffixes the board draws. The files package
  cannot import the board, and `packages/host/test/files-host.test.ts` holds that list against the
  board's `IMAGE_TYPES`. A board file is no model by any host's rule here: its text is never opened
  through the port (see [The VS Code extension](#the-vs-code-extension-appsvscode)).
- **A new file** is taken only as `assets/<name>` with a name of letters, digits, dot, dash and
  underscore, which is what the board makes of a picture's name, only as a picture by the host's
  rule, and not as a dot file (`.gitignore`), a name that ends in a dot, which Windows drops, or a
  device name of Windows (`nul`, `con.png`, `COM1.svg`). Its bytes are a base64 text: any other
  value is refused, where `atob` would take `null` for the four letters of its name and store three
  bytes. They are at most `NEW_FILE_LIMIT_BYTES`, 10 MiB, the board's own limit for a picture;
  `packages/host/test/files-host.test.ts` holds the two numbers equal. A type that is no text is
  taken for none. One refused name is one the board itself makes: a picture a person called
  `aux.png` or `con.png` is answered with "a new file cannot have this name", which the board puts
  into its notice.
- **What the checks do not do.** They read the path's text and nothing else. A name with percent
  signs (`%2e%2e/secret`) and `models/tea.owm.` pass `repoPath` and fail the rule; a path through a
  link that leads out of the root, and a name the file system folds onto another one, pass both.
  Such names are another case, a dot or a space at the end on Windows, and two that name a dot
  folder without a dot at the start of a segment (by a review's reading, not run: its machine was
  Linux, where both ended in "does not exist"): a short name of NTFS (`GIT~1/hooks/x.owm` is a
  file in `.git` there) and a code point HFS+ leaves out of a name (U+200C before `.git`). The
  suffix rule holds for them too, so only a model or a picture in a dot folder would be reached,
  and a page makes a new file nowhere but under `assets/`. Refusing a segment with `~` and a
  digit, or every format character, would also refuse honest names (Persian writes U+200C inside
  words): the owner's to settle. A backend with a disk checks what a path's text
  cannot say: that no link is on the way to the file and the file is none, its size, and that a
  create never replaces a file. The memory backend has only its own files.
- **Writes.** A place gets the writes of one path one at a time and in the page's order, and
  `close()` after the last of them, also when the page went in the middle of one. `false` and a
  rejection both mean refused. `write(text, base)` names the text the write was made on: the one
  the place handed out last, through `text()` or `onChange`. The server reads `text()` again after
  every write the place took, since a place may make its own text of a write (line breaks), so
  `base` is always a text of the place's own and a plain comparison is right. A place that has
  another text by the time it writes resolves false, as the memory backend does, or the write would
  replace a change nobody was told of; the page is then told the text the place has. `onChange` is
  never the echo of a write: every call is a new version, and what the page wrote on the version
  before is dropped.
- **Waiting for the writes, and a page that goes.** `BoardFiles.settled()` posts
  `board.text.settle` behind the page's edits and resolves once the host dealt with every write
  made before the call: each is in the place, was refused there, or was dropped as made on an older
  text. It rejects when the files are closed first. It is a round trip to the host, so in a page
  nobody answers it stays pending until `dispose()`: whoever awaits it before a dispose must be
  able to give up. An edit that reached the server lands though its page goes right after it (a
  dispose, a second hello, a webview that closes): the text is closed after the write. An edit the
  host never received, posted in the task in which the channel ended, is lost. A page that ends on
  purpose awaits `settled()` first.
- **A session's write says what it was made from.** `TextSession.write(text, base)`: where the path
  has another text than `base` by now, the write is dropped, since its writer was told that text
  and has not taken it in yet. Without `base` a write counts as made on the text the path has. The
  binding of `packages/host` always passes it.
- **A file that goes.** Its sessions hear `onAvailable(false)` and keep their text; a write does
  nothing meanwhile; when the file is back they hear `onAvailable(true)` and then its text, which
  is a new version. A reader that comes while the file is gone is rejected with `<path> is gone`: a
  session cannot say that its file was gone before it was made.
- **`connectBackend`.** Each message is a task: `paths()` is empty until the hello was answered,
  and `onPaths` says when the list is there. `dispose()` ends client and server in one call and
  drops what the page posted in that task.
- **Messages a node may show** (the facade prints them behind "This file could not be opened.").
  From the server: "this path is outside the repository", "a board reaches no dot file and no file
  in a dot folder", "`<path>` is no model a board shows here", "`<path>` is no picture a board
  shows here", "a new file goes into assets/", "a new file cannot have this name", "the bytes of
  the new file are no base64 text", "a new file may have up to 10 MiB", "`<path>` is gone", "the
  page has not said hello". From the client: "the files were closed". From the memory backend:
  "`<path>` exists already", "`<path>` is no text file of this repository". From the VS Code
  backend: "this board is in no repository and in no open folder, so it has no files", "`<path>`
  does not exist", "`<path>` is behind a link, and a board opens no link", "`<path>` is a link,
  and a board opens no link", "`<path>` is no file", "`<path>` is larger than 2 MiB, too large for
  a board", "`<path>` cannot be read as a text", "`<path>` is behind a link, and a board reads no
  link", "`<path>` is a link, and a board reads no link", "`<path>` is larger than 10 MiB", "assets is a
  link, and a board stores nothing through a link", "assets is a file, so a new picture has no
  folder", "`<path>` exists already". From an extension that hands a board no backend: "this board
  has no files".
- **Known and not cured.** A crossing is settled for the outside and never merged: the edit that
  crossed is dropped whole. The protocol has no acknowledgement of a write the place took: a page
  learns that its writes are dealt with only through `settled()`. Where a place makes its own text
  of a write and tells no change (line breaks in a CRLF document), the page shows the bytes it
  wrote and the place has its own, until the next update; the next write is made on the place's
  text, so nothing is refused for it. `TextSession` cannot be asked whether its file is there. The
  memory backend's `writes` is a log for tests and grows with every write: whoever keeps a backend
  for long empties it, as the web app does.
- **Nothing bounds how much a page asks of a host**: how many new files it stores, each up to 10
  MiB, how many reads it has on their way at once, and, in the server itself, how long a written
  text is. A review made each as a page that is not the board's would. On the fake VS Code, 400
  new files of 1 KiB and 20 of 10 MiB were each answered `board.done`, and 5000 edits in a row
  were applied one by one. In a real VS Code 1.146.0, 12 new files of 10 MiB were on disk after
  1.07 s, and 60 reads of one 10 MiB picture were answered after 28.8 s, while the extension host
  grew from 210 MiB to 904 MiB and VS Code wrote "UNRESPONSIVE extension host" into its log twice;
  the page and the extension answered afterwards. The size of a written text is a backend's to
  bound, and the VS Code backend does since the closing round of the second increment
  ([The host half](#the-host-half)). A budget for the new files of one open editor (a count and a
  sum of bytes, kept across a second hello, then `board.failed`) and the reads of one path
  answered together, a few at a time, are not built: either number also meets a person who adds
  many pictures in one sitting, so both are the owner's to settle.
- **Without a test:** `port.start()` in `local.ts`, which only a browser needs (the browser files
  of `packages/host` and of the apps run through `connectBackend`), and the two `port.close()`
  calls there. Of 110 single edits of the first increment's sources those two passed. Of 75 single
  edits of the lines the second increment changed (66 against the unit tests, 9 against the browser
  files of `packages/host` and `apps/webapp`), none passes.

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
- **The binding (`bindTextSession`).** Imports run one after the other and read the session's text
  when they start, so the canvas always ends on what the file has: a text that waited behind a
  gesture or behind another import is not imported over what this session wrote meanwhile. A
  re-import keeps the view: the view state the contract answers, while the picture is drawn anew
  and its scale may come out rounded (Value Chain's first fit drew 0.759596, the re-import 0.76). A
  change on the canvas is one write, and none when the text did not change, before the first text
  was accepted, while the last text was refused, or into a read-only file. Every write names the
  text of the file it was made from (`session.write(written, base)`): where the file has another
  text by then, the session drops the write, and the import of that text, which waits behind a
  gesture or behind another import, takes the canvas to what the file has. A change from outside
  waits for the end of a gesture the person holds (`interaction`). A host with another kind of
  document passes its own `BindModel` to `embedModeler`; the adapter fits on the first
  `{ kind: "ok" }` such a binding reports.
- **A change from outside under a held gesture wins.** A change from outside that arrives while a
  person holds a gesture waits for its end. The drop is made from the text before that change, so
  the session drops it: the file keeps the outside's text, the canvas imports it when the gesture
  ends, and the person sees the item back where it was. Nothing says so in words. The contract asks
  for a merge there, and the board has no text merge. Before the second increment the drop was
  written over the outside's text.
- **What the adapter writes** on the `.board-engine` it is given, classes and data attributes
  only: `data-embed="diagram-js"` and `data-notation` once the editor is mounted,
  `data-embed-state` = `loading`, `ready`, `invalid`, `gone` or `failed` from the first moment,
  and two children, `div.board-host-state` (what the node says about its file) and
  `div.board-host-editor` (the modeler's host element: absolute, inset 0, clipped, a stacking
  context of its own). It sets no position and no size on the element, and takes everything back
  on destroy.
- **The states.** `loading`: the code or the text is on its way; the board has no loading look, so
  the facade says it in the element. `ready`: the canvas shows the file. `invalid`: the modeler
  refused the file's text; the last canvas stays in sight under a line whose `title` is the
  modeler's reason, nothing is written, and the next valid text is imported. `gone`: the file went
  away; the board keeps the node, and the file's next text brings it back. `failed`: the editor
  could not be made (a path outside the repository, a file that is no text, code that did not load,
  another notation), with the message. While the state is `invalid` or `gone` the editor is
  `inert`: a change of such a canvas could not be written and the next text would replace it. A
  file that could not be opened is asked for again whenever the list of paths changes and has its
  path: a checkout, a file made beside the board. The facade listens to `onPaths` for it, one try
  at a time, and shows no loading line for a later try. `ready` stays as the first try settled it,
  so `runtime.mounted(id)` stays false and the board's log keeps the first message, while the
  element shows the editor. A path the host refuses is on no list and is never asked for again. Not
  cured: a node mounted on a path whose file is gone under another node's open session asks one
  message too early and waits for the next change of the list; and a file that is listed and could
  not be opened is asked for again only when the list changes, not when its content does. The line
  of an invalid file reads "This file cannot be shown as it is. Open it in its own editor to repair
  it." (`INVALID_TEXT`), which is true in a host that has such an editor, as VS Code is. A host
  that has none passes its own sentence: `invalidText` of `createFilesHost`, `modelsFrom` and
  `openEditor`.
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
- **The host from files.** `createFilesHost({ files, editors, containHistoryKeys?, invalidText? })`
  gives the board `models` and `images` and keeps them the same objects; `dispose()` ends what it
  listens to on the port and leaves the port to its owner. The model list is the port's paths with
  a registered suffix, the same array until the port has a new list. `describe(path)`: the kind is
  the entry's, the title is the file name without the matched suffix, `<name> in <folder>` where
  two listed files share the name, and with the suffix kept where they also share the folder (the
  example's `sample.tt` and `sample.cm` are titled "sample.tt in models" and "sample.cm in
  models"). `open()` answers undefined for a path without an entry, a `.board` among them. A file
  that moves is followed with `context.relocate`: one change of the board per node that shows it.
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
- **The build helpers (`build/`)**, for Vite, Vitest and esbuild. `aliases.mjs` reads the folders
  under `modelers/*/packages` and maps each package name to its `src/index.ts`, every exported
  subpath of a package before the package (39 entries over 27 packages), so that no other modeler
  is built first. `prebundle.mjs` names every third-party module those sources load (82), for
  `optimizeDeps.include`: a dependency Vite meets only when a notation loads would reload the page
  in the middle of a run or of an edit. `css-base.mjs` is under
  [Stylesheet and theme files](#stylesheet-and-theme-files). A new package under any modeler's
  `packages/` adds an alias, and `apps/editors/tsconfig.json` then needs the matching path, or
  `aliases.sync.test.ts` fails for a change made in another modeler.
- **`webviewBundle` (`build/esbuild.mjs`)** is the set of esbuild options the VS Code webview is
  bundled with: every package of the suite from its source (`esbuildAlias`), the base-once plugin,
  the automatic JSX runtime, React's production build in a watch build too
  (`process.env.NODE_ENV`), and the font files beside the bundle under `fonts/`. The caller adds
  its entry, its output and `format: "iife"`. It sets no `tsconfigRaw` on purpose: esbuild then
  reads the tsconfig next to each source file, so every modeler's sources are compiled as in that
  modeler's own bundle and in strict mode, as the modules they are in the browser tests. With a
  `tsconfigRaw` the same build came out with 788 fewer `"use strict"` directives and otherwise the
  same bytes, and Team Topologies and Context Maps would be compiled under another
  `verbatimModuleSyntax` than their own. `test/webview-bundle.test.ts` builds a page that loads the
  fonts, the board and the seven notations through the registry in memory, and holds: one script
  without a dynamic import left, one sheet with diagram-js's base rule and the canvas mapping once
  and before every renderer's own rules, the font files as files, no warning; eight single edits of
  the helper fail it. A build that imports the shell prints esbuild's `ignored-bare-import` warning
  for the shell's own chunks (four in a webview bundle, one in a host bundle), as every modeler's
  does: a warning is no failed build there.
- **The notices (`build/notices.mjs`, `notices-build.mjs`, `notices-check.mjs`).** A build of the
  board carries the seven renderers and whatever they bundle, so its third-party notices are no
  list kept by hand and no committed file, where the seven other modelers commit
  `apps/vscode/THIRD_PARTY_NOTICES.md` and regenerate it with `npm run notices`: the build writes
  them from the files that went into it. `composeNotices({ product, files, outputs })` takes the
  absolute paths a bundler names and gives the text, the licence files to write beside a bundle,
  and what is wrong. A file belongs to the last `node_modules/<name>` on its path (so
  `preact/hooks` is preact) or, outside `node_modules`, to the nearest workspace of the suite.
  Every package of npm gets a section `## name version (licence)` with every licence, notice and
  copying file of its folder; the workspaces of the suite stand in one last section under the
  LICENSE they share, without versions, so a release changes nothing. Three things no bundler sees
  are said in the module: `INLINED_BY_UPSTREAM` (dagre's published build has graphlib inside),
  `COPIED_WORKS` (Lucide, Material Icons and Tailwind's preflight, each found by a mark in the
  bundled sources of the suite, with the legal comments those sources carry) and `SHIPPED_LICENCES`
  (0BSD, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, MIT, OFL-1.1: what the bundles hold today
  plus 0BSD. Nothing in the suite names an allowed list and CI's dependency review runs with its
  defaults, so this list is the board's own and the owner's to confirm). A package offered under
  several licences is taken under the first one on the list, and its section says so (DOMPurify,
  `MPL-2.0 OR Apache-2.0`: Apache-2.0). `writeBundleNotices` is esbuild's way (the metafile: every
  input with a byte in an output, and every font), `noticesPlugin` Vite's (the modules of the
  chunks, the sources of the emitted assets, and what the sheets import, which Vite inlines and
  names nowhere). The two texts under `build/licences/` are the Apache License as Context Maps
  keeps it and the LICENSE of tailwindcss 4.3.5, the version `board-base.css` names.
- **What stops a production build** of the extension or of the web app, each with a line that
  names it: a bundled package under a licence that is not on the list, or without a licence file; a
  legal comment (`/*!`, `@license`, `@preserve`) in a bundled source of the suite that no entry of
  `COPIED_WORKS` answers; a licence file that a bundle names and that lies beside no bundled file.
  The C4 chunk keeps dagre's comment "For license information please see
  dagre.esm.js.LEGAL.txt", so that file is written beside the script that names it. The third
  reason reaches the other modelers: a renderer that adds such a comment for a new copied work
  fails the board's builds until `COPIED_WORKS` has an entry for it (a mark, a sentence, and its
  licence text: an installed package of the same work, or a file under `build/licences/`). With the
  path rule of CI that shows in the pull request that adds it ([Commands](#commands)).
- **The check (`build/notices-check.mjs`).**
  `checkBuildNotices(directory, { fileName, bundled, works })` reads a build and fails for three
  reasons: a script or sheet names a licence file the build does not hold beside it; a package
  that is in the build, or a work that is copied into one of its sources, has no section; or a
  section, a bundled package or a copied work stands under a licence that is not on the list or
  not its own. Which packages and which copied works are in the build is evidence the caller
  brings and never the notices themselves. The extension's check measures its two production
  bundles again in memory, which names every input, a sheet and a font among them. The web app's
  reads the build's source maps, and for the copied works the sources of the suite those maps
  name, so a work that a source names in a plain comment, which no bundle keeps, is found. Maps
  name scripts only: the web app's check holds no package that brings only a sheet or a font and
  no work that is copied into a sheet (the two Geist packages and Tailwind's preflight). Those
  are held when the build is made, not afterwards. A build without maps and without a measurement
  does not pass. Both checks are in CI's chain: the web app's in its `check:build`, the
  extension's behind `package:vscode`.
- **Named for the owner, and not in the notices.** The Business Model Canvas layout is CC BY-SA
  3.0 (Strategyzer AG): its renderer draws the attribution on every canvas and the extension's
  README names it, and the notices have no section for it, as Business Model Canvas's own have
  none. `path-intersection` (MIT) ships a NOTICE that its code is derived from Snap.svg (Adobe,
  Apache-2.0), which the board's notices quote. Three renderers say in a plain comment, not a
  legal one, that they carry copied icon geometry (Event Storming and Team Topologies for Lucide,
  Wardley Maps for its Material Icons paths): the marks of `COPIED_WORKS` find them by the words of
  those comments. Without a kept test: the direct run of the extension's `esbuild.config.mjs` and
  of `scripts/check-notices.mjs` as wholes (their parts are tested, and both were run on real and
  on tampered builds), a source map with a `sourceRoot`, an unquoted `@import url(...)`, and
  Windows paths. 41 single edits of the generator, its two bundler ways, the check and the VSIX
  reader were tried by the part that built them: each fails at least one test.
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

The web app is the board inside the suite's shell, in the shell's web column, mounted through
`mountBoardEditor` of `apps/ide-editor` as the VS Code webview mounts it. One document is open at a
time: the example (`modelers/board/example` as a repository in memory), or a board that was made
new or opened from a file, which has no repository behind it. There is no disk behind the page:
what is open, and what a person changed of the example, is kept in the browser's local storage,
and a board leaves as a download. The board keeps its toolbar beside the shell's menu and zoom
panel, as in VS Code
([Three deviations under the shell](#three-deviations-under-the-shell-each-with-an-end)). There is
no drop zone: the board takes a dropped picture itself.

- **`startApp(root, { storage, search, komet })`** (`src/app.ts`; `src/main.ts` calls it with
  `window.localStorage`, or a store in memory where the browser blocks its own, `location.search`
  and the address of `public/miragon-komet-blau.svg`, and publishes the app as
  `globalThis.__boardApp`, for the console and the e2e suite). It returns
  `{ ready, editor(), shown(), settled(), destroy() }`. `editor()` is the `BoardEditor` of the open
  document: another one after New, Open, Show example and a reset, and a throw in the moment
  between two documents. `shown()` is `"example"` or `"board"`. `settled()` resolves once
  everything asked of the page so far is done. Every document gets an editor of its own, because
  the files a board reaches are fixed when the board is made: the page ends the open editor
  (`editor.destroy()`, then `files.settled()`, then `files.dispose()`) and mounts the next into the
  same element, one thing after another on a queue. `destroy()` returns a promise and ends the same
  way, so an editor's last write is kept before its files go; it takes the page's file input and
  listeners away and puts the page's title back.
- **The parts.** `web-host.ts` (`webEditorHost(document, column)`: the three members
  `mountBoardEditor` asks of a host. `canvasOwnsHistory` is true. `mountShell` mounts the shell
  with `host: "web"`, the File group, the legal line, the start screen and the page's own Model and
  Export entries. `connectDocument` hands over the page's one text at the mount and tells every
  change of the board back as its text; a text the board refuses is replaced by `fallback` where
  the page gives one, as the example does, and stays refused and locked where not). `column.ts`
  (`webColumn`: what goes into the shell's web column). `session.ts` (`mountExample`, `mountBoard`:
  one open document with its editor, its files and its line for the status box). `actions.ts` (the
  start, New, Open, Show example, Reset the example, the download). `page.ts` (the hidden file
  input `input[data-board-app="open"]`, the two file keys, the model picker). `board-file.ts` (the
  download's name, a file as a board text, `holdsNothing`, `namesFiles`). `no-repository.ts` (the
  files of a board without a repository). `storage.ts`, `keeping.ts`, `reach.ts` and `example.ts`
  are as the first increment built them, with `createOpenStorage`, `snapshot()` and `restore()`
  added to the storage.
- **The start.** The document of the last visit is opened again without a word (key
  `miragon-board:open`: `{ kind: "example" }` or `{ kind: "board", name?, text }`, outside the
  example's prefix, so a reset of the example leaves it). Without one the page shows the shell's
  start screen ("Board Modeler", "Start a new diagram, or explore the example.", the Miragon mark
  from `public/`, New diagram, Show example and the link "Open a file…" with its key) over a new,
  empty board that is mounted already: New diagram only leaves the card and hands the board the
  keys. The sentence and the button are the shell's shared terms, so the card says "diagram" where
  the thing is a board. A kept board text that is no board any more also ends on the start screen,
  with the toast "Couldn't restore the board of your last visit. Start a new board or open a
  file."; the text stays under its key until another board is kept. `?reset` in the address forgets
  what is kept of the example and opens it, and `main.ts` then takes it out of the address. Where
  the visit would have opened a board of the person's own, the request replaces that board like
  Show example does, so the toast "Board replaced" offers it back with Undo; a kept text that is
  no board is not offered, and the example takes its key.
- **The shell's column.** File: New diagram, Open… (Ctrl or Cmd + O), Show example. Model, for the
  example only: "Reset the example" (`reset-example`, enabled on a locked board too). Export:
  "Export as .board" (`export-board`, Ctrl or Cmd + S). Help: "Keyboard shortcuts…", whose dialog
  lists the two file keys in a group File. The legal line carries a GitHub link to
  `modelers/board`. The page binds the two keys itself, on the window in the capture phase, since a
  note that is being typed stops its keys on the way up. Ctrl or Cmd + S first leaves a text field,
  so the note that is being typed is in the file, and does nothing on the start screen. The
  download's name is the opened file's, `example.board` for the example and `untitled.board` for a
  board that was made new; a toast says "Exported <name>." The page's title is
  `<file name> · Board Modeler`, and `Board Modeler` for a board without a file.
- **Replacing asks nothing and offers back.** New, Open and Show example replace the open document
  at once. A board that holds an element is kept as text and offered back by a toast "Board
  replaced" with Undo, until the first change of what replaced it. The example needs no offer: its
  changes stay in the browser. "Reset the example" offers what was kept of the example back the
  same way ("Example reset", Undo; `AppStorage.snapshot()` and `restore()`).
- **A board without a repository** (made new, or opened from a file). Its files are
  `connectBackend(noRepository(), REACH)`: the list is empty, a text is refused with the page's
  sentence, bytes are not there, a new file is refused. A model node reads, through the host
  package's state for a file that could not be opened, "This file could not be opened. This board
  was opened as a single file. Its models are files of the repository it came from, and this page
  has only the board." An image node shows the missing-file figure ("No such file in the
  repository"). A picked, pasted or dropped picture gets the board's notice "<name> was not added:
  this board has no repository to keep a picture in. Show the example to try pictures on a board."
  The model picker offers nothing, and it is the renderer's, so the page says why in a toast when a
  person goes to it, by a press or by the keyboard: "This board has no repository behind it, so
  there is no model to add. Show the example to try models on a board." A file that names a model
  or a picture is opened with the warning "“<name>” was opened as a single file: the models and
  pictures of its repository are not shown." The empty-file hint reads "Add a note or a group from
  the toolbar to start." A file that is no board leaves the open board as it is: "Couldn't read
  “<name>”. <the reader's reason>. Check that it is a .board file." The board is kept with its
  file's name on every change; a board without an element is not kept, so a reload shows the start
  screen again.
- **The example** (what Show example opens, and what the web app was before the third increment):
  `createMemoryBackend` from the folder and what is kept, wrapped (`src/keeping.ts`) so that every
  write the backend took and every new file is kept, `connectBackend` with the page's rule `REACH`
  (`src/reach.ts`: the suffixes of the suite's table as models, `PICTURE_SUFFIXES` as pictures;
  `example.test.ts` holds that every file of the example is reached, a model as a text and a
  picture as bytes), and the seven editors of `SUITE_EDITORS`. After Show example a toast says "The
  example repository is kept in this browser. “Reset the example” in the menu starts it over." Its
  lasting lines stand in the shell's status box, with the severity warning: "This browser did not
  keep all of your changes: its storage is blocked or full." (for the rest of the page's life, for
  a board without a repository too), "A picture of this board is missing: this browser did not keep
  it." (until that node is removed) and "The board kept in this browser could not be read. This is
  the example." (until the first gesture replaces the kept text). No test holds that the page hands
  `REACH` and not another rule to `connectBackend`: with the example's files the difference cannot
  be seen from the page.
- **The sheets** are imported by name in `src/app.ts`, in this order:
  `@miragon/modeler-shell/shell.css`, `@miragon/board-renderer/assets/board.css`,
  `board-suite-editors/base` (diagram-js's sheet and the canvas mapping once, then the host
  package's `embed.css`), `board-ide-editor/app.css`. The fonts are imported in `main.ts`, and each
  renderer's own sheet comes with the chunk of its notation. The app has no sheet of its own: the
  shell's own-document rules size the page. `index.html` has `class="cd-shell-document"` and
  `data-cd-theme="light"` on `<html>`, links `public/favicon.svg` (the official Miragon icon, the
  bytes Business Model Canvas's web app links, until the board has a modeler icon of its own) and
  carries the marker `<!-- miragon-mode -->`, which `vite.config.ts` replaces with the shell's
  `webHeadMarkup`: one theme-color from the renderer's vendored tokens and the contrast line.
  Nothing above the board carries a transform, a filter, a perspective, `contain` or `will-change`,
  and a test walks the ancestors.
- **Storage (`src/storage.ts`).** The open document is under `miragon-board:open`. The example is
  under `miragon-board-example:board`, `miragon-board-example:text:<path>` and
  `miragon-board-example:bytes:<path>` (JSON `{ mime, base64 }`). The example's own text is kept by
  removing the key, so a change that was undone leaves nothing behind. A kept entry that fits no
  file of the example is left out: a text for a path the example does not have, bytes outside
  `assets/<name>` or over a file of the example, a value of another shape. A kept board text of
  the example that the board refuses is answered with the example and the line above; the kept
  text stays until the first gesture replaces it. Two tabs on one storage are not told apart: the
  last write wins.
- **Pictures and the room of the storage.** A picture is kept when it is stored, and its node may
  go a moment later. Within one life of the page an undo brings the node back, so the bytes stay;
  when the example is next mounted the app forgets every kept picture that no image node of the
  kept board shows (`picturesOf`, `forgetPictures`; a kept text that is no board forgets nothing).
  A storage that throws never stops the app: the save answers false and the status box says so for
  the rest of the page's life, whatever a later save does. A picture the browser had no room for is
  drawn until the page goes; after a reload its node shows the missing-file figure and the status
  box names it, until that node is removed. The room is the browser's and the app names no number:
  in Chromium a review of the first increment saw a PNG of 4.3 MiB drawn and not kept, about 3.7 MB
  of pictures for one site.
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
  `encodeBoard(parseBoardText(text))`. The same folder is the fixture of the webview test page and
  of the smoke in VS Code, so its second note speaks of the web app's menu there as well.
- **The build check.** `npm run check:build -w modelers/board/apps/webapp` after the build runs
  `scripts/build-problems.mjs` on `dist`, then the notices check of `apps/editors`. It fails unless:
  `<html>` has `data-cd-theme="light"` and `class="cd-shell-document"`; the mode marker is
  replaced, with a theme-color and the contrast line; the sheet the page links carries a
  `.board-root` rule (the board's sheet), a `.cd-shell-legal` rule (the shell's), the start margin
  on `.cd-shell .board-root .board-toolbar` (the rules that make one picture of the two) and the
  preview rule on `.board-engine[data-armed=false][data-embed=diagram-js]`; diagram-js's base rule
  `.djs-context-pad.open{display:block}` is in that sheet exactly once and in no notation's sheet;
  each of the seven renderer root classes is in some sheet and none comes before the first
  `.djs-context-pad.open`; every file of `example/` is in a script (the check looks for the file's
  longest run of plain characters, `exampleMarker`, and fails for a file without a run of 16); a
  script carries React's production build ("Minified React error #") and none a development build
  ("react-stack-top-frame"); the scripts keep the legal comment of `lucide-react`, of the shell and
  of the Wardley Maps, Context Maps, Value Chain, C4 and Business Model Canvas renderers (seven);
  and `dist` holds `miragon-komet-blau.svg` and the icon `index.html` links. Each of these 40
  markers was taken out of a build once, and the check failed each time.
- **The notices of the build.** `vite.config.ts` has `noticesPlugin` of `apps/editors`: a
  production build writes `dist/THIRD_PARTY_NOTICES.txt` (47 packages of npm, three copied works,
  29 workspaces of the suite) and `dist/assets/dagre.esm.js.LEGAL.txt`, the licence file the C4
  chunk names, and fails when the notices are not whole
  ([The suite's editors](#the-suites-editors-appseditors)). `check:build` then holds the build
  against its own source maps (`checkBuildNotices`): 73 bundled packages and the two copied works
  the maps name, Lucide and Material Icons, against the 51 sections of the file. Tried on the real
  `dist`, each once: without the notices file, without the licence file, with the section of `yjs`
  or of Lucide cut out and with `react-dom` relabelled GPL-3.0-only the check exits 1 and names
  it. `test/build-config.test.ts` loads the Vite config and holds the three
  things this rests on: the plugin, in a build only; the source maps, which are the check's
  evidence; and the legal comments kept. Maps name scripts only, so the two Geist packages, which
  bring a sheet and fonts, and Tailwind's preflight, which is copied into a sheet, are held when
  the build is made and not by the check: with one of those three sections cut out of the built
  file the check still passes. Nothing in the page links the file: it is at
  `/THIRD_PARTY_NOTICES.txt` of the built app.
- **The e2e project.** `e2e/playwright.config.ts` has two projects. `webapp`
  (`**/webapp/**/*.spec.ts`, base URL `http://localhost:5184`, `E2E_PORT` overrides) runs on
  `npm run dev -w apps/webapp -- --port 5184 --strictPort`; `vscode-webview` is under
  [The webview test page and the project `vscode-webview`](#the-webview-test-page-and-the-project-vscode-webview-e2e).
  Playwright starts every `webServer` entry, so either project starts both dev servers. Outside CI
  it takes whatever answers on a port for the app, which is how the project was also run against
  the built app (`vite preview` on 5184: 8 passed). `e2e/tests/webapp/board.spec.ts` has 8 tests:
  a fresh page on the start screen with the legal line and nothing kept; the example with its seven
  models ready; a change kept over a reload, the reset from the menu with its Undo, and `?reset` in
  the address; New diagram, and a reload that keeps a board once it holds a note; Open with a file
  the test hands to the browser's file dialog, from the start screen and from the menu, a file that
  is no board, and a reload; the download's bytes equal to the board's text, from the menu and by
  the key, also for the example; and a window of 600 px and of 400 px with no horizontal scroll and
  the toolbar clear of the menu trigger, the zoom panel, the legal line and the attribution. The
  project runs the board's own specs and not the shell's conformance kit (the deviation above).
- **Without a test of the web app itself:** a pasted or a dropped picture on the example (a picked
  one is held; paste and drop are held on the renderer's test host), a group or an arrow made by
  hand, Done and a zoom of the board as the end of an edit (both held for the seven modelers in
  `apps/editors` and on the stand-in in `packages/host`), and a second node on the same file (held
  for Wardley Maps in `apps/editors` and on the stand-in). A review of the first increment did each
  of them once in the served page with Playwright's mouse and keyboard, a dropped picture excepted,
  and each worked. Nothing holds that a mount that fails ends its files port. 21 single edits of
  `apps/webapp/src` and `apps/ide-editor/src`, applied one at a time, each fail a browser file.
- **In a window narrower than a model node the armed editor is cut.** A model is edited at board
  zoom exactly 1 (the arm rules), where a node of 800 px does not fit. At 400 x 800 the review
  found the armed Wardley node at left -327 px, the left half of the editor and of its palette off
  the window; at 760 x 600 at left -64 px, with its header under the board's toolbar. A pan of the
  board reaches the rest, and a delete and Done work in both. Arming at the fitted zoom where a
  node does not fit is a change of the measured arm rules and the owner's.
- **A file its modeler refuses** shows, in the example, the web app's own line (`invalidText`):
  "This file cannot be shown as it is. “Reset the example” restores it, and undoes every other
  change.", since the page has no editor for the file and the reset is the one way back
  (`app.browser.test.ts` holds the line on a kept Value Chain text that is no JSON). The app itself
  writes no such text; the review got there by writing the storage by hand, and found that Wardley
  Maps and Event Storming take the same garbage for an empty canvas in the state `ready`.
- **Known and not cured.** In a window of 400 px the shell's status box (116 to 181 px from the
  top) lies over the third row of the board's toolbar (to 135 px) while a lasting line shows; at
  480 px and wider it is clear (measured by the part that built the page, in a scratch spec with a
  storage that refuses). On a board without a repository the Image button stays and can only
  refuse, and the model picker says nothing itself: both are the renderer's, which has no place for
  a host's words there. The line of a model on such a board stands on the danger ground of a failed
  file, though a board without a repository is no failure: the host package has no state of its own
  for it. The renderer shows the name of a lazy part as text while it loads (`.board-slot`, the
  word "Toolbar"); behind the start screen a rule of `app.css` hides it, elsewhere it shows for a
  moment at the first load. The board's toolbar fits a window from 400 px: its box is 335 px wide
  from x 64 at 400, 360 and 320 px alike, so at 360 px the model picker is cut by 39 px and at
  320 px by 79 px, with no horizontal scroll (measured by the review of the third increment and
  again when the increment was closed; the e2e spec holds 600 and 400 px). The cure is a wrap
  inside the toolbar's group of add actions, the renderer's. The toast after Show example (480 x
  61 px at the bottom centre of a window of 1280 px, for about six seconds) lies over the lower
  row of models, and a double-click on a model under it arms nothing until the toast is gone; in
  a window of 320 px it appears under the pointer that pressed Show example and stays while the
  pointer rests on it (seen by the review; where a toast stands is the shell's). A model node
  whose file could not be opened can still be armed: on a board opened from a single file a
  double-click on such a node shows Done and the node at 100 %, with nothing to edit, and Done
  ends it (the renderer's and the host package's). The page's icon is the Miragon icon and not a
  modeler icon. No link in the address carries a board, there is no Share action, and no export
  but the board file.
- **Not known for it:** more than a handful of model nodes at once, any browser but Chromium, and
  touch.

## The board inside the shell (`apps/ide-editor`)

`mountBoardEditor(host, { root?, files?, editors, containHistoryKeys, invalidText?, fileKeys? })`
(`src/board-editor.ts`) is for the board what the shell's `mountIdeEditor` is for a modeler on
diagram-js, without its diagram-js lines. `host` is a `BoardEditorHost`,
`Pick<IdeEditorHost, "canvasOwnsHistory" | "mountShell" | "connectDocument">`: the shell's
`IdeEditorHost` fits (`vsCodeEditorHost()` in the webview), and a web app brings the three members
itself, with a `mountShell` that adds the shell's web column
([The web app](#the-web-app-and-the-example-appswebapp-example-e2e)). `invalidText` is the host's
own line for a model its editor refuses (absent: the host package's, which sends a person to the
file's editor). `fileKeys: true` lists a web app's two file keys in the shortcuts dialog, in a
group File before the board's own (`boardShortcuts(chrome, { fileKeys })`; `BOARD_EXPORT_LABEL` is
"Export as .board"). It
mounts the shell through `host.mountShell` into `root` (default: the element with the id `app`)
with the themes `["light"]`, a Help entry "Keyboard shortcuts…" (`shortcuts.ts`: the board's own
keys and gestures; the shell adds its zoom and fit keys itself) and the empty-file hint "Add a
note, a group or a model from the toolbar to start.", which shows while an accepted board has no
node. With `files` it builds `createFilesHost({ files, editors, containHistoryKeys })`; without,
the board is one of notes, groups and arrows. The board is
`createCollaborativeModeler({ host, undoRedoKeys: host.canvasOwnsHistory, fitOnImport: false, freeArea })`,
attached to `shell.canvas`. Then `host.connectDocument`: every change of the board is `pushEdit`,
`exportText` is the board's canonical text, and the host is offered the command `fitView`. The
shell and the board exist before anything is awaited, so a page without a host that answers shows
an empty board. It resolves to `{ shell, modeler, document, ready, destroy() }`; `ready` settles
with the first text, imported or refused. The editors of the model nodes come in as a parameter: no
source of the workspace imports `apps/editors` or another modeler.

- **A text the board shows is not imported.** After a first accepted text, a text equal to
  `modeler.exportText()` is taken as accepted without an import. An accepted import gives up a move
  by the arrow keys that still rests, and a host's echo of an edit is such a text.
- **The zoom target (`zoom-target.ts`).** The shell's zoom panel and its four keys act on the board
  through an adapter on the board's public calls alone: `getViewState`, `setViewState` and
  `contentBounds`. A step is one step on the shell's raster (the raster of diagram-js's ZoomScroll,
  laid through 100 %: 20, 30, 41, 55, 74, 100, 135, 182, 246, 331, 400 %) around the middle of the
  slot, and never a step out below 20 %, which would zoom in. The fit is the shell's `fitViewbox`:
  the content in the middle of the slot minus `shell.fitInsets()`, the insets the only margin, at
  most at 100 % and never below the board's own 10 %. It is a jump, as the board's own Fit button
  is. `focus()` goes to `.react-flow__pane`; the shell's own search for a canvas would find the svg
  of a model's editor. `BOARD_MIN_ZOOM` repeats the renderer's lower limit, which the entry does
  not export, and a browser test holds the two equal.
- **A step of the shell's zoom ends an editing.** The adapter sets a view like any host, so the arm
  rules take a step for a zoom nobody saw coming: a click on the zoom panel while a model is armed
  releases its editor, as a zoom of the board does (held by a test for zoom-out). The contract
  recommends that a host's view change leaves an interaction open; the cure is a change of the
  renderer.
- **The first view (`first-fit.ts`).** The board is created with `fitOnImport: false`, because its
  own fit is not capped at 100 % and is made at the import, into whatever box the board has then.
  The app sets the view once: in the animation frame after the first text the board accepts, also
  when a text before it was refused, and, where the slot has no size in that frame, as soon as a
  ResizeObserver on the slot reports one, with the content the board holds at that moment. The
  frame is there because of what VS Code does with a webview whose tab is covered (seen in a real
  one, [Taken for granted about VS Code](#taken-for-granted-about-vs-code), 23 and 24): in 1.146
  its page is 300 x 150 while a text editor is in front of it, which is a size like any other to
  whoever asks, and the page is told nothing else. A board whose first valid text arrived then (a
  broken file, repaired in the editor of the same file) was fitted into that box and sat tiny in a
  corner when shown. A covered page gets no frame there, so the fit now waits until the board is
  seen. A board that is empty at its first accepted text gets no fit, and nothing is fitted
  afterwards: every later view is the person's, and an update keeps it. The view is not kept across
  a reload (`host.state` is not read). A test that acts in the task its mount ends in acts on the
  view from before the fit: the browser file's mount waits one frame.
- **An invalid board file (`invalid.ts`).** When the board refuses a text, `importText` answers
  false to the document sync and the app locks: `shell.canvas.inert = true` at once (the whole
  slot, the board's toolbar and an armed editor with it, takes neither pointer nor key and loses
  the focus), `shell.setReadOnly(true)` and the status box after the shell's
  `INVALID_STATUS_DELAY_MS`, so that typing in a text editor beside the board does not flicker. The
  status reads "This file isn't a valid board right now. The board shows the last valid version and
  is read-only until you fix the text." followed by the reader's reason as a sentence, such as
  "Line 4 is no JSON."; the reason is `parseBoardText`'s. While locked `canWrite` is false, so no
  change of the board is written over the text somebody repairs, and the empty-file hint is off.
  The canvas keeps the last valid version; the shell's zoom panel and keys still move it, a pan
  does not (an inert slot takes no wheel). The next accepted text unlocks. A document the host
  opened read only (`IdeDocument.readOnly`) is locked the same way for its whole life, without a
  status. The lock writes the slot's `inert` only when its own state changes: behind a web app's
  start screen the slot is inert by the shell, and a text the board accepts there must not open
  it. A lock that keeps the board readable by pointer is a change of the renderer.
- **The sheet `board-ide-editor/app.css`** has three rules under `.cd-shell .board-root` for every
  host and two more for the shell's web column, and it may hold no more: every other look of the
  board is the renderer's. `.board-toolbar` gets
  `margin-left: var(--cd-shell-frei)`: the toolbar starts where the shell's top row is free of the
  menu trigger, at 64 px. `.board-toolbar__group[aria-label="Zoom"]` gets `display: none`: one zoom
  control, the shell's. `.react-flow__attribution` is put at `right: var(--cd-shell-rand)` and at a
  `bottom` of the shell's margin, row and gap (`--cd-shell-rand`, `--cd-shell-zeile`,
  `--cd-shell-luecke`): React Flow's attribution stays in sight, above the zoom panel whose corner
  it would share. The rules read the shell's size tokens and win by weight, wherever a bundle puts
  the sheet; load it after the shell's sheet and the board's. The toolbar's top edge stays at React
  Flow's 15 px, 3 px below the shell's trigger at 12 px. The [DOM contract](#dom-contract) has what
  a host may put on the toolbar. The two rules for the web column: under
  `[data-cd-shell-host="web"][data-zoom-row="raised"]` React Flow's attribution stands above the
  zoom panel that a narrow page raised over the legal line (the shell's margin, the legal line's
  height, a gap, a row, a gap); under `[data-cd-shell-host="web"][data-empty-state="shown"]` the
  board's toolbar and the word a part shows while it loads (`.board-slot`) are
  `visibility: hidden`, their room kept, since the start screen shows its card and the legal line
  alone and the card is glass.
- **What is polled, and why (`view-events.ts`).** The board reports its content and never its view,
  and a wheel on the pane, a pan and the move to a model that is armed happen inside it, while the
  shell's readout has to follow. So the app reads `getViewState()` once per animation frame and
  tells the zoom panel when x, y or the zoom changed. It reads only while the zoom target has a
  listener and the page is visible (`visibilitychange`), asks for no frame otherwise, and sees a
  change made while the page was hidden with the first frame after it is back. The app's own steps
  tell the panel at once. In VS Code the page of a hidden tab never says that it is hidden: its
  visibility state stays `visible`. The poll rests there only where VS Code gives a hidden page
  no frames, which 1.146 does and 1.96 does not for a board behind another webview
  ([Taken for granted about VS Code](#taken-for-granted-about-vs-code), 24). A board that has
  `board.onViewChanged` is listened to and never looked at: the module feature-detects the member,
  so that renderer change, which waits for its owner's yes, needs no edit here.
- **The teardown.** `destroy()` returns a promise. It disconnects the document, destroys the board,
  and only a microtask later, behind the one in which the board unmounts its canvas and with it
  every model's editor, disposes the host built from the files and destroys the shell. An editor
  may write while it goes (a label that commits on the blur), so what it writes through is still
  there until then. The files port stays its owner's: it is disposed once the promise resolved. The
  board has no end signal, so the microtask is the one thing this rests on, and a test holds the
  order through a port that writes down its ends (`text.close`, `bytes.off`, `dispose`).
- **Known and not cured.** A step of the shell's zoom that leaves a model armed (a fit that only
  pans) hands the focus to the pane, and the editor has the keys again after a click in it (by
  reading). No view is kept across a reload, the editor itself has no export entry (the web app
  adds its own), and the problems pill gets no count. What was found in the shell and in the renderer under it (the islands over an armed
  editor's popup, the focus fallback, the three pixels between trigger and toolbar) is under
  [Deferred](#deferred).
- **The toolbar and the status box in a narrow window** (measured by a review on the webview test
  page, in windows of 480 to 1280 px). The toolbar starts at 64 px. It is 591 px wide in a window
  of 900 px and more, where the Done control has 200 px, and 521 px in one of 760 px and less,
  where it has 130 px: the board's breakpoint reads the window. It is one row down to a window of
  600 px and two rows below that, which end 95 px from the top. The shell's top inset of 88 px,
  which the first fit and the fit button use, is clear of one row only. The status box lies over
  neither row: it stands at 63 px in a window of 900 px and more, under the one row that ends at
  55 px, and at 115 px in one of 760 px and less. Below 480 px the toolbar has a third row, which
  the status box lies over: measured in the web app at 400 px, the box at 116 to 181 px and the
  row down to 135 px, while a lasting line shows; by reading, the same for an invalid board file
  in an editor that narrow. The cure is the renderer's (how the toolbar wraps) or the shell's
  (where the box stands).
- **An armed model in a narrow editor.** A model is edited at 100 % and at its node's size: the
  arm rules move the board there. In an editor that is narrower than the node a part of the
  model's editor is outside the window, and a pan or a zoom of the board ends the editing, so
  that part is out of reach. Measured by the same review with the example's nodes of 800 px: in
  a window of 600 x 800 the armed editor starts at x -224, with the first entries of the
  notation's palette and the map's left axis outside; at 900 x 600 the armed node's title row
  lies under the board's toolbar and its bottom right corner under the shell's zoom panel; at
  1280 x 800 it fits. A board beside a text editor in VS Code has about 460 to 600 px. The cure
  is the renderer's: to arm at the largest zoom at which the node fits the slot inside the
  host's insets, or to let the board pan while a model is armed. The extension's README says it.
- **The keys after a broken text is repaired under an armed model.** The lock's `inert` takes the
  focus from the armed editor, and the unlock does not hand it back: the model is still armed
  and its selection is there, but the Delete key does nothing until a click in the editor (seen
  by the review on the test page). Not cured, on purpose: the cure is a `focus()` call from the
  page when the lock ends, and the usual repair is typed in a text editor beside the board. By
  the focus rules of a nested frame, and not tried in a real VS Code, such a call can take the
  keys from the person who types. A cure has to hold first that the board's own page has the
  focus when the lock ends (`document.hasFocus()`).
- **Tried against the tests:** 34 single edits of the sources, applied in memory by a plugin in a
  scratch config, each fail the browser file; three controls pass.

### Three deviations under the shell, each with an end

The suite's rule (the root guide, Boundaries, and the root `CONTRIBUTING.md`): the chrome of both
apps is the shell's, both e2e projects run the shell's conformance kit, and the smoke in a real VS
Code runs every step of the shell's driver. The board deviates in three places.
Each is a deviation with an end and not a new rule, as the contract kit's pinned skips are
([Tests](#tests)): none may grow, and none is a pattern for another modeler. No job of CI holds any
of the three rules, so nothing fails for them; the lead of the third increment decided them (M1
under [The third increment of the apps against its plan](#the-third-increment-of-the-apps-against-its-plan)),
and the owner may turn the decision round.

- **The board keeps a toolbar of its own** (Done, Text, Image, Group, the model picker, delete, the
  notices) beside the shell's menu, zoom panel, status box and, in the web app, legal line and
  start screen. The toolbar is part of the moved canvas, inside React Flow's panel, and the
  renderer has no surface through which a host's chrome could drive its actions, and no way to
  switch the toolbar off ([Deferred](#deferred)). The five rules of `board-ide-editor/app.css` make
  one picture of the two, and the board's own zoom buttons are hidden for the shell's.
- **The e2e projects `webapp` and `vscode-webview` run the board's own specs** and not the shell's
  conformance kit (`registerShellConformance`). The kit's cases and facts address a diagram-js
  canvas (ten files of `packages/shell/src/testing` name its DOM), and on a board the first
  diagram-js canvas of the page is the inert preview of a model. What the board's specs hold
  instead is listed under [Tests](#tests).
- **The smoke runs without the driver's steps `keys`, `history` and `workbench`**, each off with
  its sentence in the test ([The smoke in a real VS Code](#the-smoke-in-a-real-vs-code-test-smoke)):
  the three steps read the selection and the view of a diagram-js canvas. Its themes step runs: it
  switches VS Code through the four default themes and expects the board's one light picture under
  each (`themes: ["light"]`).

**The end** is one change, the plan's increment 6, a pull request of its own because it changes
`packages/shell` and moves arming traces. In the renderer: the toolbar's actions, state and notices
as commands and events with a switch for the toolbar itself, view commands that ask the arm rules,
a read-only lock, themes and the `appearance` surface. In the shell: a canvas abstraction in
`src/testing` and in the driver's steps `keys`, `history` and `workbench`. Then both apps hand the
chrome to the shell, both e2e projects register the kit with a throwing `onSkip`, the smoke runs
with the three steps on, and this section and the rules of `app.css` go.

## The VS Code extension (`apps/vscode`)

`board-modeler` (publisher `miragon-gmbh`, a preview, `engines.vscode` `^1.96.0`,
`activationEvents` `onCustomEditor:board.boardEditor`) is the board as a custom editor for
`*.board`, view type `board.boardEditor`. The names are working names, the owner's to fix before a
first publish. It has two halves. The host half is every source of `src` outside `src/webview` and
runs in the extension host, in Node; `src/webview` is the page. The host half is tested against a
fake VS Code in memory and the webview as a page inside the shell's VS Code stub. The packed
extension also runs in a real VS Code: its smoke is under
[The smoke in a real VS Code](#the-smoke-in-a-real-vs-code-test-smoke), and what the code takes for
granted about VS Code, with what a real one showed of it, is the list after it.

Two channels on one pipe. The board file itself rides on the shell's document plumbing unchanged:
it is VS Code's text document, so dirty state, saving, undo, Git and a text editor beside the board
are VS Code's, and every change on the canvas is one minimal edit of that document. The files a
board shows (its models, its pictures) come through the files port, served over the same panel to
the messages whose type starts with `board.`. The two never meet: the shell answers its own types
(`ready`, `edit`, `insertExample`, `showProblems`, `info`, `error`) and hands every other one to
the editor's options, which take the ones `isBoardMessage` accepts; in the page the document sync
answers `init`, `update`, `problems` and `command` and hands every other one to the files channel,
which takes its own. **The board file is never opened through the files port.** By the extension's
rule a `.board` is neither a model nor a picture, so the server refuses its path before VS Code is
asked, the list a page hears has no board file, and the page opens none. Held three ways:
`boardEditor.test.ts` asks for the editor's own board file and for another one and counts no `stat`
and no `openTextDocument`; `webview-rules.test.ts` holds the rule against the registry; and
`files.spec.ts` runs the page on a repository that holds the board file, where the picker does not
offer it, no message of the files names it, a change of the board is an edit of the document and no
write into the repository, and asking the port for it all the same is refused.

### The host half

`src/boardEditor.ts` calls the shell's `registerModelerEditor` with `boardEditorOptions(...)` of
`src/boardEditorOptions.ts`, which imports no `vscode`, so that a test page registers the same
plumbing against the shell's host stub. `test/bundle.test.ts` reads the inputs of the production
bundle: no React, no renderer, no diagram-js, none of the seven modelers.

- **The files** are served over the editor's panel. `onDidOpen` starts `serveFiles` on a channel
  whose `post` is the editor's and whose messages `onMessage` feeds, with the rule
  `BOARD_FILES_RULE`: a model is a file with a suffix of `board-suite-editors/suffixes`, a picture
  one with a suffix of `PICTURE_SUFFIXES`. There is one server per open editor and nothing is
  pushed before that page's hello. The editor's close disposes the server first and the backend
  after; a `post` into a panel that is gone is swallowed, whether it throws or rejects. A host that
  hands a board no backend still answers every request ("this board has no files").
- **The root** (`src/files/root.ts`) is the nearest folder above the board file that holds `.git`
  (a folder in a clone, a file in a worktree or a submodule), else the workspace folder the board
  is in, the innermost one, else none. It is asked with `workspace.fs.stat` for `.git` alone, the
  nearest folder first, up to the top folder and no further than the first hit, without the board's
  query and fragment (a board that Git shows from its history carries the revision there). The
  repository comes first also where VS Code has only a folder inside it open, since designIQ reads
  the same board against the repository's root. A board with no `.git` above it follows the
  workspace folders: when the folder comes or goes, the list follows, and an open text hears that
  its file is gone and, where the path names a file under the new root, its text. A `.git` that
  appears later (`git init`) is not noticed until the board is opened again. Without a root the
  list is empty, no model opens and a new picture fails with "this board is in no repository and in
  no open folder, so it has no files". A hazard of the rule: the nearest `.git` may be far above
  the board. A person who keeps dotfiles in a repository at their home folder and opens a board
  that is in no nearer repository gets the home folder as the root, and the index searches and
  watches all of it. And by the same rule `modelers/board/example/example.board`, opened inside a
  checkout of the suite, has the suite's root for its root and finds none of its models, which are
  `models/...` from the example folder: copy that folder out of the checkout to try the extension
  on it.
- **The index** (`src/files/file-index.ts`, after Wardley Maps' `WorkspaceMaps`) is one per root
  for every open board of it (`createIndexPool`). It lists the models wherever they are and the
  pictures under `assets/`, by two `findFiles` on a `RelativePattern` of the root with the exclude
  `**/node_modules/**`, and keeps the list by one watcher on every entry below the root (`**/*`),
  by VS Code's own file events for what a person does in the Explorer, and by a search again where
  neither can say what changed. What changed while a search ran is applied to its answer, an older
  search that answers later is dropped, and a failed search keeps the list. The list's listeners
  are told once, 100 ms after the last change of a burst (`LIST_REST_MS`); a single file's event is
  told at once. Never listed: a file in `node_modules`, a dot file or a file in a dot folder, a
  picture outside `assets/`, which is read when a node asks and is not followed when it changes.
- **Why the watcher is on every entry.** It was on the file names a board lists, and a real VS
  Code showed what that misses (1.146.0 and 1.96.0, Linux). A folder that another program removes
  or moves is one word, the folder's, and a glob of file names hears nothing: the picker kept the
  files of a removed folder. A folder that arrives with its files names none of them. A file that
  is written right after its folder was made comes with a change as its first word, or with none.
  So a path that went takes every listed file at or below it off the list, each told to its open
  text; a file whose first word is a change is listed; and a new entry that is no file a board
  follows may be a folder: once the burst rests it is asked what it is (`workspace.fs.stat`), and
  the root is searched again where it is a folder. A new file that is none costs that one question
  and no search. Nothing is asked about an entry in a dot folder or in `node_modules`, and a burst
  of more than `FOLDER_LOOKS` (8) new entries is answered with one search and no question: a build
  that writes a thousand files costs one search. The Explorer's events still say more than the
  watcher, both ends of a rename and at once, so the files of a renamed folder move in the list
  without a search; the watcher's later word of the same folder costs one search, which finds what
  the list has.
- **The list holds what a search finds.** The search's glob reads a suffix by its letters as they
  are, where the rule of what a board shows ignores their case (seen: `findFiles` does not find
  `X.OWM` on Linux). Such a file opens for a node that names it, and its text hears of the file,
  but it is never listed: listed by the watcher's word, it would leave the list with the next
  search and its node would be told that the file is gone. Listed though a board opens neither: a
  link to a file, which the search finds and the watcher names, and, after a search, a file
  below a linked folder, since the search follows links and the index asks nothing about a file.
  Picked, each is a node that says why it does not open.
- **A model's text** (`src/files/documents.ts`) is the file's `TextDocument`. A write is one
  minimal `WorkspaceEdit` through the shell's `createDocumentWriter` with `suppressEcho`, so the
  file turns dirty and the person saves it: the host has no call that saves, and
  `test/host-rules.test.ts` reads its sources for one. The echo of an own write is consumed and
  tells nothing; every other change of the document (a text editor, undo, revert, a reload after a
  checkout, the file's own modeler) is told, and a save, whose event has no content change, is not.
  VS Code owns the document and lets go of a clean one that no editor shows: the text drops the
  object at its close event, keeps the last text at hand for `text()`, and opens the document again
  before the next write, with a new writer. While the document is closed the watcher's word of the
  file reads it again and tells the text when it is another one; while it is open, a change of the
  file is left to VS Code, which reads a clean document again itself. A write is refused, and the
  page is then told the document's text, when the document has another text than the one the write
  was made on (asked in the task that hands VS Code the edit), when VS Code refuses the edit
  because the document moved meanwhile, and into a file that is gone. A write that would make the
  file larger than `TEXT_LIMIT_BYTES` as UTF-8 is refused too, before VS Code is handed an edit:
  a board opens no model above that size, so the saved file would open on no board again. The
  page is told the document's text as after every refused write, so the person sees the edit go,
  and nothing says so in words. Two boards on one model are
  two texts on one document: what one writes, the other is told. A file that another program
  removes keeps its document in VS Code (seen: no close event): the text hears that the file is
  gone from the index alone, and when the file is back it tells the text of that same document,
  which VS Code reads again.
- **The version of a text** is the files server's own count and never `TextDocument.version`. By a
  reading of VS Code's typings and source, its number starts at 1 again for a document that was let
  go of and opened anew, and it moves with the page's own edits, which a page could only follow
  with an acknowledgement the protocol does not have.
- **Saving** is the person's, file by file: a model edited on a board is a dirty document of its
  own. Whether saving the board's tab should also save the models that board made dirty is the
  owner's to decide; nothing of it is built.
- **Pictures** (`src/files/bytes.ts`) are read with `workspace.fs.readFile`, the type by the file's
  suffix, and a new one is written to `assets/<name>`: `assets` is made when it is not there, and
  the name is looked for first. The backend lists a stored picture and tells its bytes at once,
  without waiting for the watcher.
- **What the backend checks that a path's text cannot say, and what it does not.** Checked, each
  with `workspace.fs.stat` before anything is read: no folder between the root and the file is a
  symbolic link (`behindLink` in `root.ts`); a model or a picture that is a symbolic link is not
  opened and not read (`FileType.SymbolicLink`); a model above 2 MiB (`TEXT_LIMIT_BYTES`) and a
  picture above 10 MiB are not read; a new picture never replaces a file, a folder or a link of
  its name, and is not written through an `assets` that is a link or a file. The same checks run
  again whenever a document is opened anew, so a folder that turns into a link under an open text
  ends that text's writes once VS Code let go of the document. NOT checked: how a file system
  folds names (a path is compared as text, so on a disk that folds case another spelling of the
  root is not below it; only a document is followed by the URI VS Code gives it); that a model is
  a text at all (VS Code decides what it opens, and was seen to refuse a binary file); the folders
  above the root; and the moment between a check and its use, `workspace.fs` having no write
  that only makes a file. A file that is renamed is a file that went and one that came: `onMoved`
  never fires in this increment.
- **Every folder on the way is asked.** `stat` names an entry itself and never the way to it: a
  file behind a linked folder is a plain file to it (type 1), while the folder is a link (type
  66; both seen in a real VS Code). So `behindLink` asks each folder between the root and the
  file on its own, the outermost first, stops at the first link, and nothing is asked about a
  file behind one: "`<path>` is behind a link, and a board opens no link" for a model, "... reads
  no link" for a picture. A folder that is not there says nothing, and the file's own check then
  says that it does not exist. A link is refused wherever it leads, into the repository too: VS
  Code's API resolves no link, so where one leads cannot be asked. That is as with a link to a
  file, and it takes a linked folder away from an honest board as well. It costs one `stat` per
  folder of a path at every open, and nothing is kept between two opens. **Decided in the closing
  round of the second increment, not by the owner, who may turn it round.** The lead's L1 had
  named a linked folder as what is not checked; a review then reached a model and a picture
  outside the repository through one in a real VS Code, read and written (`out/secret.owm` behind
  `out -> /tmp/…`, the model left as a dirty document). Seen afterwards in the runner, on VS Code
  1.146.0 and 1.96.0: a model and a picture behind a linked folder are refused at every depth,
  also behind a link that is deeper on the way, no document of such a file is opened, a node that
  names one says "This file could not be opened. out/secret.owm is behind a link, and a board
  opens no link", and a model and a picture behind plain folders open.
- **A webview that closes in the middle of a write.** The edit of a page is applied whole or not at
  all, since it is one `applyEdit`. One that reached the extension host lands though the panel is
  gone, also where VS Code first has to open the document again: the server closes a text after its
  last write, and the backend's `dispose()` ends the index and leaves the texts to the server. One
  the host had not received is lost.
- **A file that is read only.** `BackendText.readOnly` comes from `stat`'s `permissions`, and a
  real VS Code says `Readonly` there for a read-only file system alone. A file whose mode forbids
  writing has no permissions to an extension: the board takes it for writable, VS Code takes the
  edit, and the save is what fails for the person.
- **The fake VS Code** (`src/files/memory-vscode.ts`) is the workspace in memory that the backend
  is tested against and that the `vscode` mock of the unit project (`test/__mocks__/vscode.ts`) is
  built on: a disk with folders and links, documents that are opened on demand, turn dirty and are
  let go of, edits that carry the version they were made on, a search with excludes, watchers, the
  Explorer's gestures and the workspace folders. It imports nothing of Node or of a page.
  `test/memory-vscode.test.ts` holds each behaviour the backend depends on as a sentence. Each was
  read from VS Code's typings and its source at 1.96.0, and three were changed to what a real VS
  Code showed: a watcher hears one word for a folder that goes or comes, the folder's, and a
  folder that is made is named before the file in it; the document of a file another program
  removes or moves away stays open; and `readOnly` stands for a read-only file system.
- **Tried against the tests:** 89 single edits of the host's sources as the builders left them,
  through a plugin in a scratch config. All 89 fail (88 by a failed test, one by an unhandled
  rejection). Of the index as it is since the walk, eight more: the watcher on file names alone, a
  change that is never an arrival, a new entry that is never looked at, dot folders looked at, no
  cap on the questions, a folder that leaves its files, a look that outlives the index, and a file
  listed whatever the case of its suffix. Each fails a test. Of the look at the way and the limit
  of a write, twelve: no look before a model is opened or before a picture is read, only the
  nearest folder asked, the root asked too, the way asked after the file, a folder that is not
  there taken for a link, a link told by another bit, a URI without folders taken for clear, a
  write of any size handed on, the limit itself refused, letters counted in place of bytes, and
  a pair counted as six bytes. Each fails a test.

### The webview half (`src/webview`)

Three files. `main.ts` is the bundle's entry, `channel.ts` puts the files protocol on the
webview's one pipe to the extension, and `paste.ts` aims a paste where a browser aims it.
Everything else of the page is `board-ide-editor`, the shell and `board-suite-editors`.

- **The entry's order.** `board-suite-editors/zod-jitless` first: zod probes for eval when it
  builds its first schema, and the webview's policy reports the probe. Then the sheets by name: the
  two Geist sheets, `@miragon/modeler-shell/shell.css`, `@miragon/board-renderer/assets/board.css`,
  `board-suite-editors/base` (diagram-js's sheet and the canvas mapping once, with the host
  package's preview rule), `board-ide-editor/app.css`. Only then code. A renderer's own sheet
  follows all of them in the bundle's one sheet. `test/webview-rules.test.ts` holds the seven
  imports in this order, and `test/webview-bundle.test.ts` the order in the built sheet.
- **One API.** A webview may call `acquireVsCodeApi()` once. The shell's
  `vsCodeEditorHost({ onMessage })` does, for the board file's own sync, and the files post through
  the same object (`host.api`). `filesChannel()` gives `receive`, which is handed to the editor
  host as `onMessage` and takes every message `isBoardMessage` accepts, and `over(api)`, the page's
  side for `createFilesClient`. No source of the webview names `acquireVsCodeApi`, and the
  production script names it once (both under a test).
- **The first answers need the document sync.** The files' messages come in through the shell's
  document sync, which hands on what it does not answer itself, so nothing arrives before the sync
  listens. The client says hello when it is made, and `mountBoardEditor` connects the sync in the
  same task, before its first await. An await between the two loses the answer to the hello. What a
  person would see is an empty picker and nothing else: a node asks for its file by its path, so
  the models and the pictures still open. A rule test forbids an await before the mount, and the
  e2e tests of the init hold the picker's entries.
- **The mount.**
  `mountBoardEditor(host, { files, editors: SUITE_EDITORS, containHistoryKeys: true })`. Nothing of
  the extension is awaited: the shell and the board stand in a page nobody answers, with the models
  waiting. A mount that fails (a page without `#app`) disposes the files and stays the page's
  rejection. In VS Code the default line of an invalid model is true ("Open it in its own editor to
  repair it."), so no `invalidText` is passed.
- **A paste (`paste.ts`).** VS Code keeps the paste key from a webview's page and pastes by a
  command of its own, and the event of that command lands on `<body>` whatever has the focus (seen
  in VS Code 1.146.0), where a browser aims a paste at the focused element. The board takes a
  paste only when it is aimed at the board, so a pasted picture went nowhere. `aimPastes(document)`
  hears a paste on the body on its way down, and where another element has the focus it tells the
  paste again at that element, with the same clipboard, and stops the first one: the board's own
  rules then decide as in a browser (the pane takes a picture, a textarea its text, an armed
  editor what is its own). With nothing focused, or with the focus beside the board, the paste
  stays where it was and the board does not take it. `files.spec.ts` holds the three cases with a
  paste event made on the body; a real paste was seen in a real VS Code, on 1.146.0 and 1.96.0.
  The cure in the renderer would be to read the focused element where a paste's target is the
  body.
- **`webview`**, the entry's one export, is for test pages: `{ files, mounted, destroy() }`. The
  bundle is an IIFE and drops it; the shipped page publishes nothing on `window`. `destroy()` ends
  the board first (its editors close their files and may still write while they go: a label that is
  open is committed), then the host built from the files and the shell, and only then the files. It
  does not wait for `files.settled()`: a message posted through VS Code's API is on its way and no
  dispose takes it back, and in a page nobody answers the wait would never end. Nothing in VS Code
  calls `destroy()`. A webview that closes is gone, the extension's files server closes what it had
  open, and a reloaded webview says hello again, which starts the life of a page anew
  (`webview-channel.test.ts` holds that over the channel: the last write of the page before landed,
  and the new page counts its versions from 1).
- **What is a model** is said twice in the extension: the page mounts an editor by the suffixes of
  `SUITE_EDITORS`, and the extension host serves a text by `MODEL_SUFFIXES`, which is the suffix
  table as plain data. `test/webview-rules.test.ts` holds the two lists and the two rules equal.
- **The bundle** (`npm run board build:vscode`, `esbuild.config.mjs`). `dist/extension.cjs` is the
  host: Node, CommonJS, target node20, `vscode` external, 27.9 kB minified. The page is one classic
  script, `dist/webview.js` (2.79 MB minified), one sheet, `dist/webview.css` (297 kB), and eleven
  font files in `dist/fonts`, which the sheet names by relative path. The policy lets one script
  run, the nonce'd one, so there are no chunks: every notation's code is in the one script and runs
  when its first node asks for it. One copy each of zod, React, React DOM, Yjs, React Flow and
  diagram-js, and no file of the extension host (`test/webview-bundle.test.ts`, built in memory
  from the extension's own esbuild config). The webview's HTML and its policy are the shell's
  (`default-src 'none'`, a nonce on the one script, no `connect-src`, `dist` as the only local
  resource root; `test/webviewHtml.test.ts`).
- **The VSIX** (`npm run board package:vscode`, which runs the production build itself, packs
  offline and then runs the notices check) is `apps/vscode/board-modeler.vsix`, 23 files and
  1.03 MB: the manifest, `extension/package.json`, `extension/readme.md`,
  `extension/changelog.md`, `extension/LICENSE.txt`, `extension/icon.png`,
  `extension/dist/extension.cjs`, the script, the sheet, the eleven fonts,
  `extension/dist/THIRD_PARTY_NOTICES.md` (48 packages of npm, three copied works, 28 workspaces of
  the suite; 109 kB) and `extension/dist/dagre.esm.js.LEGAL.txt`. `.vscodeignore` leaves out `src`,
  `test`, `test-smoke`, `scripts`, `node_modules`, the esbuild config, the tsconfig and source
  maps. A development build before it leaves its source maps in `dist`; the VSIX does not take
  them. vsce prints no warning of its own.
- **The notices of the build.** Every build writes them into `dist` from what the two bundles are
  made of (`esbuild.config.mjs`, `writeBundleNotices` of
  [`apps/editors`](#the-suites-editors-appseditors)): a production build whose notices are not
  whole exits 1, a development build says what is missing and goes on, and a watch build writes
  them once, at its start. They are not committed, and in the VSIX the file is
  `extension/dist/THIRD_PARTY_NOTICES.md`, where the other modelers ship a committed
  `extension/THIRD_PARTY_NOTICES.md`; no page on GitHub shows it, and the README says where it is.
  `npm run check:notices -w modelers/board/apps/vscode` (`scripts/check-notices.mjs`, with the VSIX
  reader `scripts/vsix.mjs`) holds `dist` and the packed VSIX against a fresh measurement of the
  two production bundles (76 bundled packages and the three copied works against the 52
  sections), and the VSIX against its papers and against what it must leave out;
  `-- --vsix <file>` checks another VSIX. The part that built it tried each of its three reasons
  on `dist` and on tampered copies of the VSIX; with the closing of the increment the section of
  a font package and of each copied work was cut out of `dist` once, and the check failed each
  time.
- **The papers.** `README.md` is for a person who installs the extension: what a board is, how to
  install a VSIX and start, which files a board reaches and which not, what it cannot do yet, that
  it is a preview, and where the notices are. It links only to whole addresses and its own headings,
  since vsce rewrites a relative link to `main`. Its list "What it cannot do yet" loses a line with
  each item that is built. It says nothing of where the extension is published: the VSIX carries the
  file onto a marketplace's listing, and nothing but the release pull request stands between a merge
  and a publish, so a sentence that is true only before one would be untrue on the listing itself.
  Its Install section names the VSIX alone, and the pull request that makes the extension public
  adds where to find it. `CHANGELOG.md` is release-please's from the first release on; its one entry
  of the board's own, `## 0.0.0`, is the heading release-please writes its notes above (tried with
  release-please's updater: without a version heading it keeps the old text and doubles the title).
  Business Model Canvas and C4 arrived without a CHANGELOG. `icon.png` is the Miragon comet on the
  blue tile, byte for byte the file Business Model Canvas ships (256 x 256): the Miragon modeler
  icon set has no board icon, and an icon is copied from that set and never drawn here. The manifest
  names it and carries the banner every extension of the suite has (`#335DE5`, dark).
  `test/papers.test.ts` holds all of it, the icon by its checksum and the README's silence on a
  marketplace by its words. Nobody has looked at the icon or the README in a real Extensions view.
- **Tried against the tests:** 21 single edits of `main.ts` and `channel.ts` (a sheet or the zod
  line taken out, the undo keys not contained, the files disposed before the board, no editors, no
  files, a second acquire, the channel posting or delivering nothing, an await before the mount),
  and one of the paste: the entry not aiming it. Each fails at least one test.

### The webview test page and the project `vscode-webview` (`e2e`)

`e2e/webview/webview-test.html` with `webview-test.ts` is the extension's webview as a page:
`apps/vscode/src/webview/main.ts` from its source inside the shell's VS Code stub.
`npm run dev:webview -w modelers/board/e2e` serves it on http://127.0.0.1:5194/webview-test.html
(the port is strict; `E2E_WEBVIEW_PORT` overrides it). Like the web app's, its Vite config takes
every package of the suite from its source, empties the base inside each renderer sheet and
pre-bundles what the notations load; `e2e/tsconfig.json` has `allowJs` for the `.mjs` build helpers
the config imports.

- **The stub first.** `installVsCodeWebviewStub` (default styles, `<html>` as `renderWebviewHtml`
  writes it, the body's theme classes, `acquireVsCodeApi`, the theme bridge) is in place before the
  webview's entry is imported.
- **`?host`** runs the extension's plumbing in the page as well: the shell's
  `registerModelerEditor` with the extension's own `boardEditorOptions`, against
  `createVsCodeHostStub()` and a `createMemoryBackend` that holds the example folder (the web app's
  `EXAMPLE`) and the board file itself, as `example.board`. The board file's text is the stub's
  document `/repository/example.board`. What the page posts reaches the panel, and what the
  extension posts comes back as a `message` event on the window. So the board file's sync, the
  files server, its rule and the protocol are the real ones. **The VS Code backend is not in the
  page**: the files are in memory, and what the VS Code backend does is held by its unit tests
  alone.
- **Without `?host`** the page posts the document itself, as the extension answers `ready`, and
  nothing answers for the files.
- **`?board=empty`** opens an empty file, as somebody just created it. **`?root=none`** takes
  `#app` out before the webview runs.
- **On `window`**, for the tests and never in the shipped bundle: `vscodeHost` (`host`, `document`,
  `panel`, `backend`, and `deliveries` with `hold()` and `release()`, which keep what the extension
  posts on its way until a test lets it through), `webview` (the entry's export), `editor` (once
  mounted), `webviewReady` (once the first text was imported or refused), and the stub as
  `__modelerShellVsCodeStub` (what the page posted, its CSP violations and errors).

`e2e/playwright.config.ts` has the project `vscode-webview` (`**/vscode/**/*.spec.ts`,
http://127.0.0.1:5194). `tests/vscode/support/webview.ts` has what the specs share. 17 tests:

- `document-sync.spec.ts` (4), the board file through the extension's real plumbing: the init shows
  the example inside the shell with seven models ready, the picker's seven entries and the picture,
  and writes nothing; a click on Group is one applied edit of one added line, and the document's
  undo brings the canvas back to the fixture; an invalid text locks the board and names the line,
  and a valid one unlocks it; an empty file shows the hint, and its first note is one edit that
  writes the header too.
- `files.spec.ts` (11), the files of the repository: a model armed by a real double-click and
  changed by a real click and key is one write of that file and none of the board file; the undo
  key inside the armed editor undoes there and a bubbling listener on the window sees nothing,
  while on the board's pane the key reaches the window unprevented; a change from outside shows in
  the node and nothing is written back; an edit made while the extension's word of an outside
  change is still on its way is dropped whole, the file keeps the outside's text, the node shows
  it, and the next edit lands on version 2; the board file is in the repository and is never a file
  of the files; the picker follows a file that comes later, and a picked model is one line more in
  the board file; a picture picked through the Image button is stored under `assets/` and its node
  is one edit; a picture pasted as VS Code pastes, on the body, is the board's while the pane has
  the focus and nobody's with the focus nowhere or on the shell's menu; the teardown ends the
  board first (a label still being typed in lands in its file,
  each of the seven editors closes its file, then the port is closed); a page nobody answers still
  shows the board, its models waiting; a page without `#app` says why and keeps no files open.
- `shipped-bundle.spec.ts` (2), the webview as the VSIX ships it: the spec builds `apps/vscode` for
  production itself (`node esbuild.config.mjs --production`, once for the file, so it overwrites
  `apps/vscode/dist`) and opens it through the shell's `openWebviewBundle` with the editor's own
  options, behind the document and the policy the extension writes. There is no dev server and no
  plumbing in the page: the test answers `ready`, `board.hello`, every `board.text.open` and the
  picture's `board.bytes.read` as the extension would. The page stands before any answer; then
  seven models are ready, the picture is drawn, Geist is loaded from `dist/fonts`, and the stub
  recorded no CSP violation and no error. An edit there is one `board.text.edit` and no `edit` of
  the board file.

The only notation that is edited in these specs is Wardley Maps; all seven are shown. Without a
test here: a dropped picture (Playwright's file chooser stands in for the dialog, and a paste is
an event the test makes), a second board, a reloaded webview in a page, a dark or high-contrast
theme, and everything the VS Code backend does, which the page does not run: that runs in the
smoke, in a real VS Code.

Run once as a probe and not kept: a board file whose lines stand in another order than the
canonical one (after a hand edit or a merge that moved lines) is shown without a write, and the
first change on the canvas is then one edit that replaces every line between the first and the last
that differ (lines 1 to 13 of the example). The answer to the hello is needed only by the picker:
with it lost, the models and the picture still open, since a node asks by its path.

### The smoke in a real VS Code (`test-smoke`)

`apps/vscode/test-smoke/vscode-smoke.test.ts` runs the packed extension in a real VS Code, on the
shell's `runVsCodeSmoke`. It packs the VSIX itself (or takes the one `VSCODE_SMOKE_VSIX` names, as
a release does), unpacks it and hands VS Code that folder, so the extension's files are the
VSIX's, without `node_modules`. To VS Code it is still a development extension: the driver starts
it with `--extensionDevelopmentPath` and writes `workbench.editorAssociations` for the fixture,
and such a window keeps no backups of unsaved files. What an installed extension does differently
is the last point below. `npm run board test:vscode` runs it where there is a display,
`npm run board test:vscode:docker` in the suite's Docker runner; `VSCODE_VERSION` picks the VS
Code, `VSCODE_SMOKE_KEEP=1` keeps the profile and its logs. Its config is apart from the unit and
the browser project (`test-smoke/vitest.config.ts`), and `test-smoke/board-steps.ts` has what it
does on the board.

- **The workspace is the example.** The fixture is `example/example.board`, and the driver writes
  the example's seven models and its picture beside it (`fixture.files`; the picture is an SVG, a
  text). The folder has no `.git`, so the folder VS Code opens is the board's root.
- **The driver's steps, as the board takes them.** `parse`: the saved text must be one
  `parseBoardText` accepts. `themes: ["light"]`. `chrome: ["menu", "zoom"]`: the board has a
  toolbar of its own and no palette of the shell's. `ready`: the board's toolbar is there and every
  model node's editor says `data-embed-state="ready"`, seven of them. `edit`: a click on the
  toolbar's Group button. The save step then reads the file, and the undo step presses the undo
  key and saves again: the file must be the fixture's text byte for byte, which is what holds that
  the key reaches VS Code's document from the board. The driver's own comparison in those steps
  counts the shapes of diagram-js canvases, which on a board are the models' previews: a change of
  the board moves none of them, so that comparison holds whatever the board does. The themes step
  switches VS Code through its four default themes and takes a screenshot of each into
  `test-results/vscode-smoke/board-<theme>.png`: the board stays light under each.
- **Three steps of the driver are off**, each with its sentence in the test: `keys` (it focuses
  the first diagram-js canvas of the page and selects and copies its elements, and on a board that
  canvas is the inert preview of a model), `history` (it reads the view and the selection of a
  diagram-js canvas across a redo and an undo) and `workbench` (motion, hidden and reload read a
  diagram-js view as well, and the reload expects the view back, which the board does not keep).
- **The custom step** holds what only a real VS Code with a real folder shows, in three parts.
  Every model is drawn by its own modeler (each engine has shapes with a box) and the picture's
  bytes arrived. The picker offers exactly the seven models of the folder, lists a model in a
  folder that another program makes, and drops it when that folder is removed: VS Code's search
  and its watcher, which names such a folder and none of its files. And a model that is armed by a
  real double-click and changed by a real click and the Delete key turns up as a dirty tab of its
  own (`tea.owm`), while the board's tab stays clean and the file on disk keeps its text.
- **Run, in the Docker runner on the machine the increment was built on:** VS Code 1.146.0 (the
  newest stable the runner took by default): 1 test passed, the smoke's own total 10.8 s, the
  whole container run 25 s with the image and VS Code cached. VS Code 1.96.0, the manifest's
  minimum: passed, 11.9 s; there the driver found the file opened as text first and opened it
  again from the Explorer, twice. With the packed VSIX (`VSCODE_SMOKE_VSIX`, on 1.146.0): passed,
  12.1 s, no build in the run. The screenshots show the board inside the shell (the menu trigger,
  the board's toolbar beside it, the zoom panel), the group with the picture and the two notes,
  and the seven models drawn in two rows, nothing cut and nothing twice; under the two
  high-contrast themes the nodes have the stronger outlines. VS Code's own toast "It is not
  recommended to run Code as root user." lies over the zoom panel in some of them: the runner is
  root.
- **Run again with the third increment**, on a snapshot of the tree without any build output,
  after the runner's own `npm ci`: VS Code 1.146.0 passed (the smoke's total 10.6 s, the container
  run 24 s), and so did 1.96.0 (10.9 s). The VSIX the smoke packs there carries the notices, so
  the production build with its notices ran in the container as well. The screenshots show what
  they showed before.
- **It can fail.** Run once on a snapshot whose index watched files alone, as it did before the
  walk: "after that folder was removed the picker should offer … it offers
  made-later/one.owm, …", exit 1.
- **Not run:** `npm run board test:vscode` outside the runner, and CI's job `vscode-smoke (board)`,
  which calls it under `xvfb-run` on VS Code stable and on the minimum.
- **Installed, as a person gets it.** No step of the smoke: seen by a review in the same runner,
  on VS Code 1.146.0, in scratch. `code --install-extension apps/vscode/board-modeler.vsix`
  printed "Extension 'board-modeler.vsix' was successfully installed.", the extension was listed
  as `miragon-gmbh.board-modeler@0.0.0`, and VS Code was started without
  `--extensionDevelopmentPath` and without an editor association on a copy of the example folder.
  Opened from the Explorer, `example.board` showed the board within 1.0 s: seven models ready,
  the picker's seven entries, the picture, both Geist faces. Two things differ from the smoke's
  window. **A `.board` file given on the command line at the first start after the install
  opened as plain text**, for the whole 60 s that were waited (two runs); closed and opened from
  the Explorer it was the board, and after a restart the restored tab was the board's editor.
  Nothing in the manifest differs from Business Model Canvas's in what decides this (one
  `customEditors` entry, priority `default`); whether every custom editor of the suite does the
  same, and a second start with a path, were not looked at. **Unsaved models survive a reload
  there**: a model edited in place (its unsaved tab came after 840 ms, the file on disk as it
  was) was still unsaved and still showed the edit after Developer: Reload Window and after a
  quit and a start, which is VS Code's hot exit. The runner's development window dropped four
  unsaved models at a reload without a question. So nothing the smoke or the walk saw about a
  reload says what a person's window does with unsaved models.

### Taken for granted about VS Code

Everything here was read from VS Code's typings and its source at 1.96.0, or from the plan, and
built into the fake the host half is tested against. It was then walked through in a real VS Code,
item by item: each item says how it ended. **Seen**: VS Code does what was assumed. **Differs**:
it does something else, and the item says what was changed for it. **Not reached**: the runner
could not make the situation, and the item says why; these are left for a walk by hand.

The walk was a scratch script that is not in the tree. It ran the packed extension through the
shell's smoke driver in the suite's Docker runner, with real mouse and keyboard input, the test
writing into the workspace folder as another program would, and a probe beside the extension in
the extension host: the unpacked VSIX's `main` pointed at a wrapper that activated the real
extension unchanged, wrote down what VS Code told it (documents, saves, tabs, file events, the
messages between the extension and its page) and ran what the walk asked of the `vscode` API. It
ran on **VS Code 1.146.0** (Chromium 150, Electron 43) and on **1.96.0** (Chromium 128, Electron
32), on Linux, as root. "Both" below means both versions; where only one is named, the other was
not looked at for that item. The script ran in three whole passes and seven partial ones on
1.146.0 and in one whole pass on 1.96.0, all on 2026-11-15. An item's outcome was the same in
every pass that looked at it after the last change the item names, unless it says "once". A thing
that was looked at there and is no step of the smoke is **seen once in scratch**, which is all of
the walk but the three parts of the smoke's custom step.

Documents:

1. `openTextDocument(uri)` hands out the document VS Code has, with its unsaved text, or reads the
   file. **Seen** (both): a model whose document had an unsaved line was picked on a board, and
   its node drew the unsaved component while the file on disk did not have it. That it rejects for
   a missing file was not looked at: the backend asks `stat` first, and that rejects (17).
2. VS Code lets go of a clean document that no editor shows, about 3 minutes after the last
   `openTextDocument`. **Seen** (both): for both models a board only showed, the close event came
   180.0 s after the open (opened at 1.3 s, closed at 181.3 s), `isClosed` was true, and the next
   edit in place opened the document anew and landed. The limit of about 50 references was not
   reached.
3. `TextDocument.version` is 1 for a document just opened, one more with every change and 1 again
   after a close and a reopen. **Seen** (both). One `applyEdit` is two events: one with the content
   change, in which `isDirty` is still false, then one without a content change for the dirty
   state.
4. A dirty document is never let go of, and `applyEdit` on a file no editor shows makes it dirty
   and saves nothing. **Seen**: after an edit in place the file on disk was unchanged and the
   document dirty (both), and a dirty document was still open 234 s after its `openTextDocument`
   (1.146.0, once). **The tab** the plan expects: VS Code opens a text editor tab for the document
   about 800 ms after it turned dirty (802, 803 and 892 ms measured, both): in the board's editor
   group, in the background, not as a preview. The board keeps the focus and the model stays
   armed. With the notation's own extension installed that tab may be its custom editor: not
   looked at, the runner's VS Code has the board's extension alone.
5. A clean open document is read again when its file changes on disk, with a change event that has
   content changes; a dirty one keeps its text. **Seen** (both): the node followed a write by
   another program in about 130 ms; with an unsaved change in the document nothing was told and
   the node kept it. Saving that document then fails: `save()` resolves false and VS Code shows
   "Failed to save 'second.owm': The content of the file is newer. …". It notices by the file's
   time and size: a change on disk to a text of the same length was saved over without a word
   (1.146.0, once).
6. The clean document of a deleted file is let go of. **Differs** (both): the document stays
   open, with no close event, also 2 s later. The node still says that its file is gone, by the
   watcher's word, and shows the file again when it is back, since VS Code reads the open document
   again. The fake was changed (a removed or moved file keeps its document; a file a person
   renames in the Explorer has its clean document let go of, which was seen in 14), and
   `test/memory-vscode.test.ts` holds both. A dirty document of a deleted file was not looked at.

Edits and events:

7. `workspace.applyEdit` carries the version the extension host knows; if the document changed
   meanwhile it resolves false and changes nothing; for a file the extension host has no document
   of, it is applied to whatever the file has. **Seen** (both): of two calls in one tick on the
   same lines the first resolved true and the second false, and the text had the first alone (VS
   Code writes "… has changed in the meantime" into its developer console); an edit of a file
   without a document resolved true and left a dirty document at version 2. **The refusal of a
   stale edit as the page meets it** was made too (both): the extension's word of an outside
   change was held on its way to the page, at VS Code's own `postMessage`, while a real key
   deleted a component in the armed editor. The page's edit arrived with version 1 against the
   server's 2 and was dropped whole: the document kept the outside's text throughout, the node
   showed it once the word was let through and stayed armed, and the next edit landed on version 2.
8. The change event of an own `applyEdit` reaches the extension host before its promise resolves.
   **Seen** (both): event with the change, event for the dirty state, then the resolved promise.
   Two quick edits of a model in place both landed, and nothing was undone or posted back.
9. `onDidChangeTextDocument` fires with empty `contentChanges` for a save and for a change of the
   dirty state, and with content changes for typing, undo, redo, revert and a reload. **Seen**
   (both), with `reason` Undo and Redo for those two. A model saved in a text editor beside the
   board posted nothing to the board; a revert reached its node.
10. An inserted `\n` is written as the document's line break, and the shell's echo test recognises
    it. **Seen** (both): a CRLF model edited in place was one change whose text carried `\r\n`,
    nothing was posted back, and the saved file had 17 CRLF and no lone LF.

The search, the watcher, the file events:

11. `findFiles` with a `RelativePattern` searches below a root that is no workspace folder and
    takes a brace group with a dot inside. **Seen** (both): a board with a `.git` above the folder
    VS Code had open listed the models of the whole repository and none of `node_modules`; the
    typings' sentence "Will return no results if no workspace folders are opened" does not hold
    for a pattern with a base. `porter.vc.json` is found by the brace group (the smoke's picker).
    **Differs:** the search reads a suffix by its letters as they are, so `X.OWM` is not found on
    Linux, though the rule of what a board shows takes it. The index now lists what a search
    finds and never such a file, which still opens for a node that names it. The search follows
    links: it finds a link to a file and the files below a linked folder. That `files.exclude`
    stays in force was not looked at.
12. A watcher on a `RelativePattern` names a created, a changed and a deleted file below the root,
    also outside the workspace folders. **Seen** (both): the picker and an open node followed
    within about 250 ms, for a root above the open folder too. A new link is named like any
    entry, whether it leads to a file or to a folder.
13. What a watcher names for a folder that another program removes or moves. **Differs** (both)
    from what the fake said (every file for `rm -r`): VS Code names the folder alone. `rm -r` is
    "deleted" for the folder, `mv` is "deleted" for the old name and "created" for the new one, a
    folder moved into the repository is "created" for the folder, and none of these names a file,
    so a watcher whose glob matches file names hears nothing at all. A file written right after
    its folder was made came with a change as its first word, or with no word. The picker kept
    the files of a removed folder and never showed those of a new one. **Changed:** the index
    watches every entry below the root, drops what is at or below a path that went, lists a file
    whose first word is a change, and asks what a new entry is and searches again where it is a
    folder ([The host half](#the-host-half)); the fake names folders as VS Code does; eight tests
    of `file-index.test.ts` and the smoke's custom step hold it. Seen afterwards (both): the
    picker follows a folder that is made and filled, one that arrives full, one that is moved
    and one that is removed.
14. `onDidCreateFiles`, `onDidDeleteFiles` and `onDidRenameFiles` fire after what a person does in
    the Explorer, once for a folder, and not for another program. **Seen** (1.146.0): a folder
    renamed with F2 in the Explorer was one rename event for the folder, the picker had the new
    paths 152 ms later, and the node of the old path said "This file is gone. The board keeps its
    place."; VS Code let go of the document at the old path and opened one at the new. A folder
    deleted there was one delete event, and the picker followed in 11 ms. None of these events
    came for what the walk did to the disk itself. A file created in the Explorer was not tried;
    on 1.96.0 the walk's click did not find the folder in the Explorer's list.
15. `onDidChangeWorkspaceFolders` in a multi-root workspace. **Not reached:** the runner's VS Code
    opens one folder. A call of `updateWorkspaceFolders` there answered true and changed the
    extension host's own list at once, while the window kept its one folder and no event came, so
    a board whose list empties when its folder leaves the workspace is still to be seen in a
    window that was opened on a `.code-workspace` file. A review tried it again with the same
    outcome; a board in the added folder did open there and listed that folder's model.

The disk and the panel:

16. `workspace.fs.stat` of a link to a file has the `SymbolicLink` bit and the target's size; of a
    file reached through a linked folder it is a plain `File`. **Seen** (both): type 65 with the
    target's size for a link to `/etc/hostname` and for a link to a model beside it, and the node
    read "models/link.owm is a link, and a board opens no link"; a model below a linked folder
    was type 1 and opened. That was a way out of the repository, and a review walked it (both): a
    model behind `out -> /tmp/…` was read and then written into a dirty document, and a picture
    there was read. **Changed:** the backend asks every folder on the way to a file, and a linked
    folder is type 66 to `stat` ([The host half](#the-host-half)). Seen afterwards (both): a model
    and a picture behind a linked folder are refused at every depth, no document of such a file
    is opened, a node that names one says "… is behind a link, and a board opens no link", and a
    model behind plain folders opens. A link to a file and a file behind a linked folder are in
    the picker's list, since the search follows links and the index asks nothing about a file it
    lists; picked, each is refused.
17. `stat` rejects for a missing path, also for `.git` asked in every folder above the board,
    without a prompt or an error shown. **Seen** (both): `EntryNotFound`, no toast, and no error
    in the extension host's log. `permissions` has `Readonly` for a read-only file: **differs**
    (both). A file whose mode forbids writing has no `permissions` at all; VS Code keeps that as
    `Locked` to itself and takes an edit of the file. `Readonly` is what a read-only file system
    says, which is what the fake's `readOnly` now stands for. What the save of such a file does
    for a person who may not write it was **not reached**: the runner is root, and the save went
    through.
18. `fs.createDirectory` and `fs.writeFile`. **Seen** (both): in a repository without an `assets`
    folder the folder was made and the picture stored; a second picture of the same name became
    `pixel-2.png` and the first was as it was.
19. `openTextDocument` of a file that is no text. **Seen** (both): it rejects, and the node says
    "models/binary.owm cannot be read as a text".
20. A custom editor on a `git:` URI. **Seen** (1.146.0): a board opened on the `git:` URI of its
    committed version, through the Git extension's API, had no files: its nodes said "this board
    is in no repository and in no open folder, so it has no files" and its picker was empty. The
    diff of the Source Control view was not opened.
21. A panel that is disposed. **Seen** (both): a tab closed in the task that pressed Delete in an
    armed model, and the edit landed in the model's document, with no error in the extension
    host's log. That `panel.webview` throws afterwards, and the shell's unguarded `resync()`, the
    walk did not reach; a review did (both), with a second board and, in one task of the
    extension host, an outside `applyEdit` on the board document, the page's `edit` and
    `panel.dispose()`. VS Code refused the page's edit ("… has changed in the meantime"),
    `panel.webview` threw "Webview is disposed", and the promise of the shell's message handler
    was rejected with that. Nothing else followed, and the document kept the outside's text. The
    cure is the shell's ([Deferred](#deferred)).

The webview:

22. The extension activates from the VSIX, unpacked and without `node_modules`, and its webview
    loads the script, the sheet and the fonts under the real origin and policy. **Seen** (both,
    and with a VSIX packed beforehand): the page's origin is `vscode-webview://…`, Geist Variable
    and Geist Mono Variable are loaded and are the toolbar's font, and VS Code's console had no
    error and no violation of the policy. A review tried the policy from inside the page (both):
    `eval` and `new Function` throw; a string timer, an inline script, an inline handler, a script
    from a blob and a second script from `dist` without the nonce do not run; `fetch`,
    XMLHttpRequest, WebSocket and `sendBeacon` are blocked; an image, a font, an `@import` and an
    iframe from another site are blocked, while `data:` and `blob:` images load; a workspace
    file and `extension/readme.md` asked through the resource origin are refused, `dist` being
    the only root; a second `acquireVsCodeApi` throws. One thing is open: a `<base>` element takes
    effect, since the shell's policy has no `base-uri` ([Deferred](#deferred)). The extension
    was also installed there as a person installs it
    ([The smoke in a real VS Code](#the-smoke-in-a-real-vs-code-test-smoke)).
23. A custom editor in a hidden tab reports a slot of 0 x 0. **Differs**, and by version. In
    1.146.0 a board behind another webview keeps its size; behind a text editor its page is 300 x
    150, VS Code's stand-in, and a ResizeObserver fires when it is covered and when it is shown.
    In 1.96.0 it keeps its size in both cases. A custom editor that is opened in a background tab
    has no page at all until the tab is shown. No hidden board was ever 0 x 0. **What that
    broke:** a board whose first valid text came while a text editor covered it (a broken file,
    repaired in the editor of the same file) was fitted into 300 x 150 and stayed tiny in a corner
    when shown. **Changed:** the first fit waits for an animation frame
    ([The board inside the shell](#the-board-inside-the-shell-appside-editor)); seen afterwards
    (both): fitted when shown. A board that is hidden and shown again keeps its armed model, its
    selection and its view; the focus is on the body then, so the armed editor has the keys
    again after a click in it.
24. `requestAnimationFrame` stands still in a hidden webview. **Differs** by version. 1.146.0: no
    frame in 4 s behind another webview and none in 2.5 s behind a text editor. 1.96.0: none
    behind a text editor, and 241 frames in 4 s behind another webview, so the poll of
    `view-events.ts` goes on there at the display's rate. In every case `document.visibilityState`
    stays `visible` and no `visibilitychange` fires: the poll's stop on that event never happens
    in VS Code.
25. Where the focus is after the editor opens. **Seen**: in 1.146.0 the board opened with the
    window, the webview had the focus, and Control+Equal before any click moved the shell's
    readout from 52 % to 74 % and left VS Code's window zoom alone. In 1.96.0 the driver opened
    the file by a click in the Explorer, which keeps the focus there: the same key zoomed VS
    Code's window and the board stayed. The shell's keys are the board's once the webview has the
    focus.
26. The undo key. **Seen** (both): inside an armed editor Control+Z undid in the editor, never
    reached the window, and the board document kept its text and its version; on the board's pane
    it reached the window, VS Code took it, and the board document was undone (`reason` Undo)
    while the model was left alone.
27. The Image button's file dialog, a paste and a drop inside a webview. The dialog: **seen**
    (both), as far as Playwright stands in for it: the page may open a file chooser, and the
    picked picture is a file under `assets/`. A paste: **differs** (1.146.0). VS Code keeps the
    paste key from the page and pastes by a command of its own, whose event lands on `<body>`
    whatever has the focus, where a browser aims it at the focused element (seen in plain
    Chromium); the board takes a paste that is aimed at it, so a pasted picture went nowhere.
    **Changed:** `src/webview/paste.ts` aims such a paste at the focused element, held by an e2e
    test; seen afterwards (both): a picture pasted with the focus on the pane is
    `assets/image.png`. A drop: **not reached**, the runner has no pointer that carries a file. A
    drop event the walk made up was taken and stored; after it, and not after a picked or a
    pasted picture, the next double-click armed no model and the shell's Fit button took no click
    until a click on the pane (both, unexplained, and no claim about a real drop).
28. A reloaded webview. **Seen** (both), with Developer: Reload Webviews: a new document, the
    models ready again and the picture drawn, and an edit of the board and one of a model still
    landed. A tab moved into a new window was not tried.
29. The Chromium of VS Code 1.96 (128). **Seen**: the smoke passes on 1.96.0 with all seven
    notations drawn, and the walk ended there as on 1.146.0 but for 23, 24 and 25.
30. Whether the save key reaches the extension while the board document is clean, and what
    happens to a model that is dirty in a tab of its own. **Seen** (both): it does, and they are
    one document. The measurement is under [Saving, as measured](#saving-as-measured).

Seen beside the list, once in scratch: a `.board` file that another program rewrites while it is
clean is read again and the board shows the new nodes; a model above 2 MiB, a dot folder and a
model in `node_modules` end as the guide says (the last opens for a node that names it and is
not listed); an invalid board file locks the canvas with "… Line 4 is no JSON."; VS Code's toasts
lie over the shell's zoom panel while they show; and the extension host's log of a development
window has warnings of VS Code's own for every search and watcher ("Accessing a resource scoped
configuration without providing a resource is not expected. To get the effective value for
'search.useIgnoreFiles' …", "'files.watcherExclude'"), and no error.

### Saving, as measured

Item 30 of the list is a measurement for a decision that is the owner's: (a) a model edited on a
board is a dirty document the person saves, which is what is built; (b) saving the board's tab
also saves the models that board made dirty; (c) every edit of a model is saved at once. Nothing
of (b) or (c) is built. Measured in the walk, on VS Code 1.146.0 and 1.96.0 with the same
outcome (the auto save on 1.146.0 alone), with `editor.formatOnSave` on and a formatter of the
probe's own for `*.owm`:

- **The save key on a clean board.** Control+S with the board's tab active, the board document
  clean and a model dirty, with the focus in the armed editor and with the focus on the pane: VS
  Code saves the clean board document. `onWillSaveTextDocument` fires for it with the reason
  Manual, then `onDidSaveTextDocument`. Nothing is told about the model: it stays dirty, and its
  file is as it was. So (b) has its moment: the extension hears every explicit save of a board,
  dirty or not.
- **A model that is dirty in a tab of its own.** Typing in its text editor reached the board's
  node. An edit on the board then landed in the same document, which stayed dirty, with the file
  untouched. Control+S in its own tab saved all of it: will-save with the reason Manual, the
  formatter asked, did-save, the file equal to the document, and nothing posted to the board.
- **Save All** saved every dirty document, the models a board made dirty among them (each had
  its background tab by then): will-save with the reason Manual for each, the formatter asked for
  each, did-save for each.
- **A save from the extension.** `TextDocument.save()` on a model that was dirty in the
  background answered true, and `workspace.save(uri)` answered the URI. Both ran VS Code's save as
  a person's: will-save with the reason Manual, the formatter asked (so format on save and the
  other save participants run), did-save. Where the file on disk had changed meanwhile to another size, `save()` answered
  false and VS Code showed its toast "Failed to save …: The content of the file is newer. …".
- **Saved at once.** An edit followed by `save()` in the same task left the document clean, and
  VS Code opened no tab for it; a document left dirty got its background tab after about 0.9 s.
- **Auto save.** With `files.autoSave` at `afterDelay`, a model edited in place was saved by VS
  Code itself 1.2 to 1.3 s after the edit (will-save with the reason AfterDelay, no formatter
  asked), where the smoke's and the walk's own setting is `off`.

By reading and not run: a will-save listener has a time budget in VS Code, and a listener that
keeps exceeding it is ignored, so (b) would rather save the models after the board's did-save
than inside its will-save; and (b) needs to know which documents this board made dirty, which the
backend can say, since every write goes through it.

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
  encoded; the build check is two files with a unit test and reads eight sheets, not one. The third
  increment replaced the page around the board: the footer, the link and the app's own sheet are
  gone ([The third increment of the apps against its plan](#the-third-increment-of-the-apps-against-its-plan)).
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

## The second increment of the apps against its plan

**The lead's decisions for the increment.** The owner was told each and may turn each round; none
is the owner's yes.

- **L1, what a page may reach inside the root.** A page reaches only what a board can show: no dot
  segment at any depth, a text only of a model and bytes only of a picture by the host's rule, and
  a backend with a disk checks what a path's text cannot say. Built
  ([The files port](#the-files-port-packagesfiles), [The host half](#the-host-half)). The lead
  named a linked folder on the way as what would not be checked; since the closing round it is,
  which is one more decision that is not the owner's.
- **L2, a version of a text, `PROTOCOL` 2.** A crossing edit and outside change must not leave page
  and place apart. Built: the outside wins, the edit that crossed is dropped whole.
- **L3, the renderer stays as it is.** `BoardHandle.onViewChanged` waits for the owner's yes;
  `apps/ide-editor` polls the view once per animation frame. No file of `packages/renderer/src` or
  `packages/schema-model/src` changed, and the arming traces are the bytes they were. Of the
  renderer's work package only one test case was written (see [DOM contract](#dom-contract)).
- **L4, saving.** Built on a model as a dirty document of its own that the person saves. The lead's
  recommendation to the owner, that saving the board's tab also saves the models the board made
  dirty, is not decided and not built; what it would need was measured in a real VS Code
  ([Saving, as measured](#saving-as-measured)).
- **L5, a real VS Code.** The owner allowed one inside the suite's Docker runner on the machine the
  increment was built on, so the smoke `apps/vscode/test-smoke` and its scripts were pulled forward
  from the next increment, and the list of things only read about VS Code was walked there. The
  smoke is written and passes in the runner on VS Code 1.146.0 and 1.96.0; the list has each item
  as seen, as differing or as not reached. The owner's own walk with the VSIX is still to come.
- **L6, root files.** `package-lock.json`, `release-please-config.json` and
  `.release-please-manifest.json` changed, for what `test/release-config.test.ts` names.
  `test/modeler-collection.test.ts` and every other root file stay as they are; what that test asks
  for is under [State of the port](#state-of-the-port).
- **L7, the working names** stand: extension `board-modeler`, publisher `miragon-gmbh`, view type
  `board.boardEditor`, `engines.vscode` `^1.96.0`, a preview. The owner's to fix before a first
  publish.
- **L8, the dependency on other modelers** stays as built: in `apps/editors` alone
  ([Packages](#packages)).

**Where the tree differs from the plan, and why:**

- **The files port.** A stale edit gets no answer of its own, where the plan says "refused and
  answered": the update that made the newer version is already on its way, and a second one would
  cost the page what it wrote since. The version is counted by `serveFiles`, per open text and per
  life of a page, and a backend never sees it. `BackendText.write` and `TextSession.write` got a
  second parameter, the text the write was made on, which the plan does not name: without it a
  place that awaits before it writes could replace a change it has not told yet, and a drop made
  under a held gesture replaced an outside text. The rule also holds for a create and for what a
  page is told (the list, the changed bytes, the moves). New beside the plan: `board.text.settle`
  with `BoardFiles.settled()`, a retry of the facade by the list of paths, `invalidText`, and a
  guard that takes a place's word of the text it handed out last for no version.
- **`createVsCodeBackend(vscode, { board, suffixes, indexes? })`**, not
  `(vscode, { root, suffixes })`: the shell's `onDidOpen` is synchronous and the root is found with
  stats, so the backend is made for the board file and looks for its root afterwards.
  `boardEditorOptions(backendFor)` is generic over the document and serves a backend that answers
  every request where it is handed none.
- **The host counts its own version**, which is the files server's count; the plan left the choice
  open. What the backend adds is the test of the write's base against the document's text in the
  task that hands VS Code the edit.
- **The list leaves out `node_modules`**, which the plan does not say (`findFiles` reads no
  `.gitignore`), and a created folder is answered with a whole search again, not with a search
  below it. A model's size cap is 2 MiB; the plan names no number. `BackendText.readOnly` comes
  from `stat`'s permissions.
- **`mountBoardEditor`**: `root` is optional (default `#app`); there is no `example` option; the
  handle also has `document`; and `destroy()` returns a promise, because the board unmounts its
  editors a microtask after its own `destroy()` and the files may only go after that.
  `boardZoomTarget` takes one options object, since `canFit()` follows the content. New beside the
  plan: a text the board already shows is not imported, and a document the host opened read only is
  locked like an invalid one.
- **The sheet's start margin** is the shell's token `--cd-shell-frei` and not the literal 64 px,
  and the third rule puts React Flow's attribution above the zoom panel, where the plan only says
  "clear of the zoom panel".
- **The explicit fit is a jump**, not the 250 ms animation the shell's `ZoomTarget` describes: the
  board's own Fit button jumps too, and every animation tick would be a board zoom under the arm
  rules. The first fit is made only if the board has content at its first accepted text.
- **No `tsconfigRaw` in `webviewBundle`**, which the plan's scratch build had
  ([The suite's editors](#the-suites-editors-appseditors)).
- **The webview's export** is `{ files, mounted, destroy() }` with `mounted` a promise:
  `mountBoardEditor` is async and an IIFE bundle has no top-level await. Its teardown does not
  await `files.settled()`.
- **Playwright Test runs the project `vscode-webview`** on the machine the increment was built on,
  through the local sandbox config; the plan had a Vitest browser file as the way out. The
  shipped-bundle spec builds the extension itself and answers every request of the page, not one
  `board.text.open`, so all seven renderers run under the policy.
- **The scripts `test:vscode` and `test:vscode:docker`** are scripts of the board workspace, as in
  Business Model Canvas, since the Docker runner's default command is `npm run test:vscode` in the
  modeler's folder.
- **More rules and more tests than the plan lists**: `vscode-host-no-page-code` reaches further
  than the plan's sentence (React Flow, Yjs, the shell's entries for a page, all of `apps/editors`
  but the suffix table), `packages-no-apps` names every app workspace, and both new workspaces have
  more test files than the module layout names.
- **Made by the integration:** the board file in the test page's repository and the test that it is
  never a file of the files; the held deliveries of the test page and the test of an edit that
  crosses a change from outside in the page; the test of a reloaded webview over the channel; and
  the paragraphs of this guide.
- **Made after the run in a real VS Code**, each for something a real one showed and the stand-ins
  had not: the index's watcher on every entry, with its look at a new folder and the list kept to
  what a search finds; `src/webview/paste.ts`; the first fit in an animation frame; the fake's
  watcher, its documents of removed files and its read-only files; the smoke's custom step in
  three parts, where the plan asks for a model drawn and the picture loaded.
- **Made in the closing round**, after an independent review
  ([State of the port](#state-of-the-port)): the look at every folder on the way to a file, and
  the limit of a written model's size ([The host half](#the-host-half)). Both were seen afterwards
  in the runner, on VS Code 1.146.0 and 1.96.0, by a scratch script that handed the extension
  the messages of a page and wrote a node onto the board.

## The third increment of the apps against its plan

The increment's aim: everything the suite's CI asks of a modeler, so that a pull request with this
branch could pass `ci-ok`, and nothing of the product beyond that. No pull request was opened and
nothing was published.

**The lead's decisions for the increment.** The owner was told each and may turn each round; none
is the owner's yes.

- **M1, the deviation.** The board keeps a toolbar of its own beside the shell's chrome, its e2e
  projects run the board's own specs and not the shell's conformance kit, and the smoke runs
  without the steps keys, history and workbench: written down with its end under
  [Three deviations under the shell](#three-deviations-under-the-shell-each-with-an-end).
- **M2, the public names** stand as working names: extension `board-modeler`, publisher
  `miragon-gmbh`, view type `board.boardEditor`, `engines.vscode` `^1.96.0`, `preview: true`. They
  are fixed with the first publish.
- **M3, release components** in the Business Model Canvas pattern: eight, one per workspace the
  extension or the web app bundles ([Packages](#packages)).
- **M4, the path rule.** A change under another modeler's `packages/` also runs the board's jobs.
  Built wider than the decision's words: the rule also takes a modeler's `example/` and its
  `apps/vscode/package.json`, the two other things the board's tests read of a modeler
  ([Commands](#commands)). Cutting it back is one line of `.github/scripts/ci-paths.sh` and three
  rows of `test/ci-paths.test.ts`.
- **M5, the extension pack.** `board` is in `PENDING_FIRST_PUBLISH` of
  `test/modeler-collection.test.ts`; the pack and its walkthrough are untouched.
- **M6, the web app** inside the shell's web column through `apps/ide-editor`, with what it was
  before as what "Show example" opens
  ([The web app](#the-web-app-and-the-example-appswebapp-example-e2e)).
- **M7, third-party notices** for what the web app's build and the VSIX carry, with a check that
  fails when a build names a licence file it does not hold
  ([The suite's editors](#the-suites-editors-appseditors)).
- **M8, the root's documents.** The board's rows, and the sentences that were untrue with the
  board in the tree, in the suite's `CLAUDE.md`, `CONTRIBUTING.md`, `README.md` and the three issue
  templates; the board is marked as in progress and unpublished there.
- **M9, an icon.** The extension has one, the Miragon comet, copied and not drawn
  ([The webview half](#the-webview-half-srcwebview), the papers). The web app's `favicon.svg`
  follows the same decision.

**Where the tree differs from the plan, and why:**

- **The notices are written by the build** and not committed, where the plan's module layout names
  the other modelers' pattern, a committed file with `npm run notices`: a committed list of what
  seven renderers bundle would go stale with a dependency bump in any modeler.
- **No `CHANGELOG.md` per component** but the extension's, which the plan lists: release-please
  writes each with the component's first release, as for Business Model Canvas and C4. No version
  line changed: every workspace stays at 0.0.0.
- **14 `extra-files` entries of the first two increments went**: the pins in the board's own
  manifests under the contract, the shell and eleven components of the other modelers. With the
  board's workspaces components themselves, release-please's `node-workspace` plugin moves those
  pins, and the root test no longer asks for the entries.
- **The web app** is split into more modules than the plan names (`actions`, `column`, `page`,
  `session`, `web-host`, `no-repository`; the plan's `files.ts` is `board-file.ts`), for the lint
  limit of a function and so that the pure parts have unit tests. Every document is an editor of
  its own. The reset is an entry of the shell's menu with an Undo, the footer under the board and
  `page.css` are gone, and the lasting lines stand in the shell's status box. `startApp` takes
  `komet` and returns `{ ready, editor(), shown(), settled(), destroy() }`. The page starts on the
  start screen, as every web app of the suite, and no longer on the example. The model picker of a
  board without a repository cannot say why it is empty, so the page says it in a toast.
- **`apps/ide-editor`** got a host type a web app fits (`BoardEditorHost`), the options
  `invalidText` and `fileKeys`, a lock that writes `inert` only for its own change, and two rules
  for the web column in `app.css`, where this guide had said three and no more.
- **The smoke and its scripts** were built with the second increment and are unchanged.
- **Made by the integration:** the two lines of the lockfile for the web app's new pins (written
  by `npm install --package-lock-only`, which changed nothing else); the notices plugin in the web
  app's Vite config, the notices check in its `check:build` and `test/build-config.test.ts`; the
  notices check behind `package:vscode`; the example's sentence on the reset, which is a menu
  entry now; the board's row and paragraph in `docs/ci-and-releases.md`; the sentence on the
  smoke's themes in the root `CONTRIBUTING.md` and the root documents' links to the deviation; and
  the paragraphs of this guide.
- **Made after the review of the increment** ([State of the port](#state-of-the-port)): the offer
  of a kept board at `?reset`, the copied works in the notices check, and the extension's README
  without a word on where it is published, each with its tests.
- **Named and not changed**, outside what the integration could edit: `.miragon/brand.json` and
  `test/brand-lint-config.test.ts` do not name the two licence texts under
  `apps/editors/build/licences/`, which are third-party text as Context Maps' `apache-2.0.txt` is.
  The two files change together or not at all (the test passes as the tree is), and brand-lint was
  not run on them.

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
  licence (`COPIED_WORKS`, [The suite's editors](#the-suites-editors-appseditors)).
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

## Tests

[`packages/renderer/test/README.md`](packages/renderer/test/README.md) says what each test file
holds, how the arming traces are recorded anew, how the conformance harness is built, and what a
browser test of the board has to know (synthetic input, the lazy parts, the module-level state,
the window). Read it before you write a test. Here are the two projects and the rules.

- `npm run board test` (project `unit`, Node) runs `packages/*/test/**/*.test.ts` and
  `apps/*/test/**/*.test.ts` without the `test/browser` folders: 69 files, 1321 tests. The module
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
  - `packages/files/test` (5 files, 343 tests): the path rules (`paths`), each side of the protocol
    alone, message by message, against a page that posts whatever it likes and against a scripted
    host (`protocol`), client and server together on a memory backend with more than one reader on
    a path (`fan-out`), the memory backend alone (`memory`) and `connectBackend` over a real
    `MessageChannel` (`local`). `test/support/wire.ts` is the channel in memory they share: it
    copies each message and delivers it later, in order. With the second increment: the version of
    a text and the crossings (`protocol`, `fan-out`), the host's rule and the paths a board does
    not reach, and the settle.
  - `packages/host/test` (6 files, 70 tests): the fit, the binding on a session double, the
    registry's load, the model list and `describe`, the images, the host's parts, and the files
    server's limit for a new file and the picture suffixes of a host's rule against the board's
    own. [`packages/host/test/README.md`](packages/host/test/README.md) says what each file holds.
  - `apps/editors/test` (9 files, 144 tests): `suffixes.sync` (the table against the manifests,
    the registry against the table and against `index.d.ts`), `aliases.sync`, `base.sync`,
    `text-rules`, `zod-jitless`, `build-helpers` (two of its tests are Vite builds in memory),
    `webview-bundle` (one esbuild build in memory), `cruise-rules` and `notices` (56 tests: the
    generator on trees the test writes, on a real page of the board with the seven notations built
    in memory with esbuild, on a build on disk and in two Vite builds; the check's three reasons,
    a copied work among them, also one that a source names only in a plain comment).
    The notices tests write their trees into the OS temp folder and remove them.
  - `apps/webapp/test` (9 files, 133 tests): `storage` (what is kept, what is left out, a storage
    that refuses, the reset and the way back from it, the open document, the pictures a board shows
    and the kept ones it does not), `keeping` (the repository in memory with its writes kept),
    `example` (the board is canonical, one model per notation, every named file is in the folder,
    the app reads the folder's bytes, the page's rule reaches every file of it), `check-build` (a
    whole build and one build per missing marker), `board-file` (the download's name, a file as a
    board text, a board that holds nothing, a board that names files), `column` (the shell's web
    column for the example and for a board), `no-repository` (the backend alone and behind the
    port, with the page's sentences), `web-host` (the document a web app hands the editor: once,
    every change, a refused text with and without a fallback) and `build-config` (the Vite config:
    the notices plugin in a build only, the source maps, the legal comments).
  - `apps/ide-editor/test` (5 files, 45 tests): `zoom-target` (the shell's raster with 100 % to
    135 % as one step, the fit against the shell's own `fitViewbox`, the smallest zoom, the members
    of the target on a fake board), `first-fit` (once, in the frame after the first text, on a
    page whose frames the test draws; a page that is not painted and has VS Code's stand-in size
    until it is; a slot that gets its size later; an empty board; a wait that is stopped, for the
    frame and for the size), `view-events` (one look per frame on a
    page whose frames the test draws, no frame without a listener or while hidden, a board that
    offers the event), `invalid` (the lock's calls on a shell double, the status sentence, an
    inert slot that is not the lock's own left alone) and `shortcuts` (the board's rows, and a web
    app's File group).
  - `apps/vscode/test` (19 files, 296 tests). The host half: the fake VS Code held to what it
    claims (`memory-vscode`), the root rule and the look at every folder on the way to a file
    (`root`), the index of a root on fake timers
    (`file-index`, among its cases the folders another program makes, fills, moves and removes
    as a real VS Code names them), a model's text over documents, with the files a board does not
    open and the size of a write (`documents`), pictures (`bytes`), the backend
    behind the files server on a channel in memory (`backend`) and behind the page's own client
    (`port`), the editor options on the shell's host stub with a memory backend
    (`boardEditorOptions`), the registered extension against the `vscode` mock (`boardEditor`,
    `webviewHtml`), the production host bundle built in memory and activated with nothing but
    `vscode` and Node (`bundle`), the manifest and the VSIX's ignore file (`contributions`), what
    the host's sources must not do (`host-rules`: no module of Node, no `fsPath`, no save,
    `writeFile` only for a new picture, `vscode` imported only where the extension is registered)
    and the mock's identity (`vscode-mock`). The webview half: `webview-channel` (the files channel
    alone, then a page's files client over it against the editor's options on the shell's host
    stub, a reloaded webview among its cases), `webview-rules` (the entry's order, the one API, no
    await before the mount, and the two suffix lists held equal) and `webview-bundle` (the
    production webview bundle built in memory). The papers: `notices` (the notices of the two
    production bundles built in memory, held by the check, which fails without the section of a
    font package or of a copied work; the VSIX reader) and `papers` (the icon by its size and
    checksum, the ignore file, the CHANGELOG, the README, which names no marketplace).
- `npm run board test:browser` (project `browser`, Chromium, a window of 1280 x 800) runs
  `packages/renderer/test/browser`, `packages/host/test/browser` and `apps/*/test/browser`, each
  `**/*.test.{ts,tsx}`: 24 files, 850 tests. React Flow measures its nodes, so nothing of the
  canvas runs in jsdom or Node, and no diagram-js renderer mounts there either (Business Model
  Canvas's import throws `activeLayer.getBBox is not a function` under jsdom).
  - The renderer's fifteen files (662 tests): the arm rules on a bench of fakes (`arming`), the
    sheet on static markup (`styles`), React Flow's store (`react-flow-internals`), the
    contract's kit (`conformance`), and boards mounted through the entry (`toolchain`, `canvas`,
    `canvas-behaviour`, `chrome`, `nodes`, `images`, `overlay-surface`, `hostile-host`,
    `contract-edges`, `embedded-model`, `live-document`).
  - `packages/host/test/browser` (3 files, 66 tests): `embed` (the adapter alone in an element
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
  - `apps/ide-editor/test/browser/board-editor.browser.test.ts` (37 tests): `mountBoardEditor` on
    the shell's real `mountShell` in the IDE column through a host of the test's own
    (`support/ide-host.ts`, whose document keeps the rules of the shell's sync and is driven by the
    test), with real input. The two chromes (no overlap of trigger and toolbar, the Done control at
    the size it has without a shell, one visible zoom control, the attribution, the shortcuts
    dialog from the menu); the first view (the shell's fit, capped, a hidden root, never again);
    the shell's zoom (a real wheel followed by the readout, the four buttons, the four keys,
    `fitView`, the board's lower limit); the document (one edit of one line for Group, Control+Z
    left to the host and taken by the board for a host without a history, the same text not
    imported, the empty-file hint); a refused text (lock, line, no edit, unlock; a refused first
    text; a read-only document); a model of the repository with the suite's Wardley editor from the
    registry (armed by a double-click, a click selects, the undo key contained or not, Done, a zoom
    step that ends the editing, the teardown's order); the mount's refusals and the teardown (no
    class on html, no child in the root, no frame requested afterwards). With the third increment:
    the editor under a web app's host of the test's own (`testWebHost` in `support/ide-host.ts`:
    the web column's start screen and legal line, the two rules of the sheet for it), the file
    keys in the shortcuts dialog and a host's own line for a refused model. The files of every
    test come from `support/files.ts` alone.
  - `apps/webapp/test/browser/app.browser.test.ts` (32 tests): `startApp` on a store of the test's
    own. The start screen; a board without a repository (a file handed to the page's input, the keys
    without a click, the picker, a refused picture, a file that is no board, the offer and its end,
    and the reset in the address over a kept board, which offers that board back and has nothing to
    offer for a kept text that is no board); the board as a download (the anchor the page clicks is
    held with its blob, since the browser's own download is the e2e's); the example (shown, a model
    added from the picker, `destroy()`, a page that gives the board no ancestor a fixed popup would
    be placed against); "what a person changes", six tests of one story on one store, each going on
    where the one before it ended, which keep their order in a shuffled run (`{ shuffle: false }`:
    an edit in a model, a note, a picked picture, a second start, the reset from the menu with its
    offer, the reset in the address); a kept model its editor refuses; and a browser that does not
    keep (a storage that refuses, one with no room, a picture it did not keep, a kept picture no
    node shows, an unreadable kept board). A browser test that reaches for the toolbar or counts
    drawn nodes right after a mount waits first: both are lazy parts, and a shuffled order found the
    tests of this file that did not (12 shuffled orders of the two app files pass since).
- Both projects take the other modelers from their sources through
  `apps/editors/build/aliases.mjs`, so no other modeler is built first, and the browser project
  pre-bundles what `apps/editors/build/prebundle.mjs` reads from those sources.
  `vitest.config.ts` exports the browser project as `browserProject`.
- `npm run board test:e2e` (Playwright) runs 25 tests in two projects, the board's own specs in
  the place of the shell's conformance kit
  ([Three deviations under the shell](#three-deviations-under-the-shell-each-with-an-end)).
  `e2e/tests/webapp/board.spec.ts` (8 tests) is under
  [The web app](#the-web-app-and-the-example-appswebapp-example-e2e): the start screen, the
  example with seven engines ready and no page error, what is kept over a reload and the reset, a
  new board, a file opened through the browser's dialog, the download's bytes, and two narrow
  windows. `e2e/tests/vscode` (17 tests: `document-sync` 4,
  `files` 11, `shipped-bundle` 2) is under
  [The webview test page and the project `vscode-webview`](#the-webview-test-page-and-the-project-vscode-webview-e2e).
- `npm run board test:vscode` runs the smoke: one test, the packed extension in a real VS Code
  ([The smoke in a real VS Code](#the-smoke-in-a-real-vs-code-test-smoke)). Its files are in
  `apps/vscode/test-smoke`, which no other project collects.

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
([The suite's editors](#the-suites-editors-appseditors)).

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
npx playwright test --config playwright.sandbox.config.ts --project=vscode-webview
```

Playwright Test starts that way on the agent VM, with both `webServer` entries. Either project
starts both dev servers (ports 5184 and 5194) and stops them again.

`BOARD_VITE_CACHE` lets several people run it at once without sharing Vite's pre-bundle. A path
with a `node_modules` segment keeps Vite from warning about Vitest's own pre-bundle ("The above
dynamic import cannot be analyzed"); without one the warning comes with every run and fails
nothing.

**A real VS Code where Chromium must keep its sandbox.** On the agent VM a real VS Code runs only
inside the suite's Docker runner (the shell's `modeler-shell-vscode-docker`, behind
`npm run board test:vscode:docker`): the smoke starts VS Code with `--no-sandbox` inside the
container, and the owner allowed exactly that. Chromium and Playwright started on the machine
itself keep their sandbox. One run at a time: two runs would write into the same VS Code cache. The
runner mounts the repository read-only, copies it without `node_modules` and `.git` and runs
`npm ci` on the copy, so it runs on a snapshot whose lockfile is in step with its manifests. For a
working tree with uncommitted work:

```sh
P=<a scratch folder>; mkdir -p $P/repo
rsync -a --exclude node_modules --exclude .git --exclude test-results --exclude .vitest \
  <the repository>/ $P/repo/    # keeps packages/api/dist and packages/shell/dist
cd $P/repo/modelers/board
node <the repository>/packages/shell/dist/vscode-docker.js \
  --results modelers/board/test-results/vscode-smoke    # options: --script <name>, --env NAME=value
```

The results (the screenshots, and VS Code's logs with `--env VSCODE_SMOKE_KEEP=1`) land in
`$P/repo/modelers/board/test-results/vscode-smoke`. The board's smoke ran this way, each run on a
fresh snapshot:

```sh
node <the repository>/packages/shell/dist/vscode-docker.js \
  --results modelers/board/test-results/vscode-smoke                  # the newest stable VS Code
node … --results … --env VSCODE_VERSION=1.96.0                        # the manifest's minimum
node … --results … --env VSCODE_SMOKE_VSIX=apps/vscode/board-modeler.vsix  # a packed VSIX
```

A path in `VSCODE_SMOKE_VSIX` is read from `modelers/board` inside the container, where the
snapshot lies, so the VSIX has to be in the snapshot. With the image built and VS Code in the
runner's cache a run takes about 25 s, of which `npm ci` is 10 s and the smoke 11 s. Docker keeps
one image (`modeler-shell-vscode-smoke:node<version>-<hash>`, about 0.9 GB) and two volumes
(`modeler-shell-vscode-cache` with each VS Code it downloaded, about 1.1 GB for 1.146.0 and 0.4 GB
for 1.96.0, and `modeler-shell-npm-cache`); `docker volume rm` and `docker rmi` take them away.

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
  end of the web app that waits for the board's editors, and the notices of both builds.
- In the VS Code extension: the owner's own walk with the VSIX; following a file that is
  renamed or moved (`onMoved` never fires: the node says its file is gone); saving the models
  together with the board; the view kept across a reload; an entry in the Problems view; New Board
  commands and a walkthrough; an export; a file no notation of the suite covers; a theme but light;
  an icon of the board's own (the extension shows the Miragon comet until the Miragon modeler icon
  set has a board icon, which is a pull request in Miragon/corporate-identity; then the file is
  copied from the set and the checksum in `apps/vscode/test/papers.test.ts` replaced).
- In the web app: a link in the address that carries a board, a Share action, an export but the
  board file, a link to the third-party notices of the build, a Netlify site (`netlify.toml`), and
  a folder of the person's own behind the page.
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
- What a modeler has beside its code: `docs/` and a page on the docs site, the store images
  (`.miragon/product-shots.yaml`), and, after the first publish, the entry in the modeler
  collection with its walkthrough step.
- A list of allowed licences that the suite owns: the board's is in
  `apps/editors/build/notices.mjs`.

**Found while the first increment of the apps was built, and not changed.** In the renderer, in
the suite's tooling and in other modelers; each is its owner's to decide.

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
  different options answer for each other. The tree's own configs have no such plugin. A table
  of single edits that is applied by such a plugin must not take a transform hook that did not
  run for an edit that was not applied: on a second run the module comes from the cache.

**Found while the second increment was built, and not changed.** In the shell, in the renderer and
in the tooling; each is its owner's to decide. What was found in the files port, the host package
and the extension stands in their own sections.

- **The shell's focus fallback** (`focusCanvasOrTrigger` in `packages/shell/src/dom/mount.ts`, by
  reading): it looks for `svg[tabindex]` in the slot. Under a board that is the svg of the first
  model's editor, inert in a preview, so the focus falls to the menu trigger and never to the
  board's pane. It runs when the empty-file hint hides while it holds the focus and when a dialog
  closes without a remembered element. The zoom target's own `focus()` goes to the pane and is not
  affected.
- **The shell's stacking** (measured in the browser test of `apps/ide-editor`, pinned there as
  built): `.cd-shell > .cd-shell-canvas` is `isolation: isolate; z-index: 0`, so a
  `position: fixed` popup of an armed editor lies under the shell's islands whatever its z-index.
- **The shell's `resync()` into a panel that is gone** (read in VS Code 1.96, then seen by a
  review in VS Code 1.146.0 and 1.96.0, item 21 of
  [Taken for granted about VS Code](#taken-for-granted-about-vs-code)): `panel.webview` throws
  "Webview is disposed" once the panel is disposed, and the shell's `post` in
  `vscode/extension/modeler-editor.ts` is `panel.webview.postMessage(message)`, so its resync after
  an edit that VS Code refused while the panel closed rejects inside the shell's message handler.
  Nothing else follows. The board's own channel catches a throw and a rejection. A guard, for the
  shell's owner:
  `const post = (message) => { try { return panel.webview.postMessage(message); } catch { return Promise.resolve(false); } }`.
- **The shell shows any text a page posts as a notification** (`vscode/extension/modeler-editor.ts`,
  the cases `info` and `error`). Seen by a review in VS Code 1.146.0 and 1.96.0: a message
  `{ type: "info", message }` handed to the extension as the page posts it stood as a toast of
  VS Code with exactly that text, and on the stub one of 100,000 characters did too. The board's
  page posts neither type, so for the board this is only what a page that is no longer the
  board's could do: put words of its own into a notification of the extension. `showProblems`
  opens the Problems panel and nothing else, and no other message of a page runs a command. A
  cure, for the shell's owner: an option of `registerModelerEditor` that turns the two answers
  off for a modeler that posts none, or a cap on the length and a fixed prefix.
- **The shell's policy leaves `base-uri` and `form-action` open** (`contentSecurityPolicy` in
  `vscode/extension/html.ts`). A `<base href>` that a page adds takes effect (seen by the review:
  `document.baseURI` was the other site's), though every load was still held by the other
  directives. A cure, for the shell's owner: `base-uri 'none'; form-action 'none'`.
- **A view the host sets ends an editing** (the arm rules' viewport watch): every step of the
  shell's zoom panel while a model is armed, and, by the plan's spike and not run here, the zoom
  keys pressed inside an armed editor whose focus is on its svg. The contract recommends that a
  host's view change leaves an interaction open.
- **Three pixels.** The toolbar's top edge is at 15 px (React Flow's panel margin), the shell's
  menu trigger at 12 px. A cure is a fourth rule of the app's sheet, which moves the band the arm
  rules read, or a change of the renderer.
- **No end signal**, as under Not built: `mountBoardEditor` knows that the editors are gone only by
  queueing a microtask behind the one `destroy()` queues. A change of that timing in the renderer
  breaks the order for every host, and the order test of `apps/ide-editor` fails then.
- **A board file whose lines are not in the canonical order** is shown as it is and rewritten in
  the canonical order by the first gesture: one edit over every line between the first and the last
  that differ.
- **The cruise and an import that does not resolve.** A relative import into another modeler that
  does not resolve is named by its specifier as written and is then not matched by
  `packages-no-other-modeler`. Harmless in practice: the type check fails on the unresolved module.
- **A build that leaves its maps behind.** `build:vscode` followed by `package:vscode` leaves the
  development build's source maps in `apps/vscode/dist` beside the production bundle, since esbuild
  does not clean. The VSIX leaves them out.

**Found while the third increment was built, and not changed.** In the renderer, the host
package, the shell and other modelers; each is its owner's to decide.

- **A board without a repository has no words of its own in the renderer and the host package.**
  The host package's `openEditor` shows a host's reason for a file it cannot open behind its fixed
  "This file could not be opened.", on the danger ground of a failed file; a state and a line of
  the host's own, as `invalidText` is for a refused file, would say it without the look of a
  failure. The renderer's toolbar has no place for a host's words when the model list is empty,
  and `gestures/images.ts` words the notice for a picture a host does not store itself. Until
  then the web app says both in its own toast and notice text.
- **The word of a lazy part.** `.board-slot` shows the name of the part as text while it loads
  ("Toolbar" in the middle of the board, for a moment at the first load). Behind the web app's
  start screen a rule of `app.css` hides it.
- **The status box over the toolbar's third row** below 480 px
  ([The board inside the shell](#the-board-inside-the-shell-appside-editor)).
- **The shell's focus fallback in the web host** (as above, `svg[tabindex]`): after the start
  screen's New diagram the shell hands the focus to the menu trigger and not to the board. The web
  app focuses the board's pane itself, there and after every document it mounts.
- **C4's own builds**, by reading and not built here: its VSIX and its web app keep dagre's legal
  comment, and neither ships `dagre.esm.js.LEGAL.txt`. Its VSIX has dagre's licence text in its
  notices; its web app has no notices file.
- **Nothing in the suite keeps a modeler on `main` from being published**
  ([State of the port](#state-of-the-port)): an opt-out would be a change of
  `.github/scripts/release-plan.mjs` with a root test, tried in a scratch copy and written down
  there.
- **The toolbar below 400 px, the toast over the lower row of models, and a failed node that
  arms** ([The web app](#the-web-app-and-the-example-appswebapp-example-e2e), Known and not
  cured). The first and the third are the renderer's, the second the shell's.
- **No root test holds `initial-version`.** With that line taken out of a component at 0.0.0,
  `test/release-config.test.ts` still passes, and release-please would then propose 1.0.0 for it
  (tried by the review of the third increment for `board-webapp`; the same holds for Business
  Model Canvas on `main`). A case in that test is a root change.
- **`npm ci --dry-run` is no check of the lockfile**: it printed "up to date" while the lockfile
  lacked two dependencies a manifest of the board named, both workspaces that were linked already.
  `test/release-config.test.ts` failed for it, since two `extra-files` entries pointed at the
  missing lines.

- **The root tests leave files in the temp folder.** `ci-paths.sh affected` makes a file with
  `mktemp` and does not remove it (on `main` too), and `test/ci-paths.test.ts` calls it for every
  case: one `npm run test:plugin` leaves 58 small files `tmp.*` in the OS temp folder. Where that
  folder must stay clean, run it with `TMPDIR` set to a folder of one's own.

**Found in a real VS Code, and not changed.** Each was seen in the walk
([Taken for granted about VS Code](#taken-for-granted-about-vs-code)); what the walk found and
cured is in the sections of the code it changed.

- **The poll of the view goes on in a hidden tab** in VS Code 1.96: a board behind another
  webview still gets its animation frames there (241 in 4 s), and in no version does the page
  hear that it is hidden. `view-events.ts` then reads `getViewState()` at the display's rate for
  every board in a background tab. The cure is the board's own view event (R1 of the plan), which
  waits for the owner's yes.
- **A link to a file, and a file behind a linked folder, are offered by the picker** and refused
  when picked ("… is a link, and a board opens no link", "… is behind a link, and a board opens
  no link"): the search follows links. Leaving them out of the list costs one `stat` per listed
  file and per folder on its way.
- **A `.board` file given on the command line at the first start after an install opens as
  text** (VS Code 1.146.0, the VSIX installed with `code --install-extension`, two runs by a
  review). Closed and opened from the Explorer it is the board, and so is the restored tab after
  a restart. Nothing in the extension is known to cure it; the extension's README says what to do.
- **A model that is edited in a narrow editor** is out of reach in part, and **a page can ask a
  host for more than it should**: see [The board inside the shell](#the-board-inside-the-shell-appside-editor)
  and [The files port](#the-files-port-packagesfiles).
- **A file that may not be written** is not read only to an extension: `stat` has no permissions
  for it, the edit is taken, and the save fails for the person. What that save shows was not
  seen, since the runner is root.
- **VS Code's toasts lie over the shell's zoom panel** while they show, for every modeler under
  the shell.
- **The focus after a tab was hidden** is on the body, so an armed editor has the keys again only
  after a click in it.
- **After a drop event the walk made up**, and not after a picked or a pasted picture, the next
  double-click armed no model and the shell's Fit button took no click, until a click on the pane
  (VS Code 1.146.0 and 1.96.0). Unexplained, and no claim about a real drop, which the runner
  cannot make.

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
