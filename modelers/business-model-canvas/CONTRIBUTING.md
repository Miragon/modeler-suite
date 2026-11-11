# Contributing to the Business Model Canvas Modeler

The modeler lives in `modelers/business-model-canvas` of the Miragon modeler suite. Setup, scripts,
the pre-commit hook, tests in general, commits and pull requests are in the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md), CI and releases in
[docs/ci-and-releases.md](../../docs/ci-and-releases.md). This file adds what is special to this
modeler. AI agents: start with [`CLAUDE.md`](CLAUDE.md).

## Packages

| Package                                           | Purpose                                                  | DOM |
| ------------------------------------------------- | -------------------------------------------------------- | --- |
| [`schema-model`](packages/schema-model/README.md) | Document model, validation, pure edits, layout, colours  | no  |
| [`dsl`](packages/dsl/README.md)                   | The `.bmc` parser and serializer                         | no  |
| [`renderer`](packages/renderer/README.md)         | diagram-js viewer and modeler, contract factories, CSS   | yes |
| `apps/ide-editor`                                 | The editor the VS Code webview and the Orca plugin mount | yes |
| [`apps/vscode`](apps/vscode/README.md)            | VS Code extension: custom editor for `*.bmc`             | yes |
| [`apps/orca`](apps/orca/README.md)                | Orca plugin: the same editor in Orca                     | yes |
| `apps/webapp`                                     | Vite web app on the shell's web host                     | yes |
| `e2e`                                             | Playwright: web app, VS Code webview, Orca editor        | yes |

Every workspace is private and nothing goes to npm. The packages export their source, so there is
nothing to build before the unit tests.

## Inner loop

```bash
npm run build:shared                    # once, and after changing packages/api or packages/shell
npm run business-model-canvas test
npm run business-model-canvas lint      # what the pre-commit hook runs
npm run business-model-canvas dev:webapp  # http://localhost:5183
```

`schema-model` and `dsl` are DOM-free (P1, enforced by ESLint and dependency-cruiser). Keep the
round trip lossless: a canonical `.bmc` text serializes back byte for byte, and every field the
parser does not know comes back, after the known ones. Comments are the one thing it loses:
the parser warns about each, and a remark belongs in a note. A new case belongs in
`packages/dsl/test/round-trip.test.ts`.

## Browser and e2e tests

`test:browser` runs the renderer in Chromium with the `@miragon/modeler-api` conformance kit
(`packages/renderer/test/browser/conformance.browser.test.ts`) and the canvas's own behaviour
(`canvas.browser.test.ts`). `test:e2e` has the projects `webapp`, `webapp-webkit`,
`vscode-webview` and `orca-editor`. Run `npx playwright install chromium webkit` once.

## VS Code and Orca smoke tests

How they work for every modeler is in the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md#tests).
Here they open `example/miragon.bmc`. Locally run `npm run business-model-canvas test:vscode:docker`
(never `test:vscode` on macOS, its window takes the focus) and
`npm run business-model-canvas test:orca:docker`. Building and loading the Orca plugin is in the
suite's [Orca plugins](../../CONTRIBUTING.md#orca-plugins). Its app icon is the Miragon Komet on
blue until the Miragon modeler icon set has a Business Model Canvas icon.

The VS Code and Orca store images come from the suite's
[Store images](../../CONTRIBUTING.md#store-images) (`business-model-canvas-vscode` and
`business-model-canvas-orca` in `.miragon/product-shots.yaml`); the VS Code ones show
`docs/demo/bike-subscription.bmc`. The README's `docs/screenshots/web/demo.png` is a still of the
web app.

## Design tokens and colours

To update the vendored files in `packages/renderer/src/theme/`, re-copy the three files with
`brand-assets.mjs` as the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md#design-system) says. The
tape colours (`TAPE_COLORS`) are notation colours in
`packages/schema-model/src/notation.ts`; a change must keep `notation-contrast.test.ts` green. When
a dependency of the VS Code extension changes, run
`npm run notices -w modelers/business-model-canvas/apps/vscode` and commit
`THIRD_PARTY_NOTICES.md`.

## Licence of the canvas

The Business Model Canvas is by Strategyzer AG and licensed under CC BY-SA 3.0. Keep the
attribution line on the canvas and in every export, and do not add the official icons or the
guiding questions in their words; the block hints are Miragon's own.

## Pull requests

Gates: `lint`, `test`, `test:browser`, `depcruise`; for a web app change also `build:webapp` and
`npm run check:build -w modelers/business-model-canvas/apps/webapp`; for an extension or plugin
change `test:vscode:docker` and `test:orca:docker`. Scope `business-model-canvas`, e.g.
`feat(business-model-canvas): add a sticky colour picker`.
