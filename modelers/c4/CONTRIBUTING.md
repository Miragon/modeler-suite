# Contributing to the C4 Modeler

The C4 Modeler lives in `modelers/c4` of the Miragon modeler suite: setup, the scripts, the
pre-commit hook, the commit and pull-request conventions and how to report an issue are in the
suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md), CI, Dependabot and releases in
[docs/ci-and-releases.md](../../docs/ci-and-releases.md). This file adds what is special to this
modeler. AI agents: start with [`CLAUDE.md`](CLAUDE.md).

## Inner loop

From the repository root (or with `npm run <script>` inside `modelers/c4`):

```bash
npm run build:shared   # once, and after changing packages/api or packages/shell
npm run c4 build       # schema-model, dsl, layout, renderer (the unit tests resolve them from dist)
npm run c4 test        # Vitest, project unit
npm run c4 lint        # eslint . + type check (what the pre-commit hook runs for this modeler)
```

Build again after changing a package another one's unit tests read: the `dsl` and `layout` tests
read `@miragon/c4-schema-model` from `dist` (the dsl's edit tests `@miragon/c4-layout` as well),
the renderer's and the apps' unit tests the other packages. One package: `npm run build -w modelers/c4/packages/<name>`. One
test file, from `modelers/c4`: `npx vitest run --project=unit packages/dsl/test/edit/golden.test.ts`.

Extras: `npm run c4 dev:webapp` (Portless, `https://<branch>.c4.localhost`, Node 24.15 or later),
`npm run c4 dev:webapp:plain` (`http://127.0.0.1:5182`, `PORT` overrides it), `npm run c4 dev:vscode`
(extension watch build; start "Run C4 Modeler VS Code extension" of `.vscode/launch.json` from Run
and Debug to debug it), `npm run c4 depcruise`, `npm run c4 format`.

## The DSL against Structurizr

The `dsl` package is checked against Structurizr 6.2.4, the reference parser, in two ways that need
Java 17 or later and Maven and so do not run in CI. The tests read what those runs recorded in
`packages/dsl/test/fixtures/snapshots/`:

- `structurizr-fixtures.json` and `semantic-cases.json`: what Structurizr makes of the vendored
  fixtures (`packages/dsl/test/fixtures/structurizr/`, Apache-2.0, copied unchanged; `NOTICE.md`
  names the commit) and of the builder's own cases in `packages/dsl/test/semantic/cases/`. Run the
  snapshot script again after adding a case or vendoring newer fixtures
  ([`packages/dsl/scripts/structurizr-snapshots/README.md`](packages/dsl/scripts/structurizr-snapshots/README.md)).
- `edit-acceptance.json`: that Structurizr accepts every golden after-file of
  `packages/dsl/test/edit/golden/` and 200 edit-fuzz outputs. `acceptance.test.ts` fails as soon as
  the edit layer or a golden changes without a new run, so every change under
  `packages/dsl/src/edit/` comes with one (commands in
  [`packages/dsl/test/README.md`](packages/dsl/test/README.md)).

A deliberate change of what an edit writes rewrites the goldens
(`UPDATE_GOLDENS=1 npx vitest run --project=unit packages/dsl/test/edit/golden.test.ts`); review
the diff byte by byte before you run the acceptance again. Keep the vendored fixtures unchanged:
the lexer's identity round trip reads every byte of them.

## Browser and e2e tests

- `npm run c4 test:browser`: renderer integration tests in real Chromium (Vitest browser mode;
  jsdom has no `getBBox`), the `@miragon/modeler-api` conformance kit included
  (`packages/renderer/test/browser/conformance.browser.test.ts`). Its canonical fixtures
  `bookshop.dsl` and `library.dsl` in `test/browser/fixtures/` must stay the edit layer's own
  output (contract L2): after a change of what an edit writes, write them again through the edit
  layer and review them.
- `npm run c4 test:e2e`: Playwright in `e2e/`, projects `webapp` (`E2E_PORT`, default 5182) and
  `vscode-webview` (`E2E_WEBVIEW_PORT`, default 5192), each running the `@miragon/modeler-shell`
  conformance kit, the navigation between views and the breadcrumb; the webview project also edits
  the canvas and the document through the extension's plumbing against the shell's VS Code stub,
  the web app project opens and exports `.c4` and `.dsl` files and keeps the workspace in the
  address bar (`webapp-link.spec.ts`). A third
  project, `webapp-webkit`, runs the web app's Share and focus hand-back specs in WebKit on the
  `webapp` server (`npx playwright install webkit` once). One project:
  `npm run test:e2e -w modelers/c4/e2e -- --project=vscode-webview`; the alias `npm run c4` passes
  no Playwright flag on (see the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md#scripts)). Set
  both ports when another checkout already serves the defaults, e.g.
  `E2E_PORT=6601 E2E_WEBVIEW_PORT=6611 npm run c4 test:e2e`.

## VS Code smoke test

`npm run c4 test:vscode` packs the extension as the release does (`vsce package
--no-dependencies`, which runs `vscode:prepublish`), unpacks the VSIX and starts it in a real VS
Code through `runVsCodeSmoke` of `@miragon/modeler-shell/testing/vscode-electron`; with
`VSCODE_SMOKE_VSIX` set it tests that file instead. It opens the example as `workspace.c4` (in the
editor of priority `default`; the driver associates the file with it in the profile as well),
creates an element with Enter on the palette's first creating entry and Escape on its name
editor, saves (the file must pass `parseWorkspace`), undoes that one step and switches through VS
Code's four default themes. Screenshots land in `test-results/vscode-smoke/`. Locally run it
without a window: `npm run c4 test:vscode:docker` (needs Docker); variables go in with `--env`,
given to the workspace by name:
`npm run test:vscode:docker -w @miragon/c4-modeler-workspace -- --env VSCODE_VERSION=1.96.0`.

## Design tokens and notices

`packages/renderer/src/theme/` vendors `cd-tokens.generated.css`, `cd-tokens.generated.json` and
`cd-canvas.css` from the `miragon-brand:modeler-tool-design` skill (Miragon/corporate-identity)
unchanged. To update, copy the three files again, put the vendoring header (with the new design
system version) back on top of the two CSS files, update the release and its hashes in
`packages/renderer/test/theme.sync.test.ts`, and run `npm run c4 test` and `npm run c4 test:e2e`.
The C4 colours live in `C4_COLOUR_STYLES` of `packages/schema-model/src/notation.ts`; a changed
value has to pass `notation-contrast.test.ts` (text 4.5:1, lines 3:1). They are also the styles of
every new workspace (`newWorkspaceText()` of the `dsl` package) and of `example/bookshop.c4`, so a
change also means: write the example's block again (the example tests of both apps compare it),
rewrite the goldens that start from a blank file or apply the colours, and run the edit
acceptance. When a dependency the VS Code extension bundles changes (dagre, a Lucide icon, the
fonts), run `npm run notices -w modelers/c4/apps/vscode` and commit `THIRD_PARTY_NOTICES.md`.

## Pull requests

Local gates: `npm run c4 lint`, `npm run c4 test`, `npm run c4 test:browser`,
`npm run c4 depcruise`, `npm run c4 build`, `npm run c4 test:e2e`, for a web app change
`npm run c4 build:webapp` with `npm run check:build -w modelers/c4/apps/webapp`, for an extension
change `npm run c4 test:vscode:docker`, and for an edit-layer change the edit acceptance above.
Commit scope `c4`, e.g. `feat(c4): draw deployment views`. Name Structurizr only descriptively
("compatible with Structurizr DSL"), with the sentence that this project is not affiliated with
Structurizr Limited where a page introduces the modeler.
