# @miragon/c4-layout

[![npm](https://img.shields.io/npm/v/@miragon/c4-layout)](https://www.npmjs.com/package/@miragon/c4-layout)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/c4/LICENSE)

Lay out [C4 model](https://c4model.com) views automatically and place new elements next to their
neighbours, without the DOM: the geometry of the [C4 Modeler](../../README.md). Given the members
of a view and what the workspace stores about their positions, it computes every box, the frames
of boundaries and groups, the label boxes of relationships and where the title goes.

A view without stored positions is laid out with [`@dagrejs/dagre`](https://github.com/dagrejs/dagre)
(MIT), as Structurizr's own automatic layout in the browser is, honouring the view's `autoLayout`.
A view with stored positions keeps them, and an element without one goes into the first free slot
next to its first placed neighbour. The result is deterministic, and it does not depend on any
text: a rename or a new description never moves anything.

Its dependencies are [`@miragon/c4-schema-model`](../schema-model) and `@dagrejs/dagre` (pinned
exactly; its ESM build carries graphlib inline and needs no `eval`, so it runs under a strict
content security policy). It runs in a browser, in Node or in a worker.

Compatible with Structurizr DSL. Structurizr is a product of Structurizr Limited; this project is
not affiliated with or endorsed by Structurizr Limited.

## Install

```bash
npm install @miragon/c4-layout @miragon/c4-schema-model
```

## Lay out a view

```ts
import { parseWorkspace } from "@miragon/c4-dsl";
import { defaultShape, defaultSize, viewCatalog, viewMembers } from "@miragon/c4-schema-model";
import { layoutView } from "@miragon/c4-layout";

const { workspace } = parseWorkspace(text);
const view = viewCatalog(workspace).defaultView();
const members = viewMembers(workspace, view);
const elements = new Map(workspace.elements.map((element) => [element.id, element]));

const geometry = layoutView({
  members,
  sizes: new Map(
    members.elements.map((id) => [id, defaultSize(defaultShape(elements.get(id)!.kind))]),
  ),
  stored: view.definition?.layout ?? {
    elements: new Map(),
    relationships: new Map(),
    unmatched: [],
    malformed: [],
  },
  autoLayout: view.definition?.autoLayout, // undefined: top to bottom, rank 300, node 160 px
  relationshipEnds: new Map(
    workspace.relationships
      .filter((relationship) => members.relationships.includes(relationship.canvasKey))
      .map((relationship) => [
        relationship.canvasKey,
        { sourceId: relationship.sourceId, destinationId: relationship.destinationId },
      ]),
  ),
});

geometry.boxes; // Map<ElementId, Box>, in modeler units
geometry.boundaries; // the frame of each software system or container around its members
geometry.groups; // the frame of each group, by groupKey(scopeId, path)
geometry.labelBoxes; // a fixed 160 × 48 box per relationship label
geometry.title; // the top-left corner of the view's title block
geometry.mode; // "auto", "stored" or "mixed"
```

| Export                                  | What                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `layoutView(input)`                     | the geometry of one view; pure and deterministic                                   |
| `placeUnplaced(boxes, unplaced, input)` | free boxes for elements without a stored position, next to their placed neighbours |
| `LayoutInput`, `ViewGeometry`           | the input and the result                                                           |

## How it lays out

- Without stored positions: a dagre graph of the view's elements, each boundary and group a
  cluster around its members, the relationships as edges. `autoLayout`'s direction and
  separations map onto dagre's (Structurizr pixels × 8/15, at least 80 between ranks and 60
  between nodes); a view without `autoLayout` is laid out top to bottom with Structurizr's
  300 / 160. Lines are straight between the docked ends, so writing the computed positions into a
  view changes no line.
- With stored positions: they are used as they are. Each element without one, in document order,
  goes right of, below, left of or above its first placed neighbour, 80 apart on an 8-unit grid,
  else into a free cell of a row below everything; never on top of another box.
- Boundaries and groups are never stored: a frame is its members' union plus 32 of padding and a
  40-high caption band at the bottom, nested frames grow around inner ones, and the boundary of an
  empty container view is 320 × 200.
- The title block goes 32 below the lowest box, at the left edge of the content, as in
  Structurizr.

Relationship labels take a fixed 160 × 48 box, never measured, which is what keeps the layout
independent of text and of font loading.

## Development

Part of the [C4 Modeler](../../README.md) in the
[Miragon modeler suite](https://github.com/Miragon/modeler-suite). From the suite's root:

```bash
npm run build -w @miragon/c4-layout   # tsup to dist/ (the renderer's and the dsl's tests read it)
npm run c4 test                       # Vitest unit tests of the modeler (build the packages first)
npm run c4 lint                       # ESLint and the type checks
```

## License

[MIT](../../LICENSE). `@dagrejs/dagre` and the graphlib inside it are MIT as well.
