# CI, releases and publishing

How the suite is checked, released and published: one CI with one merge gate, one release
pull request for every package, extension and web app, and one Netlify site per web app. The
workflows live in [`.github/workflows/`](../.github/workflows), their logic in
[`.github/scripts/`](../.github/scripts), so it runs locally too.

| Event                        | Workflow                                                                                                                                                                              | Jobs                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| pull request                 | [`ci.yml`](../.github/workflows/ci.yml)                                                                                                                                               | `changes`, then what it reaches: shared, per modeler, template, docs, VS Code and Orca smokes; always-on checks; `ci-ok`, the merge gate |
| pull request                 | [`pr-title.yml`](../.github/workflows/pr-title.yml), [`release-notes.yml`](../.github/workflows/release-notes.yml)                                                                    | `validate-pr-title` (required next to `ci-ok`), `breaking-changes`                                                                       |
| pull request, `main`, weekly | [`codeql.yml`](../.github/workflows/codeql.yml)                                                                                                                                       | `analyze` (not for a pull request that changes only prose)                                                                               |
| Dependabot pull request      | [`dependabot-automerge-eligibility.yml`](../.github/workflows/dependabot-automerge-eligibility.yml), then [`dependabot-automerge.yml`](../.github/workflows/dependabot-automerge.yml) | `label-eligible`, then `auto-merge` of npm patch and minor updates                                                                       |
| push to `main`               | [`ci.yml`](../.github/workflows/ci.yml), [`release-please.yml`](../.github/workflows/release-please.yml), [`docs.yml`](../.github/workflows/docs.yml)                                 | CI as on a pull request; `plan`, `build / …`, `publish / …` when a release pull request is merged; the docs deploy when `docs/` changed  |
| Mondays                      | [`smoke-weekly.yml`](../.github/workflows/smoke-weekly.yml)                                                                                                                           | every modeler's VS Code smoke and every Orca plugin's smoke; an issue when one fails                                                     |

## CI and the merge gate

[`ci.yml`](../.github/workflows/ci.yml) runs on every pull request, every push to `main` and by hand. A new push to a pull request cancels its running checks. Pushes to `main` share
one group: a running check of `main` always finishes, and of the pushes waiting behind it only the
newest runs, so a burst of merges does not queue a full run per commit. CodeQL does the same; no
other run is ever cancelled or replaced.

### What a change runs

The first job, `changes` (`.github/scripts/ci-paths.sh affected`), compares the change with its base
commit and decides which jobs it can break:

| Changed path                                                                                                                                                                                      | Runs                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `modelers/<m>/**`                                                                                                                                                                                 | the jobs of modeler `<m>` and its smokes              |
| `packages/**`, `.github/workflows/{ci,vscode-smoke,orca-smoke}.yml`, `.github/{actions,scripts}/**`, any other root file                                                                          | the shared jobs, the template job and every modeler   |
| `plugins/modeler-kit/**`, `modelers/event-storming/packages/renderer/src/theme/**`                                                                                                                | the template job (and, for the theme, Event Storming) |
| `docs/**`                                                                                                                                                                                         | the docs job                                          |
| `modelers/<m>/docs/**`, Markdown at the root or at the top of a modeler, `LICENSE`, `plugins/**`, `test/**`, `extensions/**`, `.claude-plugin/**`, `.husky/**`, every other file under `.github/` | nothing but the always-on jobs                        |

Markdown elsewhere is no documentation here: skills under `modelers/<m>/plugins/` feed drift tests,
and a package or an extension ships its README. The always-on jobs read the rest: the
repository-level tests in `test/` check the plugins, the release config, the extension pack,
every modeler's manifests and boundaries, the brand-lint config and the workflows that CI does not
run, so a path that only they read needs no rule. The template job runs when the design-system
files it borrows change. A run without a base commit (started by hand, a new branch) and a base
that cannot be fetched run everything; so does any path no rule names.

### Jobs

- **Always** (`format-check`, `pin-check`, `shared-test`, `dependency-review`): Prettier over the
  whole suite; exact pins in every `package.json` and every Playwright pin equal to the root's; the
  type check of modeler-api, modeler-shell and the root tests, their unit tests plus `test:plugin`
  (the repository-level checks in `test/`: the modeler-kit and release-config drift tests, the
  manifests and skills of every plugin in the marketplace, every modeler's boundaries, the
  Dependabot auto-merge workflow, the path decisions of `ci-paths.sh` and the verdict of `ci-ok`),
  build, `publint` and the extension pack; `dependency-review` on pull requests.
- **Shared** (`shared-test-browser`, `shared-e2e`): the shell's browser tests
  (`test:browser:shared`: the PNG export and the palette skin in Chromium and WebKit, in the
  Playwright image of the root's `playwright` pin); the shell's Playwright suite in four shards,
  each of which runs a quarter of the other tests and then a quarter of the saboteurs that run the
  whole kit (sharded together, those all fell into one shard).
- **Per modeler**, a matrix over the modelers the change reaches: `modeler-check` (ESLint, type
  check, dependency-cruiser, build, unit tests, web app build and `check:build`, VSIX via
  `package:vscode`), `modeler-test-browser` and `modeler-e2e` (in the Playwright image of the
  root's `playwright` pin). Every job builds the shared packages first. The Node version is the
  floor of the root's `engines.node`, raised to the modeler's own (Node 24.15.0 for context-maps).
- **Template** (`template`): a modeler created from the new-modeler template, to run what nothing
  else runs. The shared packages are built and packed as they are published (`npm pack` of
  `packages/api` and `packages/shell`, so a release pull request tests the unreleased versions),
  `.github/scripts/template-instance.mjs` writes the template into a folder of the runner with the
  skill's `new-modeler.mjs`, copies the vendored `cd-tokens.generated.*` and `cd-canvas.css` of
  Event Storming's renderer into it (the template has none), points every dependency on the shared
  packages at the packs, installs without a lockfile, as a new modeler's first install does, and
  checks the lockfile for a copy from the registry. Then the instance runs `lint`, `depcruise`,
  `build`, `test`, `test:browser` (the contract's conformance kit), `test:e2e` (the shell's kit on
  the `web` and `ide` hosts), `build:webapp`, `check:build`, `build:vscode` and the VSIX
  (`package`), in the Playwright image of the root's `playwright` pin. The script runs locally too
  (`npm run build:shared`, then `node .github/scripts/template-instance.mjs <empty folder>`;
  `npx playwright install chromium` once). The drift test of `test:plugin` only type-checks the
  template against the sources.
- **Docs** (`docs`): the VitePress site in `docs/` as [`docs.yml`](../.github/workflows/docs.yml)
  deploys it from `main`: the vendored Miragon docs kit checked unchanged, and a build, which fails
  on a dead link.
- **VS Code smoke** ([`vscode-smoke.yml`](../.github/workflows/vscode-smoke.yml)), called once with
  the modelers the change reaches: each packaged extension in a real VS Code under `xvfb`, on the
  newest stable release and on the oldest that `engines.vscode` accepts. Every run takes all of the
  driver's steps, its default since modeler-shell 0.8: besides open, edit, save, undo and the
  themes, the zoom and selection keys, the view and selection across a redo and an undo, and the
  workbench steps (reduced motion, a hidden tab and Developer: Reload Window). So does the smoke the
  release runs on the VSIX it publishes.
- **Orca smoke** ([`orca-smoke.yml`](../.github/workflows/orca-smoke.yml)), called once with the
  modelers the change reaches that have an Orca plugin: each plugin in the newest Orca and in the
  oldest its `engines.orca` accepts.

### `ci-ok`

`ci-ok` (`.github/scripts/ci-gate.sh`) is the merge gate; the ruleset requires it and the PR title
check `validate-pr-title`. It needs every other job of `ci.yml` (and fails if one is missing from
its `needs`), and it fails on any failed or cancelled job. Every job that needs another needs
`changes` alone, so a job skipped because `changes` failed comes with that failure, and a skip
passes.

### Template smoke

`template-vscode-smoke` runs the VS Code smoke of a modeler created from the template (the same
instance as the `template` job, its `test:vscode` under `xvfb-run -a`) on the newest stable VS Code
and on the oldest that the template's `engines.vscode` accepts, with every step of the driver like
the VS Code smoke. It runs whenever the `template` job does, on the runner image rather than the
Playwright image, because VS Code needs the image's X server and GTK libraries.

The VS Code version and its cache come from [`.github/actions/vscode`](../.github/actions/vscode),
the Orca version and its extracted AppImage from [`.github/actions/orca`](../.github/actions/orca),
for every smoke alike.

### Weekly smoke

[`smoke-weekly.yml`](../.github/workflows/smoke-weekly.yml) runs every modeler's VS Code smoke and
every Orca plugin's smoke on Mondays, with the lists of `ci-paths.sh modelers`, because a new VS Code
or Orca release can break them without a change here. A failure opens, or comments on, the issue
"Smoke: the weekly run failed", which names the smoke that failed.

## Releases

[release-please](https://github.com/googleapis/release-please) keeps one release pull request,
`chore: release main`, for the whole suite. Every package keeps its own version, changelog and tag:

| Component path                   | Component (tag `<component>-v<version>`) | Publishes                              |
| -------------------------------- | ---------------------------------------- | -------------------------------------- |
| `packages/api`, `packages/shell` | `modeler-api`, `modeler-shell`           | npm                                    |
| `modelers/<m>/packages/<p>`      | `<m>-<p>`, e.g. `wardley-renderer`       | npm                                    |
| `modelers/<m>/apps/vscode`       | `<m>-vscode`                             | VS Code Marketplace, Open VSX          |
| `modelers/<m>/apps/webapp`       | `<m>-webapp`                             | nothing (Netlify deploys `main`)       |
| `modelers/team-topologies`       | `team-topologies`                        | its two npm packages and its extension |

for `<m>` in event-storming, context-maps, value-chain and c4; Wardley Maps lives in
`modelers/wardley-maps` and keeps its released components `wardley-<p>`, `wardley-vscode` and
`wardley-webapp`. Team Topologies stays in
lockstep: one component whose `extra-files` move every one of its packages, the plugin and the
marketplace entry to the same version, with its changelog in `modelers/team-topologies/CHANGELOG.md`.
Every other changelog stays in its package.

Business Model Canvas (`modelers/business-model-canvas`) **publishes nothing to npm**: every one of
its workspaces is `private`, so `release-plan.mjs` publishes none of its packages, which its web app,
VS Code extension and Orca plugin bundle from source. Its seven components still get a version, a
changelog and a tag on every release: `business-model-canvas-schema-model`, `-dsl`, `-renderer`,
`-ide-editor`, `-vscode` (Marketplace and Open VSX), `-webapp` (nothing) and `-orca` (the catalog
for Orca, its `extra-files` move `orca-plugin.json`). Each starts with `initial-version` 0.1.0;
remove that key once the components have been released.

- **The squash title decides.** A pull request lands as one commit whose message is its title and
  description; the title's type decides the bump (`feat` minor, `fix` patch, before 1.0 a breaking
  change is a minor). A commit counts for every component whose files it touches.
  `BEGIN_COMMIT_OVERRIDE … END_COMMIT_OVERRIDE` in the description replaces the commit message;
  the [`Release notes`](../.github/workflows/release-notes.yml) check makes sure every breaking
  change reaches the changelog.
- **Dependents release with their dependencies.** The `node-workspace` plugin bumps every component
  that depends on a released one (a patch, with a "Dependencies" note), so a fix in modeler-shell
  releases every extension and web app that bundles it.
- **Pins and the lockfile.** The plugin moves a component's pins in other components'
  `package.json`. Everything else is an `extra-files` entry of the pinned component: the pins in
  workspaces that are no component (each `e2e`, team-topologies' lockstep packages, the
  modeler-kit template) and every version and pin in the root `package-lock.json`, because the
  plugin leaves the lockfile alone once any `extra-files` entry points into it. The release-config
  drift test ([`test/release-config.test.ts`](../test/release-config.test.ts)) fails when one is
  missing or stale.

### `BEGIN_COMMIT_OVERRIDE`

The PR body becomes the squash commit's body, but GitHub appends a `Co-authored-by:` block after it
whenever a commit has a co-author, so a `Release-As:` footer at the end of the body is no footer
any more. release-please also takes **one** breaking note per commit message. To set a version, or
to contribute more than one changelog entry or breaking change, end the PR body with an override
block:

- one conventional-commit message per changelog entry, separated by blank lines; the first is the
  pull request's title with its number;
- every breaking change in a message of its own, its `BREAKING CHANGE:` text starting on the
  footer's own line;
- no `!` in a header inside the block (it starts no new message, and the footer before it is lost);
- the markers nowhere else in the body: release-please reads from the first `BEGIN_COMMIT_OVERRIDE`
  on. A `Release-As:` footer inside the block is honoured.

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

release-please reads the merged pull request's body on every run, so a block can be added or fixed
after the merge, until the release pull request is merged.
`npm run check:release-notes -- <number>` runs release-please's parser on a pull request and names
every breaking change that would be lost. The parser comes from the root's `release-please`
devDependency, which must match the version the Release workflow's action bundles;
[`test/release-notes/parser-version.test.ts`](../test/release-notes/parser-version.test.ts) fails when
they drift.

### Deprecations

Every new `@deprecated` gets an issue that names its target version as a number, as
[#184](https://github.com/Miragon/modeler-suite/issues/184) does: the release that removes it, or
the package's first breaking release ([#183](https://github.com/Miragon/modeler-suite/issues/183)).
"The next minor" is no target: [#88](https://github.com/Miragon/modeler-suite/issues/88) and
[#161](https://github.com/Miragon/modeler-suite/issues/161) named it, and the minor shipped without
the removal both times. The pull request that adds the deprecation files the issue, with the
modeler's label (`modeler: wardley`, …).

## Publishing

[`release-please.yml`](../.github/workflows/release-please.yml) runs on every push to `main`. When a
release pull request is merged, it tags each released component, creates its GitHub release and
publishes exactly what released (`.github/scripts/release-plan.mjs`: every public workspace, every
extension and every Orca plugin at or below a released component's path):

Every target takes the same three steps. A **build** job without an environment builds and checks
it; then each **publish** job, which needs every build job, waits for its environment's approval,
so the environments `npm`, `vscode-marketplace` and `orca` ask at the same moment and one "Review
deployments" approves all of them. If one build fails, nothing is published; re-running the failed
jobs builds again and then publishes.

- **npm**: `build / npm (<package>)` builds the package (`publint` for the shared packages) and
  packs it with `npm pack`; `publish / npm (<package>)` publishes that very tarball in the
  environment `npm`, with OIDC trusted publishing and provenance, on Node 24 (npm 11.5.1 or
  later). A version already on the registry is skipped; a package that was never published fails
  with a hint (publish it once by hand, then attach the trusted publisher). After `npm publish` the
  job waits up to five minutes for the registry to list the version: that, not the exit status of
  `npm publish`, is the verdict.
- **VS Code**: `build / vscode (<extension>)` builds and packs the VSIX and smoke-tests that very
  VSIX in the newest stable VS Code; `publish / vscode-marketplace (<extension>)` and
  `publish / open-vsx (<extension>)` upload it in the environment `vscode-marketplace` with
  `vsce publish --oidc` or `ovsx publish --trusted-publishing` (trusted publishing on both, no
  token), both with `--skip-duplicate`, so a re-run passes a marketplace that has the version
  already.
- **Orca**: `build / orca (<plugin>)` builds the plugin folder (a workspace with an
  `orca-plugin.json` and its own release-please component `<modeler>-orca`, which also bumps the
  manifest's version; Team Topologies releases its plugin in lockstep with the modeler's
  component), smoke-tests exactly that folder in the newest Orca (`ORCA_SMOKE_PLUGIN`) and uploads
  it with its release tag and changelog section (`release.json`) as the artifact
  `orca-plugin-<id>`. `publish / orca`, in the environment `orca`, hands all of them at once to
  the action `publish-plugin` of [miragon/orca-modelers](https://github.com/miragon/orca-modelers),
  the one catalog of every Miragon modeler for Orca. The action runs with the release-please app's
  token (`RELEASE_PLEASE_APP_CLIENT_ID`, `RELEASE_PLEASE_APP_PRIVATE_KEY`, scoped to that
  repository). It opens a pull request with the plugin folders and then one with their catalog
  entries (`orca plugin release-entry`), and squash-merges each once that repository's `validate`
  passes, so a release is one catalog change and one tag there. A failed publish closes its pull
  request; re-running `publish / orca` retries and skips the plugin folders when they are on main
  of miragon/orca-modelers already. A publish from another source repository is not serialized
  with this one (concurrency groups are per repository): a pull request that conflicts fails, and
  a re-run starts from the new main. No build output lands in this repository: Orca installs the
  files of the pinned commit in miragon/orca-modelers.

A release runs from `main` only. Started by hand with `dry_run`, on any branch, the workflow runs
every build job for every package, extension and plugin and publishes nothing.

### The first release of a new npm package

Trusted publishing can only be bound to a package that already exists, so the first `npm publish`
of a new name fails with E404. This is how `@miragon/modeler-api@1.0.0` was bootstrapped:

1. Merge the package's first release PR as usual. The tag is created, the publish job fails.
2. A maintainer with publish rights to `@miragon` publishes that version once from a clean
   checkout of the tag: `npm ci && npm run build -w <path> && npm publish -w <path>`, in a terminal
   (npm aborts the web 2FA with EOTP in a non-interactive shell).
3. Bind the trusted publisher:
   `npm trust github @miragon/<name> --repo Miragon/modeler-suite --file release-please.yml --env npm --allow-publish`.
4. Re-run the failed publish job. It skips with "already published"; later releases publish
   without a token.

Packages published before the suite existed were bound for their old repository and need the
binding of step 3 for `Miragon/modeler-suite` before their first release from here.

### Trusted publishing on the VS Code Marketplace and Open VSX

Both marketplaces trade the job's GitHub OIDC token (`id-token: write`) for a short-lived
publishing token, so the workflow stores no token for either.

The **VS Code Marketplace** (`vsce publish --oidc`, vsce 4.1.0 or later) needs one Trusted
Publishing policy on the publisher `miragon-gmbh` (publisher management page → Trusted Publishing →
Create), which covers every extension of the publisher:

| Field            | Value                |
| ---------------- | -------------------- |
| Repository owner | `Miragon`            |
| Repository       | `modeler-suite`      |
| Workflow         | `release-please.yml` |
| Environment      | `vscode-marketplace` |

The policy belongs to the publisher, so a new extension of `miragon-gmbh` publishes with it from
its first release.

**Open VSX** (`ovsx publish --trusted-publishing`, ovsx 1.3.0 or later) registers a trusted
publisher per extension: as a namespace owner of `miragon-gmbh`, Settings → Trusted Publishers
(`https://open-vsx.org/user-settings/trusted-publishers`), namespace `miragon-gmbh`, the extension,
provider GitHub Actions, with the same four values (organization `Miragon`, repository
`modeler-suite`, workflow filename `release-please.yml`, environment `vscode-marketplace`). A
registration cannot be edited, only deleted and created again. Like npm, it binds only to an
extension that exists, so the first release of a new extension needs one manual step:

1. Merge the extension's first release PR. `publish / open-vsx (<extension>)` fails.
2. A namespace owner downloads the artifact `vsix-<extension>` of that run and publishes it once
   with an Open VSX access token: `npx --yes ovsx@1.3.0 publish --packagePath <file>.vsix -p <token>`.
3. Register the trusted publisher for the extension as above.
4. Re-run the failed publish job. It passes with `--skip-duplicate`; later releases publish without
   a token.

## Web apps on Netlify

Each web app is a Netlify site configured by `modelers/<m>/netlify.toml`: Netlify installs the
workspace at the root, builds the shared packages and the web app, and publishes
`modelers/<m>/apps/webapp/dist`. Its `ignore` command skips the build unless the modeler, the shared
packages or the root install changed. Site settings (Site configuration → Build & deploy):

| Setting           | Value                                             |
| ----------------- | ------------------------------------------------- |
| Repository        | `Miragon/modeler-suite`, production branch `main` |
| Base directory    | empty (the repository root)                       |
| Package directory | `modelers/<m>`                                    |
| Build command     | empty (from `netlify.toml`)                       |
| Publish directory | empty (from `netlify.toml`)                       |

## Other workflows

- [`pr-title.yml`](../.github/workflows/pr-title.yml) (`validate-pr-title`): the title is a
  Conventional Commit. The suite squashes with the PR title, so no commit message of a pull request
  lands on `main`.
- [`codeql.yml`](../.github/workflows/codeql.yml): JavaScript and TypeScript, on pull requests that
  change more than prose, on `main` and weekly.
- [`dependabot.yml`](../.github/dependabot.yml): npm weekly (minor and patch grouped, the suite's
  `@miragon/*` workspaces ignored), GitHub Actions monthly. Both entries also cover the new-modeler
  template (its `package.json` files, workflows and composite action), so a group pull request moves
  the suite and the template together. An npm major gets one pull request per dependency
  (`npm-major`, `group-by: dependency-name`): it moves that dependency in the suite and in the
  template at once, because the template's Node-range drift test fails a template pin that runs
  ahead of every version the suite installs. Dependabot still opens a pull request per directory
  for a dependency whose directories cannot take the same version. A major is never auto-merged:
  the update type of a group pull request is its highest one, so a maintainer decides each major.
  [`dependabot-automerge-eligibility.yml`](../.github/workflows/dependabot-automerge-eligibility.yml)
  labels npm patch and minor updates `auto-merge`, and
  [`dependabot-automerge.yml`](../.github/workflows/dependabot-automerge.yml) merges them once green
  and once auto-merge is enabled for the repository. It enables auto-merge with a token of the
  release-please app: GitHub merges in the name of whoever enabled it, and a merge made with
  `GITHUB_TOKEN` starts no workflow on `main` (no `ci-ok`, no CodeQL, no release-please). The token
  gets `contents` and `pull-requests` only and is used for labelled npm updates only: GitHub merges
  a change to `.github/workflows` only for a token with the `workflows` permission, so GitHub
  Actions updates are merged by hand, and so is any ecosystem added to `dependabot.yml` until the
  eligibility workflow names it. The work is split because a run Dependabot starts on
  `pull_request` gets only Dependabot secrets: the eligibility workflow decides there with
  `GITHUB_TOKEN`, and the merge workflow runs on its `workflow_run`, which runs from `main` with the
  Actions secrets, so it must never check out or run code of the pull request. Neither needs an
  Actions policy: GitHub's default block from 2 December 2026 covers `pull_request_target` only.
