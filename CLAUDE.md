# CLAUDE.md

The Miragon modeler suite: the collaborative-modeler contract `@miragon/modeler-api`, the shared
chrome `@miragon/modeler-shell`, and the five modelers built on them (Wardley Maps, Event
Storming, Team Topologies, Context Maps, Value Chain). Each modeler is one notation on
[diagram-js](https://github.com/bpmn-io/diagram-js) (MIT): DOM-free model packages, a renderer, a
web app and a VS Code extension. One npm workspace, one lockfile, one pre-commit hook; every package
keeps its own version, npm name and extension id.

The rules below hold everywhere. **Before working in a modeler, read its `CLAUDE.md`** for what is
special to its notation (packages, DSL or file format, renderer architecture, tests).

## Where things are

| Path                              | What                                                                                                                                                                             | Agent notes                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/api`                    | `@miragon/modeler-api`: the contract and its conformance kit, 0 runtime dependencies                                                                                             | [README](packages/api/README.md)                                                                                                                      |
| `packages/shell`                  | `@miragon/modeler-shell`: chrome, shell conformance kit, VS Code smoke driver                                                                                                    | [README](packages/shell/README.md), [API](packages/shell/API.md)                                                                                      |
| `modelers/wardley-maps`           | Wardley Maps, `.wmap` / `.owm`                                                                                                                                                   | [CLAUDE.md](modelers/wardley-maps/CLAUDE.md)                                                                                                          |
| `modelers/event-storming`         | Event Storming, `.storm`                                                                                                                                                         | [CLAUDE.md](modelers/event-storming/CLAUDE.md)                                                                                                        |
| `modelers/team-topologies`        | Team Topologies, `.tt` / `.ttm.json`                                                                                                                                             | [CLAUDE.md](modelers/team-topologies/CLAUDE.md)                                                                                                       |
| `modelers/context-maps`           | Context Maps, `.cm` / `.cm.json`, Context Mapper `.cml`                                                                                                                          | [CLAUDE.md](modelers/context-maps/CLAUDE.md)                                                                                                          |
| `modelers/value-chain`            | Value Chain, `.vc` / `.vc.json`                                                                                                                                                  | [CLAUDE.md](modelers/value-chain/CLAUDE.md)                                                                                                           |
| `extensions/modeler-collection`   | the VS Code extension pack of every Miragon modeler, `miragon-modeler-collection`                                                                                                | `test/modeler-collection.test.ts`                                                                                                                     |
| `plugins/modeler-kit`             | Claude plugin: the `new-modeler` skill and its template                                                                                                                          | [README](plugins/modeler-kit/README.md)                                                                                                               |
| `.claude-plugin/marketplace.json` | the suite's one Claude plugin marketplace (`modeler-suite`)                                                                                                                      |                                                                                                                                                       |
| `.miragon/brand.json`             | the suite's one brand-lint config (see [Design system](#design-system-mandatory))                                                                                                |                                                                                                                                                       |
| `tooling/`                        | the ESLint and dependency-cruiser presets every modeler's config calls                                                                                                           |                                                                                                                                                       |
| `test/`                           | repository-level checks: modeler-kit drift, modeler boundaries, Dependabot auto-merge, brand-lint config, CI path decisions                                                      |                                                                                                                                                       |
| `docs/`                           | the VitePress docs site (https://miragon.github.io/modeler-suite/): [shell implementation notes](docs/shell/implementation-notes.md), [CI and releases](docs/ci-and-releases.md) | own npm project: `npm ci` and `npm run dev` in `docs/`; the kit in `docs/.vitepress/miragon/` is vendored unchanged (skill `miragon-brand:docs-site`) |

Each modeler folder holds `packages/` (its npm libraries), `apps/webapp`, `apps/vscode`, `e2e/`
(Playwright), `example/`, `docs/`, its `README.md`, `CLAUDE.md`, `CONTRIBUTING.md` and
`.claude/rules/`. Its `package.json` is the private workspace `@miragon/<modeler>-modeler-workspace`
whose scripts run that modeler's checks.

## Commands

Requirements: Node `^22.22.2 || >=24.15.0`, npm. Everything runs from the repository root.

- Setup: `npm ci`, then `npm run build:shared`. The modelers link `@miragon/modeler-api` and
  `@miragon/modeler-shell` from this workspace and read their `dist`, so build them again after
  changing them. Wardley Maps, Event Storming and Value Chain also resolve their own packages from
  `dist` in their unit tests: `npm run <modeler> build` first. Team Topologies and Context Maps
  consume their packages from source.
- One modeler: `npm run <modeler> <script>` with the aliases `wardley-maps`, `event-storming`,
  `team-topologies`, `context-maps`, `value-chain` (e.g. `npm run wardley-maps test`). All five:
  `npm run modelers <script>`. One workspace: `npm run <script> -w <name or path>`. A flag after
  an alias never reaches the script, since npm takes it for an option of its own: npm 10 and 11
  (Node 22, 24 and 26) drop it and run the whole script, npm 11 after a warning; npm 12 stops with
  `EUNKNOWNCONFIG`; `-g` means `--global`. Give flags to the workspace instead:
  `npm run test:e2e -w modelers/<modeler>/e2e -- --project=<name> --grep "<title>"` for
  Playwright, `npm run <script> -w @miragon/<modeler>-modeler-workspace -- <flags>` for the
  modeler's own scripts (e.g. `test:vscode:docker -- --env VSCODE_SMOKE_KEEP=1`; the path
  `modelers/<modeler>` would also select every workspace beneath it, and those without the script
  fail the run).
- Per modeler: `build`, `build:webapp`, `build:vscode`, `package:vscode`, `typecheck`, `lint`
  (ESLint + type check), `test` (Vitest unit), `test:browser` (Vitest in Chromium, the contract's
  conformance kit), `test:e2e` (Playwright: the web app and the VS Code webview, the shell's kit),
  `test:vscode` and `test:vscode:docker` (the packed extension in a real VS Code), `depcruise`,
  `format`, `format:check`, `dev:webapp`, `dev:webapp:plain` (not in value-chain, whose
  `dev:webapp` is plain Vite), `dev:vscode`.
- Root: `npm run build` (shared, modelers, apps), `npm test` (shared packages, plugin drift test,
  every modeler's unit tests), `npm run lint`, `npm run typecheck`, `npm run format` /
  `format:check`, `npm run depcruise`, `npm run publint`, `npm run test:plugin`,
  `npm run test:browser`, `npm run test:e2e`, `npm run package:vscode`.
- **Never run `test:vscode` on the user's Mac**: it opens a VS Code window that takes the focus.
  Run `npm run <modeler> test:vscode:docker` (needs Docker, no window) or leave it to CI, and ask
  first if a real window is unavoidable. Its command is the shell's bin, which `npm ci` links only
  when `packages/shell/dist` exists: after a fresh `npm ci` and `npm run build:shared`, run
  `npm rebuild @miragon/modeler-shell` once.
- The pre-commit hook runs lint-staged with the root config only (`--config package.json`: ESLint
  and Prettier on staged files under the root `.prettierignore`, which keeps the new-modeler
  template's Markdown placeholders; the template's own config is for the repository it starts),
  `npm run lint` of every modeler whose files are staged and the shared type check when `packages/`
  or `test/` change. It runs **no** tests, builds or dependency-cruiser: run `npm test` (and the
  affected modeler's `test:browser`, `test:e2e` and `depcruise`) yourself before pushing. Never
  bypass it with `--no-verify`.

## Boundaries

- **DOM boundary (P1), per modeler.** These packages must never import `diagram-js` or DOM libraries
  (`tiny-svg`, `min-dom`) and never use `window` / `document`:

  | Modeler         | DOM-free packages                   |
  | --------------- | ----------------------------------- |
  | Wardley Maps    | `schema-model`, `dsl`, `transforms` |
  | Event Storming  | `schema-model`, `dsl`, `transforms` |
  | Team Topologies | `schema-model`                      |
  | Context Maps    | `schema-model`, `cml`               |
  | Value Chain     | `schema-model`                      |

  ESLint (`no-restricted-imports` / `no-restricted-globals`) and dependency-cruiser enforce it, so a
  violation fails `npm run <modeler> lint` and `npm run <modeler> depcruise`. Both configs come from
  the presets in `tooling/`; a modeler names its DOM-free packages once, in `modelerSuite` of its
  `package.json`, and adds only its own rules. `test/modeler-boundaries.test.ts`
  (`npm run test:plugin`) runs every modeler's configs against these rules. The renderer and the
  apps are the DOM side. Keep each DSL round-trip lossless and each JSON serialization
  deterministic.

- **Contract.** Every renderer implements `@miragon/modeler-api`
  (`createCollaborativeModeler` / `createCollaborativeViewer` in
  `packages/renderer/src/collaborative/`) and runs its conformance kit in `test:browser`; a skipped
  case or an advisory fails the run. The DOM-free packages may import the contract's **types only**.
  The contract has no runtime dependencies; its laws, versioning and the rule for a new kit case are
  in [packages/api/README.md](packages/api/README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
- **Shell.** Only the apps (`apps/webapp`, `apps/vscode`) and the `e2e/` suites import
  `@miragon/modeler-shell`; **no package under `modelers/*/packages/` does** (ESLint and
  dependency-cruiser). A renderer hands the chrome structurally typed parts (menu entries, dialogs,
  legend rows, a read-only lock) and never the shell's own types. Both apps of every modeler mount
  the shell and run its conformance kit in the e2e projects `webapp` (`chromium` in Context Maps)
  and `vscode-webview`. The shell itself has zero runtime dependencies and a DOM-free `src/core`;
  `packages/shell/test/package-boundaries.test.ts` enforces both.
- **Shared code changes reach every modeler at once.** The modelers pin the workspace's current
  `@miragon/modeler-api` and `@miragon/modeler-shell` and npm links them, so a change in
  `packages/` is live in all five: rebuild (`npm run build:shared`) and run the affected modelers'
  `test:browser` (contract) or `test:e2e` (shell) before pushing, and `npm run test:browser:shared`
  (the shell's `./export` in Chromium and WebKit) after a change to the shell.

## Dependencies

- Pin `dependencies` and `devDependencies` to **exact** versions, no ranges (`^`, `~`, `>=`, `*`);
  the root `.npmrc` sets `save-exact=true`. Internal `@miragon/*` dependencies, the shared packages
  included, pin the current version of that workspace (npm links the workspace because it satisfies
  the pin). CI checks exact pins with
  [`miragon/pin-npm-dependencies`](https://github.com/Miragon/pin-npm-dependencies) (`pin-check`,
  see [docs/ci-and-releases.md](docs/ci-and-releases.md)), which reads `dependencies` and
  `devDependencies`.
- **Exception: `peerDependencies`.** Runtime libraries a consumer shares (`zod`, the
  `diagram-js` / `didi` / `tiny-svg` ecosystem) are **ranged** peers so a host dedupes them against
  its own copy: a second `zod` or diagram-js breaks `instanceof`, schema identity and the DI
  injector. Each ranged peer is mirrored by an exact `devDependency`, and the bundling apps
  (`webapp`, `vscode`) declare it as an exact `dependency`. Neither npm nor pin-check notices a peer
  range that rejects those exact versions; the peer-dependency tests of the Wardley Maps, Event
  Storming and Context Maps renderers do. Details per modeler in its
  `.claude/rules/package-json-fixed-versions.md`.
- The toolchain (TypeScript, Vitest, tsup, Vite, ESLint, Prettier, Playwright, …) is pinned once in
  the root `package.json`, with `overrides` for `vite` and `@types/node`; a workspace declares only
  what it alone needs. Keep `@playwright/test` in the `e2e` workspaces and `playwright-core` in
  `apps/vscode` on the root `playwright` version.
- Adding one: `npm install <pkg> -w <workspace>` from the root, then check the exact version in
  `package.json` against `npm ls <pkg>`.

## Git, pull requests, releases

- **Conventional Commits**, checked on the PR title: `feat`, `fix`, `chore`, `docs`, `refactor`,
  `ci`, `build`, `test`, `revert`. The scope names the area: a modeler (`wardley-maps`,
  `event-storming`, `team-topologies`, `context-maps`, `value-chain`), `api`, `shell` or `plugin`,
  e.g. `feat(wardley-maps): add an inertia decorator`.
- **Every commit is GPG-signed** (`git commit -S`); after rewriting history, sign again
  (`git rebase -S`).
- Pull requests are squash-merged with the PR title as the subject. More than one changelog entry,
  or more than one breaking change, goes into a `BEGIN_COMMIT_OVERRIDE` block at the end of the PR
  body ([CONTRIBUTING.md](CONTRIBUTING.md#commits-and-pull-requests)).
- **Releases:** every package and extension keeps its own version and `CHANGELOG.md`;
  [release-please](https://github.com/googleapis/release-please) keeps one release pull request for
  the whole suite. A commit releases the packages whose files it touches: `feat` a minor, `fix` a
  patch, a breaking change a major (a minor while a package is on 0.x); `chore`, `docs`, `ci`,
  `build`, `test` and `refactor` release nothing. Never bump a version or edit a `CHANGELOG.md` by
  hand. Workflows, publishing (npm, VS Code Marketplace, Open VSX, the web apps) and how to add a
  package are in [docs/ci-and-releases.md](docs/ci-and-releases.md).
- Every new `@deprecated` gets an issue that names its target version as a number, filed by the
  pull request that adds it ([CONTRIBUTING.md](CONTRIBUTING.md#releases)).

## Design system (mandatory)

All UI and visual work MUST follow the Miragon product design system. This is not optional. Source
of truth: the `miragon-brand:modeler-tool-design` Claude skill in
[Miragon/corporate-identity](https://github.com/Miragon/corporate-identity). If the plugin is
installed, the skill auto-loads on UI work; otherwise read the guide directly:
https://raw.githubusercontent.com/Miragon/corporate-identity/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md

Install once: `/plugin marketplace add Miragon/corporate-identity` then
`/plugin install miragon-brand@miragon`.

- Each renderer vendors the skill's `cd-tokens.generated.css`, `cd-tokens.generated.json` and
  `cd-canvas.css` unchanged into `modelers/<modeler>/packages/renderer/src/theme/`, the shell into
  `packages/shell/fixtures/tokens/`. Never edit, reformat (they are Prettier-ignored) or fork a hex
  value: re-copy from the skill to update and run the drift tests (`theme.sync`, `tokens.sync`).
- The chrome of both apps is the shell's; a renderer's own CSS reads only the `--cd-ui-*` roles.
  The canvas draws light, exports stay light.
- The official notation colours of Team Topologies (`notation.ts` in its `schema-model`) stay as
  they are, for fidelity to the official templates. Its strokes below 3:1 on the canvas ground are
  an accepted exception, recorded in guide §10.6 since release 1.22.0; the modeler's
  `notation-contrast` test lists them exactly. The notation colours of Context Maps (`notation.ts`
  in its `schema-model`) follow conventions, not a template, so they may be tuned for contrast:
  text 4.5:1 and lines 3:1, no exception, checked by its `notation-contrast` tests. A document
  serializes only an element's optional `fill` / `stroke` override, never a notation colour. The
  design system covers everything else.
- Each modeler's `CLAUDE.md` names its reference files and drift tests.
- The root [`.miragon/brand.json`](.miragon/brand.json) turns on the plugin's brand-lint hook: after
  every file Claude writes or edits, it reports each hard finding back to Claude, which fixes it
  before going on. The hook needs Node and the `miragon-brand` plugin in 1.7.0 or later, installed
  for your user as above (the repository adds no `.claude/settings.json`). Older releases do not
  know the status colours the palettes use and report them; update with
  `claude plugin marketplace update miragon` and `claude plugin update miragon-brand@miragon`. The
  hook takes the nearest `.miragon/brand.json` and never merges, so the root file is the one config
  of the suite: never add one under `modelers/` (the new-modeler template's copy is for the
  repository it starts). The modelers are English, so A1, A3, A4, A7 and A11 are off (guide §2);
  C5, A2 (no em dash as a connector), the anti-slop rules and the colour rules stay on. CHANGELOGs,
  third-party notices, tests, e2e suites, snapshots and fixtures are ignored. An intended notation
  colour sits between `// brand-lint-disable` and `// brand-lint-enable` (one line:
  `// brand-lint-disable-next-line`), under a comment that says why. Check the suite from the root
  with `node <miragon-brand plugin>/scripts/brand-lint.mjs $(git ls-files -co --exclude-standard)`:
  the CLI's own walk of `.` skips every dot folder and dot file (`.github`, `modelers/*/.claude`,
  the template's `.claude`, `.dependency-cruiser.cjs`), which the hook still checks.
  `test/brand-lint-config.test.ts` pins the config. brand-lint reads no JSON and only the colours
  of a `.ts` file, so strings there stay a review point.

## Claude Code plugins

- [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) (`modeler-suite`) lists
  `modeler-kit` (`plugins/modeler-kit`), `wardley-maps-modeler`, `event-storming-modeler` and
  `team-topologies-modeler` (`modelers/<modeler>/plugins/<plugin>`). Install with
  `/plugin marketplace add Miragon/modeler-suite` and `/plugin install <plugin>@modeler-suite`.
  Value Chain's skill is a project skill in `modelers/value-chain/.claude/skills/`.
- Plugin and skill names are public: installed copies and other repositories use them, so never
  rename one. Keep the skills repository-independent: they also run in other repositories and in
  Miragon AI Design, where Claude writes the file and the modeler renders it.
- A marketplace entry carries no `version`. `modeler-kit` has none at all (installs follow the
  commits); the modelers' plugins keep theirs in `plugin.json`.
- Drift tests: `npm run test:plugin` (manifests of every listed plugin, the `new-modeler` skill and
  template); `npm run wardley-maps test` (every OWM example parses and round-trips, note colours);
  `npm run team-topologies test` (the `tt-format` checker against the schema model).
  `claude plugin validate .` checks the marketplace; its one warning, modeler-kit's missing
  `version`, is intended.
- CI creates a modeler from the `new-modeler` template on the packed shared packages and runs its
  lint, tests, kits and builds (job `template`, `.github/scripts/template-instance.mjs`, see
  [docs/ci-and-releases.md](docs/ci-and-releases.md)); run the script locally to reproduce it. A
  breaking change to the contract or the shell that the template does not follow fails that job.

## Code style

- Write comments only when explicitly requested. Otherwise write self-explanatory code: descriptive
  function and parameter names, no abbreviations.
- If comments are needed, make them **why**-driven, not **how**.
- Docs are English; German stays only where a file already is German.
