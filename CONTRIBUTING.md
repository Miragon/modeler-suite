# Contributing

This guide covers what holds for the whole suite; each modeler's `CONTRIBUTING.md` adds what is
special to it ([Wardley Maps](modelers/wardley-maps/CONTRIBUTING.md),
[Event Storming](modelers/event-storming/CONTRIBUTING.md),
[Team Topologies](modelers/team-topologies/CONTRIBUTING.md),
[Context Maps](modelers/context-maps/CONTRIBUTING.md),
[Value Chain](modelers/value-chain/CONTRIBUTING.md), [C4 model](modelers/c4/CONTRIBUTING.md)).
CI, releases and publishing are in [docs/ci-and-releases.md](docs/ci-and-releases.md), the rules
for agents in [CLAUDE.md](CLAUDE.md).

## External contributions

We're currently not accepting pull requests from outside the team: we can't review external
changes thoroughly enough to vouch for their quality and security, so such pull requests will be
closed. If you've found a bug or have an idea, please
[open an issue](https://github.com/Miragon/modeler-suite/issues/new). We read every one.

## Repository layout

One npm workspace (TypeScript ESM), one lockfile, one pre-commit hook. Every package and extension
keeps its own version, npm name and extension id.

```text
packages/
  api/                   @miragon/modeler-api: the collaborative-modeler contract and its conformance kit
  shell/                 @miragon/modeler-shell: the shared chrome, its conformance kit, the VS Code smoke driver
modelers/<modeler>/      wardley-maps, event-storming, team-topologies, context-maps, value-chain, c4
  packages/              the npm libraries: schema-model, dsl / cml / layout / transforms, renderer
  apps/webapp            the web app
  apps/vscode            the VS Code extension
  e2e/                   Playwright suites for both apps
  example/, docs/        example files and the modeler's docs
extensions/
  modeler-collection/    the VS Code extension pack of every modeler
plugins/modeler-kit/     the Claude Code plugin with the new-modeler skill and its template
.claude-plugin/          the suite's Claude Code marketplace
tooling/                 the ESLint and dependency-cruiser presets every modeler uses
test/                    repository-level checks (plugin drift, boundaries, release config, CI paths)
docs/                    the documentation site, https://miragon.github.io/modeler-suite/
```

The `schema-model`, `dsl`, `cml`, `layout` and `transforms` packages are DOM-free; the renderer
implements `@miragon/modeler-api` on diagram-js, and both apps mount `@miragon/modeler-shell`.

## Setup

Node `^22.22.2` or `>=24.15.0` and npm. From the repository root:

```sh
npm ci                                   # every workspace, and the pre-commit hook
npm run build:shared                     # @miragon/modeler-api and @miragon/modeler-shell
npx playwright install chromium webkit   # once, for the browser and e2e tests
```

The modelers read the shared packages from `dist`, so run `npm run build:shared` again after
changing them. Wardley Maps, Event Storming, Value Chain and C4 also resolve their own packages from
`dist` in their unit tests: run `npm run <modeler> build` before `npm run <modeler> test`.

## Scripts

Everything runs from the root. `npm run <modeler> <script>` runs a script of one modeler
(`wardley-maps`, `event-storming`, `team-topologies`, `context-maps`, `value-chain`, `c4`),
`npm run modelers <script>` runs it in all six.

| Root script                                 | Does                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run build`                             | the shared packages, then every modeler's packages and apps                   |
| `npm test`                                  | the shared packages' tests, the repository checks, every modeler's unit tests |
| `npm run lint` / `npm run typecheck`        | ESLint and type checks / type checks only                                     |
| `npm run format` / `npm run format:check`   | Prettier over the whole repository                                            |
| `npm run depcruise`                         | every modeler's module-graph rules                                            |
| `npm run publint`                           | the published shape of the shared packages                                    |
| `npm run test:plugin`                       | the checks in `test/`                                                         |
| `npm run test:browser` / `npm run test:e2e` | every browser test / e2e suite                                                |
| `npm run package:vscode`                    | every VS Code extension as a VSIX                                             |

| Modeler script                                   | Does                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `build`                                          | its publishable packages                                                  |
| `build:webapp`, `build:vscode`, `package:vscode` | the web app, the extension's bundles, the VSIX                            |
| `typecheck`, `lint`                              | type check; ESLint and type check                                         |
| `test`                                           | Vitest unit tests                                                         |
| `test:browser`                                   | Vitest in Chromium, with the `@miragon/modeler-api` conformance kit       |
| `test:e2e`                                       | Playwright: web app and VS Code webview, with the shell's conformance kit |
| `test:vscode:docker`                             | the packed extension in a real VS Code, in Docker                         |
| `depcruise`                                      | the module-graph rules, the DOM boundary among them                       |
| `dev:webapp`, `dev:webapp:plain`, `dev:vscode`   | the web app's dev server, the extension's watch build                     |

A flag after an alias never reaches the script (npm takes it for its own option). Give it to the
workspace instead, after `--`:

```sh
npm run test:e2e -w modelers/wardley-maps/e2e -- --project=vscode-webview --grep "Share"
npm run test:vscode:docker -w @miragon/wardley-maps-modeler-workspace -- --env VSCODE_SMOKE_KEEP=1
```

## Dev servers

`npm run <modeler> dev:webapp` serves the web app through [Portless](https://portless.sh) at a
named `.localhost` URL (Node 24 or later); in a linked worktree the branch becomes a subdomain, so
parallel checkouts never collide. `dev:webapp:plain` is plain Vite on `127.0.0.1` (`PORT` overrides
the port).

| Modeler         | `dev:webapp`                                          | `dev:webapp:plain`      |
| --------------- | ----------------------------------------------------- | ----------------------- |
| Wardley Maps    | `https://<branch>.wardley.localhost`                  | `http://127.0.0.1:5180` |
| Event Storming  | `https://<branch>.event-storming.localhost`           | `http://127.0.0.1:5180` |
| Team Topologies | `https://<branch>.team-topologies-modeler.localhost`  | `http://127.0.0.1:5181` |
| Context Maps    | `http://<branch>.context-maps-modeler.localhost:8080` | `http://127.0.0.1:5181` |
| Value Chain     | plain Vite: `http://localhost:5181`                   | (no Portless)           |
| C4 model        | `https://<branch>.c4.localhost`                       | `http://127.0.0.1:5182` |

The HTTPS URLs need Portless's proxy, installed once per machine (asks for `sudo`):
`npx portless trust` and `npx portless service install`. `npm run <modeler> dev:vscode`
watch-builds the extension; debug it with the launch configuration in the modeler's
`.vscode/launch.json`.

## Tests

- **Unit:** `npm test`, or `npm run <modeler> test`.
- **Browser:** `npm run <modeler> test:browser` runs the renderer's integration tests and the
  contract's conformance kit in Chromium; a skipped case or an advisory fails the run.
  `npm run test:browser:shared` runs the shell's browser tests in Chromium and WebKit.
- **e2e:** `npm run <modeler> test:e2e` runs Playwright against the web app and the VS Code
  webview, both held to the shell's conformance kit; some modelers add WebKit projects. A running
  server is reused, so pick free ports beside another checkout:
  `E2E_PORT=6101 E2E_WEBVIEW_PORT=6111 npm run wardley-maps test:e2e`.

### VS Code smoke test

`test:vscode` packs the extension as the release does and runs it in a real VS Code: open a
fixture, check the chrome, edit, save, undo, switch the four default themes, with screenshots in
the modeler's `test-results/vscode-smoke/`. On macOS it opens a window that takes the focus, so
**run it in Docker locally**:

```sh
npm run wardley-maps test:vscode:docker
npm run test:vscode:docker -w @miragon/wardley-maps-modeler-workspace -- --env VSCODE_VERSION=1.96.0
```

`VSCODE_SMOKE_KEEP=1` keeps VS Code's logs, `VSCODE_SMOKE_SKIP=keys,history,workbench` skips
steps, `VSCODE_SMOKE_VSIX=<file>` smokes a packed VSIX. On a fresh checkout, where `npm ci` ran
before `npm run build:shared`, link the command once with `npm rebuild @miragon/modeler-shell`.
The driver and the container are documented in the shell's README,
[In Docker, without a window](packages/shell/README.md#in-docker-without-a-window).

### Orca plugins

Every modeler but C4 is also an [Orca](https://www.onorca.dev) custom editor in `apps/orca`: the
editor the VS Code webview mounts too (`apps/ide-editor`), on the shell's `orcaEditorHost` with
the notation's merge (`mergeOwmText`, `mergeStormText`, …), which Orca calls for an agent's write
under unsaved edits. Orca keeps the file, its dirty state, saving and read-only tabs; the editor
owns undo. Build one and load it into your Orca:

```sh
npm run wardley-maps build:orca          # writes apps/orca/plugin/
cd modelers/wardley-maps/apps/orca/plugin
orca plugin validate . && orca plugin check .
orca plugin dev load . --json            # prints the --approve fingerprint
orca plugin dev load . --json --approve <fingerprint>
```

`plugin/` is the folder Orca loads and the release publishes to
[Miragon/orca-modelers](https://github.com/Miragon/orca-modelers). The bundle is not minified and
ships no sourcemap, so the plugin stays within the size review of Orca's community directory
([#563](https://github.com/Miragon/modeler-suite/issues/563));
[#564](https://github.com/Miragon/modeler-suite/issues/564) brings the sourcemap back. Of zod's
error messages it keeps only the English ones
([#568](https://github.com/Miragon/modeler-suite/issues/568)). The editor needs Orca 1.4.252 or
later (`"frame": "isolated"`, the desktop app). Team Topologies' plugin is released in lockstep
with the modeler's other packages.

`images/` holds the cover and the screenshots of Orca's plugin directory
([#572](https://github.com/Miragon/modeler-suite/issues/572)), named in `orca-plugin.json`. They
come from the `product-shots` skill, see [Store images](#store-images). Orca shows no README, so
`apps/orca/README.md` is the page for people who install the plugin from GitHub.

The e2e project `orca-editor` runs the editor inside the shell's Orca stub: the shell's
conformance kit on the `ide` host (`ideHost: "orca"`, the `csp` case on the built plugin under
Orca's frame policy) and the document sync with an agent's writes. `test:orca:docker` runs the
plugin in a real Orca in a Linux container (never on the Mac itself, where Orca's window would
take the focus): load, render, both themes, undo, a saved edit, an agent's write and Orca's logs.
`ORCA_SMOKE_MERGE=1` adds an agent's write under unsaved edits (`merge`) and a conflicting one
(`conflict`). Both stay off by default: driven through `orca plugin shot`, Orca does not hand that
write to the editor, as its merge needs exactly one mounted editor view of the tab.

```sh
npm run test:e2e -w modelers/wardley-maps/e2e -- --project=orca-editor
npm run wardley-maps test:orca:docker
```

## Store images

The covers and screenshots of the VS Code Marketplace pages (`modelers/<modeler>/docs/screenshots/vscode/`,
linked from each `apps/vscode/README.md`) and of Orca's plugin directory (`apps/orca/images/`) come
from the `product-shots` skill of the `miragon-brand` plugin
([Miragon/corporate-identity](https://github.com/Miragon/corporate-identity)). Every product, its
target, title, claim, icon and the recipe's options are in
[`.miragon/product-shots.json`](.miragon/product-shots.json); `skillVersion` is the skill release
the images were made with. Each modeler's VS Code images show its demo workspace in
`modelers/<modeler>/docs/demo/`. Build the VSIX (`npm run <modeler> package:vscode`) and the Orca
plugins (`npm run <modeler> build:orca`) first, then, from the repository root:

```sh
node <miragon-brand plugin>/skills/product-shots/scripts/listing.mjs --product wardley-maps-vscode
node <miragon-brand plugin>/skills/product-shots/scripts/listing.mjs --check
```

VS Code runs headless (`code serve-web`), so the VS Code images can be made on the Mac. Orca runs
only in a Linux container, see the skill's `references/orca.md`. `--check` reports a newer skill
than `skillVersion`: then make the images again and raise `skillVersion`.

## Pre-commit hook

`npm ci` installs one Husky hook. It runs ESLint and Prettier on the staged files (lint-staged with
the root config), `npm run lint` of every modeler with staged files and the shared type check when
`packages/` or `test/` change. It runs **no** tests, builds or dependency-cruiser. Never bypass it
with `--no-verify`.

## Commits and pull requests

- **Conventional Commits**, checked on the pull request title: `feat`, `fix`, `chore`, `docs`,
  `refactor`, `ci`, `build`, `test`, `revert`. The scope names the area: a modeler, `api`, `shell`
  or `plugin`, e.g. `feat(wardley-maps): add an inertia decorator`.
- **Signed commits:** `git commit -S`; after a rebase, sign again with `git rebase -S`.
- **Branches:** branch off `main`, keep pull requests small, and open them into `main`. They are
  squash-merged with the title as the subject. More than one changelog entry or breaking change
  goes into a `BEGIN_COMMIT_OVERRIDE` block, see
  [docs/ci-and-releases.md](docs/ci-and-releases.md#begin_commit_override).
- **Before you open one:** `npm run format:check`, `npm run lint`, `npm test`, and for what you
  touched the modeler's `depcruise`, `test:browser` and `test:e2e`. For a change to an extension, a
  DSL, a schema model or a dependency also `test:vscode:docker`; for a change to `packages/` the
  modelers' kits, `npm run test:browser:shared` and `npm run publint`.

## Releases

[release-please](https://github.com/googleapis/release-please) keeps one release pull request for
the whole suite. A commit releases every package whose files it touches: `feat` a minor, `fix` a
patch, a breaking change a major (a minor on 0.x); `chore`, `ci`, `docs`, `test`, `build` and
`refactor` release nothing. Never edit a version or a `CHANGELOG.md` by hand. Every new
`@deprecated` gets an issue that names its target version. Details, publishing and the first
release of a new npm package are in [docs/ci-and-releases.md](docs/ci-and-releases.md).

`@miragon/modeler-api` is on 1.x: a new optional surface of the contract or kit is a `feat`; a new
required member, a stricter law or a breaking change to the kit's harness is breaking (`feat!:`).
A requirement the contract text does not state yet ships as a RECOMMENDATION whose kit case only
advises, and becomes a law in the next major.

A new kit case needs a saboteur flaw in `packages/api/test/reference-modeler.ts` and its exact
failure set in `packages/api/test/conformance.test.ts`, so CI proves the case bites. An accepted
implementation choice gets a variant that fails nothing; a RECOMMENDATION a variant that advises
exactly once. Cases that need a DOM get their saboteurs in the jsdom suites
`packages/api/test/{keys,appearance,user-action}.conformance.test.ts`.

## Claude Code plugins

[`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) (`modeler-suite`) lists
`modeler-kit` and the plugins of Wardley Maps, Event Storming and Team Topologies. Plugin and skill
names are public: never rename one. After editing a plugin, run `claude plugin validate .` and
`claude plugin validate <plugin directory> --strict`. The modelers' skills are guarded by their
modelers' tests; maintaining the modeler-kit and its template is described in
[plugins/modeler-kit/CONTRIBUTING.md](plugins/modeler-kit/CONTRIBUTING.md).

## Design system

All UI follows the Miragon design system (skill `miragon-brand:modeler-tool-design`). Every
renderer vendors its `cd-tokens.generated.css`, `cd-tokens.generated.json` and `cd-canvas.css`
unchanged into `packages/renderer/src/theme/`: to update, re-copy them with
`node <miragon-brand plugin>/scripts/brand-assets.mjs .` (the copies are listed in
[`.miragon/brand-assets.yaml`](.miragon/brand-assets.yaml), their checksums in
`.miragon/brand-assets.sha256`, which CI checks) and follow the modeler's `CONTRIBUTING.md`. Never
edit them by hand.

[`.miragon/brand.json`](.miragon/brand.json) turns on brand-lint for the whole suite (plugin
`miragon-brand` 1.7.0 or later). Claude Code runs it on every file it writes; by hand:

```sh
node <miragon-brand plugin>/scripts/brand-lint.mjs $(git ls-files -co --exclude-standard)
```

Fix every hard finding. An intended notation colour goes between `// brand-lint-disable` and
`// brand-lint-enable`, under a comment that says why. Keep the one root config: never add one
under `modelers/`.
