# Wardley Maps

**See where your strategy should move.** Draw [Wardley Maps](https://learnwardleymapping.com/) in VS Code, in your browser or in Orca, and keep each map as a plain `.wmap` file next to the code it describes.

::: tip Try it now
Open the [web app](https://wardley-maps.modeler.miragon.io) and pick **Show example**: no install, no account.
:::

![The Wardley Mapping Modeler in VS Code with the online grocery example](/shots/wardley-maps/vscode-editor.png)

## What a Wardley Map is

Simon Wardley developed the [Wardley Map](https://en.wikipedia.org/wiki/Wardley_map) while running the online photo service Fotango, and describes it in his freely available book [_Wardley Maps_](https://medium.com/wardleymaps). A map starts with a user and their need at the top. Below hang the components that meet that need, ordered by how visible they are to the user. That vertical axis is the value chain.

The horizontal axis is evolution: every component moves from genesis to custom-built, then to product and finally to commodity. Where a component sits tells you how to treat it: build what is new and sets you apart, buy what is a product, and outsource what is a utility. The community collects talks, tools and examples in [Awesome Wardley Maps](https://github.com/wardley-maps-community/awesome-wardley-maps).

## Why it matters

- A strategy discussion points at a shared map instead of a list of opinions.
- The map shows where you build something by hand that the market already sells.
- Arrows for evolution and marks for inertia make change and resistance visible before you plan around them.

The map comes third in the suite: it answers _where_ to invest. The [Value Chain](/modelers/value-chain) before it shows how the business delivers value; [Event Storming](/modelers/event-storming) after it finds the events inside the components you decide to build.

## Draw it in the modeler

- Components, users and anchors on the value chain, with dependencies and flows between them
- Evolution, inertia and pipelines
- Build, buy and outsource, markets and ecosystems
- Notes, annotations and submaps that link to other maps
- Explore mode: tell a map one step at a time, revealing what a component needs and what needs it

## Model and code side by side

![The Wardley Mapping Modeler in VS Code: the online grocery map on the left, its .wmap text on the right](/shots/wardley-maps/vscode-side-by-side.png)

A `.wmap` or `.owm` file is the [OWM DSL](https://docs.onlinewardleymaps.com/) of onlinewardleymaps.com, read and written losslessly. Maps from there open unchanged. Edit the map on the canvas, and only the lines you touched change: comments, blank lines and order stay as you wrote them.

```text
title Online Grocery
// Q1 workshop: build, buy or outsource?
anchor Household [0.96, 0.55]

component Online Order [0.84, 0.58]
component Meal Planner [0.7, 0.3] (build) url(Planner)
component Fulfilment [0.4, 0.42] (build) inertia
component Cloud Hosting [0.14, 0.9] (outsource)

evolve Fulfilment 0.7 (buy)

Household -> Online Order
Online Order -> Meal Planner
```

## Use it where you work

- **In the browser:** [wardley-maps.modeler.miragon.io](https://wardley-maps.modeler.miragon.io). Open or drop a file, or paste OWM text; **Share** copies a link that holds the whole map.
- **In VS Code:** the [Wardley Mapping Modeler](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.wardley-mapping-modeler) opens your maps as diagrams, with the text side by side. Also on [Open VSX](https://open-vsx.org/extension/miragon-gmbh/wardley-mapping-modeler).
- **In Orca:** [open the plugin in Orca](https://www.onorca.dev/plugins/miragon/orca-modelers/wardley-maps-modeler): each change your coding agent writes to the map shows up as it happens ([what it does in Orca](https://github.com/Miragon/modeler-suite/tree/main/modelers/wardley-maps/apps/orca#readme)).
- **With Claude Code:** the [`wardley-maps-modeler` plugin](https://github.com/Miragon/modeler-suite/tree/main/modelers/wardley-maps/plugins/wardley-maps-modeler#readme) drafts a map from your strategy notes or reviews one.

In your own app: `npm install @miragon/wardley-renderer`

## Next steps

- The [README of the Wardley Maps modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/wardley-maps#readme): the notation, the file format and the npm packages.
- [Build from source](/build-from-source): build and run every modeler from the repository.
