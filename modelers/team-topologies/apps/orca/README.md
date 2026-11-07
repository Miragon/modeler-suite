# Team Topologies Modeler for Orca

The Team Topologies Modeler as an [Orca](https://www.onorca.dev) custom editor: `.tt` and `.ttm.json`
files open as a Team Topologies diagram, with the same chrome as the VS Code extension. Orca keeps the file, its dirty state,
saving and read-only tabs; the editor owns undo.

When a coding agent writes the file, the editor shows the change right away. When it has
unsaved edits, Orca shows its Reload/Overwrite banner and you decide.

## Build and try it

```sh
npm ci && npm run build:shared
npm run team-topologies build:orca          # writes apps/orca/plugin/
cd modelers/team-topologies/apps/orca/plugin
orca plugin validate . && orca plugin check .
orca plugin dev load . --json              # prints the --approve fingerprint
orca plugin dev load . --json --approve <fingerprint>
```

`plugin/` is the folder Orca loads and the release publishes. The bundle is not minified and ships
no sourcemap, as with it the plugin stays in the size review of Orca's community directory
([#563](https://github.com/Miragon/modeler-suite/issues/563));
[#564](https://github.com/Miragon/modeler-suite/issues/564) brings it back. Of zod's error messages
it keeps only the English ones ([#568](https://github.com/Miragon/modeler-suite/issues/568)). The
editor needs Orca 1.4.248 or later (`"frame": "isolated"`, the desktop app).

## Tests

The `orca-editor` project of `modelers/team-topologies/e2e` runs the editor inside the shell's Orca
stub: the shell's conformance kit on the `ide` host (`ideHost: "orca"`, the `csp` case on the built
plugin under Orca's frame policy) and the document sync with an agent's writes.

```sh
npm run test:e2e -w modelers/team-topologies/e2e -- --project=orca-editor
```

The plugin in a real Orca, in a Linux container (never on the Mac itself, where Orca's window would
take the focus): load, render, both themes, undo, a saved edit, an agent's write and Orca's logs.

```sh
npm run team-topologies test:orca:docker
```

The plugin is released with the modeler, in lockstep with its other packages. The `.tt.png` editor
of the VS Code extension has no Orca counterpart yet.
