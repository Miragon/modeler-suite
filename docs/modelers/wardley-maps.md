# Wardley Maps

**See where your strategy should move.** Draw [Wardley Maps](https://learnwardleymapping.com/) on a canvas: what your users need, what that depends on, and how mature each part is, from genesis to commodity. Each map is a plain-text file, so it lives in your repository, shows up as a readable diff and evolves with the code it describes.

::: tip Try it now
Open the [web app](https://wardley-maps.modeler.miragon.io) and pick **Show example**: no install, no account.
:::

![The Wardley Maps web app editing its example](/shots/wardley-maps/demo.gif)

## Use it where you work

- **In the browser:** [wardley-maps.modeler.miragon.io](https://wardley-maps.modeler.miragon.io). Open or drop a file, or paste OWM text; **Share** copies a link that holds the whole map.
- **In VS Code:** the [Wardley Mapping Modeler](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.wardley-mapping-modeler) opens your maps as diagrams, with the text side by side. Also on [Open VSX](https://open-vsx.org/extension/miragon-gmbh/wardley-mapping-modeler).
- **In Orca:** [open the plugin in Orca](https://www.onorca.dev/plugins/miragon/orca-modelers/wardley-maps-modeler): each change your coding agent writes to the map shows up as it happens ([what it does in Orca](https://github.com/Miragon/modeler-suite/tree/main/modelers/wardley-maps/apps/orca#readme)).
- **In your own app:** `npm install @miragon/wardley-renderer`

## What you can draw

- Components, users and anchors on the value chain
- Evolution, inertia and pipelines
- Build, buy and outsource, markets and ecosystems
- Explore mode: tell a map one step at a time

## File formats

`.wmap` and `.owm`, the [OWM DSL](https://docs.onlinewardleymaps.com/), lossless in both directions. Maps from onlinewardleymaps.com open unchanged.

## Next steps

- The [README of the Wardley Maps modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/wardley-maps#readme): the notation, the file format and the npm packages.
- [Build from source](/build-from-source): build and run every modeler from the repository.
