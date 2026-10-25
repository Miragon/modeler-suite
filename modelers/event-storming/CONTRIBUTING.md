# Contributing to the Event Storming Modeler

Thanks for helping improve the Event Storming Modeler. It lives in `modelers/event-storming` of the
Miragon modeler suite: setup, the scripts, the pre-commit hook, the commit and pull-request
conventions and how to report an issue are in the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md),
CI and releases in [docs/ci-and-releases.md](../../docs/ci-and-releases.md). This file adds what is
special to this modeler. Agent-oriented notes live in [`CLAUDE.md`](CLAUDE.md).

## Inner loop

From the repository root (or with `npm run <script>` inside `modelers/event-storming`):

```bash
npm run build:shared              # once, and after changing packages/api or packages/shell
npm run event-storming build      # builds packages/* (workspace deps resolve to dist: build before testing)
npm run event-storming test       # vitest run
npm run event-storming lint       # eslint . + type-check (what the pre-commit hook runs for this modeler)
```

Useful extras: `npm run event-storming dev:webapp`, `npm run event-storming dev:vscode`,
`npm run event-storming depcruise` (module-graph check), `npm run event-storming format`
(Prettier).

`npm run event-storming dev:webapp` (and `npm run event-storming dev`) serves the webapp through
Portless at `https://<branch>.event-storming.localhost` in a linked worktree and
`https://event-storming.localhost` in the main checkout (config
[`apps/webapp/portless.json`](apps/webapp/portless.json):
`{ "name": "event-storming", "script": "dev:app" }`; the one-time Portless setup is in the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md#dev-servers)). `npm run event-storming dev:webapp:plain`
runs Vite directly on `:5180` and needs none of it.

## Browser & e2e tests

`npm run event-storming test:browser` (Vitest browser mode, incl. the `@miragon/modeler-api`
conformance kit for the collaborative modeler and viewer) and `npm run event-storming test:e2e`
(Playwright, in `e2e/`) need a Chromium browser (`npx playwright install chromium`, once).

`npm run event-storming test:e2e` runs two Playwright projects, each with its own Vite dev server
built from the package sources (no build needed):

| Project          | Serves                                                               | Port (env)                |
| ---------------- | -------------------------------------------------------------------- | ------------------------- |
| `webapp`         | the web app (`e2e/tests/*.spec.ts`)                                  | 5180 (`E2E_PORT`)         |
| `vscode-webview` | the VS Code webview inside the shell's VS Code stub (`e2e/webview/`) | 5190 (`E2E_WEBVIEW_PORT`) |

Both projects run `@miragon/modeler-shell`'s conformance kit: `vscode-webview` on the `ide` host
(geometry, the legend's start state, ARIA, keys, the focus hand-back after a pointer click on
chrome, keyboard creation, a sticky's label editor that the shell's zoom, fit and refit leave open
and uncommitted, the read-only lock of an invalid file, appearance, reduced motion, forced colours,
the canvas's overlay layers, the production bundle behind the webview CSP, cleanup), `webapp` on
the `web` host (the same but the production bundle, plus the focus after a File action, primary
action, legal line, start screen, toasts, problems list and drop zone). The harnesses declare what
Event Storming lacks `absent`
(the legend and the inspector; in the web app also the invalid-file state and a problem row that
selects an element, since its problems name lines, never elements; in the webview a menu action
that hands the focus to the canvas, since its Model group holds only the Level radios and the Type
captions checkbox), and any skip fails the suite. Next to the kit run the webview's protocol and
chrome specs and the web app's own (`webapp-chrome.spec.ts`: share link, the fit to what the board
draws, replace with undo, open, drop, exports, app keys, Delete after a click on + or a palette
entry, Escape after Enter on the Draw entry, and Escape and Enter for the menu, the shortcuts dialog
and the zoom panel while a line is drawn). Run one project with
`npm run event-storming test:e2e -- --project=vscode-webview`. Locally an already running server
on a port is reused, so pick free ports
(`E2E_PORT=5387 E2E_WEBVIEW_PORT=5397 npm run event-storming test:e2e`) when another app occupies
5180 or 5190.

## VS Code smoke test

The e2e project `vscode-webview` runs the webview in a stand-in for VS Code.
`npm run event-storming test:vscode` starts the real one with the **packaged** extension, through
the `@miragon/modeler-shell` driver `runVsCodeSmoke`
([`apps/vscode/test-smoke/`](apps/vscode/test-smoke/), the Vitest project `vscode`, so `npm test`
stays fast); how it works for every modeler, locally and in Docker, is in the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md#tests). Here it:

1. packs the extension as the release does (`vsce package --no-dependencies`, which runs
   `vscode:prepublish`, the production build into `apps/vscode/dist`) and unpacks the VSIX into the
   OS temp directory, so VS Code loads exactly what ships and a module missing from the bundle is
   not found in a `node_modules` of the repository;
2. opens the fixture [`smoke.storm`](apps/vscode/test-smoke/smoke.storm) in the custom editor and
   checks the shell's menu, palette and zoom;
3. adds a sticky with Enter on the first creating palette entry, saves with the platform's save key
   (the file on disk changes and `parseDSLWithDiagnostics` accepts it with one sticky more), undoes
   (canvas and, saved again, the file are back to the fixture's exact text);
4. switches through VS Code's four default themes (Light Modern, Dark Modern, High Contrast, High
   Contrast Light); the webview has to stay light, with the high-contrast mark in the last two, and
   each theme gets a screenshot in `test-results/vscode-smoke/` (gitignored), e.g.
   `event-storming-dark.png`.

No build is needed to run it: the parser check takes the package sources, as the extension's
bundle does.

```bash
npm run event-storming test:vscode:docker                                 # in Docker, no window: the local way
npm run event-storming test:vscode:docker -- --env VSCODE_VERSION=1.96.0  # the engines.vscode floor, or another
npm run event-storming test:vscode:docker -- --env VSCODE_SMOKE_KEEP=1    # VS Code's logs in vscode-logs/
npm run event-storming test:vscode                                        # on the host, with a window
```

On the host, `unzip` must be on the `PATH` (it is on macOS and Ubuntu); a VS Code window opens for
about 5 seconds and takes the focus, so leave it alone until it closes.

Either way the log names each step, then the VS Code version, the timings and every theme with its
screenshot; a failure names its step (`open: …`, `save: …`), and a failed open leaves
`event-storming-open-failure.png` with VS Code's error from the extension host. An exception or a
`console.error` inside the webview is in none of VS Code's logs: the failed open quotes them itself,
with their stacks, and a webview that throws on start fails the open 3 s later instead of after the
driver's 30 s. With `VSCODE_SMOKE_KEEP=1` it also names the folder of VS Code's logs (main process,
renderer, extension host; from Docker they come back in `vscode-logs/`). Keep `playwright-core` in
`apps/vscode/package.json` at the root `playwright` version.

The test is not retried: every failure fails the run at once. The driver's save step
(`@miragon/modeler-shell` 0.4.1) reads the file only after the editor tab turned clean, which VS
Code does once its write has finished, and only when two reads 100 ms apart agree. The parse check
accepts only the fixture's board with one sticky more, since an empty or cut-short `.storm` file can
parse without a diagnostic; anything else fails the save step with the counts it found
(`save: the saved text does not parse: 6 elements and 0 arrows in 181 characters, expected 7 and 4 …`).
A theme switch VS Code does not pick up is the driver's to handle: it writes the setting again,
then switches through another default theme and back, all within its 30 s wait, and logs each of
these steps; a theme that still fails names the theme requested and the one VS Code shows
(`themes: Default High Contrast Light: the workbench never switched (no .hc-light): requested Default High Contrast Light, VS Code shows Default High Contrast …`).

## Design tokens

`packages/renderer/src/theme/cd-tokens.generated.css`, `cd-tokens.generated.json` and
`cd-canvas.css` are vendored unchanged from the `miragon-brand:modeler-tool-design` skill
(`assets/`). To update them, copy all three again, put the vendoring header back as the first line
of the two CSS files (the JSON gets none), and run `npm run event-storming test` (`theme.sync` in
the renderer, `tokens.sync` in apps/vscode against the shell's sizes) and
`npm run event-storming test:e2e -- --project=vscode-webview` (the shell conformance kit). Never
edit or reformat them by hand.

## Monorepo map & the DOM boundary (P1)

| Package                                | Purpose                                                   | DOM      |
| -------------------------------------- | --------------------------------------------------------- | -------- |
| `@miragon/event-storming-schema-model` | Board metamodel, Zod validation, JSON serialization       | DOM-free |
| `@miragon/event-storming-dsl`          | `.storm` text DSL ↔ model (lossless round-trip)           | DOM-free |
| `@miragon/event-storming-transforms`   | Pure `EventStormingBoard → EventStormingBoard` transforms | DOM-free |
| `@miragon/event-storming-renderer`     | diagram-js bootstrap, renderer, viewer, import/export     | DOM      |
| `apps/webapp`                          | Vite demo editor                                          | DOM      |
| `apps/vscode`                          | VS Code custom editor for `.storm`                        | DOM      |

**P1, the DOM boundary:** the DOM-free packages (`schema-model`, `dsl`, `transforms`) must **never**
import `diagram-js`/DOM libraries (`tiny-svg`, `min-dom`) or use the DOM (`window`/`document`). This
is enforced twice, by ESLint (`no-restricted-imports`/`no-restricted-globals`) **and** by
dependency-cruiser, so a violating import fails `npm run event-storming lint` and
`npm run event-storming depcruise`.

Also keep the `.storm` DSL round-trip lossless and JSON serialization deterministic.

## Pull requests

- Make sure the local gates are green: `npm run event-storming lint`, `npm run event-storming test`,
  `npm run event-storming depcruise`, `npm run event-storming build`.
- Commit scope `event-storming`, e.g. `feat(event-storming): add a hotspot sticky`,
  `fix(event-storming): keep comment lines on round-trip`.
- Working on board/domain semantics? Install the modeler's Claude plugin once
  (`/plugin marketplace add Miragon/modeler-suite`, then
  `/plugin install event-storming-modeler@modeler-suite`) for the `event-storming` (method) and
  `storm-dsl` (`.storm` format) skills. The sources live in
  [`plugins/event-storming-modeler/skills/`](plugins/event-storming-modeler/skills/); after editing
  them run `claude plugin validate modelers/event-storming/plugins/event-storming-modeler --strict`
  from the repository root.
