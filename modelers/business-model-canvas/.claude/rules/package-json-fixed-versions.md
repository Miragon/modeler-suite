---
paths:
  - "**/package.json"
---

# Always use fixed dependency versions

Never use version ranges (`^`, `~`, `>=`, `*`) in `package.json`. Always pin to an exact version
(e.g. `"diagram-js": "15.28.1"`).

This applies to `dependencies` and `devDependencies`, including the internal
`@miragon/business-model-canvas-*` workspace dependencies, which are pinned to the exact current
workspace version (not `*` or `workspace:*`); npm links them locally because the versions match,
and release-please bumps them on release (see the suite's
[docs/ci-and-releases.md](../../../../docs/ci-and-releases.md)).

**No ranged `peerDependencies` here.** The other modelers declare `zod` and the
`diagram-js` / `didi` / `tiny-svg` ecosystem as ranged peers so that a host installing their npm
packages dedupes them against its own copy. This modeler publishes nothing to npm: every workspace
is `private`, and the web app, the VS Code extension and the Orca plugin bundle the packages from
source. No host ever installs them, so there is nothing to dedupe, and a runtime library is an
exact `dependency` of the package that imports it. Should a package ever be published, it gets the
ranged peers of the other modelers first.

Exact pinning is enforced in CI by
[`miragon/pin-npm-dependencies`](https://github.com/Miragon/pin-npm-dependencies).

When adding a dependency: install it with `npm install <pkg> -w <workspace>` from the repository
root (the root `.npmrc` sets `save-exact=true`), then check the installed version with
`npm ls <pkg>` and make sure that exact version is in `package.json`. Keep it on the version the
rest of the suite uses: the hoisted root copy is the one the bundles take (`didi` aside, which the
renderer imports for its types only: the bundles carry the copy diagram-js brings).
