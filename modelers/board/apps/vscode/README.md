# Board for VS Code

A board is a canvas of your repository's own files. Put the models of a repository side by side,
edit each of them in place, and add notes, pictures, groups and arrows around them. The board is
a plain-text `.board` file that stores where a file sits and never what is in it, so it lives in
your repository next to the files it shows.

Free and open source (MIT). No account, no telemetry, and it works offline.

**Preview.** The board is work in progress. Its name, its editor and the `.board` format may
still change, and [what it cannot do yet](#what-it-cannot-do-yet) is a list you should read
first.

## Install

From a VSIX: run **Extensions: Install from VSIX...** from the Command Palette
(`Ctrl/Cmd+Shift+P`) and pick `board-modeler.vsix`, or run
`code --install-extension board-modeler.vsix`. A checkout of the
[modeler suite](https://github.com/Miragon/modeler-suite) builds the file with `npm ci`,
`npm run build:shared` and `npm run board package:vscode`, which writes
`modelers/board/apps/vscode/board-modeler.vsix`.

## Get started

1. Open a folder that is a Git repository, or a folder inside one.
2. Open a `.board` file from the Explorer, or create an empty file whose name ends in `.board` and
   open it.
3. Pick a model from the toolbar's list to put it on the board.

If the file shows as text, close it and open it from the Explorer, or run **Reopen Editor
With...** and pick **Board**.

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

You do not need the modelers' own extensions for this: the board brings their editors along.

## Notes, pictures, groups and arrows

Write a note with **Text** and add a picture with **Image**, or paste one from the clipboard: a
picture is stored as a new file under `assets/` in your repository and never replaces a file that
is there. Group nodes and connect them with arrows.

## The board is a text file

VS Code keeps the `.board` file as it keeps any text: undo, save, Git and diff work as usual, and
every element of a board is one line of the file, so two people who work on one board merge
their changes line by line. While the text is not a valid board, the canvas is locked and names
the line that is wrong.

## Which files a board reaches

A board lists the models of its repository and the pictures under `assets/`. The repository is
the nearest folder above the board file that holds `.git`, else the folder VS Code has open. A
board that is opened as a single file outside both reaches no file.

A board never reaches a dot file or a file in a dot folder, a file that is a symbolic link or
lies behind a linked folder, wherever the link leads, a model above 2 MiB or a picture above 10
MiB. The list may still offer a link or a file behind a linked folder: picked, its node says that
a board opens no link. Files in `node_modules` are not listed.

The extension changes three things and no other: the text of the board, the text of a model you
edit on it, both of which you save yourself, and a new picture, which it stores under `assets/`.
It sends nothing anywhere.

## What it cannot do yet

- Follow a file that is renamed or moved: the node then shows that its file is gone.
- Save the models together with the board: each model is saved as its own file.
- Keep the view across a reload of the window.
- Show an entry in the Problems view.
- Show a file that no notation above covers.
- Create a board from a command: make an empty `.board` file yourself.
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
