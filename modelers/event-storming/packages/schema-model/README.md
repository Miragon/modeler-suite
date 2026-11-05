# @miragon/event-storming-schema-model

[![npm](https://img.shields.io/npm/v/@miragon/event-storming-schema-model)](https://www.npmjs.com/package/@miragon/event-storming-schema-model)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/event-storming/LICENSE)

DOM-free Event Storming metamodel: types, Zod validation, schema migrations, and deterministic
JSON serialization.

A board is a set of stickies (domain events, commands, actors, aggregates, policies, read models,
external systems, hotspots, notes, freeform drawings) plus arrows between them. Positions are
element centers in board pixels on an unbounded free canvas.

## Install

```bash
npm install @miragon/event-storming-schema-model
```

## Usage

```ts
import {
  createEmptyBoard,
  serializeBoard,
  parseBoardJSON,
} from "@miragon/event-storming-schema-model";

const board = createEmptyBoard("Order Checkout");

const json = serializeBoard(board); // deterministic: stable key order, rounded coordinates
const restored = parseBoardJSON(json); // validated + migrated to the current schema
```

`parseBoardJSON` and `loadBoard` throw on a board that is not valid, and with an
`UndrawableBoardError` (element id, field, value) on one with a coordinate or size beyond ±1e38
(`LARGEST_DRAWABLE_NUMBER`), more than the canvas can draw: the same bound the `.storm` DSL applies.
`validateBoard` checks the structure only.

## Vocabulary

The names a board uses per sticky kind, to suggest established names and flag spelling variants.
Derived from the board, never stored.

```ts
import {
  collectVocabulary,
  normalizeLabel,
  spellingVariants,
  suggestLabels,
} from "@miragon/event-storming-schema-model";

const vocabulary = collectVocabulary(board.elements); // one term per kind and normalised name
spellingVariants(vocabulary); // the terms the board writes in more than one way
suggestLabels(vocabulary, "aggregate", "Ord"); // what to offer while "Ord" is typed
normalizeLabel("Orders") === normalizeLabel("order"); // true
```

- It covers `VOCABULARY_STICKY_KINDS` (all kinds but hotspots, notes and drawings).
- `normalizeLabel` makes two names one term when they differ only in case, whitespace, line
  breaks, punctuation or camel case, in simple English (`-s`, `-es`, `-ies`) or German (`-ungen`,
  `-heiten`, `-keiten`, `-schaften`, `-ionen`, `-täten`, `-innen`, `-nisse`) plurals, `ß`/`ss`,
  umlauts/`ae`, `-ize`/`-ise` or a doubled British `l`. Every other letter counts (`Room 1` vs
  `Room 11`, `Plan` vs `Plane`).
- A term's `label` is its most used spelling; `spellings` lists each spelling with its sticky ids.
- `suggestLabels` offers terms of one kind whose name or a later word starts with the typed text,
  prefix matches first, then by use, at most `DEFAULT_SUGGESTION_LIMIT` (8).
- `isPlaceholderLabel(kind, label)` recognises the names a new sticky gets (`PLACEHOLDER_LABELS`,
  with or without a number, of any kind, e.g. `Domain Event 2`); an empty label counts as one.
  Editors suggest none and `groupByAggregate` ignores them; `Insurance Policy` is a real name.

## Aggregates

`groupByAggregate` collects each aggregate, repeated along the timeline, with the commands it
handles and the events it leads to, read from the arrows (command → aggregate → event). Derived,
never stored.

```ts
import { groupByAggregate } from "@miragon/event-storming-schema-model";

for (const { aggregate, commands, events, pairs } of groupByAggregate(board)) {
  aggregate.label; // "Order", the spelling most of its stickies use
  aggregate.elementIds; // every "Order" sticky on the board, in timeline order
  commands; // the commands with an arrow into one of them, once per name
  events; // the events with an arrow from one of them, once per name
  pairs; // which command leads to which event: [{ command, event }]
}
```

- Aggregates whose names normalise alike form one group; aggregates with a placeholder or empty
  label form none.
- A command counts through an arrow into one of the group's aggregates, an event through an arrow
  out of one; other arrows and kinds are ignored. Each is listed once per name, so a command that
  reaches two aggregates is in both groups.
- A pair needs the same aggregate sticky between command and event, so repeated steps never mix.
- An aggregate without arrows is a group with empty lists. Only arrows join, not proximity.
- Groups, commands and events follow timeline order (`sortByTimeline`), ties by id code points, so
  the order is the same on every machine.

Part of the [Event Storming Modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/event-storming) in the [Miragon modeler suite](https://github.com/Miragon/modeler-suite).

## License

MIT
