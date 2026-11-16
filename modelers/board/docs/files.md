# The board's files port

A part of the board's guide, moved here from [`CLAUDE.md`](../CLAUDE.md) as it was written. That
file keeps what every change needs and names
[every part's document](../CLAUDE.md#the-parts-and-their-documents).
What is found out or changed in `packages/files` is written here.

## The files port (`packages/files`)

`src/port.ts` is what a page asks for (`BoardFiles`, `TextSession`), `src/server.ts` what a host
implements with its own file API (`FilesBackend`, `BackendText`), and `src/protocol.ts` the
messages between the two. `src/client.ts` is the page's side, `src/memory.ts` a backend in memory
(the web app's repository and every test's double), `src/local.ts` `connectBackend`: client and
server on a `MessageChannel` of the page's own, so that a host in the page runs the same path
checks and the same message order as one behind a webview. `src/paths.ts` has the path rules and
the rule a host hands in. The entry exports `createFilesClient`, `connectBackend`,
`createMemoryBackend`, `serveFiles`, `suffixRule`, `PICTURE_SUFFIXES`, `bySuffix`,
`isNewAssetPath`, `repoPath`, `fromBase64`, `toBase64`, `isBoardMessage`, `PROTOCOL`,
`NEW_FILE_LIMIT_BYTES`, `READS_AT_ONCE`, `WAITING_LIMIT`, `WriteRefusal` and the types, `FilesRule`
and `DropReason` among them.

**Decided by the lead of the second increment, not by the owner, who was told and may turn each
round:** what a page may reach (the dot segments and the host's rule, below) and the version of a
text (`PROTOCOL` 2, below). Both are built, and the VS Code backend is written against them.
**Decided by the lead of the fourth increment, the same way** (N3, N4, N8 and N9 of
[the increments](increments.md)): a page may ask the host to show a file, a host tells the
files that moved, a dropped edit is told with its reason, and what a page asks of a host is
bounded (`PROTOCOL` 3, below).

- **The messages are frozen, at `PROTOCOL` 3.** Every type starts with `board.`, so they share a
  webview's channel with the shell's. The VS Code host is written against the names and shapes: a
  change to one is a new `PROTOCOL`, and a table in `protocol.test.ts` fails the type check when a
  type is added and not listed. Protocol 1 had no version of a text and no settle. Protocol 2 had
  no welcome, no show, no word for a dropped edit and one answer per read. Nothing was published
  with either and no host speaks them: a hello of another protocol is answered as every hello of
  another protocol.

  | From the page       | Fields                                | Answered with                                  |
  | ------------------- | ------------------------------------- | ---------------------------------------------- |
  | `board.hello`       | `protocol`                            | `board.welcome`, then `board.paths`            |
  | `board.text.open`   | `requestId`, `path`                   | `board.text.opened` or `board.failed`          |
  | `board.text.edit`   | `path`, `text`, `version`             | nothing; `board.text.dropped` where it is lost |
  | `board.text.close`  | `path`                                | nothing                                        |
  | `board.text.settle` | `requestId`                           | `board.done` or `board.failed`                 |
  | `board.bytes.read`  | `requestId`, `path`                   | `board.bytes` or `board.failed`                |
  | `board.file.create` | `requestId`, `path`, `base64`, `mime` | `board.done` or `board.failed`                 |
  | `board.file.show`   | `requestId`, `path`                   | `board.done` or `board.failed` (new with 3)    |

  | From the host         | Fields                                                    | When                                                                           |
  | --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
  | `board.welcome`       | `shows` (boolean)                                         | the answer to a hello of this protocol, before the first list (new with 3)     |
  | `board.paths`         | `paths`                                                   | after the welcome and after every change of the list: the whole list           |
  | `board.text.opened`   | `requestId`, `path`, `text`, `readOnly`, `version`        | the answer to an open                                                          |
  | `board.text.update`   | `path`, `text`, `version`                                 | a text the page did not write, or wrote in vain                                |
  | `board.text.dropped`  | `path`, `reason` (`crossed`, `too-large`, `refused`)      | the page's last edit of the path is not in the place (new with 3)              |
  | `board.text.gone`     | `path`                                                    | the file of an open text went away                                             |
  | `board.moved`         | `moves` (`from`, `to`)                                    | files have a new path, one move per file                                       |
  | `board.bytes`         | `requestId`, `path`, `base64` or null, `mime`, `alsoFor?` | the answer to a read, and to every read `alsoFor` names (`alsoFor` new with 3) |
  | `board.bytes.changed` | `paths`                                                   | bytes that are new                                                             |
  | `board.done`          | `requestId`                                               | a settle, a create or a show is done                                           |
  | `board.failed`        | `requestId`, `message`                                    | a request could not be answered                                                |

- **The rules both sides keep.** Nothing is pushed before the hello, and the first thing after it
  is the welcome. Whatever the page awaits carries a `requestId`, a whole number, and ends in its
  answer or in `board.failed`; a request with any other id (none, a text, a fraction, `NaN`) is
  dropped, since no answer could reach it. An answer comes when its own work is done, not in the
  order of the requests: a page matches it by the id, and one `board.bytes` answers every request
  it names. The page never gets its own edit back; the other sessions on the path hear it at
  once, in the page. A write the place refused is answered with the text the place has, once the
  last write of that path settled, and not at all where the page was told a text since it made
  that write. One path is one subscription at the host however many nodes show it.
- **A version of a text.** The host counts it and the page only repeats it. `board.text.opened`
  carries 1, and every `board.text.update` of that open text one more: a change from outside, a
  file that is back, the answer to a refused write. The page's own edits do not count.
  `board.text.edit` carries the last version the page heard, and the server hands the edit to the
  place only while that is still the last version it told, asked when the edit's turn comes. An
  edit made on an older version crossed a text the page had not heard of: it is dropped, the place
  keeps its text, and the update that is already on its way puts that text in the edit's place on
  the page. So after a crossing, page and place hold the same text, and it is the outside's. No
  outside change is lost. The page's own edit is in neither, and the person sees it go, because the
  editor imports the text that took its place. The outside wins because an edit is a whole text
  and the board has no text merge. The count is the server's, per open text and per life of a page
  (a text that is closed and opened again starts at 1); a backend never sees it. A change that
  brings the text the place handed out last (a save, an echo that comes late) is no version and no
  message, unless the file was gone.
- **The word for an edit that is lost (`board.text.dropped`).** An edit that is not in the place
  and never will be is still dropped whole, and since protocol 3 the page is told why, so that a
  node can say a true sentence. The reasons are `DropReason`: `crossed` (the edit was made on an
  older version, or the place had another text than the one the edit was made on), `too-large`
  (the place takes no text of that size) and `refused` (the place did not take it and names no
  reason: a read-only text, a write that threw, an edit the server did not keep). The word is no
  text and no version: an answer with a text would be one more version and would cost the page
  whatever it wrote after it heard the first. It is sent once the writes of the path settled,
  behind the update where there is one, once for a row of lost edits and with the reason of the
  first of them, and not for a path that was closed, a page that is gone or a file that went. An
  edit the place refused is not lost where the place took a later edit made on the same version:
  the page made that one from the refused one, so the place has both. On the page the word goes
  to the session that posted the last edit of the path (`TextSession.onDropped`), and a session
  says `crossed` itself for a write it drops as made on another text than the path has.
- **A hello starts the life of a page.** A second hello on the same channel (a reloaded webview)
  closes what the page before had open and sends the welcome and the list again; an answer that
  was awaited across it is never sent, and what waited for its turn (a read, a new file, a show)
  is not done at all. A hello of another protocol is none: every request is then failed with a
  message that names both numbers. A request before the hello is answered with `board.failed` ("the
  page has not said hello"); an edit and a close before it are dropped. The client says hello once,
  when it is made, so a server listens before the page starts.
- **The welcome** says what the host can do beyond the files: `shows` is whether the backend has
  a `showFile`. The client keeps it as `BoardFiles.showsFiles()`: undefined until the welcome
  came, which is before the first list, so whoever hears `onPaths` knows.
- **Paths.** `repoPath` refuses whatever is no repository-relative path with forward slashes (no
  string, empty, more than 1024 characters, a backslash, a control character such as a NUL or a
  line break, a scheme or a drive letter, an absolute path, an empty segment) and every path with a
  segment that starts with a dot, at every depth: `.`, `..`, `.git/config`,
  `.github/workflows/ci.yml`, `.vscode/settings.json`, `.env`, `models/.drafts/tea.owm`. A model in
  a dot folder is on no board. The same for a segment that is the short name Windows gives
  `.git` on NTFS (`GIT~1`, any case, any number): it opens Git's folder without a dot, and Git
  itself refuses such a path. The server runs it on every path before a backend sees one, and
  answers a dot path with a message of its own. A backend refuses a path that is in use: the server
  does not check the list.
- **What a page may reach.** A page reaches only what a board can show.
  `serveFiles(channel, backend, rule)` and `connectBackend(backend, rule)` take the host's rule
  (`FilesRule`: `model(path)` and `picture(path)`), and it is not optional, so that no host forgets
  it. A text is opened only for a path the rule calls a model; bytes are read, and a new file is
  stored, only for a path it calls a picture. A path the rule refuses never reaches the backend and
  is answered with a message of its own. The page is told no other path either: the list, the
  changed bytes and the moves are sent without the paths a board does not reach (a move only where
  both of its paths are reached; a file that moves out of reach is gone for its readers). A page
  may ask to have a file SHOWN that it may not read (below): that is the one request the rule is
  not asked for. An edit is written only into a path that is open, and so was checked. `suffixRule({ models, pictures })`
  is the rule by the end of a file's name, as `bySuffix` reads it: a host passes the suffixes of
  the editors it shows and `PICTURE_SUFFIXES`, the suffixes the board draws. The files package
  cannot import the board, and `packages/host/test/files-host.test.ts` holds that list against the
  board's `IMAGE_TYPES`. A board file is no model by any host's rule here: its text is never opened
  through the port (see [The VS Code extension](vscode.md#the-vs-code-extension-appsvscode)).
- **A new file** is taken only as `assets/<name>` with a name of letters, digits, dot, dash and
  underscore, which is what the board makes of a picture's name, only as a picture by the host's
  rule, and not as a dot file (`.gitignore`), a name that ends in a dot, which Windows drops, or a
  device name of Windows (`nul`, `con.png`, `COM1.svg`). Its bytes are a base64 text: any other
  value is refused, where `atob` would take `null` for the four letters of its name and store three
  bytes. They are at most `NEW_FILE_LIMIT_BYTES`, 10 MiB, the board's own limit for a picture;
  `packages/host/test/files-host.test.ts` holds the two numbers equal. A type that is no text is
  taken for none. One refused name is one the board itself makes: a picture a person called
  `aux.png` or `con.png` is answered with "a new file cannot have this name", which the board puts
  into its notice.
- **Showing a file (`board.file.show`, `BoardFiles.showFile`).** The page asks the host to show
  a file in an editor of the host's own, as the host opens any file, and gets `board.done` or
  `board.failed`: never the file's content, its size or whether it is a text. It is what a node
  offers for a file no editor of the board covers
  ([the card](host.md#the-host-package-packageshost)). The server runs `repoPath` on the path and
  answers a path outside the root and a dot path with the same two messages as every request; it
  does not ask the host's rule, since a file no board shows is what a page asks to have shown. So
  a page can have every file of the repository outside its dot folders opened in the host, one at
  a time, and can read none of them through that. The answers still tell it what is there: "does
  not exist", "is no file", "is a link" and `board.done` are four different words about a path,
  for whoever asks path after path. One sentence for every failure, with the reason kept for the
  host's log, would end that; it is not built, since the card shows the reason to the person who
  pressed its button. What a path's text cannot say stays the
  backend's: that there is such a file and that no link is on the way. A backend that has no
  editor (the memory backend, the web app's two backends) has no `showFile`: the welcome says
  `shows: false`, the client's `showsFiles()` is false, and a page that asks all the same is
  failed with "this host cannot show a file".
- **What the checks do not do.** They read the path's text and nothing else. A name with percent
  signs (`%2e%2e/secret`) and `models/tea.owm.` pass `repoPath` and fail the rule; a path through a
  link that leads out of the root, and a name the file system folds onto another one, pass both.
  Such names are another case, a dot or a space at the end on Windows, and two that name a dot
  folder without a dot at the start of a segment (by a review's reading, not run: its machine was
  Linux, where both ended in "does not exist"): a short name of NTFS (`GIT~1/hooks/x.owm` is a
  file in `.git` there) and a code point HFS+ leaves out of a name (U+200C before `.git`). The
  suffix rule holds for them too, so only a model or a picture in a dot folder would be reached,
  and a page makes a new file nowhere but under `assets/`. Since the closing round of the fourth
  increment the short name of Git's own folder is refused, exactly `git~<number>` in any case,
  as Git refuses it (`core.protectNTFS`): a show is not held by the suffix rule, so a page
  could have had `.git/config` opened in a tab on Windows. The short names of the other dot
  folders (`GITHUB~1`, `VSCODE~1`) are not refused. Refusing every segment with `~` and a
  digit, or every format character, would also refuse honest names (Persian writes U+200C inside
  words): the owner's to settle. A backend with a disk checks what a path's text
  cannot say: that no link is on the way to the file and the file is none, its size, and that a
  create never replaces a file. The memory backend has only its own files.
- **Writes.** A place gets the writes of one path one at a time and in the page's order, and
  `close()` after the last of them, also when the page went in the middle of one. `false` and a
  rejection both mean that the place took nothing, and they differ in the word the page is told:
  `false` is a place that has another text than `base` (`crossed`), a rejection with a
  `WriteRefusal` is the reason it names (`new WriteRefusal("too-large")` for a text larger than
  the place takes), and any other rejection or throw is `refused`. `write(text, base)` names the
  text the write was made on: the one
  the place handed out last, through `text()` or `onChange`. The server reads `text()` again after
  every write the place took, since a place may make its own text of a write (line breaks), so
  `base` is always a text of the place's own and a plain comparison is right. A place that has
  another text by the time it writes resolves false, as the memory backend does, or the write would
  replace a change nobody was told of; the page is then told the text the place has. `onChange` is
  never the echo of a write: every call is a new version, and what the page wrote on the version
  before is dropped.
- **Waiting for the writes, and a page that goes.** `BoardFiles.settled()` posts
  `board.text.settle` behind the page's edits and resolves once the host dealt with every write
  made before the call: each is in the place, was refused there, or was dropped as made on an older
  text. It rejects when the files are closed first. It is a round trip to the host, so in a page
  nobody answers it stays pending until `dispose()`: whoever awaits it before a dispose must be
  able to give up. An edit that reached the server lands though its page goes right after it (a
  dispose, a second hello, a webview that closes): the text is closed after the write. An edit the
  host never received, posted in the task in which the channel ended, is lost. A page that ends on
  purpose awaits `settled()` first.
- **A session's write says what it was made from.** `TextSession.write(text, base)`: where the path
  has another text than `base` by now, the write is dropped, since its writer was told that text
  and has not taken it in yet. Without `base` a write counts as made on the text the path has. The
  binding of `packages/host` always passes it.
- **A file that goes.** Its sessions hear `onAvailable(false)` and keep their text; a write does
  nothing meanwhile; when the file is back they hear `onAvailable(true)` and then its text, which
  is a new version. A reader that comes while the file is gone is rejected with `<path> is gone`: a
  session cannot say that its file was gone before it was made.
- **A file that moves.** `FilesBackend.onMoved` tells moves as `{ from, to }`, one per file: a
  moved folder is the moves of the files in it, in one call, and the page gets them as one
  `board.moved` without the moves a board does not reach. A backend tells the move before the
  old path's text says that its file is gone: whoever follows the move
  ([the host package](host.md#the-host-package-packageshost)) is then on the new path before a
  node could say that its file is gone. Nothing is rewritten for a page: the port tells, and the
  page decides. The memory backend's `move(from, to)` moves a folder where `from` is no file,
  and says for a picture that the bytes of both paths are new, as a disk's watcher would.
- **`connectBackend`.** Each message is a task: `paths()` is empty until the hello was answered,
  and `onPaths` says when the list is there. `dispose()` ends client and server in one call and
  drops what the page posted in that task.
- **Messages a node may show** (the facade prints them behind "This file could not be opened.").
  From the server: "this path is outside the repository", "a board reaches no dot file and no file
  in a dot folder", "`<path>` is no model a board shows here", "`<path>` is no picture a board
  shows here", "a new file goes into assets/", "a new file cannot have this name", "the bytes of
  the new file are no base64 text", "a new file may have up to 10 MiB", "`<path>` is gone", "the
  page has not said hello", "this host cannot show a file", "too many requests are waiting for
  this host", "too many new files are waiting to be stored", "another file is being shown, try
  again in a moment". From the client: "the files were
  closed". From the memory backend:
  "`<path>` exists already", "`<path>` is no text file of this repository". From the VS Code
  backend: "this board is in no repository and in no open folder, so it has no files", "`<path>`
  does not exist", "`<path>` is behind a link, and a board opens no link", "`<path>` is a link,
  and a board opens no link", "`<path>` is no file", "`<path>` is larger than 2 MiB, too large for
  a board", "`<path>` cannot be read as a text", "`<path>` is behind a link, and a board reads no
  link", "`<path>` is a link, and a board reads no link", "`<path>` is larger than 10 MiB", "assets is a
  link, and a board stores nothing through a link", "assets is a file, so a new picture has no
  folder", "`<path>` exists already". From the VS Code backend for a file that is to be shown,
  which a card prints behind "This file could not be shown.": "`<path>` is no file of this
  repository", "`<path>` is behind a link, and a board shows no link", "`<path>` does not exist",
  "`<path>` is a link, and a board shows no link", "`<path>` is no file", "VS Code could not open
  `<path>`: `<its message>`". From an extension that hands a board no backend: "this board has no
  files".
- **Known and not cured.** A crossing is settled for the outside and never merged: the edit that
  crossed is dropped whole, and since protocol 3 the page is told so. The protocol has no
  acknowledgement of a write the place took: a page learns that its writes are dealt with only
  through `settled()`. Where a place makes its own text of a write and tells no change (line
  breaks in a CRLF document), the page shows the bytes it wrote and the place has its own, until
  the next update; the next write is made on the place's text, so nothing is refused for it.
  `TextSession` cannot be asked whether its file is there. The memory backend's `writes` is a
  log for tests and grows with every write: whoever keeps a backend for long empties it, as the
  web app does. A move is told only where both paths are ones a board reaches, so a page never
  hears that a file it can only have shown (a card's) has another path. The server filters: the
  VS Code backend tells it a move for every renamed file whose name is a model's or a picture's,
  and for every listed file below a renamed folder
  ([The host half](vscode.md#the-host-half)).
- **What bounds how much a page asks of a host.** A review of the second increment made a page
  that is not the board's ask without end: on the fake VS Code, 400 new files of 1 KiB and 20 of
  10 MiB were each answered `board.done`, and 5000 edits in a row were applied one by one. In a
  real VS Code 1.146.0, 12 new files of 10 MiB were on disk after 1.07 s, and 60 reads of one 10
  MiB picture were answered after 28.8 s, while the extension host grew from 210 MiB to 904 MiB
  and VS Code wrote "UNRESPONSIVE extension host" into its log twice. Since the fourth increment
  the server bounds what it does and what it keeps, and a backend sees no more than this:
  - **Reads of one path that are on their way are one read.** The backend is asked once, and one
    `board.bytes` answers every request, with the others' ids in `alsoFor`: the bytes are
    encoded once and cross the channel once. A request joins a read that waits for its turn or
    is with the backend; once the backend said that the path's bytes changed, a request that
    comes later gets a read of its own, since the running one may bring the bytes of before.
  - **`READS_AT_ONCE` (4) reads are with the backend at one time.** The others wait in the order
    they came. A read that waited when its page said hello again is never made; one that was
    with the backend runs to its end, still counts among the four, and is answered to nobody.
  - **New files are stored one at a time**, in the order they came, and their bytes are decoded
    only when their turn comes. Those that wait hold at most twice the base64 text of a file of
    the limit together (`HELD_FILES_LIMIT`, about 28 million characters): one more is failed at
    once with "too many new files are waiting to be stored", whatever its size. A file that
    waited when its page said hello again is not stored: no node will ever name it.
  - **A show is one at a time, and one waits** (`SHOWS_WAITING`). One more is failed at once
    with "another file is being shown, try again in a moment" and takes no room. A person
    presses one card at a time, and every file that is shown takes the front of the place: in a
    real VS Code 1.146.0 a page that posted 600 shows kept the active tab off its board for
    28 s while 4096 could wait; with the bound, 2 of 600 were shown and 598 refused within
    1.1 s.
  - **`WAITING_LIMIT` (4096) requests of one page wait for their answer at one time**, of every
    kind together (opens, settles, reads, new files, shows). One more is failed at once with
    "too many requests are waiting for this host" and reaches no backend; a request that is
    failed for its path takes no room. The count is per life of a page.
  - **The edits that wait hold at most 32 MiB of text together** (`HELD_EDITS_LIMIT`, counted in
    UTF-16 units, the one being written among them). An edit beyond it is not kept: when its
    turn comes it is a write the place did not take, the page is told the place's text again and
    the word `refused`.
  - **`WAITING_EDITS_LIMIT` (4096) edits of one page wait for their turn at one time**, of every
    path together and whatever their size: each edit that waits is a step of its path's line,
    which the limit on their text did not count. A review measured 1,024 bytes of heap per
    waiting edit on the fake (1.95 GB for two million edits of two characters) and, in a real
    VS Code 1.146.0, an extension host that went from 64 MB to 263 MB of heap with 300,000
    edits and took four to five minutes to work them off. One edit more than the limit gets no
    step. Behind edits of its own path it is remembered as the last one that got none, and when
    those settled it is an edit the place did not take: the page is told the place's text again
    and the word `refused`, once, unless an edit that came after it is in the place by then,
    which the page made from its text. With no edit of its own path waiting (the line is full
    of other paths' edits) it is a step without a text, the one such step a path can have at a
    time, and is told as refused without a wait. With the bound, the same 300,000 edits left
    the heap of a real extension host between 131 and 152 MB while they came and at 60 MB
    twelve seconds after the last, with 4,094 of them in the document.

  So what a flood can make the server hold is: 4096 small records of waiting requests, the
  answers of four reads at a time, three new files (one being stored, with its bytes, and the
  waiting ones), 4096 edits with at most 32 MiB of text, two files to be shown, and one record
  per text the page has open, which is at most one per model of the repository. No budget in numbers is set for the new files of one editor
  (a count and a sum of bytes over its life): that one is the owner's, since any number also
  meets a person who adds many pictures in one sitting. Not bounded by the server: the opens of
  different models, which run side by side up to the waiting limit; how large one written text
  is, which is a backend's to bound, as the VS Code backend does
  ([The host half](vscode.md#the-host-half)); and what a channel holds of the answers it was
  handed and has not delivered, which the server cannot see. Of the bounds, those on the shows
  and on the count of the edits were measured in a real VS Code, as said with each; the others
  were not.

- **Without a test:** `port.start()` in `local.ts`, which only a browser needs (the browser files
  of `packages/host` and of the apps run through `connectBackend`), and the two `port.close()`
  calls there. Of 110 single edits of the first increment's sources those two passed. Of 75 single
  edits of the lines the second increment changed (66 against the unit tests, 9 against the browser
  files of `packages/host` and `apps/webapp`), none passes. Of 110 single
  edits of the lines the fourth increment wrote or changed (87 of the server, 13 of the client, 9
  of the memory backend, the protocol's number), each applied by a transform in a scratch config
  and run against the unit tests, 100 failed a test at first. Of the ten that passed, all in the
  server, nine are held by a test since (the room a request gives back with its answer, in every
  place it does; the room of a page that is gone; the bytes of the new files that waited; an edit
  that crossed by its version before one that was taken; the number of the edits' limit) and one
  was a condition that made no difference and went. All 110 fail a test as the sources stand.
  For the closing round of the fourth increment, 13 single edits, each made in the file, run
  against the unit tests and taken back: ten of the server (no limit on the count of the
  edits, a step of the line for an edit beyond it, a later edit that makes nothing good, an
  earlier one that does, an edit without a place never told, told without the place's text or
  without its version, an edit of another path kept though the line is full, every show
  waiting, two shows waiting) and three of the path rule (the short name taken, in lower case
  only, anywhere in a segment). All 13 fail a test. The step of the line is told by the heap
  alone, since no answer differs: `limits` reads `process.memoryUsage()` around 300,000 edits
  beyond the limit and asks for less than 100 MB, where a step each was measured at 300 MB.

## Tests of this part

The two projects and their rules are under [Tests](../CLAUDE.md#tests). This part's files:

- `npm run board test`, the unit project:
  - `packages/files/test` (6 files, 423 tests): the path rules (`paths`), each side of the protocol
    alone, message by message, against a page that posts whatever it likes and against a scripted
    host (`protocol`), client and server together on a memory backend with more than one reader on
    a path (`fan-out`), the memory backend alone (`memory`), `connectBackend` over a real
    `MessageChannel` (`local`) and what a page cannot make a host do or keep (`limits`).
    `test/support/wire.ts` is the channel in memory they share: it copies each message and
    delivers it later, in order. With the second increment: the version of a text and the
    crossings (`protocol`, `fan-out`), the host's rule and the paths a board does not reach, and
    the settle. With the fourth: the welcome, a file shown, the word for a lost edit with its
    reasons and to whom it goes (`protocol`, `fan-out`, `local`), a moved folder (`memory`,
    `local`), and in `limits` the reads of one path answered together, the few reads at once, new
    files and shows one at a time, the bounds on what waits, a page that says hello again in the
    middle of each, and a channel that throws. With its closing round: the count of the edits
    that wait (one beyond it told as refused, made good by a later edit, and of another path
    than the ones that fill the line), the one show that waits, and the short name Windows has
    for Git's folder (`paths`).
