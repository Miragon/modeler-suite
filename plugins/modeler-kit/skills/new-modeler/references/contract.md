# The contract: `@miragon/modeler-api`

The contract is what every host binds: Design IQ's live sync, its MCP widgets, and both apps of the
modeler itself. Its laws, the kit and the versioning are documented in the
[package README](https://github.com/Miragon/modeler-suite/blob/main/packages/api/README.md) and as
JSDoc in [`src/index.ts`](https://github.com/Miragon/modeler-suite/blob/main/packages/api/src/index.ts);
this page is what they mean for a renderer, from the five that implement them.

## The factories

The renderer's entry exports two functions with these names, so hosts bind every notation the
same way (template: [`collaborative.ts`](../assets/template/packages/renderer/src/collaborative/collaborative.ts)):

- `createCollaborativeModeler(options)`: the editing mount, `meta.editable: true`;
- `createCollaborativeViewer(options)`: the read-only mount on the renderer's NavigatedViewer,
  `meta.editable: false`, never a change event, no command stack of its own needed.

Both take one options object that extends `CollaborativeModelerOptions` with the renderer's own
(`additionalModules` for the shell's `shellModule`), and return a `CollaborativeModeler` that
also exposes `diagram`, the wrapped diagram-js instance (`get`, `on`, `off`) for host wiring such
as menus and exports, `elements` with `bounds`, since 1.5 `interaction` and `appearance` (see
[gestures](#gestures) and [appearance](#appearance)), and, since 1.3, `contentBounds()`: the
tight box of everything the canvas draws, in diagram coordinates and `undefined` while nothing is
drawn, which a host fits to instead of reaching into the renderer's services. Compute it from the model, as the
template's [`ContentBounds.ts`](../assets/template/packages/renderer/src/io/ContentBounds.ts) does:
a box measured on the live SVG changes with the zoom wherever it holds text. The aligned options
since 1.2:

| Option         | The renderer does                                                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `freeArea`     | places a keyboard-created element (Enter or Space on a palette entry) in the centre of `insets()` (px from the container's edges) or at `center()` (diagram coordinates); default: the visible centre |
| `fitOnImport`  | fits the content after every import, never above 100 %, unless `false` (the shell's viewport fits instead; both apps pass `false`)                                                                    |
| `undoRedoKeys` | binds Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Ctrl+Y to the canvas history unless `false` (VS Code owns the history)                                                                                         |

`meta` is `{ notation, apiVersion, editable }`: `notation` is the renderer's stable id (the template
uses the package slug; a host maps its own id to it), and `apiVersion` is `MODELER_API_VERSION`
imported from the pinned package, never a literal, so it follows every bump.

## What the laws mean for a renderer

| Law | Holds when …                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| L1  | an import renders outside the command stack, clears the history with `commandStack.clear(false)` (no event), and takes an open label editor down without committing (and reopens it on the same id)    |
| L2  | the serializer is deterministic and a fixpoint of its own parser; review the fixture bytes by hand, never paste what the build prints                                                                  |
| L3  | every document change is a command (titles, levels and axes too), the host listener sits on `commandStack.changed`, and `exportText()` reads the live canvas, so it is current inside the listener     |
| L4  | undo after an import finds an empty stack                                                                                                                                                              |
| L5  | `getViewState`/`setViewState` read and write `canvas.viewbox()`; a view change never commits the open label editor (it stays open and follows its element); an import fits unless `fitOnImport: false` |
| L6  | unknown lines and fields survive: a passthrough list in the model, zod `looseObject` for JSON notations, the import's business object written back on export                                           |
| L7  | the text is parsed and validated **before** the canvas is touched, so a rejection leaves nothing behind; the next import and the next command still work                                               |

Two rules hosts rely on beyond the table: blank text imports as an empty diagram (a new file, a
blank shared document), and calls before the first import never wedge the instance. Since 1.5, L1
also RECOMMENDS that an accepted import first ends a running gesture ([gestures](#gestures)).

## Elements

`elements` makes the notation addressable: `list()`, `reveal(id)` (select and scroll, no change
event), `selection()`, `onSelection(callback)` and, since 1.2, `bounds(id)`: the live box in diagram
coordinates, `undefined` for an id `list()` does not report. Hosts anchor todos, deep links and
presence to these ids, so:

- an id is the element's id **in the text**: the serializer writes it, and an element created on
  the canvas gets one that survives a save and re-open;
- new ids are random or peer-scoped (`node_k3x9q2mf`), never a per-instance counter: two peers
  creating different elements at once must not collide (a RECOMMENDATION, the kit advises);
- only elements with a stable id are listed (Event Storming lists stickies, not its drawings);
- an external label reports as its element.

## Keys

Since 1.4 the contract RECOMMENDS that keys stay on the canvas: a key acts only while the canvas
`<svg>` holds the focus (the key's target is the svg or lies inside it), which is where diagram-js
15 binds its own keyboard. Every other key belongs to the page: a host's buttons and text fields, a
Monaco or EditContext editor beside the canvas or in one of its overlays, and `<body>` with nothing
focused, even while the host hides the canvas. The rule holds for the viewer mount too. A renderer
that adds keys of its own:

- binds them through diagram-js's `keyboard`, as the template's
  [`KeyboardBindings.ts`](../assets/template/packages/renderer/src/keyboard/KeyboardBindings.ts)
  does, or, listening on the document, acts only on a key whose target lies in the canvas `<svg>`;
- skips a keydown or keyup without a string `key` (browser autofill sends both), one already
  `defaultPrevented` and one of an IME composition (`isComposing`);
- never prevents or stops a key it does not act on, in the capture phase too, so a host's text
  field keeps Cmd/Ctrl+C and its buttons keep Enter and Space.

With `<body>` no longer the canvas's, an action that leaves the focus nowhere (a pointer on a
palette tool or on the context pad's delete) hands it to the canvas (`canvas.focus()`), so the next
key acts; in the apps the shell does that for its chrome ([shell](shell.md)).

## Gestures

Hosts re-import a peer's text whenever it arrives, also while the user drags. diagram-js keeps a
drag running across a cleared canvas, and its release then applies a command to removed shapes and
throws half-way. Since 1.5 the contract RECOMMENDS the following, and the kit's cases for it come
once every Miragon renderer has it (template:
[`Gestures.ts`](../assets/template/packages/renderer/src/gestures/Gestures.ts), called from
[`BaseViewer.ts`](../assets/template/packages/renderer/src/BaseViewer.ts)):

- **An accepted import ends a running gesture the way Escape does**: a move, resize, connect or
  lasso drag, a create or append from the palette or the context pad, also while its preview is
  still over the palette, and a press that has not reached the drag threshold yet. Call
  `dragging.cancel(false)` once the text passed the parser and the validation and before the
  canvas is cleared (`false`: the selection it would restore holds the replaced shapes). A rejected
  import (L7) leaves the gesture running, since hosts re-import half-typed peer text on every sync.
- **A drag that holds no element is no gesture** and runs on: a palette tool that only waits for
  its next press stays armed (the lasso, `lasso.selection`, and the hand), and so does a pan of the
  hand tool (`hand.move`, also with Space held). An import that fits the view moves the pan's
  starting point to the diagram point under the pointer (on `import.render.done`); without that, the
  next move would put the view from before the import back. A renderer that adds diagram-js's space
  or global connect tool adds their waiting drags to that list, and refuses a connect whose start
  shape the import removed, as Value Chain does.
- **An import called while a drop is applied waits until the drop has ended.** A host that imports
  from `onContentChanged` does so inside the drop's own command. The contract's `importText` then
  returns a promise that settles after the import it runs once the drag has ended (`drag.ended` or
  `drag.canceled`), so no listener of the drop, synchronous or deferred, finds its elements replaced
  (diagram-js's `SelectionBehavior` throws on a moved shape the import removed, when something was
  selected before the drag). Imports keep their call order, also one called after the drop while an
  earlier one still waits. Outside a drop it imports at once. The diagram's own import, which cannot
  wait, leaves the drop to finish and never cancels it from inside diagram-js's end of it. Tell the
  drop apart by its drag context, never by a flag: a drop whose cleanup throws never announces its
  end, and a flag left set would hold every later import.
- **`interaction`**, an optional surface the kit will check like the cancel: `active()` is true
  from the first `drag.move` of an activated gesture drag, a palette create at once, until
  diagram-js cleans the drag up, so it is still true during the drop's command; `onChange` fires
  once each way, with `active()` already returning the new value, and never for an armed tool or a
  pan. The listener can run inside `importText` and inside diagram-js's events, so a listener that
  throws is reported, not left to break the drag. The viewer has no editing gesture and reports
  false.

The template's
[`gestures.browser.test.ts`](../assets/template/packages/renderer/test/browser/gestures.browser.test.ts)
drives all of this with real pointer events, through helpers shaped like the kit's planned harness
fields (`startGesture`, `armTool`).

## Appearance

A renderer lists the themes it can draw in one constant, `THEMES`, light only (`['light']`) until
the joint dark-mode release moves every Miragon modeler to `['light', 'dark']` at once (guide
§13.5). The template keeps it in a module without the diagram
([`themes.ts`](../assets/template/packages/renderer/src/themes.ts)), exported from the renderer's
entry and as `@miragon/<notation>-renderer/themes`, so Node code reads it too. Everything reads
that one constant: `appearance.themes` on both mounts, the shell's `themes` in both apps, the web
app's head markup in its Vite config, the extension host's theme bridge, the VS Code smoke test and
the e2e suites.

`appearance.set({ theme, contrast })` writes `data-cd-theme` (a theme `THEMES` does not list draws
`THEMES[0]`) and, for `"high"`, `data-cd-kontrast="hoch"` on the renderer's root element, the one
`attachTo` appends, so the vendored token CSS resolves the roles there and not from the host page
(template: [`appearance.ts`](../assets/template/packages/renderer/src/collaborative/appearance.ts)).
The root's text colour is a role too (`color: var(--cd-ui-text)`), or it inherits the page's. A
request without `contrast` ends high contrast, an untyped request never throws, and `set` works
before `attachTo`, holds across imports and changes nothing but the roles: no change event, the
same text and SVG export, history, view state and selection, and an open label editor stays open.
Until the first `set` the root carries neither attribute, so the apps, whose shell writes the mode
on `<html>`, need not call it (template:
[`appearance.browser.test.ts`](../assets/template/packages/renderer/test/browser/appearance.browser.test.ts),
which also puts the page into dark high contrast and compares the computed colours).

## The conformance kit

`registerConformance` from `@miragon/modeler-api/conformance` turns every law into a test case.
Run it in `npm run test:browser`: diagram-js needs a real layout engine, so mount into
`attachedHost()` under Vitest browser mode, never jsdom; the keys case finds the canvas `<svg>` of
the modeler and of the viewer in that host (template:
[`conformance.browser.test.ts`](../assets/template/packages/renderer/test/browser/conformance.browser.test.ts)).
Run the cases one after another, as Vitest does by default (never as concurrent tests): the keys
case moves the focus and aims keys at the one document every mounted instance listens to.

- Fill **every** hook of `ConformanceHarness`: `create`, `createReadonly`, `canonicalTexts` (two
  distinct, reviewed), `looseTexts`, `invalidTexts` (`[]` only when nothing is non-importable),
  `foreignTexts` with `mustSurvive`, `probeTexts`, `viewState`, `mutate` (adds, with content that
  differs per call), `configMutations` (`[]` only without document settings), `undo`, `redo`,
  `moveElement`, `openInteraction` (types the same input every time), `interactionState`,
  `commitInteraction`, `settle`.
- Pass `onSkip` that throws: with every hook filled a skip is a gap, and a kit release that adds a
  case names the hook it needs. Collect `onAdvisory` and assert the list is empty after all cases (or throw in it):
  the renderer follows every recommendation, so an advisory is a regression.
- A case is only as good as the harness: drive real services (the renderer's label editor, the
  command stack, `modeling.moveElements`), not shortcuts around them.
- The kit's cases for the 1.5 surfaces land once every Miragon renderer and the template implement
  them (the package README's "Cases for the 1.5 surfaces"), with three new hooks: `startGesture`,
  `armTool` and `exportImage`. They report skips until the harness fills them, so fill them in the
  same upgrade: the template's gesture tests already hold the first two in that shape, and the
  third returns the renderer's SVG export.

## Versions and upgrades

The renderer pins `@miragon/modeler-api` exactly. Hosts check `apiVersionsCompatible` (same major)
at bind time and feature-detect optional surfaces (`typeof modeler.elements?.bounds === "function"`),
so a 1.x minor never breaks a host. Adopting a new minor: bump the pin, implement the new optional
surface or option, fill the kit's new hooks (its new cases report skips until then), and release it
as `feat` (or `fix(deps)` for a pin bump alone). A major changes a law; the README's "Candidates for
2.0" lists what is coming.
