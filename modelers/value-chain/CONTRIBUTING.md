# Contributing to the Value Chain Modeler

The modeler lives in `modelers/value-chain` of the Miragon modeler suite. Setup, scripts, the
pre-commit hook, tests in general, commits and pull requests are in the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md), CI and releases in
[docs/ci-and-releases.md](../../docs/ci-and-releases.md). This file adds what is special to this
modeler. AI agents: start with [`CLAUDE.md`](CLAUDE.md).

## Packages

| Package                                                                | Purpose                                                          | DOM |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- | --- |
| [`@miragon/value-chain-schema-model`](packages/schema-model/README.md) | Metamodel, Zod validation, migrations, stable JSON serialization | no  |
| [`@miragon/value-chain-renderer`](packages/renderer/README.md)         | diagram-js viewer/modeler, chevron renderer, import/export, CSS  | yes |
| `apps/webapp`                                                          | Vite editor app on the shell's web host                          | yes |
| [`apps/vscode`](apps/vscode/README.md)                                 | VS Code extension: custom editor for `*.vc` / `*.vc.json`        | yes |
| `e2e`                                                                  | Playwright: the web app and the VS Code webview                  | yes |

The renderer implements [`@miragon/modeler-api`](../../packages/api/README.md); both apps run in
[`@miragon/modeler-shell`](../../packages/shell/README.md). `npm run value-chain dev:webapp` serves
the editor at http://localhost:5181. Debug the extension with the "Run Value Chain VS Code
extension" launch configuration.

## Inner loop

```bash
npm run build:shared          # once, and after changing packages/api or packages/shell
npm run value-chain build     # tests resolve the workspace packages from dist
npm run value-chain test
npm run value-chain lint      # what the pre-commit hook runs
```

`schema-model` is DOM-free (P1, enforced by ESLint and dependency-cruiser); its JSON serialization
stays deterministic (sorted ids and keys, 3-decimal rounding).

## Browser and e2e tests

`test:browser` runs the renderer in Chromium with the `@miragon/modeler-api` conformance kit.
`test:e2e` has three Playwright projects:

- `webapp` (`E2E_PORT`, default 5181): the shell's conformance kit on the web host and the app's
  own chrome handlers.
- `vscode-webview` (`E2E_WEBVIEW_PORT`, default 5191): the kit on the IDE host, `csp` against the
  production bundle. With `?host` the page also runs the extension's document plumbing
  (`registerModelerEditor` with `DIAGRAM_EDITOR_OPTIONS`), which `document-sync.spec.ts` uses to
  sync canvas and document both ways.
- `webapp-webkit`: `webapp-share.spec.ts` (Share calls `clipboard.write` with a promised
  ClipboardItem inside the click, as Safari requires) and `webapp-focus-hand-back.spec.ts` (canvas
  keys act right after clicks on zoom or Share, and after the menu dialog closes). The focus spec
  blurs clicked buttons as Safari does (`tests/support/safari.ts`).

Run `npx playwright install chromium webkit` once. Keep `playwright` (root), `@playwright/test`
(`e2e`) and `playwright-core` (`apps/vscode`) on one version: `pin-check` fails otherwise.

## VS Code smoke test

How it works for every modeler, with its variables and the Docker runner, is in the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md#tests). Here it opens `example/porter.vc.json`, checks
the chrome, creates a step from the palette, saves (the file must pass `parseDocumentJSON`),
undoes and switches through the four default themes. Locally run
`npm run value-chain test:vscode:docker`; flags go to the workspace, e.g.
`npm run test:vscode:docker -w @miragon/value-chain-modeler-workspace -- --env VSCODE_VERSION=1.96.0`.

## Design tokens

To update the vendored files in `packages/renderer/src/theme/`, copy the three files again, put the
vendoring header (with the new design-system version) back on both CSS files and update the
release and sha256 values in `theme.sync.test.ts` (hashed without the header). When a dependency of
the VS Code extension changes, run `npm run notices -w modelers/value-chain/apps/vscode` and commit
`THIRD_PARTY_NOTICES.md`.

## Pull requests

Gates: `lint`, `test`, `depcruise`, `build`; for a web app change also `build:webapp` and
`npm run check:build -w modelers/value-chain/apps/webapp`; for an extension change
`test:vscode:docker`. Scope `value-chain`, e.g. `feat(value-chain): add a milestone element`. For
domain work use the skill in [`.claude/skills/value-chain-modeling/`](.claude/skills/value-chain-modeling/).
