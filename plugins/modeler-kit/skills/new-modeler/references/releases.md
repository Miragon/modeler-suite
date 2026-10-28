# Releases

[release-please](https://github.com/googleapis/release-please) runs on every push to `main`
([`release-please.yml`](../assets/template/.github/workflows/release-please.yml)) and keeps one
release PR open; merging it tags, writes the changelogs and publishes.

## Configuration

[`release-please-config.json`](../assets/template/release-please-config.json) and
[`.release-please-manifest.json`](../assets/template/.release-please-manifest.json):

- **One component per package** (`schema-model`, `dsl`, `renderer`, `vscode`, `webapp`) with
  `include-component-in-tag: true`, so each is versioned and tagged on its own
  (`renderer-v0.3.0`) with its own `CHANGELOG.md`; `separate-pull-requests: false` keeps one PR.
  A commit belongs to the components whose directories it touches: `feat` bumps the minor, `fix`
  the patch, a breaking change the minor while 0.x (`bump-minor-pre-major`); `chore`, `ci`,
  `docs`, `test` and `refactor` release nothing. `e2e` is no component.
- **`node-workspace` with `updatePeerDependencies: true`** bumps every internal
  `@miragon/<notation>-*` reference when a package releases, and gives each dependent a patch;
  a new internal dependency edge needs no configuration. (Team Topologies releases the whole repo
  as one root component with `extra-files` per reference instead; Value Chain links all versions
  with the `linked-versions` plugin. Both work; per-package components are the default.)
- **Initial versions.** A new package starts at `0.0.0` in `package.json` and in the manifest, and
  `initial-version: "0.1.0"` makes its first release 0.1.0: release-please treats a manifest
  version other than `0.0.0` as the last release and bumps from it. Internal references pin
  `0.0.0` until then.
- **`extra-files`** rewrite versions release-please does not know, for example a version constant
  in source (`x-release-please-version`) or a JSON field (`{ "type": "json", "path": …,
"jsonpath": … }`; a path starting with `/` is relative to the repository root, not the package).

To set a version or rewrite the entries a PR contributes, put conventional commits between
`BEGIN_COMMIT_OVERRIDE` and `END_COMMIT_OVERRIDE` in the PR body (a `Release-As:` footer at the end
of a squash body is no footer once GitHub appends its co-author block).

The pull request that adds a `@deprecated` files an issue that names its target version as a
number (the release that removes it, not "the next minor"): a deprecation without a tracked removal
outlives the minor it promises.

## npm: trusted publishing

Each released library publishes from a job of `release-please.yml` that calls the reusable
[`publish-npm-package.yml`](../assets/template/.github/workflows/publish-npm-package.yml), gated on
that path's `<path>--release_created` output. Publishing uses OIDC trusted publishing: no token,
provenance attached automatically, npm 11.5.1 or later (Node 24 in the publish jobs), the
environment `npm`. npm checks the **calling** workflow, so the trusted publisher names
`release-please.yml`, not the reusable one. The job skips a version that is already published, so
a re-run is safe.

### First release of a package

Trusted publishing binds only to a package that exists, so the first release of each npm package
needs one manual round:

1. Merge the first release PR. The tag is created; the publish job fails with E404 (expected).
2. From a clean checkout of the tag, publish that version once by hand with publish rights to the
   `@miragon` scope: `npm ci && npm run build && npm publish -w packages/<name>` (in a terminal:
   npm asks for 2FA in the browser and aborts with EOTP in a non-interactive shell).
3. Bind the publisher:
   `npm trust github @miragon/<notation>-<name> --repo Miragon/<repo> --file release-please.yml --env npm --allow-publish`.
4. Re-run the failed publish job: it skips with "already published"; every later release publishes
   without a token.

## VS Code: Marketplace and Open VSX

`apps/vscode` is the `vscode` component. When it releases, two jobs in the environment
`vscode-marketplace` build it (`npm run build:vscode`), package the VSIX with
`npx vsce package --no-dependencies` (the bundles carry everything; `.vscodeignore` keeps `src`,
tests and maps out), smoke-test the files of that VSIX, unpacked, in the newest stable VS Code (the
[smoke test](shell.md#the-vs-code-smoke-test) with `VSCODE_SMOKE_EXTENSION`, so a VSIX that does not
open, save or switch themes is never uploaded) and publish it with
`npx vsce publish --packagePath …` (secret `VSCE_PUBLISH`) and `npx ovsx publish --packagePath …`
(secret `OVSX_PUBLISH`; `ovsx` is an exact devDependency, so `npx` runs the pinned version). The
publisher is `miragon-gmbh`; the extension needs `icon`, `repository`, a `README.md` and a `LICENSE`
in `apps/vscode`, and `engines.vscode` at the floor `@types/vscode` is pinned to. Add the extension
to the Miragon modeler extension pack (`Miragon/vscode-modeler-collection`) after its first release.
A manual run of the release workflow with `dry_run` packs the libraries and packages and smoke-tests
the VSIX without releasing anything.

The web app is no npm package and is not published by release-please; deploy `main` with the
hosting of your choice (the five use Netlify with a `netlify.toml`).
