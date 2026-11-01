# C4 Modeler for VS Code

Draw the [C4 model](https://c4model.com) of your software on a canvas, backed by a plain-text
Structurizr DSL file (`workspace.c4`, or a Structurizr `workspace.dsl`). One model, many views: a
system landscape, a system context per software system, a container view per system and a
component view per container. The file stays the source of truth, so dirty state, saving, Git,
diff and undo work as for any text file, and the layout of each view is written into the same
file.

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

[LikeC4](https://likec4.dev) uses `.c4` for its own models. The text tells the two apart: a
Structurizr workspace starts with `workspace` (or a directive such as `!const`), a LikeC4 model never
does. With LikeC4's extension installed, a `.c4` file that is no Structurizr workspace opens as text,
in LikeC4's language, and a Structurizr workspace gets this extension's language, whichever
extension VS Code gave `.c4` to. A blank `.c4` file opens in the C4 Modeler. To open every `.c4`
file as text, add `"*.c4": "default"` to `workbench.editorAssociations`. LikeC4 reads every `.c4`
file of a folder as a LikeC4 model and reports its own problems for a Structurizr workspace: leave
that file out with LikeC4's setting `likec4.exclude` (for example `"**/workspace.c4"`), or with
`exclude` in its project file, `likec4.config.json`.

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
software system or container, or Enter, opens the view one level deeper; the breadcrumb at the top
left of the canvas shows the path from the system landscape down and opens any view above; U goes
up one level. Dynamic, deployment, filtered, custom and image views, deployment environments,
`!docs`, `!adrs` and scripts stay in the file exactly as written. The Problems view lists what the
parser finds in every open Structurizr workspace, `.c4` or `.dsl`.

Compatible with Structurizr DSL. Structurizr is a product of Structurizr Limited; this project is
not affiliated with or endorsed by Structurizr Limited.
