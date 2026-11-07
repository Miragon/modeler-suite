# Contributing

## Setup

```sh
npm ci
npx playwright install chromium   # once, for test:browser and test:e2e
npm run build
```

The Husky pre-commit hook runs lint-staged and `npm run lint` only; run `npm test`,
`npm run test:browser` and `npm run depcruise` before you push, and after a change to the
extension or the webview `npm run test:vscode:docker`, which builds and opens the extension in a
real VS Code inside a Linux container, so no window takes your focus (it needs Docker;
`VSCODE_VERSION=1.96.0` picks another VS Code, `VSCODE_SMOKE_KEEP=1` keeps VS Code's logs in
`test-results/vscode-smoke/vscode-logs`, `VSCODE_SMOKE_SKIP=keys,history,workbench` skips the
driver's steps it names; CI runs the smoke test when a change touches the
extension, see [CI and the merge gate](#ci-and-the-merge-gate)). Every commit is signed
(`git commit -S`).

## CI and the merge gate

`ci-ok`, the last job of `.github/workflows/ci.yml`, is the merge gate: it and the PR title check
`validate-pr-title` are the checks for the `main` ruleset to require. It runs after every other CI
job, also when one failed, and fails when any of them failed or was cancelled. A required check
that is skipped counts as passed, so a list of required jobs would let a lint failure that skips
`e2e` through, and Dependabot's auto-merge waits only for the checks on that list. A job skipped
because a job it needs failed comes with that failure, so `ci-ok` passes a skip.

- **A new job in `ci.yml` goes into the `needs` of `ci-ok`**, or nothing waits for it.
- **The VS Code smoke test** (`.github/workflows/vscode-smoke.yml`, which `ci.yml` calls) runs on
  every CI run, on the weekly schedule and by hand: `stable`, the newest stable release, and
  `minimum`, the `engines.vscode` floor of `apps/vscode/package.json`. The screenshots are uploaded
  as the artifacts `vscode-smoke-stable` and `vscode-smoke-minimum` and, when a run failed, VS
  Code's logs as `vscode-smoke-logs-stable` or `vscode-smoke-logs-minimum`.
- **Every Monday** `vscode-smoke-weekly.yml` runs it, because a new VS Code release can break the
  extension without a change here; a failure opens the issue "VS Code smoke: the weekly run
  failed", or comments on it while it is open.
- **The release** smoke-tests the VSIX it publishes, unpacked, in the newest stable VS Code, before
  it uploads it to the Marketplace and Open VSX. When that smoke fails, its screenshots and VS
  Code's logs are uploaded as the artifact `vscode-smoke-marketplace`, `vscode-smoke-open-vsx` or
  `vscode-smoke-dry-run`.

## Commits and releases

Conventional Commits, enforced on the PR title; PRs are squash-merged with the title as the commit.
release-please releases every package as a component of its own (`<component>-vX.Y.Z`) when a
commit touches its directory: `feat` a minor, `fix` a patch, a breaking change a minor while 0.x.
`chore`, `ci`, `docs`, `test` and `refactor` release nothing. A Dependabot bump of
`@miragon/modeler-shell` lands as `fix(deps): adopt modeler-shell x.y`, so it is released.

Every new `@deprecated` gets an issue that names its target version as a number: the release that
removes it, or the package's first breaking release when the removal waits for another breaking
change. "The next minor" is no target. The pull request that adds the deprecation files the issue
and refers to it. A deprecation without a tracked removal outlives the minor it promises.

Merging the release PR publishes the `packages/*` libraries to npm (OIDC trusted publishing,
environment `npm`) and the extension to the VS Code Marketplace and Open VSX (environment
`vscode-marketplace`, secrets `VSCE_PUBLISH`, `OVSX_PUBLISH`).

The first release of every npm package needs one manual step: trusted publishing binds only to a
package that exists. Merge the first release PR (its publish job fails with E404), publish that
version once by hand from a clean checkout of the tag (`npm ci && npm run build &&
npm publish -w packages/<name>`, in a terminal for the 2FA prompt), bind the publisher with
`npm trust github @miragon/__NOTATION__-<name> --repo Miragon/__REPO__ --file release-please.yml --env npm --allow-publish`,
then re-run the failed job.
