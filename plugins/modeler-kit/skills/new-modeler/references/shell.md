# The chrome: `@miragon/modeler-shell`

Both apps mount the shell; renderers never import it. Every option, type and rule is in the
[README](https://github.com/Miragon/modeler-suite/blob/main/packages/shell/README.md) and
[API.md](https://github.com/Miragon/modeler-suite/blob/main/packages/shell/API.md), the why in the
[implementation notes](https://github.com/Miragon/modeler-suite/blob/main/docs/shell/implementation-notes.md).
Template: [`apps/webapp/src/main.ts`](../assets/template/apps/webapp/src/main.ts) and
[`apps/vscode/src/webview/main.ts`](../assets/template/apps/vscode/src/webview/main.ts).

## Mounting, in this order

1. **The diagram**, through the contract factory with `additionalModules: [shellModule]`,
   `fitOnImport: false` and `freeArea: { insets: () => shell.fitInsets() }`; then
   `diagram.get('canvas')`, because a lazily built diagram must exist before the shell's key
   listener (a keyboard on `document` runs in registration order).
2. **The shell**: `mountVsCodeShell` in the webview (the `ide` host), `mountShell` with
   `host: 'web'` in the web app, the diagram's container as `canvas`. Do not call the factory's
   `attachTo`: the shell places the container in its slot.
3. **`connectDiagramJs(shell, diagram, { modeler, isEmpty })`** (modeler-shell 0.4.0 or later): the
   viewport fits to `modeler.contentBounds()`, the contract's tight box (1.3), so the host knows
   none of the renderer's services and adds no padding (the shell's fit insets are the only margin).
   `isEmpty` says that no element is on the canvas and is cheap (the shell asks on every content
   change); it is not `contentBounds()` being `undefined`, since a notation that always draws
   something (a plot, axes) has bounds without an element. It returns a connection,
   `{ viewport, destroy }`. On its `viewport`, call `viewport.afterImport()` after every import,
   `viewport.newDocument()` before a new document in the web app, and `viewport.getViewbox()` and
   `viewport.restore()` around a re-import in VS Code; `persistView(vscode, viewport)` keeps the
   view in the webview state. `destroy()` unbinds the shell and runs by itself on `diagram.destroy`.

Stylesheets: the fonts (`@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, bundled,
no CDN), the renderer's stylesheet, then `@miragon/modeler-shell/shell.css` last. The renderer's
entry imports its stylesheet, but the web app imports it by name as well
(`@miragon/<notation>-renderer/assets/<notation>.css`): the renderer's `sideEffects` lists only its
CSS, so Vite's production build skips the entry's own import and would ship the chrome without the
tokens, while the dev server and e2e show nothing wrong. Neither app has a stylesheet of its own.

## What the renderer hands the shell

- **Menu content.** The renderer builds the `model`, `export` and `help` groups with types that
  mirror the shell's `MenuGroups` structurally, so it stays shell-free; a sync test in an app pins
  the mirror against the shell (template:
  [`menu.sync.test.ts`](../assets/template/apps/vscode/test/menu.sync.test.ts)). Export: PNG first,
  then SVG, then the document format in the web app only (in VS Code the file is the document).
  Help: "Keyboard shortcuts…", a dialog the renderer renders into `shell.root` and removes on
  `diagram.destroy` (the shell removes only what it added). In the web app its entry shows the
  "?" chip, which modeler-shell 0.4.0 keeps out of the entry's name (`aria-hidden`), so the name
  still ends with "…", and "?" opens the dialog from anywhere but a text field, another dialog and
  the start screen (the listener sits on `document` in the capture phase, ahead of the open menu's
  type-ahead). Only the web app passes the key: the VS Code webview keeps from VS Code only the keys
  guide §13.5 gives it and passes every other one on, so its entry has no chip and the dialog opens
  from the menu; a page that embeds the renderer keeps its own keys.
  View-only toggles in Model set `keepEnabledWhenReadOnly`; entries that change the document go
  through the command stack. The web app's File group comes from the shell's `file` option.
- **Palette entries.** The shell skins diagram-js's palette (`data-chrome="palette"`, roving focus,
  tooltips, the read-only veto). Tools live in group `tools` with keys `lasso-tool` and `hand-tool`
  (the two a read-only canvas keeps); every entry has a `title` and a separate `shortcut`, no native
  `title` attribute. A creating entry tells Enter or Space from a pointer by the synthetic click's
  `detail === 0` and then creates in the free area: selected, the canvas focused, the label editor
  open. Renderer palette styles apply only to `.djs-palette:not([data-chrome='palette'])`.
- **Keys.** The shell owns Cmd/Ctrl `+`, `−`, `0` and Shift+1 and stops them before VS Code. The
  renderer binds Cmd/Ctrl+A (select all; unprevented, VS Code would select the chrome), respects
  `undoRedoKeys`, and its single-letter tools act only on the focused canvas.
- **Focus.** Since shell 0.2.2 a pointer click on the zoom panel, a palette entry or a File or
  Model action hands the focus to the canvas through diagram-js 15's `canvas.focus()`; Enter and
  Space leave it on the control.
- **An SVG export** takes the canvas container's own `<svg>` child (the palette's icons are
  `<svg>`s too) and strips `tabindex`, `role` and `aria-label` from its copy.

## The IDE host (VS Code)

- `resolveCustomTextEditor` sets `webview.html` from `renderWebviewHtml` (CSP with a nonce, the
  appearance on `<html>` before the first paint via `currentAppearance`, `lang: 'en'`) and calls
  `connectThemeBridge`, which disposes itself with the panel (never push it into
  `context.subscriptions`). Register the provider with `retainContextWhenHidden: true`.
- The document is the source of truth: canvas edits come back as the canonical text, written as
  **one minimal line edit** per change, one write at a time, and the echo of an own write is
  recognised regardless of line endings and never re-imported (template:
  [`DocumentWriter.ts`](../assets/template/apps/vscode/src/DocumentWriter.ts)). Undo is VS Code's.
- **An invalid file**: when an update cannot be imported, lock the canvas at once (the renderer's
  own read-only service: rules veto every edit, the label editor stays shut) and call
  `shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS })` and `shell.setStatus(…)` with the
  same delay; the next valid import unlocks.
- `problems: { onActivate }` opens the Problems view; the extension host posts the diagnostics'
  counts for `shell.setProblems`. `emptyHint: { onInsertExample }` lets the host write the example
  as one edit.
- The webview bundle: fonts as files (esbuild `loader` `file`, `assetNames: 'fonts/[name]-[hash]'`)
  under the CSP's `font-src`, zod's `config({ jitless: true })` imported before any schema, the
  Lucide legal comment kept. Exports go to the host, which shows the save dialog and a
  notification with `revealFileLabel`, not a toast.

## The web host

- `index.html` is `<html lang="en" class="cd-shell-document" data-cd-theme="light">` with a
  `<!-- miragon-mode -->` marker that the Vite config replaces with `webHeadMarkup(…)`; the web
  app's `check:build` script verifies the markup, the renderer's stylesheet (the tokens and the
  renderer's rules) and the shell's licence comment in `dist`.
- The web column: `primary` ("Share", the document in the URL fragment), `legal`, `file`,
  `problems` (rows from `problemSummary`), `emptyState` with the vendored Komet on a fresh start
  (end it with `setEmptyState(false)` on every other start), `dropZone` with extensions and MIME
  types, toasts. Replacing a document offers Undo in a toast instead of a confirmation, and a link
  pasted into the open tab (`hashchange`) replaces the diagram.

## Optional islands

A **legend** (`legend: { render, open, onToggle }`, persisted with `writeShellState` in VS Code
and in local storage on the web; the shell adds the Legend checkbox to Model; without a stored
`open` it starts closed at every size since modeler-shell 0.5.0) and an **inspector**
(`inspector: { label }`, Team Topologies). A modeler without them declares them `absent` in the
kit's harness, and the kit asserts that they never show.

## The shell's conformance kit

`registerShellConformance` runs in `e2e` against both real apps (template:
[`e2e/tests/`](../assets/template/e2e/tests/)): geometry at three sizes (±1 px), the legend's start
state, ARIA and keys, keys that never reach VS Code, focus hand-back, appearance (the kit requests
dark, dark with high contrast and light with high contrast: a light-only modeler stays light, never
half-dark), keyboard creation, the label editor across the shell's zoom, fit and refit, the
read-only lock, reduced motion and forced colours, the canvas's overlay layers, the production
webview bundle under the webview CSP, the web column and a clean `destroy`.

- `ide`: a Vite test page runs the webview's `main.ts` inside `installVsCodeWebviewStub` (with
  `stubOptionsFromSearch`), opened with `vsCodeStubSearch(requested)`; the page, not the bundle,
  publishes the handles on `window`. `show.invalid` posts an update the renderer rejects.
- `web`: the app's own page with its link format. A navigation that only changes the fragment keeps
  the page, so `open` waits for the diagram, not just for the app. With a legend, `open` goes to
  `about:blank` first: the kit's case for the legend's start state (modeler-shell 0.4.0 or later)
  opens at several sizes, each time as a first visit, and fails an `open` that keeps the page.
- `labelEditor` (modeler-shell 0.4.0 or later): `open` double-clicks a node and types a new text on
  every call, `documentChanged` compares `modeler.exportText()` with the text at `open` (template:
  [`label-editor.ts`](../assets/template/e2e/tests/support/label-editor.ts)). The kit then zooms,
  fits and resizes through the shell and expects no commit (L5) and the typed text still in the
  editor (L5 recommends it, the shell kit requires it), so the label editor stays open across a view
  change, follows its element and commits only on the user's gestures.
- Reduced motion, forced colours and the overlay layers (a modeler-shell release after 0.5.0) need no
  harness field: the kit emulates both media features itself and clicks every context-pad entry of
  each kind of shape and connection but a deleting one. So keep what stays on the canvas (a
  toolbar, a prompt, the label editor) at `z-index` 100 or below and close a popup above the
  palette on `canvas.viewbox.changing` for good, without showing it again once the view settles;
  give each dialog its own forced-colours border (`CanvasText`), and an element outside the shell
  root its own reduced-motion rule.
- `absent` lists what the modeler lacks, and `onSkip` throws: every other skip is a gap. In VS Code
  a menu without a Model action (no File group there) adds `absent: ["canvasMenuAction"]`
  (modeler-shell 0.4.0 or later).
- `csp` (a modeler-shell release after 0.5.0, `ide` only): its `open` builds `apps/vscode` for
  production once per worker (`node esbuild.config.mjs --production`), opens `dist` with
  `openWebviewBundle` from `@miragon/modeler-shell/testing/webview-bundle` (the document and CSP of
  `renderWebviewHtml` with what the extension passes it, the VS Code stub ahead of the policy) and
  posts the example's `init` once the webview posted `ready`. The kit then walks the bundle (a
  tooltip, a shape's context pad and label editor, every menu entry that is not destructive, zoom
  and Fit) and fails on any CSP violation, uncaught error, failed load or console error, on a
  policy other than `renderWebviewHtml`'s, on a Geist font that loads no face, comes from a `data:`
  URL or has a subset without `unicode-range`, on any font face whose file failed to load, and on a
  palette or menu the walk cannot reach. The case replaces the smoke test of the production bundle. The template keeps that test
  ([`webview-bundle.spec.ts`](../assets/template/e2e/tests/vscode/webview-bundle.spec.ts)) and lets
  the `csp` skip pass until its modeler-shell pin reaches that release, then moves to the case.
- A unit test pins the shell's sizes (`SHELL`) against the vendored `shell` token group with
  `shellSizesFromTokens` and `SHELL_TOKENS`
  ([`tokens.sync.test.ts`](../assets/template/apps/vscode/test/tokens.sync.test.ts)).

## The VS Code smoke test

The kit's `ide` host is a stand-in for VS Code. `runVsCodeSmoke` from
`@miragon/modeler-shell/testing/vscode-electron` (modeler-shell 0.3.0 or later) starts the real
one: it downloads VS Code, starts it with the built extension on a throwaway profile, opens a
fixture in the custom editor, edits through the canvas, saves (the file on disk changes and the
modeler's parser accepts it), undoes (the canvas and, saved again, the file are the fixture again)
and switches through VS Code's four default themes, where the webview has to show what the theme
bridge resolves for the modeler's `themes`, with a screenshot each. Template:
[`vscode-smoke.test.ts`](../assets/template/apps/vscode/test-smoke/vscode-smoke.test.ts), run by
`npm run test:vscode-smoke` after `npm run build` and `npm run build:vscode`; `npm run test:vscode`
runs all three.

- **On a developer machine, in Docker:** `npm run test:vscode:docker` runs `test:vscode` in a Linux
  container under `xvfb-run -a` through the shell's `modeler-shell-vscode-docker` (modeler-shell
  0.3.1 or later), so no VS Code window opens and takes the focus. It needs Node and Docker, passes
  `VSCODE_VERSION` and `VSCODE_SMOKE_KEEP` into the container and copies the screenshots back to
  `test-results/vscode-smoke` (with VS Code's logs under `vscode-logs/` when kept). CI runs
  `test:vscode-smoke` under `xvfb-run -a` directly.

- Its two peers, `playwright-core` and `@vscode/test-electron` 3.1.0 or later (earlier releases
  cannot start a current VS Code on macOS), are exact devDependencies of `apps/vscode`; nothing
  else installs them. `test-smoke/**` is in `.vscodeignore`, so the VSIX does not ship it.
- It has its own Vitest config with `fileParallelism: false`, outside `npm test`: it needs a
  display and the built extension, and outside Docker a window opens for a few seconds. The first run downloads
  VS Code (about 350 MB) into the OS's cache directory, outside the repository and shared by every
  modeler on the machine, so neither `.gitignore` nor ESLint needs an entry.
- `VSCODE_VERSION` picks the VS Code (`stable`, `1.96.0`; default the newest stable release that
  satisfies `engines.vscode`), `VSCODE_SMOKE_EXTENSION` another build of the extension, such as an
  unpacked VSIX, and `VSCODE_SMOKE_KEEP=1` passes `keepTemporaryFiles`, so VS Code's profile and
  logs stay after the run.
- CI runs it under `xvfb-run -a` on the newest stable VS Code and the `engines.vscode` floor when
  a change touches the extension's inputs, every week, and on the VSIX before each publish, and
  uploads the screenshots and, for a failed run, VS Code's logs (see
  [repository](repository.md#the-vs-code-smoke-test-in-ci) and
  [releases](releases.md#vs-code-marketplace-and-open-vsx)).
- The default edit, `createFromPalette`, presses Enter on the first creating palette entry and then
  Escape. A notation without such an entry passes its own `edit` (locators on `webview`, keys on
  `page`), and one whose edit takes more than one undo step sets `undoSteps`. A failed check is in
  `failures`, never thrown; `keepTemporaryFiles` keeps VS Code's logs for a failure to read.
- A theme switch VS Code does not pick up is retried by the driver (modeler-shell 0.4.1 or later):
  it writes the setting again, then switches through another theme and back, all within one
  `timeoutMs`. Only then does the theme fail, naming the theme requested and the one VS Code shows.
  The smoke test needs no retry of its own, neither a `retry` in its Vitest config nor a second run
  after a failed theme; a modeler that added one on an older shell drops it with the upgrade.

What each step checks and every option are in the shell's
[README](https://github.com/Miragon/modeler-suite/blob/main/packages/shell/README.md) (section "Smoke
tests in a real VS Code") and [API.md](https://github.com/Miragon/modeler-suite/blob/main/packages/shell/API.md)
(`./testing/vscode-electron`).

## Upgrades

The shell is on 0.x: a minor may change the chrome. Dependabot proposes `@miragon/modeler-*` in a
group of its own that is never auto-merged; read the shell's `CHANGELOG.md`, adapt the apps, run
both kits (a new kit case names the harness hook it needs) and land it as
`fix(deps): adopt modeler-shell x.y`, so release-please releases both apps.
