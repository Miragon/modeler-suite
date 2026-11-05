# Team Topologies Modeler: Claude Code plugin

Two skills that teach Claude [Team Topologies](https://teamtopologies.com/) and the `.tt` /
`.ttm.json` file format used by the
[Team Topologies Modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/team-topologies).

| Skill             | What it covers                                                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `team-topologies` | The method after Skelton & Pais: the four team types, the three interaction modes, cognitive load, fracture planes, designing a topology, and reviews with feedback annotations.                                                                 |
| `tt-format`       | The file format: every field, top-left coordinates, sizes, interactions as overlapping shapes, the upward X-as-a-Service triangle, stacking order, a layout grid (stream-aligned teams as stacked lanes, the platform below) and canonical form. |

`tt-format` ships a dependency-free checker (`scripts/check.mjs`, Node 18 or later) that validates
a file like the modeler does, spells out which teams each interaction connects, flags layout
mistakes and rewrites the file in canonical form, so Claude can check a diagram it cannot see.
Examples live in `skills/tt-format/examples/`.

## Install and use

```
/plugin marketplace add Miragon/modeler-suite
/plugin install team-topologies-modeler@modeler-suite
```

From a local checkout, add `/path/to/modeler-suite` as the marketplace instead. The skills load on
demand as `team-topologies-modeler:team-topologies` and `team-topologies-modeler:tt-format`, and
trigger on their own ("Draw a team topology for our product teams", "Review `org.tt`"), or call one
with `/team-topologies-modeler:tt-format`.

Open the result in the `miragon-gmbh.team-topologies-modeler` VS Code extension, in the
[web app](https://team-topologies.modeler.miragon.io) (Menu → Open…, or drop the file onto the page), or in designIQ.

## Development

The skills are plain markdown under `skills/`. After editing, validate them:

```bash
claude plugin validate modelers/team-topologies/plugins/team-topologies-modeler --strict   # from the repository root
claude plugin validate .                                               # the suite's marketplace
```

The checker hand-mirrors `@miragon/team-topologies-schema-model` (notation sizes, schema,
serializer). `packages/schema-model/src/plugin-check.sync.test.ts` fails as soon as the two diverge,
so `npm test` catches drift. The `version` lives in `.claude-plugin/plugin.json` only (checked by
`npm run test:plugin`); how a release bumps it is in
[docs/ci-and-releases.md](https://github.com/Miragon/modeler-suite/blob/main/docs/ci-and-releases.md).

## License

MIT. See the [modeler's LICENSE](https://github.com/Miragon/modeler-suite/blob/main/modelers/team-topologies/LICENSE).
