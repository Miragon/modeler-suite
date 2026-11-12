# Business Model Canvas

**Your business model on one page.** Fill in a [Business Model Canvas](https://www.strategyzer.com/library/the-business-model-canvas) in VS Code, in your browser or in Orca, and keep it as a plain `.bmc` file next to the plans it explains.

::: tip Try it now
Open the [web app](https://business-model-canvas.modeler.miragon.io) and pick **Show example**: no install, no account.
:::

![The Business Model Canvas Modeler in VS Code with the bike subscription example](/shots/business-model-canvas/vscode-editor.png)

## What a Business Model Canvas is

Alexander Osterwalder created the [Business Model Canvas](https://en.wikipedia.org/wiki/Business_Model_Canvas), published with Yves Pigneur in [_Business Model Generation_](https://www.strategyzer.com/library/business-model-generation) (2010). It describes how an organisation creates, delivers and captures value in [nine building blocks](https://www.strategyzer.com/library/the-business-model-canvas) on one sheet. The right half is about customers: segments, value propositions, channels and relationships. The left half is the infrastructure behind them: key partners, activities and resources. The bottom row is the money: costs and revenue streams.

Each idea in a block is a sticky. A good canvas reads from right to left: who you serve, what you promise them, and what it takes to keep that promise.

## Why it matters

- Founders, product, sales and engineering discuss the same nine blocks instead of their own slides.
- Every sticky is an assumption. The canvas shows which ones you still have to test, so you test the riskiest first.
- Moving a sticky costs seconds; finding out late that the business model is wrong costs a year.

The canvas comes first in the suite: it answers _why_ the business exists. The [Value Chain](/modelers/value-chain) after it shows how the business delivers that value.

## Draw it in the modeler

- The nine blocks in the layout of the original canvas, each with a hint that asks its question while it is empty
- Stickies with eight tape colours that mean what your team makes them mean, such as one colour per customer segment
- Notes on a sticky, a block or the whole canvas for the assumptions you still have to test
- Export as PNG or SVG, with the canvas's attribution on every export

## Model and code side by side

![The Business Model Canvas Modeler in VS Code: the bike subscription canvas on the left, its .bmc text on the right](/shots/business-model-canvas/vscode-side-by-side.png)

A `.bmc` file is YAML: one field per building block, with its stickies as `items`. Edit the canvas or the text, and the other side follows. A pull request shows which sticky changed.

```yaml
customer-segments:
  items:
    - id: commuters
      text: Commuters in the city
      color: sky
value-propositions:
  items:
    - id: staff-benefit
      text: Bikes as a staff benefit
      color: lagoon
      notes:
        - text: Do HR teams buy this, or facility managers?
```

## Use it where you work

- **In the browser:** [business-model-canvas.modeler.miragon.io](https://business-model-canvas.modeler.miragon.io)
- **In VS Code:** the [Business Model Canvas Modeler](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.business-model-canvas-modeler) opens `.bmc` files as canvases, with the text side by side. Also on [Open VSX](https://open-vsx.org/extension/miragon-gmbh/business-model-canvas-modeler).
- **In Orca:** [open the plugin in Orca](https://www.onorca.dev/plugins/miragon/orca-modelers/business-model-canvas-modeler): each change your coding agent writes shows up as it happens ([what it does in Orca](https://github.com/Miragon/modeler-suite/tree/main/modelers/business-model-canvas/apps/orca#readme)).
- **With Claude Code:** the [`business-model-canvas-modeler` plugin](https://github.com/Miragon/modeler-suite/tree/main/modelers/business-model-canvas/plugins/business-model-canvas-modeler#readme) drafts a canvas from your notes or reviews one.

The modeler publishes no npm package.

## Next steps

- The [README of the Business Model Canvas modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/business-model-canvas#readme): the canvas, its marks, the `.bmc` format and the attribution.
- [Build from source](/build-from-source): build and run every modeler from the repository.
