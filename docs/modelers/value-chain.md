# Value Chain

**One page for your whole process landscape.** Draw an ARIS-style value chain in VS Code or in Orca, and keep it as a plain `.vc` file next to the processes it explains.

::: tip Try it now
Install the [Value Chain Modeler](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.value-chain-modeler) for VS Code and open or create a `.vc` file.
:::

![The Value Chain Modeler in VS Code with the order to delivery example](/shots/value-chain/vscode-editor.png)

## What a value chain is

Michael Porter introduced the [value chain](https://en.wikipedia.org/wiki/Value_chain) in _Competitive Advantage_ (1985). It splits a business into the activities that create value for its customers, from developing a product to delivering it. The [ARIS](https://en.wikipedia.org/wiki/Architecture_of_Integrated_Information_Systems) method of August-Wilhelm Scheer turned the idea into a diagram type of its own, the value-added chain diagram (in German, _Wertschöpfungskettendiagramm_).

Each step is a chevron, read from left to right. A step breaks down into sub-steps, and an ellipse names the organisational unit that is responsible for it. The diagram stays on one page: it shows the whole landscape, not the detail of a single process.

## Why it matters

- Everyone sees the same few steps that create value, before anyone argues about the detail of one process.
- Each step has an owner, so gaps and double responsibilities show up on the page.
- The steps tell you which processes to model in detail next, and in which order.

The value chain comes second in the suite: it answers _how_ the business delivers value. The [Business Model Canvas](/modelers/business-model-canvas) before it answers why the business exists; [Wardley Maps](/modelers/wardley-maps) after it show which parts to build, buy or outsource.

## Draw it in the modeler

- Steps as chevrons, connected in order as "is predecessor of"
- Sub-steps below a step, connected as "is process-oriented superior"
- Organisational units as ellipses, assigned to the steps they own
- A colour per step, and alignment of several steps at once
- Export as PNG or SVG for slides

## Model and code side by side

![The Value Chain Modeler in VS Code: the order to delivery chain on the left, its .vc.json text on the right](/shots/value-chain/vscode-side-by-side.png)

A `.vc` or `.vc.json` file is deterministic JSON: a list of elements with their bounds, and a list of connections between them. Edit the canvas or the text, and the other side follows. A pull request shows which step changed.

```json
{
  "bounds": {
    "height": 64,
    "width": 180,
    "x": 460,
    "y": 80
  },
  "color": "#335DE5",
  "elementType": "step",
  "id": "step-production",
  "link": "production-detail",
  "name": "Production"
}
```

## Use it where you work

- **In VS Code:** the [Value Chain Modeler](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.value-chain-modeler) opens `.vc` files as diagrams, with the text side by side. Also on [Open VSX](https://open-vsx.org/extension/miragon-gmbh/value-chain-modeler).
- **In Orca:** [open the plugin in Orca](https://www.onorca.dev/plugins/miragon/orca-modelers/value-chain-modeler): each change your coding agent writes shows up as it happens ([what it does in Orca](https://github.com/Miragon/modeler-suite/tree/main/modelers/value-chain/apps/orca#readme)).
- **In your own app:** `npm install @miragon/value-chain-renderer`
- **In the browser, from source:** the web app has no public deployment yet. `npm run value-chain dev:webapp` opens it at `http://localhost:5181`.

## Next steps

- The [README of the Value Chain modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/value-chain#readme): the notation, the file format and the npm packages.
- [Build from source](/build-from-source): build and run every modeler from the repository.
