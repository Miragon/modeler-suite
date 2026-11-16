---
paths:
  - "**/package.json"
---

# Always use fixed dependency versions

Never use version ranges (`^`, `~`, `>=`, `*`) in `dependencies` or `devDependencies`. Always pin
to an exact version (e.g. `"@xyflow/react": "12.12.1"`).

This applies to `dependencies` and `devDependencies`, including the internal
`@miragon/board-schema-model` and the suite's `@miragon/modeler-api`, which are pinned to the
exact current workspace version (not `*` or `workspace:*`); npm links them locally because the
versions match. Every workspace of the board but `e2e` and the workspace root is a release-please
component, so a release moves its version. A pin on a release component is bumped by every
release of that component, through its two `extra-files` entries in the root
`release-please-config.json` (see the suite's
[docs/ci-and-releases.md](../../../../docs/ci-and-releases.md)): the renderer's and the host
package's pin on `@miragon/modeler-api`, and the thirteen pins of `apps/editors` on packages of
the other modelers. `test/release-config.test.ts` at the root names every entry that is missing.

**Ranged `peerDependencies`, on the published renderer alone.** Two packages of the board are
public, `@miragon/board-schema-model` and `@miragon/board-renderer`; `@miragon/board-files`,
`@miragon/board-host` and every app stay `private`. The renderer shares four libraries with
whoever mounts it, and each works only as one copy: the store tells its elements by
`instanceof Y.Map`, a second React has hooks of its own, and a second React Flow a store the
board's parts cannot read. So the renderer declares them as ranged peers, decided by the owner,
and a host that installs it from npm dedupes them against its own copy:

| Peer            | Range      | Exact `devDependency` mirror |
| --------------- | ---------- | ---------------------------- |
| `yjs`           | `^13.6.0`  | `13.6.33`                    |
| `react`         | `^19.0.0`  | `19.3.1`                     |
| `react-dom`     | `^19.0.0`  | `19.3.1`                     |
| `@xyflow/react` | `~12.12.1` | `12.12.1`                    |

`@xyflow/react` is narrow because the canvas reads fields of React Flow's internal store as 12.12.1
has them. Every other runtime library of the renderer (`@miragon/modeler-api`,
`@miragon/board-schema-model`, `dompurify`, `lucide-react`, `markdown-it`) is an exact
`dependency`, and the schema model has none.

Every workspace of the board that bundles the renderer declares the four as exact pins at the
mirror's version: `apps/ide-editor`, `apps/vscode` and `apps/webapp` as `dependencies`,
`packages/host` (its tests mount the board) and `e2e` (its webview test page bundles the
extension's webview) as `devDependencies`. `apps/editors` imports neither the renderer nor the four
in its sources and declares none. Neither npm nor pin-check notices a peer range that rejects
those exact versions: `packages/renderer/test/peer-dependencies.sync.test.ts` does, and names the
one package with peers and the workspaces that depend on it. A new workspace that depends on the
renderer declares the four as well.

The board's own apps bundle the renderer from its source, where no peer range is read, so
`packages/renderer/test/single-copy.test.ts` reads the lockfile as well: none of the four is
nested under `modelers/board`, and every workspace of this modeler pins the version the root
installs.

Exact pinning is enforced in CI by
[`miragon/pin-npm-dependencies`](https://github.com/Miragon/pin-npm-dependencies), which reads
`dependencies` and `devDependencies` and leaves `peerDependencies` alone.

When adding a dependency: install it with `npm install <pkg> -w <workspace>` from the repository
root (the root `.npmrc` sets `save-exact=true`), then check the installed version with
`npm ls <pkg>` and make sure that exact version is in `package.json`. A bump of `@xyflow/react`
is a change of what the canvas was measured on (12.12.1): run `npm run board test:browser`, where
`react-flow-internals.browser.test.tsx` names the fields of React Flow's store the board reads,
and move the renderer's peer range with it.
