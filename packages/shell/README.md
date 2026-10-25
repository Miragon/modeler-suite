# @miragon/modeler-shell

The shared, framework-free chrome around Miragon diagram-js modelers: the menu button with its
dropdown, the horizontal palette skin, the chrome tooltip, the zoom panel with its keys and fit, the
problems pill, the status box, the empty-file hint, legend and inspector slots, the plumbing to a
VS Code webview, and the web-app chrome (primary action, legal line, File and Appearance groups,
problems list, toasts, empty-state card, drop zone, the web app's mode). One implementation for every modeler and every host (VS Code webview, web app,
embedded in a foreign page), so the chrome looks and behaves the same everywhere.

- **Look and behaviour** follow the Miragon design system, guide
  [`modeler-design-system.md`][guide] §5, §6, §8, §9, §11, §12 and §13.3 to §13.5 (skill
  `miragon-brand:modeler-tool-design`; the repository is private, the link opens for Miragon staff).
- **Mechanics** (diagram-js services, VS Code quirks, why things are done the way they are) are in
  the [implementation notes][notes].
- **API**: every entry point, type and rule in [API.md][api].
- **Plan**: Phase 4 of [Miragon/modeler-suite#4](https://github.com/Miragon/modeler-suite/issues/4); the
  Event Storming modeler is the pilot.

Zero runtime dependencies: diagram-js services are typed structurally, the `vscode` namespace and
Playwright's `page` and `test` are passed in, nothing is imported at runtime. Only the smoke-test
driver `./testing/vscode-electron` loads `playwright-core` and `@vscode/test-electron`, optional peer
dependencies that nobody installs who does not use it; its Docker command,
`modeler-shell-vscode-docker`, needs only Node and Docker. The stylesheet reads only the design
system's `--cd-ui-*` roles and `--cd-shell-*` sizes. All texts are English by default and overridable through
one messages table; numbers go through `Intl` in the UI language.

## Install

```sh
npm i --save-exact @miragon/modeler-shell
```

The modeler brings what the shell styles against and draws into:

- **diagram-js** 15.28 or later (directly or through its renderer);
- **the design tokens**: `cd-tokens.generated.css` (and `cd-tokens.generated.json` where scripts
  need values) of the design system, 1.12.0 or later (the release with the `shell` group). Copy
  both unchanged from the skill's `assets/` or from
  <https://corporate-identity.netlify.app/brand/cd-tokens.generated.css> and
  <https://corporate-identity.netlify.app/brand/cd-tokens.generated.json>, mark them as generated,
  and re-copy instead of editing. The shell ships no tokens and never forks a value;
- **the fonts** Geist and Geist Mono, bundled locally, for example `@fontsource-variable/geist` and
  `@fontsource-variable/geist-mono` (no CDN);
- for `./vscode/extension`: **VS Code 1.90 or later**, whose extension host runs Node 20 (the global
  `crypto` that `createNonce` uses; the types are tested against `@types/vscode` 1.96). Declare
  `engines.vscode` accordingly and target `node20` in the extension-host bundle.

Stylesheets, in this order. The tokens come first, unless the renderer's stylesheet already imports
them (Event Storming's does), and are never loaded twice:

```ts
import "./theme/cd-tokens.generated.css"; // vendored, unchanged, first; left out when the renderer CSS brings it
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "diagram-js/assets/diagram-js.css"; // usually through the renderer's CSS
import "@miragon/<notation>-renderer/…css";
import "@miragon/modeler-shell/shell.css"; // last
```

The shell computes fit insets, breakpoints and layers from its own copy of the sizes (`SHELL`), while
its stylesheet reads the vendored `--cd-shell-*` tokens. Pin the two together in a unit test (Vitest
or `node:test`), not in the e2e suite, since the check is pure data:

```ts
// test/tokens.sync.test.ts
import { SHELL, SHELL_TOKENS, shellSizesFromTokens } from "@miragon/modeler-shell/core";

expect(SHELL).toEqual(shellSizesFromTokens(vendoredTokens.shell));
expect(Object.keys(vendoredTokens.shell)).toEqual(
  expect.arrayContaining(Object.values(SHELL_TOKENS)),
);
```

| Entry                                            | For                                                         |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `@miragon/modeler-shell`                         | `mountShell`, icons, and everything of `./core`             |
| `@miragon/modeler-shell/core`                    | DOM-free: fit math, keymap, zoom readout, appearance, sizes |
| `@miragon/modeler-shell/diagram-js`              | `shellModule`, the viewport, `connectDiagramJs`             |
| `@miragon/modeler-shell/vscode/extension`        | webview HTML with CSP and nonce, theme bridge               |
| `@miragon/modeler-shell/vscode/webview`          | `mountVsCodeShell`, appearance handler, webview state       |
| `@miragon/modeler-shell/testing`                 | the Playwright-driven shell conformance kit                 |
| `@miragon/modeler-shell/testing/vscode-stub`     | a stand-in for VS Code around a webview test page           |
| `@miragon/modeler-shell/testing/vscode-electron` | smoke tests of the modeler's extension in a real VS Code    |
| `@miragon/modeler-shell/shell.css`               | every style of the shell                                    |

TypeScript: every entry resolves under `moduleResolution` `node16`, `bundler` and `node10`, and
every optional input field accepts `undefined`, so a modeler compiling with
`exactOptionalPropertyTypes` forwards optional values as they are.

## Usage in a VS Code webview

Extension host:

```ts
import * as vscode from "vscode";
import {
  connectThemeBridge,
  currentAppearance,
  renderWebviewHtml,
} from "@miragon/modeler-shell/vscode/extension";

const THEMES = ["light"] as const; // until the shared dark-mode release of the modelers

// activate(): a hidden tab keeps document, view and selection
vscode.window.registerCustomEditorProvider(viewType, provider, {
  webviewOptions: { retainContextWhenHidden: true },
});

// resolveCustomTextEditor():
const dist = vscode.Uri.joinPath(extensionUri, "dist");
webview.options = { enableScripts: true, localResourceRoots: [dist] }; // script, CSS and font files
const asset = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(dist, file)).toString();
webview.html = renderWebviewHtml({
  cspSource: webview.cspSource,
  scriptUri: asset("webview.js"),
  styleUris: [asset("webview.css")],
  title: "Event Storming Board",
  lang: "en",
  appearance: currentAppearance(vscode, { themes: THEMES }), // on <html> before the first paint
});
connectThemeBridge(vscode, webviewPanel, { themes: THEMES }); // disposes itself with the panel
```

The bridge's disposable is only for ending it before the panel closes; never push it into
`context.subscriptions`, which would keep one dead bridge per opened editor until the extension
deactivates.

Bundle the fonts as files next to the webview bundle, not as data URLs: with esbuild
`loader: { ".woff2": "file", ".woff": "file" }` and `assetNames: "fonts/[name]-[hash]"` the browser
fetches only the subsets a page's `unicode-range` needs (Geist Mono alone brings six; inlined they
roughly double the webview CSS). The CSP of `renderWebviewHtml` allows fonts from `cspSource`, and
`dist` is in `localResourceRoots`. A webview that bundles zod 4 runs `z.config({ jitless: true })` in
a module it imports before any schema module: the CSP forbids eval, zod probes once for eval when it
builds its first object schema, and the browser reports that caught `new Function` as a
`securitypolicyviolation`; under `jitless` zod skips the probe.

Webview:

```ts
import { INVALID_STATUS_DELAY_MS } from "@miragon/modeler-shell";
import { connectDiagramJs, shellModule } from "@miragon/modeler-shell/diagram-js";
import {
  mountVsCodeShell,
  persistView,
  readShellState,
  writeShellState,
} from "@miragon/modeler-shell/vscode/webview";

const vscode = acquireVsCodeApi();
const stored = readShellState(vscode);

// The diagram first: a modeler keyboard on document must run before the shell's key listener.
// A renderer that builds its diagram lazily builds it now; width and height follow the shell's slot.
// A renderer with its own Cmd/Ctrl+Z binding turns it off here, because VS Code's document history
// owns undo (Event Storming: createCollaborativeModeler({ undoRedoKeys: false }), see API.md).
const modeler = new Modeler({ width: "100%", height: "100%", additionalModules: [shellModule] });
modeler.get("canvas");
const shell = mountVsCodeShell(document.getElementById("app")!, {
  themes: ["light"],
  canvas: modeler.container,
  menu: {
    model: [/* Level; Type captions with keepEnabledWhenReadOnly, a view toggle */],
    export: [/* Export as PNG, SVG */],
    help: [/* Keyboard shortcuts… (the modeler's own dialog) */],
  },
  legend: {
    render: renderLegend,
    open: stored.legendOpen,
    onToggle: (open) => writeShellState(vscode, { legendOpen: open }),
  },
  problems: { onActivate: () => vscode.postMessage({ type: "showProblems" }) },
  emptyHint: { onInsertExample: () => vscode.postMessage({ type: "insertExample" }) },
});
const connection = connectDiagramJs(shell, modeler, {
  // the tight bounds of the content, no padding: the shell's fit insets are the only margin
  contentBounds: () => elementBounds(), // undefined while there is nothing to fit
  isEmpty: () => elementCount() === 0, // cheap: no export, no validation
});
const { viewport } = connection;
persistView(vscode, viewport); // writes the view once it rested, not on every frame

async function importText(text: string, first: boolean): Promise<void> {
  const keep = first ? undefined : viewport.getViewbox();
  try {
    await modeler.importDSL(text);
    lockCanvas(false);
    shell.setReadOnly(false);
    shell.setStatus(null);
    if (keep) viewport.restore(keep);
    else if (first && stored.view) viewport.setState(stored.view);
    viewport.afterImport(); // first content fits, an empty file shows 100 %, the hint follows by itself
  } catch {
    // locked at once, visible after 800ms without a valid import (no flicker while typing)
    lockCanvas(true); // the modeler's own lock: context pad, move, resize, delete, paste, label editor
    shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS });
    shell.setStatus(
      { severity: "danger", text: shell.messages.invalidFile("Event Storming board") },
      { delayMs: INVALID_STATUS_DELAY_MS },
    );
  }
}

// Imports strictly one after another; `ready` resolves once the first one settled.
let imports = Promise.resolve();
let firstImportSettled = () => {};
const ready = new Promise<void>((resolve) => (firstImportSettled = resolve));
window.addEventListener("message", ({ data }) => {
  if (data?.type === "init")
    imports = imports.then(() => importText(data.text, true)).then(firstImportSettled);
  if (data?.type === "update") imports = imports.then(() => importText(data.text, false));
});
vscode.postMessage({ type: "ready" });

// For the e2e test page below; the bundle publishes nothing on window.
export const webview = { shell, modeler, connection, ready };
```

The content bounds come from `contentBounds`, or, since 0.4, from the renderer's contract
instance: with a renderer on `@miragon/modeler-api` 1.3, `connectDiagramJs(shell, diagram, { modeler })`
(`modeler` from `createCollaborativeModeler(…)`, `diagram` its diagram-js instance) fits to the
contract's `contentBounds()`, so the host needs to know none of the renderer's services. An explicit
`contentBounds` still wins, for a renderer before 1.3 or a host that fits to other bounds; a host may
pass both while its renderer is on 1.2 and drop its own once the renderer reports them.

`mountVsCodeShell` stops every key the webview handles on `document`, before VS Code's listener on
`window` forwards it to the workbench, and keeps the webview in the mode the extension resolved: a
modeler declaring `["light"]` stays light under any VS Code theme, high contrast passes, and VS
Code's `workbench.reduceMotion` stops the chrome's animations. Undo and redo on the canvas go to VS
Code (the shell keeps diagram-js's bindings off them), so a modeler's own keyboard binds no Cmd/Ctrl+Z
in the webview either. Keys the canvas uses act only there: Cmd/Ctrl+A on the canvas selects every
element (or is at least prevented), so VS Code's Select All never selects the chrome. The modeler's
keyboard also ignores keys with `defaultPrevented` and keys from outside the canvas container, and
puts no `tabindex` on it.

`shell.setReadOnly(true)` locks the palette (all but Lasso and Hand) and the Model entries of the
menu. View toggles stay usable: the shell's Legend checkbox and the legend's close button, and every
entry with `keepEnabledWhenReadOnly` (guide §13.5 since design system 1.13.0). The canvas itself is the modeler's to lock: no context pad, move,
resize, delete, paste or label editor. Content the modeler adds to `shell.root` (a "Keyboard
shortcuts…" dialog) is the modeler's too: it removes it in its own teardown, for example on
`diagram.destroy`, since `shell.destroy()` removes only what the shell added. The complete Event
Storming example, including the export notification, is in [API.md][api]. Document sync, undo through
the document and diagnostics stay in the modeler for now.

## Usage in a web app

The page's head writes the mode before the first paint. A light-only modeler keeps
`<html lang="en" data-cd-theme="light">` static and lets the build put the metas and the contrast
line in place of a marker in `index.html`:

```ts
// vite.config.ts
import { webHeadMarkup } from "@miragon/modeler-shell/core";
import tokens from "./src/theme/cd-tokens.generated.json" with { type: "json" };

const themeColors = { light: tokens.fest["--cd-blau"], dark: tokens.dunkel["--cd-ui-grund"] };
const modePlugin = {
  name: "miragon-mode",
  transformIndexHtml: (html: string) =>
    html.replace("<!-- miragon-mode -->", webHeadMarkup({ themes: ["light"], themeColors })),
};
```

```ts
// src/main.ts
import {
  commandKeyLabel,
  defaultMessages,
  detectPlatform,
  mountShell,
  problemSummary,
} from "@miragon/modeler-shell";
import { connectDiagramJs, shellModule } from "@miragon/modeler-shell/diagram-js";

// The diagram first: a modeler keyboard on document must run before the shell's key listener.
const modeler = new Modeler({ width: "100%", height: "100%", additionalModules: [shellModule] });
modeler.get("canvas");
const platform = detectPlatform(navigator);
const shell = mountShell(document.getElementById("app")!, {
  host: "web",
  canvas: modeler.container,
  lang: "en",
  themes: ["light"], // with "dark": also appearance: { themeColors }, and the menu gets Appearance
  primary: { onSelect: share }, // "Share", top right; the label collapses before the palette moves
  legal: { links: [{ label: "GitHub", href: "https://github.com/Miragon/…" }] },
  file: {
    newDiagram: { onSelect: newDiagram },
    // ⌘O or Ctrl+O; also the start screen's "Open a file…" link
    open: {
      onSelect: pickFile,
      shortcut: commandKeyLabel("O", platform, defaultMessages.keyNames),
    },
    showExample: { onSelect: example },
  },
  menu: { model: [/* … */], export: [/* … */], help: [/* Keyboard shortcuts… */] },
  problems: { onSelectItem: (item) => selectElement(item.elementId) },
  legend: { render: renderLegend, open: storedLegendOpen(), onToggle: storeLegendOpen },
  emptyState: {
    title: "BPMN Modeler",
    text: "Start a new diagram, or explore the example.",
    komet: kometUrl, // the vendored, unchanged miragon-komet-blau.svg
    onNewDiagram: newDiagram,
    onShowExample: example,
  },
  dropZone: {
    accept: [".bpmn", "application/xml", "text/xml"],
    onDrop: ([file]) => openFile(file),
  },
});
const { viewport } = connectDiagramJs(shell, modeler, { contentBounds: () => elementBounds() });

// Every new document opens like the first, and the start screen goes with it.
async function openDocument(xml: string): Promise<void> {
  viewport.newDocument();
  const { warnings } = await modeler.importXML(xml);
  viewport.afterImport();
  shell.setEmptyState(false);
  shell.setProblems(
    problemSummary(warnings.map((warning) => ({ severity: "warning", message: warning.message }))),
  );
}

// A fresh visit without a document in the link shows the start screen.
if (!linkedDocument) shell.setEmptyState(true);
shell.toast({ status: "success", text: "Link copied" }); // after a share
```

The `web` host renders the whole web column of guide §5.2: the primary action at the top right,
the legal line at the bottom left with pill and legend above it, the File group first and, for a
dark-capable modeler, the Appearance group in the menu, the problems list above the pill, toasts at
the bottom centre (announced through two live regions), the start screen and a page-wide drop zone.
It prevents the browser's page zoom for the chrome keys (outside text fields, modal dialogs and the
start screen) and fits with the web insets. The web app's
own menu, zoom, fit, toast, legal and empty-state markup goes away; what stays the modeler's is its
content: the share link, file reading, examples, the Model and Export entries and the shortcuts
dialog. See [API.md][api], "Web host (0.2)", and the complete Event Storming example there.

## Usage in a foreign page

`mountShell(container, { host: "embedded", themes: ["light"], canvas })` on an explicitly sized
container: the root carries the tool's `lang` itself, keys act only while the focus is inside the
modeler, and the page's `<html>` stays untouched. Until the `@miragon/modeler-api` contract gains
its `appearance` surface (a later 1.x minor), an embedded modeler has no appearance channel, so the
root carries its own `data-cd-theme` (the first of `themes`, light) and stays light inside a dark
host page; it takes the page's `data-cd-kontrast="hoch"` over from the nearest mode carrier above
it. The page's element styles (`button { text-transform: uppercase }`) do not reach the chrome.
Toasts show at the bottom centre of the modeler, and the pill opens the problems list unless the
modeler passes `problems.onActivate` (an embedding host with a list of its own).

## The conformance kit

Every modeler runs the kit in its own Playwright suite against its real webview or page. It checks
the geometry of every island (±1px), that without a stored state the legend starts closed at
390 × 844, 441 × 900 and 1280 × 900, ARIA and the keyboard models, that every chrome key acts exactly
once and never reaches VS Code, that the canvas's own keys (Cmd/Ctrl+A) stay on the canvas, that a
pointer click on the zoom panel, a palette tool or a File or Model menu action without a dialog
hands the focus to the canvas while Enter and Space leave it on the zoom button and Enter on that
menu entry returns it to the menu trigger, that nothing is ever half-dark (the painted canvas
surround and the palette's colours included), that Enter on a creating palette entry adds one
selected element, that the shell's zoom, fit and refit never commit an open label editor (contract
L5) and leave it open with the typed text (L5 recommends it, the kit requires it), that an invalid
file locks the canvas, that nothing moves under reduced motion (also VS Code's) and an explicit fit
jumps, that under forced colours the islands, the dropdown and the modeler's dialogs keep their
border and the pressed tool, the focus and the status box their marks, that what stays on the canvas
(a toolbar, a prompt, the label editor) lies under the palette, that the IDE host's production
bundle runs under the webview CSP without a violation, an error or a missing font, and that
`destroy()` leaves nothing behind. Five more cases cover the web column (`webChrome`, `emptyState`,
`toasts`, `problemsList`, `dropZone`); in the IDE and embedded hosts they assert that none of it
shows. Every `aria-keyshortcuts` the kit reads must name keys, not characters: a `?` chip is
`Shift+/ Shift+ß`, the keys of US and German, and no shortcut chip may show a character that needs
AltGr or ⌥, sits on a dead key or is missing in one of them, such as `@` (guide §5.6, design system
1.21.0).

For the `ide` host the suite serves a test page that puts a stand-in for VS Code around the
modeler's webview code: VS Code's default webview styles, `<html>` as `renderWebviewHtml` writes it,
the host page's theme classes, `acquireVsCodeApi()` and the real theme bridge. Serve
`e2e/webview/` as the root of a Vite server, so the page is `/webview-test.html`:

```ts
// e2e/webview/webview-test.ts, the entry of e2e/webview/webview-test.html
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

`ready`, `webviewReady` and the window globals belong to the modeler's test page (declared in a
`.d.ts` of the suite), not to the shell: the webview resolves `ready` once its first `init` import
settled.

```ts
// e2e/shell-conformance.spec.ts
import { test } from "@playwright/test";
import { registerShellConformance, vsCodeStubSearch } from "@miragon/modeler-shell/testing";

test.describe("shell conformance", () => {
  test.describe.configure({ timeout: 60_000 }); // geometry measures three sizes
  let opens = 0;
  let exportedAtOpen = "";
  registerShellConformance(
    {
      host: "ide",
      themes: ["light"],
      absent: ["inspector"], // islands this modeler does not have: never visible, never skipped
      csp: { open: openShippedWebview }, // the production bundle under the webview CSP, see below
      async open(page, { size, requested }) {
        await page.setViewportSize(size);
        await page.goto(`/webview-test.html?${vsCodeStubSearch(requested)}`);
        await page.waitForFunction(() => window.webviewReady === true); // set by the test page
      },
      async destroy(page) {
        // the webview's own teardown path: connection, diagram (with the modeler's dialogs), shell
        await page.evaluate(() => {
          window.connection.destroy();
          window.modeler.destroy();
          window.shell.destroy();
        });
      },
      labelEditor: {
        // like a user: a double-click on a shape, then typing; a new text on every call
        async open(page) {
          await page.locator(".djs-shape[data-element-id]").first().dblclick();
          const typed = `Renamed ${++opens}`;
          await page.keyboard.type(typed);
          exportedAtOpen = await page.evaluate(() => window.modeler.exportText());
          return typed;
        },
        async documentChanged(page) {
          return (await page.evaluate(() => window.modeler.exportText())) !== exportedAtOpen;
        },
      },
      show: {
        async legend(page) {
          await page.evaluate(() => window.shell.legend?.setOpen(true));
        },
        async problems(page) {
          await page.evaluate(() =>
            window.postMessage({ type: "problems", count: 2, errors: 1 }, "*"),
          );
        },
        async status(page) {
          await page.evaluate(() =>
            window.shell.setStatus({
              severity: "danger",
              text: window.shell.messages.invalidFile("board"),
            }),
          );
        },
        async invalid(page) {
          // the way the host makes the file invalid: a document update the parser rejects
          await page.evaluate(
            (text) => window.postMessage({ type: "update", text }, "*"),
            INVALID_BOARD,
          );
        },
      },
    },
    test,
    {
      onSkip(caseName, skips) {
        // with `absent` listing what the modeler lacks, every remaining skip is a gap of this suite
        throw new Error(
          `${caseName}: ${skips.map(({ hook, reason }) => `${hook}: ${reason}`).join("; ")}`,
        );
      },
    },
  );
});
```

Besides the islands, `absent` takes `"drop"`, `"problemSelection"`, `"labelEditor"` and
`"canvasMenuAction"`. List `"canvasMenuAction"` for a menu without a File or Model action that opens
no dialog, as in a VS Code webview whose Model group holds only toggles and dialogs: `focusHandBack`
would otherwise skip with `hook: "open"`, and the `onSkip` above throws on that.

A web app's harness opens its page and adds the web column's hooks and the files to drop. The kit
emulates the system's colour scheme and contrast (`page.emulateMedia`) before every `open`, so the
page loads without a stored mode choice:

```ts
// e2e/shell-conformance.spec.ts of a web app
registerShellConformance(
  {
    host: "web",
    themes: ["light"],
    absent: ["inspector", "invalid"],
    async open(page, { size }) {
      await page.setViewportSize(size);
      await page.goto("/?example");
      await page.waitForFunction(() => window.appReady === true);
    },
    async destroy(page) {
      await page.evaluate(() => window.app.destroy());
    },
    show: {
      async legend(page) {
        /* … */
      },
      async problems(page) {
        /* setProblems with items, so the list has rows */
      },
      async status(page) {
        /* … */
      },
      async emptyState(page) {
        /* the start screen of a fresh visit */
      },
      async toast(page, toast) {
        await page.evaluate(
          ({ status, text, actionLabel }) =>
            window.app.shell.toast({
              status,
              text,
              ...(actionLabel ? { action: { label: actionLabel, onSelect() {} } } : {}),
            }),
          toast,
        );
      },
    },
    drop: {
      accepted: { name: "board.json", type: "application/json", text: EXAMPLE_JSON },
      rejected: { name: "notes.md", type: "", text: "# Notes" },
    },
  },
  test,
  { onSkip: failOnSkips },
);
```

The harness opens the modeler with the appearance the kit requests, the way its host would; for the
`embedded` host the kit puts the foreign page itself in that mode. Each `open` loads a new document,
as on a first visit: `legendStart` fails an `open` that changes only the URL fragment, because the
page keeps the legend's earlier start state (go to `about:blank` first). A stored legend state is
outside the kit, because `open` has no way to pass one: the legend starts closed unless the host
passes its stored `legend.open`, which the shell's unit tests cover. A skip names the harness
field it misses (`{ hook: "legend", reason }`; `hook: "labelEditor"` without a `labelEditor`, or
`absent: ["labelEditor"]` for a notation without labels on the canvas; `hook: "destroy"` without a
`destroy`; `hook: "open"` when the opened document lacks what a case needs, such as a shape for
`readOnly`); without `onSkip`
the kit warns on the console. What each case asserts, and what the kit installs in the page, is
listed in [API.md][api].

`reducedMotion` and `forcedColors` (added after 0.5.0) emulate `prefers-reduced-motion` and
`forced-colors` through `page.emulateMedia` in every host and turn the emulation off again, even
when they fail; a page without `emulateMedia` skips them with `hook: "open"` (in the IDE host
`reducedMotion` still checks VS Code's reduce motion, the body class it sets on the host page).
`overlayLayers` (also added after 0.5.0) selects one shape or connection a pointer reaches per kind
of context pad, a connection among them where the document has one, and clicks each entry of those
pads once for shapes and once for connections, except one whose `data-action` names a delete or a
removal, so what the entries open (popup menus, colour pickers, prompts) is checked as well. When an
earlier entry closed the pad or took the element away, it opens the pad again or uses another
element with the same pad; an entry no element shows any more fails the case instead of going
unchecked. An overlay above the palette must close when the view zooms and stay closed past
diagram-js's late `canvas.viewbox.changed`. None of the three needs a new harness field.

`registerShellConformance` declares every test inside the kit, so a runner reports them at the kit's
source (the package ships `src/` without its tests, so the location resolves). For test locations in
the suite's own spec file, register the cases there:

```ts
import { shellConformanceCases } from "@miragon/modeler-shell/testing";

for (const conformanceCase of shellConformanceCases()) {
  test(`shell conformance: ${conformanceCase.name}`, async ({ page }) => {
    const outcome = await conformanceCase.run(page, harness);
    if (outcome?.skipped) failOnSkips(conformanceCase.name, outcome.skipped);
  });
}
```

The test page runs the webview from source without a CSP, so the kit's `csp` case (0.6) opens the
bundle the extension ships. `openWebviewBundle` of `@miragon/modeler-shell/testing/webview-bundle`
serves it on `https://webview.test` the way VS Code loads it: `renderWebviewHtml`'s document and
CSP, and ahead of the policy, where VS Code writes its own API script, VS Code's default styles and
the VS Code stub, which records every `securitypolicyviolation`, error and failed load from the
first stylesheet on. The harness builds the bundle and hands it its document:

```ts
// e2e/tests/vscode/support/webview.ts
import { openWebviewBundle } from "@miragon/modeler-shell/testing/webview-bundle";

let productionBuild: Promise<unknown> | undefined;

export async function openShippedWebview(page: Page, { size, requested }: OpenContext) {
  productionBuild ??= promisify(execFile)(
    process.execPath,
    ["esbuild.config.mjs", "--production"],
    {
      cwd: APPS_VSCODE, // once per worker: the bundle as the packaged extension ships it
    },
  );
  await productionBuild;
  await page.setViewportSize(size);
  await openWebviewBundle(page, {
    dist: join(APPS_VSCODE, "dist"), // webview.js, webview.css, fonts/
    title: "Event Storming Board", // what the extension passes renderWebviewHtml
    requested,
    themes: ["light"],
  });
  await page.waitForFunction(() =>
    window.__modelerShellVsCodeStub?.posted.some(
      (message) => (message as { type?: string }).type === "ready",
    ),
  );
  await page.evaluate((text) => window.postMessage({ type: "init", text }, "*"), EXAMPLE_BOARD);
  await page.locator(".cd-shell-canvas .djs-shape").first().waitFor();
}
```

The case then walks what renders late (a tooltip, a shape's context pad and label editor, every
enabled menu entry that is not destructive, zoom and Fit) and fails on any violation, uncaught
error, unhandled rejection, failed load or `console.error`, on a policy other than
`renderWebviewHtml`'s, on a Geist font that loads no face, comes from a `data:` URL or has a subset
without `unicode-range`, and on any font face whose file failed to load. A palette or menu the walk
cannot reach, or a menu without an entry it activated, fails it too. Pass `openWebviewBundle` the
`body`, `styles` and `inlineStyles` the extension passes `renderWebviewHtml`, so the page runs under
the policy the extension ships.

## Smoke tests in a real VS Code

The kit runs against a stand-in for VS Code. `@miragon/modeler-shell/testing/vscode-electron` starts
the real one, from a plain Vitest or `node:test` file: it downloads VS Code with
`@vscode/test-electron`, starts it through Playwright's Electron support with the modeler's built
extension on a throwaway profile, opens a fixture in the custom editor, checks that the shell's
chrome is there, makes an edit through the canvas, saves with the platform's save key (the tab turns
clean, the file on disk holds still and the modeler's parser accepts it), undoes with the platform's
undo key (the canvas and, saved again, the file return), and switches through VS Code's four default
themes (Default Light Modern, Default Dark Modern, Default High Contrast, Default High Contrast
Light): the webview has to show what the theme bridge resolves for the modeler's `themes`, and every
theme gets a screenshot. A run takes about 4 to 6 seconds once VS Code is downloaded.

Its two dependencies are optional peers of the shell, so only a modeler that uses the entry installs
them, next to the build of its extension. It needs `@vscode/test-electron` 3.1.0 or later (and so
Node 22): earlier releases look for VS Code's macOS executable under a name current VS Code no
longer has.

```sh
npm i -D --save-exact playwright-core @vscode/test-electron
```

The modeler supplies only its specifics: the extension folder, a fixture, its parser and, where the
default does not fit, the edit. The default edit is Enter on the first creating palette entry, then
Escape. A `node:test` file, run with `node --test` (Node 22.18 or later runs it without a build):

```ts
// apps/vscode/test-smoke/vscode-smoke.test.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseDSLWithDiagnostics } from "@miragon/wardley-dsl";
import { formatVsCodeSmoke, runVsCodeSmoke } from "@miragon/modeler-shell/testing/vscode-electron";

test("Wardley Maps in a real VS Code", { timeout: 600_000 }, async () => {
  const result = await runVsCodeSmoke({
    extensionPath: fileURLToPath(new URL("..", import.meta.url)), // after npm run build:vscode
    fixture: { fileName: "tea.wmap", text: await readFile("example/tea.owm", "utf8") },
    parse(text) {
      const { diagnostics } = parseDSLWithDiagnostics(text);
      if (diagnostics.length > 0) throw new Error(diagnostics.map((d) => d.message).join("; "));
    },
    themes: ["light"], // what the extension passes to connectThemeBridge
    name: "wardley",
    screenshotDir: "test-results/vscode-smoke", // wardley-light.png, wardley-dark.png, …
    log: console.log,
  });
  console.log(formatVsCodeSmoke(result)); // VS Code version, timings, every theme
  assert.deepEqual(result.failures, []);
});
```

A modeler with an edit of its own passes `edit`; it gets the VS Code window, the webview document
as a Playwright `FrameLocator` and the platform's keys:

```ts
edit: async ({ webview, page }) => {
  await webview.locator('[data-element-id="cmp_power"]').click(); // a shape no other one covers
  await page.keyboard.press("ArrowRight"); // the modeler's keyboard moves the selection
},
```

The result says what happened (`ok`, `failures`, `saved`, `undone`, `themes` with the observed
appearance and the screenshot, `timings` per step); `runVsCodeSmoke` never throws for a failed
check, only for options it cannot run with. An extension that fails to activate in VS Code (a module
its bundle cannot load, a throw in `activate`) fails the open step at once, with VS Code's own error
from its extension host log; `keepTemporaryFiles: true` keeps the profile with all of VS Code's logs.
A webview that throws on start (0.6.0), before its menu shows or while it imports the fixture, fails
the open step 3 s after the throw instead of after `timeoutMs`, and every failure of the open step
quotes the webview's uncaught errors and console errors with their stacks, which none of VS Code's
logs holds.
A theme switch VS Code does not pick up is retried within the run (0.4.1): the driver writes the
setting again, then switches through another theme and back, before the theme fails with the theme
requested and the one VS Code shows. A modeler needs no retry of its own for a missed theme switch.
Keep the smoke test out of the unit tests' project: it needs a display and the built extension. Add
the screenshot directory to `.gitignore`.

**Where VS Code goes.** The driver keeps the download in the OS's cache directory, as Playwright
keeps its browsers: `~/Library/Caches/miragon-modeler-shell/vscode-test` on macOS,
`$XDG_CACHE_HOME/miragon-modeler-shell/vscode-test` (by default under `~/.cache`) on Linux and
`%LOCALAPPDATA%\miragon-modeler-shell\vscode-test` on Windows. Every modeler on the machine shares
it, `npm ci` does not delete it, and since it is outside the repository neither Git nor `eslint .`
walks the unpacked VS Code. Since 0.3.3 runs may use it at the same time, in one modeler or in
several, as long as every one of them uses modeler-shell 0.3.3 or later: a run unpacks a VS Code
version the cache does not have yet into a folder of its own inside the cache and then moves it in
with one rename, so no run deletes or overwrites the VS Code another one starts. When two runs
download the same version at once, the first one done puts it into the cache and the other one uses
that copy. A modeler still on 0.3.2 or older deletes and unpacks in the cache in place, as
`@vscode/test-electron` does, so while it downloads a version it can break a run of another modeler
and be broken by one, until it upgrades. A cache on a file system that refuses symbolic links (FAT,
for one) loses this protection once it holds an install: a run then uses it directly, as before
0.3.3, and says so in its log. A `cachePath` inside the repository (`.vscode-test`, the default of
`@vscode/test-electron` itself) needs an entry in `.gitignore` and one in ESLint's `ignores`
(`"**/.vscode-test/**"`): the flat config does not read `.gitignore`, so `eslint .` would lint the
downloaded VS Code, fail with hundreds of errors and block every commit behind a lint hook.

**macOS, locally.** Give the file a script of its own,
`"test:vscode-smoke": "node --test apps/vscode/test-smoke/vscode-smoke.test.ts"`, build the extension
and run it; a VS Code window opens for a few seconds and takes the focus (Electron has no headless
mode on macOS; [in Docker](#in-docker-without-a-window) no window opens). The first run downloads VS
Code, about 320 to 360 MB depending on the platform (1.143.0: 324 MB for macOS on Apple silicon, 351
MB for Linux x64) and about 0.9 GB unpacked per version, 25 to 45 s on a fast connection; later runs
reuse it. The driver dispatches keys by key code, so the run behaves the same on a QWERTZ or any
other keyboard layout.

```sh
npm run build && npm run build:vscode
npm run test:vscode-smoke
```

**Linux, in CI.** VS Code needs an X server: run the script under `xvfb-run -a` (without one,
Playwright reports "Unable to open X display"). GitHub's `ubuntu-latest` has the libraries VS Code
needs, as `@vscode/test-electron`'s own CI recipe relies on; the Event Storming and Wardley Maps
modelers run the driver there on every pull request that touches their extension. An opt-in job,
for example on demand and on pull requests with a label:

```yaml
vscode-smoke:
  if: github.event_name == 'workflow_dispatch' || contains(github.event.pull_request.labels.*.name, 'vscode-smoke')
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
    - uses: ./.github/actions/setup # setup-node and npm ci
    - run: npm run build && npm run build:vscode
    - run: xvfb-run -a npm run test:vscode-smoke
    - if: always()
      uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
      with:
        name: vscode-smoke
        path: test-results/vscode-smoke/
        retention-days: 7
```

What each step checks, the result's fields and the settings and command line VS Code starts with
are in [API.md][api], `./testing/vscode-electron`; why the driver works the way it does (frames,
keys, theme switch, save, Docker) is in the [implementation notes][notes].

### In Docker, without a window

On macOS every run starts a VS Code window in the foreground, and several runs in a row keep taking
the focus from whoever works on the machine. `modeler-shell-vscode-docker`, the shell's one command,
runs the same test in a Linux container under `xvfb-run -a`, where no window shows. The host needs
Docker and the shell; the container brings everything else. Validated with Docker Desktop on an
Apple silicon Mac; on a Linux host the results get the host user's ownership, not root's.
Add the script next to the modeler's smoke script:

```json
"test:vscode:docker": "modeler-shell-vscode-docker"
```

```sh
npm run test:vscode:docker                                    # npm run test:vscode in the container
npm run test:vscode:docker -- --script test:vscode-smoke      # another npm script
npm run test:vscode:docker -- --env VSCODE_SMOKE_VERSION=1.96.0 --env VSCODE_SMOKE_KEEP=1
npm run test:vscode:docker -- -- sh -c "npm run build && npm run build:vscode && npm run test:vscode-smoke"
```

What it does:

1. **Image.** Once per Node version and recipe it builds the local image
   `modeler-shell-vscode-smoke:node<version>-<hash>` (about 0.9 GB): the official
   `node:<version>-bookworm-slim` with Xvfb, `xauth`, the libraries Electron needs, fonts, `unzip`
   and `git` (Dockerfile: `vsCodeSmokeDockerfile`, in [API.md][api]). The Node version is the one
   that runs the command (`--node` picks another), the architecture the Docker host's (`linux/arm64`
   on Apple silicon, where VS Code's `linux-arm64` build runs). `--platform linux/amd64` asks for x64
   in an image of its own (its tag ends in `-linux-amd64`), which Docker Desktop emulates on Apple
   silicon; the smoke test itself is not validated there. The hash in the tag builds a new image when
   a shell release changes the recipe; `--rebuild` builds it again.
2. **Repository.** The repository root (the nearest directory upwards with a `package-lock.json`) is
   mounted read-only at `/repo` and copied into the container without `node_modules`, `.git`,
   `.vscode-test` and the results directory. `npm ci` installs there, so the container gets the Linux
   builds of esbuild and the like and the host's `node_modules` stay untouched.
3. **Test.** The script (default `test:vscode`, `--script` for another, everything after `--` as the
   command instead) runs under `xvfb-run -a` in the directory the command was started in, with
   `HUSKY=0` and the variables of `--env`. VS Code's download and npm's cache live in two named
   volumes, `modeler-shell-vscode-cache` (the container's `~/.cache`, where the driver keeps VS Code)
   and `modeler-shell-npm-cache`, shared by every modeler on the machine. A test with a `cachePath`
   of its own inside the repository downloads VS Code on every run in the container (see
   [API.md][api]); the default needs nothing.
4. **Results.** `test-results/vscode-smoke` (`--results` for another directory inside the
   repository) comes back to the host, with VS Code's logs in `vscode-logs/` when the test kept its
   temporary files (`keepTemporaryFiles`). Each run empties `test-results/vscode-smoke` first, as the
   modelers' tests do on a local run. Another results directory is emptied only when the command
   created it (it carries the marker file `.modeler-shell-vscode-docker`); one with files of its own
   is left as it is. The exit code is the test's.

With the image and VS Code cached a run takes about 10 s on an Apple silicon Mac (Event Storming
10.4 s, Wardley Maps 9.3 s, `npm ci` included); the very first run about 75 s (the image 38 s, the
VS Code download 22 s). Paths in the test's own output are the container's (`/work/…`). Runs in
parallel share the cache volume, also while one of them downloads a new VS Code version, as long as
every modeler that runs on it uses modeler-shell 0.3.3 or later; one still on 0.3.2 or older can
break the others while it downloads and be broken by them. `docker
volume rm modeler-shell-vscode-cache modeler-shell-npm-cache` starts over (the VS Code volume holds
about 1 GB per version). Without the command, the
same in plain Docker (the image's Dockerfile from `vsCodeSmokeDockerfile`):

```sh
docker build -t vscode-smoke - < Dockerfile
docker run --rm --init --shm-size=1g -v "$PWD:/work" -v modeler-shell-vscode-cache:/root/.cache \
  -w /work vscode-smoke sh -c "npm ci && xvfb-run -a npm run test:vscode"
```

That one writes the Linux `node_modules` into the working copy; the command copies the repository
instead.

## Development

Run from the repository root (`-w packages/shell` for this package only):

```sh
npm run build -w packages/shell       # tsup: ESM + CJS + d.ts, dist/shell.css
npm run typecheck -w packages/shell   # src, core without the DOM library, demo
npm test -w packages/shell            # Vitest: node (core, boundaries) and happy-dom projects
npx playwright install chromium       # once
npm run test:e2e -w packages/shell    # Playwright against demo/
npm run demo -w packages/shell        # the demo page on http://localhost:5181
```

The demo page (`demo/`) is a small diagram-js modeler around the shell. Its query parameters choose
the host (`host=ide|web|embedded`), the modes the modeler declares (`themes=light,dark`), what the
host requests (`theme`, `kontrast=hoch`; embedded: the foreign page's own mode), the `ide` host's
`colorTheme` setting and `reduceMotion`, and the state to start in (`legend=open`, `inspector`,
`problems=2:1`, `status=danger`, `invalid`, `empty`, which opens at 100 %). In the `ide` host it runs
inside the stub of `./testing/vscode-stub`, and keeps view and legend state through
`acquireVsCodeApi()`. Its context pad has a Note entry, whose prompt covers the palette until a pan
or zoom closes it, and its Help group opens a modal "Keyboard shortcuts…" dialog with a table per
group, so the kit's `overlayLayers` and `forcedColors` cases meet both. The e2e suite's global setup
also builds it as a production webview bundle (`e2e/demo-webview.ts`, esbuild into
`test-results/demo-webview`) for the kit's `csp` case; that page takes its parameters from
`<div id="app" data-search="…">`.

The web demo (`/web.html`) is the same modeler as a Miragon web app passes it to `mountShell`: the
whole web column, the head markup of `webHeadMarkup` through the Vite config, and `window.__webDemo`
for the harness. Its query parameters: `themes=light,dark`, `empty` (the start screen of a fresh
visit), `legend` (`legend=open`), `inspector`, `problems` (the pill with its list) and `invalid`.

The e2e suite runs the conformance kit for the `ide`, `web` and `embedded` hosts with a light-only
and a dark-capable modeler, switches VS Code themes and the `colorTheme` setting at runtime, checks
VS Code's reduce motion, the chrome's typography against VS Code's default styles and a hostile
foreign page, the canvas slot's paint and focus ring, the web chrome's colours, radii and states
(primary action, legal line, toasts, drop zone, empty state, high contrast and forced colours),
the web demo's own handlers and the demo's production bundle under the webview CSP, and proves with
saboteurs that every case of the kit fails when its rule is broken.

| Directory                               | Module                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/core`                              | DOM-free: fit math, keymap, zoom readout, appearance, sizes, texts                         |
| `src/dom`                               | `mountShell`: menu, zoom panel, tooltip, pill, status, slots, keys                         |
| `src/dom/web`, `src/core/web-chrome`    | web column: primary action, legal line, File and Appearance groups, empty state, drop zone |
| `src/dom/feedback`, `src/core/feedback` | toasts, problems popover, the web app's mode                                               |
| `src/diagram-js`                        | `shellModule`, viewport, `connectDiagramJs`, palette skin                                  |
| `src/vscode`                            | extension side (HTML, theme bridge) and webview side                                       |
| `src/testing`                           | the conformance kit, the VS Code stub, the webview bundle helper, the smoke driver         |
| `src/*.ts`, `src/shell.css`             | the entry points                                                                           |
| `test/`                                 | package boundaries, token drift, the unit tests' helpers                                   |
| `demo/`, `e2e/`                         | the demo modeler and the e2e suite                                                         |
| `fixtures/tokens`                       | the token files, vendored unchanged for the tests and the demo                             |

A module imports another one only through its `index.ts`; `src/core` imports nothing outside
itself and compiles without the DOM library. `test/package-boundaries.test.ts` enforces this, the
zero runtime dependencies (the smoke driver's two peers optional, mirrored by exact
devDependencies, loaded lazily and by nothing else), the exact devDependency pins, the token-only
stylesheets and the published files (`dist`, `src` without its tests, `API.md` and the notices).

## License

MIT. The inlined Lucide icons are ISC (© Lucide Icons and Contributors), and `check`, `circle-x`,
`maximize`, `minus`, `plus`, `triangle-alert` and `x` derive from Feather, MIT (© Cole Bemis), as
Lucide's LICENSE lists them; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). `dist` keeps that
notice as a legal comment in the chunk with the icons, but a bundler's `legalComments` setting may
drop it: a VSIX or a web bundle that contains the shell carries the Lucide and Feather notices of
THIRD_PARTY_NOTICES.md itself. Vite 8 (Rolldown with the Oxc minifier) drops legal comments by
default; `build.rolldownOptions.output.comments.legal: true` keeps the notice in the bundle.

[guide]: https://github.com/Miragon/corporate-identity/blob/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md
[notes]: https://github.com/Miragon/modeler-suite/blob/main/docs/shell/implementation-notes.md
[api]: https://github.com/Miragon/modeler-suite/blob/main/packages/shell/API.md
