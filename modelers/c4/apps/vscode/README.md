# C4 Modeler for VS Code

Draw how your software is built, from the big picture down to its parts, using the
[C4 model](https://c4model.com): a system landscape, a system context per software system, a
container view per system and a component view per container. Everything is stored in one
plain-text Structurizr DSL file (`workspace.c4` or `workspace.dsl`), layout included, so saving,
Git, diffs and undo work as for any text file.

The walkthrough **Get Started with the C4 Modeler** is the first stop: it creates a diagram,
opens the example and puts the text beside the canvas.

## Opening a file

A `.c4` file opens in the C4 Modeler; **Open Source to the Side** shows its text. `.dsl` files
belong to more than one tool, so VS Code opens them as text. Open one in the C4 Modeler with
**Open Diagram to the Side** in the editor title, or **Reopen Editor With… › C4 Modeler**.
**C4: Use C4 Modeler for workspace.dsl** makes it the editor of every `workspace.dsl` (it writes
`workbench.editorAssociations` in your user settings). Structurizr local reads `workspace.dsl` by
default, so give a workspace that name when Structurizr local shows it too.

### With LikeC4 installed

[LikeC4](https://likec4.dev) uses `.c4` too. A Structurizr workspace starts with `workspace` (or a
directive such as `!const`), a LikeC4 model never does: with LikeC4 installed, a `.c4` file that is
no Structurizr workspace opens as text in LikeC4's language, a blank one in the C4 Modeler. To open
every `.c4` as text, add `"*.c4": "default"` to `workbench.editorAssociations`. To stop LikeC4
reporting problems in a Structurizr workspace, exclude it with `likec4.exclude` (for example
`"**/workspace.c4"`) or `exclude` in `likec4.config.json`.

## Commands

- **C4: New Empty C4 Diagram** and **C4: New C4 Diagram from Example**: pick a location for a
  new `workspace.c4` (also under **File › New File…**). A new diagram starts with the classic C4
  colours as tag styles.
- **C4: Open Source to the Side**: the text beside the canvas, also a button in its editor title;
  **Open Diagram to the Side** in the text editor's title does the reverse.
- **C4: Go to View…**: every view of the workspace, grouped by type; **C4: Parent View** goes one
  level up.
- **C4: Fit to View**, **C4: Export as PNG**, **C4: Export as SVG**: also in the editor title's
  menu.
- **C4: Use C4 Modeler for workspace.dsl**: opens every `workspace.dsl` in the C4 Modeler.

The canvas edits system landscape, system context, container and component views. The badge on a
system or container (or Enter) opens the view one level deeper, the breadcrumb opens any view
above, U goes up. Dynamic, deployment, filtered, custom and image views, deployment environments,
`!docs`, `!adrs` and scripts stay exactly as written. The Problems view lists the parser's findings
for every open Structurizr workspace.

Compatible with Structurizr DSL. Structurizr is a product of Structurizr Limited; this project is
not affiliated with or endorsed by Structurizr Limited.
