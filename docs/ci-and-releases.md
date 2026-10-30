# CI, releases and publishing

How the suite is checked, released and published: one CI with one merge gate, one release
pull request for every package, extension and web app, and one Netlify site per web app. The
workflows live in [`.github/workflows/`](../.github/workflows), their logic in
[`.github/scripts/`](../.github/scripts), so it runs locally too.

## CI and the merge gate

[`ci.yml`](../.github/workflows/ci.yml) runs on every pull request, every push to `main`, the merge
queue and by hand. A new push to a pull request cancels its running checks; no other run is ever
cancelled.

### What a change runs

The first job, `changes` (`.github/scripts/ci-paths.sh affected`), compares the change with its base
commit and decides which jobs it can break:

| Changed path                                                                                                   | Runs                                                    |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `modelers/<m>/**`                                                                                              | the jobs of modeler `<m>`                               |
| `modelers/<m>/plugins/**`                                                                                      | the jobs of modeler `<m>` and the shared jobs           |
| `packages/**`, `.github/**`, root `package.json`, `package-lock.json`, `.npmrc`, any other root file or folder | the shared jobs, the template job and all five modelers |
| `plugins/modeler-kit/**`                                                                                       | the shared jobs and the template job                    |
| `plugins/**`, `test/**`, `.claude-plugin/**`                                                                   | the shared jobs                                         |
| `docs/**`, `modelers/<m>/docs/**`, Markdown at the root or at the top of a modeler, `LICENSE`, `.husky/**`     | nothing but the always-on jobs                          |

Markdown elsewhere is no documentation here: skills under `plugins/` feed drift tests, and a
package or an extension ships its README. A modeler's Claude plugin reaches the shared jobs because
`test:plugin` checks the manifest and the skills of every plugin in the marketplace. The template
job also runs when the design-system files it borrows change
(`modelers/event-storming/packages/renderer/src/theme/**`). A run without a base commit (started
by hand, a new branch) and a base that cannot be fetched run everything; so does any path no rule
names.

### Jobs

- **Shared** (`shared-lint`, `shared-test`, `shared-test-browser`, `shared-e2e`): the type check of
  modeler-api, modeler-shell and the root tests; their unit tests plus `test:plugin` (the
  repository-level checks in `test/`: the modeler-kit and release-config drift tests, the manifests
  and skills of every plugin in the marketplace, every modeler's boundaries, the Dependabot
  auto-merge workflow and the path decisions of `ci-paths.sh affected`), build and `publint`; the
  shell's browser tests (`test:browser:shared`: the PNG export in Chromium and WebKit, in the
  Playwright image of the root's `playwright` pin); the shell's Playwright suite in four
  shards, each of which runs a quarter of the other tests and then a quarter of the saboteurs that
  run the whole kit (sharded together, those all fell into one shard).
- **Per modeler**, a matrix over the modelers the change reaches, each job named
  `<modeler> / <check>`: `lint` (ESLint, type check, dependency-cruiser), `test` (build, unit tests),
  `test:browser` and `e2e` (in the Playwright image of the root's `playwright` pin), `build` (web app
  build and `check:build`, VSIX via `package:vscode`). Every job builds the shared packages first.
  The Node version is the floor of the root's `engines.node`, raised to the modeler's own (Node
  24.15.0 for context-maps).
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
- **Always**: `format-check` (Prettier over the whole suite), `pin-check` (exact pins in every
  `package.json`, every Playwright pin equal to the root's), `dependency-review` (pull requests),
  `release-bootstrap` (see [the imported history](#the-imported-history)).
- **VS Code smoke** ([`vscode-smoke.yml`](../.github/workflows/vscode-smoke.yml)), called once per
  modeler: the packaged extension in a real VS Code under `xvfb`, on the newest stable release and on
  the oldest that `engines.vscode` accepts. The workflow decides itself whether the change can reach
  that VSIX (`ci-paths.sh vscode-smoke <modeler>`); when it cannot, a job that succeeds stands in, so
  the smoke always reports. Every run takes all of the driver's steps, its default since
  modeler-shell 0.8: besides open, edit, save, undo and the themes, the zoom and selection keys, the
  view and selection across a redo and an undo, and the workbench steps (reduced motion, a hidden
  tab and Developer: Reload Window). So does the smoke the release runs on the VSIX it publishes.

### `ci-ok`

`ci-ok` (`.github/scripts/ci-gate.sh`) is the one check the ruleset requires. It needs every other
job of `ci.yml` (and fails if one is missing from its `needs`), and it fails on any failed or
cancelled job and on every skip except these, each checked against its reason:

| Job                                                               | Skipped by design when                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| `dependency-review`                                               | the run is no pull request                                            |
| `shared-lint`, `shared-test`, `shared-test-browser`, `shared-e2e` | `changes` succeeded and reports no shared change (`shared=false`)     |
| `template`                                                        | `changes` succeeded and reports no template change (`template=false`) |
| the five `modeler-*` jobs                                         | `changes` succeeded and reports no modeler (`modelers=[]`)            |

A skip after a failed or cancelled `changes` is never accepted, and the smoke never skips.

### Template smoke (opt-in)

[`template-vscode-smoke.yml`](../.github/workflows/template-vscode-smoke.yml) runs the VS Code
smoke of a modeler created from the template (the instance of the `template` job, its
`test:vscode` under `xvfb-run -a`) on the newest stable VS Code and on the oldest that the
template's `engines.vscode` accepts, with every step of the driver like the VS Code smoke.
It downloads VS Code twice, so it is no part of `ci-ok`: add the label `template-vscode-smoke` to a
pull request (it runs again on every push while the label stays; adding another label starts no
run), or start the workflow by hand on a branch. The label is created once with
`gh label create template-vscode-smoke`.

### Weekly smoke

[`vscode-smoke-weekly.yml`](../.github/workflows/vscode-smoke-weekly.yml) runs every modeler's smoke
on Mondays; a failure opens, or comments on, the issue "VS Code smoke: the weekly run failed".

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

for `<m>` in event-storming, context-maps and value-chain; Wardley Maps lives in
`modelers/wardley-maps` and keeps its released components `wardley-<p>`, `wardley-vscode` and
`wardley-webapp`. Team Topologies stays in
lockstep: one component whose `extra-files` move every one of its packages, the plugin and the
marketplace entry to the same version, with its changelog in `modelers/team-topologies/CHANGELOG.md`.
Every other changelog stays in its package.

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

### The imported history

The modelers came with their full history, whose `feat` and `fix` commits must not reach the new
changelogs. `bootstrap-sha` in [`release-please-config.json`](../release-please-config.json) names
the migration's last commit before CI and releases moved to the root: as long as a component has
no release in this repository, release-please collects commits only back to it. Once every
component has released here it has no effect, and it can go.

The `release-bootstrap` job guards it: the commit has to be on the branch (else release-please would
read the whole history), and no releasable commit to a component with a release here may lie
before it or beside it (one merged to `main` next to the migration), because release-please could
walk past such a commit. Land the migration with its history (a merge, not a squash), after
releasing anything still unreleased on `main`.

## Publishing

[`release-please.yml`](../.github/workflows/release-please.yml) runs on every push to `main`. When a
release pull request is merged, it tags each released component, creates its GitHub release and
publishes exactly what released (`.github/scripts/release-plan.mjs`: every public workspace and
every extension at or below a released component's path):

- **npm**, one job per package in the environment `npm`, with OIDC trusted publishing and
  provenance, on Node 24 (npm 11.5.1 or later). A version already on the registry is skipped; a
  package that was never published fails with a hint (publish it once by hand, then attach the
  trusted publisher). After `npm publish` the job waits up to five minutes for the registry to list
  the version: that, not the exit status of `npm publish`, is the verdict.
- **VS Code**, one job per extension and marketplace in the environment `vscode-marketplace`: build,
  `vsce package`, the smoke test of that very VSIX in VS Code, then `vsce publish` (secret
  `VSCE_PUBLISH`) or `ovsx publish` (secret `OVSX_PUBLISH`).

Started by hand with `dry_run`, the workflow releases nothing: it packs every npm package
(`npm publish --dry-run`) and packs and smoke-tests every extension.

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
  Conventional Commit, and a single-commit pull request's commit says the same.
- [`codeql.yml`](../.github/workflows/codeql.yml): JavaScript and TypeScript, on pull requests,
  `main` and weekly.
- [`dependabot.yml`](../.github/dependabot.yml): npm weekly (minor and patch grouped, the suite's
  `@miragon/*` workspaces ignored), GitHub Actions monthly. Both entries also cover the new-modeler
  template (its `package.json` files, workflows and composite action), so a group pull request moves
  the suite and the template together. An npm major gets one pull request per dependency
  (`npm-major`, `group-by: dependency-name`): it moves that dependency in the suite and in the
  template at once, because the template's Node-range drift test fails a template pin that runs
  ahead of every version the suite installs. Dependabot still opens a pull request per directory
  for a dependency whose directories cannot take the same version. A major is never auto-merged:
  the update type of a group pull request is its highest one, so a maintainer decides each major.
  [`dependabot-automerge.yml`](../.github/workflows/dependabot-automerge.yml) merges green npm
  patch and minor updates once auto-merge is enabled for the repository. It enables auto-merge with
  a token of the release-please app: GitHub merges in the name of whoever enabled it, and a merge
  made with `GITHUB_TOKEN` starts no workflow on `main` (no `ci-ok`, no CodeQL, no release-please).
  The token gets `contents` and `pull-requests` only and is minted for npm updates only: GitHub
  merges a change to `.github/workflows` only for a token with the `workflows` permission, so
  GitHub Actions updates are merged by hand, and so is any ecosystem added to `dependabot.yml`
  until the workflow names it. It runs on `pull_request_target`, because a run Dependabot starts on
  `pull_request` gets only Dependabot secrets; that event runs the workflow from `main` with the
  Actions secrets, so the workflow must never check out or run code of the pull request. GitHub
  blocks `pull_request_target` in public repositories from 2 December 2026 unless an Actions policy
  (Settings → Actions → Policies) allows it, so the suite needs one that allows the event for this
  workflow.
