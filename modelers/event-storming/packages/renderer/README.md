# @miragon/event-storming-renderer

[![npm](https://img.shields.io/npm/v/@miragon/event-storming-renderer)](https://www.npmjs.com/package/@miragon/event-storming-renderer)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/event-storming/LICENSE)

[diagram-js](https://github.com/bpmn-io/diagram-js)-based renderer for
[Event Storming](https://www.eventstorming.com/) boards: `Viewer`, `NavigatedViewer`, and a full
editable `Modeler`, plus `.storm` DSL / JSON / SVG import and export. Browser/DOM only.

## Install

```bash
npm install @miragon/event-storming-renderer
```

## Usage

```ts
import { NavigatedViewer } from "@miragon/event-storming-renderer";
import "@miragon/event-storming-renderer/assets/event-storming.css";

const viewer = new NavigatedViewer({ container: document.querySelector("#canvas")! });

await viewer.importDSL(`title Order Checkout
actor Customer [80, 300]
command Place Order [240, 300]
event Order Placed [620, 300]
Customer -> Place Order
Place Order -> Order Placed`);

const board = viewer.exportMap(); // canonical JSON model
const dsl = viewer.exportDSL(); // back to .storm text
const { svg } = await viewer.saveSVG();
const box = viewer.contentBounds(); // the board's tight box, undefined while it is empty
```

Swap `NavigatedViewer` for `Modeler` to get the editable board (sticky palette, context pad,
arrows, undo/redo). Stickies are colored per kind (`STICKY_STYLES`): domain event, command,
actor, aggregate, policy, read model, external system and hotspot, plus free-text notes and
freeform drawings on an unbounded canvas.

### Options

`Viewer`, `NavigatedViewer` and `Modeler` take the same options:

| Option              | Default            | Purpose                                                      |
| ------------------- | ------------------ | ------------------------------------------------------------ |
| `container`         | a detached `<div>` | Host element; without one, mount later with `attachTo(host)` |
| `width`, `height`   | `100%`, `600px`    | Container size (`100%` high when a `container` is given)     |
| `additionalModules` | `[]`               | diagram-js modules appended after the renderer's own         |
| `fitOnImport`       | `true`             | Fit the board into the view after every import               |
| `undoRedoKeys`      | `true`             | `Modeler` only: bind Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Ctrl+Y |
| `freeArea`          | none               | `Modeler` only: the part of the canvas no chrome covers      |

`freeArea` is `{ insets: () => ({ top, right, bottom, left }) }` (px the chrome covers) or
`{ center: () => ({ x, y }) }` (diagram coordinates). `freeArea`, `fitOnImport` and `undoRedoKeys`
are the [`@miragon/modeler-api`](https://www.npmjs.com/package/@miragon/modeler-api) 1.2 factory
options. Pass `undoRedoKeys: false` when the host owns the history (as VS Code does); the other keys
keep working on the canvas.

**Keyboard.** Keys act only while the canvas `<svg>` has the focus, so the palette, context pad,
label editor and host controls keep theirs. A click on a palette or context-pad entry hands the
focus to the canvas. Enter or Space on a creating palette entry places the sticky in the centre of
`freeArea` (24px offset while taken) and opens its label editor. While the draw tool holds a line
or a drawing's point is dragged, keys that would start another gesture (L, E, C, Cmd/Ctrl+V, and
during a point drag the arrows and Cmd/Ctrl+D) do nothing
([#243](https://github.com/Miragon/modeler-suite/issues/243),
[#375](https://github.com/Miragon/modeler-suite/issues/375)); Escape or any command ends a point
drag without a commit. A host that hides the canvas without destroying it uses `inert`,
`display: none` or `visibility: hidden`.

**Import.** An import erases the undo history (no `commandStack.changed`), fires
`import.parse.start`, `import.render.start` and `import.done`, and fits the content (never above
100%; an empty board at 100%). Boards with arrow annotations wait for their font, keeping call
order. An open label editor is reopened with its typed text. A running drag, or a line the draw
tool holds, ends without applying anything; armed tools and a pan keep running. An import called
during a user action (from a change or selection listener) waits until the action has finished
([#248](https://github.com/Miragon/modeler-suite/issues/248),
[#305](https://github.com/Miragon/modeler-suite/issues/305),
[#336](https://github.com/Miragon/modeler-suite/issues/336)). `clear()` ends drags and lines too
but does not wait.

`contentBounds()` gives the tight box around what the board draws (`{ x, y, width, height }` in
board coordinates): every sticky, note and drawing, a hotspot's tilt and every arrow annotation,
unaffected by zoom; `undefined` while the board is empty. Fit to it and add your own margins.

**Palette without the shell.** A host without `@miragon/modeler-shell` gets the design guide's
palette (§5.5, §5.6): a glass toolbar "Tools" at the top centre (second row in containers up to
760px), ahead of the canvas in the tab order with one roving tab stop (← → Home End, Enter/Space),
`aria-pressed` on armed tools, `aria-keyshortcuts`, and a tooltip with name and key. The rules apply
inside the renderer's container only; a palette marked `data-chrome="palette"` is left to its
chrome. The tooltip is the `paletteTooltip` service. `prefers-reduced-motion` drops hover
transitions.

**Read-only.** `diagram.get('eventStormingReadOnly').setReadOnly(true)` vetoes every edit while a
host cannot save (an invalid file); selection, zoom, pan, copy and export stay.
`setReadOnly(true, { delayMs: 800 })` locks at once but shows the marks (`aria-disabled` palette
entries, hidden spelling dots) only after the delay; `isReadOnlyShown()` tells whether they show,
and `READ_ONLY_CHANGED_EVENT` carries `{ readOnly, shown }`.

The DSL's `style dark` is kept for the round-trip but not rendered; the page's mode (or the
contract's `appearance`) decides. The canvas uses literal light colours, so exports look the same
everywhere.

### Label suggestions and spelling variants

While a label is typed, the `Modeler` lists the names the board already gives that kind of sticky
(not hotspots or notes) in a `listbox` below or above the field: ↑/↓ move, Tab or Enter takes one,
Escape closes the list. Names compare with `normalizeLabel` of
[`@miragon/event-storming-schema-model`](https://www.npmjs.com/package/@miragon/event-storming-schema-model);
placeholder names ("Domain Event 2") are never suggested.

A name written several ways (`Order`, `Orders`) gets a `--cd-ui-warning` dot on each sticky's
corner (an HTML overlay, never exported), with a tooltip naming the other spellings. The context
pad's "Unify spelling" (`unify-spelling`) gives them all the selected spelling in one command.
`eventStormingSpellingVariants` offers `variants()`, `variantOf(shape)` and `unify(shape)`;
`eventStormingModeling.updateLabels(changes)` renames several stickies in one command.

### Aggregates

`eventStormingAggregates` (`NavigatedViewer` and `Modeler`) reads the aggregates through
`groupByAggregate` of the schema model (re-exported): each named aggregate once, with its incoming
commands and following events. `rows()` gives table rows (`aggregateTableRows`),
`renderAggregateTable(body, rows, { onSelect })` draws them, and
`showDialog({ container, openDialog })` opens them in a guide §8 dialog with the shell's
`openShellDialog` passed in structurally:

```ts
import { openShellDialog } from "@miragon/modeler-shell";

const aggregates = modeler.get("eventStormingAggregates");
const menu = boardMenu({
  // …
  aggregates: {
    hasAggregates: () => aggregates.hasAggregates(),
    showAggregates: () =>
      aggregates.showDialog({ container: shell.root, openDialog: openShellDialog }),
  },
});
```

`boardMenu` adds "Aggregates…" to the Model group while `hasAggregates()` holds, so rebuild the
menu after every import and command (`shell.menu.setGroups(boardMenu(actions))`). Choosing a name
selects and reveals its stickies inside the free area and focuses the canvas, without a command.
`reveal(elementIds)` does the same without the dialog.

### Collaborative hosts

The package implements the collaborative-modeler contract 1.5 of
[`@miragon/modeler-api`](https://www.npmjs.com/package/@miragon/modeler-api) (notation
`event-storming`), with the optional `interaction` and `appearance` surfaces, and runs its
conformance kit in CI, every case and no advisory:

```ts
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
} from "@miragon/event-storming-renderer";

const modeler = createCollaborativeModeler(); // meta.editable: true
modeler.attachTo(host); // in the document, with a size
await modeler.importText(text); // silent, history erased, view fitted
const off = modeler.onContentChanged(() => save(modeler.exportText()));

const viewer = createCollaborativeViewer(); // meta.editable: false, never changes content
```

- `importText` resolves for every `.storm` text: unreadable lines stay in `rawPassthrough` (as a
  `warning`), reserved ids (`event-storming-root`, `__implicitroot…`) get fresh ones, and
  coordinates beyond ±1e38 count as unreadable. `diagram.importMap` rejects such boards
  (`UndrawableBoardError`) before the canvas changes.
- `onContentChanged` fires for every command-stack change, undo and redo included, never for
  imports, view options (type captions) or the viewport.
- `getViewState()` / `setViewState()` carry the viewbox; an import fits between 0.1% and 100%.
- A view change never commits an open label editor. A click on the canvas, Cmd/Ctrl+Enter (Enter
  on an arrow label) or blur commits it, Escape discards it; IME confirmations stay with the
  composition.
- `elements` lists the stickies (ids, labels), reveals one and reports the selection;
  `elements.bounds(id)` gives a sticky's live box. Sticky ids survive save and re-open (the DSL
  writes `(id …)` where needed); notes, drawings and arrows are not addressable.
- `contentBounds()` (contract 1.3) as above; `undefined` before the first import and after
  `destroy()`.
- `interaction` (contract 1.5): `active()` while the user holds a drag or a drawing's point drag,
  until drop or cancel; armed tools, pans and a held draw line are none. `onChange(cb)` reports
  each change once. The viewer's is always false.
- `appearance` (contract 1.5): `themes` is `EVENT_STORMING_THEMES` (`["light"]`);
  `set({ theme, contrast })` writes `data-cd-theme` and `data-cd-kontrast="hoch"` on the
  `.event-storming-container`. View state only: no change event, same exports.
- New sticky ids are random (`event_k3x9q2ab`), so peers adding stickies at once never collide.
- `diagram` is the wrapped `Modeler` or `NavigatedViewer`. Both factories take
  `additionalModules`, `fitOnImport`, and for the modeler `undoRedoKeys` and `freeArea`.
- After `destroy()`, `exportText()` returns the last state and `importText()` rejects with "The
  modeler was destroyed.". A `destroy()` from any listener tears the board down once the current
  handler has returned, and no listener hears anything afterwards
  ([#346](https://github.com/Miragon/modeler-suite/issues/346),
  [#380](https://github.com/Miragon/modeler-suite/issues/380),
  [#415](https://github.com/Miragon/modeler-suite/issues/415)).

#### Migrating a host

- **DOM.** `attachTo(host)` appends the diagram's own `.event-storming-container` inside `host`.
  Scope host CSS as a descendant (`.my-host .event-storming-container`), not as a compound selector
  on the host element.
- **What can go:** an echo latch around imports (they are silent), a command-stack shim for the
  viewer (it has none and needs none), special handling of the renderer's own viewbox change on
  import (the post-import view is the fit), and keeping the viewbox by hand (`getViewState` /
  `setViewState`).
- **What stays:** presence and view controls that need diagram-js services (canvas, element
  registry) go through `diagram`.
- **Empty text** imports as a blank board titled `Untitled Board`; a host that treats empty text
  differently keeps its own check.
- **Ids.** Hosts that derive ids from the text themselves (server-side extraction) read `(id …)`
  first and derive the rest exactly like the parser: `<prefix>_<slug(label)>`, `_2`, `_3`, … in line
  order.

### Fonts

No fonts ship and nothing loads from a CDN. Provide Geist, e.g.
`import "@fontsource-variable/geist/wght.css"`.

`assets/event-storming.css` carries the Miragon design tokens (`--cd-*`) in the cascade layer
`event-storming-tokens`, so a host page's own `--cd-*` win. Its diagram-js mapping (`--bio-*`,
`.djs-parent`) applies page-wide, so other diagram-js or bpmn-js canvases on the page take the
Miragon roles too.

Part of the [Event Storming Modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/event-storming) in the [Miragon modeler suite](https://github.com/Miragon/modeler-suite).

## License

MIT

The tool icons of the palette (`square-dashed-mouse-pointer`, and for Draw `spline` with a straight segment) and the icons of the
context pad and the note toolbar (`plus`, `arrow-right`, `replace`, `line-style`, `palette`,
`pencil`, `trash`, `bold`, `italic`, `list`, `text-align-*`, `align-vertical-justify-*`) are copied
from [Lucide](https://lucide.dev) (`lucide-static` 1.59.0):

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

`arrow-right`, `italic`, `plus` and `trash` are derived from [Feather](https://feathericons.com):

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
