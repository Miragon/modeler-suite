# @miragon/modeler-shell 0.3 — public API

The shared, framework-free implementation of everything around a Miragon diagram-js modeler: menu
button with dropdown, horizontal palette skin, chrome tooltip, zoom panel, zoom and fit keys, fit,
problems pill, status box, empty-file hint, legend and inspector slots, the plumbing to a VS Code
webview, and (0.2) the web-app chrome: primary action, legal line, File and Appearance groups,
problems popover, toasts, empty-state card, drop zone and the web app's mode, and (0.3) a driver
that smoke-tests a modeler's extension in a real VS Code, since 0.3.1 also in a Linux container. Planned in
[Miragon/modeler-suite#4](https://github.com/Miragon/modeler-suite/issues/4) (Phase 4); the first
consumer is the Event Storming modeler, in VS Code (0.1) and in its web app (0.2, see
[Usage: Event Storming in the web app](#usage-event-storming-in-the-web-app)).

- **Look and behaviour** come from the Miragon design system, guide `modeler-design-system.md`
  (skill `miragon-brand:modeler-tool-design`, design system 1.14.0), §2, §5.1 to §5.15, §6, §7, §8,
  §9, §11, §12 and §13.3 to §13.5. Section numbers below (§x.y) refer to it.
- **Mechanics** (diagram-js services, VS Code quirks) are in
  [`docs/shell/implementation-notes.md`](../../docs/shell/implementation-notes.md).
- **Zero runtime dependencies.** The shell never imports `diagram-js`, `didi`, `vscode`, Lucide or
  React, not even for types: diagram-js services are typed structurally, the `vscode` namespace and
  Playwright's `page`/`test` are passed in. The one exception is `./testing/vscode-electron`, which
  starts VS Code itself: it loads `playwright-core` and `@vscode/test-electron`, two optional peer
  dependencies nobody installs who does not use that entry. Its command `modeler-shell-vscode-docker`
  (0.3.1) needs neither on the host, only Node and Docker.
- **Tokens are the consumer's.** The modeler vendors `cd-tokens.generated.css` unchanged; the shell
  CSS reads only `var(--cd-ui-*)` roles, `var(--cd-shell-*)` sizes and the mode-independent
  non-colour tokens `--cd-radius-*`, `--cd-shadow-*`, `--cd-motion-*`, `--cd-ease`, `--cd-ease-out`.
  It contains no colour literal and no fixed palette token (`--cd-blau`, `--cd-schwarz`, …), with
  one exception the guide itself makes: the primary button's fill is `--cd-blau` with `--cd-weiss`
  text in both modes, hover `--cd-blau-link` (§8: "Feste Werte nimmst du nur für die Fläche von
  Primär- und Destruktiv-Button"). Those three tokens appear in `src/dom/buttons.css` only, and the
  stylesheet test allows them nowhere else (see [Buttons](#buttons)). Values the shell needs in
  script (the two `theme-color`s) come from the modeler's vendored JSON as well.
- **English by default.** Every text comes from one messages table (`ShellMessages`), every number
  goes through `Intl` in the UI language.

## Entry points

| Entry                                            | For                                                                                                   | Needs a DOM                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------ |
| `@miragon/modeler-shell`                         | the chrome (`mountShell`, web chrome included), icons, plus all of `./core`                           | yes (at call time)             |
| `@miragon/modeler-shell/core`                    | fit math, keymap, zoom readout, appearance, sizes, messages, the web host's decisions and head script | no                             |
| `@miragon/modeler-shell/diagram-js`              | `shellModule`, viewport, `connectDiagramJs`                                                           | yes                            |
| `@miragon/modeler-shell/vscode/extension`        | webview HTML, nonce, theme bridge (extension host)                                                    | no                             |
| `@miragon/modeler-shell/vscode/webview`          | `mountVsCodeShell`, appearance handler, webview state                                                 | yes                            |
| `@miragon/modeler-shell/testing`                 | Playwright-driven shell conformance kit                                                               | runs in Node, drives a browser |
| `@miragon/modeler-shell/testing/vscode-stub`     | a stand-in for VS Code around a webview test page                                                     | yes (in the test page)         |
| `@miragon/modeler-shell/testing/vscode-electron` | smoke tests of the modeler's extension in a real VS Code (0.3)                                        | runs in Node, drives VS Code   |
| `@miragon/modeler-shell/testing/webview-bundle`  | the production webview bundle under the webview CSP, for the kit's `csp` case (0.6)                   | runs in Node, drives a browser |
| `@miragon/modeler-shell/shell.css`               | every style of the shell                                                                              | —                              |

All JavaScript entries ship as ESM and CJS with types (`typesVersions` covers `moduleResolution:
node10`); importing any of them has no side effects. The package has one command (`bin`),
`modeler-shell-vscode-docker`, an ESM file in `dist` (see [In Docker](#in-docker-031)). The package
also ships `src/` without its tests, the files the sourcemaps point at, so stack traces and test
locations resolve to real files. Every optional input field also accepts an explicit `undefined`, so
consumers compiling with `exactOptionalPropertyTypes` can forward optional values
(`{ view: viewport.getState() }`, `{ open: stored.legendOpen }`); the shell compiles with it too.

### Stylesheet order

The tokens come first, unless the renderer's stylesheet already imports them (Event Storming's
`event-storming.css` does, in a layer), and are loaded exactly once:

```ts
import "./theme/cd-tokens.generated.css"; // vendored, unchanged, first; left out when the renderer CSS brings it
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css"; // shortcut chips
import "diagram-js/assets/diagram-js.css"; // usually through the renderer's CSS
import "@miragon/<notation>-renderer/…css"; // the renderer
import "@miragon/modeler-shell/shell.css"; // last
```

A bundle ships the fonts as files, not as data URLs (see `./vscode/extension`).

## `./core` — DOM-free

Compiles without the DOM library (`tsconfig.core.json`), usable in the extension host and in workers.

### Geometry and shared types

```ts
interface Point {
  x: number;
  y: number;
}
interface Size {
  width: number;
  height: number;
}
// content bounds and viewboxes are in diagram coordinates
interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface ScaledViewbox extends Bounds {
  scale: number;
}
// px from the edges of the modeler's container
interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

type ShellHost = "ide" | "web" | "embedded";
type ChromeIsland =
  | "menu"
  | "palette"
  | "primary"
  | "zoom"
  | "problems"
  | "legend"
  | "inspector"
  | "status"
  // 0.2, web column (toasts and problems-popover also embedded)
  | "legal"
  | "toasts"
  | "empty-state"
  | "drop-zone"
  | "problems-popover";
const CHROME_ISLANDS: readonly ChromeIsland[]; // in this order
type PaletteRow = "top" | "second-row";

interface ZoomTarget {
  zoom(): number; // 1 = 100 %
  stepZoom(direction: 1 | -1): void; // zoomScroll raster, around the container centre
  zoomToActual(): void; // 100 %, a user move
  fit(): void; // explicit fit: animated unless reduced motion; view becomes automatic
  canFit(): boolean; // false while the content bounds are empty
  onChange(listener: () => void): () => void; // every viewbox change and canFit change; unsubscribe
  focus?(): void; // 0.2.2: the canvas takes the keyboard focus (diagram-js canvas.focus())
}

// JSON-serializable, for VS Code setState
interface ViewportState {
  viewbox: Bounds;
  userMoved: boolean; // zoomed or panned since the last fit: a resize no longer refits
}
```

`ShellHost` is the host column of §5.2: `ide` (VS Code webview, later IntelliJ), `web` (a Miragon web
app owning its page), `embedded` (a foreign page such as designIQ; geometry like `ide`).

### Sizes

```ts
const SHELL_TOKENS: {
  edge: "--cd-shell-rand";
  gap: "--cd-shell-luecke";
  row: "--cd-shell-zeile";
  target: "--cd-shell-ziel";
  entry: "--cd-shell-eintrag";
  free: "--cd-shell-frei";
  menuMinWidth: "--cd-shell-menue-breite";
  inspectorWidth: "--cd-shell-inspector-breite";
  fitInsetTop: "--cd-shell-einpassen-oben";
  fitInsetTopSecondRow: "--cd-shell-einpassen-oben-schmal";
  fitInsetSide: "--cd-shell-einpassen-seite";
  fitInsetBottom: "--cd-shell-einpassen-unten";
  fitInsetBottomWeb: "--cd-shell-einpassen-unten-web";
  narrow: "--cd-shell-schmal";
  veryNarrow: "--cd-shell-sehr-schmal";
  low: "--cd-shell-niedrig";
  layerIslands: "--cd-shell-ebene-inseln";
  layerInspector: "--cd-shell-ebene-inspector";
  layerTopRow: "--cd-shell-ebene-reihe";
  layerPopups: "--cd-shell-ebene-aufklapper";
  layerDialog: "--cd-shell-ebene-dialog";
  layerToast: "--cd-shell-ebene-toast";
};
type ShellSizeName = keyof typeof SHELL_TOKENS;
type ShellSizes = Readonly<Record<ShellSizeName, number>>;
const SHELL: ShellSizes; // edge 12, gap 8, row 40, target 32, entry 36, free 64, menuMinWidth 248,
// inspectorWidth 288, fitInsetTop 88, fitInsetTopSecondRow 140, fitInsetSide 24, fitInsetBottom 64,
// fitInsetBottomWeb 92, narrow 760, veryNarrow 440, low 820, layers 20, 25, 30, 40, 50, 60
function shellSizesFromTokens(shellGroup: Readonly<Record<string, string>>): ShellSizes;
```

`SHELL` equals `parseFloat` of the `shell` group of `cd-tokens.generated.json`; a drift test pins it
to the token fixture. `shellSizesFromTokens` reads a vendored JSON's `shell` group and throws, naming
the token, when a size is missing or neither `"<n>px"` nor a plain number (so `"12em"` fails instead
of silently becoming 12); unknown tokens are ignored.

A modeler pins its own vendored JSON the same way, in a unit test (Vitest or `node:test`), never in
its e2e suite: the check is pure data. Both expectations, because the fit math reads `SHELL` and the
stylesheet reads the tokens:

```ts
expect(SHELL).toEqual(shellSizesFromTokens(vendoredTokens.shell));
expect(Object.keys(vendoredTokens.shell)).toEqual(
  expect.arrayContaining(Object.values(SHELL_TOKENS)),
);
```

### Fit

```ts
const MAX_FIT_ZOOM = 1;
const FIT_ANIMATION_MS = 250;
const VIEW_TOLERANCE = 1e-3;

function fitViewbox(
  bounds: Bounds,
  container: Size,
  insets: Insets,
  maxZoom?: number,
): ScaledViewbox | undefined;

interface FitLayout {
  container: Size;
  host: ShellHost;
  paletteRow: PaletteRow;
  problemsVisible: boolean;
  zoomRaised?: boolean; // web: the zoom panel stands above the legal line (zoomRowRaised)
  legalHeight?: number; // web: the legal line's measured height, 20 per line (default one line)
  legendWidth?: number; // open legend's rendered width, undefined when closed/absent
  inspector?: { sheetTop?: number }; // present = open; sheetTop measured when it is a bottom sheet
}
function fitInsets(layout: FitLayout): Insets;
function freeRectCenter(container: Size, insets: Insets): Point | undefined; // px from the container's top left

function sameView(
  a: Pick<ScaledViewbox, "x" | "y" | "scale">,
  b: Pick<ScaledViewbox, "x" | "y" | "scale">,
  tolerance?: number,
): boolean;
function interpolateViewbox(
  from: ScaledViewbox,
  to: ScaledViewbox,
  progress: number,
): ScaledViewbox;
function easeStandard(progress: number): number; // cubic-bezier(0.4, 0, 0.2, 1)
```

- `fitViewbox` centres `bounds` in the free rectangle (container minus insets) at the largest scale
  that fits, capped at `maxZoom`, and returns a box with the container's aspect ratio, so
  `canvas.viewbox(box)` shows exactly that view (§5.9). `undefined` for a container with a 0 side,
  for bounds without width and height, or for a non-finite result; a zero width or height scales by
  the other dimension. An axis whose insets leave no room (a container lower or narrower than its
  chrome) centres in the whole container.
- `fitInsets` (§5.9): top 88, 140 in the second row; left and right 24; bottom 64, in the `web` host
  with a visible pill or with the zoom panel raised above the legal line (`zoomRaised`) 92, plus 20
  for every extra line of a wrapped legal line (`legalHeight`); right 324 (12 + 288 + 24) with an
  open side inspector (container wider
  than 760); left 12 + legend width + 24 with an open legend in containers wider than 440
  (`legendWidth <= 0` counts as closed); bottom `container.height − sheetTop + 12` with an open
  bottom sheet (up to 760). The sheet hides zoom panel, pill and legend (§5.11), so while it is open
  neither the legend nor the web pill counts; without a measured `sheetTop` the bottom stays 64.
- `freeRectCenter` is the centre of the free rectangle, where `fitViewbox` centres the content and
  keyboard creation places an element (§5.5), in pixels from the container's top left; an axis whose
  insets leave no room centres in the whole container, as in `fitViewbox`. `undefined` for a
  container with a 0 side. `Viewport.freeRectCenter()` turns it into diagram coordinates.
- `sameView` compares `scale` and the screen translation (`x · scale`, `y · scale`) within
  `tolerance` relative to `max(1, |value|)`; width and height never count, so a resize is no move.
- `interpolateViewbox` interpolates the scale in log space and the centre linearly.

### Zoom readout

```ts
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4;
function canZoomOut(zoom: number): boolean; // zoom > 0.2 · 1.001
function canZoomIn(zoom: number): boolean; // zoom < 4 · 0.999
function formatPercent(zoom: number, lang: string): string; // "86%", German "86 %" (U+00A0)
function formatNumber(value: number, lang: string): string; // a tag Intl rejects ("") formats as "en"
interface ZoomReadout {
  text: string;
  ariaLabel: string;
  canZoomOut: boolean;
  canZoomIn: boolean;
}
function zoomReadout(
  zoom: number,
  lang: string,
  messages: Pick<ShellMessages, "zoomToActualNow">,
): ZoomReadout;
```

### Keymap

```ts
type ChromeKey = "zoomIn" | "zoomOut" | "zoomToActual" | "fit";
interface KeyLike {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
}
function matchChromeKey(event: KeyLike): ChromeKey | undefined;
function isUndoRedoKey(event: KeyLike): boolean;
const TEXT_FIELD_SELECTOR =
  "input, textarea, select, [contenteditable]:not([contenteditable='false'])";
function isTextField(target: unknown): boolean; // 0.6: a key's target, see below

interface KeyContext {
  host: ShellHost;
  inTextField: boolean; // isTextField(event.target)
  menuOpen: boolean; // the shell's dropdown
  dialogOpen: boolean; // any shown [role="dialog"], [role="alertdialog"] or <dialog open>, modal or not
  modalOpen: boolean; // one of them with aria-modal="true" or :modal; only this blocks the keys (§5.8: a dialog is modal)
  defaultPrevented: boolean; // the canvas or the modeler handled the key
  startScreen?: boolean; // web: the start screen shows; the chrome keys go to the browser
}
type KeyAction = ChromeKey | "closeMenu";
interface KeyDecision {
  action?: KeyAction;
  preventDefault: boolean;
  stopPropagation: boolean;
}
function decideKey(event: KeyLike, context: KeyContext): KeyDecision;

type Platform = "mac" | "other";
interface NavigatorLike {
  platform?: string;
  userAgentData?: { platform?: string };
}
function detectPlatform(navigator?: NavigatorLike): Platform;
function shortcutLabel(
  key: ChromeKey,
  platform: Platform,
  keyNames: ShellMessages["keyNames"],
): string;
function ariaKeyShortcuts(key: ChromeKey, platform: Platform): string;
function ariaKeyShortcutsFromLabel(label: string): string | undefined; // 0.6: keys of US and German, see below
type ShortcutKeyKind = "same" | "shifted" | "ruledOut"; // 0.6
function shortcutKeyKind(label: string): ShortcutKeyKind | undefined; // 0.6: how §5.6 sees the chip's key
function commandKeyLabel(key: string, platform: Platform, keyNames: { ctrl: string }): string; // "⌘O", "Ctrl+O"
```

`matchChromeKey` (§5.8) — Cmd/Ctrl is `metaKey || ctrlKey` on every platform, nothing matches with
`altKey` (AltGr):

| Chrome key     | Matches                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| `zoomIn`       | Cmd/Ctrl + `key` `+` or `=` (with or without Shift), or `code` `NumpadAdd` |
| `zoomOut`      | Cmd/Ctrl + `key` `-` or `_`, or `code` `NumpadSubtract`                    |
| `zoomToActual` | Cmd/Ctrl + `key` `0`, or `code` `Numpad0` (also with NumLock off)          |
| `fit`          | `code` `Digit1` with Shift, without Cmd, Ctrl and Alt (every layout)       |

`decideKey` holds every key rule of §5.8 and §13.5; the shell's one `keydown` listener only applies
it. `stopPropagation` is only ever `true` in the `ide` host.

| Case                                                      | Action      | preventDefault | stopPropagation (`ide`) |
| --------------------------------------------------------- | ----------- | -------------- | ----------------------- |
| Escape (no modifier), menu open, not composing            | `closeMenu` | yes            | yes                     |
| Escape, popover or dialog open, or menu open while IME    | —           | no             | yes                     |
| zoom key or Shift+1 behind the web app's start screen     | —           | no             | — (web only)            |
| zoom key, not composing, not in a text field, no modal    | the key     | yes            | yes                     |
| zoom key while composing, in a text field or with a modal | —           | no             | yes                     |
| Shift+1, not composing, not in a text field, no modal     | `fit`       | yes            | yes                     |
| Shift+1 otherwise                                         | —           | no             | no (types "!")          |
| undo/redo key in a text field                             | —           | no             | yes                     |
| any other key with `defaultPrevented`                     | —           | no             | yes                     |
| everything else                                           | —           | no             | no                      |

- "No modifier" means no Meta, Ctrl, Alt or Shift. During IME composition Escape belongs to the IME.
- A text field (§5.8: every input field, select list and editable text) is what `isTextField`
  says: a target that matches `TEXT_FIELD_SELECTOR` or sits inside a match, is
  `isContentEditable`, edits through an `EditContext` (`editContext` is set, as in Chromium's
  code editors) or sits inside a Monaco editor (`.monaco-editor`). It reads the target
  structurally and is `false` for `null`, `window` and `document`. A host or a modeler's app that
  guards its own keys the same way (a web app's "?", the Cmd/Ctrl+Z that takes back a replaced
  diagram, a paste onto the canvas) calls it instead of copying the selector, which alone misses
  EditContext and Monaco. A renderer does not import the shell and keeps its own copy of the rule,
  as the modeler-kit template's shortcuts dialog does.
- Zoom keys act whatever `defaultPrevented` says (diagram-js's keyboard prevents every key a listener
  answered, the shell's own guard included); a blocked Shift+1 is never stopped.
- `isUndoRedoKey` (Cmd/Ctrl + Z, Shift+Z, Y) decides by the typed character when it is ASCII, so
  QWERTZ and Dvorak work, and falls back to `code` `KeyZ`/`KeyY` only for non-ASCII layouts
  (Cyrillic, Greek). Cmd/Ctrl+Shift+Y is not redo: VS Code toggles its Debug Console with it.

Shortcut labels (§5.8): macOS `⌘+`, `⌘−` (U+2212), `⌘0`, `⇧1`; elsewhere `Ctrl+Plus`, `Ctrl+Minus`,
`Ctrl+0`, `Shift+1` from `keyNames`. `aria-keyshortcuts`: `Meta+= Meta+Plus`, `Meta+-`, `Meta+0`,
`Shift+1`; outside macOS `Control` for `Meta`. The platform is read in the page itself
(`detectPlatform(navigator)`, `userAgentData.platform || platform`, so an empty `userAgentData`
platform falls back), never in the extension host (VS Code Remote).

`ariaKeyShortcutsFromLabel` turns a shortcut chip label into `aria-keyshortcuts` (§5.6) for palette
entries, menu actions and the start screen's "Open a file…". It names keys, not characters (WAI-ARIA
1.2): `"L"` → `"L"`, `"⇧L"` → `"Shift+L"`, `"⌘⇧Z"` → `"Meta+Shift+Z"`, `"Ctrl+Shift+E"` →
`"Control+Shift+E"`, `"Del"` → `"Delete"`. Since 0.6 (design system 1.21.0) a character that needs ⇧
on the US or the German layout names the keys of both, US first, once where they agree: `"?"` →
`"Shift+/ Shift+ß"` (0.5 gave `"?"`), `"/"` → `"/ Shift+7"`, `"⌘?"` → `"Meta+Shift+/ Meta+Shift+ß"`,
`"#"` → `"Shift+3 #"`, `"!"` → `"Shift+1"`. ⇧ stands only where it is needed: the zoom-in chip
`"⌘+"` or `"Ctrl+Plus"` gives the zoom panel's `"Meta+= Meta+Plus"` or `"Control+= Control+Plus"`
(0.5: `"Control+Plus"`), `"⌘−"` and `"Ctrl+Minus"` give `"Meta+-"` and `"Control+-"`. `undefined` for
a label that is not one key combination (`"G then D"`, `"1–9"`) and for a character that needs AltGr
or ⌥, sits on a dead key or is missing in one of the two layouts (`"@"`, `"["`, `"\\"`, `"^"`, `"ä"`,
`"ß"`): §5.6 rules such a character out as a shortcut, and a menu entry's chip then describes the
entry.

`shortcutKeyKind` reads a chip label the same way and says how §5.6 sees its key: `"same"` where US
and German name it alike and reach it without ⇧ (`"L"`, `"⌘O"`, `"Del"`, `"⌘−"`), `"shifted"` for a
character that needs ⇧ in one of them (`"?"`, `"/"`, `"⌘+"`), whose `aria-keyshortcuts` names the
keys of both, `"ruledOut"` for a character that needs AltGr or ⌥, sits on a dead key or is missing in
one of them (`"@"`, `"["`, `"⌘ä"`). `undefined` for a label that is not one key combination
(`"G then D"`) or whose key is neither a known key nor a character (`"⌘⏎"`). The kit's `aria` and
`emptyState` cases check chips with it.

### Appearance

```ts
type Theme = "light" | "dark";
type Kontrast = "hoch";
interface Appearance {
  theme: Theme;
  kontrast?: Kontrast;
}
function resolveAppearance(requested: Appearance, themes: readonly Theme[]): Appearance;
function appearanceFromColorThemeKind(kind: number): Appearance;
type ColorThemeSetting = "automatic" | "light" | "dark";
function requestedAppearance(kind: number, setting?: ColorThemeSetting): Appearance;
function appearanceFromBodyClasses(classes: Iterable<string>): Appearance | undefined;
function reducedMotionFromBodyClasses(classes: Iterable<string>): boolean; // vscode-reduce-motion
const REDUCED_MOTION_CLASS = "cd-shell-reduce-motion"; // on <html>, mirrored by mountVsCodeShell
interface AppearanceAttributes {
  "data-cd-theme": Theme;
  "data-cd-kontrast"?: Kontrast;
}
function appearanceAttributes(appearance: Appearance): AppearanceAttributes;
```

- `resolveAppearance` is the one decision of §13.5: a theme outside `themes` becomes `themes[0]`, so
  a modeler declaring `["light"]` is never half-dark; `kontrast: "hoch"` always passes (VS Code High
  Contrast on a light-only modeler gives `{ theme: "light", kontrast: "hoch" }`), any other value is
  dropped, since appearances arrive by `postMessage`. Throws for empty `themes`. `themes` is a static
  value of the modeler package, known before the first paint.
- `appearanceFromColorThemeKind`: 1 → light, 2 → dark, 3 → dark + hoch, 4 → light + hoch, other →
  light. `requestedAppearance` lets the setting's theme win unless it is `automatic`; the contrast
  always comes from the kind.
- `appearanceFromBodyClasses` checks `vscode-high-contrast-light` before `vscode-high-contrast`.
- `reducedMotionFromBodyClasses` reads VS Code's `workbench.reduceMotion` from the body class
  `vscode-reduce-motion`; while `<html>` carries `REDUCED_MOTION_CLASS`, the shell's animations stop
  and an explicit fit jumps, as under `prefers-reduced-motion`.

### Messages

```ts
interface ShellMessages {
  menu: string; // "Menu"
  tools: string; // "Tools"
  canvas: string; // "Diagram": aria-label of the focusable canvas <svg>, name the notation
  zoom: string; // "Zoom"
  zoomOut: string; // "Zoom out"
  zoomIn: string; // "Zoom in"
  zoomToActual(percent: string): string; // "Zoom to 100%"
  zoomToActualNow(percent: string, now: string): string; // "Zoom to 100% (now 86%)"
  fit: string; // "Fit to view"
  legend: string; // "Legend"
  closeLegend: string; // "Close legend"
  problems(count: number, formattedCount: string): string; // "1 problem", "2 problems"
  problemsLabel(
    count: number,
    errors: number,
    formattedCount: string,
    formattedErrors: string,
  ): string;
  // "2 problems, 1 error", "2 problems, no errors"
  showProblems: string; // "Show in Problems view"
  emptyHint: string; // "Pick a tool from the palette to start."
  insertExample: string; // "Insert example"
  invalidFile(diagram: string): string;
  // "This file isn't a valid <diagram> right now. The diagram shows the last valid version and is read-only until you fix the text."
  keyNames: { ctrl: string; shift: string; plus: string; minus: string }; // Ctrl, Shift, Plus, Minus
  // 0.2, web host (guide §2 shared terms)
  share: string; // "Share": default label of the primary action
  legal: string; // "Legal": aria-label of the legal line's <nav>
  copyright(year: number): string; // "© 2026 Miragon GmbH"
  opensInNewTab: string; // "Opens in a new tab": the legal links' description for screen readers
  newDiagram: string; // "New diagram": File group and the empty state's primary button
  openFile: string; // "Open…"
  showExample: string; // "Show example": File group and the empty state's ghost button
  importFile: string; // "Import…"
  appearance: string; // "Appearance"
  appearanceSystem: string; // "System"
  appearanceLight: string; // "Light"
  appearanceDark: string; // "Dark"
  problemsTitle: string; // "Problems": title of the problems popover
  problemSeverity(severity: ProblemSeverity): string; // "Error", "Warning": a popover row's icon, for screen readers
  close: string; // "Close": a toast's Close button
  dropFile: string; // "Drop file here"
  dropForbidden(reason: DropForbiddenReason): string;
  // "Drop one file at a time", "This modeler can't open this file type", "Close the dialog to drop a file"
  dropHint: string; // "Or drop a file here"
  openFileLink: string; // "Open a file…": the start screen's link to the File group's Open…
  cannotOpenFile(name: string, accepted: string): string;
  // "Couldn't open “map.png”. Drop a .storm, .json, or .txt file." (accepted: Intl.ListFormat disjunction)
}
// every key optional; an undefined value keeps the default
type ShellMessageOverrides = {
  [Key in Exclude<keyof ShellMessages, "keyNames">]?: ShellMessages[Key] | undefined;
} & { keyNames?: { [Key in keyof ShellMessages["keyNames"]]?: string | undefined } | undefined };
const defaultMessages: ShellMessages;
function resolveMessages(overrides?: ShellMessageOverrides): ShellMessages;
```

A localized modeler overrides the whole table (guide §2: one language per tool) and passes `lang`.
"Impressum" and "Datenschutz" are not in the table: they stay German with `lang="de"` in every tool
language (§2).

### Layout decisions

```ts
const PALETTE_CLEARANCE = 16;
const TOOLTIP_DELAY_MS = 300;
const INVALID_STATUS_DELAY_MS = 800;
interface PaletteRowInput {
  containerWidth: number;
  paletteWidth: number;
  menuRight: number;
  primaryLeft?: number;
}
function decidePaletteRow(input: PaletteRowInput): PaletteRow;
/** @deprecated 0.5: always false, the arguments are ignored */
function legendStartsOpen(containerHeight?: number, containerWidth?: number): boolean;
interface TooltipPlacementInput {
  anchor: Bounds;
  island: Bounds;
  tooltip: Size;
  container: Size;
}
function placeTooltip(input: TooltipPlacementInput): Point;
```

`decidePaletteRow` (§5.15): `second-row` up to 760px container width, or when the centred palette
would keep less than 16px to the menu trigger (or to the primary action); `paletteWidth` is the
intrinsic border-box width (`offsetWidth − clientWidth + scrollWidth`: the content including the
borders), so the decision does not flip once the palette scrolls in the second row.

`placeTooltip` (§5.6): below an island in the upper half at `island.bottom + 8` (top row 60, second
row 112), above one in the lower half ending 8px above it (bottom row: `bottom: 60px`), centred on
`anchor`, shifted to keep 12px to the sides.

### Web host decisions (0.2)

The web column's DOM-free parts are in `./core` as well, documented with their islands under
[Web host](#web-host-02): `decideTopRow` (label collapse before the second row), `zoomRowRaised`
(legal line and zoom panel), `dragVerdict` and `acceptsFile` (drop zone), `toastLifetime`,
`toastToEvict`, `toastStackWidth`, `toastStackBottom` and their constants (toasts),
`parseAppearanceChoice`, `documentMode`, `webModeScript` and `webHeadMarkup` (mode; they run in a
Vite config or a build script), `problemSummary` (problems popover).

## `.` — the chrome

Exports everything of `./core` plus:

```ts
function mountShell(root: HTMLElement, options: ShellOptions): ShellHandle;

interface ShellOptions {
  host: ShellHost;
  canvas?: HTMLElement; // diagram-js's container; omitted: the shell creates it (handle.canvas)
  lang?: string; // see below; the embedded root carries lang itself
  messages?: ShellMessageOverrides;
  platform?: Platform; // default detectPlatform(navigator)
  keyScope?: "document" | "root"; // default "document", "root" for embedded
  themes?: readonly Theme[]; // default ["light"]; read in the embedded and web hosts, see below
  menu?: MenuGroups;
  problems?: ProblemsOptions;
  legend?: LegendOptions;
  inspector?: InspectorOptions;
  emptyHint?: EmptyHintOptions;
  // 0.2, read in the web host only (see Web host below)
  primary?: PrimaryActionOptions;
  legal?: LegalLineOptions;
  file?: FileMenuOptions;
  appearance?: WebAppearanceOptions; // required when themes includes "dark"
  emptyState?: EmptyStateOptions;
  dropZone?: DropZoneOptions;
}
```

`mountShell` turns `root` into the shell: class `cd-shell`, `container: cd-shell / size`,
`isolation: isolate`. `root` must be sized from outside, otherwise size containment collapses it to 0:
in an own document a root that is a direct child of `<body>` gets `height: 100%` from `shell.css`
(a zero-specificity rule), any other root and an embedded one need an explicit size. In the `ide` and
`web` hosts `<html>` gets `cd-shell-document` (own-document reset). The shell observes the root and
the registered palette with a `ResizeObserver` (palette row; 0 × 0 is skipped)
and installs exactly one `keydown` listener (bubble phase) on `document` or on the root.

`lang` is the tool's UI language for `Intl` (guide §2: one language per tool). Default in an own
document (`ide`, `web`): the closest `[lang]` of the root (the `<html lang>` the host wrote), else
`"en"`. In the `embedded` host the page's language is not the tool's, so the default is the root's
own `lang` attribute, else `"en"`; the embedded root carries `lang` itself. A localized modeler
passes `lang` together with its messages.

**The embedded root's mode** (§13.3). The token CSS resolves the roles on the nearest
`[data-cd-theme]`, so a root without one would take the mode of a themed host page (designIQ, a web
app on `system` under a dark OS) and be half-dark against its light-drawn diagram. The `embedded`
root therefore carries `data-cd-theme="<themes[0]>"` itself (until the contract's `appearance`
surface, planned for a later 1.x minor of `@miragon/modeler-api`, there is no channel to ask an
embedded modeler for another mode, so it stays in its first one), and mirrors the host's
`data-cd-kontrast` from the nearest mode carrier above it for as long as it lives (a
`MutationObserver` on the document's `data-cd-theme`/`data-cd-kontrast` attributes), because its own
`data-cd-theme` would otherwise drop the host's high contrast. In the `ide` host the
host writes the mode on `<html>` and `themes` is not read; in the `web` host the page's head script
writes it before the first paint and `themes` decides whether the shell renders the Appearance
group (see [Mode](#mode-133)). An empty `themes` throws before anything is mounted.

**Order with document listeners.** Listeners on one target run in registration order. A modeler
whose own keyboard listens on `document` (Event Storming does) constructs its diagram **before**
`mountShell`, so the shell's listener runs after it and sees `defaultPrevented`; a renderer that
creates its diagram lazily (Event Storming's `Modeler` on the first `get`) calls
`modeler.get("canvas")` first. Listeners on the canvas `<svg>` (diagram-js `keyboard`) have no
ordering constraint. Such a document keyboard must leave alone what is not meant for the canvas:
keys with `defaultPrevented` and keys whose target lies outside the canvas container (the menu
stops the keys it consumes, the palette its own, but the zoom panel's buttons do not); in the IDE
host it binds no undo or redo, and on the canvas it handles Cmd/Ctrl+A (see `./diagram-js`,
Keyboard).

### Menu (§5.4)

```ts
interface MenuGroups {
  model?: readonly MenuEntry[];
  export?: readonly MenuEntry[];
  help?: readonly MenuEntry[];
}
type MenuGroupName = "file" | "model" | "export" | "appearance" | "help"; // data-menu-group
type MenuEntry = MenuActionEntry | MenuDialogEntry | MenuCheckboxEntry | MenuRadioGroup;

interface MenuItemBase {
  id: string;
  label: string;
  icon?: ShellIconName;
  disabled?: () => boolean;
  keepEnabledWhenReadOnly?: boolean; // a Model entry that is pure view state; default false
}
interface MenuActionEntry extends MenuItemBase {
  kind: "action";
  shortcut?: string;
  ariaKeyShortcuts?: string; // default ariaKeyShortcutsFromLabel(shortcut), "?" → "Shift+/ Shift+ß"; "" sets none
  danger?: boolean;
  onSelect(): void;
}
interface MenuDialogEntry extends MenuItemBase {
  kind: "dialog";
  shortcut?: string; // 0.2: the chip of a dialog entry ("?" for "Keyboard shortcuts…")
  ariaKeyShortcuts?: string; // as for an action
  onSelect(): void;
}
interface MenuCheckboxEntry extends MenuItemBase {
  kind: "checkbox";
  checked(): boolean;
  onToggle(checked: boolean): void;
}
interface MenuRadioGroup {
  kind: "radio";
  id: string;
  label: string;
  options: readonly MenuRadioOption[];
  value(): string | undefined;
  onSelect(value: string): void;
  disabled?: () => boolean;
  keepEnabledWhenReadOnly?: boolean;
}
interface MenuRadioOption {
  value: string;
  label: string;
}
```

- Groups render in the fixed order File, Model, Export, Appearance, Help with separators; empty
  groups collapse. File and Appearance exist in the web host only and the shell builds them
  (`ShellOptions.file`, the Appearance group of a dark-capable modeler, see
  [File and Appearance groups](#file-and-appearance-groups-54-133)); Model, Export and Help come
  from `MenuGroups`. With a legend (and `legend.menuEntry !== false`) the shell appends the checkbox
  "Legend" to the Model group.
- `action` and `dialog`: the menu closes, focus returns to the trigger, then `onSelect` runs (a host
  dialog then hands focus back to a visible control). After a pointer click on an `action` of the
  File or Model group the focus goes to the canvas instead (0.2.2, §5.8), since those change what
  the canvas shows. `dialog` adds `aria-haspopup="dialog"`; its label ends with "…" (U+2026), and in
  0.2 the modeler renders the dialog itself (see [Modeler dialogs](#modeler-dialogs)).
- `checkbox` and `radio` toggle and keep the menu open. State is read through `checked()`, `value()`
  and `disabled()` whenever the menu opens and on `menu.refresh()`.
- Icons only from the common set and only where the guide gives one; the icon column stays 16px wide
  without an icon. An action or dialog entry with a `shortcut` shows its chip and carries
  `aria-keyshortcuts`. The chip is `aria-hidden`, so it stays out of the entry's accessible name
  ("Keyboard shortcuts…", not "Keyboard shortcuts… ?") and a dialog entry's name still ends with "…".
  `aria-keyshortcuts` announces the key; where it names none (`ariaKeyShortcuts: ""`, a chip that is
  not one key combination such as `"G then D"`, a character §5.6 rules out such as `"@"` or `"["`),
  the chip describes the entry (`aria-describedby`). The kit's `aria` case still fails a chip on a
  ruled-out character, and one whose character needs ⇧ (`"?"`) without the keys of both layouts,
  so `ariaKeyShortcuts: ""` does not opt such a chip out.
- On a read-only canvas (`setReadOnly(true)`, §13.5) every Model entry is `aria-disabled` unless it
  sets `keepEnabledWhenReadOnly`; disabled entries stay focusable and do nothing. View toggles stay
  usable on a read-only canvas: the shell's Legend checkbox carries `keepEnabledWhenReadOnly` itself,
  and a modeler sets it on its own pure view state (Event Storming's "Type captions"), never on an
  entry that changes the document (Level, "Map size…"). File, Export, Appearance and Help entries are never locked.
  Guide §13.5 (design system 1.13.0): only Model entries that change the document are `aria-disabled`.
- The trigger is `hidden` while no group has an entry (no menu groups and no Legend entry).
- Keys: Enter, Space and ↓ on the trigger open on the first entry, ↑ on the last; ↑/↓ wrap, Home/End
  jump, a letter jumps to the next entry starting with it; Escape and Tab close (Escape returns focus
  to the trigger). Every key the menu consumes (those, plus Enter, Space, Delete and Backspace in the
  dropdown) is stopped at the menu in every host, so a modeler's keyboard on `document` never acts
  on it (Event Storming would move the selection on ↓); Escape, Tab, modified keys and the chrome
  keys go on (Shift+1 fits, Cmd/Ctrl + `+` zooms with the menu open).
- A `pointerdown` outside (capture phase on `document`) closes without moving focus and without
  stopping the event, so it still acts on its target. So does the window losing the focus (a click
  into the VS Code workbench or another iframe).

### Modeler dialogs

0.3 has no dialog component (a later candidate, see [Out of scope for 0.3](#out-of-scope-for-03)), so
a modeler renders its dialogs, the "Keyboard shortcuts…" dialog of the Help group (§5.4) first among
them, and meets §8 on its own:

- **Layer.** `z-index: var(--cd-shell-ebene-dialog)` (50) applies only to a dialog outside the top
  layer, inside `shell.root`. A `<dialog>` opened with `showModal()` or an element of the popover API
  lies in the browser's top layer above everything, whatever its `z-index`. The shell's keys count it
  either way: any shown `<dialog>`, `[role="dialog"]` or `[role="alertdialog"]` in the document
  (embedded: in the root) is open, and a modal one blocks the zoom keys.
- **Panel and backdrop** (§8): panel `--cd-ui-flaeche-hoch` with 1px `--cd-ui-linie`, radius `md`,
  `shadow-3`, `width: min(560px, 100cqw - 32px)`, `max-height: calc(100cqh - 32px)` with a scrolling
  body; header (padding `16px 16px 8px 24px`, title 21px/600) with Close as a 32 × 32 ghost icon
  button (Lucide `x` 16px, `aria-label` "Close"); backdrop
  `background: var(--cd-ui-backdrop); backdrop-filter: blur(3px) grayscale(1)` in both modes. The
  shortcut chips look like the tooltip's (§5.6).
- **High contrast** (`[data-cd-kontrast="hoch"]`, §6, §5.14): no shadow, border `--cd-ui-kontur`,
  focus ring 3px.
- **Forced colours** (`@media (forced-colors: active)`): border `CanvasText`, focus ring `Highlight`.
  The shell's own high-contrast and forced-colours rules match only `cd-shell-*` classes, so they
  do not reach a modeler's dialog.
- **Focus** (§8): it moves into the dialog and stays there, Escape and a click on the backdrop close
  it, and it returns to the control that opened it (the menu trigger after a menu entry).
- **Read-only:** the shortcuts dialog stays usable on a read-only canvas (§13.5).
- **Teardown:** the dialog is the modeler's content in `shell.root`, removed by the modeler (see
  `destroy()` below).

### Problems, legend, inspector, empty-file hint

```ts
interface ProblemsOptions {
  onActivate?(): void; // the IDE host opens its Problems view (give it there); ignored in the web host
  onSelectItem?(item: ProblemItem): void; // 0.2: a row of the problems popover, after it closed
}
interface LegendOptions {
  render(body: HTMLElement): void; // once; a throw unwinds the whole mount
  open?: boolean; // remembered start state (webview state, localStorage); default (also undefined) closed
  onToggle?(open: boolean): void; // every change (close button, checkbox, setOpen, toggle); persist it
  menuEntry?: boolean; // default true
}
interface InspectorOptions {
  label: string; // aria-label of the <aside>
}
interface EmptyHintOptions {
  onInsertExample?(): void; // shows "Insert example"; the modeler writes the example as one edit
}
```

### Handle

```ts
interface ShellHandle {
  readonly root: HTMLElement;
  readonly canvas: HTMLElement;
  readonly host: ShellHost;
  readonly lang: string;
  readonly platform: Platform;
  readonly messages: ShellMessages;
  readonly menu: MenuHandle;
  readonly tooltip: TooltipHandle;
  readonly legend: LegendHandle | undefined;
  readonly inspector: InspectorHandle | undefined;
  readonly primary: PrimaryActionHandle | undefined; // 0.2, web host with `primary`
  readonly appearance: AppearanceHandle | undefined; // 0.2, web host with "dark" in `themes`
  setZoomTarget(target: ZoomTarget | null): void;
  fitInsets(): Insets;
  registerPalette(palette: PaletteRegistration): () => void;
  setProblems(summary: ProblemSummary): void;
  setStatus(status: StatusMessage | null, options?: { delayMs?: number }): void;
  setEmptyHint(visible: boolean): void;
  setReadOnly(readOnly: boolean, options?: { delayMs?: number }): void;
  isReadOnly(): boolean;
  setEmptyState(shown: boolean): void; // 0.2, web host with `emptyState`
  isEmptyStateShown(): boolean;
  toast(request: ToastRequest): ToastHandle; // 0.2, web and embedded; inert in the ide host
  destroy(): void;
}
interface MenuHandle {
  readonly trigger: HTMLButtonElement;
  readonly dropdown: HTMLElement;
  isOpen(): boolean;
  open(focus?: "first" | "last"): void;
  close(options?: { restoreFocus?: boolean }): void;
  refresh(): void;
  setGroups(groups: MenuGroups): void;
}
interface TooltipContent {
  label: string;
  shortcut?: string;
}
interface TooltipHandle {
  attach(control: HTMLElement, content: TooltipContent | (() => TooltipContent | null)): () => void;
  hide(): void;
}
interface LegendHandle {
  readonly element: HTMLElement;
  readonly body: HTMLElement;
  isOpen(): boolean;
  setOpen(open: boolean): void;
  toggle(): void;
}
interface InspectorHandle {
  readonly element: HTMLElement;
  isOpen(): boolean;
  open(): void;
  close(): void;
}
interface PaletteRegistration {
  element: HTMLElement; // .djs-palette
  entryTooltip(entry: HTMLElement): TooltipContent | null;
  setReadOnly(state: PaletteReadOnlyState): void; // on registration and on every change
}
interface PaletteReadOnlyState {
  locked: boolean; // veto every entry but Lasso and Hand, from the invalid import on
  shown: boolean; // mark them aria-disabled and muted, once the delay has passed
}
interface ProblemSummary {
  count: number;
  errors: number;
  items?: readonly ProblemItem[]; // 0.2: the popover's rows; the ide host ignores them
}
type StatusSeverity = "danger" | "warning";
interface StatusMessage {
  severity: StatusSeverity;
  text: string;
}
```

- `setZoomTarget` binds zoom panel, readout and chrome keys; the readout reads `zoom()` at most once
  per animation frame after `onChange`. With `null` the three buttons are `aria-disabled`; the readout
  never is (§5.8), its click does nothing then. Buttons and keys never call `stepZoom` past a limit
  (zoom out at or below 20 % never zooms in), never `zoomToActual` at exactly 100 % and never `fit`
  while `canFit()` is false.
- Focus after a pointer click (0.2.2, guide §5.8 since design system 1.14.0): a click with mouse,
  pen or finger (`detail` ≥ 1) on a zoom button (also one at its limit), on a palette entry (also a
  `dragstart` from it, also a vetoed one) or on an `action` entry of the File or Model group hands
  the focus to the canvas through the zoom target's `focus()`, so the canvas's keys (Delete, the
  arrows, undo) act at once. Open… and Import… are such actions unless `FileMenuAction.dialog` is
  set: the browser's file picker is no dialog in the modeler, and the file picked there shows on the
  canvas. Enter and Space (`detail` 0, the palette's synthetic click included) leave the focus on
  the control. Export and Help actions, `dialog` entries, the menu trigger, the pill and the primary
  action keep their focus handling. A zoom target without `focus` (a host without the diagram-js
  adapter) leaves the focus where the click put it; a menu action then returns it to the trigger.
- `fitInsets()` is `fitInsets(layout)` of `./core` for what is open and measured right now (palette
  row, pill, legend width, side inspector or measured sheet top).
- `registerPalette` is the adapter's API (`connectDiagramJs` calls it, possibly from inside
  diagram-js's `palette.create`, before any entry exists); a later registration replaces the
  earlier one, and the returned unregister function is safe to call twice and after `destroy()`.
  The shell listens for `click` and `dragstart` on the palette element after diagram-js's own
  delegates, so a pointer activation of an entry runs first and then hands the focus to the canvas.
- `setProblems`: the pill shows for `count > 0` with `Intl` numbers in `lang` and the icon by severity;
  its tooltip "Show in Problems view" exists only in the `ide` host (`aria-describedby`, since it
  says more than the label). A click calls `onActivate` in the `ide` host and in an `embedded` host
  that gives it; in the `web` host (and an `embedded` one without `onActivate`) it opens the
  problems popover with `summary.items` (see [Problems popover](#problems-popover-510)).
- `setStatus(status, { delayMs })`: shows after `delayMs` (an invalid file: `INVALID_STATUS_DELAY_MS`,
  so typing does not flicker and `role="alert"` does not re-announce), hides at once with `null`.
  Repeated calls while the delay runs keep the first timer (the box appears once the text stayed
  invalid for 800ms), `null` drops it, and an unchanged text is not written again.
- `setReadOnly(true, { delayMs })` (invalid file, §13.5) locks at once: `isReadOnly()`, the palette
  veto (every entry but Lasso and Hand) and the Model entries of the menu without
  `keepEnabledWhenReadOnly`. The marks follow after `delayMs` (pass `INVALID_STATUS_DELAY_MS`, as for
  the status box): `data-readonly` on the root and the palette entries `aria-disabled`, muted,
  previews in `grayscale(1)`. Repeated calls keep the first timer; `setReadOnly(false)` unlocks and
  hides at once. The legend is a view toggle: its Legend checkbox and its close button keep working
  under the lock (guide §13.5, design system 1.13.0).
- The canvas is the modeler's to lock, from the same invalid import on (§13.5, what the read-only
  state blocks): no context pad, no move, resize, delete or paste, and no label editor (also not on
  a double-click). Selection, zoom, pan, the export of the last valid state and the "Keyboard
  shortcuts…" dialog stay. The modeler reads `isReadOnly()` or keeps a lock of its own next to
  `setReadOnly` (Event Storming's `eventStormingReadOnly` service); the kit's `readOnly` case checks
  each of these.
- `setEmptyHint` shows or hides the hint; `connectDiagramJs` keeps it in sync with the diagram. When
  the hint (its "Insert example") or the closing inspector holds the focus, the focus moves to the
  canvas `<svg>` (else the menu trigger) instead of falling to `<body>`.
- `tooltip.attach` shows the chrome tooltip after `TOOLTIP_DELAY_MS` hover or at once on keyboard
  focus (`:focus-visible`, also on `aria-disabled` buttons); after a hover-hide a neighbour shows at
  once for the same delay. It hides on click (until the pointer leaves), Escape, leave, blur and menu
  open, never on touch. It sets `aria-describedby` only when its text says more than the control's
  name, which a shortcut chip does unless the control names its keys in `aria-keyshortcuts`. The
  shell attaches it to its own buttons; the palette gets it through `registerPalette`.
- The legend starts closed in every container (guide §5.10; decided by the product owner on
  2026-10-24, replacing 0.4's rule of closed up to 820px height and up to 440px width). Only a
  stored `legend.open` opens it on mount, at any size; the user opens it from the Model group's
  Legend checkbox or through `legend.setOpen(true)`. The start state does not call `onToggle`.
  While it is open, the fit keeps room for it above 440px width. Its close button returns the focus
  to the menu trigger.
- `legendStartsOpen` is deprecated since 0.5: it returns `false` whatever it is given and keeps
  its optional parameters only so existing callers compile. Pass the stored state as `legend.open`
  and leave the default to the shell.
- `destroy()` removes every element, class, attribute, listener, observer and timer the shell added
  and restores what was there before the mount: a passed `canvas` stays where it is, without
  `cd-shell-canvas`, and a `cd-shell-document` class or a `lang` the page already had stays (the
  class `renderWebviewHtml` writes on `<html>` included). A second call and every later handle call
  are no-ops. A mount that throws (a modeler's `legend.render`) undoes the same before the error
  propagates. Content a modeler adds to `shell.root` (a dialog, a popover) is the modeler's: it
  removes it in its own teardown, before or with `shell.destroy()`, for example on `diagram.destroy`,
  because the shell removes only what it added.
- Element ids (`cd-shell-menu-N`, `cd-shell-tooltip-N`, `cd-shell-legend-title-N`) count on one
  page-global counter (`Symbol.for("@miragon/modeler-shell.mounts")`), so two modelers that each
  bundle the shell never share an id on one foreign page.

### Icons

```ts
type IconNode = ReadonlyArray<readonly [tag: string, attributes: Readonly<Record<string, string>>]>;
type ShellIconName =
  | "menu"
  | "minus"
  | "plus"
  | "maximize"
  | "check"
  | "x"
  | "file-plus"
  | "folder-open"
  | "import"
  | "file-image"
  | "file-code-corner"
  | "keyboard"
  | "share-2"
  | "circle-x"
  | "triangle-alert"
  | "square-dashed-mouse-pointer"
  | "hand"
  | "line-segment"
  | "unfold-horizontal"
  | "workflow";
const ICONS: Readonly<Record<ShellIconName, IconNode>>; // lucide-static 1.59.0, unchanged (ISC); line-segment = spline with a straight segment
interface IconOptions {
  size?: number; // default 16
  strokeWidth?: number; // default 2.5
  className?: string;
}
const PALETTE_TOOL_ICON: Readonly<IconOptions>; // { size: 20, strokeWidth: 2 }
function iconMarkup(icon: ShellIconName | IconNode, options?: IconOptions): string;
function iconElement(icon: ShellIconName | IconNode, options?: IconOptions): SVGSVGElement;
```

`iconMarkup` renders decorative SVG (`aria-hidden="true"`, `focusable="false"`, `fill="none"`,
`stroke="currentColor"`, round caps and joins) and lets only Lucide's elements and geometry
attributes pass, so palette providers can put it into an entry's `html`.

The geometry is Lucide's (ISC, © Lucide Icons and Contributors); `check`, `circle-x`, `maximize`,
`minus`, `plus`, `triangle-alert` and `x` derive from Feather (MIT, © Cole Bemis), as Lucide's
LICENSE lists them (two by their Feather names, `x-circle` and `alert-triangle`). `src/dom/icons.ts`
opens with a legal comment (`/*! … @license … */`) naming both, which esbuild keeps in the `dist`
chunk that carries the icons (ESM and CJS). A consumer's bundler may drop or move legal comments (its
`legalComments` setting), so a VSIX or a web bundle that contains the shell carries the Lucide and
Feather notices of `THIRD_PARTY_NOTICES.md` itself.

### DOM, `data-chrome` and classes

```html
<html class="cd-shell-document" lang="en" data-cd-theme="light">  <!-- own document: ide, web -->
<div class="cd-shell" data-cd-shell-host="ide" data-palette="top"
     data-legend="open" data-inspector="open" data-problems="shown" data-readonly>  <!-- state attributes only while true -->
     <!-- embedded: lang="en" data-cd-theme="light" [data-cd-kontrast="hoch"] on the root itself -->
  <button class="cd-shell-menu-trigger" data-chrome="menu" aria-label="Menu" aria-haspopup="menu"
          aria-expanded="false" aria-controls="cd-shell-menu-1">…</button>
  <div class="cd-shell-canvas">                         <!-- diagram-js container -->
    <div class="djs-container">
      <div class="djs-palette" data-chrome="palette">   <!-- moved before the <svg> -->
        <div class="djs-palette-entries" role="toolbar" aria-label="Tools">
          <div class="group" data-group="tools">
            <div class="entry" data-action="lasso-tool" role="button" aria-label="…" tabindex="0" aria-pressed="false" aria-keyshortcuts="L">…</div>
      <svg tabindex="0" role="application" aria-label="Diagram">…</svg>
  <div class="cd-shell-status" data-chrome="status" data-severity="danger" role="alert">…</div>
  <div class="cd-shell-hint"><p class="cd-shell-hint-text">…</p><button class="cd-shell-hint-action">…</button></div>
  <aside class="cd-shell-inspector" data-chrome="inspector" aria-label="…">…</aside>
  <button class="cd-shell-problems" data-chrome="problems" aria-label="2 problems, 1 error">…</button>
  <section class="cd-shell-legend" data-chrome="legend" aria-labelledby="…">…</section>
  <div class="cd-shell-zoom" data-chrome="zoom" role="group" aria-label="Zoom">
    <button data-zoom="out"> <button class="cd-shell-zoom-readout" data-zoom="actual"> <button data-zoom="in">
    <span class="cd-shell-zoom-separator"> <button data-zoom="fit">
  </div>
  <div class="cd-shell-layer">                           <!-- z 40: dropdown and tooltip -->
    <div class="cd-shell-menu" id="cd-shell-menu-1" role="menu" aria-label="Menu">…</div>
    <div class="cd-shell-tooltip" role="tooltip"><span class="cd-shell-tooltip-label">Zoom in</span><kbd class="cd-shell-kbd">⌘+</kbd></div>
  </div>
</div>
```

The DOM order is the tab order of §5.14 (menu trigger, palette, canvas, status box, hint, inspector,
pill, legend, zoom panel; the web host adds the primary action after the menu trigger, the
empty-state card after the hint and the legal line before the zoom panel, see
[Web host](#web-host-02)); nothing has a positive `tabindex`, and a renderer adds no tab stop of its
own around the canvas (no `tabindex` on `.djs-container`). Islands that are not shown are `hidden`.

| `data-chrome`      | Element                       | Notes                                      |
| ------------------ | ----------------------------- | ------------------------------------------ |
| `menu`             | menu trigger                  | icon only, Lucide `menu`                   |
| `palette`          | diagram-js `.djs-palette`     | set by `shellModule`                       |
| `primary`          | primary action (web)          | only with `primary`, see Web host          |
| `zoom`             | zoom panel                    | `[−][NN%][+] \| [Fit]`                     |
| `problems`         | problems pill                 | `hidden` at 0                              |
| `legend`           | legend card                   | only with `legend`                         |
| `inspector`        | inspector `<aside>`           | only with `inspector`                      |
| `status`           | status box under the palette  | `role="alert"` (danger) or `role="status"` |
| `legal`            | legal line (web)              | always in the web host                     |
| `toasts`           | toast stack (web, embedded)   | always present, no box while empty         |
| `empty-state`      | start screen card (web)       | only with `emptyState`                     |
| `drop-zone`        | drop overlay (web)            | only with `dropZone`, during a file drag   |
| `problems-popover` | problems list (web, embedded) | in the layer, opened by the pill           |

| Class                                                                                                                                                                                                                                                                  | Part                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `cd-shell`, `cd-shell-document`, `cd-shell-canvas`, `cd-shell-layer`                                                                                                                                                                                                   | root, own document, canvas slot, layer      |
| `cd-shell-island`, `cd-shell-target`                                                                                                                                                                                                                                   | glass island, 32px target in an island      |
| `cd-shell-menu-trigger`, `cd-shell-menu`, `cd-shell-menu-item`, `cd-shell-menu-item-icon`, `cd-shell-menu-item-label`, `cd-shell-menu-item-end`, `cd-shell-menu-separator`, `cd-shell-menu-heading`, `cd-shell-menu-group`                                             | menu                                        |
| `cd-shell-menu-shortcut`, `cd-shell-menu-check`                                                                                                                                                                                                                        | shortcut text and check mark of an entry    |
| `cd-shell-tooltip`, `cd-shell-tooltip-label`, `cd-shell-kbd`                                                                                                                                                                                                           | tooltip and shortcut chip                   |
| `cd-shell-zoom`, `cd-shell-zoom-readout`, `cd-shell-zoom-separator`                                                                                                                                                                                                    | zoom panel                                  |
| `cd-shell-problems`, `cd-shell-problems-icon`, `cd-shell-problems-text`                                                                                                                                                                                                | pill                                        |
| `cd-shell-status`, `cd-shell-status-icon`, `cd-shell-status-text`                                                                                                                                                                                                      | status box (bar as `::before`)              |
| `cd-shell-hint`, `cd-shell-hint-text`, `cd-shell-hint-action`                                                                                                                                                                                                          | empty-file hint                             |
| `cd-shell-legend`, `cd-shell-legend-header`, `cd-shell-legend-title`, `cd-shell-legend-close`, `cd-shell-legend-body`                                                                                                                                                  | legend card                                 |
| `cd-shell-legend-row`, `cd-shell-legend-preview`, `cd-shell-legend-separator`                                                                                                                                                                                          | rows the modeler renders into the body      |
| `cd-shell-inspector`                                                                                                                                                                                                                                                   | inspector                                   |
| `cd-shell-no-transition`                                                                                                                                                                                                                                               | on `<html>` for one frame of a mode switch  |
| `cd-shell-button` (`data-variant="primary"` / `"ghost"`)                                                                                                                                                                                                               | buttons of the web chrome (0.2)             |
| `cd-shell-primary`, `cd-shell-primary-label`                                                                                                                                                                                                                           | primary action (0.2)                        |
| `cd-shell-legal`, `cd-shell-legal-item`                                                                                                                                                                                                                                | legal line, a separator with its link (0.2) |
| `cd-shell-empty-state`, `cd-shell-empty-state-mark`, `cd-shell-empty-state-title`, `cd-shell-empty-state-text`, `cd-shell-empty-state-actions`, `cd-shell-empty-state-hint`, `cd-shell-empty-state-open-item`, `cd-shell-empty-state-open`, `cd-shell-empty-state-key` | empty-state card (0.2)                      |
| `cd-shell-drop-zone`, `cd-shell-drop-zone-chip`                                                                                                                                                                                                                        | drop zone (0.2)                             |
| `cd-shell-toasts`, `cd-shell-toast`, `cd-shell-toast-dot`, `cd-shell-toast-text`, `cd-shell-toast-action`, `cd-shell-toast-close`                                                                                                                                      | toasts (0.2)                                |
| `cd-shell-live`, `cd-shell-live-region` (`data-live="polite"` / `"assertive"`)                                                                                                                                                                                         | the toasts' live regions (0.2)              |
| `cd-shell-problems-popover`, `cd-shell-problems-popover-title`, `cd-shell-problems-list`, `cd-shell-problem`, `cd-shell-problem-icon`, `cd-shell-problem-message`, `cd-shell-problem-location`                                                                         | problems popover (0.2)                      |

Internal attributes: `data-severity` on pill and status box, `data-danger` on a dangerous menu
entry, `data-menu-id` on entries and radio groups (the shell's Legend entry is `data-menu-id="legend"`,
so a modeler does not use the id `legend`), `data-menu-group` (`file`, `model`, `export`, `appearance`,
`help`) on entries and radio groups, which the kit's `readOnly` case reads, `data-menu-value` on radio options,
`data-zoom` on the zoom buttons.

Modelers style only their own content (legend rows, inspector fields); every other class is
internal to the shell CSS and may change in a minor release.

### Geometry

Relative to the shell root's padding box (a border a foreign page gives the root does not count),
±1px (§5.2 to §5.15). `ide` and `embedded` share the IDE column.

| Island      | Box                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `menu`      | 40 × 40 at `top: 12px; left: 12px`                                                                                                                    |
| `palette`   | 40 high at `top: 12px`, horizontally centred; second row `top: 64px`, at most `100cqw − 24px` wide                                                    |
| `zoom`      | 173 × 40 (56px readout) at `right: 12px; bottom: 12px`                                                                                                |
| `problems`  | 40 high at `left: 12px; bottom: 12px` (web `40px`)                                                                                                    |
| `legend`    | `left: 12px`, `bottom: 12px` without pill, `60px` with pill (web `40px`, `88px`); up to 440px width at least `60px`                                   |
| `inspector` | 288 wide at `top: 64px; right: 12px`; up to 760px width a bottom sheet with 12px left, right and bottom                                               |
| `status`    | centred at `top: 64px` (second row `116px`); with an open side inspector centred in the strip left of it; 1px border and 4px bar in the status colour |
| dropdown    | `top: 60px; left: 12px`, at least 248px wide                                                                                                          |
| tooltip     | top row `top: 60px`, second row `top: 112px`, bottom row `bottom: 60px`                                                                               |

The web column adds (see [Web host](#web-host-02)):

| Island             | Box (web host)                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `primary`          | 40 high at `top: 12px; right: 12px`; 40 wide while `data-primary="collapsed"`, else icon, gap and label with padding `0 16px` |
| `legal`            | 20 high at `left: 12px; bottom: 12px`, at most `100cqw − 24px` wide; wrapped 20 per line, the stack above rising with it      |
| `problems`         | `left: 12px; bottom: 40px` (0.1)                                                                                              |
| `legend`           | `bottom: 40px`, with pill `88px` (0.1); up to 440px width at least `60px`, `88px` with `data-zoom-row="raised"`               |
| `zoom`             | `right: 12px; bottom: 12px`; `bottom: 40px` with `data-zoom-row="raised"`                                                     |
| `problems-popover` | `left: 12px`, its bottom 8px above the pill's top (`bottom: 88px`), `min(320px, 100cqw − 24px)` wide, at most 320 high        |
| `toasts`           | centred, `min(480px, 100cqw − 24px)` wide, `bottom: toastStackBottom(…)` (12px unless its widest card meets the bottom row)   |
| `empty-state`      | centred in the container (`centerX`, `centerY`), `min(400px, 100cqw − 24px)` wide                                             |
| `drop-zone`        | `inset: 12px` while a file drag is on the page                                                                                |

Layers (§5.13): the canvas slot is layer 0 with `isolation: isolate` (palette `z-index: 110` above
context pad and label editor at 100); islands `--cd-shell-ebene-inseln` (20, the legal line and the
empty-state card included), inspector 25, menu trigger and primary action 30, layer 40 (dropdown,
tooltip, problems popover, drop zone), modeler dialogs 50, toasts 60 (in the web host a manual
popover in the top layer, see [Toasts](#toasts-8-9)). The 50 holds only outside the top layer; a `showModal()`
`<dialog>` or a popover-API element lies above everything (see [Modeler dialogs](#modeler-dialogs)).

Inside the canvas slot, persistent overlays a modeler adds (element toolbars, its own context pad,
the label editor) stay at `z-index` 100 or below, under the palette at 110. Transient popups the user
opens from them (diagram-js's popup menu at 200, a colour picker) may cover the palette while they are
open. All of them stay inside `.djs-container`, so they never cover an island. This is the shell's
rule of guide §5.13 (design system 1.13.0).

## Web host (0.2)

`host: "web"` is a Miragon web app that owns its page: the web column of guide §5.2. 0.1 covered its
keys (the chrome keys prevent the browser's page zoom), fit insets and the pill and legend offsets;
0.2 renders the rest of the column. Everything in this section is read in the `web` host only and
ignored by `ide` and `embedded` hosts, except toasts and the problems popover, which an embedded
modeler shows as well (§5.2: until the contract has a channel for messages to the host).
`mountVsCodeShell` does not accept these options at all; the IDE host is unchanged.

| Anchor (§5.2) | Web app                                                  | Option → handle                         | `data-chrome`                                     |
| ------------- | -------------------------------------------------------- | --------------------------------------- | ------------------------------------------------- |
| top left      | menu trigger: File, Model, Export, Appearance, Help      | `file`, `menu`, `themes` + `appearance` | `menu`                                            |
| top centre    | palette                                                  | `shellModule`                           | `palette`                                         |
| top right     | primary action, label collapses first (§5.15)            | `primary` → `shell.primary`             | `primary`                                         |
| bottom left   | legal line; above it the pill (with its list) and legend | `legal`, `problems`, `legend`           | `legal`, `problems`, `problems-popover`, `legend` |
| bottom right  | zoom panel, raised above the legal line where they meet  | —                                       | `zoom`                                            |
| bottom centre | toasts                                                   | `shell.toast()`                         | `toasts`                                          |
| centre        | empty-state card on a fresh start                        | `emptyState` → `shell.setEmptyState()`  | `empty-state`                                     |
| whole page    | drop zone for files                                      | `dropZone`                              | `drop-zone`                                       |

```html
<html lang="en" class="cd-shell-document" data-cd-theme="light">
  <!-- static, see Mode -->
  <div
    class="cd-shell"
    data-cd-shell-host="web"
    data-palette="top"
    data-primary="collapsed"
    data-zoom-row="raised"
    data-empty-state="shown"
    data-drop="over|forbidden"
    data-problems="shown"
  >
    <!-- state attributes only while true -->
    <button class="cd-shell-menu-trigger" data-chrome="menu" …>…</button>
    <button
      class="cd-shell-primary cd-shell-button"
      data-variant="primary"
      data-chrome="primary"
      aria-label="Share"
    >
      <svg … /><span class="cd-shell-primary-label">Share</span>
    </button>
    <div class="cd-shell-canvas" role="main" [inert]>…</div>
    <!-- the page's main landmark; inert behind the start screen -->
    <div class="cd-shell-status" data-chrome="status" …>…</div>
    <div class="cd-shell-hint">…</div>
    <section
      class="cd-shell-empty-state"
      data-chrome="empty-state"
      aria-labelledby="cd-shell-empty-state-title-1"
    >
      …
    </section>
    <aside class="cd-shell-inspector" data-chrome="inspector" …>…</aside>
    <button
      class="cd-shell-problems"
      data-chrome="problems"
      aria-haspopup="dialog"
      aria-expanded="false"
      aria-controls="cd-shell-problems-1"
      …
    >
      …
    </button>
    <section class="cd-shell-legend" data-chrome="legend" …>…</section>
    <nav class="cd-shell-legal" data-chrome="legal" aria-label="Legal">…</nav>
    <div class="cd-shell-zoom" data-chrome="zoom" …>…</div>
    <div class="cd-shell-layer">
      <!-- z 40 -->
      <div class="cd-shell-menu" role="menu" …>…</div>
      <div class="cd-shell-tooltip" role="tooltip">…</div>
      <div
        class="cd-shell-problems-popover"
        data-chrome="problems-popover"
        role="dialog"
        id="cd-shell-problems-1"
        aria-labelledby="cd-shell-problems-title-1"
        hidden
      >
        …
      </div>
      <div class="cd-shell-drop-zone" data-chrome="drop-zone" aria-hidden="true" hidden>…</div>
    </div>
    <div class="cd-shell-live">
      <!-- visually hidden, always rendered: the toasts' live regions -->
      <div class="cd-shell-live-region" role="status" aria-live="polite" aria-atomic="true"></div>
      <div class="cd-shell-live-region" role="alert" aria-live="assertive" aria-atomic="true"></div>
    </div>
    <div class="cd-shell-toasts" data-chrome="toasts" popover="manual">…</div>
    <!-- z 60; embedded: no popover -->
  </div>
</html>
```

Tab order (§5.14): menu trigger, primary action, palette, canvas, status box, hint, empty-state card,
inspector, pill, legend, legal line, zoom panel, then the toasts' buttons. Each 0.2 island has its
`data-chrome` so the kit measures it; ids count on the page-global mount counter as in 0.1. The
canvas slot is the page's `main` landmark (`role="main"`, unless it already has a role; the web host
only: a foreign page has its own).

### Primary action (§5.7, §5.15)

```ts
interface PrimaryActionOptions {
  label?: string; // default messages.share ("Share"); also the aria-label
  icon?: ShellIconName; // default "share-2"
  onSelect(): void;
  disabled?: () => boolean; // read on mount and on primary.refresh(); aria-disabled, stays focusable
}
interface PrimaryActionHandle {
  readonly element: HTMLButtonElement;
  isCollapsed(): boolean; // icon only right now
  refresh(): void;
}

// ./core
interface PrimaryWidths {
  withLabel: number;
  iconOnly: number; // 40
}
interface TopRowInput {
  containerWidth: number;
  paletteWidth: number;
  menuRight: number;
  primary?: PrimaryWidths;
}
interface TopRow {
  paletteRow: PaletteRow;
  primaryLabel: "shown" | "collapsed";
}
function decideTopRow(input: TopRowInput): TopRow;
```

- A blue primary button (§8, [Buttons](#buttons)) at `top: 12px; right: 12px`, 40px high, layer 30
  (`--cd-shell-ebene-reihe`), padding `0 16px`, Lucide icon 16px, 8px gap, label 13px/600. Hover and
  active `--cd-blau-link`, `shadow-2`, lift `translateY(-1px)`; disabled opaque and neutral, no lift.
- **Label collapse** (§5.15: "Wird es oben eng, verliert in der Web-App zuerst die Primäraktion ihr
  Label, erst danach rutscht die Palette"): the layout pass (root and palette resize) runs
  `decideTopRow` with the measured widths. With the label the palette must keep 16px to both the
  menu trigger and the primary action; failing that, the icon-only width is tried; failing that, the
  palette moves to the second row and the label comes back if it fits next to the menu trigger.
  Collapsed: 40 × 40, the label not rendered, `aria-label` unchanged, the chrome tooltip shows the
  label (no `aria-describedby`, it repeats the name); the root carries `data-primary="collapsed"`.
  The labelled width is measured afresh while the label shows (a late web font counts) and, while
  collapsed, in one synchronous layout with the label that is never painted.
- `disabled()` maps to `aria-disabled` (read on mount and on `primary.refresh()`); a click on a
  disabled primary action does nothing.
- One primary action in 0.2; the further actions "links daneben mit 8px Lücke" (§5.7) are a later
  candidate. Hidden on the start screen, never locked by `setReadOnly`.

### Legal line (§5.10, §2)

```ts
interface LegalLink {
  label: string;
  href: string;
  lang?: string;
}
interface LegalLineOptions {
  links?: readonly LegalLink[]; // after Impressum and Datenschutz, e.g. GitHub
  year?: number; // default the current year at mount
}
```

```html
<nav class="cd-shell-legal" data-chrome="legal" aria-label="Legal">
  <a href="https://www.miragon.io/" … aria-describedby="cd-shell-legal-1-new-tab"
    >© 2026 Miragon GmbH</a
  >
  <span class="cd-shell-legal-item">
    <span aria-hidden="true">·</span>
    <a
      href="https://www.miragon.io/impressum/"
      lang="de"
      target="_blank"
      rel="noopener noreferrer"
      …
      >Impressum</a
    >
  </span>
  <span class="cd-shell-legal-item">
    <span aria-hidden="true">·</span>
    <a href="https://www.miragon.io/datenschutz/" lang="de" …>Datenschutz</a>
  </span>
  <span class="cd-shell-legal-item">
    <span aria-hidden="true">·</span>
    <a href="https://github.com/Miragon/modeler-suite/tree/main/modelers/event-storming" …
      >GitHub</a
    >
  </span>
  <span id="cd-shell-legal-1-new-tab" hidden>Opens in a new tab</span>
</nav>
```

- Always rendered in the web host, also on the start screen ("die Zeile Rechtliches, die eine
  öffentliche Seite immer zeigt", §8). Copyright, URLs and the two German labels are those of the
  corporate-identity docs-site kit (`miragon/legal.ts`); `messages.copyright` and `messages.legal`
  translate, the URLs and "Impressum"/"Datenschutz" never do. The copyright links to
  `https://www.miragon.io/`, everywhere since design system 1.15.0 (Miragon/corporate-identity#37),
  the docs-site kit included.
- One line, 13px, line height 20px, at `left: 12px; bottom: 12px`, glass (§5.3) without border and
  shadow, padding `0 8px`, radius `sm`, links `--cd-ui-link` (underlined on hover and focus, always
  in high contrast and forced colours), separators `--cd-ui-text-leise`, layer 20. Pill and legend
  stand above it (0.1: pill `bottom: 40px`, legend 40/88px). Every link opens a new tab and says so
  to screen readers through `aria-describedby` (`messages.opensInNewTab`, "Opens in a new tab").
- **Narrow containers.** The line is at most `100cqw − 24px` wide; where it does not fit (with a
  GitHub link it is about 391px wide, so below about 415px) it wraps between its entries, each
  separator staying with the link after it, and grows upwards from `bottom: 12px`. Nothing is cut
  off or scrolled away (Datenschutz must stay reachable; WCAG 1.4.10 at 320 CSS px). The shell
  measures the line's height in whole lines (`legalLineHeight`) into `--modeler-shell-legal-height`
  on the root, and everything stacked on it rises with it: the pill and the problems popover, the
  legend, the raised zoom panel and the fit's bottom (`FitLayout.legalHeight`; 112 instead of 92 on
  two lines).
- **Bottom-row collision.** In a narrow container the legal line and the zoom panel meet:
  `zoomRowRaised` (`./core`) is true when the zoom panel at `right: 12px` would keep less than 8px to
  the legal line's measured right edge. The root then carries `data-zoom-row="raised"`, the zoom
  panel stands above the legal line at `bottom: 40px` like the pill (8px above a wrapped line), the
  fit keeps 92px at the bottom (`FitLayout.zoomRaised`), and up to 440px the legend's lowest position
  is 88px. Guide §5.10 states this rule, and the wrapping above, since design system 1.15.0
  (Miragon/corporate-identity#37).

```ts
// ./core
const LEGAL_LINE_HEIGHT = 20; // one line of the legal line
function legalLineHeight(measured: number | undefined): number; // whole lines, at least one: 20, 40, …
interface BottomRowInput {
  containerWidth: number;
  legalRight?: number; // measured, relative to the root; absent while not shown
  zoomWidth?: number; // measured; absent while not shown
}
function zoomRowRaised(input: BottomRowInput): boolean;
```

### File and Appearance groups (§5.4, §13.3)

```ts
interface FileMenuAction {
  onSelect(): void;
  shortcut?: string; // chip, e.g. commandKeyLabel("O", platform, keyNames); the web app binds the key itself
  dialog?: boolean; // kind "dialog": it opens an in-page dialog, not the browser's file picker
  disabled?: () => boolean;
}
interface FileMenuOptions {
  newDiagram?: FileMenuAction;
  open?: FileMenuAction;
  showExample?: FileMenuAction;
  import?: FileMenuAction;
}
```

| Option        | Entry (`messages`) | Icon          | `data-menu-id` |
| ------------- | ------------------ | ------------- | -------------- |
| `newDiagram`  | "New diagram"      | `file-plus`   | `new-diagram`  |
| `open`        | "Open…"            | `folder-open` | `open`         |
| `showExample` | "Show example"     | none (§5.14)  | `show-example` |
| `import`      | "Import…"          | `import`      | `import`       |

- The File group comes first, the shell builds it in this order from what the modeler gives; labels
  and icons are the shared terms of §2 and the common set of §5.14, not the modeler's. Entries are
  `action`s (`dialog` with `FileMenuAction.dialog`), never locked on a read-only canvas. `open` also
  becomes the start screen's text link (see [Empty state](#empty-state-8)).
- The chip of a Cmd/Ctrl key the app binds itself comes from `./core`, so it reads the same in every
  modeler and on every platform:

  ```ts
  function commandKeyLabel(key: string, platform: Platform, keyNames: { ctrl: string }): string;
  // commandKeyLabel("O", "mac", messages.keyNames) → "⌘O"; "other" → "Ctrl+O" (German "Strg+O")
  ```

- The **Appearance** group is a radio group (`data-menu-id="appearance"`, heading and `aria-label`
  "Appearance", options `system`, `light`, `dark`: "System", "Light", "Dark") between Export and
  Help. The shell renders it only when `themes` includes `"dark"`; a light-only modeler has no
  Appearance group (§13.3 "Nur Hell, bis der Modeler Dunkel kann"). Its value is
  `shell.appearance.choice()`, selecting runs `shell.appearance.setChoice()` and keeps the menu open.
- Neither group exists in the IDE host (native, §13.5) or the embedded host (§5.2).

### Mode (§13.3)

```ts
// ./core
type AppearanceChoice = "system" | "light" | "dark";
const APPEARANCE_STORAGE_KEY = "miragon.darstellung";
interface ThemeColors {
  light: string; // the app's theme-color: fest["--cd-blau"] of the vendored JSON
  dark: string; // dunkel["--cd-ui-grund"]
}
function parseAppearanceChoice(stored: unknown): AppearanceChoice; // "light" | "dark", else "system"
interface DocumentMode {
  theme: "system" | Theme; // data-cd-theme on <html>
  colorScheme: "light dark" | Theme; // <meta name="color-scheme">
  themeColor: ThemeColors; // the two theme-color metas
}
function documentMode(
  choice: AppearanceChoice,
  themes: readonly Theme[],
  colors: ThemeColors,
): DocumentMode;
interface WebModeScriptOptions {
  themes: readonly Theme[];
  themeColors: ThemeColors;
}
function webModeScript(options: WebModeScriptOptions): string; // body of the inline head <script>
function webHeadMarkup(options: WebModeScriptOptions): string; // metas + <script>, for index.html

// .
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
interface WebAppearanceOptions {
  themeColors: ThemeColors;
  storage?: StorageLike; // default globalThis.localStorage
}
interface AppearanceHandle {
  choice(): AppearanceChoice;
  setChoice(choice: AppearanceChoice): void;
}
```

- **Before the first paint** the page itself decides (§13.3, §13.5: one place, the host). A
  light-only modeler writes `<html lang="en" data-cd-theme="light">` statically, one
  `<meta name="theme-color">` without `media`, and of the guide's script only the contrast line;
  `webHeadMarkup({ themes: ["light"], themeColors })` returns exactly that. A dark-capable modeler
  writes `data-cd-theme="system"` statically and the guide's whole script with both `theme-color`s:
  `webHeadMarkup({ themes: ["light", "dark"], themeColors })`. The markup goes into `<head>` before
  the first stylesheet, for example through a Vite `transformIndexHtml` hook:

  ```ts
  // apps/webapp/vite.config.ts
  import { webHeadMarkup } from "@miragon/modeler-shell/core";
  import tokens from "./src/theme/cd-tokens.generated.json" with { type: "json" };
  import { THEMES } from "./src/themes";

  const themeColors = { light: tokens.fest["--cd-blau"], dark: tokens.dunkel["--cd-ui-grund"] };
  const modePlugin = {
    name: "miragon-mode",
    transformIndexHtml: (html: string) =>
      html.replace("<!-- miragon-mode -->", webHeadMarkup({ themes: THEMES, themeColors })),
  };
  ```

- **At runtime** `mountShell` (web host) follows `(prefers-contrast: more)` changes on `<html>`
  (`data-cd-kontrast="hoch"`), for every modeler. With `"dark"` in `themes` it needs
  `appearance.themeColors` (it throws without them, before anything mounts) and offers
  `shell.appearance`: `setChoice` stores the choice (`"system"` removes the entry; a blocked storage
  is caught and the choice applies for the page), applies `documentMode` on `<html data-cd-theme>`,
  `color-scheme` and both `theme-color` metas (created when missing) in one task with
  `cd-shell-no-transition` for one frame (§7), and a `storage` event from another tab applies the
  same way (a cleared storage means `system`). `choice()` is read from storage once at mount and then
  kept in memory, so a choice a blocked storage refused still holds for the page; mounting does not
  re-apply the mode, the head script owns the first paint. Nothing refits (§5.9). Light-only:
  `shell.appearance` is `undefined`.
- `webModeScript` is the guide's script as ES5 in an immediately invoked function; it reads the
  storage inside `try`/`catch`, tolerates a missing `color-scheme` meta and JSON-escapes every
  literal (with `<`, U+2028 and U+2029), so no value ends the `<script>` element.
- The kit's `appearance` case drives the web host through `PageLike.emulateMedia` and the stored
  choice (see [`./testing`](#testing)).

### Problems popover (§5.10)

```ts
// ./core
type ProblemSeverity = "error" | "warning";
interface ProblemItem {
  severity: ProblemSeverity;
  message: string; // 13px --cd-ui-text
  location?: string; // "Line 12", "“Order Placed”": 13px --cd-ui-text-leise below the message
  elementId?: string; // the element a click on the row selects
}
function problemSummary(items: readonly ProblemItem[]): {
  count: number;
  errors: number;
  items: readonly ProblemItem[];
};
```

- In the web host the pill (0.1) is the trigger of a non-modal dialog: `aria-haspopup="dialog"`,
  `aria-expanded`, `aria-controls` on the pill; the popover `role="dialog"` without `aria-modal`,
  `aria-labelledby` its title "Problems" (13px/600). An embedded shell shows it too unless the
  modeler gives `problems.onActivate` (an embedding host with a list of its own); the IDE host never.
- Above the pill, left-aligned with it: `left: 12px`, its bottom 8px above the pill's top, opaque
  (§5.3), 1px `--cd-ui-linie`, radius `md`, `shadow-3`, `min(320px, 100cqw − 24px)` wide, at most
  320px high with a scrolling list, layer 40, pop-in 150ms (§5.14). Rows at least 36px: the pill's
  icon 16px (`circle-x` in `--cd-ui-danger`, `triangle-alert` in `--cd-ui-warning`), the message,
  below it the location.
- A row with an `elementId` is a button: a click closes the popover, puts the focus on the canvas and
  then calls `problems.onSelectItem(item)`, where the modeler selects the element. Rows without one
  are text that still takes the focus (`<div tabindex="-1">`), so the keyboard reads every row of a
  list longer than its 320px (WCAG 2.1.1); Enter and Space act on row buttons only. The icon carries
  the severity's name for screen readers (`role="img"`, `messages.problemSeverity`), so the shape and
  colour are not its only signal (§12).
- Opening focuses the first row (else the popover, with an inset focus ring); ↑/↓/Home/End move
  between all rows and scroll the focused one into the list (only the list scrolls, never the
  root). Escape and Tab out close it with the focus back on the pill (Tab from the last row then
  moves on from the pill, Shift+Tab from the first stays on it); an outside `pointerdown` and the
  window's blur close it without moving the focus, as for the menu. Not modal: the zoom keys keep
  working. Like the menu it stops Enter, Space, Delete, Backspace and printable keys, so a modeler's
  keyboard on `document` never acts on them.
- `setProblems` re-renders the rows while it is open and keeps the focused problem; `count` 0 hides
  pill and popover, and a focus in the list goes to the canvas (else the menu trigger).

### Toasts (§8, §9)

```ts
// ./core
type ToastStatus = "success" | "info" | "warning" | "danger";
interface ToastAction {
  label: string;
  onSelect(): void; // runs after the toast closed
}
interface ToastRequest {
  status: ToastStatus;
  text: string;
  action?: ToastAction;
  durationMs?: number; // only to lengthen; ignored with an action
}
const MAX_TOASTS = 3;
const TOAST_DURATION_MS: Readonly<Record<ToastStatus, number>>; // success, info 2800; warning, danger 5000
const TOAST_MAX_WIDTH = 480;
function toastLifetime(request: ToastRequest): number | undefined; // undefined with an action
interface ToastSlot {
  id: number;
  hasAction: boolean;
  engaged: boolean; // hovered or focused
}
function toastToEvict(stack: readonly ToastSlot[]): number | undefined; // oldest first
interface BottomObstacle {
  left: number;
  right: number;
  top: number; // px from the container's bottom to its top edge
}
interface ToastStackInput {
  containerWidth: number;
  obstacles: readonly BottomObstacle[];
  cardWidth?: number; // the widest card's measured width; absent = the whole stack width
}
function toastStackWidth(containerWidth: number): number; // min(480, width − 24)
function toastStackBottom(input: ToastStackInput): number;

// .
interface ToastHandle {
  dismiss(): void; // idempotent
}
```

- `shell.toast(request)` in the web and embedded hosts; in the IDE host it shows nothing and returns
  an inert handle (§13.5: the extension shows the host's notification). An import that runs by itself
  never shows a toast (§9); that is the modeler's discipline, the shell does not know imports.
- **Card** (§8): opaque `--cd-ui-flaeche-hoch`, 1px `--cd-ui-linie`, a straight 4px bar and an 8px
  dot in `--cd-ui-<status>` (a dot, not an icon: the common set has no success or info icon, §5.14),
  text 13px/1.5 `--cd-ui-text`, radius `md`, `shadow-3`, at least 40px high, padding `4px 4px 4px
16px`, 8px gap; the action as a 32px ghost button, then Close as a 32 × 32 ghost icon button
  (Lucide `x`, `aria-label` "Close", `aria-describedby` the toast's text, so three Close buttons
  are told apart). Slide and fade in from `translateY(8px)` over 250ms, out the same way; none under
  reduced motion. A card is as wide as its content, at most the stack's width, as in the Wardley and
  Team Topologies web apps (§8's `min(480px, 100% − 24px)` is the maximum, design system 1.15.0).
- **Screen readers** (§8, §12): two live regions in the root, rendered from mount on and visually
  hidden (`.cd-shell-live`): `role="status"` with `aria-live="polite"`, and `role="alert"`. A toast's
  text goes into the alert region for danger, else into the status region, 100ms after the region
  was emptied (`TOAST_ANNOUNCE_DELAY_MS`), so a repeated toast ("Link copied" twice) is announced
  again; the region empties when its toast closes. A live region created together with its text is
  often not announced, which is why the regions never come and go with the stack. The cards carry no
  live role, so nothing is read twice.
- **Stack**: centred, `toastStackWidth`, column with 8px gap, the newest at the bottom, at most three;
  a fourth evicts per `toastToEvict` (the oldest without action that is not engaged first). A
  request equal to a shown toast (status and text) restarts that toast's time instead of stacking,
  and takes the newer request's action and lifetime (a repeated "Board replaced · Undo" undoes the
  latest replacement). Layer 60; in the web host the stack is a `popover="manual"`, shown with the
  first toast and shown again with a toast that arrives while a modal dialog is open, so it stays
  above a `showModal()` dialog in the top layer (visible, but inert like everything outside a modal
  until the dialog closes); without a modal it is not hidden and re-shown, which would rebuild it for
  screen readers. In the embedded host it is absolute inside the root and never leaves its box.
- **Time**: `toastLifetime` (about 2.8s, errors about 5s, §8; a warning, a sentence to act on, gets
  the error's 5s), paused while hovered or focused and resumed with at least 1.5s left; a toast with
  an action never closes by itself. A closing toast that held the focus hands it to the next
  toast's Close button, else to the canvas; on the start screen to its "New diagram" (the canvas and
  the menu trigger cannot take it there), never silently to `<body>`.
- **Bottom row**: the stack sits at `bottom: 12px` (§8) unless the centred column of its widest card
  comes closer than 8px horizontally to a visible zoom panel, legal line or pill; then it stands 8px
  above the highest of those (`toastStackBottom` with `cardWidth`, recomputed in the layout pass,
  whenever a toast comes or goes, and whenever the pill, the inspector or the start screen changes;
  a bottom sheet hides zoom panel and pill). At 1280px with a GitHub link the legal line ends 7.5px
  before the 480px column, so "Link copied" (146px) stays at 12 while a full-width card rises to 40. Guide §8 states this rule since design system 1.15.0 (Miragon/corporate-identity#37).

### Empty state (§8)

```ts
interface EmptyStateOptions {
  title: string; // the modeler's name: "Event Storming Modeler"
  text: string; // one line of help: "Start a new diagram, or explore the example."
  komet: string; // URL of the vendored, unchanged miragon-komet-blau.svg (§2, §11)
  onNewDiagram(): void; // "New diagram", blue primary button; the shell hides the card first
  onShowExample?(): void; // "Show example", ghost button; the shell hides the card first
  dropHint?: string; // shown with a dropZone only; default messages.dropHint
}
```

- `shell.setEmptyState(true)` shows the card; the modeler calls it on a fresh start (no document in
  the URL, nothing restored). While it shows (`data-empty-state="shown"` on the root) the work chrome
  is hidden (`visibility: hidden`): menu trigger, primary action, palette, zoom panel, pill, legend,
  status box, hint and inspector; the canvas slot is `inert`, menu and popover close. The chrome keys
  (Cmd/Ctrl + `+`/`−`/`0`, Shift+1) go to the browser unprevented, which zooms the page: there is no
  diagram to zoom, and a low-vision user's Ctrl+ must not be swallowed (WCAG 1.4.4); the shell's
  diagram-js guard returns `false` for them meanwhile, so diagram-js zooms nothing either. Visible:
  the card, the legal line, toasts and the drop zone (§8: "sichtbar sind nur die Karte und die Zeile
  Rechtliches").
- The card: centred in the container, `min(400px, 100cqw − 24px)` wide, glass (§5.3), `shadow-2`,
  radius `lg`, padding `32px 40px`, content centred with 16px gaps: the Komet at 64px (`alt=""`), the
  title as `<h1>` (21px/600), the help line (16px/1.6, `--cd-ui-text-leise`), the two 36px buttons
  side by side with 8px gap, primary first, then the drop hint (13px, `--cd-ui-text-leise`). Layer 20.
  In high contrast its border is `--cd-ui-linie` through the role like every other island (§5.3).
- **Open on the start screen.** The start screen hides the menu, and a drop needs a pointer; so with
  `file.open` the hint ends in a text link "Open a file…" (`messages.openFileLink`, `--cd-ui-link`,
  underlined at rest like a link in body text with a thicker line on hover, `aria-keyshortcuts` and
  a Geist Mono chip from `file.open.shortcut`, the two never parted by a line break): "Or drop a
  .storm file here · Open a file… ⌘O". It is part of the hint, not a third action (§8 keeps exactly
  two buttons), and runs `file.open.onSelect` without leaving the start screen: the modeler ends it
  once the file has loaded. Guide §8 states the link, and the browser's chrome keys above, since
  design system 1.15.0 (Miragon/corporate-identity#37).
- Either button hides the card (`setEmptyState(false)`), moves the focus to the canvas `<svg>` and
  then runs its handler. `setEmptyState(true)` while the focus is in the work chrome or the canvas
  moves it to "New diagram"; a focus on the legal line or a toast stays. The Komet is not draggable
  (an image drag can carry a file and would open the drop zone). Any other start (Open…, a dropped
  file, a shared link, the first edit) is the modeler's to end with `setEmptyState(false)`; the card
  does not come back in the session.
- The IDE and embedded hosts have no start screen; they use the empty-file hint (§13.5).

### Drop zone (§9)

```ts
interface DropZoneOptions {
  accept: readonly string[]; // ".storm", "application/json", "text/*"; empty: any file
  multiple?: boolean; // default false
  onDrop(files: readonly File[]): void; // the accepted files
  onReject?(files: readonly File[]): void; // default: a danger toast messages.cannotOpenFile
}

// ./core
type DropForbiddenReason = "multiple" | "type" | "dialog";
interface DragItemLike {
  kind: string;
  type: string;
}
interface DragContext {
  accept: readonly string[];
  multiple: boolean;
  dialogOpen: boolean;
}
type DragVerdict =
  { state: "none" } | { state: "over" } | { state: "forbidden"; reason: DropForbiddenReason };
function dragVerdict(items: readonly DragItemLike[], context: DragContext): DragVerdict;
function acceptsFile(file: { name: string; type: string }, accept: readonly string[]): boolean;
```

- Page-wide (`window` listeners) and for drags that carry files only, so palette drags and text
  dragged into the label editor stay alone; every file drag is `preventDefault`-ed, so the browser
  never navigates to the file. `dragVerdict` decides: a modal dialog open → forbidden (`dialog`);
  more than one file without `multiple` → forbidden (`multiple`); every file of a MIME type that none
  of `accept`'s MIME entries matches → forbidden (`type`; extensions are unreadable before the drop,
  so list the MIME types as well; an empty type never forbids); else over. Only items of kind
  `"file"` count. `accept` entries are trimmed and lower-cased (extensions match the name's suffix
  case-insensitively, MIME types exactly or as `type/*`), blank ones dropped; a list without a usable
  entry accepts every file, like `<input accept>`.
- **Drag-over**: `data-drop="over"` on the root, the overlay at `inset: 12px`, fill `--cd-ui-hover`,
  2px dashed `--cd-ui-interaktion`, radius `lg`, the chip "Drop file here" centred on
  `--cd-ui-flaeche-hoch`, `dropEffect = "copy"`. **Forbidden**: `data-drop="forbidden"`, fill
  `--cd-ui-danger-flaeche`, dashed `--cd-ui-danger`, the chip `messages.dropForbidden(reason)`,
  `dropEffect = "none"` (the cursor shows not allowed). Layer 40, `aria-hidden`.
- **Drop**: `acceptsFile` splits the files; `onDrop(accepted)` when there are any, `onReject(rest)`
  for the others (default: one danger toast per file, "Couldn't open “map.png”. Drop a .storm,
  .json, or .txt file.", the extensions of `accept` joined by `Intl.ListFormat` in `lang`, its MIME
  entries where it lists no extension). A drop forbidden for `dialog` or `multiple` opens nothing and
  shows no toast. After a `type` verdict a browser fires no `drop` (`dropEffect = "none"`); a
  synthetic one is split by `acceptsFile` like any other. Whether the drop replaces the open document is the modeler's
  (see the usage below for an undo toast instead of `confirm()`).

### Buttons

`src/dom/buttons.css` styles `.cd-shell-button` for the web chrome (§8): `data-variant="primary"`
(`--cd-blau` with `--cd-weiss` text in both modes, `shadow-1`, hover and active `--cd-blau-link`,
`shadow-2` and a 1px lift, no lift under reduced motion; disabled `--cd-ui-hover` with
`--cd-ui-linie` border, muted text, no lift) and `data-variant="ghost"` (transparent, hover
`--cd-ui-hover`); 36px high, padding `0 16px`,
13px/600, radius `md`; focus ring 2px `--cd-ui-fokus` with 2px offset (3px in high contrast, which
also drops the shadow); under forced colours borders in `ButtonText`, rings in `Highlight`. It is
the only stylesheet that reads fixed palette tokens, and only these three.

## `./diagram-js`

```ts
// a Diagram, a renderer's Modeler, a didi injector
interface InjectorLike {
  get<T>(name: string): T;
}
interface ModuleDeclarationLike {
  __init__?: string[];
  __depends__?: ModuleDeclarationLike[];
  [name: string]: unknown;
}
type DiagramEventListener = (event: never) => unknown;
interface EventBusLike {
  on(events: string | string[], priority: number, listener: DiagramEventListener): void;
  on(events: string | string[], listener: DiagramEventListener): void;
  off(events: string | string[], listener?: DiagramEventListener): void;
}
interface DiagramViewbox extends ScaledViewbox {
  inner: Bounds;
  outer: Size;
}
interface CanvasLike {
  getContainer(): HTMLElement;
  getSize(): Size;
  viewbox(): DiagramViewbox;
  viewbox(box: Bounds): void;
  zoom(): number;
  zoom(scale: number, center?: Point): number;
  resized(): void;
  focus?(): void; // 0.2.2: diagram-js 15
}
interface ZoomScrollLike {
  stepZoom(delta: number, position?: Point): void;
}
interface KeyboardLike {
  addListener(priority: number, listener: (context: { keyEvent: KeyboardEvent }) => unknown): void;
}
interface PaletteLike {
  getEntries(): Record<
    string,
    { title?: string; shortcut?: string; ariaKeyShortcuts?: string; group?: string }
  >;
}

const shellModule: ModuleDeclarationLike;

type CollaborativeModelerLike = object & {
  contentBounds?(): Bounds | undefined; // 0.4: @miragon/modeler-api 1.3, the renderer's contract instance
}; // `object &`: an instance from before 1.3, without contentBounds, is assignable too
interface ConnectOptions {
  modeler?: CollaborativeModelerLike; // 0.4: its contentBounds() is the default for contentBounds
  contentBounds?(): Bounds | undefined; // tight, no padding (§5.9); given, it wins; 0.4: optional with modeler
  isEmpty?(): boolean; // §13.5 empty file (no element); default: the content bounds are empty
  prefersReducedMotion?(): boolean;
}
interface DiagramJsConnection {
  readonly viewport: Viewport;
  destroy(): void;
}
function connectDiagramJs(
  shell: ShellHandle,
  diagram: InjectorLike,
  options: ConnectOptions,
): DiagramJsConnection;

interface ViewportOptions {
  contentBounds(): Bounds | undefined;
  insets(): Insets;
  prefersReducedMotion?(): boolean;
}
interface Viewport extends ZoomTarget {
  fit(options?: { animate?: boolean }): void;
  freeRectCenter(): Point | undefined; // diagram coordinates; undefined at 0 × 0 and after destroy
  focus?(): void; // 0.2.2: canvas.focus(); a no-op after destroy; always set by createViewport
  afterImport(): void;
  newDocument(): void; // 0.2, web app: the next afterImport() counts as the first again
  restore(viewbox: Bounds): void;
  getViewbox(): Bounds | undefined;
  isAutomatic(): boolean;
  getState(): ViewportState | undefined;
  setState(state: ViewportState): void;
  destroy(): void;
}
function createViewport(diagram: InjectorLike, options: ViewportOptions): Viewport;
```

**`shellModule`** goes into the modeler's modules after the renderer's own (`additionalModules`). It
registers one internal didi service named `modelerShell` (a modeler does not reuse the name):

- `paletteTooltip: ["value", null]` replaces diagram-js's (and a renderer's) palette tooltip; the
  chrome tooltip takes over with `title` and `shortcut` from `palette.getEntries()`.
- Palette skin: on `palette.create` it sets `data-chrome="palette"` and moves the container in front
  of the canvas `<svg>` (`canvas.getContainer()`'s child), so tab order puts the palette first. A
  renderer's export (`saveSVG`) must therefore take the container's own `<svg>` child, not the
  first `<svg>` it finds (`container.querySelector("svg")` now gets a palette icon), and strip the
  `tabindex`, `role="application"` and `aria-label` the live canvas carries from its copy. After
  every `palette.changed` it re-applies `role="toolbar"` and `aria-label` (`messages.tools`) on
  `.djs-palette-entries`, `role="button"` on every entry, `aria-keyshortcuts` from the entry's
  `ariaKeyShortcuts` or `ariaKeyShortcutsFromLabel(shortcut)` (§5.6; split the shortcut off the
  title: `title: "Domain event", shortcut: "E"`), roving `tabindex` (the last focused entry keeps the
  tab stop across rebuilds) and `aria-pressed` for the tool of the last
  `tool-manager.update` (group `tools`, `data-action="<tool>-tool"`), styled through
  `[aria-pressed="true"]`: diagram-js's `highlighted-entry` goes stale after a rebuild, and its
  `two-column` class is ignored. `separator` entries become vertical rules.
- Palette keys, without modifiers: ← and → move and wrap, Home and End jump, Enter and Space trigger
  the entry once (repeats ignored). They are stopped at the palette, so a modeler's document listener
  and VS Code never see them; chrome keys still bubble to the shell.
- Enter and Space trigger through a synthetic `click`, and that click is a contract: a `MouseEvent`
  with `detail === 0` (a pointer click has 1 or more), `clientX`/`clientY` at the entry's centre,
  bubbling and cancelable, dispatched on the entry. It goes through diagram-js's click delegate and
  `palette.trigger` like a pointer click, so under the read-only lock it is vetoed the same way. A
  provider tells the keyboard apart by `detail === 0` (see Palette keyboard creation below).
- Read-only (§13.5): only `lasso-tool` and `hand-tool` stay active. Every other entry, also tools of
  group `tools` such as draw, space or connect, is vetoed on `palette.trigger` from the lock on (a
  vetoed `dragstart` is `preventDefault`-ed) and marked `aria-disabled` once the shell shows the
  read-only state; an entry's own `aria-disabled` comes back afterwards. Without an entry element
  in the event only group `tools` passes.
- Keyboard: `keyboard.addListener(2000, …)` returns `true` for every `matchChromeKey` hit, so
  `KeyboardBindings` and the modeler's keyboard modules (priority 1000) never act on them; the
  shell's `keydown` listener executes them exactly once. It returns `false` (stops them without
  `preventDefault`) for a chrome key from a text field inside the `<svg>`, which stays the field's,
  for a chrome key while the web app's start screen shows (the browser zooms the page), and, while
  the attached shell's host is `ide`, for undo and redo (`isUndoRedoKey`): the canvas
  `commandStack` never takes them, VS Code undoes the document (§13.5). A modeler's own DOM undo
  binding must go in the IDE host as well; the kit's `keys` case checks it.
- Keys the canvas uses beyond the chrome keys are the modeler's (§13.5). Cmd/Ctrl+A on the focused
  canvas selects every element, or is at least `preventDefault`-ed: diagram-js 15 binds no select
  all, and an unprevented key reaches VS Code, whose Select All then selects the chrome's text. The
  shell stops a prevented key in the IDE host; the kit's `keys` case presses Control+A and Meta+A on
  the canvas.
- While a shell is attached, the canvas `<svg>` is `role="application"` with `aria-label`
  `messages.canvas` (WCAG 4.1.2; screen readers switch to focus mode, so single-key commands reach the
  canvas); a role or name the modeler set stays, and both are restored on detach.
- It buffers the palette until `connectDiagramJs`, so the diagram may exist before the shell.

**`connectDiagramJs`** creates the viewport with `insets: shell.fitInsets`, binds it
(`shell.setZoomTarget`), registers the palette and calls `canvas.resized()` (the canvas element has
moved). After every `import.done` and `elements.changed` it calls `shell.setEmptyHint(isEmpty())`,
so the first element the user creates on the canvas hides the hint (and its "Insert example").
`isEmpty` defaults to empty content bounds; a notation whose bounds are never empty (Wardley's plot)
passes its own. It throws when `shellModule` is missing. A later connection to another shell takes
the palette over; `destroy()` (idempotent, also run on `diagram.destroy`) unregisters the palette,
unbinds the zoom target and the hint sync and destroys the viewport, while the keyboard guard stays
until `diagram.destroy`. `contentBounds` returns the tight bounds of the content, without a padding
of its own (Event Storming: `boardBounds.contentBounds(0)`, not its default of 120px): the shell's fit
insets are the only margin (§5.9), and a padding would add to them. Since 0.4 the host may leave it
out and pass the renderer's contract instance as `modeler` instead: a renderer on
`@miragon/modeler-api` 1.3 reports these bounds itself (`contentBounds()`, tight, in diagram
coordinates, `undefined` while there is nothing to fit), and the viewport calls it on the instance.
An explicit `contentBounds` wins over it, so a host may pass both while a renderer is still on 1.2
(an instance without `contentBounds` is a valid `modeler`) and drop its own once the renderer reports
them. Without either, `connectDiagramJs` throws before it binds anything.

A legend that is open when `connectDiagramJs` runs (a stored state) settles a pixel or two wider or
narrower once its font has loaded, which can be after the first fit measured it. The connection
therefore observes the card until the fonts have loaded (`document.fonts.ready`, then two frames):
when its width changes while it stays open, no other fit inset has changed since the fit (inspector,
problems pill, palette row), the content bounds are still the ones it fitted (an element created,
moved or deleted since that changed them keeps the view, §5.9), and the view is still the one that
fit set (no zoom or pan since, no `restore`, `setState` or `newDocument`), the viewport fits once
more with the insets of now, as a jump (a fit animation still running is retargeted). The watch ends
after that fit, once the fonts have loaded, when the legend closes, once the user zooms or pans, and
on `destroy()`; a later change of the card keeps the view. Opening or closing the legend still never
fits (§5.9), and a legend that starts closed is not watched.

**`Viewport`** (§5.8, §5.9):

- `stepZoom` is `zoomScroll.stepZoom(±1)` (the wheel's raster, snapping to the nearest step);
  `zoomToActual` is `canvas.zoom(1)`; both around the container centre. No rounding of its own. A
  step past a limit is refused (`canZoomOut`/`canZoomIn`), so zoom out never zooms in, whatever the
  caller checks; without a `zoomScroll` service it steps on the same raster itself.
- `fit()` uses `fitViewbox(contentBounds(), canvas.getSize(), insets())` and `canvas.viewbox(box)`,
  never `canvas.zoom("fit-viewport")`; animated over 250ms in `requestAnimationFrame` with
  `easeStandard` unless `animate: false` or reduced motion (`prefers-reduced-motion`, or
  `REDUCED_MOTION_CLASS` on `<html>`); a `wheel`, `pointerdown` or zoom key cancels the animation. A
  no-op when the bounds are empty.
- `canFit()` reads `contentBounds()` once per content change (`elements.changed`, `shape.added`,
  `shape.removed`, `connection.added`, `connection.removed`, `diagram.clear`, `import.done` and the
  viewport's own `afterImport`, `restore`, `setState`), not on every frame the zoom panel renders.
- `afterImport()` jump-fits the first import whose bounds are non-empty (also after an empty file got
  its first content), unless the user moved the view or a stored view was set with `setState` while
  there was content. `restore` does not block it: a modeler restores on every re-import, and an
  empty file must still fit its first content ("Insert example"). Content the user creates on the
  canvas does (§5.9: an element created on the canvas never fits): an `elements.changed` outside an
  import window after the first import, with content, ends the wait for the first fit, so the next
  external change keeps the view. A renderer that changes elements through the command stack while
  it imports therefore fires `import.parse.start` or `import.render.start` first.
- An empty file shows 100 %, whatever zoom the renderer's import left: on the first import with
  empty bounds, without a stored view (`setState`) and without a user move, `afterImport()` zooms to
  1 around the centre of the free rectangle (at 0 × 0 once the container has a size). That write is
  the viewport's own, not a user move, so the first content still fits; later re-imports and
  `restore`s of the empty file keep the view (guide §5.9 and §13.5, design system 1.13.0).
- `newDocument()` (0.2): in the web app every new document (New diagram, Open…, Import…, Show
  example, a shared link, a dropped file) opens like the first (§5.9). Called before the import, it
  forgets the user's moves, a stored view and a pending restore and stops a fit animation, so the
  next `afterImport()` jump-fits non-empty content or shows an empty document at 100 %.
- `freeRectCenter()` is the centre of the free rectangle (the container minus `insets()`, as fit
  uses them) in diagram coordinates, for the current viewbox; `undefined` while the container is
  0 × 0 and after `destroy`. It is where keyboard creation places an element.
- A `ResizeObserver` on `canvas.getContainer()`, coalesced per frame, skips 0 × 0 (hidden tab) and
  compares with the size the view was last set for, so a tab coming back at the same size neither
  refits nor calls `resized()`. On a real change it calls `canvas.resized()` and refits while the view
  is automatic. A `restore` or `setState` made at 0 × 0 waits for a size and is not refitted then.
- User moves: every `canvas.viewbox.changed` (and `canvas.viewbox.changing` for the readout under
  `deferUpdate`) is compared with the last view the viewport set (`sameView`; during an animation
  also with the last written frame); a difference is a user move. Changes between
  `import.parse.start`/`import.render.start` and `import.done` are not (renderers set the viewbox
  while importing); that window also ends on `afterImport`, `restore`, `setState` and user input.
  Fit makes the view automatic again; `restore` updates the reference without resetting it.
- `getViewbox()` takes width and height from the fresh container size; `getState()` is `undefined`
  before the first `afterImport`, `restore` or `setState`. `onChange` fires on
  `canvas.viewbox.changing`/`.changed`, `elements.changed` (so Fit enables with the first element),
  `import.done` and the viewport's own calls.
- The viewport destroys itself on `diagram.destroy`; afterwards `zoom()` returns the last zoom,
  `canFit()` false and `getViewbox()`/`getState()` `undefined`, so a shell still bound to it never
  calls into a destroyed canvas.
- diagram-js events used: `canvas.init`, `palette.create`, `palette.changed`, `tool-manager.update`,
  `palette.trigger`, `keyboard.keydown` (through `keyboard.addListener`), `canvas.viewbox.changing`,
  `canvas.viewbox.changed`, `elements.changed`, `shape.added`, `shape.removed`, `connection.added`,
  `connection.removed`, `diagram.clear`, `import.parse.start`, `import.render.start`, `import.done`,
  `diagram.destroy`. The shell fires no events of its own.

**Palette keyboard creation** (§5.5). Enter or Space on an entry that creates something places the
element in the centre of the free rectangle, selects it, opens the label editor where the notation
has labels and puts the focus on the canvas; tool entries only switch the tool. diagram-js's create
tool follows the pointer and never ends without one, so the provider branches on the synthetic click
and asks the viewport for the point. The provider exists before `connectDiagramJs`, so it gets a
function and reads the viewport only when the entry fires:

```ts
// the renderer's palette provider, given freeRectCenter: () => viewport.freeRectCenter()
const create = (event: Event) => {
  const shape = elementFactory.createShape({ type: "domain-event" });
  const keyboard = event.type === "click" && (event as MouseEvent).detail === 0;
  const center = keyboard ? freeRectCenter() : undefined;
  if (!center) return createTool.start(event, shape); // a pointer: the shape follows it
  const created = modeling.createShape(shape, center, canvas.getRootElement());
  selection.select(created);
  canvas.focus();
  directEditing.activate(created); // where the notation has labels
};
entries["create.domain-event"] = {
  group: "events",
  title: "Domain event",
  shortcut: "E",
  action: { click: create, dragstart: create },
};
```

When the centre is already taken, the provider steps 24px diagonally until it is free (§5.5); a
shared helper for that is a later candidate. The kit's `create` case presses Enter on the first
creating entry and expects exactly one new, selected shape inside the free rectangle.

## `./vscode/extension`

```ts
interface DisposableLike {
  dispose(): unknown;
}
interface ColorThemeLike {
  readonly kind: number;
}
interface VsCodeLike {
  readonly window: {
    readonly activeColorTheme: ColorThemeLike;
    onDidChangeActiveColorTheme(listener: (theme: ColorThemeLike) => unknown): DisposableLike;
  };
  readonly workspace: {
    getConfiguration(section?: string): { get<T>(key: string): T | undefined };
    onDidChangeConfiguration(
      listener: (event: { affectsConfiguration(section: string): boolean }) => unknown,
    ): DisposableLike;
  };
}
interface WebviewPanelLike {
  readonly webview: { postMessage(message: unknown): unknown };
  readonly visible: boolean;
  onDidChangeViewState(
    listener: (event: { readonly webviewPanel: { readonly visible: boolean } }) => unknown,
  ): DisposableLike;
  onDidDispose(listener: () => unknown): DisposableLike;
}

interface WebviewHtmlOptions {
  cspSource: string;
  scriptUri: string;
  styleUris?: readonly string[];
  title: string;
  lang: string;
  appearance: Appearance;
  body?: string;
  nonce?: string;
  inlineStyles?: boolean; // default true: style-src … 'unsafe-inline'
}
function createNonce(): string;
function renderWebviewHtml(options: WebviewHtmlOptions): string;

interface ThemeBridgeOptions {
  themes: readonly Theme[];
  settingKey?: string;
}
function currentAppearance(vscode: VsCodeLike, options: ThemeBridgeOptions): Appearance;
function connectThemeBridge(
  vscode: VsCodeLike,
  panel: WebviewPanelLike,
  options: ThemeBridgeOptions,
): DisposableLike;

function revealFileLabel(platform: string): string;

const APPEARANCE_MESSAGE_TYPE = "modelerShell.appearance";
interface AppearanceMessage {
  type: typeof APPEARANCE_MESSAGE_TYPE;
  appearance: Appearance;
}
function appearanceMessage(appearance: Appearance): AppearanceMessage;
function isAppearanceMessage(value: unknown): value is AppearanceMessage;
```

- The real `vscode` namespace is assignable to `VsCodeLike` and a `WebviewPanel` to
  `WebviewPanelLike` (pinned by a type test against `@types/vscode` 1.96).
- The entry needs a global `crypto` (Node 20 or later, so VS Code 1.90 or later; the types are tested
  against 1.96). A modeler declares `engines.vscode` accordingly and targets `node20` in its
  extension-host bundle. There is no `node:crypto` fallback: the entry imports nothing, so a web
  extension host (vscode.dev) can bundle it as well, and `createNonce` stays synchronous.
- `createNonce()`: 32 characters `[A-Za-z0-9]` from `crypto.getRandomValues`, unbiased.
- `renderWebviewHtml` writes the appearance attributes on `<html>` before the first paint, always
  (also `light`), and the CSP (`default-src 'none'`, the nonce'd script, fonts from `cspSource` and
  `data:`). Its `style-src` allows `'unsafe-inline'` by default because renderers write
  `style` attributes into markup (palette entries, SVG strings); the shell and diagram-js themselves
  style only through the CSSOM and run without it, so a modeler whose renderer does too passes
  `inlineStyles: false`. `lang` is the tool's UI language: English modelers pass `"en"`, not
  `vscode.env.language`. Title and attribute values are escaped, `body` is inserted as markup (the
  extension's own: never document content or other untrusted text); the script is a classic
  `<script nonce src>` (an IIFE bundle). It throws for a `nonce` that is not a CSP base64 value and
  for a `cspSource` with a `;` or `,`, which would end the directive and could add a `script-src`
  that wins over the nonce'd one.

  ```text
  <html lang="en" class="cd-shell-document" data-cd-theme="light" data-cd-kontrast="hoch">
  Content-Security-Policy: default-src 'none'; img-src {cspSource} data: blob:;
    style-src {cspSource} 'unsafe-inline'; font-src {cspSource} data:; script-src 'nonce-{nonce}'
  ```

- `currentAppearance` resolves `requestedAppearance(kind, setting)` against `themes`; a setting value
  outside `automatic | light | dark` counts as `automatic`.
- `connectThemeBridge` posts nothing on connect (the HTML carries the appearance) and then
  `appearanceMessage(currentAppearance(…))` on `onDidChangeActiveColorTheme`, on
  `onDidChangeConfiguration` affecting `settingKey` (no configuration listener without one), and on
  `onDidChangeViewState` when the panel goes from hidden to visible (not on active or column
  changes). It disposes itself with the panel (`onDidDispose`) and throws for empty `themes`. The
  returned disposable only ends it earlier (twice is safe), or goes into a panel-scoped list that is
  disposed with the panel; never into `context.subscriptions`, which keeps one dead bridge per
  opened editor until the extension deactivates.
- `revealFileLabel(process.platform)`: "Reveal in Finder" (`darwin`), "Reveal in File Explorer"
  (`win32`), "Open Containing Folder" (other), for the export notification (§13.5); English, the
  labels of VS Code itself (a localized modeler translates them with `vscode.l10n`).

What the webview bundle needs under this CSP:

- **Fonts as files.** Bundle Geist and Geist Mono as files next to the bundle, not as data URLs:
  esbuild `loader: { ".woff2": "file", ".woff": "file" }` with `assetNames: "fonts/[name]-[hash]"`.
  The browser then fetches only the subsets a page's `unicode-range` needs (Geist Mono alone brings
  six, which inlined roughly double the webview CSS), `font-src {cspSource}` allows them, and `dist`
  must be in the panel's `localResourceRoots`. `data:` stays allowed for renderers that inline
  fonts.
- **zod 4 without eval.** `script-src` admits only the nonce'd script, so eval and `new Function` are
  blocked (correctly, there is no `'unsafe-eval'`). zod 4 probes once for eval when it builds its
  first object schema and catches the error, but the browser still reports that `new Function` as a
  `securitypolicyviolation`; under `jitless` zod skips the probe. A webview that bundles zod 4 runs
  `z.config({ jitless: true })` in a module it imports before any schema module (Event Storming:
  `import "./zod-jitless"`, the first line of `main.ts`).
- **The kit's `csp` case.** A test page served by Vite runs the webview from source without a CSP,
  so a loader or CSP mistake of the shipped bundle shows only behind the real HTML. The `csp` case
  of `./testing` (0.6) builds on `openWebviewBundle` of `./testing/webview-bundle`: the harness's
  `csp.open` builds the bundle as shipped and opens it behind `renderWebviewHtml`'s document and
  CSP, and the case walks it and fails on any CSP violation, error or missing font.

## `./vscode/webview`

```ts
function applyAppearance(appearance: Appearance, element?: HTMLElement): void; // default <html>
interface AppearanceListenerOptions {
  themes: readonly Theme[];
}
function connectAppearance(options: AppearanceListenerOptions): () => void;
function connectReducedMotion(): () => void;

interface VsCodeShellOptions
  extends Omit<ShellOptions, "host" | "keyScope" | "themes">, AppearanceListenerOptions {}
function mountVsCodeShell(root: HTMLElement, options: VsCodeShellOptions): ShellHandle;

interface WebviewStateApi {
  getState(): unknown;
  setState(state: unknown): void;
}
interface ShellWebviewState {
  legendOpen?: boolean;
  view?: ViewportState;
}
const SHELL_STATE_KEY = "modelerShell";
function readShellState(api: WebviewStateApi): ShellWebviewState;
function writeShellState(api: WebviewStateApi, patch: ShellWebviewState): void;
interface PersistableView {
  onChange(listener: () => void): () => void;
  getState(): ViewportState | undefined;
}
interface PersistViewOptions {
  delayMs?: number; // default 250
}
function persistView(
  api: WebviewStateApi,
  viewport: PersistableView,
  options?: PersistViewOptions,
): () => void;

// re-exported from the shared protocol, as in ./vscode/extension:
// APPEARANCE_MESSAGE_TYPE, AppearanceMessage, appearanceMessage, isAppearanceMessage
```

- `applyAppearance` sets `data-cd-theme` and `data-cd-kontrast` in one task, with
  `cd-shell-no-transition` on `<html>` until a nested `requestAnimationFrame` (no colour fades; after
  several quick switches only the last one lifts it).
- `connectAppearance` applies every `AppearanceMessage` arriving on `window`, resolved against its own
  `themes` once more (what this bundle can show wins over what the extension passed); a message that
  changes nothing leaves `<html>` alone. A page whose `<html>` has no `data-cd-theme` at connect (no
  `renderWebviewHtml`) falls back to the body classes until the first message: a `MutationObserver`
  applies `resolveAppearance(appearanceFromBodyClasses(…), themes)`, at once and on every change.
  With the attributes of `renderWebviewHtml` there is no fallback: the bridge knows the `colorTheme`
  setting, the body classes do not, and VS Code changes them before the bridge's message arrives from
  the extension host, which would flash the mode without the setting. The body classes are never
  used for styling. Throws for empty `themes`.
- `connectReducedMotion` mirrors the body class `vscode-reduce-motion` (VS Code's
  `workbench.reduceMotion`, kept up to date by VS Code) as `REDUCED_MOTION_CLASS` on `<html>` for the
  whole session; its disconnect removes the class.
- `mountVsCodeShell` is `mountShell` with `host: "ide"` and `keyScope: "document"` (both always win)
  plus `connectAppearance(options)` and `connectReducedMotion()`, connected first, so empty `themes`
  throw before anything mounts (and disconnected again if `mountShell` throws). It returns a handle
  that passes every member through and whose `destroy()` disconnects both too. This wires the IDE
  key interception: handled keys are stopped on `document`, before VS Code's listener on `window`
  forwards them to the workbench.
- `readShellState`/`writeShellState` keep the shell's part (legend state, view) under
  `SHELL_STATE_KEY` of `vscode.getState()`. `readShellState` returns `{}` for a missing or malformed
  part and only valid fields (a view with finite `x`/`y`, positive width and height and a boolean
  `userMoved`), as copies. `writeShellState` merges: every other top-level key and unknown keys in its
  own part stay, an `undefined` or malformed value leaves the stored one alone (so
  `{ view: viewport.getState() }` before the first import erases nothing), and nothing is written
  when nothing changed. The modeler owns `acquireVsCodeApi()` (callable once) and passes its API
  object.
- `persistView(api, viewport)` writes `{ view: viewport.getState() }` once the view has rested for
  `delayMs` (trailing), instead of one `vscode.setState` IPC message per frame of a pan, a wheel zoom
  or a fit animation; the returned stop function writes a pending change at once. The legend state
  is written from `legend.onToggle` (see the usage below).
- The custom editor is registered with `webviewOptions: { retainContextWhenHidden: true }`: a hidden
  tab keeps document, view and selection, reports a 0 × 0 container and neither fits nor measures.

## `./testing`

```ts
// Playwright's Page satisfies it
interface PageLike {
  evaluate<R, Arg>(pageFunction: (arg: Arg) => R | Promise<R>, arg: Arg): Promise<R>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  keyboard: { press(key: string): Promise<void> };
  mouse: {
    click(x: number, y: number): Promise<void>;
    dblclick(x: number, y: number): Promise<void>;
    move(x: number, y: number): Promise<void>;
    down(): Promise<void>;
    up(): Promise<void>;
  };
  waitForTimeout(timeout: number): Promise<void>;
  // 0.2: Playwright's page.emulateMedia; the web host's appearance needs it (else a skip, hook "open"),
  // after 0.5.0 also reducedMotion and forcedColors in every host
  emulateMedia?(options: {
    colorScheme?: "light" | "dark" | "no-preference" | null;
    contrast?: "more" | "no-preference" | null;
    reducedMotion?: "reduce" | "no-preference" | null;
    forcedColors?: "active" | "none" | null;
  }): Promise<void>;
}

interface OpenContext {
  size: Size; // the shell container's size (grow the page by any frame around an embedded root)
  requested: Appearance; // what the host requests; the harness opens the page with it (embedded, web: see below)
}
interface ShowHooks<P extends PageLike = PageLike> {
  problems?(page: P): Promise<void>; // web: with items, so the popover has rows
  status?(page: P): Promise<void>;
  legend?(page: P): Promise<void>;
  inspector?(page: P): Promise<void>;
  invalid?(page: P): Promise<void>; // the invalid-file state, caused the way the host causes it
  emptyState?(page: P): Promise<void>; // 0.2, web: the start screen of a fresh visit
  toast?(page: P, toast: ToastFixture): Promise<void>; // 0.2, web and embedded: through shell.toast
}
type ShowHook = keyof ShowHooks; // … | "emptyState" | "toast"
// 0.4: how the labelEditor case opens the label editor and sees a commit of it
interface LabelEditorHooks<P extends PageLike = PageLike> {
  // a double-click, then type text the label does not hold yet, without committing; resolves with
  // the typed text once the editor has the focus and holds it; called again after a step that
  // committed or closed the editor
  open(page: P): Promise<string>;
  // whether the document changed since open last resolved (what the host would save or send)
  documentChanged(page: P): Promise<boolean>;
}
// 0.6: how the csp case opens the production webview bundle (openWebviewBundle of ./testing/webview-bundle)
interface CspHooks<P extends PageLike = PageLike> {
  // the bundle at context.size as VS Code would with context.requested, its document handed over the
  // way the extension does (init); resolves once the first import is done
  open(page: P, context: OpenContext): Promise<void>;
}
// "problemSelection": the modeler's problems never point at an element (only at lines), so no row selects
// "labelEditor" (0.4): the notation has no labels to edit on the canvas
// "canvasMenuAction" (0.4): no File or Model action without a dialog (an IDE host whose Model group holds toggles and dialogs)
type AbsentFeature = ShowHook | "drop" | "problemSelection" | "labelEditor" | "canvasMenuAction";
interface ToastFixture {
  status: ToastStatus;
  text: string;
  actionLabel?: string; // the hook passes { label: actionLabel, onSelect() {} } as action
}
interface DropFixture {
  name: string;
  type: string;
  text: string; // the kit builds new File([text], name, { type }) in the page
}
interface DropFixtures {
  accepted: DropFixture; // dropped on the start screen, it opens (the card goes)
  rejected?: DropFixture; // opens nothing, shows a danger toast (or the modeler's onReject)
  multiple?: boolean; // the modeler's DropZoneOptions.multiple; default false: two files are forbidden
}
interface ShellConformanceHarness<P extends PageLike = PageLike> {
  host: ShellHost;
  themes: readonly Theme[];
  open(page: P, context: OpenContext): Promise<void>;
  destroy?(page: P): Promise<void>;
  root?: string; // default ".cd-shell"
  show?: ShowHooks<P>;
  drop?: DropFixtures; // 0.2, web: the files the dropZone case drops
  labelEditor?: LabelEditorHooks<P>; // 0.4: the label editor of the labelEditor case
  csp?: CspHooks<P>; // 0.6, ide: the production webview bundle of the csp case
  absent?: readonly AbsentFeature[]; // islands, states, the drop zone and a label editor the modeler does not have
  sizes?: readonly Size[]; // default 1280 × 900, 720 × 700, 420 × 700
}
interface ShellSkip {
  hook: ShowHook | "drop" | "labelEditor" | "csp" | "destroy" | "open"; // the harness field that would feed the skipped part
  reason: string;
}
interface ShellCaseOutcome {
  skipped?: readonly ShellSkip[];
}
interface ShellConformanceCase {
  name: string;
  run<P extends PageLike>(
    page: P,
    harness: ShellConformanceHarness<P>,
  ): Promise<ShellCaseOutcome | void>;
}
function shellConformanceCases(): ShellConformanceCase[];
type ShellConformanceTest<P extends PageLike = PageLike> = (
  name: string,
  body: (fixtures: { page: P }) => Promise<void>,
) => unknown;
interface RegisterShellConformanceOptions {
  onSkip?(caseName: string, skips: readonly ShellSkip[]): void; // default: console.warn, joined by "; "
}
function registerShellConformance<P extends PageLike>(
  harness: ShellConformanceHarness<P>,
  test: ShellConformanceTest<P>,
  options?: RegisterShellConformanceOptions,
): void;
// "theme=dark&kontrast=hoch[&colorTheme=…][&reduceMotion]" for a page with the VS Code stub
function vsCodeStubSearch(
  requested: Appearance,
  extra?: { colorTheme?: ColorThemeSetting; reduceMotion?: boolean },
): string;

const GEOMETRY_TOLERANCE_PX = 1;
interface IslandBox {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface ChromeMeasurement {
  container: Size;
  paletteRow: PaletteRow;
  islands: Partial<Record<ChromeIsland, IslandBox>>;
  open: {
    legend: boolean;
    inspector: boolean;
    problems: boolean;
    emptyState: boolean; // 0.2: data-empty-state="shown"
    primaryCollapsed: boolean; // 0.2: data-primary="collapsed"
    zoomRaised: boolean; // 0.2: data-zoom-row="raised"
  };
  toastCardWidth?: number; // 0.2: the widest visible toast card; absent without a toast
}
interface ExpectedBox {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  width?: number;
  height?: number;
  centerX?: number;
  centerY?: number; // 0.2
}
function measureChrome(page: PageLike, root?: string): Promise<ChromeMeasurement>;
function expectedChromeBoxes(
  measurement: ChromeMeasurement,
  host: ShellHost,
): Partial<Record<ChromeIsland, ExpectedBox>>;
```

`IslandBox` and `ExpectedBox` are relative to the root's padding box (`getBoundingClientRect()` minus
the root's box and border), where the islands anchor.

Cases (each named `shell conformance: <name>`; failures throw plain `Error`s listing every problem):

| Case         | Checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `geometry`   | per size, as opened and after each show hook in turn (legend, problems, status, inspector): every visible `data-chrome` island against the geometry table, ±1px; the palette row decision (second row up to 760px, 16px clearance); the guide's limits (legend ≥ 184px, status ≤ `min(560px, 100cqw − 24px)`, side inspector ≥ 64px above the bottom, sheet ≤ 45 %, second-row palette ≤ `100cqw − 24px`); root state attributes against what is visible; zoom, pill and legend hidden under a bottom sheet; the dropdown at 60/12 and 248 to `min(320px, 100cqw − 24px)` wide; tooltips on the menu trigger, a palette entry and zoom in at 60, 112 and bottom 60, centred on their control (in the second row too) and 12px from the sides; an `absent` island is never visible                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `aria`       | trigger `aria-haspopup`/`-expanded`/`-controls` → `role="menu"`; the menu keyboard (Enter and ↓ open on the first entry, ↑ on the last, wrap, Home/End, Escape returns focus), whose keys never reach a `keydown` listener on `document`; items named without their `aria-hidden` shortcut chip, which `aria-keyshortcuts` or the item's description names, `aria-checked`, labelled radio groups, dialog entries ending in "…"; palette `role="toolbar"` with roving tabindex driven by ←/→/Home/End, `aria-pressed` on tools and `aria-keyshortcuts` on every entry whose tooltip shows a shortcut (each entry focused by keyboard); on menu items and palette entries alike (§5.6, `shortcutKeyKind`) `aria-keyshortcuts` names keys, not characters (never `?` or `Equal`), a chip whose character needs ⇧ carries the keys of US and German (`?` as `Shift+/ Shift+ß`, never as description only), and no chip is a character that needs AltGr or ⌥, sits on a dead key or is missing in one of them (`@`, `[`); Tab from the menu trigger lands on the palette's one stop, then on the canvas `<svg>`, nothing in between; the canvas `<svg>` has an accessible name; zoom `role="group"`, readout `aria-label` with the shown percentage, `aria-keyshortcuts` for the page's platform, `aria-disabled` (never native `disabled`) at 400 % and 20 % reached by clicking; roles of pill, status, legend and inspector (an `absent` one is never visible); DOM order; no positive `tabindex`; no native `title`; `lang` on `<html>` or on an embedded root |
| `keys`       | on the canvas, each chrome key changes the zoom exactly once (Ctrl, Meta, Shift and numpad variants 100 % → 135 % → 100 %, 0 and Numpad0 to 100 %, Shift+1 fits at most 100 %); unmodified `+`/`-` and Alt combinations do nothing; Escape without menu or dialog passes untouched; input, textarea and editable-label stand-ins, since 0.6 also EditContext (where the browser has `EditContext`) and Monaco ones, block the zoom keys, leave Shift+1 to the field and keep undo/redo (stopped, not prevented); a modal stand-in (`role="dialog"` with `aria-modal="true"`, a `showModal()` `<dialog>`) blocks them, a non-modal one (a popover by role, a `show()` `<dialog>`) does not, and Escape with either ARIA stand-in open is left to it; Escape with the open menu closes it; Control+A and Meta+A on the focused canvas are handled by the canvas (select all, or at least prevented). `ide`: a `keydown` listener on `window` never sees a handled or blocked key (select all included) while F1 still arrives, a `document` listener registered after the shell's sees handled keys prevented and blocked ones (Cmd/Ctrl+Z in a text field) not, and Cmd/Ctrl+Z, Shift+Z and Ctrl+Y on the canvas reach `window` once and unprevented (the document's history undoes, §13.5); other hosts: every key reaches `window`, the handled ones prevented                                                                                                                                                                                                |
| `create`     | §5.5: the palette focused by keyboard and walked with →/Home to the first entry that is not a tool (outside group `tools`, `data-action` not ending in `-tool`), then Enter: exactly one new `.djs-shape[data-element-id]`, selected, its centre inside the free rectangle (the container minus the fit insets recomputed from the measured chrome), the focus on the canvas (its `<svg>` or a label-editor field); Escape afterwards. A notation without a creating entry passes with nothing to verify                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `readOnly`   | §13.5, after `show.invalid` and `INVALID_STATUS_DELAY_MS`: `data-readonly` on the root, the status box visible with `role="alert"`; every palette entry but `lasso-tool` and `hand-tool` `aria-disabled`, those two not, and the disabled tool entries and their icons in `--cd-ui-text-leise`; Enter on a creating entry adds no shape; the shell's Legend checkbox and every Export and Help entry that was enabled before stay enabled; on a shape a pointer reaches: no `.djs-context-pad` entry after a click, a 40px drag changes neither its position nor its size, a double-click opens no text field inside `.djs-container`, Delete and Backspace on the canvas keep it. Skips with `hook: "invalid"` without the hook (unless `absent` lists it) and with `hook: "open"` when the opened document shows no such shape                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `appearance` | the harness opens with dark, dark + high contrast and light + high contrast requested. Own document: the mode on `<html>` is `resolveAppearance(requested, themes)`, recomputed by the kit (a light-only modeler stays light, `hoch` passes). Embedded: the kit puts the foreign page's `<html>` in the requested mode, and the root carries its own `data-cd-theme="<themes[0]>"` with the page's `data-cd-kontrast` (§13.3). Both: no themed descendant; `cd-shell-document` on `<html>` in `ide`/`web`, never in a foreign page; tokens loaded; `color-scheme` and four `--cd-ui-*` roles equal on root, canvas, every island, the open dropdown and the visible tooltip; the painted surround, the first non-transparent `background-color` from `.djs-container` out through `.cd-shell-canvas` to the root, equals `--cd-ui-grund` (§10.1); every palette tool entry (group `tools` or `data-action` ending in `-tool`) and its icon (`<svg>` or `::before`) compute to `--cd-ui-text` at rest and pressed and to `--cd-ui-interaktion` hovered, each tool hovered in turn and Lasso armed by a click, which sets `aria-pressed="true"`; notation previews are exempt (§5.5). Never half-dark                                                                                                                                                                                                                                                                                                                                                            |
| `cleanup`    | with a tooltip timer pending: after `destroy` and 800ms, a resize and chrome keys that must arrive unprevented, no `cd-shell*` class or element, no `data-chrome`, no root state attribute (embedded: also no `data-cd-theme`/`data-cd-kontrast`) and no page error is left; skips with `hook: "destroy"` without a `destroy`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**0.2, the web column.** The 0.1 cases learn the web host's islands, and five cases join them after
`cleanup` (`createWebCases` in `src/testing/web-cases.ts`). Each runs in every host; outside the
hosts it applies to it asserts that nothing of it shows and passes.

| Case / extension        | Checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `geometry` (extended)   | web: `primary` at 12/12, 40 high, 40 wide while collapsed; the palette keeping 16px to the primary action in the top row; `legal` at 12/12, 20 high per line and at most `100cqw − 24px` wide; pill, legend and zoom panel per `open.zoomRaised` on the legal line's measured lines; the popover above the pill (after a click on it); toasts at `toastStackBottom` recomputed from the measured bottom row and the widest card (`toastCardWidth`); `empty-state` centred after `show.emptyState`; IDE and embedded: `primary`, `legal`, `empty-state`, `drop-zone` never visible                                                                                                                                                                                                                                                                                                                                                                                                    |
| `aria` (extended)       | web: tab order menu trigger, primary action, palette, canvas; the primary action's `aria-label` in both states; the legal `<nav aria-label>`, Impressum and Datenschutz with `lang="de"`, `rel="noopener noreferrer"`; the File group first with its ids and icons, the Appearance group (dark-capable only) between Export and Help with `aria-checked`; the pill's `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `appearance` (extended) | web, with `emulateMedia`: light-only: `<html data-cd-theme="light">` under a dark system, no Appearance group, `data-cd-kontrast="hoch"` under `prefers-contrast: more`; dark-capable: `system` follows the system, choosing Dark writes `miragon.darstellung=dark`, `data-cd-theme="dark"`, `color-scheme` and both `theme-color` metas in one frame, System removes the entry; never half-dark                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `webChrome`             | primary action: label collapse before the palette moves (widths stepped from wide to narrow), tooltip only while collapsed, `onSelect` on click and on Enter (so a real app runs its own handler, a Share without clipboard permission shows its danger toast meanwhile); legal line content and links; at 320px every link whole inside the wrapped line (WCAG 1.4.10), none broken across lines, each separator on the line of the link after it, and with the pill and the legend shown (where the harness has them) every island standing on the line's measured height; the raised zoom row where legal line and zoom panel meet, measured at every 24px step and where the panel would keep 4px and 12px to the line (raised and not); File entries run their handlers and close the menu, never locked under `show.invalid`                                                                                                                                                   |
| `emptyState`            | after `show.emptyState`: the card centred, `min(400px, 100cqw − 24px)`, Komet 64px with `alt=""`, `<h1>`, primary "New diagram" before ghost "Show example", both 36px (a text link in the hint is no action); with Open… in the File group (read before the start screen hides the menu) the hint ends in the link "Open a file…" with Open…'s chip and `aria-keyshortcuts`, which names keys like the menu's (§5.6, as in `aria`), underlined at rest (mouse parked, focus blurred); the work chrome `visibility: hidden`, the canvas `inert`, Tab reaching only the card and the legal links, chrome keys (Ctrl + `+`, `-`, `0`, Shift+1) reaching the browser unprevented without zooming the diagram; with `show.toast`, closing a focused toast puts the focus on the card; "New diagram" hides it, shows the chrome and focuses the canvas `<svg>`                                                                                                                            |
| `toasts`                | through `show.toast`: a `role="status"` and a `role="alert"` live region in the root before the first toast, the toast's text arriving in the one of its status, no live role on the card; Close named "Close", each card as wide as its content (measured at `width: max-content`), at most the stack, at most three (the fourth evicts the oldest without action), the newest at the bottom, a repeated text not stacked, closing after `toastLifetime` (with a margin) unless hovered or focused, a toast with an action never; the lift, at the widths where the widest card's centred column keeps 12px and 4px to the legal line or the zoom panel: `bottom: 12px` at 12px although the stack's own column comes closer, 8px above that island at 4px (`toastStackBottom`); web: shown again in the top layer after a `showModal()` stand-in opened (everything outside a modal is inert, so the kit checks the stacking, not a click); IDE: no hook and no toast element ever |
| `problemsList`          | web (embedded when the pill opens it): after `show.problems`, a click on the pill opens `role="dialog"` titled "Problems" with the rows, Escape returns the focus to the pill, an outside click closes without moving it; Enter on the pill and then ↓ to the last row, Home and End reach every row, text rows included, each scrolled into the list (WCAG 2.1.1); a row with an element closes it and focuses the canvas (skipped with `hook: "problems"` when no item has an `elementId`, unless `absent` lists `"problemSelection"`); geometry left 12, 8px above the pill, at most 320 wide and high                                                                                                                                                                                                                                                                                                                                                                            |
| `dropZone`              | web with `harness.drop`: synthetic file drags (a `DataTransfer` built in the page) show `data-drop="over"` with the §9 colours and the 12px inset; two files (unless `drop.multiple`) and a modal stand-in show `forbidden`; a drag without files changes nothing; dropping `accepted` on the start screen opens it, `rejected` opens nothing and shows a danger toast; skips with `hook: "drop"` without the fixtures unless `absent` lists `"drop"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**0.2.2, the focus hand-back.** One case joins after `keys` (`createBaseCases`) and runs in every
host:

| Case            | Checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `focusHandBack` | §5.8: each zoom control (zoom in, zoom out, the readout, Fit) focused by script, then clicked with the pointer, and a palette tool (`lasso-tool`, else the first enabled tool, Escape afterwards) clicked: the focus is on the canvas `<svg>` (`.djs-container > svg`) or inside it; Enter and then Space on the focused zoom in: the focus stays on the button. Every visible zoom control is required. Since 0.4, §5.4: the first File or Model `menuitem` that opens no dialog (no `aria-haspopup="dialog"`, not `aria-disabled`, not `data-danger`) clicked with the pointer: the focus is on the canvas; focused in the open menu and activated with Enter: the focus is on the menu trigger. Without such an entry it skips with `hook: "open"`, unless `absent` lists `"canvasMenuAction"` |

**0.4, the label editor over the shell's view changes** (after 0.5.0: Cmd/Ctrl+Plus once more
when the view stands at exactly 100 %). One case joins after `create` (`createBaseCases`) and runs
in every host:

| Case          | Checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `labelEditor` | contract L5 (`@miragon/modeler-api` 1.2) through the shell's own view changes, with the keep-open L5 only recommends as a requirement of this kit: after `labelEditor.open` (the focus in a text field holding the typed text, the document unchanged) a click on zoom in, a click on Fit, Cmd/Ctrl+Plus (once more when it landed on 100 %, as one zoom step does from a fit between about 64 % and 86 %, so that Cmd/Ctrl+0 changes the view), Cmd/Ctrl+0, Cmd/Ctrl+Plus and Shift+1 at the canvas and a container resize (the page narrowed to three quarters of its width, at least 320px: the refit) each change the view and leave `labelEditor.documentChanged` false and the typed text in the focused field, read once the view held still and 500ms more, so a late commit (a debounced resize handler) counts against its step; after a step that committed or closed the editor it opens it again. The clicks run by script (`HTMLElement.click()`, `detail` 0) and the keys are dispatched at the canvas `<svg>`, so the focus stays in the editor and a modeler that commits on blur is not blamed. If no step committed, a click on an empty spot of the canvas (the user's commit) must make `documentChanged` true, or the case proved nothing. Skips with `hook: "labelEditor"` without the hooks (unless `absent` lists `"labelEditor"`) and with `hook: "open"` when the canvas shows no empty spot to click |

**0.4, the legend's start state** (0.5: closed at every size). One case joins after `geometry` and
runs in every host:

| Case          | Checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legendStart` | §5.10: `open` at 390 × 844, 441 × 900 and 1280 × 900, each as a first visit without a stored legend state: the legend is closed at every size (neither `data-legend="open"` on the root nor the card visible). 0.4 required it open at 441 × 900. A stored `legend.open: true` is not part of the case, because `open` has no way to pass one; the shell's unit tests cover it. Fails with a `harness:` problem when `open` keeps the page's document. Skips with `hook: "legend"` without `show.legend`; with `legend` in `absent` there is nothing to verify |

**After 0.5.0, reduced motion, forced colours and the canvas's layers.** Three cases join after
`appearance` (`createBaseCases`) and run in every host. None needs a new harness field:
`reducedMotion` and `forcedColors` emulate the media feature themselves through
`page.emulateMedia` and turn it off again in a `finally`, so a later case on the same page is not
affected.

| Case            | Checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reducedMotion` | §5.14, §7, under `prefers-reduced-motion: reduce` and, in the `ide` host, a second time under VS Code's reduce motion (the body class `vscode-reduce-motion` on the host page, which the shell mirrors as `cd-shell-reduce-motion`): as opened, with the menu open, with a chrome tooltip, with the first shape a pointer reaches selected, after each given island hook (outside the IDE host also `show.toast`) and while Fit runs after two clicks on zoom in, no element of the document (embedded: of the root), `::before` and `::after` included, has a computed transition or animation longer than 0.01ms, and no animation longer than that runs (`document.getAnimations()`, so `element.animate()` counts too); a style is reported in the first state that shows it. §5.9: the click on Fit shows at most three views, frame by frame (it jumps). Skips with `hook: "open"` without `page.emulateMedia` (the IDE host still runs the VS Code pass), when the document shows no shape a pointer reaches, and when Fit is `aria-disabled`; with a hook per island neither given nor `absent`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `forcedColors`  | §5.14, §12, under `forced-colors: active`: every visible `data-chrome` island but the legal line, the toast stack and the drop zone, and the open dropdown, draws a border on every side in CanvasText (the primary action, a button, in ButtonText); the status box's bar (`::before`) and the icon of every enabled tool are CanvasText; the pressed tool (`lasso-tool`, else the first tool, after a click) shows a 2px inset ring in Highlight, which needs `forced-color-adjust: none`; Tab from zoom out puts a solid ring of at least 2px in Highlight on the next control; each dialog entry of the menu outside the File group (whose Open… asks the browser for a file), clicked, that shows a dialog in the page (an open `<dialog>`, `role="dialog"` or `role="alertdialog"`; embedded: in the root) has its panel (the dialog, or the first element down its first children that draws a border) bordered in CanvasText, because the shell's rules do not reach a modeler's dialog; a menu that does not open again after a dialog, or no longer shows an entry, fails the case as not verified. Checked as opened, with the menu open and after each given island hook, each problem once. The system colours come from probe elements, so the case asserts what the CSS sets (WebKit matches the media query but forces nothing). Skips with `hook: "open"` without `page.emulateMedia`; with a hook per island neither given nor `absent`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `overlayLayers` | §5.13, with the pointer parked: as opened, with the label editor open (`labelEditor.open`, then Escape), with one element selected per kind of context pad (a kind is shape or connection plus the pad's set of `data-action`s; of the shapes and connections a pointer reaches, it selects the first shape, the first connection and up to ten more spread evenly over the document), and after a click on each entry of those pads but one whose `data-action` names a delete or a removal, each action once for shapes and once for connections (Escape after each, `window.open` held meanwhile; an entry whose pad an earlier one closed is reached by a click on an empty spot of the canvas and one on the element, one whose element an earlier one replaced or changed on another element with the same pad, and an entry no element shows any more fails the case as not verified; a selected element counts as selected also where its handles cover it), every outermost stacking context below `.djs-container` but the palette whose `z-index` exceeds 100 and that shows something must close once Cmd/Ctrl+Plus (else Cmd/Ctrl+Minus) dispatched at the canvas changed the view, and stay closed while the case watches for 500ms after (diagram-js fires `canvas.viewbox.changed` up to 300ms late, so an overlay that only hides while the view changes fails as well), a step the case undoes afterwards. So a popup that closes on a pan or zoom (diagram-js's popup menu at 200, a colour picker) may cover the palette, and what stays (a toolbar, a prompt, the label editor) lies at 100 or below. A `z-index` inside another stacking context (diagram-js's transformed overlay container) is local to it and does not count. Skips with `hook: "open"` when the document shows no shape or connection a pointer reaches, with `hook: "labelEditor"` without the hooks (unless `absent` lists `"labelEditor"`) |

**0.6, the production webview bundle under its CSP.** One case joins after `overlayLayers`
(`createBaseCases`); it runs in the `ide` host and passes with nothing to verify in the others:

| Case  | Checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `csp` | the bundle the extension ships, opened through `csp.open` (`openWebviewBundle`): the page carries exactly `renderWebviewHtml`'s policy for its origin (with any nonce, with or without `'unsafe-inline'` styles), so a `csp.open` cannot loosen it, and the VS Code stub that records; then a walk over what renders late: the tooltip of a palette entry, a shape a pointer reaches clicked and each entry of its context pad hovered, a double-click on it (the label editor) and Escape, every enabled menu entry that is not `data-danger` from a freshly opened menu (the exports, each dialog closed again by Escape, the toggles such as the Legend, each radio option not chosen yet), zoom in and Fit, and 500ms for what they started. Fails on every `securitypolicyviolation` (directive, blocked URI, source, with a hint for eval, inline styles and fonts), every uncaught error, unhandled rejection, failed resource load and `console.error` the stub recorded, and on a shell font (the first family of the root's text and mono stacks, Geist Variable and Geist Mono Variable) that loads no face for `13px` or whose `@font-face` takes its `src` from a `data:` URL or carries no `unicode-range` beside the family's other subsets (every page would fetch that file), and on every font face of the page whose load failed (`FontFace.status` `"error"`, such as a missing italic the canvas uses). Fails, too, when the walk finds no palette entry, no menu trigger or no `role="menu"` after clicking it, or activates no menu entry, since the bundle's tooltips, exports and dialogs would then go unverified. Skips with `hook: "csp"` without `csp` and with `hook: "open"` when the bundle shows no shape a pointer reaches |

- **Skips.** A case the harness cannot feed reports what it skipped as `ShellSkip`s, one per missing
  harness field, through `onSkip` (default `console.warn`). A hook that is neither in `show` nor in
  `absent` is skipped with `hook` set to its name, a missing `drop`, `labelEditor` or (in the `ide`
  host) `csp` with `hook` set to that field, a missing `destroy` with `hook: "destroy"`, and a
  document that lacks what a case needs (a shape a pointer reaches, for `readOnly`, `reducedMotion`
  and `csp`; a shape or connection, for `overlayLayers`; a File or Model action without a dialog,
  for `focusHandBack`) with `hook: "open"`, as is a page without `emulateMedia` in `reducedMotion`
  and `forcedColors`. `absent` lists what the modeler does not have (an island, the `invalid` state,
  the drop zone, a label editor or a File or Model action without a dialog), which is then never
  reported, while `geometry` and `aria` assert that the island never shows. Listing a hook in both
  `show` (or `drop`, `labelEditor`) and `absent` fails every case that uses it. A suite that lists
  what it lacks can fail on every remaining skip:
  `onSkip(name, skips) { throw new Error(…) }`.
- **`show.invalid`** makes the file invalid the way the host does (in a webview: a document update
  the parser rejects), not by calling `shell.setReadOnly` alone: the `readOnly` case also checks the
  modeler's own canvas lock, which its invalid-import path sets. The case waits
  `INVALID_STATUS_DELAY_MS` and a margin itself.
- For the `embedded` host the kit writes `data-cd-theme` and `data-cd-kontrast` on the page's
  `<html>` itself after `open`: every consumer suite then proves that the modeler stays in its own
  mode inside a dark host page, the case a foreign page meets in practice (designIQ, a web app on
  `system` under a dark OS).
- `open` loads the modeler as on a first visit, without a stored legend state (`legend.open`
  undefined), so the shell's default decides; `legendStart` reads it at three sizes. Each `open` loads
  a new document: the shell decides the legend's start state once per mount, and a navigation that
  changes only the URL fragment keeps the page. `legendStart` installs the kit's page global before
  each `open` and fails with a `harness:` problem when it survives; such a harness goes to
  `about:blank` first.
- For the `web` host (0.2) the kit calls `page.emulateMedia({ colorScheme, contrast })` from
  `requested` before `open`, and `open` loads the page without a stored `miragon.darstellung`; the
  `appearance` case then sets the choice through the Appearance group itself. Without
  `emulateMedia` the web part of `appearance` skips with `hook: "open"`.
- The second-row tooltip of the `geometry` case stands centred on its entry, like in the top row,
  at `top: 112px`; one centred in the container fails (guide §5.15, settled in design system 1.15.0,
  Miragon/corporate-identity#37).
- The kit never imports Playwright; a modeler's suite passes its `page` and `test`
  (`registerShellConformance(harness, test)` from `@playwright/test`). It installs one page global,
  `__modelerShellConformance`, with `keydown` recorders on `window` and `document`, and briefly
  injects stand-ins marked `data-modeler-shell-conformance` (an input, a textarea, an editable label,
  a modal dialog, a popover, a `<dialog>` opened with `show()` and one with `showModal()`, a focus
  target) into the shell root.
- `geometry` takes about 10s per host; wrap the registration in
  `test.describe.configure({ timeout: 60_000 })`.
- `registerShellConformance` calls `test` inside the kit, so a runner reports every case at the
  kit's source (the package ships `src/`, so that location resolves). For locations in the suite's
  own spec file, register the cases there:

  ```ts
  for (const conformanceCase of shellConformanceCases()) {
    test(`shell conformance: ${conformanceCase.name}`, async ({ page }) => {
      const outcome = await conformanceCase.run(page, harness);
      if (outcome?.skipped?.length) onSkip(conformanceCase.name, outcome.skipped);
    });
  }
  ```

### `./testing/vscode-stub` — the `ide` host without VS Code

```ts
type ColorThemeKind = 1 | 2 | 3 | 4;
function colorThemeKindOf(appearance: Appearance): ColorThemeKind;
const STUB_SETTING_KEY = "miragon.modeler.colorTheme";
interface VsCodeWebviewStubOptions {
  requested: Appearance; // VS Code's color theme
  themes: readonly Theme[]; // what the modeler's extension passes to the bridge
  lang?: string; // default "en"
  colorTheme?: ColorThemeSetting;
  settingKey?: string; // default STUB_SETTING_KEY
  reduceMotion?: boolean; // workbench.reduceMotion
  state?: unknown; // what acquireVsCodeApi().getState() returns at first
}
interface StubbedVsCodeApi {
  getState(): unknown;
  setState(state: unknown): void;
  postMessage(message: unknown): void;
}
interface VsCodeWebviewStub {
  readonly kind: ColorThemeKind;
  setColorThemeKind(kind: ColorThemeKind): void; // body classes first, then the bridge posts
  setColorTheme(setting: ColorThemeSetting | undefined): void;
  setReduceMotion(reduceMotion: boolean): void;
  pendingMessages(): number; // posted by the bridge, not yet delivered
  readonly posted: readonly unknown[]; // what the webview posted
  state(): unknown;
  cspViolations(): readonly CspViolation[]; // 0.6: every securitypolicyviolation since the install
  errors(): readonly string[]; // 0.6: uncaught errors, rejections, failed loads, console.error calls
}
interface CspViolation {
  directive: string; // effectiveDirective, such as "script-src-elem" or "style-src-attr"
  blockedURI: string; // the blocked URL, or "inline" or "eval"
  source: string; // "sourceFile:lineNumber:columnNumber", empty where unknown
  sample: string; // the start of a blocked inline script or style, empty otherwise
}
type StubWindow = Window & {
  __modelerShellVsCodeStub?: VsCodeWebviewStub;
  acquireVsCodeApi?: () => StubbedVsCodeApi;
};
function stubOptionsFromSearch(
  search: string,
): Pick<VsCodeWebviewStubOptions, "requested" | "colorTheme" | "reduceMotion">;
function installVsCodeWebviewStub(options: VsCodeWebviewStubOptions): VsCodeWebviewStub;
```

Runs in a test page, before the modeler's webview code: VS Code's default webview stylesheet in
`@layer vscode-default` (with foreign values, so a leak shows; a page that already has
`<style id="_defaultStyles">`, as under `openWebviewBundle`, keeps its own), `<html>` with the
attributes `renderWebviewHtml` writes, `<body>` with the host page's theme and reduce-motion
classes, `acquireVsCodeApi()` (once, as in VS Code) and the real `connectThemeBridge` against a fake
`vscode` namespace whose panel posts to the window. Since 0.6 it records from its install on every
`securitypolicyviolation` (on `document`), every uncaught error and failed resource load (`error`
on `window`, capturing), every unhandled rejection and every `console.error` call, which it still
passes on. Installed from `<head>`, before the parser reached `<body>`, it sets the body classes
once `<body>` exists, before the first script there runs. The stub is also
`window.__modelerShellVsCodeStub`, so a Playwright suite switches the color theme or the setting at
runtime and reads what it recorded.

A modeler's e2e suite serves `e2e/webview/` as the root of a Vite server, with the test page
`e2e/webview/webview-test.html` (`<div id="app">` and `<script type="module" src="./webview-test.ts">`)
and this entry:

```ts
// e2e/webview/webview-test.ts
import {
  installVsCodeWebviewStub,
  stubOptionsFromSearch,
} from "@miragon/modeler-shell/testing/vscode-stub";

// before the webview runs, which calls acquireVsCodeApi() and mounts the shell
installVsCodeWebviewStub({ ...stubOptionsFromSearch(location.search), themes: ["light"] });
const { webview } = await import("../../src/webview/main"); // exports { shell, modeler, connection, ready }

// for the harness only: the shipped bundle publishes nothing on window
window.shell = webview.shell;
window.modeler = webview.modeler;
window.connection = webview.connection;
void webview.ready.then(() => (window.webviewReady = true)); // the first import settled

// there is no extension host: post the document the way the extension would
window.postMessage({ type: "init", text: EXAMPLE_BOARD }, "*");
```

The harness opens it with ``page.goto(`/webview-test.html?${vsCodeStubSearch(requested)}`)`` and waits
for `window.webviewReady`. `ready`, `webviewReady` and the window globals are the modeler's, not the
shell's: its webview module exports `ready`, resolved once the first `init` import settled, and the
test page turns it into the flag (the Event Storming `main.ts` below exports it).

### `./testing/webview-bundle` — the production bundle under the webview CSP (0.6)

```ts
const WEBVIEW_BUNDLE_ORIGIN = "https://webview.test"; // the page's origin and cspSource
// Playwright's Page satisfies both
interface WebviewBundleRoute {
  request(): { url(): string };
  fulfill(response: {
    status?: number;
    contentType?: string;
    body?: string;
    path?: string;
  }): Promise<void>;
}
interface WebviewBundlePage {
  route(url: string, handler: (route: WebviewBundleRoute) => Promise<void>): Promise<unknown>;
  unroute(url: string): Promise<unknown>;
  goto(url: string): Promise<unknown>;
}
interface WebviewBundleOptions extends VsCodeWebviewStubOptions {
  dist: string; // the extension's production build (apps/vscode/dist)
  title: string; // as the extension passes it to renderWebviewHtml
  script?: string; // relative to dist; default "webview.js"
  styles?: readonly string[]; // relative to dist, in load order; default ["webview.css"]
  body?: string; // renderWebviewHtml's body; default '<div id="app"></div>'
  inlineStyles?: boolean; // renderWebviewHtml's; default true
  stubScript?: string; // the stub as a classic script; default the one this package ships
}
function openWebviewBundle(page: WebviewBundlePage, options: WebviewBundleOptions): Promise<void>;
```

Runs in Node, next to Playwright, and serves the bundle the way VS Code loads it:
`renderWebviewHtml`'s document and CSP with `cspSource` `WEBVIEW_BUNDLE_ORIGIN`, the appearance the
extension resolves from `requested`, `colorTheme` and `themes`, and prepended to `<head>` ahead of
the policy VS Code's default styles and the VS Code stub of `./testing/vscode-stub`, its options in
`data-options`. VS Code writes its default styles and its own API script there too, so the policy
blocks neither, and the stub records from the page's first stylesheet on: a stylesheet of `styles`
that is missing from `dist` counts as a failed load. Every other request to the origin gets the file
of `dist` it names, a 404 outside `dist`. It replaces any earlier route on the origin and resolves
once the page has loaded; the harness then hands the webview its document as the extension does:

```ts
// e2e/tests/vscode/support/webview.ts
import { openWebviewBundle } from "@miragon/modeler-shell/testing/webview-bundle";

const appsVscode = fileURLToPath(new URL("../../../../apps/vscode", import.meta.url));
let productionBuild: Promise<unknown> | undefined;

export async function openShippedWebview(page: Page, { size, requested }: OpenContext) {
  // the bundle as the packaged extension ships it, built once per worker
  productionBuild ??= promisify(execFile)(
    process.execPath,
    ["esbuild.config.mjs", "--production"],
    {
      cwd: appsVscode,
    },
  );
  await productionBuild;
  await page.setViewportSize(size);
  await openWebviewBundle(page, {
    dist: join(appsVscode, "dist"),
    title: "Event Storming Board",
    requested,
    themes: WEBVIEW_THEMES,
  });
  await page.waitForFunction(() =>
    window.__modelerShellVsCodeStub?.posted.some(
      (message) => (message as { type?: string }).type === "ready", // the webview's handshake
    ),
  );
  await page.evaluate((text) => window.postMessage({ type: "init", text }, "*"), EXAMPLE_BOARD);
  await page.locator(".cd-shell-canvas .djs-shape").first().waitFor();
}

// the harness: csp: { open: openShippedWebview }
```

Pass what the extension passes `renderWebviewHtml` (`title`, `body`, `styles`, `inlineStyles`), so
the page runs under the policy the extension ships. The stub's script is an IIFE in `dist` next to
this entry; `stubScript` replaces it, as the shell's own e2e suite does with a build from source.

### `./testing/vscode-electron` — smoke tests in a real VS Code (0.3)

The stub above stands in for VS Code; this entry starts the real one. It downloads VS Code with
`@vscode/test-electron`, starts it through Playwright's Electron support with the modeler's built
extension, opens a fixture in the custom editor and checks what only a real VS Code can show: the
webview inside VS Code's two frames, the document's dirty state, save and undo through the
workbench's keybindings, and the theme bridge under VS Code's four default themes, with a screenshot
per theme. It runs in Node, from a Vitest or `node:test` file; no Playwright test runner is needed.
The package's command `modeler-shell-vscode-docker` runs such a test in a Linux container, without a
window on the host ([In Docker](#in-docker-031)).

`playwright-core` (`^1.50.0`) and `@vscode/test-electron` (`^3.1.0`, which needs Node 22) are
optional peer dependencies of the shell: only this entry uses them, and it loads them on the first
`runVsCodeSmoke` call. A modeler that uses it adds both as exact devDependencies; nobody else installs
them. `@vscode/test-electron` before 3.1.0 starts VS Code on macOS as `Contents/MacOS/Electron`; VS
Code 1.110 renamed that executable to `Code` and has since dropped the `Electron` link, so 2.x and
3.0 fail every launch of a current VS Code on macOS. Verified with `playwright-core` 1.50.0 and
1.64.1, `@vscode/test-electron` 3.1.0 and VS Code 1.96.0 and 1.143.0.

```ts
interface VsCodeSmokeFixture {
  fileName: string; // a plain file name; it also keys workbench.editorAssociations
  text: string; // the document, with at least one element
}
interface PlatformKeys {
  modifier: "Meta" | "Control";
  save: string; // "Meta+s" on macOS, "Control+s" elsewhere
  undo: string; // "Meta+z" / "Control+z"
  redo: string; // "Meta+Shift+z" / "Control+y"
  close: string; // "Meta+w" / "Control+w": closes the active editor
}
interface VsCodeSmokeContext {
  page: Page; // playwright-core: the VS Code window
  webview: FrameLocator; // the modeler's webview document, inside VS Code's two webview frames
  keys: PlatformKeys;
  timeoutMs: number;
}
interface VsCodeSmokeOptions {
  extensionPath: string; // the built extension folder (its package.json), --extensionDevelopmentPath
  fixture: VsCodeSmokeFixture;
  parse: (text: string) => unknown; // the modeler's parser; throws or rejects for an invalid document
  edit?: (context: VsCodeSmokeContext) => Promise<void>; // default createFromPalette
  ready?: (context: VsCodeSmokeContext) => Promise<void>; // default: the canvas shows a shape
  undoSteps?: number; // default 1
  themes?: readonly Theme[]; // what the extension passes to the theme bridge; default ["light"]
  colorThemes?: readonly VsCodeColorTheme[]; // default VSCODE_COLOR_THEMES; the first also at start
  chrome?: readonly ChromeIsland[]; // must be visible; default ["menu", "palette", "zoom"]
  screenshotDir?: string; // <name>-<theme id>.png; none without it
  name?: string; // default the extension's package.json name
  viewType?: string; // default the first custom editor whose filenamePattern matches fixture.fileName
  vscodeVersion?: string; // "stable", "insiders", "1.96.0"; default the newest stable satisfying engines.vscode
  cachePath?: string; // @vscode/test-electron's download cache; default defaultVsCodeCachePath(…)
  windowSize?: Size; // the window's content size; default 1280 × 800
  timeoutMs?: number; // every single wait; default 30 000
  settings?: Record<string, unknown>; // more user settings, merged over the driver's
  log?: (line: string) => void; // progress; default silent
  keepTemporaryFiles?: boolean; // keep profile, workspace and VS Code's logs, and log where
}
function runVsCodeSmoke(options: VsCodeSmokeOptions): Promise<VsCodeSmokeResult>;
function createFromPalette(context: VsCodeSmokeContext): Promise<void>;

interface VsCodeColorTheme {
  id: string; // light, dark, high-contrast-dark, high-contrast-light
  name: string; // the workbench.colorTheme value
  kind: ColorThemeKind; // 1 to 4
}
// Default Light Modern, Default Dark Modern, Default High Contrast, Default High Contrast Light
const VSCODE_COLOR_THEMES: readonly VsCodeColorTheme[];
function expectedWebviewAppearance(kind: ColorThemeKind, themes: readonly Theme[]): Appearance;
function workbenchThemeClass(kind: ColorThemeKind): string; // vs, vs-dark, hc-black, hc-light
function webviewBodyClasses(kind: ColorThemeKind): readonly string[]; // sorted; kind 4 has both high-contrast classes

const VSCODE_SMOKE_STEPS: readonly [
  "resolve",
  "launch",
  "open",
  "edit",
  "save",
  "undo",
  "themes",
  "close",
];
type VsCodeSmokeStep = (typeof VSCODE_SMOKE_STEPS)[number];
type VsCodeSmokeTimings = Partial<Record<VsCodeSmokeStep | "total", number>>; // milliseconds
type ChromePresence = Partial<Record<ChromeIsland, boolean>>;
interface VsCodeSmokeThemeResult {
  theme: VsCodeColorTheme;
  expected: Appearance; // what the theme bridge has to show for `themes`
  observed?: Appearance; // what the webview's <html> showed; missing when the workbench never switched
  bodyClasses: readonly string[]; // VS Code's theme classes on the webview's <body>
  chrome: ChromePresence;
  screenshot?: string; // absolute path
  ms: number;
  ok: boolean;
}
interface VsCodeSmokeResult {
  ok: boolean; // failures is empty
  failures: string[]; // "save: Meta+s wrote nothing to disk", one per broken expectation
  vscodeVersion?: string;
  executablePath?: string;
  extensionId?: string; // publisher.name
  viewType?: string;
  chrome: ChromePresence; // after opening
  saved?: { text: string; parsed: unknown }; // what the save wrote and parse returned
  undone: boolean; // undo brought the canvas back and, saved again, the fixture's exact text
  themes: VsCodeSmokeThemeResult[];
  timings: VsCodeSmokeTimings;
}
function formatVsCodeSmoke(result: VsCodeSmokeResult): string; // a few lines for the test log
function screenshotFileName(name: string, theme: VsCodeColorTheme): string;

// the building blocks, for a driver of one's own
interface VsCodeSmokePaths {
  userDataDir: string;
  extensionsDir: string;
  workspaceDir: string;
  file: string;
}
interface ExtensionManifest {
  name?: string;
  publisher?: string;
  main?: string;
  contributes?: {
    customEditors?: ReadonlyArray<{
      viewType?: string;
      selector?: ReadonlyArray<{ filenamePattern?: string }>;
    }>;
  };
}
interface UserSettingsOptions {
  colorTheme: string;
  fileName: string;
  viewType: string;
  extra?: Record<string, unknown>;
}
const DEFAULT_WINDOW_SIZE: Size; // 1280 × 800
function vsCodeLaunchArgs(extensionPath: string, paths: VsCodeSmokePaths): string[];
function vsCodeUserSettings(options: UserSettingsOptions): Record<string, unknown>;
function vsCodeEnvironment(environment: Record<string, string | undefined>): Record<string, string>;
// <OS cache directory>/miragon-modeler-shell/vscode-test: ~/Library/Caches on macOS,
// $XDG_CACHE_HOME or ~/.cache on Linux, %LOCALAPPDATA% on Windows
function defaultVsCodeCachePath(
  platform: string,
  environment: Record<string, string | undefined>,
  homeDirectory: string,
): string;
function platformKeys(platform: string): PlatformKeys;
function extensionIdOf(manifest: ExtensionManifest): string | undefined;
function customEditorViewType(manifest: ExtensionManifest, fileName: string): string | undefined;
// *, ?, {a,b} and ** (a "**/" segment also matches no directory, as in VS Code); case-insensitive
function matchesFilenamePattern(pattern: string, fileName: string): boolean;
// the file main loads, found as Node's require finds it (as given, + .js/.json/.node, a folder's index.js)
function resolveExtensionMain(extensionPath: string, main: string): string | undefined;
```

A run takes these steps, each timed; a failed step skips what depends on it, never the rest:

1. **resolve**: `downloadAndUnzipVSCode` (cached in `cachePath`, by default in the OS's cache
   directory, outside the repository and shared by every modeler on the machine; without
   `vscodeVersion` the newest stable release that satisfies the extension's `engines.vscode`). A
   `cachePath` inside the repository needs entries in `.gitignore` and in ESLint's `ignores`.
   Concurrent runs share the cache (0.3.3): `downloadAndUnzipVSCode` gets a private folder
   `.download-<random>` inside `cachePath` with a link to every install there, finds a cached
   version through its link and unpacks a new one into the private folder, from where the driver
   moves it into `cachePath` with one rename. When another run has moved the same version in first,
   the run uses that install and deletes its own copy ("resolve: another run installed <folder>
   first, this run uses that one"). Only an install `downloadAndUnzipVSCode` rejects (an outdated
   Insiders build, a download an older driver left unfinished) is replaced, by one run at a time:
   that run holds the folder `.replacing-<folder>` in `cachePath` while it moves the rejected install
   aside, and a lock older than a minute, left by a killed run, is taken over. A private folder its
   run could not remove (killed mid-download) goes with the first run a day later. A `cachePath` the
   run cannot write to is read as it is. One on a file system that refuses symbolic links (FAT, for
   one) goes to `downloadAndUnzipVSCode` directly once it holds an install, as before 0.3.3 and so
   without this protection, and the run logs "resolve: <cachePath> cannot hold links (EPERM), so this
   run uses it directly, unprotected from runs at the same time". All of this holds when every run
   on `cachePath` uses 0.3.3 or later: a run of 0.3.2 or older still deletes and unpacks in place,
   so it can break a concurrent run of a newer driver and be broken by one.
2. **launch**: `_electron.launch` with the downloaded executable and `vsCodeLaunchArgs`: a throwaway
   `--user-data-dir` and `--extensions-dir` in the OS temp directory, `--extensionDevelopmentPath`,
   VS Code's own test-runner flags (no sandbox, no GPU sandbox, no updates, no welcome page, release
   notes or workspace trust prompt), no telemetry or crash reporter, then the workspace folder with
   the fixture and the fixture itself. The user settings (`vsCodeUserSettings`) set the theme,
   associate the fixture's file name with the custom editor (`workbench.editorAssociations`, so the
   editor's `priority` does not matter), turn off telemetry, updates, the start page, tips,
   experiments, the chat, auto save, Git and the OS's automatic color scheme and high contrast, and
   dispatch keys by key code (`keyboard.dispatch: keyCode`). Extension updates are off with
   `extensions.autoUpdate: "off"` (0.4.1; `false` before, which VS Code 1.125 and later migrate by
   rewriting `settings.json` themselves, and that rewrite could undo a theme switch). The
   environment drops `VSCODE_*` and `ELECTRON_RUN_AS_NODE`. The window's content size becomes
   `windowSize`.
3. **open**: the webview frame of the extension (`iframe.webview` whose URL names `extensionId`),
   then its `#active-frame`; waits for `[data-chrome="menu"]`, then `ready`, and checks that every
   island of `chrome` is visible. It records the canvas: shapes, connections and every shape's
   position. When VS Code shows the fixture as text instead (the custom editor was not registered
   yet when VS Code opened it, seen on the first start of a fresh download), the driver closes that
   editor and opens the fixture again from the Explorer, every 2 s until the custom editor shows.
   When the extension fails to activate, the step fails at once and quotes VS Code's error from the
   extension host log (`exthost.log`: "Activating extension <id> failed due to an error: Error:
   Cannot find module …"). What the extension's webview reports is in none of VS Code's logs, so
   the driver (0.6.0) collects it from the first window on: Playwright's `pageerror` (uncaught
   exceptions and unhandled rejections) and its `console` messages of type `error` (`console.error`
   calls, a file that failed to load, a CSP block), which Playwright reports for every frame of the
   window, VS Code's two webview frames included. An error counts when its console location, or
   the topmost frame of its stack, is a file of the extension's folder
   (`https://file+.vscode-resource.vscode-cdn.net/<folder>/…`, the folder as given or its real
   path) or a document of its webview (`vscode-webview://…?…&extensionId=<id>…`); the workbench's
   own errors and those of other webviews do not. Only an uncaught error ends a wait early, a
   console error does not. Once the webview has thrown, the step does not wait for `timeoutMs`: it
   fails when the menu is still missing 3 s later ("the custom editor never showed the shell's
   menu, still missing 3 s after its webview threw"); a webview that never shows otherwise fails
   after `timeoutMs`. Each of these failures names the webview frames the workbench has, with a
   `screenshotDir` `<name>-open-failure.png`, and `keepTemporaryFiles`, which keeps VS Code's logs.
   The modelers mount the menu before their document arrives, so a webview that throws while it
   imports the fixture still shows the menu. `ready`, the default and a modeler's own, then fails
   once the canvas shows no shape 3 s after the throw and 3 s after `ready` began ("the canvas shows
   no element of the fixture 3 s after its webview threw"); a canvas with a shape waits for `ready`
   as before. Every failure of the step (no menu, `ready`, a missing island, a Playwright error)
   ends with the webview's errors: how many of each kind, then the first three, the uncaught ones
   first, each with its stack (12 lines at most) on indented lines of its own:

   ```text
   open: the custom editor never showed the shell's menu, still missing 3 s after its webview threw (1 webview frames in the workbench, 1 of miragon-gmbh.event-storming-modeler, screenshot …/event-storming-open-failure.png; keepTemporaryFiles keeps VS Code's logs); the webview reported 1 uncaught error and 1 console error:
       uncaught TypeError: Cannot read properties of undefined (reading 'lanes')
           at https://file+.vscode-resource.vscode-cdn.net/…/extension/dist/webview.js:406:113575
           at https://file+.vscode-resource.vscode-cdn.net/…/extension/dist/webview.js:408:2480
       console.error: Failed to load resource: net::ERR_FILE_NOT_FOUND
           at https://file+.vscode-resource.vscode-cdn.net/…/extension/dist/webview.css:1:1
   ```

4. **edit**: `edit`, then the editor tab turns dirty (the document changed).
5. **save** (0.3.1): the platform's save key; the tab turns clean, then the driver reads the file
   until it holds still: a read counts once two reads 100 ms apart see the same size, mtime and text
   and that text differs from the fixture. The clean tab is what makes the read complete: VS Code
   truncates the file before it writes it, so a read during the write can be empty or cut short, and
   it clears the dirty state only once the write has resolved. The two reads only add a margin (for a
   save that reports success before its write is visible); on their own they cannot tell a pause
   inside a write from its end. `parse` gets that text; a text it rejects is read again, and the step
   fails only when the rejected text stays unchanged for 1 s: "the saved text does not parse: <the
   parser's first line> (<bytes> bytes on disk, unchanged for <ms> ms)". A file that never changes
   fails with "<save key> wrote nothing to disk"; a tab that stays dirty adds "the editor is still
   dirty after the save" and the disk gets one more second instead of another `timeoutMs`.
6. **undo**: the platform's undo key `undoSteps` times; the canvas shows what it showed before the
   edit (same shapes, connections and positions), and saved again, the file holds the fixture's
   exact text.
7. **themes**: per color theme, the driver writes `workbench.colorTheme` into the settings file
   (VS Code watches it, as for a user's change), waits for `.monaco-workbench` to carry the theme's
   class, for the webview's `<body>` classes and for `<html>` to show
   `expectedWebviewAppearance(kind, themes)` without the shell's transition stop, then checks the
   chrome and takes the screenshot (CSS pixels, so the same size on every machine). Before the first
   theme it blurs the webview, so the canvas's focus ring of the keyboard edit is not in the
   pictures. Now and then VS Code does not switch on such a write and keeps the previous theme
   (0.4.1): when the workbench has not switched 2 s after the write, the driver writes the setting
   again; 2 s later it writes a default theme of neither the requested nor the shown kind, waits
   for the workbench to show it (until 2 s before the end of `timeoutMs`, so that a slow VS Code
   cannot show it after the way back) and writes the requested theme once more. When the workbench
   never showed that detour, the requested theme counts only if the workbench still shows it at the
   end of `timeoutMs`. All of it stays within one `timeoutMs`, counted from the first write, after
   which the theme fails with the theme requested and the one the workbench shows: "themes: Default
   High Contrast Light: the workbench never switched (no .hc-light): requested Default High Contrast
   Light, VS Code shows Default High Contrast (.hc-black.vscode-theme-defaults-themes-hc_black-json)
   after 30.0 s, though the driver wrote the setting 4 times (…)". Every retry is in the log
   ("themes: Default Dark Modern: the workbench still shows … after 2.0 s, writing the setting
   again"). A modeler's own retry of a missed theme switch is no longer needed.
8. **close**: `app.close()`; a VS Code that has not quit after 10 s (a modal dialog) is killed. The
   temporary directory goes, unless `keepTemporaryFiles`, also when Ctrl+C ends the test process
   in the middle of a run.

`runVsCodeSmoke` never throws for a failed check: everything broken is in `failures`, prefixed with
its step. It throws for options it cannot run with (no `package.json`, no custom editor for the
fixture, an extension whose `main` is not built, that is, `require` would not find it, a fixture
name with a path or glob characters) and when a peer is missing. `createFromPalette`, the default
`edit`, is the keyboard path of the shell's palette (guide §5.5): it focuses the first enabled entry
outside the tools group that is not a `-tool`, presses Enter, waits for one more shape and presses
Escape for the label editor a creation opens. An `edit` of one's own drives `context.webview` with
locators (`click`, `dblclick`, `fill`) and `context.page.keyboard`, and leaves no label editor open.

```ts
// apps/vscode/test-smoke/vscode-smoke.test.ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { parseDSLWithDiagnostics } from "@miragon/event-storming-dsl";
import { formatVsCodeSmoke, runVsCodeSmoke } from "@miragon/modeler-shell/testing/vscode-electron";

// the first run downloads VS Code: about 320 to 360 MB, about 0.9 GB unpacked per version
it("Event Storming in a real VS Code", { timeout: 600_000 }, async () => {
  const result = await runVsCodeSmoke({
    extensionPath: fileURLToPath(new URL("..", import.meta.url)), // built: npm run build:vscode
    fixture: {
      fileName: "order-checkout.storm",
      text: await readFile("example/order-checkout.storm", "utf8"),
    },
    parse(text) {
      const { diagnostics } = parseDSLWithDiagnostics(text);
      if (diagnostics.length > 0)
        throw new Error(diagnostics.map((d) => `${d.line}: ${d.message}`).join("; "));
    },
    themes: ["light"], // as the extension passes them to connectThemeBridge
    screenshotDir: "test-results/vscode-smoke",
    log: console.log,
  });
  console.log(formatVsCodeSmoke(result));
  expect(result.failures).toEqual([]);
});
```

Run it on its own (`vitest run --config apps/vscode/test-smoke/vitest.config.ts`, with
`fileParallelism: false`), not in the unit project: it needs a display and the extension's build.
How to run it on macOS and in Linux CI, and why the driver works the way it does, is in the
[README](README.md#smoke-tests-in-a-real-vs-code) and the
[implementation notes](../../docs/shell/implementation-notes.md#vs-code-smoke-tests-in-a-real-vs-code).

#### In Docker (0.3.1)

`modeler-shell-vscode-docker`, the package's command, runs a modeler's smoke test in a Linux
container under `xvfb-run -a`, so no VS Code window opens on the host (on macOS every run would take
the focus). A modeler adds `"test:vscode:docker": "modeler-shell-vscode-docker"`; the host needs Node
and Docker, not the peers. `runVsCodeSmokeInDocker` is the same from a script of one's own, the rest
are its building blocks.

```text
modeler-shell-vscode-docker [options] [-- <command> [arguments]]
  --script <name>         the npm script to run (default: test:vscode)
  --results <directory>   copied back, relative to the repository (default: test-results/vscode-smoke)
  --env <NAME[=value]>    into the container's environment, the value from here when it has none (repeatable)
  --node <version>        the Node.js version of the image (default: the Node.js that runs the command)
  --image <name>          an image of one's own instead of the built one
  --platform <platform>   docker --platform, e.g. linux/amd64 (default: the Docker host's)
  --rebuild               build the image again
  -h, --help
```

```ts
interface VsCodeSmokeDockerOptions {
  cwd?: string; // default process.cwd(); the root is the nearest directory upwards with a package-lock.json
  command?: readonly string[]; // under xvfb-run -a after npm ci; default ["npm", "run", "test:vscode"]
  results?: string; // inside the root; default "test-results/vscode-smoke"
  nodeVersion?: string; // the image's Node; default process.versions.node
  env?: Record<string, string>; // into the container
  image?: string; // one's own image (with bash, tar, Node and npm, xvfb-run); builds none
  platform?: string; // docker --platform
  rebuild?: boolean; // build the image even when it exists
  docker?: string; // the Docker CLI; default "docker"
  log?: (line: string) => void; // default console.log
}
interface VsCodeSmokeDockerResult {
  exitCode: number; // the command's in the container; npm ci failing: 1
  image: string;
  root: string; // the repository root on the host
  results: string; // the results directory on the host, absolute
  timings: { image: number; run: number }; // ms; image 0 when it existed
}
function runVsCodeSmokeInDocker(
  options?: VsCodeSmokeDockerOptions,
): Promise<VsCodeSmokeDockerResult>;

// FROM node:<version>-bookworm-slim; apt-get install --no-install-recommends of the packages below
function vsCodeSmokeDockerfile(nodeVersion: string): string;
// "modeler-shell-vscode-smoke:node<version>-<first 12 hex of the Dockerfile's SHA-256>", with a
// platform "-<platform, / as ->" at the end ("…-linux-amd64"): one tag holds one platform's image
function vsCodeSmokeDockerImage(nodeVersion: string, platform?: string): string;
// Xvfb, xauth, Electron's libraries (GTK 3, NSS, GBM, ALSA, libsecret, libxkbfile, …), fonts, unzip, git
const VSCODE_SMOKE_DOCKER_PACKAGES: readonly string[];
// shared by every run on the machine: VS Code's downloads (the container's ~/.cache) and npm's cache
const VSCODE_SMOKE_DOCKER_VOLUMES: {
  cache: "modeler-shell-vscode-cache";
  npm: "modeler-shell-npm-cache";
};
interface VsCodeSmokeDockerRunOptions {
  image: string;
  root: string; // absolute, on the host
  workdir: string; // where the command runs, relative to the root; "" for the root
  results: string; // relative to the root
  command: readonly string[];
  env?: Record<string, string>;
  platform?: string;
  hostUser?: { uid: number; gid: number }; // gets the results; none on Windows
}
// the arguments after "docker"
function vsCodeSmokeDockerRunArgs(options: VsCodeSmokeDockerRunOptions): string[];
```

A run of `runVsCodeSmokeInDocker`:

1. **Docker.** `docker version` must answer, otherwise it throws "Docker is not available (<docker's
   message>): install and start Docker Desktop or Docker Engine". It throws as well without a
   `package-lock.json` in `cwd` or above and for a results directory outside the root or the root
   itself, compared with its symlinks resolved (an absolute path through `/tmp`, which is
   `/private/tmp` on macOS, is inside; a symlink in the repository that leads out of it is not).
2. **Image.** Without `image`: `docker image inspect` of
   `vsCodeSmokeDockerImage(nodeVersion, platform)`, and when it is missing (or `rebuild`)
   `docker build [--platform <platform>] --tag <image> -` with `vsCodeSmokeDockerfile` on stdin; no
   build context. The hash in the tag builds a new image when a release changes the recipe. A
   `platform` gets an image of its own (the tag ends in `-linux-amd64`): a tag holds one platform's
   image, and `docker run --platform` with a tag that holds another platform's tries to pull it. A
   failed build names the base image `node:<version>-bookworm-slim` and `--node`, for a Node version
   Docker Hub has no such image of.
3. **Results directory.** The default `test-results/vscode-smoke`, the smoke test's own, is emptied,
   as are directories an earlier run created (they hold the marker `.modeler-shell-vscode-docker`); a
   missing or empty one is created with the marker; any other directory with files is left as it is
   and the run's files land next to them.
4. **Container.** `docker run` with `vsCodeSmokeDockerRunArgs`: `--rm`, `--init` (reaps VS Code's
   processes, passes Ctrl+C on), `--shm-size=1g` (Chromium's shared memory; Docker's 64 MB default
   crashes renderers), the root read-only at `/repo`, the results directory at `/results`, the two
   volumes at `/root/.cache` and `/root/.npm`, and `SMOKE_RESULTS`, `SMOKE_WORKDIR`, `HOST_UID`,
   `HOST_GID`, `TMPDIR=/tmp/vscode-smoke`, `HUSKY=0` and `TINI_KILL_PROCESS_GROUP=1` (Ctrl+C reaches
   every process of the run, not only the script) next to `env`. Inside, a bash script copies
   `/repo` to `/work` without `node_modules`, `.git`, `.vscode-test` and the results, runs
   `npm ci --no-audit --no-fund` (its log's last 40 lines on failure), then the command in the
   working directory under `xvfb-run -a -s "-screen 0 1920x1200x24"`, copies the results and every
   kept VS Code log directory (`$TMPDIR/modeler-shell-vscode-*/user-data/logs`, to
   `vscode-logs/<run>/`) to `/results`, gives them to the host's user and exits with the command's
   code. Every phase logs its duration (`[vscode-docker] npm ci in 4 s`).

The driver needs nothing special in the container: Linux keys (`Control+s`), its default cache path
under `~/.cache` (the volume), VS Code's `linux-arm64` or `linux-x64` build by the container's
architecture. Keep that default `cachePath` for Docker runs. The copy leaves out only
`.vscode-test`: a test with its `cachePath` there downloads VS Code on every run, because the copy
starts without it. Any other `cachePath` inside the repository is copied in on every run with the
host's VS Code builds (about 1 GB per version), and the container still downloads its Linux build
into the copy, which the run then throws away.

## `./shell.css`

One stylesheet for everything above, loaded last. Containment: `.cd-shell { container: cd-shell /
size }`; breakpoints are `@container cd-shell (max-width: 760px)`, `(max-width: 440px)` with literal
values (custom properties are not allowed in container conditions), sizes inside are `cqw`/`cqh`,
never viewport units, and no element inside gets a `container-type` of its own. It covers glass
islands (`color-mix(in srgb, var(--cd-ui-flaeche-hoch) var(--cd-ui-chrome-deckkraft), transparent)`
with `backdrop-filter: blur(8px)`), opaque popups, focus rings (inset in dense containers),
`[data-cd-kontrast="hoch"]` (no shadows, 3px focus), `@media (forced-colors: active)` (rings in
`Highlight`, status bar and island borders in `CanvasText`), `prefers-reduced-motion` and
`html.cd-shell-reduce-motion`, `html.cd-shell-no-transition` (no transitions for the frame of a mode
switch), the canvas `<svg>`'s focus ring (2px, 3px in high contrast, inside the slot), and under
`html.cd-shell-document` the own-document reset: no body padding, `--cd-ui-grund` background, Geist
13px/1.5, own `kbd`, `code`, links, focus and scrollbars, never `var(--vscode-*)`. The reset is
unlayered, so it wins over VS Code's `@layer vscode-default`; its button and field font reset has
zero specificity, so the chrome's own rules (the readout's 13px/600) win over it. In a foreign page
the chrome's own islands, controls and texts reset font, colour, letter spacing and text transform
at class specificity, so the page's element rules (`button { text-transform: uppercase }`,
`p { font-size: 18px }`) do not reach them. The canvas slot's layout (`.cd-shell >
.cd-shell-canvas`: absolute, `inset: 0`, layer 0, `isolation: isolate`) wins over a renderer's own
container class, its paint (`background-color: var(--cd-ui-grund)`) has zero specificity, so a
renderer's paper (Event Storming's dot grid) shows. The paper's colour stays `--cd-ui-grund` in
every mode, the dot grid being a background image in `--cd-ui-linie` (§10.1); the kit's `appearance`
case checks the painted colour. Palette tool entries set their colour in every
state (rest and pressed `--cd-ui-text`, hovered `--cd-ui-interaktion`, read-only
`--cd-ui-text-leise`), and their icons (`> svg`, `::before`) inherit it, so a renderer's or
diagram-js's rule on the icon or on the stale `highlighted-entry` does not leak in; notation
previews keep their own colours (§5.5). Private helper properties are named `--modeler-shell-*`.

It is assembled from `dom/shell-dom.css` (0.1 chrome), `dom/buttons.css` (0.2: the buttons of the
web chrome, the one place with fixed palette tokens, see [Buttons](#buttons)), `dom/web/web.css`
(0.2: primary action, legal line, empty state, drop zone, raised zoom row) and
`dom/feedback/feedback.css` (0.2: toasts and the problems popover; they render in a foreign page too,
so they reset the page's element rules like the 0.1 islands), then `diagram-js/palette.css`. A test
pins that `shell.css` imports every stylesheet of `src`.

The shell bundles no font: the modeler loads Geist and Geist Mono (`@fontsource-variable/geist`,
`@fontsource-variable/geist-mono`), as the stylesheet order above shows, as font files (see
`./vscode/extension`).

## Usage: Event Storming in VS Code

The Event Storming extension, the pilot of 0.1. Extension host
(`EventStormingEditorProvider.resolveCustomTextEditor`):

```ts
import * as vscode from "vscode";
import {
  connectThemeBridge,
  currentAppearance,
  renderWebviewHtml,
  revealFileLabel,
} from "@miragon/modeler-shell/vscode/extension";

const THEMES = ["light"] as const; // until the shared dark-mode release of all modelers

// activate(): a hidden tab keeps document, view and selection (and reports 0 × 0 meanwhile)
vscode.window.registerCustomEditorProvider(viewType, provider, {
  webviewOptions: { retainContextWhenHidden: true },
});

// resolveCustomTextEditor():
const dist = vscode.Uri.joinPath(extensionUri, "dist");
webview.options = { enableScripts: true, localResourceRoots: [dist] }; // webview.js, webview.css, fonts/
const asset = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(dist, file)).toString();
webview.html = renderWebviewHtml({
  cspSource: webview.cspSource,
  scriptUri: asset("webview.js"),
  styleUris: [asset("webview.css")],
  title: "Event Storming Board",
  lang: "en",
  appearance: currentAppearance(vscode, { themes: THEMES }),
});
connectThemeBridge(vscode, webviewPanel, { themes: THEMES }); // disposes itself with the panel

// after an export (exportImage.ts):
const reveal = revealFileLabel(process.platform);
if ((await vscode.window.showInformationMessage(`Exported ${name}.`, reveal)) === reveal) {
  void vscode.commands.executeCommand("revealFileInOS", target);
}
```

The two bundles (`esbuild.config.mjs`):

```js
const host = {
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20", // VS Code 1.90 or later: the global crypto of createNonce
  external: ["vscode"],
};
const web = {
  entryPoints: ["src/webview/main.ts"],
  outfile: "dist/webview.js", // and dist/webview.css
  bundle: true,
  platform: "browser",
  format: "iife", // renderWebviewHtml writes a classic <script nonce>
  loader: { ".woff2": "file", ".woff": "file" }, // font files: a page loads only the subsets it needs
  assetNames: "fonts/[name]-[hash]",
};
```

Webview (`src/webview/main.ts`):

```ts
import "./zod-jitless"; // first: z.config({ jitless: true }) before any schema module (CSP)
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
// the renderer's stylesheet brings diagram-js.css and the tokens, so they are not imported again
import {
  createCollaborativeModeler,
  type BoardBounds,
  type EventStormingReadOnly,
  type EventStormingViewOptions,
} from "@miragon/event-storming-renderer";
import "./style.css"; // the modeler's own content: the "Keyboard shortcuts…" dialog
import "@miragon/modeler-shell/shell.css";
import { INVALID_STATUS_DELAY_MS } from "@miragon/modeler-shell";
import { connectDiagramJs, shellModule } from "@miragon/modeler-shell/diagram-js";
import {
  mountVsCodeShell,
  persistView,
  readShellState,
} from "@miragon/modeler-shell/vscode/webview";
import { createShortcutsDialog } from "./shortcutsDialog";

const vscode = acquireVsCodeApi();
const stored = readShellState(vscode);

// 1. The diagram first: Event Storming's keyboard listens on document and must run before the
//    shell's, and the renderer builds its diagram lazily, so get() a service. width/height: the
//    shell's slot sizes it.
const collaborative = createCollaborativeModeler({
  additionalModules: [shellModule],
  // VS Code's document history owns Cmd/Ctrl+Z (§13.5); the kit's keys case checks it
  undoRedoKeys: false,
  // where Enter or Space on a creating palette entry places the element (§5.5): the renderer takes
  // the fit insets and computes the centre of the free rectangle itself, the same point as
  // viewport.freeRectCenter(); a renderer may take that function instead
  freeRectInsets: () => shell.fitInsets(),
});
const modeler = collaborative.diagram;
modeler.get("canvas");
const viewOptions = modeler.get<EventStormingViewOptions>("eventStormingViewOptions");
const levels = modeler.get<{ getLevel(): string; setLevel(level: string): void }>(
  "eventStormingModeling",
);
// the canvas lock of an invalid file: context pad, move, resize, delete, paste, label editor
const canvasLock = modeler.get<EventStormingReadOnly>("eventStormingReadOnly");
const boardBounds = modeler.get<BoardBounds>("boardBounds");

// 2. The chrome around it.
const shell = mountVsCodeShell(document.getElementById("app")!, {
  themes: ["light"],
  canvas: modeler.container,
  messages: { canvas: "Event Storming board" },
  menu: {
    model: [
      {
        kind: "radio",
        id: "level",
        label: "Level",
        options: [
          { value: "big-picture", label: "Big picture" },
          { value: "process", label: "Process modeling" },
          { value: "design", label: "Software design" },
        ],
        value: () => levels.getLevel(),
        onSelect: (level) => levels.setLevel(level),
      },
      {
        kind: "checkbox",
        id: "type-captions",
        label: "Type captions",
        keepEnabledWhenReadOnly: true, // a view toggle, not board content: usable while read-only
        checked: () => viewOptions.typeCaptionsVisible(),
        onToggle: (visible) => viewOptions.setTypeCaptionsVisible(visible),
      },
    ],
    export: [
      {
        kind: "action",
        id: "export-png",
        label: "Export as PNG",
        icon: "file-image",
        onSelect: () => void exportPng(),
      },
      {
        kind: "action",
        id: "export-svg",
        label: "Export as SVG",
        icon: "file-code-corner",
        onSelect: () => void exportSvg(),
      },
    ],
    help: [
      {
        kind: "dialog",
        id: "keyboard-shortcuts",
        label: "Keyboard shortcuts…",
        icon: "keyboard",
        onSelect: () => shortcutsDialog.open(),
      },
    ],
  },
  problems: { onActivate: () => vscode.postMessage({ type: "showProblems" }) },
  emptyHint: { onInsertExample: () => vscode.postMessage({ type: "insertExample" }) },
});
// The modeler's own dialog in shell.root (see Modeler dialogs); it goes with the diagram.
const shortcutsDialog = createShortcutsDialog(shell);
modeler.on("diagram.destroy", () => shortcutsDialog.destroy());

// 3. Viewport, palette, keys and the empty-file hint. Cheap tests only: canFit() is cached, but
//    exportMap() validates the whole board.
const registry = modeler.get<{ getAll(): Array<{ parent?: unknown; waypoints?: unknown }> }>(
  "elementRegistry",
);
const isEmpty = () => !registry.getAll().some((element) => element.parent && !element.waypoints); // §13.5
const connection = connectDiagramJs(shell, modeler, {
  isEmpty,
  // no padding of its own (the default pads by 120px): the fit insets are the only margin (§5.9)
  contentBounds: () => (isEmpty() ? undefined : boardBounds.contentBounds(0)),
});
const { viewport } = connection;
persistView(vscode, viewport); // vscode.setState once the view rested, not on every frame
modeler.on("commandStack.changed", () => shell.menu.refresh()); // level undo/redo

// 4. Every import from the document (init and external updates), strictly one after another.
async function importText(text: string, first: boolean): Promise<void> {
  const keep = first ? undefined : viewport.getViewbox();
  try {
    await collaborative.importText(text); // silent: no change event comes from an import
    canvasLock.setReadOnly(false);
    shell.setReadOnly(false);
    shell.setStatus(null);
    if (keep) viewport.restore(keep);
    else if (first && stored.view) viewport.setState(stored.view);
    viewport.afterImport(); // first content fits, an empty file shows 100 %, the hint follows import.done
    shell.menu.refresh();
  } catch {
    // locked at once, the canvas included; marks and status box show after 800ms without a valid import
    canvasLock.setReadOnly(true);
    shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS });
    shell.setStatus(
      { severity: "danger", text: shell.messages.invalidFile("Event Storming board") },
      { delayMs: INVALID_STATUS_DELAY_MS },
    );
  }
}
let imports = Promise.resolve();
const enqueueImport = (text: string, first = false) =>
  (imports = imports.then(() => importText(text, first)));

// 5. Messages from the extension: the document, the diagnostics and the Command Palette commands,
//    which run the same handlers as the menu.
let firstImportSettled = () => {};
const ready = new Promise<void>((resolve) => (firstImportSettled = resolve));
window.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type === "init") void enqueueImport(message.text, true).then(firstImportSettled);
  if (message?.type === "update") void enqueueImport(message.text);
  if (message?.type === "problems")
    shell.setProblems({ count: message.count, errors: message.errors });
  if (message?.type === "command" && message.name === "fitView") viewport.fit();
});
vscode.postMessage({ type: "ready" });

// For the e2e test page (see ./testing/vscode-stub); the bundle publishes nothing on window.
export const webview = { shell, modeler: collaborative, connection, ready };
```

`zod-jitless.ts` is one line, `config({ jitless: true })` from `zod`, in a module of its own so that
it runs before any module that builds a schema.

A modeler with a legend persists it the same way: `legend: { render, open: stored.legendOpen,
onToggle: (open) => writeShellState(vscode, { legendOpen: open }) }`.

What the Event Storming renderer changes for the shell (the kit's `aria`, `keys`, `create` and
`readOnly` cases check each one):

- palette entries carry `title` and `shortcut` separately (`title: "Domain event", shortcut: "E"`),
  not `"Domain event — E"`;
- Enter or Space on a creating entry (a click with `detail === 0`) creates the sticky at the
  centre of the free rectangle (from `freeRectInsets`, the point `viewport.freeRectCenter()`
  returns), 24px further diagonally while that spot is taken, selects it, focuses the canvas and
  opens the label editor;
- no `tabindex` on `canvas.getContainer()` (an extra, unnamed tab stop before the palette); its
  keyboard listens on `document` anyway;
- the document keyboard returns early on `event.defaultPrevented` and for targets outside the canvas
  container (the zoom panel's buttons, the inspector), selects every element on Cmd/Ctrl+A, and in
  the webview binds no Cmd/Ctrl+Z, Shift+Z or Y (`undoRedoKeys: false`): VS Code's document history
  owns undo (§13.5), the shell only keeps diagram-js's `KeyboardBindings` off them;
- `eventStormingReadOnly` locks every edit rule (move, resize, create, connect, delete), and the
  keyboard, context pad, label editor and drawing handles consult it;
- its own overlays inside the canvas (the note toolbar, the colour picker) stay at `z-index` 100 or
  below, so the palette at 110 covers them (see Layers above);
- `boardBounds.contentBounds(0)`: the tight bounds of the board, since the fit insets are the margin.

Document sync, echo suppression, minimal edits and undo stay in the modeler for 0.1 (see below).

## Usage: Event Storming in the web app

The Event Storming web app (`apps/webapp`), the pilot of 0.2. It is light-only until the shared
dark-mode release, so its `index.html` is static and its head carries the contrast line only:

```html
<!doctype html>
<html lang="en" data-cd-theme="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <!-- miragon-mode: webHeadMarkup({ themes: ["light"], themeColors }) through transformIndexHtml -->
    <title>Event Storming Modeler</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`, shortened to what touches the shell (the real file is
`modelers/event-storming/apps/webapp/src/main.ts` in Miragon/modeler-suite):

```ts
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@miragon/event-storming-renderer/assets/event-storming.css"; // the tokens, diagram-js.css
import "@miragon/modeler-shell/shell.css"; // last
import {
  Modeler,
  boardMenu,
  createShortcutsDialog,
  importWarningText,
  type ImportWarning,
} from "@miragon/event-storming-renderer";
import {
  commandKeyLabel,
  defaultMessages,
  detectPlatform,
  mountShell,
  problemSummary,
} from "@miragon/modeler-shell";
import { connectDiagramJs, shellModule } from "@miragon/modeler-shell/diagram-js";
import { copyTextWhenReady } from "./clipboard"; // ClipboardItem with a promise: Safari keeps the gesture
import { hashHoldsBoard, readHashMap, shareUrl, writeHashMap } from "./share";
import { THEMES } from "./themes"; // ["light"]

// 1. The diagram first (its keyboard listens on document); the web app keeps the canvas undo keys.
const modeler = new Modeler({
  width: "100%",
  height: "100%",
  additionalModules: [shellModule],
  freeRectInsets: () => shell.fitInsets(), // keyboard creation lands in the free rectangle
});
modeler.get("canvas");
const platform = detectPlatform(navigator);
const openKey = commandKeyLabel("O", platform, defaultMessages.keyNames); // "⌘O" / "Ctrl+O"
const saveKey = commandKeyLabel("S", platform, defaultMessages.keyNames);

// 2. The chrome, the whole web column.
const shell = mountShell(document.getElementById("app")!, {
  host: "web",
  canvas: modeler.container,
  lang: "en",
  platform,
  themes: THEMES,
  messages: { canvas: "Event Storming board" },
  primary: { onSelect: () => share() }, // "Share", share-2
  legal: {
    links: [
      {
        label: "GitHub",
        href: "https://github.com/Miragon/modeler-suite/tree/main/modelers/event-storming",
      },
    ],
  },
  file: {
    newDiagram: { onSelect: () => void newDiagram() },
    open: { onSelect: () => pickFile(), shortcut: openKey }, // also the start screen's "Open a file…"
    showExample: { onSelect: () => void showExample() },
  },
  // Model (level, type captions), Export and Help: the same entries the VS Code webview shows.
  menu: boardMenu({
    levels,
    typeCaptions,
    exports: {
      png: { onSelect: () => void exportPicture("png") },
      svg: { onSelect: () => void exportPicture("svg") },
      transparentPng: { onSelect: () => void exportPicture("png-transparent") },
      json: { onSelect: () => exportBoardText("json") },
      storm: { onSelect: () => exportBoardText("storm"), shortcut: saveKey },
    },
    showKeyboardShortcuts: () => shortcutsDialog.open(),
  }),
  problems: { onSelectItem: (item) => selectElement(item.elementId) },
  emptyState: {
    title: "Event Storming Modeler",
    text: "Start a new diagram, or explore the example.",
    komet: "/miragon-komet-blau.svg", // vendored unchanged from corporate-identity
    onNewDiagram: () => void newDiagram(),
    onShowExample: () => void showExample(),
    dropHint: "Or drop a .storm, .json, or .txt file here", // the types the reject toast names
  },
  dropZone: {
    accept: [".storm", ".json", ".txt", "application/json", "text/plain"],
    onDrop: ([file]) => file && void openBoardFile(file),
  },
});
const shortcutsDialog = createShortcutsDialog(shell, { fileKeys: true });

// 3. Viewport, palette, keys.
const { viewport } = connectDiagramJs(shell, modeler, {
  isEmpty,
  contentBounds: () => (isEmpty() ? undefined : boardBounds.contentBounds(0)),
});

// 4. Every new document opens like the first (§5.9); the start screen goes with it.
async function openDocument(load: () => Promise<readonly ImportWarning[]>, announce: boolean) {
  viewport.newDocument();
  let warnings: readonly ImportWarning[];
  try {
    warnings = await load();
  } finally {
    viewport.afterImport();
  }
  shell.setEmptyState(false);
  shell.menu.refresh();
  updateDocumentTitle(); // "Order Checkout · Event Storming Modeler" (§5.4)
  // The parser names lines: "Line 4 · A -> Nowhere" below the message, no element to select.
  shell.setProblems(problemSummary(problemItems(warnings)));
  for (const warning of warnings) console.warn(importWarningText(warning));
  // A toast only after an import the user started, with the count (§9), never on a restore.
  if (announce && warnings.length > 0) {
    const pill = shell.messages.problems(warnings.length, String(warnings.length));
    shell.toast({
      status: "warning",
      text: `Imported with ${warnings.length} warnings. Details under “${pill}” bottom left.`,
    });
  }
}

// Replacing a board clears the canvas history, so instead of confirm() it offers the board back
// (§9 asks for a confirmation; the undo toast is the open guide question): "Board replaced · Undo",
// also on Cmd/Ctrl+Z while the canvas has nothing else to undo. An edit withdraws the offer.
async function replaceBoard(load: () => Promise<readonly ImportWarning[]>) {
  const previous = boardIsEmpty() ? undefined : modeler.exportDSL();
  await openDocument(load, true);
  withdrawReplaceUndo();
  if (previous === undefined || previous === modeler.exportDSL()) return;
  const undo = () =>
    void openDocument(async () => (await modeler.importDSL(previous)).warnings, false);
  replaceUndo = {
    toast: shell.toast({
      status: "info",
      text: "Board replaced",
      action: { label: "Undo", onSelect: undo },
    }),
    undo,
  };
}

// Copy inside the click: Safari drops the user activation at the first await before writeText.
function share(): void {
  const dsl = modeler.exportDSL();
  const copied = copyTextWhenReady(shareUrl(dsl));
  void (async () => {
    try {
      await writeHashMap(dsl);
      await copied;
      shell.toast({ status: "success", text: "Link copied" });
    } catch {
      shell.toast({
        status: "danger",
        text: "Couldn't copy the link. Copy it from the address bar instead.",
      });
    }
  })();
}

// The app's own keys: Cmd/Ctrl+O opens a file, Cmd/Ctrl+S exports the .storm file (never the
// browser's dialogs, also not over a modal dialog; on the start screen there is nothing to save).
window.addEventListener("keydown", onAppKey);

modeler.on("commandStack.changed", (event: { trigger?: string }) => {
  if (event.trigger !== "clear") {
    shell.setEmptyState(false); // the first edit is a start as well
    withdrawReplaceUndo(); // an edit makes the undo offer stale
  }
  shell.menu.refresh(); // the level is undoable
  updateDocumentTitle();
});

// 5. Start: the board from the link, else the start screen on an empty board.
const linked = await readHashMap();
if (linked !== null)
  await openDocument(async () => (await modeler.importDSL(linked)).warnings, true);
else {
  await modeler.importMap(createEmptyBoard("New board"));
  viewport.afterImport(); // an empty board at 100 %
  shell.setEmptyState(true);
  if (hashHoldsBoard())
    shell.toast({
      status: "danger",
      text: "Couldn't read the board in this link. Check that you copied the whole link.",
    });
}
```

`openBoardFile(file)` reads the file before the canvas is touched and then runs `replaceBoard`; a
parse error shows the danger toast "Couldn't read “name”. Check that it contains a valid Event
Storming board." and keeps the board. `pickFile` opens the hidden file input with the same
`accept`. The JSON export writes `JSON.stringify(modeler.exportMap(), null, 2)`, the board's own
element order (the importer stacks overlapping stickies by it). The web app's own `style.css`,
`toast.ts` and the hand-written menu, zoom, fit and legal markup go away.

## Out of scope for 0.3

Later candidates unless noted:

- **VS Code document plumbing**: two-way sync with echo suppression, minimal `WorkspaceEdit`s,
  undo/redo through the document's history, "Insert example" as one edit, diagnostics to the
  Problems view (the pill only means something with a `DiagnosticCollection`), shared webview→host
  messages for the pill ("Show in Problems view") and "Insert example" with their host handlers,
  export save dialog. The modelers keep their own code; the shell keeps diagram-js's
  `KeyboardBindings` off undo/redo in the IDE host, stops undo/redo keys in text fields and stops
  keys the canvas handled.
- An ES-module webview bundle (`renderWebviewHtml` writes a classic script; a `scriptType` option).
- **More of the web column**: further top-right actions left of the primary action (§5.7), the
  loading state (§9 "Laden": spinner or skeleton during asynchronous work), share-link helpers
  (each modeler keeps its own hash encoding), the legend's state across sessions (a modeler persists
  it from `legend.onToggle` in `localStorage`, §5.10).
- **Dialog component and the shared shortcuts dialog** (§5.4, §8; also the confirmation of §9
  "Destruktiv" where an undo toast does not fit): an exported `cd-shell-dialog`
  class (panel, header with Close, body, backdrop with `grayscale(1)`, the high-contrast and
  forced-colours rules, the top layer through `showModal()`, focus trap and focus return), and on
  it `shell.showShortcutsDialog(groups: ShortcutGroup[])` with one table per group and the chips of
  the tooltip's `kbd`. The shell fills the View group itself from the chrome keys. New
  `ShellMessages`: `shortcutsTitle` ("Keyboard shortcuts") and the group names
  "View", "Edit" and "Tools". Popovers (§5.4) follow on the same class. Until then a modeler meets
  the rules of [Modeler dialogs](#modeler-dialogs) itself; one component lets every modeler migrate
  once.
- **Placement helper** for palette keyboard creation: the 24px diagonal steps when the centre of the
  free rectangle is taken (§5.5), next to `Viewport.freeRectCenter()`.
- the `appearance` surface of the modeler-api contract (a later 1.x minor) for embedded hosts and
  the `miragon.<modeler>.colorTheme` setting UI (the bridge already honours `settingKey`).
- **Kit** (the cases for reduced motion, forced colours and the canvas's overlay layers joined it
  after 0.5.0, the `csp` case in 0.6):
  - a harness field `documents?: readonly string[]` that hands `open` a document key (for example
    `["example", "style-dark", "empty"]`), so `appearance` runs per document; until then a modeler
    registers a second harness whose `open` loads the variant;
  - on those documents, a check that an empty one opens at 100 % with the empty-file hint.
- **VS Code smoke driver** (`./testing/vscode-electron`): keeping a local run on macOS in the
  background (no focus change; the Docker command is the way until then), a reused `node_modules`
  between Docker runs; viewbox and selection kept across the
  undo, redo, `workbench.reduceMotion`, Developer: Reload Window with the stored view, a hidden tab,
  VS Code for the Web; and a fixture extension in this repository, so the shell's own CI runs the
  driver (until then it is validated against the modelers' extensions).
- IntelliJ/JCEF hosts, Electron, Tauri, Theia.
- Canvas theming (`cd-canvas.css`, `cd-c-*` classes), light-only export, the token files themselves.
