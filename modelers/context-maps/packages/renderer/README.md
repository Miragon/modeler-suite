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

Without the Miragon modeler shell, the palette is a glass toolbar at the top centre
(`role="toolbar"`, roving focus with arrow keys, Enter or Space arms a tool or creates a context).
Where the shell or another chrome marks a palette `data-chrome="palette"`, that palette is used
instead.

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

- `undoRedoKeys: false` leaves the undo and redo keys to a host whose document owns the history
  (the VS Code extension).
- `freeArea` names the part of the container a host's chrome leaves free (the `@miragon/modeler-api`
  factory option): `{ insets }` (the shell's `shell.fitInsets()`) or `{ center }` in diagram
  coordinates. A context created by keyboard lands in its centre, and the fit after an import
  centres the content there. It replaces `freeRectInsets` / `freeRectCenter`, removed in 0.7.0.
- `fitOnImport: false` leaves the fit to a host whose chrome fits the content itself.

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

An import is **silent** (no `commandStack.changed`, so a save-on-change host never writes it back),
**atomic** (a document with a duplicate or reserved id throws before anything is removed) and
**lossless** (unknown keys and relationships whose ends are missing come back on export). A running
gesture is cancelled first, and an open label edit is reopened on the element with the same id.
`contentBounds()` is the tight box around everything drawn, in diagram coordinates, `undefined`
for an empty map; the shell's `connectDiagramJs` fits to it. A pan or zoom never commits an open
label edit; only Enter, leaving the field or starting a drag does.

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
contract of `@miragon/modeler-api` 1.5 (`meta.notation` is `"context-maps"`): the canonical JSON
text as the text lane, `onContentChanged` for every user change and never for an import or a view
change, the viewbox as view state, and `elements` over the context and relationship ids
(`elements.bounds(id)` reads the live canvas). Both take `CollaborativeModelerOptions` (`freeArea`,
`fitOnImport`, `undoRedoKeys`) next to `additionalModules`; `modeler.diagram` is the wrapped
`Modeler` or `NavigatedViewer`. The conformance kit runs in this package's browser tests with no
skip or advisory.

`importText` called during a user action (for example a host echoing its own change from
`onContentChanged`) waits until the action has finished, then imports in call order, and reopens
the menu or name editor the action left open. A `destroy()` from any listener tears the map down
once the current input handler has returned; a waiting import then rejects with "The modeler was
destroyed.".

The optional surfaces of contract 1.5 are on both mounts:

- `interaction.active()` / `interaction.onChange(callback)`: true from a gesture's start until its
  drop or cancel; armed tools and panning are no gesture.
- `appearance.themes` is `CONTEXT_MAPS_THEMES` (`["light"]`); `appearance.set(request)` draws light
  with high contrast for `contrast: "high"` by writing `data-cd-theme` and `data-cd-kontrast` on
  the container.

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
  `showShortcutsDialog(groups, options)` of the same package. Since 0.9.0 the renderer draws no
  shortcuts dialog of its own.
  `createTitleDialog(chrome, { title, setTitle })` renames the map in a modal dialog with one
  field, Cancel and Apply; it lives in the chrome's root and goes with `destroy()`.
- While a drag runs on the canvas, the chrome's legend island (`[data-chrome="legend"]`) lets the
  pointer through, so a connect drag released on a context behind it still connects.
- `cmReadOnly` (part of the `Modeler`) locks every edit, for example while an IDE holds an invalid
  file; selection, zoom, pan, select all and export stay. `setReadOnly(true, { delayMs: 800 })`
  locks at once and marks the palette entries `aria-disabled` after the delay; `setReadOnly(false)`
  unlocks. `isReadOnlyShown()` tells whether the marks show; `READ_ONLY_CHANGED_EVENT` carries
  `{ readOnly, shown }`.
- The keyboard acts only while the canvas `<svg>` has the focus, as in diagram-js 15;
  `Cmd/Ctrl+A` selects all. To hide the canvas without destroying the modeler, make its container
  `inert` or `display: none`, so no key reaches it.

### Helpers & types

- **Type guards:** `isCmElement`, `isCmContext`, `isCmRelationship`.
- **Runtime element types:** `CmContext`, `CmRelationship`, `CmElement`.
- **Palette icon generators:** `contextIconSvg(type)`, `subdomainIconSvg(type, size)`,
  `roleChipSvg(role)`, `relationshipIconSvg(pattern, size)`: SVG markup matching the canvas, safe
  for unvalidated input (unknown values draw a neutral fallback, roles are escaped).
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

`ContextMapsRenderer` (priority `1500`) draws contexts coloured by subdomain type with their glyphs,
and relationships styled per pattern with the abbreviation, U/D markers and OHS/PL/ACL/CF badges,
from the spec in [`@miragon/context-maps-schema-model`](../schema-model). Per-element
`fill`/`stroke` overrides win. Text keeps 4.5:1, lines and outlines 3:1.

## Import / export

The package reads and writes the canonical `CmDocument` (JSON) and exports a standalone **SVG**.
PNG export and the embedded-PNG round-trip live in the [web app](../../apps/webapp) and the
[VS Code extension](../../apps/vscode).

## Development

From the root of the [Miragon modeler suite](https://github.com/Miragon/modeler-suite):

```bash
npm run build -w @miragon/context-maps-renderer   # Vite library build → dist/ (publish build)
npm run context-maps test                         # Vitest unit tests
npm run context-maps test:browser                 # renderer integration tests in real Chromium
npm run context-maps typecheck
```

## License

[MIT](../../LICENSE). diagram-js and its dependencies are MIT / ISC / Apache-2.0. The icons of the
context pad, the connect handles, the validation markers, the lasso, the Close buttons of the title
dialog and the legend, and the team glyph on the canvas are [Lucide](https://lucide.dev) icons
(lucide-static 1.59.0, ISC, © Lucide Icons and Contributors), copied into `src/draw/lucide.ts`;
`arrow-right`, `circle-x`, `trash`, `triangle-alert` and `x` derive from
[Feather](https://feathericons.com) (MIT, © Cole Bemis). The star and the open hand that mark core
and supporting subdomains are notation glyphs, the paths of
[Material Icons](https://github.com/google/material-design-icons) `star` and `pan_tool` (Apache-2.0,
© Google LLC), copied into `src/draw/subdomainGlyphs.ts`.
