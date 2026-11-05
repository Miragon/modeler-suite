# Event Storming Modeler for Orca

The Event Storming Modeler as an [Orca](https://www.onorca.dev) custom editor: `.storm` files open
as a board, with the same chrome as the VS Code extension. Orca keeps the file, its dirty state,
saving and read-only tabs; the editor owns undo.

When a coding agent writes the file while the board has unsaved edits, Orca hands the write to the
editor's merge (`mergeStormText` of `@miragon/event-storming-renderer`): changes to different
stickies, notes, drawings or arrows are kept from both sides. When both sides changed the same
element, Orca shows its Reload/Overwrite banner and you decide.

## Build and try it

```sh
npm ci && npm run build:shared
npm run event-storming build:orca          # writes apps/orca/plugin/
cd modelers/event-storming/apps/orca/plugin
orca plugin validate . && orca plugin check .
orca plugin dev load . --json              # prints the --approve fingerprint
orca plugin dev load . --json --approve <fingerprint>
```

`plugin/` is the folder Orca loads and the release publishes. The bundle is not minified and ships
its sourcemap. The editor needs Orca 1.4.248 or later (`"frame": "isolated"`, the desktop app).

## Tests

The `orca-editor` project of `modelers/event-storming/e2e` runs the editor inside the shell's Orca
stub: the shell's conformance kit on the `ide` host (`ideHost: "orca"`, the `csp` case on the built
plugin under Orca's frame policy) and the document sync with an agent's writes.

```sh
npm run test:e2e -w modelers/event-storming/e2e -- --project=orca-editor
```

The plugin in a real Orca, in a Linux container (never on the Mac itself, where Orca's window would
take the focus): load, render, both themes, undo, a saved edit, an agent's write and Orca's logs.

```sh
npm run event-storming test:orca:docker
```

`ORCA_SMOKE_MERGE=1` adds an agent's write under unsaved edits; driven through `orca plugin shot`,
Orca does not hand that write to the editor yet, so it stays off by default.
