# State of the port: the record

The record behind [State of the port](../CLAUDE.md#state-of-the-port), moved here from
[`CLAUDE.md`](../CLAUDE.md) as it was written. That file keeps what is in the tree, the counts and
what is still to come; what is run on the tree, what a review finds and what changes about CI and
a release is written here.

## The review after the move

**After the move, a review.** Seven reviewers looked for what is wrong with the moved board. What
they found is fixed and under a test, or stands under [Deferred](../CLAUDE.md#deferred) as it was measured.
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

## What was run

**The closing round of the fourth increment**, on 2026-11-16 on the same machine, after the
review of the increment ([The reviews of the increments](#the-reviews-of-the-increments)), with
the tree as the round left it:

- `npm run board lint`, `test` (77 files, 1621 tests), `depcruise` (no violation in 399 modules
  and 1238 dependencies) and `format:check` pass; so do the root's `npm run test:plugin` whole
  (14 files, 323 tests) and `npm run format:check`, and the checksums of the theme files verify
  (25 of 25). `npm run build:shared` was not needed: the contract and the shell are unchanged,
  and no source of theirs is newer than their `dist`.
- The whole browser project passes through the local sandbox config, five runs in a row (27
  files, 951 tests each, about 24 s a run, no test retried). Its first run of the round failed
  one test of the web app, rightly: a kept view on the empty space between two far notes is no
  longer restored, which that test's board had by chance. The board of that test changed, and
  a test of its own holds the new outcome ([The web app](webapp.md#tests-of-this-part)).
- Both e2e projects pass through the local Playwright sandbox config, three runs each on the dev
  servers they start: `webapp` (10 tests) and `vscode-webview` (26 tests).
- `npm run board build:webapp` and the web app's `check:build` pass (73 bundled packages and 2
  copied works against 51 sections). `npm run board build:vscode` and `package:vscode` pass and
  write the VSIX: 27 files, 1,103,501 bytes, no source, test, map, `node_modules` or developer
  document in it; its notices check passes (77 bundled packages and 3 copied works against 52
  sections).
- **In a real VS Code**, inside the Docker runner, one run at a time, each on a fresh snapshot:
  the smoke passes on VS Code 1.146.0 (22.3 s) and on 1.96.0 (26.8 s); and seven runs of the
  review's and the builders' walk scripts saw each change that VS Code has a part in, on both
  versions ([the review in a real VS Code](vscode.md#the-review-of-the-fourth-increment-in-a-real-vs-code)).
- Of 38 single edits of what the round wrote, each made in a file, run against the tests and
  taken back with the file's checksum compared, 37 fail a test (36 a unit test, one the e2e
  test of a kept view between the nodes, and one of the 36 the browser file `moves` as well).
  The one that passes takes the record of a clean document along when its file is renamed,
  which the document's next change event removes again.
- Against the third increment's commit no file differs under `packages/renderer/src`,
  `packages/schema-model/src`, the root's `packages/`, `.github/workflows` or another modeler's
  folder, and the arming traces are the same bytes. `npm ls` names one version each of `react`,
  `react-dom`, `yjs`, `@xyflow/react` and `diagram-js`.
- No Chromium command line outside a container carried `--no-sandbox` in the samples of the
  process table taken during the browser and e2e runs of the gate (25,520 command lines) and
  during every run of the runner, where VS Code starts without its sandbox inside the container
  alone.
- **Not run:** the committed browser and Playwright configs; CI; Node 22; brand-lint (the
  `miragon-brand` plugin is not on that machine); the smoke outside the runner and with a packed
  VSIX; the other modelers' checks, none of whose files changed; a release or a workflow run;
  and a walk by a person, on any system.

**The fourth increment in a real VS Code**, on 2026-11-16 on the same machine, after the
integration below, inside the suite's Docker runner, one run at a time and each on a fresh
snapshot of the working tree:

- **The smoke has its steps for daily use** and passes with them on VS Code 1.146.0, on 1.96.0
  and with a VSIX packed beforehand, on the tree as it stands (22.9 s, 27.0 s and 22.2 s).
  Two controls, each on a snapshot with one edit of the product, fail it at the new steps
  ([The smoke in a real VS Code](vscode.md#the-smoke-in-a-real-vs-code-test-smoke)).
- **The walk** through what the increment takes for granted about VS Code ran as a scratch
  script with a probe in the extension host: two whole passes and three partial ones on
  1.146.0, one whole pass on 1.96.0. Of sixteen points ten were seen as assumed, two differed
  and four were seen in part, each with the run and the numbers under
  [Taken for granted for daily use](vscode.md#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code).
  The last whole pass on 1.146.0 and the pass on 1.96.0 ran on the tree with the change the
  walk made to the index; what was edited after them is a function of the index moved out of
  another without a change of what it does, tests, comments and these documents.
- **What the walk changed:** `apps/vscode/src/files/file-index.ts` remembers for 5 s which files
  a watcher's word took off the list, so that a rename event that comes after it still tells
  their move; the fake VS Code gives a document one line break, tells the watchers of a move
  what came before what went, and has a drag of several entries; nine tests are new (three of
  the fake's line breaks, one of its drag, one of the Problems entry of a file with a lone
  carriage return, four of the index) and four follow the watcher's order. Six single edits of
  the new code each fail a test. The extension's README names the undo after a rename.
- **On the tree as it stands:** `npm run board lint`, `test` (77 files, 1586 tests),
  `depcruise` (no violation in 398 modules and 1232 dependencies) and `format:check` pass; the
  whole browser project passes twice through the local sandbox config (27 files, 949 tests,
  about 26 s a run); both e2e projects pass once through the local Playwright sandbox config
  (`webapp` 10, `vscode-webview` 25); `npm run board package:vscode` writes the VSIX (27
  files, 1.05 MB) and its notices check passes; and the root's `npm run test:plugin` (14
  files, 323 tests) and `npm run format:check` pass. Against the third increment's commit no
  file differs under `packages/renderer/src`, `packages/schema-model/src`, the root's
  `packages/`, `.github/workflows` or another modeler's folder, and the arming traces are the
  same bytes.
- No Chromium command line outside a container carried `--no-sandbox` in the samples of the
  process table taken during the browser and e2e runs (556 command lines) and during every run
  of the runner, where VS Code starts without its sandbox inside the container alone.
- **Not run:** the committed browser and Playwright configs; CI; Node 22; brand-lint; the
  smoke outside the runner (`npm run board test:vscode`); and a walk by a person, on any
  system.

**With the fourth increment**, integrated on 2026-11-16 on the machine named below, on stand-ins
alone, with the tree as it stood then:

- `npm run board lint`, `test` (77 files, 1577 tests), `depcruise` (no violation in 398 modules
  and 1231 dependencies) and `format:check` pass; so do the root's `npm run test:plugin` whole (14
  files, 323 tests) and `npm run format:check`, and the checksums of the theme files verify (25
  of 25).
- The whole browser project passes through the local sandbox config, five runs in a row (27
  files, 949 tests each, about 24 s a run, no test retried).
- Both e2e projects pass through the local Playwright sandbox config, three runs each on the dev
  servers they start: `webapp` (10 tests) and `vscode-webview` (25 tests, two of them on the
  production bundle).
- `npm run board build:webapp` and the web app's `check:build` pass (73 bundled packages and 2
  copied works against the 51 sections of its notices). `npm run board build:vscode` and
  `package:vscode` pass and write `apps/vscode/board-modeler.vsix`: 27 files, 1.05 MB, four more
  than before, the pages of the walkthrough; no source, test, map or `node_modules` in it, and no
  document for a developer. The notices check on `dist` and on the VSIX is its last step (77
  bundled packages and 3 copied works against 52 sections).
- Against the third increment's commit no file differs under `packages/renderer/src`,
  `packages/schema-model/src`, the root's `packages/` (the contract, the shell),
  `.github/workflows` or any other modeler's folder, and the arming traces are the same bytes.
  `npm ls` names one version each of `react`, `react-dom`, `yjs`, `@xyflow/react` and
  `diagram-js`.
- With the hold, the plan script was run for the board's eight paths without it (it listed
  `board-modeler`) and with it (it listed nothing and named the board as held back), by hand and
  with the event of a dry run and of a push. Each new root case was seen to fail: in a copy of
  the tree with the script of the third increment, with the review's patch as it was, with
  `--all` alone lifting the hold, with the board off one of the two lists, with
  `initial-version` taken out of `board-webapp`, and with either brand-lint file without the
  other.
- Single edits of the sources, each applied in memory and run against the tests, by the parts
  while they built: 239 of the files port and the host package, all failing a test; 227 of the
  extension's host half, 225 failing (the two that pass empty a set of listeners that tells
  nothing after its end); of the page side 34 failing a unit test and 14 of 15 a browser file
  (the one that passes stops the view's keeper behind the board's `destroy()`). The integration
  saw three of the page's tests fail against one edit each, made in the tree and taken back: no
  count of problems, no words for a dropped edit, no `relocate` for a moved folder.
- No Chromium command line outside a container carried `--no-sandbox` in any sample of the
  process table taken during the browser and e2e runs of the integration (1298 command lines
  sampled in the gate's runs), nor in any the parts took.
- Not run by the integration: **a real VS Code**, which came after it (the paragraph above).
  Also not run: `npm run board test:browser` and `test:e2e` with the committed configs, CI, Node 22,
  brand-lint (the `miragon-brand` plugin is not on that machine), the docs site's build with the
  section on a held modeler, a release, a workflow run and release-please itself, and the other
  modelers' checks, none of whose files changed. `npm run build:shared` was not needed: the
  contract and the shell are unchanged.

**What was run, and what was not.** On the machine the third increment of the apps was integrated
and closed on (the Miragon agent VM, Node 24.22.3, with CI's Node 22 line as 22.23.5), with the
tree as the third increment left it:

- `npm run board lint`, `test` (69 files, 1321 tests), `depcruise` (no violation) and
  `format:check` pass; so do the root's `npm run test:plugin` whole (14 files, 313 tests) and
  `npm run format:check`, and the checksums of the theme files verify. The commands of CI's job
  `modeler-check (board)` also pass on Node 22.23.5, in CI's order and from a tree without the
  board's build output.
- The whole browser project passes through the local sandbox config, five runs in a row (24 files,
  850 tests each; see [Commands](../CLAUDE.md#commands)), and once more on Node 22.
- Both e2e projects pass through the local Playwright sandbox config, three runs each on the dev
  servers they start: `webapp` (8 tests) and `vscode-webview` (17 tests, two of them on the
  production bundle, which the spec builds itself). Each also passes with CI's settings (`CI=1`:
  one worker, two retries, servers of its own), on Node 24 and on Node 22, with no test retried,
  and `webapp` passes against the built app.
- `npm run board build:webapp` and the web app's `check:build` pass, the notices among what it
  holds. `npm run board build:vscode` and `package:vscode` pass and write
  `apps/vscode/board-modeler.vsix`: 23 files, 1.03 MB, with the notices check on `dist` and on the
  VSIX as its last step (see [The webview half](vscode.md#the-webview-half-srcwebview)).
- **The extension ran in a real VS Code**, inside the suite's Docker runner, which the owner
  allowed on that machine for exactly this. The smoke passes on VS Code 1.146.0, on 1.96.0 (the
  manifest's minimum) and with a VSIX packed beforehand
  ([The smoke in a real VS Code](vscode.md#the-smoke-in-a-real-vs-code-test-smoke)). What the code takes
  for granted about VS Code was walked through there on both versions with the second increment,
  with real input, a real folder and a probe in the extension host: most of it holds, and where VS
  Code does something else the code and the fake were changed (what a file watcher names for a
  folder, a paste, the first fit of a board that is covered, the document of a deleted file). The
  list has each item with its outcome, and what the runner could not reach
  ([Taken for granted about VS Code](vscode.md#taken-for-granted-about-vs-code)). With the third
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

## The reviews of the increments

**A review of the first increment.** After the first increment was integrated, an independent
reviewer ran its gate again, drove the web app with Playwright's mouse and keyboard (the dev server
and the built app, at 1600 x 1000, 760 x 600 and 400 x 800, and at a device pixel ratio of 1.25 and
2, in scratch specs that are not in the tree), read the code, and tried 17 single edits of the
sources and 25 malformed messages against it. All seven notations passed every step there: the
preview, the arming, a drag, a label, a delete, Done, a zoom of the board and a reload, each with
its own file written and never the board's. What the review found:

- **Fixed, each under a test.** `packages-no-other-modeler` caught an import by a package's name
  only, and nothing kept diagram-js and React out of the host package's sources
  ([Packages](../CLAUDE.md#packages)). The files server stored a file for a create whose bytes were `null` or a
  number, served a request whose id was `NaN`, took a path with a line break in it, and took a new
  file that was a dot file, ended in a dot or carried a device name of Windows, at any size
  ([The files port](files.md#the-files-port-packagesfiles)). The web app kept the bytes of every picture
  ever added, and a picture the browser had not kept was a hole without a word after a reload
  ([The web app](webapp.md#the-web-app-and-the-example-appswebapp-example-e2e)).
- **Under a test now**, where this guide had said without one: a zoom of the board as the end of an
  edit for all seven modelers, a second node on one file, and a change from outside while a real
  editor is armed ([Real editors, as measured](renderer.md#real-editors-as-measured)).
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
  refused ([The host half](vscode.md#the-host-half)).
- **Named and not changed.** Nothing bounds how many new files a page stores or how many reads it
  asks for at once, and two names that a folding file system reads as a dot folder
  ([The files port](files.md#the-files-port-packagesfiles)). An armed model does not fit an editor that
  is narrower than its node, and the keys do not come back by themselves after a broken text is
  repaired under an armed model
  ([The board inside the shell](ide-editor.md#the-board-inside-the-shell-appside-editor)). The shell shows any
  text of a page as a notification, its policy leaves `base-uri` open, and a refused edit into a
  disposed panel rejects inside it ([Deferred](increments.md#found-while-the-increments-were-built-and-not-changed)). With the VSIX installed, a `.board`
  file given on the command line at the first start opens as text
  ([The smoke in a real VS Code](vscode.md#the-smoke-in-a-real-vs-code-test-smoke)).
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
  board is ([The web app](webapp.md#the-web-app-and-the-example-appswebapp-example-e2e)). The notices
  check asked no section of a copied work: it asks one of every copied work its evidence names
  ([The suite's editors](editors.md#the-suites-editors-appseditors)). The extension's README said that the
  extension is on no marketplace, in a file the VSIX carries onto a marketplace's listing: it
  says nothing of where the extension is published now, and a test holds that
  ([The webview half](vscode.md#the-webview-half-srcwebview), the papers).
- **Named and not changed.** Nothing in the tree held a publish back once the branch is on
  `main`; the change that would was written down below, and is made since the fourth increment
  ("What holds a publish back"). Below 400 px the board's toolbar runs out of the window, the toast after
  Show example lies over the lower row of models while it shows, and a model node whose file
  could not be opened can still be armed (The web app, Known and not cured). The web app's
  notices check holds no package that brings only a sheet or a font and no work that is copied
  into a sheet (The suite's editors). No root test holds that a component at 0.0.0 names an
  `initial-version` ([Deferred](increments.md#found-while-the-increments-were-built-and-not-changed)).
  The hold, the case for `initial-version` and the two licence texts in the brand-lint config
  were made with the fourth increment (CI and what a merge publishes).
- **Corrected here**, two sentences that said the docs site's build had run nowhere.

**A review of the fourth increment.** After the walk in a real VS Code, an independent reviewer
ran the whole gate on the tree as it stood (it held: lint, the unit project, the browser
project twice and both e2e projects through the sandbox configs, both builds with their
checks, the VSIX and its notices), read the release path and ran the plan script (the hold
holds; it is lifted by nothing but taking `board` off `HELD_BACK`), wrote scratch tests of
its own on the registered extension with the page's real files client and the host package's
real binding, and walked a real VS Code in the runner in six runs on 1.146.0 and 1.96.0. It
held the split of the guide against the old one paragraph by paragraph (of 531 paragraphs 464
word for word in exactly one document, none in two, the 67 others rewritten by the increment)
and found no dead link. None of its scripts is in the tree. What it found:

- **Fixed in the closing round, each under a test and each seen again in the runner where VS
  Code has a part in it.** An edit that crosses a rename was lost without a word: its node says
  so now. With the setting on, a board's save wrote a model whose only unsaved change was not
  the board's, saved no model once the board's tab had been closed and opened again or the
  board file renamed, and wrote again a model file another program had removed. A kept view was
  restored into empty space where the board had changed outside. The number of edits that wait
  for a host, and of files that wait to be shown, had no bound. The short name Windows has for
  Git's folder passed the path rule. Where each is written:
  [the increment's closing round](increments.md#the-fourth-increment-of-the-apps-against-its-plan).
- **Named and not changed.** An undo on a board can leave it looking saved with a path that
  names no file; the document of an old name keeps an edit that crossed a rename; a chain of
  renames in one event leaves a node on the path in the middle; what a show answers tells a
  page which files are there; and the fit shows the empty middle of a board whose nodes lie
  further apart than the smallest zoom shows. Each is in the fourth increment's list of what
  was found and not changed, with its change
  ([Found while the increments were built](increments.md#found-while-the-increments-were-built-and-not-changed)).
- **Corrected**, the sentences it called untrue: what the setting saves (the manifest's
  description, the extension's README, the walkthrough page, a comment of the backend, the
  host half's paragraph on saving), what bounds the edits (the files port's document and the
  headers of the protocol and the server), where a dropped edit is said and where not (the
  host package's document, N8), the rule of a kept view (the header of `kept-view.ts`), what
  VS Code does with a picture dropped without Shift, which nobody saw (the README), two items
  of the walk's list that the review itself had reached since, and one link's label.

## CI and what a merge publishes

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

**The board is public since the pull request that took it off `HELD_BACK`.** The two paragraphs
below record the time before it: the merge and the release 0.1.0 published nothing of the board,
as they say. From its next release on, the extension goes to the VS Code Marketplace and Open VSX.

**Two packages for npm.** `@miragon/board-schema-model` and `@miragon/board-renderer` are public
since the pull request that built them for npm; `@miragon/board-files`, `@miragon/board-host` and
every app stay `private`. `release-plan.mjs` lists a public workspace below a released component for
npm, so a release of `board-schema-model` or `board-renderer` builds that package (`build / npm`:
`npm run build:shared`, `npm run board build`, `npm pack`) and publishes the very tarball
(`publish / npm`). Neither name is on npm yet: the first publish of each fails with the workflow's
hint until a maintainer publishes that version once by hand and binds the trusted publisher
([the suite's steps](../../../docs/ci-and-releases.md#the-first-release-of-a-new-npm-package)). What
that pull request ran on its tree, on 2026-11-16 on the Miragon agent VM (Node 24.22.3), with
Chromium's sandbox on: `npm run board build` with both `dist` folders read (the files, the sheet
without an `@import`, no sheet imported by a script, every relative import of a declaration
resolved, the nine lazy parts as chunks), `npm pack --dry-run` of both, the board's lint, depcruise,
unit and browser tests, both e2e projects, the web app's build and check, the extension's build and
VSIX, and a host outside the suite that installed the two packed tarballs with the four peers from
npm: its type check of both READMEs' examples with `skipLibCheck: false` (no React type reached), a
Vite build that kept the lazy chunks, and its page in Chromium, where a note drew its Markdown, the
toolbar came, a model node opened the host's editor, and `board.unmounted` resolved after that
editor's `destroy()`.

**What a merge publishes.** Nothing of the board. At the merge itself `release-please.yml` puts
the board into the suite's one release pull request, `chore: release main`: with a squash title of
the type `feat` or `fix` all eight components are proposed at 0.1.0, their `initial-version`. The
docs site is deployed, since the branch changes `docs/ci-and-releases.md`, and that page then
names the board as held back; there is no page of the board. When a maintainer merges the release
pull request, release-please tags the eight (`board-<component>-v0.1.0`) and creates a GitHub
release for each, with no file attached. `release-plan.mjs` then lists nothing of the board: run
for its eight paths it printed npm none, VS Code none, Orca none and
`Held back, released without a publish: board`, so no job builds or publishes its VSIX, on the VS
Code Marketplace or on Open VSX. The web app is deployed nowhere, and the extension pack is
unchanged. By a reading of the workflows and a run of `release-plan.mjs`; no release was run.

**What holds a publish back.** `HELD_BACK` in `.github/scripts/release-plan.mjs` names the board,
since the fourth increment (the lead's N0). The plan is the one source of the matrices of the
release workflow's build and publish jobs, so a workspace of a held modeler reaches no registry,
marketplace or catalog: no package on npm, no extension on the VS Code Marketplace or Open VSX, no
plugin in the Orca catalog. The list names the modeler and not the extension, so a public package
or an Orca plugin added later is held as well. Only the dry run lists the board, to build and
smoke-test it; inside a workflow run that takes the `dry_run` input, because the workflow passes
`--all` whenever the released paths come out empty. `test/release-workflow.test.ts` runs the
script (it fails with the script of the third increment) and also fails when a held modeler gets a
`netlify.toml`, a page under `docs/modelers/`, an entry of the extension pack or a plugin in the
Claude marketplace. Not stopped, and not meant to be: the components' versions, changelogs, tags
and GitHub releases, which a squash title that releases nothing only delays, since a release of
the contract, the shell or a pinned renderer gives the board's components a patch release. The
hold ends with the pull request that takes the board off that list and off the list of the same
name in the test, which the owner decides; the next release of `board-vscode` then publishes, at
the version it has reached. The suite's side is in
[docs/ci-and-releases.md](../../../docs/ci-and-releases.md#a-modeler-that-is-held-back). What the
tree also holds: the README that the VSIX carries says nothing of where the extension is
published, so it reads true on a listing as well.
