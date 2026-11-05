# Contributing to the Context Maps Modeler

Setup, scripts, dev servers, the pre-commit hook, the VS Code smoke driver and the commit
conventions are in the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md), CI and releases in
[docs/ci-and-releases.md](../../docs/ci-and-releases.md), agent notes in [`CLAUDE.md`](CLAUDE.md).
This file adds what is special to this modeler.

## Architecture

| Package                                           | Purpose                                                                          | DOM |
| ------------------------------------------------- | -------------------------------------------------------------------------------- | --- |
| [`schema-model`](packages/schema-model/README.md) | Types, the notation spec, Zod validation, migrations, deterministic JSON         | no  |
| [`cml`](packages/cml)                             | Context Mapper CML ↔ document                                                    | no  |
| [`renderer`](packages/renderer/README.md)         | diagram-js viewer/modeler, custom rendering, palette, context pad, import/export | yes |

The renderer implements the collaborative-modeler contract of
[`@miragon/modeler-api`](../../packages/api/README.md) and runs its conformance kit; both apps
mount the [`@miragon/modeler-shell`](../../packages/shell/README.md) chrome. The apps consume the
packages from TypeScript source (`vite.config.ts` aliases), so `build` is only needed to publish.
Serialisation is deterministic (sorted, rounded, fixed key order) for small diffs and stable share
URLs; everything imported is validated with Zod and migrated by `version`. The notation colours
live in [`notation.ts`](packages/schema-model/src/notation.ts), tuned for text 4.5:1 and lines 3:1;
a document stores only a context's own `fill` / `stroke`. `validateDocument()` checks thirteen
rules: ten from Context Mapper, two advisory warnings (a core domain should not conform, a shared
kernel should not span two teams) and at most one relationship per pair of contexts.

The web app's `src/main.ts` mounts the renderer's `Modeler` inside `mountShell(…, { host: "web",
themes: ["light"] })` and `connectDiagramJs`, with the map's parts from the renderer
(`contextMapMenu`, `contextMapShortcuts`, `createTitleDialog`, `renderLegend`); PNG export uses
`svgToPng` of `@miragon/modeler-shell/export`. On load a shared link (`#d=…`, LZ-compressed) wins
over the `localStorage` autosave, which wins over the start screen. It deploys to Netlify
([`netlify.toml`](netlify.toml)): `npm run build:webapp`, publish `apps/webapp/dist`, SPA
catch-all to `index.html`.

## Inner loop

```bash
npm run build:shared              # once, and after changing packages/api or packages/shell
npm run context-maps test         # unit tests; the packages come from source
npm run context-maps lint         # eslint + type-check (what the pre-commit hook runs)
npm run context-maps depcruise    # module-graph check
npm run context-maps build        # builds packages/* (only needed to publish)
npm run context-maps dev:webapp   # web app through Portless, see below
npm run context-maps dev:vscode   # watch-build the extension, then F5 in VS Code
npm run context-maps build:webapp # production build into apps/webapp/dist
```

`dev:webapp` serves the app through Portless at
`http://<worktree>.context-maps-modeler.localhost:8080` (`http://context-maps-modeler.localhost:8080`
in the main checkout). It sets `PORTLESS_HTTPS=0 PORTLESS_PORT=8080`, so it needs no `sudo`, no CA
trust and no `portless service install`, which lets a non-interactive Run button start it. The
config is [`apps/webapp/portless.json`](apps/webapp/portless.json); `dev:app` binds `127.0.0.1`
(Portless cannot proxy `::1`) on the injected `PORT`, and `vite.config.ts` allows `.localhost`
hosts. `dev:webapp:plain` runs Vite directly on `:5181`.

## Browser and e2e tests

`test:browser` runs the renderer's integration tests and the `@miragon/modeler-api` conformance kit
in Chromium. `test:e2e` (Playwright, `e2e/`) has three projects:

| Project          | What                                                    | Server, port                              |
| ---------------- | ------------------------------------------------------- | ----------------------------------------- |
| `chromium`       | the web app, with the shell's kit                       | `apps/webapp` dev server, `E2E_PORT` 5180 |
| `webkit`         | the web app in Safari's engine, without the shell's kit | the same                                  |
| `vscode-webview` | the VS Code webview in the shell's stub, with its kit   | `e2e/webview/`, `E2E_WEBVIEW_PORT` 5190   |

Pass Playwright flags to the workspace:
`npm run test:e2e -w modelers/context-maps/e2e -- --project=vscode-webview --grep "<title>"`. Set
both ports when another checkout uses the defaults (`E2E_PORT=6201 E2E_WEBVIEW_PORT=6211`). With
`?host` the webview page also runs the extension's document plumbing (`registerModelerEditor` with
`MAP_EDITOR_OPTIONS`), which `document-sync.spec.ts` uses. WebKit skips the shell's kit because its
Tab does not reach buttons and links by default. After `build:webapp`,
`npm run check:build -w modelers/context-maps/apps/webapp` checks the mode markup and the Lucide
licence comment in the bundle. Run `npx playwright install chromium webkit` once.

## VS Code smoke test

`test:vscode` packs the extension, opens `apps/vscode/test-smoke/fixtures/ordering.cm`, creates a
context through the palette's keyboard path, saves (the file must parse, hold one more context and
be canonical JSON), undoes, and screenshots VS Code's four default themes into
`test-results/vscode-smoke/`; the shell's driver then checks zoom, selection, redo/undo, reduced
motion, a hidden tab and a reload. Run it in Docker, not on your Mac:

```bash
npm run context-maps test:vscode:docker
npm run test:vscode:docker -w @miragon/context-maps-modeler-workspace -- --env VSCODE_VERSION=1.96.0
npm run test:vscode:docker -w @miragon/context-maps-modeler-workspace -- --env VSCODE_SMOKE_KEEP=1
```

Packing on the host rebuilds `apps/vscode/dist` in production mode; run `build:vscode` afterwards
for a debug build. `VSCODE_SMOKE_VSIX` tests a packed VSIX instead.

## Design tokens

Update `cd-tokens.generated.css`, `cd-tokens.generated.json` and `cd-canvas.css` in
`packages/renderer/src/theme/` as the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md#design-system) says: copy them unchanged, update the
hashes and release in `packages/renderer/test/theme.sync.test.ts` and `MIRAGON` in
`theme/palette.ts`, then run `npm run context-maps test`.

## Pull requests

Run `lint`, `test`, `depcruise` and `build` first. The DOM-free packages are `schema-model` and
`cml`. Commit scope `context-maps`, e.g. `feat(context-maps): add an OHS/PL integration-role
decorator`.
