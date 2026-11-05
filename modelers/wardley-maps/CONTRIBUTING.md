# Contributing to the Wardley Maps Modeler

This modeler lives in `modelers/wardley-maps` of the Miragon modeler suite. Setup, scripts, the
pre-commit hook, commit conventions, the DOM boundary and CI are in the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md), [`CLAUDE.md`](../../CLAUDE.md) and
[docs/ci-and-releases.md](../../docs/ci-and-releases.md). This file adds what is special here;
agent notes are in [`CLAUDE.md`](CLAUDE.md).

## Inner loop

```bash
npm run build:shared             # once, and after changing packages/api or packages/shell
npm run wardley-maps build       # unit tests resolve the packages from dist: build first
npm run wardley-maps test
npm run wardley-maps lint        # what the pre-commit hook runs
npm run wardley-maps depcruise
```

`dev:webapp` serves the web app through Portless at `https://<branch>.wardley.localhost` (worktree)
or `https://wardley.localhost` (config [`apps/webapp/portless.json`](apps/webapp/portless.json),
setup in the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md#dev-servers)); `dev:webapp:plain`
runs Vite directly on `:5180`.

## Browser & e2e tests

`test:browser` runs the renderer in Chromium, including the `@miragon/modeler-api` conformance kit
([`conformance.browser.test.ts`](packages/renderer/test/browser/conformance.browser.test.ts)).
`test:e2e` (Playwright, `e2e/`) needs `npx playwright install chromium webkit` once and has three
projects:

- `webapp`: the web app (Vite on `E2E_PORT`, default `5180`): the shell's conformance kit, the
  app's handlers and the modelling interactions.
- `vscode-webview`: the webview inside the shell's VS Code stub (`e2e/webview/`, Vite on
  `E2E_WEBVIEW_PORT`, default `5190`): the shell's kit, including the `csp` case on the production
  bundle. With `?host` the page also runs `registerModelerEditor` with `MAP_EDITOR_OPTIONS`, so
  `document-sync.spec.ts` checks edits in both directions between canvas and document.
- `webapp-webkit`: Safari's engine, two specs. `webapp-share.spec.ts` checks that Share calls
  `clipboard.write` during the click with a promise-valued ClipboardItem (Safari drops the user
  activation at the first `await`). `webapp-focus-hand-back.spec.ts` checks that keys act on the
  canvas after a click on zoom or Share and after the menu dialog closes; it removes the focus
  from clicked buttons as Safari does (`tests/support/safari.ts`).

Pass Playwright flags to the workspace:
`npm run test:e2e -w modelers/wardley-maps/e2e -- --project=vscode-webview --grep "<title>"`.
On taken ports: `E2E_PORT=6101 E2E_WEBVIEW_PORT=6111 npm run wardley-maps test:e2e`.

## VS Code smoke test

`npm run wardley-maps test:vscode:docker` runs [`apps/vscode/test/smoke/`](apps/vscode/test/smoke/)
in a real VS Code in a container (how it works for every modeler: the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md#tests)). It opens
[`tea-shop.wmap`](apps/vscode/test/smoke/tea-shop.wmap), checks the chrome, evolves a component
(click, Shift+→), saves (`parseDSLWithDiagnostics` finds nothing), undoes, and screenshots the four
default themes (the webview stays light, `WARDLEY_THEMES`) into `test-results/vscode-smoke/`
(`wardley-<theme>.png`, or `wardley-open-failure.png`). It builds from source, so no `build` is
needed first, and writes the production build into `apps/vscode/dist`.

```bash
npm run test:vscode:docker -w @miragon/wardley-maps-modeler-workspace -- --env VSCODE_VERSION=1.96.0
npm run test:vscode:docker -w @miragon/wardley-maps-modeler-workspace -- --env VSCODE_SMOKE_KEEP=1
```

A failed open quotes the webview's own errors. If none is named, rerun with `VSCODE_SMOKE_KEEP=1`
and read `test-results/vscode-smoke/vscode-logs/`. Failed runs are not retried. Never run the
host variant `test:vscode` on a Mac: its window takes the focus.

## Pull requests

- Green locally: `lint`, `test`, `depcruise`, `build`; plus `test:vscode:docker` after changing the
  extension, the DSL, the schema model or a dependency.
- Commit scope `wardley-maps`, e.g. `fix(wardley-maps): keep the url keyword on round-trip`.
- Changed the DSL? Keep the `owm-dsl` skill in step; `npm run wardley-maps test` parses every
  example in [`plugins/wardley-maps-modeler/`](plugins/wardley-maps-modeler/).
