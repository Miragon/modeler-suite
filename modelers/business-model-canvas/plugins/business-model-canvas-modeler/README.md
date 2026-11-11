# Business Model Canvas Modeler: Claude Code plugin

Two skills that teach Claude the Business Model Canvas and the `.bmc` text format used by the
[Business Model Canvas Modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/business-model-canvas).

| Skill                   | What it covers                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `business-model-canvas` | The method in Miragon's own words: the nine building blocks, colour as a team convention, assumptions to test, creating a canvas, reviews with notes.     |
| `bmc-dsl`               | The `.bmc` format itself: YAML with the canvas title and notes, blocks, items with `id`, `text`, `color` and `notes`, parser diagnostics, the round-trip. |

Claude reads, reviews, edits and generates canvases as plain text, in any repository.

The Business Model Canvas is by Strategyzer AG, strategyzer.com, licensed under CC BY-SA 3.0. The
skills explain it in their own words; they reproduce neither its official guiding questions nor
its icons, and leave the Value Proposition Canvas out.

## Install and use

```
/plugin marketplace add Miragon/modeler-suite
/plugin install business-model-canvas-modeler@modeler-suite
```

From a local checkout, add `/path/to/modeler-suite` as the marketplace instead. The skills then
load on demand as `business-model-canvas-modeler:business-model-canvas` and
`business-model-canvas-modeler:bmc-dsl`, and trigger on their own ("Review this canvas", "Write a
business model canvas for our bakery").

## A `.bmc` canvas in 30 seconds

```bmc
version: 1
canvas:
  title: Neighbourhood bakery
customer-segments:
  items:
    - id: commuters
      text: Commuters on the way to work
      color: sky
value-propositions:
  items:
    - id: bread-before-7
      text: Fresh bread before 7 am
      color: sky
revenue-streams:
  items:
    - id: counter-sales
      text: Counter sales
      color: sky
```

Open it in the `miragon-gmbh.business-model-canvas-modeler` VS Code extension, its Orca plugin or
its web app.

## Development

The skills are plain Markdown under `skills/`. Every `bmc` code block in them must parse without
findings and be canonical (`packages/dsl/test/skills.test.ts`, `npm run business-model-canvas test`).
After editing, validate them:

```bash
claude plugin validate modelers/business-model-canvas/plugins/business-model-canvas-modeler --strict   # from the repository root
claude plugin validate .                                                                             # the suite's marketplace
```

The `version` lives in `.claude-plugin/plugin.json` only (the marketplace entry carries none,
checked by `npm run test:plugin`); bump it when the skills change.

## License

MIT, see the [modeler's LICENSE](https://github.com/Miragon/modeler-suite/blob/main/modelers/business-model-canvas/LICENSE).
