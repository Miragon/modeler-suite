# Value Chain Modeler for Orca

The Value Chain Modeler as an [Orca](https://www.onorca.dev) custom editor: `.vc` and `.vc.json`
files open as a value chain diagram, with the same chrome as the VS Code extension. Orca keeps the file, its dirty state,
saving and read-only tabs; the editor owns undo.

When a coding agent writes the file while the board has unsaved edits, Orca hands the write to the
editor's merge (`mergeValueChainText` of `@miragon/value-chain-renderer`): changes to different
steps, org units or connections are kept from both sides. When both sides changed the same
element, Orca shows its Reload/Overwrite banner and you decide.

## Build and try it

```sh
npm ci && npm run build:shared
npm run value-chain build:orca          # writes apps/orca/plugin/
cd modelers/value-chain/apps/orca/plugin
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

The `orca-editor` project of `modelers/value-chain/e2e` runs the editor inside the shell's Orca
stub: the shell's conformance kit on the `ide` host (`ideHost: "orca"`) and the document sync with
an agent's writes. The kit's `csp` case stays off while the plugin ships no web fonts
([#558](https://github.com/Miragon/modeler-suite/issues/558)).

```sh
npm run test:e2e -w modelers/value-chain/e2e -- --project=orca-editor
```

The plugin in a real Orca, in a Linux container (never on the Mac itself, where Orca's window would
take the focus): load, render, both themes, undo, a saved edit, an agent's write and Orca's logs.

```sh
npm run value-chain test:orca:docker
```

`ORCA_SMOKE_MERGE=1` adds an agent's write under unsaved edits; driven through `orca plugin shot`,
Orca does not hand that write to the editor yet, so it stays off by default.
