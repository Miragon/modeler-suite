# @miragon/wardley-renderer

[![npm](https://img.shields.io/npm/v/@miragon/wardley-renderer)](https://www.npmjs.com/package/@miragon/wardley-renderer)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/wardley-maps/LICENSE)

[diagram-js](https://github.com/bpmn-io/diagram-js)-based renderer for
[Wardley Maps](https://learnwardleymapping.com/): `Viewer`, `NavigatedViewer`, and a full editable
`Modeler`, plus OWM / JSON import and OWM / JSON / SVG export (a PNG through `svgToPng` of
`@miragon/modeler-shell/export`). Browser/DOM only.

## Install

```bash
npm install @miragon/wardley-renderer
```

## Usage

```ts
import { NavigatedViewer } from "@miragon/wardley-renderer";
import "@miragon/wardley-renderer/assets/wardley.css";

const viewer = new NavigatedViewer({ container: document.querySelector("#canvas")! });

await viewer.importDSL(`title Tea Shop
anchor Business [0.95, 0.63]
component Kettle [0.43, 0.35]
evolve Kettle 0.62
Business -> Kettle`);

const map = viewer.exportMap(); // canonical JSON model
const dsl = viewer.exportDSL(); // back to OWM text
const { svg } = await viewer.saveSVG();
```

Swap `NavigatedViewer` for `Modeler` to get the editable map (palette, context pad, undo/redo).

Without the Miragon modeler shell, the `Modeler`'s palette is the design guide's toolbar: a glass
island at the top centre, ahead of the canvas in the tab order (one tab stop; arrows, Home and End
move), with tooltips. It lies before the canvas `<svg>` in the container, so find the canvas with
`canvas.getContainer().querySelector(":scope > svg")`. A palette a chrome skins
(`data-chrome="palette"`) is left to that chrome. One tool is armed at a time; the lasso is
`aria-pressed="true"` only while armed. Under the host's read-only lock (`setReadOnly`) the palette
marks every entry but the lasso `aria-disabled="true"`; explore mode's toolbar is not marked.

## API

| Member                                                                     | What it does                                                                                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `importDSL(text)` / `importMap(map)`                                       | Loads a map (replaces the content, clears the undo history). Resolves to `{ warnings }`.                                                            |
| `exportDSL()` / `exportMap()` / `saveSVG()`                                | The map as canonical OWM text, as the JSON model, or as a standalone SVG (never shows selection or hover state).                                    |
| `setTitle(title)`                                                          | Sets the map title (one undo step in the `Modeler`).                                                                                                |
| `getMapSize()`                                                             | The plot size as drawn, whether the map writes it (`size [w, h]`) and the matching preset.                                                          |
| `setMapSize(width, height, { transient })` / `resetMapSize({ transient })` | Changes the plot size (rounded and clamped to 480–5000 × 320–5000). In the `Modeler` one undo step, no re-import; `transient` previews without one. |
| `setEvolutionLabels(labels, { transient })`                                | Sets the four X-axis stage labels (normalized, see below); `transient` previews without an undo step.                                               |
| `undo()` / `redo()` / `canUndo()` / `canRedo()`                            | `Modeler` only: the canvas command stack.                                                                                                           |
| `commitPendingEdits()`                                                     | `Modeler` only: saves an open inline editor, e.g. before a save shortcut.                                                                           |
| `on(event, callback)` / `off(event, callback)`                             | diagram-js events, see below.                                                                                                                       |
| `blobToBase64(blob)`                                                       | Encodes a Blob, such as the PNG of the shell's `svgToPng` (see below), as Base64 without the data-URL prefix.                                       |
| `setAsideEditorState(modeler)` / `restoreEditorState(…)`                   | Keeps the selection and an open inline editor across a re-import of an externally changed map.                                                      |

`setEvolutionLabels` turns an empty stage into its default label and `->` into `→`, so the labels
always write a valid `evolution` line; the default set is stored as `undefined`.

An import validates the whole map first: an invalid map rejects before the canvas changes, and a
rendering failure restores the previous map. It then fits the plot into the view (never above 100 %).

An open inline editor (name, note, link annotation, flow value, link address) survives view changes
and moves with its element; Enter, blur or a click on the canvas saves it. Names are a
`textarea.wardley-label-input`; Shift+Enter breaks the line (in notes Enter breaks and Cmd/Ctrl+Enter
saves), written to the DSL as a literal `\n`. A typed backslash before `n` is saved as `∖` (U+2216).

Options (the names of the `@miragon/modeler-api` 1.2 factory options):

- `undoRedoKeys: false` leaves Cmd/Ctrl+Z, Shift+Z and Y to the host (VS Code owns its document's
  undo stack).
- `freeArea: { insets: () => ({ top, right, bottom, left }) }` names the canvas edges a host's chrome
  covers: the import fits the plot into the rest, panning keeps the map inside it, a view the host
  fitted into it stays where the host put it, and keyboard creation places elements in its centre.
  `freeArea: { center: () => ({ x, y }) }` gives only that centre, in diagram coordinates.
- `fitOnImport: false` leaves the view after an import to the host, whose chrome fits it.
- `additionalModules` adds diagram-js modules; every Wardley feature module is exported for custom
  editors.
- `openRelativeLink: (address) => …` follows a link without a scheme (`details/payment.wmap`) from
  the context pad: only the host knows where the map's file lies, so it resolves the address or says
  why it can't. Without this option the pad offers no "Open link" on such an address. No scheme but
  http(s) and `mailto:` ever opens.
- `openExternalLink: (address) => …` opens an http(s) or `mailto:` address from the context pad;
  without it a new browser tab opens. A host whose page can't open windows, such as a VS Code
  webview, hands the address to its own opener.
- `chooseLinkTarget: () => Promise<string | undefined>` adds "Link to map…" to the context pad of a
  component or submap: the host lets the user choose another map and resolves with its address
  relative to the current map (`undefined` when the user cancels), which becomes the element's link
  in one undoable step.

A component or submap whose link the editor can open carries a small link mark (Lucide `link`,
`--cd-ui-link`) at its lower left; the viewer and exports show none.

The `wardleyReadOnly` service (`modeler.get<WardleyReadOnly>('wardleyReadOnly').setReadOnly(true)`)
locks the canvas while the host cannot save, e.g. while the document is invalid: edits are vetoed,
open editors and drags end without saving; selection, zoom, pan and export stay.
`setReadOnly(true, { delayMs: 800 })` locks at once but shows the marks only after the delay
(no flicker while typing); `isReadOnlyShown()` tells whether they show. The lock has two reasons:
`setReadOnly` sets `"document"`, explore mode sets `"explore"` (`setExploreLock`), and neither ends
the other, so a valid import's `setReadOnly(false)` keeps explore mode locked. `isReadOnly()` is
true while any reason holds, `isLockedBy(reason)` asks for one; only the document reason marks the
palette and adds the container class `wardley-read-only`. It fires `wardley.readOnly.changed` with
`{ readOnly, shown, reasons }` whenever a reason comes or goes.

Keyboard: the canvas's keys (undo/redo, delete, copy/paste/duplicate, select all, arrows, Escape,
the tools C, U, N, P, L, A and E for explore mode) act only while the canvas `<svg>` has the focus,
so keys aimed at a host's controls stay with the host. A click on the canvas, a palette entry or a
context-pad action hands it the focus. A host that hides the canvas without destroying it should use `inert`,
`display: none` or `visibility: hidden`. Escape ends every drag without a change. While the draw
tool holds a line or a drawing's point is dragged, keys that would start another gesture do
nothing; an undo or other command ends such a drag without a commit. E does nothing while a line
is held or any drag runs (a label, a point, the evolve target, a diagram-js drag), whose release
still edits the map; explore mode's palette entry and menu checkbox save a held line first, as
the switch to another tool does.

## Explore mode

The `Modeler` can show a map step by step along its value chain instead of all at once. The
palette's "Explore mode" entry, the E key and a host's "Explore mode" menu checkbox switch it on
and off. It starts at the one selected component, else it asks to pick one ("Pick a component to
start from."; the components show faded and a click on one starts there; "Start from…" in the
toolbar lists them by name). From a component that shows, the user reveals what it needs (its
dependencies, downwards) or what needs it (its dependents, upwards), one level or the whole chain:
with the chips above and below it, which count what is hidden, with its context pad, or with ↓ and
↑ (Shift for the whole chain). Only dependency links are followed, and a pipeline's membership as
one more step: downwards a pipeline's anchor (or a standalone pipeline) leads to its members, so a
chain goes on to what they need, and upwards a member leads to its anchor (or its standalone
pipeline). Members show with their anchor, so they never count as hidden next to it. A link or
flow shows once both its ends do, a pipeline frame once its anchor or a member does, notes and
other commentary and the links to them once every component does. While it runs the palette is
its toolbar: "Explore mode" (pressed), "Start from…", "Step back" (B), "Show all", "Start over"
(R) and "Faded rest" (F, draws what is hidden faded instead of leaving it out); H and the context
pad's Hide hide the selected component when that hides something (a member stays while its anchor
shows). A line at the top says how many components show ("3 of 14 components"); it is a live
region that stays in the canvas, empty outside explore mode.

Exploring edits nothing: no command runs, the undo history, `exportDSL()` and the contract's
`exportText()` stay as they are, and the canvas is locked for the reason `"explore"` (see the
read-only lock above). `saveSVG()`, and so every PNG, holds only what shows, also when the rest is
drawn faded; outside explore mode the SVG is the same as before. The revealed components are kept
by document id, so an import while exploring (a host's echo, an outside edit) keeps them, and new
elements stay hidden. In a collaborative host, `elements.reveal(id)` shows a hidden element first:
a component as a step, a pipeline by its anchor, an accelerator by showing everything; what explore
mode cannot show (an accelerator on a map without components) ends explore mode. Then it selects
the element as before.

The `wardleyExplore` service (`modeler.get<WardleyExplore>("wardleyExplore")`) takes the ids of
the elements on the canvas:

| Member                                                           | What it does                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isActive()` / `phase()`                                         | Whether explore mode runs; `"pick"` until a start is chosen, then `"exploring"`.                                                                                                                                      |
| `enter(startId?)` / `exit()` / `toggle()`                        | Starts at `startId`, else at the one selected component, else with the pick phase; `exit()` shows everything and keeps the selection.                                                                                 |
| `startFrom(id)`                                                  | Shows that component alone.                                                                                                                                                                                           |
| `revealNeighbours(id, direction)` / `revealChain(id, direction)` | Reveals one level or the whole chain of `"dependencies"` or `"dependents"` of a component that shows.                                                                                                                 |
| `hide(id)` / `showAll()` / `stepBack()` / `restart()`            | Hides a revealed component, shows the whole map, goes back one step, or goes back to the pick phase.                                                                                                                  |
| `canHide(id)`                                                    | Whether `hide(id)` hides something: false for a member its anchor brings along, where `hide` does nothing.                                                                                                            |
| `setFadeRest(on)` / `isFadeRest()`                               | Draws what is hidden faded.                                                                                                                                                                                           |
| `canStepBack()` / `counts()`                                     | Whether there is a step to go back to; `{ visible, total }` components.                                                                                                                                               |
| `isHidden(element)` / `revealElement(id)`                        | Whether explore mode hides an element; shows a hidden one (a component as a step, a link by its ends, anything else by showing everything; what still cannot show ends explore mode) and tells whether it shows then. |

`wardley.explore.changed` (`EXPLORE_CHANGED`) fires after every change, once the canvas shows it,
with `{ active, phase, visibleCount, totalCount, fadeRest, canStepBack }`. While it runs the
canvas container carries `wardley-exploring` (and `wardley-explore-picking` in the pick phase,
`wardley-explore-faded` while the rest shows faded), and hidden elements carry the marker
`wardley-explore-hidden`.

Under the IDE host's document lock (an invalid file) the shell disables every palette entry but
the lasso, the explore toolbar included; the E key and the menu checkbox still switch explore mode
on and off there.

## Collaborative hosts

`createCollaborativeModeler()` and `createCollaborativeViewer()` implement the
[`@miragon/modeler-api`](https://www.npmjs.com/package/@miragon/modeler-api) collaborative-modeler
contract (notation `wardley`), for hosts that keep the map text in a shared document:

```ts
import { createCollaborativeModeler } from "@miragon/wardley-renderer";
import "@miragon/wardley-renderer/assets/wardley.css";

const modeler = createCollaborativeModeler();
modeler.attachTo(document.querySelector("#canvas")!);
await modeler.importText(documentText);
modeler.onContentChanged(() => save(modeler.exportText()));
```

An import is silent (no change is reported back), keeps the selection and an open label editor,
and fits the view unless `fitOnImport: false`. It ends a running gesture first, without a change;
an armed tool that only waits for the next press stays armed. An `importText` called while a user
action runs (e.g. from a change listener) waits until the action has finished; waiting imports keep
their order. A `destroy()` from any listener tears the map down once the current input handler has
returned, without errors, and no listener hears anything afterwards; a pending import then rejects
with "The modeler was destroyed." (details:
[#285](https://github.com/Miragon/modeler-suite/issues/285),
[#336](https://github.com/Miragon/modeler-suite/issues/336),
[#346](https://github.com/Miragon/modeler-suite/issues/346),
[#415](https://github.com/Miragon/modeler-suite/issues/415)).

`exportText()` is the committed document, never a live preview: during a plot-corner, evolve or
label drag or a size or axis-label preview it returns the previous text, and the commit's change
event brings the new one ([#347](https://github.com/Miragon/modeler-suite/issues/347)).

`elements` names components, anchors, pipelines, submaps and accelerators by their document id
(`cmp_kettle`); `elements.bounds(id)` gives an element's live box. `getViewState` / `setViewState`
carry the viewbox. `contentBounds()` (contract 1.3) gives the box to fit: the plot with its axes and
everything drawn beyond it; never `undefined` while the modeler lives. `diagram` is the wrapped
`Modeler` or `NavigatedViewer`. Both factories take the options above; the viewer ignores the undo
keys and link handlers. Both pass the contract's conformance kit without skips.

`interaction` (contract 1.5): `active()` is true while the user holds a gesture (a drag, a create,
a connect), so a host can defer a remote re-import; false while a tool only waits, during a pan and
on the viewer. `onChange(callback)` reports each change once and may run inside `importText`, so
queue a re-import instead of importing from it.

`appearance` (contract 1.5): `themes` is `WARDLEY_THEMES` (`["light"]` for now);
`set({ theme, contrast })` writes `data-cd-theme` and, for `contrast: "high"`,
`data-cd-kontrast="hoch"` on the map's container. It is view state: no change event, same exports.
`@miragon/wardley-renderer/themes` exports `WARDLEY_THEMES` without DOM code.

### Menu entries and dialogs for a host's chrome

`mapMenu(actions)` gives the map's entries of a chrome menu (Model: the "Explore mode" checkbox
when `explore` is passed, "Map title…" when `mapTitle` is passed, "Map size…", "X-axis labels…";
Export; Help) in the shape of
[`@miragon/modeler-shell`](https://www.npmjs.com/package/@miragon/modeler-shell)'s menu groups.
Pass the `wardleyExplore` service as `explore`: the checkbox stays usable on a read-only canvas,
the entries that change the document are disabled while exploring, and the host refreshes its
menu on `wardley.explore.changed`, as explore mode runs no command.
`createMapSizePopover(chrome, modeler)`, `createAxisLabelsPopover(chrome, modeler)` and
`createTitleDialog(chrome, modeler)` build the popovers and the title dialog (one undo step each).
`mapShortcuts(chrome, options)` returns the "Keyboard shortcuts…" groups as data; pass
`{ fileKeys: true, shortcutsKey: '?' }` if the host binds Cmd/Ctrl+O/S/V and `?`, and open it with
`shell.showShortcutsDialog(…)` (or `showShortcutsDialog(…, { container })` without a mounted shell).
`createMapDialog(chrome, parts)` and `dialogButton(label, variant)` build dialogs in the same look.
`chrome` is the shell handle or anything of its shape; the renderer never imports the shell.

### PNG export

`svgToPng` of `@miragon/modeler-shell/export` rasterizes `saveSVG()` and embeds Geist. A map's PNG
lies on `COLORS.plotBackground`:

```ts
import { COLORS } from "@miragon/wardley-renderer";
import { svgToPng } from "@miragon/modeler-shell/export";

const { svg } = await modeler.saveSVG();
const png = await svgToPng(svg, { background: COLORS.plotBackground }); // 2×
const forSlides = await svgToPng(svg, { background: "transparent", scale: 4 });
```

## Events

| Event                        | Payload                           | Notes                                                                                                                             |
| ---------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `import.done`                | `{ warnings }`                    | After every import.                                                                                                               |
| `commandStack.changed`       | `{ trigger }`                     | `Modeler`: after every committed edit, undo and redo, including size, title and label changes.                                    |
| `wardley.config.changed`     | `WardleyConfigChangedEvent`       | Title, size or axis labels changed. `transient` events are live previews (typing, dragging the plot corner): do not persist them. |
| `wardley.label.deduplicated` | `{ element, requested, applied }` | A typed name was taken and a free variant (`Tea 2`) was used instead.                                                             |
| `wardley.readOnly.changed`   | `{ readOnly, shown, reasons }`    | A reason of the lock came or went (`"document"`, `"explore"`), or the marks of a delayed document lock show.                      |
| `wardley.explore.changed`    | `ExploreChangedEvent`             | `Modeler`: explore mode started, ended or took a step. No command runs, so a host refreshes its menu here.                        |

### Fonts

No fonts ship and nothing loads from a CDN. Provide Geist, e.g.
`import "@fontsource-variable/geist/wght.css"`; the font stack starts with
`'Geist Variable', 'Geist', …`.

Part of the [Wardley Maps Modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/wardley-maps) in the [Miragon modeler suite](https://github.com/Miragon/modeler-suite).

## License

MIT

The tool icons of the palette (`square-dashed-mouse-pointer`, `telescope`, for Draw `spline` with a
straight segment, and in explore mode `search`, `step-back`, `eye`, `rotate-ccw` and `blend`), the
Close icon of the dialogs (`x`), the icons of the context pad (`pencil`, `trash`, `circle-plus`,
`arrow-right`, `chevrons-right`, `sliders-horizontal`, `line-style`, `palette`, `link`, `map`,
`external-link`, for Remove evolve `chevrons-right` with the corner `x` of `calendar-x-2`, and in
explore mode `chevron-down`, `chevron-up`, `chevrons-down`, `chevrons-up` and `eye-off`) and of
explore mode's chips (`chevron-up`, `chevron-down`) are copied from [Lucide](https://lucide.dev)
(`lucide-static` 1.59.0):

> ISC License
>
> Copyright (c) 2026 Lucide Icons and Contributors
>
> Permission to use, copy, modify, and/or distribute this software for any purpose with or without
> fee is hereby granted, provided that the above copyright notice and this permission notice
> appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
> SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
> AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
> WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
> NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
> PERFORMANCE OF THIS SOFTWARE.

`arrow-right`, `chevron-down`, `chevron-up`, `chevrons-down`, `chevrons-right`, `chevrons-up`,
`circle-plus`, `external-link`, `link`, `map`, `search`, `trash` and `x` are derived from
[Feather](https://feathericons.com):

> The MIT License (MIT)
>
> Copyright (c) 2013-present Cole Bemis
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
> BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The other icons (the anchor, accelerator and deaccelerator glyphs of the canvas and the palette)
are [Material Icons](https://fonts.google.com/icons) by Google, under the Apache License 2.0.
