# Context Maps for VS Code

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/miragon-gmbh.context-maps-modeler.svg)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.context-maps-modeler)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/context-maps/LICENSE)

[Context Maps](https://contextmapper.org/) show the strategic view of Domain-Driven Design: which
parts of a business (bounded contexts) exist, how important each one is, and how their teams work
together. This extension lets you draw them right in VS Code. Your map is a plain `.cm` /
`.cm.json` text file, so saving, Git and diffs work as usual.

![A context map in VS Code](https://raw.githubusercontent.com/Miragon/modeler-suite/main/modelers/context-maps/docs/screenshots/vscode-editor.png)

## Getting started

Install **Context Maps Modeler** (publisher `miragon-gmbh`), then open the **Get Started with
Context Maps Modeler** walkthrough (**Welcome: Open Walkthrough…**) and click **Create diagram from
example**. Or run one of these from the Command Palette (also under **File > New File…**):

- **Context Maps: New Diagram from Example**
- **Context Maps: New Empty Diagram**
- **Context Maps: New Diagram from CML…** (turns a Context Mapper `.cml` file into a `.cm` file)

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

- **Graphical editor for `.cm` / `.cm.json`**, backed by the JSON file: edit the text in a split
  view (**Open Source to the Side** / **Open Diagram to the Side**) and the other side follows. Use
  **View: Reopen Editor With…** > **Text Editor** for raw text. The files get their own icon and
  JSON highlighting.
- **Palette and context pad:** drag a subdomain type onto the canvas, or press Enter to place it in
  the middle. The context pad appends, connects, changes subdomain type, pattern and integration
  roles, sets team or description, swaps ends, renames and deletes. `Cmd/Ctrl+A` selects all.
- **Menu:** Map title…, Legend, Export as PNG / SVG / JSON / CML (also in the Command Palette) and
  Keyboard shortcuts…. Zoom with `Cmd/Ctrl` + `+` / `−`, `Cmd/Ctrl+0` and `Shift+1` to fit.
- **Undo through the document:** every canvas change is one edit of the file, so `Cmd/Ctrl+Z` works
  in VS Code's history.
- **Problems:** JSON errors and the 13 semantic rules of strategic DDD appear in the Problems view.
  While the text is invalid, the canvas shows the last valid version read-only.
- **Editable PNGs (`*.cm.png`):** the image stores the diagram, so you can drop it into a wiki and
  still edit it. Start one with **Context Maps: New Empty Diagram (embedded PNG)** and save once.
- **Offline**, with the Geist fonts bundled. Drawn light in every theme for now; High Contrast
  themes get the light high-contrast variant.

Third-party licenses of everything the extension bundles are in
[THIRD_PARTY_NOTICES.md](https://github.com/Miragon/modeler-suite/blob/main/modelers/context-maps/apps/vscode/THIRD_PARTY_NOTICES.md).

## Feedback and source

Report issues at [Miragon/modeler-suite](https://github.com/Miragon/modeler-suite/issues); building
from source is in
[CONTRIBUTING.md](https://github.com/Miragon/modeler-suite/blob/main/modelers/context-maps/CONTRIBUTING.md).

## License

MIT
