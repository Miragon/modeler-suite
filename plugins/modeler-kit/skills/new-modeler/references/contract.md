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
  `defaultPrevented` and one of an IME composition (`isComposing`, or the `keyCode` 229 with which
  Safari sends the key that confirms a candidate after the composition ended);
- leaves a key alone whose target lies inside an `inert` subtree, and one that reaches a canvas
  `<svg>` an ancestor with `display: none` hides (`checkVisibility()` is false): Chromium moves the
  focus off a canvas the host made inert or hid only at its next rendering update, so until then a
  key still reaches the `<svg>` (the template's
  [`CanvasKeys.ts`](../assets/template/packages/renderer/src/keyboard/CanvasKeys.ts) does this, and
  skips a handled key and an IME key, for diagram-js's keyboard);
- never prevents or stops a key it does not act on, in the capture phase too, so a host's text
  field keeps Cmd/Ctrl+C and its buttons keep Enter and Space.

With `<body>` no longer the canvas's, an action that leaves the focus nowhere (a pointer on a
palette tool or on the context pad's delete) hands it to the canvas (`canvas.focus()`), so the next
key acts; in the apps the shell does that for its chrome ([shell](shell.md)).

## Gestures

Hosts re-import a peer's text whenever it arrives, also while the user drags. diagram-js keeps a
drag running across a cleared canvas, and its release then applies a command to removed shapes and
throws half-way. Contract 1.5 RECOMMENDS the cancel below and defines the optional `interaction`
surface. Contract 1.6 RECOMMENDS that a pan is no gesture and that an import waits for any running
user action, each with kit cases that advise, and every Miragon renderer and the template follow
both (template:
[`Gestures.ts`](../assets/template/packages/renderer/src/gestures/Gestures.ts), called from
[`BaseViewer.ts`](../assets/template/packages/renderer/src/BaseViewer.ts) and
[`collaborative.ts`](../assets/template/packages/renderer/src/collaborative/collaborative.ts)):

- **An accepted import ends a running gesture the way Escape does** (contract 1.5): a move,
  resize, connect or lasso drag, a create or append from the palette or the context pad, also
  while its preview is still over the palette, and a press that has not reached the drag threshold
  yet. Call `dragging.cancel(false)` once the text passed the parser and the validation and before
  the canvas is cleared (`false`: the selection it would restore holds the replaced shapes). A
  rejected import (L7) leaves the gesture running, since hosts re-import half-typed peer text on
  every sync.
- **A drag that holds no element is no gesture** and runs on. A palette tool that only waits for
  its next press stays armed (the lasso, `lasso.selection`, and the hand), as the contract's
  definition of a gesture already implies. A pan of the hand tool (`hand.move`, also with Space
  held) is none either: contract 1.6 RECOMMENDS it (1.5 said a pan MAY count), and the kit's pan
  case checks that it runs on through an import.
  An import's fit and a host's `setViewState` after it (L5) move the view under a running pan, so
  the template moves the pan's starting point to the diagram point under the pointer on every
  `canvas.viewbox.changed` (the canvas runs without `deferUpdate`, so the event comes at once);
  without that, the next move would put the view from before back. The pan's own scroll is left
  out: diagram-js rounds each step of a pan to whole diagram units, and a starting point moved
  after it would add the rounding up, so a slow pan at a zoom above 200 % would not move at all.
  The template tells that scroll apart by the pan's drag context during `hand.move.move`, not by
  a flag, which a view listener that throws would leave set. A renderer that adds
  diagram-js's space or global connect tool adds their waiting drags to that list, and refuses a
  connect whose start shape the import removed, as Value Chain does. A renderer that adds
  diagram-js's AutoScroll keeps it still under a pan (`hand.move`), as Value Chain also does: its
  scrolls at the canvas edge are view changes the pan did not make, so the re-anchor would keep
  each of them, and the diagram point would leave the pointer.
- **An import called during a user's action waits until the action has finished.** A user's action
  is what the diagram does for one input: a drop, the start of a drag, a keyboard create, a click
  append, a label commit, the command of a key, an undo or a redo. A host that imports from
  `onContentChanged` or `elements.onSelection` does so inside the action, which goes on after it.
  The command goes on after a listener it runs: a delete, an undo or a redo that removes a selected
  element changes the selection in the middle of the command, and an import there loses elements and
  breaks the history. diagram-js goes on with a drag it starts: when a move passes the threshold,
  and at once for a palette create, `Dragging.move` fires `drag.start`, clears the selection and
  then sets the drag's cursor, so an import from the selection listener there ends the drag under it
  and the cursor's read throws (`Cannot read properties of null`). The handler goes on after the
  command: a drop's later listeners run (diagram-js's `SelectionBehavior` throws on a moved shape
  the import removed, when something was selected before the drag), a keyboard create selects the
  new element and opens its label editor (on a removed element, the typed name is lost), and a press
  that commits the label editor then starts its drag (a palette create throws in diagram-js's
  dragging). The contract's `importText` returns a promise that settles after the import it runs
  once the action has finished; after a drag's start, that import ends the drag the way it ends any
  gesture. The template counts an action from its drop (`drag.end`), the start of its drag
  (`drag.start`) or the start of its first command (`commandStack.preExecute`, `execute` for a redo,
  `revert` for an undo), each at the first priority, until the task of the user's input is over (a
  microtask queued there runs once the handler has returned, and so after `Dragging.move`), so an
  import waits whichever listener of that task a host calls it from. End the action with that
  microtask, not with a later event: a drop whose cleanup throws never announces its end, and a flag
  left set would hold every later import. Imports keep their call order, also one called after the
  action while an earlier one still waits. Outside an action it imports at once. The kit checks it
  in three cases (contract 1.6, RECOMMENDED): the drop case, with a selection held from before the
  drag and both a different document and an echo of the drop's own; the user-action case, with an
  import from the selection listener of a delete (Delete on the focused canvas), an undo and a redo
  of a selected element, and two imports that keep their call order; and the drag-start case, with
  an import from the selection listener at the start of a move and of a palette create. A click
  append, a keyboard create and a label commit stay with the renderer's own tests, as in the
  template's `gestures.browser.test.ts`. The diagram's own import, which cannot wait,
  leaves a drop to finish and never cancels it from inside diagram-js's end of it (tell the drop
  apart by its drag context). Called from a selection listener at a drag's start, it still ends the
  drag inside `Dragging.move`, which then throws on the cursor, so a host imports there through the
  contract's `importText`, which waits.
  - A host may destroy the modeler from any listener. diagram-js cancels a running drag on destroy
    and the canvas drops its root, while the handler of the user's input still goes on with them:
    a `destroy()` from the selection listener at a drag's start had `Dragging.move` read the
    cancelled drag and throw on the cursor, one from the change listener at a drop or a keyboard
    create left diagram-js's `SelectionBehavior` and the palette selecting on the torn-down canvas,
    and one from an interaction listener that hears `false` inside diagram-js's `drag.cleanup` (a
    drop, Escape) cancelled the drag a second time from inside its own cleanup. The template's
    `destroy()` stops the content, interaction and selection deliveries at once and tears the
    diagram down once the handler of the input has returned (`tearDownAfterHandler`, from
    `drag.init`, `drag.start`, `drag.end`, `drag.cancel`, `drag.cleanup` or a command's start
    until a microtask later): the rest of the handler runs on the live diagram. A drag of the
    renderer's own that reads the canvas after it reports its start or end opens the same window
    when it reports it, and a step the action deferred past the handler (a timer, a popup) skips
    itself once `diagram.destroy` has fired. Each delivery skips a listener that an earlier
    listener of it unsubscribed, as a DOM event target does, and `elements.onSelection` delivers
    nothing after `destroy()`, so the selection a cancelled drag brings back reaches no host.
  - A host's own call reaches a listener too: `elements.reveal` calls the selection listener
    before it scrolls to the node, and an import calls it as its clear empties the selection,
    before it draws the document. diagram-js's canvas loses its root on destroy, so a teardown
    there made the import throw half-way. The template's `destroy()` from a selection listener
    tears the diagram down a microtask later, once that call has returned. An import that ends a
    held gesture calls the interaction listener inside the drag's cancel, whose window holds the
    teardown already. A teardown that waits reads the export again when an import drew in the
    meantime (`import.done`), so `exportText()` returns the imported document; whatever else runs
    on after the destroy reaches no host, so the text read at the destroy stays. The import's
    Promise rejects with "The modeler was destroyed.", as an import does that waits when the
    modeler is destroyed. The template decides that once the import has drawn, before its call
    returns: a `destroy()` after the call comes from outside the import and leaves it resolved.
  - After a keyboard create, the import takes the label editor down and reopens it on the element
    with the same id. An edit the first of several waiting imports takes down stays suspended
    through the next; a render that fails reopens it as well, so no later import brings back an
    edit that is long over.
  - A press that commits the label editor starts a gesture after its commit. The import that
    commit triggers ends that gesture, as an accepted import ends any (L1), and does not wait for
    the drag's drop: the commit lands with one change, and the move or the create of the press
    does not happen, without an error. That is the decided outcome for every Miragon renderer and
    the template; only a host that imports its own change back at once meets it, since both apps
    suppress their own echo.
- **A step the action schedules for later belongs to it.** A timer or a popup that opens after a
  create or an append runs in a later task, so it holds the action until it has run, and the
  import waits for it as well: `holdAction()` returns the release, which the step calls in a
  `finally` once it has run (the popup or the editor has opened), never for as long as that stays
  open, since a host waits for no popup and a hold never released keeps every later import
  waiting. A step that does not run calls it too. The template schedules none.
- **`interaction`**, an optional surface the kit checks like the cancel: `active()` is true
  from the first `drag.move` of an activated gesture drag, a palette create at once, until
  diagram-js cleans the drag up, so it is still true during the drop's command; `onChange` fires
  once each way, with `active()` already returning the new value, and never for an armed tool or
  a pan (contract 1.6 RECOMMENDS the pan). The listener can run inside `importText` and inside
  diagram-js's events, so a listener that throws is reported, not left to break the drag. The
  viewer has no editing gesture and reports false.

The template's
[`gestures.browser.test.ts`](../assets/template/packages/renderer/test/browser/gestures.browser.test.ts)
drives all of this with real pointer events, beyond what the kit's cases hold: the conformance
harness fills the kit's gesture fields (`startGesture`, `armTool`, `startPan`) the same way.

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
  `commitInteraction`, `settle`, and since contract 1.6 `startGesture` (a move, a create held
  over the canvas and one held over the palette, by real pointer events; its `drop()` lands where
  the gesture applies), `armTool`, `startPan` (one step past the drag threshold, and one more
  per `move()`) and `exportImage` (the renderer's SVG export).
- Pass `onSkip` that throws: with every hook filled a skip is a gap, and a kit release that adds a
  case names the hook it needs. Collect `onAdvisory` and assert the list is empty after all cases (or throw in it):
  the renderer follows every recommendation, so an advisory is a regression.
- A case is only as good as the harness: drive real services (the renderer's label editor, the
  command stack, `modeling.moveElements`), not shortcuts around them.

Contract 1.6's kit adds eight cases. A case, or the half or leg of one, that reads one of the four
new hooks (`startGesture`, `armTool`, `startPan`, `exportImage`) reports a skip until the harness
fills it; the user-action case and the destroy case's leg inside `reveal()` read none of them
(every leg is in the package README's
[cases of 1.6](https://github.com/Miragon/modeler-suite/blob/main/packages/api/README.md#cases-for-the-15-surfaces-and-the-gesture-rules-of-16)):

- the **L1 gesture** case: an accepted import ends a running move or create, so its drop throws
  nothing and applies nothing, and a rejected import leaves it running (an advisory; a change event
  before the drop fails L1);
- the **drop**, **user-action** and **drag-start** cases: an import from a listener during a drop,
  a delete, an undo, a redo or a drag's start waits until the action has finished, and imports keep
  their call order (advisories, see [gestures](#gestures));
- the **pan** case: a pan is no gesture and runs on through an import from the current view (an
  advisory);
- the **interaction** case: `active()` and `onChange` follow every gesture to its drop and its
  cancel, never an armed tool, and nothing is delivered after `destroy()`, also not to a later
  listener of the delivery in which an earlier one destroyed the modeler (failures);
- the **destroy** case: a host destroys the modeler from `elements.onSelection` at the start of a
  move and of a palette create, from `onContentChanged` at a drop, from
  `interaction.onChange(false)` at an Escape, and from `elements.onSelection` inside the host's
  own `reveal()`, which calls the listener before it scrolls. Nothing throws, also not to the window,
  no listener is called afterwards, a second `destroy()` throws nothing, and a listener that an
  earlier one of the same delivery unsubscribed is not called (an advisory; the leg inside
  `reveal()` needs no `startGesture`);
- the **appearance** case: `set` draws the requested theme when `themes` lists it and `themes[0]`
  otherwise (a light-only renderer stays light when dark is requested, also on a dark page), the
  contrast always applies, and nothing else changes: no change event, the same exports, history,
  view state and selection (failures; an open label editor that stays open is an advisory).

## Versions and upgrades

The renderer pins `@miragon/modeler-api` exactly. Hosts check `apiVersionsCompatible` (same major)
at bind time and feature-detect optional surfaces (`typeof modeler.elements?.bounds === "function"`),
so a 1.x minor never breaks a host. Adopting a new minor: bump the pin, implement the new optional
surface or option, fill the kit's new hooks (its new cases report skips until then), and release it
as `feat` (or `fix(deps)` for a pin bump alone). A major changes a law; the README's "Candidates for
2.0" lists what is coming.
