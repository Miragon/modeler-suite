# Contributing to the Board

The modeler lives in `modelers/board` of the Miragon modeler suite. Setup, scripts, the pre-commit
hook, tests in general, commits and pull requests are in the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md), CI and releases in
[docs/ci-and-releases.md](../../docs/ci-and-releases.md). This file adds what is special to this
modeler. AI agents: start with [`CLAUDE.md`](CLAUDE.md).

**Work in progress, a preview.** Four packages, the board inside the suite's shell, the web app
(a start screen, a board of your own, and an example repository, `example/`), a VS Code extension
that packs into a VSIX, and two `e2e` projects are here, and the extension's smoke runs in a real
VS Code; the Orca plugin and a demo and screenshots under `docs/` are still to come.
[`CLAUDE.md`](CLAUDE.md) says what is in the tree and names the document of each part under
[`docs/`](docs/). [`docs/state.md`](docs/state.md) says what was run on the tree, and where the
board deviates from the suite's rules is under Tests in `CLAUDE.md` (the kit's pinned skips) and in
[`docs/ide-editor.md`](docs/ide-editor.md#three-deviations-under-the-shell-each-with-an-end).

## Packages

| Package        | Purpose                                                                                                           | DOM |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | --- |
| `schema-model` | The `.board` format and its strict reader, the elements of a board, their order, their view                       | no  |
| `renderer`     | The board as a live document on Yjs, the React Flow canvas, the contract factory, the sheet                       | yes |
| `files`        | The files of a repository as a board's page reads and writes them: port, protocol, client, server, memory backend | no  |
| `host`         | A modeler of the contract as the editor of a model node, and a board host from files and a registry of editors    | yes |

The apps are `apps/editors` (the seven modelers of the suite as editors of model nodes, and the
build helpers; the one workspace that imports another modeler), `apps/ide-editor` (the board inside
the shell, handed its editors), `apps/vscode` (the extension: a host half that runs in Node and a
webview half), `apps/webapp` and `e2e`. Every workspace is private and nothing goes to npm. The
packages export their source, and the tests take the other modelers from their sources too, so
there is nothing to build before the tests but the shared packages.

## Inner loop

```bash
npm run build:shared      # once, and after changing packages/api
npm run board test
npm run board lint        # what the pre-commit hook runs
npm run board depcruise
```

`npm run board dev:webapp` serves the web app on http://localhost:5184.
`npm run dev:webview -w modelers/board/e2e` serves the extension's webview as a page on
http://127.0.0.1:5194/webview-test.html?host, inside the shell's stand-in for VS Code.
`npm run board build:vscode` builds the extension and `npm run board package:vscode` packs it and
checks the packed notices.

`schema-model` and `files` are DOM-free (P1, enforced by ESLint and dependency-cruiser). No package
and no app but `apps/editors` imports another modeler, neither a package of one by its name nor a
file of one by a relative path; no package imports an app; the sources of `host` import neither
diagram-js nor React; the sources of `apps/ide-editor` do not import `apps/editors`; and the
extension's host half, every source of `apps/vscode` outside `src/webview`, imports no code of a
page (`packages-no-other-modeler`, `packages-no-apps`, `host-no-editor-libraries`,
`ide-editor-no-suite-editors`, `vscode-host-no-page-code`). Inside the renderer the document half
(`store/`, `host/`, the arm rules) imports neither React nor React Flow nor a file of the layers
after it: the rule `document-half-no-canvas` in `.dependency-cruiser.cjs`. Keep the format
canonical: the same board gives the same bytes, and a change of one element changes one line.

## Moved as measured

The canvas was built and measured in designIQ, with editors this repository does not have. A
change of its behaviour here is a change nobody measures, so a file of `packages/renderer/src`
changes only under the rule [`CLAUDE.md`](CLAUDE.md) gives for the port: a change of behaviour
comes with a browser test of its own, and a function over the lint limit is split by extraction,
never marked with a directive.

## Browser tests

`npm run board test:browser` runs the canvas, the `@miragon/modeler-api` conformance kit
(`packages/renderer/test/browser/conformance.browser.test.ts`), the host package on a stand-in
modeler and the seven modelers of the suite in a board's nodes, in Chromium. A test of a preview
or of an armed editor sends real input with `commands.realInput`. Run
`npx playwright install chromium` once. The kit's skipped cases are pinned by name and reason,
and the list may only shrink. `packages/renderer/test/browser/fixtures/arming-traces.json` holds
the traces of the arm rules: 70 of the 73 as they were recorded before the arming was split, and
three recorded anew since, from scripts that were repaired (the unsplit code gives the same
bytes for them). The test compares the file and no run writes it, and a wanted change of the
rules is recorded anew on purpose.
[`packages/renderer/test/README.md`](packages/renderer/test/README.md) says how, what each test
file holds and what a browser test of the board has to know. On a machine where Chromium must not
start without its sandbox, run the browser tests through the local config
[`CLAUDE.md`](CLAUDE.md) describes under its commands.

## The extension's tests

The host half is tested in Node against a fake VS Code in memory
(`apps/vscode/src/files/memory-vscode.ts`, which the `vscode` mock of the unit project is built
on): `npm run board test`. The webview is tested as a page: `npm run board test:e2e` runs the
project `vscode-webview` on the test page `e2e/webview`, with the extension's own editor options
against the shell's stand-in for VS Code, and its last spec builds the extension for production and
opens that bundle under the extension's content security policy. The file a board is, VS Code's
text document, never goes through the files port: a new host keeps that.
`npm run board test:vscode` and `test:vscode:docker` run the smoke `apps/vscode/test-smoke`: the
packed extension in a real VS Code, on the example folder, with a click on Group, a save, an undo,
VS Code's four themes, and seven checks of its own (the models drawn, the picker following the
folder, an edit in place that leaves the model a dirty document, the undo key that stays inside
an armed model, the model saved in its own tab, a rename in the Explorer that moves the node's
path, and the saved text read again by its notation). Run it after a change of the
extension, in the Docker runner where no VS Code window may open.
[`docs/vscode.md`](docs/vscode.md#taken-for-granted-about-vs-code) lists what the code takes for
granted about VS Code and what a real one showed of it: a change that rests on one of those items
wants a look there first.

A behaviour of VS Code that new host code depends on is built into the fake, held by a sentence in
`apps/vscode/test/memory-vscode.test.ts`, and listed in `docs/vscode.md` as taken for granted
until a real VS Code showed it
([the list for daily use](docs/vscode.md#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code)
is such a list, with how each item ended, and
[the runner's section](docs/vscode.md#a-real-vs-code-in-the-docker-runner) says how a walk is
run). Where VS Code does something else, the fake is changed to what was seen. A file added to
`example/` is also named in `apps/vscode/src/example-files.ts`: the extension carries the example
for New Board from Example, and `apps/vscode/test/example.test.ts` fails until the file is named.

## Third-party notices and the icon

The notices are not committed, and there is no `npm run notices` here: every build of the
extension and of the web app writes them from what it bundled, and a production build fails when
they are not whole (`apps/editors/build/notices.mjs` has the list of licences a build may carry
and the list of works copied into sources of the suite). After a change of a dependency, or of a
legal comment in any modeler's renderer, run `npm run board build:webapp` with its `check:build`
and `npm run board package:vscode`.

The extension's icon is a board on its stand with two cards, drawn in the icon system of the
suite's modelers (the blue tile, a white stroke of 2 on a grid of 24, one green accent) on the
owner's word, since the Miragon modeler icon set had no board icon. Its source is
`apps/vscode/icon.svg`, which the VSIX leaves out. After a change, render it to `icon.png` at
256 x 256 on a transparent ground and replace the checksum in `apps/vscode/test/papers.test.ts`.
The web app's `public/favicon.svg` is the same drawing on the grid of 24, and so are the file
icons in `apps/vscode/media/icons/`: `board-dark.svg` the drawing without its tile as it is,
`board-light.svg` with the outline and the white card in `#1D1D1D` and the green card in
`#335DE5`. A change of the drawing goes into each of them; `apps/vscode/test/contributions.test.ts`
holds the favicon and the file icons against `icon.svg`.

## Design tokens

To update the vendored files in `packages/renderer/src/theme/`, re-copy them with
`brand-assets.mjs` as the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md#design-system) says.
The board vendors the two token files and no `cd-canvas.css`, and
`packages/renderer/test/theme.sync.test.ts` fails on a third file. The sheet
(`packages/renderer/src/assets/board.css`) takes every colour from one alias block; a new colour
is an alias there and a row in that test.

## Pull requests, CI and releases

Gates: `lint`, `test`, `test:browser`, `test:e2e`, `depcruise`, `build:webapp` with the web
app's `check:build`, and `package:vscode`. Scope `board`, e.g.
`feat(board): add an image export`.

A change under another modeler's `packages/` or `example/`, or to its `apps/vscode/package.json`,
runs the board's CI jobs as well, because the board bundles those packages and reads those files.
The board has eight release components (`board-schema-model`, `-renderer`, `-files`, `-host`,
`-editors`, `-ide-editor`, `-vscode`, `-webapp`); a release tags them and publishes the
extension to the VS Code Marketplace and Open VSX, and nothing else: nothing goes to npm. The
board was held back through its first release (`HELD_BACK` in `.github/scripts/release-plan.mjs`,
[CI and releases](../../docs/ci-and-releases.md#a-modeler-that-is-held-back)), so 0.1.0 was
tagged and never published. Never edit that list in passing: it is the owner's. Never bump a version
or write a `CHANGELOG.md` by hand: the extension's has one entry from before its first release,
and release-please writes above it.
[`docs/state.md`](docs/state.md#ci-and-what-a-merge-publishes) says what a merge to `main`
publishes and what holds the board back.

## Documents

[`CLAUDE.md`](CLAUDE.md) keeps what every change needs: the state, the packages, the format, the
rules, the tests and the commands in short. Each part has a document of its own under
[`docs/`](docs/), and `CLAUDE.md` lists them. Write a part's facts into its document; `CLAUDE.md`
gets the state, the counts and a pointer. Markdown under `docs/` runs no job of CI and goes into no
build. `apps/vscode/README.md` is the extension's README for a person who installs it, and the VSIX
carries it: nothing for a developer goes there.
