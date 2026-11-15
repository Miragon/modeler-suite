# Board

A board is a canvas of a repository's own files: models shown and edited in place, each saved in
its own file, next to notes, images, groups and arrows. The board stores where a file sits, never
what is in it. A `.board` file is plain text, one JSON line per element.

**Work in progress.** What is here so far:

| Package                                                 | What                                                                                                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@miragon/board-schema-model`](packages/schema-model/) | the file format and its strict reader, the elements of a board, their order and what a canvas draws of them, DOM-free                                                           |
| [`@miragon/board-renderer`](packages/renderer/)         | so far its DOM-free half: the board as a live document (element by element, on Yjs), the store a canvas reads and writes, and what the board's features write into the document |

Still to come before this is a modeler like the others: the canvas itself under the contract of
`@miragon/modeler-api`, the web app, the VS Code extension and the Orca plugin. Until then one
repository-level check fails for this folder (`test/modeler-collection.test.ts` wants an
`apps/vscode`).

## Not on diagram-js

Every other modeler here is one notation on diagram-js. The board's canvas is React Flow: it lays
out HTML nodes that hold whole editors (a BPMN modeler, a Wardley map), which is what a board is
for and what an SVG canvas of shapes is not made for. It still implements the same contract, so a
host binds it like any other modeler. The shell's chrome around a diagram-js canvas does not apply
to it as it is.

## Commands

From the repository root: `npm run board lint`, `npm run board test`, `npm run board depcruise`,
`npm run board format`.
