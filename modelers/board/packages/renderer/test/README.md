# The tests of the board renderer

What each test file holds, how the recorded arming traces and the conformance harness are kept,
and what a browser test of the board has to know. The rules these tests stand under (the port
as a move, the pinned skips of the kit, what was run) are in the modeler's
[`CLAUDE.md`](../../../CLAUDE.md).

## The unit project

`npm run board test` (Node). `packages/schema-model/test/` covers the format (the value
`__proto__` in a text, a label, a group's name, a file, the title and an arrow's end round-trips;
the key is refused at every depth, and so is an element of that id), the order keys and the view. This folder covers the store, the
actions (with `takenIn`, the question whether a path is in use), the arm rules, and the board
file at rest, under a Git merge and under two peers on one live document. Of the canvas side it
covers the parts that need no browser:

- `derived-arrows.test.ts` and `single-copy.test.ts`.
- `host-defaults.test.ts`: the answers of a host that offers nothing; the lists kept steady for
  a host that builds them per call; a `list()` and a `describe()` that fail (reported once,
  answered with what the board had); the empty path that is never asked for; `images.taken`
  handed on only where the host has one.
- `presence-format.test.ts`: what a peer announces about itself. Hex colours only, anything else
  the design system's quiet text colour; a name without control characters, double quotes and
  backslashes, 24 characters at most, "?" for nothing. Also the source file itself: it opens
  with the head comment it had in designIQ, and its comments have no `color` and no em dash.
- `collaborative-parts.test.ts`: the parts of the contract factory without a canvas. What a
  host's view state is taken for, the fit, the names and boxes of the elements, the selection,
  the order of the imports; the wait for the canvas (it lasts until the canvas exists and
  leaves no timer behind), a free area that throws, an element whose text, label or file is no
  string, a listener unsubscribed inside a delivery, and what an import asks of the canvas (it
  gives up what the canvas holds back before it writes and only for a text it accepts; it
  leaves the view alone while a model is edited).
- `arming-fixture.test.ts`: the recorded arming traces as a file. It is there, holds one trace
  per scenario (73) and is in the form `traceText` writes. The browser test compares the
  imported value, so this is what makes that comparison one of bytes, and what fails on a
  machine that runs no browser. The count is a literal there: change it with the scenarios.
- `layers.test.ts`: the reach of `document-half-no-canvas`. Every source file of the renderer
  is of the document half, a target the rule forbids, or one of `index.ts` and `css.d.ts`.
- `theme.sync.test.ts`: the two vendored files against `.miragon/brand-assets.sha256` and no
  third file in `theme/`; no hex, `rgb()` or `hsl()` in either sheet; every `--cd-*` read is a
  role, a mode-independent token or a fixed value of guide §8, and the vendored tokens define
  it; the three imports first; the alias block holds exactly the 25 names (the 24 of designIQ's
  page and `--board-primary-fill`) and each resolves through `hell` (or `fest`) of the JSON to
  the light value it had in designIQ; the two Done buttons and nothing else read the fill, the
  toolbar's has the fixed hover, and white on each of these grounds keeps 4.5:1 through `hell`
  and through `dunkel`; no read of a name of designIQ's ui-kit and none of an undeclared
  `--board-*` name.
- `styles.scope.test.ts`: every selector of both sheets starts at a `.board-*` class, but for
  exactly three that start at `.react-flow__node` and end on a board class; none names `html`,
  `body`, `:root`, `:host`, an editor (`.djs-`, `.dmn-`, `.bjs-`, `.bpmn-`, `.wardley-`,
  `.view-drd`, `data-mount`) or the bench (`.board-stub`, `.board-frame`, a `label` element);
  none selects a part of React Flow the board never draws (`.react-flow__edge.updating`,
  `.react-flow__edge-text`); every selector of the base has the scoped form, with
  pseudo-elements behind the `:not()`. It checks where a selector starts, not what it reaches.

## The browser project

`npm run board test:browser` (Chromium, a window of 1280 x 800) runs
`browser/**/*.test.{ts,tsx}`: React Flow measures its nodes, so nothing of the canvas runs in
jsdom or Node. On a machine where Chromium must not run without its sandbox, see the Commands of
the modeler's `CLAUDE.md`.

- `toolchain.browser.test.tsx`: a board of notes mounts with its sheet and a pane that takes
  the focus, a model node asks the host once for its editor, a double-click arms it at board
  zoom 1 in the layer, a zoom of the board releases it, and `exportText()` gives back the
  imported text. It also checks the test support itself.
- `react-flow-internals.browser.test.tsx`: the fields of React Flow's store the board reads,
  and the shape of a connection in progress.
- `arming.browser.test.ts`: the arm rules at work on a bench of fakes (React Flow's store as far
  as the rules read it, a runtime that records the armed node, a clock stepped by hand), no
  board mounted. 73 scenarios: armed at once, the move and what interrupts it, the box that
  changes under it, the motion sources, a zoom seen coming and one not seen coming under each
  rule, the way back, the URL's arm, the undo of the guards. Each scenario is held against a
  claim written beside its script and against its trace in
  `browser/fixtures/arming-traces.json`, which the test imports and compares itself,
  scenario by scenario and then as text. Its check "arms a node in the same task as the last
  write of its move" reads the order of the calls in one step; it cannot see `flushSync`, which
  `canvas-behaviour.browser.test.tsx` holds on a mounted board.
- `canvas.browser.test.tsx`: the pane's focus stop and name; Delete and Backspace on a focused
  node remove the revealed element as one change and hand the focus to the pane; Control or
  Command + Z, Shift + Z and Y; `undoRedoKeys: false`; what keeps a key from the board: Alt,
  Control or Command with a delete key, a key something inside the board prevented, a field or
  a `.nokey` element inside the pane, a key aimed at the page, at a button beside the board or
  at a note's textarea, and a board that moves; the pane without `tabindex`, `aria-label` and
  listener after `destroy()`; a press that holds Control or Command adds to the selection; a
  box selection that holds the armed model: Delete on its rectangle removes what can go and the
  rectangle with it, and the tail of a drag out of the editor leaves the rectangle and the
  selection; beside an armed editor a click inside the layer and the tail of a drag leave
  selection and arming alone, a click on the bare pane disarms, also one without a press of its
  own; whose delete it is: the editor's after a primary press in it that left the focus on the
  page, the board's with the focus on the pane, after a press of another button, and once
  nothing is armed.
- `canvas-behaviour.browser.test.tsx`: behaviour that one statement each stands for, found by
  breaking the statement and seeing every other test pass. Delete on the pane leaves the armed
  model; a note's editor that opens disarms it; the double-click event on a model's Edit and
  Done button does not reach the node; a node is armed, with its editor in the layer, before
  the call that ends the board's move returns (`flushSync`, checked with a move of 0 ms); an
  armed editor is put into the layer as the layer is when it is placed; an arrow-key move is
  written once after its rest of 400 ms, as one change; a new node lands in the middle of the
  view and the next one 28 px down and to the right; a file pasted into a note's textarea is
  the textarea's; two images of one name get two names; `reveal` leaves an element in view
  alone and centres one that is out of view; the last place of a pointer that moved twice
  within one tick of the publish is published; a part that throws shows its error where it
  would be, and a model's frame that throws counts as failed; a second `attachTo` mounts
  nothing; an arrow drawn from a handle to a handle runs from the first node to the second and
  is refused between two handles of one node; a node that is being dragged keeps its place when
  a peer changes it. It replaces `src/nodes/model-node.js` for its own file by `vi.mock`, with a
  wrapper that throws only inside the two tests of a part that throws.
- `chrome.browser.test.tsx`: the model picker (title and kind, the host's list, one node and
  one change per choice); the Image button and a picked, a pasted and a refused image; the Done
  control; the arrows derived from `host.references`; the presence layer (a peer's cursor,
  name, colour and outline; this person's pointer and selection published, the cursor taken
  back inside an armed editor, null when the board goes).
- `images.browser.test.tsx`: the image port as a host fills it. A `store` that returns at once
  (the node in the same task, as measured), one that returns a promise (node and notice when it
  resolves, the files of one paste one after the other), one that throws or rejects (a refused
  notice with the error's message, no node; Vitest's own count of unhandled rejections is the
  check that none is left); `taken()` asked in place of `read()`, and `read()` where the host
  has none; an image pasted or picked right before `destroy()` (no `store` call, nothing written
  into a live document, no notice), also one picked before the gestures part has loaded, and a
  store that settles after `destroy()` (no node, no notice); a board whose gestures part ended
  by an error still takes a picked image; a file dragged and dropped inside the armed editor
  (not taken, no hint, the default still cancelled) against the same file on the pane. It
  replaces `src/canvas/board-gestures.js` for its own file by `vi.mock`, with a wrapper that
  two tests set aside ("absent", "throws").
- `overlay-surface.browser.test.tsx`: the order the surface keeps. One `open` with the element
  already in the node, before the mount is reported and the surface registered; `mounted` only
  after the editor's `ready`; armed: the listeners with `data-armed` written and the element
  still in the node, then the element in the layer at the node body's rectangle, then
  `focus()`; a pan moves the armed element before `setViewState` returns; a board zoom gives
  `release()` with `armed()` true and the element in the layer, then the flag, then the element
  back in the node without inline styles; one `destroy()` and no element after a removed node,
  a destroyed board and a late editor, with no `release()` for a preview; a node removed while
  armed (by the person, by a peer, by an import) and a board destroyed while armed: `release()`
  with `armed()` true and the element in the layer, then `destroy()`, the armed id null, the
  Done control off, and an undo that brings the node back as a preview; `relocate` as one amend
  (one `onContentChanged`, the undo stack unchanged, an undo that takes back the gesture before
  it and leaves the new path), ignored after the unmount; the four failure looks (`open`
  answers or resolves to `undefined`, rejects, throws).
- `hostile-host.browser.test.tsx`: host code that goes wrong. A list that is a new array on
  every call and a `list()` that throws, for references and for models; a `describe()` that
  throws, and the empty path it is never asked for; an editor whose `destroy()` throws (node
  removed, path change while armed, board destroyed, an editor that arrives late), whose
  `release()` throws (a zoom, Done, the armed node removed) or whose `focus()` throws; an
  `onArmedChange` listener that throws; seven answers of `open` that are no editor; peers
  without a `user` and a peer list that is no array. Each case checks that the canvas, the
  toolbar and the other nodes stand and what the board's log or `console.error` says. The file
  registers no window error listener: Vitest counts an unhandled error of the page against the
  run, and that count is part of the check.
- `nodes.browser.test.tsx`: a model node's header from the host's `describe` and from the file
  name, `inert` and the four classes, the two error texts; an image from the host's bytes and
  its changes; a note's Markdown, what it never draws (raw HTML, a script, a picture), its
  editor (one write per commit, none for an unchanged text, none over a peer's change), its
  toolbar and its resize; a group's name, its zoom variable and its resize with its members;
  an arrow's label; `arrow-shape.ts`.
- `conformance.browser.test.ts`: the contract's kit (below).
- `contract-edges.browser.test.ts`: the edges of the contract no hook of the kit drives. A move
  by the arrow keys (written once the keys rest as one change; given up by an import inside its
  rest, also by one of the same text; kept by a refused import; written for a node whose id is
  `__proto__`; written by a destroy, with no listener called and with a host's observer that
  throws). The change event (a foreign transaction and a gesture afterwards, without
  `liveDocument`; an amend; a listener unsubscribed inside a delivery). An import and the
  canvas it waits for (it resolves only once the canvas exists; a destroy ends the wait; a free
  area that throws). The view the person moved by hand (a revealed element is looked for in the
  canvas's live view; `getViewState()` after `destroy()`).
- `embedded-model.browser.test.ts`: the two checks designIQ's kit page ran beyond the kit (one
  editor of the host in the model node; a double-click arms it at board zoom exactly 1 in the
  overlay layer, and a zoom of the board makes it a preview again), and what an import does to
  a model that is edited in place: no fit and no word to the editor while it is armed, a fit as
  usual when the import took it away, and no fit while the board moves to arm it, which ends
  armed at zoom 1.
- `live-document.browser.test.ts`: the option `liveDocument`. A document that is empty at the
  attach is fitted once when a peer gives it its first node, also when that happens before the
  canvas is there; not for a host that fits itself, set a view or imported meanwhile; not for a
  first node of this board's own gesture.
- `styles.browser.test.ts`: static markup after the DOM contract with only the sheet imported,
  on a bare page and on a page with `html { font: 13px/1.2 serif }`. The header of a model node
  is 32 px and the body the node minus it; a padded box keeps its set size (a failed
  `.board-engine`, a note's editor, a slot); nothing below `.board-engine` is reset; the base
  stays under React Flow's sheet; eighteen values of the light picture, among them the fill,
  border and text of both Done buttons; under `data-cd-theme="dark"`, on `<html>` and on the
  element the board stands in, the two Done buttons keep the fixed blue under white while the
  ring of the armed node and the dot of a handle follow the role; with `data-cd-theme="light"`
  on the board's element on a dark page all eighteen hold; the breakpoint in the desktop window
  the tests run in (Done 200 px, a notice up to 560 px) and in a frame narrowed to 414 px and
  to 760 px (Done 130 px, a notice 60 % of the window); and under an emulated
  `prefers-reduced-motion` the board's elements are stilled and a host's editor is not. It
  imports no component, so it waits for nothing.

## Without a test

By a reading of the test files: the group that takes a dragged node or lets it go; an arrow dropped
on a node's body (`sideOf`); the grips of a selected arrow; an image dropped beside the board and
the 200 ms rest of the drop hint; a file that cannot be read as an image, and the notices list (its
last three, their timed end); the resize of a model and of an image node; the toolbar's buttons for
the zoom, the fit and a group; `pointerleave` on the presence layer; `data-board-view` in its steps
"mid" and "far" and `--board-zoom` on the two edge layers. Each can be driven with synthetic events,
as `canvas-behaviour.browser.test.tsx` drives a drag and an arrow.

No test can fail when a preview takes real input or when the pointer math of an armed editor is
off: a synthetic event ignores `inert`, and every editor in these tests is the recording stand-in
of `createTestHost`. The modeler's `CLAUDE.md` says what a review measured with real editors.

What `canvas.browser.test.tsx` cannot see of the code that was cut out of `Canvas`, by 32 single
edits of `board.tsx`, `click-ownership.ts` and `canvas-keys.ts` (it notices 24): the moving guard
of `useCanvasKeys` by itself (`zoom-guards.ts` stops a key of a moving board in the capture phase
first; a test fails only when both are gone), `flushSync` of a resize tick, the `inArmedEditor`
guard of the double-click (under the overlay strategy an armed node that is asked again changes
nothing), and two pairs of statements that cover for each other (the press and the click both set
`multiSelectionActive`; a click in the editor is told by its target and by its press).

## Support

- `support/board-texts.ts`: the texts designIQ's bench measured the board with, byte for byte,
  never edited by hand. `BOARD_PROTO` alone is the suite's own: the shape of board A with the
  value `__proto__` as the group's name, as a note's whole text and as the arrow's label, in
  canonical form, for the kit's `canonicalTexts`.
- `support/test-host.ts`: `createTestHost`, a host in memory whose editors record `open`,
  `armed`, `release`, `focus` and `destroy`. Its seed options `storing` ("sync", "manual" with
  `settleStore(path, error?)`, "throw", "reject") and `taken` (paths in use that `read()` has no
  bytes for) make its image port a slow, a refusing or a lazily loading host's, and it records
  `stored` (what it holds), `storeCalls` (every call of `store`) and `asked` (every `read` and
  `taken`, in order).
- `support/mount-board.ts`: `mountBoard(text, options)`, a board through the entry, in the kit's
  800 x 600 host element.
- `support/pointer.ts`: `click`, `doubleClick`, `key`.
- `support/arming-scenarios.ts`: the bench of the arming test, its scenarios and `traceText`,
  which writes the fixture's text.

## The arming traces

`browser/fixtures/arming-traces.json` was recorded from `createBoardArming` while it was still one
function, and the split was accepted because the six parts give the same bytes.
`arming.browser.test.ts` imports the file and compares it itself: no run writes it, not with `-u`
either, and without the file the import fails and with it the whole test file. A wanted change of
the rules is recorded anew on purpose, with a scratch test beside `arming.browser.test.ts` that is
never committed: it runs `runScenario` over `SCENARIOS` and ends with
`commands.writeFile(path, traceText(traces))` (`commands` of `vitest/browser`; the path is
`packages/renderer/test/browser/fixtures/arming-traces.json`, relative to the directory of the
Vitest config), and the pull request says which traces moved and why. Three traces were recorded
anew after the move, because their scripts passed with what their names claim removed: "beforeZoom
with a press held in the armed editor: refused until the release", "a zoom tick not seen coming
under lock: undone inside the tick" and "the URL's arm waits for the first fit and for the editor,
then goes through the rule". The repaired scripts gave the same bytes on the one function and on the
six parts, and the other 70 traces are the bytes of the move. The fixture holds no list of plain
values, so `JSON.stringify` writes what Prettier accepts; keep it so.

The traces do not hold everything a caller can see. A review made 139 single edits of the parts:
102 fail the test, 37 pass. Among those that pass: `record.measuredMs` removed (the bench zeroes
the field); `askedMs` and `ease` read anew in every frame of a move (no scenario changes a token
during a move); `state.home = null` for a node that is gone; a modifier or `select` taken out of
what the key guard leaves alone; the live records handed out in place of copies; either half of
the selector of a node that is still armed, which the control test in `arming.browser.test.ts`
checks alone (a runtime that shows a disarm late); `!measured` in `tryUrl` (`viewport-watch.ts`),
which needs a scenario of its own and a bench step that measures a node late. No scenario reaches
the guards against a React Flow store that is not ready (`panZoom` or `domNode` null, a node
missing from the lookup, a box of height 0), the step of a move that is no longer the current
one, or `state.boardElement = null` in the undo of `attach`: read them as defensive.

## The conformance harness

`browser/conformance.browser.test.ts` binds the contract's kit twice: on a board with a document
of its own, and on a board on a live document of the host that a second document mirrors as a
sync provider would (after each case the mirror must hold the same text). Each block has 36 cases
and its own pinned skips, today the same seven. Which cases are pinned, what each waits for and
the rule the list stands under are in the modeler's `CLAUDE.md` (Tests): the board deviates there
from the suite's rule of zero skips.

- A skip is pinned with the reason the kit gives, word for word: a case that newly leaves a part
  unverified changes its reason and not its name, and fails. A skip that is not on the list
  throws, a listed case that stops skipping fails in `afterAll` until its name is removed, and an
  advisory throws. The list is compared whole, so a run of some cases only (`-t`) fails at its
  end.
- Vitest counts all 36 cases of a block as passed. Of them 28 verify something, seven report
  through `onSkip`, and one has nothing to verify: the board has no setting outside its elements,
  so `configMutations` is empty and the kit's case for it loops over nothing.
- `mutate` and `moveElement` are calls on the store (`addNode`, `writeDrop`): the kit proves the
  document and the change event with them, not that the toolbar or a drag reaches the store.
  `canvas-behaviour.browser.test.tsx` holds that.
- The drop case runs alone in the file's third block, through `conformanceCases()`, with a
  `startGesture` that holds a real drag of a node for "move" only (no skip, no advisory). It
  stays on the pinned list because the kit has one `startGesture` for three cases, and a hook
  that holds a move would switch on the other two, which the board does not meet. That block
  imports `canonicalTexts[0]` and `[1]` and drags a note of board A: keep `BOARD_A` first and
  `BOARD_B` second.
- `settle` stays the kit's one macrotask for the registered kit: the one input the board writes
  later than it happens is an arrow-key move on a focused node, and the kit presses its arrow
  keys on the pane. The standalone drop case has a settle of two frames and 30 ms (the
  ResizeObserver note below says why). The harness waits 10 s for a lazily loaded part, as
  `mountBoard` does.
- `startPan` is a pan as a person makes it: a press on a bare point of the pane, held and moved
  40 px at a time, every event with `view: window`. d3-zoom (3.0.1 here), which React Flow pans
  with, re-anchors a held pan when the view is set by a call, so the pan runs on from the view an
  import or the host left.
- The merge kit is not registered: the board has no text merge. Left unfilled, because the board
  lacks what they drive: `createReadonly`, `startGesture`, `armTool` and `exportImage`.

## Notes for whoever writes a browser test

- `mountBoard` resolves once the toolbar, a wrapper per node and every lazily loaded part that
  shows itself loading are in place. It does not wait for what answers later: an editor's `ready`
  (poll `runtime.mounted(nodeId)`), a note's rendered Markdown, the arrows, React Flow's first
  measure of the nodes, and the silent slots (below).
- Without it: `attachTo(element)` wants an element that is in the document and has a size.
  `modeler.board.mounted` resolves once React Flow's viewport exists and never rejects;
  `importText` called after `attachTo` waits for it (10 s at most) and then one macrotask. Neither
  waits for the lazy parts.
- `exportText()` is canonical, so only a text in canonical form comes back byte for byte.
- Every synthetic `MouseEvent` needs `view: window`: d3-zoom and d3-drag, which React Flow pans,
  zooms and drags with, bind their move and release listeners on `event.view`. A click needs its
  press before it: the board asks where a click began. `pointer.ts` does both. It has no press
  without its click: the tail of a drag (a press on one element, a click on another) is
  dispatched by hand in `canvas.browser.test.tsx`.
- An arrow is drawn only between measured nodes and loads silently: poll for it. React Flow
  measures a node a frame after its wrapper mounts, and its resizer starts from `measured`, from
  0 before the measure, so a synthetic resize that starts too early writes a negative size into
  the file. Before a resize, wait for an arrow of the board. A
  synthetic resize is a `mousedown` on `.react-flow__resize-control.handle.<side>` and a
  `mousemove` and `mouseup` on `window`.
- An arrow is drawn by a `mousedown` on a `.react-flow__handle-<side>` and `mousemove` and
  `mouseup` on `document` (React Flow binds them there, not on `window`); the last move has to be
  over the target handle, which React Flow finds with `elementFromPoint`.
- A box selection by synthetic events: a `keydown` of Shift on `window` and one `settle()`; then
  `pointerdown`, two `pointermove` and `pointerup` on the pane with `isPrimary: true`,
  `pointerId: 1` and the client point, with a `settle()` after each event (React Flow's pane
  reads what it rendered last, and two events in one task leave a node that was selected before
  unselected); then the `click` on the pane that a browser sends after the release, without which
  React Flow swallows the next click on the pane; then the `keyup`. The rectangle
  (`.react-flow__nodesselection-rect`) lies in the pane and takes the focus. Keep the pointer
  40 px away from the board's edges, where React Flow pans.
- A dragged or dropped file is a `DragEvent` (`dragover`, `drop`) whose `dataTransfer` is a
  `DataTransfer` with a `File` added. A `DataTransfer` made by a script keeps no `dropEffect`: to
  see what the board writes, define the property on the instance and record the writes. To wait
  as long as the board needs to read a picture's size, decode the same bytes in the test and then
  wait a little; a test that expects nothing to happen cannot poll for it.
- A synthetic key on a focused node is committed by React in a microtask, not before
  `dispatchEvent` returns: await one microtask and then read the wrapper's transform. No timer
  runs before a microtask, so whatever the test does next still falls inside the 400 ms rest of
  the move; a poll may not.
- A silent slot shows no `.board-slot` while it loads, so `mountBoard` does not wait for the board
  gestures or the presence layer. Wait for what they write: `data-board-view` on `.react-flow`
  (the gestures' listeners are on), `.board-presence` and then `settle()` (the presence layer
  listens). That a lazily loaded part draws nothing shows only after another board has loaded it.
- `elements.reveal(id)` selects through React Flow's change path and is in React Flow's store a
  commit later: before a key that acts on the selection, poll for the wrapper's class `selected`.
  The delete key asks `onBeforeDelete` first, so the document changes a task later: poll
  `exportText()`. Undo and redo by key are synchronous.
- `element.blur()` fires React's `onBlur` in the test page, so a note's and a label's commit need
  no real focus change. A choice in the model picker is `select.value = path` and a bubbling
  `change` event; a picked image is `input.files = dataTransfer.files` and a bubbling `change`;
  a paste is a `ClipboardEvent` whose `clipboardData` is a `DataTransfer`.
- Module-level state is one per page and so one per test file. The notices: dismiss them in
  `afterEach`, or the next board's toolbar shows them. The place of the node added last
  (`gestures/placement.ts`): a test of where a new node lands sets a view of its own first
  (`setViewState` to a view no other test of the file adds a node from), or the step count goes
  on where an earlier test left it.
- The board's move to an armed node takes the page's `--cd-motion-base`.
  `document.documentElement.style.setProperty("--cd-motion-base", "0ms")` makes the move one
  viewport write inside the call that arms, so what the board shows can be read with no await
  after the click; a long value (`3s`) keeps the board moving while a test acts, and Escape on
  the pane ends the move. Remove the property in `afterEach`.
- A host for a test keeps its parts the same objects, or React subscribes anew on every render. Its
  lists may be new arrays: the default ports keep them steady. `images.read()` still has to answer
  the same Blob for a path until `onChange`. A throw the board contained is a line in
  `runtime.lines`, so a test that expects the log to be empty notices one.
- `vi.mock` works in the browser project. To see that an assertion can fail without editing a
  source file, replace one module for your own test file: a factory that spreads
  `importOriginal()`, or one that holds the module's own text with one statement changed. For a
  lazily loaded part that throws, wrap the component and throw only while a `vi.hoisted` flag is
  set, so the other tests of the file get the part as it is. React reports the error it hands to
  the boundary through `console.error`.
- Do not add a window `error` or `unhandledrejection` listener in a browser test: while one is
  registered, Vitest stops counting real unhandled errors of that page.
- The window is 1280 x 800. A test of the narrow branch of the sheet narrows the frame with
  `page.viewport(width, height)` of `vitest/browser` and sets it back in `afterEach`.
- `optimizeDeps.include` in `vitest.config.ts` names the twelve dependencies that are pre-bundled
  up front. If a run prints "optimized dependencies changed. reloading", add the dependency there.
- Chromium may log "ResizeObserver loop completed with undelivered notifications" as a window
  error while the kit runs. It failed no test: Vitest prints a window error that carries no error
  object (with the verbose reporter) and does not count it. Measured with that reporter: on the
  code of the move in 1 of 12 runs with the kit bound once and in 3 of 6 with the kit bound
  twice; in the drop case alone in about half of the runs, where the line follows
  `elements.reveal()` of the group of board A (10 of 12 runs, 0 of 12 when the reveal is not
  passed on). `canvas/board.tsx` says what the board does against the line for a resize. Several
  of the kit's cases reveal and then listen for window errors, right after their `settle`, and
  report one as an advisory, which fails the run here; the standalone drop case therefore has a
  settle of two frames and 30 ms. If Vitest ever counts the line as an unhandled error, or it
  shows as an advisory, filter exactly that message or record the flicker here; never answer it
  with a longer skip list.
