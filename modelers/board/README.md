# Board

A board is a canvas of a repository's own files: models shown and edited in place, each saved in
its own file, next to notes, images, groups and arrows. The board stores where a file sits, never
what is in it. A `.board` file is plain text, one JSON line per element.

**Work in progress.** What is here so far:

| Package                                                 | What                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@miragon/board-schema-model`](packages/schema-model/) | the file format and its strict reader, the elements of a board, their order and what a canvas draws of them, DOM-free                                                                                                                                                                                      |
| [`@miragon/board-renderer`](packages/renderer/)         | the board as a live document (element by element, on Yjs), the store a canvas reads and writes, what the board's features write into the document, the rules for editing a model on a board, and the canvas itself: React Flow under the contract of `@miragon/modeler-api` (`createCollaborativeModeler`) |

The board brings no editor of its own. The editors of the models, the images, what the models say
about each other and the cursors of other people come from the host it is mounted in (the option
`host`).

The canvas was built and measured in designIQ and was moved here as it is. It is under tests in
Chromium: a board mounts with a recording stand-in for a host's editor in a model node, the rules
for editing a model run against recorded traces (70 of the 73 from before their code was split,
three recorded anew since, which the unsplit code gives byte for byte as well), and the
contract's conformance kit runs against the factory, on a document of its own and on a live
document of a host. Its stylesheet stands on the design system's roles and on a base of its own,
so a board mounted here has the light picture that was measured; dark is not designed. No test
here mounts an editor that draws, and the batteries the canvas was measured with need designIQ's
editors and have not run here.

Still to come before this is a modeler like the others:

- what the contract's kit asks of a modeler and the board does not have: a viewer, themes, an
  image export and gestures a host can follow. The kit runs with seven of its cases skipped, each
  pinned by name and reason, where the suite's rule for a renderer is none;
- the web app, the VS Code extension and the Orca plugin. Until they exist the suite's CI cannot
  pass with this folder in the tree: `test/modeler-collection.test.ts` wants an `apps/vscode`,
  and the jobs that build and test a modeler's apps find no script for the board.

[`CLAUDE.md`](CLAUDE.md) says what is in the tree, what was run on it, what the host brings and
what must not change in passing; the [test README](packages/renderer/test/README.md) says what
each test holds.

## Not on diagram-js

Every other modeler here is one notation on diagram-js. The board's canvas is React Flow: it lays
out HTML nodes that hold whole editors (a BPMN modeler, a Wardley map), which is what a board is
for and what an SVG canvas of shapes is not made for. It still implements the same contract, so a
host binds it like any other modeler. The shell's chrome around a diagram-js canvas does not apply
to it as it is.

## Commands

From the repository root: `npm run board lint`, `npm run board test`, `npm run board test:browser`
(Chromium), `npm run board depcruise`, `npm run board format`.
