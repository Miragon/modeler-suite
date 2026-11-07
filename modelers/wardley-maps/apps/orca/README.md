# Wardley Maps Modeler for Orca

The Wardley Maps Modeler as an [Orca](https://www.onorca.dev) custom editor: `.wmap` and `.owm`
files open as a Wardley map, with the same chrome as the VS Code extension. Orca keeps the file, its dirty state,
saving and read-only tabs; the editor owns undo.

When a coding agent writes the file, the editor shows the change right away. When it has
unsaved edits, Orca shows its Reload/Overwrite banner and you decide.

## Build and try it

```sh
npm ci && npm run build:shared
npm run wardley-maps build:orca          # writes apps/orca/plugin/
cd modelers/wardley-maps/apps/orca/plugin
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

The plugin ships no web fonts, because Orca's community directory refuses `.woff2` files
([stablyai/orca#38607](https://github.com/stablyai/orca/issues/38607)):
the editor draws in the system font, and only the PNG export embeds Geist. Bringing Geist back is
[#558](https://github.com/Miragon/modeler-suite/issues/558).

## Tests

The `orca-editor` project of `modelers/wardley-maps/e2e` runs the editor inside the shell's Orca
stub: the shell's conformance kit on the `ide` host (`ideHost: "orca"`) and the document sync with
an agent's writes. The kit's `csp` case stays off while the plugin ships no web fonts
([#558](https://github.com/Miragon/modeler-suite/issues/558)).

```sh
npm run test:e2e -w modelers/wardley-maps/e2e -- --project=orca-editor
```

The plugin in a real Orca, in a Linux container (never on the Mac itself, where Orca's window would
take the focus): load, render, both themes, undo, a saved edit, an agent's write and Orca's logs.

```sh
npm run wardley-maps test:orca:docker
```

A link to a web page opens in the browser after Orca asks; a link to another map does not open,
since Orca lets no editor open a file. Pick its target in Orca's file tree.
