# Contributing to the Value Chain Modeler

Thanks for contributing to the Value Chain Modeler! It lives in `modelers/value-chain` of the
Miragon modeler suite: setup, the scripts, the pre-commit hook, the commit and pull-request
conventions and how to report an issue are in the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md),
CI, Dependabot and releases in [docs/ci-and-releases.md](../../docs/ci-and-releases.md). This file
adds what is special to this modeler. AI agents: start with [`CLAUDE.md`](CLAUDE.md).

## Inner loop

From the repository root (or with `npm run <script>` inside `modelers/value-chain`):

```bash
npm run build:shared          # once, and after changing packages/api or packages/shell
npm run value-chain build     # builds packages/* (workspace deps resolve to dist: build before testing)
npm run value-chain test      # vitest run
npm run value-chain lint      # eslint . + type-check (what the pre-commit hook runs for this modeler)
```

Extras: `npm run value-chain dev:webapp` (editor at http://localhost:5181),
`npm run value-chain dev:vscode` (extension watch build), `npm run value-chain depcruise`
(module-graph rules), `npm run value-chain format`.

## Browser & e2e tests

- `npm run value-chain test:browser`: renderer integration tests in real Chromium (Vitest browser
  mode; jsdom lacks `getBBox`), the `@miragon/modeler-api` conformance kit included.
- `npm run value-chain test:e2e`: Playwright tests in `e2e/`, two projects with a dev server each:
  `webapp` (the web app, `E2E_PORT`, default 5181; it runs the `@miragon/modeler-shell`
  conformance kit on the web host and the app's own chrome handlers) and `vscode-webview` (the
  VS Code webview from source inside the shell's VS Code stub, `E2E_WEBVIEW_PORT`, default 5191;
  it runs the kit on the IDE host, whose `csp` case walks the production bundle behind the webview
  CSP). One project:
  `npm run value-chain test:e2e -- --project=vscode-webview`. Set both ports when another checkout
  already serves the defaults.

Both need Chromium: locally run `npx playwright install chromium` once. Bump `playwright` (the
suite's root `package.json`), `@playwright/test` (`e2e/package.json`) and `playwright-core`
(`apps/vscode/package.json`) together: `pin-check` fails when they disagree.

## VS Code smoke test

`npm run value-chain test:vscode` packages the extension as the release does (`vsce package
--no-dependencies`, which runs `vscode:prepublish`), unpacks the VSIX and starts it in a real
VS Code through `runVsCodeSmoke` of `@miragon/modeler-shell/testing/vscode-electron` (how it works
for every modeler is in the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md#tests)). It opens
`example/porter.vc.json` in the diagram editor, checks the chrome, creates a step from the
palette, saves (the file must pass `parseDocumentJSON`), undoes, and switches through VS Code's
four default themes with a screenshot each in `test-results/vscode-smoke/` (gitignored). It is
not part of `npm test`: it needs a display and downloads VS Code. It runs on the unpacked VSIX,
not on `apps/vscode`, because only there a module the bundle requires but does not contain fails
as it does for users. With `VSCODE_SMOKE_VSIX` set to a `.vsix` file it tests that file instead of
packing one; the release does so with the VSIX it is about to publish. With `VSCODE_SMOKE_KEEP=1`
it keeps VS Code's profile and prints where, so VS Code's logs of a failed run can be read (in
Docker, `npm run value-chain test:vscode:docker -- --env VSCODE_SMOKE_KEEP=1` brings them back
into `test-results/vscode-smoke/vscode-logs/`).

- **Locally, without a window:** `npm run value-chain test:vscode:docker` runs the same test in a
  Linux container under `xvfb-run -a`, through `modeler-shell-vscode-docker` of
  `@miragon/modeler-shell`, so no VS Code window opens and nothing takes the focus. It needs Docker
  and no build. Variables go in only with `--env`, as in
  `npm run value-chain test:vscode:docker -- --env VSCODE_VERSION=1.96.0`; `--env` without a value
  passes on the value set on the host:
  `VSCODE_VERSION=1.96.0 npm run value-chain test:vscode:docker -- --env VSCODE_VERSION`. A
  variable set in front of `npm` alone stays on the host: the test then runs the newest VS Code
  and passes without a warning. The log shows the container's paths (`/work/…`) and, as Vitest
  finds no AI agent there, the whole log of a passing test, so the command needs no reporter flag
  (it rejects `--reporter=default` as an unknown option).
- **macOS, with the window:** `npm run value-chain test:vscode` (no build needed, the extension
  bundles the packages from source; `unzip` comes with macOS). A VS Code window opens for a few
  seconds and takes the focus; later runs take about 5 s. `VSCODE_VERSION=1.96.0` tests another
  VS Code release, such as the `engines.vscode` floor; without it the newest stable release runs.
  Run from an AI agent, add `-- --reporter=default`: Vitest's agent reporter hides the log of a
  passing test, VS Code's version and the timings included.
- **Linux:** VS Code needs an X server, `xvfb-run -a npm run value-chain test:vscode`.

The test runs once, without a retry. Since `@miragon/modeler-shell` 0.3.2 the save step waits until
the editor tab is clean and two reads of the file agree before it parses the saved text, so it no
longer sees the file VS Code has emptied but not yet written; a save that writes broken JSON fails.
Since 0.4.1 the driver writes a theme again, or switches through another theme and back, when VS
Code kept the previous one, all within one timeout; a theme that still fails names the theme
requested and the one VS Code shows.

## Design tokens

`packages/renderer/src/theme/` vendors `cd-tokens.generated.css`, `cd-tokens.generated.json` and
`cd-canvas.css` from the `miragon-brand:modeler-tool-design` skill (Miragon/corporate-identity)
unchanged. To update, copy the three files again, put the vendoring header (with the new design
system version) back on top of the two CSS files, and adjust `theme.sync.test.ts`; never edit
their values. When a dependency of the VS Code extension changes, run
`npm run notices -w modelers/value-chain/apps/vscode` and commit `THIRD_PARTY_NOTICES.md`.

## Monorepo map & the DOM boundary (P1)

| Package                             | Purpose                                                          | DOM |
| ----------------------------------- | ---------------------------------------------------------------- | --- |
| `@miragon/value-chain-schema-model` | Metamodel, Zod validation, migrations, stable JSON serialization | no  |
| `@miragon/value-chain-renderer`     | diagram-js viewer/modeler, chevron renderer, import/export, CSS  | yes |
| `apps/webapp`                       | Vite editor app on the shell's web host                          | yes |
| `apps/vscode`                       | VS Code extension: custom editor for `*.vc` / `*.vc.json`        | yes |
| `e2e`                               | Playwright: the webapp and the VS Code webview                   | yes |

`schema-model` must never import diagram-js/`tiny-svg`/`min-dom` or use `window`/`document`,
enforced by both ESLint and dependency-cruiser. JSON serialization must stay deterministic
(sorted ids, sorted keys, 3-decimal rounding).

## Pull requests

Keep PRs small and focused. Local gates before opening one: `npm run value-chain lint`,
`npm run value-chain test`, `npm run value-chain depcruise`, `npm run value-chain build`, for a
web app change `npm run value-chain build:webapp` with
`npm run check:build -w modelers/value-chain/apps/webapp`, and for an extension change
`npm run value-chain test:vscode:docker` (or `npm run value-chain test:vscode`). Commit scope
`value-chain`, e.g. `feat(value-chain): add a milestone element`. For value-chain domain work, use
the skill in [`.claude/skills/value-chain-modeling/`](.claude/skills/value-chain-modeling/).
