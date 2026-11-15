# Contributing to the Board

The modeler lives in `modelers/board` of the Miragon modeler suite. Setup, scripts, the pre-commit
hook, tests in general, commits and pull requests are in the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md), CI and releases in
[docs/ci-and-releases.md](../../docs/ci-and-releases.md). This file adds what is special to this
modeler. AI agents: start with [`CLAUDE.md`](CLAUDE.md).

**Work in progress.** The two packages are here; the web app, the VS Code extension, the Orca
plugin, `e2e/`, `example/` and `docs/` are still to come. [`CLAUDE.md`](CLAUDE.md) says what is in
the tree and what was run on it.

## Packages

| Package        | Purpose                                                                                     | DOM |
| -------------- | ------------------------------------------------------------------------------------------- | --- |
| `schema-model` | The `.board` format and its strict reader, the elements of a board, their order, their view | no  |
| `renderer`     | The board as a live document on Yjs, the React Flow canvas, the contract factory, the sheet | yes |

Every workspace is private and nothing goes to npm. The packages export their source, so there is
nothing to build before the tests.

## Inner loop

```bash
npm run build:shared      # once, and after changing packages/api
npm run board test
npm run board lint        # what the pre-commit hook runs
npm run board depcruise
```

`schema-model` is DOM-free (P1, enforced by ESLint and dependency-cruiser). Inside the renderer
the document half (`store/`, `host/`, the arm rules) imports neither React nor React Flow nor a
file of the layers after it: the rule `document-half-no-canvas` in `.dependency-cruiser.cjs`. Keep
the format canonical: the same board gives the same bytes, and a change of one element changes
one line.

## Moved as measured

The canvas was built and measured in designIQ, with editors this repository does not have. A
change of its behaviour here is a change nobody measures, so a file of `packages/renderer/src`
changes only under the rule [`CLAUDE.md`](CLAUDE.md) gives for the port: a change of behaviour
comes with a browser test of its own, and a function over the lint limit is split by extraction,
never marked with a directive.

## Browser tests

`npm run board test:browser` runs the canvas and the `@miragon/modeler-api` conformance kit
(`packages/renderer/test/browser/conformance.browser.test.ts`) in Chromium. Run
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

## Design tokens

To update the vendored files in `packages/renderer/src/theme/`, re-copy them with
`brand-assets.mjs` as the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md#design-system) says.
The board vendors the two token files and no `cd-canvas.css`, and
`packages/renderer/test/theme.sync.test.ts` fails on a third file. The sheet
(`packages/renderer/src/assets/board.css`) takes every colour from one alias block; a new colour
is an alias there and a row in that test.

## Pull requests

Gates: `lint`, `test`, `test:browser`, `depcruise`. Scope `board`, e.g.
`feat(board): add an image export`.
