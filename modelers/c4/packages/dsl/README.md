# @miragon/c4-dsl

[![npm](https://img.shields.io/npm/v/@miragon/c4-dsl)](https://www.npmjs.com/package/@miragon/c4-dsl)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/c4/LICENSE)

Read and edit Structurizr DSL workspaces losslessly, without the DOM: the text part of the
[C4 Modeler](../../README.md). It parses a workspace (a `workspace.dsl`, or the C4 Modeler's own
`.c4` file, which holds the same DSL) into a syntax tree that holds every byte, builds the
[C4 model](https://c4model.com) it defines with diagnostics, and applies edits
that change only the statements they touch, checked before they are handed back. Whatever the
package does not interpret (deployment environments, dynamic and deployment views, `!docs`,
`!adrs`, scripts, comments, the formatting) stays byte for byte.

Its only dependency is [`@miragon/c4-schema-model`](../schema-model), which describes the model it
builds. It runs in a browser, in Node and in a VS Code extension host, where the C4 Modeler
parses for the Problems view and for Go to View.

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

The lexer follows the reference parser's rules (line continuations, text blocks, comments, BOM,
CRLF, tabs). The builder resolves identifiers (flat and hierarchical), archetypes, groups, `!element`
and `!relationship` re-opens, constants, implied relationships and every view's key, and reports
what it cannot follow as diagnostics instead of failing:

- A text rejects (`ok: false`) only where its structure is ambiguous: unbalanced blocks or an
  unterminated `/*` or `"""`, not exactly one `workspace` block, a second `model` or `views`, a
  duplicate identifier, a duplicate view key, an element keyword where the context does not allow
  it.
- What Structurizr refuses but a reader can still show (an unresolved reference, a duplicate name,
  a relationship Structurizr would not accept) is an error that does not reject (`rejects: false`).
- `!include`, `!script` and `!plugin` are kept and not run; the workspace is then marked
  `openWorld`. `!elements` and `!relationships` are kept and not evaluated.

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
relationships, moves a relationship's end from a system to one of its containers (or a container
to a component), renames an identifier everywhere, moves and resizes (`setLayout`), removes from or
includes in a view, creates, retitles and deletes views, clears a view's layout, edits the
workspace's name and description, applies the C4 colours, and puts an example into a blank text or
an empty workspace (no element, no view, no style but the C4 colours; `insertExample`, refused
anywhere else). Each edit writes its statements
where a person would (after the elements of their kind, inside the right parent, opening a
one-line element into a block when it needs one), and before it returns it parses the result and
checks it: the text still parses, no new error appeared, nothing changed but what the edit asked
for (a semantic digest of the result against the expected one), no other element's identifier
moved, and the created or deleted things are there or gone. An edit that fails a check is refused
with a reason and a message, and the text stays as it was.

Other exports:

- `applyTextEdits(text, edits)` applies the splices of an outcome.
- `planSmartDelete(document, view, ids, relationships)` splits a deletion into what goes from the
  model (shown in no other view) and what goes from the view only; `deleteImpact` counts what a
  deletion from the model reaches (descendants, views, dynamic steps, deployment instances).
- `newWorkspaceText()` is an empty workspace with the C4 colours as tag styles, the block
  `applyC4Colours` writes, so that edit changes nothing on it (the first edit of a blank text
  starts from it too); `NEW_VIEW_AUTO_LAYOUT` (`"tb 300 160"`) is the `autoLayout` the edits write
  into the views they create, so Structurizr lays them out itself.
- `parseCst` and `printCst` give the lossless syntax tree on its own.

## Layout in the file

An edit that moves or resizes an element writes its position into the view's `properties` with
the `c4modeler.` keys of [`@miragon/c4-schema-model`](../schema-model#the-layout-format). The
first such edit in a view writes the position of every element of the view, so nothing jumps
afterwards; edits of names, descriptions or technologies write no position.

## Tests against Structurizr

The package's tests run on the test fixtures of the Structurizr DSL reference parser (Apache-2.0,
vendored unchanged with their licence) and compare the model and every view's members with what
Structurizr 6.2.4 makes of them, recorded by a script that runs the reference parser. Every golden
result of the edit tests, and 200 results of seeded random edits, are recorded as accepted by
Structurizr 6.2.4 as well. How to run those scripts (Java, not in CI) is in
[`test/README.md`](test/README.md).

## Development

Part of the [C4 Modeler](../../README.md) in the
[Miragon modeler suite](https://github.com/Miragon/modeler-suite). From the suite's root:

```bash
npm run build -w @miragon/c4-dsl   # tsup to dist/ (the renderer's and the apps' tests read it)
npm run c4 test                    # Vitest unit tests of the modeler (build the packages first)
npm run c4 lint                    # ESLint and the type checks
```

## License

[MIT](../../LICENSE).
