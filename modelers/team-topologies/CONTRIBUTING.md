# Contributing to the Team Topologies Modeler

This modeler lives in `modelers/team-topologies` of the Miragon modeler suite. Setup, scripts, the
pre-commit hook, commit conventions (breaking changes included), the DOM boundary and CI are in the
suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md), [`CLAUDE.md`](../../CLAUDE.md) and
[docs/ci-and-releases.md](../../docs/ci-and-releases.md). This file adds what is special here;
agent notes are in [`CLAUDE.md`](CLAUDE.md).

## Layout

| Package                                 | Purpose                                                                     | DOM      |
| --------------------------------------- | --------------------------------------------------------------------------- | -------- |
| `@miragon/team-topologies-schema-model` | Types, notation spec, Zod validation, migrations, deterministic JSON        | DOM-free |
| `@miragon/team-topologies-renderer`     | diagram-js viewer/modeler, import/export, menu entries, legend rows, dialog | DOM      |
| `@miragon/team-topologies-ui` (private) | The React inspector for the chrome's inspector slot, shared by both apps    | DOM      |
| `apps/webapp`                           | Vite editor on the modeler shell's web host, deployed on Netlify            | DOM      |
| `apps/vscode`                           | VS Code custom editor for `.tt` / `.ttm.json`                               | DOM      |

`schema-model` compiles without the DOM lib. The apps and tests consume the packages from their
TypeScript source through aliases, so `build` is only needed to publish the libraries. Files are
serialised deterministically (sorted, rounded, fixed key order) and every import is validated with
Zod and migrated by document `version`.

## Inner loop

```bash
npm run build:shared              # once, and after changing packages/api or packages/shell
npm run team-topologies test      # the packages come from source
npm run team-topologies lint      # what the pre-commit hook runs
npm run team-topologies depcruise
npm run team-topologies dev:vscode   # watch build, then F5 in VS Code
```

`dev:webapp` serves the web app through Portless at
`https://<worktree>.team-topologies-modeler.localhost` (or
`https://team-topologies-modeler.localhost`; needs Node 24 or later and the one-time setup in the
suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md#dev-servers)). Its `dev:app` script binds
`--host 127.0.0.1 --port ${PORT}` (Portless cannot proxy `::1`), and `vite.config.ts` allows
`.localhost` hosts. `dev:webapp:plain` runs Vite directly on `:5181`.

`build:webapp` builds what Netlify ships ([`netlify.toml`](netlify.toml): publish
`apps/webapp/dist`, Node 22, SPA redirect); `npm run check:build -w modelers/team-topologies/apps/webapp`
checks what it ships.

## Browser & e2e tests

`test:browser` runs the renderer's integration tests and the `@miragon/modeler-api` conformance kit
in Chromium. `test:e2e` (Playwright, `e2e/`; `npx playwright install chromium webkit` once) has four
projects:

| Project                 | What                                                                    | Server, port                              |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| `webapp`                | the web app, with the shell's kit on the web host                       | `apps/webapp` dev server, `E2E_PORT` 5180 |
| `vscode-webview`        | the VS Code webview in the shell's VS Code stub, with the shell's kit   | `e2e/webview/`, `E2E_WEBVIEW_PORT` 5190   |
| `webapp-webkit`         | the web app in Safari's engine, only the focus hand-back cases          | the `webapp` server                       |
| `vscode-webview-webkit` | the webview in Safari's engine (vscode.dev in Safari), only those cases | the `vscode-webview` server               |

In `vscode-webview` the kit's `csp` case walks the production bundle. With `?host` the page also
runs `registerModelerEditor` with `DIAGRAM_EDITOR_OPTIONS` and the pill counts of
`documentProblems`, so `document-sync.spec.ts` checks edits in both directions, a read-only
document and the pill. The WebKit projects run only `focus-hand-back.spec.ts`, since Safari does
not focus a clicked button.

Pass Playwright flags to the workspace:
`npm run test:e2e -w modelers/team-topologies/e2e -- --project=vscode-webview --grep "<title>"`.
For parallel worktrees: `E2E_PORT=6301 E2E_WEBVIEW_PORT=6311 npm run team-topologies test:e2e`.

### The extension in a real VS Code

`npm run team-topologies test:vscode:docker` runs
[`apps/vscode/test-smoke/`](apps/vscode/test-smoke/vscode-smoke.test.ts) with the packed VSIX in a
real VS Code in a container (how it works for every modeler: the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md#tests)). It checks that the package holds every file the
webview loads, opens [`checkout.tt`](apps/vscode/test-smoke/checkout.tt), creates a team by
keyboard, types its name into the inspector and saves at once (the save must commit the draft),
checks that `Ctrl/Cmd+Z` in the field leaves the file alone, creates a second team, saves, undoes
everything from the canvas and screenshots the four default themes into
`test-results/vscode-smoke/`.

```bash
npm run test:vscode:docker -w @miragon/team-topologies-modeler-workspace -- --env VSCODE_VERSION=1.96.0
npm run test:vscode:docker -w @miragon/team-topologies-modeler-workspace -- --env VSCODE_SMOKE_KEEP=1
```

A failure names its step (`open`, `edit`, `save`, `undo`, `themes`, …); `VSCODE_SMOKE_KEEP=1` brings
VS Code's logs back in `test-results/vscode-smoke/vscode-logs/`. Never run the host variant
`test:vscode` on a Mac: its window takes the focus. This modeler's `package.json` declares
`@miragon/modeler-shell` itself at the workspaces' exact version, so the Docker bin resolves; bump
the pins together. The VSIX bundles the packages from source, so changes in `packages/**`, any
`package.json` or the lockfile can break the extension too.

## Breaking changes

The rules are in the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md#commits-and-pull-requests);
0.11.0 and 0.12.0 of this modeler each lost a breaking change by breaking them.
`npm run check:release-notes -- <number>` (from the root) runs release-please's own parser on a
pull request's squash commit and names every breaking change that would be lost. The check lives in
[`.github/scripts/release-notes/`](../../.github/scripts/release-notes/), since it reads any pull
request of the suite; its tests in [`test/release-notes/`](../../test/release-notes/) replay #122
and #129 offline.

## Pull requests

- Green locally: `lint`, `test`, `depcruise`, `build`.
- Commit scope `team-topologies`, e.g. `fix(team-topologies): keep colours on the migration round-trip`.
- More than one breaking change? End the description with a `BEGIN_COMMIT_OVERRIDE` block (see
  [Breaking changes](#breaking-changes)).
