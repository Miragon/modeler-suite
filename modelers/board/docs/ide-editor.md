# The board inside the shell

A part of the board's guide, moved here from [`CLAUDE.md`](../CLAUDE.md) as it was written. That
file keeps what every change needs and names
[every part's document](../CLAUDE.md#the-parts-and-their-documents).
What is found out or changed in `apps/ide-editor`, and about the three deviations under the shell,
is written here.

## The board inside the shell (`apps/ide-editor`)

`mountBoardEditor(host, { root?, files?, editors, containHistoryKeys, invalidText?, fileKeys?, pictures? })`
(`src/board-editor.ts`) is for the board what the shell's `mountIdeEditor` is for a modeler on
diagram-js, without its diagram-js lines. `host` is a `BoardEditorHost`,
`Pick<IdeEditorHost, "canvasOwnsHistory" | "mountShell" | "connectDocument">` with an optional
`state`, the place the host keeps the board's view in (`KeptState`: the `read` and `write` of the
shell's `IdeEditorState`). The shell's `IdeEditorHost` fits (`vsCodeEditorHost()` in the webview,
whose `state` is the webview's), and a web app brings the members itself, with a `mountShell`
that adds the shell's web column
([The web app](webapp.md#the-web-app-and-the-example-appswebapp-example-e2e)). `invalidText` is the host's
own line for a model its editor refuses (absent: the host package's, which sends a person to the
file's editor). `fileKeys: true` lists a web app's two file keys in the shortcuts dialog, in a
group File before the board's own (`boardShortcuts(chrome, { fileKeys, pictures })`;
`BOARD_EXPORT_LABEL` is "Export as .board"). `pictures` says how a picture gets onto this board
beside the Image button, for the same dialog (below). It
mounts the shell through `host.mountShell` into `root` (default: the element with the id `app`)
with the themes `["light"]`, a Help entry "Keyboard shortcuts…" (`shortcuts.ts`: the board's own
keys and gestures; the shell adds its zoom and fit keys itself) and the empty-file hint "Add a
note, a group or a model from the toolbar to start.", which shows while an accepted board has no
node. With `files` it builds `createFilesHost({ files, editors, containHistoryKeys })` and calls
the host package's `followMoves(modeler, files)` for the image nodes; without, the board is one of
notes, groups and arrows. The board is
`createCollaborativeModeler({ host, undoRedoKeys: host.canvasOwnsHistory, fitOnImport: false, freeArea })`,
attached to `shell.canvas`. Then `host.connectDocument`: every change of the board is `pushEdit`,
`exportText` is the board's canonical text, and the host is offered the command `fitView`. The
shell and the board exist before anything is awaited, so a page without a host that answers shows
an empty board. It resolves to `{ shell, modeler, document, ready, destroy() }`; `ready` settles
with the first text, imported or refused. The editors of the model nodes come in as a parameter: no
source of the workspace imports `apps/editors` or another modeler.

- **A text the board shows is not imported.** After a first accepted text, a text equal to
  `modeler.exportText()` is taken as accepted without an import. An accepted import gives up a move
  by the arrow keys that still rests, and a host's echo of an edit is such a text.
- **The zoom target (`zoom-target.ts`).** The shell's zoom panel and its four keys act on the board
  through an adapter on the board's public calls alone: `getViewState`, `setViewState` and
  `contentBounds`. A step is one step on the shell's raster (the raster of diagram-js's ZoomScroll,
  laid through 100 %: 20, 30, 41, 55, 74, 100, 135, 182, 246, 331, 400 %) around the middle of the
  slot, and never a step out below 20 %, which would zoom in. The fit is the shell's `fitViewbox`:
  the content in the middle of the slot minus `shell.fitInsets()`, the insets the only margin, at
  most at 100 % and never below the board's own 10 %. It is a jump, as the board's own Fit button
  is. `focus()` goes to `.react-flow__pane`; the shell's own search for a canvas would find the svg
  of a model's editor. `BOARD_MIN_ZOOM` repeats the renderer's lower limit, which the entry does
  not export, and a browser test holds the two equal.
- **A step of the shell's zoom ends an editing.** The adapter sets a view like any host, so the arm
  rules take a step for a zoom nobody saw coming: a click on the zoom panel while a model is armed
  releases its editor, as a zoom of the board does (held by a test for zoom-out). The contract
  recommends that a host's view change leaves an interaction open; the cure is a change of the
  renderer.
- **The first view (`first-fit.ts`).** The board is created with `fitOnImport: false`, because its
  own fit is not capped at 100 % and is made at the import, into whatever box the board has then.
  The app sets the view once, to the view the host kept where that still shows the board (the
  next item) and to the shell's fit otherwise: in the animation frame after the first text the
  board accepts, also when a text before it was refused, and, where the slot has no size in that
  frame, as soon as a ResizeObserver on the slot reports one, with the content the board holds at
  that moment. The
  frame is there because of what VS Code does with a webview whose tab is covered (seen in a real
  one, [Taken for granted about VS Code](vscode.md#taken-for-granted-about-vs-code), 23 and 24): in 1.146
  its page is 300 x 150 while a text editor is in front of it, which is a size like any other to
  whoever asks, and the page is told nothing else. A board whose first valid text arrived then (a
  broken file, repaired in the editor of the same file) was fitted into that box and sat tiny in a
  corner when shown. A covered page gets no frame there, so the fit now waits until the board is
  seen. A board that is empty at its first accepted text gets no fit and no kept view, and nothing
  is fitted afterwards: every later view is the person's, and an update keeps it. `createFirstFit`
  takes its options as one object (`kept`, `shown`, and for a test `watchSize` and `nextFrame`);
  `shown` is called once, when the first view stands. A test that acts in the task its mount ends
  in acts on the view from before the fit: the browser file's mount waits one frame.
- **The view the host keeps (`kept-view.ts`).** The board file holds no view, so where a person
  looked last is the host's to keep, between two lives of the page: `host.state`, read and
  written under the one key `boardView` (`BOARD_VIEW_KEY`) as `{ x, y, zoom }`, the board's own
  view state. A host keeps one place per document. In VS Code the place is the webview's state,
  beside the shell's own key and whatever else is there; in the web app it is the browser's
  storage ([The web app](webapp.md#the-web-app-and-the-example-appswebapp-example-e2e)); a host
  without `state` gets the fit at every mount.
  - **Restored when it still makes sense, which is decided by what a person would see.** The
    editor cannot know which text a kept view was a view of: a file changes while its page is
    away (a checkout, an edit in a text editor). So the rule is `showsContent`, asked of every
    node: the kept view is restored when it shows at least 48 px (`IN_SIGHT_PX`) of the box of
    one of the board's nodes in each direction, inside the part of the slot the shell's insets
    leave free; a node that is smaller than that on screen has to be in sight whole. Otherwise
    the board is fitted, because an empty canvas reads as an empty board. Not a view at all, and so answered with the fit:
    nothing kept, a value of another shape, a number that is not finite, and a zoom outside the
    board's 10 % to 400 % (`BOARD_MIN_ZOOM`, `BOARD_MAX_ZOOM`), which the board would take for
    the nearer end. An empty board has no content to show and gets neither. A kept view that is
    not restored stays where it is kept until the person moves the view. The rule looks at
    each node's own box (`boxes` of `createFirstFit`, which the editor fills from the board's
    snapshot with `absoluteBoxes`) and not at the box around all of them. Until the closing
    round of the fourth increment it looked at that one box, and a review showed what that
    costs: with the board file changed from outside so that its nodes lay 30,000 px out on both
    sides, a reloaded webview in a real VS Code came back to the kept view to the pixel, with
    none of six nodes in sight and no hint. A view a person parked in the empty space between
    nodes is therefore not restored either: the board is fitted. That is a view a person left
    themselves, as the shell's 100 % on a board of two far notes gives one, and the web app's
    browser file holds it as the price of the rule. An arrow alone is no node. A
    host that hands `createFirstFit` no `boxes` is judged by the box around all content, as
    before. **Not cured:** the fit itself shows nothing where the content is too large for the
    board's smallest zoom and its middle is empty (nodes more than about 12,000 px apart in a
    window of 1280 px): `fittedView` centres the box and cuts its ends. Seen in the runner with
    that review's board; the cure is a fit that falls back to the node nearest the middle, in
    `zoom-target.ts`, for the first view and for the Fit control alike.
  - **Written rarely, and never while nothing changed** (`keepView`). The view is polled
    (`view-events.ts`; the one watch serves the zoom panel and the keeper), so the keeper waits
    until the view rested for 250 ms (`VIEW_REST_MS`, the shell's own delay for a diagram-js
    view) and then writes once, and only a view that differs from the one it kept or restored
    last: a pan of sixty frames is one write, and a view that came back to the kept one is none.
    The first view is the app's own and is never written, so a board nobody moved keeps
    nothing. The keeper starts when the first view stands (`shown`), not before: a hidden slot
    and a refused first text write nothing. `destroy()` writes the view the board has at that
    moment, before the board goes, also where the watch had not looked at it yet. VS Code never
    calls `destroy()`: there the rest is the only write, so a view changed in the last quarter
    second before a reload is not kept.
  - **Not held by a test:** that the keeper is stopped before the board is destroyed and not
    after. The board answers its last view right after `destroy()`
    ([Deferred](../CLAUDE.md#deferred)), so the edit that moves the stop behind it passes.
- **A picture's file that moves.** A model node follows its file through its own editor (the
  host package's `openEditor`). An image node has no editor, so the app calls the host package's
  `followMoves(modeler, files)` where it makes the board, and calls what that returns before it
  destroys the board: the node's new path is an amend of the board, so one edit of one line of
  the board file and nothing on the history
  ([The host package](host.md#the-host-package-packageshost)). While the board is locked, by a
  refused text or a read-only document, the amend still changes the canvas and is not written:
  the next accepted text brings the old path back, and the node then says that its file is gone.
  Not cured: the cure is to tell the move again when the lock ends, and the text of a locked
  board is being repaired by a person.
- **A dropped and a pasted picture in the shortcuts dialog (`shortcuts.ts`).** The renderer
  takes a pasted and a dropped picture itself and says so nowhere but in its hint while a file
  is held over it. `pictures` adds one row to the board's group, "Add a picture": the paste key
  and `Drop` for `"drop"` (a browser hands the page every dropped file), the paste key and
  `Shift+drop` (on a Mac `⇧ drop`) for `"shift-drop"`, where the host takes a dragged file for
  itself unless Shift is held, as VS Code does
  ([The webview half](vscode.md#the-webview-half-srcwebview)). Absent, the dialog has no such
  row: a host says it only for a board that keeps pictures.
- **An invalid board file (`invalid.ts`).** When the board refuses a text, `importText` answers
  false to the document sync and the app locks: `shell.canvas.inert = true` at once (the whole
  slot, the board's toolbar and an armed editor with it, takes neither pointer nor key and loses
  the focus), `shell.setReadOnly(true)` and the status box after the shell's
  `INVALID_STATUS_DELAY_MS`, so that typing in a text editor beside the board does not flicker. The
  status reads "This file isn't a valid board right now. The board shows the last valid version and
  is read-only until you fix the text." followed by the reader's reason as a sentence, such as
  "Line 4 is no JSON."; the reason is `parseBoardText`'s. While locked `canWrite` is false, so no
  change of the board is written over the text somebody repairs, and the empty-file hint is off.
  The canvas keeps the last valid version; the shell's zoom panel and keys still move it, a pan
  does not (an inert slot takes no wheel). The next accepted text unlocks. A document the host
  opened read only (`IdeDocument.readOnly`) is locked the same way for its whole life, without a
  status. The lock writes the slot's `inert` only when its own state changes: behind a web app's
  start screen the slot is inert by the shell, and a text the board accepts there must not open
  it. A lock that keeps the board readable by pointer is a change of the renderer.
- **The sheet `board-ide-editor/app.css`** has three rules under `.cd-shell .board-root` for every
  host and two more for the shell's web column, and it may hold no more: every other look of the
  board is the renderer's. `.board-toolbar` gets
  `margin-left: var(--cd-shell-frei)`: the toolbar starts where the shell's top row is free of the
  menu trigger, at 64 px. `.board-toolbar__group[aria-label="Zoom"]` gets `display: none`: one zoom
  control, the shell's. `.react-flow__attribution` is put at `right: var(--cd-shell-rand)` and at a
  `bottom` of the shell's margin, row and gap (`--cd-shell-rand`, `--cd-shell-zeile`,
  `--cd-shell-luecke`): React Flow's attribution stays in sight, above the zoom panel whose corner
  it would share. The rules read the shell's size tokens and win by weight, wherever a bundle puts
  the sheet; load it after the shell's sheet and the board's. The toolbar's top edge stays at React
  Flow's 15 px, 3 px below the shell's trigger at 12 px. The [DOM contract](../CLAUDE.md#dom-contract) has what
  a host may put on the toolbar. The two rules for the web column: under
  `[data-cd-shell-host="web"][data-zoom-row="raised"]` React Flow's attribution stands above the
  zoom panel that a narrow page raised over the legal line (the shell's margin, the legal line's
  height, a gap, a row, a gap); under `[data-cd-shell-host="web"][data-empty-state="shown"]` the
  board's toolbar and the word a part shows while it loads (`.board-slot`) are
  `visibility: hidden`, their room kept, since the start screen shows its card and the legal line
  alone and the card is glass.
- **What is polled, and why (`view-events.ts`).** The board reports its content and never its view,
  and a wheel on the pane, a pan and the move to a model that is armed happen inside it, while the
  shell's readout has to follow. So the app reads `getViewState()` once per animation frame and
  tells the zoom panel when x, y or the zoom changed. It reads only while the zoom target has a
  listener and the page is visible (`visibilitychange`), asks for no frame otherwise, and sees a
  change made while the page was hidden with the first frame after it is back. The app's own steps
  tell the panel at once. In VS Code the page of a hidden tab never says that it is hidden: its
  visibility state stays `visible`. The poll rests there only where VS Code gives a hidden page
  no frames, which 1.146 does and 1.96 does not for a board behind another webview
  ([Taken for granted about VS Code](vscode.md#taken-for-granted-about-vs-code), 24). A board that has
  `board.onViewChanged` is listened to and never looked at: the module feature-detects the member,
  so that renderer change, which waits for its owner's yes, needs no edit here.
- **The teardown.** `destroy()` returns a promise. It disconnects the document, destroys the board,
  and only a microtask later, behind the one in which the board unmounts its canvas and with it
  every model's editor, disposes the host built from the files and destroys the shell. An editor
  may write while it goes (a label that commits on the blur), so what it writes through is still
  there until then. The files port stays its owner's: it is disposed once the promise resolved. The
  board has no end signal, so the microtask is the one thing this rests on, and a test holds the
  order through a port that writes down its ends (`text.close`, `bytes.off`, `dispose`).
- **Known and not cured.** A step of the shell's zoom that leaves a model armed (a fit that only
  pans) hands the focus to the pane, and the editor has the keys again after a click in it (by
  reading). The editor itself has no export entry (the web app adds its own), and the problems
  pill gets a count only where the host posts one: the extension's registration does since the
  fourth increment ([The host half](vscode.md#the-host-half)), and the web app posts none. What
  was found in the shell and in the renderer under it (the islands over an armed
  editor's popup, the focus fallback, the three pixels between trigger and toolbar) is under
  [Deferred](increments.md#found-while-the-increments-were-built-and-not-changed).
- **The toolbar and the status box in a narrow window** (measured by a review on the webview test
  page, in windows of 480 to 1280 px). The toolbar starts at 64 px. It is 591 px wide in a window
  of 900 px and more, where the Done control has 200 px, and 521 px in one of 760 px and less,
  where it has 130 px: the board's breakpoint reads the window. It is one row down to a window of
  600 px and two rows below that, which end 95 px from the top. The shell's top inset of 88 px,
  which the first fit and the fit button use, is clear of one row only. The status box lies over
  neither row: it stands at 63 px in a window of 900 px and more, under the one row that ends at
  55 px, and at 115 px in one of 760 px and less. Below 480 px the toolbar has a third row, which
  the status box lies over: measured in the web app at 400 px, the box at 116 to 181 px and the
  row down to 135 px, while a lasting line shows; by reading, the same for an invalid board file
  in an editor that narrow. The cure is the renderer's (how the toolbar wraps) or the shell's
  (where the box stands).
- **An armed model in a narrow editor.** A model is edited at 100 % and at its node's size: the
  arm rules move the board there. In an editor that is narrower than the node a part of the
  model's editor is outside the window, and a pan or a zoom of the board ends the editing, so
  that part is out of reach. Measured by the same review with the example's nodes of 800 px: in
  a window of 600 x 800 the armed editor starts at x -224, with the first entries of the
  notation's palette and the map's left axis outside; at 900 x 600 the armed node's title row
  lies under the board's toolbar and its bottom right corner under the shell's zoom panel; at
  1280 x 800 it fits. A board beside a text editor in VS Code has about 460 to 600 px. The cure
  is the renderer's: to arm at the largest zoom at which the node fits the slot inside the
  host's insets, or to let the board pan while a model is armed. The extension's README says it.
- **The keys after a broken text is repaired under an armed model.** The lock's `inert` takes the
  focus from the armed editor, and the unlock does not hand it back: the model is still armed
  and its selection is there, but the Delete key does nothing until a click in the editor (seen
  by the review on the test page). Not cured, on purpose: the cure is a `focus()` call from the
  page when the lock ends, and the usual repair is typed in a text editor beside the board. By
  the focus rules of a nested frame, and not tried in a real VS Code, such a call can take the
  keys from the person who types. A cure has to hold first that the board's own page has the
  focus when the lock ends (`document.hasFocus()`).
- **Tried against the tests:** 34 single edits of the sources, applied in memory by a plugin in a
  scratch config, each fail the browser file; three controls pass. With the fourth increment, the
  same way and with Vitest's module cache off (`fsModuleCache: false`: the cache is keyed by a
  file's own text, so it hands the last run's edit to the next): 25 single edits of
  `kept-view.ts`, `first-fit.ts` and `shortcuts.ts` each fail a unit test and two controls pass;
  of 9 edits of `board-editor.ts` and `kept-view.ts` under the browser file 8 fail it, and the
  ninth is the one named above, the keeper stopped behind the board. For the closing round,
  three single edits, each made in the file and taken back: every node asked to be in sight
  and the box around all content always (each fails a unit test), and the editor handing no
  boxes, which fails the e2e test of a kept view between the nodes
  (`e2e/tests/vscode/view.spec.ts`) and no unit or browser test.

### Three deviations under the shell, each with an end

The suite's rule (the root guide, Boundaries, and the root `CONTRIBUTING.md`): the chrome of both
apps is the shell's, both e2e projects run the shell's conformance kit, and the smoke in a real VS
Code runs every step of the shell's driver. The board deviates in three places.
Each is a deviation with an end and not a new rule, as the contract kit's pinned skips are
([Tests](../CLAUDE.md#tests)): none may grow, and none is a pattern for another modeler. No job of CI holds any
of the three rules, so nothing fails for them; the lead of the third increment decided them (M1
under [The third increment of the apps against its plan](increments.md#the-third-increment-of-the-apps-against-its-plan)),
and the owner may turn the decision round.

- **The board keeps a toolbar of its own** (Done, Text, Image, Group, the model picker, delete, the
  notices) beside the shell's menu, zoom panel, status box and, in the web app, legal line and
  start screen. The toolbar is part of the moved canvas, inside React Flow's panel, and the
  renderer has no surface through which a host's chrome could drive its actions, and no way to
  switch the toolbar off ([Deferred](../CLAUDE.md#deferred)). The five rules of `board-ide-editor/app.css` make
  one picture of the two, and the board's own zoom buttons are hidden for the shell's.
- **The e2e projects `webapp` and `vscode-webview` run the board's own specs** and not the shell's
  conformance kit (`registerShellConformance`). The kit's cases and facts address a diagram-js
  canvas (ten files of `packages/shell/src/testing` name its DOM), and on a board the first
  diagram-js canvas of the page is the inert preview of a model. What the board's specs hold
  instead is listed under [Tests](e2e.md#tests-of-this-part).
- **The smoke runs without the driver's steps `keys`, `history` and `workbench`**, each off with
  its sentence in the test ([The smoke in a real VS Code](vscode.md#the-smoke-in-a-real-vs-code-test-smoke)):
  the three steps read the selection and the view of a diagram-js canvas. Its themes step runs: it
  switches VS Code through the four default themes and expects the board's one light picture under
  each (`themes: ["light"]`).

**The end** is one change, the plan's increment 6, a pull request of its own because it changes
`packages/shell` and moves arming traces. In the renderer: the toolbar's actions, state and notices
as commands and events with a switch for the toolbar itself, view commands that ask the arm rules,
a read-only lock, themes and the `appearance` surface. In the shell: a canvas abstraction in
`src/testing` and in the driver's steps `keys`, `history` and `workbench`. Then both apps hand the
chrome to the shell, both e2e projects register the kit with a throwing `onSkip`, the smoke runs
with the three steps on, and this section and the rules of `app.css` go.

## Tests of this part

The two projects and their rules are under [Tests](../CLAUDE.md#tests). This part's files:

- `npm run board test`, the unit project:
  - `apps/ide-editor/test` (6 files, 74 tests): `zoom-target` (the shell's raster with 100 % to
    135 % as one step, the fit against the shell's own `fitViewbox`, the smallest zoom, the members
    of the target on a fake board), `first-fit` (once, in the frame after the first text, on a
    page whose frames the test draws; a page that is not painted and has VS Code's stand-in size
    until it is; a slot that gets its size later; an empty board; a wait that is stopped, for the
    frame and for the size; a kept view in the place of the fit, one that is no view, one far
    outside the content, one of another board text, one between two far groups of nodes, one on
    an empty board, one judged by the size the slot gets later; the moment the first view
    stands), `kept-view` (what a host kept read as a view; what a view shows of a box, each way,
    under the insets, at the view's zoom and for a small box; each node asked by its own box;
    the keeper on fake timers: nothing before the first view, never
    the first view, one write for a whole pan, none for a view that came back, one start, the
    write at the stop), `view-events` (one look per frame on a
    page whose frames the test draws, no frame without a listener or while hidden, a board that
    offers the event), `invalid` (the lock's calls on a shell double, the status sentence, an
    inert slot that is not the lock's own left alone) and `shortcuts` (the board's rows, a web
    app's File group, and the row of a pasted and a dropped picture, with and without Shift).
- `npm run board test:browser`, the browser project:
  - `apps/ide-editor/test/browser/board-editor.browser.test.ts` (47 tests): `mountBoardEditor` on
    the shell's real `mountShell` in the IDE column through a host of the test's own
    (`support/ide-host.ts`, whose document keeps the rules of the shell's sync and is driven by the
    test), with real input. The two chromes (no overlap of trigger and toolbar, the Done control at
    the size it has without a shell, one visible zoom control, the attribution, the shortcuts
    dialog from the menu); the first view (the shell's fit, capped, a hidden root, never again);
    the shell's zoom (a real wheel followed by the readout, the four buttons, the four keys,
    `fitView`, the board's lower limit); the document (one edit of one line for Group, Control+Z
    left to the host and taken by the board for a host without a history, the same text not
    imported, the empty-file hint); a refused text (lock, line, no edit, unlock; a refused first
    text; a read-only document); a model of the repository with the suite's Wardley editor from the
    registry (armed by a double-click, a click selects, the undo key contained or not, Done, a zoom
    step that ends the editing, the teardown's order); the mount's refusals and the teardown (no
    class on html, no child in the root, no frame requested afterwards). With the third increment:
    the editor under a web app's host of the test's own (`testWebHost` in `support/ide-host.ts`:
    the web column's start screen and legal line, the two rules of the sheet for it), the file
    keys in the shortcuts dialog and a host's own line for a refused model. With the fourth: the
    view the host keeps (a kept view in the place of the first fit and not written back; one that
    shows nothing of the board, and one that is no view, left for the fit; the first fit not
    kept; a real wheel of twelve ticks kept in fewer than six writes, and a step of the shell's
    zoom in one; the view written when the editor goes, and a second mount on that place back
    where the first was left; a host without a place), a picture whose file moves (the node's new
    path as one edit of one line that no undo takes back, a folder that moves, a move of a file
    no node shows, no listener left after the teardown) and the picture row of the shortcuts
    dialog for a host that says `shift-drop`, `drop` or nothing. The host of these tests keeps
    what the editor writes (`support/ide-host.ts`: `state.values`, `state.writes`). The files of
    every test come from `support/files.ts` alone, which takes pictures as bytes and counts the
    listeners that wait for a move.
