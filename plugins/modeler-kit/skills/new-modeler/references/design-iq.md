# Design IQ

Design IQ embeds a renderer in two places, its web editor and the MCP-App widgets, through one
spec per notation and the contract alone: no per-notation special cases. Adding the notation to
Design IQ is a change in Design IQ (a spec with `id`, `pkg`, `canvasClassName`,
`contractNotation` and a lazy `load()`); the renderer is ready for it when the following holds.

- **The contract factories** (`createCollaborativeModeler`, `createCollaborativeViewer`) are
  exported from the renderer's entry and accept `CollaborativeModelerOptions`: Design IQ passes
  `{ freeArea: { insets }, fitOnImport: false }` where its chrome covers the canvas (the widgets),
  `{ fitOnImport: false }` in its web editor, and `undoRedoKeys: true`.
- **The content bounds for Design IQ's fit.** Design IQ fits the view itself (hence `fitOnImport: false`;
  the diagram's import events tell it, see the host wiring below): after every import in the
  widgets, after the first import in its web editor, and in both places on its fit key and when its
  chrome changes. It fits to `modeler.contentBounds?.()` (contract 1.3), feature-detected on the
  instance the factory returned, never to a box read from a service inside `diagram`. So both
  factories report it, as the template does (see [contract](contract.md#the-factories)): the tight
  box of everything the canvas draws of the document, a plot or axes as well as the elements; no
  padding, since Design IQ's insets are the margin; in diagram coordinates and the same at every
  zoom; live after an edit and a peer's re-import; `undefined` only while nothing is drawn. Design
  IQ fits a read-only mount, the viewer, the same way, and the kit checks the viewer's box only
  where it has one, so a test pins both mounts (template:
  [`content-bounds.browser.test.ts`](../assets/template/packages/renderer/test/browser/content-bounds.browser.test.ts)).
  A renderer without it (1.2) still binds, but Design IQ then fits diagram-js's box of the
  elements, and whatever the notation draws beyond them ends up under the chrome or out of the
  frame.
- **Keys stay on the canvas** (contract 1.4, RECOMMENDED; the kit advises otherwise). Design IQ
  puts the canvas next to its own editors and toolbars, Monaco among them, so a key the canvas
  takes from there costs the user what they typed: the renderer acts on a key only while its
  canvas `<svg>` holds the focus, leaves `<body>` and every host control alone, and ignores a
  keydown or keyup without a key, in the viewer mount too ([contract](contract.md#keys)).
- **The notation id.** At bind time Design IQ checks `meta.notation` against the spec's
  `contractNotation` and `apiVersionsCompatible(meta.apiVersion, MODELER_API_VERSION)`. The
  contract id may differ from Design IQ's own id (`team-topologies` for `team-topology`), so pick it
  once and never change it.
- **Blank text** imports as an empty diagram, a rejected import keeps the last good canvas (L7),
  and view state survives a re-import (L5): the live sync re-imports every remote change.
- **The stylesheet is scoped by descendant.** Loaded into a single-page app that also hosts the
  bpmn-js and dmn-js editors, a renderer stylesheet would re-theme diagram-js classes globally, so
  Design IQ prefixes **every** rule with `.<canvasClassName> ` (selectors starting with `:root` stay
  global). The renderer's own root class must therefore sit inside the host element it is attached
  to, never on it (`attachTo(host)` appends the renderer's container), its dialogs and popovers
  live inside that host, and no rule may target `html`, `body` or the attach host itself. The
  package exports the sheet separately (`./assets/<notation>.css`), so a host loads it once.
- **Host wiring through `diagram`.** Design IQ reads the wrapped diagram structurally (`get`, `on`,
  `off`) for its menu (the renderer's menu content and shortcuts dialog), titles and a legend, so
  keep those builders in the renderer, typed structurally, never behind the shell. The shortcuts
  dialog needs a chrome with `root`, `platform`, `lang`, `messages` and
  `showShortcutsDialog(groups)`; a host without a mounted shell answers that with the shell's
  standalone `showShortcutsDialog(groups, { container })`. Design IQ's chrome has `root`,
  `platform`, `lang`, `messages` and `menu.trigger` but no `showShortcutsDialog` yet, so a renderer
  started from the template cannot open its dialog there until Design IQ moves to the standalone
  one. Its fit runs on the diagram as well: it writes the canvas's viewbox, counts a viewbox change
  it did not write as the user's move, and re-fits a view the user has not moved once an import is
  done. Only the box it fits to comes from the contract (`contentBounds()`, above), so a box only a
  service inside the diagram knows never reaches it. diagram-js fires no import events of its own, so the renderer fires them around every
  import, a peer's change re-imported through `importText` included: `import.render.start` (or
  `import.parse.start`) before the import touches the canvas, and `import.done` once it is drawn,
  as the template's [`Importer.ts`](../assets/template/packages/renderer/src/io/Importer.ts) and
  [`BaseViewer.ts`](../assets/template/packages/renderer/src/BaseViewer.ts) do. Without
  `import.done` a widget keeps its view after a peer's change; without the start event, whatever the
  renderer writes to the viewbox while it imports counts as the user's move and ends the re-fits.
- **Tokens in a layer** (see [design system](design-system.md#stylesheet-rules)), so Design IQ's own
  tokens win.
