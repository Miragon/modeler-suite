# The board's VS Code extension

A part of the board's guide, moved here from [`CLAUDE.md`](../CLAUDE.md) as it was written. That
file keeps what every change needs and names
[every part's document](../CLAUDE.md#the-parts-and-their-documents).
What is found out or changed in `apps/vscode`, its smoke and what a real VS Code showed among it,
is written here. The README of the extension itself, `apps/vscode/README.md`, is for a person who
installs it and goes into the VSIX.

## The VS Code extension (`apps/vscode`)

`board-modeler` (publisher `miragon-gmbh`, a preview, `engines.vscode` `^1.96.0`,
`activationEvents` `onCustomEditor:board.boardEditor`) is the board as a custom editor for
`*.board`, view type `board.boardEditor`. The names are working names, the owner's to fix before a
first publish. It has two halves. The host half is every source of `src` outside `src/webview` and
runs in the extension host, in Node; `src/webview` is the page. The host half is tested against a
fake VS Code in memory and the webview as a page inside the shell's VS Code stub. The packed
extension also runs in a real VS Code: its smoke is under
[The smoke in a real VS Code](#the-smoke-in-a-real-vs-code-test-smoke), and what the code takes for
granted about VS Code, with what a real one showed of it, is the list after it.

Two channels on one pipe. The board file itself rides on the shell's document plumbing unchanged:
it is VS Code's text document, so dirty state, saving, undo, Git and a text editor beside the board
are VS Code's, and every change on the canvas is one minimal edit of that document. The files a
board shows (its models, its pictures) come through the files port, served over the same panel to
the messages whose type starts with `board.`. The two never meet: the shell answers its own types
(`ready`, `edit`, `insertExample`, `showProblems`, `info`, `error`) and hands every other one to
the editor's options, which take the ones `isBoardMessage` accepts; in the page the document sync
answers `init`, `update`, `problems` and `command` and hands every other one to the files channel,
which takes its own. **The board file is never opened through the files port.** By the extension's
rule a `.board` is neither a model nor a picture, so the server refuses its path before VS Code is
asked, the list a page hears has no board file, and the page opens none. Held three ways:
`boardEditor.test.ts` asks for the editor's own board file and for another one and counts no `stat`
and no `openTextDocument`; `webview-rules.test.ts` holds the rule against the registry; and
`files.spec.ts` runs the page on a repository that holds the board file, where the picker does not
offer it, no message of the files names it, a change of the board is an edit of the document and no
write into the repository, and asking the port for it all the same is refused.

### The host half

`src/boardEditor.ts` calls the shell's `registerModelerEditor` with `boardEditorOptions(...)` of
`src/boardEditorOptions.ts`, which imports no `vscode`, so that a test page registers the same
plumbing against the shell's host stub. `test/bundle.test.ts` reads the inputs of the production
bundle: no React, no renderer, no diagram-js, none of the seven modelers. With the fourth
increment `registerBoardEditor` also makes the board's entries in the Problems view, registers
the three commands and gives each open board the part that saves its models with it; all of it
is one disposable in `context.subscriptions`. The manifest contributes the commands, their menu
entries, one setting and a walkthrough, and keeps its one activation event: VS Code activates an
extension for a command it contributes. `vscode` itself is imported by `extension.ts`,
`boardEditor.ts`, `commands.ts` and `diagnostics.ts` alone; everything else runs on the
structural type, against the fake (`test/host-rules.test.ts`).

- **The files** are served over the editor's panel. `onDidOpen` starts `serveFiles` on a channel
  whose `post` is the editor's and whose messages `onMessage` feeds, with the rule
  `BOARD_FILES_RULE`: a model is a file with a suffix of `board-suite-editors/suffixes`, a picture
  one with a suffix of `PICTURE_SUFFIXES`. There is one server per open editor and nothing is
  pushed before that page's hello. The editor's close disposes the server first and the backend
  after; a `post` into a panel that is gone is swallowed, whether it throws or rejects. A host that
  hands a board no backend still answers every request ("this board has no files").
- **The root** (`src/files/root.ts`) is the nearest folder above the board file that holds `.git`
  (a folder in a clone, a file in a worktree or a submodule), else the workspace folder the board
  is in, the innermost one, else none. It is asked with `workspace.fs.stat` for `.git` alone, the
  nearest folder first, up to the top folder and no further than the first hit, without the board's
  query and fragment (a board that Git shows from its history carries the revision there). The
  repository comes first also where VS Code has only a folder inside it open, since designIQ reads
  the same board against the repository's root. A board with no `.git` above it follows the
  workspace folders: when the folder comes or goes, the list follows, and an open text hears that
  its file is gone and, where the path names a file under the new root, its text. A `.git` that
  appears later (`git init`) is not noticed until the board is opened again. Without a root the
  list is empty, no model opens and a new picture fails with "this board is in no repository and in
  no open folder, so it has no files". A hazard of the rule: the nearest `.git` may be far above
  the board. A person who keeps dotfiles in a repository at their home folder and opens a board
  that is in no nearer repository gets the home folder as the root, and the index searches and
  watches all of it. And by the same rule `modelers/board/example/example.board`, opened inside a
  checkout of the suite, has the suite's root for its root and finds none of its models, which are
  `models/...` from the example folder: copy that folder out of the checkout to try the extension
  on it.
- **The index** (`src/files/file-index.ts`, after Wardley Maps' `WorkspaceMaps`) is one per root
  for every open board of it (`createIndexPool`). It lists the models wherever they are and the
  pictures under `assets/`, by two `findFiles` on a `RelativePattern` of the root with the exclude
  `**/node_modules/**`, and keeps the list by one watcher on every entry below the root (`**/*`),
  by VS Code's own file events for what a person does in the Explorer, and by a search again where
  neither can say what changed. What changed while a search ran is applied to its answer, an older
  search that answers later is dropped, and a failed search keeps the list. The list's listeners
  are told once, 100 ms after the last change of a burst (`LIST_REST_MS`); a single file's event is
  told at once. Never listed: a file in `node_modules`, a dot file or a file in a dot folder, a
  picture outside `assets/`, which is read when a node asks and is not followed when it changes.
- **Why the watcher is on every entry.** It was on the file names a board lists, and a real VS
  Code showed what that misses (1.146.0 and 1.96.0, Linux). A folder that another program removes
  or moves is one word, the folder's, and a glob of file names hears nothing: the picker kept the
  files of a removed folder. A folder that arrives with its files names none of them. A file that
  is written right after its folder was made comes with a change as its first word, or with none.
  So a path that went takes every listed file at or below it off the list, each told to its open
  text; a file whose first word is a change is listed; and a new entry that is no file a board
  follows may be a folder: once the burst rests it is asked what it is (`workspace.fs.stat`), and
  the root is searched again where it is a folder. A new file that is none costs that one question
  and no search. Nothing is asked about an entry in a dot folder or in `node_modules`, and a burst
  of more than `FOLDER_LOOKS` (8) new entries is answered with one search and no question: a build
  that writes a thousand files costs one search. The Explorer's events still say more than the
  watcher, both ends of a rename and at once, so the files of a renamed folder move in the list
  without a search; the watcher's later word of the same folder costs one search, which finds what
  the list has.
- **The list holds what a search finds.** The search's glob reads a suffix by its letters as they
  are, where the rule of what a board shows ignores their case (seen: `findFiles` does not find
  `X.OWM` on Linux). Such a file opens for a node that names it, and its text hears of the file,
  but it is never listed: listed by the watcher's word, it would leave the list with the next
  search and its node would be told that the file is gone. Listed though a board opens neither: a
  link to a file, which the search finds and the watcher names, and, after a search, a file
  below a linked folder, since the search follows links and the index asks nothing about a file.
  Picked, each is a node that says why it does not open.
- **A model's text** (`src/files/documents.ts`) is the file's `TextDocument`. A write is one
  minimal `WorkspaceEdit` through the shell's `createDocumentWriter` with `suppressEcho`, so the
  file turns dirty and the person saves it: the host has no call that saves, and
  `test/host-rules.test.ts` reads its sources for one. The echo of an own write is consumed and
  tells nothing; every other change of the document (a text editor, undo, revert, a reload after a
  checkout, the file's own modeler) is told, and a save, whose event has no content change, is not.
  VS Code owns the document and lets go of a clean one that no editor shows: the text drops the
  object at its close event, keeps the last text at hand for `text()`, and opens the document again
  before the next write, with a new writer. While the document is closed the watcher's word of the
  file reads it again and tells the text when it is another one; while it is open, a change of the
  file is left to VS Code, which reads a clean document again itself. A write that is not taken
  says why, in the three words of the files port, and the server tells the page the document's
  text and the reason (`board.text.dropped`). **Crossed** (`write` resolves false): the document
  has another text than the one the write was made on, asked in the task that hands VS Code the
  edit, or VS Code refused the edit and the document has another text by then, since it moved
  on while the edit was on its way. **Too large** (`WriteRefusal`): the write would make the file
  larger than `TEXT_LIMIT_BYTES` as UTF-8, and VS Code is handed no edit, since a board opens no
  model above that size and the saved file would open on no board again. **Refused**
  (`WriteRefusal`): VS Code took no edit of a text nobody else changed (a file system that
  turned read-only), or there is no document to write into any more (the file went without a
  word, or a folder on its way is a link now). Into a file that is known to be gone, and into a
  text that is closed, a write resolves false and nothing is told. Two boards on one model are
  two texts on one document: what one writes, the other is told. A file that another program
  removes keeps its document in VS Code (seen: no close event): the text hears that the file is
  gone from the index alone, and when the file is back it tells the text of that same document,
  which VS Code reads again.
- **The version of a text** is the files server's own count and never `TextDocument.version`. By a
  reading of VS Code's typings and source, its number starts at 1 again for a document that was let
  go of and opened anew, and it moves with the page's own edits, which a page could only follow
  with an acknowledgement the protocol does not have.
- **Saving** is the person's, file by file: a model edited on a board is a dirty document of its
  own. That is the default. **The setting `miragon.board.saveModelsWithBoard`** (a boolean, off,
  resource scope; the lead's N1, the name and the default the owner's) makes a person's save of
  a board also save the models THAT board made dirty. `src/saveModels.ts` is one listener pair
  per open board, built on [Saving, as measured](#saving-as-measured): will-save says who asked
  and did-save does not, so the reason of the board's will-save is kept until its did-save; only
  `TextDocumentSaveReason.Manual` counts, never auto save or a lost focus; the models are saved
  after the board's did-save and never inside its will-save; the setting is read at that moment
  (`=== true`, for the board file's resource); each model is saved with `TextDocument.save()`,
  all at once, and one whose save answers false or throws stays dirty while the others are
  saved. VS Code calls a save an extension makes Manual as well, so the names of the documents
  the extension is saving are in one set for every board, and a will-save of a board that is in
  it is no person's: a file that is a model on one board and open in a board editor of its own
  saves no second round. A did-save without a will-save before it saves nothing. Which
  documents: `src/files/written.ts`, one record for the whole extension since the closing round
  of the fourth increment, made by the registration and handed to every backend
  (`VsCodeBackendOptions.written`; `VsCodeBackend.unsaved()` asks it for its board). It is kept
  by the name VS Code has for a document and for the board file whose page wrote into it, so it
  outlives an editor: VS Code builds a new editor, and with it a new backend, for a board whose
  tab was closed and opened again and for a board file that was renamed, and before the change
  such a board saved none of the models it had edited (seen in a real VS Code on both
  versions). It does not outlive the extension host: after a reloaded or restarted window the
  unsaved models are restored by VS Code and are no board's until they are edited on a board
  again, which the setting's description, the README and the walkthrough say. A document is a
  board's from a write of its page that landed (`openDocumentText`'s `wrote`) until it is
  clean, however it got there: saved by whoever, reverted, thrown away, or taken back to the
  saved text by an undo. What changes it after that is somebody else's change, and a person's
  save of the board leaves it alone. The record listens to the change event alone, which
  also tells a save. Before the change a document was forgotten only by a save or when the
  list was asked, so a model that was reverted in its own tab and then typed into
  was written to disk by the board's save, with a line the board never made (seen on both
  versions). How VS Code says that a document is clean, as the walks' logs have it on both
  versions: a change event whose document is not dirty. A revert is two of them, one with the
  file's text and one without a content change. The first change of a clean document is told
  while the document still calls itself clean, and a second event without a content change
  says that it is unsaved, so the record takes a document for clean since only where an event
  says unsaved after one said clean; a write of the page is recorded when VS Code answered the
  edit, behind both. And the old document of a file a person renames while it is unsaved says
  that it is clean and closes before the rename event comes, by 34 and 53 ms in the logs: a clean
  document is therefore remembered for `CLEAN_MEMORY_MS` (5 s), and the rename event that
  names it gives its boards to the document of the new name where that one is unsaved. A board
  file that is renamed is followed in the same way, by its name. A model the person also
  changed in its own tab is the same document and is saved whole, which the setting's
  description says. **A model whose file is no longer there is not saved** (`fileThere` of
  `saveModelsWithBoard`, a `stat` before each save): VS Code would write the file again, and a
  review saw a file that another program had removed come back with a person's save of the
  board. It stays unsaved, with its tab. The same keeps the document of an old name from being
  written, where an edit landed in it after its file was renamed (Files that move, below). And
  a document that is being saved already is left to that save: two editors of one board hear
  the same save of it and share one record. `host-rules` holds that `saveModels.ts` is the one
  source that saves.
- **Files that move** (the lead's N4). The index hears `onDidRenameFiles` already; it now tells
  the moves (`FileIndex.onMoved`), and the backend hands them on (`FilesBackend.onMoved`), so
  every open board of the root is told. One move per file, by its path from the root: for each
  renamed entry the listed files at or below the old path, each at the same place below the new
  one (VS Code names a folder alone), and the entry itself where its name is one a board shows
  as a model or a picture and the list does not hold it (a model in `node_modules`, a picture
  outside `assets/`). Everything of one event is one call, made before the index says of any old
  path that its file went, so a page hears `board.moved` before `board.text.gone`. Nothing is a
  move that leaves the root or comes from outside it, and the server drops a move onto a path a
  board does not reach: such a file is gone, as before. A file another program moves is a
  deleted and a created file to the watcher, and stays that. Not followed: a file below a
  renamed folder that the list does not hold; and a board that is not open, whose text is not
  touched. The unsaved text of a renamed model moves with VS Code's document, which the page
  reads when it opens the new path (seen, below). **The watcher may be ahead.** VS Code moves
  the entries of one drag one after the other and tells its one event after the last, and a
  real VS Code named the first of two dragged files to the watcher before that event came
  (1.146.0 and 1.96.0, by 2 and by 12 ms). The file is then off the list and its text was told
  that it is gone. A file is still a move, since VS Code names it itself. For a folder the
  index remembers for `MOVE_MEMORY_MS` (5 s) which files the watcher's word of a path took off
  the list, and a rename event that names that path afterwards tells them as moves; it is asked
  once. The page then hears `board.text.gone` before `board.moved`, and its node follows all
  the same (seen for the file). For a folder the watcher was not seen ahead: of two folders
  dragged together the event came first on both versions. **An edit that crosses a rename.**
  An edit of the page that reaches the extension within a few milliseconds of a rename has no
  place to land: the page has closed the old path by the time the edit is read (the server
  answers an edit of a path that is not open with nothing), or VS Code applies it to the
  document of the old name, which it has already let go of, and that document then stays open
  and unsaved under a name whose file is gone. A person's hands are too slow for it; a second
  actor in VS Code is not (an extension's `WorkspaceEdit.renameFile`, a refactoring). A review
  made it in a real VS Code with the rename asked in the extension host and the Delete key
  pressed at once: 3 of 12 tries on 1.146.0 and 1 of 12 on 1.96.0 lost the edit, and the node
  said nothing. Since the closing round the node says "Your last change was dropped: this
  file changed elsewhere at the same time. Make it again on what you see now.": the binding
  of the host package holds a write that was on its way against the text of the new path
  ([the host package](host.md#the-host-package-packageshost)). Seen in the runner on the
  changed tree: 2 of 12 tries lost the edit on 1.146.0, each with the sentence in the armed
  editor, and 0 of 12 on 1.96.0, with no sentence in any of the 22 tries whose edit travelled
  with the file. **Not cured:** the document of the old name. It keeps the lost edit, VS Code
  shows it as an unsaved tab and asks about it when the window closes, and whoever saves it
  there makes a file of the old name. The setting does not save it (its file is not there).
  The cure would be the extension's own word for it, a warning that names the document when a
  rename event finds an unsaved document of the old name that a page wrote into; not built.
  **A chain of renames in one event** (`a` to `tmp`, `b` to `a`, `tmp` to `b` in one
  `WorkspaceEdit`) leaves a node on the path in the middle, which does not exist: the index
  asks for the moves of every entry before any is applied, and a node follows one move of a
  message. On the fake alone; the same swap as three renames ended right in a real VS Code. A
  person cannot make one event of three in the Explorer. The cure is to compose the moves of
  one event in `movesOf` of `file-index.ts` (where an earlier entry's new path is a later
  entry's old one, tell from the first to the last), with a case in `test/file-index.test.ts`.
- **A file that is shown** (the lead's N3; `src/files/show.ts`). `showFile(path)` opens the file
  with VS Code's own command `vscode.open` and resolves once that did; the page gets nothing of
  the file. The server hands it any path of the repository outside its dot folders, whatever the
  board's rule says, so the backend checks first, each with a message a card prints: the path
  as the files port's `repoPath` takes it ("`<path>` is no file of this repository"), no folder
  on the way a link ("`<path>` is behind a link, and a board shows no link"), a file that is
  there ("`<path>` does not exist", "`<path>` is no file") and is no link ("`<path>` is a
  link, and a board shows no link"). No size is asked. Where the command rejects: "VS Code
  could not open `<path>`: `<its message>`". Without a root: the sentence of every request. One
  file at a time in the backend itself, whoever calls, also after one that failed; the files
  server lets one more wait and refuses the rest ([The files port](files.md#the-files-port-packagesfiles)),
  since every file that is shown comes to the front of the board's own group. Not checked:
  what VS Code opens the file in, which is its default editor for the file and may be another
  extension's (a review registered a second custom editor as the default for a suffix, and
  `vscode.open` opened the file in it).
- **The Problems view** (the lead's N6; `src/problems.ts`, `src/diagnostics.ts`). One error per
  board document whose text the board's own reader (`parseBoardText`) refuses: the reader's
  reason as a sentence, then "The board is read-only until you fix the text.", at the line the
  reason names, the whole line, source and collection `board`. The reader counts lines at line
  feeds and VS Code also at a lone carriage return, so the line is counted again as VS Code
  has it; a reason without a line (no header) is shown at the first. A document of a real VS
  Code holds no lone carriage return, so the recount changes nothing there: VS Code makes it a
  line break when it reads the file
  ([item 7](#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code)). It stays for a
  host that hands a text over as it is, as the shell's stand-in does. The entry is kept in step
  for every open document whose name ends in `.board`, whatever shows it (`onDidOpen`,
  `onDidChange` with content changes, those open at activation), and for a file of another
  name once the board's editor asked for it, for as long as it has an entry; it goes when the
  text is valid and when VS Code closes the document. Read-only copies (`git`, `gitlens`,
  `vscode-scm`) get none. The editor hands the shell `diagnostics.refresh` and no `clear`, so
  the page's problems pill is told the count (0 or 1) from its `ready` on. `boardEditorOptions`
  has no diagnostics, the registration adds them; the test page adds its own, which count the
  same problem with `boardProblem` and keep no entry, since the Problems view is VS Code's.
  A change of a board with an open editor is read twice, once by the shell's refresh and once
  by the listener, which costs one more parse of a small text. The reader's result has no line
  of its own: it is read from the reason's first words ("line 4 ..."), which
  `test/problems.test.ts` holds for the reasons it makes.
- **The commands and the walkthrough** (the lead's N7; `src/commands.ts`). `board.newBoard`
  ("New Empty Board", in the New File menu as "Board") is the shell's
  `registerNewDocumentCommand` with an empty text, `untitled.board` and a `targetPath` that adds
  `.board`. `board.newBoardFromExample` is the same shell command on a facade of `vscode` whose
  one `writeFile` writes the example around the picked file (`src/example.ts`), so the dialog,
  the question before a replace, the error and the `vscode.openWith` are the shell's: each file
  of the example beside the board unless something is there under its name (kept, and named in
  one notification), each folder made once, the board last. A node stores a path from the
  repository's root and not from the board, so the board is written for its place: its paths
  and an arrow's label that quotes one get the board's folder in front (`findRoot`, the same
  rule the backend has), and a paragraph of a note that speaks of the browser is left out. The
  example is `example/`, each file imported as a text (`?raw`, which the host's build reads
  with a small plugin in `esbuild.config.mjs` and the unit tests through Vite);
  `test/example.test.ts` fails for a file of the folder that `src/example-files.ts` does not
  name and for one that is no text. `board.openSource` ("Open Source to the Side", in the
  board's editor title and, while a board has the focus, in the Command Palette) is the
  pattern of Business Model Canvas: the resource a title button passes, else the board focused
  last (`revealActiveDocument`), else a restored tab that is not resolved yet, opened with
  `vscode.openWith` in `default` beside. The walkthrough `getStarted` has the board's four
  steps (open a board, add a model from the picker, edit it in place, save), a page each under
  `media/walkthrough/`, which the VSIX takes along; the collection's walkthrough is not touched.
- **Pictures** (`src/files/bytes.ts`) are read with `workspace.fs.readFile`, the type by the file's
  suffix, and a new one is written to `assets/<name>`: `assets` is made when it is not there, and
  the name is looked for first. The backend lists a stored picture and tells its bytes at once,
  without waiting for the watcher.
- **What the backend checks that a path's text cannot say, and what it does not.** Checked, each
  with `workspace.fs.stat` before anything is read: no folder between the root and the file is a
  symbolic link (`behindLink` in `root.ts`); a model or a picture that is a symbolic link is not
  opened and not read (`FileType.SymbolicLink`); a model above 2 MiB (`TEXT_LIMIT_BYTES`) and a
  picture above 10 MiB are not read; a new picture never replaces a file, a folder or a link of
  its name, and is not written through an `assets` that is a link or a file. The same checks run
  again whenever a document is opened anew, so a folder that turns into a link under an open text
  ends that text's writes once VS Code let go of the document. NOT checked: how a file system
  folds names (a path is compared as text, so on a disk that folds case another spelling of the
  root is not below it; only a document is followed by the URI VS Code gives it); that a model is
  a text at all (VS Code decides what it opens, and was seen to refuse a binary file); the folders
  above the root; and the moment between a check and its use, `workspace.fs` having no write
  that only makes a file.
- **Every folder on the way is asked.** `stat` names an entry itself and never the way to it: a
  file behind a linked folder is a plain file to it (type 1), while the folder is a link (type
  66; both seen in a real VS Code). So `behindLink` asks each folder between the root and the
  file on its own, the outermost first, stops at the first link, and nothing is asked about a
  file behind one: "`<path>` is behind a link, and a board opens no link" for a model, "... reads
  no link" for a picture. A folder that is not there says nothing, and the file's own check then
  says that it does not exist. A link is refused wherever it leads, into the repository too: VS
  Code's API resolves no link, so where one leads cannot be asked. That is as with a link to a
  file, and it takes a linked folder away from an honest board as well. It costs one `stat` per
  folder of a path at every open, and nothing is kept between two opens. **Decided in the closing
  round of the second increment, not by the owner, who may turn it round.** The lead's L1 had
  named a linked folder as what is not checked; a review then reached a model and a picture
  outside the repository through one in a real VS Code, read and written (`out/secret.owm` behind
  `out -> /tmp/…`, the model left as a dirty document). Seen afterwards in the runner, on VS Code
  1.146.0 and 1.96.0: a model and a picture behind a linked folder are refused at every depth,
  also behind a link that is deeper on the way, no document of such a file is opened, a node that
  names one says "This file could not be opened. out/secret.owm is behind a link, and a board
  opens no link", and a model and a picture behind plain folders open.
- **A webview that closes in the middle of a write.** The edit of a page is applied whole or not at
  all, since it is one `applyEdit`. One that reached the extension host lands though the panel is
  gone, also where VS Code first has to open the document again: the server closes a text after its
  last write, and the backend's `dispose()` ends the index and leaves the texts to the server. One
  the host had not received is lost.
- **A file that is read only.** `BackendText.readOnly` comes from `stat`'s `permissions`, and a
  real VS Code says `Readonly` there for a read-only file system alone. A file whose mode forbids
  writing has no permissions to an extension: the board takes it for writable, VS Code takes the
  edit, and the save is what fails for the person.
- **The fake VS Code** (`src/files/memory-vscode.ts`) is the workspace in memory that the backend
  is tested against and that the `vscode` mock of the unit project (`test/__mocks__/vscode.ts`) is
  built on: a disk with folders and links, documents that are opened on demand, turn dirty and are
  let go of, edits that carry the version they were made on, a search with excludes, watchers, the
  Explorer's gestures and the workspace folders. With the fourth increment: saves with their two
  events and reasons (a person's, auto save's, `TextDocument.save()`, a save that fails for a
  file that is newer on disk), `workspace.textDocuments` and `onDidOpenTextDocument`, a rename
  that names several entries and moves unsaved text with its file, the commands (`vscode.open`
  written down, a registered one run, an unknown one rejected, a name taken once) and the
  diagnostics collections. The mock adds the save dialog, notifications with their buttons, the
  tab groups and the settings. It imports nothing of Node or of a page.
  `test/memory-vscode.test.ts` holds each behaviour the backend depends on as a sentence. Each was
  read from VS Code's typings and its source at 1.96.0, and three were changed to what a real VS
  Code showed: a watcher hears one word for a folder that goes or comes, the folder's, and a
  folder that is made is named before the file in it; the document of a file another program
  removes or moves away stays open; and `readOnly` stands for a read-only file system. With
  the walk of the fourth increment three more: a document has one line break, the one most of
  its file's breaks are, so its text is not always its file's and never holds a lone carriage
  return, an inserted text gets the document's break, and a document that reads its file again
  takes the break of the new text; of an entry that moved, the watchers hear the new name
  before the old one, and of several, every new name before any old one; and
  `explorer.drag(moves)` is a drag of several entries, whose event is told after the last moved
  when the watchers have named the earlier ones already, beside `explorer.move(moves)`, the one
  edit that renames several, whose watchers hear of all of it afterwards. With the closing
  round three more, each read off the event logs of the walks on both versions: the first
  change of a clean document is told while the document calls itself clean, and a second event
  without a content change follows once it is unsaved; a revert is clean before its text is
  told and says so once more without a content change; and the unsaved document of a file a
  person renames says that it is clean and closes, and the document of the new name opens and
  says that it is unsaved, all before the rename event. A clean document of a renamed file is
  moved too, also where no tab shows it: a clean document of the new name opens before the
  rename event and the old one closes after it, where the fake had closed the old one and
  opened none. Not built into the fake, since no log has it: what a document says when an
  undo takes it back to its saved text (the fake tells one change, clean).
- **Tried against the tests:** 89 single edits of the host's sources as the builders left them,
  through a plugin in a scratch config. All 89 fail (88 by a failed test, one by an unhandled
  rejection). Of the index as it is since the walk, eight more: the watcher on file names alone, a
  change that is never an arrival, a new entry that is never looked at, dot folders looked at, no
  cap on the questions, a folder that leaves its files, a look that outlives the index, and a file
  listed whatever the case of its suffix. Each fails a test. Of the look at the way and the limit
  of a write, twelve: no look before a model is opened or before a picture is read, only the
  nearest folder asked, the root asked too, the way asked after the file, a folder that is not
  there taken for a link, a link told by another bit, a URI without folders taken for clear, a
  write of any size handed on, the limit itself refused, letters counted in place of bytes, and
  a pair counted as six bytes. Each fails a test. Of the fourth increment, 227 single edits of
  what it wrote or changed in the host half (the reasons of a write and the written documents,
  the moves, the shown file, the saves, the problem and its entries, the example, the
  commands, the registration, and 25 of the fake's new behaviours): 225 fail a test. The two
  that pass empty the set of move listeners when the index and the backend end, which nothing
  can see, since neither tells a move after it ended. Six passed at first and are held now: a
  save that takes a document off the written ones, a second kept file in the notification, a
  title button's file before the board focused last, and the backend's end with its editor.
  Of what the walk of the fourth increment changed, six: the index without its memory of the
  watcher's word, the memory asked more than once, the memory that never forgets, a document
  that keeps its file's line breaks, an inserted carriage return that stays one, and a drag
  whose earlier entries reach the watchers as one batch. Each fails a test. Of the closing
  round, 17 single edits of the host half, each made in the file, run against the unit tests
  and taken back: seven of the record of written documents (a clean document not marked, one
  unsaved again that stays the board's, unsaved text that moved left behind, a renamed board
  that loses its documents, a clean document counted as unsaved, a document that is every
  board's, a clean document taken along by a rename), a backend with a record of its own, an
  editor that asks for no file, a model without a file saved, a model saved a second time, and
  six of the fake's new events (a clean document that says unsaved at once, a revert that says
  clean once, the old and the new document of a renamed unsaved file saying nothing, and a
  clean document of a renamed file that closes before the event or gets no document at the
  new name). 16 fail a test. The one that passes takes the record of a
  clean document along when its file is renamed: the next change event of that document says
  clean before it says unsaved, which removes the record again, so no test can tell.
- **Taken for granted for daily use, and how a real VS Code showed it.** Each point the fourth
  increment rests on was built into the fake and then walked through in the runner, on VS Code
  1.146.0 and on 1.96.0: the list, with how each point ended, is under
  [Taken for granted for daily use](#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code).
  Two points differed and changed the fake and the index (the line breaks of a document, and
  the watcher that is ahead of a drag), and four were not reached in full.

### The webview half (`src/webview`)

Three files. `main.ts` is the bundle's entry, `channel.ts` puts the files protocol on the
webview's one pipe to the extension, and `paste.ts` aims a paste where a browser aims it.
Everything else of the page is `board-ide-editor`, the shell and `board-suite-editors`.

- **The entry's order.** `board-suite-editors/zod-jitless` first: zod probes for eval when it
  builds its first schema, and the webview's policy reports the probe. Then the sheets by name: the
  two Geist sheets, `@miragon/modeler-shell/shell.css`, `@miragon/board-renderer/assets/board.css`,
  `board-suite-editors/base` (diagram-js's sheet and the canvas mapping once, with the host
  package's preview rule), `board-ide-editor/app.css`. Only then code. A renderer's own sheet
  follows all of them in the bundle's one sheet. `test/webview-rules.test.ts` holds the seven
  imports in this order, and `test/webview-bundle.test.ts` the order in the built sheet.
- **One API.** A webview may call `acquireVsCodeApi()` once. The shell's
  `vsCodeEditorHost({ onMessage })` does, for the board file's own sync, and the files post through
  the same object (`host.api`). `filesChannel()` gives `receive`, which is handed to the editor
  host as `onMessage` and takes every message `isBoardMessage` accepts, and `over(api)`, the page's
  side for `createFilesClient`. No source of the webview names `acquireVsCodeApi`, and the
  production script names it once (both under a test).
- **The first answers need the document sync.** The files' messages come in through the shell's
  document sync, which hands on what it does not answer itself, so nothing arrives before the sync
  listens. The client says hello when it is made, and `mountBoardEditor` connects the sync in the
  same task, before its first await. An await between the two loses the answer to the hello. What a
  person would see is an empty picker and nothing else: a node asks for its file by its path, so
  the models and the pictures still open. A rule test forbids an await before the mount, and the
  e2e tests of the init hold the picker's entries.
- **The mount.**
  `mountBoardEditor(host, { files, editors: SUITE_EDITORS, containHistoryKeys: true, pictures })`,
  with `pictures: "shift-drop"`. Nothing of
  the extension is awaited: the shell and the board stand in a page nobody answers, with the models
  waiting. A mount that fails (a page without `#app`) disposes the files and stays the page's
  rejection. In VS Code the default line of an invalid model is true ("Open it in its own editor to
  repair it."), so no `invalidText` is passed.
- **A paste (`paste.ts`).** VS Code keeps the paste key from a webview's page and pastes by a
  command of its own, and the event of that command lands on `<body>` whatever has the focus (seen
  in VS Code 1.146.0), where a browser aims a paste at the focused element. The board takes a
  paste only when it is aimed at the board, so a pasted picture went nowhere. `aimPastes(document)`
  hears a paste on the body on its way down, and where another element has the focus it tells the
  paste again at that element, with the same clipboard, and stops the first one: the board's own
  rules then decide as in a browser (the pane takes a picture, a textarea its text, an armed
  editor what is its own). With nothing focused, or with the focus beside the board, the paste
  stays where it was and the board does not take it. `files.spec.ts` holds the three cases with a
  paste event made on the body; a real paste was seen in a real VS Code, on 1.146.0 and 1.96.0.
  The cure in the renderer would be to read the focused element where a paste's target is the
  body.
- **The view, kept in the webview's state.** The editor host the shell hands out has the
  webview's state as its `state` (`read` and `write` on the one API: `getState` and `setState`,
  every other key of the state left as it is), and `mountBoardEditor` keeps the board's view
  there under `boardView`
  ([The board inside the shell](ide-editor.md#the-board-inside-the-shell-appside-editor) says
  when a kept view is restored and when it is written). So no source of the webview names the
  state: the entry passes the host on. A webview that is loaded again finds the state VS Code
  kept and shows the board where the person left it, if that still shows the board. A tab that
  was hidden and shown keeps its page (`retainContextWhenHidden`), so nothing is restored there.
  A write is one `setState`, 250 ms after the view rested, and nothing in VS Code ends the page
  in a way the page hears of, so there is no last write. Held on the test page, where a reload
  of the page is the reload of the webview (`view.spec.ts`). **Seen in a real VS Code** (1.146.0
  and 1.96.0, [item 14](#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code)): the
  board came back to the view it was left at, to the pixel, after Developer: Reload Webviews,
  after Developer: Reload Window and after VS Code was closed and started again; a tab that
  was hidden behind a text editor or another webview kept its page. A tab moved into another
  window was not looked at.
- **A dropped file.** The board takes a dropped picture itself, by listeners on the window
  (`canvas/board-gestures.tsx`): a `dragover` and a `drop` that carry files and are aimed at the
  board's own element are cancelled and taken, with the hint "Drop to add an image" while the
  file is held over the board; inside an armed editor the file is the editor's, and the board
  only cancels the browser's default. VS Code stands in front of that. Read from the webview's
  own script (`out/vs/workbench/contrib/webview/browser/pre/index.html`) and the workbench
  bundle of VS Code 1.96.0 and 1.146.0, the two the smoke runs on, without running either:
  - The webview's script listens on the page's window. On a `dragenter` that carries only
    files, was not cancelled and has no Shift, it tells the workbench (`drag-start`), and the
    workbench takes the pointer from the webview (`pointer-events: none` on its frame). The
    drag is then the workbench's: the editor group shows its own overlay, with "Hold Shift to
    drop into editor" for an editor that takes drops, which a custom editor is, and a drop
    there opens the file in an editor of VS Code's. The page hears nothing more of the drag.
    The workbench does the same for a drag that crosses any other part of the window first,
    before the page heard anything at all.
  - With Shift held the workbench gives the pointer back and makes no overlay
    (`editor.dropIntoEditor.enabled`, on by default; with the setting off the overlay stays and
    no drop reaches a webview), and the script tells nothing but the key. The page then gets
    the drag as a browser hands it over, and the board takes the drop. The script cancels every
    `dragover` and `drop` itself, so no dropped file ever replaces the page.
  - So the webview half changes nothing about a drag: it says in the board's own place which
    drop reaches the board. `pictures: "shift-drop"` puts the row "Add a picture" with the
    paste key and `Shift+drop` into the board's shortcuts dialog. Staying in the page without
    Shift would take making VS Code's script believe that Shift is held, and would still fail
    for every drag that enters the window beside the board; that was not built.
  - **Held on the test page** (`drop.spec.ts`) with a real drag of a file of the disk and Shift
    held ([the e2e projects](e2e.md#a-real-drag-of-a-file)): the hint while the file is over the
    board, the file under `assets/` over the pipe, one edit of the board file, the picture's
    middle under the pointer, and a double-click that still arms a model afterwards; a file let
    go inside an armed editor, which the board does not store; and the row of the dialog.
    VS Code's script and workbench are not in the test page.
  - **Seen in a real VS Code** (1.146.0 and 1.96.0,
    [item 15](#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code)), with the drag
    of the e2e project: Chromium's own drag events through the DevTools protocol, with a file
    of the disk. With Shift held the frame keeps the pointer, the board shows its hint, and the
    dropped picture is a file under `assets/` and a node; a double-click arms a model
    afterwards. Without Shift the webview's frame has `pointer-events: none` from the
    `dragenter` on, the board shows no hint, not for a moment, and stores nothing. A file
    dragged from VS Code's own Explorer with the real mouse: without Shift VS Code shows "Hold
    Shift to drop into editor" and takes the drop, with Shift there is no overlay and the board
    takes nothing of it either, as read.
  - **Left for a walk by hand:** a drag from a file manager, which is the operating system's
    and not the protocol's; what VS Code does with a file that is dropped without Shift (with
    the protocol's drag it opened no tab); and the setting turned off. Following a file that
    is dragged from the Explorer (a node for a file of the repository that is dropped on the
    board) needs the page to ask the extension for the path behind an address, and is not
    built.
  - **What the walk of the third increment saw after a drop it made up** (the next double-click
    armed nothing and the Fit button took no click, until a click on the pane:
    [Found in a real VS Code](#found-in-a-real-vs-code)) is seen now. A `dragenter` with files
    and without Shift is told to the workbench, which takes the pointer from the webview, and
    after the drop the frame was still at `pointer-events: none`. It had the pointer again
    once the mouse had moved. A drag from a file manager ends with the mouse over the window,
    so a person should not meet it.
- **`webview`**, the entry's one export, is for test pages: `{ files, mounted, destroy() }`. The
  bundle is an IIFE and drops it; the shipped page publishes nothing on `window`. `destroy()` ends
  the board first (its editors close their files and may still write while they go: a label that is
  open is committed), then the host built from the files and the shell, and only then the files. It
  does not wait for `files.settled()`: a message posted through VS Code's API is on its way and no
  dispose takes it back, and in a page nobody answers the wait would never end. Nothing in VS Code
  calls `destroy()`. A webview that closes is gone, the extension's files server closes what it had
  open, and a reloaded webview says hello again, which starts the life of a page anew
  (`webview-channel.test.ts` holds that over the channel: the last write of the page before landed,
  and the new page counts its versions from 1).
- **What is a model** is said twice in the extension: the page mounts an editor by the suffixes of
  `SUITE_EDITORS`, and the extension host serves a text by `MODEL_SUFFIXES`, which is the suffix
  table as plain data. `test/webview-rules.test.ts` holds the two lists and the two rules equal.
- **The bundle** (`npm run board build:vscode`, `esbuild.config.mjs`). `dist/extension.cjs` is the
  host: Node, CommonJS, target node20, `vscode` external, 27.9 kB minified. The page is one classic
  script, `dist/webview.js` (2.79 MB minified), one sheet, `dist/webview.css` (297 kB), and eleven
  font files in `dist/fonts`, which the sheet names by relative path. The policy lets one script
  run, the nonce'd one, so there are no chunks: every notation's code is in the one script and runs
  when its first node asks for it. One copy each of zod, React, React DOM, Yjs, React Flow and
  diagram-js, and no file of the extension host (`test/webview-bundle.test.ts`, built in memory
  from the extension's own esbuild config). The webview's HTML and its policy are the shell's
  (`default-src 'none'`, a nonce on the one script, no `connect-src`, `dist` as the only local
  resource root; `test/webviewHtml.test.ts`).
- **The VSIX** (`npm run board package:vscode`, which runs the production build itself, packs
  offline and then runs the notices check) is `apps/vscode/board-modeler.vsix`, 23 files and
  1.03 MB: the manifest, `extension/package.json`, `extension/readme.md`,
  `extension/changelog.md`, `extension/LICENSE.txt`, `extension/icon.png`,
  `extension/dist/extension.cjs`, the script, the sheet, the eleven fonts,
  `extension/dist/THIRD_PARTY_NOTICES.md` (48 packages of npm, three copied works, 28 workspaces of
  the suite; 109 kB) and `extension/dist/dagre.esm.js.LEGAL.txt`. `.vscodeignore` leaves out `src`,
  `test`, `test-smoke`, `scripts`, `node_modules`, the esbuild config, the tsconfig and source
  maps. A development build before it leaves its source maps in `dist`; the VSIX does not take
  them. vsce prints no warning of its own.
- **The notices of the build.** Every build writes them into `dist` from what the two bundles are
  made of (`esbuild.config.mjs`, `writeBundleNotices` of
  [`apps/editors`](editors.md#the-suites-editors-appseditors)): a production build whose notices are not
  whole exits 1, a development build says what is missing and goes on, and a watch build writes
  them once, at its start. They are not committed, and in the VSIX the file is
  `extension/dist/THIRD_PARTY_NOTICES.md`, where the other modelers ship a committed
  `extension/THIRD_PARTY_NOTICES.md`; no page on GitHub shows it, and the README says where it is.
  `npm run check:notices -w modelers/board/apps/vscode` (`scripts/check-notices.mjs`, with the VSIX
  reader `scripts/vsix.mjs`) holds `dist` and the packed VSIX against a fresh measurement of the
  two production bundles (76 bundled packages and the three copied works against the 52
  sections), and the VSIX against its papers and against what it must leave out;
  `-- --vsix <file>` checks another VSIX. The part that built it tried each of its three reasons
  on `dist` and on tampered copies of the VSIX; with the closing of the increment the section of
  a font package and of each copied work was cut out of `dist` once, and the check failed each
  time.
- **The papers.** `README.md` is for a person who installs the extension: what a board is, how to
  install a VSIX and start, which files a board reaches and which not, what it cannot do yet, that
  it is a preview, and where the notices are. It links only to whole addresses and its own headings,
  since vsce rewrites a relative link to `main`. Its list "What it cannot do yet" loses a line with
  each item that is built. It says nothing of where the extension is published: the VSIX carries the
  file onto a marketplace's listing, and nothing but the release pull request stands between a merge
  and a publish, so a sentence that is true only before one would be untrue on the listing itself.
  Its Install section names the VSIX alone, and the pull request that makes the extension public
  adds where to find it. `CHANGELOG.md` is release-please's from the first release on; its one entry
  of the board's own, `## 0.0.0`, is the heading release-please writes its notes above (tried with
  release-please's updater: without a version heading it keeps the old text and doubles the title).
  Business Model Canvas and C4 arrived without a CHANGELOG. `icon.png` is a board on its
  stand with two cards (256 x 256), rendered from `icon.svg`, which the VSIX leaves out: drawn in
  the icon system of the suite's modelers on the owner's word, since the Miragon modeler icon set
  has no board icon. The manifest
  names it and carries the banner every extension of the suite has (`#335DE5`, dark).
  `test/papers.test.ts` holds all of it, the icon by its checksum and the README's silence on a
  marketplace by its words. Nobody has looked at the icon or the README in a real Extensions view.
- **Tried against the tests:** 21 single edits of `main.ts` and `channel.ts` (a sheet or the zod
  line taken out, the undo keys not contained, the files disposed before the board, no editors, no
  files, a second acquire, the channel posting or delivering nothing, an await before the mount),
  and one of the paste: the entry not aiming it. Each fails at least one test.

### The webview test page and the project `vscode-webview` (`e2e`)

`e2e/webview/webview-test.html` with `webview-test.ts` is the extension's webview as a page:
`apps/vscode/src/webview/main.ts` from its source inside the shell's VS Code stub.
`npm run dev:webview -w modelers/board/e2e` serves it on http://127.0.0.1:5194/webview-test.html
(the port is strict; `E2E_WEBVIEW_PORT` overrides it). Like the web app's, its Vite config takes
every package of the suite from its source, empties the base inside each renderer sheet and
pre-bundles what the notations load; `e2e/tsconfig.json` has `allowJs` for the `.mjs` build helpers
the config imports.

- **The stub first.** `installVsCodeWebviewStub` (default styles, `<html>` as `renderWebviewHtml`
  writes it, the body's theme classes, `acquireVsCodeApi`, the theme bridge) is in place before the
  webview's entry is imported.
- **`?host`** runs the extension's plumbing in the page as well: the shell's
  `registerModelerEditor` with the extension's own `boardEditorOptions`, against
  `createVsCodeHostStub()` and a `createMemoryBackend` that holds the example folder (the web app's
  `EXAMPLE`) and the board file itself, as `example.board`. The board file's text is the stub's
  document `/repository/example.board`. What the page posts reaches the panel, and what the
  extension posts comes back as a `message` event on the window. So the board file's sync, the
  files server, its rule and the protocol are the real ones. **The VS Code backend is not in the
  page**: the files are in memory, and what the VS Code backend does is held by its unit tests
  alone. So are the commands, the entries of the Problems view and the setting that saves the
  models with their board: `src/boardEditor.ts` adds them with `vscode` itself, and the shell's
  stand-in has no save events (its `save()` is a change event without a content change), no list
  of open documents and no `TextDocument.save()`, so a save of the models cannot be made on it.
- **The count of problems.** The registration of the test page hands the shell `diagnostics`
  whose `refresh` counts the board text's problem with `boardProblem` of `src/problems.ts`, the
  function the extension's Problems entry is made from, which imports no `vscode`. So the page's
  problems pill is told what the real extension tells it: one problem for a text the board's
  reader refuses, none for a valid one.
- **Without `?host`** the page posts the document itself, as the extension answers `ready`, and
  nothing answers for the files.
- **`?board=empty`** opens an empty file, as somebody just created it. **`?root=none`** takes
  `#app` out before the webview runs.
- **On `window`**, for the tests and never in the shipped bundle: `vscodeHost` (`host`, `document`,
  `panel`, `backend`, `shown`, and `deliveries` with `hold()` and `release()`, which keep what the
  extension posts on its way until a test lets it through), `webview` (the entry's export),
  `editor` (once mounted), `webviewReady` (once the first text was imported or refused),
  `webviewStateWrites` (every state the page handed to `setState`, in order), and the stub as
  `__modelerShellVsCodeStub` (what the page posted, its CSP violations and errors).
- **The webview's state over a reload.** VS Code keeps what a webview hands to `setState` and
  gives it to the next page of the same editor. The shell's stub keeps it for one page (its
  `state` option is what `getState()` answers first). So the test page keeps it itself: it wraps
  the stub's `acquireVsCodeApi`, writes every `setState` as JSON into the tab's session storage
  (`webview/kept-state.ts` has the key, for the page and for a spec that seeds it) and hands the
  stub what is there when it is installed. A reload of the page is then the reload of a webview,
  and a new tab starts with nothing.
- **Something to show a file in.** With `?host` the backend the extension's options get is the
  repository in memory with a `showFile` that writes the path into `vscodeHost.shown`: VS Code
  has editors to show a file in and a repository in memory has none. So the page is welcomed by
  a host that shows files, and a card has its button.

`e2e/playwright.config.ts` has the project `vscode-webview` (`**/vscode/**/*.spec.ts`,
http://127.0.0.1:5194). `tests/vscode/support/webview.ts` has what the specs share. 26 tests:

- `document-sync.spec.ts` (4), the board file through the extension's real plumbing: the init shows
  the example inside the shell with seven models ready, the picker's seven entries and the picture,
  and writes nothing; a click on Group is one applied edit of one added line, and the document's
  undo brings the canvas back to the fixture; an invalid text locks the board and names the line,
  the shell's problems pill says "1 problem" clear of the board's toolbar, of the status box and
  of the zoom panel, a real click on it while the board is locked runs
  `workbench.actions.view.problems` once, and a valid text unlocks the board and takes the pill
  away; an empty file shows the hint, and its first note is one edit that writes the header too.
- `files.spec.ts` (13), the files of the repository: a model armed by a real double-click and
  changed by a real click and key is one write of that file and none of the board file; the undo
  key inside the armed editor undoes there and a bubbling listener on the window sees nothing,
  while on the board's pane the key reaches the window unprevented; a change from outside shows in
  the node and nothing is written back; an edit made while the extension's word of an outside
  change is still on its way is dropped whole, the file keeps the outside's text, the node shows
  it and says the sentence of a crossed change, that node alone, until the next edit lands on
  version 2; the board file is in the repository and is never a file
  of the files; the picker follows a file that comes later, and a picked model is one line more in
  the board file; files that move in the repository (a picture's node and a model's node each
  get the new path as one edit of one line of the board file, no file is written for it, the
  picture is drawn again, and the model is still edited in place, in the file it is now); a
  renamed folder (the seven models of `models/` each get their new path as one edit of one line,
  all seven stay ready and none says that its file is gone, no file is written, and the board's
  own history still holds the one gesture made before the moves, which its undo takes back while
  every new path stays; the stand-in's undo of the document then takes back one edit at a time,
  and the one that puts a node's old path back leaves that node saying that its file could not
  be opened until the redo); a
  picture picked through the Image button is stored under `assets/` and its node
  is one edit; a picture pasted as VS Code pastes, on the body, is the board's while the pane has
  the focus and nobody's with the focus nowhere or on the shell's menu; the teardown ends the
  board first (a label still being typed in lands in its file,
  each of the seven editors closes its file, then the port is closed); a page nobody answers still
  shows the board, its models waiting; a page without `#app` says why and keeps no files open.
- `shipped-bundle.spec.ts` (2), the webview as the VSIX ships it: the spec builds `apps/vscode` for
  production itself (`node esbuild.config.mjs --production`, once for the file, so it overwrites
  `apps/vscode/dist`) and opens it through the shell's `openWebviewBundle` with the editor's own
  options, behind the document and the policy the extension writes. There is no dev server and no
  plumbing in the page: the test answers `ready`, `board.hello`, every `board.text.open` and the
  picture's `board.bytes.read` as the extension would. The page stands before any answer; then
  seven models are ready, the picture is drawn, Geist is loaded from `dist/fonts`, and the stub
  recorded no CSP violation and no error. An edit there is one `board.text.edit` and no `edit` of
  the board file. Since `PROTOCOL` 3 the test answers the hello as the extension does, with the
  welcome and then the list.
- `view.spec.ts` (3), the view in the webview's state: a real wheel of twelve ticks is kept in
  fewer than six writes, none of them the fit and none equal to the one before it; the reloaded
  page comes back to that view and writes nothing, and the next view is one write more; a kept
  view far beside the board is left for the fit, a view of the person's own then takes its place
  beside the other keys of the state, and a state that is no object is nothing kept; and a kept
  view that lies inside the box around the board and shows none of its nodes (the corner of
  the example's second row that has no model, at 200 %) is left for the fit as well.
- `drop.spec.ts` (3), a file dragged onto the board with Shift held, as real input: a picture
  let go on the pane, a file let go inside an armed editor, and the row of the shortcuts dialog
  (under "A dropped file" above).
- `card.spec.ts` (1), a file no notation of the suite covers: its node, written into the board
  file as a text editor would, is the host package's card and no failed file; a real click
  where "Open in its editor" stands, on a node that is a preview, is one `board.file.show` for
  that path, which reaches the backend; the card then says "Opened in its editor."; the page
  asked for neither the text nor the bytes of that file, the picker does not offer it, and
  nothing is written into the board file.

The only notation that is edited in these specs is Wardley Maps; all seven are shown. Without a
test here: a real paste (Playwright's file chooser stands in for the dialog, and a paste is
an event the test makes), a second board, a dark or high-contrast
theme, what VS Code itself does with a dragged file and with a webview's state, and everything
the VS Code backend does, which the page does not run: that runs in the
smoke, in a real VS Code.

Run once as a probe and not kept: a board file whose lines stand in another order than the
canonical one (after a hand edit or a merge that moved lines) is shown without a write, and the
first change on the canvas is then one edit that replaces every line between the first and the last
that differ (lines 1 to 13 of the example). The answer to the hello is needed only by the picker:
with it lost, the models and the picture still open, since a node asks by its path.

### The smoke in a real VS Code (`test-smoke`)

`apps/vscode/test-smoke/vscode-smoke.test.ts` runs the packed extension in a real VS Code, on the
shell's `runVsCodeSmoke`. It packs the VSIX itself (or takes the one `VSCODE_SMOKE_VSIX` names, as
a release does), unpacks it and hands VS Code that folder, so the extension's files are the
VSIX's, without `node_modules`. To VS Code it is still a development extension: the driver starts
it with `--extensionDevelopmentPath` and writes `workbench.editorAssociations` for the fixture,
and such a window keeps no backups of unsaved files. What an installed extension does differently
is the last point below. `npm run board test:vscode` runs it where there is a display,
`npm run board test:vscode:docker` in the suite's Docker runner; `VSCODE_VERSION` picks the VS
Code, `VSCODE_SMOKE_KEEP=1` keeps the profile and its logs. Its config is apart from the unit and
the browser project (`test-smoke/vitest.config.ts`), and `test-smoke/board-steps.ts` has what it
does on the board.

- **The workspace is the example.** The fixture is `example/example.board`, and the driver writes
  the example's seven models and its picture beside it (`fixture.files`; the picture is an SVG, a
  text). The folder has no `.git`, so the folder VS Code opens is the board's root.
- **The driver's steps, as the board takes them.** `parse`: the saved text must be one
  `parseBoardText` accepts. `themes: ["light"]`. `chrome: ["menu", "zoom"]`: the board has a
  toolbar of its own and no palette of the shell's. `ready`: the board's toolbar is there and every
  model node's editor says `data-embed-state="ready"`, seven of them. `edit`: a click on the
  toolbar's Group button. The save step then reads the file, and the undo step presses the undo
  key and saves again: the file must be the fixture's text byte for byte, which is what holds that
  the key reaches VS Code's document from the board. The driver's own comparison in those steps
  counts the shapes of diagram-js canvases, which on a board are the models' previews: a change of
  the board moves none of them, so that comparison holds whatever the board does. The themes step
  switches VS Code through its four default themes and takes a screenshot of each into
  `test-results/vscode-smoke/board-<theme>.png`: the board stays light under each.
- **Three steps of the driver are off**, each with its sentence in the test: `keys` (it focuses
  the first diagram-js canvas of the page and selects and copies its elements, and on a board that
  canvas is the inert preview of a model), `history` (it reads the view and the selection of a
  diagram-js canvas across a redo and an undo) and `workbench` (motion, hidden and reload read a
  diagram-js view as well: the board keeps its own view across a reload since the fourth
  increment, and the step reads the view of a model's preview).
- **The custom step** holds what only a real VS Code with a real folder shows, in seven parts,
  each a function of `board-steps.ts` that says in its failure what was there in its place.
  Every model is drawn by its own modeler (each engine has shapes with a box) and the picture's
  bytes arrived. The picker offers exactly the seven models of the folder, lists a model in a
  folder that another program makes, and drops it when that folder is removed: VS Code's search
  and its watcher, which names such a folder and none of its files. A model that is armed by a
  real double-click and changed by a real click and the Delete key turns up as a dirty tab of its
  own (`tea.owm`), while the board's tab stays clean and the file on disk keeps its text. With
  the fourth increment, four more. **The undo key inside the armed model stays there:** the
  board document is given an unsaved change of its own first, a group, so a key that reached VS
  Code would take the group away; the key brings the deleted shape back, the group and the
  board's unsaved state stay for half a second of looking, and the same key on the board after
  Done takes the group back and leaves the board's tab saved. **The model is saved in its own
  tab** by the save key: the file has lost the line of the deleted component and kept another,
  and the board's tab is still saved. **A rename in the Explorer moves the node's path:** the
  arrow keys take the Explorer's focus to `tea.owm` (a click on a file would open it), then F2,
  the new name and Enter; the file has its new name on disk, the board's tab is unsaved, all
  seven models are still ready and the node still draws its model; saved, the board file names
  the new path for the node and is a text the board's reader accepts. **The saved text is one
  its notation reads:** the smoke has no reader of another modeler and the webview has every
  one, so the text the save wrote is written into a second file as another program would,
  picked onto the board, and drawn there by that notation's own modeler with the shape that
  was kept and without the one that was deleted. It comes last because it changes the board
  document. The step ends with a screenshot, `board-renamed.png`.
- **Run, in the Docker runner on the machine the increment was built on:** VS Code 1.146.0 (the
  newest stable the runner took by default): 1 test passed, the smoke's own total 10.8 s, the
  whole container run 25 s with the image and VS Code cached. VS Code 1.96.0, the manifest's
  minimum: passed, 11.9 s; there the driver found the file opened as text first and opened it
  again from the Explorer, twice. With the packed VSIX (`VSCODE_SMOKE_VSIX`, on 1.146.0): passed,
  12.1 s, no build in the run. The screenshots show the board inside the shell (the menu trigger,
  the board's toolbar beside it, the zoom panel), the group with the picture and the two notes,
  and the seven models drawn in two rows, nothing cut and nothing twice; under the two
  high-contrast themes the nodes have the stronger outlines. VS Code's own toast "It is not
  recommended to run Code as root user." lies over the zoom panel in some of them: the runner is
  root.
- **Run again with the third increment**, on a snapshot of the tree without any build output,
  after the runner's own `npm ci`: VS Code 1.146.0 passed (the smoke's total 10.6 s, the container
  run 24 s), and so did 1.96.0 (10.9 s). The VSIX the smoke packs there carries the notices, so
  the production build with its notices ran in the container as well. The screenshots show what
  they showed before.
- **Run with the fourth increment**, each run on a fresh snapshot of the working tree, on
  2026-11-16, and once more each on the tree as the walk left it: VS Code 1.146.0 passed (the
  smoke's total 22.9 s, of which the custom step is 14.7 s; the container run 37 s), 1.96.0
  passed (27.0 s; the driver opened the file from the Explorer twice first, as before), and the
  packed VSIX on 1.146.0 passed (22.2 s, no build in the run). `board-renamed.png` shows, on both versions, the Explorer with `models` open and
  `tea-renamed.owm` and `tea-as-saved.owm` in it, the board's tab with the dot of an unsaved
  change and the tab `tea-renamed.owm` beside it, the first model node selected with the header
  `tea-renamed`, and the seven models and the picture as before; the node of the second file
  lies below the visible part. The four theme screenshots show what they showed before.
- **Run with the closing round of the fourth increment**, on 2026-11-16, each run on a fresh
  snapshot of the tree as the round left it: VS Code 1.146.0 passed (the smoke's total 22.3 s,
  the custom step 14.4 s, the container run 36 s) and 1.96.0 passed (26.8 s, the custom step
  17.8 s; the driver opened the file from the Explorer twice first, as before). The round
  added no step to the smoke: what it changed was seen in the runner by the review's and the
  builders' walk scripts ([the review](#the-review-of-the-fourth-increment-in-a-real-vs-code)).
  `board-renamed.png` shows what it showed before on 1.146.0; on 1.96.0 the Explorer lists
  `tea-renamed.owm` and not yet `tea-as-saved.owm`, which the smoke had read again by then.
  Not run again: the packed VSIX given to the smoke.
- **It can fail.** Run once on a snapshot whose index watched files alone, as it did before the
  walk: "after that folder was removed the picker should offer … it offers
  made-later/one.owm, …", exit 1. And twice for the fourth increment's steps, each on a snapshot
  with one edit. With the undo keys of an armed editor not contained, which is
  `containHistoryKeys: false` in the webview's entry: "Control+z inside the armed model should
  leave the board document alone: it shows 1 groups where 2 were, and the tabs are:
  example.board, tea.owm (dirty)", exit 1. With the index telling no move: "a renamed model
  should leave example.board unsaved, with the node's new path: the tabs are example.board,
  tea-renamed.owm (after 30 s)", exit 1.
- **Not run:** `npm run board test:vscode` outside the runner, and CI's job `vscode-smoke (board)`,
  which calls it under `xvfb-run` on VS Code stable and on the minimum.
- **Installed, as a person gets it.** No step of the smoke: seen by a review in the same runner,
  on VS Code 1.146.0, in scratch. `code --install-extension apps/vscode/board-modeler.vsix`
  printed "Extension 'board-modeler.vsix' was successfully installed.", the extension was listed
  as `miragon-gmbh.board-modeler@0.0.0`, and VS Code was started without
  `--extensionDevelopmentPath` and without an editor association on a copy of the example folder.
  Opened from the Explorer, `example.board` showed the board within 1.0 s: seven models ready,
  the picker's seven entries, the picture, both Geist faces. Two things differ from the smoke's
  window. **A `.board` file given on the command line at the first start after the install
  opened as plain text**, for the whole 60 s that were waited (two runs); closed and opened from
  the Explorer it was the board, and after a restart the restored tab was the board's editor.
  Nothing in the manifest differs from Business Model Canvas's in what decides this (one
  `customEditors` entry, priority `default`); whether every custom editor of the suite does the
  same, and a second start with a path, were not looked at. **Unsaved models survive a reload
  there**: a model edited in place (its unsaved tab came after 840 ms, the file on disk as it
  was) was still unsaved and still showed the edit after Developer: Reload Window and after a
  quit and a start, which is VS Code's hot exit. The runner's development window dropped four
  unsaved models at a reload without a question. So nothing the smoke or the walk saw about a
  reload says what a person's window does with unsaved models.

### Taken for granted about VS Code

Everything here was read from VS Code's typings and its source at 1.96.0, or from the plan, and
built into the fake the host half is tested against. It was then walked through in a real VS Code,
item by item: each item says how it ended. **Seen**: VS Code does what was assumed. **Differs**:
it does something else, and the item says what was changed for it. **Not reached**: the runner
could not make the situation, and the item says why; these are left for a walk by hand.

The walk was a scratch script that is not in the tree. It ran the packed extension through the
shell's smoke driver in the suite's Docker runner, with real mouse and keyboard input, the test
writing into the workspace folder as another program would, and a probe beside the extension in
the extension host: the unpacked VSIX's `main` pointed at a wrapper that activated the real
extension unchanged, wrote down what VS Code told it (documents, saves, tabs, file events, the
messages between the extension and its page) and ran what the walk asked of the `vscode` API. It
ran on **VS Code 1.146.0** (Chromium 150, Electron 43) and on **1.96.0** (Chromium 128, Electron
32), on Linux, as root. "Both" below means both versions; where only one is named, the other was
not looked at for that item. The script ran in three whole passes and seven partial ones on
1.146.0 and in one whole pass on 1.96.0, all on 2026-11-15. An item's outcome was the same in
every pass that looked at it after the last change the item names, unless it says "once". A thing
that was looked at there and is no step of the smoke is **seen once in scratch**, which is all of
the walk but the three parts of the smoke's custom step.

Documents:

1. `openTextDocument(uri)` hands out the document VS Code has, with its unsaved text, or reads the
   file. **Seen** (both): a model whose document had an unsaved line was picked on a board, and
   its node drew the unsaved component while the file on disk did not have it. That it rejects for
   a missing file was not looked at: the backend asks `stat` first, and that rejects (17).
2. VS Code lets go of a clean document that no editor shows, about 3 minutes after the last
   `openTextDocument`. **Seen** (both): for both models a board only showed, the close event came
   180.0 s after the open (opened at 1.3 s, closed at 181.3 s), `isClosed` was true, and the next
   edit in place opened the document anew and landed. The limit of about 50 references was not
   reached.
3. `TextDocument.version` is 1 for a document just opened, one more with every change and 1 again
   after a close and a reopen. **Seen** (both). One `applyEdit` is two events: one with the content
   change, in which `isDirty` is still false, then one without a content change for the dirty
   state.
4. A dirty document is never let go of, and `applyEdit` on a file no editor shows makes it dirty
   and saves nothing. **Seen**: after an edit in place the file on disk was unchanged and the
   document dirty (both), and a dirty document was still open 234 s after its `openTextDocument`
   (1.146.0, once). **The tab** the plan expects: VS Code opens a text editor tab for the document
   about 800 ms after it turned dirty (802, 803 and 892 ms measured, both): in the board's editor
   group, in the background, not as a preview. The board keeps the focus and the model stays
   armed. With the notation's own extension installed that tab may be its custom editor: not
   looked at, the runner's VS Code has the board's extension alone.
5. A clean open document is read again when its file changes on disk, with a change event that has
   content changes; a dirty one keeps its text. **Seen** (both): the node followed a write by
   another program in about 130 ms; with an unsaved change in the document nothing was told and
   the node kept it. Saving that document then fails: `save()` resolves false and VS Code shows
   "Failed to save 'second.owm': The content of the file is newer. …". It notices by the file's
   time and size: a change on disk to a text of the same length was saved over without a word
   (1.146.0, once).
6. The clean document of a deleted file is let go of. **Differs** (both): the document stays
   open, with no close event, also 2 s later. The node still says that its file is gone, by the
   watcher's word, and shows the file again when it is back, since VS Code reads the open document
   again. The fake was changed (a removed or moved file keeps its document; a file a person
   renames in the Explorer has its clean document let go of, which was seen in 14), and
   `test/memory-vscode.test.ts` holds both. A dirty document of a deleted file was not looked at.

Edits and events:

7. `workspace.applyEdit` carries the version the extension host knows; if the document changed
   meanwhile it resolves false and changes nothing; for a file the extension host has no document
   of, it is applied to whatever the file has. **Seen** (both): of two calls in one tick on the
   same lines the first resolved true and the second false, and the text had the first alone (VS
   Code writes "… has changed in the meantime" into its developer console); an edit of a file
   without a document resolved true and left a dirty document at version 2. **The refusal of a
   stale edit as the page meets it** was made too (both): the extension's word of an outside
   change was held on its way to the page, at VS Code's own `postMessage`, while a real key
   deleted a component in the armed editor. The page's edit arrived with version 1 against the
   server's 2 and was dropped whole: the document kept the outside's text throughout, the node
   showed it once the word was let through and stayed armed, and the next edit landed on version 2.
8. The change event of an own `applyEdit` reaches the extension host before its promise resolves.
   **Seen** (both): event with the change, event for the dirty state, then the resolved promise.
   Two quick edits of a model in place both landed, and nothing was undone or posted back.
9. `onDidChangeTextDocument` fires with empty `contentChanges` for a save and for a change of the
   dirty state, and with content changes for typing, undo, redo, revert and a reload. **Seen**
   (both), with `reason` Undo and Redo for those two. A model saved in a text editor beside the
   board posted nothing to the board; a revert reached its node.
10. An inserted `\n` is written as the document's line break, and the shell's echo test recognises
    it. **Seen** (both): a CRLF model edited in place was one change whose text carried `\r\n`,
    nothing was posted back, and the saved file had 17 CRLF and no lone LF.

The search, the watcher, the file events:

11. `findFiles` with a `RelativePattern` searches below a root that is no workspace folder and
    takes a brace group with a dot inside. **Seen** (both): a board with a `.git` above the folder
    VS Code had open listed the models of the whole repository and none of `node_modules`; the
    typings' sentence "Will return no results if no workspace folders are opened" does not hold
    for a pattern with a base. `porter.vc.json` is found by the brace group (the smoke's picker).
    **Differs:** the search reads a suffix by its letters as they are, so `X.OWM` is not found on
    Linux, though the rule of what a board shows takes it. The index now lists what a search
    finds and never such a file, which still opens for a node that names it. The search follows
    links: it finds a link to a file and the files below a linked folder. That `files.exclude`
    stays in force was not looked at.
12. A watcher on a `RelativePattern` names a created, a changed and a deleted file below the root,
    also outside the workspace folders. **Seen** (both): the picker and an open node followed
    within about 250 ms, for a root above the open folder too. A new link is named like any
    entry, whether it leads to a file or to a folder.
13. What a watcher names for a folder that another program removes or moves. **Differs** (both)
    from what the fake said (every file for `rm -r`): VS Code names the folder alone. `rm -r` is
    "deleted" for the folder, `mv` is "deleted" for the old name and "created" for the new one, a
    folder moved into the repository is "created" for the folder, and none of these names a file,
    so a watcher whose glob matches file names hears nothing at all. A file written right after
    its folder was made came with a change as its first word, or with no word. The picker kept
    the files of a removed folder and never showed those of a new one. **Changed:** the index
    watches every entry below the root, drops what is at or below a path that went, lists a file
    whose first word is a change, and asks what a new entry is and searches again where it is a
    folder ([The host half](#the-host-half)); the fake names folders as VS Code does; eight tests
    of `file-index.test.ts` and the smoke's custom step hold it. Seen afterwards (both): the
    picker follows a folder that is made and filled, one that arrives full, one that is moved
    and one that is removed.
14. `onDidCreateFiles`, `onDidDeleteFiles` and `onDidRenameFiles` fire after what a person does in
    the Explorer, once for a folder, and not for another program. **Seen** (1.146.0): a folder
    renamed with F2 in the Explorer was one rename event for the folder, the picker had the new
    paths 152 ms later, and the node of the old path said "This file is gone. The board keeps its
    place."; VS Code let go of the document at the old path and opened one at the new. A folder
    deleted there was one delete event, and the picker followed in 11 ms. None of these events
    came for what the walk did to the disk itself. A file created in the Explorer was not tried;
    on 1.96.0 the walk's click did not find the folder in the Explorer's list. The walk of the
    fourth increment made the renames on both versions
    ([items 1 and 2](#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code)).
15. `onDidChangeWorkspaceFolders` in a multi-root workspace. **Not reached:** the runner's VS Code
    opens one folder. A call of `updateWorkspaceFolders` there answered true and changed the
    extension host's own list at once, while the window kept its one folder and no event came, so
    a board whose list empties when its folder leaves the workspace is still to be seen in a
    window that was opened on a `.code-workspace` file. A review tried it again with the same
    outcome; a board in the added folder did open there and listed that folder's model.

The disk and the panel:

16. `workspace.fs.stat` of a link to a file has the `SymbolicLink` bit and the target's size; of a
    file reached through a linked folder it is a plain `File`. **Seen** (both): type 65 with the
    target's size for a link to `/etc/hostname` and for a link to a model beside it, and the node
    read "models/link.owm is a link, and a board opens no link"; a model below a linked folder
    was type 1 and opened. That was a way out of the repository, and a review walked it (both): a
    model behind `out -> /tmp/…` was read and then written into a dirty document, and a picture
    there was read. **Changed:** the backend asks every folder on the way to a file, and a linked
    folder is type 66 to `stat` ([The host half](#the-host-half)). Seen afterwards (both): a model
    and a picture behind a linked folder are refused at every depth, no document of such a file
    is opened, a node that names one says "… is behind a link, and a board opens no link", and a
    model behind plain folders opens. A link to a file and a file behind a linked folder are in
    the picker's list, since the search follows links and the index asks nothing about a file it
    lists; picked, each is refused.
17. `stat` rejects for a missing path, also for `.git` asked in every folder above the board,
    without a prompt or an error shown. **Seen** (both): `EntryNotFound`, no toast, and no error
    in the extension host's log. `permissions` has `Readonly` for a read-only file: **differs**
    (both). A file whose mode forbids writing has no `permissions` at all; VS Code keeps that as
    `Locked` to itself and takes an edit of the file. `Readonly` is what a read-only file system
    says, which is what the fake's `readOnly` now stands for. What the save of such a file does
    for a person who may not write it was **not reached**: the runner is root, and the save went
    through.
18. `fs.createDirectory` and `fs.writeFile`. **Seen** (both): in a repository without an `assets`
    folder the folder was made and the picture stored; a second picture of the same name became
    `pixel-2.png` and the first was as it was.
19. `openTextDocument` of a file that is no text. **Seen** (both): it rejects, and the node says
    "models/binary.owm cannot be read as a text".
20. A custom editor on a `git:` URI. **Seen** (1.146.0): a board opened on the `git:` URI of its
    committed version, through the Git extension's API, had no files: its nodes said "this board
    is in no repository and in no open folder, so it has no files" and its picker was empty. The
    diff of the Source Control view was not opened.
21. A panel that is disposed. **Seen** (both): a tab closed in the task that pressed Delete in an
    armed model, and the edit landed in the model's document, with no error in the extension
    host's log. That `panel.webview` throws afterwards, and the shell's unguarded `resync()`, the
    walk did not reach; a review did (both), with a second board and, in one task of the
    extension host, an outside `applyEdit` on the board document, the page's `edit` and
    `panel.dispose()`. VS Code refused the page's edit ("… has changed in the meantime"),
    `panel.webview` threw "Webview is disposed", and the promise of the shell's message handler
    was rejected with that. Nothing else followed, and the document kept the outside's text. The
    cure is the shell's ([Deferred](increments.md#found-while-the-increments-were-built-and-not-changed)).

The webview:

22. The extension activates from the VSIX, unpacked and without `node_modules`, and its webview
    loads the script, the sheet and the fonts under the real origin and policy. **Seen** (both,
    and with a VSIX packed beforehand): the page's origin is `vscode-webview://…`, Geist Variable
    and Geist Mono Variable are loaded and are the toolbar's font, and VS Code's console had no
    error and no violation of the policy. A review tried the policy from inside the page (both):
    `eval` and `new Function` throw; a string timer, an inline script, an inline handler, a script
    from a blob and a second script from `dist` without the nonce do not run; `fetch`,
    XMLHttpRequest, WebSocket and `sendBeacon` are blocked; an image, a font, an `@import` and an
    iframe from another site are blocked, while `data:` and `blob:` images load; a workspace
    file and `extension/readme.md` asked through the resource origin are refused, `dist` being
    the only root; a second `acquireVsCodeApi` throws. One thing is open: a `<base>` element takes
    effect, since the shell's policy has no `base-uri` ([Deferred](increments.md#found-while-the-increments-were-built-and-not-changed)). The extension
    was also installed there as a person installs it
    ([The smoke in a real VS Code](#the-smoke-in-a-real-vs-code-test-smoke)).
23. A custom editor in a hidden tab reports a slot of 0 x 0. **Differs**, and by version. In
    1.146.0 a board behind another webview keeps its size; behind a text editor its page is 300 x
    150, VS Code's stand-in, and a ResizeObserver fires when it is covered and when it is shown.
    In 1.96.0 it keeps its size in both cases. A custom editor that is opened in a background tab
    has no page at all until the tab is shown. No hidden board was ever 0 x 0. **What that
    broke:** a board whose first valid text came while a text editor covered it (a broken file,
    repaired in the editor of the same file) was fitted into 300 x 150 and stayed tiny in a corner
    when shown. **Changed:** the first fit waits for an animation frame
    ([The board inside the shell](ide-editor.md#the-board-inside-the-shell-appside-editor)); seen afterwards
    (both): fitted when shown. A board that is hidden and shown again keeps its armed model, its
    selection and its view; the focus is on the body then, so the armed editor has the keys
    again after a click in it.
24. `requestAnimationFrame` stands still in a hidden webview. **Differs** by version. 1.146.0: no
    frame in 4 s behind another webview and none in 2.5 s behind a text editor. 1.96.0: none
    behind a text editor, and 241 frames in 4 s behind another webview, so the poll of
    `view-events.ts` goes on there at the display's rate. In every case `document.visibilityState`
    stays `visible` and no `visibilitychange` fires: the poll's stop on that event never happens
    in VS Code.
25. Where the focus is after the editor opens. **Seen**: in 1.146.0 the board opened with the
    window, the webview had the focus, and Control+Equal before any click moved the shell's
    readout from 52 % to 74 % and left VS Code's window zoom alone. In 1.96.0 the driver opened
    the file by a click in the Explorer, which keeps the focus there: the same key zoomed VS
    Code's window and the board stayed. The shell's keys are the board's once the webview has the
    focus.
26. The undo key. **Seen** (both): inside an armed editor Control+Z undid in the editor, never
    reached the window, and the board document kept its text and its version; on the board's pane
    it reached the window, VS Code took it, and the board document was undone (`reason` Undo)
    while the model was left alone.
27. The Image button's file dialog, a paste and a drop inside a webview. The dialog: **seen**
    (both), as far as Playwright stands in for it: the page may open a file chooser, and the
    picked picture is a file under `assets/`. A paste: **differs** (1.146.0). VS Code keeps the
    paste key from the page and pastes by a command of its own, whose event lands on `<body>`
    whatever has the focus, where a browser aims it at the focused element (seen in plain
    Chromium); the board takes a paste that is aimed at it, so a pasted picture went nowhere.
    **Changed:** `src/webview/paste.ts` aims such a paste at the focused element, held by an e2e
    test; seen afterwards (both): a picture pasted with the focus on the pane is
    `assets/image.png`. A drop: **not reached**, the runner has no pointer that carries a file. A
    drop event the walk made up was taken and stored; after it, and not after a picked or a
    pasted picture, the next double-click armed no model and the shell's Fit button took no click
    until a click on the pane (both, unexplained then, and no claim about a real drop). The walk
    of the fourth increment made a drop with the DevTools protocol's drag and saw why
    ([item 15](#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code)).
28. A reloaded webview. **Seen** (both), with Developer: Reload Webviews: a new document, the
    models ready again and the picture drawn, and an edit of the board and one of a model still
    landed. A tab moved into a new window was not tried.
29. The Chromium of VS Code 1.96 (128). **Seen**: the smoke passes on 1.96.0 with all seven
    notations drawn, and the walk ended there as on 1.146.0 but for 23, 24 and 25.
30. Whether the save key reaches the extension while the board document is clean, and what
    happens to a model that is dirty in a tab of its own. **Seen** (both): it does, and they are
    one document. The measurement is under [Saving, as measured](#saving-as-measured).

Seen beside the list, once in scratch: a `.board` file that another program rewrites while it is
clean is read again and the board shows the new nodes; a model above 2 MiB, a dot folder and a
model in `node_modules` end as the guide says (the last opens for a node that names it and is
not listed); an invalid board file locks the canvas with "… Line 4 is no JSON."; VS Code's toasts
lie over the shell's zoom panel while they show; and the extension host's log of a development
window has warnings of VS Code's own for every search and watcher ("Accessing a resource scoped
configuration without providing a resource is not expected. To get the effective value for
'search.useIgnoreFiles' …", "'files.watcherExclude'"), and no error.

### Saving, as measured

Item 30 of the list is a measurement for a decision that is the owner's: (a) a model edited on a
board is a dirty document the person saves, which is what is built; (b) saving the board's tab
also saves the models that board made dirty; (c) every edit of a model is saved at once. Nothing
of (b) or (c) was built when this was measured. Since the fourth increment (b) is a setting that
is off by default ([The host half](#the-host-half), Saving), and (c) is not built. Measured in the
walk, on VS Code 1.146.0 and 1.96.0 with the same
outcome (the auto save on 1.146.0 alone), with `editor.formatOnSave` on and a formatter of the
probe's own for `*.owm`:

- **The save key on a clean board.** Control+S with the board's tab active, the board document
  clean and a model dirty, with the focus in the armed editor and with the focus on the pane: VS
  Code saves the clean board document. `onWillSaveTextDocument` fires for it with the reason
  Manual, then `onDidSaveTextDocument`. Nothing is told about the model: it stays dirty, and its
  file is as it was. So (b) has its moment: the extension hears every explicit save of a board,
  dirty or not.
- **A model that is dirty in a tab of its own.** Typing in its text editor reached the board's
  node. An edit on the board then landed in the same document, which stayed dirty, with the file
  untouched. Control+S in its own tab saved all of it: will-save with the reason Manual, the
  formatter asked, did-save, the file equal to the document, and nothing posted to the board.
- **Save All** saved every dirty document, the models a board made dirty among them (each had
  its background tab by then): will-save with the reason Manual for each, the formatter asked for
  each, did-save for each.
- **A save from the extension.** `TextDocument.save()` on a model that was dirty in the
  background answered true, and `workspace.save(uri)` answered the URI. Both ran VS Code's save as
  a person's: will-save with the reason Manual, the formatter asked (so format on save and the
  other save participants run), did-save. Where the file on disk had changed meanwhile to another size, `save()` answered
  false and VS Code showed its toast "Failed to save …: The content of the file is newer. …".
- **Saved at once.** An edit followed by `save()` in the same task left the document clean, and
  VS Code opened no tab for it; a document left dirty got its background tab after about 0.9 s.
- **Auto save.** With `files.autoSave` at `afterDelay`, a model edited in place was saved by VS
  Code itself 1.2 to 1.3 s after the edit (will-save with the reason AfterDelay, no formatter
  asked), where the smoke's and the walk's own setting is `off`.

By reading and not run: a will-save listener has a time budget in VS Code, and a listener that
keeps exceeding it is ignored, so (b) would rather save the models after the board's did-save
than inside its will-save; and (b) needs to know which documents this board made dirty, which the
backend can say, since every write goes through it.

**With (b) built, as a setting.** What a real VS Code did with
`miragon.board.saveModelsWithBoard` off and on, on 1.146.0 and 1.96.0, is item 4 of
[Taken for granted for daily use](#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code):
the save key on a clean and on an unsaved board, a model also changed in its own tab, a model
whose file is newer on disk, Save All, a save within half a second of the edit, and both kinds
of auto save. Each ended as the measurement above let expect.

### Taken for granted for daily use, as seen in a real VS Code

What the fourth increment takes for granted about VS Code. It was built into the fake
(`src/files/memory-vscode.ts`, where each point is a sentence of `test/memory-vscode.test.ts`)
and then walked through in a real VS Code, item by item, as the list above was. **Seen**: VS
Code does what was assumed. **Differs**: it does something else, and the item says what was
changed for it. **Not reached**: the runner could not make the situation, and the item says why;
these are left for a walk by hand.

The walk was again a scratch script that is not in the tree
([A real VS Code in the Docker runner](#a-real-vs-code-in-the-docker-runner) says how it is
run): the packed extension through the shell's smoke driver in the suite's Docker runner, with
real mouse and keyboard input, the test writing into the workspace folder as another program
would, and the probe beside the extension in the extension host, which also wrote down every
message between the extension and its pages and could hold one on its way. VS Code's own dialogs
were its custom ones (`window.dialogStyle: custom`) and its file dialog the simple one
(`files.simpleDialog.enable`), since a native dialog is out of the driver's reach; format on
save was on, with a formatter of the probe's own for `*.owm`. It ran on 2026-11-16 on **VS Code
1.146.0**, in two whole passes and three partial ones, and on **1.96.0** in one whole pass, on
Linux, as root. Two of the partial passes ended behind a native dialog that nothing could
answer, and what they did after it is not counted. "Both" below means both versions. An item's
outcome was the same in every pass that looked at it unless it says otherwise. All of it but
the smoke's four new parts is seen in scratch.

1. **A rename is one event.** `onDidRenameFiles` fires once per gesture in the Explorer, after
   the files moved, with every renamed entry and a folder as one entry. **Seen** (both). A
   model renamed with F2 in the Explorer: one event with one entry, one `board.moved` to the
   page, the node had the new path 142 ms later and kept its editor (the same canvas element),
   its header followed, and the board document was unsaved with one edit of one line. The same
   through `WorkspaceEdit.renameFile`, the API a rename in VS Code goes through (21 ms). The
   folder of two models renamed with F2: one event for the folder, one `board.moved` with a
   move per model, both nodes kept their editors, and the board document had one edit per
   node. Two files renamed by one edit: one event with two entries. Two selected files dragged
   onto a folder with the real mouse: one event with two entries, told after both had moved.
   Two selected folders dragged: one event with two entries. A picture renamed: its node had
   the new path and the picture was drawn again.
2. **The rename comes before the watcher.** **Differs** for a drag of several entries. For one
   entry the rename event came first, 32 to 75 ms before the watcher's words (a file, a folder,
   a picture, two files of one edit, both). For two files dragged together VS Code moves one
   after the other and tells the event after the last: the watcher's words of the first file
   came 2 ms before the event on 1.146.0 in one pass and 14 ms after it in the other, and 12 ms
   before it on 1.96.0. The page then heard `board.text.gone` for that file before
   `board.moved` named both, and both nodes followed and were ready at the new paths. For two
   folders dragged together the event came first (60 ms on 1.146.0, 36 ms on 1.96.0). The
   watcher names a moved entry's new name before its old one, where the fake had the old one
   first. **Changed:** the index remembers which files a watcher's word took off the list and
   still tells them as moves ([The host half](#the-host-half), Files that move), so the files
   of a folder whose word comes early are followed too, which the walk did not need; the fake
   has `explorer.drag` and tells the watchers of what came before what went, and
   `test/file-index.test.ts` and `test/memory-vscode.test.ts` hold both.
3. **Unsaved text moves with its file.** **Seen** (both). A model with an unsaved edit made on
   the board was renamed in the Explorer: VS Code asked nothing, closed the document at the old
   URI and opened one at the new URI that was unsaved and had the unsaved text, while the file
   on disk had the saved one; the node kept its editor. With the setting on, a save of the
   board then wrote the edit into the renamed file. A clean document of an earlier name of the
   file was still among `workspace.textDocuments`.
4. **Who asked for a save.** **Seen** (both), with the setting off and on.
   - **Off.** Control+S with the focus in the armed editor, on a clean board and on one with an
     unsaved change: will-save with the reason 1 and did-save for the board alone; the model
     stayed unsaved and its file was as it was.
   - **On, a clean board and an unsaved one.** The board's will-save (1) and did-save, then the
     model's will-save (1), the formatter asked once, did-save; the file was the document's
     text. A model of the same board that was unsaved by another hand, and an unsaved text
     file, stayed unsaved.
   - **A model also changed in its own tab**, by typing there: saved whole, the typed line in
     the file.
   - **A model whose file is newer on disk.** The other model the board had edited was saved.
     For this one will-save and the formatter ran and no did-save came; it stayed unsaved, the
     file kept the other program's text, and VS Code showed its toast "Failed to save
     'tea.owm': The content of the file is newer. Please compare your version with the file
     contents or overwrite the content of the file with your changes." with Compare and
     Overwrite.
   - **Save All.** Every unsaved document was saved once: one will-save, one formatter call
     and one did-save each. The extension's own saves of the models added no second round.
   - **Saved within half a second.** A model edited and saved with its board 0.3 to 0.45 s
     later, before VS Code had opened a tab for it, was found and saved, and no tab came.
   - **Auto save.** With `afterDelay` VS Code saved the model and the board itself (reason 2,
     no formatter), and no save with the reason 1 followed. With `onFocusChange` it saved the
     board when another editor took the focus (reason 3), and the extension saved nothing; the
     model edited on that board stayed unsaved, since no editor of its own had lost the focus.
5. **The extension's own saves.** **Seen** as far as the saves go (both): two models saved at
   once by `TextDocument.save()` were both saved where both could be, and each looked Manual
   to a will-save listener. The guard itself was not reached by the walk, which built no file
   that one board's page wrote as a model and that is open in a board editor of its own with
   models it made unsaved. **Seen by the review** (both): `tea.owm` opened in the board's
   editor as well, its page with a write into `second.owm`, the first board's page with a real
   edit of `tea.owm`; Control+S on the first board saved the board and `tea.owm` and left
   `second.owm` unsaved, and the person's own save of `tea.owm` then saved `second.owm`.
   `test/saveModels.test.ts` and `test/boardEditor.test.ts` hold it on the fake.
6. **The Problems view.** **Seen** (both). A line that is no JSON, typed into the text beside
   the board (opened with the title button): 41 ms later the entry "Line 4 is no JSON. The
   board is read-only until you fix the text." with the source `board`, an error, at line 4
   from column 1 to the line's end, which the Problems view lists as `[Ln 4, Col 1]` under the
   file's name, the status bar counting 1. Undone in the text: the entry was gone. A `.board`
   file opened as a text alone got its entry too. Broken again, both tabs closed and the
   change thrown away (VS Code asked "Do you want to save the changes you made to
   problems.board?", Don't Save): VS Code closed the document about 35 ms after the panel
   went, and the entry was gone 0.12 to 0.15 s after the click. So the shell is handed no
   `clear`.
7. **Lines.** **Differs** (both). A document of VS Code never holds a carriage return that
   stands alone. When VS Code reads a file it makes every line break the document's one: a
   carriage return with a line feed where more than half of the file's breaks carry a carriage
   return, with or without its line feed, else a line feed (`one\ntwo\rthree\n` is read as
   `one\ntwo\nthree\n`, a file of lone returns as lines that end in `\r\n`, one `\r\n`
   and one `\n` as two `\n`). The document is not unsaved by it, a text an edit inserts gets
   the same break, a save writes the document's text, and a document that reads its file again
   takes the break of the new text. So the board's reader and VS Code count the same lines of
   the text the extension is handed, and the entry stands on the line the reader names. With
   a lone return inside the file's second line and a broken third line, the entry was "Line 2
   is no JSON" on the first half of that second line: that is where the document's text stops
   being a board. **Changed:** the fake reads, edits and reads again as seen (three sentences
   of `test/memory-vscode.test.ts`), `test/diagnostics.test.ts` holds the entry of such a
   file, and the comment of `src/problems.ts` says what its recount is still for. What follows
   for a board file that is valid on disk is under
   [Found in a real VS Code](#found-in-a-real-vs-code).
8. **The pill.** **Seen** (both), in VS Code's own webview: "1 problem" with the look of an
   error, at the bottom left of a board that was 460 px wide beside its text, clear of the
   board's toolbar, of the status box, of the zoom panel and of the menu; a real click on it
   opened VS Code's Problems view with the entry; it was gone when the text was valid.
9. **`vscode.open`.** **Seen** (both). A node on a `.bpmn`, a `.md` and a Structurizr `.dsl`
   file was a card each, without the failure look: the file's name, "in" its folder, "This
   board has no editor for this file." and the button. A real click on the button of a card
   that is a preview: one `board.file.show`, and the file opened as text in the board's own
   group, in front of the board, as a preview tab, which the next file that was shown took
   over; the card said "Opened in its editor."; the board document was untouched. For a link:
   "This file could not be shown. links/secret.md is a link, and a board shows no link"; for
   a file behind a linked folder that leads out of the repository: "… linked/inside.md is
   behind a link, and a board shows no link"; for a file that is not there: "…
   docs/nowhere.txt does not exist"; no tab in each. A double-click on a card armed it, moved
   the board to it at 100 % and showed the file once. Another extension's custom editor was not
   reached, since the runner's VS Code has the board's extension alone. **Seen by the review
   in kind** (both): a second custom editor, registered in the probe as the default for
   `*.rmd`, opened such a file from its card, in front of the board. Also seen there: a real
   double-click on the button (one show, one preview tab, the card armed afterwards), two
   clicks one after the other (two shows, one tab), a file removed between the card and the
   click ("… does not exist", no tab), and a `.board` file on a board, which opened in the
   board's own editor.
10. **Activation by a command.** **Seen** (both). VS Code was closed, its editors closed
    before, and started again on the folder: the extension was not active. "Board: New Empty
    Board" from the Command Palette then showed the dialog "New Board" on
    `<folder>/untitled.board`, and the extension was active. File › New File… listed "Board"
    and "New Board from Example", each with "Modeler Board" beside it (both, in a window with
    a board open; on 1.96.0 also in the fresh window before the extension was active; on
    1.146.0 the key of that list opened nothing in the fresh window). An empty board made that
    way opened in the board's editor as an empty file with its toolbar and the picker's
    models. **Not reached:** the dialog's filter Board (`*.board`), which VS Code's simple
    dialog does not show.
11. **New Board from Example.** **Seen** (both). In a folder of the open folder, with no
    repository above: the example's files beside the board, the nodes' paths with the folder
    in front (`ex/models/tea.owm`), seven models ready and the picture drawn, the note without
    its paragraph on the browser. In a repository's root (a folder with `.git`): the paths as
    the example has them, seven ready. With a `models/tea.owm` already there: that file was as
    it was, the board showed it, and one notification said "models/tea.owm was already there.
    It was left as it is, and the board shows it." Outside every repository and open folder:
    the files were written, and each of the seven nodes said "This file could not be opened.
    this board is in no repository and in no open folder, so it has no files".
12. **Open Source to the Side.** **Seen** (both). A real click on the title button of a board's
    tab opened its text in a second editor group beside it. From the Command Palette with the
    board focused: the same; with the text in front the palette did not offer the command.
    After Developer: Reload Window, from the palette: the same. A restored tab that was not
    resolved: with a text editor in front of the board's tab the window was reloaded, the
    extension was not active afterwards and the board had no page; a key bound to
    `board.openSource` then started the extension, showed the board's tab and opened its text
    beside it.
13. **The setting and the walkthrough.** **Seen** (both).
    `getConfiguration("miragon.board", boardUri).get("saveModelsWithBoard")` answered false
    before and true after the setting was changed, and the save followed it at once. The
    walkthrough "Get Started with the Board" opened with its description and four steps, the
    first open with its two buttons; "Create empty board" showed the dialog and ticked the
    step; "Open the setting" in the last step opened the Settings editor on
    `miragon.board.saveModelsWithBoard`, shown as "Miragon › Board: Save Models With Board"
    with its description. VS Code's Welcome page listed the walkthrough on 1.146.0.
14. **The webview's state after a reload.** **Seen** (both). A board was zoomed and panned,
    and after about a second: behind a text editor and behind another webview it kept its page
    and its view; after Developer: Reload Webviews it was a new page at the same view, to the
    pixel; after Developer: Reload Window, where the extension starts anew, the same; and
    after VS Code was closed and started again on the folder, the restored tab came back at
    the same view. **Differs where the board changed meanwhile** (the review, both): with the
    board file written from outside so that its nodes lay 30,000 px out on both sides, the
    reloaded webview came back to the kept view to the pixel, with none of six nodes in sight.
    **Changed:** a kept view is restored where it shows one of the board's nodes, each asked
    by its own box ([the board inside the shell](ide-editor.md#the-board-inside-the-shell-appside-editor)).
    Seen in the runner on the changed tree: with the nodes 4,000 px out on both sides the
    reloaded webview was fitted, with six of six nodes in sight (1.96.0); with them 30,000 px
    out the kept view was not restored either, and the fit, which cannot go below 10 %, showed
    the empty middle of the board (1.146.0), which is the fit's own limit and written down
    there.
15. **A dragged file needs Shift.** **Seen** as far as the runner's input goes (both): the
    drag of the e2e project, Chromium's own drag events through the DevTools protocol with a
    file of the disk, which is trusted input and no drag from a file manager. With Shift held
    the frame kept the pointer, the board showed "Drop to add an image", and the dropped file
    was `assets/walk-dropped.png` and one node, drawn; a double-click armed a model
    afterwards. Without Shift the frame had `pointer-events: none` from the `dragenter` on,
    the board showed no hint and stored nothing, and the frame had the pointer again only once
    the mouse had moved, which is the reading for item 27's double-click, seen now. A file
    dragged from VS Code's own Explorer with the real mouse: without Shift VS Code showed
    "Hold Shift to drop into editor" over the editor and took the drop (on 1.146.0 the file
    opened in a new group, on 1.96.0 nothing opened within 1.5 s); with Shift there was no
    overlay, and the board showed no hint and took nothing. **Not reached:** a drag from a
    file manager, and what VS Code does with a file that is dropped without Shift, which with
    this input opened no tab. A walk by hand.
16. **Every edit of the board document is a step of VS Code's undo.** **Seen** (both), as on
    the stand-in. After the folder of two models was renamed, the board document had one edit
    per node. Control+Z on the board's pane put one node's old path back: that node said
    "This file could not be opened. maps/b.owm does not exist", in the failure look, while
    the other still showed its model. A second Control+Z put the other one back, the board
    document was as before the rename and saved, and both nodes said so. Control+Y twice
    brought both back, ready. VS Code's API has no document edit that is no undo step, so
    nothing was changed. **Seen by the review** (1.146.0), with the person's own gestures
    around the rename: a group added, a model renamed, a second group added. The undo of the
    path lies between the two groups in VS Code's undo. After three undos the board document
    was not unsaved, its tab showed no dot, and its text named a file that is not there; saved
    in that state after a redo, a redo and an undo, the board file on disk named the dead path,
    and one redo put it right. The extension's README says so.

Seen beside the list, both versions:

- **A file another program moves** is gone for its node 0.13 s later ("This file is gone. The
  board keeps its place."), the picker offers it under its new name, and the node has its model
  again when the file is back.
- **Two boards open on one model:** a rename reached both, the one in a hidden tab too; both
  board documents were unsaved with the new path, the shown one kept its editor, and an edit
  made on one showed on the other.
- **A board that is not open** is not rewritten: its file still named `maps/a.owm` after the
  folder was renamed, and opened later its node said "This file could not be opened.
  maps/a.owm does not exist" under the header "a in maps".
- **The file of a card** is not followed: renamed in VS Code, the card kept its name, the board
  had no unsaved change, and its button then said "This file could not be shown. docs/notes.md
  does not exist".
- **Words for a dropped edit** (the lead's N8). Another program wrote a model's file while a
  component of the armed model was selected, the extension's word of it was held on its way to
  the page, and the Delete key was pressed: the page's edit was dropped as `crossed`, and 15 ms
  later the armed editor said along its lower edge "Your last change was dropped: this file
  changed elsewhere at the same time. Make it again on what you see now."; with the held word
  let through the model showed the other program's text with the component back; the next
  edit landed, and the sentence went with it.
- **The focus after a new board** (1.146.0): once New Empty Board had opened the board, the
  window's focus was on nothing, and F1 opened no Command Palette until a click. On 1.96.0 F1
  opened it. Seen with VS Code's simple file dialog, which the walk had to use; with the native
  dialog it was not looked at.

### The review of the fourth increment in a real VS Code

An independent review walked the increment a second time in the same runner, with the builders'
probe and two additions of its own (a hold on what the page posts, and a silent mode for
floods): six runs, one at a time, on VS Code 1.146.0 and 1.96.0. It made each thing the
builders had seen in another way, to lose a person's work or to overload the host. What it
found, and what the closing round of the increment did about it. "Seen again" is a run of the
same script in the runner on the changed tree, on 1.146.0 and on 1.96.0 unless one is named;
the four on saving and the held edit were run once more on both versions after the last change
of the record of written documents, with the same outcome. Seven runs of the runner for these
walks, one at a time, each on a fresh snapshot, and no VS Code on the machine itself.

- **An edit that crosses a rename was lost without a word.** With the page's edit held in the
  extension host until the rename was told, the deleted component was back on the canvas, the
  document of the new name was clean, and no node said anything (both). With nothing held, 3
  of 12 tries on 1.146.0 and 1 of 12 on 1.96.0 lost the edit; in two of them it sat in an
  unsaved document of the old name, whose file was gone. **Changed:** the node says that the
  change was dropped ([The host half](#the-host-half), Files that move). **Seen again:** held,
  the armed editor said the sentence along its lower edge (both); not held, 2 of 12 tries lost
  the edit on 1.146.0, both with the sentence, and none of 12 on 1.96.0. The document of the
  old name is not cured.
- **With the setting on, a board's save wrote a model whose only unsaved change was not the
  board's**: a component deleted on the board, the model reverted in its own tab, a line
  typed there, Control+S on the board, and the line was on disk (both). **Changed:** a
  document that was clean since is no board's. **Seen again:** the board alone was saved, the
  model stayed unsaved with its tab, and the line was not on disk.
- **With the setting on, a board saved no model after its tab was closed and opened again, or
  after the board file was renamed** (both). **Changed:** the record of what the boards wrote
  is the extension's and not an editor's. **Seen again:** in both cases Control+S on the board
  saved the model that had been edited before, after the board (will-save 1, the formatter
  once, did-save).
- **With the setting on, a board's save wrote again a model file that another program had
  removed** (both). **Changed:** a model whose file is not there is not saved. **Seen again:**
  the board alone was saved, the file stayed away, the document stayed unsaved, and the node
  went on saying that its file is gone.
- **A kept view was restored into empty space** where the board had changed outside. Changed
  and seen again as [item 14](#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code)
  says.
- **The number of edits that wait was not bounded**: 300,000 edits of 14 characters, posted by
  a page of the review's own, took the extension host's heap from 64 MB to 263 MB and four to
  five minutes to work off (1.146.0). **Changed:** at most 4096 edits wait
  ([The files port](files.md#the-files-port-packagesfiles)). **Seen again** (1.146.0): the
  heap stayed between 131 and 152 MB while the 300,000 came, behind a flood of 200,000 reads
  that had left it at 167 MB, and was at 60 MB twelve seconds after the last; 4,094 edits were
  in the document, and the extension host answered throughout.
- **A page could keep the active tab off the board for as long as it posted shows**: 600 shows
  of three files were all answered in 28 s, with the shown file in front at every look
  (1.146.0). **Changed:** one file is shown and one waits. **Seen again:** of 600 shows 2 were
  answered `board.done` and 598 "another file is being shown, try again in a moment", within
  1.1 s and with 4 tab events (both).
- **Held as the builders had it:** a save that fails leaves nothing half; no other board's
  and no other hand's document is saved; Control+S with a label field of Wardley Maps open
  and text typed but not committed saves the board, and with the setting on the model as the
  document has it, and the field keeps its text, caret and focus; a folder renamed twice with
  nothing in between, and a swap of two names in three renames, keep node, text and unsaved
  edit; a show cannot leave the root, enter a dot folder, follow a link, take another scheme
  or run a command (ten requests posted by the page itself).

The closing round also ran eleven phases of the builders' own walk again on the changed tree
(1.146.0; the five on saving and on a renamed unsaved model on 1.96.0 as well), for what the
changes could have broken, and each came out as the list above has it:
the setting off and on in its six cases (a model changed in its own tab saved whole, one whose
file is newer left unsaved with VS Code's toast, Save All one round, a model saved 0.3 s after
its edit), auto save in both kinds, a model renamed with F2 and through the API, a model with
unsaved text renamed and then saved with its board into the renamed file, a renamed folder
with its undo steps, two boards on one model, the cards with their buttons, the kept view
behind a text editor, behind another webview, after Reload Webviews and after Reload Window,
and the words of a dropped edit.

## Found in a real VS Code

The board's standing list is under [Deferred](../CLAUDE.md#deferred). This is the part of it that
a real VS Code showed, moved here from there.

**Found in a real VS Code, and not changed.** Each was seen in the walk
([Taken for granted about VS Code](#taken-for-granted-about-vs-code)); what the walk found and
cured is in the sections of the code it changed.

- **The poll of the view goes on in a hidden tab** in VS Code 1.96: a board behind another
  webview still gets its animation frames there (241 in 4 s), and in no version does the page
  hear that it is hidden. `view-events.ts` then reads `getViewState()` at the display's rate for
  every board in a background tab. The cure is the board's own view event (R1 of the plan), which
  waits for the owner's yes.
- **A link to a file, and a file behind a linked folder, are offered by the picker** and refused
  when picked ("… is a link, and a board opens no link", "… is behind a link, and a board opens
  no link"): the search follows links. Leaving them out of the list costs one `stat` per listed
  file and per folder on its way.
- **A `.board` file given on the command line at the first start after an install opens as
  text** (VS Code 1.146.0, the VSIX installed with `code --install-extension`, two runs by a
  review). Closed and opened from the Explorer it is the board, and so is the restored tab after
  a restart. Nothing in the extension is known to cure it; the extension's README says what to do.
- **A model that is edited in a narrow editor** is out of reach in part, and **a page can ask a
  host for more than it should**: see [The board inside the shell](ide-editor.md#the-board-inside-the-shell-appside-editor)
  and [The files port](files.md#the-files-port-packagesfiles).
- **A file that may not be written** is not read only to an extension: `stat` has no permissions
  for it, the edit is taken, and the save fails for the person. What that save shows was not
  seen, since the runner is root.
- **VS Code's toasts lie over the shell's zoom panel** while they show, for every modeler under
  the shell.
- **The focus after a tab was hidden** is on the body, so an armed editor has the keys again only
  after a click in it.
- **After a drop event the walk made up**, and not after a picked or a pasted picture, the next
  double-click armed no model and the shell's Fit button took no click, until a click on the pane
  (VS Code 1.146.0 and 1.96.0). Explained since: such a drag without Shift makes the workbench
  take the pointer from the webview's frame, which has it again once the mouse moved
  ([item 15](#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code)).

**Found in the walk of the fourth increment, and not changed** (VS Code 1.146.0 and 1.96.0
unless one is named):

- **Undo on a board takes a move back, node by node.** After a rename, each Control+Z on the
  board puts one node's old path back, and that node says that its file could not be opened
  until a redo; after as many as there are nodes the board document is saved again and names
  only files that are gone ([item 16](#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code)).
  The undo of a path is one step among the person's own gestures, so an undo can leave a board
  that looks saved and names a file that is not there. VS Code has no document edit that is no
  undo step. The extension's README names both under what it cannot do yet. One cure to
  weigh: the page writes the path again where an undo took it back to a file that the last
  told move left, which costs the redo stack and needs its own test.
- **The document of the old name keeps an edit that crossed a rename.** The node says that the
  change was dropped; the unsaved document of the old name stays as a tab, and VS Code asks
  about it when the window closes
  ([the review](#the-review-of-the-fourth-increment-in-a-real-vs-code)). The cure is a warning
  of the extension's own that names it.
- **A chain of renames in one event leaves a node on a path that does not exist** (on the fake
  alone; [The host half](#the-host-half), Files that move, has the exact change).
- **What a show answers tells a page which files are there**, outside the dot folders: "does
  not exist", "is no file", "is a link" and `board.done` differ. The page gets no content. One
  sentence for every failure would end it ([The files port](files.md#the-files-port-packagesfiles)).
- **A board file with a lone carriage return between two tokens** is a valid board on disk, for
  the board's reader and for designIQ's, and no valid board in VS Code: the document has a line
  break there, the board is locked, the Problems view says "Line 2 is no JSON", and a save
  would write the text with that break
  ([item 7](#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code)). No program is
  known to write a board like that; the cure would be a reader that takes a line break
  inside an element, which is a change of the schema model and of designIQ's reader with it.
- **A file that is shown opens in the board's own group, in front of the board, as a preview
  tab.** The board is one click on its tab away, and the next file a card shows takes the
  preview tab over. Beside the board would be `vscode.ViewColumn.Beside` as the command's
  second argument in `src/files/show.ts`: the owner's choice.
- **With auto save on a lost focus, a model edited on a board stays unsaved.** VS Code saves the
  board when its tab loses the focus and never the model, which has no editor that loses one,
  and the setting saves nothing with an auto save, as decided. The person saves the model, or
  uses auto save after a delay, which saves it.
- **The focus after New Empty Board** is on nothing in VS Code 1.146.0: F1 opens no Command
  Palette until a click. Seen with VS Code's simple file dialog alone, and not on 1.96.0. The
  command and the dialog are the shell's (`registerNewDocumentCommand`), for every modeler.
- **A drag of several entries may tell a file as gone before it tells its move.** The page
  copes ([item 2](#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code)); a node shows
  "This file is gone." for the milliseconds between the two.
- **The header of a card names the file up to its first dot** ("order" for `order.bpmn`, "notes"
  for `notes.md`), and the card's body names the whole file.

**Not reached in the walk of the fourth increment or in its review**, for a walk by hand: a
drag of a picture from a file manager, with and without Shift; a file a card shows whose
default editor is another extension's (a second editor of the same extension was reached); the
native file dialog of New Empty Board and New Board from Example with its filter; a rename
onto an existing file and the Explorer's own undo of a rename; Save without Formatting; the
setting across a reloaded window; and everything on macOS and Windows.

## Tests of this part

The two projects and their rules are under [Tests](../CLAUDE.md#tests). This part's files:

- `npm run board test`, the unit project:
  - `apps/vscode/test` (24 files, 451 tests). The host half: the fake VS Code held to what it
    claims (`memory-vscode`, with its saves, commands and diagnostics, the one line break of a
    document, what the watchers hear of a move and of a drag, and how a document says that it
    turned unsaved or clean, also when its file is renamed), the root rule and the
    look at every folder on the way to a file (`root`), the index of a root on fake timers
    (`file-index`, among its cases the folders another program makes, fills, moves and removes
    as a real VS Code names them, the moves of a rename, and the moves of a drag whose watcher
    was ahead), a model's text over documents,
    with the files a board does not open, the size of a write, why a write is not in the file
    and which documents were written (`documents`), pictures (`bytes`), the backend behind the
    files server on a channel in memory (`backend`, with the files that move, the file that is
    shown and the documents a board made dirty, among them one that was clean in between by a
    revert, by typing or by a save, and one that was renamed) and behind the page's own client
    (`port`), the editor options on the shell's host stub with a memory backend
    (`boardEditorOptions`), the registered extension against the `vscode` mock (`boardEditor`,
    with the Problems entry and its pill, the moves and the setting through the registration,
    a board that is closed and opened again or renamed, a model file that went, two editors of
    one board, and an edit that crosses a rename, on the page's real files client and the host
    package's real binding through `support/page.ts`; `webviewHtml`), the saves of the models
    with their board on the fake and on two events by hand (`saveModels`, with a model whose
    file is not there and one that is being saved already), the
    problem of a board text and its line (`problems`) and the entries of the Problems view
    (`diagnostics`), the three commands as a person runs them (`commands`), the example in the
    bundle held against the folder and written around a board file (`example`), the production
    host bundle built in memory and activated with nothing but `vscode` and Node, with the
    manifest's commands registered and the example written from inside it (`bundle`), the
    manifest with its commands, setting and walkthrough and the VSIX's ignore file
    (`contributions`), what the host's sources must not do (`host-rules`: no module of Node, no
    `fsPath`, a save in `saveModels.ts` alone, `writeFile` only for a new picture and the
    example, `vscode` imported only where the extension is registered) and the mock's identity
    (`vscode-mock`). The webview half: `webview-channel` (the files channel
    alone, then a page's files client over it against the editor's options on the shell's host
    stub, a reloaded webview among its cases), `webview-rules` (the entry's order, the one API, no
    await before the mount, the drop the mount names, and the two suffix lists held equal) and
    `webview-bundle` (the
    production webview bundle built in memory). The papers: `notices` (the notices of the two
    production bundles built in memory, held by the check, which fails without the section of a
    font package or of a copied work; the VSIX reader) and `papers` (the icon by its size and
    checksum, the ignore file, the CHANGELOG, the README, which names no marketplace).

The webview as a page is the e2e project `vscode-webview`
([The webview test page and the project `vscode-webview`](#the-webview-test-page-and-the-project-vscode-webview-e2e)),
and the packed extension in a real VS Code is the smoke
([The smoke in a real VS Code](#the-smoke-in-a-real-vs-code-test-smoke)).

## A real VS Code in the Docker runner

The commands in short are under [Commands](../CLAUDE.md#commands), with the rule for a machine
where Chromium must not run without its sandbox. How a real VS Code runs on such a machine:

**A real VS Code where Chromium must keep its sandbox.** On the agent VM a real VS Code runs only
inside the suite's Docker runner (the shell's `modeler-shell-vscode-docker`, behind
`npm run board test:vscode:docker`): the smoke starts VS Code with `--no-sandbox` inside the
container, and the owner allowed exactly that. Chromium and Playwright started on the machine
itself keep their sandbox. One run at a time: two runs would write into the same VS Code cache. The
runner mounts the repository read-only, copies it without `node_modules` and `.git` and runs
`npm ci` on the copy, so it runs on a snapshot whose lockfile is in step with its manifests. For a
working tree with uncommitted work:

```sh
P=<a scratch folder>; mkdir -p $P/repo
rsync -a --exclude node_modules --exclude .git --exclude test-results --exclude .vitest \
  <the repository>/ $P/repo/    # keeps packages/api/dist and packages/shell/dist
cd $P/repo/modelers/board
node <the repository>/packages/shell/dist/vscode-docker.js \
  --results modelers/board/test-results/vscode-smoke    # options: --script <name>, --env NAME=value
```

The results (the screenshots, and VS Code's logs with `--env VSCODE_SMOKE_KEEP=1`) land in
`$P/repo/modelers/board/test-results/vscode-smoke`. The board's smoke ran this way, each run on a
fresh snapshot:

```sh
node <the repository>/packages/shell/dist/vscode-docker.js \
  --results modelers/board/test-results/vscode-smoke                  # the newest stable VS Code
node … --results … --env VSCODE_VERSION=1.96.0                        # the manifest's minimum
node … --results … --env VSCODE_SMOKE_VSIX=apps/vscode/board-modeler.vsix  # a packed VSIX
```

A path in `VSCODE_SMOKE_VSIX` is read from `modelers/board` inside the container, where the
snapshot lies, so the VSIX has to be in the snapshot. With the image built and VS Code in the
runner's cache a run takes about 25 s, of which `npm ci` is 10 s and the smoke 11 s. Docker keeps
one image (`modeler-shell-vscode-smoke:node<version>-<hash>`, about 0.9 GB) and two volumes
(`modeler-shell-vscode-cache` with each VS Code it downloaded, about 1.1 GB for 1.146.0 and 0.4 GB
for 1.96.0, and `modeler-shell-npm-cache`); `docker volume rm` and `docker rmi` take them away.

**A walk, beside the smoke.** A scratch script runs in the same runner: the files lie in a
folder of their own outside the repository (a `vitest.config.ts` like the smoke's, the test, and
the probe), are copied over the snapshot into `modelers/board/apps/vscode/<a folder>`, and the
runner is given the command in the place of the script:

```sh
node <the repository>/packages/shell/dist/vscode-docker.js \
  --results modelers/board/test-results/vscode-smoke --env VSCODE_VERSION=1.96.0 \
  -- npx vitest run --config apps/vscode/<a folder>/vitest.config.ts
```

The test packs the VSIX, unpacks it, copies the probe beside the extension and points the
manifest's `main` at it; the probe requires `./dist/extension.cjs`, activates it unchanged and
answers requests the test writes as files into the unpacked folder. What such a script has to
know:

- **A native dialog ends a run.** VS Code's own dialogs are native by default, nothing in the
  driver sees or answers one, and every command behind it waits for ever. Set
  `window.dialogStyle` to `custom` and `files.simpleDialog.enable` to `true` in the driver's
  `settings`: the question before an unsaved editor closes is then `.monaco-dialog-box`, and a
  file dialog is a quick input that takes a typed path.
- **The probe runs only while the extension is active.** A window that is reloaded with the
  board's tab in the background has no extension host for it: a click on the tab, or a
  contributed command, starts it.
- **A click on a file in the Explorer opens it.** The arrow keys move the Explorer's focus
  without that, and F2 renames what has the focus. Control and a click adds a row to the
  selection, and the real mouse drags the selection.
- **A drag with a file** is `Input.dispatchDragEvent` on a CDP session of VS Code's window
  (`page.context().newCDPSession(page)`), as in the e2e project: it reaches the webview's frame
  through the workbench, with Shift as the protocol's modifier bit 8.
- **VS Code can be started a second time in one run:** quit it with `workbench.action.quit`,
  wait until no process names the run's user-data folder, and launch the same executable with
  the driver's arguments (`vsCodeLaunchArgs`) without the file: the window restores its tabs.
- A whole pass of the fourth increment's walk took 3.5 to 4 minutes in the container.
