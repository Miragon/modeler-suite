# Event Storming for VS Code

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/miragon-gmbh.event-storming-modeler?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.event-storming-modeler)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/event-storming/LICENSE)

[Event Storming](https://www.eventstorming.com) is a workshop format for exploring a business
domain with sticky notes: domain events on a timeline, the commands that trigger them, and the
people, policies and systems around them. This extension opens `.storm` files (a plain-text DSL) in
a graphical editor. The text file stays the source of truth, so save, Git and diff keep working.

![The Event Storming board editor in VS Code](https://raw.githubusercontent.com/Miragon/modeler-suite/main/modelers/event-storming/docs/screenshots/vscode-editor.png)

New to Event Storming? Start with [eventstorming.com](https://www.eventstorming.com) and Alberto
Brandolini's book [Introducing EventStorming](https://leanpub.com/introducing_eventstorming).

## Getting started

Install **Event Storming Modeler** (publisher `miragon-gmbh`), then open the **Get Started with
Event Storming** walkthrough and click **Create board from example**. Or run **Event Storming: New
Board from Example** / **New Empty Board** from the Command Palette (also under **File > New
File…**). Any `.storm` file opens in the editor.

Sticky colours: **Domain Event** orange, **Command** blue, **Actor** light yellow, **Aggregate**
yellow, **Policy** purple, **Read Model** green, **External System** pink, **Hotspot** red, plus
notes and drawings. Time flows left to right; arrows connect the stickies into a story.

## Editing a board

- **Text and board side by side:** **Open Source to the Side** / **Open Board to the Side**;
  editing either re-renders the other live.
- **Full modeler:** palette at the top, context pad on a sticky (append, connect, change type,
  delete), inline labels, colour overrides. From the keyboard, Tab to the palette, pick with the
  arrows and press Enter to place a sticky in the middle with its label editor open.
- **Undo belongs to the file:** every canvas change is one document edit, so `Ctrl/Cmd+Z` undoes it
  like a text change. Only changed lines are rewritten. A change VS Code refuses (a read-only file)
  is taken back.
- **Menu:** workshop **Level**, **Type captions**, **Aggregates…**, PNG / SVG / transparent 4× PNG
  / JSON export, **Keyboard shortcuts…**. **Aggregates…** lists every named aggregate once (spelling
  variants and placeholder names such as `Aggregate 2` aside) with the commands leading into it and
  the events that follow; choosing one selects its stickies without changing the file.
- **Zoom** (bottom right) and `Ctrl/Cmd` + `+` / `-` / `0`, `Shift+1` fits.
- **Problems:** lines the parser cannot fully use stay in the file and are listed in the
  **Problems** view in plain words; the pill at the bottom left counts them.
- **Stable sticky ids:** a sticky created or renamed on the canvas keeps a random id in the text
  (`(id event_k3x9q2ab)`), so reloads, peers and links find the same sticky.
- **Commands:** **Event Storming: Fit to View**, the exports, and the two side-by-side commands.
- **Empty board:** **Insert example** adds the order-checkout example as one undoable edit.
- The board stays light in dark themes (high contrast is honoured); a `style dark` line is kept
  but not applied. Fonts are bundled, nothing loads from a CDN.

## Development

See [CONTRIBUTING.md](https://github.com/Miragon/modeler-suite/blob/main/modelers/event-storming/CONTRIBUTING.md).

## License

MIT. The extension bundles third-party software (Lucide icons, the Geist fonts, diagram-js and
its dependencies, zod); their licenses are in
[THIRD_PARTY_NOTICES.md](https://github.com/Miragon/modeler-suite/blob/main/modelers/event-storming/apps/vscode/THIRD_PARTY_NOTICES.md),
which ships in the extension as well.
