# Context Maps

**Agree on boundaries before you build.** Draw context maps, the strategic view of Domain-Driven Design: which bounded contexts exist, how important each one is, and how the teams behind them work together. Agree on boundaries, spot risky dependencies and explain your landscape to business and IT alike.

::: tip Try it now
Open the [web app](https://context-maps.modeler.miragon.io): no install, no account.
:::

![The Context Maps web app editing its example](/shots/context-maps/demo.gif)

## Use it where you work

- **In the browser:** [context-maps.modeler.miragon.io](https://context-maps.modeler.miragon.io)
- **In VS Code:** the [Context Maps Modeler](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.context-maps-modeler) opens your maps as diagrams. Also on [Open VSX](https://open-vsx.org/extension/miragon-gmbh/context-maps-modeler).
- **In Orca:** [open the plugin in Orca](https://www.onorca.dev/plugins/miragon/orca-modelers/context-maps-modeler): each change your coding agent writes shows up as it happens ([what it does in Orca](https://github.com/Miragon/modeler-suite/tree/main/modelers/context-maps/apps/orca#readme)).
- **In your own app:** `npm install @miragon/context-maps-renderer`

## What you can draw

- Bounded contexts, coloured by subdomain type
- Context-mapping patterns between them
- Models from [Context Mapper](https://contextmapper.org/), through `.cml`

## File formats

`.cm` and `.cm.json`; imports Context Mapper `.cml`.

## Next steps

- The [README of the Context Maps modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/context-maps#readme): the notation, the file format and the npm packages.
- [Build from source](/build-from-source): build and run every modeler from the repository.
