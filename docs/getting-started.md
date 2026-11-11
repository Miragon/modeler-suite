# Getting started

The Miragon Modeler Suite draws Wardley Maps, Event Storming boards, team topologies, context maps, value chains, C4 models and business model canvases on a canvas, and saves each one as a plain-text file you keep in your repository.

## Why your diagrams belong next to your code

A Wardley map on a whiteboard photo or a team topology in a slide deck goes stale the day after the workshop. Nobody reviews it, nobody sees what changed, and your coding agent never finds it. As a text file in your repository, a diagram works like code:

- **Your AI gets the context.** Your coding agent reads the strategy, domains and architecture behind the code, and can draft or update a diagram itself. In [Orca](https://www.onorca.dev) you watch its edits appear on the canvas.
- **Changes you can review.** A pull request shows what moved, line by line, next to the code change that caused it.
- **History for free.** Git versions every diagram on the same branch as the code it describes.
- **No lock-in.** Open formats such as OWM, Structurizr DSL and Context Mapper, free and open source (MIT), no account.

## Where each modeler runs

| Modeler                                                  | File           | Browser                                                  | VS Code                                                                                                   | Orca                                                                                          | Your app                                                               |
| -------------------------------------------------------- | -------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [Wardley Maps](/modelers/wardley-maps)                   | `.wmap` `.owm` | [Open](https://wardley-maps.modeler.miragon.io)          | [Install](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.wardley-mapping-modeler)       | [Install](https://www.onorca.dev/plugins/miragon/orca-modelers/wardley-maps-modeler)          | [npm](https://www.npmjs.com/package/@miragon/wardley-renderer)         |
| [Event Storming](/modelers/event-storming)               | `.storm`       | [Open](https://event-storming.modeler.miragon.io)        | [Install](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.event-storming-modeler)        | [Install](https://www.onorca.dev/plugins/miragon/orca-modelers/event-storming-modeler)        | [npm](https://www.npmjs.com/package/@miragon/event-storming-renderer)  |
| [Team Topologies](/modelers/team-topologies)             | `.tt`          | [Open](https://team-topologies.modeler.miragon.io)       | [Install](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.team-topologies-modeler)       | [Install](https://www.onorca.dev/plugins/miragon/orca-modelers/team-topologies-modeler)       | [npm](https://www.npmjs.com/package/@miragon/team-topologies-renderer) |
| [Context Maps](/modelers/context-maps)                   | `.cm`          | [Open](https://context-maps.modeler.miragon.io)          | [Install](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.context-maps-modeler)          | [Install](https://www.onorca.dev/plugins/miragon/orca-modelers/context-maps-modeler)          | [npm](https://www.npmjs.com/package/@miragon/context-maps-renderer)    |
| [Value Chain](/modelers/value-chain)                     | `.vc`          | not yet                                                  | [Install](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.value-chain-modeler)           | [Install](https://www.onorca.dev/plugins/miragon/orca-modelers/value-chain-modeler)           | [npm](https://www.npmjs.com/package/@miragon/value-chain-renderer)     |
| [C4 model](/modelers/c4)                                 | `.c4` `.dsl`   | [Open](https://c4.modeler.miragon.io)                    | [Install](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.c4-modeler)                    | not yet                                                                                       | [npm](https://www.npmjs.com/package/@miragon/c4-renderer)              |
| [Business Model Canvas](/modelers/business-model-canvas) | `.bmc`         | [Open](https://business-model-canvas.modeler.miragon.io) | [Install](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.business-model-canvas-modeler) | [Install](https://www.onorca.dev/plugins/miragon/orca-modelers/business-model-canvas-modeler) | not yet                                                                |

## In the browser

No install, no account.

1. Open a modeler's web app from the table.
2. Pick **Show example** or **New diagram**, or drop one of your files onto the page.
3. Edit on the canvas, then export the file and commit it.

## In VS Code

The [Miragon Modeler Collection](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.miragon-modeler-collection) brings all seven modelers, plus Miragon's BPMN and Domain Storytelling modelers:

```sh
code --install-extension miragon-gmbh.miragon-modeler-collection
```

Or install one modeler from the table. Then open or create a file with its ending, such as `map.wmap`: it opens as a diagram. In VSCodium or Cursor, install the same extensions from [Open VSX](https://open-vsx.org/namespace/miragon-gmbh).

## In Orca

[Orca](https://www.onorca.dev) runs your coding agent next to your files; with a modeler plugin, the agent's edits show up on the canvas live. The plugins need Orca 1.4.252 or later.

1. Open a modeler's plugin page from the table and install it.
2. Open or create a file with its ending.

## In your own app

Install a modeler's renderer from npm:

```sh
npm install @miragon/wardley-renderer
```

Each renderer implements the [modeler API](/platform/api); its README has the details. Business Model Canvas has no npm package yet.

## Next steps

- Pick a modeler in the sidebar: what it draws, its file format and where to try it.
- [Build from source](/build-from-source) to run Value Chain in the browser.
