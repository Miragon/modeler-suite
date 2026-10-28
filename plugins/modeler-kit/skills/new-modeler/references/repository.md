# Repository

## Layout

An npm workspace, the `workspaces` array in build order. Every package owns `src/`, `test/`, a
`tsconfig.json` that extends the root `tsconfig.base.json`, and its `package.json`.

| Path                    | Package                            | Runs in                       | Built with                    |
| ----------------------- | ---------------------------------- | ----------------------------- | ----------------------------- |
| `packages/schema-model` | `@miragon/<notation>-schema-model` | Node, workers, extension host | tsup, ESM + CJS + d.ts        |
| `packages/dsl`          | `@miragon/<notation>-dsl`          | Node, workers, extension host | tsup                          |
| `packages/renderer`     | `@miragon/<notation>-renderer`     | the browser                   | Vite library mode + d.ts, CSS |
| `apps/webapp`           | private                            | the browser                   | Vite                          |
| `apps/vscode`           | private, the VS Code extension     | extension host + webview      | esbuild, two bundles          |
| `e2e`                   | private                            | Playwright                    | -                             |

Optional packages the five added where their notation needed them: `transforms` (pure
`Document → Document` functions, DOM-free: Wardley, Event Storming), a converter for a foreign
format (`cml` in Context Maps), shared app UI (`ui` in Team Topologies). A JSON notation may skip
`dsl` and keep parse and serialize in `schema-model` (Value Chain, Team Topologies).

The apps and `e2e` resolve the workspace packages **from source** (Vite and esbuild aliases, `paths`
in their tsconfigs), so the dev servers and e2e need no build; unit tests and `test:browser`
resolve them through `node_modules` to `dist`, so `npm run build` comes first.

## Scripts

`build`, `build:webapp`, `build:vscode`, `typecheck` (every tsconfig: root, the web app's Vite
config, `apps/vscode`, `e2e`), `lint` (ESLint, then `typecheck`), `format`, `format:check`, `test`
(Vitest project `unit`), `test:browser` (Vitest project `browser`, Chromium through
`@vitest/browser-playwright`), `test:e2e`, `test:vscode-smoke` (the built extension in a real VS
Code, see [shell](shell.md#the-vs-code-smoke-test)), `test:vscode` (builds, then
`test:vscode-smoke`), `test:vscode:docker` (`test:vscode` in a Linux container, no window on the
host), `depcruise`, `dev:webapp`
(Portless, which needs Node 24.15.0 or later; `dev:webapp:plain` for plain Vite on 5180, on Node 22
as well), `dev:vscode`. The Husky pre-commit hook runs lint-staged and `npm run lint` only.

## The DOM boundary

`schema-model`, `dsl` and any `transforms` run where there is no DOM (the VS Code extension host
computes diagnostics with them, Design IQ's server parses with them). They never import
`diagram-js`, `tiny-svg` or `min-dom`, never touch `window` or `document`, and take only **types**
from `@miragon/modeler-api`. No package under `packages/` imports `@miragon/modeler-shell`:
renderers stay host-neutral, only the apps (and `e2e`) mount the shell. Enforced twice, so a
violating import fails two jobs:

- ESLint `no-restricted-imports` (with `allowTypeImports` for the contract) and
  `no-restricted-globals` on the DOM-free packages, the shell ban on `packages/renderer/src`
  ([`eslint.config.js`](../assets/template/eslint.config.js));
- dependency-cruiser rules `dom-free-no-diagram-js`, `dom-free-no-renderer`, `packages-no-shell`,
  `dom-free-contract-types-only` and `no-circular`
  ([`.dependency-cruiser.cjs`](../assets/template/.dependency-cruiser.cjs)).

## Pins and peers

- Every `dependencies` and `devDependencies` entry is an exact version, internal
  `@miragon/<notation>-*` references included (they pin the referenced package's current version;
  release-please's `node-workspace` plugin bumps them). `.npmrc` has `save-exact=true`; the CI job
  `pin-check` runs [miragon/pin-npm-dependencies](https://github.com/Miragon/pin-npm-dependencies).
  No `file:` or tarball references.
- The exception: runtime libraries whose identity a consumer must share are **ranged
  `peerDependencies`**: `zod` (schema-model, and the renderer that re-exports its types),
  `diagram-js`, `didi` and `tiny-svg` (renderer). Two copies break `instanceof`, zod schema
  identity and diagram-js's injector. Each peer has an exact `devDependency` inside its range (the
  template's `didi` peer is `^11.0.0 || ^12.0.0` because diagram-js 15 brings didi 11 while the
  renderer builds against 12), and both apps declare the same exact versions as `dependencies`.
- `@miragon/modeler-api` is an exact `dependency` of the renderer; `@miragon/modeler-shell` an
  exact `dependency` of both apps and a `devDependency` of `e2e`.
- The rule is written down for agents in
  [`.claude/rules/package-json-fixed-versions.md`](../assets/template/.claude/rules/package-json-fixed-versions.md).
- The root `engines` is the suite's Node range `^22.22.2 || >=24.15.0`. Pin tool versions whose own
  `engines` accept both floors, 22.22.2 and 24.15.0; otherwise `npm ci` warns (EBADENGINE) and the
  tool runs outside its supported range. Portless is the one exception: it needs Node 24 and runs
  only `dev:webapp`.

## TypeScript

`tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`, `moduleResolution: bundler`. Under `exactOptionalPropertyTypes` every
optional option a package accepts also allows `undefined` (`freeArea?: FreeArea | undefined`), so
hosts forward optional values as they are; the contract and the shell do the same. TypeScript stays
on the major `typescript-eslint` accepts (Dependabot ignores the next major).

## CI

[`.github/workflows/ci.yml`](../assets/template/.github/workflows/ci.yml): `lint`, `format-check`,
`depcruise`, `test` (build, then unit tests), `build` (packages, web app, extension),
`test-browser` and `e2e` in the `mcr.microsoft.com/playwright:v<version>-noble` image whose version
`playwright-version` reads from the root `devDependencies` (bump image and `playwright` together;
`npx playwright install --with-deps chromium` in a plain runner works as well),
`pin-check`, `dependency-review`, `vscode-smoke` (the reusable
[`vscode-smoke.yml`](../assets/template/.github/workflows/vscode-smoke.yml)) and `ci-ok`. A
shared [setup action](../assets/template/.github/actions/setup/action.yml) installs the floor of
`engines` (Node 22.22.2), so CI verifies the declared minimum, unless a job passes `node-version`
(the publish jobs pass 24), and runs `npm ci`. Every `uses:` is pinned to a commit SHA with the
tag as a comment.

### The merge gate

`ci-ok` runs after every other job of `ci.yml`, also when one failed (`if: always()`), and fails
when any of them failed, was cancelled or was skipped, with one error line per job. Only
`dependency-review` may be skipped, outside pull requests, where its own `if:` skips it. Make
`ci-ok` and the PR title check `validate-pr-title` the only required checks on `main`: a required
check that is skipped counts as passed, so a list of required jobs lets a lint failure through
that skips `e2e` and `test-browser`, and Dependabot's auto-merge waits only for the listed checks.
A new job in `ci.yml` goes into the `needs` of `ci-ok`; one that its own `if:` skips on some
events also goes into `SKIPPED_BY_DESIGN` for those events. Switch the required checks once
`ci-ok` has run on `main`, since GitHub offers only checks it has seen.

### The VS Code smoke test in CI

[`vscode-smoke.yml`](../assets/template/.github/workflows/vscode-smoke.yml) is a reusable workflow,
so it reports to `ci-ok` on every run instead of being a check of its own that a path filter skips.
Of its three jobs, `changes` decides whether VS Code starts: on a pull request, a push or a merge
group it compares the change with its base (the pull request's base, the commit before the push, the
merge group's base) and starts VS Code only when `package-lock.json`, any `package.json`,
`apps/vscode/`, `packages/`, `tsconfig.base.json` (the bundles and the libraries' `dist` are built
with its compiler options), `ci.yml`, the two smoke workflows or the setup action changed. The diff
lists a moved file under its old path too and every path as it is (`git diff -z`, never quoted, a
non-ASCII name or a quote included), so neither slips past the patterns. A scheduled or manual
run, and a run without a base to compare with (a new branch), always start it. `vscode-smoke` runs
the matrix `stable` (the newest stable VS Code) and `minimum` (the `engines.vscode` floor, read
from `apps/vscode/package.json` at run time), each cached by version and run with
`VSCODE_SMOKE_KEEP=1`, so a failed run uploads VS Code's logs (`vscode-smoke-logs-<stable|minimum>`)
next to the screenshots. When `changes` skips it, `skipped` succeeds with a notice, so the skip
reaches `ci-ok` as a success.

[`vscode-smoke-weekly.yml`](../assets/template/.github/workflows/vscode-smoke-weekly.yml) runs it
every Monday, because a new VS Code release can break the extension without a change in the
repository, and its job `alert` opens the issue "VS Code smoke: the weekly run failed" or comments
on the open one. Only `alert` gets `issues: write`: GitHub rejects a called workflow whose jobs
ask for more permissions than the caller grants, even a job that would be skipped.

[`codeql.yml`](../assets/template/.github/workflows/codeql.yml) runs CodeQL's
`javascript-typescript` analysis from source (`build-mode: none`) on pull requests, on pushes to
`main` and weekly, so an advisory published after a merge still surfaces, as in the five modelers.

`pr-title.yml` validates the PR title as a Conventional Commit (`feat`, `fix`, `chore`, `docs`,
`refactor`, `ci`, `build`, `test`, `revert`); PRs are squash-merged with the title as the commit.

## Dependabot

[`.github/dependabot.yml`](../assets/template/.github/dependabot.yml): weekly npm updates with
minor and patch grouped, majors one PR each, a 3-day cooldown, `@types/vscode` held at the
`engines.vscode` floor, and the group `modeler-platform` for `@miragon/modeler-*`. That group is
never auto-merged ([`dependabot-automerge.yml`](../assets/template/.github/workflows/dependabot-automerge.yml)):
Dependabot commits as `chore(deps)`, which release-please does not release, and a 0.x minor of the
shell changes the chrome. Adopt it by hand as `fix(deps): adopt modeler-shell x.y` (with the code
changes the release notes ask for). GitHub Actions update monthly, all grouped, and are merged by
hand as well: they change `.github/workflows`, which GitHub merges only for a token with the
`workflows` permission, and the auto-merge token gets `contents` and `pull-requests` only.

`dependabot-automerge.yml` enables auto-merge for npm updates only, with a token of the
release-please app: GitHub merges in the name of whoever enabled auto-merge, and a merge made with
`GITHUB_TOKEN` starts no workflow on `main`, so neither `ci-ok` nor CodeQL nor release-please would
see the update. It runs on `pull_request_target`, because a run Dependabot starts on `pull_request`
gets only Dependabot secrets; that event runs the workflow from `main` with the Actions secrets, so
it must never check out or run code of the pull request. GitHub blocks `pull_request_target` in
public repositories from 2 December 2026: give a public repository an Actions policy (Settings →
Actions → Policies) that allows the event for `.github/workflows/dependabot-automerge.yml`.

## Commits

Conventional Commits with a scope where it helps (`feat(renderer): …`). Every commit is signed
(`git commit -S`), and the repository requires signed commits on `main`. After a history rewrite,
re-sign with `git rebase -S`.
