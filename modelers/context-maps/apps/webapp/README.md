# Context Maps Modeler: Web App

[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](https://github.com/Miragon/modeler-suite/blob/main/modelers/context-maps/LICENSE)

The browser editor for strategic Domain-Driven Design [Context Maps](https://contextmapper.org/)
diagrams: a Vite app on the shared [`@miragon/context-maps-renderer`](../../packages/renderer) core,
inside the Miragon modeler chrome ([`@miragon/modeler-shell`](https://www.npmjs.com/package/@miragon/modeler-shell),
web host). A full-bleed canvas with floating islands, no header bar, and **no backend**: everything
is local, and a map is shared by encoding it into the URL.

**[Live demo](https://context-maps.modeler.miragon.io)**

![The Context Maps editor](../../docs/screenshots/editor.png)

## Highlights

- **The Miragon modeler chrome**, the same as in the VS Code extension: the menu top left, the tool
  palette top centre (Enter or Space on a subdomain type places a context), **Share** top right,
  the zoom panel bottom right (`Cmd/Ctrl` + `+` / `−`, `Cmd/Ctrl+0` for 100 %, `Shift+1` to fit),
  the legend, the problems pill and the legal line bottom left. The work chrome waits behind a
  **start screen** (New diagram, Show example, or open a file) on a fresh visit.
- **Menu:** File (**New diagram**, **Open…** `Cmd/Ctrl+O` for `.cm`, `.cm.json` and `.json`, **Show
  example**, **Import…** for Context Mapper `.cml`), Model (**Map title…**, the **Legend** checkbox),
  Export (**PNG** at 2×, **SVG**, **JSON** `Cmd/Ctrl+S`, **CML**) and Help (**Keyboard
  shortcuts…**). Undo and redo stay on the keys.
- **Edit by direct manipulation.** Drag from the palette to create and move contexts, connect them
  through the context pad, rename in place; diagram-js keeps the history.
- **Drop a file** anywhere on the page: a `.cm`, `.json` or `.cml` file opens. Replacing a map offers
  **Undo** in a toast (and on `Cmd/Ctrl+Z` while the canvas has nothing else to undo) instead of
  asking first.
- **Problems.** The semantic rules of the notation show as markers on the canvas and in the problems
  pill; its list names each finding's relationship and selects it. What a CML import skipped stays
  in the list until the next map.
- **Share via URL, no server.** **Share** copies a self-contained link: the whole map is
  LZ-compressed into the URL hash (`#d=…`). Opening that link restores the map; a link cut off when
  it was copied says so.
- **Autosave.** Every change goes to `localStorage` and into the address bar, so a reload brings the
  map back; the legend, closed on a first visit, remembers whether it is open. A saved map this
  version cannot open (one a newer modeler wrote, say) stays saved until the next map is started or
  opened, and a toast says so.
- **Offline-friendly.** No CDN calls; Geist and Geist Mono are bundled.

## Run it

From the root of the Miragon modeler suite (Node ≥ 24.15 for Portless):

```bash
npm ci && npm run build:shared                    # once
npm run context-maps dev:webapp                   # stable per-worktree http://<worktree>.context-maps-modeler.localhost:8080
```

`npm run context-maps dev:webapp` serves the app via [Portless](https://portless.sh) at a stable
per-worktree `.localhost` URL (see [`CONTRIBUTING.md`](../../CONTRIBUTING.md)). For plain Vite on
a fixed port instead:

```bash
npm run context-maps dev:webapp:plain             # http://127.0.0.1:5181
```

Production build (also what Netlify runs), and the check of what it ships:

```bash
npm run context-maps build:webapp                 # → apps/webapp/dist
npm run check:build -w modelers/context-maps/apps/webapp
```

On first load the app shows, in priority order, a map from a **shared link** (`#d=…`), then the
**autosaved** map from `localStorage`, then the **start screen**.

## How it works

`src/main.ts` mounts the renderer's `Modeler` and the shell around it, without a UI framework:

- **Chrome:** `mountShell(…, { host: "web", themes: ["light"] })` renders the menu, Share, the legal
  line, toasts, the problems list, the start screen and the drop zone; `connectDiagramJs` binds the
  zoom panel, the keys and the fit, which frames the `Modeler`'s `contentBounds()` (passed as
  `modeler`). The map's own parts come from the renderer: `contextMapMenu` (Model, Export, Help),
  `contextMapShortcuts` (the groups the shell's `showShortcutsDialog` shows, with the file keys
  first), `createTitleDialog` and `renderLegend`.
- **Mode:** light only until the joint dark-mode release. `index.html` writes
  `data-cd-theme="light"`, and the Vite config puts the shell's `webHeadMarkup` (theme colour, the
  high-contrast line) in place of `<!-- miragon-mode -->`.
- **Sharing and autosave:** `serializeDocument()` → `LZString.compressToEncodedURIComponent` →
  `#d=…`; very large maps skip the hash and rely on `localStorage`.
- **Export:** JSON is the canonical `.cm.json` text, CML via `@miragon/context-maps-cml`, SVG via
  `modeler.saveSVG()`, PNG by rasterising that SVG with `svgToPng` of
  `@miragon/modeler-shell/export` at 2×, on the light ground of guide §10.7 and with Geist inside
  the image; if Geist can't be read, the PNG still downloads in the system font and a warning toast
  says so. Downloads are named after the map's title.

The renderer, cml and schema-model packages are aliased to their **TypeScript source** in
`vite.config.ts`, so there is no separate library build step.

## Deployment

Deployed on **Netlify** (config in [`netlify.toml`](../../netlify.toml)): build `npm run build:webapp`,
publish `apps/webapp/dist`, with an SPA catch-all redirect to `index.html` (hash-based routing).

## License

[MIT](../../LICENSE). The bundled Lucide icons of the modeler shell and the renderer are ISC (partly
Feather, MIT); the renderer's star and open hand of the core and supporting subdomains are Material
Icons `star` and `pan_tool`, Apache-2.0 (© Google LLC). The bundle keeps their licence comments.
