# @miragon/board-schema-model

[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/board/LICENSE)

The **DOM-free core** of the [Modeler Board](../../README.md): the `.board` file format and its
strict reader, the elements of a board, their paint order as fractional indices, and what a canvas
draws of a board. A board is a canvas of a repository's own files; it stores where a file sits,
never what is in it.

Plain TypeScript with no DOM, no React, no React Flow and no Yjs, so it runs in the browser, in
Node (a VS Code extension host reads boards with it) and in a CLI. The renderer
([`@miragon/board-renderer`](../renderer)) builds on it.

## Install

A release of the suite publishes this package to npm under this name. Its first publish is still
to come; until then it is used from this repository.

```bash
npm install @miragon/board-schema-model
```

ES module and CommonJS, with types.

## The file format

One JSON header line (`format`, `version`, `meta`), then one JSON line per element sorted by id,
keys sorted at every depth, and a trailing newline. The same board gives the same bytes, and a
change of one element changes one line, so a Git diff, a review and a merge read element by
element.

```text
{"format":"structured-model","meta":{"title":"Workshop","version":1},"version":1}
{"id":"e_1","kind":"edge","source":"n_a","target":"n_b"}
{"height":160,"id":"n_a","kind":"node","text":"A note","type":"text","width":240,"x":0,"y":0,"z":"a"}
```

| Element                  | Attributes                                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| node (`"kind": "node"`)  | `type` (`model`, `text`, `image`, `group`), `x`, `y`, `width`, `height` (integers), `z` (a fractional index), `parent` (a group), `file` (model, image: the repository-relative path), `text` |
| arrow (`"kind": "edge"`) | `source`, `target`, `sourceHandle` and `targetHandle` (`top`, `right`, `bottom`, `left`), `label`                                                                                             |
| anything else            | kept as it is: an attribute or an element kind this version does not know stays in the document, off the canvas, and is written back                                                          |

A member of a group is positioned relative to the group. Paint order is `z` in plain string order,
ties broken by element id.

## Usage

```ts
import {
  encodeBoard,
  fractionalIndexBetween,
  newBoardText,
  parseBoardText,
  projectBoard,
} from "@miragon/board-schema-model";

const text = newBoardText("Workshop"); // the text of a new, empty board

const parsed = parseBoardText(text);
if (!parsed.ok) throw new Error(parsed.reason); // e.g. "line 3 repeats the element id n_a"

const { snapshot } = parsed;
snapshot.elements.n_a = {
  kind: "node",
  type: "text",
  text: "A note",
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  z: fractionalIndexBetween(),
};

const view = projectBoard(snapshot); // what a canvas draws: nodes in paint order, arrows whose ends exist
const saved = encodeBoard(snapshot); // canonical: the same snapshot gives the same bytes
```

## API

| Export                                                                                                                                                      | Purpose                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseBoardText(text)`, `ParsedBoard`                                                                                                                       | The strict reader: `{ ok: true, snapshot }`, or `{ ok: false, reason }` for a text holding anything `encodeBoard` would not write back (a line that is no JSON, a second header, a repeated id, a header of another version, a key named `__proto__` at any depth). An empty text is a new board. |
| `decodeBoard(text)`                                                                                                                                         | The total reader: never fails, skips a line that is no element and no header. For a listing or a seed; whoever writes the board back reads with `parseBoardText`.                                                                                                                                 |
| `encodeBoard(snapshot)`                                                                                                                                     | The canonical text of a board.                                                                                                                                                                                                                                                                    |
| `newBoardText(title)`                                                                                                                                       | The text of a new, empty board.                                                                                                                                                                                                                                                                   |
| `BOARD_FORMAT`, `BOARD_FORMAT_VERSION`                                                                                                                      | The header's format tag (`structured-model`, never renamed) and the version this build reads and writes (`1`).                                                                                                                                                                                    |
| `fractionalIndexBetween(a?, b?)`                                                                                                                            | A paint-order key strictly between two others, without touching any other node.                                                                                                                                                                                                                   |
| `projectBoard(snapshot, previous?)`, `absoluteBoxes(view)`, `absoluteBox(view, id)`                                                                         | What a canvas draws of a snapshot (nodes in paint order with their parents resolved, arrows whose two ends exist), and the boxes of nodes in board coordinates. With the view before, an unchanged node or arrow keeps its object.                                                                |
| `isNodeAttrs`, `isEdgeAttrs`                                                                                                                                | Whether an element has the shape of a node or an arrow; anything else stays off the canvas.                                                                                                                                                                                                       |
| `BoardSnapshot`, `BoardView`, `BoardNode`, `BoardEdge`, `NodeAttrs`, `EdgeAttrs`, `ElementAttrs`, `Box`, `Point`, `Side`, `NodeType`, `NODE_TYPES`, `SIDES` | The types of a board and its elements.                                                                                                                                                                                                                                                            |

## Development

From the root of the [Miragon modeler suite](https://github.com/Miragon/modeler-suite):

```bash
npm run build -w @miragon/board-schema-model   # tsup → dist/ (the publish build)
npm run board test                             # Vitest unit tests
npm run board typecheck
```

Part of the [Modeler Board](https://github.com/Miragon/modeler-suite/tree/main/modelers/board) in
the [Miragon modeler suite](https://github.com/Miragon/modeler-suite).

## Licence

[MIT](../../LICENSE).
