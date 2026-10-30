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

`freeArea` is `{ insets: () => ({ top, right, bottom, left }) }`, the margins in px that the
chrome covers, or `{ center: () => ({ x, y }) }`, the free centre in diagram coordinates
(`undefined` while there is none). `freeArea`, `fitOnImport` and `undoRedoKeys` are the names of
the [`@miragon/modeler-api`](https://www.npmjs.com/package/@miragon/modeler-api) factory options
(contract 1.2), the same for every Miragon renderer. Pass `fitOnImport: false` when the host sets
the view after every import itself.

Pass `undoRedoKeys: false` when the host owns the history, as the VS Code extension does: the keys
then reach the host untouched and the host undoes the document, while copy, paste, delete, the
arrow keys and the single-key tools keep working on the canvas.

The modeler's keyboard listens on `document`, but acts only while the canvas itself has the focus:
the key's target is the canvas `<svg>` or lies inside it, the element diagram-js 15 binds its own
keyboard to. `<body>` does not count, so no key acts right after a load or after a click on page
text, and the palette, the context pad and the label editor, which sit next to the `<svg>`, keep
their keys. Keys another listener already handled (`defaultPrevented`), events without a `key` and
keys typed during an IME composition are left alone, and the canvas container gets no `tabindex` of
its own. A pointer click or drag on a palette entry, a click on a context-pad entry that opens no
editor or popup (delete, connect, append, line style) and a picked colour hand the focus to the
canvas, without the keyboard focus ring. Enter and Space on a tool entry (lasso, draw) leave the
focus on the entry; on a creating entry they place the sticky in the middle of the free area and
open its label editor. While a line is drawn, Enter and Escape end it only when aimed at the
canvas `<svg>` (or inside it) or at the Draw entry, which keeps the focus when Enter starts the tool
there. Every other target keeps them, with no `preventDefault()` and no `stopPropagation()`: the
other palette entries, the context pad, the label editor and a host's controls, inside the
container or outside it. A click, Enter or Space on another palette entry first ends the drawing and
keeps the open line, as Enter on the canvas does, so no second tool starts next to it. Every point
focuses the canvas. Until the line is finished or cancelled, the keys that start a gesture at the
pointer do nothing: L (the lasso), E and C (a sticky at the pointer) and Cmd/Ctrl+V (the paste
attaches to the pointer), so none takes the press meant for the line's next point
([#243](https://github.com/Miragon/modeler-suite/issues/243)); they are taken with
`preventDefault()`, as the board takes them otherwise. The board's other keys (delete, the arrow
keys, duplicate, select all, copy, undo and redo) act as they do without a line and leave the line
as it is. A press on a handle of a selected drawing focuses the canvas too, and Escape aimed at the
canvas ends the drag of that point without changing the drawing, which stays selected. Until the
release, the arrow keys, L, E, C, Cmd/Ctrl+V and Cmd/Ctrl+D do nothing and are taken with
`preventDefault()`, since they would nudge or copy the drawing under the drag or start a second
gesture next to it ([#375](https://github.com/Miragon/modeler-suite/issues/375)). Delete removes
the drawing, and an undo, a redo or any other command before the release ends the drag without a
commit, so the release never writes the drawing back over what the command did. To keep the
keys away from a canvas it
hides without destroying it, a host makes it `inert` (or `display: none`): the browser then moves
the focus off the `<svg>` at its next rendering update, and a key whose target lies inside an
`inert` subtree stays the page's before then too. Cmd/Ctrl+A selects the whole board. An
import erases the undo history without firing `commandStack.changed`, and fires
`import.parse.start`, `import.render.start` and `import.done` in that order. It frames the content
centred at the largest zoom that shows all of it, never above 100%; an empty board shows at 100%. A
board with arrow annotations is imported once the font they are set in has loaded (or failed to), so
that the fit on import, and a host's fit after the import resolves, frame them as drawn and not as
the fallback font would set them; imports still run in the order they were called. A label being
typed when an import arrives is reopened on the same element afterwards, with the typed text. A
drag running when an import is called (a move, resize, connection or lasso, a create from the
palette or a paste, also with its preview off the canvas, or the drag of a drawing's point) ends
at once without applying anything, and so does one the user starts while an import waits (for
the annotation font, or for a running user action and the step it scheduled) and still holds when
the board is replaced: its release changes nothing and fires no `commandStack.changed`. A diagram-js drag ends as Escape ends it, the drag of a drawing's
point without its commit. The import also ends a line the draw tool holds, and the tool with it,
without a drawing, where Escape would commit a line of two points or more
([#243](https://github.com/Miragon/modeler-suite/issues/243)). `clear()` ends a running drag
and a line too. The palette's lasso tool, armed but not yet pressed, stays armed, so does the draw
tool before its first point, and a pan of the empty canvas keeps running. A press that starts a drag (on a resize handle, say) while a label is being typed commits
the label first; when the host imports from that commit's change listener, the label stays and
the drag does not start. diagram-js clears the selection when any drag but a lasso starts, also
an empty selection, so the host's selection listener runs at that start; when the host imports
from it (or clears the board there), the drag ends as cancelled right after it started, without
applying anything and without `interaction` ever reporting it, and the import replaces the board
once the start has run ([#336](https://github.com/Miragon/modeler-suite/issues/336)). An import
called while a user action runs (a host that imports from the
change listener of the action's command, or from a selection listener that the command's removal
of a selected sticky calls) waits until the action has finished, and only then replaces the board;
its Promise settles after that import. The action is the handler that ran a command, from the
command's start until that handler has returned (a keyboard create from the palette, which selects
its sticky and opens its label editor after the create; a label commit, also the one a press on
the board makes; a delete, an undo or a redo), a drop until it has ended (`drag.ended` or
`drag.canceled`, a drawing's point drop once its command has applied), and the step a drop
scheduled (the kind chooser, or the label editor, of an append). So every step of the action runs
on the board it changed: the label editor of a keyboard create opens on the created sticky, and
the import reopens it on the sticky with the same id, or a note's on the note in its place (a note
has no id grammar, so the import gives it the id its text derives), with what was typed
([#305](https://github.com/Miragon/modeler-suite/issues/305)), and every listener of a drop,
also diagram-js's selection behaviour, which threw when the import had removed the moved sticky
while something was selected before the drag
([#248](https://github.com/Miragon/modeler-suite/issues/248)), runs on the board the drop changed.
The kind chooser that an import closes reopens on the sticky with the same id while that
sticky is still blank, and the label editor that follows the kind opens on the sticky with that
id, also when a host has echoed the retype and so replaced the sticky again. `clear()` from the
change listener of a drop does not wait (it returns nothing to wait for) and leaves the drop
running: the drag ends as a drop, unless something was selected before the drag. A clear always
removes the moved sticky, so diagram-js's selection behaviour then throws, and the drag ends as
cancelled.

`contentBounds()` gives the tight box around what the board draws (`{ x, y, width, height }` in
board coordinates, which zoom and scroll leave alone): every sticky, note and drawing, a hotspot
with its tilt, and every arrow's annotation, which can reach far past the two stickies it stands
between. It reads the live canvas and measures the annotations on a 2D canvas, so a zoom never
changes it, and gives `undefined` while the board has no element. The annotations are drawn with
`text-rendering: geometricPrecision`, as they are measured: without it Chromium lays SVG text out
at the zoomed font size, and where it rounds glyph advances to whole pixels (Linux) the drawn text
grows and shrinks with the zoom. A host that fits the view itself fits to it and adds its own
margins; the importer's fit and the SVG export frame the same box with padding. A sticky's label
wider than the sticky can overhang it, since the wrapping goes by an estimated character width;
that overhang is not part of the box.

Enter or Space on a creating palette entry (a click without a pointer, `detail` 0) places the
element in the centre of `freeArea` (the container minus the margins a host's chrome covers, or the
centre the host names; without it the container's centre), 24px down and right while that spot is
taken, selects it and opens its label editor.

`eventStormingReadOnly` locks every edit while a host cannot save from the canvas (an invalid file
in an IDE): `diagram.get('eventStormingReadOnly').setReadOnly(true)` vetoes moves, resizes,
creates, connections and deletes through the diagram-js rules, and the keyboard, context pad, label
editor and drawing handles stop editing. Selection, zoom, pan, copy and export stay.

The DSL's `style dark` directive stays in the board config, so the text round-trips, but the
renderer paints nothing for it: the page's design-system mode (or a host's request through the
contract's `appearance`) decides light or dark, never the file. The chrome reads the `--cd-ui-*` roles of the vendored Miragon tokens only, and the canvas
drawing keeps literal light colours in its SVG attributes, so exports look the same everywhere.

### Label suggestions and spelling variants

While a sticky's label is typed, the `Modeler` lists the names the board already gives that kind
of sticky (domain events, commands, actors, aggregates, policies, read models and external
systems; hotspots and notes are free text). The list (`role="listbox"`, `role="option"`) opens
under the field on the canvas layer, or above it where there is more room, never over it and out
of the chrome's way when the host passes `freeArea.insets`. It scrolls when the room on that side
is too low, and it closes on a pan or zoom, like every canvas popup. The field
keeps the focus and names the active option with `aria-activedescendant`. ↑ and ↓ move through
the options, Tab takes the active one (else the first) without moving the focus, Enter takes the
active one and still breaks the line while none is active, and a click takes an option. Escape
closes the list and leaves the editor open; the next Escape discards the edit as before. Names are
compared with `normalizeLabel` of
[`@miragon/event-storming-schema-model`](https://www.npmjs.com/package/@miragon/event-storming-schema-model)
(case, whitespace, punctuation, simple plurals and a few spellings), and the placeholder name of
any kind, such as "Domain Event 2", is no suggestion, also on a sticky retyped to another kind and
where a board means it as a name (an aggregate called "Policy"; "Insurance Policy" is one).

A name the board writes in more than one way (`Order`, `order`, `Orders`) gets a dot in
`--cd-ui-warning` on the top right corner of each of its stickies. Its tooltip names the other
spellings and hides on Escape, and a click on the dot selects the sticky. The dots follow every
import, a re-import of the same board included. The sticky's context pad then offers "Unify
spelling" (`unify-spelling`): every sticky of that kind and name takes the selected sticky's
spelling in one command, so one undo takes it back. Different names stay legal, since a real
language conflict is what a workshop wants to find. A placeholder name, by the same rule as the
suggestions, gets no dot and keeps its label on "Unify spelling", so an aggregate called "Policy"
next to one called "Policies" marks neither. The dots are HTML overlays, so no export carries
them and no host's problems list them, and they hide under the read-only lock.
`eventStormingSpellingVariants` lists the variants (`variants()`, `variantOf(shape)`) and unifies
them (`unify(shape)`); `eventStormingModeling.updateLabels(changes)` renames several stickies in
one command.

### Aggregates

`eventStormingAggregates` (in the `NavigatedViewer` and the `Modeler`) reads the board's aggregates
from the canvas through `groupByAggregate` of the schema model, which the package re-exports:
every aggregate once, however often the timeline repeats it, with the commands whose arrows lead
into it and the domain events its arrows lead to. An aggregate whose label is still the
placeholder a new sticky of any kind gets ("Aggregate", "Aggregate 2", or "Domain Event" on a
sticky retyped to an aggregate) is left out, as it is no label suggestion, also one a board means
as a name ("Policy"; "Insurance Policy" counts), and so is an empty one, which the `.storm` file
stores as "Aggregate". `rows()` gives them as the rows of a table, one per aggregate, each line a
command and the events it leads to (`aggregateTableRows`), and
`renderAggregateTable(body, rows, { onSelect })` draws that table into a dialog body.
`showDialog({ container, openDialog })` opens it in a dialog of guide §8, the shell's
`openShellDialog` passed in structurally, so the renderer never imports the shell:

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

`boardMenu` puts "Aggregates…" at the end of the Model group while `hasAggregates()` holds, that
is while the board has a named aggregate, also on a read-only canvas, so a host builds the menu
again after every import and command (`shell.menu.setGroups(boardMenu(actions))`). A name in the
dialog closes it, then selects its stickies and brings them into the part of the view the chrome
leaves free (`freeArea.insets` as the host gives them, the shell's fit insets with their margins;
without a host the fit's side margin of 24px on every edge): scrolled when they fit at the
current zoom, else zoomed out until
they do, never in. The focus goes to the canvas, and the second click of a double click, which
would land on the canvas once the dialog closed, is absorbed. Selecting runs no command, so
neither the undo history nor the board changes. The open dialog follows every import and
command, the focus staying on the name that had it, or on the sentence that the board has no
named aggregates once the last one went. `reveal(elementIds)` selects and shows stickies the same
way without the dialog.

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

- `importText` resolves for every `.storm` text: the DSL keeps every line it cannot read in
  `rawPassthrough` (with a diagnostic, returned as a `warning`), gives a sticky that claims a
  reserved id (`event-storming-root`, `__implicitroot…`) a fresh one, and reads a coordinate or
  size beyond ±1e38 (more than the canvas's SVG transforms hold) as an unreadable line. A board
  passed to `diagram.importMap` that uses a reserved id, or a coordinate or size beyond ±1e38
  (`UndrawableBoardError` from the schema model), rejects before the canvas changes.
- `onContentChanged` fires for every command-stack change, undo and redo included (also the
  workshop level), never for imports, view options (type captions) or the viewport. Only the
  replacement of the board is the import's: an edit or an undo while an import still waits (for
  a running user action, the step it scheduled or the annotation font) fires it as usual.
- `getViewState()` / `setViewState()` read and set the diagram-js viewbox (`x`, `y`, `width`,
  `height`); an import fits the board, never above 100% and never below 0.1% (a board too wide to
  show whole at 0.1% is centred there instead).
- A view change never commits an open label editor: `setViewState`, a host's fit and the user's own
  scroll or zoom leave it open with the typed text, and it moves with its element. A click or a
  drag on the canvas, Cmd/Ctrl+Enter (Enter on an arrow label) or leaving the field commits it;
  Escape discards it. The Enter or Escape that confirms or cancels an input method's candidate
  stays with the composition, also Safari's, which comes after `compositionend` with `keyCode` 229.
- `elements` lists the stickies with their ids and labels, reveals (selects and scrolls to) one
  and reports the selection. Sticky ids survive a save and a re-open: the DSL writes `(id …)`
  back for every sticky whose id the parser would not derive again from its label at that line (one
  created on the canvas, a renamed one). Notes, drawings and arrows have no id in the text yet (theirs
  derive from their text or position), so they are not addressable.
- `elements.bounds(id)` gives a sticky's box in board coordinates (`{ x, y, width, height }`, the
  top-left corner and the size, which zoom and scroll leave alone), read from the live canvas: a
  sticky created or moved in the session has its current box. Any other id gives `undefined`. The
  viewer answers it too.
- `contentBounds()` (contract 1.3) is the board's tight box, as on the `Modeler` and the viewers
  above: it covers every `elements.bounds` box, the notes and drawings, a hotspot's tilt and every
  arrow's annotation, and is `undefined` for a board without elements, before the first import and
  after `destroy()`. The modeler shell's `connectDiagramJs(shell, diagram, { modeler })` fits to
  it. The viewer answers it too.
- `interaction` (contract 1.5) tells a host whether the user holds a gesture: `active()` is true
  from the moment diagram-js starts a drag (a move, resize, connect or lasso past the threshold, a
  create, an append or a paste at once, also while its preview is still over the palette) and
  while a drawing's point drag moves, until the drop or the cancel (Escape, or an import). A drag
  that an import or a clear from the selection listener ends at its start is never reported. A
  palette tool that only waits for its next press (the lasso, the draw tool) and a pan of the empty
  canvas are no gesture; a line the draw tool holds point by point is not reported either, and an
  import ends it without a drawing ([#243](https://github.com/Miragon/modeler-suite/issues/243)).
  `onChange(cb)` reports each
  change once, with `active()` already returning the new value; nothing is reported after
  `destroy()`. The viewer's is always false.
- `appearance` (contract 1.5) lists the modes the board draws, `themes: ["light"]`
  (`EVENT_STORMING_THEMES`, the same constant both apps and the VS Code theme bridge read), and
  takes the host's request: `set({ theme, contrast })` writes `data-cd-theme="light"` (a theme the
  board does not draw falls back to it) and, for `contrast: "high"`, `data-cd-kontrast="hoch"` on
  the `.event-storming-container`, so the board stays light on a dark page and takes the contrast
  the host asked for, also when the page has another. It is view state: no change event, the
  same `exportText()` and SVG, the view, the selection, the undo history and an open label editor
  untouched. Until the first `set` the board takes its mode from the page, as before.
- New sticky ids are random: a sticky created on the canvas (palette, keyboard, append, paste) gets
  `<prefix>_<8 characters of [0-9a-z]>`, such as `(id event_k3x9q2ab)`, so two peers that each add
  one at the same time do not pick the same id. Ids already in a text are read as they are.
- `diagram` is the wrapped `Modeler` or `NavigatedViewer`, for everything outside the contract.
  `createCollaborativeModeler` and `createCollaborativeViewer` accept the same options:
  `additionalModules`, `fitOnImport`, and for the modeler `undoRedoKeys` and `freeArea` (the
  viewer ignores those two).
- After `destroy()`, `exportText()` returns the last state and `importText()` rejects. A
  `destroy()` from `elements.onSelection` or `interaction.onChange` while diagram-js starts a drag
  (it clears the selection there and then reads the drag again), or from `interaction.onChange` as a
  drawing's point drag starts, throws nothing: the board is torn down once the code that started
  the drag has returned, and no listener of the host hears anything
  after `destroy()`, also not the selection the cancelled drag brings back
  ([#346](https://github.com/Miragon/modeler-suite/issues/346)).

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

The package ships no fonts and uses no CDN. The canvas typeface is **Geist** (Miragon corporate
identity); provide it yourself, preferably self-hosted via [`@fontsource`](https://fontsource.org/)
(one variable file covers all weights):

```ts
import "@fontsource-variable/geist/wght.css";
```

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
