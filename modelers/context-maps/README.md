# Context Maps Modeler

[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](LICENSE)
[![CI](https://github.com/Miragon/modeler-suite/actions/workflows/ci.yml/badge.svg)](https://github.com/Miragon/modeler-suite/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@miragon/context-maps-renderer)](https://www.npmjs.com/package/@miragon/context-maps-renderer)
[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/miragon-gmbh.context-maps-modeler.svg)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.context-maps-modeler)

A free modeler for **Context Maps**, the strategic view of Domain-Driven Design: it shows which
parts of a business (bounded contexts) exist, how important each one is, and how the teams behind
them work together. Use it to agree on boundaries, spot risky dependencies and explain your
landscape to business and IT alike. It runs in the browser and in VS Code, works offline and needs
no account. Part of the [Miragon modeler suite](../../README.md).

**[Try the web app →](https://context-maps.modeler.miragon.io)** or install the
[VS Code extension](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.context-maps-modeler).

![In the Context Maps web app, the example opens and the User Access context is dragged down while its relationship follows](docs/demo.gif)

## What you can draw

**Bounded contexts** are boxes, coloured by how much they matter to the business:

| Type                 | Icon          | Meaning                                   |
| -------------------- | ------------- | ----------------------------------------- |
| Core Domain          | star          | Business-critical and differentiating.    |
| Supporting Subdomain | open hand     | Specialised, but not differentiating.     |
| Generic Subdomain    | dotted circle | Solved / off-the-shelf: buy, don't build. |

**Relationships** are lines that say how two contexts cooperate. A thicker line means more
coordination between the teams.

| Pattern             | Abbr. | Line                    | Direction    |
| ------------------- | ----- | ----------------------- | ------------ |
| Partnership         | P     | indigo, thick solid     | both ways    |
| Shared Kernel       | SK    | green, thick long-dash  | both ways    |
| Customer-Supplier   | C/S   | orange, dash-dot        | one way, U/D |
| Upstream-Downstream | U/D   | grey, thin solid        | one way, U/D |
| Separate Ways       | SW    | light grey, fine dotted | none         |

On one-way relationships the upstream side can offer an **Open Host Service (OHS)** and/or a
**Published Language (PL)**; the downstream side protects itself with an **Anticorruption Layer
(ACL)** or follows as a **Conformist (CF)**. The modeler checks thirteen rules of strategic DDD, most
adopted from [Context Mapper](https://contextmapper.org/), and shows what breaks them.

## Where to use it

- **[Web app](apps/webapp/README.md)**: open it, start from the example or a blank map, share a
  map as a link (nothing is uploaded), export PNG, SVG, JSON or Context Mapper CML.
- **[VS Code extension](apps/vscode/README.md)**: edit `.cm` / `.cm.json` files next to your code,
  with Git-friendly JSON, problems in the Problems view and editable PNG images (`*.cm.png`) for
  wikis and READMEs.
- **In your own app**: the npm packages
  [`@miragon/context-maps-renderer`](packages/renderer/README.md),
  [`@miragon/context-maps-schema-model`](packages/schema-model/README.md) and
  [`@miragon/context-maps-cml`](packages/cml).

## The file format

A `.cm.json` file is small, readable JSON: a list of contexts and the relationships between them.

```jsonc
{
  "version": 1,
  "title": "Conference event planner: context map",
  "contexts": [
    {
      "id": "ctx_cfp",
      "label": "CfP Management",
      "subdomainType": "core",
      "position": { "x": 340, "y": 120 },
      "size": { "width": 200, "height": 110 },
    },
  ],
  "relationships": [
    {
      "id": "rel_cfp_submission",
      "from": "ctx_cfp",
      "to": "ctx_submission",
      "pattern": "upstream-downstream",
      "upstreamRoles": ["OHS"],
      "downstreamRoles": ["ACL"],
    },
  ],
}
```

## Contributing

Building from source, tests and architecture: [CONTRIBUTING.md](CONTRIBUTING.md). Issues go to
[Miragon/modeler-suite](https://github.com/Miragon/modeler-suite/issues).

## Licence

MIT. "Context Maps" is a trademark of Context Maps Ltd; this is an independent, unaffiliated
tool that implements their openly published notation.
