# Draw and drill down

A canvas shows one view of the model at a time.

- **Add**: pick **Person**, **Software system**, **Container**, **Database** or **Component** in the
  palette and click the canvas. What a view can hold depends on its type: a container view adds
  containers to its software system, a component view adds components to its container.
- **Connect**: pick **Connect** in the palette, or the connect entry of an element's context pad,
  and drag to another element.
- **Rename**: double-click a text or press `E`. `Tab` moves from the name to the technology and the
  description.
- **Delete**: `Delete` removes an element from this view, or from the model when no other view
  shows it. **Delete from model…** (`Shift+Delete`, or the context pad) removes it everywhere.

To drill down, click the badge on a software system or a container, or select it and press
`Enter`: the view one level deeper opens. The C4 Modeler shows that view even before the file has
it and writes it with your first change there. To go back up, click a view in the breadcrumb at
the top left of the canvas, press `U`, or choose **Parent view** in the menu.
**Views…** in the menu (key `G`) lists every view of the workspace and creates new ones;
**C4: Go to View…** in the Command Palette lists them as well.

The menu's **Keyboard shortcuts…** lists every key.
