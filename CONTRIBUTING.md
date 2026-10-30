# Contributing

Thanks for helping improve the Miragon modeler suite. It is one npm workspace (TypeScript ESM):
the shared packages under `packages/`, the five modelers under `modelers/`, the modeler-kit plugin
under `plugins/`. This guide covers what holds for all of them; each modeler's `CONTRIBUTING.md`
adds what is special to it ([Wardley Maps](modelers/wardley-maps/CONTRIBUTING.md),
[Event Storming](modelers/event-storming/CONTRIBUTING.md),
[Team Topologies](modelers/team-topologies/CONTRIBUTING.md),
[Context Maps](modelers/context-maps/CONTRIBUTING.md),
[Value Chain](modelers/value-chain/CONTRIBUTING.md)). Agent-oriented rules live in
[`CLAUDE.md`](CLAUDE.md), CI and releases in [docs/ci-and-releases.md](docs/ci-and-releases.md).

## External contributions

We're currently not accepting pull requests from outside the team. We don't have the resources to fully review and validate external contributions, so we can't guarantee that a merged change keeps the project free of bugs, free of security vulnerabilities or malicious code, and consistent with requirements that make sense for it. Pull requests opened by external contributors will be closed.

If you've found a bug or have an idea, please [open an issue](https://github.com/Miragon/modeler-suite/issues/new) instead. We read every one, and it's the best way to get something onto our radar.

## Setup

Node `^22.22.2` or `>=24.15.0` and npm. From the repository root:

```sh
npm ci                              # every workspace; also installs the pre-commit hook
npm run build:shared                # @miragon/modeler-api and @miragon/modeler-shell
npx playwright install chromium webkit  # once; WebKit for the shell's browser tests and the e2e of the shell, Wardley Maps, Event Storming, Context Maps, Team Topologies and Value Chain
```

The modelers link the workspace's `@miragon/modeler-api` and `@miragon/modeler-shell` and read
their `dist`, so run `npm run build:shared` again after changing either. Wardley Maps, Event
Storming and Value Chain resolve their own packages from `dist` in their unit tests: run
`npm run <modeler> build` before `npm run <modeler> test`. Team Topologies and Context Maps
consume their packages from source. Their apps, the e2e suites and the VS Code extensions bundle
every modeler's packages from source, so they need no package build.

## Scripts

Everything runs from the repository root.

| Root script                                 | Does                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run build`                             | `build:shared`, then every modeler's packages (`build:modelers`) and apps (`build:apps`)              |
| `npm test`                                  | the shared packages' tests and the plugin drift test (`test:shared`), then every modeler's unit tests |
| `npm run lint`                              | the shared type check (`typecheck:shared`), then every modeler's ESLint and type check                |
| `npm run typecheck`                         | type checks only                                                                                      |
| `npm run format` / `npm run format:check`   | Prettier over the whole repository, one config                                                        |
| `npm run depcruise`                         | every modeler's module-graph rules                                                                    |
| `npm run publint`                           | the published shape (exports, types, files) of the shared packages                                    |
| `npm run test:plugin`                       | `test/`: modeler-kit drift, plugin manifests, release config, boundaries, auto-merge, CI paths        |
| `npm run test:browser` / `npm run test:e2e` | every modeler's browser tests / e2e suites, both after the shell's own                                |
| `npm run package:vscode`                    | packs every VS Code extension (`modelers/<modeler>/apps/vscode/*.vsix`)                               |

`npm run <modeler> <script>` runs one script of one modeler, with the aliases `wardley-maps`,
`event-storming`, `team-topologies`, `context-maps` and `value-chain`; `npm run modelers <script>`
runs it in all five. Every modeler has these scripts:

| Modeler script                                   | Does                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `build`                                          | its publishable packages                                                                |
| `build:webapp`, `build:vscode`, `package:vscode` | the web app, the extension's bundles, the VSIX                                          |
| `typecheck`, `lint`                              | type check; ESLint and type check (what the pre-commit hook runs)                       |
| `test`                                           | Vitest unit tests                                                                       |
| `test:browser`                                   | Vitest in Chromium: renderer integration and the `@miragon/modeler-api` conformance kit |
| `test:e2e`                                       | Playwright: the web app and the VS Code webview, both with the shell's conformance kit  |
| `test:vscode`, `test:vscode:docker`              | the packed extension in a real VS Code, on the host or in Docker                        |
| `depcruise`                                      | the module-graph rules, the DOM boundary among them                                     |
| `format`, `format:check`                         | Prettier over the modeler's folder                                                      |
| `dev:webapp`, `dev:webapp:plain`, `dev:vscode`   | the web app's dev server (Portless or plain Vite), the extension's watch build          |

One workspace on its own: `npm run <script> -w <name or path>`, e.g.
`npm run test:e2e -w packages/shell` or `npm run notices -w modelers/wardley-maps/apps/vscode`.

A flag after an alias never reaches the script. The alias runs a second `npm run`, which takes the
flag for an npm option of its own. npm 10 and 11, the npm of Node 22, 24 and 26, drop it and run
the whole script, npm 11 after an `Unknown cli config` warning; npm 12 stops with
`EUNKNOWNCONFIG`. In every version `-g` turns into `--global`. Run the script in its workspace
instead, with the flags after `--`. Playwright's flags go to the modeler's `e2e`
workspace, whose `test:e2e` is `playwright test` itself. A modeler's own scripts, such as
`test:vscode:docker`, take its workspace's name, `@miragon/<modeler>-modeler-workspace`: the path
`modelers/<modeler>` would select every workspace beneath it as well, and each one without the
script fails the run.

```sh
npm run test:e2e -w modelers/wardley-maps/e2e -- --project=vscode-webview  # one project
npm run test:e2e -w modelers/wardley-maps/e2e -- --grep "Share"            # the tests whose title matches
npm run test:vscode:docker -w @miragon/wardley-maps-modeler-workspace -- --env VSCODE_SMOKE_KEEP=1
```

`npx playwright test --project=vscode-webview` inside `modelers/wardley-maps/e2e` does the same as
the first line.

## Dev servers

`npm run <modeler> dev:webapp` serves the web app through [Portless](https://portless.sh) at a
named `.localhost` URL instead of a Vite port (needs Node 24 or later). Portless is a pinned
devDependency of each web app; its config is the app's `apps/webapp/portless.json`. The URL is
derived from the git worktree, never hand-built: in a linked worktree the branch becomes a
subdomain, so parallel checkouts never collide, and Portless opens the browser there and prints
the URL under Vite's output.

| Modeler         | `dev:webapp` URL (linked worktree)                    | `dev:webapp:plain`      |
| --------------- | ----------------------------------------------------- | ----------------------- |
| Wardley Maps    | `https://<branch>.wardley.localhost`                  | `http://127.0.0.1:5180` |
| Event Storming  | `https://<branch>.event-storming.localhost`           | `http://127.0.0.1:5180` |
| Team Topologies | `https://<branch>.team-topologies-modeler.localhost`  | `http://127.0.0.1:5181` |
| Context Maps    | `http://<branch>.context-maps-modeler.localhost:8080` | `http://127.0.0.1:5181` |
| Value Chain     | plain Vite: `http://localhost:5181`                   | (no Portless)           |

The HTTPS URLs need Portless's proxy on port 443, installed once per machine with `sudo` (which is
also why a non-interactive Run button cannot do it):

```sh
npx portless trust            # add the local CA to the system trust store
npx portless service install  # the HTTPS proxy as a background service
```

Context Maps sets `PORTLESS_HTTPS=0 PORTLESS_PORT=8080` and needs neither. The plain servers bind
`127.0.0.1` on `PORT` when it is set, so two of them run side by side with
`PORT=5185 npm run event-storming dev:webapp:plain`. `npm run <modeler> dev:vscode` watch-builds
the extension; to debug it, open the modeler's folder in VS Code and start the launch
configuration of its `.vscode/launch.json` from Run and Debug.

## Tests

- **Unit:** `npm test`, or `npm run <modeler> test` for one modeler (after its `build`, see
  [Setup](#setup)).
- **Browser:** `npm run <modeler> test:browser` runs the renderer's integration tests and the
  contract's conformance kit in Chromium. A skipped kit case or an advisory fails the run.
  `npm run test:browser:shared` runs the shell's browser tests (the PNG export of `./export`) in
  Chromium and WebKit.
- **e2e:** `npm run <modeler> test:e2e` runs Playwright from the modeler's `e2e/`, each project with
  its own dev server built from source: the web app (`webapp`; `chromium` and `webkit` in Context
  Maps) and the VS Code webview inside the shell's VS Code stub (`vscode-webview`), both held to the
  shell's conformance kit. Team Topologies also runs its focus hand-back cases in WebKit on both
  hosts (`webapp-webkit`, `vscode-webview-webkit`), Wardley Maps, Event Storming and Value Chain
  their web app's Share and focus hand-back specs (`webapp-webkit`).
  `npm run test:e2e -w modelers/<modeler>/e2e -- --project=<name>` runs one project and
  `-- --grep "<title>"` the tests whose title matches; the alias cannot pass these flags on (see
  [Scripts](#scripts)). A running server on a port is reused, so pick free ports when another
  checkout runs its suite: `E2E_PORT=6101 E2E_WEBVIEW_PORT=6111 npm run wardley-maps test:e2e`.
  `npm run test:e2e:shared` runs the shell's own suite against its demo, in Chromium and its
  pointer-focus and dialog-centre cases in WebKit too.
- **VS Code smoke test:** `npm run <modeler> test:vscode` (the Vitest project `vscode`, never part
  of `npm test`) packs the extension as the release does (`vsce package --no-dependencies`, which
  runs `vscode:prepublish`, the production build), unpacks the VSIX outside the repository, so a
  module the bundle lacks fails as it would for a user, and runs `runVsCodeSmoke` of
  `@miragon/modeler-shell/testing/vscode-electron` in a real VS Code on a throwaway profile: open a
  fixture in the custom editor, check the chrome, edit through the palette, save (the file must
  parse), undo, and switch through VS Code's four default themes with a screenshot each in the
  modeler's `test-results/vscode-smoke/` (git-ignored). No build is needed first. It is not
  retried: the driver reads a save only once the tab is clean and the file holds still, and itself
  repeats a theme switch VS Code missed. `VSCODE_VERSION=1.96.0` picks a VS Code release (default
  the newest stable), `VSCODE_SMOKE_KEEP=1` keeps VS Code's profile and logs,
  `VSCODE_SMOKE_VSIX=<file>` smokes a packed VSIX instead of packing one. The fixture and the edit
  differ per modeler; its `CONTRIBUTING.md` names them.

  On macOS `test:vscode` opens a VS Code window for about half a minute that takes the focus; on
  Linux run it under `xvfb-run -a`. The first run downloads VS Code (about 330 MB) into
  `~/Library/Caches/miragon-modeler-shell/vscode-test` (`~/.cache/…` on Linux), shared by every
  modeler. **Locally, run it in Docker instead**, where no window opens:

  ```sh
  # the newest stable VS Code
  npm run wardley-maps test:vscode:docker
  # the engines.vscode floor
  npm run test:vscode:docker -w @miragon/wardley-maps-modeler-workspace -- --env VSCODE_VERSION=1.96.0
  # VS Code's logs in vscode-logs/
  npm run test:vscode:docker -w @miragon/wardley-maps-modeler-workspace -- --env VSCODE_SMOKE_KEEP=1
  # without the workbench steps (keys, history and workbench can be skipped)
  npm run test:vscode:docker -w @miragon/wardley-maps-modeler-workspace -- --env VSCODE_SMOKE_SKIP=workbench
  ```

  The flags go to the modeler's workspace, not to the alias `npm run wardley-maps`, which would take
  them for npm's own (see [Scripts](#scripts)). Besides the steps above, the driver checks by
  default (since modeler-shell 0.8) the zoom and selection keys, the view and selection across a
  redo and an undo, and the workbench steps: reduced motion, a hidden tab and Developer: Reload
  Window. CI runs all of them for every modeler. `VSCODE_SMOKE_SKIP` (`keys`, `history`,
  `workbench`, separated by commas or spaces) skips some in a local run without a change to the
  test.

  `test:vscode:docker` is the shell's `modeler-shell-vscode-docker`. It mounts the repository (the
  nearest directory with a `package-lock.json`, so the whole suite) read-only, copies it into a
  Linux container without `node_modules` and `.git`, runs `npm ci` there, then the modeler's
  `test:vscode` under `xvfb-run -a`, and copies the modeler's `test-results/vscode-smoke/` back
  (each modeler's script passes it as `--results`, since the default is relative to the suite's
  root). It needs Docker; the image (about 0.9 GB, for the Node version that runs the command) and
  the Docker volumes `modeler-shell-vscode-cache` and `modeler-shell-npm-cache` are built once and
  shared by every modeler; `docker volume rm modeler-shell-vscode-cache modeler-shell-npm-cache`
  starts over. On Apple silicon the container runs VS Code's `linux-arm64` build. Variables reach
  the container only through `--env`; paths in its log are the container's (`/work/…`). The
  options (`--node`, `--platform`, `--rebuild`, `--results`, …) are in the shell's README, section
  [In Docker, without a window](packages/shell/README.md#in-docker-without-a-window).

  The command is the shell's bin, which `npm ci` links only when `packages/shell/dist` exists. On a
  fresh checkout, where `npm ci` ran before `npm run build:shared`, link it once with
  `npm rebuild @miragon/modeler-shell`; otherwise npm reports
  `modeler-shell-vscode-docker: command not found`.

## Pre-commit hook

`npm ci` installs one Husky hook for the whole repository (`.husky/pre-commit`). It runs
lint-staged with the root config only (`npx lint-staged --config package.json`): ESLint `--fix` and
Prettier on staged TypeScript under `modelers/` and `plugins/`, each file with its nearest
`eslint.config.js`; Prettier alone on staged TypeScript under `packages/` and `test/` and on
JavaScript, JSON, Markdown, YAML, CSS and HTML files anywhere; all under the root `.prettierignore`.
Other files Prettier formats, such as the docs site's TypeScript and Vue or `.mts`, get no task
here: `npm run format:check` in CI checks them. The new-modeler template's own `lint-staged` config
is for the repository the template starts. Without `--config`, lint-staged would pick it for the
template's files, and Prettier would then miss the root's ignore entry for the template's Markdown
and turn `__DISPLAY_NAME__` into emphasis.

The hook then runs `npm run lint` of every modeler with staged code or config, building the shared
packages first on a fresh checkout, and the shared type check when `packages/` or `test/` change. It
runs **no** tests, builds or dependency-cruiser, so before you push run `npm test` and, for what you
touched, the modeler's `depcruise`, `test:browser` and `test:e2e`. `git commit --no-verify` bypasses
the hook; avoid it.

## Commits and pull requests

- **Conventional Commits**, enforced on the pull request title: `feat`, `fix`, `chore`, `docs`,
  `refactor`, `ci`, `build`, `test`, `revert`. The scope names the area: a modeler (`wardley-maps`,
  `event-storming`, `team-topologies`, `context-maps`, `value-chain`), `api`, `shell` or `plugin`,
  e.g. `feat(wardley-maps): add an inertia decorator`, `fix(shell): keep the menu's shortcut chip out of
the accessible name`. A pull request with a single commit must carry the title as that commit's
  subject.
- **Signed commits:** every commit is GPG-signed (`git commit -S`, or `commit.gpgsign`); after a
  rebase or another history rewrite, sign again (`git rebase -S`).
- **Branches:** work on a branch off `main` and open a pull request into `main`; nothing is pushed
  to `main` directly. Keep pull requests small and focused. The required checks and the merge gate
  are described in [docs/ci-and-releases.md](docs/ci-and-releases.md).
- **One conventional commit per pull request on `main`:** pull requests are squash-merged with the
  title as the subject. A merge commit whose body repeats the title would be parsed by
  release-please as a second entry and duplicate the changelog.
- **The squash body and `BEGIN_COMMIT_OVERRIDE`.** The PR body becomes the commit body, but
  GitHub's squash appends a `---------` / `Co-authored-by:` block after it whenever a commit has a
  co-author, so a `Release-As:` footer at the end of the body is no longer a footer and
  release-please ignores it. release-please also takes **one** breaking note per conventional-commit
  message: of several `BREAKING CHANGE:` footers in a squash commit only one reaches the release,
  and a `type(scope)!:` line inside it counts for nothing. To set a version, to contribute more than
  one changelog entry or more than one breaking change, end the PR body with a block that
  release-please reads instead of the squash commit:
  - one conventional-commit message per changelog entry, separated by blank lines; the first is the
    pull request's title with its number;
  - every breaking change in a message of its own, with a one-paragraph `BREAKING CHANGE:` footer
    whose text starts on the footer's own line (text on the next line becomes an empty bullet);
  - no `!` in a header inside the block: a `type(scope)!:` line does not start a new message, and
    the footer before it is lost;
  - the markers nowhere else in the body: release-please reads from the first
    `BEGIN_COMMIT_OVERRIDE` on, so an earlier mention in prose replaces the override with that
    prose and the pull request releases nothing. A `Release-As:` footer inside the block is
    honoured.

  ```text
  BEGIN_COMMIT_OVERRIDE
  feat(team-topologies): explain the notation in the legend and implement modeler-api 1.2 (#129)

  BREAKING CHANGE: parseDocument and documentIdProblems refuse ids that
  name a built-in property of JavaScript objects (constructor, toString,
  __proto__, hasOwnProperty, valueOf, ...).

  feat(team-topologies): refuse an interaction without position or size from version 2 on

  BREAKING CHANGE: parseDocument refuses a version 2 or 3 document with
  an interaction that has no position or size instead of dropping that
  interaction.
  END_COMMIT_OVERRIDE
  ```

  release-please reads the merged pull request's body again on every run, so a block can still be
  added or fixed after the merge, until the release pull request is merged.
  `npm run team-topologies check:release-notes -- <number>` runs release-please's own parser on a
  pull request and names every breaking change that would be lost.

- **Before you open one:** `npm run format:check`, `npm run lint`, `npm test`, and for what you
  touched `npm run <modeler> depcruise`, `test:browser`, `test:e2e` and `npm run build`; for a web
  app change `npm run <modeler> build:webapp` with `npm run check:build -w modelers/<modeler>/apps/webapp`;
  for a change to an extension, a DSL, a schema model or a dependency `npm run <modeler> test:vscode:docker`;
  for a change to `packages/` the modelers' kits (`test:browser`, `test:e2e`), the shell's browser
  tests (`npm run test:browser:shared`) and `npm run publint`.

## Releases

Every package and extension keeps its own version and `CHANGELOG.md`; npm names and extension ids
stay as they were before the suite. [release-please](https://github.com/googleapis/release-please)
keeps one release pull request for the whole suite and assigns a commit to every package whose
files it touches: `feat` releases a minor, `fix` a patch, a breaking change a major (a minor while
the package is on 0.x); `chore`, `ci`, `docs`, `test`, `build` and `refactor` release nothing, and
root-only changes (CI, tooling) release no package. Never edit a version or a `CHANGELOG.md` by
hand. The workflows, what gets published where (npm with trusted publishing, the VS Code
Marketplace and Open VSX after a smoke test of the very VSIX, the web apps on Netlify) and how to
add a package are in [docs/ci-and-releases.md](docs/ci-and-releases.md).

`@miragon/modeler-api` is on 1.x: a new optional surface of the contract or the kit is a `feat`
(minor); a new required member, a stricter law or a breaking change to the kit's harness shape is
breaking, marked with `!` in the PR title (`feat!:`, major). Wording-only changes are `docs`. A kit
case that enforces what the contract text already states is not a stricter law (`fix`, or `feat`
when it comes with a new optional harness field); a requirement the text does not state yet ships
as a RECOMMENDATION whose case only advises, and becomes a law in the next major.

Every new `@deprecated` gets an issue that names its target version as a number, as
[#184](https://github.com/Miragon/modeler-suite/issues/184) does: the release that removes it, or
the package's first breaking release when the removal waits for another breaking change
([#183](https://github.com/Miragon/modeler-suite/issues/183), wardley-dsl's `parseDecorators`).
"The next minor" is no target: [#88](https://github.com/Miragon/modeler-suite/issues/88) and
[#161](https://github.com/Miragon/modeler-suite/issues/161) named it, and the Wardley renderer's
next minor shipped without the removal both times. The pull request that adds the deprecation files
the issue, with the modeler's label where there is one (`modeler: wardley`,
`modeler: event-storming`, …), and refers to it. A deprecation without a tracked removal outlives
the minor it promises: wave 4's cleanup
([#170](https://github.com/Miragon/modeler-suite/issues/170)) takes out aliases and exports that
had stayed past their minor or that no issue tracked.

The first release of a new package needs one manual step on npm: trusted publishing (OIDC) can only
be bound to a package that already exists, so the release job's `npm publish` fails with E404 for a
name npm has never seen. This is how `@miragon/modeler-api@1.0.0` was bootstrapped:

1. Merge the package's first release PR as usual. The tag is created, the publish job fails
   (expected).
2. A maintainer with publish rights to the `@miragon` scope publishes that version once by hand from
   a clean checkout of the tag: `npm ci && npm run build -w <path> && npm publish -w <path>` (2FA
   in the browser; in a non-interactive shell npm aborts the web 2FA with EOTP, so run it in a
   terminal). npm briefly lists a `0.0.0-stage` placeholder while it processes the first upload.
3. Bind the trusted publisher to this repository and the release workflow:
   `npm trust github @miragon/<name> --repo Miragon/modeler-suite --file <release workflow> --env npm --allow-publish`
   (the workflow's file name is in [docs/ci-and-releases.md](docs/ci-and-releases.md)).
4. Re-run the failed publish job. It skips with "already published"; from the next release on it
   publishes without a token.

A trusted publisher names the repository it was bound for. The packages published before the suite
existed were bound for `Miragon/modeler-api` or their modeler's repository, so each one needs the
`npm trust github` binding of step 3 for `Miragon/modeler-suite` before its first release from here.

## Shared packages

Each package under `packages/` owns its `src/`, `test/`, `tsconfig.json`, `tsup.config.ts`,
`README.md` and `LICENSE` (npm packs only the package directory, so the licence is copied in).

```sh
npm run test:shared               # the kit's own conformance suite (reference modeler + saboteurs),
                                  # the shell's unit tests, then the plugin's drift test
npm run build:shared              # tsup: dual ESM/CJS + d.ts
npm run publint                   # the published package shape (exports, types, files)
npm run test:browser:shared       # the shell's browser tests: the PNG export in Chromium and WebKit
npm run test:e2e:shared           # the shell's conformance kit against its demo (Playwright)
```

Adding a case to the contract's kit means adding a saboteur flaw to
`packages/api/test/reference-modeler.ts` and its exact failure set to
`packages/api/test/conformance.test.ts`: a case without a saboteur is a case CI cannot prove to
bite. A legitimate implementation choice the kit must accept (the enriched view-state readback)
gets a variant that must fail nothing. A RECOMMENDATION gets a variant that misses it, fails
nothing and advises exactly once. That suite runs without a DOM; a case that needs one (the keys
case, the colour half of the appearance case) skips there and gets its saboteurs in a jsdom suite
that mounts the reference into `attachedHost()`: `packages/api/test/keys.conformance.test.ts`,
which runs every case, and `packages/api/test/appearance.conformance.test.ts`. The shell's development
loop (demo, e2e, module layout) is in its [README](packages/shell/README.md#development).

## Claude Code plugins

[`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) is the suite's one
marketplace, `modeler-suite`. It lists `modeler-kit` (`plugins/modeler-kit/`) and the modelers'
plugins `wardley-maps-modeler`, `event-storming-modeler` and `team-topologies-modeler`
(`modelers/<modeler>/plugins/<plugin>/`):

```text
/plugin marketplace add Miragon/modeler-suite
/plugin install <plugin>@modeler-suite
```

Plugin and skill names are public and stay as they are. A marketplace entry never carries a
`version`; the modelers' plugins keep theirs in `plugin.json`. After editing a plugin, run
`claude plugin validate .` (the marketplace) and `claude plugin validate <plugin directory> --strict`.
The modelers' skills are guarded by their modelers' tests (Wardley Maps: every OWM example parses
and round-trips, the documented note colours; Team Topologies: the `tt-format` checker against the
schema model); their `CLAUDE.md` says more. Value Chain keeps its skill as a project skill in
`modelers/value-chain/.claude/skills/`.

`plugins/modeler-kit/skills/new-modeler/` holds the skill (`SKILL.md`, `references/`), the template
a new modeler starts from (`assets/template/`, placeholders `__NOTATION__`, `__DISPLAY_NAME__`,
`__EXT__`, `__REPO__`) and the script that fills them (`scripts/new-modeler.mjs`). It lives outside
every package path, so release-please releases nothing for a change there whatever its type; use
the scope `plugin` (`feat(plugin): …`, `fix(plugin): …`).

- **No version.** Neither `plugins/modeler-kit/.claude-plugin/plugin.json` nor its entry in
  `.claude-plugin/marketplace.json` sets `version`, and the drift test fails when one does. Claude
  Code then versions the plugin by the commit of its directory, so every merged change, the
  template pins release-please rewrites in its release commit included, reaches installed copies
  on their next update. A fixed version would hold installed copies until someone bumped it, and
  no one bumps it for release-please's rewrite.
- **Pins.** The template's `@miragon/modeler-api` and `@miragon/modeler-shell` pins follow the
  releases: the shared packages' `extra-files` in the release configuration name the template's
  `package.json` fields they rewrite (root-relative paths, leading `/`). A new pin in the template
  needs a new entry there. Its third-party pins and actions move with Dependabot: the suite's npm
  and github-actions entries in `.github/dependabot.yml` list the template's folder and its
  `.github` folders, so a group pull request (npm minor and patch, every GitHub Actions update)
  updates the suite and the template together. An npm major comes as one pull request per
  dependency (the `npm-major` group, `group-by: dependency-name`) that moves it in the suite and
  in the template at once; a dependency whose folders cannot take the same version still gets a
  pull request per folder. A major is never auto-merged: a maintainer decides it. The template has
  no lockfile, so Dependabot bumps the exact pins of its `package.json` files, and it never touches
  the `@miragon/*` pins. Nor can it run npm's peer-dependency check there (the placeholder names
  are not valid package names), so it may move a template pin that the suite holds back. The
  template's Node-range drift test then fails, because that pin runs ahead of every version the
  suite installs.
- **The drift test** (`test/new-modeler-skill.test.ts`, `npm run test:plugin`, part of `npm test`)
  fails when the template's platform pins differ from the workspace versions or lack their
  `extra-files` entry, when the template pins anything loosely, when a placeholder is undocumented
  or left unfilled, when the manifest of the marketplace or of any plugin it lists is invalid, when
  a marketplace entry sets a `version` or `modeler-kit` sets one, when a skill's frontmatter is
  invalid, when a link of the plugin does not resolve (its links to this repository on GitHub are
  checked against this checkout), when the skill names an identifier that neither package exports
  (foreign names are listed in the test, each with its origin) or, in an `option: { … }` span, a
  member that option does not have, and when the template's TypeScript, its build configs included,
  does not type-check against the packages' current sources (only the two configs that import
  tooling this workspace does not install are left to the template's own lint). `zod` is a root
  devDependency for that last check only (the template's schema model uses it). The test also fails
  when the suite's Dependabot entries miss the template's folder or one of its workflow or
  composite-action folders, when its npm entry does not group the majors by dependency name, and
  when `.github/CODEOWNERS` names no owner to review a folder of the github-actions entry.
- **The VS Code smoke step** (`apps/vscode/test-smoke/` in the template) runs on the shell's
  `./testing/vscode-electron` entry (released in modeler-shell 0.3.0). The drift test type-checks it
  with the rest of the template and fails when it imports the driver from elsewhere, when
  `apps/vscode` pins a shell other than the workspace's, or when the driver's optional peers
  (`playwright-core`, `@vscode/test-electron`) are not exact devDependencies of `apps/vscode`
  inside the shell's peer ranges.
- **The template's CI gate** is part of the drift test too. It fails when `ci-ok` in the
  template's `ci.yml` does not need every other job of it, when a job other than
  `dependency-review` may be skipped, when the VS Code smoke workflow is not the reusable one that
  CI and the weekly run call (with `issues: write` only on the weekly `alert` job), when a job
  that publishes the VSIX does not smoke-test it first, or when a smoke does not keep VS Code's
  logs for a failed run. It runs the scripts of the gate, of the smoke workflow's path check and of
  its `engines.vscode` lookup, taken from the workflow files, with bash, `jq` and git against sample
  results and sample diffs (non-ASCII, quoted and moved paths included). `yaml` is a root
  devDependency for reading the workflows and the skills' frontmatter.
- **The template's Node range** has a drift test of its own (`test/new-modeler-node-range.test.ts`,
  also in `npm run test:plugin`). It fails when an `engines.node` of the template differs from the
  suite's root range, when the template's setup action installs a Node other than the floor the
  suite's setup action picks, when the template's README.md and CLAUDE.md stop naming the range,
  the floor CI runs and Portless's Node 24, and when a third-party pin of the template rejects a
  floor of the range (22.22.2 or 24.15.0) in its own `engines.node`. That range is read from the
  copy this workspace installs: the pinned version, or the closest newer one once the suite has
  moved past it, so a Dependabot update of the suite passes while the template still pins the
  older version. A template pin ahead of every version the suite installs fails: the suite takes
  a version first, or in the same pull request, and the template follows. Two exceptions are
  listed in the test with their reasons: `ovsx` (the suite runs it through `npx`, so it is not
  installed here) and `portless` (it needs Node 24 and runs only `dev:webapp`).
- **The template itself** builds and passes both conformance kits once instantiated, and CI checks
  it: the `template` job packs `packages/api` and `packages/shell` from the branch, creates a
  modeler from the template with the skill's script, copies the design-system files in, installs the
  packs instead of the registry's pins and runs that modeler's `lint`, `depcruise`, `build`, `test`,
  `test:browser`, `test:e2e`, both app builds and the VSIX packaging. It runs when the template, the
  kit, `packages/`, the root files or the CI change. To reproduce it, run `npm run build:shared`,
  then `node .github/scripts/template-instance.mjs <empty folder>` and the checks in that folder
  (`npx playwright install chromium` once). A plain copy with `npm install` takes the registry's
  pins and so tests the last release, not your change. The label `template-vscode-smoke` adds the VS
  Code smoke of that modeler to a pull request; see
  [docs/ci-and-releases.md](docs/ci-and-releases.md). `claude plugin validate .` checks the
  manifests against Claude Code itself; it passes with one warning, modeler-kit's missing `version`,
  which is intended (so not `--strict` on the marketplace, which fails on any warning).

## Design tokens

Every renderer vendors `cd-tokens.generated.css`, `cd-tokens.generated.json` and `cd-canvas.css`
from the `miragon-brand:modeler-tool-design` skill (Miragon/corporate-identity, `assets/`)
unchanged into `modelers/<modeler>/packages/renderer/src/theme/`; the shell keeps a copy for its
tests and demo in `packages/shell/fixtures/tokens/`. To update, copy all three files again, then
follow the modeler's `CONTRIBUTING.md` (vendoring header, hashes in `theme.sync.test.ts`, `MIRAGON`
in `palette.ts`) and run its `test` and `test:e2e`. Never edit or reformat them by hand; Prettier
ignores them.

## brand-lint

[`.miragon/brand.json`](.miragon/brand.json) turns on brand-lint, the design system's linter from
the `miragon-brand` plugin (Miragon/corporate-identity), for the whole suite. With the plugin
installed, Claude Code runs it on every file it writes and hands each hard finding back to Claude.
It needs `miragon-brand` 1.7.0 or later: older releases do not know the status colours the palettes
use and report them. Update with `claude plugin marketplace update miragon` and
`claude plugin update miragon-brand@miragon`. By hand, from the root, give it the repository's
files: its own walk of `.` skips every dot folder and dot file (`.github`, `modelers/*/.claude`,
the template's `.claude`, `.dependency-cruiser.cjs`), which the hook still checks.

```sh
node <miragon-brand plugin>/scripts/brand-lint.mjs $(git ls-files -co --exclude-standard)
```

Fix every hard finding, such as an em dash used as a connector or a colour outside the design
tokens. An intended notation colour goes between `// brand-lint-disable` and `// brand-lint-enable`,
under a comment that says why. Keep the one root file: the hook reads the nearest
`.miragon/brand.json` and never merges, so a file under `modelers/` would replace the suite's rules
for that modeler.
