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

A line break in a name, a note, an annotation or an `evolve` rename is written as a literal `\n`:

```ts
const map = parseDSL(`title Portal
anchor Customer\\nPortal [0.95, 0.5]
component Ledger [0.3, 0.7]
Customer\\nPortal -> Ledger`);

map.elements[0].label; // "Customer\nPortal"
```

References use the name with its `\n`, and `Customer\nPortal` differs from `Customer Portal`.
Leading and trailing breaks are dropped; a name of only breaks gets the type's default name, with a
diagnostic. A real backslash before `n` (`C:\new`) also reads as a break. Other OWM tools may show
`\n` as text.

### Writing edits back into hand-written text

`serializeDSL` writes the canonical form (statements grouped by kind, comments and unknown lines
last, `0.80` as `0.8`). Where the text is the source of truth, write edits back with `patchDSL`:

```ts
import { parseDSL, patchDSL } from "@miragon/wardley-dsl";

const map = parseDSL(fileText);
// … the user moves, renames, adds or deletes something …
const newText = patchDSL(fileText, editedMap);
```

`patchDSL(originalText, map)` keeps every untouched line exactly as written (comments, blank lines,
order, number formatting, unknown lines, line endings). It rewrites changed statements in place,
deletes removed ones with their links and evolve lines, updates references to renamed elements and
inserts new statements after the last one of their kind. Elements are matched by id, then by name.
The result always reads back as `serializeDSL(map)` would; when an edit cannot be patched safely it
falls back to that canonical text. It never throws.

### Ids in the document

The DSL writes no ids: the parser derives them from names (`cmp_cup_of_tea`), with `_2` for a
repeat. `readBackIds(map)` tells which id each element of `map` gets once `serializeDSL(map)` is read
back:

```ts
import { readBackIds } from "@miragon/wardley-dsl";

readBackIds(editedMap).get("shape_42"); // 'cmp_hot_water'
```

### Where the link addresses stand

`locateUrlAddresses(text)` lists every `url Name [address]` definition (none from comments) with its
address, 1-based `line` and the `start` / `end` offsets of the address, so an editor can replace just
that range:

```ts
import { locateUrlAddresses } from "@miragon/wardley-dsl";

locateUrlAddresses("title Shop\nurl Payment [details/payment.wmap]\n");
// [{ name: 'Payment', address: 'details/payment.wmap', line: 2, start: 13, end: 33 }]
```

Part of the [Wardley Maps Modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/wardley-maps) in the [Miragon modeler suite](https://github.com/Miragon/modeler-suite).

## License

MIT
