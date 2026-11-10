# @miragon/value-chain-renderer

[![npm](https://img.shields.io/npm/v/@miragon/value-chain-renderer)](https://www.npmjs.com/package/@miragon/value-chain-renderer)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/value-chain/LICENSE)

Viewer and editor for value chain diagrams (ARIS-style _Wertschöpfungskettendiagramme_), built on
[diagram-js](https://github.com/bpmn-io/diagram-js) and styled by the Miragon design system.
Framework-agnostic: mount it into any element. The
[Value Chain Modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/value-chain) web app and VS Code extension
both wrap this package, and it implements the
[`@miragon/modeler-api`](https://www.npmjs.com/package/@miragon/modeler-api) contract for
collaborative hosts.

![Modeler](https://raw.githubusercontent.com/Miragon/modeler-suite/main/modelers/value-chain/docs/screenshot.png)

## Install

```bash
npm install @miragon/value-chain-renderer @miragon/value-chain-schema-model
```

ESM only, for browsers and bundlers. `diagram-js` (^15.28.0), `didi`, `tiny-svg` and `zod` are peer
dependencies: an app that already has them shares its copy with the renderer, since a second
diagram-js or Zod breaks the dependency injection and `instanceof` checks.

## Quick start

```ts
import { Modeler } from "@miragon/value-chain-renderer";
import "@miragon/value-chain-renderer/assets/value-chain.css";
import { createEmptyDocument } from "@miragon/value-chain-schema-model";

const modeler = new Modeler({ container: document.querySelector("#canvas")! });
modeler.importDocument(createEmptyDocument("My value chain"));

modeler.on("commandStack.changed", () => {
  const doc = modeler.exportDocument(); // ValueChainDocument
});

const { svg } = modeler.saveSVG(); // standalone SVG
```

The stylesheet is required. It bundles the design-system tokens (in a cascade layer, so a host's
own `--cd-*` tokens win), diagram-js' CSS and `cd-canvas.css` (vendored unchanged from the
`miragon-brand:modeler-tool-design` skill, design system 1.32.0) and styles the canvas chrome on the
`--cd-ui-*` roles. The diagram itself is drawn in light colours, so SVG and PNG exports stay light.

Labels use `'Geist Variable', 'Geist', ui-sans-serif, system-ui, sans-serif`. The font is not
shipped: self-host it (e.g. `import '@fontsource-variable/geist/wght.css'`) or labels fall back to
a system sans.

## Entry points

| Class             | Use it for                                                          |
| ----------------- | ------------------------------------------------------------------- |
| `Viewer`          | Read-only rendering.                                                |
| `NavigatedViewer` | Read-only plus zoom and pan.                                        |
| `Modeler`         | The full editor, plus `undo()` / `redo()` on top of the shared API. |

All three take `{ container?, width?, height?, additionalModules?, freeArea?, fitOnImport?, undoRedoKeys? }`
and share `importDocument`, `exportDocument`, `saveSVG`, `fitViewport`, `clear`, `attachTo`,
`detach`, `destroy`, `on`/`off` and `get` (DI lookup). `additionalModules` extends the DI
container as in bpmn-js; the feature modules (`vcDrawModule`, `vcRulesModule`, `vcPaletteModule`,
`vcGestureModule`, …) are exported for custom setups.

- `importDocument(document)` validates first (a rejected document throws and leaves the diagram
  and its undo history untouched), clears the undo history silently and fits the view, never above
  100 % (`fitOnImport: false` leaves the view to the host). A running gesture ends as with Escape;
  a pan, an armed palette tool and a label being typed survive the import. Called during a user
  action it replaces the diagram under that action: hosts should use the collaborative modeler's
  `importText`, which waits (see below). `clear` behaves the same way.
- `exportDocument()` writes back every key the schema does not define (vendor extensions).
- New elements get random ids (`step_k3x9q2mf`, `org_…`, `sequence_…`), so concurrent editors never
  collide.
- `freeArea`: the canvas area the host's chrome leaves free, as `{ insets: () => FreeAreaInsets }`
  or `{ center: () => Point | undefined }`. Enter or Space on a creating palette entry places the
  element there, selected, with its label editor open.
- `undoRedoKeys: false` leaves Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Ctrl+Y unbound, for a host that owns
  the history (the VS Code document).

## Keyboard

On the focused canvas: L lasso, H hand, S space, C connect, E edit the label, Cmd/Ctrl+A select
all, arrows move the selection (Shift: large steps), Cmd/Ctrl + arrows move the canvas,
Delete/Backspace, copy, cut, paste, duplicate, and undo/redo unless `undoRedoKeys` is false.
`diagramShortcuts()` lists them for a dialog. Keys act only while the canvas `<svg>` has the focus;
a click on a palette or context-pad entry hands the focus to the canvas. Copy and paste take steps,
org units and relations whose both ends are included; copies get fresh ids, and each paste is one
undo step. A host that hides the canvas should make its container `inert` or `display: none`, not
only transparent.

## Palette

Lasso, Hand, Space and Connect, then Step and Organizational unit. Without a chrome of its own, the
`Modeler` draws the palette of the Miragon design guide (§5.5): a glass island at the top centre, a
"Tools" toolbar with roving focus (← → Home End, Enter or Space), tooltips and high-contrast and
forced-colours styles. A chrome that skins the palette marks it `data-chrome="palette"`, as
`@miragon/modeler-shell` does, and the renderer's rules stay off it; the tooltip is the service
`paletteTooltip`, which the shell's `shellModule` replaces. The rules apply inside `.vc-container`
only.

## Edit lock

`modeler.get('vcReadOnly').setReadOnly(true)` locks every edit (for a file that cannot be saved,
such as an invalid file in an IDE); selection, lasso, hand, zoom, copy and export keep working.
`setReadOnly(true, { delayMs: 800 })` locks at once and greys out the palette after the delay
(guide §13.5); `setReadOnly(false)` unlocks at once; `isReadOnlyShown()` tells whether the marks
show.

## Collaborative modeler (`@miragon/modeler-api`)

```ts
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
} from "@miragon/value-chain-renderer";

const modeler = createCollaborativeModeler({ additionalModules: [] });
modeler.attachTo(host); // in the document, with a size
await modeler.importText(text); // silent, fitted; rejects when the text is no valid document
modeler.onContentChanged(() => save(modeler.exportText())); // canonical JSON
```

Both implement contract 1.5 (`meta.notation` `"value-chain"`) and take `freeArea`, `fitOnImport`
and `undoRedoKeys`; the browser tests run the contract's conformance kit with no case skipped.
Blank text opens an empty diagram; `onContentChanged` fires for every edit, undo and redo, never
for an import; view state is the diagram-js viewbox. `elements` lists steps and organizational
units (name = label) with `reveal`, selection and `bounds(id)`; `contentBounds()` is the tight box
around all content and labels (`undefined` when empty), what a host fits to and the SVG export
frames. `diagram` is the wrapped `Modeler` or `NavigatedViewer`.

- `importText` called during a user action (typically from `onContentChanged`) waits until the
  action has finished, then imports; waiting imports run in order. Text that does not parse rejects
  at once.
- `interaction.active()` is true from the start of a drag gesture until its drop or cancel;
  `onChange` reports each change once. The viewer always reports false.
- `destroy()` is safe from any listener, also mid-drag: the diagram is torn down once the current
  handler returns, and no listener hears anything afterwards.
- `appearance`: `themes` is `VALUE_CHAIN_THEMES` (`["light"]`). `set({ theme, contrast })` writes
  `data-cd-theme="light"` and, for `contrast: "high"`, `data-cd-kontrast="hoch"` on
  `diagram.container`. It is view state: no change event, exports stay byte-identical.

## Chrome content for hosts

Typed structurally like `@miragon/modeler-shell` (the renderer never imports it): `diagramMenu()`
(Export as PNG, SVG, optionally JSON; Help with "Keyboard shortcuts…"), `diagramShortcuts(shell)`
(shortcut groups for `showShortcutsDialog`; `{ fileKeys: true }` adds Cmd/Ctrl+O and Cmd/Ctrl+S),
`blobToBase64()` for handing a PNG to an extension host, and `vcBounds.isEmpty()` for the shell's
empty-file hint. For PNG use `svgToPng(svg, { background: COLORS.surround })` of
`@miragon/modeler-shell/export`.

## Notation

- **Step**: right-pointing chevron.
- **Organizational unit**: ellipse, assigned to a step.
- **is predecessor of** (`sequence`): dashed edge with an arrowhead.
- **is process-oriented superior** (`hierarchy`): solid edge with an arrowhead, routed as vertical
  drops for a row of sub-steps or as the ARIS rake for a column.
- **assignment**: plain solid edge between an organizational unit and a step.

## License

[MIT](https://github.com/Miragon/modeler-suite/blob/main/modelers/value-chain/LICENSE). The inlined
[Lucide](https://lucide.dev) icons are ISC (© Lucide Icons and Contributors); `trash` derives from
Feather, MIT (© Cole Bemis), as Lucide's LICENSE lists it. The bundle keeps both notices as a
legal comment.
