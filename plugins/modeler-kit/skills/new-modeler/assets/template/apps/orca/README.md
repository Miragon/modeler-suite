# __DISPLAY_NAME__ Modeler for Orca

View and edit __DISPLAY_NAME__ diagrams in [Orca](https://www.onorca.dev): a `.__EXT__` file opens
as a canvas instead of text. The file stays plain text, so your agent reads and writes it like
code, and Orca keeps its dirty state and saving.

- Each change your agent makes to the file shows up on the canvas right away. If it writes while
  you have unsaved edits, the editor merges its changes with yours when they touch different nodes;
  when you both changed the same node, Orca asks whether to reload the file or keep yours.
- **+** in the tab bar starts a new diagram from the example.
- Export the diagram as PNG or SVG from the canvas's menu.
- Needs the Orca desktop app, version 1.4.252 or later.
