# Use it for workspace.dsl

`.c4` files open in the C4 Modeler. `.dsl` files belong to more than one tool, so VS Code opens them
as text, and the C4 Modeler only when you choose it: **Reopen Editor With… › C4 Modeler**, or
**Open Diagram to the Side** in the editor title of a `.dsl` file.

Run [Use C4 Modeler for workspace.dsl](command:c4.useForWorkspaceDsl) to open every file named
`workspace.dsl` in the C4 Modeler. It writes `workbench.editorAssociations` in your user settings;
edit or remove that entry to change it back. Other `.dsl` files keep opening as text.
