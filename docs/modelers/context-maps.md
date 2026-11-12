# Context Maps

**Agree on boundaries before you build.** Draw a context map in VS Code, in your browser or in Orca, and keep it as a plain `.cm` file next to the code it describes.

::: tip Try it now
Open the [web app](https://context-maps.modeler.miragon.io) and pick **Show example**: no install, no account.
:::

![The Context Maps Modeler in VS Code with the online shop example](/shots/context-maps/vscode-editor.png)

## What a context map is

Eric Evans introduced the context map in _Domain-Driven Design_ (2003), in the part on strategic design; his free [DDD Reference](https://www.domainlanguage.com/ddd/reference/) sums it up. It shows the bounded contexts of a system: the parts in which one model and one language hold. Each context is marked by how much it matters to the business. A core domain sets you apart, a supporting subdomain is specialised but not differentiating, and a generic subdomain is one you can buy.

The lines between the contexts are the [context-mapping patterns](https://github.com/ddd-crew/context-mapping). They say how the teams behind two contexts work together: as partners, through a shared kernel, as customer and supplier, as upstream and downstream, or on separate ways. Each side of a line can carry a role, such as an open host service upstream or an anticorruption layer downstream.

## Why it matters

- Teams agree on where one model ends before they write the code that crosses the line.
- Risky dependencies show up on the map, such as a core domain that conforms to a legacy system.
- Business and IT read the same picture of the landscape, with the core domains marked.

The context map comes fifth in the suite: it answers _where_ one model ends and the next begins. [Event Storming](/modelers/event-storming) before it shows where the boundaries run; [Team Topologies](/modelers/team-topologies) after it shows which teams own those contexts.

## Draw it in the modeler

- Bounded contexts as boxes, coloured and marked with an icon by subdomain type
- Five context-mapping patterns as lines, with the roles OHS, PL, ACL and CF on their ends
- Thirteen rules of strategic DDD, most adopted from Context Mapper, with a note on what breaks them
- Models from [Context Mapper](https://contextmapper.org/), imported from `.cml` and exported back
- Export as PNG, SVG, JSON or CML

## Model and code side by side

![The Context Maps Modeler in VS Code: the online shop map on the left, its .cm text on the right](/shots/context-maps/vscode-side-by-side.png)

A `.cm` or `.cm.json` file is small, readable JSON: a list of contexts and the relationships between them. Edit the map or the text, and the other side follows. The modeler also imports Context Mapper `.cml` files.

```json
"relationships": [
  {
    "id": "rel_catalog_storefront",
    "from": "ctx_catalog",
    "to": "ctx_storefront",
    "pattern": "upstream-downstream",
    "upstreamRoles": [
      "OHS",
      "PL"
    ],
    "downstreamRoles": [
      "ACL"
    ]
  },
```

## Use it where you work

- **In the browser:** [context-maps.modeler.miragon.io](https://context-maps.modeler.miragon.io)
- **In VS Code:** the [Context Maps Modeler](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.context-maps-modeler) opens your maps as diagrams, with the JSON side by side. Also on [Open VSX](https://open-vsx.org/extension/miragon-gmbh/context-maps-modeler).
- **In Orca:** [open the plugin in Orca](https://www.onorca.dev/plugins/miragon/orca-modelers/context-maps-modeler): each change your coding agent writes shows up as it happens ([what it does in Orca](https://github.com/Miragon/modeler-suite/tree/main/modelers/context-maps/apps/orca#readme)).
- **In your own app:** `npm install @miragon/context-maps-renderer`

## Next steps

- The [README of the Context Maps modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/context-maps#readme): the notation, the file format and the npm packages.
- [Build from source](/build-from-source): build and run every modeler from the repository.
