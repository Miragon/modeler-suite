---
paths:
  - '**/package.json'
---

# Exact versions in package.json

Never use a version range (`^`, `~`, `>=`, `*`) in `dependencies` or `devDependencies`, internal
`@miragon/__NOTATION__-*` workspace deps included: they pin the referenced package's current
version, and release-please's `node-workspace` plugin bumps every reference on release.
`miragon/pin-npm-dependencies` enforces this in CI.

**Exception: ranged `peerDependencies`** for the runtime libraries whose identity a consumer must
share: `zod` (schema-model) and `diagram-js` / `didi` / `tiny-svg` (renderer). A second copy breaks
`instanceof`, zod schema identity and diagram-js's dependency injection, so these are caret-ranged
peers that dedupe against the consumer's copy. Each peer is mirrored by an exact `devDependency`
inside its range, and the bundling apps (`apps/webapp`, `apps/vscode`, `apps/orca`) declare the same exact
versions as `dependencies`.

Install a new dependency with `npm install <pkg>` (the root `.npmrc` sets `save-exact=true`) and
check the version in `package-lock.json`.
