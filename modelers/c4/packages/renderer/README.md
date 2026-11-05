# @miragon/c4-renderer

[![npm](https://img.shields.io/npm/v/@miragon/c4-renderer)](https://www.npmjs.com/package/@miragon/c4-renderer)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/c4/LICENSE)

View and edit [C4 model](https://c4model.com) diagrams of Structurizr DSL workspaces in the
browser: the framework-agnostic canvas of the [C4 Modeler](../../README.md), built on
[diagram-js](https://github.com/bpmn-io/diagram-js) (MIT). It shows one view at a time (system
landscape, system context, container or component), lets the user draw and connect people,
software systems, containers and components, drill down, and writes every change, layout included,
into the DSL text. `exportText()` returns the text byte for byte; an edit changes only the
statements it touches. It implements
[`@miragon/modeler-api`](https://www.npmjs.com/package/@miragon/modeler-api) and hands a chrome
such as [`@miragon/modeler-shell`](https://www.npmjs.com/package/@miragon/modeler-shell) its parts
without importing it.

Compatible with Structurizr DSL. Structurizr is a product of Structurizr Limited; this project is
not affiliated with or endorsed by Structurizr Limited.

## Install

```bash
npm install @miragon/c4-renderer diagram-js didi tiny-svg @fontsource-variable/geist
```

`diagram-js` (^15.28.0), `didi` (^11 or ^12) and `tiny-svg` (^4.1.4) are peers, so a host shares
one copy. `@miragon/c4-dsl`, `@miragon/c4-schema-model` and `@miragon/c4-layout` are dependencies.

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

> **The CSS is required:** `@miragon/c4-renderer/assets/c4.css` holds the design tokens,
> diagram-js's stylesheet and the canvas styles. Load the Geist font before the first import, or the
> labels are laid out again once it arrives.

`createCollaborativeViewer()` mounts the canvas read-only, with zoom, pan, selection and
navigation. The classes `Viewer` (rendering), `NavigatedViewer` (plus zoom, pan, selection,
navigation) and `Modeler` (plus editing, `undo()`, `redo()`) are exported too, each with
`importText`, `exportText`, `saveSVG`, `attachTo`, `destroy`, `get`, `on` and `off`.

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

- `undoRedoKeys: false` leaves history keys to a host whose document owns undo (VS Code).
- `fitOnImport: false`: the host fits, or restores the view's last viewbox, on `c4.view.changed`.
- `freeArea`: keyboard palette creates land in its centre and the fit centres in it; inside the
  shell they also avoid the inspector (`data-chrome="inspector"`), except for the first element of
  an empty view.
- Palette creates get a random suffix (`softwareSystem_k3x9`), dropped at the first name
  (`payments`). `identifiers: "collision-free"` keeps it (`payments_k3x9`), so peers editing one
  text never write one identifier twice.

## Views

The canvas shows one view at a time. `modeler.views`:

| Member                 | Does                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `active()`             | the view on the canvas, a `ViewEntry` of `@miragon/c4-schema-model`                 |
| `catalog()`            | every view: written, implicit and draft (`list()`, `resolve()`, `defaultView()`, …) |
| `open(key, { cause })` | switches the canvas to a view; `false` when the key resolves to none                |
| `parent()`             | the view one level up, `undefined` at a landscape                                   |
| `viewboxFor(key)`      | the viewbox a view had when the canvas left it                                      |

A switch fires `c4.view.changed` (`VIEW_CHANGED_EVENT`) with `{ view, previous, cause }`; `cause`
is `user`, `reveal` (`elements.reveal` showed another view), `host` (`setViewState`), `undo`,
`redo`, `rekey` (an edit renamed the shown draft's scope) or `removed` (the shown view was deleted;
the canvas went to its parent or the default view). An import fires none: it shows the default
view, or the one `importText(text, { view })` names. A draft (a view not in the file yet) carries
the key it will be written under, so writing it switches nothing.

`NavigatedViewer` and `Modeler` show a breadcrumb at the top left ("System landscape › Bookshop
context › Bookshop containers"), each view above a button, a draft marked "Not in the file yet",
hidden at a landscape. It is an HTML `<nav>` after the canvas's `<svg>`, so the keyboard reaches it
after the canvas and no export draws it, and it keeps clear of shell islands. In the `Modeler` with
dialogs connected, a container or component view whose scope has relationships it can't draw shows
a chip after it ("1 relationship of Bookshop isn't shown here"); its dialog moves such an end to a
child (`c4.moveRelationshipEnd`).

`getViewState()` returns `{ view, x, y, width, height }`; `setViewState()` restores view and
viewbox. `rebaseText(text)` adopts a text that differs only in formatting or comments without
touching the canvas (else returns `false` and changes nothing), for hosts mirroring a text editor;
it clears the history and fires `c4.text.rebased` (`TEXT_REBASED_EVENT`), no content change.
`isModelEmpty()` says whether the workspace has no element.

## Edits

Every gesture and every method of `modeler.c4` is one command that changes the text, computed and
checked by [`@miragon/c4-dsl`](../dsl) first:

`editElement`, `editRelationship`, `renameIdentifier`, `removeFromView`, `deleteFromModel`,
`includeInView`, `createView`, `editView`, `deleteView`, `layOutAutomatically`, `editWorkspace`,
`applyC4Colours`, `insertExample`.

A refused edit changes nothing and fires `c4.edit.refused` (`EDIT_REFUSED_EVENT`) with
`{ reason, message, level }`; `level` (`refusalLevel(reason)`) is `info` for a broken rule and
`danger` only for `verification-failed` (show a missing level as `danger`). `c4.edit.notice`
(`EDIT_NOTICE_EVENT`) reports side effects of an accepted edit (an implied relationship appeared,
an unreadable include was not updated). Delete is smart: an element no other view shows goes from
the model, any other from the view only; `c4.delete.done` (`DELETE_DONE_EVENT`) says which, and
`deleteDoneText(event)` words it ("Removed E-mail System from this view. It stays in the
model.").

## Chrome parts

Structurally typed parts that fit the modeler shell, without importing it:

| Export                                                                 | What                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c4Menu({ modeler, exports, … })`                                      | the Model group (Views…, Parent view, Lay out automatically, Add existing element…, the settings, Apply C4 colours), Export (PNG, SVG and, where the host passes them, the text as `.c4` and as Structurizr DSL) and Help |
| `connectDialogs(modeler, { container, openDialog })`                   | the dialogs (Views…, View settings…, Add existing element…, Workspace settings…, Move to a container, the delete confirmation) on the chrome's dialog                                                                     |
| `mountInspector(slot, modeler, options?)`                              | the properties of the selection, plain DOM in an inspector slot; `commitDraft()` for a host's save                                                                                                                        |
| `connectLegend(body, modeler)`, `legendRows`, `renderLegend`           | the legend of the view on the canvas                                                                                                                                                                                      |
| `c4Shortcuts(host, options)`, `createShortcutsDialog(chrome, options)` | the keyboard shortcuts as data and as a dialog                                                                                                                                                                            |

## Keyboard

On the focused canvas: L, H, C pick lasso, hand and connect; E edits the name (Tab the next field);
Enter opens the selected element's view, U the parent, G Views…; Delete and Backspace delete
smartly, Shift+Delete from the model; arrows move the selection; Cmd/Ctrl+A selects all. Tab from
the canvas reaches the context pad (a toolbar with one tab stop: Arrows, Home, End, Enter or Space,
Esc back to the canvas), then the breadcrumb.

## Look and export

The default look is monochrome in the Miragon design system's roles, like Structurizr's default;
workspace style colours are drawn as written, with text kept readable. `newWorkspaceText()` of
`@miragon/c4-dsl` carries the C4 colours, and `modeler.c4.applyC4Colours()` adds them. Relationship
labels sit above every line, and what is dragged shows above every label.

`saveSVG()` exports the current view with its title block, always light, without selection,
handles, drill badges, role classes or accessibility attributes. It has no background: label grounds
are cut out with a mask, so the page shows through. Rasterise it on `COLORS.paper` for a PNG.
`THEMES` (also `@miragon/c4-renderer/themes`) is `["light"]`.

## Development

Part of the [C4 Modeler](../../README.md) in the
[Miragon modeler suite](https://github.com/Miragon/modeler-suite): `npm run c4 build`, `test`,
`test:browser` and `lint` from the suite's root.

## License

[MIT](../../LICENSE). The icons are [Lucide](https://lucide.dev) (ISC), inlined with their notice;
the drawing runs on diagram-js (MIT).
