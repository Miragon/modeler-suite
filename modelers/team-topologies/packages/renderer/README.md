# @miragon/team-topologies-renderer

[![npm](https://img.shields.io/npm/v/@miragon/team-topologies-renderer)](https://www.npmjs.com/package/@miragon/team-topologies-renderer)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/team-topologies/LICENSE)

The **browser layer** of the [Team Topologies Modeler](../../README.md): a framework-agnostic viewer
and full editor for [Team Topologies](https://teamtopologies.com/) diagrams, built on
[diagram-js](https://github.com/bpmn-io/diagram-js) (MIT).

It renders the canonical document from
[`@miragon/team-topologies-schema-model`](../schema-model) and gives you palette, move, resize,
connect-by-overlap, multi-selection (lasso, select all) with group move, text annotations, context
pad, in-place label editing and undo/redo, with no UI framework required.
Mount it into any `<div>`; the web app and the VS Code extension both wrap this exact package. It
hands a chrome such as [`@miragon/modeler-shell`](https://www.npmjs.com/package/@miragon/modeler-shell)
its menu entries, legend rows and dialogs without importing it (see
[Around the canvas](#around-the-canvas)).

## Install

```bash
npm install @miragon/team-topologies-renderer @miragon/team-topologies-schema-model
```

## Three entry points

| Class             | Use it for                                                                     |
| ----------------- | ------------------------------------------------------------------------------ |
| `Viewer`          | Read-only rendering, no interaction (thumbnails, static embeds).               |
| `NavigatedViewer` | Read-only + zoom (scroll), pan (drag) and selection.                           |
| `Modeler`         | The full editor: palette, move, resize, context pad, label editing, undo/redo. |

## Editing gestures (`Modeler`)

| Gesture                              | Effect                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Double-click an element              | Edit its label in place (Enter commits, Shift+Enter breaks, Esc aborts) |
| `Ctrl/Cmd+A`                         | Select every element                                                    |
| Shift+drag on the canvas             | Lasso-select (also the first palette tool)                              |
| Shift+click                          | Add an element to / remove it from the selection                        |
| Drag a selected element              | Move the whole selection as one undo step                               |
| Arrow keys (Shift: ×10)              | Nudge the selection                                                     |
| `Ctrl/Cmd+C` / `V`, Delete           | Copy, paste, delete the selection                                       |
| `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z/Y`   | Undo / redo (off with `undoRedoKeys: false`)                            |
| Esc                                  | Clear the selection                                                     |
| Enter / Space on a context-pad entry | Run it (rename, add annotation, delete)                                 |

The shortcuts act only while the canvas itself has the focus, as diagram-js 15's own keyboard does:
on keys whose target is the canvas `<svg>` or inside it. Keys with nothing focused (`<body>`), on
host chrome, on the palette, the context pad or the label editor and keys while a modal dialog is
open pass, and so do keys a closer listener already handled (`defaultPrevented`) and keys of an IME
composition. A click or drag with a pointer on a palette entry, and the context pad's attach and
delete, hand the focus to the canvas, so Delete and `Ctrl/Cmd+Z` act at once. Enter or Space leave
it on the lasso, hand it to the canvas on the pad's delete, and on a creating palette entry open the
label editor (see "Palette from the keyboard" below). Rename and "Add annotation" open the label
editor too, which gives the focus back to the canvas when it closes. Zoom and fit keys belong to
the host's chrome (guide §5.8: only Cmd/Ctrl + `+` `-` `0` and Shift+1, each acting exactly once),
so the canvas binds none; the
[`@miragon/modeler-shell`](https://www.npmjs.com/package/@miragon/modeler-shell) chrome provides
them together with the zoom panel.

A host that hides the canvas without destroying the modeler makes its container `inert` or
`display: none`, not only transparent: a hidden or inert canvas cannot hold the focus, so no key
reaches it. There is no separate switch to pause the keyboard.

**Palette from the keyboard.** A host chrome that makes the palette a toolbar (the modeler shell)
triggers an entry with a click whose `detail` is 0. On a creating entry that click places the
element in the centre of the free part of the canvas (`freeArea`, else the centre of the view), 24px
further diagonally while that spot is taken, selects it and opens its label editor.

**Embedded in a page.** Layout reads the modeler's container, not the page: in a container up to
760px wide the renderer's own palette takes a second row, whatever the window's width. Its tooltip
stands 8px below the palette, centred on its entry and 12px from the container's sides. Without
`freeArea: { insets }`, the context pad keeps inside the container. A host that resizes the
container calls diagram-js's `canvas.resized()`, as for any diagram-js canvas; the pad then keeps
inside the new size as well.

**Label editor and the view.** A change of the view (a host's `setViewState` or fit, a wheel zoom or
scroll) never commits an open label editor: it stays open with what was typed and moves with its
element. Enter, a click or drag on the canvas and leaving the field commit; Escape discards (law L5
of `@miragon/modeler-api` 1.2).

**Read-only lock.** `modeler.get("ttReadOnly").setReadOnly(true)` locks the canvas while the
document behind it cannot be saved from it (an invalid file in an IDE host): no move, resize,
create, connect, delete, paste, context pad or label editor; selection, zoom, pan, copy and export
stay. It fires `READ_ONLY_CHANGED_EVENT` on every change.

All three share a common base (`TtBaseViewer`) with the same import/export and lifecycle API.

## Quick start

```ts
import { Modeler } from "@miragon/team-topologies-renderer";
import "@miragon/team-topologies-renderer/assets/team-topologies.css";
import { SAMPLE_DOCUMENT } from "@miragon/team-topologies-schema-model";

const modeler = new Modeler({ container: document.querySelector("#canvas")! });

// Load a document (resets the undo history and fits the viewport)
const { warnings } = modeler.importDocument(SAMPLE_DOCUMENT);

// Read the live canvas back as the canonical model
const doc = modeler.exportDocument();

// Export a standalone, self-contained SVG
const { svg } = modeler.saveSVG();

// Undo / redo are driven by the command stack
modeler.undo();
modeler.redo();
```

> **The CSS is required.** Import `@miragon/team-topologies-renderer/assets/team-topologies.css`
> (it also pulls in the Miragon design tokens, `diagram-js`'s own stylesheet and `cd-canvas.css`, in
> that order); without it the palette, context pad and label editor are unstyled. Every colour is a
> `--cd-ui-*` role of design system 1.20.1, vendored unchanged under `src/theme/`. The tokens sit in
> the cascade layer `team-topologies-tokens`, so a host page's own `--cd-*` tokens (unlayered) win
> over this copy.

> **Typeface.** The canvas labels are drawn in the Miragon typeface **Geist**. The library does not
> ship the font; self-host it in the host app (e.g. `@fontsource-variable/geist`) so the on-screen
> canvas and exported SVG render in Geist. Without it, text falls back to a system sans. An SVG drawn
> as an image (to rasterise a PNG) can't use the page's fonts, so embed them first:
> `embedSvgStyles(svg, geistFontFaceCss({ latin, latinExt }))`, with the two latin Geist WOFF2 files
> as `data:` URLs.

## API

### Constructor: `TtViewerOptions`

```ts
new Modeler({
  container?: HTMLElement,            // host element (a detached <div> if omitted)
  width?: number | string,           // canvas width  (default "100%")
  height?: number | string,          // canvas height (default "100%", or "600px" with no container)
  additionalModules?: ModuleDeclaration[], // extra diagram-js modules
  undoRedoKeys?: boolean,            // bind Cmd/Ctrl+Z, Shift+Z, Y (default true; false: the host owns the history)
  freeArea?: { insets: () => FreeAreaInsets } | { center: () => Point | undefined },
                                     // the canvas part no chrome covers; keyboard creation lands in its centre
  freeRectCenter?: () => Point | undefined, // deprecated since 0.12: freeArea: { center }
});
```

### The collaborative-modeler contract

`createCollaborativeModeler(options?)` and `createCollaborativeViewer(options?)` wrap the editor and
the `NavigatedViewer` in the contract of [`@miragon/modeler-api`](https://www.npmjs.com/package/@miragon/modeler-api)
(notation `team-topologies`): `importText` / `exportText` of the canonical document text,
`onContentChanged`, view state and the `elements` surface (teams, interactions, flows and
annotations; their label or text as the name). Hosts that embed the modeler (designIQ, the VS Code
webview) work against it without knowing the renderer. The conformance kit of
`@miragon/modeler-api` runs in this package's browser tests (`npm run test:browser`).

```ts
import { createCollaborativeModeler } from "@miragon/team-topologies-renderer";

const modeler = createCollaborativeModeler();
modeler.attachTo(host);
await modeler.importText(text); // silent, fitted; rejects without a trace for an invalid text
modeler.onContentChanged(() => save(modeler.exportText()));
```

Options: the contract's `CollaborativeModelerOptions` (1.2) and `additionalModules`:

- `freeArea`: the part of the canvas no host chrome covers, `{ insets: () => shell.fitInsets() }`
  (px from the container's edges) or `{ center: () => viewport.freeRectCenter() }` (diagram
  coordinates); keyboard creation lands in its centre. Given as `insets`, the context pad also
  keeps inside it: it flips to the left of its element or moves up or down instead of running
  under the host's chrome. Default: the whole view.
- `fitOnImport` (default true): a fit of at most 100 % that keeps the palette's strip free after
  every import; a host whose chrome fits the diagram itself passes false.
- `undoRedoKeys` (default true): false when the host owns the history (VS Code).
- `freeRectCenter`: deprecated since 0.12, the old name of `freeArea: { center }`; given both,
  `freeArea` wins. It goes in a later minor release.

The viewer takes the same options and ignores `freeArea` and `undoRedoKeys`. `modeler.diagram` is
the wrapped `Modeler`. `elements.bounds(id)` (contract 1.2) returns a team's, interaction's, flow's
or annotation's box in diagram coordinates from the live canvas, `undefined` for any other id.
`contentBounds()` (contract 1.3, modeler and viewer) returns the tight box around every element and
its label text, in diagram coordinates from the live canvas and the same at every zoom and scroll, or
`undefined` while the diagram has no element. Label text counts where it reaches past its shape (a
word longer than a line, more lines than the shape holds); like the label wrapping, its width is
estimated from the characters rather than measured. A host that fits the view itself
(`fitOnImport: false`) fits to it and adds its own margins; the modeler shell's
`connectDiagramJs(shell, diagram, { modeler })` does so by default.

### Shared methods (`Viewer` / `NavigatedViewer` / `Modeler`)

| Method                             | Returns                         | Purpose                                                                                                                                |
| ---------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `importDocument(doc, { fit? })`    | `{ warnings: ImportWarning[] }` | Replace canvas content, reset undo history; fit unless `fit: false`. Throws, before anything changes, for ids that would collide.      |
| `fitToView()`                      | `void`                          | Deprecated: fit every element, keeping the strip under the palette free.                                                               |
| `contentBounds()`                  | `ElementBounds \| undefined`    | The tight box around every element and its label text in diagram coordinates (contract 1.3), `undefined` without elements.             |
| `exportDocument()`                 | `TtDocument`                    | Rebuild the canonical model from the live canvas.                                                                                      |
| `saveSVG()`                        | `{ svg: string }`               | Self-contained SVG snapshot of the `contentBounds()` box, label text included, plus a 40px margin.                                     |
| `setMeta(partial)` / `getMeta()`   | `void` / `RootBusinessObject`   | Read/write diagram-level metadata (`title`); `setMeta` is deprecated, rename with `get("ttModeling").setTitle(title)` (one undo step). |
| `attachTo(el)` / `detach()`        | `void`                          | Move the canvas in/out of the DOM (keeps state).                                                                                       |
| `clear()` / `destroy()`            | `void`                          | Empty the canvas / tear it down.                                                                                                       |
| `on(event, cb)` / `off(event, cb)` | `void`                          | Subscribe to diagram-js events.                                                                                                        |
| `get<T>(name)`                     | `T`                             | Resolve a diagram-js service (advanced).                                                                                               |

### Modeler-only

`undo()`, `redo()`, `canUndo()`, `canRedo()`.

### Around the canvas

What a chrome around the canvas shows, typed structurally (a `@miragon/modeler-shell` handle fits,
and so does a host's own chrome with the same fields). The renderer's stylesheet styles all of it,
so a host without the shell needs nothing else:

- `diagramMenu({ exports, showKeyboardShortcuts, editTitle, shortcutsKey })` builds the menu groups
  of guide §5.4, in the shape the shell's `menu` option takes: Model with "Diagram title…" (only
  with `editTitle`; it changes the document, so a read-only canvas disables it), Export with
  "Export as PNG" and "Export as SVG" (then "Export as JSON" with `exports.json`; an export's
  `shortcut` shows as its chip) and Help with "Keyboard shortcuts…" (`shortcutsKey`, e.g.
  `SHORTCUTS_DIALOG_KEY`, as its chip). The Model group's Legend checkbox is the shell's own.
- `createTitleDialog(chrome, { title, setTitle })` is the "Diagram title…" dialog: one field,
  Cancel and Apply. Enter applies the trimmed title, Escape and Cancel keep the old one, an
  unchanged title writes nothing and a blank one cannot be applied. Pass
  `setTitle: (title) => modeler.get("ttModeling").setTitle(title)` for one undo step.
- `createShortcutsDialog(chrome, { fileKeys })` is the "Keyboard shortcuts…" dialog, one table per
  group (`diagramShortcuts(chrome, options)` returns them as data); `fileKeys` adds a File group
  (Open… on Cmd/Ctrl+O, Export as JSON on Cmd/Ctrl+S) and the `?` key for a web app that binds
  them. Its View rows read the chrome's own zoom and fit texts and key names.
- Both dialogs are native modal `<dialog>`s in `chrome.root` (the shell root), closed by Escape, the
  Close button or a press on the backdrop; the focus goes back to the control that opened them, else
  to `chrome.menu.trigger`. They are built on the first `open()`; call `destroy()` with the
  diagram's teardown.
- `renderLegend(body)` renders the notation legend into a chrome's legend card (the shell's
  `legend.render`): team types, interaction modes and the other elements, each with the palette's
  glyph in its official notation colours, its name and a short explanation. Rows, previews and
  separators carry the shell's `cd-shell-legend-*` classes next to their own, and the renderer's
  stylesheet lays them out with the shell's values, so the legend looks the same with or without
  the shell. It returns the function that removes the rows again.
  `legendGroups()` is the same content as DOM-free data (`preview` is SVG markup) for a host that
  draws the legend itself.

For the Export entries, a host takes `modeler.saveSVG()`: the SVG as it is, or rasterised to a PNG.
An SVG drawn as an image cannot reach the page's fonts, so embed Geist before rasterising:
`embedSvgStyles(svg, geistFontFaceCss({ latin, latinExt }))` (see [Typeface](#quick-start)).

```ts
import {
  createShortcutsDialog,
  createTitleDialog,
  diagramMenu,
  embedSvgStyles,
  geistFontFaceCss,
  renderLegend,
  type TtModeling,
} from "@miragon/team-topologies-renderer";

// `chrome` is a modeler-shell handle or { root, menu: { trigger }, platform, lang, messages }.
const title = createTitleDialog(chrome, {
  title: () => modeler.getMeta()?.title ?? "",
  setTitle: (next) => modeler.get<TtModeling>("ttModeling").setTitle(next),
});
const shortcuts = createShortcutsDialog(chrome);
// The two latin Geist WOFF2 files as data: URLs, from the host's own copy of the font.
const fontCss = geistFontFaceCss({ latin, latinExt });
const menu = diagramMenu({
  editTitle: () => title.open(),
  exports: {
    // savePng and saveSvg are the host's: rasterise and download, or hand the file on.
    png: { onSelect: () => savePng(embedSvgStyles(modeler.saveSVG().svg, fontCss)) },
    svg: { onSelect: () => saveSvg(modeler.saveSVG().svg) },
  },
  showKeyboardShortcuts: () => shortcuts.open(),
});
const removeLegend = renderLegend(legendBody);
```

### Helpers & types

- **Type guards:** `isTtElement`, `isTtTeam`, `isTtInteraction`, `isTtFlow`, `isTtAnnotation`,
  `isTtAssociation`.
- **Runtime element types:** `TtTeam`, `TtInteraction`, `TtFlow`, `TtAnnotation`, `TtElement`, and
  `TtAssociation` (the connector from an annotation to the element it is attached to).
- **Palette icon generators:** `teamIconSvg(type)`, `interactionIconSvg(mode)`, `flowIconSvg()`,
  `annotationIconSvg()`: WYSIWYG SVG glyphs matching what the canvas draws. The annotation glyph
  strokes in `currentColor`.
- **Functional icons:** `iconMarkup(icon, { size?, strokeWidth?, className? })` returns inline SVG
  markup (Lucide style: 24 × 24 grid, stroke 2.5, `currentColor`) for the bundled `ICON_*` Lucide
  nodes of the canvas chrome (context pad, lasso). `ICON_MENU`, `ICON_PLUS`, `ICON_MINUS`,
  `ICON_MAXIMIZE`, `ICON_DOWNLOAD` and `ICON_X` served host chrome and are deprecated: hosts take
  their chrome and its icons from `@miragon/modeler-shell`.
- **Design tokens:** `MIRAGON` (the Miragon colours by name) and `CD_TOKENS` (the same values keyed
  by their `--cd-*` CSS name), for host code that paints outside CSS, e.g. a PNG background.
- **Fonts in exports:** `geistFontFaceCss({ latin, latinExt })` builds the Geist `@font-face` rules
  from two `data:` URLs (`GEIST_UNICODE_RANGES` holds their subsets), and `embedSvgStyles(svg, css)`
  puts CSS at the top of a `saveSVG()` result, so a rasterised PNG keeps the canvas typeface.
- **Chrome content** ([Around the canvas](#around-the-canvas)): `diagramMenu`, `diagramShortcuts`,
  `createShortcutsDialog`, `createTitleDialog`, `renderLegend`, `legendGroups`,
  `JSON_EXPORT_LABEL`, `SHORTCUTS_DIALOG_KEY`, and their structural types (`DiagramMenu`,
  `DiagramMenuActions`, `DiagramExports`, `ShortcutsDialogChrome`, `TitleDialogChrome`,
  `DiagramTitle`, `LegendGroup`, `LegendRow`, …).
- **Other:** `TtViewerOptions`, `ImportOptions`, `ImportWarning`, `RootBusinessObject`, `ROOT_ID`,
  `saveSVG`, `TtReadOnly` and `READ_ONLY_CHANGED_EVENT` (the lock, DI name `ttReadOnly`), and
  `TtViewport` (DI name `ttViewport`: `contentBounds()` and the deprecated palette-aware fit behind
  `fitToView()`).

## How it's built

The package is a set of [didi](https://github.com/nikku/didi) modules layered on diagram-js. Each is
exported (e.g. `ttDrawModule`, `ttPaletteModule`, `ttModelingModule`) so you can compose your own
viewer via `additionalModules`:

| Module                 | Responsibility                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `ttModelModule`        | Element factory with notation defaults (`TtElementFactory`).                           |
| `ttDrawModule`         | SVG rendering of teams, interactions, flow and annotations (`TeamTopologiesRenderer`). |
| `ioModule`             | Document ↔ canvas bridge (`TtImporter`, `TtExporter`, `saveSVG`, `TtViewport`).        |
| `ttModelingModule`     | High-level mutations: label, type, mode, colours, description, annotations.            |
| `ttRulesModule`        | Editing rules (what can move / resize / be created / be attached).                     |
| `ttBehaviorsModule`    | Keeps the model **flat** and annotation connectors cropped, one per annotation.        |
| `ttPaletteModule`      | The lasso tool and the drag-to-create palette.                                         |
| `ttContextPadModule`   | Per-element actions (rename, add/attach annotation, delete; delete a multi-selection). |
| `ttLabelEditingModule` | Double-click in-place label editing.                                                   |
| `ttKeyboardModule`     | Undo / redo / select all / delete / copy / paste / nudge / Esc on the focused canvas.  |
| `ttReadOnlyModule`     | The edit lock for a document the canvas cannot save (`ttReadOnly`).                    |
| `ttZOrderModule`       | Fixed stacking order (flow behind, teams, interactions, annotations on top).           |

### Rendering

A custom `TeamTopologiesRenderer` (priority `1500`, beating diagram-js's default) draws each element
from the spec in [`@miragon/team-topologies-schema-model`](../schema-model): the four team outlines
(octagon, vertical/horizontal rounded rectangles, square rectangle) drawn solid; the three
interaction glyphs (parallelogram, triangle, circle) drawn dashed and opaque, their translucent
template fill mixed over white (design guide §10.6); the flow-of-change as a dashed left-to-right
band; an annotation as a BPMN-style open bracket with left-aligned text, tied to its element by a
dashed connector. Labels are word-wrapped (explicit line breaks are kept) and centred. Per-element
`fill`/`stroke` overrides win over the spec defaults (an interaction's own fill is mixed over white
the same way), and stay visible while an element is selected or hovered (the selection is a
separate blue outline). On a dark custom fill, team and interaction labels switch to white.

## Import / export

The package reads and writes the canonical `TtDocument` (JSON) and exports a standalone **SVG**. The
export leaves out selection, hover and resize chrome and puts a white sheet behind the diagram, so
it looks the same wherever it is opened.
PNG export and the embedded-scene round-trip (storing the document inside the exported image) live in
the [web app](../../apps/webapp) and the [VS Code extension](../../apps/vscode), which add the canvas
rasterisation those formats need.

## Development

Part of the [Team Topologies Modeler](../../README.md) in the
[Miragon modeler suite](https://github.com/Miragon/modeler-suite); consumed from source by the
apps. From the suite's root:

```bash
npm run build -w @miragon/team-topologies-renderer   # Vite library build → dist/ (publish build)
npm run team-topologies test                         # Vitest unit tests
npm run team-topologies test:browser                 # renderer integration tests in real Chromium
npm run team-topologies typecheck
```

## License

[MIT](../../LICENSE). diagram-js and its dependencies are MIT / ISC / Apache-2.0.
