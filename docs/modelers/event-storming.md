# Event Storming

**Map how your business really flows.** Run [Event Storming](https://www.eventstorming.com/) on a digital board: domain events on a timeline, the commands that trigger them, and the people, policies and systems around them. Each board is a plain-text file, so it lives in your repository, shows up as a readable diff and evolves with the code it describes.

::: tip Try it now
Open the [web app](https://event-storming.modeler.miragon.io) and pick **Show example**: no install, no account.
:::

![The Event Storming web app editing its example](/shots/event-storming/demo.gif)

## Use it where you work

- **In the browser:** [event-storming.modeler.miragon.io](https://event-storming.modeler.miragon.io). Open or drop a board; **Share** copies a link that holds the whole board.
- **In VS Code:** the [Event Storming Modeler](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.event-storming-modeler) opens your boards as diagrams, with the text side by side. Also on [Open VSX](https://open-vsx.org/extension/miragon-gmbh/event-storming-modeler).
- **In Orca:** [open the plugin in Orca](https://www.onorca.dev/plugins/miragon/orca-modelers/event-storming-modeler): each change your coding agent writes to the board shows up as it happens ([what it does in Orca](https://github.com/Miragon/modeler-suite/tree/main/modelers/event-storming/apps/orca#readme)).
- **In your own app:** `npm install @miragon/event-storming-renderer`

## What you can draw

- Domain events on a timeline, no grid
- Commands, actors, policies and aggregates
- Read models, external systems and hotspots
- Big picture, process and design level

## File formats

`.storm`, a line-based text format with one sticky, note or arrow per line.

## Next steps

- The [README of the Event Storming modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/event-storming#readme): the notation, the file format and the npm packages.
- [Build from source](/build-from-source): build and run every modeler from the repository.
