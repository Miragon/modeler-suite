# The board's host package

A part of the board's guide, moved here from [`CLAUDE.md`](../CLAUDE.md) as it was written. That
file keeps what every change needs and names
[every part's document](../CLAUDE.md#the-parts-and-their-documents).
What is found out or changed in `packages/host` is written here.

## The host package (`packages/host`)

`@miragon/board-host` is what a host of a board needs and the renderer does not have: the
adapter under [Real editors, as measured](renderer.md#real-editors-as-measured), built once for every
modeler of the contract. It names no renderer: a modeler comes in through a registry entry, and
everything done to it goes through the contract plus three things the contract has no call for:
a fit in layout px through the diagram's `canvas` service, the focus (`canvas.focus()`), and the
release from the DOM (`releaseDiagramJs`). A modeler without a `diagram` is mounted and bound
all the same and gets no fit and no focus.

With the fourth increment (the lead's N3, N4 and N8, decided by the lead and not by the owner,
who was told and may turn each round): a card for a file no editor covers, a model that keeps
its editor when its file moves, the helper `followMoves` for the image nodes, and words for an
edit that was dropped. Each is a bullet below.

- **The registry (`src/registry.ts`).** An `EditorEntry` is
  `{ notation, kind, suffixes, insets?, load() }`; `load()` yields an `EditorModule`
  `{ create(options), text?(modeler), relayout?(modeler) }`. An entry's code is loaded once,
  however many nodes show the notation, and a failed load is tried again by the next node.
  `notation` is checked against `meta.notation` of the modeler `create` made; another one is a
  failed editor. `insets` is the room of the notation's own palette in the first fit (default
  `EDITOR_INSETS`: 64 px at the top, 24 px at the other sides).
- **The text rules.** `TextRules` is one object per mounted modeler: `exported(reconciled)` is
  the text to write for the canvas as it is, given the text the file has (a notation keeps a
  file's comments and order there); `same(text, reconciled)` says that a text draws what the
  canvas shows, so it is not imported and the editor keeps its history; `imported()` runs after
  an accepted import and before the view is put back. Without `text` the modeler's own export is
  written and two texts are the same when their bytes are. `same` may throw for a text it cannot
  read: that counts as not the same, and the import says what is wrong. `text(modeler)` is
  called once per mounted modeler, `exported` once per change event and only after the first
  text was accepted.
- **The binding (`bindTextSession`).** Imports run one after the other and read the session's text
  when they start, so the canvas always ends on what the file has: a text that waited behind a
  gesture or behind another import is not imported over what this session wrote meanwhile. A
  re-import keeps the view: the view state the contract answers, while the picture is drawn anew
  and its scale may come out rounded (Value Chain's first fit drew 0.759596, the re-import 0.76). A
  change on the canvas is one write, and none when the text did not change, before the first text
  was accepted, while the last text was refused, or into a read-only file. Every write names the
  text of the file it was made from (`session.write(written, base)`): where the file has another
  text by then, the session drops the write, and the import of that text, which waits behind a
  gesture or behind another import, takes the canvas to what the file has. A change from outside
  waits for the end of a gesture the person holds (`interaction`). A host with another kind of
  document passes its own `BindModel` to `embedModeler`; the adapter fits on the first
  `{ kind: "ok" }` such a binding reports. A `BindModel` gets a third argument, `notice`, for
  what a binding says once (`EditorNotice`): `{ kind: "dropped", reason }` for a change of the
  person's that is not in the document, and `{ kind: "edited" }` before every write, which ends
  what was said of an earlier change. The text binding says `dropped` with the reason the
  session gives (`TextSession.onDropped`); a binding of a host's own may leave the argument
  alone. `bindTextSession` answers a `TextBinding`, which has `follow(next)` for a file that
  moves (below).
- **A write that was on its way when the file moved.** A session tells nobody that it took a
  write, and a session the binding left tells it nothing at all. So the binding keeps whether it
  handed a write to its session since the file last told it a text (`unconfirmed`), and takes
  that along when it leaves the session (`leftBehind`). The text of the new path answers it:
  where that text draws what the canvas shows, the write landed and moved with the file, and
  nothing is said or written; where it does not, the binding says `dropped` with `crossed`
  before it imports the file's text, so the person sees their change go and reads why. Before
  the closing round of the fourth increment such an edit went without a word: in a real VS Code
  an edit that reached the extension within about 15 ms of a rename was lost in 3 of 12 tries
  ([the extension's document](vscode.md#the-review-of-the-fourth-increment-in-a-real-vs-code)).
  Two limits. A registry entry without text rules compares bytes, so a host whose place gives a
  write other bytes than it was handed (another line break) reads the write as lost and says so
  for a write that landed; the seven notations of the suite all have rules. And a text that the
  old path told after the write settles the question there: a write that this text crossed is
  the old session's to say, and where the file moves before it said so, nobody does.
- **A change from outside under a held gesture wins.** A change from outside that arrives while a
  person holds a gesture waits for its end. The drop is made from the text before that change, so
  the session drops it: the file keeps the outside's text, the canvas imports it when the gesture
  ends, and the person sees the item back where it was. Since the fourth increment the node says
  so in words (below). The contract asks for a merge there, and the board has no text merge.
  Before the second increment the drop was written over the outside's text.
- **What the adapter writes** on the `.board-engine` it is given, classes and data attributes
  only: `data-embed="diagram-js"` and `data-notation` once the editor is mounted,
  `data-embed-state` = `loading`, `ready`, `invalid`, `gone` or `failed` from the first moment,
  and three children, `div.board-host-state` (what the node says about its file),
  `div.board-host-notice` (`role="status"`, hidden until the node says that a change was dropped,
  then with `data-reason`) and `div.board-host-editor` (the modeler's host element: absolute,
  inset 0, clipped, a stacking context of its own). A card writes `data-embed="card"`,
  `data-embed-state="card"` and one child, `div.board-host-card`. Neither sets a position or a
  size on the element, and both take everything back on destroy.
- **The states.** `loading`: the code or the text is on its way; the board has no loading look, so
  the facade says it in the element. `ready`: the canvas shows the file. `invalid`: the modeler
  refused the file's text; the last canvas stays in sight under a line whose `title` is the
  modeler's reason, nothing is written, and the next valid text is imported. `gone`: the file went
  away; the board keeps the node, and the file's next text brings it back. `failed`: the editor
  could not be made (a path outside the repository, a file that is no text, code that did not load,
  another notation), with the message. While the state is `invalid` or `gone` the editor is
  `inert`: a change of such a canvas could not be written and the next text would replace it. A
  file that could not be opened is asked for again whenever the list of paths changes and has its
  path: a checkout, a file made beside the board. The facade listens to `onPaths` for it, one try
  at a time, and shows no loading line for a later try. `ready` stays as the first try settled it,
  so `runtime.mounted(id)` stays false and the board's log keeps the first message, while the
  element shows the editor. A path the host refuses is on no list and is never asked for again. Not
  cured: a node mounted on a path whose file is gone under another node's open session asks one
  message too early and waits for the next change of the list; and a file that is listed and could
  not be opened is asked for again only when the list changes, not when its content does. The line
  of an invalid file reads "This file cannot be shown as it is. Open it in its own editor to repair
  it." (`INVALID_TEXT`), which is true in a host that has such an editor, as VS Code is. A host
  that has none passes its own sentence: `invalidText` of `createFilesHost`, `modelsFrom` and
  `openEditor`.
- **A card for a file no editor covers (`openCard`).** `modelsFrom.open()` answers a card for
  every path without a registry entry, a `.board` among them, where it answered undefined
  before: the node shows the card and not the board's look of a failed file. The card names the
  file (`.board-host-card__name`), its folder (`__folder`, "in `<folder>`"), says "This board has
  no editor for this file." (`__note`) and, where the host shows files, has the button "Open in
  its editor" (`button.board-host-card__open`), which calls `BoardFiles.showFile(path)`: the
  host opens the file in its own way, and the page gets nothing of it. What the try came to is
  said below the button (`__said`, `role="status"`): "Opened in its editor.", or "This file could
  not be shown." with the host's message. The button is there only once the host said that it
  shows files (`showsFiles()`, known from the welcome, which the card hears through `onPaths`).
  Where the host shows none (the memory backend, the web app) there is no button and the card
  says "This app cannot show this file."; for a path the port refuses whoever asks (outside the
  root, a dot segment) there is no button either, and it says "A board reaches no file outside
  its repository and none in a dot folder.". The sentences are exported (`CARD_NOTE`,
  `OPEN_LABEL`, `NO_SHOW_TEXT`, `UNREACHED_TEXT`, `SHOWN_TEXT`, `NOT_SHOWN_TEXT`).
  - **A click on the button of a preview.** The board keeps a preview `inert`, so the button is
    never the target of a click there. The card listens on the document, in the capture phase,
    and takes a primary click as its button's when it landed on what holds the preview (the
    parent of the outermost inert element the card stands in, the board's `.board-node`), lies
    inside the button's rectangle on screen and travelled no more than 4 px since its press. A
    click on a node that lies over the card, the second click of a double-click and a drag of
    the node that starts on the button are none. The card keeps three listeners on the document
    for it (`pointerdown`, `click`, `dblclick`, each in the capture phase) and takes them off
    when it ends.
  - **A double-click, and the header's Edit.** A card is no editor, and the board arms it all
    the same: both arm every model node, and only the renderer could leave one out (the note is
    under [the increments](increments.md)). So the card takes the arming for what a person means
    by it and asks the host to show the file, once (not while an earlier question is open, and
    not for a node that was armed before its file moved). A double-click on the button itself
    asks once as well: its first click asked, and the arming it brings asks nothing more. Armed,
    the card stands in the layer at 100 %: its button has the focus, takes Enter, Space and real
    clicks, and Done or a click beside the node ends it. Where the host shows no file an armed card does nothing: it has the
    focus itself (`tabindex="-1"`), so no key reaches the page, and it says what it said before.
    An armed card writes nothing and changes no board.
  - **Not cured.** A card whose file moves follows only where the files port tells the move,
    which it does for a path the host's rule reaches (a picture in a model node); for any other
    file the node keeps the old path, and the host says what became of it when it is asked to
    show it. The picker still offers only the files an editor is registered for.
- **Words for a dropped edit.** An edit that is not in the file (it crossed a change from
  outside, it was on its way when its file was renamed, it would make the model larger than the
  place takes, or the place did not take it) is still dropped whole. The node whose change it
  was says so once, in `div.board-host-notice`, over the bottom edge of its editor: "Your last change was dropped: this file changed elsewhere
  at the same time. Make it again on what you see now." (`crossed`), "… it would make this file
  too large for a board. Remove something, then make it again." (`too-large`), "… this file could
  not be written. Make it again." (`refused`); `DROPPED_TEXT` has the three. A second node on
  the file says nothing. The words go with the next change the person makes on that model that
  is written (a change that writes nothing leaves them), and by themselves after
  `DROPPED_NOTICE_MS`, 15 s, the time the board's own notice of a refusal stays; a second drop
  takes the place of the first and its time starts anew. The line takes no pointer
  (`pointer-events: none`), so the editor below it stays in reach, and it is no toast of a
  shell: the facade has the node, and the words stand where the change was made. A person who
  looks elsewhere for 15 s does not see them: nothing keeps a list. **Still without a word:**
  an edit that is dropped while its file is gone (the node says that the file is gone, and the
  place takes no write into it), an edit whose page went before the host answered, and the
  write that an old path's own text crossed right before the file moved (the bullet on a write
  that was on its way).
- **A model whose file moves keeps its editor.** The facade hears `BoardFiles.onMoved` and calls
  `context.relocate(to)`, as before: one change of the board per node, reported by
  `onContentChanged` and never on the board's history. The board answers a relocate by
  destroying the node's editor and opening one anew at the new path, both in one commit of
  React. Since the fourth increment the editor that is destroyed leaves its modeler with the
  host's `EditorHandover` (one per `modelsFrom`), and the editor that is opened for the same
  node, the path it was sent to and the same notation takes it: `EmbeddedModeler.rehome(context)`
  moves `div.board-host-editor` into the element the board made, with what the adapter wrote
  and the history keys, and `TextBinding.follow(session)` puts the session of the new path in
  the place of the old one. A text that draws what the canvas shows is not imported, so the
  modeler keeps its canvas, its view, its history and what is selected, and the node never says
  that its file is gone. The session of the old path is closed when the old editor is destroyed;
  the one of the new path is opened by the new editor, and until it is there the binding has no
  session: a change the person makes in that gap is written into the file once the session came
  (where the file has the text the canvas was reconciled with) or dropped with the word
  `crossed` (where it has another one). A change the person made right before the move, whose
  write was still on its way to the old path, is held against the text of the new path in the
  same way (the bullet on a write that was on its way). A modeler nobody took by the end of that commit (the
  node went with the move, or names another file by now) is destroyed a microtask later. Where
  the new path cannot be opened after all, the modeler is destroyed and the node is one whose
  file could not be opened, asked for again when the list has its path. `openEditor` without
  `handover` makes the editor of a moved file anew, as before.
  - **A move while the model is armed** leaves the person in the editing: the node stays armed
    (the board's rule), the same modeler stands in the new element in the layer, what was
    selected still is, the board gives it the keys again (`focus()`), and the next change is
    written under the new path. A text field of the editor that was open loses the focus with
    the move of the element, as with any loss of focus.
  - **A move to a path a board does not reach** (no model by the host's rule, a dot folder) is
    not told to the page: the node keeps its path and says that its file is gone, and the image
    node draws the missing file. A file that comes back to the path is shown again.
  - **A model renamed to a suffix no editor shows** becomes a card, and its modeler is
    destroyed; one renamed to another notation's suffix gets that notation's editor anew.
- **`followMoves(board, files)`** is the helper for the nodes a host cannot reach through the
  board's host interface, the image nodes. An app calls it once with the board it made
  (`createCollaborativeModeler(...)`, or anything with `board.store`) and the files that
  board's host stands on, and calls what it returns before it destroys the board. For every
  move the port tells it writes the new path into each image node on the old one with
  `store.amend`: one change of the board per node, reported and never on the history. It reads
  the nodes before its first write, so a file that moved to where another one was moves once. A
  board without the helper keeps the old path in its image nodes, which then draw the missing
  file.
- **The first fit** is the adapter's, never the modeler's (`create({ fitOnImport: false })`):
  the content centred in the element minus the entry's insets, at most at 100 %, from the
  canvas's layout size. It is made once, for the first text the modeler accepts, also when a
  text before it was refused; every later import keeps the view the person has.
- **The sheet `@miragon/board-host/assets/embed.css`** is loaded by the page beside the board's
  sheet. It has the one preview rule, opt-in by the attribute the adapter writes:
  `.board-engine[data-armed="false"][data-embed="diagram-js"] .djs-container > :not(svg):not(.djs-overlay-container) { display: none !important; }`.
  An editor's chrome lies over its canvas and takes no part in its fit, so it goes without
  keeping its room; an editor a host mounts another way is not reached. The sheet names
  diagram-js and no renderer, and it reads the page's roles (`--cd-ui-plot`, `--cd-ui-text`,
  `--cd-ui-text-leise`, `--cd-ui-danger-flaeche`, `--cd-ui-warning-flaeche`) and no colour
  literal. The state line lies over the editor whatever z-index the editor's chrome has: the
  editor's host element isolates its own stacking. With the fourth increment the sheet has the
  notice line (over the bottom edge, above the state line, `--cd-ui-warning-flaeche` under
  `--cd-ui-text`) and the card (`--cd-ui-plot`, `--cd-ui-text`, `--cd-ui-text-leise`, and for its
  button `--cd-ui-flaeche`, `--cd-ui-kontur`, `--cd-ui-link`, `--cd-ui-hover`, `--cd-ui-fokus` and
  the radius token `--cd-radius-sm`): still no colour literal.
- **Release and focus.** `release()` leaves nothing selected, open or focused below the element:
  an Escape `keyup` on the document, a click on `.djs-container > svg`, a blur of what has the
  focus inside, and the text selection inside removed. It touches neither the focus nor the
  selected text outside the element. `focus()` calls the notation's `relayout` first and then
  gives the canvas the keys; the element has no box of its own at that moment (see
  [What is left with the host](renderer.md#what-is-left-with-the-host)), so a `relayout` that measures
  defers itself by a microtask.
- **`containHistoryKeys`** (a host that owns the document's history, VS Code): Control or
  Command with Z or Y from inside an armed editor never reaches the window. The listener is on
  the document, as the last stop before the window, because Wardley Maps and Team Topologies
  take their undo in a listener on the document; on the element it would keep the key from
  them. A test holds that the editor still undoes.
- **The host from files.** `createFilesHost({ files, editors, containHistoryKeys?, invalidText? })`
  gives the board `models` and `images` and keeps them the same objects; `dispose()` ends what it
  listens to on the port and leaves the port to its owner. The model list is the port's paths with
  a registered suffix, the same array until the port has a new list. `describe(path)`: the kind is
  the entry's, the title is the file name without the matched suffix, `<name> in <folder>` where
  two listed files share the name, and with the suffix kept where they also share the folder (the
  example's `sample.tt` and `sample.cm` are titled "sample.tt in models" and "sample.cm in
  models"). `open()` answers a card for a path without an entry, a `.board` among them, and
  `describe()` still answers undefined for one, so the header keeps the board's own naming. A
  file that moves is followed with `context.relocate`: one change of the board per node that
  shows it, with the node's editor kept (above).
- **The images.** `read(path)` loads the bytes when a node first asks and hands out the same
  Blob until `onChange`; a changed image keeps its old Blob until the new bytes are there; an
  image that goes is told. `taken(path)` answers from the port's list, loaded or not. `store` is
  there only where the port can create a file; it has the bytes at hand before it tells, so the
  node that is written next draws at once, and it passes the port's refusal on (a path in use, a
  path outside the repository, a path outside `assets/`).
- **Tried against the tests:** about a hundred single-statement changes of the sources, applied
  by a Vite plugin in a scratch config so that no file of the tree changed. Eleven passed at
  first and are each held by a test since; one, the state attribute written under another name,
  did not finish inside its 300 s limit and has no result. For the fourth increment: of 125
  single edits of the lines it wrote or changed (18 of the binding against the unit tests, 107 of
  the adapter, the hand-over, the facade, the card, the helper and the sheet against the browser
  files of this package), 106 failed a test at first. Of the 19 that passed, eleven are held by
  a test since, seven were lines or conditions that made no difference and went, and one was an
  edit that changed nothing. The list for the sources as they stand has 129 edits (21 against
  the unit tests, 108 against the browser files): six of them, around a double-click on a card's
  button, passed in its first run, and all 129 fail a test now. For the closing round, five
  single edits of the binding's new lines (the write left behind not taken along, not said,
  never forgotten, a write never unconfirmed, a told text that settles nothing), each made in
  the file and taken back: all five fail a unit test, and the first also fails the browser
  file `moves`.
- **Without a test, of the fourth increment:** a text field of a real editor that is open when
  its file moves (the stand-in has none; the seven real editors were moved as previews and
  Wardley Maps while armed, with a selection and without an open field); a drag a person holds
  with real input while the file moves (the binding's part is held on doubles: the text of the
  new path waits for the end of the gesture); a card that is armed by the keyboard; a card on a
  board that stands in an inert element of its page, a dialog's backdrop for one, where the
  card reads no click; `followMoves` on a live document two people share, where each page's
  helper writes the same path; and everything of this increment in a real VS Code, which no
  test of this package reaches: the walk of it is in
  [the extension's document](vscode.md#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code).

## Tests of this part

The two projects and their rules are under [Tests](../CLAUDE.md#tests). This part's files:

- `npm run board test`, the unit project:
  - `packages/host/test` (7 files, 95 tests): the fit, the binding on a session double (with what
    it says once, a file that moves, and a write that was on its way when it moved), the
    registry's load, the model list and `describe`, the
    images, the host's parts, the hand-over of a moved file's editor, and the files server's
    limit for a new file and the picture suffixes of a host's rule against the board's own.
    [`packages/host/test/README.md`](../packages/host/test/README.md) says what each file holds.
- `npm run board test:browser`, the browser project:
  - `packages/host/test/browser` (6 files, 140 tests): `embed` (30: the adapter alone in an
    element the test sizes, scales and arms, and moved into another element), `files-host` (34:
    the real board on `createFilesHost` over `connectBackend(createMemoryBackend(...))`),
    `real-input` (8: the command itself), and with the fourth increment `card` (31: a file no
    editor covers, on the real board and alone on the port's double), `moves` (26: files that
    move, on the real board and step by step on the port's double, with the words of a node
    whose change the old path never took) and `dropped` (11: the words
    for a change that is not in the file, on the real board and with the clock in the test's
    hand). The editor in them is a stand-in modeler of the contract
    (`test/support/stand-in-modeler.ts`), which draws real boxes that take real input; no test
    of the package imports a renderer of the suite.
