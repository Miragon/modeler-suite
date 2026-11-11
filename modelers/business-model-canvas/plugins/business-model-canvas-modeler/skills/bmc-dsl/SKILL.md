---
name: bmc-dsl
description: >-
  The `.bmc` file format of the Business Model Canvas Modeler: a YAML map with `version`,
  `canvas` (its title and notes) and the nine building blocks, each holding `items` (id, text,
  color, notes) and block `notes`, plus quoting, parser diagnostics, the canonical form and the
  round-trip guarantee. Use when reading, writing, editing or validating a `.bmc` file or canvas
  text; for the Business Model Canvas method and reviews use the `business-model-canvas` skill.
---

# The `.bmc` format

`.bmc` is the file of a Business Model Canvas. The Business Model Canvas Modeler (the VS Code
extension `miragon-gmbh.business-model-canvas-modeler`, its Orca plugin and its web app) draws it
as the canvas and writes every canvas edit back into the file. The file is YAML: one field per
building block, holding a list of `items`, each with an `id` and a `text`.

Three properties make it safe to generate and edit:

- Fields the modeler does not know survive. A field such as `x-owner: sales` stays and comes back
  on save, after the known fields. Numbers such as `.inf` and `.nan` and values nested deeper than
  32 levels are refused, since they could not come back as they were.
- Serializing is deterministic and a fixed point. `parse → serialize → parse → serialize` gives
  the same text, so text you write in the canonical form is exactly what the modeler writes back.
- Comments do not survive. The canvas writes the whole file from what it shows, so a `# comment`
  is gone after the first canvas edit, and the parser warns about each one. A remark belongs in a
  note.

Scope: this skill is about the **format**. What belongs in which block, and how to review a
canvas, is the `business-model-canvas` skill's job.

## A canvas on one page

```bmc
version: 1
canvas:
  title: Neighbourhood bakery
  notes:
    - text: "Risk: the cafés make up half the revenue; test the delivery round first"
customer-segments:
  items:
    - id: commuters
      text: Commuters on the way to work
      color: sky
    - id: cafes
      text: Cafés that buy wholesale
      color: peach
value-propositions:
  items:
    - id: bread-before-7
      text: Fresh bread before 7 am
      color: sky
    - id: daily-delivery
      text: Daily delivery, no minimum order
      color: peach
      notes:
        - text: "Assumption: the delivery round pays off below ten cafés"
channels:
  items:
    - id: station-shop
      text: Shop at the train station
      color: sky
    - id: delivery-van
      text: Delivery van
      color: peach
customer-relationships:
  items:
    - id: loyalty-card
      text: Loyalty card
      color: sky
    - id: standing-order
      text: Weekly standing order
      color: peach
revenue-streams:
  items:
    - id: counter-sales
      text: Counter sales
      color: sky
    - id: invoices
      text: "Monthly invoices: net 30"
      color: peach
key-resources:
  items:
    - id: ovens
      text: Bakery and ovens
    - id: bakers
      text: Trained bakers
key-activities:
  items:
    - id: night-baking
      text: Baking at night
    - id: delivery-round
      text: Delivery round
key-partners:
  items:
    - id: mill
      text: Organic mill
  notes:
    - text: The contract with the mill renews every spring
cost-structure:
  items:
    - id: rent
      text: Rent and energy
    - id: wages
      text: Wages
  notes:
    - text: Night shifts drive most of the wages
```

## The root

The file is one YAML map.

| Field     | Value                                                             |
| --------- | ----------------------------------------------------------------- |
| `version` | The format version, the number `1`. The modeler always writes it. |
| `canvas`  | The canvas title and the canvas's notes, see below.               |
| block id  | One of the nine building blocks, see below.                       |
| other     | Kept with its value, written after the blocks, with a warning.    |

A blank file is an empty canvas. Text that is no YAML, a root that is no map and another
`version` (`version: "1"`, as text, is another version too) are errors: the modeler does not open
the text until it is fixed. A key written twice in one map is an error as well, also when YAML
reads both as one (`1:` and `"1":`). A text longer than 1,048,576 characters does not open.

The format is plain data, so YAML's anchors (`&name`), aliases (`*name`), tags (`!tag`) and keys
that are lists or maps are errors. JSON is YAML too: a `.bmc` written as JSON opens, and the first
canvas edit writes it as YAML.

## The canvas fields

| Field   | Meaning                                                        |
| ------- | -------------------------------------------------------------- |
| `title` | The canvas title in the header band. Absent: "Untitled canvas" |
| `notes` | Notes on the canvas as a whole, see [Notes](#notes)            |

`title` is text. A value YAML reads as a number or as `true`/`false` (`title: 2026`, `title: true`)
is taken as it is written (`title: 1.50` stays "1.50") and written back quoted
(`title: "2026"`), so quote it from the start. An empty value (`title:`), `null`, a list or a map
is an error. Other fields (`x-owner: sales`) are kept with any value, but the canvas shows only
`title` and `notes`: write no others.

## Blocks

One root field per building block, by its kebab id. Its value is a map with `items` and `notes`,
both optional; an empty block is `{}`.

| Field                    | Title on the canvas    |
| ------------------------ | ---------------------- |
| `key-partners`           | Key Partners           |
| `key-activities`         | Key Activities         |
| `key-resources`          | Key Resources          |
| `value-propositions`     | Value Propositions     |
| `customer-relationships` | Customer Relationships |
| `channels`               | Channels               |
| `customer-segments`      | Customer Segments      |
| `cost-structure`         | Cost Structure         |
| `revenue-streams`        | Revenue Streams        |

- Blocks may be missing; the canvas always draws all nine. The modeler writes the blocks in the
  method's order: customer-segments, value-propositions, channels, customer-relationships,
  revenue-streams, key-resources, key-activities, key-partners, cost-structure.
- A root field that names no building block (`risks`) is kept, the canvas does not draw it, and
  it warns. So does a field of a block other than `items` and `notes`.

## Items

Each entry of `items` is one sticky. The order of the list is the order on the canvas: stickies
flow left to right, row by row, inside their block. Put the most important first. There are no
coordinates; dragging a sticky on the canvas changes its block and its place in the file.

| Field   | Value                                     | Meaning                                                                  |
| ------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| `id`    | `[A-Za-z0-9][A-Za-z0-9_-]*`, **required** | The sticky's stable id, unique in the file.                              |
| `text`  | text, **required**                        | What the sticky says. The canvas shows the first lines.                  |
| `color` | a palette name, `"#RGB"` or `"#RRGGBB"`   | A strip of tape across the sticky's top edge. The paper stays white.     |
| `notes` | a list of notes, see below                | Review feedback and remarks on this sticky.                              |
| other   | any value                                 | Kept, written after the known fields, sorted by name (`x-owner: sales`). |

The palette, in the order the canvas offers it, in lower case: `sky`, `peach`, `lagoon`, `lilac`,
`sun`, `rose`, `clay`, `mint`. A hex colour needs quotes, `color: "#F6C8B8"`: unquoted, the `#`
starts a comment, the sticky has no colour and the modeler warns.

What a colour means is the team's to decide: a customer segment, a theme, an owner. The format
links nothing; the authoring rules below give the common convention.

- An item that is no map, without an `id` or a `text`, with an id outside the pattern (or one such
  as `constructor`), and two items with the same id are errors: the modeler does not open the
  text. An id or a text YAML reads as a number (`id: 7`, `text: 2026`) is taken as it is written
  and written back quoted.
- A `color` that is neither a palette name nor a hex colour is kept and warns.
- A text with line breaks is a block: `text: |-` and the lines below it, indented two spaces
  further.

### Ids

Ids are yours to choose: short, lower case, words joined by `-`, from the meaning rather than the
whole text (`daily-delivery`, not `daily-delivery-no-minimum-order`). An id never changes when the
text does, so an edit merged from elsewhere still finds its sticky after a rewording. Two stickies
may have the same text, never the same id. A sticky created on the canvas gets a generated id such
as `sticky_k3x9q2mf`.

## Texts and quotes

Most texts need no quotes: `text: Daily delivery, no minimum order`. Quote a text in double
quotes when YAML would read it as something else:

- it holds a colon and a space, or ends with a colon: `text: "Monthly invoices: net 30"`;
- it holds a space and a `#`, or starts with `#`: `text: "Shop #1"` (unquoted, the rest is a
  comment);
- it starts with `- `, `? `, `[`, `]`, `{`, `}`, `,`, `*`, `&`, `!`, `|`, `>`, `%`, `@`, `` ` ``,
  `"` or `'`;
- it is `null`, `Null`, `NULL`, `~` or empty (else it is no text, an error), `true` or `false`, or
  a number such as `2026` or `1.50`;
- it starts or ends with a space.

Inside double quotes write `\"` for a quote and `\\` for a backslash. When in doubt, quote: a
quoted text is always read as it is. The modeler quotes only where YAML needs it, and takes single
quotes around a text that holds a double quote (`text: 'Say "hi" #1'`).

## Notes

```yaml
notes:
  - text: "Assumption: the delivery round pays off below ten cafés"
  - text: The contract with the mill renews every spring
```

A note is a `text`: a remark, a doubt, an assumption to test or review feedback. Every note looks
alike on the canvas, so the text says what it is (`"Assumption: …"`); the `business-model-canvas`
skill words review notes. Other fields of a note stay. It belongs to what holds the `notes` list:

- `notes` of an **item** belong to that sticky; the canvas folds the sticky's bottom right corner
  and shows the notes on hover.
- `notes` of a **block** (next to its `items`) belong to the block as a whole. They are not drawn
  in the block: the comment at the end of its heading shows how many there are and the notes on
  hover.
- `notes` of **`canvas`** (after its `title`) belong to the canvas as a whole: findings about the
  business model overall rather than one block. The comment after the canvas title shows them.

In the modeler, all of them are read and written in the **Notes** panel; the comments stay out of
every export.

A note without a text is an error. Whatever you would write as a `#` comment belongs in a note.

## The canonical form

What the modeler writes, and what you should write:

- Two spaces of indentation, every field on a line of its own, list entries as `- `, no line
  folded however long, and a final line break. Quotes only where YAML needs them, as above.
- The root: `version`, `canvas`, the blocks in the method's order, then the fields the canvas does
  not know, sorted by name.
- `canvas`: `title`, `notes`, then other fields sorted by name.
- A block: `items`, then `notes`; an item: `id`, `text`, `color`, `notes`; a note: `text`;
  each followed by its other fields sorted by name. An unknown colour keeps its place among the
  known fields. Empty lists and an empty `canvas` are left out. An empty
  canvas is an empty file.

Text that is not canonical (other spacing, other field order, blocks in another order, JSON) opens
fine; opening alone changes nothing, and the first canvas edit writes it in the canonical form.

## Diagnostics

The parser reports each finding with the place it is about: a path into the file, shown as
`channels.items[2].id: Duplicate sticky id "shop", also at channels.items[0].`, and the range of
the text it covers. VS Code's Problems view marks that range. A finding about the text as a whole
(a syntax error, a comment) has no path.

Errors (the text does not open):

| Where                 | Message                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------- |
| the text              | `The text is no YAML: …` (a bad indent, a tab, an open `[` or quote)                      |
| the text              | `The key "<key>" is written twice.`                                                       |
| the text              | `A canvas text is at most 1,048,576 characters.`                                          |
| the text              | `Nests deeper than 32 levels.` (flow lists or maps, before anything is read)              |
| the text              | `A canvas is a YAML map: version: 1, canvas: { … }, then the building blocks.`            |
| the text              | `Anchors such as &<name> are no part of the format.` (also `Aliases such as *<name>`)     |
| the text              | `Tags such as <tag> are no part of the format.` (`!x` as `!x`, `!!str` in full)           |
| the text              | `A key is a word, not a list or a map.`                                                   |
|                       | Of repeated keys, list or map keys, anchors, aliases and tags only one is reported, of    |
|                       | syntax errors only the first.                                                             |
| `version`             | `The modeler reads version: 1, not <value>.`                                              |
| `canvas`              | `A map of text fields, such as title: Shop.`                                              |
| `canvas.title`        | `Text: title: ….` (a title that is no text)                                               |
| `<block>`             | `A block is a map: { items: [{ id: shop, text: Shop }] }.`                                |
| `<block>.items`       | `A list of items: [{ id: shop, text: Shop }].`                                            |
| `<block>.items[n]`    | `An item is a map: { id: shop, text: Shop }.`                                             |
| `<block>.items[n]`    | `An item needs an id as text: id: shop.`                                                  |
| `<block>.items[n]`    | `An item needs a text: text: ….`                                                          |
| `<block>.items[n].id` | `"<id>" is no usable id: letters, digits, - and _.`                                       |
| `<block>.items[n].id` | `Duplicate sticky id "<id>", also at <block>.items[m].`                                   |
| `….notes`             | `A list of notes: [{ text: … }].`                                                         |
|                       | (`canvas.notes`, `<block>.notes` or `<block>.items[n].notes`)                             |
| `….notes[n]`          | `A note is { text: … }.`                                                                  |
| a field kept unread   | `A number the canvas cannot keep, such as .inf or .nan.` / `Nests deeper than 32 levels.` |

Warnings (kept as they are):

| Where                    | Message                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| the text                 | `Comments are not kept when the canvas saves; write a note instead.`               |
| `<field>`                | `No building block of the canvas; kept as it is.`                                  |
| `<block>.<field>`        | `No field of a block (items, notes); kept as it is.`                               |
| `<block>.items[n].color` | `<value> is no palette colour, #RGB or #RRGGBB; kept as it is.` (a text in quotes) |
| `<block>.items[n].color` | `No colour. A hex colour needs quotes, # starts a comment: color: "#RRGGBB".`      |

Fields the canvas does not know inside `canvas`, an item or a note stay without a warning.

## Authoring rules

- Start a new file with `version: 1` and a `canvas` with a `title`. Leave authors, dates and
  versions to Git; write today's model and a planned one as two files.
- Write the blocks in the method's order (customer-segments first).
- One idea per sticky, a few words. The canvas cuts longer text with an ellipsis.
- Give every item an id. Use `color` for one convention across the canvas, such as one palette
  colour per customer segment, given to the segment and to every sticky that serves only that
  segment. A sticky has one colour; one that serves several segments stays without.
- Write a doubt or an assumption still to test as a note on its sticky
  (`text: "Assumption: …"`), not in the sticky's text.
- Never write `#` comments: the canvas drops them on its next save. Write a note instead.
- When editing a file, change only the entries you mean to change; unknown fields must survive.
- Before handing a file over, read it back against this page: valid YAML (spaces, never tabs,
  two per level), no comments, texts quoted where they need it, every item with an id and a text,
  ids unique, no canvas field but `title` and `notes`.

The licence of the canvas itself (it is by Strategyzer AG, CC BY-SA 3.0) and what each block means
are in the `business-model-canvas` skill.
