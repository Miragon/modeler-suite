# @miragon/c4-schema-model

[![npm](https://img.shields.io/npm/v/@miragon/c4-schema-model)](https://www.npmjs.com/package/@miragon/c4-schema-model)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/c4/LICENSE)

The DOM-free core of the [C4 Modeler](../../README.md): the [C4 model](https://c4model.com) of a
Structurizr DSL workspace as plain data, and the rules that turn it into views: elements,
relationships, views, styles, identifiers, the view catalog and membership, implied relationships,
the style cascade, the layout format and the C4 colours. No DOM, no diagram-js, no runtime
dependency, and no text parsing: [`@miragon/c4-dsl`](../dsl) parses,
[`@miragon/c4-layout`](../layout) lays out, [`@miragon/c4-renderer`](../renderer) draws.

Compatible with Structurizr DSL. Structurizr is a product of Structurizr Limited; this project is
not affiliated with or endorsed by Structurizr Limited.

## Install

```bash
npm install @miragon/c4-schema-model @miragon/c4-dsl
```

## Views of a workspace

```ts
import { parseWorkspace } from "@miragon/c4-dsl";
import { viewCatalog, viewMembers } from "@miragon/c4-schema-model";

const { workspace } = parseWorkspace(text);
const catalog = viewCatalog(workspace);

for (const view of catalog.list()) {
  console.log(view.key, view.type, view.state, view.title);
  // "SystemLandscape" "systemLandscape" "written" "System Landscape diagram"
}

const landscape = catalog.defaultView();
const { elements, relationships, boundaries, groups } = viewMembers(workspace, landscape);

catalog.childOf("bookshop"); // the view one level deeper: its container view, written or a draft
catalog.parentOf("Containers-bookshop"); // the view one level up
```

`list()` holds the written views in document order, then the implicit views (Structurizr's
defaults, while the workspace has no view), then drafts of missing default views. Drafts and
implicit views carry the key they will be written under (`draftKey`); keyless written views carry
Structurizr's generated key (`generateViewKey`, `SystemLandscape-001` …). `viewMembers` runs a
view's `include` and `exclude` statements in order, as Structurizr does, returning elements,
relationships (implied included), boundaries and groups. A group is keyed by
`groupKey(scopeId, path)` (`"<scopeId>/<path>"`, empty scope at model level). An unsupported
expression term is reported and skipped, and the view is marked read-only.

## What's inside

| Export                                                                                      | What                                                                                               |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Workspace`, `ModelElement`, `Relationship`, `ViewDefinition`, `Styles`, `Diagnostic`, …    | the semantic model as plain, read-only data                                                        |
| `viewCatalog()`, `ViewCatalog`, `ViewEntry`, `draftKey()`, `generateViewKey()`              | every view: written, implicit and draft, the default view, drill-down and parent                   |
| `viewMembers()`, `ViewMembers`, `groupKey()`, `parseExpression()`                           | what a static view shows, by its `include` and `exclude` statements; a group frame's identity      |
| `impliedRelationships()`                                                                    | Structurizr's implied relationships, for the default, "unless same" and no strategy                |
| `hiddenScopeRelationships()`, `endsWithChildren()`, `childElements()`                       | the relationships on a view's scope it can't draw, the ends that could move to a child             |
| `resolveElementStyle()`, `resolveRelationshipStyle()`, `resolveBoundaryStyle()`             | the style cascade: tags in order, the last one wins, light blocks applied                          |
| `deriveIdentifier()`, `isValidIdentifier()`, `isKeyword()`                                  | readable, unique identifiers from names (`"Payment API"` becomes `paymentApi`)                     |
| `elementLayoutKey()`, `encodeElementLayout()`, `decodeElementLayout()`, `encodeVertices()`… | the `c4modeler.*` layout properties                                                                |
| `defaultShape()`, `defaultSize()`, `STRUCTURIZR_PX_PER_UNIT`                                | Structurizr's shapes and default sizes in modeler units                                            |
| `defaultTerminology()`, `typeLine()`                                                        | the type line of an element (`[Container: Kotlin]`)                                                |
| `C4_COLOUR_STYLES`                                                                          | the classic C4 palette, tuned for contrast                                                         |
| `semanticDigest()`, `sameDigest()`                                                          | a comparable digest of everything a workspace means, for "did anything but the formatting change?" |

## The layout format

The C4 Modeler stores where an element sits in the view's own `properties`, which Structurizr
keeps and ignores. One key per element and per relationship, in modeler units
(`STRUCTURIZR_PX_PER_UNIT` is 15/8: Structurizr's 450 × 300 px box is 240 × 160):

```ts
import {
  decodeElementLayout,
  elementLayoutKey,
  encodeElementLayout,
  encodeVertices,
  relationshipLayoutKey,
} from "@miragon/c4-schema-model";

elementLayoutKey("api"); // "c4modeler.element.api"
encodeElementLayout({ x: 560, y: 640 }); // "560,640"
decodeElementLayout("560,640,320,200"); // { x: 560, y: 640, width: 320, height: 200 }
relationshipLayoutKey("webApp->api"); // "c4modeler.relationship.webApp->api"
encodeVertices([
  { x: 10, y: 20 },
  { x: 30, y: 40 },
]); // "10,20 30,40"
```

The size is written only when it differs from the shape's default; a relationship's value lists
its bends, without its ends. Its key is its identifier, else `<source>-><destination>` for the only
unnamed relationship of a pair, `implied:<source>-><destination>` for an implied one. The
`c4modeler.` prefix and these values are a public file format.

## The C4 colours

`C4_COLOUR_STYLES` is the classic C4 palette (Person, Software System, Container, Component,
Existing System) as tag styles, adjusted where text missed 4.5:1 on its fill or the outline 3:1 on
the canvas. New workspaces start with it, "Apply C4 colours" writes it, and a workspace without
styles is drawn monochrome.

## Development

Part of the [C4 Modeler](../../README.md) in the
[Miragon modeler suite](https://github.com/Miragon/modeler-suite). Build with
`npm run build -w @miragon/c4-schema-model` (the other packages' tests read `dist`); test and lint with `npm run c4 test` and
`npm run c4 lint` from the suite's root.

## License

[MIT](../../LICENSE).
