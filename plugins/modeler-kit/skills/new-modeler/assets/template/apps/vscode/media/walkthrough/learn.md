# Learn the basics

A __DISPLAY_NAME__ diagram is a set of labelled nodes on a free canvas. The first line of the
`.__EXT__` file names the diagram (`title Order fulfilment`), and every node is one line:
`node <id> "<label>" [x, y]`.

## Editing a diagram

- **Add**: pick **Node** in the palette and click the canvas, or drag it there. From the keyboard:
  Tab to the palette, choose with the arrow keys, press Enter; the node appears in the middle with
  its label editor open.
- **Move and rename**: drag a node anywhere on the canvas, or double-click it (or press `E`) to
  rename it.
- **Undo and redo**: `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`, like any change to the file.
- **Zoom and fit**: the zoom panel in the bottom-right corner, or `Ctrl/Cmd` + `+`, `-`, `0` and
  `Shift+1` to fit.
- **Export**: the menu in the top-left corner exports the diagram as PNG or SVG.

The menu's **Keyboard shortcuts…** lists every key.

The text file and the canvas stay in sync: **Open Source to the Side** opens the `.__EXT__` text in
a split view, and your edits re-render live in both directions.
