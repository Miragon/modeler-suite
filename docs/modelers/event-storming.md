# Event Storming

**Map how your business really flows.** Run [Event Storming](https://www.eventstorming.com/) on a digital board in VS Code, in your browser or in Orca, and keep each board as a plain `.storm` file next to the code it describes.

::: tip Try it now
Open the [web app](https://event-storming.modeler.miragon.io) and pick **Show example**: no install, no account.
:::

![The Event Storming Modeler in VS Code with the checkout and shipping example](/shots/event-storming/vscode-editor.png)

## What Event Storming is

Alberto Brandolini created Event Storming as a workshop format and described it in his book [_Introducing EventStorming_](https://leanpub.com/introducing_eventstorming). People who know the business and people who build the software meet at one long wall. They put domain events on it in the order they happen, written in the past tense, such as "Order Placed". The timeline shows the whole process before anyone talks about solutions.

Around the events the board grows in colours. Commands trigger events, actors issue the commands, aggregates take them and decide. Policies react to an event with the next command. Read models, external systems and hotspots mark what someone needs, what lies outside the domain and what is still unclear. The same grammar serves three levels: big picture, process modelling and software design. The DDD Crew sums up the grammar in its [glossary and cheat sheet](https://github.com/ddd-crew/eventstorming-glossary-cheat-sheet).

## Why it matters

- Domain experts and developers learn the process together, in the words of the business.
- Hotspots make gaps and conflicts visible early, while a sticky is still cheap to move.
- Aggregates and the events between them are the first draft of your bounded contexts and your code.

Event Storming comes fourth in the suite: it answers _what happens_ in the domain, in order. [Wardley Maps](/modelers/wardley-maps) before it show where to invest; [Context Maps](/modelers/context-maps) after it show how the bounded contexts it reveals relate to each other.

## Draw it in the modeler

- Domain events on a timeline, with no grid
- Commands, actors, policies and aggregates in their workshop colours
- Read models, external systems and hotspots, plus notes, drawings and labelled arrows
- A level switch for big picture, process and design, and a list of every aggregate with its commands and events

## Model and code side by side

![The Event Storming Modeler in VS Code: the checkout and shipping board on the left, its .storm text on the right](/shots/event-storming/vscode-side-by-side.png)

A `.storm` file has one line per sticky, `<kind> <Name> [x, y]`, and one per arrow, `A -> B`. Edit the board or the text, and the other side follows. Lines the board can't use stay in the file as written.

```text
title Checkout and Shipping
level design
actor Customer [80, 300]
command Place Order [250, 300]
aggregate Order [450, 290] (id agg_order_place)
event Order Placed [660, 300]
hotspot Double charge on retry? [860, 520]
Customer -> Place Order
Place Order -> #agg_order_place
#agg_order_place -> Order Placed
```

## Use it where you work

- **In the browser:** [event-storming.modeler.miragon.io](https://event-storming.modeler.miragon.io). Open or drop a board; **Share** copies a link that holds the whole board.
- **In VS Code:** the [Event Storming Modeler](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.event-storming-modeler) opens `.storm` files as boards, with the text side by side. Also on [Open VSX](https://open-vsx.org/extension/miragon-gmbh/event-storming-modeler).
- **In Orca:** [open the plugin in Orca](https://www.onorca.dev/plugins/miragon/orca-modelers/event-storming-modeler): each change your coding agent writes to the board shows up as it happens ([what it does in Orca](https://github.com/Miragon/modeler-suite/tree/main/modelers/event-storming/apps/orca#readme)).
- **With Claude Code:** the [`event-storming-modeler` plugin](https://github.com/Miragon/modeler-suite/tree/main/modelers/event-storming/plugins/event-storming-modeler#readme) drafts a board from your notes or reviews one.
- **In your own app:** `npm install @miragon/event-storming-renderer`

## Next steps

- The [README of the Event Storming modeler](https://github.com/Miragon/modeler-suite/tree/main/modelers/event-storming#readme): the notation, the file format and the npm packages.
- [Build from source](/build-from-source): build and run every modeler from the repository.
