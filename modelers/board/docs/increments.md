# The increments of the board's apps

A part of the board's guide, moved here from [`CLAUDE.md`](../CLAUDE.md) as it was written. That
file keeps what every change needs and names
[every part's document](../CLAUDE.md#the-parts-and-their-documents).
Where an increment differs from its plan, what its lead decided and what it found and did not
change is written here, one increment after the other.

## The first increment of the apps against its plan

The apps are built after a plan, increment by increment. Where the tree differs from the plan
of increment 1, and why:

- **The alias list** maps every exported subpath of a package before the package, not only a
  renderer's sheet: with string aliases `@miragon/board-host/assets/embed.css` would otherwise
  be read as a file below `packages/host/src/index.ts`. It has 39 entries, and
  `apps/editors/tsconfig.json` the same 39 paths, where the plan counted 22.
- **A third dependency rule**, `packages-no-apps`, beside the two the plan asked for; and
  `packages-no-other-modeler` covers every app but `apps/editors`, tests included.
- **`commands.realInput` has no wait**, which the prototypes had: a test polls after the call.
  It has `wheel`, `keydown`, `keyup` and `text` in addition.
- **The files server** hands a place the writes of one path one at a time and answers a refused
  write once the last write of that path settled; a second hello starts the page's life anew; a
  hello of another protocol is none; a backend read that rejects is answered with
  `board.failed`. The plan fixed the messages, which are unchanged, and said none of this. The
  prototype it started from had nine defects that the plan's own test list brought up, each
  repaired under a test.
- **The binding reads the file's text when an import starts**, not the text that came with the
  change event; the first fit is made on the first accepted text, not once the first import
  settled; no write is made before the first text was accepted. Each repairs a defect of the
  prototype.
- **New behaviour the plan did not have:** while a node's state is `invalid` or `gone` its
  editor is `inert`.
- **The text rules are each modeler's own**, as its ide-editor has them. So only Value Chain and
  Business Model Canvas hand back the file's own text for the same canvas; the plan's sentence
  "the JSON notations hand back the file's own text" holds for Value Chain alone.
- **C4's `relayout` runs a microtask after `focus()`**, where the plan has it in `focus()`.
- **Two sheet test files** where the plan names one: a page keeps every sheet it loaded, so each
  load order needs a page of its own.
- **The web app** attaches the board to a child of `#app`, with the line below it in the page's
  flow, so that nothing of the page lies over an armed editor; `startApp` takes `search` and
  does the reset itself; the reset link is a plain navigation; the picture is read as text and
  encoded; the build check is two files with a unit test and reads eight sheets, not one. The third
  increment replaced the page around the board: the footer, the link and the app's own sheet are
  gone ([The third increment of the apps against its plan](#the-third-increment-of-the-apps-against-its-plan)).
- **Made by the integration:** the exclusion of the apps' build output from the cruise;
  `src/keeping.ts`, cut out of `app.ts` so that the wrapper has a unit test, with the memory
  backend's log emptied after every write; `apps/editors/test/cruise-rules.test.ts`; the filter for
  Chromium's ResizeObserver line in the renderer's tests (`test/support/console-complaints.ts`, see
  the test README) and in the watch of `apps/editors`, with a test of each; the limit of 90 s for a
  test or a hook that loads the seven renderers first; and the kept order of the web app's one
  story in a shuffled run.
- **Made after the review:** the second pattern of `packages-no-other-modeler` and the rule
  `host-no-editor-libraries`; in the files package the control characters `repoPath` refuses, the
  names a new file may not have, `NEW_FILE_LIMIT_BYTES`, bytes that must be a base64 text and a
  request id that must be a whole number; in the web app the pictures forgotten at the start, the
  line for a picture that was not kept, and the wording of the line after a refused save (it read
  "does not keep your changes" while a later change was kept); in the battery of `apps/editors` the
  wheel as the end of an edit for all seven, the second node on the Wardley file and the change
  from outside under an armed Value Chain. The messages of the protocol and the declared exports
  are as the plan has them; `NEW_FILE_LIMIT_BYTES` is one export more.

## The second increment of the apps against its plan

**The lead's decisions for the increment.** The owner was told each and may turn each round; none
is the owner's yes.

- **L1, what a page may reach inside the root.** A page reaches only what a board can show: no dot
  segment at any depth, a text only of a model and bytes only of a picture by the host's rule, and
  a backend with a disk checks what a path's text cannot say. Built
  ([The files port](files.md#the-files-port-packagesfiles), [The host half](vscode.md#the-host-half)). The lead
  named a linked folder on the way as what would not be checked; since the closing round it is,
  which is one more decision that is not the owner's.
- **L2, a version of a text, `PROTOCOL` 2.** A crossing edit and outside change must not leave page
  and place apart. Built: the outside wins, the edit that crossed is dropped whole.
- **L3, the renderer stays as it is.** `BoardHandle.onViewChanged` waits for the owner's yes;
  `apps/ide-editor` polls the view once per animation frame. No file of `packages/renderer/src` or
  `packages/schema-model/src` changed, and the arming traces are the bytes they were. Of the
  renderer's work package only one test case was written (see [DOM contract](../CLAUDE.md#dom-contract)).
- **L4, saving.** Built on a model as a dirty document of its own that the person saves. The lead's
  recommendation to the owner, that saving the board's tab also saves the models the board made
  dirty, is not decided and not built; what it would need was measured in a real VS Code
  ([Saving, as measured](vscode.md#saving-as-measured)).
- **L5, a real VS Code.** The owner allowed one inside the suite's Docker runner on the machine the
  increment was built on, so the smoke `apps/vscode/test-smoke` and its scripts were pulled forward
  from the next increment, and the list of things only read about VS Code was walked there. The
  smoke is written and passes in the runner on VS Code 1.146.0 and 1.96.0; the list has each item
  as seen, as differing or as not reached. The owner's own walk with the VSIX is still to come.
- **L6, root files.** `package-lock.json`, `release-please-config.json` and
  `.release-please-manifest.json` changed, for what `test/release-config.test.ts` names.
  `test/modeler-collection.test.ts` and every other root file stay as they are; what that test asks
  for is under [State of the port](state.md#ci-and-what-a-merge-publishes).
- **L7, the working names** stand: extension `board-modeler`, publisher `miragon-gmbh`, view type
  `board.boardEditor`, `engines.vscode` `^1.96.0`, a preview. The owner's to fix before a first
  publish.
- **L8, the dependency on other modelers** stays as built: in `apps/editors` alone
  ([Packages](../CLAUDE.md#packages)).

**Where the tree differs from the plan, and why:**

- **The files port.** A stale edit gets no answer of its own, where the plan says "refused and
  answered": the update that made the newer version is already on its way, and a second one would
  cost the page what it wrote since. The version is counted by `serveFiles`, per open text and per
  life of a page, and a backend never sees it. `BackendText.write` and `TextSession.write` got a
  second parameter, the text the write was made on, which the plan does not name: without it a
  place that awaits before it writes could replace a change it has not told yet, and a drop made
  under a held gesture replaced an outside text. The rule also holds for a create and for what a
  page is told (the list, the changed bytes, the moves). New beside the plan: `board.text.settle`
  with `BoardFiles.settled()`, a retry of the facade by the list of paths, `invalidText`, and a
  guard that takes a place's word of the text it handed out last for no version.
- **`createVsCodeBackend(vscode, { board, suffixes, indexes? })`**, not
  `(vscode, { root, suffixes })`: the shell's `onDidOpen` is synchronous and the root is found with
  stats, so the backend is made for the board file and looks for its root afterwards.
  `boardEditorOptions(backendFor)` is generic over the document and serves a backend that answers
  every request where it is handed none.
- **The host counts its own version**, which is the files server's count; the plan left the choice
  open. What the backend adds is the test of the write's base against the document's text in the
  task that hands VS Code the edit.
- **The list leaves out `node_modules`**, which the plan does not say (`findFiles` reads no
  `.gitignore`), and a created folder is answered with a whole search again, not with a search
  below it. A model's size cap is 2 MiB; the plan names no number. `BackendText.readOnly` comes
  from `stat`'s permissions.
- **`mountBoardEditor`**: `root` is optional (default `#app`); there is no `example` option; the
  handle also has `document`; and `destroy()` returns a promise, because the board unmounts its
  editors a microtask after its own `destroy()` and the files may only go after that.
  `boardZoomTarget` takes one options object, since `canFit()` follows the content. New beside the
  plan: a text the board already shows is not imported, and a document the host opened read only is
  locked like an invalid one.
- **The sheet's start margin** is the shell's token `--cd-shell-frei` and not the literal 64 px,
  and the third rule puts React Flow's attribution above the zoom panel, where the plan only says
  "clear of the zoom panel".
- **The explicit fit is a jump**, not the 250 ms animation the shell's `ZoomTarget` describes: the
  board's own Fit button jumps too, and every animation tick would be a board zoom under the arm
  rules. The first fit is made only if the board has content at its first accepted text.
- **No `tsconfigRaw` in `webviewBundle`**, which the plan's scratch build had
  ([The suite's editors](editors.md#the-suites-editors-appseditors)).
- **The webview's export** is `{ files, mounted, destroy() }` with `mounted` a promise:
  `mountBoardEditor` is async and an IIFE bundle has no top-level await. Its teardown does not
  await `files.settled()`.
- **Playwright Test runs the project `vscode-webview`** on the machine the increment was built on,
  through the local sandbox config; the plan had a Vitest browser file as the way out. The
  shipped-bundle spec builds the extension itself and answers every request of the page, not one
  `board.text.open`, so all seven renderers run under the policy.
- **The scripts `test:vscode` and `test:vscode:docker`** are scripts of the board workspace, as in
  Business Model Canvas, since the Docker runner's default command is `npm run test:vscode` in the
  modeler's folder.
- **More rules and more tests than the plan lists**: `vscode-host-no-page-code` reaches further
  than the plan's sentence (React Flow, Yjs, the shell's entries for a page, all of `apps/editors`
  but the suffix table), `packages-no-apps` names every app workspace, and both new workspaces have
  more test files than the module layout names.
- **Made by the integration:** the board file in the test page's repository and the test that it is
  never a file of the files; the held deliveries of the test page and the test of an edit that
  crosses a change from outside in the page; the test of a reloaded webview over the channel; and
  the paragraphs of this guide.
- **Made after the run in a real VS Code**, each for something a real one showed and the stand-ins
  had not: the index's watcher on every entry, with its look at a new folder and the list kept to
  what a search finds; `src/webview/paste.ts`; the first fit in an animation frame; the fake's
  watcher, its documents of removed files and its read-only files; the smoke's custom step in
  three parts, where the plan asks for a model drawn and the picture loaded.
- **Made in the closing round**, after an independent review
  ([State of the port](state.md#the-reviews-of-the-increments)): the look at every folder on the way to a file, and
  the limit of a written model's size ([The host half](vscode.md#the-host-half)). Both were seen afterwards
  in the runner, on VS Code 1.146.0 and 1.96.0, by a scratch script that handed the extension
  the messages of a page and wrote a node onto the board.

## The third increment of the apps against its plan

The increment's aim: everything the suite's CI asks of a modeler, so that a pull request with this
branch could pass `ci-ok`, and nothing of the product beyond that. No pull request was opened and
nothing was published.

**The lead's decisions for the increment.** The owner was told each and may turn each round; none
is the owner's yes.

- **M1, the deviation.** The board keeps a toolbar of its own beside the shell's chrome, its e2e
  projects run the board's own specs and not the shell's conformance kit, and the smoke runs
  without the steps keys, history and workbench: written down with its end under
  [Three deviations under the shell](ide-editor.md#three-deviations-under-the-shell-each-with-an-end).
- **M2, the public names** stand as working names: extension `board-modeler`, publisher
  `miragon-gmbh`, view type `board.boardEditor`, `engines.vscode` `^1.96.0`, `preview: true`. They
  are fixed with the first publish.
- **M3, release components** in the Business Model Canvas pattern: eight, one per workspace the
  extension or the web app bundles ([Packages](../CLAUDE.md#packages)).
- **M4, the path rule.** A change under another modeler's `packages/` also runs the board's jobs.
  Built wider than the decision's words: the rule also takes a modeler's `example/` and its
  `apps/vscode/package.json`, the two other things the board's tests read of a modeler
  ([Commands](../CLAUDE.md#commands)). Cutting it back is one line of `.github/scripts/ci-paths.sh` and three
  rows of `test/ci-paths.test.ts`.
- **M5, the extension pack.** `board` is in `PENDING_FIRST_PUBLISH` of
  `test/modeler-collection.test.ts`; the pack and its walkthrough are untouched.
- **M6, the web app** inside the shell's web column through `apps/ide-editor`, with what it was
  before as what "Show example" opens
  ([The web app](webapp.md#the-web-app-and-the-example-appswebapp-example-e2e)).
- **M7, third-party notices** for what the web app's build and the VSIX carry, with a check that
  fails when a build names a licence file it does not hold
  ([The suite's editors](editors.md#the-suites-editors-appseditors)).
- **M8, the root's documents.** The board's rows, and the sentences that were untrue with the
  board in the tree, in the suite's `CLAUDE.md`, `CONTRIBUTING.md`, `README.md` and the three issue
  templates; the board is marked as in progress and unpublished there.
- **M9, an icon.** The extension has one, the Miragon comet, copied and not drawn
  ([The webview half](vscode.md#the-webview-half-srcwebview), the papers). The web app's `favicon.svg`
  follows the same decision.

**Where the tree differs from the plan, and why:**

- **The notices are written by the build** and not committed, where the plan's module layout names
  the other modelers' pattern, a committed file with `npm run notices`: a committed list of what
  seven renderers bundle would go stale with a dependency bump in any modeler.
- **No `CHANGELOG.md` per component** but the extension's, which the plan lists: release-please
  writes each with the component's first release, as for Business Model Canvas and C4. No version
  line changed: every workspace stays at 0.0.0.
- **14 `extra-files` entries of the first two increments went**: the pins in the board's own
  manifests under the contract, the shell and eleven components of the other modelers. With the
  board's workspaces components themselves, release-please's `node-workspace` plugin moves those
  pins, and the root test no longer asks for the entries.
- **The web app** is split into more modules than the plan names (`actions`, `column`, `page`,
  `session`, `web-host`, `no-repository`; the plan's `files.ts` is `board-file.ts`), for the lint
  limit of a function and so that the pure parts have unit tests. Every document is an editor of
  its own. The reset is an entry of the shell's menu with an Undo, the footer under the board and
  `page.css` are gone, and the lasting lines stand in the shell's status box. `startApp` takes
  `komet` and returns `{ ready, editor(), shown(), settled(), destroy() }`. The page starts on the
  start screen, as every web app of the suite, and no longer on the example. The model picker of a
  board without a repository cannot say why it is empty, so the page says it in a toast.
- **`apps/ide-editor`** got a host type a web app fits (`BoardEditorHost`), the options
  `invalidText` and `fileKeys`, a lock that writes `inert` only for its own change, and two rules
  for the web column in `app.css`, where this guide had said three and no more.
- **The smoke and its scripts** were built with the second increment and are unchanged.
- **Made by the integration:** the two lines of the lockfile for the web app's new pins (written
  by `npm install --package-lock-only`, which changed nothing else); the notices plugin in the web
  app's Vite config, the notices check in its `check:build` and `test/build-config.test.ts`; the
  notices check behind `package:vscode`; the example's sentence on the reset, which is a menu
  entry now; the board's row and paragraph in `docs/ci-and-releases.md`; the sentence on the
  smoke's themes in the root `CONTRIBUTING.md` and the root documents' links to the deviation; and
  the paragraphs of this guide.
- **Made after the review of the increment** ([State of the port](state.md#the-reviews-of-the-increments)): the offer
  of a kept board at `?reset`, the copied works in the notices check, and the extension's README
  without a word on where it is published, each with its tests.
- **Named and not changed**, outside what the integration could edit: `.miragon/brand.json` and
  `test/brand-lint-config.test.ts` do not name the two licence texts under
  `apps/editors/build/licences/`, which are third-party text as Context Maps' `apache-2.0.txt` is.
  The two files change together or not at all (the test passes as the tree is), and brand-lint was
  not run on them. Both files name the two texts since the fourth increment.

## The fourth increment of the apps against its plan

The increment's aim: daily use in VS Code, what a person meets in the first hour with a board in
a real repository. It was built without the owner's walk and without an answer to the open
decisions, so it builds what needs no answer, and where an answer is missing it builds the thing
so that both answers can be tried, with the behaviour from before as the default. All of it is
tested against the fake VS Code, the shell's stand-in and a repository in memory. None of it had
run in a real VS Code when this was written; that walk is the next step, and what it shows is
written into [the extension's document](vscode.md). No pull request was opened and nothing was
published.

**The lead's decisions for the increment.** The owner was told each and may turn each round; none
is the owner's yes.

- **N0, a hold on publishing.** The review of the third increment found that a merge sets a
  publish of the extension in motion and nothing in the tree holds it. As built: `HELD_BACK` in
  `.github/scripts/release-plan.mjs` with its cases in `test/release-workflow.test.ts`, a case in
  `test/release-config.test.ts` that a component at 0.0.0 names an `initial-version`, and the two
  licence texts under `apps/editors/build/licences/` named in `.miragon/brand.json` and
  `test/brand-lint-config.test.ts`. Against the patch the review of the third increment tried:
  the list names the modeler (`board`) and not the extension, so that a package or an Orca plugin
  is held too, and inside a workflow run `--all` lifts the hold only for the `dry_run` input. No
  workflow file changed. What the hold does and how it ends is under
  [CI and what a merge publishes](state.md#ci-and-what-a-merge-publishes).
- **N1, saving.** The default stays: a model edited on a board is a dirty document of its own
  that the person saves. New, as the setting `miragon.board.saveModelsWithBoard`, off by default:
  a person's save of a board also saves the models that board made dirty, after the board's
  did-save, only for the reason Manual, never for auto save or a save the extension makes; a
  model whose save fails stays dirty. A model the person also changed in its own tab is the same
  document and is saved with it, which the setting's description says. Saving every edit at
  once is not built. The setting's name, its description and its default are the owner's
  ([The host half](vscode.md#the-host-half), Saving). Since the closing round "the models that
  board made dirty" holds across a board that is closed and opened again or renamed, and not
  across a reloaded window; a model that was clean since the board changed it is no longer
  one of them; and a model whose file is gone is left unsaved.
- **N2, the root rule** stays as built: the nearest folder with `.git` above the board, else
  the workspace folder.
- **N3, a file no notation of the suite covers** is a card with the file's name and "Open in
  its editor", in the place of the look of a failed file. The page asks the host to show the
  file and never gets its content; the path rules of the files port hold for it, and a backend
  with a disk checks the links. In the web app the card has no button and says "This app cannot
  show this file.". The picker still offers the seven notations by their suffixes. Built
  ([The host package](host.md#the-host-package-packageshost),
  [The files port](files.md#the-files-port-packagesfiles), The host half), with two things the
  decision did not say: the host says in a welcome whether it shows files, and a card is armed
  like every model node, which it takes as the wish to open the file.
- **N4, files that move.** A rename or a move in VS Code, a folder included, reaches every open
  board: a model node's path through its editor's `relocate`, an image node's through
  `store.amend`, neither on the board's own history; the board file is then dirty and the
  person saves it. Built beyond the plan's `relocate` alone: the node keeps its editor across
  the move (its modeler, view, history and selection), where a relocate by itself made it anew.
  Not followed, as decided: a board that is not open, and a file another program moves, whose
  node says that its file is gone. Not followed, and not decided: a file below a renamed folder
  that the list does not hold, and the file of a card. An edit that is on its way when its
  file is renamed may not land: since the closing round its node says so.
- **N5, the view** of a board is kept by its host and restored in the place of the first fit
  where it still shows the board, which since the closing round means one of its nodes: the
  webview's state in VS Code, the browser's storage in the
  web app ([The board inside the shell](ide-editor.md#the-board-inside-the-shell-appside-editor)).
  A tab that was hidden keeps its page, so nothing is restored there. The web app keeps one
  place, for the open document: only the last visit's document comes back to its view.
- **N6, an entry in the Problems view** for a board text that cannot be read, at the line the
  reader's reason names, gone when the text is valid or VS Code closes the document. Built (The
  host half), and with it the page's problems pill gets its count.
- **N7, commands** in the suite's pattern, on the shell's `registerNewDocumentCommand`: New
  Empty Board, New Board from Example with the example's files beside it, Open Source to the
  Side, and a walkthrough of the extension's own. Built (The host half). The collection's
  walkthrough and the extension pack are untouched.
- **N8, words for a dropped edit.** An edit that crosses a change from outside, one that would
  make a model larger than the limit and one the place did not take are still dropped whole;
  the node whose change it was says so once, in a sentence over the bottom edge of its editor,
  and the protocol carries the reason. Built (The files port, The host package). Since the
  closing round also for an edit that was on its way when its file was renamed. Still without
  a word: an edit into a file that is gone, whose node says that the file is gone; an edit
  whose page went before the host answered; and the three the host package's document names
  ([Words for a dropped edit](host.md#the-host-package-packageshost)).
- **N9, limits a page cannot pass.** Reads of one path that are on their way are one read and
  one answer, four reads run at once, new files and shown files go one at a time. Built (The
  files port), with numbers the decision did not name for what may wait at one time: 4096
  requests, new files up to two files of the limit, edits up to 32 MiB of text and, since the
  closing round, 4096 edits by their count and one file to be shown behind the one that is
  being shown. They bound what waits,
  not what a person may do in sum: the budget for the new files of one editor stays the
  owner's and is not built.
- **N10, the renderer, the schema model, the shell and the contract stay unchanged**, and so
  does every other modeler: no file of `packages/renderer/src`, `packages/schema-model/src`,
  `packages/shell` or `packages/api` changed, the arming traces are the bytes they were, and no
  file under another modeler's folder differs. What daily use needs from them is in this
  increment's list under
  [Found while the increments were built](#found-while-the-increments-were-built-and-not-changed),
  each with the exact change.
- **N11, the guide is split.** Each part's section is a document of its own, and `CLAUDE.md`
  keeps what every change needs, in 900 lines or so. Built into `docs/` and not into a README
  of each part's folder, which the decision named: Markdown under `docs/` runs no job of CI
  (`classify` answers `modeler board` for a README in `packages/files`, `apps/vscode` or `e2e`),
  lies in no release component and goes into no VSIX, and `apps/vscode/README.md` stays the
  extension's README for a person who installs it. Ten documents, two of them beyond the
  decision's list: `state.md` for the record behind the state, and `renderer.md` for the
  renderer's layout, what is left with the host and the sheets, which the decision's list of
  what stays does not name. The dated lists of Deferred moved to this document and to
  [Found in a real VS Code](vscode.md#found-in-a-real-vs-code); its standing lists stayed.

**Taken for granted about VS Code in this increment**: sixteen points, each walked through in a
real VS Code after the integration, on 1.146.0 and on 1.96.0 in the suite's Docker runner, under
[Taken for granted for daily use](vscode.md#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code).
Ten were seen as assumed. Two differed and changed the code and the fake: a document of VS
Code has one line break and never a lone carriage return, and the watcher may name the first
entry of a drag as gone before VS Code says that it moved, for which the index got a short
memory. Four were seen in part, with one thing of each not reached: a drag from a file manager, a file whose default editor
is another extension's, the native file dialog with its filter, and the guard against a second
round of saves. The review then reached the guard, which holds, and a default custom editor
in kind, a second one of the same extension. What the walk found and did not change is under
[Found in a real VS Code](vscode.md#found-in-a-real-vs-code).
**Where the tree differs from the plan, and why:**

- **No walk and no answer came before it.** The plan builds "the saving rule the owner chose
  after the walk" and ends with the decision to merge. The owner has not walked the VSIX, so
  the rule is a setting that is off, and the decision to merge is not part of the increment.
- **The smoke's custom steps came after the integration**, with the walk, since they need a real
  VS Code: an armed model that is edited and saved in its own tab, the undo key inside it, a
  rename in the Explorer by F2, and the saved text read again by its notation's own modeler in
  the webview, which stands in for "a text its own parser accepts", the smoke having no reader
  of another modeler ([The smoke in a real VS Code](vscode.md#the-smoke-in-a-real-vs-code-test-smoke)).
- **Deleted and re-created files** are the facade's states as the second increment built them
  (a file that is gone, and one that comes later): nothing was added.
- **Paste, drop and the file dialog inside a webview.** The paste was cured with the second
  increment and the dialog was seen there. For the drop nothing is intercepted: VS Code takes a
  dragged file outside the page unless Shift is held (read from VS Code 1.96.0 and 1.146.0),
  so the board's shortcuts dialog names the drop that reaches it, through the option
  `pictures` of `mountBoardEditor` ([The webview half](vscode.md#the-webview-half-srcwebview)).
- **`PROTOCOL` 3**, which the plan does not name: a new message is a new protocol. Beside
  `board.file.show` it has `board.welcome` (whether the host shows files, before the first
  list), `board.text.dropped` with its reason, and `alsoFor` on `board.bytes`, the one answer
  to joined reads. `BackendText.write` changed its meaning: resolving false is a crossed edit,
  a rejection with `WriteRefusal("too-large")` an edit that is too large, any other rejection a
  refused one.
- **A `.board` path gets a card too**, where the host package answered undefined for a board
  before: N3 says every path no editor covers.
- **The moves are told by the index** of a root and not by a listener of each backend, so
  every board of a root hears a move before the index says that the old path went. A write VS
  Code refused because the document moved on is told as crossed, and as refused only for a text
  that did not change.
- **The Problems entry** is kept for every open document whose name ends in `.board`, in a
  text editor too, and the shell gets `refresh` and no `clear`.
- **New Board from Example** writes the example for its place: a node stores a path from the
  repository's root, so the paths get the board's folder in front, and the paragraph of the
  example's note that speaks of the browser is left out. The example is in the host bundle as
  texts. **New Board** is titled "New Empty Board", the suite's pattern.
- **`createFirstFit`** takes its test seams in an options object beside `kept` and `shown`.
- **Made by the integration:** `docs/renderer.md` and the links that follow it; the test page's
  count of problems and the test of the pill beside the board's toolbar; the tests of the page
  for a renamed folder, with the board's own history and the document's undo, and for the words
  of a dropped edit; the rule test for the mount's `pictures`; the sentences on a dropped
  picture in the extension's README; and the paragraphs of this guide.

**The review of the increment, and its closing round.** After the walk an independent review
ran the gate again, tried to lose a person's work, attacked the new requests as a page that is
not the board's, read the release path and walked a real VS Code a second time. The gate held
and the hold held. It found one way to lose an edit without a word, three things the saving
setting did that its words did not say, a kept view restored into empty space, two things a
page could still make a host do without a bound, and ten sentences that were untrue. The
closing round changed these, each with a test that fails without it, and saw each that touches
VS Code again in the runner on both versions
([the review in a real VS Code](vscode.md#the-review-of-the-fourth-increment-in-a-real-vs-code)):

- **An edit that crosses a rename is said.** The binding of the host package keeps whether a
  write was on its way when it left its session, and says `dropped` where the text of the new
  path lacks it ([The host package](host.md#the-host-package-packageshost)).
- **The models a board made unsaved** are the extension's record and no longer an editor's,
  kept by the board file's name: a board that is closed and opened again, or renamed, still
  saves them. A document that was clean in between (saved, reverted, taken back to the saved
  text) is no board's any more. A model whose file is not there is not saved
  ([The host half](vscode.md#the-host-half), Saving).
- **A kept view is restored where it shows a node**, each asked by its own box
  ([The board inside the shell](ide-editor.md#the-board-inside-the-shell-appside-editor)).
- **4096 edits wait at most, and one file to be shown** behind the one that is being shown;
  the short name Windows has for Git's folder is refused as a path
  ([The files port](files.md#the-files-port-packagesfiles)).
- **The fake VS Code** tells a change of the unsaved state as the walks' logs have it: apart
  from the change itself, twice for a revert, and before the rename event for a renamed file,
  whose clean document moves too.
- **The sentences:** the setting's description, the extension's README and the walkthrough page
  say which models stay unsaved; the README no longer says what VS Code does with a picture
  that is dropped without Shift, which nobody saw, and names the edit that crosses a rename and
  the undo that leaves a board looking saved; the comments and the documents that the review
  named follow the code.

Of 38 single edits of what the closing round wrote, 37 fail a test; the one that passes is
named in [the extension's document](vscode.md#the-host-half) (Tried against the tests). What
the round left is in this increment's list below, each with its change.

## Found while the increments were built, and not changed

The board's standing list is under [Deferred](../CLAUDE.md#deferred). These are the lists of the
increments, moved here from there; an increment adds its own.

**Found while the first increment of the apps was built, and not changed.** In the renderer, in
the suite's tooling and in other modelers; each is its owner's to decide.

- **`focus()` before the box** ([What is left with the host](renderer.md#what-is-left-with-the-host)). The
  cure in the renderer is to write the box before the call in `placeHost`, a change of the
  measured order.
- **`EmbeddedEditor.ready`.** The JSDoc of `host/types.ts` does not say that the board reads it
  only for a node that is still there (`surface/overlay-surface.tsx` attaches its handlers after
  the `cancelled` check). A host whose `ready` rejects for a node that went meanwhile gets an
  unhandled rejection unless it marks the promise handled, as the host package's facade does.
- **`relocate` is one amend per node**: a moved file that two nodes show is two changes of the
  board (run once by a review with two nodes on the real renderers, in scratch; the kept test
  holds one change for one node).
- **The preset rule `dom-free-no-renderer`** (`tooling/dependency-cruiser.cjs`) matches relative
  imports into `packages/renderer/src` only. An import of `@miragon/board-renderer` by name from
  a DOM-free package is caught for `files` by the board's own rule and for `schema-model` by
  nothing. A root file.
- **Event Storming**, seen once in an exploratory run and not followed up: after a real Delete of
  a sticky and Control + Z, `exportText()` was not the text from before the delete, and
  `elements.list()` named the restored sticky last. In a board an undo after a delete would
  leave the file with another line order.
- **Business Model Canvas**, seen once: a real drag that drops a sticky where it was fires
  `onContentChanged` while `exportText()` is unchanged. The binding absorbs it: nothing is
  written.
- **C4**, the bare renderer in a narrow box: the breadcrumb bar stands at left 12 px, top 64 px
  and lies over the palette column, alone and in a board alike (measured at 420 px).
- **The example files of Context Maps and Event Storming** (`example/sample.cm`,
  `example/order-checkout.storm` of those modelers) are not in their modeler's canonical form:
  right after `importText(example)`, `exportText()` is another text. Their own editors write
  the export, so the first edit of such a file in a board also writes that difference: one
  newline at the end of `sample.cm`, two dropped blank lines in `order-checkout.storm`.
- **Vitest keeps transformed modules on disk** under the root's `node_modules/.vitest-cache`,
  keyed by the plugins' names and not their options: two runs with a plugin of one name and
  different options answer for each other. The tree's own configs have no such plugin. A table
  of single edits that is applied by such a plugin must not take a transform hook that did not
  run for an edit that was not applied: on a second run the module comes from the cache.

**Found while the second increment was built, and not changed.** In the shell, in the renderer and
in the tooling; each is its owner's to decide. What was found in the files port, the host package
and the extension stands in their own sections.

- **The shell's focus fallback** (`focusCanvasOrTrigger` in `packages/shell/src/dom/mount.ts`, by
  reading): it looks for `svg[tabindex]` in the slot. Under a board that is the svg of the first
  model's editor, inert in a preview, so the focus falls to the menu trigger and never to the
  board's pane. It runs when the empty-file hint hides while it holds the focus and when a dialog
  closes without a remembered element. The zoom target's own `focus()` goes to the pane and is not
  affected.
- **The shell's stacking** (measured in the browser test of `apps/ide-editor`, pinned there as
  built): `.cd-shell > .cd-shell-canvas` is `isolation: isolate; z-index: 0`, so a
  `position: fixed` popup of an armed editor lies under the shell's islands whatever its z-index.
- **The shell's `resync()` into a panel that is gone** (read in VS Code 1.96, then seen by a
  review in VS Code 1.146.0 and 1.96.0, item 21 of
  [Taken for granted about VS Code](vscode.md#taken-for-granted-about-vs-code)): `panel.webview` throws
  "Webview is disposed" once the panel is disposed, and the shell's `post` in
  `vscode/extension/modeler-editor.ts` is `panel.webview.postMessage(message)`, so its resync after
  an edit that VS Code refused while the panel closed rejects inside the shell's message handler.
  Nothing else follows. The board's own channel catches a throw and a rejection. A guard, for the
  shell's owner:
  `const post = (message) => { try { return panel.webview.postMessage(message); } catch { return Promise.resolve(false); } }`.
- **The shell shows any text a page posts as a notification** (`vscode/extension/modeler-editor.ts`,
  the cases `info` and `error`). Seen by a review in VS Code 1.146.0 and 1.96.0: a message
  `{ type: "info", message }` handed to the extension as the page posts it stood as a toast of
  VS Code with exactly that text, and on the stub one of 100,000 characters did too. The board's
  page posts neither type, so for the board this is only what a page that is no longer the
  board's could do: put words of its own into a notification of the extension. `showProblems`
  opens the Problems panel and nothing else, and no other message of a page runs a command. A
  cure, for the shell's owner: an option of `registerModelerEditor` that turns the two answers
  off for a modeler that posts none, or a cap on the length and a fixed prefix.
- **The shell's policy leaves `base-uri` and `form-action` open** (`contentSecurityPolicy` in
  `vscode/extension/html.ts`). A `<base href>` that a page adds takes effect (seen by the review:
  `document.baseURI` was the other site's), though every load was still held by the other
  directives. A cure, for the shell's owner: `base-uri 'none'; form-action 'none'`.
- **A view the host sets ends an editing** (the arm rules' viewport watch): every step of the
  shell's zoom panel while a model is armed, and, by the plan's spike and not run here, the zoom
  keys pressed inside an armed editor whose focus is on its svg. The contract recommends that a
  host's view change leaves an interaction open.
- **Three pixels.** The toolbar's top edge is at 15 px (React Flow's panel margin), the shell's
  menu trigger at 12 px. A cure is a fourth rule of the app's sheet, which moves the band the arm
  rules read, or a change of the renderer.
- **No end signal**, as under Not built ([Deferred](../CLAUDE.md#deferred)): `mountBoardEditor` knows that the editors are gone only by
  queueing a microtask behind the one `destroy()` queues. A change of that timing in the renderer
  breaks the order for every host, and the order test of `apps/ide-editor` fails then.
- **A board file whose lines are not in the canonical order** is shown as it is and rewritten in
  the canonical order by the first gesture: one edit over every line between the first and the last
  that differ.
- **The cruise and an import that does not resolve.** A relative import into another modeler that
  does not resolve is named by its specifier as written and is then not matched by
  `packages-no-other-modeler`. Harmless in practice: the type check fails on the unresolved module.
- **A build that leaves its maps behind.** `build:vscode` followed by `package:vscode` leaves the
  development build's source maps in `apps/vscode/dist` beside the production bundle, since esbuild
  does not clean. The VSIX leaves them out.

**Found while the third increment was built, and not changed.** In the renderer, the host
package, the shell and other modelers; each is its owner's to decide.

- **A board without a repository has no words of its own in the renderer and the host package.**
  The host package's `openEditor` shows a host's reason for a file it cannot open behind its fixed
  "This file could not be opened.", on the danger ground of a failed file; a state and a line of
  the host's own, as `invalidText` is for a refused file, would say it without the look of a
  failure. The renderer's toolbar has no place for a host's words when the model list is empty,
  and `gestures/images.ts` words the notice for a picture a host does not store itself. Until
  then the web app says both in its own toast and notice text.
- **The word of a lazy part.** `.board-slot` shows the name of the part as text while it loads
  ("Toolbar" in the middle of the board, for a moment at the first load). Behind the web app's
  start screen a rule of `app.css` hides it.
- **The status box over the toolbar's third row** below 480 px
  ([The board inside the shell](ide-editor.md#the-board-inside-the-shell-appside-editor)).
- **The shell's focus fallback in the web host** (as above, `svg[tabindex]`): after the start
  screen's New diagram the shell hands the focus to the menu trigger and not to the board. The web
  app focuses the board's pane itself, there and after every document it mounts.
- **C4's own builds**, by reading and not built here: its VSIX and its web app keep dagre's legal
  comment, and neither ships `dagre.esm.js.LEGAL.txt`. Its VSIX has dagre's licence text in its
  notices; its web app has no notices file.
- **Nothing in the suite keeps a modeler on `main` from being published**
  ([State of the port](state.md#ci-and-what-a-merge-publishes)): an opt-out would be a change of
  `.github/scripts/release-plan.mjs` with a root test, tried in a scratch copy and written down
  there. Made with the fourth increment: `HELD_BACK` in that script.
- **The toolbar below 400 px, the toast over the lower row of models, and a failed node that
  arms** ([The web app](webapp.md#the-web-app-and-the-example-appswebapp-example-e2e), Known and not
  cured). The first and the third are the renderer's, the second the shell's.
- **No root test holds `initial-version`.** With that line taken out of a component at 0.0.0,
  `test/release-config.test.ts` still passes, and release-please would then propose 1.0.0 for it
  (tried by the review of the third increment for `board-webapp`; the same holds for Business
  Model Canvas on `main`). A case in that test is a root change. Made with the fourth increment:
  the case "names the first version of every component that was never released".
- **`npm ci --dry-run` is no check of the lockfile**: it printed "up to date" while the lockfile
  lacked two dependencies a manifest of the board named, both workspaces that were linked already.
  `test/release-config.test.ts` failed for it, since two `extra-files` entries pointed at the
  missing lines.

- **The root tests leave files in the temp folder.** `ci-paths.sh affected` makes a file with
  `mktemp` and does not remove it (on `main` too), and `test/ci-paths.test.ts` calls it for every
  case: one `npm run test:plugin` leaves 58 small files `tmp.*` in the OS temp folder. Where that
  folder must stay clean, run it with `TMPDIR` set to a folder of one's own.

**Found while the fourth increment was built, and not changed.** In the renderer, the schema
model, the shell, the files port, the host package, the extension and the root; each is its
owner's to decide, and each has the change that would cure it.

- **An armed model does not fit an editor narrower than its node**
  ([The board inside the shell](ide-editor.md#the-board-inside-the-shell-appside-editor)), which
  is the usual case of a board beside a text editor in VS Code. The change is the renderer's: a
  further value of `ArmZoom` in `arming/types.ts`, the largest zoom up to 1 at which the node
  fits the board's box inside the host's insets, with its branch in `targetZoom` and in the
  placement of `arming/arm-rules.ts`, and the factory's default taken from it. It changes the
  measured arm rules: the recorded traces move, and an editor is then armed at a zoom that is
  not 1, where the pointer math of the seven modelers was never measured.
- **The view event.** `BoardHandle.onViewChanged(listener): () => void` in
  `collaborative/api.ts`, told from the provider's viewport subscription in
  `runtime/board-context.tsx` (the owner's open question from the second increment).
  `apps/ide-editor/src/view-events.ts` detects the member already; with it the zoom readout and
  the view's keeper need no look per frame.
- **A view the host sets ends an editing**: every step of the shell's zoom panel while a model
  is armed. `arming/viewport-watch.ts` disarms for every zoom it did not see coming. The change:
  the contract's view setter in `collaborative/view.ts` marks its own `setViewport`, and the
  watch leaves a marked zoom to the armed editor. That is editing at a zoom that is not 1, so
  it goes with the first item or not at all.
- **A card cannot refuse the arming, and a failed node still arms.** A double-click moves the
  board to the node at 100 % before the card asks the host to show its file. The change:
  `EmbeddedEditor` in `host/types.ts` gets `readonly arms?: boolean | undefined` and
  `activate?: (() => void) | undefined`; `onNodeDoubleClick` in `canvas/board.tsx` and the Edit
  button of `nodes/model-node.tsx` call `activate()` in the place of the arming where `arms` is
  false. `openCard` then answers `{ arms: false, activate: show }` and drops its listener for
  the arming, and the facade says `arms: false` for a file that could not be opened.
- **A preview hands its editor no click**, so the card keeps three capture listeners on the
  document to take a click on its button. The change: `EmbeddedEditorContext` gets
  `onPreviewClick(listener: (point: { x: number; y: number }) => void): () => void`, called
  from the node's click while it is a preview.
- **The board's hint "Drop to add an image" knows nothing of Shift.** By reading it could
  show for up to 200 ms under VS Code's own overlay; in a real VS Code it did not show at all
  for a drag without Shift. The change: a host's words for the hint,
  such as `host.images.dropHint?: string | undefined` shown in `.board-drop-hint`, and no hint
  while `event.shiftKey` is false where the host says that a drop needs Shift.
- **No public call takes picture files and a point** (`importImages` of `gestures/images.ts` is
  internal), for a host that gets a drop another way. A file dragged from VS Code's own
  Explorer carries addresses and no file (by reading, and seen in so far as the board took
  nothing of such a drag, with Shift or without): the page would ask the extension for the path
  behind an address and then needs such a call.
- **The reader's refusal has no line of its own**: `ParsedBoard` is
  `{ ok: false; reason: string }`, and the Problems entry reads the line from the reason's first
  words. The change in `packages/schema-model/src/format.ts`:
  `{ ok: false; reason: string; line?: number | undefined }`, set in `refuse(line, why)`;
  `apps/vscode/src/problems.ts` then drops its `LINE` pattern.
- **The shell's VS Code stub keeps a webview's state for one page**
  (`packages/shell/src/testing/vscode-stub.ts`). The change: an option
  `stateStorage?: Pick<Storage, "getItem" | "setItem"> | undefined`, read for the first
  `getState()` and written by `setState`; until then the board's test page wraps
  `acquireVsCodeApi` itself.
- **The shell's stand-in for VS Code has no saves**: no `onWillSaveTextDocument` and
  `onDidSaveTextDocument`, no `workspace.textDocuments`, no `TextDocument.save()`; its `save()`
  is a change event without a content change. So the setting that saves the models with their
  board cannot be tried on the test page and is held by the unit tests on the extension's own
  fake alone. The change is those four members in `packages/shell/src/testing/vscode-host-stub.ts`.
- **`IdeEditorState.persistView(viewport)` of the shell takes a diagram-js viewport.** The
  board keeps its view through `read` and `write` under its own key `boardView`.
- **Every edit of the board document is a step of VS Code's undo**, a move's edit as well: a
  move is on no history of the board, but in VS Code the undo a person reaches is the
  document's. On the stand-in a renamed folder of seven models is seven steps, and the step
  that puts a node's old path back leaves that node saying that its file could not be opened
  until the redo. VS Code's API has no edit of a document that is no undo step. A real VS Code
  does the same, one step per node (seen on 1.146.0 and 1.96.0). The step lies among the
  person's own gestures, so an undo can leave a board that is not unsaved and names a file
  that is not there (seen by the review on 1.146.0). One cure to weigh, in
  `packages/host/src/facade/open-editor.ts` and `followMoves`: where the board's text names
  the old path of the last move the port told and that path has no file, the path is written
  again as an amend; it costs the redo of that step.
- **The document of an old name keeps an edit that crossed a rename**
  ([The host half](vscode.md#the-host-half), Files that move): the node says that the change
  was dropped, and VS Code is left with an unsaved document whose file is gone. The change in
  `apps/vscode/src/files/file-index.ts` or beside it: on `onDidRenameFiles`, look a moment
  later for an unsaved document of an old name that a page wrote into
  (`apps/vscode/src/files/written.ts` knows them), and tell it with
  `window.showWarningMessage`, naming the file and what to do.
- **A chain of renames in one event leaves a node on the path in the middle** (the fake alone).
  The change in `movesOf` of `apps/vscode/src/files/file-index.ts`: compose the moves of one
  event before they are told, with a case in `test/file-index.test.ts`.
- **What a show answers tells a page which files of the repository are there**, outside its
  dot folders. The change in `packages/files/src/server.ts`, `show`: one sentence for every
  failure of the file itself, the backend's reason left to the host's log; the card then
  cannot say why, which is the price.
- **The fit shows nothing where the content is larger than the smallest zoom shows and its
  middle is empty** (nodes more than about 12,000 px apart in a window of 1280 px). The change
  in `apps/ide-editor/src/zoom-target.ts`: where the fitted view shows no node, fit the node
  nearest the middle of the box, for the first view and for the Fit control.
- **The short names Windows gives the other dot folders** (`GITHUB~1`, `VSCODE~1`) pass the
  path rule; only Git's own is refused, as Git refuses it. No Windows was at hand.
- **A move is told only where both paths are reached by the host's rule**
  (`packages/files/src/server.ts`, `greet`), so the file of a card does not follow a rename. To
  follow it the server would tell a page the moves of paths it asked to have shown, which
  widens what a page is told.
- **The header of a card shows the file's name up to its first dot** ("order" for
  `order.bpmn`), the board's own naming, since `describe()` of `modelsFrom` answers undefined
  for a path without an entry; the card itself names the whole file. The change:
  `describe()` answers `{ title: <the file's name> }` for such a path, with the case of
  `packages/host/test/models.test.ts` that holds the undefined.
- **A file below a renamed folder that the list does not hold** (a model in `node_modules`, a
  suffix written `X.OWM`) is told nothing when a person renames the folder, neither moved nor
  gone: the index tells a folder's files from its list. The change in
  `apps/vscode/src/files/backend.ts`: on a move or a leave of a folder, also tell the backend's
  own open texts whose path is at or below it.
- **The watcher's later word of a renamed file** says once more that the old path went
  (`file-index.ts`): a text is told gone once, and `board.bytes.changed` for a moved picture's
  old path is posted twice. Harmless.
- **A picture's file that moves while the board is locked** (a refused text, a read-only
  document) changes the canvas and is not written, and the next accepted text brings the old
  path back.
- **In the web app a file dropped beside the board** (the shell's menu, the zoom panel, the
  legal line, the start screen) is cancelled by nobody, and a browser then opens it in the tab
  (by reading; a real drag in the headless shell left the page as it was, so no test can fail
  for it).
- **The example's note on where an edit goes** ends with "This browser keeps the board and the
  changed files. **Reset the example** in the menu brings the first state back.", which is
  untrue in VS Code. New Board from Example leaves the paragraph out; the smoke's fixture and
  whoever opens the example folder in VS Code still read it. The change: the paragraph leaves
  node `n_files` of `example/example.board` and the web app says it itself, as its toast after
  Show example already does; `withoutBrowserWords` in `apps/vscode/src/example.ts` then goes.
- **The release workflow passes `--all` for an empty list of released paths**, also in a run
  that is no dry run (`.github/workflows/release-please.yml`, the step `plan`). The action
  pinned today never leaves that list empty when it released something, and the plan script
  keeps the hold in such a run. The cure at its root is a change of the workflow:
  `PLANNED: ${{ inputs.dry_run && '--all' || steps.release_please.outputs.paths_released || '[]' }}`
  handed to the script in the place of `"${PATHS_RELEASED:---all}"`.
- **A held modeler's components still get GitHub releases**, such as `board-vscode: v0.1.0`,
  on the repository's releases page with every release, with nothing attached. Whether
  release-please should skip them for a held modeler (`skip-github-release` per component) is
  the owner's.
