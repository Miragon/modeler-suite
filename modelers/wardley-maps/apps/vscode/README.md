# Wardley Maps for VS Code

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/miragon-gmbh.wardley-mapping-modeler.svg?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.wardley-mapping-modeler)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/wardley-maps/LICENSE)

![Miragon Modeler for Wardley Maps: Wardley maps from plain .wmap files, right in VS Code](/modelers/wardley-maps/docs/screenshots/vscode/cover.png)

Draw [Wardley maps](https://learnwardleymapping.com/) on a canvas in VS Code. Each map is a
plain-text `.wmap` or `.owm` file in the [Online Wardley Maps](https://onlinewardleymaps.com/)
format, so it stays in your own repository and shows up in Git diffs line by line.

Free and open source (MIT). No account, no telemetry, and it works offline.

## Get started

1. Run **Wardley: New Map from Example** from the Command Palette (`Ctrl/Cmd+Shift+P`), or open any
   `.wmap` or `.owm` file. Maps from onlinewardleymaps.com open unchanged.
2. New to Wardley Mapping? A map places what your users need by how visible it is to them (up and
   down) and how mature it is, from genesis to commodity (left to right). The walkthrough **Get
   Started with Wardley Maps** shows you how to read and edit one.

## Draw on the canvas

![A Wardley map open in VS Code, with the context pad of the selected Meal Planner component](/modelers/wardley-maps/docs/screenshots/vscode/editor.png)

Add components, users, notes and pipelines from the palette. Select an element to connect, evolve,
colour, link or delete it. Drag a component left or right to move it along evolution. Undo and save
work as for any other file.

## Export for slides

![The editor's menu with Export as PNG, Export as SVG and Export as PNG (4x, transparent)](/modelers/wardley-maps/docs/screenshots/vscode/export.png)

Export a map as PNG or SVG from the menu, or as a transparent PNG at four times the size for slides
and reports. The `.wmap` file stays the source you edit.

## Text and diagram side by side

![Dragging Product Catalogue to the right on the canvas changes its line in the text beside it](/modelers/wardley-maps/docs/screenshots/vscode/side-by-side.png)

**Wardley: Open Source to the Side** shows the map's text, with syntax highlighting, next to the
diagram. Type in the text and the diagram follows. Edit the diagram and the text changes, but only
the lines you touched: your comments, blank lines and order stay as you wrote them.

![Compared with the saved file, the drag changed one line: Product Catalogue from 0.62 to 0.76](/modelers/wardley-maps/docs/screenshots/vscode/diff.png)

## Mistakes show up as problems

![A misspelled line is underlined in the text and listed in the Problems view, while the diagram still draws the map](/modelers/wardley-maps/docs/screenshots/vscode/problems.png)

Lines the editor can't read are underlined and listed in the **Problems** view, and they stay in
the file as written. The diagram keeps drawing everything else.

## Your existing maps

Paste the text of a map from onlinewardleymaps.com into a `.owm` file:

```text
title Tea Shop
anchor Business [0.95, 0.63]
component Cup of Tea [0.79, 0.61]
component Kettle [0.43, 0.35]
evolve Kettle 0.62
Business -> Cup of Tea
```

Components, users, evolve, inertia, pipelines, submaps, notes and annotations are drawn on the
canvas. Anything else stays in the file as written and shows up in **Problems**.

## Link maps

**Link to map…** on a component or submap links it to another map in your workspace, and **Open
link** opens it. Links to maps that don't exist show up in **Problems**. When you rename or move
maps in VS Code, the extension offers to update the links.

## Maps written by an AI agent

A map is a text file, so a coding agent can write it, and the diagram redraws when the file
changes. For Claude Code, the `wardley-maps-modeler` plugin teaches the method and the format, so
you can ask Claude to draft a map from your strategy notes or to review one:

```text
/plugin marketplace add Miragon/modeler-suite
/plugin install wardley-maps-modeler@modeler-suite
```

## Good to know

- Needs VS Code 1.96 or later on the desktop. VS Code for the Web is not supported.
- There is no live co-editing. Share maps through Git, or open them in the
  [web app](https://wardley-maps.modeler.miragon.io), which makes share links.
- **Keyboard shortcuts…** in the editor's menu lists every key and gesture.
- The diagram stays light in dark themes.

## Links

[Changelog](https://github.com/Miragon/modeler-suite/blob/main/modelers/wardley-maps/apps/vscode/CHANGELOG.md)
·
[Report an issue](https://github.com/Miragon/modeler-suite/issues)
·
[Source and contributing](https://github.com/Miragon/modeler-suite/blob/main/modelers/wardley-maps/CONTRIBUTING.md)
·
[Third-party licences](https://github.com/Miragon/modeler-suite/blob/main/modelers/wardley-maps/apps/vscode/THIRD_PARTY_NOTICES.md)

Made by [Miragon](https://www.miragon.io). MIT licence.
