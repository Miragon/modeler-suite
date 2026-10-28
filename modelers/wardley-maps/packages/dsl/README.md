# @miragon/wardley-dsl

[![npm](https://img.shields.io/npm/v/@miragon/wardley-dsl)](https://www.npmjs.com/package/@miragon/wardley-dsl)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/wardley-maps/LICENSE)

DOM-free bridge between the [Online-Wardley-Maps](https://docs.onlinewardleymaps.com/) text DSL and
the `WardleyMap` model, as a lossless round-trip.

## Install

```bash
npm install @miragon/wardley-dsl
```

## Usage

```ts
import { parseDSL, serializeDSL } from "@miragon/wardley-dsl";

const map = parseDSL(`title Tea Shop
component Kettle [0.43, 0.35]
evolve Kettle 0.62`);

const text = serializeDSL(map); // back to OWM text, losslessly
```

### Line breaks in names

The text is one statement per line, so a line break in a name, in a note's text, in an
annotation's text or in the new name of an `evolve` line is written as a literal `\n`, and read
back as a line break:

```ts
const map = parseDSL(`title Portal
anchor Customer\\nPortal [0.95, 0.5]
component Ledger [0.3, 0.7]
Customer\\nPortal -> Ledger`);

map.elements[0].label; // "Customer\nPortal"
```

Links, `evolve` lines and pipeline blocks refer to the name with its `\n`, and names are unique
with their breaks (`Customer\nPortal` and `Customer Portal` are two names). A real backslash
followed by `n` (`C:\new`) reads as a line break too. Other OWM tools may show the `\n` as text.

### Writing edits back into hand-written text

`serializeDSL` writes the canonical form: statements grouped by kind, comments and unknown lines at
the end, numbers like `0.80` as `0.8`. Where the text file is the source of truth (an editor, a
file under Git), write an edited map back with `patchDSL` instead:

```ts
import { parseDSL, patchDSL } from "@miragon/wardley-dsl";

const map = parseDSL(fileText);
// … the user moves, renames, adds or deletes something …
const newText = patchDSL(fileText, editedMap);
```

`patchDSL(originalText, map)` keeps every line the edit did not touch exactly as written (comments,
blank lines, line order, number formatting, unknown lines, CRLF or LF line breaks and the final line
break). It rewrites changed statements in place, deletes removed ones together with their links and
evolve lines, rewrites every line that references a renamed element and inserts new statements after
the last statement of the same kind. Elements are matched to the source by id, then by name, so the
element order and ids of `map` do not matter.

The result always reads back as the same map as `serializeDSL(map)`. When an edit cannot be patched
safely into the source layout, `patchDSL` falls back to the canonical `serializeDSL(map)` text (in
the source's line break style). It never throws.

### Ids in the document

The OWM DSL writes no ids: the parser derives them from names (`cmp_cup_of_tea`), note texts and
annotation numbers, with a `_2` suffix for a repeat in line order. An editor that creates or renames
an element holds an id the text does not give it until the text is read again. `readBackIds(map)`
tells, by the ids of `map`, which id each element carries once `serializeDSL(map)` is read back:

```ts
import { readBackIds } from "@miragon/wardley-dsl";

readBackIds(editedMap).get("shape_42"); // 'cmp_hot_water'
```

Part of the [Wardley Maps Modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/wardley-maps) in the [Miragon modeler suite](https://github.com/Miragon/modeler-suite).

## License

MIT
