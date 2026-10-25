# CLAUDE.md

TypeScript modeler for the strategic Domain-Driven Design [Context Maps](https://contextmapper.org/)
notation (bounded contexts by subdomain type, connected by context-mapping relationship patterns with
OHS/PL/ACL/CF integration roles), built on [diagram-js](https://github.com/bpmn-io/diagram-js) (MIT).
Shared core for two targets: a web app and a VS Code extension.

This modeler is `modelers/context-maps` in the Miragon modeler suite. The suite's
[`CLAUDE.md`](../../CLAUDE.md) holds the rules for every modeler (setup, commands, commits and
signing, exact pins, releases, the design system, the contract and shell boundaries); this file
adds what is special to Context Maps. Run its scripts from the repository root as
`npm run context-maps <script>`, or as `npm run <script>` inside `modelers/context-maps`.

## Design system (mandatory)

All UI/visual work follows the Miragon product design system: the
**`miragon-brand:modeler-tool-design`** Claude skill (design system **1.15.0**; see the suite's
[`CLAUDE.md`](../../CLAUDE.md#design-system-mandatory)). Here:

Its files are **vendored unchanged** in [`packages/renderer/src/theme/`](packages/renderer/src/theme):
`cd-tokens.generated.css`, `cd-tokens.generated.json` and `cd-canvas.css` (the same bytes from
1.13.0 to 1.15.0). Never edit them, re-copy them from the skill's `assets/`. [`assets/context-maps.css`](packages/renderer/src/assets/context-maps.css)
loads them in the order of guide §10.3 (tokens in a cascade layer, then `diagram-js.css`, then
`cd-canvas.css`) and reads only the `--cd-ui-*` roles and the mode-independent tokens: no colour
literal, no fixed palette token. The pure-TS mirror
[`theme/palette.ts`](packages/renderer/src/theme/palette.ts) (`MIRAGON`) holds the values the SVG
drawing needs as attributes. Drift tests:
[`packages/renderer/test/theme.sync.test.ts`](packages/renderer/test/theme.sync.test.ts) pins the three
files to the release's hashes and checks the CSS rules, `MIRAGON` and the import order;
[`apps/vscode/test/tokens.sync.test.ts`](apps/vscode/test/tokens.sync.test.ts) pins the modeler
shell's `SHELL` sizes to the vendored `shell` tokens. The subdomain-type fills and outlines, the
relationship-pattern strokes and the integration-role marker colours in
[`packages/schema-model/src/notation.ts`](packages/schema-model/src/notation.ts) are the Context
Maps notation. They follow the conventions of strategic DDD context maps, not the fixed values of an
official template, so they may be tuned for contrast. Every text reaches 4.5:1 on what it sits on,
every subdomain glyph 3:1 on its box, and every line 3:1 on the canvas ground: the box outlines, the
relationship lines and the borders of the symmetric patterns' chips. No stroke is exempt (guide
§3.6, §10.6; the exception there for official notation strokes covers only Team Topologies). The
Supporting outline, the Separate Ways line and the OHS and ACL markers are darkened for that, each
by the smallest step at the same hue. A role chip (OHS, PL, ACL, CF) is one filled area without a
border of its own: its text names the role with at least 4.5:1 on the chip, and its fill is a colour
cue next to that text, not a line (the PL fill `#c99a2e` has 2.58:1 on the paper of its frame). The
frame around the role chips is the decorative `linie`, which carries no contrast claim (guide §3.2).
A document never carries the notation's values: it serializes only a bounded context's optional
`fill` / `stroke` override, so a tuned value changes no document.
[`test/notation-contrast.test.ts`](packages/renderer/test/notation-contrast.test.ts) checks every
pair of the notation and the palette and legend previews,
[`test/browser/notation-contrast.test.ts`](packages/renderer/test/browser/notation-contrast.test.ts)
measures every text and line the canvas draws; it tells the chips apart by their classes
(`cm-pattern-chip`, `cm-role-chip`, `cm-role-frame`) and counts them. The design system applies to
everything else (chrome, typography, selection, neutrals, the app icon).

The renderer's own canvas colours come from `MIRAGON`: an unclassified context is `weiss` with a
`kontur` outline, the team caption and its glyph are `text-leise`, and so is the subdomain badge
(the type's name and glyph; the box keeps the type's fill and outline as the colour cue). The bare
glyph without a box (`subdomainIconSvg`) keeps the type's outline colour. The role chips' frame is
`linie`, and [`test/context-colours.test.ts`](packages/renderer/test/context-colours.test.ts) fails
on a colour literal anywhere else in the renderer's `src/`. On a fill the author set, a context's
name, team and badge are black or white, whichever has more contrast (guide §10.6,
`draw/contextColours.ts`). The same rule picks each role chip's text (PL and CF black, OHS and ACL
white), and a symmetric pattern's chip writes black on paper, bordered in the pattern's colour
(`draw/relationshipColours.ts`).
Icons are Lucide (`draw/lucide.ts`), on the canvas too: the team glyph is `users`. The subdomain
glyphs (a filled star for core, an open hand for supporting, a dotted circle for generic) are
notation, not function icons, and keep their shapes (guide §3.6, §11); the star and the hand are the
Material Icons paths `star` and `pan_tool` (Apache-2.0) in `draw/subdomainGlyphs.ts`, named in the
renderer README's licence notice, in the VSIX's `THIRD_PARTY_NOTICES.md` (written by
`apps/vscode/scripts/third-party-notices.mjs`) and in a legal comment the web app's bundle keeps
(`check:build`).

## Contract and chrome

- **Contract.** The renderer implements the collaborative-modeler contract of
  [`@miragon/modeler-api`](../../packages/api/README.md) (1.3):
  `createCollaborativeModeler` / `createCollaborativeViewer` in
  [`packages/renderer/src/collaborative/`](packages/renderer/src/collaborative), the text lane being
  the canonical JSON of a `.cm` file (`serializeDocumentText`, ends in one line break). Its
  conformance kit runs in `npm run context-maps test:browser`
  ([`conformance.browser.test.ts`](packages/renderer/test/browser/conformance.browser.test.ts)) with
  every hook filled; a skip or an advisory fails it. Imports are silent (the history goes without an
  event), reject without a trace (ids, coordinates, newer versions checked first) and keep unknown
  keys. A host's view change (`setViewState`, a fit) never commits an open editor,
  `elements.bounds(id)` gives an element's live box and `contentBounds()` (also on every
  `CmBaseViewer`) the tight box around what the canvas draws: the contexts, wider where a team row
  or a type's name runs past one (`draw/contextLayout.ts` holds the geometry for the renderer and
  the box), and the relationships' waypoints, read from the model with text measured on a canvas,
  not from the SVG. The fit after an import centres it with the insets of `freeArea: { insets }` or
  with room for the renderer's own palette (also when only `{ center }` is given; a test pins
  both), and a browser test compares the box with the drawing at zoom 1.
- **Chrome.** Both apps mount [`@miragon/modeler-shell`](../../packages/shell/README.md)
  with `themes: ["light"]`: the VS Code webview on the `ide` host (menu, palette skin, zoom panel and
  keys, fit, legend slot, problems pill, status box, empty-file hint), the web app on the `web` host
  (the same plus File group, Share, legal line, toasts, problems list, start screen and drop zone;
  `index.html` gets the mode markup of `webHeadMarkup` from the Vite config). Neither app has a
  stylesheet or chrome markup of its own. `connectDiagramJs(shell, …, { modeler, isEmpty })` fits
  to the renderer's `contentBounds()`: the webview passes its contract instance, the web app its
  `Modeler`; neither computes bounds of its own. The renderer **never imports the shell** (ESLint
  and dependency-cruiser enforce it); it hands the chrome structurally typed parts: `contextMapMenu`,
  `createShortcutsDialog`, `createTitleDialog`, `renderLegend`, the `cmReadOnly` canvas lock,
  keyboard creation in the free area (`freeArea: { insets }`; `freeRectInsets` stays a deprecated
  alias through the 0.5 releases), `fitOnImport` and `undoRedoKeys: false` for hosts that own the
  history. `cmLegendModule` (closed at first on every canvas size; a host's `setOpen()` restores a
  stored state) and the renderer's own palette rules stay for hosts that embed the renderer without
  the shell. The DOM-free packages take only types from `@miragon/modeler-api`.
- **Kit.** `e2e/` runs the shell's conformance kit against the real webview in the shell's VS Code
  stub (project `vscode-webview`, served from `e2e/webview/`; the inspector and `canvasMenuAction`
  are absent: VS Code's own File menu opens and saves, and the Model group holds only the "Map
  title…" dialog and the Legend checkbox) and against the web app (project `chromium`; the
  inspector and the invalid-file state are absent). Both feed the `labelEditor` hooks
  ([`e2e/tests/support/label-editor.ts`](e2e/tests/support/label-editor.ts): a double-click on a
  context, typed text; a commit shows as a changed map in the web app and as an `edit` message in
  the webview). Every case opens the example, and any skip fails the suite.
- **Real VS Code.** `npm run context-maps test:vscode` (Vitest project `vscode`, in
  [`apps/vscode/test-smoke/`](apps/vscode/test-smoke)) packs the extension as the release does
  (`vsce package --no-dependencies`), unpacks the VSIX outside the repository and runs the shell's
  `runVsCodeSmoke` on it: open, the default palette edit, save (`parseDocumentText`, one more
  context, canonical text), undo and VS Code's four default themes, screenshots in
  `test-results/vscode-smoke/`. No retry: the driver (since 0.3.2) reads the save only once the
  tab is clean and the file holds still, so a failed save check is the extension's, not a race; the
  driver's failures are a soft assertion, so another step's failure cannot hide the save's. A
  theme switch VS Code missed is retried by the driver (since 0.4.1: the setting written again,
  then a detour through another theme), so the test needs no retry of its own. Opt-in
  (needs a display, downloads VS Code once); the release smokes the very VSIX it publishes
  (`VSCODE_SMOKE_VSIX`), and when CI runs it is in the suite's
  [docs/ci-and-releases.md](../../docs/ci-and-releases.md). Locally run
  `npm run context-maps test:vscode:docker` (the shell's `modeler-shell-vscode-docker`: the same
  test in a Linux container, no window, no focus taken; `-- --env VSCODE_SMOKE_KEEP=1` brings VS
  Code's logs back into `test-results/vscode-smoke/vscode-logs/`);
  `npm run context-maps test:vscode` opens a real VS Code window on macOS.

## Packages

The workspaces are `packages/*`, `apps/*` and `e2e` of this folder. Internal
`@miragon/context-maps-*` deps use the exact local workspace version as found in the workspace's
`package.json` (npm still links them to the local workspace).

Shared toolchain deps (`typescript`, `vitest`, `tsup`, `vite`, `playwright`) are pinned **once** in
the suite's root `package.json` and hoisted to the workspaces; don't re-add them to workspace
manifests. `vite` is additionally listed in the root `overrides` so transitive copies (vitest,
plugins) resolve to the same version; keep the two entries identical. The vscode app pins its own `esbuild` (its
bundler), separate from the `esbuild` that tsup brings along. That is intentional, don't unify. The
vscode app also pins `playwright-core` and `@vscode/test-electron`, the optional peers of the shell's
VS Code smoke driver; keep `playwright-core` equal to the root `playwright`.

| Package                              | Purpose                                                                      | DOM |
| ------------------------------------ | ---------------------------------------------------------------------------- | --- |
| `@miragon/context-maps-schema-model` | Types, the notation spec, Zod validation, migrations, JSON serialization     | no  |
| `@miragon/context-maps-cml`          | Context Mapper CML ↔ document (parse and serialize)                          | no  |
| `@miragon/context-maps-renderer`     | diagram-js viewer/modeler, the collaborative-modeler contract, import/export | yes |
| `apps/webapp`                        | Vite demo editor on the modeler shell (web host)                             | yes |
| `apps/vscode`                        | VS Code extension: custom editors for `.cm`/`.cm.json` and `*.cm.png`        | yes |

**P1, the DOM boundary:** the DOM-free packages (`schema-model`, `cml`) must **never** import
`diagram-js`/DOM libraries (`tiny-svg`, `min-dom`) or use the DOM (`window`/`document`). Enforced
twice, by ESLint (`no-restricted-imports`/`no-restricted-globals`) **and** `dependency-cruiser`, so a
violating import fails `npm run context-maps lint` and `npm run context-maps depcruise`.

## Commands

- `npm run context-maps build`: packages (schema-model, cml, then renderer) ·
  `npm run context-maps build:webapp` (then `npm run check:build -w modelers/context-maps/apps/webapp`:
  mode markup and licence comment in the bundle) · `npm run context-maps build:vscode`
- `npm run context-maps dev:webapp` (alias: `npm run context-maps dev`) serves the webapp via
  [Portless](https://portless.sh) at a stable per-worktree
  `http://<worktree>.context-maps-modeler.localhost:8080` URL (Portless-derived from the git
  worktree; config in [`apps/webapp/portless.json`](apps/webapp/portless.json)). The `dev` script
  sets `PORTLESS_HTTPS=0 PORTLESS_PORT=8080`, so Portless runs plain HTTP on the non-privileged
  port 8080 and auto-starts, with no `sudo`/`service install` (needs Node ≥ 24.15; see
  [`CONTRIBUTING.md`](CONTRIBUTING.md)). `npm run context-maps dev:webapp:plain` for plain Vite on
  `:5181`. · `npm run context-maps dev:vscode`
- `npm run context-maps test`: Vitest (unit; includes the VS Code host against a `vscode` mock) ·
  `npm run context-maps test:browser`: renderer and the contract kit in Chromium ·
  `npm run context-maps test:e2e`: Playwright, the web app (`chromium`, `webkit`, port `E2E_PORT`,
  default 5180) and the VS Code webview (`vscode-webview`, port `E2E_WEBVIEW_PORT`, default 5190) ·
  `npm run context-maps test:vscode:docker`: the packaged extension in a real VS Code inside
  Docker, without a window (the local way; `-- --env VSCODE_VERSION=1.96.0` picks the version) ·
  `npm run context-maps test:vscode`: the same on the host, for CI (Linux under `xvfb-run -a`)
  and for a visible window on macOS (`VSCODE_VERSION` picks the version; see
  [`CONTRIBUTING.md`](CONTRIBUTING.md))
- `npm run notices -w modelers/context-maps/apps/vscode`: regenerate
  `apps/vscode/THIRD_PARTY_NOTICES.md` (a unit test fails when it is stale)
- `npm run context-maps typecheck` · `npm run context-maps lint` (ESLint + typecheck)
- `npm run context-maps format`: Prettier · `npm run context-maps depcruise`: check the module
  graph

The packages are consumed from **source** (Vite/esbuild/tsconfig aliases), so neither the apps nor
the tests need a prior package build; `npm run context-maps build` is for publishing the libraries.
How the packages and the extension (`miragon-gmbh.context-maps-modeler`) are released is in the
suite's [docs/ci-and-releases.md](../../docs/ci-and-releases.md).

## Conventions

- Keep the core package (`schema-model`) strictly DOM-free (P1, above).
- JSON serialization must stay deterministic (sorted, rounded, version-stamped) so diffs and share
  URLs stay stable.
- Pins follow the suite's rule, internal workspace deps included (use the current local workspace
  version). See
  [`.claude/rules/package-json-fixed-versions.md`](.claude/rules/package-json-fixed-versions.md).
  The exception is `peerDependencies`: the libraries a host shares (`zod`, `diagram-js`, `didi`,
  `tiny-svg`) are caret-ranged peers, mirrored by exact devDependencies and pinned exactly by the
  apps. [`peer-dependencies.test.ts`](packages/renderer/test/peer-dependencies.test.ts) checks that
  every range admits its devDependency, the apps' pins and what the other peers require.
- Contributor notes for this modeler in [`CONTRIBUTING.md`](CONTRIBUTING.md).
