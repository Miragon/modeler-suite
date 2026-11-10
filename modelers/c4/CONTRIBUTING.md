# Contributing to the C4 Modeler

Setup, scripts, hooks, conventions and issues are in the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md), CI and releases in
[docs/ci-and-releases.md](../../docs/ci-and-releases.md). This file adds what is special to C4. AI
agents: start with [`CLAUDE.md`](CLAUDE.md).

## Architecture and packages

The canvas holds no model of its own: every gesture becomes an edit of the DSL text, which the
`dsl` package computes, applies and verifies (it parses, nothing else changed) before the canvas
command runs, or refuses with a reason. The renderer implements
[`@miragon/modeler-api`](../../packages/api/README.md) and runs its conformance kit; both apps use
the [`@miragon/modeler-shell`](../../packages/shell/README.md) chrome. Design rules are in
[`CLAUDE.md`](CLAUDE.md).

| Package                                             | Purpose                                                                         | DOM |
| --------------------------------------------------- | ------------------------------------------------------------------------------- | --- |
| [`@miragon/c4-schema-model`](packages/schema-model) | the C4 model as plain data: elements, relationships, views, styles, identifiers | no  |
| [`@miragon/c4-dsl`](packages/dsl)                   | read and edit Structurizr DSL losslessly, with diagnostics                      | no  |
| [`@miragon/c4-layout`](packages/layout)             | automatic layout and placement of new elements                                  | no  |
| [`@miragon/c4-renderer`](packages/renderer)         | viewer and modeler on diagram-js, implementing `@miragon/modeler-api`           | yes |

The web app keeps the workspace and its view in the URL hash (`#mz=`, compressed). The VS Code
extension is a custom editor for `.c4` (and `.dsl` on request), adds the Structurizr DSL language
and reports parser findings in the Problems view.

## Inner loop

Requires Node `^22.22.2` or `>=24.15.0` (Portless needs 24.15+). From the suite's root:

```bash
npm ci && npm run build:shared # once
npm run c4 dev:webapp:plain    # http://127.0.0.1:5182
npm run c4 dev:webapp          # https://<branch>.c4.localhost via Portless
npm run c4 build   # schema-model, dsl, layout, renderer (unit tests resolve them from dist)
npm run c4 test
npm run c4 test:browser        # renderer in Chromium, modeler-api conformance kit
npm run c4 test:e2e            # Playwright, shell conformance kit
npm run c4 test:vscode:docker  # the extension in a real VS Code, in Docker
npm run c4 lint    # what the pre-commit hook runs
```

Rebuild after changing a package others' tests read: `dsl` and `layout` read `schema-model` from
`dist` (the dsl's edit tests also `layout`), the renderer and apps read all of them. One package:
`npm run build -w modelers/c4/packages/<name>`. One test file, from `modelers/c4`:
`npx vitest run --project=unit packages/dsl/test/edit/golden.test.ts`. `dev:webapp:plain` honours
`PORT`; debug `dev:vscode` with "Run C4 Modeler VS Code extension" in `.vscode/launch.json`.

## The DSL against Structurizr

The `dsl` package is checked against Structurizr 6.2.4 by runs that need Java 17+ and Maven and so
stay out of CI; the tests read their records in `packages/dsl/test/fixtures/snapshots/`:

- `structurizr-fixtures.json` and `semantic-cases.json`: Structurizr's result for the vendored
  fixtures (`packages/dsl/test/fixtures/structurizr/`, Apache-2.0, unchanged; `NOTICE.md` names the
  commit) and for `packages/dsl/test/semantic/cases/`. Rerun after adding a case or vendoring new
  fixtures ([script README](packages/dsl/scripts/structurizr-snapshots/README.md)).
- `edit-acceptance.json`: Structurizr accepts every golden of `packages/dsl/test/edit/golden/` and
  200 edit-fuzz outputs. `acceptance.test.ts` fails when the edit layer or a golden changes without
  a new run, so every change under `packages/dsl/src/edit/` brings one
  ([`packages/dsl/test/README.md`](packages/dsl/test/README.md)).

A deliberate change of what an edit writes rewrites the goldens
(`UPDATE_GOLDENS=1 npx vitest run --project=unit packages/dsl/test/edit/golden.test.ts`); review
the diff byte by byte, then rerun the acceptance. Never change the vendored fixtures: the lexer's
round trip reads every byte.

## Browser and e2e tests

- `test:browser` runs in Chromium (jsdom has no `getBBox`) with the conformance kit
  (`packages/renderer/test/browser/conformance.browser.test.ts`). Its fixtures `bookshop.dsl` and
  `library.dsl` must stay the edit layer's own output (contract L2): regenerate them through the
  edit layer after changing what an edit writes.
- `test:e2e` has projects `webapp` (`E2E_PORT`, default 5182), `vscode-webview`
  (`E2E_WEBVIEW_PORT`, default 5192) and `webapp-webkit` (Share and focus specs; run
  `npx playwright install webkit` once). One project:
  `npm run test:e2e -w modelers/c4/e2e -- --project=vscode-webview`. With the defaults taken:
  `E2E_PORT=6601 E2E_WEBVIEW_PORT=6611 npm run c4 test:e2e`.

## VS Code smoke test

`test:vscode:docker` packs the extension as the release does (or tests `VSCODE_SMOKE_VSIX`), opens
the example as `workspace.c4`, creates an element from the palette, saves (the file must pass
`parseWorkspace`), undoes and cycles VS Code's four default themes; screenshots land in
`test-results/vscode-smoke/`. Pass variables by workspace name:
`npm run test:vscode:docker -w @miragon/c4-modeler-workspace -- --env VSCODE_VERSION=1.96.0`.

## Design tokens, colours, notices

- Tokens: re-copy the three files with `brand-assets.mjs` (root `.miragon/brand-assets.yaml`),
  without a header of their own, update release and hashes in
  `packages/renderer/test/theme.sync.test.ts`, run `test` and `test:e2e`.
- C4 colours (`C4_COLOUR_STYLES` in `packages/schema-model/src/notation.ts`) must pass
  `notation-contrast.test.ts`. They are also in `newWorkspaceText()` and `example/bookshop.c4`, so
  a change means: rewrite the example's block, the goldens that start blank or apply the colours,
  and rerun the edit acceptance.
- When a bundled dependency of the extension changes, run `npm run notices -w modelers/c4/apps/vscode`
  and commit `THIRD_PARTY_NOTICES.md`.

## Pull requests

Gates: `lint`, `test`, `test:browser`, `depcruise`, `build`, `test:e2e`; for the web app also
`build:webapp` and `npm run check:build -w modelers/c4/apps/webapp`, for the extension
`test:vscode:docker`, for the edit layer the edit acceptance. Scope `c4`. Name Structurizr only
descriptively ("compatible with Structurizr DSL"), with the non-affiliation sentence where a page
introduces the modeler.
