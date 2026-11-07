# Context Maps Modeler for Orca

The Context Maps Modeler as an [Orca](https://www.onorca.dev) custom editor: `.cm` and `.cm.json`
files open as a context map, with the same chrome as the VS Code extension. Orca keeps the file, its dirty state,
saving and read-only tabs; the editor owns undo.

When a coding agent writes the file while the board has unsaved edits, Orca hands the write to the
editor's merge (`mergeContextMapText` of `@miragon/context-maps-renderer`): changes to different
bounded contexts or relationships are kept from both sides. When both sides changed the same
element, Orca shows its Reload/Overwrite banner and you decide.

## Build and try it

```sh
npm ci && npm run build:shared
npm run context-maps build:orca          # writes apps/orca/plugin/
cd modelers/context-maps/apps/orca/plugin
orca plugin validate . && orca plugin check .
orca plugin dev load . --json              # prints the --approve fingerprint
orca plugin dev load . --json --approve <fingerprint>
```

`plugin/` is the folder Orca loads and the release publishes. The bundle is not minified and ships
no sourcemap, as with it the plugin stays in the size review of Orca's community directory
([#563](https://github.com/Miragon/modeler-suite/issues/563));
[#564](https://github.com/Miragon/modeler-suite/issues/564) brings it back. The editor needs Orca
1.4.252 or later (`"frame": "isolated"`, the desktop app).

The plugin ships no web fonts, because Orca's community directory refuses `.woff2` files
([stablyai/orca#38607](https://github.com/stablyai/orca/issues/38607)):
the editor draws in the system font, and only the PNG export embeds Geist. Bringing Geist back is
[#558](https://github.com/Miragon/modeler-suite/issues/558).

## Tests

The `orca-editor` project of `modelers/context-maps/e2e` runs the editor inside the shell's Orca
stub: the shell's conformance kit on the `ide` host (`ideHost: "orca"`) and the document sync with
an agent's writes. The kit's `csp` case stays off while the plugin ships no web fonts
([#558](https://github.com/Miragon/modeler-suite/issues/558)).

```sh
npm run test:e2e -w modelers/context-maps/e2e -- --project=orca-editor
```

The plugin in a real Orca, in a Linux container (never on the Mac itself, where Orca's window would
take the focus): load, render, both themes, undo, a saved edit, an agent's write and Orca's logs.

```sh
npm run context-maps test:orca:docker
```

`ORCA_SMOKE_MERGE=1` adds an agent's write under unsaved edits; driven through `orca plugin shot`,
Orca does not hand that write to the editor yet, so it stays off by default.

The `.cm.png` editor and the CML import of the VS Code extension have no Orca counterpart yet; the
Export group offers PNG, SVG, JSON and CML through Orca's save dialog.
