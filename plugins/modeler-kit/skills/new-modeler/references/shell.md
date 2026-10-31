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
  The PNG is the shell's `svgToPng` from `@miragon/modeler-shell/export` (modeler-shell 0.7.0 or
  later), not a rasteriser of the renderer's or the app's own: it embeds Geist, which an SVG drawn
  as an image cannot take from the page, loads the SVG through a `data:` URL and fills the
  `background` the app names, the light value of the tokens' `--cd-ui-grund` (`--cd-ui-plot` for a
  notation with a plot, guide §10.7; template: the renderer's `paper` colour). The web app passes
  nothing else, since the helper reads the faces from the stylesheet of
  `@fontsource-variable/geist`. A VS Code webview cannot fetch its font files under the CSP, so it
  passes `fonts` as `data:` URLs with `GEIST_UNICODE_RANGES` (template: `?dataurl` imports, which an
  esbuild plugin and, in the e2e test page, a Vite plugin inline). Both apps pass `onFontFallback`
  and warn once the PNG is saved, since the console reaches no user: a toast in the web app, a
  warning notification in VS Code (the webview's `export` message carries a font-fallback flag).
  A rejection of `svgToPng` is developer text (`@miragon/modeler-shell: …`): both apps log it and
  show their own sentence ("Couldn't export the diagram as PNG. Try again, or export it as SVG."),
  never the rejection's own text. The template's `png-export` specs check all three: the SVG the page draws
  holds the Geist faces, a failed embedding reaches the toast and the message, and a picture the
  browser cannot draw shows the app's sentence.
  Help: "Keyboard shortcuts…" opens the shell's dialog (modeler-shell 0.7.0 or later). The renderer
  builds the groups as plain data, typed structurally so it never imports the shell. The app hands
  the shell to the renderer's `createShortcutsDialog` (template:
  [`ShortcutsDialog.ts`](../assets/template/packages/renderer/src/menu/ShortcutsDialog.ts)), which
  passes the groups to `shell.showShortcutsDialog(groups)` and owns the "?" key: the shell draws
  the dialog of guide §8 (top layer, focus trap and return, backdrop, high contrast, forced
  colours), closes the open menu first, puts its zoom and fit keys at the top of the View group and
  leaves out the renderer's own rows for them (the renderer lists them for a host without the
  shell). In the web app the entry shows the "?" chip, which modeler-shell 0.4.0 keeps out of the
  entry's name (`aria-hidden`), so the name still ends with "…", and "?" opens the dialog from
  anywhere but a text field, another dialog and the start screen. The key's listener sits on
  `document` in the capture phase, ahead of the open menu's type-ahead, and goes with
  `diagram.destroy`, while the shell removes the dialog with `shell.destroy()`. Only the web app
  passes the key: the VS Code webview keeps from VS Code only the keys guide §13.5 gives it and
  passes every other one on, so its entry has no chip and the dialog opens from the menu; a page
  that embeds the renderer keeps its own keys.
  View-only toggles in Model set `keepEnabledWhenReadOnly`; entries that change the document go
  through the command stack. The web app's File group comes from the shell's `file` option.
- **Palette entries.** The shell skins diagram-js's palette (`data-chrome="palette"`, roving focus,
  tooltips, the read-only veto). Tools live in group `tools` with keys `lasso-tool` and `hand-tool`
  (the two a read-only canvas keeps); every entry has a `title` and a separate `shortcut`, no native
  `title` attribute. A creating entry tells Enter or Space from a pointer by the synthetic click's
  `detail === 0` and then creates in the free area: selected, the canvas focused, the label editor
  open. Renderer palette styles apply only to `.djs-palette:not([data-chrome='palette'])` inside
  the notation's container (`.__NOTATION__-container`), so the shell's palette and any other
  diagram-js palette on the page keep their own.
- **Keys.** The shell owns Cmd/Ctrl `+`, `−`, `0` and Shift+1 and stops them before VS Code. The
  renderer binds Cmd/Ctrl+A (select all; unprevented, VS Code would select the chrome), respects
  `undoRedoKeys`, and its single-letter tools act only on the focused canvas.
- **Focus.** Since shell 0.2.2 a pointer click on the zoom panel, a palette entry or a File or
  Model action hands the focus to the canvas through diagram-js 15's `canvas.focus()`; Enter and
  Space leave it on the control. Since the release after 0.7.0 (guide §5.7) the web host's primary
  action (Share) does the same.
- **An SVG export** takes the canvas container's own `<svg>` child (the palette's icons are
  `<svg>`s too) and strips `tabindex`, `role` and `aria-label` from its copy.

## The IDE host (VS Code)

The document is the source of truth, and its sync is the shell's document plumbing (modeler-shell
0.8.0 or later): `registerModelerEditor` in the extension host, `connectDocumentSync` in the
webview. Neither side keeps a writer, an echo filter or an import queue of its own. Undo is VS
Code's.

- The extension's half: `registerModelerEditor(vscode, context, options)` registers the custom
  text editor with `retainContextWhenHidden` and does per editor what each modeler did itself before
  0.8: `webview.html` from `renderWebviewHtml` around `dist/webview.js` and `dist/webview.css` (CSP
  with a nonce, the appearance on `<html>` before the first paint, `lang: 'en'`), the theme bridge,
  `init` for `ready`, every `edit` written as **one minimal line edit**, one write at a time, the
  echo of an own write recognised regardless of line endings and never imported again, every other
  change of the document posted as an `update`, and the document shown again when VS Code refuses
  an edit. The modeler hands it what belongs to the notation: `insertExample`, `diagnostics`
  (`refresh` fills the Problems view and returns the pill's counts, `clear` drops them when the
  editor closes) and `onMessage` for the export. The options that need no `vscode` at runtime sit
  in a module of their own, so the e2e test page registers the same plumbing (template:
  [`diagramEditorOptions.ts`](../assets/template/apps/vscode/src/diagramEditorOptions.ts) and
  [`diagramEditor.ts`](../assets/template/apps/vscode/src/diagramEditor.ts)).
- The webview's half: `connectDocumentSync({ api, importText, exportText, canWrite, onProblems })`
  is connected last, since it posts `ready` at once. It imports `init` and every `update` strictly
  one after another; `importText` resolves to `false` when the canvas refused the text. An update
  that differs from `exportText()` only in its formatting (the line breaks, the final newline a save
  adds) is not imported again, since an import ends a running drag: `importText` then only shows
  the file as valid and resolves to `true`. Every content change of the contract calls its
  `pushEdit`, which posts the canonical text as an `edit` unless it is the text the canvas showed
  last, or `canWrite: () => !shell.isReadOnly()` holds it back while the file is invalid (template:
  [`apps/vscode/src/webview/main.ts`](../assets/template/apps/vscode/src/webview/main.ts)).
- **An invalid file**: when an update cannot be imported, lock the canvas at once (the renderer's
  own read-only service: rules veto every edit, the label editor stays shut), call
  `shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS })` and `shell.setStatus(…)` with the
  same delay and resolve `importText` to `false`; the next valid import unlocks.
- `problems: { onActivate }` opens the Problems view; the extension host posts the diagnostics'
  counts for `shell.setProblems`. `emptyHint: { onInsertExample }` lets the host write the example
  as one edit.
- The webview bundle: fonts as files (esbuild `loader` `file`, `assetNames: 'fonts/[name]-[hash]'`)
  under the CSP's `font-src`, zod's `config({ jitless: true })` imported before any schema, the
  Lucide legal comment kept. Exports go to the host, never a toast: `onMessage` hands the
  webview's `export` to `exportToFile` (modeler-shell 0.9.0 or later) with the kind of
  `IMAGE_EXPORT_KINDS`, the document as `sourceUri`, the notation as `defaultName` and the
  message's font fallback. The shell's save dialog ("Export as PNG", "Export") suggests the
  document's name beside it, writes the file and names it in a notification with the action that
  shows it (`revealFileLabel`), a warning after a font fallback; a file it cannot write is an error
  notification in its own words ("Couldn't export orders.png. Try again, or choose another
  folder."), with the cause in the log (template:
  [`diagramEditor.ts`](../assets/template/apps/vscode/src/diagramEditor.ts)). The extension has
  no save dialog or notification text of its own.
- Native contributions (guide §13.5): "New Empty Diagram" and "New Diagram from Example" are
  commands that ask for a location in the save dialog and write a real file (a custom text editor
  is most robust on a file URI): `registerNewDocumentCommand` (modeler-shell 0.9.0 or later) with
  the same options twice, once with the empty diagram and once with the example as `text`. It
  opens the new file in the diagram editor and shows an error notification when the file cannot be
  written (template: [`extension.ts`](../assets/template/apps/vscode/src/extension.ts)); a unit
  test runs both commands and the export against a stand-in for `vscode` (template:
  [`fileCommands.test.ts`](../assets/template/apps/vscode/test/fileCommands.test.ts)). Both
  commands are in File › New File…, which shows a command's short title,
  such as "Capability Map Diagram" and "New Capability Map Diagram from Example", in the order of
  the group suffixes @1 and @2 (without them VS Code sorts a group by title). The walkthrough (id
  getStarted) has the steps New, Example and Source to the side, each completed by its command,
  then Learn. "Open Source to the Side" and "Open Diagram to the Side" sit in the navigation group
  of the editor title with a Codicon, and in the Command Palette only while a diagram or its text
  has the focus. Called without a resource (the Command Palette, the walkthrough's link), "Open
  Source to the Side" takes the open diagram focused last (`revealActiveDocument()` of the
  plumbing), since a click on the link moves the focus away from the diagram, else a diagram tab
  of the Tab API that VS Code restored after a reload (it resolves a restored tab only once the tab
  is shown). It shows that diagram first, so the source opens beside the diagram and not beside the
  walkthrough. There is no keybindings contribution. A unit test pins all of it (template:
  [`contributions.test.ts`](../assets/template/apps/vscode/test/contributions.test.ts), media in
  [`media/walkthrough/`](../assets/template/apps/vscode/media/walkthrough/)).

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
- `emptyHint: {}`, without `onInsertExample`: once the start screen is gone, an empty diagram (after
  "New diagram", or once the last element is deleted) shows the empty-file hint, and the File
  group's "Show example" stands in for "Insert example" (guide §8 since design system 1.23.0).

## Optional islands

A **legend** (`legend: { render, open, onToggle }`, persisted with `writeShellState` in VS Code
and in local storage on the web; the shell adds the Legend checkbox to Model; without a stored
`open` it starts closed at every size since modeler-shell 0.5.0; the host passes only the state
it stored, and legendStartsOpen, which returned false whatever it was given, is gone since 0.7.0)
and an **inspector** (`inspector: { label }`, Team Topologies). A modeler without them declares
them `absent` in the kit's harness, and the kit asserts that they never show.

## The shell's conformance kit

`registerShellConformance` runs in `e2e` against both real apps (template:
[`e2e/tests/`](../assets/template/e2e/tests/)): geometry at three sizes (±1 px), the legend's start
state, ARIA and keys, keys that never reach VS Code, focus hand-back, appearance (the kit requests
dark, dark with high contrast and light with high contrast: a light-only modeler stays light, never
half-dark, also on each of the harness's documents), keyboard creation, the empty file, the label
editor across the shell's zoom, fit and refit, the read-only lock, reduced motion and forced
colours, the canvas's overlay layers, the shortcuts dialog, the production webview bundle under the
webview CSP, the web column and a clean `destroy`.

- `ide`: a Vite test page runs the webview's `main.ts` inside `installVsCodeWebviewStub` (with
  `stubOptionsFromSearch`), opened with `vsCodeStubSearch(requested)` and a `doc` key for the
  document it posts in `init`; the page, not the bundle, publishes the handles on `window`.
  `show.invalid` posts an update the renderer rejects. With a `host` key the page registers the
  editor's options with `registerModelerEditor` against `createVsCodeHostStub`, whose plumbing
  answers `ready` instead: the template's
  [`document-sync.spec.ts`](../assets/template/e2e/tests/vscode/document-sync.spec.ts) renames and
  moves a node and reads the one line the edit rewrote, changes the text, undoes and redoes in the
  document, inserts the example, has VS Code refuse an edit and saves.
- `web`: the app's own page with its link format. A navigation that only changes the fragment keeps
  the page, so `open` waits for the diagram, not just for the app. With a legend, `open` goes to
  `about:blank` first: the kit's case for the legend's start state (modeler-shell 0.4.0 or later)
  opens at several sizes, each time as a first visit, and fails an `open` that keeps the page.
- `documents` (modeler-shell 0.6.0 or later): the empty documents `open` loads by key, the
  `document` of its context. In VS Code `["empty", "blank"]`, which the test page posts as the file
  the "New Empty Diagram" command writes (`?doc=empty`) and as a file of zero bytes
  (`?doc=blank`); on the web `["empty"]`, which `open` reaches through `about:blank`, the app's `/`
  and the start screen's "New diagram". The kit's empty-file case expects 100 % (or a plot that
  always counts, fitted on open), the empty-file hint in the middle of the free rectangle (on the
  web without "Insert example"), no invalid-file state, the hint gone with the first element and
  back once it is deleted, and on the web the same after File > New diagram on a document; the
  appearance case runs on those documents too. Without them the case skips with
  `hook: "documents"`, and `onSkip` fails the run.
- `labelEditor` (modeler-shell 0.4.0 or later): `open` double-clicks a node and types a new text on
  every call, `documentChanged` compares `modeler.exportText()` with the text at `open` (template:
  [`label-editor.ts`](../assets/template/e2e/tests/support/label-editor.ts)). The kit then zooms,
  fits and resizes through the shell and expects no commit (L5) and the typed text still in the
  editor (L5 recommends it, the shell kit requires it), so the label editor stays open across a view
  change, follows its element and commits only on the user's gestures.
- Reduced motion, forced colours and the overlay layers (modeler-shell 0.6.0 or later) need no
  harness field: the kit emulates both media features itself and clicks every context-pad entry of
  each kind of shape and connection but a deleting one. So keep what stays on the canvas (a
  toolbar, a prompt, the label editor) at `z-index` 100 or below and close a popup above the
  palette on `canvas.viewbox.changing` for good, without showing it again once the view settles;
  give each dialog its own forced-colours border (`CanvasText`), and an element outside the shell
  root its own reduced-motion rule.
- `shortcutsDialog` (modeler-shell 0.7.0 or later): its `show` calls `shell.showShortcutsDialog`
  with the modeler's own shortcut groups, built by the renderer's shortcut table for the page's
  `shell.platform` and `shell.lang` (template:
  [`shortcuts-dialog.ts`](../assets/template/e2e/tests/support/shortcuts-dialog.ts), which imports
  the table's source, since it needs nothing at runtime), or with the kit's fixture where the page
  cannot build them. The kit checks the dialog of guide §8, the chrome's keys at the top of the View
  group and the focus. Without the hook the case skips with `hook: "shortcutsDialog"`, and `onSkip`
  fails the run.
- `absent` lists what the modeler lacks, and `onSkip` throws: every other skip is a gap. In VS Code
  a menu without a Model action (no File group there) adds `absent: ["canvasMenuAction"]`
  (modeler-shell 0.4.0 or later).
- `csp` (modeler-shell 0.6.0 or later, `ide` only): its `open` builds `apps/vscode` for production
  once per worker (`node esbuild.config.mjs --production`), opens `dist` with `openWebviewBundle`
  from `@miragon/modeler-shell/testing/webview-bundle` (the document and CSP of
  `renderWebviewHtml` with what the extension passes it, the VS Code stub ahead of the policy) and
  posts the example's `init` once the webview posted `ready` (template:
  [`shell-conformance.spec.ts`](../assets/template/e2e/tests/vscode/shell-conformance.spec.ts)).
  The kit then walks the bundle (a tooltip, a shape's context pad and label editor, every menu
  entry that is not destructive, zoom and Fit) and fails on any CSP violation, uncaught error,
  failed load or console error, on a policy other than `renderWebviewHtml`'s, on a Geist font that
  loads no face, comes from a `data:` URL or has a subset without `unicode-range`, on any font face
  whose file failed to load, and on a palette or menu the walk cannot reach. The case replaces a
  spec of its own for the production bundle under the CSP: a modeler that has one deletes it with
  the upgrade to 0.6.0.
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
bridge resolves for the modeler's `themes`, with a screenshot each. Since modeler-shell 0.8 it then
also checks, by default, the zoom and selection keys, the view and selection across a redo and an
undo, reduced motion, a hidden tab and Developer: Reload Window. A notation that cannot take one of
these passes `keys: false`, `history: false` or `workbench: false` (one without the shell's zoom
panel cannot take the keys), and `VSCODE_SMOKE_SKIP` skips them in a run without a change to the
test (`keys`, `history`, `workbench`, separated by commas or spaces). Template:
[`vscode-smoke.test.ts`](../assets/template/apps/vscode/test-smoke/vscode-smoke.test.ts), run by
`npm run test:vscode-smoke` after `npm run build` and `npm run build:vscode`; `npm run test:vscode`
runs all three.

- **On a developer machine, in Docker:** `npm run test:vscode:docker` runs `test:vscode` in a Linux
  container under `xvfb-run -a` through the shell's `modeler-shell-vscode-docker` (modeler-shell
  0.3.1 or later), so no VS Code window opens and takes the focus. It needs Node and Docker, passes
  `VSCODE_VERSION`, `VSCODE_SMOKE_KEEP` and `VSCODE_SMOKE_SKIP` into the container and copies the
  screenshots back to `test-results/vscode-smoke` (with VS Code's logs under `vscode-logs/` when
  kept). CI runs `test:vscode-smoke` under `xvfb-run -a` directly.

- Its two peers, `playwright-core` and `@vscode/test-electron` 3.1.0 or later (earlier releases
  cannot start a current VS Code on macOS), are exact devDependencies of `apps/vscode`; nothing
  else installs them. `test-smoke/**` is in `.vscodeignore`, so the VSIX does not ship it.
- It has its own Vitest config with `fileParallelism: false`, outside `npm test`: it needs a
  display and the built extension, and outside Docker a window opens for about half a minute. The
  first run downloads VS Code (about 350 MB) into the OS's cache directory, outside the repository
  and shared by every modeler on the machine, so neither `.gitignore` nor ESLint needs an entry.
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
