# Contributing to the Team Topologies Modeler

Thanks for helping improve the Team Topologies Modeler. It lives in `modelers/team-topologies` of
the Miragon modeler suite: setup, the scripts, the pre-commit hook, the commit and pull-request
conventions (breaking changes included) and how to report an issue are in the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md), CI and releases in
[docs/ci-and-releases.md](../../docs/ci-and-releases.md). This file adds what is special to this
modeler. Agent-oriented notes live in [`CLAUDE.md`](CLAUDE.md).

## Inner loop

From the repository root (or with `npm run <script>` inside `modelers/team-topologies`):

```bash
npm run build:shared              # once, and after changing packages/api or packages/shell
npm run team-topologies test      # vitest run (unit; the packages come from source)
npm run team-topologies lint      # eslint . + type-check (what the pre-commit hook runs for this modeler)
npm run team-topologies build     # builds packages/* (only needed to publish the libs)
```

Useful extras: `npm run team-topologies dev:webapp`, `npm run team-topologies dev:vscode`,
`npm run team-topologies depcruise` (module-graph check), `npm run team-topologies format`
(Prettier).

### Named local URL via Portless

`npm run team-topologies dev:webapp` (and `npm run team-topologies dev`) serves the webapp through
Portless at `https://<worktree>.team-topologies-modeler.localhost` in a linked worktree and
`https://team-topologies-modeler.localhost` in the main checkout (needs **Node ≥ 24** and the
one-time setup in the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md#dev-servers)). Config lives
in [`apps/webapp/portless.json`](apps/webapp/portless.json)
(`{ "name": "team-topologies-modeler", "script": "dev:app" }`): `dev:webapp` runs bare `portless`,
which starts the real Vite server (the `dev:app` script) behind the proxy. `dev:app` binds
`--host 127.0.0.1` (Portless can't proxy the IPv6 `::1` that `localhost` resolves to on macOS) and
`--port ${PORT}` (the ephemeral port Portless injects), and `vite.config.ts` sets
`allowedHosts: ['.localhost']` so Vite accepts the proxied Host header.

Prefer a plain Vite server with no proxy? `npm run team-topologies dev:webapp:plain` runs Vite
directly on `:5181` and needs none of the above.

## Browser & e2e tests

`npm run team-topologies test:browser` (Vitest browser mode) runs the renderer's integration tests
and the `@miragon/modeler-api` conformance kit in Chromium. `npm run team-topologies test:e2e`
(Playwright, in `e2e/`) has four projects:

| Project                 | What                                                                    | Server, port                              |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| `webapp`                | the web app, with the shell's kit on the web host                       | `apps/webapp` dev server, `E2E_PORT` 5180 |
| `vscode-webview`        | the VS Code webview in the shell's VS Code stub, with the shell's kit   | `e2e/webview/`, `E2E_WEBVIEW_PORT` 5190   |
| `webapp-webkit`         | the web app in Safari's engine, only the focus hand-back cases          | the `webapp` server                       |
| `vscode-webview-webkit` | the webview in Safari's engine (vscode.dev in Safari), only those cases | the `vscode-webview` server               |

Run one project with `npm run test:e2e -w modelers/team-topologies/e2e -- --project=vscode-webview`,
and only the tests whose title matches with `-- --grep "<title>"`; the alias
`npm run team-topologies` cannot pass Playwright's flags on (see the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md#scripts)). Set both ports when several worktrees run the
suite at once
(`E2E_PORT=6301 E2E_WEBVIEW_PORT=6311 npm run team-topologies test:e2e`). In the `vscode-webview`
project the kit's `csp` case walks the production bundle behind the webview CSP. With `?host` the
test page runs the extension's document plumbing too (`registerModelerEditor` with
`DIAGRAM_EDITOR_OPTIONS` and the pill's counts of `documentProblems`) against the shell's stand-in
for VS Code's documents, so `document-sync.spec.ts` renames a team and reads the document (also a
read-only one, which refuses the edit), and changes or undoes the document and reads the canvas and
the pill. The WebKit projects run only `focus-hand-back.spec.ts`: Safari does not focus a clicked button, so there every
control has to hand the focus to the canvas without having held it. Locally, run
`npx playwright install chromium webkit` once. Keep `playwright-core` and the e2e workspace's
`@playwright/test` on the root `playwright` version.

### The extension in a real VS Code

`npm run team-topologies test:vscode` (the Vitest project `vscode`,
[`apps/vscode/test-smoke/`](apps/vscode/test-smoke/vscode-smoke.test.ts)) runs the extension the way
it ships in a real VS Code, driven by `@miragon/modeler-shell/testing/vscode-electron` (how it works
for every modeler, locally and in Docker, is in the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md#tests)): it packs the VSIX like the release
(`vsce package`, which runs `vscode:prepublish`, the production build, into `apps/vscode/dist`),
unpacks it, checks that the package holds every file the webview loads (bundle, stylesheet, fonts),
starts the newest stable VS Code with it on a throwaway profile (or the version in
`VSCODE_VERSION`: `stable`, `insiders` or a number like `1.96.0`), opens a small diagram
([`checkout.tt`](apps/vscode/test-smoke/checkout.tt)) in the custom editor and waits until the
canvas shows it with the stylesheet applied, creates a team from the palette by keyboard, types its
name into the inspector and saves right after typing (the save has to commit the field's draft),
presses `Ctrl/Cmd+Z` in the field (it takes back the typing there and leaves the saved file alone),
creates a second team, saves (once the tab is clean and the file on disk holds still, it must pass
the Problems view's check and hold the typed name), undoes the three edits from the canvas (the
canvas and, saved again, the file return to the fixture) and switches through VS Code's four
default themes, with a screenshot each in `test-results/vscode-smoke/` (gitignored). It is not part
of `npm test`: it needs a display and the VS Code download.

```bash
# in Docker, no window: the local way
npm run team-topologies test:vscode:docker
# the oldest VS Code engines.vscode admits
npm run test:vscode:docker -w @miragon/team-topologies-modeler-workspace -- --env VSCODE_VERSION=1.96.0
# brings VS Code's logs back
npm run test:vscode:docker -w @miragon/team-topologies-modeler-workspace -- --env VSCODE_SMOKE_KEEP=1
# on the host, with a window
npm run team-topologies test:vscode
```

The `--env` flags go to the modeler's workspace by its name: the alias `npm run team-topologies`
would take them for npm's own, and the path `modelers/team-topologies` would select the workspaces
beneath it too (see the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md#scripts)).

This modeler's `package.json` declares `@miragon/modeler-shell` itself, at the workspaces' exact
version, so the Docker command's bin resolves for its scripts whatever npm hoists; bump the pins
together. A file missing from the package fails the test before VS Code starts, with its path. Any
other failure names its step (`open`, `edit`, `save`, `undo`, `themes`, …) in the test's output. To
read VS Code's own logs, run it again with `VSCODE_SMOKE_KEEP=1`: the test keeps VS Code's profile
and logs where it is (in Docker, the logs come back in `test-results/vscode-smoke/vscode-logs/`).
The VSIX bundles the packages from source and the lockfile's resolved versions, so a change in
`packages/**`, any `package.json` or the lockfile can break the extension as surely as one in
`apps/vscode`.

## Breaking changes

The rules for breaking changes in a squash-merged pull request (one `BREAKING CHANGE:` footer per
conventional-commit message, the `BEGIN_COMMIT_OVERRIDE` block, no `!` inside it) are in the
suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md#commits-and-pull-requests); 0.11.0 and 0.12.0 of
this modeler each lost a breaking change by breaking them.

`npm run team-topologies check:release-notes -- <number>` hands a pull request's squash commit and
its block to release-please's own parser and fails, naming every breaking change that would be
lost. Its tests in [`scripts/release-notes/`](scripts/release-notes/) also run release-please
offline, on this modeler's release config, against the squash commits of #122 and #129. The parser
comes from the `release-please` devDependency, at the version the Release workflow's action bundles
(17.6.0 in release-please-action v5.0.0); move the two together. Dependabot leaves the
devDependency alone, and [`parser-version.test.ts`](scripts/release-notes/parser-version.test.ts)
fails when the action's pin moves without it. Whether CI runs the check on every pull request is in
[docs/ci-and-releases.md](../../docs/ci-and-releases.md).

## Monorepo map & the DOM boundary (P1)

| Package                                 | Purpose                                                                           | DOM      |
| --------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| `@miragon/team-topologies-schema-model` | Types, notation spec, Zod validation, serialization                               | DOM-free |
| `@miragon/team-topologies-renderer`     | diagram-js bootstrap, renderer, viewer, import/export, menu, legend rows, dialogs | DOM      |
| `@miragon/team-topologies-ui` (private) | The React inspector for the chrome's inspector slot                               | DOM      |
| `apps/webapp`                           | Vite demo editor on the modeler shell's web host                                  | DOM      |
| `apps/vscode`                           | VS Code custom editor for `.tt`/`.ttm.json`                                       | DOM      |

**P1, the DOM boundary:** the DOM-free package (`schema-model`) must **never** import
`diagram-js`/DOM libraries (`tiny-svg`, `min-dom`) or use the DOM (`window`/`document`). This is
enforced twice, by ESLint (`no-restricted-imports`/`no-restricted-globals`) **and** by
dependency-cruiser, so a violating import fails `npm run team-topologies lint` and
`npm run team-topologies depcruise`.

Also keep JSON serialization deterministic.

## Pull requests

- Make sure the local gates are green: `npm run team-topologies lint`,
  `npm run team-topologies test`, `npm run team-topologies depcruise`,
  `npm run team-topologies build`.
- Commit scope `team-topologies`, e.g. `feat(team-topologies): add a flow-of-change decorator`,
  `fix(team-topologies): keep colours on the migration round-trip`.
- More than one breaking change? End the description with a `BEGIN_COMMIT_OVERRIDE` block (see
  [Breaking changes](#breaking-changes)); `check:release-notes` tells you when it is missing.
