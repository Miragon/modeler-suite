# Contributing to the Wardley Maps Modeler

Thanks for helping improve the Wardley Maps Modeler. It lives in `modelers/wardley-maps` of the
Miragon modeler suite: setup, the scripts, the pre-commit hook, the commit and pull-request
conventions and how to report an issue are in the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md),
CI and releases in [docs/ci-and-releases.md](../../docs/ci-and-releases.md). This file adds what is
special to this modeler. Agent-oriented notes live in [`CLAUDE.md`](CLAUDE.md).

## Inner loop

From the repository root (or with `npm run <script>` inside `modelers/wardley-maps`):

```bash
npm run build:shared        # once, and after changing packages/api or packages/shell
npm run wardley-maps build       # builds packages/* (workspace deps resolve to dist: build before testing)
npm run wardley-maps test        # vitest run
npm run wardley-maps lint        # eslint . + type-check (what the pre-commit hook runs for this modeler)
```

Useful extras: `npm run wardley-maps dev:webapp`, `npm run wardley-maps dev:vscode`,
`npm run wardley-maps depcruise` (module-graph check), `npm run wardley-maps format` (Prettier).

`npm run wardley-maps dev:webapp` (and `npm run wardley-maps dev`) serves the webapp through Portless at
`https://<branch>.wardley.localhost` in a linked worktree and `https://wardley.localhost` in the
main checkout (config [`apps/webapp/portless.json`](apps/webapp/portless.json):
`{ "name": "wardley", "script": "dev:app" }`; the one-time Portless setup is in the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md#dev-servers)). `npm run wardley-maps dev:webapp:plain` runs
Vite directly on `:5180` and needs none of it.

## Browser & e2e tests

`npm run wardley-maps test:browser` (Vitest browser mode) and `npm run wardley-maps test:e2e` (Playwright, in
`e2e/`) need a Chromium browser (`npx playwright install chromium`, once).

The Playwright config has two projects, each with its own dev server started for the run:

- `webapp`: the demo web app (`apps/webapp`, Vite on `E2E_PORT`, default `5180`). It runs the
  shell's conformance kit on the web host, the app's handlers behind the chrome and the modelling
  interactions.
- `vscode-webview`: the VS Code webview (`apps/vscode/src/webview/main.ts`) inside the VS Code
  stub of `@miragon/modeler-shell`, served by the test page in `e2e/webview/` (Vite on
  `E2E_WEBVIEW_PORT`, default `5190`). It runs the shell's conformance kit, whose `csp` case walks
  the production bundle behind the webview CSP, and the webview's side of the host protocol.

Run one with `npm run wardley-maps test:e2e -- --project=vscode-webview`. When the default ports are
taken (several worktrees at once), pick others:
`E2E_PORT=6101 E2E_WEBVIEW_PORT=6111 npm run wardley-maps test:e2e`.

The renderer's browser tests also run the `@miragon/modeler-api` conformance kit against
`createCollaborativeModeler`/`createCollaborativeViewer`
([`conformance.browser.test.ts`](packages/renderer/test/browser/conformance.browser.test.ts)); a
skipped case fails the run.

## VS Code smoke test

`npm run wardley-maps test:vscode` (the `vscode` Vitest project in
[`apps/vscode/test/smoke/`](apps/vscode/test/smoke/), not part of `npm test`) checks the extension
in a real VS Code with `runVsCodeSmoke` of `@miragon/modeler-shell/testing/vscode-electron`; how
the packing, the unpacked VSIX, the variables and the Docker mode work for every modeler is in the
suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md#tests). Here VS Code opens a small map
([`tea-shop.wmap`](apps/vscode/test/smoke/tea-shop.wmap)) in the custom editor, and the test checks
the chrome, evolves a component (click, Shift+→), saves (the file changes and
`parseDSLWithDiagnostics` finds nothing), undoes (canvas and file are back) and switches through
VS Code's four default themes, in which the webview stays light (`WEBVIEW_THEMES`) and high contrast
passes. A screenshot per theme goes to `test-results/vscode-smoke/` (git-ignored, emptied at the
start of every run): `wardley-light.png`, `wardley-dark.png`, `wardley-high-contrast-dark.png` and
`wardley-high-contrast-light.png`, or `wardley-open-failure.png` when the editor never opened. The
packages come from source, as in the extension's own build, so no `npm run wardley-maps build` is
needed first.

Locally, run it in Docker, where no VS Code window opens and nothing takes the focus:

```bash
npm run wardley-maps test:vscode:docker                                 # the newest stable VS Code
npm run wardley-maps test:vscode:docker -- --env VSCODE_VERSION=1.96.0  # another one, the engines floor
npm run wardley-maps test:vscode:docker -- --env VSCODE_SMOKE_KEEP=1    # brings VS Code's logs back
```

`npm run wardley-maps test:vscode` runs the same test on the host; use it to watch VS Code at work (on
macOS a window opens for a few seconds and takes the focus; on Linux run it under `xvfb-run -a`).
Like `npm run package -w modelers/wardley-maps/apps/vscode`, the packing writes the production build
into `apps/vscode/dist`.

A failed open quotes the webview's own uncaught errors and console errors with their stacks, which
none of VS Code's logs holds, and a webview that throws on start fails it 3 s later. When a failure
names no cause (for example "the custom editor never showed the shell's menu" without any webview
error), the cause is in VS Code's logs: run again with `VSCODE_SMOKE_KEEP=1` and read the `logs`
folder of the kept profile (in Docker: `test-results/vscode-smoke/vscode-logs/`). A failed run is
not retried: the save step of `@miragon/modeler-shell` parses the file only once the editor tab is
clean and two reads of it agree, and reads it again while the test's parser rejects it (a map
without elements included), so it does not catch VS Code halfway through a save.

## Monorepo map & the DOM boundary (P1)

| Package                         | Purpose                                               | DOM      |
| ------------------------------- | ----------------------------------------------------- | -------- |
| `@miragon/wardley-schema-model` | Metamodel, Zod validation, JSON serialization         | DOM-free |
| `@miragon/wardley-dsl`          | OWM text DSL ↔ model (lossless round-trip)            | DOM-free |
| `@miragon/wardley-transforms`   | Pure `WardleyMap → WardleyMap` transforms             | DOM-free |
| `@miragon/wardley-renderer`     | diagram-js bootstrap, renderer, viewer, import/export | DOM      |
| `apps/webapp`                   | Vite demo editor                                      | DOM      |
| `apps/vscode`                   | VS Code custom editor for `.wmap`/`.owm`              | DOM      |

**P1, the DOM boundary:** the DOM-free packages (`schema-model`, `dsl`, `transforms`) must **never**
import `diagram-js`/DOM libraries (`tiny-svg`, `min-dom`) or use the DOM (`window`/`document`). This
is enforced twice, by ESLint (`no-restricted-imports`/`no-restricted-globals`) **and** by
dependency-cruiser, so a violating import fails `npm run wardley-maps lint` and
`npm run wardley-maps depcruise`.

Also keep the OWM-DSL round-trip lossless and JSON serialization deterministic.

## Pull requests

- Make sure the local gates are green: `npm run wardley-maps lint`, `npm run wardley-maps test`,
  `npm run wardley-maps depcruise`, `npm run wardley-maps build`. Changed the extension, the DSL, the schema
  model or a dependency? Run `npm run wardley-maps test:vscode:docker` too.
- Commit scope `wardley-maps`, e.g. `feat(wardley-maps): add an inertia decorator`,
  `fix(wardley-maps): keep the url keyword on round-trip`.
- Working on map/domain semantics? See the `wardley-mapping` and `owm-dsl` skills of the Claude Code
  plugin in [`plugins/wardley-maps-modeler/`](plugins/wardley-maps-modeler/). Changed the DSL? Keep
  the `owm-dsl` skill and its examples in step: `npm run wardley-maps test` parses every example in the
  plugin.
