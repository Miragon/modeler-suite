# Wardley Maps for VS Code

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/miragon-gmbh.wardley-mapping-modeler?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.wardley-mapping-modeler)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/wardley-maps/LICENSE)

[Wardley Maps](https://learnwardleymapping.com/) chart the components of a business by user value
(up and down: the higher, the more visible to your user) and evolution (left to right: genesis,
custom-built, product, commodity). This extension opens `.wmap` / `.owm` files (the plain-text
[Online-Wardley-Maps DSL](https://docs.onlinewardleymaps.com/)) in a graphical editor. The text file
stays the source of truth, so save, Git and diff keep working.

![The Wardley Maps editor](https://raw.githubusercontent.com/Miragon/modeler-suite/main/modelers/wardley-maps/docs/screenshots/editor.png)

## Getting started

Install **Wardley Mapping Modeler** (publisher `miragon-gmbh`), then open the **Get Started with
Wardley Maps** walkthrough and click **Create map from example**. Or run **Wardley: New Map from
Example** / **Wardley: New Empty Map** from the Command Palette (also under **File > New File…**).
Any `.wmap` or `.owm` file opens in the editor.

## Editing a map

- **Full modeler:** palette at the top, context pad on a selection (append, connect, evolve,
  settings, color, delete). Double-click to rename (`Shift+Enter` breaks the line); drag a
  component left or right to evolve it; drag a label to move it (`Alt`+double-click puts it back).
  Undo, dirty state and save work as for any text file.
- **Text and diagram side by side:** **Open Source to the Side** / **Open Diagram to the Side**.
  Typing re-renders the canvas live; a canvas edit rewrites only the lines it changes, keeping
  comments, blank lines, order and number formatting.
- **Problems:** unreadable lines are underlined and listed in the **Problems** view; a pill at the
  diagram's bottom left counts them. The text has syntax highlighting and `Ctrl/Cmd+/` comments.
- **Links between maps:** **Link to map…** on a submap or component links it to another map of the
  workspace; **Set link…** takes any address (relative to the current map's folder, or a web
  address). Linked elements show a link mark; **Open link** opens the map in its own tab or the web
  address in your browser. Broken links (missing map, not a map, outside the workspace) are reported
  as problems. When you rename or move maps or their folders in VS Code, the extension offers to
  update the links (see [Settings](#settings)).
- **Map size:** drag the plot's edge or corner (`Shift` keeps the ratio, `Alt` turns off snapping,
  double-click the corner resets), or use **Map size…** in the menu.
- **Menu:** **Map size…**, **X-axis labels…**, PNG / SVG / transparent 4× PNG export, **Keyboard
  shortcuts…**. Exports are pictures; the file stays the editable source.
- **Empty file:** **Insert example** adds the tea shop map as one undoable edit. **Invalid text:**
  the diagram shows the last valid map read-only until the text renders again.
- The diagram stays light in dark themes (high contrast themes get a high-contrast chrome). Fonts
  are bundled, nothing loads from a CDN. Third-party licenses:
  [THIRD_PARTY_NOTICES.md](https://github.com/Miragon/modeler-suite/blob/main/modelers/wardley-maps/apps/vscode/THIRD_PARTY_NOTICES.md).

## Commands

Run these from the Command Palette (type _"Wardley"_) or the editor title bar:

| Command                                      | What it does                                        |
| -------------------------------------------- | --------------------------------------------------- |
| **Wardley: Open Source to the Side**         | Opens the map's text next to the diagram.           |
| **Wardley: Open Diagram to the Side**        | Opens the diagram next to the map's text.           |
| **Wardley: Fit to View**                     | Zooms the diagram to show the whole map.            |
| **Wardley: Export as PNG / SVG**             | Opens a save dialog (defaults to next to the file). |
| **Wardley: Export as PNG (4×, Transparent)** | High-resolution PNG without background, for slides. |

## Settings

| Setting                                             | Default  | What it does                                                                                                                                      |
| --------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `miragon.wardleyMaps.updateLinksOnFileMove.enabled` | `prompt` | Update links when a map or its folder is renamed or moved: `prompt` asks first, `always` updates, `never` leaves them. Changed maps stay unsaved. |

## Keyboard shortcuts on the canvas

| Keys                                | Action                                        |
| ----------------------------------- | --------------------------------------------- |
| `C` · `U` · `N` · `P`               | Add a component · user · note · pipeline      |
| `A`                                 | Connect from the selected element             |
| `L`                                 | Lasso selection                               |
| Arrow keys (`Shift` = bigger steps) | Nudge the selection                           |
| `Delete` / `Backspace`              | Delete the selection                          |
| `Ctrl/Cmd+C` · `V` · `D` · `A`      | Copy · paste · duplicate · select all         |
| `Ctrl/Cmd+Z` · `Ctrl/Cmd+Shift+Z`   | Undo · redo (the file's undo history)         |
| `Ctrl/Cmd+Plus` · `Minus` · `0`     | Zoom in · zoom out · 100 %                    |
| `Shift+1`                           | Fit the map                                   |
| `Esc`                               | Clear the selection, close the menu or dialog |

**Keyboard shortcuts…** in the menu lists every key and gesture.

## Development

Building from source and the dev loop are documented in
[CONTRIBUTING.md](https://github.com/Miragon/modeler-suite/blob/main/modelers/wardley-maps/CONTRIBUTING.md).

## License

MIT
