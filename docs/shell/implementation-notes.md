# @miragon/modeler-shell: implementation notes

`@miragon/modeler-shell` is the chrome around every Miragon diagram-js modeler: menu, palette skin,
tooltips, zoom panel and keys, fit, problems pill, legend, status box and the plumbing to its host
(a VS Code webview, a web app or an embedding page). Its API is in
[`packages/shell/API.md`](../../packages/shell/API.md).

What the chrome looks like and how it behaves is the Miragon design system's guide
(`modeler-tool-design` skill, §5, §8, §9, §12 and §13). These notes are the other half: the
diagram-js, browser and VS Code mechanics behind it, and the traps that are not visible in the code.
If a note and the guide disagree, the guide wins.

## Principles

- **The modeler owns its content, the shell owns the chrome.** The modeler hands over content
  bounds, emptiness, diagnostics, legend, menu entries and palette entries (`title` and `shortcut`
  separately). It keeps what only it can do: keyboard creation from the palette, the canvas lock of a
  read-only file, select all and its own form dialogs; the "Keyboard shortcuts…" dialog is the
  shell's since 0.7, fed with the modeler's shortcut groups as data. Renderers never import the
  shell; they hand it structurally typed parts.
- **Public diagram-js only.** The shell talks to `canvas`, `zoomScroll`, `keyboard`, `palette` and
  `eventBus`, never to private fields. The palette's container arrives with `palette.create`.
- **Container, not window.** Every size and breakpoint is relative to the shell root:
  `container-type: size` (the root then needs an explicit height), `cqw`/`cqh` instead of `vw`/`vh`,
  `@container cd-shell (…)` instead of `@media`, a `ResizeObserver` instead of `window.innerWidth`.
  No element inside the root gets a `container-type` of its own.
- **Sizes come from the vendored tokens.** CSS reads `--cd-shell-*`; scripts use their copy `SHELL`,
  which every modeler pins to `cd-tokens.generated.json` in a unit test.
- **Foreign pages.** Page rules such as `button { text-transform: uppercase }` beat inheritance, so
  the chrome re-establishes font, colour and spacing on its own elements at class specificity.
  Positions are measured against the root's padding box (`clientLeft`/`clientTop`), since a page may
  border the root.

## Palette

- The shell turns diagram-js's vertical palette into one horizontal glass island and moves it before
  the canvas `<svg>` on `palette.create`, so the tab order is palette, then canvas.
- `Palette#_update` rebuilds every entry on each change. After every `palette.changed` the shell
  re-applies `role="toolbar"`, the roving `tabindex`, `aria-pressed` and `aria-keyshortcuts`.
- The active tool comes from `tool-manager.update`, not from `highlighted-entry`: diagram-js caches
  the tools group once and marks detached entries after a rebuild.
- Enter and Space dispatch a synthetic `click` with `detail === 0`. Creating entries must branch on
  it: `create.start` never ends without a pointer, so keyboard creation places the shape at
  `freeArea` instead.
- A renderer must not add a tab stop around palette and `<svg>` (a `tabindex` on `.djs-container`).
- diagram-js's own palette tooltip (hover only) is replaced: `{ paletteTooltip: ["value", null] }`.

## Tooltips and layers

- The canvas container is `isolation: isolate`, so everything diagram-js shows (context pad 100,
  popup menu 200, palette 110, label editor 100) stays on layer 0, below every island.
- Tooltips, dropdowns and popovers live in one layer element directly under the shell root, never
  inside an island: an island with `z-index` or `backdrop-filter` traps them.
- Persistent overlays a modeler adds stay at `z-index` 100 or below; transient popups may cover the
  palette while open.
- A `<dialog>` opened with `showModal()` sits in the browser's top layer; it needs no layer token and
  tells the key listener (`:modal`) that the zoom keys must stop.
- Set every property of a `kbd` chip explicitly: VS Code's default stylesheet styles `kbd`.

## Zoom and keys

- Buttons and keys call `zoomScroll.stepZoom(±1)`, which snaps to diagram-js's raster first; the
  shell adds no rounding. The limits 20 % and 400 % are `ZoomScroll`'s fixed `RANGE`. Zoom out is
  disabled already below 20 %, since `stepZoom(-1)` from there zooms in.
- `canvas.zoom()` is rounded to three decimals: compare with a tolerance.
- Read the zoom once per animation frame after `canvas.viewbox.changed`; with `deferUpdate` that
  event comes up to 300 ms late, so also schedule from `canvas.viewbox.changing`.
- The shell's keyboard listener runs at priority 2000 and returns `true` for the chrome keys, so
  diagram-js's `KeyboardBindings` and the modelers' modules never zoom a second time. The keys
  execute in one DOM `keydown` listener on `document` (on the shell root when embedded).
- Matching: Cmd and Ctrl both count on every platform, never with Alt (AltGr) or during IME
  composition. `+`/`-` by `event.key`, numpad by `event.code`, fit by `code === "Digit1"` with Shift
  (layout-independent). Nothing acts in a text field (`isTextField`: inputs, contenteditable,
  `EditContext`, Monaco) or behind a modal dialog.
- A modeler whose keyboard listens on `document` must register before the shell, so construct the
  diagram before mounting the shell.
- Shortcut labels read the platform in the webview itself (`navigator.userAgentData?.platform ||
navigator.platform`), never `process.platform`, which names the remote machine under VS Code
  Remote.
- `aria-keyshortcuts` names keys, not characters, for the US and the German layout (`?` →
  `Shift+/ Shift+ß`). Characters that need AltGr or a dead key get none.

## Focus

- A pointer click (`event.detail >= 1`) on the zoom panel, a palette entry or a File/Model menu
  action hands the focus to the canvas (`canvas.focus()`), so Delete and the arrows act at once.
  Enter and Space leave it on the control.
- WebKit and Firefox on macOS do not focus a clicked button: never wait for the clicked control to
  hold the focus before handing it on.
- When an island hides while it holds the focus, move the focus first, or it falls to `<body>`.
- While a shell is attached the canvas `<svg>` gets `role="application"` and an `aria-label`, so
  screen readers do not swallow its single-key commands.

## Dialogs

- The shell's dialog is a native `<dialog>` opened with `showModal()`: the browser puts it in the
  top layer, makes the page behind it inert and closes it on Escape (`cancel`). The top layer's
  containing block is the window, so the dialog sizes itself with `100%` of the window, not with the
  root's `cqw`/`cqh`: an embedded modeler's dialog covers the whole page with its backdrop anyway.
- `showModal()` keeps Tab inside the page, not inside the dialog: after the last Tab stop the
  browser moves on to its own UI, and in a VS Code webview to the workbench. A `keydown` listener on
  the document wraps Tab and Shift+Tab at the dialog's ends and brings a focus that left back in.
- Chromium (and Firefox) make a scrolling element without focusable children a Tab stop of its own,
  WebKit does not. The wrap would skip such a stop it does not know, so the body gets an explicit
  `tabindex="0"` while it overflows (a `ResizeObserver`), and every engine scrolls it by keyboard.
- A click on `::backdrop` targets the `<dialog>` itself, and so does one on its 1px border: the
  dialog closes only for a press and a release both outside its box.
- The dialog is built on open and removed on close, so a closed one leaves nothing in the DOM and
  `shell.destroy()` removes an open one (without moving the focus, which would land on a chrome that
  is about to go). The focus returns to the element that had it before the dialog opened. A browser
  that follows HTML's closing steps does that itself; the shell repeats it, so it holds in every
  engine, and falls back to the canvas or the menu trigger when that element is gone.

## Fit

- Never `canvas.zoom("fit-viewport")`: it knows no insets. Compute a viewbox with the container's
  aspect ratio from the tight content bounds and the fit insets, at most 100 %, and set it with
  `canvas.viewbox(box)`.
- The content bounds come from the contract (`contentBounds()`, tight, without padding).
- The first import with content fits once; an empty file shows 100 %. Later imports keep viewbox and
  selection.
- A user move is any viewbox the shell did not write itself: compare scale and screen translation
  with the last written box (tolerance 1/1000), never with a flag (deferred events arrive late).
  Viewbox changes between `import.*.start` and `import.done` are the importer's, not the user's.
- Resizes refit while the view is automatic. Call `canvas.resized()` first (it drops the cached
  viewbox) and skip 0 × 0 (hidden tabs).
- An open legend measured before its font loaded refits once after `document.fonts.ready`, only if
  nothing else moved the view.
- A view change the host makes never commits an open label editor (contract L5): renderers keep the
  editor open across viewbox changes and commit only on the user's own gestures.

## Status box and read-only

- The status box and the visible read-only marks wait 800 ms without a valid import, so typing in
  the text editor does not flicker. The lock itself (palette veto, Model entries) applies at once.
- The palette veto finds the entry through `delegateTarget`, since `palette.trigger` carries no id.
- The canvas lock is the modeler's: rules alone do not stop a context pad or a double-click label
  editor, so all of them must ask the lock.
- Draw the 4px status bar as a `::before`; a `border-left` bends at the rounded corner.

## Appearance

- `resolveAppearance(requested, themes)`: a mode the modeler cannot show falls back to `themes[0]`;
  high contrast always passes.
- `themes` is static package data, so the host writes the attributes before the first paint.
- An embedded root carries its own `data-cd-theme` (else a dark host page darkens the chrome over a
  light canvas) and mirrors the host's `data-cd-kontrast`.
- Web app: `webHeadMarkup` writes the head script and metas; the script is ES5, reads storage in
  `try`/`catch` and escapes every literal. Switching disables transitions for two frames.

## Web app host

- **Primary action:** loses its label before the palette moves to the second row. Decide again
  once Geist has loaded.
- **Legal line:** wraps between entries instead of scrolling; pill, legend and the raised zoom panel
  stand on its measured height.
- **Toasts:** a `popover="manual"`, re-shown when a modal dialog opened, since layer 60 loses
  against the top layer. Screen readers hear them through two live regions rendered from mount on.
- **Start screen:** the work chrome is `visibility: hidden`, the canvas `inert`, and the zoom keys
  belong to the browser (page zoom, WCAG 1.4.4).
- **Drop zone:** listeners on `window` with a depth counter; MIME types are often empty before the
  drop, so an empty type never forbids.

## VS Code host

The extension owns file, document, history and mode; the webview shows canvas and chrome.

- **Commands.** Every menu action that makes sense without canvas focus is also a command; both post
  the same message to the active panel.
- **Notifications.** No toasts in the webview: the extension shows VS Code notifications, only for
  actions the user triggered.
- **Undo.** The history is the document's. The webview never binds Cmd+Z to the `commandStack`
  (`undoRedoKeys: false`); the shell lets the key reach `window`, where VS Code undoes. Each canvas
  change is one `WorkspaceEdit`. The extension recognises its own edits as echoes. In text fields,
  undo keys get `stopPropagation()` without `preventDefault()`, so the field keeps its native undo.
- **Key interception.** VS Code forwards every `keydown` that reaches the webview's `window`, whether
  prevented or not. So the webview stops every key it handled on `document` (zoom keys, Escape with an
  open menu, keys the canvas already prevented such as Cmd+C or Cmd+A) and lets the rest through.
- **Theme bridge.** The extension writes `data-cd-theme`/`data-cd-kontrast` into the HTML and posts
  changes; re-send when a hidden panel becomes visible. The body classes are only a fallback when
  no extension speaks, and `vscode-high-contrast-light` must be checked before
  `vscode-high-contrast`.
- **Hygiene.** Reset VS Code's default webview styles (body padding, fonts, `kbd`, `code`, links,
  focus rings, scrollbars). Never use `var(--vscode-font-family)`: undefined elsewhere, it
  invalidates the whole declaration. Bundle fonts as files, not data URLs. Never add
  `'unsafe-eval'`; a webview with zod 4 sets `z.config({ jitless: true })` first. Mirror
  `vscode-reduce-motion` as the shell's own class.
- **State.** `retainContextWhenHidden: true`; a hidden tab reports 0 × 0. Legend state and view go
  through `vscode.setState` under `modelerShell`, written 250 ms after the view rests; a stored view
  wins over the first fit.

## VS Code: smoke tests in a real VS Code

The stub in `./testing/vscode-stub` reproduces VS Code's webview; `./testing/vscode-electron` checks
the real one (usage in the [shell README](../../packages/shell/README.md#smoke-tests-in-a-real-vs-code)).

- **Playwright, not `runTests`.** `runTests` cannot reach the webview's DOM. The driver downloads VS
  Code with `@vscode/test-electron` (3.1.0 or later for the renamed macOS executable) and drives it
  with `_electron.launch` through the two webview frames.
- **Cache.** VS Code goes to the OS cache directory, outside every repository (ESLint would lint a
  `.vscode-test` folder). Parallel runs download into private folders and move the result into the
  cache with one `rename`, so they never delete each other's install.
- **Clean profile.** Temporary user data and extensions directories, no welcome page, no automatic
  theme detection, no `VSCODE_*` variables (from a VS Code terminal they break the webview).
- **Keys.** `keyboard.dispatch: keyCode`, so Playwright's US key codes mean the same on a German
  layout.
- **Save.** Wait for the tab to turn clean, then read the file until two reads agree; VS Code writes
  in place.
- **Themes.** Written to `settings.json`. A missed switch is written again after 2 s, then routed
  through a third theme. `extensions.autoUpdate` is set to `"off"` so VS Code's own settings
  migration does not overwrite the file.
- **Failures with a cause.** The driver quotes an activation error from the extension host's log and
  the webview's own uncaught errors, instead of waiting for the timeout.
- **Docker.** `modeler-shell-vscode-docker` runs the same test in a Linux container under
  `xvfb-run`, so no window takes the focus on a Mac. The repository is copied without `node_modules`
  and installed with `npm ci` inside; VS Code and npm caches are shared volumes.

## Re-check on a diagram-js upgrade

These notes rely on internals:

- `ZoomScroll`: `RANGE = { min: 0.2, max: 4 }`, `NUM_STEPS = 10`, the snap in `_zoom`.
- `Canvas`: `zoom()` rounded to three decimals, `deferUpdate` debounce of 300 ms, `resized()`
  dropping the cached viewbox.
- `Palette`: appended after the `<svg>`, `palette.create` with `{ container }`, full rebuild on
  `palette.changed`, the cached tools group.
- `PaletteTooltip` registered as `paletteTooltip`.
- `Keyboard`: bound to the canvas `<svg>`, `preventDefault()` without `stopPropagation()`.
