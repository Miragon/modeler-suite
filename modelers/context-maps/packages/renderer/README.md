# @miragon/context-maps-renderer

[![npm](https://img.shields.io/npm/v/@miragon/context-maps-renderer)](https://www.npmjs.com/package/@miragon/context-maps-renderer)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/context-maps/LICENSE)

The **browser layer** of the [Context Maps Modeler](../../README.md): a framework-agnostic viewer
and full editor for strategic Domain-Driven Design [Context Maps](https://contextmapper.org/)
diagrams, built on [diagram-js](https://github.com/bpmn-io/diagram-js) (MIT).

It renders the canonical document from
[`@miragon/context-maps-schema-model`](../schema-model) and gives you palette, move,
connect-by-relationship, context pad, inline label editing and undo/redo, with no UI framework
required. Mount it into any `<div>`; the web app and the VS Code extension both wrap this
exact package. It implements the collaborative-modeler contract of
[`@miragon/modeler-api`](https://www.npmjs.com/package/@miragon/modeler-api), and it hands a chrome
such as [`@miragon/modeler-shell`](https://www.npmjs.com/package/@miragon/modeler-shell) its legend,
menu entries and shortcut groups without importing it.

## Install

```bash
npm install @miragon/context-maps-renderer @miragon/context-maps-schema-model
```

## Three entry points

| Class             | Use it for                                                             |
| ----------------- | ---------------------------------------------------------------------- |
| `Viewer`          | Read-only rendering, no interaction (thumbnails, static embeds).       |
| `NavigatedViewer` | Read-only + zoom (scroll), pan (drag) and selection.                   |
| `Modeler`         | The full editor: palette, move, context pad, label editing, undo/redo. |

All three share a common base (`CmBaseViewer`) with the same import/export and lifecycle API.

## Quick start

```ts
import { Modeler } from "@miragon/context-maps-renderer";
import "@miragon/context-maps-renderer/assets/context-maps.css";
import { SAMPLE_DOCUMENT } from "@miragon/context-maps-schema-model";

const modeler = new Modeler({ container: document.querySelector("#canvas")! });

// Load a document (fits the content, never above 100 %; an empty map shows 100 %)
const { warnings } = modeler.importDocument(SAMPLE_DOCUMENT);

// Read the live canvas back as the canonical model
const doc = modeler.exportDocument();

// Export a standalone, self-contained SVG
const { svg } = modeler.saveSVG();

// Undo / redo are driven by the command stack
modeler.undo();
modeler.redo();
```

> **The CSS is required.** Import `@miragon/context-maps-renderer/assets/context-maps.css`
> (it also pulls in `diagram-js`'s own stylesheet). Without it the palette, context pad and label
> editor are unstyled.

## API

### Constructor: `CmViewerOptions`

```ts
new Modeler({
  container?: HTMLElement,            // host element (a detached <div> if omitted)
  width?: number | string,           // canvas width  (default "100%")
  height?: number | string,          // canvas height (default "100%", or "600px" with no container)
  additionalModules?: ModuleDeclaration[], // extra diagram-js modules
  undoRedoKeys?: boolean,            // bind Cmd/Ctrl+Z, Shift+Z, Y to the canvas (default true)
  freeArea?:                         // where the host's chrome leaves the canvas free
    | { insets: () => { top: number; right: number; bottom: number; left: number } }
    | { center: () => { x: number; y: number } | undefined },
  fitOnImport?: boolean,             // fit the content after every import (default true)
});
```

- `undoRedoKeys: false` leaves the undo and redo keys unbound and unprevented, for a host whose
  document owns the history (the VS Code extension).
- `freeArea` names the part of the container a host's chrome leaves free, with the names of the
  `@miragon/modeler-api` 1.2 factory options: `{ insets }` are the margins the chrome covers (the
  modeler shell's `shell.fitInsets()`), `{ center }` is the free rectangle's centre in diagram
  coordinates (`viewport.freeRectCenter()`). Enter or Space on a palette entry (a click with
  `detail === 0`) places the new context in that centre, 24px further down and right while that
  spot is taken, selected and with its name editor open, and the fit after an import centres the
  content in what the insets leave. Without it, and for the fit when only `center` is given, the
  renderer keeps room for its own palette. The viewer hands it unchanged to the palette as the
  diagram config `cmPalette: { freeArea }` (`CmPaletteConfig`), the shape the other Miragon
  renderers' palette configs have. The earlier option `freeRectInsets` and the palette config's
  `freeRectInsets` and `freeRectCenter` are gone since 0.7.0: pass `freeArea: { insets }` or
  `freeArea: { center }`.
- `fitOnImport: false` leaves the view to a host whose chrome fits the content itself after every
  import, so the view changes once per import.

### Shared methods (`Viewer` / `NavigatedViewer` / `Modeler`)

| Method                             | Returns                         | Purpose                                           |
| ---------------------------------- | ------------------------------- | ------------------------------------------------- |
| `importDocument(doc)`              | `{ warnings: ImportWarning[] }` | Replace canvas content and fit (see below).       |
| `importText(text)`                 | `{ warnings: ImportWarning[] }` | Parse a `.cm` text and import it; throws if not.  |
| `exportDocument()`                 | `CmDocument`                    | Rebuild the canonical model from the live canvas. |
| `exportText()`                     | `string`                        | The canonical `.cm` text (ends in a line break).  |
| `saveSVG()`                        | `{ svg: string }`               | Self-contained SVG snapshot (fitted viewBox).     |
| `contentBounds()`                  | `ElementBounds` or `undefined`  | The content's box for a host's fit (see below).   |
| `setMeta(partial)` / `getMeta()`   | `void` / `RootBusinessObject`   | Rename the map (an undoable command) / read it.   |
| `attachTo(el)` / `detach()`        | `void`                          | Move the canvas in/out of the DOM (keeps state).  |
| `clear()` / `destroy()`            | `void`                          | Empty the canvas (a gesture ends) / tear it down. |
| `on(event, cb)` / `off(event, cb)` | `void`                          | Subscribe to diagram-js events.                   |
| `get<T>(name)`                     | `T`                             | Resolve a diagram-js service (advanced).          |

An import is **silent**: the previous document's undo history goes without a
`commandStack.changed`, so a host that saves on every change never writes an import back. It
**rejects without a trace**: a document with a duplicate id, an id of the engine's roots or the
name of a built-in object property as an id throws before anything is removed. It is **lossless**:
keys the model does not know and relationships whose ends are not on the map come back on export. A
label edit open during an import is taken down and reopened on the element with the same id, with
the typed text, and that element is selected again when nothing else is. A gesture that runs
during an import (a move, a connect, a lasso, a create from the palette or the context pad, also
while its preview is still off the canvas) is cancelled first, as Escape cancels it, and so is a
press that has not reached the drag threshold yet: the release changes nothing and selects
nothing. A palette tool that only waits for its next press is no gesture: the lasso tool armed in
the palette stays armed, and the drag its next press starts is a gesture. Neither is a pan of the
canvas: it runs on across the import. `clear()` ends a gesture the same way. A drop whose change
the host imports over at once, from its change listener, has applied and is not cancelled: this
synchronous `importDocument` replaces the map at once, while the collaborative modeler's
`importText` waits for the user's action to finish (see below).

`contentBounds()` is the tight box around what the canvas draws of the map in diagram coordinates,
without a margin: the contexts, wider where a team row or a subdomain type's name runs past a
context's sides (the renderer does not cut them), and the relationships' waypoints. It is the box a
host's chrome fits to (the modeler shell's `connectDiagramJs` reads it from the instance it gets as
`modeler`). It reads the live canvas, so a context created or moved counts at once, ignores zoom
and scroll, and is `undefined` while the map is empty. The fit after an import centres this box in
the free rectangle of `freeArea.insets`, or in the room the renderer's own palette needs.

A **view change never commits** an open label edit or description prompt: a pan or zoom, the user's
or the host's (`canvas.viewbox(…)`, `setViewState`, a fit), keeps it open with the typed text and
moves it with its element or pad entry. Only the user's own gestures commit it: Enter, leaving the
field, or starting a drag.

### Modeler-only

`undo()`, `redo()`, `canUndo()`, `canRedo()`.

## Collaborative modeler

```ts
import { createCollaborativeModeler } from "@miragon/context-maps-renderer";

const modeler = createCollaborativeModeler({ additionalModules: [], undoRedoKeys: true });
modeler.attachTo(host); // attached to the document, with a size
await modeler.importText(text); // silent; rejects (and changes nothing) for a non-importable text
modeler.onContentChanged(() => save(modeler.exportText()));
```

`createCollaborativeModeler` and `createCollaborativeViewer` implement the `CollaborativeModeler`
contract of `@miragon/modeler-api` 1.5 (`meta.notation` is `"context-maps"`): the canonical JSON text
as the text lane, `onContentChanged` for every user-visible change (element commands, the title,
undo, redo) and never for an import or a view change, the viewbox as view state, and the `elements`
surface over the context and relationship ids (their labels as names). `elements.bounds(id)` reads
an element's box from the live canvas in diagram coordinates (a relationship: the box around its
waypoints), `undefined` for an id `elements.list()` does not report. `contentBounds()` is the
diagram's `contentBounds()`, the box around all of them, `undefined` before the first import, for
an empty map and after `destroy()`. Both factories take the contract's
`CollaborativeModelerOptions` (`freeArea`, `fitOnImport`, `undoRedoKeys`, which the viewer ignores)
next to `additionalModules`. `modeler.diagram` is the wrapped
`Modeler` or `NavigatedViewer`. The contract's conformance kit runs in this package's browser
tests, every case and every hook, without a skip or an advisory.

`importText` called while a user action runs (a host that echoes its own change back from
`onContentChanged`, or imports from `elements.onSelection` or `interaction.onChange` inside the
action) waits until the action has finished, with the steps it deferred, and then imports; its
promise settles after that import, and imports called during the same action, or while an earlier
import still waits, run in the order they were called. An action runs from the start of its first
command, undo or redo, or from a drop's release. So an import from the selection listener inside a
command waits too: diagram-js deselects an element its canvas removes before the change is
reported. The action has finished once:

- a drop: its release has run every listener, so diagram-js selects the moved context after a move;
- an append from the context pad, clicked or dragged: its subdomain-type menu is open, which the
  import then reopens beside the pad of the context with the same id;
- a create from the palette with Enter or Space: the context is selected with its name editor
  open, which the import reopens on the context with the same id, selected again;
- a label commit with Enter or by leaving the field: the editor has closed, so it stays closed;
- a toggle in the integration-roles menu: the menu has reopened, and the import reopens it beside
  the pad of the relationship with the same id;
- a label or description commit at a press (the press on another context, or on a palette entry
  that starts a create): the handler of the press has returned, so diagram-js has set up the drag
  the press starts. The import then ends that drag, as it ends every running gesture: the commit
  is kept, the release moves or creates nothing, and no step of diagram-js runs on a replaced
  map. A press that arms the lasso tool leaves the tool armed;
- any other command, undo or redo, a delete for example: the handler that ran it has returned, so
  the command has run whole and the import replaces its result.

A drag's start is an action as well: diagram-js activates the drag (the first move past the drag
threshold, or at once for a create from the palette or the context pad) by firing its start,
deselecting and firing its first move in one call. An import from the selection or interaction
listener there runs once that call has returned, and then ends the drag like any running gesture,
so the release moves or creates nothing. A `destroy()` from either listener there throws nothing
either: the map is torn down once the code that started the drag has returned, and no listener of
the host hears anything after `destroy()`, also not the selection the cancelled drag brings back
([#346](https://github.com/Miragon/modeler-suite/issues/346)).

So no step of the action works on a replaced map. Only the imports that waited for an action
reopen the menu it left open; a later import closes it like every other menu. An import called while Escape cancels a gesture (from `interaction.onChange`) waits for
the cancel the same way. An import called while no action runs, a peer's text for example, cancels
a running gesture as above. An import still waiting when the modeler is destroyed rejects.

The optional surfaces of contract 1.5 are on both mounts:

- `interaction.active()` is true from a gesture's start (the first move past the drag threshold,
  or at once for a create the palette or the context pad started) until its drop or cancel, and
  `interaction.onChange(callback)` reports each change once. A palette tool that only waits for
  its next press and a pan of the canvas are no gesture; the viewer never reports one. An error a
  listener throws surfaces on its own, as an uncaught error after the call: the drag still ends,
  the other listeners still hear the change, and the next `importText` still runs.
- `appearance.themes` is `CONTEXT_MAPS_THEMES`, `["light"]` until the Miragon modelers switch to
  dark together, the same array on every instance and on the viewer. `appearance.set(request)`
  draws the canvas light whatever theme is asked for, with high contrast for
  `contrast: "high"`: it writes `data-cd-theme` and `data-cd-kontrast="hoch"` on the diagram's
  container, so the token roles resolve there and not in the host's page. It works before
  `attachTo` and before the first import, holds across imports, fires no change event, and leaves
  the text, the SVG export, the view, the selection, the history and an open label edit as they
  were.

## Around the canvas

What a chrome around the canvas shows, typed structurally (a `@miragon/modeler-shell` handle fits):

- `renderLegend(body, { tooltip })` renders the notation legend (subdomain types, integration roles,
  relationship patterns) into a chrome's legend card, each row explained in the chrome's tooltip.
  Hosts without such a chrome add `cmLegendModule`, a legend card on the canvas. It starts closed
  on every canvas size, so it never covers the map unasked; the user opens it with its button, and
  the `cmLegend` service's `setOpen(open)` restores a state the host stored.
- `contextMapMenu({ exports, showKeyboardShortcuts, editTitle })` builds the Model group's "Map
  title…" (with `editTitle`), the Export group (PNG, SVG, JSON, CML; an export's `shortcut` shows as
  its chip) and the Help group's "Keyboard shortcuts…". `contextMapShortcuts(chrome, { fileKeys })`
  returns that dialog's groups as data, with a File group (Open… and Export as JSON on Cmd/Ctrl+O
  and S) for a web app that binds those keys; show them with `shell.showShortcutsDialog(groups)`
  of `@miragon/modeler-shell` (0.7), or in a host without a mounted shell with the standalone
  `showShortcutsDialog(groups, options)` of the same package. The renderer's own copy of that
  dialog, `createShortcutsDialog(chrome, options)`, is **deprecated** and goes in 0.9.0
  ([#261](https://github.com/Miragon/modeler-suite/issues/261)).
  `createTitleDialog(chrome, { title, setTitle })` renames the map in a modal dialog with one
  field, Cancel and Apply; it lives in the chrome's root and goes with `destroy()`.
- While a drag runs on the canvas, the chrome's legend island (`[data-chrome="legend"]`) lets the
  pointer through, so a connect drag released on a context behind it still connects.
- `cmReadOnly` (part of the `Modeler`) locks every edit while a host cannot take edits from the
  canvas, an invalid file in an IDE: no context pad, move, create, connect, delete or label editor;
  selection, zoom, pan, select all and export stay.
- The keyboard acts only while the canvas itself has the focus, as diagram-js 15's own keyboard
  does: on keys whose target is the canvas `<svg>` or inside it. Keys with nothing focused
  (`<body>`), on a host's chrome, on the palette, the context pad or an editor in the canvas
  container pass, and so do keys someone already handled (`defaultPrevented`) and keys of an IME
  composition. `Cmd/Ctrl+A` selects every element. A pointer on a palette entry, on the context
  pad's connect, swap ends or delete, or on a connect handle of `cmConnectHandlesModule` hands the
  focus to the canvas, so Delete and `Cmd/Ctrl+Z` act at once; Enter or Space leave it on the entry,
  unless the entry goes away with its action. Append opens the subdomain-type menu, which takes the
  focus and hands it to the canvas when it closes.
- A host that hides the canvas without destroying the modeler makes its container `inert` or
  `display: none`, not only transparent: a hidden or inert canvas cannot hold the focus, so no key
  reaches it. There is no separate switch to pause the keyboard.

### Helpers & types

- **Type guards:** `isCmElement`, `isCmContext`, `isCmRelationship`.
- **Runtime element types:** `CmContext`, `CmRelationship`, `CmElement`.
- **Palette icon generators:** `contextIconSvg(type)`, `subdomainIconSvg(type, size)`,
  `roleChipSvg(role)`, `relationshipIconSvg(pattern, size)`: WYSIWYG SVG glyphs matching what the
  canvas draws, as markup for `innerHTML`. They take values read from an unvalidated document: an
  unknown type draws the unclassified box (`contextIconSvg`) or the neutral dotted circle
  (`subdomainIconSvg`), an unknown pattern the upstream-downstream line, a size that is not a finite
  positive number the default size, and a role becomes escaped text.
- **Themes:** `CONTEXT_MAPS_THEMES`, the modes the map can be drawn in (`["light"]`), for a host's
  chrome and the contract's `appearance.themes`.
- **Other:** `CmViewerOptions`, `ImportWarning`, `RootBusinessObject`, `ROOT_ID`, `saveSVG`.

## How it's built

The package is a set of [didi](https://github.com/nikku/didi) modules layered on diagram-js. Each is
exported (e.g. `cmDrawModule`, `cmPaletteModule`, `cmModelingModule`) so you can compose your own
viewer via `additionalModules`:

| Module                   | Responsibility                                                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cmModelModule`          | Element factory with notation defaults (`CmElementFactory`).                                                                                                                     |
| `cmDrawModule`           | Custom SVG rendering of contexts and relationships (`ContextMapsRenderer`).                                                                                                      |
| `ioModule`               | Document ↔ canvas bridge (`CmImporter`, `CmExporter`, `saveSVG`).                                                                                                                |
| `cmModelingModule`       | High-level mutations: label, subdomain type, relationship pattern, roles, colours.                                                                                               |
| `cmRulesModule`          | Editing rules (what can move / be created / connected; no resize).                                                                                                               |
| `cmBehaviorsModule`      | Keeps the model **flat**: shapes never nest.                                                                                                                                     |
| `cmPaletteModule`        | The tool palette: lasso tool + create contexts (drag, click, or Enter/Space into the free rectangle).                                                                            |
| `cmConnectHandlesModule` | Opt-in (not in the default `Modeler`): four outward connect arrows around the selected context.                                                                                  |
| `cmContextPadModule`     | Per-element quick actions: append a connected context, connect, subdomain-type / pattern / integration-role menus, owning team, description, in-place rename, swap ends, delete. |
| `cmLegendModule`         | Opt-in: the notation legend as a collapsible card (bottom-left), for hosts without a chrome that renders `renderLegend`.                                                         |
| `cmHoverTooltipModule`   | An element's own data (description, team, technology) on hover, inside the canvas container.                                                                                     |
| `cmReadOnlyModule`       | The canvas lock (`cmReadOnly`) every editing feature consults.                                                                                                                   |
| `cmLabelEditingModule`   | In-place direct name editing (double-click / pad), bpmn.io style.                                                                                                                |
| `cmKeyboardModule`       | Select all / undo / redo / delete while the canvas has the focus (`undoRedoKeys` option).                                                                                        |
| `cmZOrderModule`         | Fixed stacking order (relationships behind, contexts on top).                                                                                                                    |

### Rendering

A custom `ContextMapsRenderer` (priority `1500`, beating diagram-js's default) draws each element
from the spec in [`@miragon/context-maps-schema-model`](../schema-model): bounded-context boxes
coloured by subdomain type (core / supporting / generic) with their glyphs; and relationships drawn
as lines styled per context-mapping pattern (partnership, shared kernel, customer-supplier,
upstream-downstream, separate ways), carrying the pattern abbreviation, U/D end markers and the
OHS/PL/ACL/CF integration-role badges. Labels are word-wrapped and centred. Per-element `fill`/`stroke`
overrides win over the spec defaults. Every text keeps 4.5:1 on what it sits on; the box outlines,
the relationship lines and the borders of the symmetric patterns' chips keep 3:1 on the canvas
ground. The subdomain badge and the team caption are `--cd-text-leise`, and a context's name, a role
badge's text and any text on a fill the author set are black or white, whichever has more contrast.
A role badge is one filled chip named by its text; the frame around the badges is the decorative
`--cd-linie`. A symmetric pattern's chip writes black on paper, bordered in the pattern's colour.

## Import / export

The package reads and writes the canonical `CmDocument` (JSON) and exports a standalone **SVG**.
PNG export and the embedded-scene round-trip (storing the document inside the exported image) live in
the [web app](../../apps/webapp) and the [VS Code extension](../../apps/vscode). They rasterise the
SVG with `svgToPng` of `@miragon/modeler-shell/export` (2×, Geist inside the image, on the ground
`MIRAGON.grau` of guide §10.7), and the extension adds the embedded scene.

## Development

Part of the [Context Maps Modeler](../../README.md) in the
[Miragon modeler suite](https://github.com/Miragon/modeler-suite); consumed from source by the
apps. From the suite's root:

```bash
npm run build -w @miragon/context-maps-renderer   # Vite library build → dist/ (publish build)
npm run context-maps test                         # Vitest unit tests
npm run context-maps test:browser                 # renderer integration tests in real Chromium
npm run context-maps typecheck
```

## License

[MIT](../../LICENSE). diagram-js and its dependencies are MIT / ISC / Apache-2.0. The icons of the
context pad, the connect handles, the validation markers, the lasso, the shortcuts dialog and the
team glyph on the canvas are [Lucide](https://lucide.dev) icons (lucide-static 1.59.0, ISC, © Lucide
Icons and Contributors), copied into `src/draw/lucide.ts`; `arrow-right`, `circle-x`, `trash`,
`triangle-alert` and `x` derive from [Feather](https://feathericons.com) (MIT, © Cole Bemis). The
star and the open hand that mark core and supporting subdomains are notation glyphs, the paths of
[Material Icons](https://github.com/google/material-design-icons) `star` and `pan_tool` (Apache-2.0,
© Google LLC), copied into `src/draw/subdomainGlyphs.ts`.
