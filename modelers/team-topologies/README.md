# Team Topologies Modeler

[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](LICENSE)
[![CI](https://github.com/Miragon/modeler-suite/actions/workflows/ci.yml/badge.svg)](https://github.com/Miragon/modeler-suite/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@miragon/team-topologies-renderer)](https://www.npmjs.com/package/@miragon/team-topologies-renderer)
[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/miragon-gmbh.team-topologies-modeler.svg?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.team-topologies-modeler)

Draw and share **Team Topologies** diagrams: the four team types and three interaction modes from
the book by Matthew Skelton & Manuel Pais. Use it to picture how your teams are organised today, to
discuss changes, and to keep the result as a file next to your code. Works in the browser and in
VS Code, offline.

**[Try the web app →](https://team-topologies.modeler.miragon.io)**

![In the Team Topologies web app, the example opens and a new platform team "Data Platform" is added from the palette](docs/demo.gif)

## Notation

Shapes, colours and stroke styles follow the official
[Team-Shape-Templates](https://github.com/TeamTopologies/Team-Shape-Templates). Team shapes are
**solid** (long-lived); interaction shapes are **dashed** (short-lived). Every element is distinguished by shape as well as colour, so
diagrams stay readable with colour-vision deficiency.

### Team types

| Type                  | Shape                        | Fill / Outline        |
| --------------------- | ---------------------------- | --------------------- |
| Stream-aligned        | horizontal rounded rectangle | `#FFEDB8` / `#FFD966` |
| Enabling              | vertical rounded rectangle   | `#DFBDCF` / `#D09CB7` |
| Complicated Subsystem | octagon                      | `#FFC08B` / `#E88814` |
| Platform              | square-cornered rectangle    | `#B7CDF1` / `#6D9EEB` |

### Interaction modes

| Mode           | Badge                                 | Fill / Outline        |
| -------------- | ------------------------------------- | --------------------- |
| Collaboration  | parallelogram                         | `#C6BEDF` / `#967EE2` |
| X-as-a-Service | triangle (points provider → consumer) | `#B4B4B4` / `#999696` |
| Facilitating   | circle                                | `#C9DFBE` / `#78996B` |

## Where to use it

- **[Web app](apps/webapp/README.md)** ([try it](https://team-topologies.modeler.miragon.io)):
  nothing to install; share a diagram as a link, export PNG, SVG or JSON.
- **[VS Code extension](apps/vscode/README.md)**: edit `.tt` / `.ttm.json` files graphically while
  the file stays plain JSON for Git and review. Editable `*.tt.png` pictures drop into a wiki or
  README and still open as diagrams.
- **In your own app**: the npm packages
  [`@miragon/team-topologies-renderer`](packages/renderer/README.md) (viewer and editor) and
  [`@miragon/team-topologies-schema-model`](packages/schema-model/README.md) (the file format).

## Document format

A `.tt` / `.ttm.json` file is small, stable JSON that diffs cleanly. Interactions are shapes placed
over the boundary between the teams they relate to, with no source/target reference:

```jsonc
{
  "version": 3,
  "title": "Online shop team topology",
  "nodes": [
    {
      "id": "team_checkout",
      "type": "stream-aligned",
      "label": "Checkout & Payments",
      "position": { "x": 560, "y": 202 },
      "size": { "width": 240, "height": 96 },
    },
  ],
  "interactions": [
    {
      "id": "int_platform_checkout",
      "mode": "x-as-a-service",
      "position": { "x": 636, "y": 286 },
      "size": { "width": 88, "height": 78 },
    },
  ],
  "flows": [],
  "annotations": [
    {
      "id": "ann_checkout_split",
      "text": "Splits into two stream-aligned teams in Q3",
      "position": { "x": 560, "y": 110 },
      "size": { "width": 200, "height": 64 },
      "attachedTo": "team_checkout",
    },
  ],
}
```

Annotations are optional notes; `attachedTo` ties one to a team, interaction or flow. Full format:
[`@miragon/team-topologies-schema-model`](packages/schema-model/README.md).

## Claude Code plugin

Two Claude skills let an agent design, review and edit diagrams in any project:

```
/plugin marketplace add Miragon/modeler-suite
/plugin install team-topologies-modeler@modeler-suite
```

`team-topologies` covers the method (team types, interaction modes, cognitive load, reviews);
`tt-format` the file format, a layout grid and a checker. Details in
[`plugins/team-topologies-modeler/`](plugins/team-topologies-modeler/README.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues go to
[Miragon/modeler-suite](https://github.com/Miragon/modeler-suite/issues).

## Licence

MIT. "Team Topologies" is a trademark of Team Topologies Ltd; this is an independent, unaffiliated
tool that implements their openly published notation.
