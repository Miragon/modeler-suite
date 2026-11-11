# Value Chain

**One page for your whole process landscape.** Draw ARIS-style value chain diagrams: which steps create value for a business, in which order, how they break down into sub-steps, and which organizational units are responsible for them. Get a one-page overview before you model single processes in detail.

::: tip Try it now
Install the [Value Chain Modeler](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.value-chain-modeler) for VS Code and open or create a `.vc` file.
:::

![The Value Chain web app editing its example](/shots/value-chain/demo.gif)

## Use it where you work

- **In VS Code:** the [Value Chain Modeler](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.value-chain-modeler) opens your diagrams on a canvas. Also on [Open VSX](https://open-vsx.org/extension/miragon-gmbh/value-chain-modeler).
- **In Orca:** [open the plugin in Orca](https://www.onorca.dev/plugins/miragon/orca-modelers/value-chain-modeler): each change your coding agent writes shows up as it happens ([what it does in Orca](https://github.com/Miragon/modeler-suite/tree/main/modelers/value-chain/apps/orca#readme)).
- **In your own app:** `npm install @miragon/value-chain-renderer`
- **In the browser, from source:** the web app has no public deployment yet. `npm run value-chain dev:webapp` opens it at `http://localhost:5181`.

## What you can draw

- Steps as chevrons, in order
- Sub-steps, as a hierarchy
- Organizational units, assigned to their steps

## File formats

`.vc` and `.vc.json`.

## Next steps

- The [README of the Value Chain modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/value-chain#readme): the notation, the file format and the npm packages.
- [Build from source](/build-from-source): build and run every modeler from the repository.
