# Board

A board is a canvas of a repository's own files: models shown and edited in place, each saved in
its own file, next to notes, images, groups and arrows. The board stores where a file sits, never
what is in it. A `.board` file is plain text, one JSON line per element.

**Work in progress.** What is here so far:

| Workspace                                               | What                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@miragon/board-schema-model`](packages/schema-model/) | the file format and its strict reader, the elements of a board, their order and what a canvas draws of them, DOM-free                                                                                                                                                                                      |
| [`@miragon/board-renderer`](packages/renderer/)         | the board as a live document (element by element, on Yjs), the store a canvas reads and writes, what the board's features write into the document, the rules for editing a model on a board, and the canvas itself: React Flow under the contract of `@miragon/modeler-api` (`createCollaborativeModeler`) |
| [`@miragon/board-files`](packages/files/)               | the files of a repository as a board's page reads and writes them: a port, the messages between a page and the host that keeps the files, a client, a server that keeps every path a page sends inside the repository's root and on the files a board shows, a backend in memory, DOM-free                 |
| [`@miragon/board-host`](packages/host/)                 | what every host of a board shares: any modeler of `@miragon/modeler-api` as the editor of a model node, bound to its file, and a board host built from the files of a repository and a registry of editors                                                                                                 |
| [`board-suite-editors`](apps/editors/)                  | the seven modelers of the suite as such editors, each with its notation's own rules for the text it writes                                                                                                                                                                                                 |
| [`board-ide-editor`](apps/ide-editor/)                  | the board inside the suite's shell: the menu, the zoom panel and the status box around the board's own toolbar                                                                                                                                                                                             |
| [`board-modeler`](apps/vscode/)                         | a VS Code extension, a preview: `.board` files in a custom editor, the models of the repository edited in place                                                                                                                                                                                            |
| [`@miragon/board-webapp`](apps/webapp/)                 | the board on an example repository ([`example/`](example/)) that is held in memory                                                                                                                                                                                                                         |
| [`@miragon/board-e2e`](e2e/)                            | Playwright tests of the web app and of the extension's webview                                                                                                                                                                                                                                             |

The board brings no editor of its own. The editors of the models, the images, what the models say
about each other and the cursors of other people come from the host it is mounted in (the option
`host`). `@miragon/board-host` builds such a host from files and a registry of editors, and names
no editor either; `board-suite-editors` is the one workspace here that depends on the other
modelers. Whether a workspace of the board may do that is a decision still open; the tree is
built on yes, in that one workspace.

## The web app

```bash
npm run build:shared      # once
npm run board dev:webapp  # then http://localhost:5184
```

It shows one board with seven models, one per notation of the suite (Wardley Map, Event Storming,
Team Topology, Context Map, Value Chain, C4 model, Business Model Canvas), each drawn by its own
modeler as a preview, beside two notes, a group, an arrow and a picture. Double-click a model to
edit it in place with the modeler's own palette and context pad; Done, or a zoom of the board,
ends it. An edit is written into that model's own file of the example and never into the board
file. The Model picker adds another node for a file of the example, and Text, Image and Group
add to the board. The board and the changed files are kept in this browser's local storage, and
the link "Reset the example" under the board brings the example back. The storage has the room
the browser gives one site: a picture it has no room for is drawn until the page is loaded
again, and the line under the board then says that a picture is missing.

There is no disk behind it: it opens and saves no file or folder of your own. It mounts no shell,
so there is no menu, no shortcuts dialog and no export, and a modeler in a node is its bare
renderer: canvas, palette, context pad and popups, without what the modeler's own app adds
around it. A model is edited at 100 %, so a window narrower than the model shows a part of its
editor and the board is moved to reach the rest. It is light only. It was run in Chromium alone,
with the seven models of the example.

## The VS Code extension

```bash
npm run build:shared         # once
npm run board package:vscode # writes modelers/board/apps/vscode/board-modeler.vsix
code --install-extension modelers/board/apps/vscode/board-modeler.vsix
```

A preview, built from this branch and not published; it needs VS Code 1.96 or later. A `.board`
file opens in a custom editor inside the suite's shell: a menu with the keyboard shortcuts, the
zoom panel, and a status box that names the line while the text is no valid board. The board file
is VS Code's own text document, so undo, save, Git and a text editor beside the board work as for
any text, and every change on the canvas is one small edit of that text. The picker lists the
models of the repository (the nearest folder above the board with `.git`, else the folder VS Code
has open). A model is edited in place and written into its own file's text document, which then
shows as unsaved and is saved like any other file; a change of that file from outside shows in its
node. A picked or a pasted picture is stored under `assets/`.

To try it on the example, copy `modelers/board/example` out of this checkout, open the copy as a
folder and open `example.board` from the Explorer. Inside the checkout the board's paths would be
read against the suite's root, and its models would not be found. If the file shows as text, which
was seen for a file given on the command line at the first start after the install, close it and
open it from the Explorer, or run "Reopen Editor With..." and pick Board.

It cannot yet follow a file that is renamed or moved, save the models together with the board, keep
the view across a reload, show an entry in the Problems view, or show a file no notation of the
suite covers. It is light only. A model is edited at 100 %, so in an editor that is narrower than
the model's node a part of it is out of reach. A board opens no symbolic link and no file behind a
linked folder, wherever the link leads.

**What stands behind those sentences.** Tests: the extension's host half against a fake VS Code in
memory, and its webview as a page inside the shell's VS Code stub, with real mouse and keyboard
input in Chromium, also as the production bundle under the extension's content security policy.
And a real VS Code: the packed extension's smoke passes in the suite's Docker runner on VS Code
1.146.0 and on 1.96.0, the oldest the manifest allows, on Linux. [`CLAUDE.md`](CLAUDE.md) lists
what the code takes for granted about VS Code, item by item, with what a real one showed of each
and what could not be reached there. An independent review then installed the VSIX in the runner's
VS Code as a person does, and tried the files of a repository as a page that is not the board's:
it found no way to a file that is no model and no picture, and what it did find is fixed or named
in the guide. Nobody has walked it by hand yet, and it was not run on macOS or Windows.

## What it stands on

The canvas was built and measured in designIQ and was moved here as it is. It is under tests in
Chromium: a board mounts with a recording stand-in for a host's editor in a model node, the rules
for editing a model run against recorded traces (70 of the 73 from before their code was split,
three recorded anew since, which the unsplit code gives byte for byte as well), and the
contract's conformance kit runs against the factory, on a document of its own and on a live
document of a host. Its stylesheet stands on the design system's roles and on a base of its own,
so a board mounted here has the light picture that was measured; dark is not designed. The seven
modelers of the suite run in a board's nodes under tests with real mouse and keyboard input:
preview, a double-click that arms, one edit that writes the model's file once, Done or a zoom of
the board. The
batteries the canvas was measured with need designIQ's editors and have not run here.

Still to come before this is a modeler like the others:

- what the contract's kit asks of a modeler and the board does not have: a viewer, themes, an
  image export and gestures a host can follow. The kit runs with seven of its cases skipped, each
  pinned by name and reason, where the suite's rule for a renderer is none;
- the web app inside the shell, the Orca plugin, the docs and the third-party notices. The suite's
  CI cannot pass with this folder in the tree yet: `test/modeler-collection.test.ts` asks for the
  board in the extension pack and its walkthrough.

[`CLAUDE.md`](CLAUDE.md) says what is in the tree, what was run on it, what the host brings and
what must not change in passing; the test READMEs of the [renderer](packages/renderer/test/README.md)
and of the [host package](packages/host/test/README.md) say what each test holds.

## Not on diagram-js

Every other modeler here is one notation on diagram-js. The board's canvas is React Flow: it lays
out HTML nodes that hold whole editors (a BPMN modeler, a Wardley map), which is what a board is
for and what an SVG canvas of shapes is not made for. It still implements the same contract, so a
host binds it like any other modeler. The shell's chrome around a diagram-js canvas does not apply
to it as it is: under the shell the board keeps its own toolbar, and the shell brings the menu, the
zoom panel and the status box around it.

## Commands

From the repository root: `npm run board lint`, `npm run board test`, `npm run board test:browser`
(Chromium), `npm run board test:e2e` (Playwright), `npm run board depcruise`,
`npm run board format`, `npm run board dev:webapp`, `npm run board build:webapp` with
`npm run check:build -w modelers/board/apps/webapp` after it, and `npm run board build:vscode`
and `npm run board package:vscode` for the extension.
