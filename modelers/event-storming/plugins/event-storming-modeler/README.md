# Event Storming Modeler: Claude Code plugin

Two skills that teach Claude [Event Storming](https://www.eventstorming.com/) and the `.storm`
text format used by the [Event Storming Modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/event-storming).

| Skill            | What it covers                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event-storming` | Alberto Brandolini's method: the sticky grammar (actor → command → aggregate → domain event → policy → …), the three workshop levels, facilitation, and board reviews with colour-coded feedback notes.   |
| `storm-dsl`      | The `.storm` format itself: full grammar, the `(color …)` `(id …)` `(on …)` `(size …)` `(align …)` suffixes, coordinates and layout, per-level authoring rules, escaping, parser diagnostics, round-trip. |

Claude reads, reviews, edits and generates boards as plain text, in any repository.

## Install and use

```
/plugin marketplace add Miragon/modeler-suite
/plugin install event-storming-modeler@modeler-suite
```

From a local checkout, add `/path/to/modeler-suite` as the marketplace instead. The skills then
load on demand as `event-storming-modeler:event-storming` and `event-storming-modeler:storm-dsl`,
and trigger on their own ("Review this board", "Generate a `.storm` board for our checkout"), or
call one with `/event-storming-modeler:storm-dsl`.

## A `.storm` board in 30 seconds

```
title Order Checkout
level design
actor Customer [80, 300]
command Place Order [240, 300]
aggregate Order [440, 290]
event Order Placed [640, 300]
policy When order placed, ship it [840, 300]
Customer -> Place Order
Place Order -> Order
Order -> Order Placed
Order Placed -> When order placed, ship it
```

Open it in the [web editor](https://event-storming.modeler.miragon.io) or the
`miragon-gmbh.event-storming-modeler` VS Code extension, or parse it with
[`@miragon/event-storming-dsl`](https://www.npmjs.com/package/@miragon/event-storming-dsl).

## Development

The skills are plain markdown under `skills/`. After editing, validate them:

```bash
claude plugin validate modelers/event-storming/plugins/event-storming-modeler --strict   # from the repository root
claude plugin validate .                                               # the suite's marketplace
```

The `version` lives in `.claude-plugin/plugin.json` only (the marketplace entry carries none,
checked by `npm run test:plugin`); bump it when the skills change.

## License

MIT, see the [modeler's LICENSE](https://github.com/Miragon/modeler-suite/blob/main/modelers/event-storming/LICENSE).
