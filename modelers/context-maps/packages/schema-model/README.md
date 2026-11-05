# @miragon/context-maps-schema-model

[![npm](https://img.shields.io/npm/v/@miragon/context-maps-schema-model)](https://www.npmjs.com/package/@miragon/context-maps-schema-model)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/context-maps/LICENSE)

The **DOM-free core** of the [Context Maps Modeler](../../README.md): the data model, the notation
specification, runtime validation, version migrations and deterministic JSON serialization for
strategic Domain-Driven Design [Context Maps](https://contextmapper.org/) diagrams.

It is plain TypeScript with no DOM and no diagram-js, so it runs in the browser, Node, an edge
function or a CLI. The renderer ([`@miragon/context-maps-renderer`](../renderer)), the web app and
the VS Code extension build on it.

## Install

```bash
npm install @miragon/context-maps-schema-model
```

## The document format

A diagram is a single JSON object: a set of **bounded contexts** (boxes) and the **relationships**
(context-mapping patterns) that connect them via `from` → `to` context references.

```jsonc
{
  "version": 1,
  "title": "Conference event planner: context map",
  "contexts": [
    {
      "id": "ctx_cfp",
      "label": "CfP Management",
      "subdomainType": "core",
      "position": { "x": 340, "y": 120 },
      "size": { "width": 200, "height": 110 },
    },
  ],
  "relationships": [
    {
      "id": "rel_cfp_submission",
      "from": "ctx_cfp",
      "to": "ctx_submission",
      "pattern": "upstream-downstream",
      "upstreamRoles": ["OHS"],
      "downstreamRoles": ["ACL"],
    },
  ],
}
```

| Field           | Type               | Notes                                                                                                                             |
| --------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `version`       | `1`                | `DOCUMENT_VERSION`; older versions are migrated up on parse.                                                                      |
| `title`         | `string`           | Diagram name.                                                                                                                     |
| `contexts`      | `BoundedContext[]` | A box: `label`, `position`, `size`, optional `subdomainType`, `team`, `description`, `fill`, `stroke`.                            |
| `relationships` | `Relationship[]`   | An edge `from` → `to`: `pattern`, optional `upstreamRoles`/`downstreamRoles`, `label`, `description`, `implementationTechnology`. |

## Notation

The visual notation as data. Every relationship differs by stroke **and** colour, so diagrams
survive colour-vision deficiency and greyscale printing.

### Subdomain types: `SUBDOMAIN_TYPE_SPECS`

| `type`       | Label                | Icon          | Fill / Stroke         |
| ------------ | -------------------- | ------------- | --------------------- |
| `core`       | Core Domain          | star          | `#FDE0D5` / `#E8663D` |
| `supporting` | Supporting Subdomain | open hand     | `#FFF4CC` / `#B58914` |
| `generic`    | Generic Subdomain    | dotted circle | `#DCE9F5` / `#5B8DC7` |

### Relationship patterns: `RELATIONSHIP_PATTERN_SPECS`

| `pattern`             | Label               | Abbr. | Stroke                  | Symmetry   |
| --------------------- | ------------------- | ----- | ----------------------- | ---------- |
| `partnership`         | Partnership         | P     | indigo, thick solid     | symmetric  |
| `shared-kernel`       | Shared Kernel       | SK    | green, thick long-dash  | symmetric  |
| `customer-supplier`   | Customer-Supplier   | C/S   | orange, dash-dot        | asymmetric |
| `upstream-downstream` | Upstream-Downstream | U/D   | grey, thin solid        | asymmetric |
| `separate-ways`       | Separate Ways       | SW    | light grey, fine dotted | symmetric  |

The **integration roles** that decorate the ends of asymmetric relationships come from
`UPSTREAM_ROLE_SPECS` (OHS = Open Host Service, PL = Published Language) and `DOWNSTREAM_ROLE_SPECS`
(ACL = Anticorruption Layer, CF = Conformist), with per-marker colours in `MARK_COLORS`. The
renderer writes black or white on each role chip, whichever has more contrast.

The values are tuned for text 4.5:1 and lines 3:1. A document stores only a context's own `fill` /
`stroke`, never these values.

## Usage

```ts
import {
  emptyDocument,
  createBoundedContext,
  createRelationship,
  serializeDocument,
  parseDocument,
  SAMPLE_DOCUMENT,
} from "@miragon/context-maps-schema-model";

// Build a document with the factories (notation defaults applied automatically)
const doc = emptyDocument("Conference event planner");
const cfp = createBoundedContext("core", { x: 340, y: 120 }, { label: "CfP Management" });
const submission = createBoundedContext(
  "core",
  { x: 640, y: 300 },
  { label: "Submission Handling" },
);
doc.contexts.push(cfp, submission);
doc.relationships.push(
  createRelationship(cfp.id, submission.id, "upstream-downstream", {
    upstreamRoles: ["OHS"],
    downstreamRoles: ["ACL"],
  }),
);

// Serialize deterministically (sorted, rounded, version-stamped): diff- and URL-stable
const json = serializeDocument(doc);

// Validate + migrate anything untrusted (file / URL / localStorage)
const result = parseDocument(JSON.parse(json));
if (result.ok) {
  console.log(result.document.title);
} else {
  console.error(result.error);
}

// A ready-made example context map
console.log(SAMPLE_DOCUMENT.title);
```

### API surface

| Export                                                                                        | Purpose                                                              |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `CmDocument`, `BoundedContext`, `Relationship`, `Position`, `Size`                            | The document model types.                                            |
| `SubdomainType`, `RelationshipPattern`, `UpstreamRole`, `DownstreamRole`, + their value lists | The notation's discriminator unions + their value lists.             |
| `SUBDOMAIN_TYPE_SPECS`, `RELATIONSHIP_PATTERN_SPECS`, `MARK_COLORS`, `dashArray()`            | The visual notation spec (colours, strokes, markers) as data.        |
| `documentSchema`, `boundedContextSchema`, `relationshipSchema`                                | Zod schemas for each shape.                                          |
| `parseDocument()`, `ParseResult`, `validateDocument()`, `ValidationReport`                    | Structural parse + the thirteen strategic-DDD semantic rules.        |
| `parseDocumentText()`, `serializeDocumentText()`                                              | The text of a `.cm`/`.cm.json` file: parse it, write it canonically. |
| `serializeDocument()`, `canonicalize()`                                                       | Deterministic JSON serialization (sorted, rounded, fixed key order). |
| `DOCUMENT_KEYS`, `CONTEXT_KEYS`, `RELATIONSHIP_KEYS`, `foreignFields()`                       | The keys this version knows; every other key is kept as it is.       |
| `MAX_COORDINATE`                                                                              | The largest coordinate or size a document may hold (1,000,000 px).   |
| `MAX_NESTING_DEPTH`                                                                           | How many levels of objects and arrays a document may nest (100).     |
| `DIAGRAM_ROOT_ID`, `isReservedId()`, `reservedIdProblem()`                                    | The ids no context or relationship may take, and why.                |
| `emptyDocument()`, `createBoundedContext()`, `createRelationship()`, `newId()`                | Factories with notation defaults + id generation.                    |
| `SAMPLE_DOCUMENT`                                                                             | A complete example context map.                                      |
| `DOCUMENT_VERSION`                                                                            | The current document version (`1`).                                  |

## Determinism & migrations

- **Determinism:** `serializeDocument()` runs `canonicalize()` first: arrays are sorted by `id`,
  coordinates are rounded to two decimals, optional fields with no value are dropped, and keys are
  written in a fixed order. The same logical diagram always produces byte-identical JSON, which is
  what makes Git diffs small and share URLs stable. `serializeDocumentText()` is the file's text:
  the pretty-printed JSON ending in one line break, a fixpoint of `parseDocumentText()`.
- **Foreign keys:** a key the model does not know (a vendor extension, a field of a newer modeler)
  on the document, a context or a relationship is kept as it is and written back after the known
  keys of its object, sorted by name. Opening and saving a file never drops content.
- **Validation and migrations:** `parseDocument()` migrates older documents by `version` and
  coerces loosely shaped input, then validates. It rejects a newer `version`, a coordinate or size
  beyond `MAX_COORDINATE`, an id the canvas reserves or a built-in object property name
  (`isReservedId()`, `reservedIdProblem()`), a repeated id, and nesting deeper than
  `MAX_NESTING_DEPTH`. All issues come in one round, in document order, each with the path of the
  offending value (e.g. `["contexts", 2, "id"]` for the repeat). `validateDocument()` adds the
  thirteen semantic rules.

## Development

From the root of the [Miragon modeler suite](https://github.com/Miragon/modeler-suite):

```bash
npm run build -w @miragon/context-maps-schema-model   # tsup → dist/ (publish build)
npm run context-maps test                             # Vitest unit tests
npm run context-maps typecheck                        # tsc, compiled WITHOUT the DOM lib
```

## License

[MIT](../../LICENSE).
