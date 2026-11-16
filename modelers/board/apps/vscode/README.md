# Modeler Board for VS Code

A board is a canvas of your repository's own files. Put the models of a repository side by side,
edit each of them in place, and add notes, pictures, groups and arrows around them. The board is
a plain-text `.board` file that stores where a file sits and never what is in it, so it lives in
your repository next to the files it shows.

Free and open source (MIT). No account, no telemetry, and it works offline.

**Preview.** The board is work in progress. Its name, its editor and the `.board` format may
still change, and [what it cannot do yet](#what-it-cannot-do-yet) is a list you should read
first.

## Install

Search for **Modeler Board** in the Extensions view, or run
`code --install-extension miragon-gmbh.board-modeler`.

From a VSIX: run **Extensions: Install from VSIX...** from the Command Palette
(`Ctrl/Cmd+Shift+P`) and pick `board-modeler.vsix`, or run
`code --install-extension board-modeler.vsix`. A checkout of the
[modeler suite](https://github.com/Miragon/modeler-suite) builds the file with `npm ci`,
`npm run build:shared` and `npm run board package:vscode`, which writes
`modelers/board/apps/vscode/board-modeler.vsix`.

## Get started

1. Open a folder that is a Git repository, or a folder inside one.
2. Open a `.board` file from the Explorer, or run **Board: New Empty Board** from the Command
   Palette. **Board: New Board from Example** writes a board with a model of every notation and
   the files it shows beside it, and never replaces a file that is there. Both are in **File ›
   New File...** as well.
3. Pick a model from the toolbar's list to put it on the board.

If the file shows as text, close it and open it from the Explorer, or run **Reopen Editor
With...** and pick **Board**. The walkthrough **Get Started with the Board** shows you the first
steps: open a board, add a model, edit it in place, save.

## Models, edited in place

A model node shows a file of your repository in the editor of its notation. Double-click a node
to edit the model where it sits, and press **Done** to go back to the board. The board shows the
files of the Miragon modelers:

| Notation              | Files              |
| --------------------- | ------------------ |
| Wardley Map           | `.wmap`, `.owm`    |
| Event Storming        | `.storm`           |
| Team Topology         | `.tt`, `.ttm.json` |
| Context Map           | `.cm`, `.cm.json`  |
| Value Chain           | `.vc`, `.vc.json`  |
| C4 model              | `.c4`              |
| Business Model Canvas | `.bmc`             |

Every model stays its own file. What you change on the board is written into that file's text as
the smallest edit, the file shows as unsaved, and you save it like any other file. A text editor
or the model's own editor beside the board works on the same text: type there and the node
follows.

With the setting **Save Models With Board** (`miragon.board.saveModelsWithBoard`, off by
default), saving a board also saves the models you edited on it. That happens only when you save
the board yourself, never by auto save. A model is saved whole, with what you changed in its own
editor, and a model whose file changed on disk in the meantime stays unsaved: VS Code says why.
Three more models stay unsaved until you save them yourself or edit them on the board again: one
whose file was removed, one you reverted or took back to its saved text since the board changed
it, and one you edited before VS Code was reloaded or restarted.

Rename or move a file in VS Code, or a folder above it, and the nodes of every open board
follow: the board then has an unsaved change. A file that another program moves, or that leaves
the repository, is gone for its node. A change you make to a model in the moment its file is
renamed may not reach the file: the node then says that your last change was dropped, and you
make it again.

A file of your repository that no notation above covers is a card with its name, and **Open in
its editor** on the card opens the file as VS Code opens it.

You do not need the modelers' own extensions for this: the board brings their editors along.

## Notes, pictures, groups and arrows

Write a note with **Text** and add a picture with **Image**, or paste one from the clipboard: a
picture is stored as a new file under `assets/` in your repository and never replaces a file that
is there. To drop a picture onto a board, hold Shift while you let it go: without Shift, VS Code
takes the drop for itself and the board gets nothing of it. This uses VS Code's setting
**Editor: Drop Into Editor**, which is on by default. Group nodes and connect them with arrows.

## The board is a text file

VS Code keeps the `.board` file as it keeps any text: undo, save, Git and diff work as usual, and
every element of a board is one line of the file, so two people who work on one board merge
their changes line by line. **Open Source to the Side** in the editor title shows the text
beside the board. While the text is not a valid board, the canvas is locked and names the line
that is wrong, and the Problems view has an entry at that line until the text is valid again.

## Which files a board reaches

A board lists the models of its repository and the pictures under `assets/`. The repository is
the nearest folder above the board file that holds `.git`, else the folder VS Code has open. A
board that is opened as a single file outside both reaches no file.

A board never reaches a dot file or a file in a dot folder, a file that is a symbolic link or
lies behind a linked folder, wherever the link leads, a model above 2 MiB or a picture above 10
MiB. The list may still offer a link or a file behind a linked folder: picked, its node says that
a board opens no link. Files in `node_modules` are not listed.

The extension changes the text of the board and the text of a model you edit on it, both of
which you save yourself, and it writes these files and no other: a new picture, stored under
`assets/`; a new board and the files of the example, when you ask for them; and a model you
edited, when the setting above saves it with its board. It sends nothing anywhere.

## What it cannot do yet

- Follow a file that another program renames or moves, or one that is renamed while its board
  is closed: the node then shows that its file is gone.
- Keep a node on its file when you undo on the board right after a rename: the undo takes the
  node's new path back, and the node says that its file could not be opened. Redo brings it
  back. Such an undo can also be the one that leaves the board with no unsaved change: the
  board then looks saved while a node names a file that is not there, so redo before you save.
- Export a board as a picture.
- Fit a model into a narrow editor: a model is edited at 100 %, so in an editor that is narrower
  than the model's node a part of it is out of reach. Make the editor wider or the node smaller.

## Good to know

- Needs VS Code 1.96 or later on the desktop. VS Code for the Web is not supported.
- There is no live co-editing. Share boards through Git.
- The board and the models on it stay light in dark themes.
- A Business Model Canvas on a board carries its attribution: the canvas is by Strategyzer AG,
  [strategyzer.com](https://www.strategyzer.com), licensed under
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). This extension is not
  affiliated with or endorsed by Strategyzer AG.

## Third-party software

The extension bundles the editors of the seven Miragon modelers and the open-source software
they and the board stand on, among them React, React Flow, Yjs, diagram-js, zod and the Geist
fonts. Every bundled package is listed with its licence in `dist/THIRD_PARTY_NOTICES.md` in the
folder of the installed extension. The build writes that file from what it bundled.

## Feedback

Report a problem or an idea in the
[issues of the modeler suite](https://github.com/Miragon/modeler-suite/issues). The source is in
the [modeler suite](https://github.com/Miragon/modeler-suite), under `modelers/board`.

Made by [Miragon](https://www.miragon.io). MIT licence.
