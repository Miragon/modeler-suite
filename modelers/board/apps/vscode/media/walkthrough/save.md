# Save

The board and each model are files of their own. Cmd/Ctrl+S saves the board. A model you edited
on it stays unsaved until you save it too: in its tab, or with **File › Save All**.

To save both at once, turn on the setting **Save Models With Board**
(`miragon.board.saveModelsWithBoard`). Saving a board then also saves the models you edited on
it. Auto save never does this, and a model whose file changed on disk in the meantime stays
unsaved: VS Code says why. A model you reverted since, one whose file was removed, and one you
edited before VS Code was reloaded stay unsaved too, until you save them or edit them on the
board again.

While the text of a board is not a valid board, the canvas is read-only and the Problems view
names the line to fix.
