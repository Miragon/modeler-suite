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

The names a board uses, per sticky kind, so that an editor can suggest an established name and
point at names spelled more than one way. It is derived from the board every time and never
stored, so the schema and the `.storm` DSL stay as they are.

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

- The vocabulary covers the kinds in `VOCABULARY_STICKY_KINDS`: domain events, commands, actors,
  aggregates, policies, read models and external systems. Hotspots and notes are free text.
- Two names are the same term when `normalizeLabel` gives them one key. It ignores case,
  whitespace, line breaks, punctuation and camel case (`OrderPlaced`, `order placed`). It reads
  simple plurals as their singular: English `-s`, `-es` and `-ies`, and the German endings
  `-ungen`, `-heiten`, `-keiten`, `-schaften`, `-ionen`, `-täten`, `-innen` and `-nisse`. It also
  reads `ß` as `ss`, `ä`, `ö`, `ü` as `ae`, `oe`, `ue`, American `-ize` as `-ise` and the British
  doubled `l` as single (`cancelled`, `canceled`; `modelling`, `modeling`). Every other letter
  counts: digits as written, so `Room 1` and `Room 11` stay apart, and a final `e` or a doubled
  letter of the word itself, so `Plan` and `Plane`, `Akt` and `Akte` or `Filled` and `Filed` are
  different names. A final `e` drops only where an `-es` plural would keep it, after `s`, `x`,
  `z`, `ch`, `sh` and in `-ies`, in the singular too (`Purchase`, `Purchases`).
- A term's `label` is the spelling most of its stickies use (on a tie, the one met first), and
  `spellings` lists every spelling with the ids of the stickies that write it.
- `suggestLabels` offers the terms of one kind whose name, or one of its later words, starts with
  what is typed, the matches at the start first, then the most used, at most
  `DEFAULT_SUGGESTION_LIMIT` (8). The last word counts as written so far, so `Pay` finds
  `Payment Received`.
- `isPlaceholderLabel(kind, label)` knows the names a new sticky gets until it is renamed: any
  entry of `PLACEHOLDER_LABELS` with or without a number (`Domain Event`, `Domain Event 2`), on a
  sticky of any kind, since a sticky keeps its label when its kind changes (an aggregate still
  called `Domain Event` names nothing either). An editor offers no such name and
  `groupByAggregate` counts no such aggregate, also where a board means it as a domain name (an
  aggregate called `Policy`); a more specific name (`Insurance Policy`) counts. It reads the label
  as a `.storm` file stores it: trimmed, and an empty one as the placeholder the file writes in its
  place. Notes and drawings have no placeholder.

## Aggregates

Each aggregate of a board with the commands it handles and the domain events it leads to, read
from the arrows of a design-level board (command → aggregate → event). "Repeat, never reuse" puts
an aggregate on the timeline once per step; `groupByAggregate` brings its behaviour back together.
Like the vocabulary, it is derived from the board every time and never stored.

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

- Aggregates whose names `normalizeLabel` reads alike form one group (`Order`, `order`, `Orders`).
- An aggregate whose label is still a placeholder of any sticky kind (`Aggregate`, `Aggregate 2`,
  or `Domain Event` on a sticky retyped to an aggregate: `isPlaceholderLabel`) forms no group, so
  commands and events that reach only such aggregates are in no group either. That holds for an
  aggregate called `Policy` too, while `Policies` and `Insurance Policy` form groups. An empty
  aggregate is one too, as the file stores it as `Aggregate`.
- A command counts through an arrow into one of the group's aggregates, an event through an arrow
  out of one. Arrows the other way, a command's arrow straight to an event, and policies, read
  models, actors, external systems, hotspots and notes leave the groups as they are.
- Commands and events are listed once per name, with every sticky of that name an arrow joins to
  the group, so a command that reaches two aggregates is in both groups.
- A pair needs one and the same aggregate sticky: an arrow from the command into it and one from
  it to the event. Two steps that repeat the aggregate never pair the command of one with the event
  of the other.
- An aggregate without arrows is a group with empty lists; commands and events that reach no
  aggregate are in no group. Only the arrows join a sticky to an aggregate; how near it stands
  does not.
- A label without a word (`?`; an empty command or event) names nothing: such a sticky groups with
  no other, and its `key` is empty.
- Groups follow their first aggregate on the timeline (left to right, then top to bottom, as in
  `sortByTimeline`), commands and events do the same within a group. Stickies on exactly the same
  spot follow their ids in the runtime's locale, unlike in `sortByTimeline`: this order only
  reaches the screen, never a file.

Part of the [Event Storming Modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/event-storming) in the [Miragon modeler suite](https://github.com/Miragon/modeler-suite).

## License

MIT
