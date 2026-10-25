# CLAUDE.md

TypeScript modeler for the [Team Topologies](https://teamtopologies.com/) notation (the four team
types, the three team-interaction modes, and flow-of-change), built on
[diagram-js](https://github.com/bpmn-io/diagram-js) (MIT). Shared core for two targets: a web app and
a VS Code extension.

This modeler is `modelers/team-topologies` in the Miragon modeler suite. The suite's
[`CLAUDE.md`](../../CLAUDE.md) holds the rules for every modeler (setup, commands, commits and
signing, exact pins, releases, the design system, the contract and shell boundaries); this file
adds what is special to Team Topologies. Run its scripts from the repository root as
`npm run team-topologies <script>`, or as `npm run <script>` inside `modelers/team-topologies`.

## Design system (mandatory)

All UI/visual work follows the Miragon product design system (the
**`miragon-brand:modeler-tool-design`** skill; see the suite's
[`CLAUDE.md`](../../CLAUDE.md#design-system-mandatory)). Here:

The design system **1.20.1** is **vendored** from that skill, byte-identical:
[`packages/renderer/src/theme/cd-tokens.generated.css`](packages/renderer/src/theme/cd-tokens.generated.css),
`cd-tokens.generated.json` and `cd-canvas.css`. Do **not** fork or reformat them; re-copy all three
from the skill to update and update their hashes in the drift test
(`packages/renderer/src/theme/theme.sync.test.ts`), which also checks that
[`palette.ts`](packages/renderer/src/theme/palette.ts) (the pure-TS mirror for canvas colours) and the
vendored files agree and that `team-topologies.css` reads only `--cd-ui-*` roles (the dialogs'
primary button alone takes the fixed blue and white, guide §8) and, built, keeps the tokens in the
cascade layer `team-topologies-tokens` (so a host page's own tokens win) with `cd-canvas.css`
unlayered.
`apps/vscode/src/tokens.sync.test.ts` pins the shell's sizes (`SHELL`) to the JSON's `shell` group.

**Chrome:** both apps run on [`@miragon/modeler-shell`](../../packages/shell/README.md):
the VS Code webview on its IDE host, the web app on its web host. Shared: menu, palette skin, zoom
panel and keys, fit, problems pill, status box, empty-file hint, legend and inspector slots,
`themes: ["light"]` until the shared dark mode (VS Code: theme bridge and the hint's "Insert
example"; web: the hint after "New diagram" without it, Share as primary action, legal line,
toasts, problems list, start screen, drop zone and the head markup from `vite.config.ts`). The
renderer implements the canvas rules it asks for (keyboard creation, the `ttReadOnly` lock, no zoom
keys, `undoRedoKeys: false` in VS Code) and the `@miragon/modeler-api` contract
(`createCollaborativeModeler`, its conformance kit in `npm run team-topologies test:browser`). The
shell's own conformance kit runs in both e2e projects, `webapp` and `vscode-webview`.

**Notation colours:** the team-type and interaction-mode fills and strokes in
[`packages/schema-model/src/notation.ts`](packages/schema-model/src/notation.ts) are the **official
notation** (Team-Shape-Templates) and stay as they are, for fidelity to the official templates. A
document never carries them: it serializes only an element's optional `fill` / `stroke` override.
The official strokes below the guide's 3:1 for non-text elements on the canvas ground are an
accepted exception (decided 2026-10-24 in #94). The guide records it in §10.6 from the release after
1.20.1; the vendored 1.20.1 does not contain it yet. It also covers the notation's own icons, which
draw the same strokes on the chrome's surfaces in the palette and the legend.
[`packages/renderer/src/draw/notation-contrast.test.ts`](packages/renderer/src/draw/notation-contrast.test.ts)
checks every notation colour pair (label text at least 4.5:1 on its fill, structural strokes at
least 3:1 on the canvas ground) and lists exactly the exempt official strokes, so a new colour
cannot slip below unnoticed. The design system covers everything else (chrome, typography,
accent/selection, neutrals, the app icon).

## Packages

The workspaces are `packages/*`, `apps/*` and `e2e` of this folder. Internal
`@miragon/team-topologies-*` dependencies pin the current version of that workspace package (npm
still links them to the local workspace); how a release keeps them in step is in the suite's
[docs/ci-and-releases.md](../../docs/ci-and-releases.md).

| Package                                 | Purpose                                                                                        | DOM |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- | --- |
| `@miragon/team-topologies-schema-model` | Types, the notation spec, Zod validation, migrations, JSON serialization                       | no  |
| `@miragon/team-topologies-renderer`     | diagram-js bootstrap, renderer, viewer/modeler, import/export, CSS, menu, legend rows, dialogs | yes |
| `@miragon/team-topologies-ui` (private) | the React inspector for the chrome's inspector slot                                            | yes |
| `apps/webapp`                           | Vite demo editor on the modeler shell's web host                                               | yes |
| `apps/vscode`                           | VS Code extension: custom editor for `.tt`/`.ttm.json`                                         | yes |

**P1, the DOM boundary:** the DOM-free package (`schema-model`) must **never** import `diagram-js`/DOM
libraries (`tiny-svg`, `min-dom`) or use the DOM (`window`/`document`). Enforced twice, by ESLint
(`no-restricted-imports`/`no-restricted-globals`) **and** `dependency-cruiser`, so a violating import
fails `npm run team-topologies lint` and `npm run team-topologies depcruise`.

What the modeler puts into a host's chrome, apart from the inspector, is the renderer's, so every
host gets it from npm (designIQ as well as the two apps): `diagramMenu` (Model, Export, Help),
`renderLegend` / `legendGroups`, `createShortcutsDialog` and `createTitleDialog`, typed structurally
like the shell (README "Around the canvas") and styled by `team-topologies.css`.
`apps/webapp/src/chrome.sync.test.ts` pins that mirror to the shell's key labels and types.

The `ui` package is consumed from source only (no build, not published). It holds the inspector
(React, mounted into the shell's inspector slot) and `makeRoomForLegend`, ships its styles as
`@miragon/team-topologies-ui/ui.css` (role aliases, buttons, fields, the inspector's content; where
it sits is the host's), and must never import from `apps/**`; `schema-model` and `renderer` must
never import it. No package imports `@miragon/modeler-shell`: only the apps mount it (all enforced
by `dependency-cruiser`, the shell ban also by ESLint, so the pre-commit hook catches it;
`schema-model` takes only types from `@miragon/modeler-api`).

## Commands

- `npm run team-topologies build`: packages (schema-model, then renderer) ·
  `npm run team-topologies build:webapp` · `npm run team-topologies build:vscode`
- `npm run team-topologies dev:webapp` (alias: `npm run team-topologies dev`) serves the webapp via
  [Portless](https://portless.sh) at a stable per-worktree
  `https://<worktree>.team-topologies-modeler.localhost` URL (Portless-derived from the git
  worktree; config in [`apps/webapp/portless.json`](apps/webapp/portless.json); needs Node ≥ 24 +
  the one-time setup in the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md#dev-servers)).
  `npm run team-topologies dev:webapp:plain` for plain Vite on `:5181`. ·
  `npm run team-topologies dev:vscode`
- `npm run team-topologies test`: Vitest (unit) · `npm run team-topologies test:browser`:
  renderer and the contract kit in Chromium · `npm run team-topologies test:e2e`: Playwright,
  projects `webapp` and `vscode-webview` (ports `E2E_PORT`, `E2E_WEBVIEW_PORT`)
- `npm run team-topologies test:vscode`: the packed extension in a real VS Code (Vitest project
  `vscode`, `apps/vscode/test-smoke/`, the shell's `./testing/vscode-electron`): open, edit, save,
  undo and the four default themes, screenshots in `test-results/vscode-smoke/`. Opt-in: it opens a
  VS Code window (on Linux without a display: `xvfb-run -a`) and downloads VS Code once into the OS
  cache. **Run it locally as `npm run team-topologies test:vscode:docker`** (the shell's
  `modeler-shell-vscode-docker`, needs Docker): the same test in a Linux container under
  `xvfb-run -a`, so no window opens and takes the user's focus; it runs `npm ci` in the container
  and copies `test-results/vscode-smoke/` back. This modeler's `package.json` declares the shell
  itself as a devDependency, at the workspaces' exact version; keep the pins equal.
  `VSCODE_VERSION` picks the VS Code (`stable`, `1.96.0`; with Docker
  `npm run team-topologies test:vscode:docker -- --env VSCODE_VERSION=1.96.0`),
  `VSCODE_SMOKE_KEEP=1` keeps VS Code's logs (with Docker in `test-results/vscode-smoke/vscode-logs/`).
  When CI runs it is in the suite's [docs/ci-and-releases.md](../../docs/ci-and-releases.md); see
  [`CONTRIBUTING.md`](CONTRIBUTING.md).
- `npm run team-topologies typecheck` · `npm run team-topologies lint` (ESLint + typecheck)
- `npm run team-topologies format`: Prettier · `npm run team-topologies depcruise`: check the
  module graph
- `npm run team-topologies check:release-notes -- <number>`: release-please's parser on a pull
  request: names every breaking change the squash merge would lose (the rules in the suite's
  [`CONTRIBUTING.md`](../../CONTRIBUTING.md#commits-and-pull-requests))

The packages are consumed from **source** (Vite/esbuild/tsconfig aliases), so neither the apps nor
the tests need a prior package build; `npm run team-topologies build` is for publishing the
libraries.

## Releases

The packages and the extension (`miragon-gmbh.team-topologies-modeler`) are released through the
suite's release PR; how they are versioned, what a new internal dependency edge or workspace needs
in the release configuration, and where they are published is in
[docs/ci-and-releases.md](../../docs/ci-and-releases.md). The jobs that publish the extension run
the VS Code smoke on the VSIX they upload (`VSCODE_SMOKE_VSIX`) before `vsce publish` /
`ovsx publish`. [`CHANGELOG.md`](CHANGELOG.md) in this folder holds the releases of the modeler's
shared version up to 0.13.2.

## Conventions

- Keep the core package (`schema-model`) strictly DOM-free (P1, above).
- JSON serialization must stay deterministic (sorted, rounded, version-stamped) so diffs and share
  URLs stay stable.
- Pins follow the suite's rule, the `peerDependencies` exception included. See
  [`.claude/rules/package-json-fixed-versions.md`](.claude/rules/package-json-fixed-versions.md).
- The modeler's Claude skills ship as the **`team-topologies-modeler` plugin**
  ([`plugins/team-topologies-modeler/`](plugins/team-topologies-modeler/)) via the suite's
  marketplace in [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json):
  `team-topologies` for the method, `tt-format` for the file format plus its checker
  (`skills/tt-format/scripts/check.mjs`). The checker hand-mirrors `schema-model` (notation sizes,
  schema, serializer), so when you change those, update it;
  `packages/schema-model/src/plugin-check.sync.test.ts` fails on drift. Install with
  `/plugin marketplace add Miragon/modeler-suite` and
  `/plugin install team-topologies-modeler@modeler-suite`; the skill files are readable directly
  under `plugins/team-topologies-modeler/skills/` either way. The plugin's `version` lives in its
  `plugin.json` only.
- Contributor notes for this modeler in [`CONTRIBUTING.md`](CONTRIBUTING.md).
