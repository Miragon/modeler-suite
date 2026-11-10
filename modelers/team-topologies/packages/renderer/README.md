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

Shortcuts act only while the canvas `<svg>` has the focus, so keys on host chrome, the palette,
the context pad, the label editor or an open dialog pass. Pointer clicks on palette entries and the
pad's attach and delete hand the focus to the canvas. Zoom and fit keys belong to the host's chrome
(guide §5.8), so the canvas binds none. A host that hides the canvas without destroying it uses
`inert`, `display: none` or `visibility: hidden`.

**Palette from the keyboard.** Without a chrome that skins the palette (`data-chrome="palette"`),
the palette is the guide §5.5 toolbar "Tools": one tab stop (← → Home End), `aria-pressed` on the
armed lasso, tooltips with name and key (guide §5.6). Enter or Space on a creating entry places the
element in the centre of `freeArea` (24px offset while taken) and opens its label editor. In a
container up to 760px wide the palette takes a second row. A host that resizes the container calls
`canvas.resized()`.

**Label editor.** A view change never commits an open label editor; Enter, a click on the canvas or
blur commits, Escape discards (law L5 of `@miragon/modeler-api` 1.2).

**Read-only lock.** `modeler.get("ttReadOnly").setReadOnly(true)` locks every edit while the
document cannot be saved (an invalid file); selection, zoom, pan, copy and export stay.
`setReadOnly(true, { delayMs: 800 })` locks at once and marks the palette (`aria-disabled`) only
after the delay, so typing beside the canvas does not flicker; `isReadOnlyShown()` tells whether
the marks show. `READ_ONLY_CHANGED_EVENT` carries `{ readOnly, shown }`.

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
> `--cd-ui-*` role of design system 1.32.0, vendored unchanged under `src/theme/`. The tokens sit in
> the cascade layer `team-topologies-tokens`, so a host page's own `--cd-*` tokens (unlayered) win
> over this copy.

> **Typeface.** The canvas labels are drawn in the Miragon typeface **Geist**. The library does not
> ship the font; self-host it in the host app (e.g. `@fontsource-variable/geist`) so the on-screen
> canvas and exported SVG render in Geist. Without it, text falls back to a system sans. An SVG drawn
> as an image (to rasterise a PNG) can't use the page's fonts: `svgToPng` of
> `@miragon/modeler-shell/export` embeds the Geist subsets the text needs before it rasterises, and
> `embedGeist(svg, faces)` from the same entry embeds them for a host with a rasteriser of its own.

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
});
```

### The collaborative-modeler contract

`createCollaborativeModeler(options?)` and `createCollaborativeViewer(options?)` wrap the editor and
the `NavigatedViewer` in the contract of [`@miragon/modeler-api`](https://www.npmjs.com/package/@miragon/modeler-api)
(notation `team-topologies`): `importText` / `exportText` of the canonical document text,
`onContentChanged`, view state, the `elements` surface (teams, interactions, flows and
annotations; their label or text as the name) and the `interaction` and `appearance` surfaces of
contract 1.5. Hosts that embed the modeler (designIQ, the VS Code
webview) work against it without knowing the renderer. The conformance kit of
`@miragon/modeler-api` runs in this package's browser tests (`npm run test:browser`).

```ts
import { createCollaborativeModeler } from "@miragon/team-topologies-renderer";

const modeler = createCollaborativeModeler();
modeler.attachTo(host);
await modeler.importText(text); // silent, fitted; rejects without a trace for an invalid text
modeler.onContentChanged(() => save(modeler.exportText()));
```

An import that arrives during a drag (a peer's text in a live sync) ends the gesture first, as
Escape does, without a change; an armed lasso stays armed. An `importText` made while a user action
runs (from the change listener of its command, or from `elements.onSelection` at a drag's start)
waits until the action has finished, and its promise settles after that import; an open label
editor comes back with what was typed. `importDocument` of the wrapped diagram cannot wait. A
`destroy()` from any listener tears the diagram down once the current handler has returned, and no
listener hears anything afterwards; a waiting import rejects with "The modeler was destroyed."
([#346](https://github.com/Miragon/modeler-suite/issues/346),
[#380](https://github.com/Miragon/modeler-suite/issues/380),
[#415](https://github.com/Miragon/modeler-suite/issues/415)).

`interaction` (contract 1.5, modeler and viewer): `active()` is true from the start of a move,
resize (from the press on its handle), connect, lasso drag or palette create until its drop or
cancel; `onChange(listener)` reports each change once and may run inside `importText`, so queue
the next import instead of starting it there.

`appearance` (contract 1.5): `themes` is `TEAM_TOPOLOGIES_THEMES` (`["light"]`);
`set({ theme, contrast })` writes `data-cd-theme` and, for `contrast: "high"`,
`data-cd-kontrast="hoch"` on the container, so the canvas follows the request, not the page. View
state only: no change event, identical exports. Under high contrast, the official contours below
3:1 lie on a `--cd-ui-kontur` underlay (guide §10.6, `cd-c-unterleger-hoch`), also in palette,
legend and inspector previews; exports drop it.

Options: the contract's `CollaborativeModelerOptions` (1.2) and `additionalModules`:

- `freeArea`: the part of the canvas no host chrome covers, `{ insets: () => shell.fitInsets() }`
  (px from the container's edges) or `{ center: () => viewport.freeRectCenter() }` (diagram
  coordinates); keyboard creation lands in its centre. Given as `insets`, the context pad also
  keeps inside it: it flips to the left of its element or moves up or down instead of running
  under the host's chrome. Default: the whole view.
- `fitOnImport` (default true): a fit of at most 100 % that keeps the palette's strip free after
  every import; a host whose chrome fits the diagram itself passes false.
- `undoRedoKeys` (default true): false when the host owns the history (VS Code).

The viewer ignores `freeArea` and `undoRedoKeys`. `modeler.diagram` is the wrapped `Modeler`.
`elements.bounds(id)` (contract 1.2) gives an element's live box. `contentBounds()` (contract 1.3)
gives the tight box around every element and its label text (estimated width), the same at every
zoom, or `undefined` without elements; fit to it and add your own margins.

### Shared methods (`Viewer` / `NavigatedViewer` / `Modeler`)

| Method                             | Returns                         | Purpose                                                                                                                           |
| ---------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `importDocument(doc, { fit? })`    | `{ warnings: ImportWarning[] }` | Replace canvas content, reset undo history; fit unless `fit: false`. Throws, before anything changes, for ids that would collide. |
| `contentBounds()`                  | `ElementBounds \| undefined`    | The tight box around every element and its label text in diagram coordinates (contract 1.3), `undefined` without elements.        |
| `exportDocument()`                 | `TtDocument`                    | Rebuild the canonical model from the live canvas.                                                                                 |
| `saveSVG()`                        | `{ svg: string }`               | Self-contained SVG snapshot of the `contentBounds()` box, label text included, plus a 40px margin.                                |
| `getMeta()`                        | `RootBusinessObject`            | Read diagram-level metadata (`title`), the title of the imported document or the `Modeler`'s rename.                              |
| `attachTo(el)` / `detach()`        | `void`                          | Move the canvas in/out of the DOM (keeps state).                                                                                  |
| `clear()` / `destroy()`            | `void`                          | Empty the canvas / tear it down.                                                                                                  |
| `on(event, cb)` / `off(event, cb)` | `void`                          | Subscribe to diagram-js events.                                                                                                   |
| `get<T>(name)`                     | `T`                             | Resolve a diagram-js service (advanced).                                                                                          |

### Modeler-only

`undo()`, `redo()`, `canUndo()`, `canRedo()`. Rename the diagram with
`get("ttModeling").setTitle(title)` (one undo step). A `Viewer` or `NavigatedViewer` has no
`ttModeling`: it shows the title of the document it imports, so it takes a new one with
`importDocument({ ...exportDocument(), title }, { fit: false })`.

### Around the canvas

What a chrome around the canvas shows, typed structurally (a `@miragon/modeler-shell` handle fits,
and so does a host's own chrome with the same fields). The renderer's stylesheet styles the menu,
the title dialog and the legend, so a host without the shell needs nothing else for them; the
shortcuts dialog is the shell's (below):

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
- `diagramShortcuts(chrome, { fileKeys })` returns the "Keyboard shortcuts…" dialog's content as
  data, one group per table (View, Edit, Tools); `fileKeys` adds a File group (Open… on Cmd/Ctrl+O,
  Export as JSON on Cmd/Ctrl+S) and the `?` key for a web app that binds them. The shell shows it:
  `shell.showShortcutsDialog(diagramShortcuts(shell, options))`, with its own zoom and fit rows at
  the top of the View group (the renderer's View rows for them are left out), or the standalone
  `showShortcutsDialog(groups, { container })` of `@miragon/modeler-shell` in a host without a
  mounted shell.
- The title dialog is a native modal `<dialog>` in `chrome.root` (the shell root), closed by Escape,
  the Close button or a press on the backdrop; the focus goes back to the control that opened it,
  else to `chrome.menu.trigger`. It is built on the first `open()`; call `destroy()` with the
  diagram's teardown.
- `renderLegend(body)` renders the notation legend into a chrome's legend card (the shell's
  `legend.render`): team types, interaction modes and the other elements, each with the palette's
  glyph in its official notation colours, its name and a short explanation. Rows, previews and
  separators carry the shell's `cd-shell-legend-*` classes next to their own, and the renderer's
  stylesheet lays them out with the shell's values, so the legend looks the same with or without
  the shell. It returns the function that removes the rows again.
  `legendGroups()` is the same content as DOM-free data (`preview` is SVG markup) for a host that
  draws the legend itself.

For the Export entries, a host takes `modeler.saveSVG()`: the SVG as it is (transparent: nothing is
drawn behind the diagram), or rasterised to a PNG. An SVG drawn as an image cannot reach the page's
fonts, and a PNG needs a background (guide §10.7: `hell['--cd-ui-grund']` of the design system's
`cd-tokens.generated.json`, `#F9F7F7`, since this notation has no plot; the `miragon-brand` skill
ships it, and the renderer's `MIRAGON.grau` is the same colour). `svgToPng` of
`@miragon/modeler-shell/export` does both (see [Typeface](#quick-start)).

```ts
import {
  createTitleDialog,
  diagramMenu,
  diagramShortcuts,
  renderLegend,
  type TtModeling,
} from "@miragon/team-topologies-renderer";
import { svgToPng } from "@miragon/modeler-shell/export";
// The host's copy of the design system's tokens (shipped with the `miragon-brand` skill).
import tokens from "./cd-tokens.generated.json";

// `shell` is a mounted modeler-shell handle. A host without one passes its own chrome, { root,
// menu: { trigger }, platform, lang, messages }, to the title dialog and opens the shortcuts with
// the standalone `showShortcutsDialog(groups, { container })` of `@miragon/modeler-shell`.
const title = createTitleDialog(shell, {
  title: () => modeler.getMeta()?.title ?? "",
  setTitle: (next) => modeler.get<TtModeling>("ttModeling").setTitle(next),
});
const menu = diagramMenu({
  editTitle: () => title.open(),
  exports: {
    // savePng and saveSvg are the host's: download the file, or hand it on.
    png: {
      onSelect: async () =>
        savePng(
          await svgToPng(modeler.saveSVG().svg, { background: tokens.hell["--cd-ui-grund"] }),
        ),
    },
    svg: { onSelect: () => saveSvg(modeler.saveSVG().svg) },
  },
  showKeyboardShortcuts: () => shell.showShortcutsDialog(diagramShortcuts(shell)),
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
  markup (Lucide style: 24 × 24 grid, stroke 2.5, `currentColor`) for the bundled Lucide nodes of
  the canvas chrome: `ICON_PENCIL`, `ICON_TRASH`, `ICON_LINK` and `ICON_MESSAGE_SQUARE_PLUS` (context
  pad) and `ICON_SQUARE_DASHED_MOUSE_POINTER` (lasso). The icons of a host's chrome (menu, zoom,
  close) come from `@miragon/modeler-shell`.
- **Design tokens:** `MIRAGON` (the Miragon colours by name) and `CD_TOKENS` (the same values keyed
  by their `--cd-*` CSS name), for host code that paints outside CSS.
- **Chrome content** ([Around the canvas](#around-the-canvas)): `diagramMenu`, `diagramShortcuts`,
  `createTitleDialog`, `renderLegend`, `legendGroups`, `JSON_EXPORT_LABEL`,
  `SHORTCUTS_DIALOG_KEY`, and their structural types (`DiagramMenu`, `DiagramMenuActions`,
  `DiagramExports`, `ShortcutsChrome`, `TitleDialogChrome`, `DiagramTitle`, `LegendGroup`,
  `LegendRow`, …).
- **Other:** `TtViewerOptions`, `ImportOptions`, `ImportWarning`, `RootBusinessObject`, `ROOT_ID`,
  `saveSVG`, `TtReadOnly` and `READ_ONLY_CHANGED_EVENT` (the lock, DI name `ttReadOnly`), and
  `TtViewport` (DI name `ttViewport`, for `contentBounds()`; its `fit()` is the internal fit of
  `importDocument`).

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

`TeamTopologiesRenderer` (priority `1500`) draws each element from the spec in
[`@miragon/team-topologies-schema-model`](../schema-model): solid team outlines, dashed opaque
interaction glyphs (template fill mixed over white, guide §10.6), the flow of change as a dashed
band, annotations as open brackets with a dashed connector. Labels wrap and centre, keeping explicit
breaks. `fill` / `stroke` overrides win and stay visible when selected; labels on dark fills turn
white.

## Import / export

The package reads and writes the canonical `TtDocument` (JSON) and exports a standalone **SVG**. The
export leaves out selection, hover and resize chrome and draws nothing behind the diagram, so the
SVG is transparent like the other notations'. The PNG export fills the background of guide §10.7
itself, and the embedded-scene round-trip (storing the document inside the exported image) lives in
the [web app](../../apps/webapp) and the [VS Code extension](../../apps/vscode), which rasterise
through the shell's `svgToPng` for it.

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
