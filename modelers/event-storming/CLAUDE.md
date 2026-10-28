# CLAUDE.md

TypeScript library for viewing and editing [Event Storming](https://www.eventstorming.com/) boards,
built on [diagram-js](https://github.com/bpmn-io/diagram-js) (MIT). Shared core for two targets:
a web app and a VS Code extension.

This modeler is `modelers/event-storming` in the Miragon modeler suite. The suite's
[`CLAUDE.md`](../../CLAUDE.md) holds the rules for every modeler (setup, commands, commits and
signing, exact pins, releases, the design system, the contract and shell boundaries); this file
adds what is special to Event Storming. Run its scripts from the repository root as
`npm run event-storming <script>`, or as `npm run <script>` inside `modelers/event-storming`.

## Packages

The workspaces are `packages/*`, `apps/*` and `e2e` of this folder. Internal
`@miragon/event-storming-*` dependencies pin to the referenced package's **current version** (npm
links them to the local workspace because the local version satisfies the pin); the one exception
to exact pins are the consumer-shared runtime libs declared as ranged `peerDependencies` (see
Conventions).

| Package                                | Purpose                                                                        | DOM |
| -------------------------------------- | ------------------------------------------------------------------------------ | --- |
| `@miragon/event-storming-schema-model` | Board metamodel, Zod validation, timeline sort, JSON serialization, vocabulary | no  |
| `@miragon/event-storming-dsl`          | `.storm` text DSL ↔ model (lossless round-trip)                                | no  |
| `@miragon/event-storming-transforms`   | Pure `EventStormingBoard → EventStormingBoard` transforms (move, …)            | no  |
| `@miragon/event-storming-renderer`     | diagram-js bootstrap, renderer, viewer, import/export, CSS                     | yes |
| `apps/webapp`                          | Vite demo editor                                                               | yes |
| `apps/vscode`                          | VS Code extension: custom editor for `.storm`                                  | yes |

**P1, the DOM boundary:** the DOM-free packages (`schema-model`, `dsl`, `transforms`) must **never**
import `diagram-js`/DOM libraries (`tiny-svg`, `min-dom`) or use the DOM (`window`/`document`).
Enforced twice, by ESLint (`no-restricted-imports`/`no-restricted-globals`) **and** `dependency-cruiser`,
so a violating import fails `npm run event-storming lint` and `npm run event-storming depcruise`.

## Commands

- `npm run event-storming build`: all packages; the unit tests resolve the workspace packages from
  `dist`, so build before `npm run event-storming test` · `npm run event-storming build:webapp`
  (then `npm run check:build -w modelers/event-storming/apps/webapp` checks the mode markup and the
  shell's licence comment in `dist`, as CI does) · `npm run event-storming build:vscode`
- `npm run event-storming dev:webapp` (alias: `npm run event-storming dev`) serves the webapp via
  [Portless](https://portless.sh) at a per-worktree `https://<branch>.event-storming.localhost` URL
  (Portless-derived from the git worktree; config in
  [`apps/webapp/portless.json`](apps/webapp/portless.json); one-time setup in the suite's
  [`CONTRIBUTING.md`](../../CONTRIBUTING.md#dev-servers)). `npm run event-storming dev:webapp:plain`
  for plain Vite on `:5180`. · `npm run event-storming dev:vscode`
- `npm run event-storming test`: Vitest · `npm run event-storming typecheck` (also
  `apps/webapp/vite.config.ts`, through `apps/webapp/tsconfig.config.json`) ·
  `npm run event-storming lint` (ESLint + typecheck)
- `npm run event-storming test:browser`: Vitest in Chromium (renderer integration, the
  `@miragon/modeler-api` conformance kit) · `npm run event-storming test:e2e`: Playwright, two
  projects: `webapp` (the web app, incl. the shell conformance kit on the `web` host) and
  `vscode-webview` (the webview inside the shell's VS Code stub, incl. the kit on the `ide` host);
  one project with `npm run event-storming test:e2e -- --project=vscode-webview`, other ports via
  `E2E_PORT` / `E2E_WEBVIEW_PORT` (default 5180 / 5190)
- `npm run event-storming test:vscode:docker`: the VS Code smoke test below in a Linux container
  under `xvfb-run -a` (the shell's `modeler-shell-vscode-docker`): the way to run it locally, since
  no VS Code window opens; needs Docker. It copies the suite in without `node_modules`/`.git`, runs
  `npm ci` there and brings `test-results/vscode-smoke/` back; options after `--`, e.g.
  `-- --env VSCODE_VERSION=1.96.0 --env VSCODE_SMOKE_KEEP=1` (VS Code's logs in `vscode-logs/`).
- `npm run event-storming test:vscode`: the packaged extension in a real VS Code on the host, for
  CI and for watching the window (Vitest project `vscode`,
  [`apps/vscode/test-smoke/`](apps/vscode/test-smoke/)): packs it as the release does
  (`vsce package`, which runs `vscode:prepublish`), unpacks the VSIX outside the repo and runs the
  shell's `runVsCodeSmoke` (open `smoke.storm`, palette edit, save, undo, the four default themes,
  screenshots in the gitignored `test-results/vscode-smoke/`); no build needed, on macOS a VS Code
  window opens for ~5 s and takes the focus, the first run downloads VS Code into the OS cache;
  `VSCODE_VERSION=1.96.0` for another version, `VSCODE_SMOKE_KEEP=1` keeps VS Code's profile
  and logs, `VSCODE_SMOKE_VSIX=<file>` smokes a packaged VSIX instead of packing one. The test is
  not retried: the driver (shell 0.4.1) reads a save only once the tab is clean and repeats a theme
  switch VS Code missed, so every failure fails the run. When CI runs it is in the suite's
  [docs/ci-and-releases.md](../../docs/ci-and-releases.md); details in
  [`CONTRIBUTING.md`](CONTRIBUTING.md).
- `npm run event-storming format`: Prettier · `npm run event-storming depcruise`: check the
  module graph

## Releases

Each package here (`schema-model`, `dsl`, `transforms`, `renderer`, `vscode`, `webapp`) is
released with its own version and changelog through the suite's one release PR; the mechanics,
including how internal `@miragon/event-storming-*` pins (peer dependencies included) follow a
release, are in [docs/ci-and-releases.md](../../docs/ci-and-releases.md). A release publishes the
`packages/*` libraries to npm (with provenance) and the VS Code extension
(`miragon-gmbh.event-storming-modeler`) to the VS Code Marketplace and Open VSX.

## Conventions

- Keep core packages (`schema-model`, `dsl`, `transforms`) strictly DOM-free (P1, above).
- The `.storm` DSL round-trip must stay lossless (unknown lines survive via `rawPassthrough`);
  board JSON serialization must be deterministic. Board transforms are pure functions.
- Pins follow the suite's rule. **Exception:** consumer-shared third-party runtime libs (`zod`;
  `diagram-js`/`didi`/`tiny-svg`) are `peerDependencies` with **caret ranges** so consumers can
  dedupe against a single copy, mirrored by an exact `devDependency`, with the bundling apps
  declaring the exact version.
  [`peer-dependencies.sync.test.ts`](packages/renderer/test/peer-dependencies.sync.test.ts) fails
  when one of these exact versions falls outside the peer range (after a major bump, widen it:
  `"didi": "^11.0.0 || ^12.0.0"`). See
  [`.claude/rules/package-json-fixed-versions.md`](.claude/rules/package-json-fixed-versions.md).
- The modeler's Claude skills ship as the **`event-storming-modeler` plugin**
  ([`plugins/event-storming-modeler/`](plugins/event-storming-modeler/)) via the suite's
  marketplace in [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json):
  `event-storming` for domain work, `storm-dsl` for the `.storm` text format (grammar, coordinates,
  round-trip, diagnostics). Install once with `/plugin marketplace add Miragon/modeler-suite` and
  `/plugin install event-storming-modeler@modeler-suite`; the skill files are readable directly
  under `plugins/event-storming-modeler/skills/` either way. The plugin's `version` lives in its
  `plugin.json` only.
- The renderer implements the collaborative-modeler contract 1.3
  [`@miragon/modeler-api`](../../packages/api/README.md)
  (`createCollaborativeModeler` / `createCollaborativeViewer`, notation `event-storming`, in
  [`packages/renderer/src/collaborative/`](packages/renderer/src/collaborative/)); its conformance
  kit runs in `npm run event-storming test:browser`, with every harness hook (`moveElement`,
  `openInteraction`, `interactionState`, `commitInteraction`, …), so a skip or an advisory fails
  the suite. The DOM-free packages may take only type-only imports from the contract (ESLint and
  dependency-cruiser). The elements surface lists stickies only, with their live box
  (`elements.bounds`): their ids survive a save and re-open because the serializer writes `(id …)`
  back whenever the parser would not derive the same id at that line; notes, drawings and arrows
  have no id grammar yet. New sticky ids are `<prefix>_<8 random [0-9a-z]>` (`allocateId`, e.g.
  `event_k3x9q2ab`), so stickies two peers add at the same time do not collide. `contentBounds()`
  (on the contract instances and on `Modeler`/`Viewer`/`NavigatedViewer`) is the tight box around
  what the board draws, `boardBounds.contentBounds(0)` (every shape, a hotspot's tilt and every
  arrow annotation, measured on a 2D canvas so no zoom changes it, and drawn with
  `text-rendering: geometricPrecision` so that the drawn text does not change with the zoom either),
  or `undefined` while the board has no element. An annotated board is imported only once the
  annotation font has loaded, imports staying in call order, so every fit on import measures it in
  that font. A view change (`setViewState`, a host's fit, scroll, zoom) never commits an open label
  editor: it stays open and follows its element (contract L5).
- Contributor notes for this modeler in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Design system (mandatory)

All UI/visual work follows the Miragon product design system (the `miragon-brand:modeler-tool-design`
skill; see the suite's [`CLAUDE.md`](../../CLAUDE.md#design-system-mandatory)). Here:

The design-system files are vendored **unchanged** from that skill (design system 1.13.0) into
[`packages/renderer/src/theme/`](packages/renderer/src/theme/): `cd-tokens.generated.css`,
`cd-tokens.generated.json` and `cd-canvas.css`. The two CSS files carry one extra first line, the
vendoring header; the JSON is byte-identical. Never edit or reformat them (Prettier-ignored, marked
`linguist-generated`) and never fork a hex value: re-copy all three from the skill's `assets/` to
update, re-add the header, and run `npm run event-storming test`.
[`event-storming.css`](packages/renderer/src/assets/event-storming.css) starts with
`@import '../theme/cd-tokens.generated.css' layer(event-storming-tokens)`, then `diagram-js.css`,
then `cd-canvas.css` (unlayered, so its `--bio-*`/`.djs-parent` mapping beats diagram-js's
defaults); both apps get the tokens through the renderer CSS and import no token file themselves.
Drift tests: [`packages/renderer/test/theme.sync.test.ts`](packages/renderer/test/theme.sync.test.ts)
(import order and layer, the header, the JSON roles against the CSS so a partial re-copy fails,
every `MIRAGON` value in [`palette.ts`](packages/renderer/src/theme/palette.ts) against its `--cd-*`
token, no colour literal and no fixed palette token in `event-storming.css` (it reads the
`--cd-ui-*` roles only), no `style dark` rendering, overlays below the palette, palette rules scoped
away from the shell, and the notation contrast: the text colour `textColorOn` picks 4.5:1 on every
kind fill and on the review skill's note colours, arrows, sticky borders and the provisional
sticky's dashed border 3:1 on the canvas ground, arrows in `kontur` and their annotation in
`text-leise`, colour literals only in `palette.ts` and `draw/styles.ts`) and
[`apps/vscode/test/tokens.sync.test.ts`](apps/vscode/test/tokens.sync.test.ts) (the shell's `SHELL`
sizes against the vendored `shell` group). The canvas drawing keeps literal light colours in its SVG
attributes (`draw/styles.ts`), never a `var()`. The sticky colours are the modeler's own: each
border keeps its fill's hue, dark enough for 3:1, and a new kind's colours must pass the same test.
Text on a fill the user sets (`(color …)`, any CSS colour) is black or white, whichever contrasts
more ([`draw/contrast.ts`](packages/renderer/src/draw/contrast.ts), guide §10.6). The DSL's
`style dark` stays in the board config for the round-trip, but nothing renders it (guide §10.7).

**Chrome = `@miragon/modeler-shell`, in both apps.** The VS Code webview
([`apps/vscode/src/webview/main.ts`](apps/vscode/src/webview/main.ts)) mounts the shared Miragon
modeler chrome on the `ide` host (menu, palette skin, chrome tooltip, zoom panel and keys, fit,
problems pill, status box, empty-file hint, theme bridge, key interception); the extension host
uses the shell's webview HTML/CSP and theme bridge. The web app
([`apps/webapp/src/main.ts`](apps/webapp/src/main.ts)) mounts it on the `web` host: the same chrome
plus the web column (File group, "Share" as primary action, legal line, toasts, problems list,
start screen, page-wide drop zone); its `index.html` stays `data-cd-theme="light"` and the Vite
config writes the shell's `webHeadMarkup` (light only: one theme-color and the contrast line).
Stylesheet order in both: fonts, the renderer (tokens, diagram-js, canvas mapping and the shortcuts
dialog), `@miragon/modeler-shell/shell.css` last; neither app has a stylesheet of its own. Both take
the board's menu entries (Level, Type captions, the exports, "Keyboard shortcuts…") and the
shortcuts dialog from the renderer (`boardMenu`, `createShortcutsDialog`,
[`packages/renderer/src/board-menu/`](packages/renderer/src/board-menu/)), which mirrors the
shell's types structurally; a sync test in apps/vscode pins the mirror against the shell. The
renderer's own palette rules apply only to `.djs-palette:not([data-chrome='palette'])`, so a
shell-skinned palette wears the shell's look alone. **Renderers never import the shell**: only
the apps (and `e2e/`) do; `packages/*` reaching `@miragon/modeler-shell` fails ESLint and
dependency-cruiser. Both pass the shell's fit insets as `freeArea: { insets }` (the modeler-api
factory option, for keyboard creation from the palette) and connect with
`connectDiagramJs(shell, diagram, { modeler, isEmpty })`, so the shell
fits to the renderer's `contentBounds()` (the webview passes its contract instance, the web app
its `Modeler`); the webview runs on `createCollaborativeModeler` (the tested contract path) and toggles
the renderer's `eventStormingReadOnly` lock together with `shell.setReadOnly`, the web app keeps
the canvas's undo keys and replaces a board with an undo toast instead of a confirmation. The
VSIX ships `apps/vscode/THIRD_PARTY_NOTICES.md`, generated from the bundles
(`npm run notices -w modelers/event-storming/apps/vscode`; a unit test fails when it is stale); the
web bundle keeps the shell's Lucide/Feather legal comment.

Reference implementation in this modeler: tokens
[`packages/renderer/src/theme/palette.ts`](packages/renderer/src/theme/palette.ts) · canvas
colours [`packages/renderer/src/draw/styles.ts`](packages/renderer/src/draw/styles.ts) · in-canvas
chrome [`packages/renderer/src/assets/event-storming.css`](packages/renderer/src/assets/event-storming.css)
· board menu and shortcuts dialog
[`packages/renderer/src/board-menu/`](packages/renderer/src/board-menu/) · web app
[`apps/webapp/src/main.ts`](apps/webapp/src/main.ts) · VS Code webview
[`apps/vscode/src/webview/`](apps/vscode/src/webview/).
