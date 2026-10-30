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

The stylesheet is required. It loads, in this order, the design-system tokens
(`cd-tokens.generated.css`, in a cascade layer, so a host page's own `--cd-*` tokens win),
diagram-js' own CSS and `cd-canvas.css`, which maps diagram-js' chrome onto the `--cd-ui-*` roles;
then it styles the canvas surround (its text colour included), the context pad, the label editor
(its focus ring: 2px `--cd-ui-fokus`, 3px in high contrast, `Highlight` under forced colours),
the palette and its tooltip where no chrome skins them (see [Palette](#palette)), and the deprecated
shortcuts dialog, on those roles only. The three design-system files are vendored unchanged from the
`miragon-brand:modeler-tool-design` skill (design system 1.27.0) into `src/theme/`. The diagram
itself is drawn with SVG presentation values in the light roles of those tokens, so SVG and PNG
exports stay light in every mode.

Labels are set in `'Geist Variable', 'Geist', ui-sans-serif, system-ui, sans-serif` on every SVG
text node. The package does not ship the font: self-host it, for example with
`@fontsource-variable/geist` (`import '@fontsource-variable/geist/wght.css'`), or the labels fall
back to a system sans. Labels drawn before the font arrived are laid out again once it has. A host
chrome such as [`@miragon/modeler-shell`](https://www.npmjs.com/package/@miragon/modeler-shell)
loads its own stylesheet after this one.

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
…) are exported to build custom setups.

- `importDocument(document)` validates the document before it touches the canvas (a rejected one
  throws and leaves the previous diagram, its ids and its undo history as they were), erases the
  undo history silently (no `commandStack.changed`), and fits the view: the content centred at the
  largest zoom that shows all of it, never above 100 % (`fitOnImport: false` leaves the view to a
  host that fits itself). A label being typed is taken down without committing and reopened
  afterwards on the element with the same id. A gesture still running (move, resize, connect,
  lasso, making space, or a create from the palette or the context pad, also while its pointer is
  still on the palette, and a press of the armed connect tool whose pointer has not left its shape
  yet) ends first, as Escape ends it, so its release changes nothing. A pan is no gesture: one
  with the hand tool, with Space held or with Ctrl/Cmd and a press keeps running across the
  import, and the hand tool is still armed when it ends. The pan goes on from the current view:
  the fitted one when the import fits the view, or one the host sets after the import (restoring
  its view, L5) or while the pan runs. A pan does not scroll the view on its own at the edge of
  the canvas, so the diagram stays under the pointer. A palette tool that only waits for its next
  press (lasso, hand, space, connect) stays armed and highlighted, and its next press works on the
  imported diagram.
  A pan or an armed tool that ends after the import brings back the selection from before it
  started, as it does without an import: the shapes the import drew under the same ids, without
  the ones it removed.
  The one exception is a press of the connect tool before the pointer has entered a shape the
  import drew under it: it starts no connect and puts the tool down. A drop already being applied
  (a host importing from its change listener) is not cancelled. `importDocument` returns its
  warnings at once, so called while a user action runs it replaces the diagram under what the
  action still does, and from a selection listener at the start of a drag it throws in diagram-js;
  a host imports through the collaborative modeler's `importText`, which waits
  until the action has finished (see below). `clear` ends a running gesture and leaves a pan and an
  armed tool alone, as an import does; called while a user action runs, it empties the diagram once
  the action has finished. A command, an undo or a redo counts as such an action until the next
  microtask, also one the host runs itself: a `clear` right after it empties the diagram a
  microtask later. A valid document given to `importDocument` first lets an `importText` or a
  `clear` still waiting run, so the calls take effect in the order they came. The `Modeler` does
  this with `vcGestureModule`; a custom setup adds it to get the same.
- A label being typed stays open across every view change, a host's fit or restore as much as a
  wheel zoom, and moves along with its element; only Enter, leaving the text box or a click or drag
  on the canvas commits it.
- `exportDocument()` writes back every key the schema does not define (vendor extensions on the
  document, its meta, its elements and connections).
- New elements get random ids (`step_k3x9q2mf`, `org_…`, `sequence_…`), so two people adding an
  element to one document at the same time never pick the same id.
- `freeArea`: the canvas area the host's chrome leaves free, as `{ insets: () => FreeAreaInsets }`
  (px from the container's edges) or `{ center: () => Point | undefined }` (diagram coordinates).
  Enter or Space on a creating palette entry places the element in its centre (default: the centre
  of the visible canvas), selected, with the canvas focused and its label editor open.
- `undoRedoKeys: false` leaves Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Ctrl+Y unbound and unprevented, for
  a host that owns the history (the VS Code document).

## Keyboard

On the focused canvas: L lasso, H hand, S space, C connect, E edit the label,
Cmd/Ctrl+A select all, the arrows move the selection (Shift: in large steps), Cmd/Ctrl + arrows move
the canvas, Delete/Backspace, copy, cut, paste and duplicate, and undo/redo unless `undoRedoKeys` is
false. `diagramShortcuts()` lists them for a dialog.

- The keys act only while the canvas itself has the focus, as diagram-js 15's keyboard binds them
  to the canvas `<svg>`. Keys with nothing focused (`<body>`), on a host's chrome, on the palette,
  the context pad or an editor pass, and so do keys someone already handled (`defaultPrevented`),
  keys of an IME composition and a `keydown` without a key.
- A pointer on a palette or context-pad entry hands the focus to the canvas before the entry runs,
  so Delete and `Cmd/Ctrl+Z` act at once; a label editor or menu the entry opens takes it from
  there. Enter or Space on an entry leave the focus on it, unless the entry's action left it on
  `<body>`.
- Copy, cut, paste and duplicate take steps, org units and the relations between them; a relation
  goes along only with both of its ends, so cut leaves a selected relation on the canvas unless
  both of its ends are cut with it. A copy gets fresh ids and keeps its label, colour and link;
  fields beyond the schema (vendor extensions) stay with the original. A paste follows the pointer
  while it is on the canvas, until a click places it (Escape cancels). Without the pointer there
  (on the palette, an overlay or off the canvas), the copy lands 20 px to the right of and below
  the original, one step further with each paste. The first paste after a cut lands where the cut
  elements were, unless an undo or an import brought them back. Duplicate places its copy 20 px
  off the original at once. Each is one undo step, and what it placed is selected.
- A host that hides the canvas without destroying the modeler makes its container `inert` or hides
  it with `display: none` or `visibility: hidden`, not only transparent: the browser moves the
  focus off the `<svg>` at its next rendering update, and a key that reaches the `<svg>`, the label
  editor or the palette toolbar before then passes too: nothing is created, saved or closed, and
  the focus stays where it is.

## Palette

Lasso, Hand, Space and Connect, then Step and Organizational unit. A host that
mounts the `Modeler` without a chrome of its own gets the palette of the Miragon design guide
(§5.5) from the renderer:

- a horizontal glass island at the top centre of the container, 12px from its top and 40px high,
  with 32 × 32 entries 2px apart and a 1px line with 8px on either side between the tools and the
  creating entries; above the context pad and the label editor (`z-index` 110); in a container at
  most 760px wide in the second row (64px from the top), at most the container less 12px on either
  side wide and scrolling sideways, with the focus ring inside the entries (§5.15);
- hover in `--cd-ui-hover` with the icon in `--cd-ui-interaktion`, the armed tool with
  `aria-pressed="true"`, the hover fill and a 2px inset ring, the keyboard focus as a 2px
  `--cd-ui-fokus` ring; in high contrast no shadow, a `--cd-ui-kontur` edge and a 3px focus ring;
  under forced colours the edge, the separator, the focus and the armed tool's ring in system
  colours;
- a toolbar named "Tools" ahead of the canvas in the tab order, with one tab stop that roves with
  ← → Home End, Enter or Space to activate an entry (a creating entry places its element in the
  `freeArea`, see above) and `aria-keyshortcuts` on the tools; a press on the island's padding gives
  the focus to the canvas;
- the tooltip (`role="tooltip"`) with the entry's name and key 8px below the palette, centred on its
  entry and 12px from the container's sides: after 300ms of hover, at once on keyboard focus and for
  a neighbour while one is shown, never for touch, hidden on a press, Escape, leaving and blur
  (§5.6).

The rules apply inside the renderer's container (`.vc-container`) only, so another diagram-js
palette on the same page keeps its own look. A chrome that skins the palette marks it
`data-chrome="palette"`, as `@miragon/modeler-shell` does: then the renderer's rules and keys stay
off it and the chrome's own apply alone. The tooltip is the diagram-js service `paletteTooltip`,
which the shell's `shellModule` replaces with its own; for a palette another chrome skins, it stands
right of the entry in diagram-js's look, as without this renderer's tooltip.

## Edit lock

`modeler.get('vcReadOnly').setReadOnly(true)` locks every edit while the document behind the canvas
cannot be saved from it (an invalid file in an IDE): no create, move, resize, connect, waypoints,
delete, align, paste, context pad or label editor, and no space, connect or label keys. Selection,
lasso, hand, zoom, copy and export keep working.

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

`createCollaborativeModeler` and `createCollaborativeViewer` implement the `CollaborativeModeler`
contract 1.5 (`meta.notation` `"value-chain"`): blank text opens as an empty diagram,
`onContentChanged` fires for every edit and undo/redo and never for an import, view state is the
diagram-js viewbox, a host's `setViewState` or fit never commits a label being typed, the
`elements` surface lists steps and organizational units (name = label) with `reveal`, selection and
`bounds(id)`, the live box of a step or an organizational unit in diagram coordinates, and
`contentBounds()` is the live, tight box around every step, organizational unit and connection and
every label, also where a long label runs past a small shape, in diagram coordinates (`undefined`
while the diagram is empty): what a host that fits the view itself fits to, as
`connectDiagramJs(shell, diagram, { modeler, isEmpty })` of `@miragon/modeler-shell` does, and what
the SVG export frames. The renderer measures each label once per content change, so zoom and
scroll leave the box alone. Both take the contract's factory options `freeArea`, `fitOnImport` and
`undoRedoKeys` (the viewer ignores the two that need editing). The browser test suite runs the
contract's conformance kit on every law, with no case skipped and no advisory. `diagram` is the
wrapped `Modeler` or `NavigatedViewer` for host wiring.

- `importText` ends a running gesture first, as `importDocument` does (above). Called while a user
  action runs, typically from `onContentChanged`, it waits until the action has finished and then
  imports; its promise settles after that import, and imports that wait run in the order they came,
  later ones behind them. A drop has finished once its drag has ended (`drag.ended` or
  `drag.canceled`), so no listener of the drop, diagram-js's own selection or the label editor a
  dragged append opens, meets a replaced diagram. Every other action that runs a command, an undo
  or a redo has finished once the handler that ran it has returned: an append by a click on the
  context pad and a create by Enter or Space on the palette open their label editor on the new
  element, and the import then reopens it there with the text typed so far; a label committed
  inside the handler that starts a drag (a press on the canvas, or a click on a palette entry with
  no press before it) lets that drag start, and the import then ends it as it ends any gesture,
  while a pointer press on the palette commits the label at its `mousedown`, so the import runs
  before the click and the create the click starts survives; a delete, an undo or a redo runs
  whole. The same holds for an import from any other listener inside the action, such as
  `elements.onSelection`. The start of a drag is such an action as well: diagram-js empties the
  selection while it activates any drag that works on the diagram (a move, resize, connect,
  bendpoint or space drag, a create or append from the palette or the context pad), and an import
  from `elements.onSelection` there runs once the drag is active, then ends it as it ends any
  gesture, so its release changes nothing. A text that does not parse
  rejects at once and leaves the gesture running.
- `interaction` (contract 1.5): `active()` is true from the start of a gesture until its drop or
  cancel: a move, resize, connect, bendpoint, lasso or space drag, and a create or append from the
  palette or the context pad, also while its preview is off the canvas. A press inside the drag
  threshold, a palette tool that only waits for its next press and a pan (the hand tool, Space held,
  Ctrl/Cmd and a press) are none. `onChange` reports each change once, also the cancel inside
  `importText`, and nothing after `destroy()`, also when a listener destroys the modeler or
  unsubscribes another one during the same delivery; a listener that throws is reported with
  `reportError` and does not end the gesture. The viewer always reports false.
- `destroy()` from `elements.onSelection` or `interaction.onChange` while diagram-js starts a drag
  (it empties the selection there and then reads the drag again) throws nothing: the diagram is
  torn down once the code that started the drag has returned, and no listener of the host hears
  anything after `destroy()`, also not the selection the cancelled drag brings back
  ([#346](https://github.com/Miragon/modeler-suite/issues/346)). The same holds for a `destroy()`
  from any listener at a drop, at Escape, at a create from the palette or the keyboard and at a
  paste placed with a click: the diagram is torn down once the handler of that input has returned.
  No delivery calls a listener that an earlier listener of the same delivery unsubscribed
  ([#380](https://github.com/Miragon/modeler-suite/issues/380),
  [#373](https://github.com/Miragon/modeler-suite/issues/373)). So does a `destroy()` from a
  listener that a host's own call reaches: the selection listener of `elements.reveal`, or the
  interaction and selection listeners of an import, which ends a held gesture and empties the
  selection as it clears the canvas. The diagram is torn down once that call has returned, and the
  import still resolves, with the imported diagram as `exportText()`
  ([#415](https://github.com/Miragon/modeler-suite/issues/415)).
- `appearance` (contract 1.5, guide §13.3): `themes` is `VALUE_CHAIN_THEMES`, `["light"]`, the one
  list the web app, the VS Code webview and its theme bridge read too. `set({ theme, contrast })`
  writes `data-cd-theme="light"` on `diagram.container`, whatever theme is asked for, and
  `data-cd-kontrast="hoch"` for `contrast: "high"` (none otherwise), so the canvas stays light on a
  dark page and its contrast follows the request, not the page. It is view state: no change event,
  the text and the SVG export stay byte-identical, the view, selection, history and a label being
  typed stay as they were. It works before `attachTo` and the first import, holds across imports,
  and never throws.

## Chrome content for hosts

What both apps show around the diagram, typed structurally like `@miragon/modeler-shell` (the
renderer never imports the shell): `diagramMenu()` (Export as PNG, then SVG, optionally JSON; Help
with "Keyboard shortcuts…"), `diagramShortcuts(shell)` (the shortcut groups as data, for
`shell.showShortcutsDialog(groups)` of the shell; `{ fileKeys: true }` adds the web app's File
keys, Cmd/Ctrl+O and Cmd/Ctrl+S), `blobToBase64()` for handing a PNG to an extension host, and
`vcBounds.isEmpty()`, a cheap emptiness test for the shell's empty-file hint.

The PNG export is the shell's: `svgToPng(svg, { background: COLORS.surround })` of
`@miragon/modeler-shell/export` embeds Geist and fills the background that guide §10.7 names for
a notation without a plot (`COLORS.surround`, `#F9F7F7`).

**Deprecated in 0.9.0, removed in 0.10.0
([#257](https://github.com/Miragon/modeler-suite/issues/257)):** `createShortcutsDialog()` (with
`ShortcutsDialog` and `ShortcutsDialogChrome`) and this package's `svgToPng()`. The dialog is
`shell.showShortcutsDialog(diagramShortcuts(shell, options))`, or the shell's standalone
`showShortcutsDialog` in a host without a mounted shell; the renderer's own PNG helper embeds no
Geist, fills white and loads a `blob:` URL.

## Notation

- **Step**: right-pointing chevron.
- **Organizational unit**: ellipse, assigned to a step.
- **is predecessor of** (`sequence`): dashed edge with an arrowhead.
- **is process-oriented superior** (`hierarchy`): solid edge with an arrowhead, routed as vertical
  drops for a row of sub-steps or as the ARIS rake for a column.
- **assignment**: plain solid edge between an organizational unit and a step.

## License

[MIT](https://github.com/Miragon/modeler-suite/blob/main/modelers/value-chain/LICENSE). The inlined
[Lucide](https://lucide.dev) icons are ISC (© Lucide Icons and Contributors); `trash` and `x` derive
from Feather, MIT (© Cole Bemis), as Lucide's LICENSE lists them. The bundle keeps both notices as a
legal comment.
