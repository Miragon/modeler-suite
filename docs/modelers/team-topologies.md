# Team Topologies

**Picture how your teams work together.** Draw your organisation with [Team Topologies](https://teamtopologies.com/) in VS Code, in your browser or in Orca, and keep it as a plain `.tt` file next to the code those teams own.

::: tip Try it now
Open the [web app](https://team-topologies.modeler.miragon.io) and pick **Show example**: no install, no account.
:::

![The Team Topologies Modeler in VS Code with the streaming platform example](/shots/team-topologies/vscode-editor.png)

## What Team Topologies is

Matthew Skelton and Manuel Pais described Team Topologies in their book [_Team Topologies_](https://teamtopologies.com/book) (2019). It is a way to organise teams for a fast flow of change. It knows four [team types](https://teamtopologies.com/key-concepts). A stream-aligned team owns a slice of the product end to end. A platform team offers internal services that other teams build on. An enabling team helps other teams grow a capability. A complicated-subsystem team owns a part that needs deep specialist knowledge.

Teams meet in three interaction modes: collaboration, X-as-a-Service and facilitating. Each team can hold only so much in mind at once: its cognitive load. A good topology reads along the flow of change: who delivers to the user, and who makes that delivery easier.

## Why it matters

- Conway's law says your systems mirror how your teams talk. The diagram shows that structure before it shows up in the code.
- Each team has a type and a limit on cognitive load, so overloaded teams and unclear ownership become visible.
- Interaction modes make a temporary collaboration explicit, so the team can plan when it ends.

Team Topologies comes sixth in the suite: it answers _who_ owns each bounded context. [Context Maps](/modelers/context-maps) before it draw the boundaries; the [C4 model](/modelers/c4) after it shows the software those teams build.

## Draw it in the modeler

- Stream-aligned, platform, enabling and complicated-subsystem teams in the shapes and colours of the official [templates](https://github.com/TeamTopologies/Team-Shape-Templates)
- Collaboration, X-as-a-Service and facilitating, placed where two teams meet
- The flow of change and free-text annotations, on their own or attached to an element
- Resize a team to show its cognitive load
- Export as PNG, SVG or JSON, or as a PNG that opens again as a diagram

## Model and code side by side

![The Team Topologies Modeler in VS Code: the streaming platform topology on the left, its .tt text on the right](/shots/team-topologies/vscode-side-by-side.png)

A `.tt` or `.ttm.json` file is small, stable JSON that diffs cleanly. Teams are nodes, and each interaction is a shape placed over the boundary between the teams it relates. An editable `*.tt.png` drops into a wiki or a README and still opens as a diagram.

```json
"interactions": [
  {
    "id": "int_discovery_recommendations",
    "mode": "collaboration",
    "position": {
      "x": 794,
      "y": 162
    },
    "size": {
      "width": 112,
      "height": 72
    },
    "label": "ranking"
  },
```

## Use it where you work

- **In the browser:** [team-topologies.modeler.miragon.io](https://team-topologies.modeler.miragon.io)
- **In VS Code:** the [Team Topologies Modeler](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.team-topologies-modeler) opens `.tt` and `.ttm.json` files as diagrams, with the text side by side. Also on [Open VSX](https://open-vsx.org/extension/miragon-gmbh/team-topologies-modeler).
- **In Orca:** [open the plugin in Orca](https://www.onorca.dev/plugins/miragon/orca-modelers/team-topologies-modeler): each change your coding agent writes shows up as it happens ([what it does in Orca](https://github.com/Miragon/modeler-suite/tree/main/modelers/team-topologies/apps/orca#readme)).
- **With Claude Code:** the [`team-topologies-modeler` plugin](https://github.com/Miragon/modeler-suite/tree/main/modelers/team-topologies/plugins/team-topologies-modeler#readme) designs a topology from your organisation or reviews one.
- **In your own app:** `npm install @miragon/team-topologies-renderer`

## Next steps

- The [README of the Team Topologies modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/team-topologies#readme): the notation, the file format and the npm packages.
- [Build from source](/build-from-source): build and run every modeler from the repository.
