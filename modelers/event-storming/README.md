# Event Storming Modeler

[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](LICENSE)
[![CI](https://github.com/Miragon/modeler-suite/actions/workflows/ci.yml/badge.svg)](https://github.com/Miragon/modeler-suite/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@miragon/event-storming-renderer)](https://www.npmjs.com/package/@miragon/event-storming-renderer)
[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/miragon-gmbh.event-storming-modeler.svg?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.event-storming-modeler)

Create, edit and embed digital [Event Storming](https://www.eventstorming.com/) boards: a
TypeScript library, a VS Code extension, and a web app, all built on
[diagram-js](https://github.com/bpmn-io/diagram-js).

**[Try the web app →](https://event-storming.modeler.miragon.io)**

![In the Event Storming web app, the example board opens and a new domain event "Payment captured" is placed and named](docs/demo.gif)

## What you get

- **A graphical board** of sticky notes on a timeline: place, connect, recolour and label
  stickies, with undo and redo.
- **Plain text underneath:** boards are `.storm` files, so they diff, review and version in Git.
- **[VS Code extension](apps/vscode)** for `.storm` files, and a **[web app](apps/webapp)** with
  share links and PNG/SVG export.
- **A TypeScript library** to embed boards in your own app (see [Use it in your app](#use-it-in-your-app)).

### Sticky notes

| Sticky          | DSL keyword | Default size | Fill      |
| --------------- | ----------- | ------------ | --------- |
| Domain Event    | `event`     | 130×90       | `#FFB84D` |
| Command         | `command`   | 130×90       | `#7EC8F0` |
| Actor           | `actor`     | 100×65       | `#FFF9B1` |
| Aggregate       | `aggregate` | 180×110      | `#FFE066` |
| Policy          | `policy`    | 180×110      | `#C9A0DC` |
| Read Model      | `readmodel` | 130×90       | `#A8D08D` |
| External System | `external`  | 180×110      | `#F4A6C0` |
| Hotspot         | `hotspot`   | 130×90       | `#E85D75` |
| Note            | `note`      | auto         | `#ECECEC` |

Plus freeform **drawings** (`line`) and labelled **arrows** (`->`) between stickies. Every sticky
accepts an optional `(color #hex)` override.

## Editor interactions

| Action                     | How                                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-select (lasso)       | Palette tool, `L`, or `Shift` + drag on the empty canvas                                                                                                                                        |
| Draw lines/shapes          | Palette tool, click point by point; click the last point again (or double-click/`Enter`/`Esc`) to finish, click the start point to close; drag the handles of a selected drawing to move points |
| Quick create at the cursor | `E` domain event, `C` command                                                                                                                                                                   |
| Add to selection           | `Shift` + click on elements                                                                                                                                                                     |
| Copy / paste               | `Ctrl/Cmd+C`, `Ctrl/Cmd+V`: paste attaches to the cursor; click places, `Esc` cancels                                                                                                           |
| Duplicate (in place)       | `Ctrl/Cmd+D`                                                                                                                                                                                    |
| Nudge selection            | Arrow keys (`Shift` = coarse)                                                                                                                                                                   |
| Undo / redo                | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` (in VS Code the document's own undo); in the web app `Ctrl/Cmd+Z` also takes back a replaced board while the canvas has nothing else to undo                  |
| Zoom                       | `Ctrl/Cmd` + `+` / `-`, `Ctrl/Cmd+0` sets 100%, `Shift+1` fits; controls bottom-right                                                                                                           |
| Open / save (web app)      | `Ctrl/Cmd+O` (or "Open a file…" on the start screen) opens a `.storm`, `.json` or `.txt` file, `Ctrl/Cmd+S` downloads the `.storm` file; a file dropped anywhere on the page opens              |
| All shortcuts              | Menu → "Keyboard shortcuts…"                                                                                                                                                                    |
| Edit label                 | Double-click a sticky (`Cmd/Ctrl+Enter` saves)                                                                                                                                                  |
| Label suggestions          | While typing, a list offers the names the board already uses for that kind of sticky; `↓`/`↑` move, `Tab` (or `Enter` on the active one) takes one, `Esc` closes the list                       |
| Unify spelling             | A dot on a sticky's corner marks a name the board spells several ways (`Order`, `order`, `Orders`); context pad → "Unify spelling" gives them all the selected sticky's spelling, one undo step |
| Aggregates                 | Menu → "Aggregates…" (while the board has a named one): each aggregate once, with the commands that lead into it and the events that follow, by the arrows; a name selects its stickies         |
| Format a note              | Bold/italic/bullets via the floating toolbar or `Cmd/Ctrl+B` / `Cmd/Ctrl+I`, text alignment via the toolbar's align buttons; stored as a tiny Markdown subset in the label                      |
| Append sticky              | Context pad `+` drags a blank sticky; pick the type in the popup that opens, then label it                                                                                                      |
| Change sticky type         | Context pad → change-type popup                                                                                                                                                                 |
| Type captions on/off       | Menu → "Type captions" (small kind caption at the bottom of every sticky; per-client view preference)                                                                                           |
| Recolor a drawing          | Context pad → color picker (stickies and notes keep their notation colors)                                                                                                                      |

## Use it in your app

```bash
npm install @miragon/event-storming-renderer
```

```ts
import { NavigatedViewer } from "@miragon/event-storming-renderer";
import "@miragon/event-storming-renderer/assets/event-storming.css";

const viewer = new NavigatedViewer({ container: document.querySelector("#canvas")! });

await viewer.importDSL(`title Order Checkout
actor Customer [80, 300]
command Place Order [240, 300]
aggregate Order [420, 290]
event Order Placed [620, 300]
Customer -> Place Order
Place Order -> Order
Order -> Order Placed`);

const board = viewer.exportMap(); // canonical JSON model
const dsl = viewer.exportDSL(); // back to .storm text
const { svg } = await viewer.saveSVG();
```

## The `.storm` DSL

`<kind> <Name> [x, y]` places a sticky (pixel coordinates of its centre), `A -> B` connects two
stickies by name (optional label after `;`), and unknown lines survive round-trips. An optional
`level big-picture|process|design` line records the workshop level and limits which kinds the editor
offers (default `design`, everything). `(on <Host Name>)` pins an actor, hotspot or note onto a
sticky so it moves with it:

Further suffixes: `(size <w>x<h>)` for a resized note, and `(id …)` with `#id` references when two
stickies share a label. Full grammar in [`@miragon/event-storming-dsl`](packages/dsl).

The full example, [`example/order-checkout.storm`](example/order-checkout.storm):

```
title Order Checkout

actor Customer [80, 300]
command Place Order [240, 300]
aggregate Order [420, 290] (id agg_order)
event Order Placed [620, 300]
policy When order placed, ship it [800, 300]
command Ship Order [980, 300]
aggregate Order [1160, 290] (id agg_order_2)
event Order Shipped [1340, 300]
readmodel Order Status [620, 120]
external Payment Provider [420, 520]
hotspot Double payment on retry? [620, 520]
note Design-level session: checkout flow [80, 80]

Customer -> Place Order
Place Order -> #agg_order
Place Order -> Payment Provider
#agg_order -> Order Placed
Order Placed -> Order Status
Order Placed -> When order placed, ship it
When order placed, ship it -> Ship Order
Ship Order -> #agg_order_2
#agg_order_2 -> Order Shipped
```

## Packages

| Package                                                         | Description                                                          |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`@miragon/event-storming-schema-model`](packages/schema-model) | Board metamodel, Zod validation, deterministic JSON (DOM-free)       |
| [`@miragon/event-storming-dsl`](packages/dsl)                   | `.storm` text DSL ↔ model, lossless round-trip (DOM-free)            |
| [`@miragon/event-storming-transforms`](packages/transforms)     | Pure `EventStormingBoard → EventStormingBoard` transforms (DOM-free) |
| [`@miragon/event-storming-renderer`](packages/renderer)         | diagram-js renderer, viewer, import/export                           |
| [`apps/webapp`](apps/webapp)                                    | Web editor (demo, deployed on Netlify)                               |
| [`apps/vscode`](apps/vscode)                                    | VS Code extension for `.storm`                                       |

## Claude Code plugin

Two Claude skills let Claude read, review, edit and generate boards in any project:

```
/plugin marketplace add Miragon/modeler-suite
/plugin install event-storming-modeler@modeler-suite
```

| Skill            | Covers                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `event-storming` | Brandolini's method: sticky grammar, the three workshop levels, facilitation, board reviews            |
| `storm-dsl`      | The `.storm` format: grammar, suffixes, coordinates and layout, per-level authoring rules, diagnostics |

Details in [`plugins/event-storming-modeler/`](plugins/event-storming-modeler/).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues go to
[Miragon/modeler-suite](https://github.com/Miragon/modeler-suite/issues).

## Acknowledgements

Based on the [Wardley Maps Modeler](../wardley-maps/README.md).

## License

[MIT](LICENSE)
