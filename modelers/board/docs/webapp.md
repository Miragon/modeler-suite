# The board's web app

A part of the board's guide, moved here from [`CLAUDE.md`](../CLAUDE.md) as it was written. That
file keeps what every change needs and names
[every part's document](../CLAUDE.md#the-parts-and-their-documents).
What is found out or changed in `apps/webapp` and in `example/` is written here.

## The web app and the example (`apps/webapp`, `example/`, `e2e/`)

The web app is the board inside the suite's shell, in the shell's web column, mounted through
`mountBoardEditor` of `apps/ide-editor` as the VS Code webview mounts it. One document is open at a
time: the example (`modelers/board/example` as a repository in memory), or a board that was made
new or opened from a file, which has no repository behind it. There is no disk behind the page:
what is open, and what a person changed of the example, is kept in the browser's local storage,
and a board leaves as a download. The board keeps its toolbar beside the shell's menu and zoom
panel, as in VS Code
([Three deviations under the shell](ide-editor.md#three-deviations-under-the-shell-each-with-an-end)). There is
no drop zone: the board takes a dropped picture itself.

- **`startApp(root, { storage, search, komet })`** (`src/app.ts`; `src/main.ts` calls it with
  `window.localStorage`, or a store in memory where the browser blocks its own, `location.search`
  and the address of `public/miragon-komet-blau.svg`, and publishes the app as
  `globalThis.__boardApp`, for the console and the e2e suite). It returns
  `{ ready, editor(), shown(), settled(), destroy() }`. `editor()` is the `BoardEditor` of the open
  document: another one after New, Open, Show example and a reset, and a throw in the moment
  between two documents. `shown()` is `"example"` or `"board"`. `settled()` resolves once
  everything asked of the page so far is done. Every document gets an editor of its own, because
  the files a board reaches are fixed when the board is made: the page ends the open editor
  (`editor.destroy()`, then `files.settled()`, then `files.dispose()`) and mounts the next into the
  same element, one thing after another on a queue. `destroy()` returns a promise and ends the same
  way, so an editor's last write is kept before its files go; it takes the page's file input and
  listeners away and puts the page's title back.
- **The parts.** `web-host.ts` (`webEditorHost(document, column, state?)`: the members
  `mountBoardEditor` asks of a host. `state` is the place the page keeps the board's view in,
  handed on as it is given and absent where the page gives none. `canvasOwnsHistory` is true.
  `mountShell` mounts the shell
  with `host: "web"`, the File group, the legal line, the start screen and the page's own Model and
  Export entries. `connectDocument` hands over the page's one text at the mount and tells every
  change of the board back as its text; a text the board refuses is replaced by `fallback` where
  the page gives one, as the example does, and stays refused and locked where not). `column.ts`
  (`webColumn`: what goes into the shell's web column). `session.ts` (`mountExample`, `mountBoard`:
  one open document with its editor, its files and its line for the status box). `actions.ts` (the
  start, New, Open, Show example, Reset the example, the download). `page.ts` (the hidden file
  input `input[data-board-app="open"]`, the two file keys, the model picker). `board-file.ts` (the
  download's name, a file as a board text, `holdsNothing`, `namesFiles`). `no-repository.ts` (the
  files of a board without a repository). `storage.ts`, `keeping.ts`, `reach.ts` and `example.ts`
  are as the first increment built them, with `createOpenStorage`, `snapshot()` and `restore()`
  added to the storage.
- **The start.** The document of the last visit is opened again without a word (key
  `miragon-board:open`: `{ kind: "example" }` or `{ kind: "board", name?, text }`, outside the
  example's prefix, so a reset of the example leaves it). Without one the page shows the shell's
  start screen ("Modeler Board", "Start a new diagram, or explore the example.", the Miragon mark
  from `public/`, New diagram, Show example and the link "Open a file…" with its key) over a new,
  empty board that is mounted already: New diagram only leaves the card and hands the board the
  keys. The sentence and the button are the shell's shared terms, so the card says "diagram" where
  the thing is a board. A kept board text that is no board any more also ends on the start screen,
  with the toast "Couldn't restore the board of your last visit. Start a new board or open a
  file."; the text stays under its key until another board is kept. `?reset` in the address forgets
  what is kept of the example and opens it, and `main.ts` then takes it out of the address. Where
  the visit would have opened a board of the person's own, the request replaces that board like
  Show example does, so the toast "Board replaced" offers it back with Undo; a kept text that is
  no board is not offered, and the example takes its key.
- **The view is kept with the board, in the browser.** The page gives the editor one place for
  the view of the document that is open (`SessionPage.state`, on `OpenStorage.state`,
  `keepState` and `forgetState`): the key `miragon-board:open-state`, a JSON object by the
  editor's own keys, of which the board writes `boardView`
  ([The board inside the shell](ide-editor.md#the-board-inside-the-shell-appside-editor) says
  when a kept view is restored and when it is written). The document of the last visit comes
  back to it (`Documents.resume`, called by the start alone), so a reload leaves a person where
  they were, unless they were looking at none of the board's nodes: then the board is fitted. Every other document starts fitted: `show()` forgets the place before it mounts,
  after the editor before it wrote its last view there. That holds for New, Open, Show example,
  the reset from the menu and by the address, and for the Undo of a replaced board and of a
  reset, which open a document like any other. The place is outside the example's prefix, so a
  reset of the example's files does not reach it by itself. A view the browser did not keep is
  no change a person loses: the write's answer is dropped, the status box says nothing, and the
  next visit is fitted. A new board that holds no element is not kept, but its view is, until
  the next start forgets it.
- **The shell's column.** File: New diagram, Open… (Ctrl or Cmd + O), Show example. Model, for the
  example only: "Reset the example" (`reset-example`, enabled on a locked board too). Export:
  "Export as .board" (`export-board`, Ctrl or Cmd + S). Help: "Keyboard shortcuts…", whose dialog
  lists the two file keys in a group File, and for the example the row "Add a picture" with the
  paste key and `Drop` (`pictures: "drop"`; a board without a repository keeps no picture and
  gets no such row). The legal line carries a GitHub link to
  `modelers/board`. The page binds the two keys itself, on the window in the capture phase, since a
  note that is being typed stops its keys on the way up. Ctrl or Cmd + S first leaves a text field,
  so the note that is being typed is in the file, and does nothing on the start screen. The
  download's name is the opened file's, `example.board` for the example and `untitled.board` for a
  board that was made new; a toast says "Exported <name>." The page's title is
  `<file name> · Modeler Board`, and `Modeler Board` for a board without a file.
- **Replacing asks nothing and offers back.** New, Open and Show example replace the open document
  at once. A board that holds an element is kept as text and offered back by a toast "Board
  replaced" with Undo, until the first change of what replaced it. The example needs no offer: its
  changes stay in the browser. "Reset the example" offers what was kept of the example back the
  same way ("Example reset", Undo; `AppStorage.snapshot()` and `restore()`).
- **A board without a repository** (made new, or opened from a file). Its files are
  `connectBackend(noRepository(), REACH)`: the list is empty, a text is refused with the page's
  sentence, bytes are not there, a new file is refused. A model node reads, through the host
  package's state for a file that could not be opened, "This file could not be opened. This board
  was opened as a single file. Its models are files of the repository it came from, and this page
  has only the board." An image node shows the missing-file figure ("No such file in the
  repository"). A picked, pasted or dropped picture gets the board's notice "<name> was not added:
  this board has no repository to keep a picture in. Show the example to try pictures on a board."
  The model picker offers nothing, and it is the renderer's, so the page says why in a toast when a
  person goes to it, by a press or by the keyboard: "This board has no repository behind it, so
  there is no model to add. Show the example to try models on a board." A file that names a model
  or a picture is opened with the warning "“<name>” was opened as a single file: the models and
  pictures of its repository are not shown." A node whose file no editor of the board covers
  (a `.dmn` of a board that comes from another tool) is the host package's card with the file's
  name and no button, and says "This app cannot show this file.": neither backend of the page
  has a `showFile`, so the files port tells the page that its host shows no file
  ([The host package](host.md#the-host-package-packageshost)). The same card stands on the
  example for such a node. The empty-file hint reads "Add a note or a group from
  the toolbar to start." A file that is no board leaves the open board as it is: "Couldn't read
  “<name>”. <the reader's reason>. Check that it is a .board file." The board is kept with its
  file's name on every change; a board without an element is not kept, so a reload shows the start
  screen again.
- **The example** (what Show example opens, and what the web app was before the third increment):
  `createMemoryBackend` from the folder and what is kept, wrapped (`src/keeping.ts`) so that every
  write the backend took and every new file is kept, `connectBackend` with the page's rule `REACH`
  (`src/reach.ts`: the suffixes of the suite's table as models, `PICTURE_SUFFIXES` as pictures;
  `example.test.ts` holds that every file of the example is reached, a model as a text and a
  picture as bytes), and the seven editors of `SUITE_EDITORS`. `keeping` passes the memory
  backend's moves on, and `mountBoardEditor` calls `followMoves`, so a file that moved in the
  repository in memory would be followed by its models and pictures; nothing in the page moves
  a file. After Show example a toast says "The
  example repository is kept in this browser. “Reset the example” in the menu starts it over." Its
  lasting lines stand in the shell's status box, with the severity warning: "This browser did not
  keep all of your changes: its storage is blocked or full." (for the rest of the page's life, for
  a board without a repository too), "A picture of this board is missing: this browser did not keep
  it." (until that node is removed) and "The board kept in this browser could not be read. This is
  the example." (until the first gesture replaces the kept text). No test holds that the page hands
  `REACH` and not another rule to `connectBackend`: with the example's files the difference cannot
  be seen from the page.
- **The sheets** are imported by name in `src/app.ts`, in this order:
  `@miragon/modeler-shell/shell.css`, `@miragon/board-renderer/assets/board.css`,
  `board-suite-editors/base` (diagram-js's sheet and the canvas mapping once, then the host
  package's `embed.css`), `board-ide-editor/app.css`. The fonts are imported in `main.ts`, and each
  renderer's own sheet comes with the chunk of its notation. The app has no sheet of its own: the
  shell's own-document rules size the page. `index.html` has `class="cd-shell-document"` and
  `data-cd-theme="light"` on `<html>`, links `public/favicon.svg` (the official Miragon icon, the
  bytes Business Model Canvas's web app links, until the board has a modeler icon of its own) and
  carries the marker `<!-- miragon-mode -->`, which `vite.config.ts` replaces with the shell's
  `webHeadMarkup`: one theme-color from the renderer's vendored tokens and the contrast line.
  Nothing above the board carries a transform, a filter, a perspective, `contain` or `will-change`,
  and a test walks the ancestors.
- **Storage (`src/storage.ts`).** The open document is under `miragon-board:open`, and what its
  editor keeps of it (the view) under `miragon-board:open-state`; a value of another shape there
  is nothing kept and is replaced whole by the next write. The example is
  under `miragon-board-example:board`, `miragon-board-example:text:<path>` and
  `miragon-board-example:bytes:<path>` (JSON `{ mime, base64 }`). The example's own text is kept by
  removing the key, so a change that was undone leaves nothing behind. A kept entry that fits no
  file of the example is left out: a text for a path the example does not have, bytes outside
  `assets/<name>` or over a file of the example, a value of another shape. A kept board text of
  the example that the board refuses is answered with the example and the line above; the kept
  text stays until the first gesture replaces it. Two tabs on one storage are not told apart: the
  last write wins.
- **Pictures and the room of the storage.** A picture is kept when it is stored, and its node may
  go a moment later. Within one life of the page an undo brings the node back, so the bytes stay;
  when the example is next mounted the app forgets every kept picture that no image node of the
  kept board shows (`picturesOf`, `forgetPictures`; a kept text that is no board forgets nothing).
  A storage that throws never stops the app: the save answers false and the status box says so for
  the rest of the page's life, whatever a later save does. A picture the browser had no room for is
  drawn until the page goes; after a reload its node shows the missing-file figure and the status
  box names it, until that node is removed. The room is the browser's and the app names no number:
  in Chromium a review of the first increment saw a PNG of 4.3 MiB drawn and not kept, about 3.7 MB
  of pictures for one site.
- **The example (`src/example.ts`)** is the folder through `import.meta.glob`: `example.board`
  and `models/**` as `?raw` text, `assets/**/*.svg` as `?raw` text encoded to bytes with the
  type `image/svg+xml`. Vite has no import of a file's bytes, and its `?inline` of an SVG is a
  rewritten data URL: a picture of another type needs a glob of its own, and `example.test.ts`
  fails for a file no glob reads. `example.board` is canonical and holds seven model nodes of
  800 x 540 in two rows, a group "Start here" with the picture and two notes, and an arrow from
  the second note to the Value Chain. `models/` holds copies of the seven modelers' example
  files, made with `cp` and never edited (no kept test compares them with their originals,
  which would fail the board's tests when another modeler edits its example), and
  `assets/miragon-komet-blau.svg` is a copy from `docs/public/logo`. Whoever changes the example
  writes canonical bytes: `example.test.ts` compares the file with
  `encodeBoard(parseBoardText(text))`. The same folder is the fixture of the webview test page and
  of the smoke in VS Code, so its second note speaks of the web app's menu there as well.
- **The build check.** `npm run check:build -w modelers/board/apps/webapp` after the build runs
  `scripts/build-problems.mjs` on `dist`, then the notices check of `apps/editors`. It fails unless:
  `<html>` has `data-cd-theme="light"` and `class="cd-shell-document"`; the mode marker is
  replaced, with a theme-color and the contrast line; the sheet the page links carries a
  `.board-root` rule (the board's sheet), a `.cd-shell-legal` rule (the shell's), the start margin
  on `.cd-shell .board-root .board-toolbar` (the rules that make one picture of the two) and the
  preview rule on `.board-engine[data-armed=false][data-embed=diagram-js]`; diagram-js's base rule
  `.djs-context-pad.open{display:block}` is in that sheet exactly once and in no notation's sheet;
  each of the seven renderer root classes is in some sheet and none comes before the first
  `.djs-context-pad.open`; every file of `example/` is in a script (the check looks for the file's
  longest run of plain characters, `exampleMarker`, and fails for a file without a run of 16); a
  script carries React's production build ("Minified React error #") and none a development build
  ("react-stack-top-frame"); the scripts keep the legal comment of `lucide-react`, of the shell and
  of the Wardley Maps, Context Maps, Value Chain, C4 and Business Model Canvas renderers (seven);
  and `dist` holds `miragon-komet-blau.svg` and the icon `index.html` links. Each of these 40
  markers was taken out of a build once, and the check failed each time.
- **The notices of the build.** `vite.config.ts` has `noticesPlugin` of `apps/editors`: a
  production build writes `dist/THIRD_PARTY_NOTICES.txt` (47 packages of npm, three copied works,
  29 workspaces of the suite) and `dist/assets/dagre.esm.js.LEGAL.txt`, the licence file the C4
  chunk names, and fails when the notices are not whole
  ([The suite's editors](editors.md#the-suites-editors-appseditors)). `check:build` then holds the build
  against its own source maps (`checkBuildNotices`): 73 bundled packages and the two copied works
  the maps name, Lucide and Material Icons, against the 51 sections of the file. Tried on the real
  `dist`, each once: without the notices file, without the licence file, with the section of `yjs`
  or of Lucide cut out and with `react-dom` relabelled GPL-3.0-only the check exits 1 and names
  it. `test/build-config.test.ts` loads the Vite config and holds the three
  things this rests on: the plugin, in a build only; the source maps, which are the check's
  evidence; and the legal comments kept. Maps name scripts only, so the two Geist packages, which
  bring a sheet and fonts, and Tailwind's preflight, which is copied into a sheet, are held when
  the build is made and not by the check: with one of those three sections cut out of the built
  file the check still passes. Nothing in the page links the file: it is at
  `/THIRD_PARTY_NOTICES.txt` of the built app.
- **The e2e project.** `e2e/playwright.config.ts` has two projects. `webapp`
  (`**/webapp/**/*.spec.ts`, base URL `http://localhost:5184`, `E2E_PORT` overrides) runs on
  `npm run dev -w apps/webapp -- --port 5184 --strictPort`; `vscode-webview` is under
  [The webview test page and the project `vscode-webview`](vscode.md#the-webview-test-page-and-the-project-vscode-webview-e2e).
  Playwright starts every `webServer` entry, so either project starts both dev servers. Outside CI
  it takes whatever answers on a port for the app, which is how the project was also run against
  the built app (`vite preview` on 5184: 8 passed, before the fourth increment).
  `e2e/tests/webapp/board.spec.ts` has 10 tests:
  a fresh page on the start screen with the legal line and nothing kept; the example with its seven
  models ready; a change kept over a reload, the reset from the menu with its Undo, and `?reset` in
  the address; New diagram, and a reload that keeps a board once it holds a note; Open with a file
  the test hands to the browser's file dialog, from the start screen and from the menu, a file that
  is no board, and a reload; the download's bytes equal to the board's text, from the menu and by
  the key, also for the example; a reload that comes back to the view the board was left at (the
  view kept in the browser's storage once it rested, the same view after the reload, and the
  example as it was starting fitted with nothing kept); a picture dropped onto the example by a
  real drag of a file of the disk (`tests/support/input.ts`: Chromium's own drag events over the
  DevTools protocol, [the e2e projects](e2e.md#a-real-drag-of-a-file)), which shows the board's
  hint while it is held, is a file of the repository after the drop and is drawn again after a
  reload; and a window of 600 px and of 400 px with no horizontal scroll and
  the toolbar clear of the menu trigger, the zoom panel, the legal line and the attribution. The
  project runs the board's own specs and not the shell's conformance kit (the deviation above).
- **Without a test of the web app itself:** a pasted picture on the example (a picked one is
  held, and since the fourth increment a dropped one, by the e2e project; a paste is held on the
  renderer's test host), a group or an arrow made by
  hand, Done and a zoom of the board as the end of an edit (both held for the seven modelers in
  `apps/editors` and on the stand-in in `packages/host`), and a second node on the same file (held
  for Wardley Maps in `apps/editors` and on the stand-in). A review of the first increment did each
  of them once in the served page with Playwright's mouse and keyboard, a dropped picture excepted,
  and each worked. Nothing holds that a mount that fails ends its files port. 21 single edits of
  `apps/webapp/src` and `apps/ide-editor/src`, applied one at a time, each fail a browser file.
  With the fourth increment, applied in memory: 9 single edits of `storage.ts` and `web-host.ts`
  each fail a unit test, and 6 of `app.ts`, `actions.ts` and `session.ts` each fail the browser
  file (the place not forgotten for another document, the last visit's document shown and not
  resumed, the view never written, never read, a refused write told as a lost change, the
  example without its picture row).
- **A file dropped beside the board** (on the shell's menu, zoom panel or legal line, on the
  start screen) is not the board's, and nothing of the page cancels it: the board takes a drop
  that is aimed at its own element, and the page has no drop zone. By reading, a browser opens
  such a file in the tab, in the place of the app; what is kept in the browser's storage stays.
  Not seen: a real drag of a file over the DevTools protocol, let go on each of the four places
  in the headless shell, left the page as it was, so no test here can fail for it. The cure is a
  listener of the page that cancels a file drag beside the board, or the shell's drop zone.
- **In a window narrower than a model node the armed editor is cut.** A model is edited at board
  zoom exactly 1 (the arm rules), where a node of 800 px does not fit. At 400 x 800 the review
  found the armed Wardley node at left -327 px, the left half of the editor and of its palette off
  the window; at 760 x 600 at left -64 px, with its header under the board's toolbar. A pan of the
  board reaches the rest, and a delete and Done work in both. Arming at the fitted zoom where a
  node does not fit is a change of the measured arm rules and the owner's.
- **A file its modeler refuses** shows, in the example, the web app's own line (`invalidText`):
  "This file cannot be shown as it is. “Reset the example” restores it, and undoes every other
  change.", since the page has no editor for the file and the reset is the one way back
  (`app.browser.test.ts` holds the line on a kept Value Chain text that is no JSON). The app itself
  writes no such text; the review got there by writing the storage by hand, and found that Wardley
  Maps and Event Storming take the same garbage for an empty canvas in the state `ready`.
- **Known and not cured.** In a window of 400 px the shell's status box (116 to 181 px from the
  top) lies over the third row of the board's toolbar (to 135 px) while a lasting line shows; at
  480 px and wider it is clear (measured by the part that built the page, in a scratch spec with a
  storage that refuses). On a board without a repository the Image button stays and can only
  refuse, and the model picker says nothing itself: both are the renderer's, which has no place for
  a host's words there. The line of a model on such a board stands on the danger ground of a failed
  file, though a board without a repository is no failure: the host package has no state of its own
  for it. The renderer shows the name of a lazy part as text while it loads (`.board-slot`, the
  word "Toolbar"); behind the start screen a rule of `app.css` hides it, elsewhere it shows for a
  moment at the first load. The board's toolbar fits a window from 400 px: its box is 335 px wide
  from x 64 at 400, 360 and 320 px alike, so at 360 px the model picker is cut by 39 px and at
  320 px by 79 px, with no horizontal scroll (measured by the review of the third increment and
  again when the increment was closed; the e2e spec holds 600 and 400 px). The cure is a wrap
  inside the toolbar's group of add actions, the renderer's. The toast after Show example (480 x
  61 px at the bottom centre of a window of 1280 px, for about six seconds) lies over the lower
  row of models, and a double-click on a model under it arms nothing until the toast is gone; in
  a window of 320 px it appears under the pointer that pressed Show example and stays while the
  pointer rests on it (seen by the review; where a toast stands is the shell's). A model node
  whose file could not be opened can still be armed: on a board opened from a single file a
  double-click on such a node shows Done and the node at 100 %, with nothing to edit, and Done
  ends it (the renderer's and the host package's). The page's icon is the Miragon icon and not a
  modeler icon. No link in the address carries a board, there is no Share action, and no export
  but the board file.
- **Not known for it:** more than a handful of model nodes at once, any browser but Chromium, and
  touch.

## Tests of this part

The two projects and their rules are under [Tests](../CLAUDE.md#tests). This part's files:

- `npm run board test`, the unit project:
  - `apps/webapp/test` (9 files, 145 tests): `storage` (what is kept, what is left out, a storage
    that refuses, the reset and the way back from it, the open document, what its editor keeps of
    it by key, the pictures a board shows and the kept ones it does not), `keeping` (the
    repository in memory with its writes kept),
    `example` (the board is canonical, one model per notation, every named file is in the folder,
    the app reads the folder's bytes, the page's rule reaches every file of it), `check-build` (a
    whole build and one build per missing marker), `board-file` (the download's name, a file as a
    board text, a board that holds nothing, a board that names files), `column` (the shell's web
    column for the example and for a board), `no-repository` (the backend alone and behind the
    port, with the page's sentences), `web-host` (the document a web app hands the editor: once,
    every change, a refused text with and without a fallback; the place for the view handed on,
    and none where the page gives none) and `build-config` (the Vite config:
    the notices plugin in a build only, the source maps, the legal comments).
- `npm run board test:browser`, the browser project:
  - `apps/webapp/test/browser/app.browser.test.ts` (40 tests): `startApp` on a store of the test's
    own. The start screen; a board without a repository (a file handed to the page's input, the keys
    without a click, the picker, a refused picture, a file that is no board, the offer and its end,
    and the reset in the address over a kept board, which offers that board back and has nothing to
    offer for a kept text that is no board); the board as a download (the anchor the page clicks is
    held with its blob, since the browser's own download is the e2e's); the example (shown, a model
    added from the picker, `destroy()`, a page that gives the board no ancestor a fixed popup would
    be placed against); "what a person changes", six tests of one story on one store, each going on
    where the one before it ended, which keep their order in a shuffled run (`{ shuffle: false }`:
    an edit in a model, a note, a picked picture, a second start, the reset from the menu with its
    offer, the reset in the address); a kept model its editor refuses; and a browser that does not
    keep (a storage that refuses, one with no room, a picture it did not keep, a kept picture no
    node shows, an unreadable kept board). With the fourth increment: a file no notation covers
    (the card without a button and with the page's sentence, on a board opened from a file and on
    the example), the picture row of the shortcuts dialog (for the example, and none for a board
    without a repository), and where a person left the board (a second start back at the view
    and not at the fit, with nothing kept of the fit; a view left on the empty space between two
    notes that lie far apart, which comes back as the fit; another document and its Undo
    fitted, the place forgotten; a storage that refuses the view, which stops nothing and says
    nothing). A
    browser test that reaches for the toolbar or counts
    drawn nodes right after a mount waits first: both are lazy parts, and a shuffled order found the
    tests of this file that did not (12 shuffled orders of the two app files pass since).
