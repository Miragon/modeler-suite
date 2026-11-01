---
paths:
  - "**/package.json"
---

# Exact versions in package.json

Never use a version range (`^`, `~`, `>=`, `*`) in `dependencies` or `devDependencies`, internal
`@miragon/c4-*` workspace deps included: they pin the referenced package's current version, and
release-please's `node-workspace` plugin bumps every reference on release; the pins it cannot
reach (the lockfile, `e2e`) are `extra-files` entries of the pinned component (see the suite's
[docs/ci-and-releases.md](../../../../docs/ci-and-releases.md)). `miragon/pin-npm-dependencies`
enforces exact pins in CI, `test/release-config.test.ts` the `extra-files` entries.

**Exception: ranged `peerDependencies`** for the runtime libraries whose identity a consumer must
share: `diagram-js`, `didi` and `tiny-svg` in `@miragon/c4-renderer`. A second copy breaks
`instanceof` and diagram-js's dependency injection, so they are caret-ranged peers that dedupe
against the consumer's copy. Each peer is mirrored by an exact `devDependency` inside its range,
and the bundling apps (`apps/webapp`, `apps/vscode`) declare the same exact versions as
`dependencies`. pin-check does not read `peerDependencies`, so
[`packages/renderer/test/peer-dependencies.sync.test.ts`](../../packages/renderer/test/peer-dependencies.sync.test.ts)
fails when an exact pin leaves its peer range. The DOM-free packages have no peers and no zod.

`@dagrejs/dagre` is the one third-party runtime dependency, an exact `dependency` of
`@miragon/c4-layout` only: keep it out of `schema-model` and `dsl`, which the VS Code extension
host bundles. A new runtime dependency needs a reason (size, licence, the webview's CSP) and an
entry in the extension's notices (`npm run notices -w modelers/c4/apps/vscode`).

Install a new dependency from the suite's root with `npm install <pkg> -w <workspace>` (the root
`.npmrc` sets `save-exact=true`) and check the version in `package-lock.json`. The toolchain is
pinned once in the root `package.json`; a workspace declares only what it alone needs.
