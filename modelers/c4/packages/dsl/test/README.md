# Tests of `@miragon/c4-dsl`

Run from `modelers/c4`: `npx vitest run --project=unit packages/dsl/test`. The tests resolve
`@miragon/c4-schema-model` (and the edit tests `@miragon/c4-layout`) from `dist`, so build those
first (`npm run c4 build`).

| Folder      | What                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------- |
| `syntax/`   | lexer, lossless CST, identity printer, mutation fuzz, linear-time guards                        |
| `semantic/` | the builder, diagnostics and reject rules, against the reference snapshots in `fixtures/`       |
| `edit/`     | the edit layer (SPEC 3.4-3.6): golden pairs, refusals, smart delete, outcomes, fuzz, acceptance |

## Edit tests

- `edit/golden/cases.ts` lists one case per placement rule of SPEC 3.5 and per critique-round
  case; `edit/golden/<name>.after.dsl` is the reviewed result of each. After a deliberate change
  of the edit layer, rewrite them (`UPDATE_GOLDENS=1` and the golden test, below), review the
  diff byte by byte, and run the edit acceptance again.

  ```sh
  UPDATE_GOLDENS=1 npx vitest run --project=unit packages/dsl/test/edit/golden.test.ts
  ```

- `edit/fuzz.test.ts` runs 2 000 seeded edit sequences on Big Bank and five vendored fixtures
  (`scripts/write-fuzz-outputs.mjs` holds the generator): no edit takes the `verification-failed`
  path, every result imports, the edits and their inverse are exact, and every element an edit
  did not target keeps its id, kind and parent.
- `edit/acceptance.test.ts` checks `fixtures/snapshots/edit-acceptance.json`: every golden
  after-file is listed with its current SHA-256 and accepted by Structurizr 6.2.4, and every
  recorded fuzz seed still produces the text whose hash is recorded.

## Edit acceptance by the reference parser (not in CI)

Needs Java 17 or later and Maven (or `STRUCTURIZR_CLASSPATH`, see
`scripts/structurizr-snapshots/README.md`). From `modelers/c4`:

```sh
npm run build -w packages/dsl
node packages/dsl/scripts/write-fuzz-outputs.mjs <folder>
node packages/dsl/scripts/structurizr-snapshots/snapshot.mjs --edits --fuzz <folder>
```

The first command writes the results of fuzz seeds 1-200 as `seed-NNNN.dsl`; the second parses
every golden `*.after.dsl` and every fuzz output with Structurizr 6.2.4 and writes
`edit-acceptance.json`. Run it whenever the edit layer or a golden changes; the acceptance test
fails until the JSON is regenerated. Last run: 2026-11-01, 64 golden after-files and 200 fuzz
outputs, all accepted.

## The `autoLayout` decision, checked against Structurizr (SPEC 4.4)

Checked on 2026-11-01, before the placement rules were frozen:

- **Filtered view over an `autoLayout` base.** Structurizr 6.2.4 rejects it, the same file
  without the base's `autoLayout` is accepted:

  ```text
  The view "Landscape" has automatic layout enabled - this is not supported for filtered views at line 12: filtered "Landscape" include "Tag" "Filtered"
  ```

  So the edit layer never adds `autoLayout` to an existing view; it writes it only into the views
  it creates, whose keys no filtered view can name yet.

- **A generated view in Structurizr local.** `edit/golden/create-in-implicit-views.after.dsl`
  (the implicit views written by the first edit, each `include *` with `autoLayout tb 300 160`,
  the landscape with a `c4modeler.element.admin` property) opened as `workspace.dsl` in
  `docker run -p 18080:8080 -v <folder>:/usr/local/structurizr structurizr/structurizr local`
  (image `sha256:8aebde645a7cc8d3b9e1e774cd6d75a84ce45d74ae70eb783876182fe7db31a2`). Every view
  opens and is laid out by Structurizr's own automatic layout with the written separations
  (rank 300, node 160): the landscape places Customer and Admin in the first rank and Shop and
  Mail below (y 160, 784, 1 408), the container view Customer above Web (y 159, 933); nothing is
  stacked at 0,0. The `c4modeler.*` property is kept in the view's properties and has no effect
  on the positions, as R-DSL §16 says.

## Other findings from the reference parser

- **Name uniqueness.** R-DSL §5 says people, software systems and custom elements share one
  top-level namespace; Structurizr 6.2.4 refuses two people or two software systems of one name
  (`A top-level element named 'Same' already exists`) but accepts a person, a software system
  and a custom element that share it. The edit layer follows the parser: names are unique per
  kind at the top level, per system and per container.
- **Bulk statements select at their line.** Structurizr evaluates `!elements` and
  `!relationships` where they stand, so only what is defined above counts, and refuses one that
  selects nothing (`No elements found for expression …`, `No relationships found …`);
  `!elements *` always selects nothing. The modeler doesn't evaluate them, so a delete that may
  take the last item an expression selects is refused (`edit/bulkSelection.test.ts`).
- **Special spaces are no whitespace.** Java's tokenizer splits only at `Character.isWhitespace`,
  so a line of only no-break or zero-width spaces is a statement Structurizr fails on in every
  block (several such words pass only as a property or a perspective), and a name of one
  no-break space is a name (`String.trim()` cuts only up to U+0020).
- **`-/>`** is read only directly in a deployment environment (or a group in it), between two
  identifiers and only with a block; in a deployment node, without `{`, without its source or
  anywhere else Structurizr refuses the file.
