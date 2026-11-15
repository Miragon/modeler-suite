---
paths:
  - "**/package.json"
---

# Always use fixed dependency versions

Never use version ranges (`^`, `~`, `>=`, `*`) in `package.json`. Always pin to an exact version
(e.g. `"@xyflow/react": "12.12.1"`).

This applies to `dependencies` and `devDependencies`, including the internal
`@miragon/board-schema-model` and the suite's `@miragon/modeler-api`, which are pinned to the
exact current workspace version (not `*` or `workspace:*`); npm links them locally because the
versions match. The board's own packages have no release-please component yet and stay on
`0.0.0`. The pin on the contract is bumped by every release of `@miragon/modeler-api`, through its
two `extra-files` entries in the root `release-please-config.json` (see the suite's
[docs/ci-and-releases.md](../../../../docs/ci-and-releases.md)).

**No ranged `peerDependencies` here.** The other modelers declare `zod` and the
`diagram-js` / `didi` / `tiny-svg` ecosystem as ranged peers so that a host installing their npm
packages dedupes them against its own copy. This modeler publishes nothing to npm: every workspace
is `private`, no host installs its packages, and a runtime library is an exact `dependency` of the
package that imports it.

**One copy each of `yjs`, `react`, `react-dom` and `@xyflow/react`.** The board shares these four
with whoever mounts it, and each works only as one copy: the store tells its elements by
`instanceof Y.Map`, a second React has hooks of its own, and a second React Flow a store the
board's parts cannot read. Without ranged peers nothing dedupes them, so
`packages/renderer/test/single-copy.test.ts` reads the lockfile instead: none of the four is
nested under `modelers/board`, and every workspace of this modeler pins the version the root
installs. Should a package ever be published, it gets ranged peers for these four first, each
mirrored by an exact `devDependency`.

Exact pinning is enforced in CI by
[`miragon/pin-npm-dependencies`](https://github.com/Miragon/pin-npm-dependencies).

When adding a dependency: install it with `npm install <pkg> -w <workspace>` from the repository
root (the root `.npmrc` sets `save-exact=true`), then check the installed version with
`npm ls <pkg>` and make sure that exact version is in `package.json`. A bump of `@xyflow/react`
is a change of what the canvas was measured on (12.12.1): run `npm run board test:browser`, where
`react-flow-internals.browser.test.tsx` names the fields of React Flow's store the board reads.
