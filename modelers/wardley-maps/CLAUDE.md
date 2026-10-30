# CLAUDE.md

TypeScript library for viewing and editing [Wardley Maps](https://learnwardleymapping.com/),
built on [diagram-js](https://github.com/bpmn-io/diagram-js) (MIT). Shared core for two targets:
a web app and a VS Code extension.

This modeler is `modelers/wardley-maps` in the Miragon modeler suite. The suite's
[`CLAUDE.md`](../../CLAUDE.md) holds the rules for every modeler (setup, commands, commits and
signing, exact pins, releases, the design system, the contract and shell boundaries); this file
adds what is special to Wardley Maps. Run its scripts from the repository root as
`npm run wardley-maps <script>`, or as `npm run <script>` inside `modelers/wardley-maps`.

## Packages

The workspaces are `packages/*`, `apps/*` and `e2e` of this folder. Internal
`@miragon/wardley-*` dependencies pin the **current version of that workspace package** (e.g.
`"@miragon/wardley-dsl": "0.6.0"`); npm links them to the local workspace because the local
version satisfies the pin, and the release PR bumps them.

| Package                         | Purpose                                                         | DOM |
| ------------------------------- | --------------------------------------------------------------- | --- |
| `@miragon/wardley-schema-model` | Metamodel, Zod validation, stage derivation, JSON serialization | no  |
| `@miragon/wardley-dsl`          | OWM text DSL ↔ model (lossless round-trip)                      | no  |
| `@miragon/wardley-transforms`   | Pure `WardleyMap → WardleyMap` transforms (evolve, inertia, …)  | no  |
| `@miragon/wardley-renderer`     | diagram-js bootstrap, renderer, viewer, import/export, CSS      | yes |
| `apps/webapp`                   | Vite demo editor                                                | yes |
| `apps/vscode`                   | VS Code extension: custom editor for `.wmap`/`.owm`             | yes |

**P1, the DOM boundary:** the DOM-free packages (`schema-model`, `dsl`, `transforms`) must **never**
import `diagram-js`/DOM libraries (`tiny-svg`, `min-dom`) or use the DOM (`window`/`document`); of
`@miragon/modeler-api` they may import types only. No package under `packages/` imports
`@miragon/modeler-shell`: the shared modeler chrome belongs to the apps. Enforced twice, by ESLint
(`no-restricted-imports`/`no-restricted-globals`) **and** `dependency-cruiser`, so a violating
import fails `npm run wardley-maps lint` and `npm run wardley-maps depcruise`.

**Contract and shell:** the renderer implements the
[`@miragon/modeler-api`](../../packages/api/README.md) collaborative-modeler contract
(`createCollaborativeModeler`/`createCollaborativeViewer` in
[`packages/renderer/src/collaborative/`](packages/renderer/src/collaborative/)); its conformance kit
runs in the browser tests
([`conformance.browser.test.ts`](packages/renderer/test/browser/conformance.browser.test.ts)), and a
skipped case fails the run. An import cancels a running diagram-js drag first, as Escape does
(`cancelGesture` in `WardleyBaseViewer`); a drawing's point drag is the renderer's own and ends
without a commit when its drawing is removed (`shape.remove` in `WardleyDrawingHandles`) or a
command starts before its release. The evolve-target and label drags preview on the shape itself:
`wardleyLivePreview` keeps the evolve target and label offset the document has
(`beginShape`/`putBackShape`), so `exportText()` stays the committed document (#347), and a command
that starts while they preview ends them without a commit too. The armed lasso (`lasso.selection`)
stays armed, and so does the draw tool before its first point; a line it holds ends without a
drawing on the import (`import.render.start` in `WardleyDrawTool`, #243). The renderer's own drags
(label, point, evolve target) and the colour picker bind Escape themselves and take it only when it
is aimed at the canvas `<svg>` (`isCanvasKey` in `src/a11y/`), the picker also on its swatches;
while the draw tool holds points, `WardleyKeyboard` leaves the single-key tools without effect, and
while a point drag runs also the arrow keys, paste and duplicate (`isDraggingPoint`, #375).
`wardleyInteraction` ([`src/interaction/`](packages/renderer/src/interaction/)) follows every gesture
(diagram-js drags past their threshold and the renderer's own label, point and evolve-target drags,
which report to it) for the contract's `interaction`, and marks the user's actions, the one wait of
`importText` (`afterUserAction`): an import called during an action waits until it has finished,
behind the imports that waited before it (#248, #285, #305, #336). A drop has finished once it has
ended and the steps it defers by a task have run (the name editor of a create with the pointer); any
other command, undo or redo once the code that ran it has returned (`COMMAND_START_EVENTS`, a
microtask), so a create without a pointer keeps its element selected and its name editor open across
a host's echo, a saved name keeps its selection, and the drag a press starts after it saved a name
ends with the import, as an accepted import ends a running gesture and a press below the drag
threshold (L1, 1.5). The activation of a diagram-js drag (`drag.start`, a microtask) is an action
too: diagram-js clears the selection after the start and reads the drag again, so an import from the
selection listener there runs once `Dragging.move` has returned and then ends the drag. A
`destroy()` from the selection or the interaction listener while the drag activates, or from the
interaction listener as one of the renderer's own drags starts (`begin`), tears the map down once
the code that started the drag has returned (`tearDownAfterActivation`, #346), and the
selection the cancelled drag brings back reaches no host listener. Pinned by
[`import-during-user-action.browser.test.ts`](packages/renderer/test/browser/import-during-user-action.browser.test.ts),
[`import-during-gesture.browser.test.ts`](packages/renderer/test/browser/import-during-gesture.browser.test.ts)
and the drop cases of `interaction.browser.test.ts`. `appearance`
writes `data-cd-theme` and `data-cd-kontrast` on the map's container; its `themes` is
`WARDLEY_THEMES`. Both are pinned by
[`interaction.browser.test.ts`](packages/renderer/test/browser/interaction.browser.test.ts) and
[`appearance.browser.test.ts`](packages/renderer/test/browser/appearance.browser.test.ts), which
follow the kit's cases (`packages/api/README.md`, "Cases for the 1.5 surfaces and the gesture
rules of 1.6") with the harness fields of
[`support/gesture-harness.ts`](packages/renderer/test/browser/support/gesture-harness.ts), which
the conformance harness reuses.
The VS Code webview mounts `@miragon/modeler-shell`
([`apps/vscode/src/webview/main.ts`](apps/vscode/src/webview/main.ts)), the web app mounts its web
host ([`apps/webapp/src/main.ts`](apps/webapp/src/main.ts)); the shell's conformance kit runs
against both, in the `vscode-webview` Playwright project (`e2e/tests/vscode/`) and in the `webapp`
project (`e2e/tests/webapp-shell-conformance.spec.ts`).

The extension's document plumbing is the shell's too: [`mapEditor.ts`](apps/vscode/src/mapEditor.ts)
registers the custom editor with `registerModelerEditor` of `@miragon/modeler-shell/vscode/extension`
(sync, echo suppression, minimal line edits, undo through the document, "Insert example", the
problems pill), handing it `withExampleInserted`, the parser's warnings of `WardleyDiagnostics` and
the export; the webview's half is `connectDocumentSync`, whose `exportText` patches the OWM text with
`patchDSL`, so comments and statement order survive a canvas edit. The options that need no
`vscode` live in [`mapEditorOptions.ts`](apps/vscode/src/mapEditorOptions.ts), which the e2e page
also registers against the shell's host stub (`?host`, `e2e/tests/vscode/document-sync.spec.ts`).

Both apps hand the shell the shortcuts dialog and the PNG: Help › Keyboard shortcuts… opens
`shell.showShortcutsDialog(mapShortcuts(shell, …))` (the renderer's groups as data; the shell adds
the chrome's zoom keys), and the PNG exports go through `svgToPng` of `@miragon/modeler-shell/export`
on `COLORS.plotBackground`, the `--cd-ui-plot` role a notation with a plot lies on (guide §10.7,
pinned by `theme.sync.test.ts`; the 4× variant is `"transparent"`). The web app lets the shell read
Geist from its stylesheets and shows a warning toast when the labels fell back to the system font;
the webview's CSP and stylesheet keep its font files out of reach, so
[`geist-faces.ts`](apps/vscode/src/webview/geist-faces.ts) imports every subset (upright and
italic) with `?dataurl`, which the `dataurl-imports` plugin of
[`esbuild.config.mjs`](apps/vscode/esbuild.config.mjs) (also read by
`scripts/third-party-notices.mjs`) and of the e2e page's
[`vite.config.ts`](e2e/webview/vite.config.ts) inline, and a fallback reaches the host as
`fontFallback` on the `export` message (`pngExportMessage`), which then warns instead of confirming.
The `vscode-webview` e2e tests record the SVG each PNG is drawn from and check that every embedded
face carries the fontsource file of its subset and style. The web app and the webview show their
own text when the SVG or PNG can't be made (guide §2), never the error's message; when the
extension host can't write the file, its error names the file-system reason. The
renderer's `createShortcutsDialog` and `svgToPng` stay exported for designIQ, deprecated since 0.14.0
and removed in 0.15.0 ([#258](https://github.com/Miragon/modeler-suite/issues/258)); no app uses
them.

## Commands

- `npm run wardley-maps build`: all packages; the unit tests resolve the workspace packages from
  `dist`, so build before `npm run wardley-maps test` · `npm run wardley-maps build:webapp` (then
  `npm run check:build -w modelers/wardley-maps/apps/webapp` checks the mode markup and licence comment
  it ships) · `npm run wardley-maps build:vscode`
- `npm run wardley-maps dev:webapp` (alias: `npm run wardley-maps dev`) serves the webapp via
  [Portless](https://portless.sh) at a per-worktree `https://<branch>.wardley.localhost` URL
  (Portless-derived from the git worktree; config in
  [`apps/webapp/portless.json`](apps/webapp/portless.json); one-time setup in the suite's
  [`CONTRIBUTING.md`](../../CONTRIBUTING.md#dev-servers)). `npm run wardley-maps dev:webapp:plain` for
  plain Vite on `:5180`. · `npm run wardley-maps dev:vscode`
- `npm run wardley-maps test`: Vitest · `npm run wardley-maps test:browser`: Vitest browser mode ·
  `npm run wardley-maps typecheck` · `npm run wardley-maps lint` (ESLint + typecheck)
- `npm run wardley-maps test:e2e`: Playwright, projects `webapp` and `vscode-webview` (ports
  `E2E_PORT`, default 5180, and `E2E_WEBVIEW_PORT`, default 5190), and `webapp-webkit` with the
  web app's Share and focus hand-back specs in WebKit (`npx playwright install chromium webkit`
  once)
- `npm run wardley-maps test:vscode`: the `vscode` Vitest project
  ([`apps/vscode/test/smoke/`](apps/vscode/test/smoke/)): packs the extension like the release
  (`vsce package`, so `vscode:prepublish`), unpacks the VSIX outside the repo and runs
  `runVsCodeSmoke` of `@miragon/modeler-shell/testing/vscode-electron` in a real VS Code (open, evolve
  a component, save, undo, four themes; screenshots in `test-results/vscode-smoke/`). Opt-in, not in
  `npm test`; no package build needed; a failed run is not retried. On macOS it opens a VS Code
  window for about half a minute that takes the focus; Linux:
  `xvfb-run -a npm run wardley-maps test:vscode`; `VSCODE_VERSION=1.96.0` picks a version,
  `VSCODE_SMOKE_KEEP=1` keeps VS Code's logs, `VSCODE_SMOKE_VSIX=<path>` smokes a packed VSIX
  instead of packing one (the release does).
- `npm run wardley-maps test:vscode:docker`: the local way to run that smoke test, without a VS Code
  window: `modeler-shell-vscode-docker` of `@miragon/modeler-shell` runs `npm run test:vscode`
  under `xvfb-run -a` in a Linux container (needs Docker; it copies the suite in, runs `npm ci`
  there, the host's `node_modules` stay untouched). Variables go in with `--env`, given to the
  workspace because the alias passes no flag on; this brings VS Code's logs back into
  `test-results/vscode-smoke/vscode-logs/`:
  `npm run test:vscode:docker -w @miragon/wardley-maps-modeler-workspace -- --env VSCODE_SMOKE_KEEP=1`.
  On a developer's Mac run this one, not `test:vscode`, whose window would take the user's focus.
  Details in
  [`CONTRIBUTING.md`](CONTRIBUTING.md#vs-code-smoke-test); when CI runs the smoke is in the suite's
  [docs/ci-and-releases.md](../../docs/ci-and-releases.md).
- `npm run wardley-maps format`: Prettier · `npm run wardley-maps depcruise`: check the module graph

## Releases

Every package here is released on its own (`schema-model`, `dsl`, `transforms`, `renderer`,
`vscode`, `webapp`), each with its own `CHANGELOG.md` (`packages/*/CHANGELOG.md`,
`apps/*/CHANGELOG.md`), through the suite's one release PR; the mechanics are in
[docs/ci-and-releases.md](../../docs/ci-and-releases.md). A release publishes the
`packages/*` libraries to npm and the VS Code extension (`miragon-gmbh.wardley-mapping-modeler`)
to the Marketplace and Open VSX; the web app is no package and is deployed from `main`.

The [`CHANGELOG.md`](CHANGELOG.md) in this folder is the history of the former shared version (up
to `v0.5.0`) and is no longer written.

## Conventions

- Keep core packages (`schema-model`, `dsl`, `transforms`) strictly DOM-free (P1, above).
- The OWM-DSL round-trip must stay lossless; JSON serialization must be deterministic.
- Texts users read (diagnostics, warnings, toasts, tooltips, labels) join without an em dash or a
  spaced en dash (guide §2, brand-lint A2). brand-lint reads the Markdown and `index.html`, but
  only the colours of a `.ts` file and no JSON, so
  [`packages/renderer/test/user-texts.sync.test.ts`](packages/renderer/test/user-texts.sync.test.ts)
  checks, with A2's pattern, every string literal of the TypeScript sources under `packages/*/src`
  and `apps/*/src` and every string of their `package.json` (the npm descriptions and the VS Code
  manifest with its commands and walkthrough).
- Pins follow the suite's rule, including the `peerDependencies` exception (ranged `zod` and
  `diagram-js`/`didi`/`tiny-svg` peers, each mirrored by an exact `devDependency` and pinned exactly
  by the apps). Neither npm inside the workspace nor `pin-check` notices a peer range that rejects
  those exact versions, so
  [`packages/renderer/test/peer-dependencies.sync.test.ts`](packages/renderer/test/peer-dependencies.sync.test.ts)
  checks that every peer range accepts its devDependency mirror and the version each dependent
  workspace installs. See
  [`.claude/rules/package-json-fixed-versions.md`](.claude/rules/package-json-fixed-versions.md).
- The modeler's Claude skills ship as the **`wardley-maps-modeler` plugin**
  ([`plugins/wardley-maps-modeler/`](plugins/wardley-maps-modeler/)) via the suite's marketplace in
  [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json): `wardley-mapping` for
  domain work (method, doctrine, creating and reviewing maps), `owm-dsl` for the `.wmap`/`.owm`
  text format (grammar, coordinates, round-trip, diagnostics). Install once with
  `/plugin marketplace add Miragon/modeler-suite` and
  `/plugin install wardley-maps-modeler@modeler-suite`; the skill files are readable directly under
  `plugins/wardley-maps-modeler/skills/` either way. Keep the skills repo-independent: they also
  run in other repositories and in Miragon AI Design, where Claude writes the map file directly and
  the modeler renders it. Drift tests guard them:
  [`packages/dsl/test/skill-examples.test.ts`](packages/dsl/test/skill-examples.test.ts) parses
  every `owm`-tagged code block and every `*.wmap`/`*.owm` under `plugins/wardley-maps-modeler/`
  (zero diagnostics, stable round-trip), and
  [`packages/renderer/test/skill-note-colors.sync.test.ts`](packages/renderer/test/skill-note-colors.sync.test.ts)
  keeps the documented note colours equal to `NOTE_COLORS` in
  [`packages/renderer/src/draw/styles.ts`](packages/renderer/src/draw/styles.ts). The plugin's
  `version` lives in its `plugin.json` only (the marketplace entry carries none); bump it there.
- Contributor notes for this modeler in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Design system (mandatory)

All UI/visual work follows the Miragon product design system (the `miragon-brand:modeler-tool-design`
skill; see the suite's [`CLAUDE.md`](../../CLAUDE.md#design-system-mandatory)). Here:

The skill's design-system files are vendored **verbatim** (guide 1.27.0) into
[`packages/renderer/src/theme/`](packages/renderer/src/theme/): `cd-tokens.generated.css`,
`cd-tokens.generated.json` and `cd-canvas.css`; do not fork hex values or edit them; to update,
re-copy all three from the skill and put the new release's sha256 values into the drift test.
Reference implementation in this modeler: tokens
[`packages/renderer/src/theme/palette.ts`](packages/renderer/src/theme/palette.ts) · drift test
[`packages/renderer/test/theme.sync.test.ts`](packages/renderer/test/theme.sync.test.ts) (the three
files byte-identical to the release; also: the in-canvas chrome uses only
`--cd-ui-*`/`--cd-shell-*` roles, no colour literals, overlays at most z-index 100) · canvas colours [`packages/renderer/src/draw/styles.ts`](packages/renderer/src/draw/styles.ts)
· context-pad icons [`packages/renderer/src/draw/lucide.ts`](packages/renderer/src/draw/lucide.ts)
(lucide-static 1.59.0, plus the derived `chevrons-right-x`), pinned by
[`packages/renderer/test/icons.test.ts`](packages/renderer/test/icons.test.ts) to
[`packages/renderer/test/fixtures/lucide-static-1.59.0.icon-nodes.json`](packages/renderer/test/fixtures/lucide-static-1.59.0.icon-nodes.json):
re-copy both from the same Lucide release, together with the licence notices in the renderer
README and in `apps/vscode/scripts/third-party-notices.mjs` · in-canvas chrome [`packages/renderer/src/assets/wardley.css`](packages/renderer/src/assets/wardley.css)
· web app and VS Code webview: the chrome of `@miragon/modeler-shell` (light only: the renderer's
`WARDLEY_THEMES` in [`packages/renderer/src/appearance/index.ts`](packages/renderer/src/appearance/index.ts),
DOM-free as `@miragon/wardley-renderer/themes`, which both apps and the extension's theme bridge
read, pinned by [`apps/webapp/test/themes.test.ts`](apps/webapp/test/themes.test.ts); `style dark`
round-trips but is never painted), its sizes checked by
[`apps/vscode/test/tokens.sync.test.ts`](apps/vscode/test/tokens.sync.test.ts); the web app's own
content is the map-as-text dialogs and the start screen's empty canvas
([`apps/webapp/src/style.css`](apps/webapp/src/style.css)).
