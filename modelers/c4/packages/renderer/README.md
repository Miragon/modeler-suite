# @miragon/c4-renderer

[![npm](https://img.shields.io/npm/v/@miragon/c4-renderer)](https://www.npmjs.com/package/@miragon/c4-renderer)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/c4/LICENSE)

View and edit [C4 model](https://c4model.com) diagrams of Structurizr DSL workspaces in the
browser: the canvas of the [C4 Modeler](../../README.md), a framework-agnostic viewer and editor
built on [diagram-js](https://github.com/bpmn-io/diagram-js) (MIT). It shows one view of the
workspace at a time (system landscape, system context, container or component), lets the user draw
people, software systems, containers and components, connect them, drill down into the view one
level deeper, and writes every change into the DSL text, together with the layout of the view.

The text is the document: `exportText()` returns it byte for byte, and an edit changes only the
statements it touches. It implements the collaborative-modeler contract of
[`@miragon/modeler-api`](https://www.npmjs.com/package/@miragon/modeler-api), and it hands a chrome
such as [`@miragon/modeler-shell`](https://www.npmjs.com/package/@miragon/modeler-shell) its menu
entries, dialogs, inspector, legend rows and shortcut groups without importing it. The web app and
the VS Code extension of the C4 Modeler both wrap this package.

Compatible with Structurizr DSL. Structurizr is a product of Structurizr Limited; this project is
not affiliated with or endorsed by Structurizr Limited.

## Install

```bash
npm install @miragon/c4-renderer diagram-js didi tiny-svg @fontsource-variable/geist
```

`diagram-js` (^15.28.0), `didi` (^11 or ^12) and `tiny-svg` (^4.1.4) are peer dependencies, so a
host that uses diagram-js itself shares one copy. `@miragon/c4-dsl`, `@miragon/c4-schema-model`
and `@miragon/c4-layout` come along as dependencies.

## Quick start

```ts
import "@fontsource-variable/geist/wght.css";
import "@miragon/c4-renderer/assets/c4.css";
import { createCollaborativeModeler } from "@miragon/c4-renderer";

const modeler = createCollaborativeModeler();
modeler.attachTo(document.querySelector("#canvas")!);

await modeler.importText(text); // a Structurizr DSL workspace; rejects what it can't open
modeler.onContentChanged(() => save(modeler.exportText()));

modeler.views.active(); // the view on the canvas: { key, type, state, title, … }
modeler.views.open("Containers-bookshop", { cause: "user" });
const { svg } = modeler.diagram.saveSVG(); // the current view, light
```

> **The CSS is required.** Import `@miragon/c4-renderer/assets/c4.css`: the vendored design
> tokens, diagram-js's stylesheet and the canvas styles. The canvas measures its text in Geist; load
> the font before the first import, or the labels are laid out again once it arrives.

`createCollaborativeViewer()` mounts the same canvas read-only, with zoom, pan, selection and the
navigation between views. The classes behind both are exported as well: `Viewer` (rendering only),
`NavigatedViewer` (plus zoom, pan, selection and navigation) and `Modeler` (plus editing, `undo()`
and `redo()`), each with `importText`, `exportText`, `saveSVG`, `attachTo`, `destroy`, `get`, `on`
and `off`.

## Options

```ts
createCollaborativeModeler({
  additionalModules?: ModuleDeclaration[], // more diagram-js modules (the shell's shellModule)
  undoRedoKeys?: boolean,  // bind Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Ctrl+Y (default true)
  fitOnImport?: boolean,   // fit after every import and view switch (default true)
  freeArea?:               // the part of the canvas a host's chrome leaves free
    | { insets: () => { top: number; right: number; bottom: number; left: number } }
    | { center: () => { x: number; y: number } | undefined },
  identifiers?: "readable" | "collision-free", // see below (default "readable")
});
```

- `undoRedoKeys: false` leaves the history keys to a host whose document owns undo (the VS Code
  extension).
- `fitOnImport: false` is for a host whose chrome fits the content itself: it then fits, or
  restores the view's last viewbox, on `c4.view.changed` (below).
- `freeArea` follows the contract's factory option: a palette entry chosen by keyboard creates the
  element in its centre, and the fit centres the content in it. Inside the shell, the keyboard
  create also keeps out from under the inspector its selection opens (the shell's
  `data-chrome="inspector"` island), except for the first element of an empty view.
- An element created from the palette gets an identifier with a random suffix
  (`softwareSystem_k3x9`), which follows its first name (`payments`). With
  `identifiers: "collision-free"` the suffix stays (`payments_k3x9`): for hosts where several
  people edit one text, so two peers who name two systems alike don't write one identifier twice.

## Views

A workspace has many views; the canvas shows one. `modeler.views`:

| Member                 | Does                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `active()`             | the view on the canvas, a `ViewEntry` of `@miragon/c4-schema-model`                 |
| `catalog()`            | every view: written, implicit and draft (`list()`, `resolve()`, `defaultView()`, …) |
| `open(key, { cause })` | switches the canvas to a view; `false` when the key resolves to none                |
| `parent()`             | the view one level up, `undefined` at a landscape                                   |
| `viewboxFor(key)`      | the viewbox a view had when the canvas left it                                      |

A switch fires `c4.view.changed` with `{ view, previous, cause }` on the diagram's event bus
(`VIEW_CHANGED_EVENT`). `cause` is `user`, `reveal` (`elements.reveal` showed an element of
another view), `host` (`setViewState` named a view), `undo` or `redo` (the change came back in its
own view), `rekey` (an edit renamed the scope of the draft shown, same view, new key) or `removed`
(an edit deleted the view shown; the canvas went to its parent or the default view). An import
fires none: it shows the default view, or the view `importText(text, { view })` names when the
text still has it. A draft (a drill-down target not in the file yet) carries the key it will be
written under, so the edit that writes it switches nothing.

`NavigatedViewer` and `Modeler` show a breadcrumb at the top left of the canvas: the path from the
system landscape down to the view shown ("System landscape › Bookshop context › Bookshop
containers"), each view above a button that opens it, and a draft shown marked "Not in the file
yet". It is hidden at a landscape, where no view lies above. It is HTML after the canvas's `<svg>`
(a `<nav>` named "Breadcrumb"), so the keyboard reaches it after the canvas and no export draws
it, and it keeps clear of the islands of a `@miragon/modeler-shell` chrome around it.

`getViewState()` returns `{ view, x, y, width, height }`, and `setViewState()` restores the view
as well as the viewbox. `rebaseText(text)` takes a text that differs from the current one only in
formatting or comments without touching the canvas (`false`, and nothing changed, for any other
text), for a host that mirrors the file from a text editor: the next edit builds on the new
bytes. It clears the history, whose steps point at the old bytes, and fires `c4.text.rebased`
(`TEXT_REBASED_EVENT`), so what shows a line of the text reads it again; it fires no content
change. `isModelEmpty()` says whether the workspace has no element at all.

## Edits

Every gesture (create, connect, move, resize, bendpoints, delete, label edits) and every method of
`modeler.c4` is one command that changes the text, computed and checked by
[`@miragon/c4-dsl`](../dsl) before it runs:

`editElement`, `editRelationship`, `renameIdentifier`, `removeFromView`, `deleteFromModel`,
`includeInView`, `createView`, `editView`, `deleteView`, `layOutAutomatically`, `editWorkspace`,
`applyC4Colours`, `insertExample`.

An edit the DSL can't hold is refused: nothing changes, and `c4.edit.refused` (`EDIT_REFUSED_EVENT`)
carries `{ reason, message, level }` for the host to show. `level` (`refusalLevel(reason)`) is
`info` where the message explains a rule the edit would break, and `danger` only where an edit went
wrong (`verification-failed`: the text it wrote failed the edit layer's own check); a host shows a
refusal without a level as `danger`. `c4.edit.notice` (`EDIT_NOTICE_EVENT`) reports what an
accepted edit did besides what was asked (an implied relationship appeared, an include the modeler
could not read was not updated). Delete is the smart delete: an element no other view shows goes
from the model, any other from the view only; `c4.delete.done` (`DELETE_DONE_EVENT`) says which
went where, and `deleteDoneText(event)` words it ("Removed E-mail System from this view. It stays
in the model.").

## Chrome parts

The renderer never imports a chrome; it hands one structurally typed parts that fit the modeler
shell:

| Export                                                                 | What                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c4Menu({ modeler, exports, … })`                                      | the Model group (Views…, Parent view, Lay out automatically, Add existing element…, the settings, Apply C4 colours), Export (PNG, SVG and, where the host passes them, the text as `.c4` and as Structurizr DSL) and Help |
| `connectDialogs(modeler, { container, openDialog })`                   | the dialogs (Views…, View settings…, Add existing element…, Workspace settings…, the delete confirmation) on the chrome's dialog                                                                                          |
| `mountInspector(slot, modeler, options?)`                              | the properties of the selection, plain DOM in an inspector slot; `commitDraft()` for a host's save                                                                                                                        |
| `connectLegend(body, modeler)`, `legendRows`, `renderLegend`           | the legend of the view on the canvas                                                                                                                                                                                      |
| `c4Shortcuts(host, options)`, `createShortcutsDialog(chrome, options)` | the keyboard shortcuts as data and as a dialog                                                                                                                                                                            |

## Keyboard

On the focused canvas: L, H and C pick the lasso, hand and connect tools; E edits the name, Tab
the next field; Enter opens the view of the selected software system or container, U the parent
view, G the views dialog; Delete and Backspace delete smartly, Shift+Delete deletes from the model;
the arrows move the selection; Cmd/Ctrl+A selects every element of the view. Tab from the canvas
reaches the context pad of the selection, then the breadcrumb.

The context pad is a toolbar with one tab stop, its entries buttons named by their titles: the
arrows move through it, Home and End jump to its ends, Enter and Space run an entry (an append
places the element beside the selection and opens its name, Connect opens Add relationship… from
it, a delete asks first where it reaches further), and Esc gives the keys back to the canvas with
the selection kept.

## Look and export

The default look is monochrome, drawn in the roles of the Miragon design system, as Structurizr's
own default is; colours from the workspace's styles are drawn as written, with text kept readable
on them. A new workspace of `@miragon/c4-dsl` (`newWorkspaceText()`) carries the C4 colours as tag
styles, and `modeler.c4.applyC4Colours()` writes them into one that lacks them.

Every relationship's label sits above every line, so a line that crosses a label runs under it,
and a click on the label selects its own relationship. What is dragged, moved or resized shows
above every label, a moved relationship with its label.

`saveSVG()` exports the current view, its title block included, always light: every node carries
its light colour as an attribute, and the export drops the design system's role classes, the drill
badges, the selection and hover handles and the canvas's keyboard and screen-reader attributes, so
a selection exports the same picture as none. The SVG has no background: where a label lies on the
canvas's ground, what it covers is cut out with a mask, so the page shows under the label, white
on a white page. Rasterise it on `COLORS.paper` for a PNG. `THEMES` (also
`@miragon/c4-renderer/themes`, without the diagram) is `["light"]`.

## Development

Part of the [C4 Modeler](../../README.md) in the
[Miragon modeler suite](https://github.com/Miragon/modeler-suite). From the suite's root:

```bash
npm run c4 build          # the packages, the renderer last (Vite library build to dist/)
npm run c4 test           # unit tests
npm run c4 test:browser   # the renderer in Chromium, with the modeler-api conformance kit
npm run c4 lint           # ESLint and the type checks
```

## License

[MIT](../../LICENSE). The icons are [Lucide](https://lucide.dev) (ISC), inlined with their notice;
the drawing runs on diagram-js (MIT).
