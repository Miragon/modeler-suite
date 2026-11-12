# Miragon Modeler Collection

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/miragon-gmbh.miragon-modeler-collection.svg?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.miragon-modeler-collection)
[![Open VSX](https://img.shields.io/open-vsx/v/miragon-gmbh/miragon-modeler-collection?label=Open%20VSX)](https://open-vsx.org/extension/miragon-gmbh/miragon-modeler-collection)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/LICENSE)

Nine modelers for the diagrams teams use to think about their business and their software, in one
install: from the business model and strategy down to processes and the domain. Each diagram is a
plain file in your repository, so it shows up as a readable diff and evolves with the code it
describes.

Free and open source, and no account needed.

![The web apps of Wardley Maps, Event Storming, Team Topologies, Context Maps and Value Chain open their built-in examples one after another](/docs/assets/demo.gif)

## Get started

1. Install the pack. VS Code installs the nine modelers with it.
2. Open the walkthrough **Get Started with the Miragon Modeler Collection**. It shows each modeler
   and opens its own tutorial.
3. Or open any of the files below: each one opens on a canvas.

## What's inside

Ordered from the strategic lens down to the concrete domain:

| Modeler                                                                                                                 | For                                                                         | Files              |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------ |
| [Business Model Canvas](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.business-model-canvas-modeler) | business model: how it creates, delivers and captures value                 | `.bmc`             |
| [Wardley Maps](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.wardley-mapping-modeler)                | strategy: what users need and how mature each part is                       | `.wmap`, `.owm`    |
| [Team Topologies](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.team-topologies-modeler)             | organisation: team types and how teams interact                             | `.tt`, `.ttm.json` |
| [Context Maps](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.context-maps-modeler)                   | strategic DDD: bounded contexts and their relationships                     | `.cm`, `.cm.json`  |
| [C4 model](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.c4-modeler)                                 | software architecture: systems, containers and components (Structurizr DSL) | `.c4`, `.dsl`      |
| [Value Chain](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.value-chain-modeler)                     | process landscape: the value-adding steps and who owns them                 | `.vc`, `.vc.json`  |
| [BPMN](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler)                           | processes: BPMN 2.0 diagrams and DMN decisions                              | `.bpmn`, `.dmn`    |
| [Event Storming](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.event-storming-modeler)               | discovery: domain events on a timeline                                      | `.storm`           |
| [Egon.io](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.egon-vscode-extension)                       | domain: domain stories in the words of the people who live them             | `.egn`             |

Every modeler is also an extension of its own, with its own releases. The pack installs the
current family in one go.

## Diagrams written by an AI agent

Every diagram is a text file, so a coding agent can write it, and the canvas redraws when the file
changes. For Claude Code, plugins teach the methods and the formats of Wardley Maps, Event Storming,
Team Topologies and the Business Model Canvas:

```text
/plugin marketplace add Miragon/modeler-suite
/plugin install wardley-maps-modeler@modeler-suite
```

## Good to know

- Needs VS Code 1.96 or later on the desktop.
- Most modelers also run in the browser and in [Orca](https://github.com/Miragon/orca-plugins),
  next to your coding agent. See the [Miragon modeler suite](https://github.com/Miragon/modeler-suite).

## Links

[Changelog](https://github.com/Miragon/modeler-suite/blob/main/extensions/modeler-collection/CHANGELOG.md)
·
[Report an issue](https://github.com/Miragon/modeler-suite/issues)
·
[Source](https://github.com/Miragon/modeler-suite/tree/main/extensions/modeler-collection)

Made by [Miragon](https://www.miragon.io). MIT licence.
