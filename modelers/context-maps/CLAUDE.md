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
**`miragon-brand:modeler-tool-design`** Claude skill (design system **1.27.0**; see the suite's
[`CLAUDE.md`](../../CLAUDE.md#design-system-mandatory)). Here:

Its files are **vendored unchanged** in [`packages/renderer/src/theme/`](packages/renderer/src/theme):
`cd-tokens.generated.css`, `cd-tokens.generated.json` and `cd-canvas.css` (the token files are the same bytes from
1.12.0 to 1.27.0, `cd-canvas.css` changed in 1.27.0). Never edit them, re-copy them from the skill's `assets/`. [`assets/context-maps.css`](packages/renderer/src/assets/context-maps.css)
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
  [`@miragon/modeler-api`](../../packages/api/README.md) (1.5):
  `createCollaborativeModeler` / `createCollaborativeViewer` in
  [`packages/renderer/src/collaborative/`](packages/renderer/src/collaborative), the text lane being
  the canonical JSON of a `.cm` file (`serializeDocumentText`, ends in one line break). Its
  conformance kit runs in `npm run context-maps test:browser`
  ([`conformance.browser.test.ts`](packages/renderer/test/browser/conformance.browser.test.ts)) with
  every hook filled; a skip or an advisory fails it. Imports are silent (the history goes without an
  event), reject without a trace and keep unknown keys. They reject a newer version (checked
  first), reserved and repeated ids, coordinates and sizes beyond `MAX_COORDINATE`, and objects
  and arrays nested more than `MAX_NESTING_DEPTH` (100) levels deep, the document being the first
  level. An import cancels a running gesture first, as Escape does (`CmGestureCancel`; move,
  connect, lasso, palette and context-pad create, and a press below the drag threshold; the armed
  lasso tool waits for its next press and stays armed, and a pan of the canvas is no gesture and
  runs on), and so does `clear()`. The contract's `importText` called while a user action runs (a
  host echoing its own change from `onContentChanged`, or importing from `interaction.onChange`
  after Escape, or from `elements.onSelection` inside a delete, an undo or a redo or at a drag's
  start) waits until the action has finished with the steps it deferred, and its promise
  settles after that import (#248, #285, #305, #336); an import called while an earlier one still
  waits runs after it, so the imports keep their call order. `CmGestureCancel.whenActionEnded()`
  is the one wait: a drop until its release has run every listener, a step an action holds
  (`holdAction`: the subdomain-type menu of an append, the integration-roles menu after a toggle)
  until it has run, any other command, undo or redo from its `commandStack.execute` / `revert`
  until its handler has returned, and a drag's activation (diagram-js fires `drag.start`,
  deselects and fires the first `drag.move` in one call of `Dragging.move`) until every
  `drag.move` listener of that first move has run, at the latest a microtask later (the
  notation's `<prefix>.move` listeners follow; no host listener fires from them). The import that
  waited for the activation then ends the drag. A label or description commit at a press is such
  a command: the import runs once the press has returned and ends the drag the press started, as
  every accepted import ends a running gesture (contract L1). The import reopens the
  label editor (its element selected again) on the element with the same id, and the imports that
  waited for an action reopen those two menus there; a later import closes them. The `Modeler`'s
  own synchronous `importDocument` leaves the drop to finish instead. Pinned by
  [`import-cancels-gesture.test.ts`](packages/renderer/test/browser/import-cancels-gesture.test.ts)
  and
  [`import-waits-for-user-action.test.ts`](packages/renderer/test/browser/import-waits-for-user-action.test.ts).
  Both factories expose the 1.5 surfaces: `interaction` (true from a gesture's start, the first
  move past the threshold or a palette create's preview, until its drop or cancel; false for an
  armed tool and a pan; always false on the viewer) and `appearance` (`themes` is
  `CONTEXT_MAPS_THEMES`, `["light"]`, from `theme/themes.ts`, which both apps and the VS Code
  theme bridge re-export through their `src/themes.ts`; `set` writes `data-cd-theme` and
  `data-cd-kontrast="hoch"` on the diagram's container, which carries `color: var(--cd-ui-text)`
  so no colour of the page shows through). Pinned by
  [`contract-surfaces.test.ts`](packages/renderer/test/browser/contract-surfaces.test.ts), which
  checks them as the kit's 1.5 cases do.
  A host's view change (`setViewState`, a fit) never commits an open editor,
  `elements.bounds(id)` gives an element's live box and `contentBounds()` (also on every
  `CmBaseViewer`) the tight box around what the canvas draws: the contexts, wider where a team row
  or a type's name runs past one (`draw/contextLayout.ts` holds the geometry for the renderer and
  the box), and the relationships' waypoints, read from the model with text measured on a canvas,
  not from the SVG. The fit after an import centres it with the insets of `freeArea: { insets }` or
  with room for the renderer's own palette (also when only `{ center }` is given; a test pins
  both), and a browser test compares the box with the drawing at zoom 1.
- **Chrome.** Both apps mount [`@miragon/modeler-shell`](../../packages/shell/README.md)
  with the renderer's `themes` (`["light"]`): the VS Code webview on the `ide` host (menu, palette
  skin, zoom panel and keys, fit, legend slot, problems pill, status box, empty-file hint), the web
  app on the `web` host (the same plus File group, Share, legal line, toasts, problems list, start
  screen and drop zone; `index.html` gets the mode markup of `webHeadMarkup` from the Vite config). Neither app has a
  stylesheet or chrome markup of its own. `connectDiagramJs(shell, …, { modeler, isEmpty })` fits
  to the renderer's `contentBounds()`: the webview passes its contract instance, the web app its
  `Modeler`; neither computes bounds of its own. The renderer **never imports the shell** (ESLint
  and dependency-cruiser enforce it); it hands the chrome structurally typed parts: `contextMapMenu`,
  `contextMapShortcuts` (the groups of the "Keyboard shortcuts…" dialog as data),
  `createTitleDialog`, `renderLegend`, the `cmReadOnly` canvas lock,
  keyboard creation in the free area (`freeArea: { insets }`, handed unchanged to the palette as
  `cmPalette: { freeArea }`), `fitOnImport` and `undoRedoKeys: false` for hosts that own the
  history. `cmLegendModule` (closed at first on every canvas size; a host's `setOpen()` restores a
  stored state) and the renderer's own palette rules stay for hosts that embed the renderer without
  the shell. The DOM-free packages take only types from `@miragon/modeler-api`.
- **Shortcuts dialog and PNG export.** Both apps open the shell's dialog:
  `shell.showShortcutsDialog(contextMapShortcuts(shell, options))`, the web app with
  `{ fileKeys: true }` (Cmd/Ctrl+O and S). The shell puts its zoom and fit keys at the top of the
  View group and drops the renderer's own View rows for them. The renderer's
  `createShortcutsDialog` (with `ShortcutsDialog`, `ShortcutsDialogChrome` and the `.cm-shortcuts*`
  rules) is deprecated for hosts without the shell and goes in 0.9.0
  ([#261](https://github.com/Miragon/modeler-suite/issues/261)); `createTitleDialog` stays.
  Both apps rasterise the renderer's `saveSVG()` with `svgToPng` of
  `@miragon/modeler-shell/export`: 2×, on `MIRAGON.grau` (guide §10.7, `hell['--cd-ui-grund']`;
  `theme.sync.test.ts` pins it), Geist inside the image. The web app lets the shell read the page's
  Geist faces. The webview can't fetch its font files (the CSP has no `connect-src`), so
  `webview/io.ts` passes the five Geist subsets as `data:` URLs: esbuild inlines the `?dataurl`
  imports with the plugin in `esbuild.config.mjs`, the webview test page's Vite config
  (`e2e/webview/vite.config.ts`) with `?inline`, and `test/webviewBundle.test.ts` counts the five in
  the shipped bundle. When Geist can't be embedded the PNG still comes out, in the system font: the
  web app shows a warning toast, the webview sets `fontFallback` on its `export` and `pngResponse`
  messages and the host shows a warning notification (after the export, or after the save of a
  `.cm.png`). The webview's faces are data: URLs, so no request can be blocked to provoke the
  fallback there: the e2e cases break the page's `XMLSerializer` after `saveSVG`
  (`failFontEmbeddingOfNextExport`), and `webviewIo.test.ts` and `cmPngEditorProvider.test.ts` pin
  the flag and the notices. A rejection shows the app's own text, never the rejection's message (guide §2). The
  `.cm.png` editor's image goes through the same `svgToEmbeddedPng`, which inserts the map's tEXt
  chunk into the shell's PNG as before (`png.ts`).
- **Kit.** `e2e/` runs the shell's conformance kit against the real webview in the shell's VS Code
  stub (project `vscode-webview`, served from `e2e/webview/`; the inspector and `canvasMenuAction`
  are absent: VS Code's own File menu opens and saves, and the Model group holds only the "Map
  title…" dialog and the Legend checkbox) and against the web app (project `chromium`; the
  inspector and the invalid-file state are absent). Both feed the `labelEditor` hooks
  ([`e2e/tests/support/label-editor.ts`](e2e/tests/support/label-editor.ts): a double-click on a
  context, typed text; a commit shows as a changed map in the web app and as an `edit` message in
  the webview). Every case but the empty-file case opens the example; that case and appearance open
  the empty maps of `documents` (in the web app after "New diagram", in the webview also a file of
  zero bytes), and any skip fails the suite.
- The `.cm` editor's document plumbing is the shell's:
  [`mapEditor.ts`](apps/vscode/src/mapEditor.ts) registers it with `registerModelerEditor` of
  `@miragon/modeler-shell/vscode/extension` (sync, echo suppression, minimal line edits, undo
  through the document, "Insert example", the problems pill, a refused edit shown as the document
  again), handing it `withExampleInserted`, the findings of `problems.ts` (with its scanner for a
  text too deep for jsonc-parser) as `diagnostics.refresh` and `clear`, the export, and an
  `onDidOpen` that reports the panel to `ActivePanels`. The `.cm.png` editor
  (`CmPngEditorProvider.ts`, a binary custom document with its own undo, save and backup) stays
  outside the plumbing (#170), reports to the same `ActivePanels` and speaks the same messages.
  `ActivePanels`, not the registration's `runCommand` and `revealActiveDocument`, which know only
  the `.cm` editors, keeps one focus order over both editors: the commands reach the focused
  diagram of either, and Open Source to the Side passes over a PNG and opens nothing for a focused
  one. The webview's half is `connectDocumentSync`, whose `onMessage` answers the PNG editor's
  `requestPng` once the queued imports have settled. The options that need no `vscode` live in
  [`mapEditorOptions.ts`](apps/vscode/src/mapEditorOptions.ts), which the e2e page also registers
  against the shell's host stub (`?host`, `e2e/tests/vscode/document-sync.spec.ts`).
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
  test in a Linux container, no window, no focus taken; VS Code's logs come back into
  `test-results/vscode-smoke/vscode-logs/` with the flag given to the workspace, since the alias
  passes no flag on:
  `npm run test:vscode:docker -w @miragon/context-maps-modeler-workspace -- --env VSCODE_SMOKE_KEEP=1`);
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
  Docker, without a window (the local way; another version:
  `npm run test:vscode:docker -w @miragon/context-maps-modeler-workspace -- --env VSCODE_VERSION=1.96.0`)
  ·
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
