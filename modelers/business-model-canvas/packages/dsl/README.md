# @miragon/business-model-canvas-dsl

Reads and writes the `.bmc` file of the [Business Model Canvas Modeler](../../README.md),
losslessly. Private to the suite: bundled into the modeler's apps from source, not published to
npm.

```ts
import { parseText, readText, serializeText } from "@miragon/business-model-canvas-dsl";

const { document, diagnostics } = parseText(text); // never throws; errors are diagnostics
const canvas = readText(text).document; // throws when the text has an error
const canonical = serializeText(canvas); // a fixpoint of parseText
```

A `.bmc` file is YAML: `version: 1`, a `canvas` with the title and the notes on the canvas as a
whole, and one field per building block with its `items` (the stickies) and `notes`. Every field,
every diagnostic and the canonical form are in the
[`bmc-dsl` skill](../../plugins/business-model-canvas-modeler/skills/bmc-dsl/SKILL.md), the one
reference of the format; `test/skills.test.ts` parses each of its examples.

Each entry of `diagnostics` has a `severity`, its place as a path into the file (`JsonPath`, shown
by `describeDiagnostic` as `channels.items[2].id: …`) and its `range` in the text (offsets, the end
excluded). An error makes the text invalid; a warning keeps it open. A text reports a hundred
findings at most, and one longer than `MAX_TEXT_LENGTH` (1,048,576 characters) is an error. The
VS Code extension marks the `range` in the Problems view.
