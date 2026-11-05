# @miragon/c4-layout

[![npm](https://img.shields.io/npm/v/@miragon/c4-layout)](https://www.npmjs.com/package/@miragon/c4-layout)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/c4/LICENSE)

Lay out [C4 model](https://c4model.com) views automatically and place new elements next to their
neighbours, without the DOM: the geometry of the [C4 Modeler](../../README.md). It computes every
box, the frames of boundaries and groups, relationship label boxes and the title position.

A view without stored positions is laid out with [`@dagrejs/dagre`](https://github.com/dagrejs/dagre)
(MIT), honouring its `autoLayout`; stored positions are kept, and an element without one goes into
the first free slot next to its first placed neighbour. The result is deterministic and
independent of text: a rename never moves anything. Dependencies: [`@miragon/c4-schema-model`](../schema-model)
and `@dagrejs/dagre` (pinned; its ESM build needs no `eval`, so it runs under a strict CSP). Runs in
a browser, Node or a worker.

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

- **Without stored positions:** a dagre graph, boundaries and groups as clusters. `autoLayout`'s
  direction and separations map onto dagre's (Structurizr pixels × 8/15, at least 80 between ranks
  and 60 between nodes); without `autoLayout`, top to bottom with 300 / 160. Lines are straight
  between docked ends, so writing the computed positions changes no line.
- **With stored positions:** used as they are. Each unplaced element, in document order, goes
  right of, below, left of or above its first placed neighbour (80 apart, 8-unit grid), else into a
  free row below everything, never on another box. Places whose lines cross no other box or label,
  and whose frames keep clear of strangers, win; only when none exists does the first free slot
  stay.
- **Frames** are never stored: members' union plus 32 padding and a 40-high caption band at the
  bottom; an empty container view's boundary is 320 × 200.
- **Title block:** 32 below the lowest box, at the content's left edge, as in Structurizr.

Relationship labels take a fixed 160 × 48 box, never measured, which keeps the layout independent
of text and font loading.

## Development

Part of the [C4 Modeler](../../README.md) in the
[Miragon modeler suite](https://github.com/Miragon/modeler-suite). Build with
`npm run build -w @miragon/c4-layout` (the renderer's and the dsl's tests read `dist`); test and lint with `npm run c4 test` and
`npm run c4 lint` from the suite's root.

## License

[MIT](../../LICENSE). `@dagrejs/dagre` and the graphlib inside it are MIT as well.
