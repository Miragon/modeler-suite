# @miragon/business-model-canvas-schema-model

The DOM-free core of the [Business Model Canvas Modeler](../../README.md): the document model of a
`.bmc` file, its validation, the pure edits the canvas makes, the layout of the nine blocks and the
tape colours. Private to the suite: it is bundled into the modeler's apps from source and not
published to npm.

| Export                                          | Purpose                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| `BLOCK_IDS`, `BLOCK_TITLES`, `METHOD_ORDER`     | The nine blocks in reading order, their titles, the order a new block is inserted in |
| `CanvasDocument`, `Block`, `Sticky`, `Note`, …  | The canvas fields and notes, the blocks with their stickies and notes, other fields  |
| `validateDocument(input)`                       | Zod schema plus duplicate and unusable sticky ids; throws with every finding         |
| `insertSticky`, `moveSticky`, `removeSticky`, … | Pure edits that return a new document; a sticky's notes move with it                 |
| `titleOf`, `withTitle`, `createEmptyDocument`   | The canvas title                                                                     |
| `layoutCanvas(document)`, `blockAt`, `slotAt`   | Where every block and sticky sits, and where a drop lands                            |
| `TAPE_COLORS`, `isKnownColor`, `tapeColor`, …   | The tape palette by name and the tape a sticky's `color` shows                       |
| `isUsableStickyId`                              | What an id may look like                                                             |

Plain TypeScript with no diagram-js and no DOM: ESLint and dependency-cruiser keep it so.
