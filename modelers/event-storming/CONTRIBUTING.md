# Contributing to the Event Storming Modeler

This modeler lives in `modelers/event-storming` of the Miragon modeler suite. Setup, scripts, the
pre-commit hook, commit conventions, the DOM boundary and CI are in the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md), [`CLAUDE.md`](../../CLAUDE.md) and
[docs/ci-and-releases.md](../../docs/ci-and-releases.md). This file adds what is special here;
agent notes are in [`CLAUDE.md`](CLAUDE.md).

## Inner loop

```bash
npm run build:shared              # once, and after changing packages/api or packages/shell
npm run event-storming build      # unit tests resolve the packages from dist: build first
npm run event-storming test
npm run event-storming lint       # what the pre-commit hook runs
npm run event-storming depcruise
```

`dev:webapp` serves the web app through Portless at `https://<branch>.event-storming.localhost`
(worktree) or `https://event-storming.localhost` (config
[`apps/webapp/portless.json`](apps/webapp/portless.json), setup in the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md#dev-servers)); `dev:webapp:plain` runs Vite on `:5180`.

`npm run check:build -w modelers/event-storming/apps/webapp` (after `build:webapp`, as CI does)
checks the mode markup in `dist/index.html` and the shell's Lucide licence comment in the bundle.

## Browser & e2e tests

`test:browser` runs the renderer in Chromium, including the `@miragon/modeler-api` conformance kit.
`test:e2e` (Playwright, `e2e/`) needs `npx playwright install chromium webkit` once; its servers
build from source:

| Project          | Serves                                                               | Port (env)                |
| ---------------- | -------------------------------------------------------------------- | ------------------------- |
| `webapp`         | the web app (`e2e/tests/*.spec.ts`)                                  | 5180 (`E2E_PORT`)         |
| `vscode-webview` | the VS Code webview inside the shell's VS Code stub (`e2e/webview/`) | 5190 (`E2E_WEBVIEW_PORT`) |
| `webapp-webkit`  | the web app in Safari's engine, on the `webapp` server               | 5180 (`E2E_PORT`)         |

- `webapp` and `vscode-webview` run the `@miragon/modeler-shell` conformance kit on the `web` and
  `ide` hosts. The harnesses declare what Event Storming lacks as `absent` (legend, inspector; in
  the web app the invalid-file state and element problem rows; in the webview a menu action that
  focuses the canvas, since the Model group holds only toggles and dialogs). Any skip fails. Both
  list the empty board as a `document`.
- With `?host` the webview page also runs `registerModelerEditor` with `BOARD_EDITOR_OPTIONS`, so
  `vscode/document-sync.spec.ts` checks edits, undo and redo in both directions, the example insert
  as one edit and a read-only document.
- App specs: `webapp-chrome.spec.ts` (share, fit, replace with undo, open, drop, exports, app keys,
  keys while a line is drawn), PNG export (corner pixel `#F9F7F7` of guide §10.7, Geist embedded,
  font fallback warning), the vocabulary specs (label suggestions, spelling dots, "Unify spelling")
  and the aggregates specs ("Aggregates…" dialog) on both hosts.
- `webapp-webkit` runs `webapp-share.spec.ts` (Share calls `clipboard.write` during the click with a
  promise-valued ClipboardItem, as Safari needs) and `webapp-focus-hand-back.spec.ts` (keys act on
  the canvas after a click on zoom or Share; clicked buttons lose the focus as in Safari,
  `e2e/tests/support/safari.ts`).

Pass Playwright flags to the workspace:
`npm run test:e2e -w modelers/event-storming/e2e -- --project=vscode-webview --grep "<title>"`.
A running server on a port is reused, so pick free ports when needed:
`E2E_PORT=5387 E2E_WEBVIEW_PORT=5397 npm run event-storming test:e2e`.

## VS Code smoke test

`npm run event-storming test:vscode:docker` runs [`apps/vscode/test-smoke/`](apps/vscode/test-smoke/)
with the **packaged** extension in a real VS Code in a container (how it works for every modeler:
the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md#tests)). It opens
[`smoke.storm`](apps/vscode/test-smoke/smoke.storm), checks menu, palette and zoom, adds a sticky
with Enter on the first palette entry, saves (the file parses with one sticky more), undoes (the
file is back to the fixture), and screenshots the four default themes (the webview stays light)
into `test-results/vscode-smoke/`, e.g. `event-storming-dark.png`. No build is needed first; the
packing writes the production build into `apps/vscode/dist`.

```bash
npm run test:vscode:docker -w @miragon/event-storming-modeler-workspace -- --env VSCODE_VERSION=1.96.0
npm run test:vscode:docker -w @miragon/event-storming-modeler-workspace -- --env VSCODE_SMOKE_KEEP=1
```

A failure names its step (`open: …`, `save: …`); a failed open leaves
`event-storming-open-failure.png` and quotes the webview's own errors. `VSCODE_SMOKE_KEEP=1`
brings VS Code's logs back in `vscode-logs/`. The test is not retried. Never run the host variant
`test:vscode` on a Mac: its window takes the focus.

The extension host bundle (`dist/extension.cjs`, about 470 KB minified) is nearly all zod, which the
DSL validation for the Problems view needs; this is accepted rather than moving diagnostics into
the webview.

## Design tokens

To update the vendored `cd-tokens.generated.css`, `cd-tokens.generated.json` and `cd-canvas.css` in
`packages/renderer/src/theme/`: re-copy all three with `brand-assets.mjs` as the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md#design-system) says, then run
`npm run event-storming test` and the `vscode-webview` e2e project.

## Pull requests

- Green locally: `lint`, `test`, `depcruise`, `build`.
- Commit scope `event-storming`, e.g. `fix(event-storming): keep comment lines on round-trip`.
- The `event-storming` and `storm-dsl` skills live in
  [`plugins/event-storming-modeler/skills/`](plugins/event-storming-modeler/skills/); after editing
  them run `claude plugin validate modelers/event-storming/plugins/event-storming-modeler --strict`.
