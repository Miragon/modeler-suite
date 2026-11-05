# Team Topologies for VS Code

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/miragon-gmbh.team-topologies-modeler?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.team-topologies-modeler)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/team-topologies/LICENSE)

[Team Topologies](https://teamtopologies.com/) is a way to organise software teams for a fast flow of
change, with four team types and three interaction modes. This extension opens `.tt` / `.ttm.json`
files (plain, deterministic JSON) in a graphical editor. The file stays the source of truth, so
save, Git and diff keep working.

New to the method? Start with [teamtopologies.com](https://teamtopologies.com/).

## Getting started

Install **Team Topologies Modeler** (publisher `miragon-gmbh`), run **Welcome: Open Walkthrough…**,
pick **Get Started with Team Topologies Modeler** and click **Create diagram from example**. Or run
**Team Topologies: New Diagram from Example** / **New Empty Diagram** from the Command Palette (also
under **File > New File…**). Any `.tt` or `.ttm.json` file opens in the editor.

## Reading a diagram

- **Team types** (solid shapes): **stream-aligned** (horizontal rounded rectangle) owns a slice of
  the product end to end; **enabling** (vertical rounded rectangle) helps other teams grow a
  capability; **complicated-subsystem** (octagon) owns a part that needs deep specialist knowledge;
  **platform** (square-cornered rectangle) provides internal services.
- **Interaction modes** (dashed glyphs where two teams meet): **collaboration** (parallelogram),
  **X-as-a-Service** (triangle, pointing from provider to consumer), **facilitating** (circle).
- **Flow of change** runs left to right.

## Editing a diagram

- **Full modeler:** the palette places teams, interaction glyphs (dropped over the teams they
  relate to), the flow-of-change arrow and annotations; Enter or Space places an entry in the middle
  with its name ready to type. The context pad renames, annotates or deletes; double-click edits a
  label. Select several with `Ctrl/Cmd+A`, Shift+drag or Shift+click.
- **Text and diagram side by side:** **Open Source to the Side** / **Open Diagram to the Side**;
  edits show on the other side at once.
- **Undo is VS Code's:** every canvas change is one file edit, undone with `Ctrl/Cmd+Z` from canvas
  or text. In an inspector field the keys undo your typing there. Only changed lines are rewritten.
- **Inspector** (right): type, name, description and colours of a team, an interaction's mode and
  label, an annotation's text; delete several elements at once.
- **Legend** (bottom left): every shape explained; toggle it with **Legend** in the menu.
- **Menu:** legend, PNG and SVG export, **Keyboard shortcuts…**. The exports and **Fit to View**
  are also commands. Zoom with the panel at the bottom right or `Ctrl/Cmd` + `+` / `-` / `0`,
  `Shift+1` fits.
- **Invalid file:** the last valid diagram shows read-only until the JSON is valid again; the
  **Problems** view says what is wrong.
- **Empty file:** **Insert example** adds the example topology as one undoable edit.
- **Editable PNGs (`*.tt.png` / `*.ttm.png`):** the image carries the diagram, so you can drop it
  into a wiki or README and still edit it. Start one with **Team Topologies: New Empty Diagram
  (embedded PNG)** and save once.
- The diagram stays light in dark themes; high-contrast themes get high-contrast outlines. `.tt`
  files have their own icon and JSON highlighting. Works offline; third-party licenses ship in
  `THIRD_PARTY_NOTICES.md`.

## Development

Building from source and the dev loop are documented in
[CONTRIBUTING.md](https://github.com/Miragon/modeler-suite/blob/main/modelers/team-topologies/CONTRIBUTING.md).

## License

MIT
