# Value Chain Modeler for VS Code

View and edit value chain diagrams (Wertschöpfungskettendiagramme, ARIS-style value-added
chain diagrams) directly in VS Code: map the value-adding steps of a business and who owns them. The `*.vc` / `*.vc.json` file stays the source of truth:
dirty state, save, Git, diff, and undo all work like for any text file.

![The value chain editor in VS Code](https://raw.githubusercontent.com/Miragon/modeler-suite/main/modelers/value-chain/docs/screenshots/vscode-editor.png)

## Features

- **Custom editor for `*.vc` and `*.vc.json`**: chevron steps, sequence and hierarchy relations,
  organizational units, colors, snapping, alignment,: the menu at
  the top left, the tool palette at the top, the zoom panel at the bottom right.
- **Text as source of truth**: every graphical change becomes one minimal edit of the file, so a
  text editor beside the diagram keeps its cursor and Cmd/Ctrl+Z undoes the change in either
  editor. External edits (Git, the text editor) re-import live, keeping view and selection.
- **Invalid files stay safe**: while the text is not a valid diagram, the canvas keeps the last
  valid state, read-only, with a notice under the palette; the Problems view points at what to fix,
  and the pill at the bottom left opens it.
- **Keyboard**: Cmd/Ctrl + / − / 0 zoom, Shift+1 fits, Cmd/Ctrl+A selects all; L, H, S and C pick
  the lasso, hand, space and connect tools; Enter on Step or Organizational unit in the palette
  places one in the middle of the canvas. **Keyboard shortcuts…** in the menu lists every key.
- **Export**: PNG and SVG from the menu or the Command Palette (**Value Chain: Export as PNG**,
  **Export as SVG**), always light. The PNG sets its labels in Geist, on the light canvas ground.
- **Side by side**: **Open Source to the Side** in the editor title of the diagram, **Open Diagram
  to the Side** in the title of the JSON.
- **Empty files** open with **Insert example**; `*.vc` / `*.vc.json` files get their own icon and
  keep JSON highlighting in the text editor.
- **Strict CSP, fully offline**: everything is bundled, fonts included; no external requests.

The diagram stays light in dark VS Code themes;
High Contrast themes get the high-contrast chrome.

## Getting started

1. Run **Value Chain: New Empty Value Chain Diagram** or **Value Chain: New Value Chain Diagram
   from Example** and pick a location (also under **File > New File…** as **Value Chain Diagram**
   and **New Value Chain Diagram from Example**), or open the walkthrough **Get Started with Value
   Chains**.
2. Model away: the file saves like any other. To see the raw JSON, use **Open Source to the
   Side** in the editor title.

## Commands

| Command                                             | Description                                  |
| --------------------------------------------------- | -------------------------------------------- |
| `Value Chain: New Empty Value Chain Diagram`        | Create and open an empty diagram             |
| `Value Chain: New Value Chain Diagram from Example` | Create a diagram from the Porter example     |
| `Value Chain: Open Source to the Side`              | Open the focused diagram's JSON beside it    |
| `Value Chain: Open Diagram to the Side`             | Open the focused JSON as a diagram beside it |
| `Value Chain: Fit to View`                          | Fit the focused diagram into its editor      |
| `Value Chain: Export as PNG` / `Export as SVG`      | Export the focused diagram as an image       |

## License

MIT. The extension bundles third-party software (Lucide icons, the Geist fonts, diagram-js and
others); their licenses are in
[THIRD_PARTY_NOTICES.md](https://github.com/Miragon/modeler-suite/blob/main/modelers/value-chain/apps/vscode/THIRD_PARTY_NOTICES.md),
which ships with the extension.
