# @miragon/c4-dsl

[![npm](https://img.shields.io/npm/v/@miragon/c4-dsl)](https://www.npmjs.com/package/@miragon/c4-dsl)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/c4/LICENSE)

Read and edit Structurizr DSL workspaces losslessly, without the DOM: the text part of the
[C4 Modeler](../../README.md). It parses a workspace (`workspace.dsl`, or the modeler's `.c4`) into
a syntax tree that holds every byte, builds the [C4 model](https://c4model.com) with diagnostics,
and applies verified edits that change only the statements they touch. What it does not interpret
(deployment environments, dynamic and deployment views, `!docs`, `!adrs`, scripts, comments,
formatting) stays byte for byte. Its only dependency is [`@miragon/c4-schema-model`](../schema-model);
it runs in a browser, Node and a VS Code extension host.

Compatible with Structurizr DSL; the reference is Structurizr 6.2.4. Structurizr is a product of
Structurizr Limited; this project is not affiliated with or endorsed by Structurizr Limited.

## Install

```bash
npm install @miragon/c4-dsl @miragon/c4-schema-model
```

## Parse

```ts
import { parseWorkspace, printCst } from "@miragon/c4-dsl";

const document = parseWorkspace(text);

document.ok; // false only when a diagnostic rejects the text
document.workspace; // the C4 model: elements, relationships, views, styles (@miragon/c4-schema-model)
document.diagnostics; // { severity, code, message, line, column, rejects, elementId? }[]
printCst(document.cst) === text; // always: the syntax tree holds every byte
```

The lexer follows the reference parser (line continuations, text blocks, comments, BOM, CRLF,
tabs). The builder resolves identifiers (flat and hierarchical), archetypes, groups, `!element` and
`!relationship` re-opens, constants, implied relationships and view keys, and reports what it
cannot follow as diagnostics:

- It rejects (`ok: false`) only ambiguous structure: unbalanced blocks, an unterminated `/*` or
  `"""`, not exactly one `workspace`, a second `model` or `views`, a duplicate identifier or view
  key, an element keyword in the wrong context.
- What Structurizr refuses but a reader can still show (unresolved reference, duplicate name,
  invalid relationship) is an error with `rejects: false`.
- `!include`, `!script` and `!plugin` are kept, not run (the workspace is marked `openWorld`);
  `!elements` and `!relationships` are kept, not evaluated.

## Edit

```ts
import { applyEdit, parseWorkspace } from "@miragon/c4-dsl";

const document = parseWorkspace(text);
const outcome = applyEdit(
  document,
  { type: "createElement", kind: "softwareSystem", name: "Warehouse", center: { x: 1400, y: 600 } },
  {
    view: "SystemLandscape", // the view the edit happens in
    boxes: new Map(), // the boxes the user sees there, for the first layout write
    vertices: new Map(),
    fresh: new Set(),
    identifiers: "readable",
    random: () => Math.random().toString(36).slice(2, 6),
  },
);

if (outcome.ok) {
  outcome.text; // the new text
  outcome.edits; // the splices, against the old text
  outcome.inverse; // the splices that bring the old text back
  outcome.created.elements; // ["warehouse"]
} else {
  outcome.reason; // "name-taken", "field-not-editable", "verification-failed", …
  outcome.message; // "A software system named Warehouse already exists."
}
```

`applyEdit` is pure and never throws. A `C4Edit` creates, updates or deletes elements and
relationships, moves a relationship's end to a child, renames an identifier everywhere, moves and
resizes (`setLayout`), removes from or includes in a view, creates, retitles and deletes views,
clears a view's layout, edits the workspace's name and description, applies the C4 colours, and
inserts an example into a blank or empty workspace (`insertExample`). Statements go where a person
would write them. Before returning, it reparses and checks the result: no new error, nothing changed
but what was asked (semantic digest), no other identifier moved, created or deleted things are
there or gone. A failed check is refused with a reason and a message.

Other exports:

- `applyTextEdits(text, edits)` applies the splices of an outcome.
- `planSmartDelete(document, view, ids, relationships)` splits a deletion into what goes from the
  model (shown in no other view) and what goes from the view only; `deleteImpact` counts what a
  deletion from the model reaches (descendants, views, dynamic steps, deployment instances).
- `newWorkspaceText()` is an empty workspace with the C4 colours as tag styles (what
  `applyC4Colours` writes, so it changes nothing there); `NEW_VIEW_AUTO_LAYOUT` (`"tb 300 160"`) is
  the `autoLayout` new views get.
- `parseCst` and `printCst` give the lossless syntax tree on its own.

## Layout in the file

An edit that moves or resizes an element writes its position into the view's `properties` with
the `c4modeler.` keys of [`@miragon/c4-schema-model`](../schema-model#the-layout-format). The
first such edit in a view writes the position of every element of the view, so nothing jumps
afterwards; edits of names, descriptions or technologies write no position.

## Tests against Structurizr

The tests compare the model and every view's members with what Structurizr 6.2.4 makes of its
vendored DSL test fixtures (Apache-2.0, unchanged), and record every edit golden and 200 seeded
random edits as accepted by it. The Java scripts (not in CI) are described in
[`test/README.md`](test/README.md).

## Development

Part of the [C4 Modeler](../../README.md) in the
[Miragon modeler suite](https://github.com/Miragon/modeler-suite). Build with
`npm run build -w @miragon/c4-dsl` (the renderer's and the apps' tests read `dist`); test and lint with `npm run c4 test` and
`npm run c4 lint` from the suite's root.

## License

[MIT](../../LICENSE).
