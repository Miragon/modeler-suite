# @miragon/modeler-shell — implementation notes

`@miragon/modeler-shell` is the shared, framework-free implementation of everything around a
Miragon diagram-js modeler: menu button, tool palette, tooltips, zoom panel, keys, fit, problems pill,
legend, status box and the plumbing to its host (a VS Code webview, a web app, or an embedding host
such as designIQ). **Status: 0.3** in [`packages/shell`](../../packages/shell), Phase 4 of
[#4](https://github.com/Miragon/modeler-suite/issues/4): 0.1 brought the IDE host, 0.2 the web app's
chrome (see [Web app host](#web-app-host)), 0.3 a driver for smoke tests in a real VS Code (see
[VS Code: smoke tests in a real VS Code](#vs-code-smoke-tests-in-a-real-vs-code)), 0.3.1 its wait for
a complete save and its Docker mode; its public API is
documented in [`packages/shell/API.md`](../../packages/shell/API.md). Where building it showed a note
to be wrong or incomplete, the note was corrected here.

The source of truth for look and behaviour is the Miragon design system: the Claude skill
`modeler-tool-design` in Miragon/corporate-identity, guide
[`plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md`][guide], §5
(chrome anatomy) and §13.3 to §13.5 (appearance and IDE hosts). The guide defines what users and
reviewers experience: sizes, anchors, surfaces, states, keys and their effect, timing, ARIA,
accessibility and the rules per host. These notes explain how to get there with diagram-js, VS Code
and browser APIs: services and events, DOM and CSS techniques, host quirks.

The design system repository is private, so the guide links in these notes open only for Miragon
staff. Every section therefore links the guide section it implements and restates its rule in one
line (**Guide §x.y.** Rule: …); the mechanics follow. If a note and the guide disagree, the guide
wins and the note gets fixed. If you cannot read the guide and something here looks wrong or
incomplete, open an issue in [Miragon/modeler-suite](https://github.com/Miragon/modeler-suite/issues); a
maintainer checks it against the guide.

Checked against diagram-js 15.28.1 (the guide requires at least 15.28) and against VS Code's webview
host page (`src/vs/workbench/contrib/webview/browser/pre/index.html` on `main`, October 2026). What
can only be confirmed in a running VS Code is collected in
[Open verification points](#open-verification-points).

## Glossary

The design system names its tokens and attributes in German. The names used in these notes:

| Name                                                                                  | Meaning                                                                                                                       | Value                                  |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `--cd-shell-rand`                                                                     | edge: distance of every island from the container edge                                                                        | 12px                                   |
| `--cd-shell-luecke`                                                                   | gap: trigger to dropdown, island to island in one stack                                                                       | 8px                                    |
| `--cd-shell-zeile`                                                                    | row: height of every island in the top and bottom rows                                                                        | 40px                                   |
| `--cd-shell-ziel`                                                                     | target: button or entry inside an island                                                                                      | 32px                                   |
| `--cd-shell-eintrag`                                                                  | entry: minimum height of a menu entry, default button in dialogs                                                              | 36px                                   |
| `--cd-shell-frei`                                                                     | free line: first free line below the top row and above the bottom row                                                         | 64px                                   |
| `--cd-shell-menue-breite`, `--cd-shell-inspector-breite`                              | minimum dropdown width, inspector width                                                                                       | 248px, 288px                           |
| `--cd-shell-einpassen-oben`, `-oben-schmal`, `-seite`, `-unten`, `-unten-web`         | fit insets: top, top with the palette in the second row, left and right, bottom, bottom in the web app with the problems pill | 88, 140, 24, 64, 92px                  |
| `--cd-shell-schmal`, `-sehr-schmal`, `-niedrig`                                       | breakpoints: narrow and very narrow (width), low (height)                                                                     | 760, 440, 820px                        |
| `--cd-shell-ebene-inseln`, `-inspector`, `-reihe`, `-aufklapper`, `-dialog`, `-toast` | layers (`z-index`): islands, inspector, top row, dropdowns (dropdown, popover, chrome tooltip), dialog, toast                 | 20, 25, 30, 40, 50, 60                 |
| `--cd-ui-grund`                                                                       | ground: app background and canvas surroundings                                                                                | per mode                               |
| `--cd-ui-flaeche`, `--cd-ui-flaeche-hoch`                                             | surface of a docked panel; raised surface (dropdown, dialog, tooltip, inspector)                                              | per mode                               |
| `--cd-ui-hover`, `--cd-ui-plot`                                                       | hover and pressed surface; drawing area                                                                                       | per mode                               |
| `--cd-ui-linie`, `--cd-ui-kontur`                                                     | line (decorative borders, separators); contour (input borders, at least 3:1)                                                  | per mode                               |
| `--cd-ui-text`, `--cd-ui-text-leise`, `--cd-ui-link`                                  | text, muted text, links                                                                                                       | per mode                               |
| `--cd-ui-interaktion`, `--cd-ui-fokus`                                                | interaction (selection, active-tool ring, hover icon); focus ring                                                             | per mode                               |
| `--cd-ui-<status>`, `--cd-ui-<status>-flaeche`                                        | status colour and status surface for `success`, `warning`, `danger`, `info`                                                   | per mode                               |
| `--cd-ui-chrome-deckkraft`                                                            | opacity of glass islands                                                                                                      | 84 %, opaque in dark and high contrast |
| `data-cd-theme`                                                                       | mode attribute: `light`, `dark` or `system`                                                                                   |                                        |
| `data-cd-kontrast="hoch"`, `kontrast: "hoch"`                                         | high contrast ("hoch" means high), on the same element as `data-cd-theme`                                                     |                                        |
| radius `sm`, `md`, `lg`, `pill` (`--cd-radius-*`)                                     | corner radii                                                                                                                  | 6, 12, 16, 999px                       |
| `shadow-1` to `shadow-3` (`--cd-shadow-*`)                                            | elevation, from resting islands to dropdowns and dialogs                                                                      |                                        |
| `--cd-motion-fast`, `-base`, `-slow`; `--cd-ease`, `--cd-ease-out`                    | durations; easing                                                                                                             | 150, 250, 400ms                        |

## Where the tokens come from

- `cd-tokens.generated.css` (every `--cd-*` variable, the roles per mode) and
  `cd-tokens.generated.json` (the roles per mode as hex, plus `shell` with the shell dimensions) are
  generated in the design system repository and published unchanged at
  <https://corporate-identity.netlify.app/brand/cd-tokens.generated.css> and
  <https://corporate-identity.netlify.app/brand/cd-tokens.generated.json>. The `shell` group appears
  there with design system release 1.12.0.
- The modelers vendor them unchanged, for example
  [`modelers/wardley-maps/packages/renderer/src/theme/cd-tokens.generated.css`](../../modelers/wardley-maps/packages/renderer/src/theme/cd-tokens.generated.css).
  A vendored copy is never edited by hand; it is re-copied from the source.
- The shell's scripts compute with their own copy of the sizes (`SHELL`), its stylesheet reads the
  vendored `--cd-shell-*` tokens. A modeler pins the two together in a unit test (Vitest or
  `node:test`), not in its e2e suite, because the check is pure data:
  `expect(SHELL).toEqual(shellSizesFromTokens(json.shell))`, and every name of `SHELL_TOKENS` present
  in `json.shell`.
- Load the token CSS exactly once: first in the stylesheet order, unless the renderer's stylesheet
  already imports it (Event Storming's `event-storming.css` does, in a layer).
- `cd-canvas.css` (the mapping of the diagram-js variables and the `cd-c-*` role classes) ships only
  with the design system skill so far and is not public yet.

## What a modeler hands to the shell

**Guide [§5][guide-5].** Rule: the chrome is the same for every modeler; only the modeler knows its
content.

| The modeler supplies                                                      | The shell uses it for                       |
| ------------------------------------------------------------------------- | ------------------------------------------- |
| content bounds in diagram coordinates, tight (empty means nothing to fit) | fit (§5.9)                                  |
| whether the file is empty, whether an example exists                      | empty-file hint (§13.5)                     |
| diagnostics with count and highest severity                               | problems pill (§5.10)                       |
| whether the file is invalid                                               | status box, read-only canvas (§5.12, §13.5) |
| legend content                                                            | legend (§5.10)                              |
| entries of the Model menu group                                           | menu (§5.4)                                 |
| palette entries with name and shortcut (`title`, `shortcut`)              | palette and its tooltip (§5.5, §5.6)        |
| the list of keyboard shortcuts                                            | "Keyboard shortcuts…" dialog (§5.4, later)  |
| the inspector                                                             | inspector (§5.11)                           |

What stays with the modeler, because only it knows its elements: keyboard creation from the palette
at `viewport.freeRectCenter()` (see [Palette](#palette)), the canvas lock of a read-only file
(context pad, move, resize, delete, paste, label editor; see [Status box](#status-box)), select all
on the canvas (see [VS Code: key interception](#vs-code-key-interception)) and, until the shell has
a dialog component, the "Keyboard shortcuts…" dialog itself (see [Modeler dialogs](#modeler-dialogs)).

The host hands the shell's side to the renderer through factory options. The
[`@miragon/modeler-api`](../../packages/api/README.md#factory-options) contract names them since 1.2,
the same for every notation: `freeArea: { insets: () => shell.fitInsets() }` or
`freeArea: { center: () => viewport.freeRectCenter() }`, `fitOnImport: false` when the viewport fits
after every import, and `undoRedoKeys: false` in the IDE host. Each renderer adopts them in its own
release; until it does, the host passes the renderer's own names (`freeRectInsets`, `freeRectCenter`,
Wardley's `keyboard: { undoRedo }`), or both. After that the renderer's own names stay deprecated
aliases for one minor release of that renderer.

The content bounds go the other way. Since 1.3 the contract reports them (`contentBounds()`, tight,
in diagram coordinates, `undefined` while there is nothing to fit), so `connectDiagramJs` reads them
from the renderer's contract instance (`modeler`) when the host passes no `contentBounds` of its own.
Before, every host had to know where each renderer keeps them (Event Storming's `boardBounds`,
Wardley's `panConstraint`, which designIQ reached into). The renderer's own fit after an import is
not the shell's concern: whether it uses the free area is the renderer's choice (contract 1.3 docs of
`FreeArea`), and a host on the shell passes `fitOnImport: false`, since the viewport fits after
every import.

The shell talks to diagram-js only through public services and events (`canvas`, `zoomScroll`,
`keyboard`, `palette`, `eventBus`). It never reads private fields such as `palette._container`, which
hosts still do today (Miragon/design-iq#136): the palette's container comes with the `palette.create`
event.

## Container, not window

**Guide [§5.1][guide-5.1], [§5.15][guide-5.15].** Rule: every size, breakpoint and height is relative to
the modeler's container, never to the window, so an embedded modeler behaves like one in its own
webview.

- The shell root gets `container-type: size` and `position: relative`; the islands are
  `position: absolute` inside it.
- `container-type: size` applies size containment: the root no longer takes its height from its
  content. It must get width and height from outside (`height: 100%` in the webview and the web app,
  an explicitly sized element in an embedding page), otherwise it collapses to 0.
- Use container query units, never viewport units: `cqw` and `cqh` instead of `vw` and `vh`. Every
  container-relative size the guide writes as a percentage is written with them, so it resolves
  against the shell root and not against whatever positioned element happens to be the containing
  block:
  - dropdown `max-width: min(320px, 100cqw - 24px)`, `max-height: calc(100cqh - 72px)`;
  - tooltip `max-width: min(280px, 100cqw - 24px)`;
  - bottom sheet `max-height: 45cqh`;
  - inspector `max-height: calc(100cqh - 128px)`;
  - legend `max-height: calc(100cqh - 64px - <bottom> - 12px)`, with the palette in the second row
    `calc(100cqh - 116px - <bottom> - 12px)`;
  - problems popover `width: min(320px, 100cqw - 24px)`, status box
    `max-width: min(560px, 100cqw - 24px)`, palette in the second row
    `max-width: calc(100cqw - 24px)`;
  - the components of guide §8 wherever the shell renders them: dialog
    `width: min(560px, 100cqw - 32px)`, confirmation `min(440px, 100cqw - 32px)`, both
    `max-height: calc(100cqh - 32px)`; toast `width: min(480px, 100cqw - 24px)`; empty-state card
    `width: min(400px, 100cqw - 24px)`.
- No element inside the shell gets a `container-type` of its own. `cqw`/`cqh` resolve against the
  nearest query container, so a nested one would silently change their meaning. Name the root
  (`container-name: cd-shell`) and write `@container cd-shell (…)` so host CSS cannot interfere.
- The canvas slot is usually the renderer's own container (`modeler.container`), which brings its
  own class rule: Event Storming's `.event-storming-container` sets `position: relative`, a paper
  colour and a dot grid at the same specificity as `.cd-shell-canvas`. Split the slot's rule: the
  layout (`position: absolute; inset: 0`, layer 0, `isolation: isolate`) at a higher specificity
  (`.cd-shell > .cd-shell-canvas`), so it does not depend on stylesheet order; the paint at zero
  specificity (`:where(.cd-shell-canvas) { background-color: var(--cd-ui-grund) }`, never the
  `background` shorthand), so the renderer's paper shows. That paper keeps `--cd-ui-grund` as its
  colour in every mode, its dot grid a background image in `--cd-ui-linie` (guide
  [§10.1][guide-10.1]): a renderer that paints its own surround (Event Storming's `style dark` board
  in navy under a light theme) is half-dark. Shell conformance compares the painted colour, the
  first non-transparent `background-color` from `.djs-container` out through the slot to the root,
  with `--cd-ui-grund`; comparing the custom properties alone would miss it.
- In a foreign page the page's element rules (`button { text-transform: uppercase }`,
  `p { font-size: 18px }`, `section { font-family: serif }`, specificity 0,0,1) beat inheritance and
  any zero-specificity reset. Re-establish font, colour, letter and word spacing, text transform,
  indent and shadow on the chrome's own islands, controls and texts with one rule at class
  specificity (`:where(.cd-shell) :is(.cd-shell-island, .cd-shell-target, .cd-shell-status-text, …)`,
  0,1,0), placed before the component rules, which then set their own size and weight (the readout's
  13px/600) at the same specificity later in the file.
- Breakpoints are `@container` queries on the shell root, never `@media` (see
  [Narrow and low containers](#narrow-and-low-containers)).
- Scripts measure the container with a `ResizeObserver` on the shell root, never with
  `window.innerWidth`/`innerHeight`.
- The sizes come from the vendored tokens: CSS uses `var(--cd-shell-*)`, scripts read the `shell`
  object of `cd-tokens.generated.json`, whose keys are the CSS variable names and whose values are
  strings with unit (`"88px"`, layers `"20"`): `parseFloat(tokens.shell["--cd-shell-einpassen-oben"])`.

## Geometry hooks

**Guide [§5.2][guide-5.2], [§13.4][guide-13.4].** Rule: every island sits at a fixed anchor with fixed
sizes in every host; tests check the position of each island to 1px.

- Every island carries `data-chrome` with its name: `menu`, `palette`, `primary`, `zoom`,
  `problems`, `legend`, `inspector`, `status`. On the palette the attribute goes onto diagram-js's
  `.djs-palette` element.
- Shell conformance runs in every modeler's e2e suite in a real browser. It finds the islands through
  this attribute and asserts their boxes within ±1px. There are no pixel goldens: the islands are
  glass, so their pixels depend on the diagram underneath.
- "Relative to the shell root" means relative to the root's padding box, where `position: absolute`
  islands anchor: `getBoundingClientRect()` minus the root's `getBoundingClientRect()` minus
  `root.clientLeft`/`clientTop`. A foreign page may give the root a border (a framed embedded
  modeler); measured against the border box, every island would be off by its width.
- The expected boxes, relative to the shell root (guide §5.2 to §5.15, IDE host unless noted):

  | Island      | Expected box                                                                                                                        |
  | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
  | `menu`      | 40 × 40 at `top: 12px; left: 12px`                                                                                                  |
  | `palette`   | 40 high at `top: 12px`, horizontally centred; second row `top: 64px`                                                                |
  | `primary`   | web app only: 40 high at `top: 12px; right: 12px`                                                                                   |
  | `zoom`      | 40 high at `right: 12px; bottom: 12px`, 173px wide with a 56px readout                                                              |
  | `problems`  | 40 high at `left: 12px`, `bottom: 12px` (web app `40px`, above the legal line)                                                      |
  | `legend`    | `left: 12px`, `bottom: 12px` without pill, `60px` with pill (web app `40px` and `88px`); up to 440px width at least `60px`          |
  | `inspector` | 288 wide at `top: 64px; right: 12px`; up to 760px width a bottom sheet with 12px left, right, bottom                                |
  | `status`    | horizontally centred under the palette at `top: 64px` (second row `116px`); with an open inspector centred in the strip to its left |
  | dropdown    | `top: 60px; left: 12px`                                                                                                             |
  | tooltip     | top row `top: 60px`, second row `top: 112px`, bottom row `bottom: 60px`, centred on its control                                     |

- The guide's limits belong to the same check: legend at least 184px wide, status box at most
  `min(560px, 100cqw - 24px)`, side inspector ending at least 64px above the bottom, bottom sheet at
  most `45cqh`, palette in the second row at most `100cqw - 24px`, dropdown between 248px and
  `min(320px, 100cqw - 24px)` wide and at least 12px above the bottom, tooltip at most
  `min(280px, 100cqw - 24px)` wide and 12px from the sides. While the bottom sheet is open, zoom
  panel, pill and legend are hidden (guide §5.11).

## Menu

**Guide [§5.4][guide-5.4].** Rule: a click outside the open menu closes it without moving focus and
still acts on its target, also on the canvas.

- While the menu is open, listen for `pointerdown` on `document` with `{ capture: true }`. diagram-js
  stops pointer events on its own surfaces: palette and context pad call `stopPropagation()` on
  `mousedown`, the dragging module stops the events of a drag, and canvas interaction events stop
  propagation when a listener returns `false`. A bubble-phase listener would miss these clicks.
- Neither stop nor prevent the event, so the click still reaches its target (a palette tool, an
  element on the canvas).
- Open on Enter, Space and ↓ in the trigger's `keydown` with `preventDefault()`; otherwise the
  button's native click toggles the menu a second time.
- The dropdown lives in the layer at the end of the shell root (see [Tooltip](#tooltip)), so a Tab
  from it would leave the shell. On Tab, close the menu and move the focus to the trigger without
  `preventDefault()`: the browser's Tab then continues from the trigger to the palette.
- Stop every key the menu consumes (↑ ↓ Home End, the type-ahead letters, Enter, Space, Delete,
  Backspace, and ↓ ↑ Enter Space on the trigger) with `stopPropagation()`, in every host, as the
  palette does. A modeler's keyboard on `document` runs before the shell's listener and does not
  look at `defaultPrevented`: Event Storming's would move the selected sticky on ↓ (and write that
  to the document), delete it on Delete and start a sticky on E. Let Escape, Tab, modified keys and
  the chrome keys through (the shell's listener closes on Escape, zooms and fits with the menu open).
- A click into the VS Code workbench (side bar, another editor) or into another iframe moves the
  focus out of the document without a `pointerdown` in it. Close the menu on the window's `blur`,
  without moving the focus: from the user's view it was a click outside. Do not close on a
  `focusout` without `relatedTarget`: a click on the menu's own heading or separator causes one too.
- Dropdown limits: `max-width: min(320px, 100cqw - 24px)`, `max-height: calc(100cqh - 72px)` (see
  [Container, not window](#container-not-window)).
- An action of the File or Model group clicked with a pointer hands the focus to the canvas instead
  of the trigger (see [Focus after a click](#focus-after-a-click)).
- The shortcut chip of an action or dialog entry is `aria-hidden`. Read as content, it joins the
  entry's accessible name: Chrome named the entries "Keyboard shortcuts… ?" and "Export as SVG ⌘E",
  a screen reader heard the key twice next to `aria-keyshortcuts`, and a dialog entry's name no
  longer ended with "…". Where `aria-keyshortcuts` names no key (`ariaKeyShortcuts: ""`, a chip
  such as "G then D", a character such as "@" that guide [§5.6][guide-5.6] rules out as a
  shortcut), the chip describes the entry through `aria-describedby` instead. An element
  referenced there counts even though it is `aria-hidden`, so the name stays clean and the key still
  reaches assistive technology.

## Palette

**Guide [§5.5][guide-5.5].** Rule: the palette is one horizontal glass island, 40px high, at the top
centre in every modeler; it lies above context pad and label editor and comes before the canvas in the
tab order.

- **Position.** diagram-js styles `.djs-palette` as a vertical column
  (`left: 20px; top: 20px; width: 48px`, floating 46 × 46 entries). The shell overrides it with
  `top: 12px; left: 50%; transform: translateX(-50%); width: auto` and lays `.djs-palette-entries`
  and each `.group` out as one flex row of 32 × 32 entries.
- **Surface.** `cd-canvas.css` (vendored from the design system) maps the diagram-js surface
  variables (`--bio-surface` and friends) to the opaque `--cd-ui-flaeche-hoch`, so the diagram-js
  palette on its own is opaque. The shell CSS sets the glass on top (guide §5.3):
  `background: color-mix(in srgb, var(--cd-ui-flaeche-hoch) var(--cd-ui-chrome-deckkraft), transparent)`
  with `backdrop-filter: blur(8px)`, 1px border in `--cd-ui-linie`, radius `md`, `shadow-1`. Use a
  selector of at least specificity 0,2,0 (`.djs-palette[data-chrome="palette"]`) so the result does
  not depend on stylesheet order.
- **Layer.** The palette stays inside the diagram-js canvas container (layer 0, see
  [Layers](#layers)) with `z-index: 110`. The context pad has 100 (set by diagram-js), the label
  editor 100 (set by the modeler), and every other persistent overlay a modeler adds stays at 100 or
  below (see [Layers](#layers)).
- **DOM order.** `Palette#_init` appends the palette to `canvas.getContainer()` after the `<svg>` and
  then fires `palette.create` with `{ container }`. On that event the shell moves it in front of the
  canvas `<svg>` (the `svg` of the `canvas.init` event, which diagram-js fires on `diagram.init`,
  after every `__init__` service exists): `canvasContainer.insertBefore(container, svg)`.
  DOM order, and with it the tab order, then puts the palette before the canvas (the `<svg>` carries
  `tabindex="0"`). A renderer must not add a tab stop of its own around them: Event Storming sets
  `tabindex="0"` on `canvas.getContainer()` (the `.djs-container` holding palette and `<svg>`), an
  unnamed stop before the palette. Shell conformance tabs from the menu trigger to find such stops;
  a check of the elements' tree order alone does not.
- **Rebuilds.** `Palette#_update` clears and rebuilds all entries on every change and then fires
  `palette.changed`. Entries are `div.entry` elements with `data-action`, plus `role="button"` and
  `aria-label` when the entry has a `title`; entries without a `group` land in group `default`. After
  every `palette.changed` the shell re-applies what it adds: `role="toolbar"` and `aria-label="Tools"`
  on the entries container, roving `tabindex` (0 on one entry, -1 on the rest), `aria-pressed` on
  tool entries and `aria-keyshortcuts` on every entry with a `shortcut` (guide §5.6; the chip alone
  never reaches a screen reader, because the tooltip's label equals the entry's `aria-label`).
  Renderers give `title` and `shortcut` separately; a title like "Domain Event — E" puts the key into
  the name instead.
- **Active tool.** diagram-js fires `tool-manager.update` with `{ tool }` (the tool name, `null` when
  none is active) and marks the matching entry in group `tools` (`data-action="<tool>-tool"`) with
  `highlighted-entry`. Do not mirror that class: `Palette#updateToolHighlight` caches the tools group
  on its first call (`_toolsContainer`) and never refreshes it, so after a rebuild the class lands on
  detached entries. The shell keeps the tool name of the last `tool-manager.update` itself, sets
  `aria-pressed` from it after every `palette.changed`, and styles `[aria-pressed="true"]`. Until
  the first rebuild the class still sits on a live entry, and `diagram-js.css` colours
  `.djs-palette .highlighted-entry` with `!important`: the skin overrides that colour with
  `!important` at a higher specificity (plus a hover variant).
- **Colours in every state.** Set `color` explicitly on a skinned tool entry in each state, never
  rely on inheritance: rest and `[aria-pressed="true"]` `--cd-ui-text`, hover (also while pressed)
  `--cd-ui-interaktion`, `[aria-disabled="true"]` `--cd-ui-text-leise` (also over a stale
  `highlighted-entry`), and give the icon (`.entry > svg`, `.entry::before`) `color: inherit`. A
  state the skin leaves open takes whatever a renderer or diagram-js rule sets on the entry or its
  icon: Event Storming's armed lasso computed to `rgb(29, 30, 33)` instead of `--cd-ui-text`. Only
  tool entries (group `tools` or `data-action` ending in `-tool`) inherit; notation previews keep
  their own colours (guide §5.5). Shell conformance compares the computed colours of every visible
  tool entry and its icon with the roles: at rest, pressed and hovered in `appearance` (after the
  150ms colour transition), `aria-disabled` in `readOnly`.
- **Keyboard.** Roving tabindex: ← and → move and wrap, Home and End jump, all without
  modifiers and stopped there (a modeler's document listener and VS Code never see them; chrome keys
  still bubble to the shell). Enter and Space dispatch a synthetic `click` on the entry: it goes
  through diagram-js's click delegate and `palette.trigger`, so the read-only veto applies without
  calling private palette methods. The click is a contract for palette providers: `detail === 0`
  (every pointer click has 1 or more), `clientX`/`clientY` at the entry's centre, bubbling and
  cancelable.
- **Pointer activation.** A click on an entry or a drag from it hands the focus to the canvas once
  diagram-js has run the entry (see [Focus after a click](#focus-after-a-click)); Enter and Space
  leave it on the entry.
- **Keyboard creation** (guide §5.5: the element goes to the centre of the free rectangle, 24px
  diagonally further while that spot is taken, selected, with the label editor open where the
  notation has labels, and the focus on the canvas). diagram-js's create tool (`create.start`) makes
  the shape follow the pointer and never ends without one, so a creating entry that receives the
  synthetic click (`detail === 0`) must not start it: Event Storming's entries did nothing on Enter
  until they branched. The provider asks for the point with `viewport.freeRectCenter()` (the centre
  of the container minus the fit insets, in diagram coordinates, as fit computes it), creates the
  shape there with `modeling.createShape`, selects it, calls `canvas.focus()` and opens its label
  editor. The provider is built before `connectDiagramJs`, so it receives a function and reads the
  viewport when the entry fires (the factory option `freeArea`, see
  [What a modeler hands to the shell](#what-a-modeler-hands-to-the-shell)). The 24px step is the
  provider's; a shared placement helper is a later candidate. Shell conformance (`create`) presses
  Enter on the first creating entry and expects exactly one new, selected shape whose centre lies in
  the free rectangle.
- **Read-only** (guide §13.5). Only Lasso and Hand stay active; every other entry changes the diagram
  and is vetoed, also tools of group `tools` such as draw, space or connect. `palette.trigger`
  carries the entry definition without its id, so the veto finds the entry element through the
  event's `delegateTarget` or `target` (min-dom's delegate sets `delegateTarget`); without one only
  group `tools` passes. The veto applies from the invalid import on, the `aria-disabled` marks after
  the delay of [Status box](#status-box).
- **Two columns.** On every `canvas.resized` diagram-js decides from the container height whether
  the vertical palette needs two columns and toggles `two-column` on the palette and
  `djs-palette-two-column` on the container. The horizontal skin ignores both classes.
- **Group separator.** Between two `.group` elements: `margin-left: 8px` before the line and
  `padding-left: 9px` after it (the 1px line at `left: 0` sits inside the padding, so 9px leave 8px
  of space after it). Draw the line as a `::before` inset 4px at top and bottom; a `border-left`
  would run the full 32px.
- **Separator entries.** Entries with `separator: true` render as `<hr class="separator">`, which
  diagram-js styles as a horizontal line; the horizontal skin draws them as a 24px vertical rule with
  8px of space on each side (6px margin plus the 2px gap).

## Tooltip

**Guide [§5.6][guide-5.6].** Rule: palette entries and chrome buttons show the same chrome tooltip with
a shortcut chip, after 300ms hover or at once on keyboard focus, on the dropdown layer above status box,
legend and inspector.

- Render the tooltip outside the canvas container, in a layer element directly under the shell root
  at `z-index: var(--cd-shell-ebene-aufklapper)` (40). Inside the canvas container (layer 0,
  `isolation: isolate`) it would sit below status box, legend and inspector whatever its z-index.
- Do not render it inside an island either: an island with a `z-index` is a stacking context of its
  own, so a tooltip inside it could not rise above the inspector, and `backdrop-filter` makes a glass
  island the containing block of `position: fixed` descendants. Position the tooltip with
  `position: absolute` in the shell root's padding-box coordinates: differences of
  `getBoundingClientRect()`, minus `root.clientLeft` and `clientTop` (a foreign page may border the
  root).
- "At once on keyboard focus" means `:focus-visible`: in Chromium a mouse click focuses the button
  too, and showing on every focus would flash the tooltip the click must hide.
- "A neighbour's at once while one is shown" needs a grace window: `pointerleave` on one control
  hides its tooltip before `pointerenter` reaches the next, so at that moment none is shown. After a
  hover-hide, a neighbour shows at once for `TOOLTIP_DELAY_MS`.
- Set `aria-describedby` only where the tooltip says more than the control's name (guide §5.6), for
  example the pill's "Show in Problems view". A shortcut chip says more, unless the control names
  its keys in `aria-keyshortcuts` (the zoom buttons, palette entries and menu actions do).
- diagram-js 15.28 ships its own palette tooltip: `PaletteTooltip` on top of `HoverTooltip`, shown on
  `mouseover` only and therefore never on keyboard focus, placed to the right of a vertical palette.
  The shell replaces it with an empty service in the modeler's modules:
  `{ paletteTooltip: ["value", null] }` (a later module overrides the earlier definition in didi; the
  palette module still lists `paletteTooltip` in `__init__`, which then resolves to `null`).
- Name and shortcut come from `palette.getEntries()` (`title`, `shortcut`), keyed by the entry's
  `data-action`. Re-read them on `palette.changed`.
- The 300ms hover delay is the delay of diagram-js's `HoverTooltip` (`SHOW_DELAY = 300`), so palette,
  chrome and canvas tooltips feel the same.
- `max-width: min(280px, 100cqw - 24px)` (see [Container, not window](#container-not-window)).
- Shortcut chip (`kbd`): set every property of the guide's spec explicitly, including
  `box-shadow: none` and `vertical-align: baseline`. Otherwise the host's `kbd` style leaks through:
  VS Code's default webview stylesheet colours `kbd` with its keybinding colours and adds an inset
  shadow and `vertical-align: middle` (see [VS Code: host hygiene](#vs-code-host-hygiene)).

## Zoom panel

### Readout

**Guide [§5.8][guide-5.8], [§2][guide-2].** Rule: the readout shows the zoom as a whole percentage in
the UI language (English "86%", German "86 %" with a no-break space) and follows every zoom change; its
`aria-label` names target and state ("Zoom to 100% (now 86%)").

- Format with `new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 })`, `lang`
  being the tool's language (`<html lang>` in its own document, see the next bullet for a foreign
  page). For German it puts U+00A0 (no-break space) before the percent sign.
  Every other number in the chrome ("2 problems") goes through `Intl` with the same language (guide
  §2: one language per tool).
- In a foreign page the page's `<html lang>` may name another language than the tool's. There the
  shell root carries the tool's `lang` itself (guide §2), so read the language with
  `root.closest("[lang]").lang`, not from `document.documentElement`.
- Update after `canvas.viewbox.changed`, reading `canvas.zoom()` at most once per animation frame
  (`requestAnimationFrame`).
- If a modeler enables `canvas.deferUpdate`, diagram-js debounces `canvas.viewbox.changed` by 300ms,
  and the readout would lag. `canvas.viewbox.changing` still fires synchronously before every change:
  schedule the frame read from it as well; by the time the frame runs, the change is applied.

### Steps

**Guide [§5.8][guide-5.8].** Rule: buttons and keys zoom in fixed steps (22, 30, 41, 55, 74, 100, 135,
182, 246, 331 %) plus the limits 20 and 400 %, which are not steps (from 20 % zoom in goes to 30 %, from
400 % zoom out to 331 %); the mouse wheel uses the same steps plus the half steps between them and zooms
only with Ctrl (on macOS also Cmd) or a pinch; a step starts from the nearest full step, at a wheel half
step from either neighbour (86 % zooms in to 135 %, 64 % to 74 %); buttons and keys zoom around the
container centre, the wheel around the pointer.

- Buttons and keys call `zoomScroll.stepZoom(±1)`. Using `stepZoom` is what keeps buttons and wheel
  on one raster. The shell adds no rounding of its own.
- The raster: `ZoomScroll` has a fixed `RANGE = { min: 0.2, max: 4 }` and `NUM_STEPS = 10`. One step
  is `log10(20) / 10` in log space, a factor of `20^(1/10) ≈ 1.349`. The raster is anchored at 100 %
  (`log10(1) = 0`): full steps are 22.4, 30.2, 40.7, 54.9, 74.1, 100, 134.9, 182.1, 245.6 and
  331.4 %; 20 % and 400 % are not on it and are only reached by capping (`cap(RANGE, …)`).
- The wheel (`ZoomScroll#zoom`) uses half that step (26.0, 35.0, 47.3, 63.8, 86.1, 116.2 % and so on),
  one half step each time the accumulated wheel delta exceeds 0.1. diagram-js zooms with the wheel
  only with Ctrl (or Cmd on macOS) or a trackpad pinch, which browsers report as `wheel` with
  `ctrlKey`; a plain wheel pans. The wheel listener is only bound while the pointer is over the canvas.
- `ZoomScroll#_zoom` first snaps the current zoom to the nearest step
  (`Math.round(log10(zoom) / step) * step`) and then moves one step. That gives the guide's examples:
  95 % after a fit goes to 135 % (zoom in) or 74 % (zoom out); 86 % after one wheel notch goes to
  135 % on zoom in.
- The snap explains the guide's edge cases:
  - A wheel half step lies exactly between two full steps, and `canvas.zoom()` is rounded to three
    decimals, so the rounding decides which neighbour wins: 86.1 % snaps up (zoom in → 135 %), 63.8 %
    snaps down (zoom in → 74 %).
  - 20 % snaps to the 22.4 % step (zoom in → 30 %); 400 % snaps to the 447 % step beyond the limit
    (zoom out → 331 %). The wheel half step 385 % snaps down to 331 % (zoom out → 246 %).
- `stepZoom` without a position calls `canvas.zoom(scale)`, which zooms around the centre of the whole
  canvas container (`outer.width / 2`, `outer.height / 2`), not of the free rectangle. The wheel
  passes the pointer position. 100 % is `canvas.zoom(1)`, also around the container centre.

### Limits

**Guide [§5.8][guide-5.8].** Rule: zoom out is disabled at 20 % and below, zoom in at 400 %; zoom out
never zooms in.

- 20 % and 400 % are `ZoomScroll`'s fixed `RANGE` (0.2 to 4); it is not configurable through
  `config.zoomScroll`.
- Disable zoom out when `canvas.zoom()` is at most `0.2 * 1.001`, zoom in when it is at least
  `4 * 0.999`. The getter returns the scale rounded to three decimals (`round(matrix.a, 1000)`), and
  the tolerance absorbs that and floating-point noise at the limits.
- Below 20 % (possible after fitting a large diagram) `stepZoom(-1)` snaps, steps down and then caps
  the result to 20 %, which zooms in. That is why zoom out is already disabled below the limit, not
  only at it.

### Key matching

**Guide [§5.8][guide-5.8].** Rule: only Cmd/Ctrl + `+`/`=`, `-`/`_` and `0` (also with Shift and on the
numpad) and Shift+1 act; Cmd and Ctrl both work on every platform; nothing acts with Alt, during IME
composition or in a text field (every input field, select list and editable text: label editor,
inspector, dialog and popover fields).

- "Cmd/Ctrl" is `event.metaKey || event.ctrlKey` on every platform, like `isCmd` in diagram-js
  (`KeyboardUtil`), which also returns `false` whenever `altKey` is set because Windows reports AltGr
  as Ctrl+Alt.
- `+`/`=` and `-`/`_` are matched by the produced character (`event.key`), with or without Shift.
- Numpad keys are matched by `event.code`: `NumpadAdd`, `NumpadSubtract`, `Numpad0`. `code` also
  covers Numpad0 with NumLock off, where `key` is `"Insert"`.
- Fit is matched by `event.code === "Digit1"` with `shiftKey` and without `metaKey`, `ctrlKey` and
  `altKey`, so it is the physical 1 key of the number row on every keyboard layout (`key` is `"!"` on
  US and German layouts, but `"1"` on French AZERTY).
- Ignore every shortcut with `altKey` or while `event.isComposing` is true. Escape during IME
  composition belongs to the IME: it does not close the menu (but in VS Code it is still stopped
  while a menu or dialog is open).
- A text field is `input`, `textarea`, `select` or `[contenteditable]`, an element that edits
  through an `EditContext` and anything inside a Monaco editor: check the event target with the
  core's `isTextField` (`target.closest(TEXT_FIELD_SELECTOR)`, `target.isContentEditable`,
  `target.editContext` and `target.closest(".monaco-editor")`); this covers the label editor, the
  fields of inspector, dialogs and popovers and the code editors a host page embeds (Monaco types
  into an EditContext element where the browser has one, into a hidden textarea elsewhere). There
  the zoom keys do not zoom and Shift+1 types `!`.
- Unmodified `+`/`-` must not be bound anywhere, also not in a modeler's own keyboard module.

### One place for the keys

**Guide [§5.8][guide-5.8].** Rule: every press of a zoom key acts exactly once, also where diagram-js or
the modeler know the same key.

- diagram-js binds Cmd/Ctrl + `+`/`=`, `-` and `0` itself on the focused canvas `<svg>` as soon as
  the editor actions `stepZoom` and `zoom` are registered (`KeyboardBindings`, default priority
  1000). Its `Keyboard` service calls only `preventDefault()` on a handled key, never
  `stopPropagation()`, so the event still bubbles to `document`.
- The shell registers `keyboard.addListener(2000, listener)` and returns `true` for the chrome keys.
  A non-`undefined` return value stops the diagram-js event bus, so `KeyboardBindings` and the
  modelers' keyboard modules (default priority 1000) never see these keys, and no key zooms twice.
- The keys are executed only in the shell's own DOM listener (see
  [Where the listener listens](#where-the-listener-listens)). It handles them regardless of
  `defaultPrevented`, because diagram-js's `Keyboard` has called `preventDefault()` on every key a
  listener returned a value for, including the shell's own.
- diagram-js 15 binds its `Keyboard` to the canvas `<svg>` and ignores no event target
  (`_isEventIgnored` returns `false`), so a text field inside the `<svg>` (a `foreignObject` label
  editor) reaches it too. For a chrome key from a text field the listener returns `false` instead of
  `true`: the event bus stops there, and since only a truthy result makes the `Keyboard` call
  `preventDefault()`, Shift+1 still types "!" and the shell's DOM listener treats the zoom keys as
  blocked.
- Listeners on one target run in registration order. A modeler whose own keyboard listens on
  `document` (Event Storming does) must register it before the shell's listener, so construct the
  diagram before mounting the shell; otherwise the shell's listener runs first and cannot see that the
  modeler handled the key (`defaultPrevented`). Listeners on the canvas `<svg>` are always earlier.

### Where the listener listens

**Guide [§5.8][guide-5.8].** Rule: in its own document the keys work wherever the focus is, except in
text fields and while a dialog is open; embedded in a foreign page only while the focus is inside the
modeler. In the web app Cmd/Ctrl + `+`, `-` and `0` zoom the diagram, not the page, except in text
fields and dialogs. A dialog there is a modal dialog: a non-modal popover (the problems list) does
not block the keys (since design system 1.15.0, [corporate-identity#37][ci-37]).

- Own document (VS Code webview, web app, iframe): one `keydown` listener on `document`, bubble
  phase. The diagram-js keyboard on the `<svg>` has run by then, so `defaultPrevented` tells the
  shell which keys the canvas handled.
- The listener does not execute the chrome keys while the focus is in a text field or a modal dialog
  (guide §8, `[role="dialog"][aria-modal="true"]`) is open. Popovers are `role="dialog"` without
  `aria-modal` and do not block the keys. Count `[role="dialog"]`, `[role="alertdialog"]` and
  `<dialog open>` outside `[hidden]`, in the document or (embedded) in the shell root; modal is
  `aria-modal="true"` or `:modal` (a `<dialog>` opened with `showModal()`). In VS Code the listener still stops the blocked keys and
  the keys the canvas handled (see [VS Code: key interception](#vs-code-key-interception)).
- Foreign page (embedded without iframe): the listener sits on the shell root. `keydown` is
  dispatched to the focused element, so it only reaches the root while the focus is inside it.
- Web app: call `preventDefault()` on Cmd/Ctrl + `+`, `-` and `0` unless the focus is in a text field
  or a modal dialog is open, so the browser does not zoom the page. In text fields and modal dialogs
  do nothing: the browser zooms the page. Behind the start screen do nothing either: there is no
  diagram to zoom, so Ctrl+ is the browser's (WCAG 1.4.4), and the diagram-js guard returns `false`
  so diagram-js zooms nothing. Zooming via the browser menu always stays possible.
- What the listener additionally stops in an IDE host: see
  [VS Code: key interception](#vs-code-key-interception).

### Focus after a click

**Guide [§5.8][guide-5.8]** (since design system 1.14.0). Rule: a click with mouse, pen or finger on
the zoom panel, a palette entry or a menu entry that acts on the canvas hands the focus to the canvas,
so Delete, the arrows and Cmd/Ctrl+Z act at once; Enter and Space leave it on the control.

- Why the focus matters: the diagram-js 15 keyboard listens on the canvas `<svg>`, and the
  renderers' own key handlers act only while their canvas has the focus (Value Chain, and Event
  Storming, Context Maps and Wardley Maps, whose palettes and context pads also hand it back without
  the shell) or while the canvas or the page itself has it (Team Topologies since 0.11).
  Chromium (and Firefox outside macOS) focus a clicked button on `mousedown`, so after a click on +
  the next Delete went to the button. A click on a creating palette entry was worse: the click that
  places the element does not move the focus either, because diagram-js ends the create drag on that
  `mousedown` in the capture phase and prevents its default, the browser's focus move. Delete then
  missed the new element.
- Pointer or keyboard is told by `event.detail` of the `click`: 1 or more for mouse, pen and touch
  (2 on a double click), 0 for Enter and Space on a button, for the palette's synthetic click (see
  [Palette](#palette)) and for a desktop screen reader's activation. Every engine sets it, and the
  palette's providers already branch on it (guide §5.5).
- The DOM shell knows no canvas API, so it calls `focus()` of the bound zoom target; the adapter's
  viewport implements it with `canvas.focus()` (diagram-js 15: `focus({ preventScroll: true })` on
  the `<svg>` and `canvas.focus.changed`, on which `MoveCanvas` binds its drag). A zoom target without
  `focus` (a host without the adapter) leaves the focus where the click put it.
- Zoom panel: the button's `click` handler runs the key, then hands the focus over. A button at its
  limit (`aria-disabled`) zooms nothing and still hands it over: the click was meant for the canvas,
  and the button must not keep its keys.
- Palette: one `click` and one `dragstart` listener on the palette element. diagram-js binds its own
  delegates for both on the same element in `Palette#_init`, before `palette.create`, so they run
  first and the entry's action (a tool, `create.start`) has run when the shell moves the focus.
  `Dragging#init` calls `stopPropagation()`, which does not reach other listeners of the same
  element. A vetoed entry (read-only canvas) gets the same hand-back. A `dragstart` comes from a
  pointer only, so it needs no `detail` check.
- Menu: only `action` entries of the File and Model groups, which change what the canvas shows.
  Export and Help actions hand over to the host (a save dialog, a download, a page), after which
  guide §5.4 wants the focus on the trigger; `dialog` entries keep it as well, so the dialog returns
  the focus there. The menu closes first, the canvas takes the focus, then `onSelect` runs, so a
  handler that opens the browser's file picker returns the focus to the canvas. If the canvas did not
  take the focus, the trigger gets it as before.
- Open… and Import… hand the focus to the canvas on purpose, unless the web app sets
  `FileMenuAction.dialog` for a dialog of its own. The browser's file picker is no dialog in the
  modeler (the guide's wording), and the file picked there shows on the canvas, where the keys then
  act; on cancel the canvas keeps the focus. The dialog openers that
  [#19](https://github.com/Miragon/modeler-suite/issues/19) leaves as they were are therefore the
  `dialog` entries, which keep the trigger.
- A click on a zoom button while the menu is open: the capture-phase `pointerdown` closes the menu
  without moving the focus (see [Menu](#menu)), then the click hands it to the canvas.
- Touch: a tap is a click with `detail` 1 and hands the focus over too, which a tablet with a
  keyboard needs. The `<svg>` takes no ring then: the clicked or tapped control took the focus
  first, and a focus a script moves after such a pointer focus does not match `:focus-visible`
  (checked in Chromium, see [Open verification points](#open-verification-points)). Without that
  pointer focus, on the first click on the page or on an entry that takes no focus after the
  keyboard moved it last, the script focus rings the whole canvas; a renderer that hands the focus
  back without the shell (Event Storming, Wardley Maps) therefore focuses the `<svg>` with
  `focusVisible: false`.
- Not handed back: the menu trigger, the pill and the primary action open something that takes the
  focus; the legend's close button returns it to the trigger; a problem row already focuses the
  canvas (see [Problems popover](#problems-popover)).
- Shell conformance (`focusHandBack`) clicks each zoom control and a palette tool with the pointer,
  each focused by script first, and presses Enter and Space on zoom in. It also clicks the first File
  or Model action without a dialog (canvas), then presses Enter on it (trigger), as guide
  [§5.4][guide-5.4] states since [corporate-identity#36][ci-36]; a modeler without such an entry
  declares `absent: ["canvasMenuAction"]`.

### Shortcut labels

**Guide [§5.8][guide-5.8], [§5.6][guide-5.6].** Rule: tooltips show the labels of the machine the user
sits at, also when VS Code works on another system over Remote: on macOS `⌘+`, `⌘−`, `⌘0`, `⇧1`,
elsewhere `Ctrl+Plus`, `Ctrl+Minus`, `Ctrl+0`, `Shift+1` (German `Strg`, `Umschalt`); "Plus" because `=`
is not on the plus key of German keyboards. `aria-keyshortcuts` follows the same platform, with WAI-ARIA
key names.

- Read the platform in the webview or page itself, in every host:
  `navigator.userAgentData?.platform || navigator.platform`, macOS if it matches `/mac/i`. Use `||`,
  not `??`: an empty `userAgentData.platform` means unknown and must fall back to
  `navigator.platform`. The webview always runs on the client, so its own `navigator` reports the
  keyboard in front of the user.
- Do not label shortcuts from `process.platform` in the extension: with VS Code Remote (SSH, WSL, Dev
  Containers) a custom-editor extension usually runs on the remote machine, so `process.platform`
  names the remote OS. See [Open verification points](#open-verification-points).
- `aria-keyshortcuts` values (WAI-ARIA 1.2: modifiers first, then the key pressed, named by its
  unshifted character, the plus sign as `Plus`; `code` names such as `Equal` are invalid): zoom in
  `Meta+= Meta+Plus`, zoom out `Meta+-`, 100 % `Meta+0`, fit `Shift+1`; outside macOS `Control`
  instead of `Meta`.
- A chip's `aria-keyshortcuts` (`ariaKeyShortcutsFromLabel`: palette, menu, the start screen's
  link) names keys, not the character they type (guide [§5.6][guide-5.6] since design system
  1.21.0, [corporate-identity#54][ci-54], [#72](https://github.com/Miragon/modeler-suite/issues/72)).
  WAI-ARIA 1.2 makes it a MUST: "If the character used is determined by a modifier key, the author
  MUST specify the actual key used to generate the character … It is incorrect to specify "%" or
  "Shift+%"." Which key that is depends on the layout, so a character that needs ⇧ on the US or the
  German layout names the keys of both, US first, as zoom in names two: `?` → `Shift+/ Shift+ß`,
  `/` → `/ Shift+7`, `#` → `Shift+3 #`, and once where both agree, `!` → `Shift+1`. Up to 0.5 the
  shell passed the character through (`?` → `?`). The table in `keymap.ts` holds only the
  characters that need ⇧ in one of the two; letters, digits, `,`, `.` and `-` sit on the same
  unshifted key in both, and `ß` keeps its case, as the key is called (`"ß".toUpperCase()` is
  `"SS"`).
- ⇧ stands only where the main keys need it. Zoom in reacts to `=` as well (`matchChromeKey`), so a
  chip `⌘+` or `Ctrl+Plus` gets the zoom panel's `Meta+= Meta+Plus`, not `Meta+Shift+= Meta+Plus`;
  `⌘−` and `Ctrl+Minus` get `Meta+-`. A shortcut on a fixed key names only that key: fit binds
  `Digit1` by `code` and stays `Shift+1` on every layout.
- A character that needs AltGr or ⌥ in one of the two layouts, sits on a dead key there or is
  missing gets no `aria-keyshortcuts`: `@` is AltGr+Q on German Windows and Linux but ⌥L on macOS,
  so not even per layout is there one key to name, `^` is a dead key, `ä` is missing in US. §5.6
  rules such a character out as a shortcut; where a modeler still shows one, the chip describes the
  menu entry, and the kit fails it.
- The kit's `aria` case (palette entries and menu items; `emptyState` for the link) reads each chip
  with `shortcutKeyKind`, which parses it as `ariaKeyShortcutsFromLabel` does, so the kit and the
  derivation share one table. It fails a chip on a ruled-out character (`@`, `[`, `⌘ä`) whatever
  the control carries, wants exactly the two-layout value for a chip whose character needs ⇧ in one
  of the layouts, also where `ariaKeyShortcuts: ""` would leave the chip as description only, and
  rejects a key name that is a character no key of either layout types alone (`?`, `Shift+?`, `@`,
  the bare `+`) and a KeyboardEvent code (`Equal`, `Slash`, `KeyA`). Key symbols such as `⏎` and
  `⌫` are no characters: a chip `⌘⏎`, which the derivation does not know, keeps its description.

## Fit

### Fit math

**Guide [§5.9][guide-5.9].** Rule: fit shows the whole content centred in the free rectangle (the
container minus the fit insets and whatever is open), never above 100 %.

- Do not use `canvas.zoom("fit-viewport")`: it knows no insets, and a diagram that already fits is
  aligned to the origin instead of being centred.
- Compute the viewbox and set it with `canvas.viewbox(box)`. The setter uses
  `scale = min(outer.width / box.width, outer.height / box.height)` and puts `box.x`/`box.y` at the
  top-left corner, so pass a box with the container's aspect ratio:

  ```ts
  const size = canvas.getSize(); // client size of the canvas container
  const free = {
    width: size.width - insets.left - insets.right,
    height: size.height - insets.top - insets.bottom,
  };
  const scale = Math.min(1, free.width / bounds.width, free.height / bounds.height);
  canvas.viewbox({
    x: bounds.x + bounds.width / 2 - (insets.left + free.width / 2) / scale,
    y: bounds.y + bounds.height / 2 - (insets.top + free.height / 2) / scale,
    width: size.width / scale,
    height: size.height / scale,
  });
  ```

- Guard the degenerate cases the snippet leaves out: bounds with a zero width or height scale by the
  other dimension (a single line), bounds without both and a container with a 0 side fit nothing (a
  no-op), and an axis whose insets leave no room (a container lower than 88 + 64 or narrower than 48)
  centres in the whole container instead of producing a zero or negative scale.

- `bounds` are the content bounds the modeler supplies: the tight bounds of the content, without a
  padding of its own. The insets below are the only margin; a padding (Event Storming's
  `BoardBounds.contentBounds()` adds 120px by default, so the webview passes `contentBounds(0)`)
  would add to them and fit the content smaller than the guide's rectangle. The insets (guide §5.9):
  - top `--cd-shell-einpassen-oben` (88px), with the palette in the second row
    `--cd-shell-einpassen-oben-schmal` (140px);
  - left and right `--cd-shell-einpassen-seite` (24px);
  - bottom `--cd-shell-einpassen-unten` (64px); in the web app while the problems pill is shown
    `--cd-shell-einpassen-unten-web` (92px) instead. The pill is not measured on top of that;
  - right with an open inspector (container wider than 760px): 324px (12 + 288 + 24);
  - left with an open legend (container wider than 440px): 12 + the legend's rendered width + 24; up
    to 440px the legend does not count;
  - bottom with an open bottom sheet (up to 760px): the distance from the container's bottom edge to
    the sheet's top edge, plus 12. While the sheet is open, zoom panel, pill and legend are hidden
    (guide §5.11), so the legend's left inset and the web pill's 92px do not count; the sheet alone
    sets the bottom. Without a measured sheet top the bottom stays 64.
- Animated fit (explicit fit only, 250ms, guide §5.9): diagram-js has no animated viewbox change.
  Interpolate the viewbox in `requestAnimationFrame` (the scale in log space) and set each frame with
  `canvas.viewbox(box)`. Record the target as the last fitted box before the first frame, and cancel
  the animation on `wheel`, `pointerdown` or a zoom key. While it runs, also compare incoming
  viewbox events with the last written frame (a `deferUpdate` event of a throttled frame carries an
  intermediate view); a cancelled animation leaves its last written frame as the reference. Stop
  the frames when the container drops to 0 × 0 (diagram-js's setter would set a scale of 0) and fit
  again once it has a size.

### First fit and the empty file

**Guide [§5.9][guide-5.9].** Rule: the first import whose content bounds are not empty fits
automatically (after an empty file: the first import with content, such as "Insert example"), unless
the user moved the view; every later change from outside keeps viewbox and selection; without content
fit does nothing.

- `afterImport()` after every successful import carries this: it jump-fits once the bounds are not
  empty, and only the first time (see [Detecting a user move](#detecting-a-user-move) for what
  ends the wait).
- An empty file shows 100 % (guide §5.9 and §13.5 since design system 1.13.0). Without it the zoom is whatever the
  renderer's import left: Event Storming's importer sets a viewbox of its own on every import, and
  an empty board showed 118 %. So on the first import with empty bounds, when no stored view was
  applied (`setState`) and the user has not moved the view, `afterImport()` zooms to 1 around the
  centre of the free rectangle. That write is the viewport's own, not a user move, so the first
  content still fits; later re-imports and `restore`s of the empty file keep the view. At 0 × 0 (a
  tab hidden at the first import) the 100 % waits for the first real size. A kit check that an empty
  document opens at 100 % with the hint is a later candidate (it needs a harness that opens more
  than one document).

### Resize

**Guide [§5.9][guide-5.9].** Rule: when the container size changes (split, side bar, bottom panel), the
view refits until the user has zoomed or panned; a 0 × 0 container (hidden tab) does not count.

- Observe the container with a `ResizeObserver` and coalesce the entries to one per animation frame.
- Then call `canvas.resized()`: diagram-js caches the viewbox including the container size
  (`_cachedViewbox`), and `resized()` drops that cache and fires `canvas.resized` (the palette
  re-lays itself out on it). Refit if the view is still automatic.
- Skip entries with width or height 0 (hidden tab, see [VS Code: host hygiene](#vs-code-host-hygiene),
  `retainContextWhenHidden`).
- Compare with the container size the view was last set for, not with the previous observation: a
  tab that comes back at the same size then neither refits nor needs `canvas.resized()`.
- A `restore` or a stored view that arrives while the container is 0 × 0 is kept and applied once
  the container has a size, without a refit at that moment; otherwise the stored view would never
  win.

### The legend settles after the first fit

**Guide [§5.9][guide-5.9].** Rule: every fit, the automatic one too, counts what is open, the legend
with its width; opening and closing the inspector, the legend or the menu and a mode switch never
fit.

- A legend that a stored state opens at the start is measured by the first fit, which can come
  before the card's font has loaded. The card then settles a pixel or two wider or narrower
  (Context Maps: about 1.6px), and without a second fit the content stays that much off the free
  rectangle's centre, which made exact fit tests flaky.
- `connectDiagramJs` observes the card with a `ResizeObserver` when the legend is open at the
  connection. A size report while it is still open calls the viewport's
  `refitIfOnlyInsetChanged("left")`: it fits again (jump) only if the left inset (the card's width)
  differs from the one the fit that set the current view measured, the other three do not, the
  content bounds equal the ones that fit framed, and nothing else has set the view since (a zoom, a
  pan, a pointer that stopped a fit animation, `restore`, `setState`, `newDocument`). A card that
  only grows or shrinks in height, an inspector opened, the problems pill or the palette's second
  row therefore never fit, and neither does content the user created, moved or deleted on the
  canvas before the font arrived: the bounds tell the shell, which sees no command stack. An edit
  that leaves the bounds as they were still gets the corrected fit, which frames the same box. A
  running fit animation is retargeted instead.
- A changed container size is left to the resize refit, which also calls `canvas.resized()`.
- The watch exists for the font load only. It ends once `document.fonts.ready` has resolved, no font
  is loading any more and two frames have passed since (the frame that lays out the loaded font
  reports the card's new size before the second one starts). It also ends after its one fit, when
  the legend closes, once the view is no longer automatic, and with the connection. So there is no
  refit loop, and a later change of the card (a row the renderer adds, the pill shrinking a card at
  its maximum height) keeps the view. Fonts that loaded before the first fit end it without a fit.
- A legend that starts closed is not watched: when the user opens it, its font has long loaded.
  Without a `FontFaceSet` (`document.fonts`) nothing is watched, since the watch could not end.

### Detecting a user move

**Guide [§5.9][guide-5.9].** Rule: every viewbox change that does not come from fitting or from
restoring after an import counts as a user move (pan, wheel, zoom buttons, keys, 100 %); only an
explicit fit (button, Shift+1, command) makes the view automatic again.

- On every `canvas.viewbox.changed`, compare the event's viewbox with the last box the shell set
  itself (fit or restore), with a relative tolerance of 1/1000. If it differs, the user moved the
  view.
- Compare the scale and the translation, not `width` and `height`: those change with the container
  size, and a resize must not count as a move. The getter rounds the transform to three decimals, which
  is why an exact comparison would fail. Compare the translation in screen pixels (`x · scale`,
  `y · scale`), relative to `max(1, |value|)`: the getter rounds the screen translation
  (`matrix.e`, `matrix.f`) and then divides by the scale, so near the origin and at small zoom the
  diagram coordinates `x` and `y` carry an error of up to `0.0005 / scale` that a tolerance relative
  to them would not absorb. Far from the origin the relative tolerance grows: at a translation of
  10 000px a pan below 10px does not count as a move, which is harmless.
- Renderers may set the viewbox while they import: Event Storming's importer calls
  `canvas.viewbox(contentBounds)` on every import. Changes between `import.parse.start` or
  `import.render.start` and `import.done` are therefore no user moves. The window also closes on the
  viewport's own `afterImport`, `restore` and `setState` and on user input (wheel, pointerdown,
  keydown on the canvas container), because a failed import never fires `import.done`.
- Do not count own changes with a flag or counter around the fit: with `canvas.deferUpdate` diagram-js
  emits `canvas.viewbox.changed` up to 300ms later (debounced), so the delayed event would be
  attributed to the user. During a fit animation without `deferUpdate`, ignore the synchronous
  intermediate events until the animation ends or is cancelled.
- A restore after an import (guide §5.9: external changes keep viewbox and selection) updates the
  reference box but does not reset the "user moved" state. It also does not count as a stored view:
  a modeler restores on every re-import, and an empty file must still fit its first content
  ("Insert example", guide §13.5). Only a persisted view (`setState`, see
  [VS Code: state](#vs-code-state)) applied while there is content replaces the first automatic fit.
- An element the user creates on the canvas never fits (guide §5.9), and edits from the canvas are
  echo-suppressed, so no import follows them. Without care the first fit would still be due when the
  user next types in the text editor, and that import would jump-fit and throw the view away. An
  `elements.changed` outside an import window, after the first import and with content, therefore
  ends the wait for the first fit. Importers usually add shapes with `canvas.addShape` (no
  `elements.changed`); one that goes through the command stack must fire `import.parse.start` or
  `import.render.start` first, or its first content counts as the user's.
- The zoom panel asks `canFit()` on every frame it renders (pan, wheel, fit animation). Cache it and
  read the content bounds again only after a content change (`elements.changed`, `shape.added` and
  `.removed`, `connection.added` and `.removed`, `diagram.clear`, `import.done`, the viewport's own
  `afterImport`, `restore`, `setState`): a modeler's bounds may be costly (Event Storming's
  `exportMap()` validates the whole board).

### Fit and an open label editor

**Contract L5 ([`@miragon/modeler-api`](../../packages/api/README.md) 1.2).** Rule: a view change the
host makes never commits an open label editor or popup input; it should stay open with the typed
text.

- Every viewbox the shell writes is such a view change, asked for by a chrome control or not: zoom in,
  zoom out and 100 % (buttons, Cmd/Ctrl+Plus, Minus and 0), Fit and Shift+1, the first fit, the refit
  on resize (opening the inspector, a side bar or a bottom panel), the refit once an open legend
  settles after the first fit, `restore` after a re-import and a stored view (`setState`). Designing
  for them is the renderer's part; the shell never commits or cancels an editor itself.
- A pointer click on the zoom panel takes the focus out of the editor before the shell acts (the
  button takes it on `mousedown`), so a renderer that commits on blur commits then. That is the user's
  click elsewhere, not the view change.
- A renderer that completes direct editing on `canvas.viewbox.changing` (the pattern of bpmn-js's
  `LabelEditingProvider`, which every renderer built against contract 1.1 followed) commits half-typed
  input on each of them. With the host's `restore` after a peer's re-import it writes the half-typed
  label into the shared document.
- The fix is the same in every renderer. diagram-js cannot tell a host's `canvas.viewbox(box)` from a
  wheel zoom, so the renderer keeps the editor open across every viewbox change and places it again
  on `canvas.viewbox.changed` (its geometry is the element's box through the new viewbox); it commits
  on the user's own gestures only (Enter, blur, `element.mousedown`, `drag.init`).
- A renderer moves to contract 1.2 with that fix, `elements.bounds` and the harness hooks
  `commitInteraction` and `moveElement` in the same release. Without them the bounds case and the
  commit halves of the L5 interaction case report skips, which fail a kit run whose `onSkip` throws.
  All five published renderers did: Wardley 0.9.0, Team Topologies 0.12.0, Event Storming 0.4.0,
  Context Maps 0.4.0 and Value Chain 0.6.0 keep their label editors open across a view change.
- The contract kit's L5 interaction case calls `setViewState` over an open editor. Shell conformance
  (`labelEditor`, 0.4) drives the shell's own view changes over one, through `harness.labelEditor`
  (`open` opens the editor and types, `documentChanged` reports a commit): a click on zoom in and on
  Fit, Cmd/Ctrl+Plus, Cmd/Ctrl+0 and Shift+1 at the canvas and a container resize, each followed by
  no document change and the typed text still in the focused field. It clicks by script
  (`HTMLElement.click()`, `detail` 0) and dispatches the keys at the canvas `<svg>`, so the focus
  stays in the editor: a real click on Fit, or a real key on the focused canvas, would take it out
  first and blame a renderer that commits on blur for the user's click elsewhere.
- With an editor open, a user reaches only the refit on resize, `restore` and `setState`: a real
  click on the zoom panel commits through the blur, and keys typed in the editor never reach the
  shell (it leaves keys from a text field alone). The scripted clicks and the keys at the canvas
  drive the shell's other viewbox writes, which go through the same `canvas.viewbox(box)`.
- Each step is judged once the view held still and 500ms more, so a late commit (a debounced resize
  handler) counts against the step that caused it. Stopping at the first commit would open the
  editor for the next step while that step's commits are still pending, and blame the next step.
- Every step has to change the view, or it proves nothing. A zoom step first snaps to the raster of
  [§5.8][guide-5.8], so from a fit between about 64 % and 86 % (Context Maps' example at 68 % and
  Event Storming's board at 84 % in 1280 × 900) the Cmd/Ctrl+Plus before Cmd/Ctrl+0 lands on
  exactly 100 %. The case then presses Cmd/Ctrl+Plus once more, itself a checked step, instead of
  asking the modelers for a document or a window size that fits at 100 %
  ([#71](https://github.com/Miragon/modeler-suite/issues/71)).
- The case requires the keep-open that L5 only recommends: an editor the view change closes without
  a commit drops the typed text, so `labelEditor` fails it, where the contract kit's L5 case only
  advises.
- `restore` and `setState` write the viewbox through the same `canvas.viewbox(box)` as the fit, so the
  case covers them through it; the re-import before a `restore` is the contract kit's L1 interaction
  case. A harness without `labelEditor` reports a skip, one that declares it `absent` (a notation
  without labels on the canvas) does not.

## Legend state

**Guide [§5.10][guide-5.10].** Rule: the host remembers whether the legend is open, in VS Code also
across a window reload, in the web app across sessions.

- VS Code: `vscode.setState`, together with the viewbox (see [VS Code: state](#vs-code-state)).
- Web app: `localStorage`. Wrap the access in `try`/`catch`: it throws when storage is blocked.
- Without a stored state the legend starts closed in every container, from the mount on; the
  container size does not matter, so a tab hidden at mount needs no first real size for it. A
  stored state wins at any size, and the user opens the legend from the Model group's Legend
  checkbox or its card's button.
- Decided by the product owner on 2026-10-24 (modeler-shell 0.5). This supersedes the rule of
  design system 1.15.0 ([corporate-identity#37][ci-37], decided for
  [modeler-suite#51](https://github.com/Miragon/modeler-suite/issues/51)), under which the legend
  started closed only up to 820px height and up to 440px width and open otherwise.
  `legendStartsOpen` stays exported for existing callers, deprecated and always `false`.

## Status box

**Guide [§5.12][guide-5.12].** Rule: the 4px status bar runs straight over the full height and does not
bend at the rounded corner.

Draw the bar as its own element (`::before`, absolutely positioned over the full height:
`top: 0; bottom: 0; left: 0; width: 4px`). A `border-left` follows the border radius and turns into a
crescent at the rounded corners. The box's own 1px border is in the status colour as well (guide §8:
"Rand 1px plus links 4px deckend in `--cd-ui-<status>`").

**Guide [§5.12][guide-5.12], [§13.5][guide-13.5].** Rule: the box for an invalid file and the visible
read-only state appear only after 800ms without a valid import and end at once with the next valid
one; the read-only lock itself applies at once.

- Repeated invalid imports while typing keep the first timer: the box shows once the text stayed
  invalid for 800ms, not 800ms after the last keystroke. A valid import cancels the timer.
- The same holds for the read-only marks (`data-readonly`, the `aria-disabled` palette entries):
  delayed like the box, so the palette does not flicker while the user types in the text editor next
  to the diagram. The lock behind them (palette veto, Model entries, `isReadOnly()`) applies with the
  invalid import, so nothing can overwrite the text in the meantime.
- An unchanged text is not written again, so `role="alert"` does not announce it again.

**Guide [§13.5][guide-13.5].** Rule: a read-only canvas keeps the palette visible with every entry
that changes something `aria-disabled` (Lasso and Hand stay active), and has no context pad, no
move, resize, delete or paste and no label editor; selection, zoom, pan, the export of the last valid
state and the shortcuts dialog stay.

- The shell locks what it owns: the palette veto and the Model entries of the menu. View toggles
  stay usable: the shell's Legend checkbox (`keepEnabledWhenReadOnly`) and the legend's close button,
  and a modeler's own view state such as Event Storming's "Type captions", which sets
  `keepEnabledWhenReadOnly` itself. A view toggle never touches the document, so a read-only file
  gives no reason to lock it (guide §13.5 since design system 1.13.0: only entries that change the
  document are `aria-disabled`).
- The canvas is the modeler's to lock, at the same moment as `setReadOnly(true)`. Event Storming's
  `eventStormingReadOnly` is a `RuleProvider` at priority 5000 that answers `false` for every edit
  rule (`elements.move`, `shape.move`, `shape.resize`, `shape.create`, `elements.create`,
  `shape.append`, `connection.create`, `elements.delete` and the other connection rules), and its
  keyboard, context pad, label editor and drawing handles ask it as well: rules alone do not stop a
  context pad from opening or a double-click from opening the label editor. Until it covered all of
  them, its lock held only the palette.
- Shell conformance (`readOnly`) makes the file invalid through the harness's `show.invalid` hook and
  checks, after the delay, the marks, the palette, that Export, Help and the Legend checkbox stay
  enabled, and on a shape: no context-pad entry after a click, Delete and Backspace keep it, a 40px
  drag changes neither its position nor its size, a double-click opens no text field.

## Layers

**Guide [§5.13][guide-5.13].** Rule: everything diagram-js shows on the canvas (search, context pad,
popup menu, element tooltips, palette, label editor) stays on canvas layer 0 below every island; within
it the palette lies above context pad and label editor.

- The canvas container gets `isolation: isolate`, so diagram-js's own z-indices stay local to
  layer 0: search 10, context pad 100, popup menu 200, hover tooltips 1000 (`.djs-hover-tooltip`,
  `position: fixed`, which does not escape the stacking context), palette 110 and label editor 100
  (set by the modeler). Once the palette tooltip is replaced (see [Tooltip](#tooltip)), only hover
  sources a modeler registers for canvas elements still use `.djs-hover-tooltip`.
- The islands use the tokens `--cd-shell-ebene-*`: islands 20, inspector 25, top row 30, dropdowns,
  popovers and the chrome tooltip 40, dialog 50, toast 60.
- The shell root gets `isolation: isolate` as well, so these values stay local when the shell is
  embedded in a foreign page.
- The dialog layer (50) applies only to a dialog that is not in the browser's top layer. A
  `<dialog>` opened with `showModal()` and an element of the popover API are rendered in the top
  layer, above every stacking context of the page, and `z-index` does nothing for them; they need no
  layer token.
- Overlays a modeler adds inside the canvas container: persistent ones (an element toolbar, its own
  context pad, the label editor) stay at `z-index` 100 or below, under the palette at 110; transient
  popups the user opens from them (diagram-js's popup menu at 200, a colour picker) may cover the
  palette while they are open, as diagram-js's own popup menu does. Everything stays inside
  `.djs-container`, and so below every island. This is the rule of guide §5.13 since design system
  1.13.0. Event Storming shipped its note toolbar and colour picker at 300,
  above the palette, and nothing flagged it. A flat "100 at most" would flag diagram-js's popup menu
  itself, hence the split into persistent and transient.
- The kit's `overlayLayers` case (added after shell 0.5.0) draws that line by behaviour, since it
  cannot know which overlay a modeler means to be transient: it looks as opened, with the label
  editor open, with one element selected per kind of context pad (a connection among them, since
  relationships often have entries of their own) and after a click on each of their entries (but a
  deleting one), and every layer of `.djs-container` above 100 must be gone once a zoom at the
  canvas changed the view, and stay gone. What stays is persistent and so too high, and so is an
  overlay that only hides while the view changes and comes back on `canvas.viewbox.changed`: that
  event arrives up to 300ms late, so the case watches for 500ms after the zoom. It reads the
  outermost stacking context below the container: a `z-index` inside another one (diagram-js's
  overlay container carries a transform) cannot reach above the palette and does not count. An
  entry it cannot click again fails the case instead of going unchecked. Value Chain's links
  showed why: once one is selected, diagram-js's bendpoint and segment handles cover the middle
  and both quarters of its L-shaped line, so the case reads the selection from the `selected`
  marker, not from a click.

## Modeler dialogs

**Guide [§8][guide-8], [§5.4][guide-5.4].** Rule: a dialog has a backdrop in `--cd-ui-backdrop` with
`blur(3px) grayscale(1)` in both modes, an opaque panel with border, `md` radius and `shadow-3`, a
header with Close; it holds the focus and returns it; Escape and the backdrop close it. The Help
group's "Keyboard shortcuts…" is such a dialog, with one table per group (View, Edit, Tools).

0.2 has no dialog component, so a modeler's dialog meets these rules on its own (a shared
`cd-shell-dialog` class and `showShortcutsDialog` are later candidates):

- Open it with `showModal()`: the top layer puts it above every island without a layer token, the
  browser makes the rest of the page inert, and `:modal` tells the shell's key listener that a modal
  is open, so the zoom keys stop acting. `::backdrop` inherits custom properties from its dialog
  since Chromium 122 (VS Code 1.90 ships it), so `var(--cd-ui-backdrop)` resolves there.
- The shell's high-contrast and forced-colours rules match only `cd-shell-*` classes and do not reach
  the modeler's dialog. It sets them itself: under `[data-cd-kontrast="hoch"]` no shadow, border
  `--cd-ui-kontur` and a 3px focus ring (guide [§6][guide-6], [§5.14][guide-5.14]); under
  `@media (forced-colors: active)` the border in `CanvasText` and the focus ring in `Highlight`.
- Focus: into the dialog on open, held inside while it is open (Tab cycles), back to the control
  that opened it on close (the menu trigger after a menu entry, which takes the focus before
  `onSelect` runs).
- The dialog stays usable on a read-only canvas (guide §13.5).
- The dialog is modeler content in the shell root. `shell.destroy()` removes only what the shell
  added, so the modeler removes the dialog in its own teardown, for example on `diagram.destroy`
  (Event Storming does). The shell offers no `onDestroy` hook for it: the modeler already owns the
  teardown path that destroys diagram and shell.

## Focus order, fonts and forced colours

### Fonts

**Guide [§5.14][guide-5.14].** Rule: chrome text is Geist 13px, buttons and fields included.

Buttons and form fields get `font: inherit`; browsers give them their own control font otherwise
(13.333px, see [VS Code: host hygiene](#vs-code-host-hygiene)).

### Tab order

**Guide [§5.14][guide-5.14], [§12][guide-12].** Rule: menu trigger, primary action, palette, canvas,
then status box, empty-file hint, inspector, bottom left (pill before legend) and bottom right; the DOM
has the same order, so screen readers read the chrome in it, and nothing has a positive `tabindex`.

The resulting DOM order of the shell root:

```html
<div class="cd-shell">
  <button data-chrome="menu">…</button>
  <button data-chrome="primary">…</button>
  <div class="cd-shell-canvas">
    <!-- the element passed to diagram-js as `container`; diagram-js creates .djs-container in it -->
    <div class="djs-container">
      <div class="djs-palette" data-chrome="palette">…</div>
      <svg tabindex="0">…</svg>
    </div>
  </div>
  <div data-chrome="status">…</div>
  <div class="cd-shell-hint">…</div>
  <aside data-chrome="inspector">…</aside>
  <div data-chrome="problems">…</div>
  <div data-chrome="legend">…</div>
  <div data-chrome="zoom" role="group">…</div>
</div>
```

The palette comes before the `<svg>` because the shell moves it there (see [Palette](#palette)); the
primary action exists only in the web app, which also puts the empty-state card after the hint and
the legal line before the zoom panel (see [Web app host](#web-app-host)). Dropdowns, popovers and the tooltip live in the layer
element described under [Tooltip](#tooltip) and are reached through their triggers, not by Tab.

### The canvas as a tab stop

**Guide [§12][guide-12], [§5.14][guide-5.14].** Rule: every interactive element shows the focus ring
in `--cd-ui-fokus` (3px in high contrast), and the focus never gets lost.

- The canvas `<svg>` is focusable but unnamed: screen readers announce a bare "image", and in NVDA's
  and JAWS's browse mode the canvas's single-key commands (E, C, L, arrows, Delete) go to the screen
  reader. While a shell is attached the adapter gives it `role="application"` and an `aria-label`
  from the messages table ("Diagram"; a modeler names its notation), and restores both on detach.
- diagram-js leaves the `<svg>` the browser's own ring (`.djs-container svg:focus { outline-offset:
-1px }`). The shell sets `outline: none` on `:focus` and the guide's ring on `:focus-visible`,
  inside (`outline-offset: -2px`, `-3px` with 3px in high contrast), because the slot clips with
  `overflow: hidden`; under forced colours in `Highlight`.
- When an island hides while it holds the focus, move the focus first, or it falls to `<body>`: the
  empty-file hint after "Insert example" and a closing inspector hand it to the canvas `<svg>` (the
  guide's "the focus goes to the canvas"), the legend's close button to the menu trigger.

### Forced colours

**Guide [§5.14][guide-5.14].** Rule: under forced colours nothing disappears: the active tool and
pressed toggles keep a 2px inner ring in `Highlight`, the status bar shows in `CanvasText`, islands have
a `CanvasText` border, icons stay visible.

- In `@media (forced-colors: active)` the browser removes `box-shadow` and replaces backgrounds. The
  active tool and every toggle with `aria-pressed="true"` therefore get `forced-color-adjust: none`
  and the ring as `box-shadow: inset 0 0 0 2px Highlight`.
- The status bar gets `forced-color-adjust: none` and `background: CanvasText`.
- Islands get `border-color: CanvasText`.
- Icons use `stroke="currentColor"` and so follow the system text colour without extra rules.
- The kit's `forcedColors` case (added after shell 0.5.0) emulates `forced-colors: active` and
  checks these marks, the open dropdown and every modeler dialog the menu opens. It compares against
  system colours it resolves on probe elements and asserts only what the CSS sets: WebKit matches
  the media query but forces no colours, Chromium does both.

## Narrow and low containers

**Guide [§5.15][guide-5.15].** Rule: the breakpoints measure the container: palette in a second row up
to 760px width or when less than 16px would stay free next to a top-row island; inspector as bottom
sheet up to 760px; legend above the bottom row up to 440px. Since 2026-10-24 the legend starts
closed at every size (see [Legend state](#legend-state)), so no breakpoint decides its start state.

- The breakpoints are `@container cd-shell (…)` queries on the shell root. Custom properties cannot be
  used in a container condition, so the queries carry the literal values (`max-width: 760px`,
  `max-width: 440px`, `max-height: 820px`); scripts read the same values from `shell` in
  `cd-tokens.generated.json` (`--cd-shell-schmal`, `--cd-shell-sehr-schmal`, `--cd-shell-niedrig`).
- The 16px gap is measured by script on every container resize and on `palette.changed`. Use the
  palette's intrinsic border-box width (`offsetWidth - clientWidth + scrollWidth`: `scrollWidth`
  leaves out the 1px borders), not its current box, so the decision does not flip once the palette
  has moved: the top row fits if `(width - paletteWidth) / 2 >= menuTrigger.right + 16`
  and, where a primary action exists, `(width + paletteWidth) / 2 <= primaryAction.left - 16` (both
  relative to the shell root). In the web app evaluate twice, with the primary action's label and
  then with its icon-only width, because the label goes first.
- The script's result is a state attribute on the shell root (for example
  `data-palette="second-row"`); the second-row CSS applies under the 760px container query or under
  that attribute, and fit uses the matching top inset.
- The palette in the second row scrolls horizontally without a visible scrollbar:
  `overflow-x: auto; scrollbar-width: none`.
- The legend's start state is state, not style: closed unless the host passes a stored
  `legend.open`, set by script at mount, never by a container query. `--cd-shell-niedrig` decides
  nothing about the legend any more.

## Appearance decision

**Guide [§13.5][guide-13.5], [§13.3][guide-13.3].** Rule: each host decides in exactly one place; a mode
the modeler cannot show is never shown (a light-only modeler stays light whatever the host reports);
high contrast always passes through.

```ts
type Theme = "light" | "dark";
type Appearance = { theme: Theme; kontrast?: "hoch" };

function resolveAppearance(requested: Appearance, themes: readonly Theme[]): Appearance {
  const theme = themes.includes(requested.theme) ? requested.theme : themes[0];
  return requested.kontrast ? { theme, kontrast: requested.kontrast } : { theme };
}
```

- `requested`: in an IDE host from `ColorThemeKind` (see [VS Code: theme bridge](#vs-code-theme-bridge))
  or the setting `miragon.<modeler>.colorTheme`, in the web app from the stored choice or the system.
- `themes`: reported by the modeler. If it cannot show the requested theme, `themes[0]` wins.
  `kontrast` always passes: under VS Code "High Contrast" (dark) a light-only modeler becomes `light`
  with `hoch`.
- `themes` is a static value of the modeler package (for example an exported `themes` constant) that
  the host reads when it renders the HTML, not from the running instance; the attributes must be
  right before the first paint.
- `resolveAppearance` ships in `@miragon/modeler-shell/core`. The shell has no runtime dependencies,
  so it does not import the rule from the contract; a later 1.x minor of the `@miragon/modeler-api`
  contract adds the `appearance` surface for embedded hosts, which decide with the same rule
  ([#4](https://github.com/Miragon/modeler-suite/issues/4)).
- Shell conformance requests dark from a light-only modeler and asserts that nothing turns dark.

## Appearance in embedded hosts

**Guide [§13.3][guide-13.3].** Rule: an embedded modeler reports which modes it supports, the host never
requests another one, and the mode is view state that never touches the document or exports; until
the contract's `appearance` surface (a later 1.x minor) an embedded modeler stays light.

- Until then the shell keeps an embedded modeler light by itself. The token CSS resolves the roles on
  the nearest `[data-cd-theme]` and they inherit, so a root without its own attribute would take the
  mode of a themed host page (designIQ, a web app on `system` under a dark OS) and draw dark chrome
  over a renderer that paints light attribute colours (guide §10.2): half-dark. The embedded root
  therefore carries `data-cd-theme="<themes[0]>"` itself (`ShellOptions.themes`, default `light`).
  The root's own `[data-cd-theme]` block would also drop the host's high contrast, so the root
  mirrors `data-cd-kontrast` from the nearest mode carrier above it, with a `MutationObserver` on the
  document's `data-cd-theme` and `data-cd-kontrast` attributes (guide §13.3: a container with its
  own `data-cd-theme` takes `data-cd-kontrast` over from the host). Shell conformance puts the
  foreign page's `<html>` in the requested mode for the embedded host, so every suite proves this.
- A later 1.x minor of the contract adds the optional surface `appearance` with `themes` (supported
  modes) and `set` (mode and contrast); hosts feature-detect it (`if (modeler.appearance)`).
- In a foreign page `set` writes `data-cd-theme` and `data-cd-kontrast` on the modeler's container
  (both on the same element, as the token CSS requires); in its own webview they stay on `<html>`.
- Appearance is view state: `onContentChanged` never fires for it, and it has no effect on
  `exportText` or image exports.

## Web app host

The web column of guide §5.2 (0.2): what a Miragon web app shows around the canvas that the IDE and
embedded hosts leave to their host. `mountShell({ host: "web" })` renders it; the API is in
[`API.md`](../../packages/shell/API.md), "Web host (0.2)". The Wardley Maps web app was the
reference implementation for this chrome. Where the guide left a case open, the shell chose a
reading; the product owner decided each of them on 2026-10-23, and design system 1.15.0
([corporate-identity#37][ci-37]) states them as rules, worded as in these notes.

### Primary action and the label collapse

**Guide [§5.7][guide-5.7], [§5.15][guide-5.15].** Rule: the primary action is a blue primary button at
`top: 12px; right: 12px`, 40px high; when the top row gets tight, it loses its label first (the
`aria-label` stays), only then does the palette move.

- `decideTopRow` (`./core`) tries the labelled width, then the icon-only width (40), then moves the
  palette to the second row, where the label comes back if it keeps 16px to the menu trigger. The
  layout pass runs it on every resize of the root, the palette and the primary action itself: the
  label widens once Geist has loaded, so a decision made with the fallback font would stay wrong.
- While the label shows, its width is measured afresh each pass. While collapsed, the label shows
  for one synchronous layout (`offsetWidth` with the label, then hidden again before the browser
  paints), so the decision can bring it back; the result is cached until `primary.refresh()`.
- The 40 × 40 style keys on an internal `data-collapsed` on the button, not on the root's
  `data-primary`, so measuring never touches root state (and never fires a root mutation).
- Collapsed, the chrome tooltip shows the label without `aria-describedby`: the tooltip repeats the
  accessible name. Expanded, it has no tooltip at all.

### Legal line and the bottom row

**Guide [§5.10][guide-5.10], [§2][guide-2].** Rule: the web app's bottom left stacks the legal line at
`bottom: 12px`, then the pill at 40, then the legend at 40 or 88; the line is 13px/20px on glass
without border and shadow, its links in `--cd-ui-link`; "© Miragon GmbH" links to the home page;
"Impressum" and "Datenschutz" stay German with `lang="de"`. Where the zoom panel would come closer
than 8px to the line, it rises to `bottom: 40px` like the pill, the bottom-row tooltip with it; in
a narrow container the line wraps between its entries, grows upwards and lifts everything stacked
above it by its height.

- Copyright, URLs and labels are the docs-site kit's (`miragon/legal.ts` in corporate-identity):
  `https://www.miragon.io/`, `/impressum/`, `/datenschutz/`, each `target="_blank"` with
  `rel="noopener noreferrer"`, separated by `aria-hidden` middle dots, in a `<nav aria-label>`.
  Every link has `aria-describedby` on one hidden "Opens in a new tab" (technique G201). The
  copyright links to `https://www.miragon.io/`, as in the Wardley web app; the docs-site kit
  rendered it as plain text. The product owner decided that it links everywhere, in the docs-site
  kit too (design system 1.15.0, [corporate-identity#37][ci-37]).
- The guide places the zoom panel at `bottom: 12px` and the legal line at `bottom: 12px`; until
  design system 1.15.0 it did not say what happens where they meet. With a GitHub link the line is
  about 391px wide, so they meet below about 600px. `zoomRowRaised` decides with the measured
  boxes (less than 8px between them) and the zoom panel then stands at `bottom: 40px` like the
  pill; the fit keeps 92px at the bottom, and up to 440px the legend's lowest position is 88px. The
  bottom-row tooltip moves with it (8px above the raised panel, 88px).
- Where the line is wider than the container allows (`100cqw − 24px`; with a GitHub link below
  about 415px), it wraps between its entries instead of scrolling: a scrolled line cut Datenschutz
  mid-word at 320px and hid GitHub, with no visible way to scroll (WCAG 1.4.10; Datenschutz must be
  reachable anyway). Each separator travels with the link after it. The line grows upwards from
  `bottom: 12px`; the shell measures its height in whole lines (`legalLineHeight`) into
  `--modeler-shell-legal-height` on the root, and the pill, the problems popover, the legend, the
  raised zoom panel and the fit's bottom (`FitLayout.legalHeight`) stand on it. The kit checks at
  320px that every link lies whole inside the line and on one line, that each separator stands on
  the line of the link after it, and that the pill, the legend and the zoom panel stand on the
  wrapped line; it measures the raised zoom row 4px and 12px from its 8px limit.

### Toasts

**Guide [§8][guide-8], [§9][guide-9].** Rule: toasts sit bottom centre at `bottom: 12px`, at most three,
the newest at the bottom; about 2.8s, errors about 5s, paused while hovered or focused; one with an
action never closes by itself; layer 60. Each card is as wide as its content, at most
`min(480px, 100% − 24px)`. The stack rises 8px above the zoom panel, the legal line or the pill only
where the centred column of its widest card would come closer than 8px to one of them.

- Layer 60 loses against a `showModal()` dialog, which lives in the top layer. The stack is
  therefore a `popover="manual"` in the web host, hidden and shown again with a toast that arrives
  while a modal dialog is open: a popover shown later stacks above a modal opened earlier. Without a
  modal it is not re-shown, which would take every shown toast out of the accessibility tree and put
  it back. Re-showing drops the focus of a toast that held it, so the toaster puts it back. Everything outside a modal dialog is inert, the top layer
  included: a toast above a dialog is visible, but its buttons react only after the dialog closed.
  The kit therefore checks the stacking (the stack's `toggle` after the dialog opened and
  `:popover-open`), not a click.
- In the embedded host the stack is absolute inside the root (a foreign page's top layer is not the
  modeler's to use).
- `toastStackBottom` keeps the centred column of the widest card 8px above a zoom panel, legal
  line or pill it would come closer than 8px to horizontally, and 12px otherwise (guide §8 since
  design system 1.15.0, [corporate-identity#37][ci-37]). The column is the card's, not the stack's
  480px: at 1280px with a GitHub link the legal line ends 7.5px before the stack, and testing the
  stack lifted every toast to 40 although "Link copied" (146px) stands far from the line. It is recomputed in the layout pass,
  whenever a toast comes or goes, and whenever the pill, the inspector (a bottom sheet hides zoom
  panel and pill) or the start screen changes.
- Screen readers hear toasts through two live regions in the root, rendered from mount on and
  visually hidden: `role="status"` (polite) and `role="alert"`. A live region inserted together
  with its text is often not announced (NVDA with Chrome, VoiceOver with Safari), and the stack is
  `display: none` and a closed popover while empty, so the cards cannot be the live regions. The
  text arrives 100ms after the region was emptied, which also announces a repeated toast; the cards
  carry no live role, so nothing is read twice. Each Close button is described by its toast's text.
- A repeated request (same status and text) restarts the shown toast and takes the new request's
  action and lifetime, so a second "Board replaced · Undo" undoes the latest replacement, not the
  first one.
- A timer paused by hover or focus resumes with at least 1.5s, so a toast does not vanish the moment
  the pointer leaves. The leave animation ends on `animationend`, with a 400ms fallback timer
  (an animation that never runs, in a hidden stack or under a page's `animation: none`, never fires
  it); under reduced motion the toast goes at once.
- Cards are as wide as their content, at most the stack's `min(480px, 100cqw − 24px)`, as in the
  Wardley and Team Topologies web apps: §8's width is the cards' maximum, not their width (design
  system 1.15.0). The kit measures each card at `max-content` and the lift where the widest card's
  column keeps 12px and 4px to the bottom row.

### Problems popover

**Guide [§5.10][guide-5.10].** Rule: in the web app a click on the pill opens the list as a popover above
it, `role="dialog"` without `aria-modal`, titled "Problems"; a click on a row selects its element.

- It is a non-modal dialog in the shell's layer, so the zoom keys keep working; like the menu it
  stops Enter, Space, Delete, Backspace and printable keys, so a modeler's document keyboard
  (Event Storming deletes the selection on Delete) never acts on them, and ↑/↓/Home/End move
  between the rows.
- Rows without an element are text, but they take the focus (`tabindex="-1"`): with only buttons
  focusable, a list of line findings (Event Storming's parser names lines, not elements) left the
  focus on the popover, whose keys were consumed, so a keyboard could not read past the visible
  rows (WCAG 2.1.1). The focused row scrolls into the list by adjusting the list's `scrollTop` only:
  `focus()` and `scrollIntoView()` would also scroll the `overflow: hidden` shell root.
- Tab from the last row closes the popover onto the pill without preventing the browser's Tab,
  which then moves on from the pill; Shift+Tab from the first row is prevented and lands on the
  pill.
- The severity shows as the pill's icon (shape and colour); for screen readers the icon is
  `role="img"` with `messages.problemSeverity` ("Error", "Warning"), so colour and shape are not the
  only signal (guide §12).
- When `setProblems` drops to 0 or the start screen shows while the list holds the focus, the focus
  moves to the canvas (else the menu trigger) instead of falling to `<body>`.

### Start screen

**Guide [§8][guide-8].** Rule: on a fresh start the web app shows the empty-state card and hides the
work chrome; only the card and the legal line are visible; once someone starts, the chrome appears.
The hint ends in a text link "Open a file…" to the File group's Open… with its shortcut chip,
underlined like a link in body text, and the chrome keys belong to the browser there, so page zoom
stays possible (WCAG 1.4.4; both since design system 1.15.0, [corporate-identity#37][ci-37]).

- The work chrome (menu trigger, primary action, palette, zoom panel, pill, legend, status box, hint,
  inspector) gets `visibility: hidden`, which also removes it from the tab order and the
  accessibility tree; the canvas slot gets `inert`, so neither a click nor Tab reaches the diagram.
  The chrome keys go to the browser: with no diagram to zoom, a swallowed Ctrl+ would leave a
  low-vision user without page zoom and without a way to reset a stored one with Ctrl+0.
- The menu is hidden and a drop needs a pointer, so the hint ends in a text link to the File
  group's "Open…" (with its shortcut chip and `aria-keyshortcuts`): the keyboard's way to a file on
  the start screen. It is part of the hint, not a third action beside the two buttons of §8, and it
  leaves the card up until the modeler's import ends the start screen (a cancelled file picker
  changes nothing).
- The link is underlined at rest, with a thicker line on hover instead of a second colour (guide
  §3.5). Against the hint's `--cd-ui-text-leise` its `--cd-ui-link` reaches only 1.16:1, dark 1.15:1,
  so its colour alone would not mark it as a link (WCAG 1.4.1). Up to shell 0.3.3 it was underlined
  only on hover, on focus and in high contrast; the `emptyState` case now reads the underline at
  rest.
- A closing toast that held the focus on the start screen hands it to "New diagram": the canvas is
  inert and the menu trigger `visibility: hidden`, so both `focus()` calls failed silently and the
  focus fell to `<body>`. The fallback now checks that a target really took the focus.
- When the card hides through one of its buttons, the focus goes to the canvas `<svg>` before the
  handler runs. When the card shows while the focus is in the work chrome or the canvas, the focus
  goes to "New diagram"; a focus on the legal line or a toast stays where it is.
- The Komet is `draggable="false"`: in Chromium an image drag can carry a file and would open the
  drop zone over the card.

### Drop zone

**Guide [§9][guide-9].** Rule: a file dragged over the page shows a 12px inset overlay with a dashed
border and the chip "Drop file here"; a drop the modeler cannot take shows the forbidden state with
the cursor `not-allowed`.

- The listeners are on `window`: the page is the drop target, not the canvas. `dragenter` and
  `dragleave` fire for every element the pointer crosses, so only the outermost pair counts (a depth
  counter); `dragover` also shows a drag that entered before the listener existed.
- Only drags with items of kind `"file"` count, so diagram-js's palette drags and text dragged into
  the label editor stay alone. Every file drag is `preventDefault`-ed: unprevented, the browser
  opens the file in place of the app.
- Before the drop the browser hides the file names and offers only MIME types, which may be empty
  (often empty for an extension the system does not know, such as `.storm`). `dragVerdict` therefore
  forbids by type only when every file has a MIME type that none of `accept`'s MIME entries
  matches; an empty type never forbids. At the drop `acceptsFile` decides by extension and type.
- `dropEffect = "none"` on the last `dragover` shows the `not-allowed` cursor, and the browser then
  fires no `drop`. A synthetic `drop` (a test) is split by `acceptsFile` like any other; one
  forbidden for `multiple` or an open dialog opens nothing.
- A constructed `DataTransfer` ignores writes to `dropEffect` in Chromium, so the kit hands the
  handlers a proxy that records them.
- The overlay paints a 12px `--cd-ui-grund` rim around itself (`box-shadow` spread), so the corners
  of the islands under it do not show beside its rounded frame.

### Mode before the first paint

**Guide [§13.3][guide-13.3].** Rule: a light-only modeler writes `data-cd-theme="light"`, one
`theme-color` without `media` and of the script only the contrast line; a dark-capable one writes
`system`, the whole script and both `theme-color`s; the choice lives in
`localStorage["miragon.darstellung"]`, "System" removes it; switching sets one frame of
`transition: none`.

- `webHeadMarkup` returns the metas and the inline script for the page's `<head>` (a Vite
  `transformIndexHtml` hook, before the first stylesheet). The script is ES5 in an immediately
  invoked function, reads the storage inside `try`/`catch` (it throws when storage is blocked),
  tolerates a missing `color-scheme` meta, and JSON-escapes every literal with `<`, U+2028 and
  U+2029 escaped as well, so a colour value can never end the `<script>` element.
- At runtime `shell.appearance` keeps the choice in memory: read once at mount, then set by
  `setChoice` and by `storage` events of other tabs (a cleared storage is `system`). A choice a
  blocked storage refused still holds for the page. Mounting does not apply the mode again; the head
  script owns the first paint.
- `cd-shell-no-transition` stays on `<html>` until the second animation frame (one frame is not
  always a painted frame), and a new switch or `destroy` cancels the pending removal.
- `(prefers-contrast: more)` is mirrored on `<html>` (`data-cd-kontrast="hoch"`) at mount and on
  every change, for light-only modelers as well.

## VS Code host

The VS Code sections below (commands and menu, notifications, undo, key interception, theme bridge,
language, host hygiene, state) implement guide §13.5; the last one tells how the shell's smoke-test
driver checks them in a real VS Code. In VS Code the extension owns file, document, history and
mode; the webview shows the canvas with the chrome.

## VS Code: commands and menu

**Guide [§13.5][guide-13.5].** Rule: every webview-menu action that makes sense without focus on the
canvas also exists as a command in the Command Palette, and both do exactly the same.

Command and menu entry run the same code. The extension registers the command
(`vscode.commands.registerCommand("<prefix>.fitView", …)`) and posts a message with the command name
to the webview of the active custom editor
(`webviewPanel.webview.postMessage({ type: "command", name: "fitView" })`; track the active panel
with `onDidChangeViewState`). The webview dispatches the name to the same handler as the menu entry.

## VS Code: notifications

**Guide [§13.5][guide-13.5], [§9][guide-9].** Rule: no toasts in the webview; info, warning and error
appear as the host's notification of the same level, only for actions the user triggered, never for an
import.

- The webview posts a message to the extension, which calls `vscode.window.showInformationMessage`,
  `showWarningMessage` or `showErrorMessage`.
- After an export the info carries an action that reveals the file, labelled like VS Code: "Reveal in
  Finder" (`process.platform === "darwin"`), "Reveal in File Explorer" (`"win32"`), "Open Containing
  Folder" (Linux). The action runs the built-in command
  `vscode.commands.executeCommand("revealFileInOS", uri)`.

## VS Code: undo

**Guide [§13.5][guide-13.5].** Rule: the history belongs to the host document; every canvas change is
exactly one document change and one undo step; after a host undo the webview keeps viewbox and
selection; in text fields the field's own undo applies.

- The modeler does not bind Cmd+Z, Cmd+Shift+Z and Ctrl+Y to the diagram-js `commandStack`.
  `KeyboardBindings` binds them (`isUndo`/`isRedo`) as soon as the editor actions `undo` and `redo`
  are registered. In the IDE host the shell's keyboard listener (priority 2000) returns `false` for
  them: that stops `KeyboardBindings` without `preventDefault()`, so the keys propagate to `window`,
  where VS Code's webview host forwards them and VS Code undoes the document edit.
- A modeler's own DOM binding must go in the webview as well. Event Storming's document keyboard
  calls `preventDefault()` and `commandStack.undo()` on Cmd+Z (also with an empty stack) unless the
  webview creates it with `undoRedoKeys: false` (also the contract's aligned name since 1.2; Wardley
  takes `keyboard: { undoRedo: false }` until it adopts the aligned options). With the binding on,
  the shell stops the key as one the canvas handled, VS Code never undoes, and since Event Storming
  clears its stack on every import, Cmd+Z on the canvas does nothing at all after an external edit.
  Shell conformance presses Cmd/Ctrl+Z, Shift+Z and Ctrl+Y on the canvas in the IDE host and expects
  each on `window`, once and unprevented.
- Each canvas change is written as one `WorkspaceEdit` with minimal line changes, applied with
  `vscode.workspace.applyEdit` (one undo step). Multi-step actions (insert example, resize) are one
  edit.
- A host undo comes back to the webview as an external document change
  (`onDidChangeTextDocument`, `reason` is `TextDocumentChangeReason.Undo` or `Redo`). The webview
  re-imports and restores viewbox and selection, no refit (guide §5.9).
- The extension also receives `onDidChangeTextDocument` for its own edits. It recognises these echoes
  (the texts of its pending edits, compared CRLF-tolerant) and does not send them back as an external
  change.
- In text fields of the webview (label editor, inspector, dialog and popover fields) stop Cmd+Z, Cmd+Shift+Z, Cmd+Y and
  Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y with `stopPropagation()` but without `preventDefault()`. VS Code's
  webview host calls `preventDefault()` on every Ctrl/Cmd + Z or Y that reaches `window` and forwards
  it: without the stop the field loses its native undo and VS Code undoes the last document change;
  with `preventDefault()` the field loses its native undo too.
- Match these keys by the typed character (`event.key`), because QWERTZ swaps the Y and Z keys; fall
  back to `code` `KeyZ`/`KeyY` only when `key` is not an ASCII character (Cyrillic, Greek layouts).
  Cmd/Ctrl+Shift+Y is not redo: VS Code toggles the Debug Console with it.

## VS Code: key interception

**Guide [§13.5][guide-13.5].** Rule: a key the webview handles acts only in the webview: VS Code never
sees it and never runs it again (for example as a window zoom); every other key goes on to VS Code.

- VS Code's webview host page listens for `keydown` on the webview's `window` (bubble phase) and
  forwards every event that reaches it to the workbench (`did-keydown`), regardless of
  `defaultPrevented`. The workbench then runs its keybindings: window zoom, copy and paste, select all
  and so on. The one exception is VS Code for the Web: there the host page returns early for
  Cmd/Ctrl + C, X and V, leaves them to the browser and forwards nothing.
- The webview therefore listens with exactly one `keydown` listener on `document` (bubble phase) and
  calls `preventDefault()` and `stopPropagation()` for every key it handles. A listener on `window`
  would come too late: VS Code attaches its listener to the frame's `window` when it creates the
  frame, before the webview's scripts run, so it runs first on that target, and `stopPropagation()`
  does not affect other listeners on the same target.
- Handled keys: the zoom keys (Cmd/Ctrl + `+`, `=`, `-`, `_`, `0`, also with Shift and on the
  numpad) and Shift+1; Escape while a menu, popover or dialog is open; in text fields the undo and
  redo keys, there with `stopPropagation()` only (see [VS Code: undo](#vs-code-undo)). VS Code also
  zooms the window with Cmd/Ctrl+Shift+- and the numpad, so these belong to the list.
- In text fields, during IME composition and with an open dialog the zoom keys do not zoom but are
  still stopped, so VS Code does not zoom the window; Shift+1 stays a character there.
- Cmd/Ctrl+0 belongs to the canvas (100 %) while the webview has focus, although VS Code binds the key
  itself (by default: focus the primary side bar). That is intended.
- Cmd and Ctrl both count on every platform (guide §5.8), so with the focus in the webview it also
  takes VS Code's Ctrl+- (Go Back) and Ctrl+Shift+- (Go Forward) on macOS, and Ctrl+Shift+- on Linux.
  That follows the guide like Cmd+0 does; the product owner confirms it is intended (see
  [Open verification points](#open-verification-points)).
- Keys the open menu consumes are stopped at the menu (see [Menu](#menu)), so VS Code does not see
  them either.
- A key the canvas has already handled (`event.defaultPrevented`, for example Cmd+C and Cmd+V from
  diagram-js, Cmd+A from a modeler's select all) is stopped as well. Otherwise VS Code runs it a
  second time on the webview: on desktop (Electron) its host page prevents copy, cut and paste and
  the workbench dispatches them back to the webview (in VS Code for the Web the browser handles them,
  see above), and select all would select the chrome's text. Every other key propagates to VS Code
  (Cmd+S, Cmd+P, Cmd+W, F1).
- The shell can stop only what the canvas prevented, so Cmd/Ctrl+A on the focused canvas is the
  modeler's to handle (guide §13.5: keys the canvas uses act only on the canvas). diagram-js 15's
  `KeyboardBindings` binds no select all; a modeler binds it (select every element) or at least
  prevents the key. Event Storming had none, so VS Code ran its own Select All on the webview. Shell
  conformance presses Control+A and Meta+A on the canvas and expects them prevented, and in the IDE
  host never on `window`.
- Test: a `keydown` listener on `window` (where VS Code's host page picks keys up) must not see any
  handled key. A window listener cannot see whether a stopped key was prevented, so add a `keydown`
  listener on `document`, registered after the shell's and the modeler's: handled keys must arrive
  prevented, blocked ones (zoom keys and undo/redo in text fields, Escape with a dialog or popover)
  unprevented, so the field keeps its native undo, and unhandled keys such as F1 and Cmd/Ctrl+Z on
  the canvas must still reach `window` unprevented. That is what catches a modeler's own document
  undo binding taking Cmd+Z from the label editor (an input, a textarea or editable text) or from the
  document's history on the canvas. Acceptance runs in real VS Code with Light, Dark and both High
  Contrast themes, plus Cmd+Shift+- and Cmd+A on the canvas.

## VS Code: theme bridge

**Guide [§13.3][guide-13.3], [§13.5][guide-13.5].** Rule: the webview follows the VS Code color theme
(later the setting `miragon.<modeler>.colorTheme`); the attributes are there before the first paint, and
a theme change switches at once, both attributes in one step, without a fade.

- Signal: `vscode.window.activeColorTheme.kind`, mapped to the requested appearance and then through
  `resolveAppearance` (see [Appearance decision](#appearance-decision)):

  | `ColorThemeKind`      | `data-cd-theme` | `data-cd-kontrast` |
  | --------------------- | --------------- | ------------------ |
  | 1 `Light`             | `light`         |                    |
  | 2 `Dark`              | `dark`          |                    |
  | 3 `HighContrast`      | `dark`          | `hoch`             |
  | 4 `HighContrastLight` | `light`         | `hoch`             |

- Initial: the extension writes `data-cd-theme` and `data-cd-kontrast` into `<html>` when it renders
  the webview HTML, always, also `light`.
- Change: on `vscode.window.onDidChangeActiveColorTheme` and on
  `vscode.workspace.onDidChangeConfiguration`
  (`e.affectsConfiguration("miragon.<modeler>.colorTheme")`) the extension posts the new appearance
  to the webview (`webview.postMessage`). The webview sets both attributes in the same task, with
  transitions disabled for one frame: add a class that sets `transition: none`, change the
  attributes, and remove the class in a nested `requestAnimationFrame`, so the first frame in the new
  mode renders without transitions.
- Hidden tabs: the VS Code API documentation contradicts itself on whether a hidden webview with
  `retainContextWhenHidden` receives messages. Re-send the current appearance from
  `webviewPanel.onDidChangeViewState` when the panel goes from hidden to visible, and only then: the
  event also fires when the active state or the view column changes while the panel stays visible.
- Fallback signal inside the webview: VS Code sets the body classes `vscode-light`, `vscode-dark`,
  `vscode-high-contrast` and `vscode-high-contrast-light`; watch them with a `MutationObserver`. Check
  `vscode-high-contrast-light` first: for backwards compatibility VS Code adds `vscode-high-contrast`
  to High Contrast Light as well, so "High Contrast Light" would otherwise be read as dark. Never use
  the body classes for styling (guide §13.5).
- Use the fallback only where no extension speaks for the mode: when `<html>` has no
  `data-cd-theme` at start (the HTML did not come from `renderWebviewHtml`), and only until the first
  message. With the extension's attributes it stays off entirely: the setting can override the color
  theme and the body classes do not know it, and on a theme change VS Code's renderer updates the
  body classes before the extension host's message arrives from its own process. A fallback that
  applied them in between would flash the setting-less mode for a few frames (a dark-capable
  modeler set to "dark" turning light under Light+, then dark again). Hidden webviews may miss a
  message; the re-send on becoming visible covers that.
- The webview resolves every message against its own `themes` once more: they are what its bundle
  can actually show, whatever the extension passed.

## VS Code: language

**Guide [§13.5][guide-13.5], [§2][guide-2].** Rule: native contributions and webview speak one language;
a localized modeler is localized completely.

- Contributions: `%key%` placeholders in `package.json`, with `package.nls.json` and
  `package.nls.<language>.json`.
- Extension code: `vscode.l10n.t(…)`, with the bundle directory named by `l10n` in `package.json`
  (`bundle.l10n.<language>.json`).
- Webview: the modelers are English today (guide §13.5), so the extension writes `<html lang="en">`
  when it renders the webview HTML (`renderWebviewHtml({ lang: "en" })`), not `vscode.env.language`.
  Only a fully localized modeler passes `vscode.env.language` there, and `vscode.l10n.bundle` for the
  webview's strings (the shell's messages table), so native contributions and webview speak the same
  language.

## VS Code: host hygiene

**Guide [§13.5][guide-13.5].** Rule: nothing of VS Code's webview styling shows: no edge padding, no
host colours or fonts, own `kbd`, `code`, links, focus rings and scrollbars; Geist loads in the webview;
a hidden tab keeps its state and neither fits nor measures.

VS Code injects a default stylesheet into every webview. In current releases it sits in
`@layer vscode-default`, so unlayered author rules win regardless of specificity; keep the reset
unlayered (or in a layer declared after it). The defaults and their resets:

- Reset `html` and `body`. VS Code otherwise sets `body { padding: 0 20px }`, the editor text colour
  (`--vscode-editor-foreground`) and its font (`--vscode-font-family`, `--vscode-font-weight`,
  `--vscode-font-size`):

  ```css
  html,
  body {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
    background: var(--cd-ui-grund);
    color: var(--cd-ui-text);
    font:
      400 13px/1.5 "Geist Variable",
      "Geist",
      ui-sans-serif,
      system-ui,
      -apple-system,
      "Segoe UI",
      sans-serif; /* the stack from guide §5.14 */
  }
  ```

- Font: never use `var(--vscode-font-family)`. Wherever the variable is undefined (the same CSS in the
  web app, in tests, in an embedding host), a `var()` without its own fallback makes the whole
  `font-family` declaration invalid at computed-value time: a font list after the `var()` does not
  help, and the browser renders Times.
- `button, input, select, textarea { font: inherit; color: inherit; }`; otherwise buttons render in
  the browser's control font, typically Arial 13.33px. Give this reset zero specificity
  (`:where(html) :where(button, …)`): any author rule beats the browser's control font, and a
  reset with specificity would also beat the chrome's own rules (the zoom readout's 13px/600).
- Style `kbd` (guide §5.6), `code` and `a` completely yourself (links in `--cd-ui-link`). VS Code's
  defaults colour all three with its own colours: `kbd` with the keybinding-label colours, an inset
  shadow and `vertical-align: middle`; `code` with the preformat colours and the editor's monospace
  font; `a` with the text-link colours.
- Focus: VS Code sets `outline: 1px solid -webkit-focus-ring-color; outline-offset: -1px` on
  `a:focus`, `input:focus`, `select:focus` and `textarea:focus`. Override it with the ring from guide
  §8 (`outline: 2px solid var(--cd-ui-fokus); outline-offset: 2px`). The defaults use `:focus`, not
  `:focus-visible`, so a link focused by mouse still gets VS Code's ring unless the override covers
  `:focus` as well.
- Scrollbars: `html { scrollbar-color: var(--cd-ui-kontur) transparent; }`. VS Code sets its own
  `html { scrollbar-color: … }` from `--vscode-scrollbarSlider-background` and
  `--vscode-editor-background`, plus `::-webkit-scrollbar*` colours. `scrollbar-color` is inherited,
  and once it is set Chromium (121 and later) ignores the `::-webkit-scrollbar` pseudo-elements.
- CSP and fonts: bundle the fonts as files next to the webview bundle, not as data URLs. With
  esbuild's usual `dataurl` loader, `@fontsource-variable/geist-mono/wght.css` inlines all six Geist
  Mono subsets (Event Storming's webview CSS grew from 137 KB to 267 KB for the key chips alone);
  with `loader: { ".woff2": "file", ".woff": "file" }` and `assetNames: "fonts/[name]-[hash]"` it
  was 69 KB, and the browser fetches only the subsets a page's `unicode-range` needs.
  `renderWebviewHtml` writes `font-src ${webview.cspSource} data:`, so the files load once `dist` is
  in the panel's `localResourceRoots`; `data:` stays for renderers that inline fonts. Without either
  Geist does not load and the fallback font shows. `style-src` keeps `'unsafe-inline'` for the
  renderers, which write `style` attributes into markup (palette entries, SVG strings); the shell and
  diagram-js style only through the CSSOM, which the CSP does not restrict, and run without it
  (`renderWebviewHtml({ inlineStyles: false })`).
- CSP and eval: `script-src` admits only the nonce'd script, and that is right; never add
  `'unsafe-eval'`. zod 4 probes once for eval with `new Function` when it builds its first object
  schema; it catches the error, but the browser reports that probe as a `securitypolicyviolation`
  (under `jitless` zod skips it). A webview
  that bundles zod 4 runs `z.config({ jitless: true })` in a module of its own that it imports before
  any schema module (Event Storming's `zod-jitless.ts`, the first import of `main.ts`).
- A test page served by Vite runs the webview from source without a CSP, so a loader or CSP mistake
  of the shipped bundle shows only behind the real HTML. The kit's `csp` case (0.6) covers it: the
  harness's `csp.open` builds the production bundle and opens it with `openWebviewBundle`
  (`./testing/webview-bundle`), which answers `https://webview.test` through Playwright's
  `page.route` with `renderWebviewHtml`'s document and, ahead of the policy, VS Code's default
  styles and the VS Code stub, a classic script the package ships prebuilt. VS Code writes its
  default styles and its own API script there too, so the policy blocks neither, and the stub
  records from the first stylesheet on every `securitypolicyviolation`, uncaught error, unhandled
  rejection, failed load and `console.error`; it sets the body classes once the parser reached
  `<body>`, before the bundle runs. The case then walks what renders late (a tooltip, a shape's
  context pad and label editor, every enabled menu entry that is not destructive, so the exports,
  the dialogs and the Legend, zoom and Fit) and fails on anything recorded, on a policy other than
  `renderWebviewHtml`'s for the page's origin, on a shell font that loads no face, comes from a
  `data:` URL or has a subset without `unicode-range`, on any font face whose load failed, and on a
  palette or menu its walk cannot reach. It replaced the smoke test each modeler kept for it. The real VS Code of the smoke driver (`./testing/vscode-electron`) only
  quotes the webview's errors when its open fails, a CSP block among them, and fails on none of them
  by itself: the policy is the one `renderWebviewHtml` writes in both, and the kit's walk reaches
  more of the bundle on every pull request.
- Reduced motion: VS Code resolves `workbench.reduceMotion` itself (`auto` follows the OS, `on`
  holds without it) and hands the result to the webview only as the body class
  `vscode-reduce-motion`; `prefers-reduced-motion` alone misses `on`. Mirror the class for the whole
  session as a class of your own on `<html>` (`cd-shell-reduce-motion`; never style with the host's
  class), stop the chrome's animations under it as under the media query, and let an explicit fit
  jump. The kit's `reducedMotion` case (added after shell 0.5.0) checks both routes: the media query
  in every host and, in the IDE host, the body class. A modeler's own element outside the shell root
  (a panel in `<body>`) needs its own rule for both, because the shell's rules reach only its root.
- Hidden tabs: register the custom editor with
  `webviewOptions: { retainContextWhenHidden: true }`, so a hidden tab keeps its document, view and
  selection. A hidden tab then reports a 0 × 0 container: skip fitting and measuring while hidden
  (guide §5.9, see [Resize](#resize)).

## VS Code: state

**Guide [§13.5][guide-13.5], [§5.10][guide-5.10].** Rule: legend state and view survive a rebuild of the
webview (for example a window reload); the stored view wins over fitting.

- `const vscode = acquireVsCodeApi()` (it may be called only once per webview). Store whether the
  legend is open and the viewbox with `vscode.setState({ … })` (JSON-serializable), on every legend
  toggle and once the view has rested: every `setState` is an IPC message with the whole state, and
  the view changes on every frame of a pan, a wheel zoom or a fit animation (`persistView` writes
  250ms after the last change). The shell's `readShellState` and `writeShellState` keep its part
  under the key `modelerShell` next to the modeler's own keys: `legendOpen` and `view` (viewbox and
  the user-moved state).
- On start read `vscode.getState()`. If a viewbox is stored, apply it after the first import instead
  of the automatic first fit, as a stored view (`setState`), not as a `restore` (see
  [Detecting a user move](#detecting-a-user-move)).
- `canvas.viewbox()` caches `outer` until the next change, so derive the stored width and height
  from the fresh `canvas.getSize()` and the scale.

## VS Code: smoke tests in a real VS Code

**Guide [§13.3][guide-13.3], [§13.5][guide-13.5].** Rule: the webview follows the VS Code color theme
(a light-only modeler stays light, high contrast passes); file, document and history belong to the
host, so save and undo are VS Code's.

The stub of `./testing/vscode-stub` reproduces VS Code's webview from its sources; whether the real
one behaves that way only a real VS Code can show. `./testing/vscode-electron` starts one per run
(API in [`packages/shell/API.md`](../../packages/shell/API.md), `./testing/vscode-electron`; usage in
the [shell README](../../packages/shell/README.md#smoke-tests-in-a-real-vs-code)). Built against VS
Code 1.143.0, `@vscode/test-electron` 3.1.0 and `playwright-core` 1.64.1, and run against the Event
Storming and Wardley Maps extensions on macOS, in their CI on `ubuntu-latest` and, since 0.3.1, in a
Linux container on an Apple silicon Mac (`linux/arm64`).

- **Why Playwright and not `runTests`.** `@vscode/test-electron`'s `runTests` runs Mocha inside the
  extension host: it reaches the `vscode` API but not the webview's DOM, and takes no screenshot. The
  driver uses the package only to download VS Code (`downloadAndUnzipVSCode`) and starts the
  executable with Playwright's `_electron.launch`, which attaches to the workbench window over the
  DevTools protocol. A webview is two frames deep: the workbench's `iframe.webview` (VS Code's host
  page, whose URL carries `extensionId=<publisher>.<name>`), and inside it `iframe#active-frame`
  with the extension's HTML. Playwright follows both as a `FrameLocator`, so a modeler's `edit` clicks
  and types into the canvas like a user.
- **Why `@vscode/test-electron` 3.1.0 or later.** VS Code 1.110 renamed its macOS executable from
  `Contents/MacOS/Electron` to `Code` (microsoft/vscode#291948) and removed the `Electron` link it
  had kept for compatibility in July 2026 (microsoft/vscode#326502). Up to 3.0.0,
  `downloadAndUnzipVSCode` returns the `Electron` path, and the launch fails with
  `spawn …/Contents/MacOS/Electron ENOENT`; 3.1.0 reads the name from the bundle's `Info.plist`.
  2.4.0, 2.5.2 and 3.0.0 failed that way with VS Code 1.143.0, so the peer range starts at 3.1.0,
  and the resolve step names the cause when the executable it got does not exist.
- **Where the download goes.** `@vscode/test-electron` defaults to `.vscode-test` in the working
  directory, that is the modeler's repository. ESLint's flat config does not read `.gitignore`, so
  after one local run `eslint .` linted the unpacked VS Code (about 0.9 GB) and failed with 733
  errors in the Wardley Maps repository, which blocks every commit behind its lint hook. The driver
  passes `defaultVsCodeCachePath` instead, the OS's cache directory as Playwright uses it for its
  browsers: outside every repository, kept across `npm ci`, shared by all modelers. It creates the
  folder first, because `@vscode/test-electron` creates only its last segment.
- **Runs that share the cache (0.3.3).** `@vscode/test-electron` 3.1.0 takes no lock: a version
  folder without its `is-complete` marker it deletes and unpacks into again (on Linux while the
  archive still downloads), and it writes the marker last. Two runs that needed a version the cache
  did not have yet (a new stable release, the default; several agents running `test:vscode:docker`
  on the shared volume, [#36](https://github.com/Miragon/modeler-suite/issues/36)) deleted each
  other's half-unpacked install. Two Event Storming runs in Docker on one empty cache, the second
  started while the first was at 30 % of its download, both failed with 0.3.2: the first with 1623
  `tar: … Cannot open: No such file or directory` and "Failed to download and unzip VS Code
  1.143.0", the second at launch (`Timeout 30000ms exceeded while waiting for event "window"`).
  The driver now gives `downloadAndUnzipVSCode` a private folder `.download-<random>` inside the
  cache with a link to every install of the cache, and moves a new install into the cache with one
  `rename`. Decisions:
  - _A rename, not a lock around the download._ A lock directory needs a stale timeout: a killed container leaves its
    lock behind, process IDs mean nothing across containers, and two waiters that see the same
    stale lock at once both take it. The rename needs no timeout, a killed run cannot block or
    break another one, and it works per version: a run that needs a cached version never waits for
    a download of another one. The cost: runs that need the same new version at once each download
    it, and the first one done wins.
  - _Links, not a version check of the driver's own._ Which version a run gets (`engines.vscode`,
    `stable`, `insiders`, a cached one when the update service cannot be reached) only
    `downloadAndUnzipVSCode` knows. Through the links it decides as before; what it deletes in the
    private folder is a link (`fs.rm` removes a link, not its target) or its own unpacking. The
    private folder is inside the cache because a rename across file systems fails (`EXDEV`), and in
    Docker the temp directory is the container's while the cache is a volume. On Windows the links
    are junctions, which need no privilege.
  - _The first install stays._ When the rename meets an install another run moved in first, that
    one stays, since that run may have started it already, and the run deletes its own copy. Only
    the very folder `downloadAndUnzipVSCode` rejected through this run's link (same device, inode
    and birth time: an outdated Insiders build, a download an older driver left unfinished) is
    moved aside and replaced. Replacing an Insiders build breaks a run that still uses the old one,
    as `@vscode/test-electron` itself does; a run of 0.3.2 or earlier on the same cache still
    deletes and unpacks in place.
  - _One replace at a time._ Runs that found the same rejected install all want it out of the way.
    One that looked at it just before another one moved it aside and put its own install in moved
    out that new install, which its run may have started already, and when it could not put it back
    deleted it with its private folder. Six processes that published at once into a cache holding
    an unfinished install hit this in 11 of 120 rounds on macOS: a run's executable went missing
    while the run read it. The look and the move aside therefore happen under a lock folder
    `.replacing-<folder>` in the cache. Unlike a lock around the download it guards milliseconds,
    and only the rare replace, so one older than a minute counts as left by a killed run and is
    taken over; two runs that take over the same abandoned lock at once both hold it, which needs a
    run killed within those milliseconds first. Putting an install into an empty place needs no
    lock, since a rename never replaces a folder that holds files. With the lock none of the 120
    rounds failed.
  - _Leftovers._ A run removes its private folder, on `process.exit` too. A run killed during the
    download (SIGKILL, `docker kill`, a SIGINT no handler catches) leaves it; the first run a day
    later removes it.
  - _A cache the run cannot write to_ (`EACCES`, `EPERM`, `EROFS` for the private folder) gets
    `downloadAndUnzipVSCode` directly, as before: a cached version still resolves, and a run that
    cannot write to the cache cannot break it for another one.
  - _A cache without links_ (`EPERM` for the link on a FAT mount under Linux; `ENOTSUP`,
    `EOPNOTSUPP`, `ENOSYS`) gets `downloadAndUnzipVSCode` directly too, with a log line, since 0.3.2
    resolved a cached version there and the private folder failed it at the first link. Runs on
    such a cache are not protected from each other once it holds an install; an empty one needs no
    link, so its first download still goes through the private folder. On a vfat loop mount in
    Docker with the real `@vscode/test-electron` 3.1.0, a cached version resolved where the run
    without the fallback failed with `EPERM: operation not permitted, symlink`.
  - With the change, the same two staggered runs both passed (the second one logged "another run
    installed … first, this run uses that one"), as did two runs started at the same moment; the
    cache then held one install and no private folder, and a third run resolved through the link in
    2.1 s.
- **Opening the fixture.** The workspace folder and the fixture are the last command-line arguments,
  and `workbench.editorAssociations` maps the fixture's file name to the custom editor's view type.
  VS Code then opens the fixture in the custom editor at start, whatever the editor's `priority`; no
  command palette, no `vscode.openWith` from an extension. On the first start of a freshly
  downloaded VS Code the file sometimes resolved before the development extension's custom editor
  was registered (two of thirteen such starts on macOS) and opened as text; the association
  does not reopen it. The driver then closes the text editor and opens the fixture from the
  Explorer, where the association applies, and repeats that every 2 s until the webview shows.
- **An extension that does not activate.** Its custom editor is never registered, so the webview
  never comes, and the workbench shows nothing but an empty tab with a progress bar. The cause is
  only in the extension host's log, `<user-data-dir>/logs/<session>/window1/exthost/exthost.log`:
  "Activating extension <id> failed due to an error:" and the error as the next entry. While the
  driver waits for the webview it reads that log every second, stops at such a line, and quotes it
  with the error's first line in the open failure; before, a run waited the full timeout and said
  only that no webview showed, and the log went with the temporary profile. The driver's first runs
  against the Context Maps and Value Chain extensions found exactly that, "Error: Cannot find
  module './impl/format'" (jsonc-parser's UMD build in an esbuild bundle), which their e2e suites
  against the stub cannot see.
- **A webview that throws** ([#50](https://github.com/Miragon/modeler-suite/issues/50)). Its
  exception is in none of VS Code's log files, so a run waited the full timeout and named no cause
  (the Event Storming extension made to throw on start, in Docker with VS Code 1.143.1: open 30.3 s,
  "the custom editor never showed the shell's menu" and the frame count). Playwright reports
  `console` and `pageerror` for every frame of a page, and the same run showed that listeners on the
  workbench window get the webview's errors two frames deep, through `iframe.webview` and
  `#active-frame`. Neither event says which frame it came from (a `ConsoleMessage` has no frame, a
  `pageerror` is only the error), and the window carries the workbench's errors too ("Extension
  'github.copilot-chat' appears in product.json but enables LESS API proposals", logged by
  `workbench.desktop.main.js`), so the driver tells them apart by URL. The webview's bundle is
  `https://file+.vscode-resource.vscode-cdn.net/<extension folder>/dist/webview.js` in the stack of
  an uncaught error and in the location of a `console.error`; VS Code's host page of the webview
  logs from `vscode-webview://<origin>/index.html?…&extensionId=<id>…`. An error counts when its
  location, or its stack's topmost frame, is a file of the extension's folder or a document whose
  URL names its id. The folder counts as given and as its real path, since VS Code may load the
  extension from either (macOS's `/var` is `/private/var`). The listeners start with the first
  window, as the webview can throw before the open step begins, and end with the open step. Only
  an uncaught error ends the wait early; a console error, such as a font that did not load, can
  come from an editor that works. The menu gets 3 s after the first uncaught error, room for an
  error the start survives and for a slow CI machine, still a tenth of the 30 s. The modelers mount
  the shell before their document arrives with `init` (Event Storming's webview calls
  `mountVsCodeShell`, then imports on `init`), so a webview that throws while it imports the
  fixture passes the menu check. `ready` then gets the same 3 s, counted from the throw and from its
  own start, and fails while the canvas shows no shape; a canvas with a shape keeps waiting, since
  the import worked and `ready` or a later step names what else broke. With the change the same run
  failed after 3.7 s with the error and its stack, the extension made to throw on `init` instead
  after 3.6 s ("the canvas shows no element of the fixture 3 s after its webview threw"); the
  unchanged extension still passed, its open step in 0.6 s.
- **A clean profile.** `--user-data-dir` and `--extensions-dir` point into a fresh temporary
  directory, so no user setting, extension, restored window or welcome page interferes. The settings
  turn off what would cover the editor or change the theme behind the test's back: the start page,
  the chat in the secondary side bar, and `window.autoDetectColorScheme` and
  `window.autoDetectHighContrast` (an OS in dark or high-contrast mode would otherwise pick the
  theme). The process gets the test's environment without `VSCODE_*`: run from a VS Code terminal,
  those variables make the webview's service worker fail to register and the webview stays empty.
- **Keys and keyboard layouts.** Playwright sends key events as a US keyboard produces them (`z` is
  `code` `KeyZ`). VS Code resolves keybindings by `code` and translates it through the OS's
  keyboard layout. On a German Mac `meta+[KeyZ]` is Cmd+Y: the keybinding troubleshooting log shows
  "From 2 keybinding entries, no when clauses matched the context" and nothing undoes, while Cmd+S
  works because S is in the same place. The driver sets `keyboard.dispatch` to `keyCode`, so VS Code
  reads the key code, which is the same on every layout. A real keyboard is not affected: the OS
  reports the physical key and its layout together.
- **Save and undo go through the workbench.** The webview's host page calls `preventDefault()` on
  Cmd/Ctrl+S and Cmd/Ctrl+Z and forwards them to the workbench (`did-keydown`), where the keybindings
  run `workbench.action.files.save` and `undo`. For the active custom editor, `undo` reaches the text
  document's undo stack (the workbench's `custom-editor` implementation at priority 105 runs before
  the webview's own `execCommand("undo")` at 100). macOS also has the application menu's Undo with
  the same accelerator; Playwright's synthetic events never pass the native menu, so the smoke test
  covers the keybinding path, the one a webview's forwarded key takes.
- **Dirty, saved, restored.** The editor tab carries `.dirty` while the document differs from the
  file; the driver waits for it after the edit and for its end after the save, then reads the file
  from disk. Undo is checked twice: the canvas shows the shapes, connections and positions it showed
  before the edit (the webview re-imported the document), and after another save the file holds the
  fixture's exact text (the edit was one document change and undid completely).
- **Reading the save (0.3.1).** VS Code writes a text file in place: `DiskFileSystemProvider` opens
  it with `w` (or `r+` and `ftruncate`), then writes the new text; a text save uses no temporary
  file and rename. 0.3.0 parsed the first read after the save key that differed from the fixture,
  which now and then was the empty or half-written file: "Unexpected end of JSON input" once in 30
  Value Chain runs, and a Wardley map without elements, which parses without a diagnostic. The
  modelers worked around it with a retry on exactly that failure
  ([#27](https://github.com/Miragon/modeler-suite/issues/27)). The driver now waits for the tab to
  turn clean first: `TextFileEditorModel` clears the dirty state in `handleSaveSuccess`, after the
  write has resolved, and a custom text editor's tab follows its text document. Then it reads the
  file until two reads 100 ms apart, each between two `stat` calls with the same size and mtime and
  with as many bytes as the size, see the same text, and parses that. A text the parser rejects is
  read again, so a write that still goes on cannot fail the step; it fails once the rejected text
  stays unchanged for 1 s, with the parser's message, the byte count and how long the text held.
  - _The clean tab makes the read complete._ The two reads are a margin for a save that reports
    success before its write is visible (a custom editor's own `saveCustomDocument`, a slow file
    system). On their own they cannot tell a pause inside a write from its end: with a parser that
    accepts every whole-line prefix, as the line-based DSLs do, a write paused for 400 ms after its
    first lines yields those lines. The unit tests pin both: that limit, and that
    `readSaveOnceClean`, the sequence the driver calls, parses only after the tab turned clean.
  - _Checked in a real VS Code._ With a shim that splits VS Code's `write()` of the fixture into two
    halves 400 ms apart, 0.3.0 failed the save ("6 elements and 0 arrows …, expected 7 and 4") and
    0.3.1 read the complete 363 bytes 102 ms after the tab turned clean: VS Code keeps the tab dirty
    through the whole write. Across 40 runs in Docker without the modelers' retries (20 Event
    Storming, 20 Wardley Maps), every save read the complete text on the first pair of reads, 102
    to 110 ms after the tab turned clean.
  - _Polling, not `fs.watch`._ Its events differ per platform (one or two `change` events, a
    `rename` for a replaced file) and say nothing about a completed write.
- **Switching the theme.** The driver writes `workbench.colorTheme` into the profile's
  `settings.json`; VS Code watches the file and switches as for a user's change. The order then is
  the one [VS Code: theme bridge](#vs-code-theme-bridge) describes: the workbench's theme class
  (`vs`, `vs-dark`, `hc-black`, `hc-light` on `.monaco-workbench`), the webview's body classes, the
  bridge's message, `data-cd-theme` and `data-cd-kontrast` on `<html>`, and the end of the shell's
  one-frame transition stop. The driver waits for each and only then takes the screenshot. A switch
  took 0.1 to 0.5 s.
- **A switch VS Code misses (0.4.1).** Now and then VS Code did not switch on such a write, and the
  workbench kept the previous theme through the driver's whole wait: "Default Dark Modern: the
  workbench never switched (no .vs-dark)" in Docker runs of Context Maps and Team Topologies (VS Code
  1.143.0, `linux-arm64`), once in three Event Storming runs, and "Default High Contrast Light: …
  (no .hc-light)" in Context Maps' CI on `ubuntu-latest` with VS Code 1.143.1, where it failed a
  pull request after 30 s ([#35](https://github.com/Miragon/modeler-suite/issues/35)). Event Storming's
  smoke test ran the whole test once more on exactly that failure. The driver now retries within the
  wait (`switchWorkbenchTheme` in `theme-switch.ts`). Decisions:
  - _Write again after 2 s._ A switch VS Code takes is done within 0.9 s (1 to 876 ms over the
    runs below, those under load included); a write it missed stayed missed for the 30 s. Writing
    the same text again is a new change for VS Code's file watcher, which covers a change event that
    got lost.
  - _Then through a third theme and back, after another 2 s._ When VS Code read the setting but did
    not apply it, its configuration already holds the value, and the same text again changes
    nothing. The driver writes a default theme of neither the requested kind nor the shown one,
    waits until the workbench shows it (so VS Code read that write, and the two writes cannot merge
    into one change), and writes the requested theme again.
  - _Wait for the detour until 2 s before the deadline._ Waiting only 2 s for it let a VS Code that
    applies a write more than 4 s late end on the detour: the workbench showed the requested theme
    from the first write, the driver accepted it after the way back, and the detour landed during
    the webview check (reproduced with a fake VS Code at 4.1 to 7 s; no real run came near that,
    see below). Waiting for the detour keeps every write before the way back done. When the detour
    never shows, VS Code missed that write too or has not applied it yet, so the driver writes the
    requested theme 2 s before the deadline and counts it only if the workbench still shows it at
    the deadline.
  - _Within `timeoutMs`._ The retries are part of the one wait, counted from the first write (the
    first two steps get at most a quarter of it each): a theme still fails after 30 s, and a switch
    VS Code takes at once costs nothing more. Every retry is in the log.
  - _A failure names both themes._ VS Code puts a theme's type class and its own class
    (`<extension id>-<theme file>`, `vscode-theme-defaults-themes-hc_black-json`) on
    `.monaco-workbench` in one `classList.add`, so the class after the type class is the theme's.
    The driver names a theme by the classes it showed earlier in the run: "requested Default High
    Contrast Light, VS Code shows Default High Contrast (.hc-black.vscode-theme-defaults-themes-hc_black-json)".
    A theme the run never showed keeps its classes, for VS Code's own default (Dark 2026) after an
    empty read, say. The failure still starts with "the workbench never switched", which modelers'
    retries match, so a modeler can drop its retry whenever it updates.
  - _Measured_ in Docker on an Apple silicon Mac with VS Code 1.143.1 (`linux-arm64`) and the
    Context Maps extension, the driver linked into its `node_modules`: ten consecutive runs of its
    smoke test (40 switches), 100 runs of the smoke test's sequence (400 switches) and 1000 switches
    in ten sessions of 25 rounds through the four themes all switched on the first write, in 1 to
    382 ms (median 314 ms). With every CPU of the container kept busy by a shell loop, VS Code
    missed a write in 3 of 130 runs of the sequence; each of the three switched on the rewrite, 2.4
    s after the first write, and all 130 runs passed. To see the detour at work too, the test put
    the previous theme back into `settings.json` right after the driver's write of Default Dark
    Modern, before VS Code read it. 0.4.0 failed both such runs after 30 s with "themes: Default
    Dark Modern: the workbench never switched (no .vs-dark)". With the retries, six such runs with
    twelve such switches passed: six switched on the rewrite, 2.1 to 2.4 s after the first write,
    and six whose rewrite was put back too switched through Default High Contrast, 4.6 to 4.8 s
    after it.
  - _Where the misses came from._ A test that watched `settings.json` found a second writer, VS
    Code itself. VS Code 1.125 changed `extensions.autoUpdate` from a boolean to `"on"` and
    `"off"` (1.124 still has the boolean), and a configuration migration turns the driver's `false`
    into `"off"`; modelers on any VS Code from 1.125 on were exposed. The migration
    runs once, in the workbench's last start-up phase, which under load falls into the themes step,
    and it writes through VS Code's own model of the file, which can still hold the file from before
    the driver's last write. In the three misses VS Code wrote the file 5, 25 and 41 ms after the
    driver's write with the previous theme in it (and `"off"`, in the two runs whose test logged
    every key), so it never read the requested theme. The driver therefore writes `"off"` itself
    (0.4.1). VS Code before the change (1.96 knows `true`, `"onlyEnabledExtensions"` and `false`)
    reads `"off"` as its default, `true`, which does nothing while auto check is off
    (`extensions.autoCheckUpdates: false`). The other value VS Code migrates, the color theme's old
    name (`"Default Light Modern"` becomes `"Light Modern"`), it rewrites while it starts, before the
    open step ends, in every run measured. Under the same load, 80 runs each: with 0.4.0 the
    migration wrote the file during the themes step in 79 runs and put the previous theme back in 2,
    which failed after 30 s with "themes: Default High Contrast: the workbench never switched (no
    .hc-black)"; with the retries alone it did so in 61 runs and 2, which the rewrite rescued; with
    `"off"` VS Code did not write the file after the open step in any run, and all 320 switches
    happened on the first write, in 1 to 521 ms.
- **Screenshots.** Before the first theme the driver blurs the webview: the edit went through the
  keyboard, so the canvas shows its focus ring, which would be in every picture. Screenshots are in
  CSS pixels, the same size on a Retina Mac and on a CI runner.
- **Closing.** `files.hotExit` stays at its default, so a window with an unsaved document (after a
  failed step) quits without a prompt; a VS Code that has not quit after 10 s is killed.
- **In a container (0.3.1).** On macOS Electron has no headless mode: every run starts a VS Code
  window in the foreground that takes the focus, and runs in a row (or agents testing in parallel)
  keep interrupting whoever works on the machine
  ([#28](https://github.com/Miragon/modeler-suite/issues/28)). On Linux the window goes to Xvfb.
  `modeler-shell-vscode-docker` therefore runs the modeler's own smoke script in a Linux container
  under `xvfb-run -a`. Decisions:
  - _A command of the shell, not a recipe per modeler._ Image, mounts, volumes and the copy are the
    same for every modeler; the modeler adds one script line. The Dockerfile is generated from
    `vsCodeSmokeDockerfile`, so it is unit-tested, versioned with the shell and in the image's tag
    (the first 12 hex digits of its SHA-256): a release that changes it builds a new image, an
    unchanged one is reused. A `--platform` ends the tag (`-linux-amd64`): a tag holds one
    platform's image, so with the native image under the plain tag,
    `docker run --platform linux/amd64` found no amd64 image locally, tried to pull the local-only
    tag and failed. Now the amd64 image builds next to the native one (75 s under Docker Desktop's
    emulation on Apple silicon) and `uname -m` in it says `x86_64`; the smoke test itself has not
    run there.
  - _Official Node image on bookworm._ `node:<version>-bookworm-slim` with the Node version the
    command runs with, so the container installs with the same Node and npm major as the host's
    run. The Debian release is fixed because trixie renamed Electron's libraries (`libasound2t64`,
    `libgtk-3-0t64`, …), and a moving `slim` tag would break the package list.
  - _Copy, then `npm ci`._ The host's `node_modules` are built for the host (esbuild, Rollup and
    Rolldown ship native binaries per platform), and an `npm ci` into the mounted working copy
    would replace them with Linux ones. The repository is mounted read-only and copied inside the
    container without `node_modules`, `.git` (a worktree's `.git` is a file pointing outside the
    mount anyway), `.vscode-test` and the results; `npm ci` there takes 3 to 6 s with the shared npm
    cache. The copy takes under a second for a modeler repository.
  - _Two named volumes._ VS Code's download (0.9 GB unpacked) goes into `modeler-shell-vscode-cache`
    at `/root/.cache`, where the driver's default `cachePath` points in the container, and npm's
    cache into `modeler-shell-npm-cache`; every modeler on the machine shares both, as on the host.
  - _Results by mount, logs included._ Only the results directory is writable from the container.
    The driver keeps VS Code's profile in `TMPDIR` with `keepTemporaryFiles`; the script copies its
    `logs` next to the screenshots, as the modelers' CI uploads them. The default results directory
    is the smoke test's own and is emptied before every run, as the modelers' tests empty it on a
    local run. Another one is emptied only when it carries the marker of a directory the command
    created, so `--results src` cannot delete sources.
  - _`--init`, `--shm-size=1g`._ VS Code starts a dozen processes; tini reaps them and passes
    Ctrl+C on. By default tini signals only its child, the script's bash, which defers a SIGINT
    while it waits for `xvfb-run`, so an interrupted run went on to its end (a 120 s command ended
    after 120 s). With `TINI_KILL_PROCESS_GROUP=1` tini signals the whole process group: Ctrl+C in
    the middle of a smoke test ended it in 0.7 s with exit code 130 and no container left. Chromium
    keeps shared memory in `/dev/shm`, 64 MB by default in Docker.
  - Measured on an Apple silicon Mac with Docker Desktop 29.8.2 (`linux/arm64`, VS Code 1.143.0's
    `linux-arm64` build): the image builds in 38 s, the first VS Code download 22 s; after that a
    complete run (copy, `npm ci`, the modeler's packaging and the smoke test) takes 9.3 s for
    Wardley Maps and 10.4 s for Event Storming, the smoke test itself 4.2 to 6.4 s (40 runs), as on
    the host.
    The screenshots match the host's apart from the workbench font (DejaVu Sans and Liberation
    instead of the system font); the webview's Geist comes with the extension.
- **Keeping a local macOS run in the background (not built).** Researched, not tried: running it
  would take the focus on the machine it is tried on. VS Code creates its window with `show: true`
  (unless the stored state is maximized or full screen) and focuses it on open, on macOS with
  `app.focus({ steal: true })` for a forced focus. `_electron.launch` starts VS Code's executable
  without Playwright's loader (that one is injected only for the `electron` package), so nothing of
  the driver runs in the main process before `launch()` resolves. A candidate: a `background`
  option that, right after `launch()` and before `firstWindow()`, evaluates in the main process
  `BrowserWindow.prototype.show = showInactive`, no-op `focus`, `moveTop` and `app.focus`, and
  `app.setActivationPolicy("accessory")` (no Dock icon, no menu bar); `window.newWindowDimensions:
"maximized"` in the settings makes VS Code create the window hidden and show it through the
  patched `show()`. Risks: the evaluation races VS Code's start and loses on a fast machine (one
  focus change per run then); an activation by macOS itself for a regular app's first window is not
  covered by any of the patches; a window behind other windows counts as occluded, and Chromium
  then stops painting (`--disable-backgrounding-occluded-windows` and
  `--disable-renderer-backgrounding` on the command line should keep it painting, since Playwright's
  loader does not add them here), which would stall the frame waits and screenshots; Playwright
  emulates focus only for the main frame, so the webview's two frames would see
  `document.hasFocus() === false`, which changes focus rings, `:focus-visible` and the shell's
  blur handling; and a maximized window makes `setContentSize` work against the maximized state.
  Until it is verified on a Mac that may lose the focus, the Docker command is the way to run
  without a window.
- **Ctrl+C.** Playwright's SIGINT handler closes VS Code and calls `process.exit(130)`, so the
  run's `finally` never removed the temporary directory (about 3 MB per interrupted run), or an
  asynchronous removal was cut short. The driver removes it synchronously, in `finally` and from a
  `process.once("exit")` listener it holds while the run lasts. SIGTERM needs neither: Playwright's
  handler only closes VS Code, and the run ends through its failed steps.

## Not covered here

These topics stay in the design guide because they are not part of the shell:

- canvas theming with `cd-canvas.css` and the `cd-c-*` role classes (guide §10.2, §10.3; renderers and
  Phase 7 of [#4](https://github.com/Miragon/modeler-suite/issues/4) own them);
- light-only export (guide §10.7);
- the token files and the token module (guide §13.1, §13.2);
- the mode recipes for IntelliJ, Electron, Tauri and Theia (guide §13.3); the web app's head script
  and its `localStorage` key are the shell's since 0.2 (`webModeScript`, `webHeadMarkup` and
  `shell.appearance`, see `packages/shell/API.md`, "Web host (0.2)");
- the IntelliJ white-flash fix (guide §13.5).

## Open verification points

To confirm in a real VS Code before the shell's VS Code part is released. Each one is an assumption
the notes rely on that the sources alone do not settle. Since 0.3 the smoke driver of
`./testing/vscode-electron` confirms some of them on every run; candidates for more of its checks are
listed in `packages/shell/API.md`, "Out of scope for 0.3".

- [ ] No handled key reaches a `keydown` listener on `window`: zoom keys including Cmd/Ctrl+Shift+-
      and the numpad, Shift+1, Escape with an open menu, undo and redo in text fields, Cmd/Ctrl+A, C
      and V after the canvas handled them. VS Code never zooms the window, and Cmd/Ctrl+A on the
      canvas selects the elements, never the chrome's text.
- [ ] Cmd/Ctrl+0 with focus in the webview sets 100 % and does not focus the side bar.
- [ ] VS Code for the Web: Cmd/Ctrl + C, X and V on the canvas copy, cut and paste exactly once (the
      host page leaves them to the browser and does not forward them).
- [ ] Cmd/Ctrl+Z in the label editor undoes only in the field; the document stays unchanged.
- [ ] One Cmd/Ctrl+Z on the canvas undoes exactly one canvas change; viewbox and selection stay.
      The smoke driver confirms the first half in VS Code 1.143.0 (Event Storming, Wardley Maps);
      viewbox and selection are still open.
- [ ] Light, Dark, High Contrast and High Contrast Light: attributes before the first paint (no
      flash), switching at once, a light-only modeler stays light (with `hoch` under both High
      Contrast themes). The smoke driver confirms the switch and the light-only result in VS Code
      1.143.0; the first paint is still open.
- [x] High Contrast Light sets both body classes `vscode-high-contrast-light` and
      `vscode-high-contrast` (the reason for the fallback's check order). Confirmed in VS Code
      1.143.0 by the smoke driver.
- [ ] A theme change while the tab is hidden: does the message arrive in a retained webview? Either
      way the re-send on `onDidChangeViewState` leaves the right mode.
- [ ] A hidden tab with `retainContextWhenHidden` reports 0 × 0 to the `ResizeObserver`; back in
      front, view and selection are unchanged and nothing refits. If VS Code only hides the webview
      without resizing it, skip fitting while `webviewPanel.visible` is `false` instead.
- [ ] Developer: Reload Window: `vscode.getState()` returns legend state and viewbox in the restored
      custom editor, and the stored view wins over the first fit.
- [ ] VS Code Remote (SSH, WSL, Dev Containers) and vscode.dev: the webview's `navigator` reports
      the client's platform (with or without `userAgentData`), so the labels show ⌘ on a Mac client
      even when the extension host runs on Linux or Windows.
- [ ] `revealFileInOS` for a file in a remote workspace: offer the reveal action only where it works.
- [ ] The default webview stylesheet is in `@layer vscode-default` in every VS Code version the
      extension supports (`engines.vscode`); on older versions the reset must win by order. Body
      padding, fonts (no Times, no Arial 13.33px), `kbd`, `code`, links, focus rings and scrollbars
      checked in all four themes.
- [ ] Geist and Geist Mono load from the font files in `dist/fonts/` without a CSP violation, and a
      webview with zod 4 reports no violation either (webview developer tools).
- [ ] `workbench.reduceMotion` `on` sets the body class `vscode-reduce-motion` in the webview (and
      `off` removes it), at start and when the setting changes.
- [ ] Safari (the web app, vscode.dev): after a click on a zoom button the canvas `<svg>` has the focus
      and shows no focus ring. Safari does not focus a clicked button, so the focus moves from
      wherever it was.
- [ ] A click into the side bar or another editor while the webview menu is open fires `blur` on the
      webview's window, so the menu is closed when the user comes back.
- [ ] Ctrl+- and Ctrl+Shift+- on macOS with the focus in the webview zoom the canvas instead of VS
      Code's Go Back and Go Forward: confirmed as intended by the product owner.
- [ ] NVDA and JAWS with Chromium announce the status box when it appears with `role="status"` (a
      warning); `role="alert"` (an invalid file) is announced on appearance. If not, write the text
      one frame after the box shows.
- [ ] `vscode.env.language` and `vscode.l10n.bundle` reach the webview, and `<html lang>` matches the
      native contributions.
- [ ] The export notification shows the platform's reveal label and opens the file manager.

To re-check on every diagram-js upgrade, because these notes rely on internals:

- [ ] `ZoomScroll`: `RANGE = { min: 0.2, max: 4 }`, `NUM_STEPS = 10`, the snap in `_zoom`, the wheel
      half step.
- [ ] `Canvas`: `zoom()` rounded to three decimals, `canvas.viewbox.changing` synchronous,
      `deferUpdate` debounce of 300ms, `resized()` dropping the cached viewbox.
- [ ] `Palette`: appended after the `<svg>`, `palette.create` with `{ container }`, full rebuild on
      `palette.changed`, `highlighted-entry` for the active tool on a cached (stale after a rebuild)
      tools group, `two-column` toggled on `canvas.resized`.
- [ ] `PaletteTooltip` still registered as `paletteTooltip`; `HoverTooltip` `SHOW_DELAY = 300`.
- [ ] `Keyboard`: bound to the canvas `<svg>`, `preventDefault()` without `stopPropagation()`;
      `KeyboardBindings` at default priority 1000.

[ci-36]: https://github.com/Miragon/corporate-identity/issues/36
[ci-37]: https://github.com/Miragon/corporate-identity/issues/37
[ci-54]: https://github.com/Miragon/corporate-identity/pull/54
[guide]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md
[guide-2]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#2-marken-grundlagen
[guide-5]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#5-abst%C3%A4nde-layout-und-chrome
[guide-5.1]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#51-raster-und-ma%C3%9Fe-als-tokens
[guide-5.2]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#52-app-shell-und-anker
[guide-5.4]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#54-men%C3%BC-oben-links
[guide-5.5]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#55-werkzeugpalette-oben-mitte
[guide-5.6]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#56-tooltip
[guide-5.7]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#57-oben-rechts
[guide-5.8]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#58-zoom-panel-unten-rechts
[guide-5.9]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#59-einpassen
[guide-5.10]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#510-unten-links-problem-pill-und-legende
[guide-5.12]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#512-status-kasten-unter-der-palette
[guide-5.13]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#513-ebenen
[guide-5.14]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#514-icons-schrift-fokus-und-bewegung-im-chrome
[guide-5.15]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#515-schmale-und-niedrige-fenster
[guide-6]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#6-form-und-elevation
[guide-8]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#8-komponenten
[guide-9]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#9-feedback-und-zust%C3%A4nde
[guide-10.1]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#101-aufbau-in-beiden-modi
[guide-12]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#12-checkliste-barrierefreiheit
[guide-13.3]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#133-moduswahl
[guide-13.4]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#134-checkliste
[guide-13.5]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md#135-ide-hosts-vs-code-intellij
