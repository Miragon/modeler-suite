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
| `svgToPng(svg, { scale, transparent })` (deprecated) / `blobToBase64`      | Deprecated, see below: rasterizes an exported SVG (default 2×, paper background). `blobToBase64` encodes a Blob.                                    |
| `setAsideEditorState(modeler)` / `restoreEditorState(…)`                   | Keeps the selection and an open inline editor across a re-import of an externally changed map.                                                      |

`setEvolutionLabels` turns an empty stage into its default label and `->` into `→`, so the labels
always write a valid `evolution` line; the default set is stored as `undefined`.

An import validates the whole map first: a map that is not importable rejects before the canvas
changes, and a rendering failure puts the previous map back. It then fits the view to the plot with
its axis margins, centred in the free area and never above 100 %. Without a `freeArea` the pan
constraint may still move a map smaller than the view, to keep its margins around it.

An open inline editor (name, note, link annotation, flow value, link address) stays open with its
typed text across a view change, a scroll, a zoom or a host's fit, and moves with its element;
Enter, leaving the field, or a click or drag on the canvas saves it. Shift+Enter breaks the line in
a name (a note's Enter breaks it, and Cmd/Ctrl+Enter saves); the editor of a name is a `<textarea>`
that grows with its lines, `textarea.wardley-label-input`. A name's line breaks are drawn as lines
of the label and written to the DSL as a literal `\n` (`@miragon/wardley-dsl`). A backslash typed
before an `n` in a name is saved as `∖` (U+2216), because the DSL would read `\n` back as a break.

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

The `wardleyReadOnly` service (`modeler.get<WardleyReadOnly>('wardleyReadOnly').setReadOnly(true)`)
locks the canvas while its host cannot save an edit, e.g. while the document is invalid: every edit
rule is vetoed, an open editor, popup or drag ends without saving, the handles hide, and selection,
zoom, pan, select all and export stay. It fires `wardley.readOnly.changed`.

The canvas's keys (undo and redo, delete, copy, paste and duplicate, select all, the arrows, Escape
and the single-key tools C, U, N, P, L and A) act only while the canvas `<svg>` has the focus, as
diagram-js' own keyboard does: a key aimed at a host's button or text field, or at a page with
nothing focused, stays with the host. A pointer click on the canvas, a palette entry or a
context-pad action that opens no editor or popup hands the focus to the canvas. From the keyboard,
Enter and Space on a palette tool (lasso, draw) leave the focus on the entry; on a create entry
they place the element and hand the focus to the canvas, or to the new element's name editor; on a
context-pad action they keep the focus in the pad, and an action that closes or redraws the pad
(delete, line style, remove evolve) returns it to the canvas. A host that hides the canvas without
destroying it makes the container `inert` or hides it with `display: none` or `visibility: hidden`,
not only transparent: the browser moves the focus off the canvas at its next rendering update. A
key that reaches the canvas or the map's own chrome before then stays with the page, for each way
of hiding: the canvas acts on no key, the palette triggers no entry and moves no focus, a line the
draw tool holds stays as it is, and the context pad, the name, annotation and link editors, the
colour picker and the map menu's popovers take no key: nothing is saved or closed, and the focus
stays where it is.

Escape on the canvas ends every drag without a change, as it ends a diagram-js drag: also a label
drag, the point drag of a drawing (the drawing stays selected) and the drag of a component's red
evolve target. These drags and the colour picker take only an Escape aimed at the canvas (the
picker also one on its swatches); one aimed at the palette, the context pad, a name editor or a
host's field, menu, dialog or overlay, inside the canvas container or next to it, stays with that
control. While the draw tool holds the points of a line, the single-key tools do nothing until the
line is finished or cancelled. While a point of a drawing is dragged, the keys that would change the
drawing under the drag or start a second gesture next to it do nothing until the release, and the
canvas takes them with `preventDefault()`: the single-key tools, the arrow keys, paste and
duplicate. Delete still removes the drawing, which ends the drag without a commit.

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

An import is silent (no content change is reported back), keeps the selection and an open label
editor and fits the view (unless `fitOnImport: false`); a host's view change (`setViewState`, a fit)
never saves an open editor either. A gesture that runs during an import ends first, so its release
changes nothing. A diagram-js drag is cancelled as Escape cancels it: a move, resize, connect or
lasso drag, a create from the palette, the context pad or a quick-create key (`C`, `U`, `N`, `P`
with the pointer over the canvas), a connect started with `A`, the evolve drag the context pad
starts and the plot-corner drag. A label drag, the point drag of a drawing and the drag of a
component's red evolve target end when the import removes their element. A line the draw tool holds
ends without a drawing, and the draw tool with it. A tool that only waits for the user's next press
stays armed: the lasso from the palette or `L`, and the draw tool before its first point. An
`importText` called while a user's action runs (a host that echoes its own change back through its
store imports from the action's change listener) waits until the action has finished, then imports,
and its Promise settles after that import; imports that wait keep their call order. A drop has
finished once it has ended and the steps it defers to the next task have run (the name editor of a
create or an append with the pointer). Any other command, undo or redo has finished once the code
that ran it has returned, so an import from any listener it calls waits too: a create without a
pointer (C, U, N, P, a palette entry with Enter or Space, the context pad's append with Enter), the
save of a name editor (Enter, leaving the field), the save a press on the map or the palette
makes, and a delete, an undo or a redo that deselects what it removes. The import keeps what the
action left, as any import does: a create keeps its new element selected and its name editor open
on it, with what was typed, and a saved name keeps its element selected. A drag that a press started
after it saved a name ends with the import, as an accepted import ends a running gesture and a press
below the drag threshold (L1, 1.5;
[#285](https://github.com/Miragon/modeler-suite/issues/285),
[#305](https://github.com/Miragon/modeler-suite/issues/305)). The start of a diagram-js drag is an
action too, until diagram-js has activated the drag: the start clears the selection, so an import
from the selection listener at the start of a move, a resize, a connect, the evolve placement or a
create from the palette, the context pad or a quick-create key runs right after it and then ends
that drag, without an error and without a change
([#336](https://github.com/Miragon/modeler-suite/issues/336)). A `destroy()` from the selection
listener there, or from `interaction.onChange` as the drag starts, throws nothing either, also at
the start of the renderer's own drags (a label, a point of a drawing, the evolve target): the map is
torn down once the code that started the drag has returned, and no listener of the host hears
anything after `destroy()`, also not the selection the cancelled drag brings back
([#346](https://github.com/Miragon/modeler-suite/issues/346)). The same holds for a `destroy()`
from any listener at a drop or at Escape, the renderer's own drags included, at a create from the
palette or the keyboard and at a paste placed with a click: the map is torn down once the handler
of that input has returned, and the name editor a create opens a task later stays closed. No
delivery calls a listener that an earlier listener of the same delivery unsubscribed
([#380](https://github.com/Miragon/modeler-suite/issues/380),
[#373](https://github.com/Miragon/modeler-suite/issues/373)). So does a `destroy()` from a listener
that a host's own call reaches: the selection listener of `elements.reveal`, or the interaction and
selection listeners of an import, which ends a held gesture and empties the selection as it clears
the canvas. The map is torn down once that call has returned, and the import still resolves, with
the imported map as `exportText()`
([#415](https://github.com/Miragon/modeler-suite/issues/415)). `exportText()` is the
committed document, never a live preview: while the plot corner, an evolve target (its red circle
or the evolve placement of the context pad) or a label is dragged, or the size or axis-label popover
previews a change, it returns the document as it was before, and the change event of the commit
brings the new one ([#347](https://github.com/Miragon/modeler-suite/issues/347)). A command during a
size preview (an undo pressed mid-drag, a title the host sets) puts the preview back first, and a
drag then ends without resizing, so the history stays in step with the document. A drawing's point
drag, the drag of an evolve target and a label drag end the same way, without a commit, when a
command runs before their release (an undo pressed mid-drag, or an arrow-key nudge during the other
two, since a point drag leaves the arrow keys without effect).
`elements` names components, anchors, pipelines, submaps and accelerators by the id the document
gives them (`cmp_kettle`), also right after a canvas edit, and `elements.bounds(id)` gives an
element's live box in diagram coordinates; `getViewState` and `setViewState` carry the viewbox.
`contentBounds()` (contract 1.3) gives the box a host fits the view to, in diagram coordinates and
without padding: the plot with its axes and everything drawn beyond it (a long label at the
commodity edge, a note in the margin), the box the pan constraint keeps in view. It follows every
edit at once and stays the same across zoom and scroll. A map without elements still has its plot,
so it is never `undefined` while the modeler lives (before the first import it is the default plot);
tell an empty map by its elements. `diagram` is the wrapped `Modeler` or `NavigatedViewer` for
host-specific wiring. Both factories take the options above (`additionalModules`, `freeArea`,
`fitOnImport` and `undoRedoKeys`); the viewer never edits and ignores the undo keys. Both pass the
contract's conformance kit (1.3) without skips.

`interaction` (contract 1.5) tells a host whether the user holds a gesture, so it can defer a remote
re-import until the gesture ends: `active()` is true from the moment a move, resize, connect or
lasso drag, a label drag, the point drag of a drawing, the drag of an evolve target, the evolve or
plot-corner drag, a create from the palette, the context pad or a quick-create key with the pointer
over the canvas (also while its preview is over the palette) or a connect started with `A` starts,
until its drop or cancel. It stays false while the lasso or the draw tool only waits for the next
press, during a pan and on the viewer. `onChange(callback)` reports each change once, and may run
inside `importText` (its cancel of a gesture), so a host queues its re-import instead of importing
from the callback. A callback that throws is reported as an uncaught error a microtask later; the
gesture and the other callbacks go on as if it had returned.

`appearance` (contract 1.5) takes a host's mode: `themes` is `WARDLEY_THEMES`, `["light"]` until the
Miragon modelers turn dark together, and `set({ theme, contrast })` writes `data-cd-theme` (the theme
when `themes` lists it, else `themes[0]`) and, for `contrast: "high"`, `data-cd-kontrast="hoch"` on
the map's container, so the design tokens resolve there and not from the page: on a dark page the
map stays light, and the contrast the host asks for holds. It is view state: no change event, the
same text and SVG export, and the history, view, selection and an open editor are left as they are.
Until the first `set` the map takes its mode from the page, as before. `WARDLEY_THEMES` is also
`@miragon/wardley-renderer/themes`, which loads no DOM code, for hosts outside the browser (the VS
Code extension's theme bridge).

### Menu entries and dialogs for a host's chrome

The map's entries of a chrome menu (Model: "Map title…" where the host passes `mapTitle`, "Map
size…" and "X-axis labels…"; Export; Help) come from `mapMenu(actions)`, in the shape the menu
groups of [`@miragon/modeler-shell`](https://www.npmjs.com/package/@miragon/modeler-shell) take.
`createMapSizePopover(chrome, modeler)` and `createAxisLabelsPopover(chrome, modeler)` build the two
popovers (a live preview, one undo step when done), `createTitleDialog(chrome, modeler)` the "Map
title…" dialog (one undo step on Apply, nothing for an unchanged title),
`mapShortcuts(chrome, options)` the groups of its "Keyboard shortcuts…" dialog as data. A web app
that binds Cmd/Ctrl+O, Cmd/Ctrl+S, Cmd/Ctrl+V on the canvas and `?` itself passes
`{ fileKeys: true, shortcutsKey: '?' }`, so the dialog lists them too, and
`mapMenu({ …, shortcutsKey: '?' })` shows the key's chip on "Keyboard shortcuts…". The shell opens
the dialog: `shell.showShortcutsDialog(mapShortcuts(shell, options))`, or, in a host without a
mounted shell, `showShortcutsDialog(mapShortcuts(chrome, options), { container })` of
`@miragon/modeler-shell`.
`createMapDialog(chrome, parts)` is the modal dialog all of them share (guide §8: header with Close,
scrolling body, footer), for a host's own dialogs in the same look; `dialogButton(label, variant)`
gives its buttons. `chrome` is the shell handle or anything of the same shape; the renderer never
imports the shell itself.

### Deprecated: `createShortcutsDialog` and `svgToPng`

Both are deprecated since 0.14.0 and removed in 0.15.0
([#258](https://github.com/Miragon/modeler-suite/issues/258)); the web app and the VS Code webview
of this repository no longer use them.

- `createShortcutsDialog(chrome, options)` (with `ShortcutsDialog` and `ShortcutsDialogChrome`) is
  replaced by the shell's dialog, which takes the groups of `mapShortcuts` and fills the View group
  with the chrome's zoom and fit keys (see above).
- `svgToPng(svg, { scale, transparent })` (with `SvgToPngOptions`) is replaced by `svgToPng` of
  `@miragon/modeler-shell/export`, which embeds Geist, loads the SVG as a data: URL and fills the
  background the caller names. A map has a plot, so its PNG lies on `--cd-ui-plot` (guide §10.7), not
  on the paper this one fills:

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

### Fonts

The package ships no fonts and uses no CDN. The canvas typeface is **Geist** (Miragon corporate
identity); provide it yourself, preferably self-hosted via [`@fontsource`](https://fontsource.org/)
(one variable file covers all weights):

```ts
import "@fontsource-variable/geist/wght.css";
```

That package registers the family as `'Geist Variable'`; the renderer's font stack starts with
`'Geist Variable', 'Geist', …` so it matches either that package or a locally installed Geist. Use
`'Geist Variable'` in your own CSS too: `'Geist'` alone never matches the self-hosted face.

Part of the [Wardley Maps Modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/wardley-maps) in the [Miragon modeler suite](https://github.com/Miragon/modeler-suite).

## License

MIT

The tool icons of the palette (`square-dashed-mouse-pointer`, and for Draw `spline` with a
straight segment), the Close icon of the dialogs (`x`) and the icons of the context pad (`pencil`,
`trash`, `circle-plus`, `arrow-right`, `chevrons-right`, `sliders-horizontal`, `line-style`,
`palette`, `link`, `external-link`, and for Remove evolve `chevrons-right` with the corner `x` of
`calendar-x-2`) are copied from [Lucide](https://lucide.dev) (`lucide-static` 1.59.0):

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

`arrow-right`, `chevrons-right`, `circle-plus`, `external-link`, `link`, `trash` and `x` are derived
from [Feather](https://feathericons.com):

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
