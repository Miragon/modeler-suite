# Open a board

**Board: New Empty Board** asks where to save the file and opens it in the board editor. You can
also choose it in the New File menu: **File › New File… › Board**. A `.board` file from the
Explorer opens in the same editor.

**Board: New Board from Example** writes a board with a model of every notation, and the files
it shows beside it in `models/` and `assets/`. A file that is already there is never replaced:
the board then shows the file you have.

A board reaches the files of its repository: the nearest folder above the board file that holds
`.git`, else the folder VS Code has open.

The board is a plain-text file, one line per element, so it diffs, merges and reviews like any
other text. **Open Source to the Side** in the editor title shows the text beside the board.
