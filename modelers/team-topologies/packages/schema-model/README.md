# @miragon/team-topologies-schema-model

[![npm](https://img.shields.io/npm/v/@miragon/team-topologies-schema-model)](https://www.npmjs.com/package/@miragon/team-topologies-schema-model)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/team-topologies/LICENSE)

The **DOM-free core** of the [Team Topologies Modeler](../../README.md): the data model, the notation
specification, runtime validation, version migrations and deterministic JSON serialization for
[Team Topologies](https://teamtopologies.com/) diagrams.

Plain TypeScript with no DOM and no diagram-js, so it runs anywhere (browser, Node, a CLI). The
[renderer](../renderer), the web app and the VS Code extension build on it.

## Install

```bash
npm install @miragon/team-topologies-schema-model
```

## What's inside

- **Notation spec:** the team types and interaction modes with their official shapes, colours and
  strokes, as data.
- **Document model** `TtDocument`: `version`, `title`, `nodes`, `interactions`, `flows`,
  `annotations`.
- **Validation and migration:** `parseDocument()` (Zod) upgrades older versions, then validates.
- **Deterministic serialization** for clean diffs and stable share URLs.
- **Factories** and a complete example, `SAMPLE_DOCUMENT`.

## The document format

A diagram is a single JSON object. Interactions are **placed shapes** that overlap the teams they
relate to (spatial overlap, the Team Topologies convention); there is no source/target reference.

```jsonc
{
  "version": 3,
  "title": "Online shop team topology",
  "nodes": [
    {
      "id": "team_checkout",
      "type": "stream-aligned",
      "label": "Checkout & Payments",
      "position": { "x": 560, "y": 202 },
      "size": { "width": 240, "height": 96 },
    },
  ],
  "interactions": [
    {
      "id": "int_platform_checkout",
      "mode": "x-as-a-service",
      "position": { "x": 636, "y": 286 },
      "size": { "width": 88, "height": 78 },
    },
  ],
  "flows": [],
  "annotations": [
    {
      "id": "ann_checkout_split",
      "text": "Splits into two stream-aligned teams in Q3",
      "position": { "x": 560, "y": 110 },
      "size": { "width": 200, "height": 64 },
      "attachedTo": "team_checkout",
    },
  ],
}
```

| Field          | Type                 | Notes                                                                                                                              |
| -------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `version`      | `3`                  | `DOCUMENT_VERSION`; older versions are migrated up on parse.                                                                       |
| `title`        | `string`             | Diagram name.                                                                                                                      |
| `nodes`        | `TeamNode[]`         | A team: `type`, `label`, `position`, `size`, optional `description`/`fill`/`stroke`.                                               |
| `interactions` | `InteractionShape[]` | A placed interaction: `mode`, `position`, `size`, optional `label`/`fill`/`stroke`.                                                |
| `flows`        | `FlowShape[]`        | A flow-of-change band: `position`, `size`, optional `label`.                                                                       |
| `annotations`  | `TextAnnotation[]`   | A free-text note: `text`, `position`, `size`, optional `attachedTo` (a team/interaction/flow id). Left out of the JSON when empty. |

## Notation

The single source of truth for the visual notation. Shapes and colours follow the official
[Team-Shape-Templates](https://github.com/TeamTopologies/Team-Shape-Templates): every element is
distinguished by shape **and** colour, so diagrams survive colour-vision deficiency and greyscale
printing. Team shapes are **solid** (long-lived); interaction shapes are **dashed** (short-lived).
An interaction spec carries the templates' fill opacity (`opacity: 0.5`); the renderer premixes the
fill over white at that opacity and draws it opaque.

### Team types: `TEAM_TYPE_SPECS`

| `type`                  | Label                 | Shape                        | Fill / Stroke         |
| ----------------------- | --------------------- | ---------------------------- | --------------------- |
| `stream-aligned`        | Stream-aligned        | horizontal rounded rectangle | `#FFEDB8` / `#FFD966` |
| `enabling`              | Enabling              | vertical rounded rectangle   | `#DFBDCF` / `#D09CB7` |
| `complicated-subsystem` | Complicated Subsystem | octagon                      | `#FFC08B` / `#E88814` |
| `platform`              | Platform              | square-cornered rectangle    | `#B7CDF1` / `#6D9EEB` |

### Interaction modes: `INTERACTION_MODE_SPECS`

| `mode`           | Label          | Glyph                                 | Fill / Stroke         |
| ---------------- | -------------- | ------------------------------------- | --------------------- |
| `collaboration`  | Collaboration  | parallelogram                         | `#C6BEDF` / `#967EE2` |
| `x-as-a-service` | X-as-a-Service | triangle (points provider → consumer) | `#B4B4B4` / `#999696` |
| `facilitating`   | Facilitating   | circle                                | `#C9DFBE` / `#78996B` |

The **flow of change** is described separately by `FLOW_SPEC` (a left-to-right dashed band), and
text annotations by `ANNOTATION_SPEC` (default and minimum size; they are not part of the official
notation, so they carry no notation colours).

## Usage

```ts
import {
  emptyDocument,
  createTeamNode,
  createInteractionShape,
  serializeDocument,
  parseDocument,
  SAMPLE_DOCUMENT,
} from "@miragon/team-topologies-schema-model";

// Build a document with the factories (notation defaults applied automatically)
const doc = emptyDocument("Online shop");
doc.nodes.push(createTeamNode("stream-aligned", { x: 560, y: 202 }));
doc.interactions.push(createInteractionShape("x-as-a-service", { x: 636, y: 286 }));

// Serialize deterministically (sorted, rounded, version-stamped): diff- and URL-stable
const json = serializeDocument(doc);

// Validate + migrate anything untrusted (file / URL / localStorage)
const result = parseDocument(JSON.parse(json));
if (result.ok) {
  console.log(result.document.title);
} else {
  console.error(result.error);
}

// A ready-made example topology
console.log(SAMPLE_DOCUMENT.title);
```

### API surface

| Export                                                                                                                      | Purpose                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `TtDocument`, `TeamNode`, `InteractionShape`, `FlowShape`, `TextAnnotation`, `Position`, `Size`                             | The document model types.                                                                             |
| `TeamType`, `InteractionMode`, `TEAM_TYPES`, `INTERACTION_MODES`                                                            | The notation's discriminator unions + their value lists.                                              |
| `TEAM_TYPE_SPECS`, `INTERACTION_MODE_SPECS`, `FLOW_SPEC`, `ANNOTATION_SPEC`, `dashArray()`                                  | The visual notation spec (shapes, colours, strokes) as data.                                          |
| `documentSchema`, `teamNodeSchema`, `interactionSchema`, `flowSchema`, `annotationSchema`                                   | Zod schemas for each shape.                                                                           |
| `parseDocument()`, `ParseResult`, `DocumentIssue`, `MAX_NESTING_DEPTH`                                                      | Validate **and migrate** unknown input into a `TtDocument`; a failure lists each issue with its path. |
| `serializeDocument()`, `canonicalize()`                                                                                     | Deterministic JSON serialization (sorted, rounded, fixed key order).                                  |
| `foreignFields()`, `withForeignFields()`, `DOCUMENT_FIELDS`, `TEAM_NODE_FIELDS`, …                                          | The fields a document carries beyond the known ones.                                                  |
| `documentIdProblems()`, `DIAGRAM_ROOT_ID`, `associationId()`                                                                | The id rules (unique, not reserved).                                                                  |
| `emptyDocument()`, `createTeamNode()`, `createInteractionShape()`, `createFlowShape()`, `createTextAnnotation()`, `newId()` | Factories with notation defaults + id generation.                                                     |
| `SAMPLE_DOCUMENT`                                                                                                           | A complete example topology.                                                                          |
| `DOCUMENT_VERSION`                                                                                                          | The current document version (`3`).                                                                   |

## Determinism & migrations

- **Determinism:** `serializeDocument()` runs `canonicalize()` first: arrays are sorted by `id`,
  coordinates are rounded to two decimals, optional fields with no value are dropped, and keys are
  written in a fixed order. The same logical diagram always produces byte-identical JSON, which is
  what makes Git diffs small and share URLs stable. The pretty form (the default) is the file on
  disk and ends with a line break; the compact form (`serializeDocument(doc, false)`) has none.
- **Unknown fields** (e.g. a vendor's `"x-vendor"`) pass `parseDocument()` untouched and are
  written after the known fields, sorted by name, so another tool's data survives a save. Objects
  and arrays nest at most 100 levels (`MAX_NESTING_DEPTH`); deeper documents are refused with an
  issue at each first too-deep level (at most 100).
- **Ids:** `parseDocument()` rejects ids that would collide on the canvas: duplicates, `tt-root`
  (`DIAGRAM_ROOT_ID`), `__implicitroot…`, `assoc_<annotation id>` (`associationId()`) and built-in
  object property names (`constructor`, `__proto__`, …). `documentIdProblems()` lists them.
- **Migrations:** `1 → 2` drops the legacy `showFlowOfChange` flag and interactions without
  geometry (from version 2 on, such an interaction is refused instead); `2 → 3` adds an empty
  `annotations` list, which is not written back. Issue paths count in the input.

## Development

This package is part of the [Team Topologies Modeler](../../README.md) in the
[Miragon modeler suite](https://github.com/Miragon/modeler-suite) and is normally consumed from
source. From the suite's root:

```bash
npm run build -w @miragon/team-topologies-schema-model   # tsup → dist/ (publish build)
npm run team-topologies test                             # Vitest unit tests
npm run team-topologies typecheck                        # tsc, compiled WITHOUT the DOM lib
```

## License

[MIT](../../LICENSE).
