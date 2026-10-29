# Context Maps for VS Code

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/miragon-gmbh.context-maps-modeler.svg)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.context-maps-modeler)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/context-maps/LICENSE)

[Context Maps](https://contextmapper.org/) are the strategic Domain-Driven Design view of a system:
bounded contexts, coloured by subdomain type (core / supporting / generic), connected by
context-mapping relationship patterns (partnership, shared kernel, customer-supplier,
upstream-downstream, separate ways). This extension lets you create and edit those diagrams directly
inside VS Code: it opens `.cm` / `.cm.json` files (a Context Maps diagram stored as plain,
deterministic JSON) in a graphical editor, while the text file stays the source of truth, so save,
Git, and diff keep working.

![A context map in VS Code](https://raw.githubusercontent.com/Miragon/modeler-suite/main/modelers/context-maps/docs/screenshots/vscode-editor.png)

## Getting started

Install **Context Maps Modeler** (publisher `miragon-gmbh`) from the VS Code Marketplace, then
start from a filled-in example context map or a blank diagram. The built-in **Get Started with Context
Maps Modeler** walkthrough is the recommended first stop: open it from the Command Palette with
**Welcome: Open Walkthrough…**, then click its **Create diagram from example** button and you have a
ready-made diagram to explore. From there you can open any `.cm` or `.cm.json` file.

Prefer commands? Run these from the Command Palette (`Cmd/Ctrl+Shift+P`, type _"Context Maps"_):

- **Context Maps: New Diagram from Example:** pick a location, pre-filled with the example context
  map (also under **File > New File…** as **New Context Maps Diagram from Example**).
- **Context Maps: New Empty Diagram:** the same, but a blank diagram (also under
  **File > New File…** as **Context Maps**).
- **Context Maps: New Diagram from CML…:** turn a Context Mapper `.cml` file into a new `.cm` file.

## Reading a diagram

A diagram shows bounded contexts and the relationships between them.

- **Bounded contexts** are boxes coloured by **subdomain type**: **core** (star, warm
  red) is business-critical and differentiating; **supporting** (open hand, amber) is specialised
  but not differentiating; **generic** (dotted circle, blue) is a solved, off-the-shelf problem you buy
  rather than build.
- **Relationships** are lines styled per **context-mapping pattern**: **partnership** (P, thick
  indigo) and **shared kernel** (SK, thick green dashes) are symmetric; **customer-supplier** (C/S,
  orange dash-dot) and **upstream-downstream** (U/D, thin grey) are asymmetric with U/D end markers;
  **separate ways** (SW, fine dotted grey) means no integration.
- **Integration roles** decorate the ends of asymmetric relationships: upstream can be an **Open Host
  Service (OHS)** and/or a **Published Language (PL)**; downstream can apply an **Anticorruption Layer
  (ACL)** or be a **Conformist (CF)**.

## Editing a diagram

- **Custom editor for `.cm` / `.cm.json`.** Open a diagram file and you get the full graphical
  editor, backed by the plain-text JSON file. Editing the text in a split view re-renders the canvas
  live (two-way sync), and VS Code tracks dirty state as you go. To reopen a diagram as raw text, use
  **View: Reopen Editor With…**, then pick **Text Editor**.
- **File icon and JSON highlighting.** `*.cm` and `*.cm.json` files carry the Context Maps icon in
  the Explorer and on editor tabs, in light and dark themes. In the text editor both get JSON syntax
  highlighting, bracket matching and indentation.
- **Full modeler** in the Miragon modeler chrome: the tool palette (top centre) places the three
  subdomain types of bounded context: drag one onto the canvas, or press Enter on it to place a
  context in the middle with its name editor open. Selecting an element opens its **context pad**:
  append a connected context, connect (click the target), change subdomain type / relationship
  pattern / integration roles via popup menus, set the owning team or a description, swap ends,
  rename, delete. `Cmd/Ctrl+A` selects the whole map.
- **Menu** (top left): **Map title…** (renames the map in one edit), the **Legend** checkbox,
  **Export as PNG / SVG / JSON / CML**, and **Keyboard shortcuts…**. The legend starts closed and
  remembers whether it is open.
- **Zoom panel** (bottom right): `Cmd/Ctrl` + `+` / `−` zoom the diagram (not the VS Code window),
  `Cmd/Ctrl+0` shows 100 %, `Shift+1` and the **Fit** button fit the map (never above 100 %).
- **Undo through the document:** every change on the canvas is one edit of the file, so `Cmd/Ctrl+Z`
  undoes it in VS Code's history, and the view and the selection stay. In the name editor the keys
  undo only the field. A change VS Code does not write, as in a file opened read-only, goes back on
  the canvas, which shows the file again.
- **Text and diagram side by side:** **Open Source to the Side** (editor title of the diagram) and
  **Open Diagram to the Side** (editor title of the text). Edit either one; the other follows.
- **Problems:** JSON errors and the 13 semantic rules of strategic DDD appear in the Problems view
  and on the problems pill at the bottom left. While the text is no valid map, the canvas shows the
  last valid version, read-only, and says so.
- **Commands:** Fit to View and Export as PNG/SVG/JSON/CML also run from the Command Palette and the
  editor title's overflow menu.
- **Empty file:** "Pick a tool from the palette to start." and **Insert example**, which writes the
  example into the file as one edit.
- **Editable embedded-PNG diagrams (`*.cm.png`).** Exported PNGs store the diagram
  inside a `tEXt` chunk, so the file stays a normal image you can drop into a wiki, README, or chat,
  and can be reopened and edited graphically. To start one, run **Context Maps: New Empty Diagram
  (embedded PNG)** (also under **File > New File…**), pick a location, and press `Ctrl/Cmd+S` once to
  render the first PNG.
- **Offline-capable:** no CDN, no network; the Geist fonts ship with the extension.
- **Light in every theme** for now: the Miragon modelers switch to dark together. High Contrast
  themes get the light high-contrast variant.

Third-party licenses of everything the extension bundles are in
[THIRD_PARTY_NOTICES.md](https://github.com/Miragon/modeler-suite/blob/main/modelers/context-maps/apps/vscode/THIRD_PARTY_NOTICES.md).

## Development

Building from source and the dev loop are documented in
[CONTRIBUTING.md](https://github.com/Miragon/modeler-suite/blob/main/modelers/context-maps/CONTRIBUTING.md).

## License

MIT
