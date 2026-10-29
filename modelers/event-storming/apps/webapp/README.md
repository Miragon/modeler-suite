# Event Storming Modeler: Web App

[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/event-storming/LICENSE)

A browser editor for [Event Storming](https://www.eventstorming.com/) boards in the shared Miragon
modeler chrome ([`@miragon/modeler-shell`](https://www.npmjs.com/package/@miragon/modeler-shell)),
the same as in the VS Code extension: URL sharing ("Share"), opening and dropping `.storm`, `.json`
and `.txt` files, and the VS Code extension's exports (PNG, SVG, the transparent 4× PNG, JSON) plus
`.storm`. A PNG draws its labels in Geist; if Geist can't be embedded, the PNG is still saved, in a
system font, and a warning toast says so. Replacing a board offers it back ("Board replaced · Undo",
or `Ctrl/Cmd+Z`), the tab names the board, and import findings are listed under the problems pill in
plain words. While the board has a named aggregate, "Aggregates…" in the menu lists each named
aggregate once (a placeholder such as "Aggregate 2", or "Domain Event" on a sticky retyped to an
aggregate, is left out), with the commands that lead into it and the events that follow, and a
name selects its stickies on the board. The demo app for the `@miragon/event-storming-*` packages.

**[Live demo](https://event-storming.modeler.miragon.io)**

![The web app](../../docs/screenshots/editor.png)

## Run locally

From the root of the Miragon modeler suite:

```bash
npm ci && npm run build:shared            # once
npm run event-storming dev:webapp         # named HTTPS URL via Portless; one-time setup in the suite's CONTRIBUTING.md
npm run event-storming dev:webapp:plain   # plain Vite, http://127.0.0.1:5180
```

## Build

`npm run event-storming build:webapp` builds what Netlify ships;
`npm run check:build -w modelers/event-storming/apps/webapp` then checks
that `dist/index.html` carries the mode markup (theme-color, contrast line, `cd-shell-document`) and
the bundle keeps the shell's Lucide licence comment. CI runs both.

## License

MIT
