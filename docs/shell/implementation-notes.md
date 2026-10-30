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
- The tool manager keeps a tool armed from the palette when Escape cancels its drag before the
  pointer moved. The shell puts it down once the task that cancelled the drag is over and no tool
  was armed in it, so a switch to another tool inside that task keeps it pressed.
- Chromium reports the removal of the focused entry as a `focusout` while it is still connected,
  in the task of the rebuild: the skin forgets the entry only a microtask later, after
  `palette.changed` has focused its replacement (or the tab stop, when the rebuilt palette no
  longer offers the entry).
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

- A pointer click (`event.detail >= 1`) on the zoom panel, a palette entry, a File/Model menu
  action or Share hands the focus to the canvas (`canvas.focus()`), so Delete and the arrows act at
  once. Enter and Space leave it on the control.
- WebKit and Firefox on macOS do not focus a clicked button: never wait for the clicked control to
  hold the focus before handing it on.
- When an island hides while it holds the focus, move the focus first, or it falls to `<body>`.
- While a shell is attached the canvas `<svg>` gets `role="application"` and an `aria-label`, so
  screen readers do not swallow its single-key commands.

## Dialogs

- The shell's dialog is a native `<dialog>` opened with `showModal()`: the browser puts it in the
  top layer, makes the page behind it inert and closes it on Escape (`cancel`). The top layer's
  containing block is the window, so `100%` would size the dialog by the window. Its sizes refer to
  the modeler's container instead (guide §5.1, also for §8). Container units would do that only
  under a size container: they follow the DOM, not the containing block, and resolve against the
  shell root even in the top layer, but against the window in a host without a mounted shell whose
  element is no size container, and `container-type: size` would collapse an element sized by its
  content. So `dialog-centre.ts` measures the content box of the dialog's container
  (`clientWidth` and `clientHeight` less the padding, what `cqw` and `cqh` measure on the shell
  root) and sets it as `--modeler-shell-container-width` and `-height` on the `<dialog>`, which
  `width` and `max-height` read; `cqw` and `cqh` stand in until then and for an element without a
  box. A container taller or wider than the window (an embedded modeler in a long page) would size
  the dialog past the window, with its header and Close out of reach, so `width` and `max-height`
  also take `100% - 32px`, which for a fixed element is the window (checked in Chromium and
  WebKit): the same 16px of backdrop as around a dialog in a small container.
- The top layer centres the dialog in the window, which in an embedding host (a designIQ widget, a
  side panel) can lie far from the diagram. So `dialog-centre.ts` shifts it with an inline
  `translate` over the part of its container that shows, as long as it fits there with 16px around
  it (guide §5.1, §8), and leaves it in the window's centre otherwise; sized from the container,
  it always fits one that shows whole. A `translate` moves the box and nothing else: the size
  stays as the container made it, and the `::backdrop`, a separate box of the top layer, still
  covers the whole window. The window is the root's client box, in quirks mode `<body>`'s, since
  `<html>` reports its own box there. The container's visible part is its rect inside the window
  and inside every ancestor that clips its overflow and has the container in its containing-block
  chain (a scrolling side panel): an overflow clip applies to a descendant
  through its containing block, so an absolutely positioned container escapes an unpositioned
  ancestor and a fixed one every ancestor but a transformed one (or one with `filter`,
  `perspective`, `contain`, `will-change` of these); `<body>` and `<html>` hand their overflow to
  the window. It is measured again once per animation frame while the dialog is open and in the
  document: no observer reports a move of the container that changes no size, nor an element
  around it that shrinks and clips more of it, nor content that lands above it in a page as high as
  the window. A frame reads the rects and the computed styles of the chain and writes to the
  `<dialog>` only what changed, so an idle frame invalidates nothing. The shift is divided by the
  page's CSS `zoom` (the dialog's rendered width over its laid-out one), because a `translate` is
  scaled by it like the box while the rects are in window pixels; for the same reason the 16px
  band of the fit check is scaled by it, or a dialog sized from its container would never fit it
  below zoom 1.
- The dialog sets `position: fixed; inset: 0; margin: auto` and `translate`, `transform`,
  `scale`, `rotate`, `transition` and `animation` to none itself, because the centring (the UA's,
  then the shift) assumes them, and `min-width`, `max-width` and `min-height` as well as its own
  `width`, `height` and `max-height`, because it is sized from its container; a foreign page's
  `dialog { ... }` rule could otherwise change them (Pico CSS stretches every dialog over the
  window). Size and place sit on `.cd-shell-dialog[open]`, which beats `dialog[open]` and
  `dialog:modal` too.
- `showModal()` keeps Tab inside the page, not inside the dialog: after the last Tab stop the
  browser moves on to its own UI, and in a VS Code webview to the workbench. WebKit's Shift+Tab
  also skips Close (buttons are no Tab stops there by default) and lands on the `<dialog>` itself.
  So a `keydown` listener on the document moves the focus between the dialog's stops itself, in DOM
  order with a named radio group as one stop, wraps at the ends and brings a focus that left back
  in. It leaves a Tab alone while the focus sits in another open dialog (one opened above it), and
  calls `preventDefault` only when its stop took the focus: a dialog behind a newer modal one is
  inert.
- Chromium (and Firefox) make a scrolling element without focusable children a Tab stop of its own,
  WebKit does not. The listener would skip such a stop it does not know, so the body gets an
  explicit `tabindex="0"` while it overflows (a `ResizeObserver`), and every engine scrolls it by
  keyboard. When it stops overflowing while it holds the focus, the dialog moves the focus on to
  the next stop, which the browser would drop to `<body>`.
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
- **Document sync (0.8, `registerModelerEditor` and `connectDocumentSync`).**
  - _Minimal line edits._ A whole-document replace moves every cursor of a side-by-side text editor
    to the end of the file. The edit replaces only the lines between the longest shared start and
    end, with `\n` breaks that VS Code writes as the document's own.
  - _One write at a time._ `applyEdit` lands later than the extension asks, so each edit is diffed
    against the document the previous one left; queued edits are not merged, so every canvas change
    stays one undo step.
  - _Echoes._ The change event of an own edit carries the document's text in its own line breaks:
    the echo set compares texts without `\r`, and holds every pending write, since the events of
    quick edits may arrive in any order. A change event without content changes is a save or a
    dirty-state change, never a sync.
  - _A refused edit_ (read-only file) leaves the canvas ahead of the document: the extension posts
    the document back as an `update`, unless a newer edit is queued, whose outcome decides.
  - _The webview_ imports one text at a time, writes only after its first import and never while it
    shows an invalid file read-only, and posts an edit only when the text differs from the one it
    showed last; an update that differs from it in formatting only is not imported again.
- **Key interception.** VS Code forwards every `keydown` that reaches the webview's `window`, whether
  prevented or not. So the webview stops every key it handled on `document` (zoom keys, Escape with an
  open menu, keys the canvas already prevented such as Cmd+C or Cmd+A) and lets the rest through.
  The smoke driver's keys step checks it in a real VS Code for the zoom keys, Shift+1, Cmd/Ctrl+A
  and Cmd/Ctrl+C (see below).
- **Undo and redo keep the view.** The document's text changes, so the webview imports it, and an
  import resets what it draws. Each webview therefore reads the viewbox and the selected ids before
  the import and puts both back after it, for the ids the new text still has. The smoke driver's
  history step checks it in a real VS Code, with the redo and the undo of the edit (see below).
- **Theme bridge.** The extension writes `data-cd-theme`/`data-cd-kontrast` into the HTML and posts
  changes; re-send when a hidden panel becomes visible. The body classes are only a fallback when
  no extension speaks, and `vscode-high-contrast-light` must be checked before
  `vscode-high-contrast`.
- **Hygiene.** Reset VS Code's default webview styles (body padding, fonts, `kbd`, `code`, links,
  focus rings, scrollbars). Never use `var(--vscode-font-family)`: undefined elsewhere, it
  invalidates the whole declaration. Bundle fonts as files, not data URLs. Never add
  `'unsafe-eval'`; a webview with zod 4 sets `z.config({ jitless: true })` first. Mirror
  `vscode-reduce-motion` as the shell's own class. The smoke driver's motion step checks it in a
  real VS Code when the setting changes, its reload step at start (see below).
- **State.** `retainContextWhenHidden: true`; a hidden tab may report 0 × 0, which the shell skips.
  With another editor in front in the same group, VS Code 1.96 and 1.144 reported no resize at all:
  they hide the frame with `visibility: hidden` and keep its size. Legend state and view go through
  `vscode.setState` under `modelerShell`, written 250 ms after the view rests; a stored view wins
  over the first fit. The smoke driver's hidden step checks a background tab in a real VS Code, its
  reload step Developer: Reload Window (see below).

## PNG export

`svgToPng` of `./export` draws a renderer's standalone SVG on a canvas (guide §10.7: 2×, the
notation's light background, no grid).

- **An SVG image is a document of its own.** The page's `@font-face` rules do not reach it and it
  loads nothing from outside, so Geist goes into the SVG with its files as `data:` URLs, only the
  subsets the text uses.
- **One hidden text per subset.** An SVG image counts as loaded before a subset that only a later
  character needs has loaded (designIQ, headless Chromium: the Ł of "Kettle from Łódź" in the system
  sans). A hidden text up front, in the subset's style and weight and in a character no later subset
  of that style and weight draws, loads every subset first. `font-display: swap`, since `block` lost
  every label once.
- **`data:`, not `blob:`.** A widget's CSP (MCP Apps: `img-src 'self' data:`) refuses `blob:`
  images. Then `image.decode()` after `load`, which can fire before an embedded font is ready.
- **VS Code cannot fetch its fonts.** The webview CSP has no `connect-src`, so the webview passes its
  Geist files to `svgToPng` as `data:` URLs from its script; the stylesheet keeps them as files.
- **A background the canvas can fill.** `CSS.supports("color", …)` accepts `var()` and the CSS-wide
  keywords, which a canvas ignores, so the PNG came out black. The check sets the value over a
  gradient fill style and wants a colour back; `currentcolor` and `light-dark()` are refused by name.
- **The fallback reaches the app.** A font that cannot be read still gives a PNG, in the system
  sans, and `onFontFallback` lets the app say so: a `console.warn` alone reaches no user (guide §9).
- **Measure against a far fallback.** The tests compare a label's ink width in the PNG with the
  page's own drawing in Geist and in a fallback. On Linux the system sans and monospace came within
  a few pixels of Geist for some labels, and the canvas and an SVG image round glyph positions
  differently, so the test SVG brings Geist Mono as its fallback and the PNG has to be far nearer
  Geist than Geist Mono.

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
- **Steps by default (0.8).** The keys, the history and the workbench steps started opt-in, through
  `VSCODE_SMOKE_OPT_IN`, which CI's smoke set for every modeler and the template: a change to the
  five smoke tests would make release-please release every extension and Team Topologies for a
  test change. Once all five modelers and the template passed them in CI, on the `engines.vscode`
  minimum and on stable, they became the default, and the driver stopped reading
  `VSCODE_SMOKE_OPT_IN`. `VSCODE_SMOKE_SKIP` skips one for the same reason the opt-in existed: a
  modeler's CI or a local run that cannot take a step leaves its test alone. The driver reads the
  variable before it starts VS Code, also when every step's option is given, so a typo throws
  instead of passing unseen; the option wins over the variable. Like every `VSCODE_*` variable it
  stays out of VS Code's environment. A new step starts opt-in again and joins them once every
  modeler passes it in CI.
- **Key interception (0.7).** The keys step records every `keydown` of the webview with
  three listeners: on `window` in the capture phase (the key arrived), on `document`, added after
  the shell's and the modeler's, so `defaultPrevented` says whether something handled it, and on
  `window` in the bubble phase (VS Code would see it). A zoom key on `window` is a failure even
  when it was handled. VS Code zooms its window through `webFrame.setZoomLevel` in the workbench,
  so the level is read in Electron's main process (`webContents.getZoomLevel()` through
  `electronApp.evaluate`), with the workbench's `devicePixelRatio` as a second reading, after
  every key: VS Code's own zoom reset is Cmd/Ctrl+numpad 0, so one reading at the end could miss a
  zoom a later key took back. A first Shift+1 sets the fit the last one must restore: an
  inspector or a legend opened since the fixture's first fit changes the fit insets. Both fits
  settle on the same target, so the last one has to show the first one's readout exactly. The fit
  animates for 250 ms, though, and on its way from 100 % its readout passes the reference even
  where it heads for another fit, so the driver waits `FIT_ANIMATION_MS` and reads until two reads
  agree before it compares. Where the readout already shows a key's target (a fixture that fits at
  100 %), the driver zooms in first, or that key would prove nothing. Select all has to select more
  elements than were selected before it, since an earlier step may have left one selected. The
  clipboard is only read, never written, so a local run on macOS leaves the user's clipboard alone.
- **History (0.8).** The history step runs after the keys and before the workbench steps, so
  the zoom and the selection it leaves are in no screenshot. The webview's view is not in the page's
  API, so the driver reads the viewport group's matrix (`.djs-container > svg > .viewport`): scale
  and translation, which with the container's size are the viewbox. It zooms away from the fit
  first, or a webview that refits after an import would pass by landing on the same view, and
  selects every element, or an empty selection would pass. A selection is judged by ids: what was
  selected and is still drawn has to be selected, and nothing new may be, which leaves out the
  element the redo brings back and the undo takes away. A modeler that gives every element a new id
  on an import fails, since a dropped selection would otherwise look like one that was never there.
  The redo's canvas is compared within two pixels per shape, each shape paired with a partner of its
  own, since the edit's canvas holds the gesture's positions and the redo's the saved text's, which
  rounds. An edit that leaves the shapes as they were cannot show the redo on the canvas, so VS Code
  has to call the document changed after it. The view has to hold for 0.5 s after it matched: a
  restore or a refit may follow the import. The step presses redo and undo `undoSteps` times each,
  the same number of document edits as the edit made, and ends with the undo, so the document is the
  saved one again. It reads the state after the keys step on purpose: nothing in it edits the
  document, so the redo history of the undo step is still there.
- **Workbench steps (0.8).** `workbench` names three steps, run last in this order: `motion`,
  `hidden`, `reload`. One name, because they started opt-in and became the default together; each
  keeps its own timing, result and failure prefix.
  - _Reduced motion._ The setting goes into `settings.json`, like a theme, and counts once
    `.monaco-workbench` shows it: `reduce-motion` or `enable-motion` in VS Code 1.96,
    `monaco-reduce-motion` or `monaco-enable-motion` in later releases. A write VS Code missed is
    written again after 2 s. VS Code's body class and the shell's mirror are read apart, so a
    failure names whose part is missing. The fit's views are recorded frame by frame in the
    webview (the viewport's matrix on every `requestAnimationFrame`), as the shell's own
    `reducedMotion` case does with at most 3 views. The views of a fit without reduced motion are
    only reported: a slow runner draws few frames of a glide, and a check would fail for that.
  - _Hidden tab._ The step selects every element first, as the history step does, or an empty
    selection would pass for a kept one. Cmd/Ctrl+N opens an untitled text editor in the same group,
    in front of the modeler's. VS Code hides a retained webview with `visibility: hidden` on its
    overlay container, so the frame counts as hidden by `checkVisibility`. Shift+1 then has to type
    `!` into the text editor: it proves that the key went somewhere, and it is the fit on the
    canvas, which would move the view if the webview took it. The theme switch while hidden tests
    that the theme bridge sends again on return. Backspace empties the untitled file before
    Cmd/Ctrl+W: an empty untitled file is no change, so VS Code closes it without the save prompt, a
    native dialog that no driver can answer. The step marks the webview's document (a global in its
    window) and wants the mark back, which tells a retained webview from one VS Code built again.
  - _Reload Window._ Cmd/Ctrl+R runs Developer: Reload Window: VS Code binds it in an extension
    development host, which every smoke run is. Playwright keeps the same page across the reload,
    so the driver marks the workbench's document too and waits until a read finds no mark (reads
    during the reload fail and count as "not yet"). The step redoes the edit and saves it, so the
    document after the reload differs from the one VS Code opened at start. It cannot keep the
    change unsaved: VS Code registers no backup folder for a window with `extensionDevelopmentPath`
    (`doOpenInBrowserWindow` in the main process), so the backups live in memory and go with the
    reload. In CI's first run every modeler then came back with a dirty tab over the file on disk,
    and a save did nothing; a user's window, which has backups, is not affected.
    `workbench.reduceMotion` is "on" before the reload, so the new webview has to start under
    reduced motion: that is the "at start" half of the setting, which a change while the webview
    runs does not show. The dirty state is read once the restored view has held for 0.5 s, so a
    webview that echoes its first import back as an edit fails even when VS Code marks the tab a
    moment late. A legend mounted with `menuEntry: false` has nothing to toggle it, so its state
    goes unchecked and the result says so. The step runs only with the modeler's editor in front
    again, so a hidden step that left the untitled editor open fails once, as the hidden step, and
    not again as the reload.
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
- `ToolManager` and `Dragging`: a tool is put down on `<tool>.ended` and `.canceled` unless the
  event's `originalEvent` lies in `.group[data-group="tools"]`; `canceled` fires only for a drag
  that was active; the drag's context is still set during `drag.cleanup`.
- `Keyboard`: bound to the canvas `<svg>`, `preventDefault()` without `stopPropagation()`.
