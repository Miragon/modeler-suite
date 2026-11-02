# @miragon/c4-schema-model

[![npm](https://img.shields.io/npm/v/@miragon/c4-schema-model)](https://www.npmjs.com/package/@miragon/c4-schema-model)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/c4/LICENSE)

The DOM-free core of the [C4 Modeler](../../README.md): the [C4 model](https://c4model.com) of a
Structurizr DSL workspace as plain data, and the rules that turn it into views. Elements,
relationships, views and styles; identifiers; the view catalog and which elements and
relationships each view shows; implied relationships; the style cascade; the format the modeler
stores layout in; and the C4 colour palette.

The package has no view, no DOM, no diagram-js and no runtime dependency: plain TypeScript that
runs in a browser, in Node, in a VS Code extension host or in a CLI. It reads no text either:
[`@miragon/c4-dsl`](../dsl) parses a workspace into the `Workspace` this package describes,
[`@miragon/c4-layout`](../layout) lays its views out, and
[`@miragon/c4-renderer`](../renderer) draws them. ESLint and dependency-cruiser keep diagram-js
and the DOM out of it.

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
default views, while the workspace has no view at all), then the drafts of the missing default
views. A draft or an implicit view already carries the key it will be written under
(`draftKey`), and a keyless written view carries Structurizr's generated key (`generateViewKey`,
`SystemLandscape-001` …). `viewMembers` runs a view's `include` and `exclude` statements in order,
as Structurizr does, for system landscape, system context, container and component views: the
elements and relationships it shows (implied ones included), the boundaries around them and the
groups, each one known by its scope and path: `groupKey(scopeId, path)` is `"<scopeId>/<path>"`,
with an empty scope at model level, as the model and a system's block may both hold a group of one
name. An expression term it does not support is reported and skipped, and the view is marked
read-only rather than guessed.

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

The size is written only when it differs from the default of the element's shape; a
relationship's value lists its bends, without its ends. A relationship's key is its identifier,
else `<source>-><destination>` for the only unnamed relationship of a pair, `implied:<source>-><destination>`
for an implied one. The `c4modeler.` prefix and these values are a public file format.

## The C4 colours

`C4_COLOUR_STYLES` holds the tag styles the modeler's "Apply C4 colours" writes into a workspace:
the classic C4 palette (Person, Software System, Container, Component, Existing System), adjusted
where its text missed 4.5:1 on its fill or its outline 3:1 on the canvas, so the text of every
element and every line stays readable. Every new workspace of the modeler starts with them, and
"Apply C4 colours" writes them into one that lacks them; a workspace without styles is drawn
monochrome, as Structurizr's default is.

## Development

Part of the [C4 Modeler](../../README.md) in the
[Miragon modeler suite](https://github.com/Miragon/modeler-suite). From the suite's root:

```bash
npm run build -w @miragon/c4-schema-model   # tsup to dist/ (the other packages' tests read it)
npm run c4 test                             # Vitest unit tests of the modeler
npm run c4 lint                             # ESLint and the type checks
```

## License

[MIT](../../LICENSE).
