# CLAUDE.md

TypeScript library for viewing and editing value chain diagrams
(ARIS-style "Wertschöpfungskettendiagramme"), built on
[diagram-js](https://github.com/bpmn-io/diagram-js) (MIT) and styled by the Miragon design
system. Architecture mirrors the Wardley Maps modeler ([`modelers/wardley-maps`](../wardley-maps/CLAUDE.md)).

This modeler is `modelers/value-chain` in the Miragon modeler suite. The suite's
[`CLAUDE.md`](../../CLAUDE.md) holds the rules for every modeler (setup, commands, commits and
signing, exact pins, releases, the design system, the contract and shell boundaries); this file
adds what is special to value chains. Run its scripts from the repository root as
`npm run value-chain <script>`, or as `npm run <script>` inside `modelers/value-chain`.

## Packages

| Package                             | Purpose                                                          | DOM |
| ----------------------------------- | ---------------------------------------------------------------- | --- |
| `@miragon/value-chain-schema-model` | Metamodel, Zod validation, migrations, stable JSON serialization | no  |
| `@miragon/value-chain-renderer`     | diagram-js bootstrap, renderer, modeler, import/export, CSS      | yes |
| `apps/webapp`                       | Vite editor app on the shell's web host                          | yes |
| `apps/vscode`                       | VS Code extension: `*.vc`/`*.vc.json` custom editor (esbuild)    | yes |
| `e2e`                               | Playwright: the webapp and the VS Code webview (shell kit, both) | yes |

**DOM boundary (P1):** `schema-model` must never import diagram-js/DOM libraries
(`tiny-svg`, `min-dom`) or use `window`/`document`. Enforced twice: ESLint
(`no-restricted-imports`/`no-restricted-globals`) and `dependency-cruiser`. The same two tools
keep `@miragon/modeler-shell` out of every package (only the apps mount the chrome) and let
`schema-model` take nothing but types from `@miragon/modeler-api`.

## Domain model

Persisted JSON (`schema-model`): `step` (chevron) and `orgUnit` (ellipse) elements +
`sequence`/`hierarchy`/`assignment` connections ("ist Vorgänger von" dashed with arrow /
"ist prozessorientiert übergeordnet" solid with arrow / org-unit assignment plain solid).
Hierarchy routing adapts to the sub-steps' arrangement (shared predicate
`isRowArrangement` in `VcLayouter`): a horizontal row gets vertical drops into the tops,
a vertical column gets the ARIS rake into the left notches;
`VcHierarchyRelayoutBehavior` re-routes the whole sibling group when the arrangement
flips. The relation/element-type matrix is enforced in `validateDocument` and in
`VcRules` (an org unit endpoint always resolves to `assignment`). While editing, the
truth lives as flat props on the diagram-js elements (`vcType`, `vcLabel`, `color`);
`businessObject` is only an import snapshot. The exporter rebuilds documents from
element props and validates via `validateDocument`.

Unknown keys on the document, `meta`, elements and connections survive load, every canvas edit
and serialization (vendor extensions); `bounds` and waypoints reject unknown keys, `vc-root` is a
reserved id (so are `__implicitroot…` and the names of `Object.prototype` members, which the
diagram-js element registry cannot hold), coordinates and sizes stay within ±1e9, and objects
and arrays nest at most 100 levels (`MAX_NESTING_DEPTH`, checked without recursion, on a stack of
the open containers only, with a `WeakMap` guard against shared and self-containing objects).
`documentIssues` reports every finding with its JSON path (the VS Code Problems view); of the
`__proto__` keys and the containers nested too deep, the first 100 in document order (a container
a JavaScript caller shares is checked again only where it lies deeper, so its findings may be
missing at its other places; the verdict stays the same).

## Renderer architecture (mirrors wardley-renderer)

- Class chain `VcBaseViewer` → `Viewer` → `NavigatedViewer` → `Modeler`; each overrides
  `_getModules()`. DI bootstrap via `new Diagram({ canvas, modules })`, lazily created.
- One feature per folder with an `index.ts` exporting a didi `ModuleDeclaration`
  (`__init__` for eager providers/behaviors, `__depends__` for stock diagram-js modules).
- `draw/VcRenderer` extends BaseRenderer at priority 1500; chevron geometry lives in
  `draw/geometry.ts`; visual constants in `draw/styles.ts`: ink and fill are the light
  `--cd-ui-text` / `--cd-ui-plot` roles read from the vendored `cd-tokens.generated.json`, 2px
  round strokes, labels 12px in `'Geist Variable', 'Geist', …` set on every text node (guide §4),
  as presentation values, so exports stay light. A shape's own `color` is its fill (guide §10.6,
  `draw/fill.ts`): the contour stays ink and the label is black or white, whichever contrasts
  more. Every label line carries the halo of the surface behind it (guide §10.1): the fill where
  the line lies mostly on its shape; a line that runs past the shape (`shapeHoldsLine` in
  `draw/geometry.ts`) is ink with the `--cd-ui-grund` halo, whatever the shape's colour. A stored
  value the picker no longer offers (the former `hsl()` accents) keeps rendering. Known gap of
  keeping it: on the former Blue `hsl(205, 100%, 45%)` (`#0086E6`) neither label colour reaches
  4.5:1 (black 4.46:1, white 3.78:1); the other four former accents do. The picker
  (`COLOR_OPTIONS`) offers "Default", then the palette and status colours from the vendored
  tokens; `test/color-options.test.ts` pins them. Labels drawn before the web font arrived are
  laid out again once it has. Tool and chrome icons are Lucide, inlined in `draw/lucide.ts`.
- `src/theme/` holds the design system's `cd-tokens.generated.css`/`.json` and `cd-canvas.css`
  (1.27.0), vendored unchanged with a header; re-copy them from the
  `miragon-brand:modeler-tool-design` skill, never edit. `assets/value-chain.css` loads tokens
  (layered), `diagram-js.css`, `cd-canvas.css`, then styles only on `--cd-ui-*` roles;
  `test/theme.sync.test.ts` guards both, `apps/vscode/test/tokens.sync.test.ts` pins the shell's
  sizes to the vendored `shell` tokens. In-canvas overlays stay at `z-index` 100 or below.
- `collaborative/` implements the `@miragon/modeler-api` 1.5 contract
  (`createCollaborativeModeler`/`createCollaborativeViewer`, `elements.bounds` included, and
  `contentBounds()`, `vcBounds.contentBounds(0)`: tight, `undefined` while empty, which the apps'
  `connectDiagramJs(…, { modeler, isEmpty })` fits to and the SVG export frames; it includes label
  text that runs past its shape, whose box `VcRenderer` measures on a 2D canvas each time it draws
  the shape, never on the live SVG, so the box holds at every zoom);
  `importDocument` validates first, erases the history silently (`clear(false)`), fits (unless
  `fitOnImport: false`, which both apps pass because the shell's viewport fits), keeps an open
  label edit across the import, and ends a running gesture first, as Escape does
  (`gesture/VcGestures`: `dragging.cancel(false)`; a pan, `hand.move`, whether the hand tool, Space
  held or Ctrl/Cmd and a press started it, is no gesture and keeps running, from the current view:
  the fitted one when the import fits, or one a host sets after it (the restore of L5) or while the
  pan runs (`canvas.viewbox.changed` re-anchors the pan's `localStart`; without it the next pointer
  move would put the old view back; not during the pan's own scroll, since diagram-js rounds the
  pan's `dx` to whole diagram units, and moving the start point there would add the rounding up,
  so a slow pan above 200 % would not move at all, told apart by the pan's drag context, not a
  flag; diagram-js's AutoScroll does not scroll under a pan, `gesture/PanAwareAutoScroll`, since
  the pan would keep its scrolls at the canvas edge and lose the diagram point under the pointer),
  and so does a palette tool that only waits for its next press, `lasso.selection`, `hand`,
  `spaceTool.selection` or `global-connect`, which stays armed; both bring back the selection they hold when they end, which `import.render.done` maps
  onto the imported elements by id (diagram-js's `Selection` refuses the removed ones); a connect
  that the connect tool starts from a removed shape is refused at `connect.init`, which also puts
  the tool down; a drop being applied is never cancelled, told apart by its drag context, not a
  flag; `clear()` treats all of them the same way;
  `test/browser/import-cancels-gesture.browser.test.ts`). `importText` and `clear()` called while
  a user action runs (from a host's change listener or any other listener inside it) wait until it
  has finished (`vcGestures.afterUserAction`, one queue in call order). A drop finishes at
  `drag.ended` or `drag.canceled` (#248; the queue flushes a microtask later, also when a throwing
  cleanup listener keeps diagram-js from firing either), so no listener of the drop, diagram-js's
  `SelectionBehavior` or the label editor a dragged append opens, meets a replaced diagram
  (`test/browser/import-during-drop.browser.test.ts`). Any other action that runs a command, an
  undo or a redo (a click append, a keyboard create, a label commit at a press, a delete) runs from
  its first `commandStack.execute` or `commandStack.revert` until the handler that ran it has
  returned, a microtask later (#285): the selection and label editor of an append or a create open
  on the live element, and the import reopens the editor there; a handler that commits a label and
  starts a drag (a press on the canvas, a palette click without a press) still starts it, and the
  import then ends it as it ends any gesture, while a pointer press on the palette commits at its
  `mousedown` and its create survives; a command the host runs itself holds `clear()` and
  `importText` the same microtask. A drag's activation runs from its `drag.start` until its first
  `drag.move` (#336): diagram-js empties the selection in between and then reads the drag's
  context again, so an import from `elements.onSelection` that cancelled the drag there threw
  `Cannot read properties of null (reading 'cursor')`; held, it runs a microtask later, once
  `Dragging.move` has returned, and ends the drag (`drag.canceled`)
  (`test/browser/import-during-user-action.browser.test.ts`). The
  direct `importDocument` cannot wait, it returns its warnings, and it first runs what still waits
  (`vcGestures.runHeldWork`), so the calls keep their order. The 1.5 surfaces: `interaction` is
  `vcGestures.isActive()` (set on the first `drag.move` of an activated drag that is no armed tool
  and no pan, cleared on `drag.ended`/`drag.canceled`, `GESTURE_CHANGED_EVENT`; the delivery skips
  a listener once the modeler is destroyed or the listener unsubscribed, and a `drag.move` whose
  listener ended the drag stops there; the viewer, which has no `vcGestures`, reports false;
  `interaction.browser.test.ts`); `appearance` (`appearance/`)
  reports `VALUE_CHAIN_THEMES` (`["light"]`, `appearance/themes.ts`, no runtime import, which
  both apps, the e2e suites, the smoke test and the extension host's theme bridge read) and writes
  `data-cd-theme="light"` and `data-cd-kontrast="hoch"` on `diagram.container`; the container sets
  `color` from `--cd-ui-text` and its high-contrast rules key on the nearest carrier, so the
  computed colours equal light on a dark page (`appearance.browser.test.ts`).
  `test/browser/support/pointer.ts` holds the pointer helpers, a `startGesture` on Order to Cash
  and the kit's harness fields `armTool` and `exportImage`; the conformance harness fills
  `startGesture` and `startPan` (the hand tool) on the Porter example. A view change never
  commits a label edit: the text box follows the view (`canvas.viewbox.changed`), only Enter,
  blur, `element.mousedown` and `drag.init` commit. The factories take the contract's
  `freeArea`/`fitOnImport`/`undoRedoKeys`. New elements get random ids.
  `test/browser/conformance.browser.test.ts` runs the kit, where a skip or an advisory fails.
- `read-only/VcReadOnly` is the edit lock of an invalid file; `diagram-menu/` holds the Export and
  Help entries and the shortcut groups (`diagramShortcuts`) both apps hand the shell, typed
  structurally (renderers never import the shell). Both apps open the dialog with
  `shell.showShortcutsDialog(diagramShortcuts(shell, …))`; the renderer's own
  `createShortcutsDialog` and `svgToPng` are `@deprecated` since 0.9.0 and go in 0.10.0
  ([#257](https://github.com/Miragon/modeler-suite/issues/257)), with the `.vc-shortcuts*` rules of
  `value-chain.css` that only that dialog uses.
- Mutations funnel through `vcModeling.updateProperties` (one undoable command handler).
- `modeling/VcLayouter` + `CroppingConnectionDocking` crop connections at the chevron
  contour (via the renderer's `getShapePath`).
- Connection type during connect/create drags comes from `vcConnect.pendingType`
  (read by `VcRules`, reset on interaction cleanup).

## Commands

- `npm run value-chain build`: schema-model (tsup) + renderer (vite lib) ·
  `npm run value-chain build:webapp` · `npm run value-chain build:vscode` (esbuild, bundles
  packages from source)
- `npm run value-chain dev:webapp`: editor at http://localhost:5181 ·
  `npm run value-chain dev:vscode`: watch build
- `npm run value-chain test`: unit (node; `packages/*/test` and `apps/*/test`, with a `vscode`
  mock) · `npm run value-chain test:browser`: Chromium (vitest browser mode; jsdom lacks
  `getBBox`, so renderer integration tests must be browser tests) · `npm run value-chain test:e2e`:
  Playwright in `e2e/`, project `webapp` (port `E2E_PORT`, default 5181) and `vscode-webview`
  (the webview inside the shell's VS Code stub, port `E2E_WEBVIEW_PORT`, default 5191), and
  `webapp-webkit` with the web app's Share and focus hand-back specs in WebKit
  (`npx playwright install chromium webkit` once) ·
  `npm run value-chain test:vscode`: the packaged extension in a real VS Code. It packs the VSIX
  (`vscode:prepublish`), unpacks it and runs `runVsCodeSmoke`
  (`@miragon/modeler-shell/testing/vscode-electron`) on `example/porter.vc.json`: chrome, the
  default palette edit, save checked by `parseDocumentJSON`, undo, VS Code's four default themes,
  screenshots in `test-results/vscode-smoke/`. Own Vitest config (`apps/vscode/test-smoke/`), never
  in `npm test`; no build needed; Linux needs `xvfb-run -a`; no retry (the shell's driver parses
  the save only once the tab is clean and the file holds still, and itself writes a theme switch VS
  Code missed again); `VSCODE_VERSION` picks the VS Code release, `VSCODE_SMOKE_VSIX` a prebuilt
  VSIX to test instead of packing one, `VSCODE_SMOKE_KEEP=1` keeps VS Code's logs; an agent running
  it on Linux under `xvfb-run -a` sees the timings with the flag given to the workspace, since the
  alias `npm run value-chain` passes no flag on:
  `npm run test:vscode -w @miragon/value-chain-modeler-workspace -- --reporter=default` ·
  `npm run value-chain test:vscode:docker`: the same test in a Linux container under
  `xvfb-run -a` (`modeler-shell-vscode-docker` of the shell; needs Docker, copies the suite without
  `node_modules`, runs `npm ci` there, caches VS Code in a Docker volume shared by every modeler),
  no VS Code window; prints the full log, no reporter flag (it rejects one); variables only via
  `npm run test:vscode:docker -w @miragon/value-chain-modeler-workspace -- --env NAME=value`, or
  `--env NAME` for the host's value, a variable set in front of `npm` does not reach the
  container. **From an agent, run this one, never `test:vscode` on macOS**: its VS Code window
  takes the user's focus (see [`CONTRIBUTING.md`](CONTRIBUTING.md#vs-code-smoke-test))
- `npm run check:build -w modelers/value-chain/apps/webapp`: after `build:webapp`, checks the head
  markup and the licence comments the production bundle must carry
- `npm run value-chain lint`: ESLint + typecheck · `npm run value-chain depcruise`: module-graph
  rules

Build packages before running unit tests (workspace deps resolve to `dist`). What CI runs, when the
VS Code smoke runs there, and how releases version and publish the packages (npm via trusted
publishing) and the extension (`miragon-gmbh.value-chain-modeler`, Marketplace, once the smoke test
passed on the VSIX it uploads) is in the suite's
[docs/ci-and-releases.md](../../docs/ci-and-releases.md).

## Conventions

- Pins follow the suite's rule; workspace cross-deps use the exact current workspace version
  (the release bumps them). The one exception:
  the runtime libs a host shares are ranged `peerDependencies` (`zod` in schema-model and
  renderer, `diagram-js`/`didi`/`tiny-svg` in the renderer), so a host dedupes them; a second
  copy breaks `instanceof`, schema identity and the diagram-js injector. Each is mirrored by an
  exact devDependency, and the apps take them as exact dependencies. See
  `.claude/rules/package-json-fixed-versions.md`.
- Keep `schema-model` DOM-free (P1). JSON serialization must stay deterministic
  (sorted ids, sorted keys, 3-decimal rounding).
- Conventional Commits with the scope `value-chain` (`feat(value-chain): …`,
  `fix(value-chain): …`), as everywhere in the suite.
- For value-chain domain work (notation, `*.vc` / `*.vc.json`), use the skill in
  [`.claude/skills/value-chain-modeling/`](.claude/skills/value-chain-modeling/).
- Contributor notes for this modeler in [`CONTRIBUTING.md`](CONTRIBUTING.md).
- The VS Code webview mounts `@miragon/modeler-shell` (`mountVsCodeShell`, IDE host, themes
  `VALUE_CHAIN_THEMES` of the renderer); the extension host renders its HTML with
  `renderWebviewHtml` and runs the theme bridge, both on the same list. Undo belongs to the
  document (`undoRedoKeys: false`); an invalid file locks the canvas
  (`vcReadOnly` + `shell.setReadOnly`). `apps/vscode/THIRD_PARTY_NOTICES.md` is generated
  (`npm run notices -w modelers/value-chain/apps/vscode`) and checked by a unit test.
- The extension's document plumbing is the shell's too: `apps/vscode/src/diagramEditor.ts`
  registers the custom editor with `registerModelerEditor` of
  `@miragon/modeler-shell/vscode/extension` (sync, echo suppression, minimal line edits, undo
  through the document, "Insert example", the problems pill), handing it `withExampleInserted`,
  the findings of `diagnostics.ts` (each one an error on the pill, dropped from the Problems view
  when the editor closes) and the export, and registers the commands with it (fit and export from
  an editor title button go to that button's diagram, from the Command Palette to the focused
  one). The webview's half is `connectDocumentSync`, whose `exportText` writes the canonical JSON,
  or keeps the document's own text while the canvas shows the diagram it describes, so a formatted
  file keeps its formatting until the diagram changes. The options that need no `vscode` live in
  `apps/vscode/src/diagramEditorOptions.ts`, which the e2e page also registers against the shell's
  host stub (`?host`, `e2e/tests/vscode/document-sync.spec.ts`).
- Both apps export the PNG through `svgToPng` of `@miragon/modeler-shell/export` with
  `background: COLORS.surround` (guide §10.7, `#F9F7F7`) and `onFontFallback`: the web app then
  toasts a warning ("Exported … in a system font. Geist couldn't be embedded.") instead of the
  success toast, the webview posts `fontFallback: true` with the export and the extension host
  shows the same sentence as a warning notification. A rejection shows the app's own sentence
  ("Couldn't export the diagram as PNG. Try again, or export it as SVG."), never `error.message`.
  The web app lets the shell read the page's Geist faces; the webview cannot fetch its font files
  (no `connect-src`), so `webview/geist.ts` hands the shell all five Geist subsets as
  `data:` URLs, which the `?dataurl` esbuild plugin of `esbuild.config.mjs` (and the Vite plugin
  of `e2e/webview/vite.config.ts`) inlines. The e2e suites read the corner pixel of the PNG.
- Both apps connect the shell with `connectDiagramJs(shell, diagram, { modeler, isEmpty })`: the
  shell fits to the contract instance's `contentBounds()`, `isEmpty` is the cheap
  `vcBounds.isEmpty()`. Both shell-conformance suites feed the kit's `labelEditor` hooks
  (`e2e/tests/support/label-editor.ts`: a double-click on a shape, then typing); the IDE suite
  declares `canvasMenuAction` absent, since its menu has no File or Model action.
- The web app mounts the same shell on its web host (`mountShell`, `host: 'web'`, themes
  `VALUE_CHAIN_THEMES`, also in `vite.config.ts`'s head markup): File/Export/Help menu, Share,
  legal line, toasts, start screen, the empty-file hint after "New diagram" (without "Insert
  example"), drop zone; no problems list, since a document that validates imports without
  warnings. `index.html` is static `data-cd-theme="light"`; the Vite plugin puts `webHeadMarkup`
  in place of `<!-- miragon-mode -->`. It runs `createCollaborativeModeler` (canvas undo keys on), autosaves
  the canonical JSON in `localStorage` and writes a share link (`#mz=`, deflate-raw) only on Share;
  the address bar keeps it only while it holds the diagram on the canvas. Replacing a diagram
  offers Undo instead of `confirm()`. `window.__valueChainApp` (shell, modeler, connection,
  `destroy()`) is the e2e handle.
- Write comments only for constraints the code cannot express itself.
