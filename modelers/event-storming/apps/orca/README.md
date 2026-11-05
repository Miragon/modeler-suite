# Event Storming Modeler for Orca

The Event Storming Modeler as an [Orca](https://www.onorca.dev) custom editor: `.storm` files open
as a board, with the same chrome as the VS Code extension. Orca keeps the file, its dirty state,
saving and read-only tabs; the editor owns undo.

When a coding agent writes the file, the board shows the change right away. When the board has
unsaved edits, Orca shows its Reload/Overwrite banner and you decide.

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

The plugin ships no web fonts, because Orca's community directory refuses `.woff2` files
([stablyai/orca#38607](https://github.com/stablyai/orca/issues/38607)):
the editor draws in the system font, and only the PNG export embeds Geist. Bringing Geist back is
[#558](https://github.com/Miragon/modeler-suite/issues/558).

## Tests

The `orca-editor` project of `modelers/event-storming/e2e` runs the editor inside the shell's Orca
stub: the shell's conformance kit on the `ide` host (`ideHost: "orca"`) and the document sync with
an agent's writes. The kit's `csp` case stays off while the plugin ships no web fonts
([#558](https://github.com/Miragon/modeler-suite/issues/558)).

```sh
npm run test:e2e -w modelers/event-storming/e2e -- --project=orca-editor
```

The plugin in a real Orca, in a Linux container (never on the Mac itself, where Orca's window would
take the focus): load, render, both themes, undo, a saved edit, an agent's write and Orca's logs.

```sh
npm run event-storming test:orca:docker
```
