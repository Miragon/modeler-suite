# CLAUDE.md

TypeScript modeler for the [C4 model](https://c4model.com) of software architecture, built on
[diagram-js](https://github.com/bpmn-io/diagram-js) (MIT): a web app and a VS Code extension on one
renderer. The source of truth is a Structurizr DSL workspace (a `.c4` file, or any `.dsl` file),
read and written losslessly: what the modeler does not interpret stays byte for byte, and the
layout of each view is stored as `properties` inside that view's block, so the file stays one the
Structurizr CLI, Structurizr local and the Structurizr server open. "Structurizr" is descriptive
only ("compatible with Structurizr DSL"); the READMEs and the Marketplace text say "Structurizr is a
product of Structurizr Limited; this project is not affiliated with or endorsed by Structurizr
Limited."

This modeler is `modelers/c4` in the Miragon modeler suite. The suite's
[`CLAUDE.md`](../../CLAUDE.md) holds the rules for every modeler (setup, commands, commits and
signing, exact pins, releases, the design system, the contract and shell boundaries); this file
adds what is special to C4. Run its scripts from the repository root as `npm run c4 <script>`, or
as `npm run <script>` inside `modelers/c4`.

## Packages

| Package                    | Purpose                                                                                                                                  | DOM |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `@miragon/c4-schema-model` | the C4 model of a workspace as plain data, identifiers, the view catalog and membership, implied relationships, styles, the layout codec | no  |
| `@miragon/c4-dsl`          | Structurizr DSL: lossless syntax tree, semantic builder with diagnostics and reject rules, the edit layer                                | no  |
| `@miragon/c4-layout`       | auto-layout (dagre), placement of unplaced elements, boundary and group frames, the title anchor                                         | no  |
| `@miragon/c4-renderer`     | diagram-js viewer and modeler, editing, navigation, inspector, menu, legend, the contract factories                                      | yes |
| `apps/webapp`              | the web app on `@miragon/modeler-shell` (`web` host)                                                                                     | yes |
| `apps/vscode`              | extension `c4-modeler`: custom editors `c4.editor` (`*.c4`) and `c4.dslEditor` (`*.dsl`) (`ide` host), language, diagnostics             | yes |
| `e2e`                      | Playwright, both hosts                                                                                                                   | yes |

`dsl` depends on `schema-model`, `layout` on `schema-model` and `@dagrejs/dagre`, the renderer on
all three and `@miragon/modeler-api`. The renderer keeps `@miragon/c4-layout` external in its
library build, so dagre is bundled once, by the apps.

**DOM boundary (P1):** `schema-model`, `dsl` and `layout` (named in
`modelerSuite.domFreePackages` of `package.json`) never import `diagram-js`, `tiny-svg`, `min-dom`
or use `window`/`document`, and take only types from `@miragon/modeler-api`. No package under
`packages/` imports `@miragon/modeler-shell`. ESLint and dependency-cruiser enforce both through the
suite's presets in `tooling/`. `@dagrejs/dagre` 3.1.1 (MIT; its ESM build inlines graphlib and uses
no `eval`, so it runs under the webview CSP; about 17 KB gzipped) is the only third-party runtime
dependency, and it lives in `layout` alone: the packages the extension host bundles (`dsl` and
`schema-model`, for parsing, diagnostics and Go to View) stay free of dependencies. No zod, no
React, no `packages/ui`.

## The file: Structurizr DSL

- The text is the document. `exportText()` returns the accepted text byte for byte (BOM, CRLF,
  tabs, comments); there is no model serializer. The syntax tree (`parseCst`,
  `packages/dsl/src/syntax/`) holds every byte, and `printCst(parseCst(text)) === text` for every
  text, pinned on the vendored fixtures and 10 000 seeded mutations of them.
- Every change, from a canvas gesture, the inspector, a dialog or the menu, is one `C4Edit` that
  `applyEdit` (`packages/dsl/src/edit/`) turns into `TextEdit`s against the current text, with
  their inverse. Before it answers, it parses the result and verifies it: the text still imports;
  no new error diagnostic (compared by code and statement, not by offset); the frame condition
  (`semanticDigest` of the result equals the expected change of the input's, so nothing else
  changed and no other element's id moved); implied relationships change only between the ends of
  what the edit added or removed; a created element exists and is a member of the view, a new
  relationship resolves both ends backwards. Otherwise it refuses with a reason and a message
  (`EditRefusal`), and nothing happens: no command, no event, a drag snaps back, and
  `c4.edit.refused` carries the message to the app, with its `level` (`refusalLevel(reason)`,
  `modeling/refusalLevel.ts`): `info` for every reason that explains a rule, `danger` only for
  `verification-failed`, a splice that failed its own verification. A refused value in the label
  editor or the inspector shows as a field error instead. Where a new statement goes (`place.ts`,
  `write.ts`) is pinned by the golden before/after pairs in `packages/dsl/test/edit/golden/`.
- `moveRelationshipEnd` (`edit/relationshipEnds.ts`, the `move-end-*` goldens) moves one end of
  an explicit relationship from its element to a direct child (a system's container, a
  container's component): Structurizr implies relationships upward only, so one written on the
  system itself never shows in its container view. One splice at the end's token keeps the
  assignee, the values, the block (tags, url, properties, perspectives) and every re-open byte for
  byte: `a -> b` and `this -> b` anywhere get the child's id (the dotted key in hierarchical mode)
  in place of the end; an implicit `-> b` in the scope's block or an `!element` re-open gets the
  child put before its operator (archetype operators too); `-> s` in the other end's block gets
  the child as its destination. First it prepares and pins the current view, writes the child's
  identifier if it has none, and names the relationship when its old pair has another unnamed one
  or the new pair already has one, so no key turns ambiguous; `idChanges` hold the relationship's
  renames from the key it was given to its final canvas key. Its bend key goes to
  `implied:<old src>-><old dst>` in each view that now draws that implied relationship instead,
  else it goes; `boxes` pins what the move brings into the current view. No
  `implied-relationship-appears` notice for what the moved relationship implies
  (`Intent.impliedFrom`). It refuses (info) an implied relationship, a target that is not a direct
  child, the new ends already connected with that description, a dynamic step that shows it or
  would show it in place of its own once it moves (a step written by its ends shows the first
  relationship between them, the one with its description first), an `!relationship` that names
  it by its ends, any `!relationships` in the workspace, a `${…}` end, a child defined below the
  statement (Structurizr reads top to bottom), and a view the canvas can't edit.
- Layout format, in the view's last `properties` block, one quoted key per element and per
  relationship, sorted: `"c4modeler.element.<ElementId>" "x,y"` (`"x,y,w,h"` when the size differs
  from the shape's default) and `"c4modeler.relationship.<key>" "x1,y1 x2,y2"` (the vertices; no
  key for a straight line). Integers in modeler units: `STRUCTURIZR_PX_PER_UNIT` is 15/8, so
  Structurizr's 450 × 300 box is 240 × 160 here. The `c4modeler.` prefix and the format are public
  once released: never rename them. Structurizr ignores the keys and lays views out itself.
- Relationship keys: the relationship's identifier, else `<src>-><dst>` for the only unnamed
  explicit relationship of a pair, `implied:<src>-><dst>` for an implied one; never positional and
  unchanged by a description edit. A second relationship drawn between a pair gets an identifier;
  duplicates typed into the text get no key until an edit names one.
- Pinning: a view without a `c4modeler.element.*` key is laid out automatically on every render
  (dagre, honouring its `autoLayout`). The first edit that changes its geometry or graph first
  writes the current box of every element of the view. Text edits never pin: the layout's input does
  not depend on text (relationship labels take a fixed 160 × 48 box), so a rename moves nothing. An
  element without a key in a pinned view is placed next to its first placed neighbour
  (`placeUnplaced`, a horizontal gap of 192 and a vertical one of 80, so a label fits between), in
  the clear where a place allows it: the straight lines to its placed neighbours cross no other box
  and no label slot (8 units off), and no line or label already drawn runs over the box. Beside a
  neighbour first, else the clear place nearest it (beside a sibling, or on a 16-unit grid around
  the neighbour, ring by ring, as far as the content reaches, with a label's room to each
  neighbour), and only where none is clear the first free slot as before; the frame rules hold for
  every candidate. A clear place whose frames keep 40 units from what they do not hold, and that
  keeps a label's room (192 across or 80 above and below) from every frame it does not belong to
  with the label of each of its lines 16 units off that frame's edge, comes before one that grows a
  frame up to a stranger or sits close to a frame, which stays the choice only where no other place
  keeps the line clear; the search reaches two gaps past the content for it. And the next edit that
  changes the geometry or graph writes its drawn box too, since that place depends on the graph.
  Add existing element writes the boxes of what it adds in the same edit (`includeInView` with
  `boxes`, which `C4Modeling` takes from a dry run of the edit). "Lay out automatically" removes the
  view's keys.
- New views are written with `include *` and `autoLayout tb 300 160` (`NEW_VIEW_AUTO_LAYOUT`), the
  values the modeler draws drafts with. `autoLayout` is never added to or removed from an existing
  view: Structurizr refuses a filtered view on a base with `autoLayout`
  ([`packages/dsl/test/README.md`](packages/dsl/test/README.md)).
- The contract's element ids are `ElementId`s: the explicit identifier (in hierarchical mode the
  dotted key), else an implicit identifier from `deriveIdentifier`, which the edit layer writes
  into the defining statement the first time a statement needs it. An id-stabilising pre-pass keeps
  every other element's id when an edit deletes or renames one. A palette create gets
  `<kind>_<4 random [0-9a-z]>` and stays fresh until its first name (the default name confirmed
  as it is counts), which renames the identifier everywhere (definition, references, layout keys)
  in the same edit; every import empties the
  fresh set. The factory option `identifiers: "collision-free"` keeps a random suffix after the
  first name, for hosts where peers edit one text.
- Views (`viewCatalog`, `packages/schema-model/src/views/`): written views (a keyless one under
  Structurizr's generated key, `SystemLandscape-001` …), implicit views (only while the workspace
  has no view at all: Structurizr's default views) and drafts (drill-down and parent targets not in
  the file yet, `include *`, listed as "Not in the file yet"). Implicit views and drafts carry the
  key they will be written under (`draftKey`: `SystemLandscape`, `SystemContext-<id>`,
  `Containers-<id>`, `Components-<id>`), so the edit that writes one is no view switch, and neither
  is its undo. Navigating never writes. The first view written into a workspace without views also
  writes all of its implicit views, so Structurizr keeps showing the same list.
- The canvas edits system landscape, system context, container and component views whose
  expressions it supports (`views/expressions.ts`); a view with another expression term is drawn
  without it and read-only. Deployment, dynamic, filtered, custom and image views are listed in
  Views… as "Shown in Structurizr only" and never opened. Deployment environments, `!docs`,
  `!adrs`, `!script`, `!plugin`, `!include` (not read: an open world), `!elements` and
  `!relationships` (not evaluated: what they could set is read-only), constants (a field set with
  `${NAME}` is read-only), themes and unknown statements stay as written.
- Rejects (contract L7) only where an edit could hit the wrong bytes: unbalanced blocks or an
  unterminated `/*` or `"""`, not exactly one `workspace` block or another statement outside it
  than the top-level directives, a second `model` or `views`, a duplicate identifier, a duplicate
  view key, an element keyword in a context that does not allow it. Everything else imports with
  diagnostics. What Structurizr 6.2.4 refuses but the canvas can show (an unresolved reference, a
  duplicate name, a relationship Structurizr would refuse, a trailing comment) is a compatibility
  error: `severity: "error"`, `rejects: false`, shown in the problems pill and the Problems view,
  with no lock.
- Structurizr 6.2.4 is the reference. Its 107 DSL test fixtures are vendored unchanged in
  `packages/dsl/test/fixtures/structurizr/` (Apache-2.0; `LICENSE`, and `NOTICE.md` names the
  commit). `packages/dsl/scripts/structurizr-snapshots/` (Java 17 and Maven, not in CI) records
  what the reference parser makes of them and of the builder's own cases
  (`test/fixtures/snapshots/*.json`), which the builder tests compare with.
  `edit-acceptance.json` records that Structurizr accepts every golden after-file and 200 edit-fuzz
  outputs, and `acceptance.test.ts` fails once a golden or the edit layer changed without a new
  run: after any change under `packages/dsl/src/edit/`, run the commands in
  [`packages/dsl/test/README.md`](packages/dsl/test/README.md).

## Renderer architecture

- One root and one view on the canvas at a time. The truth is the `DocumentStore` (service
  `c4Document`): `{ parse, view, fresh }`, where `parse` holds the text, the syntax tree, the
  `Workspace` and the diagnostics. Nothing on the canvas is authoritative: a shape carries a
  reference only, `c4: { role, id }` for an element or a boundary and `c4: { role, key, implied }`
  for a relationship (never `label`, which diagram-js reserves). Canvas ids are the `ElementId`,
  `boundary:<id>`, `rel:<key>` and the root `c4:root`.
- `C4Engine` (service `c4Engine`, `engine/C4Engine.ts`, `createC4Engine()`) is the one seam to the
  DOM-free packages: parse, apply an edit, apply text edits, semantic equality, catalog,
  membership, layout, and the frames around given boxes (`frames`, the layout's `viewFrames`, no
  dagre, for a drag's preview). Browser tests swap it (`test/browser/support/stack.ts`); the interaction
  tests keep a stand-in engine in `support/interaction/` that they use only while the real one
  refuses their probe edits.
- `C4Modeling extends Modeling` (`modeling/`) replaces diagram-js's ModelingModule. `getHandlers()`
  registers only `c4.document.change` (`DOCUMENT_CHANGE`), and every stock call of the interaction
  modules (move, create, connect, resize, bendpoint and segment moves, delete) becomes a `C4Edit`
  that is applied and verified before `commandStack.execute`. A call returns what its caller
  expects (the registered shape of a create, `undefined` when refused); a stock method no gesture
  may reach throws `C4UnsupportedOperationError`. The domain methods (`editElement`,
  `createRelationship`, `editRelationship`, `moveRelationshipEnd`, `renameIdentifier`,
  `removeFromView`, `deleteFromModel`, `includeInView`, `createView`, `editView`, `deleteView`,
  `layOutAutomatically`, `editWorkspace`, `applyC4Colours`, `insertExample`) take the same path;
  the contract wrapper exposes them as `modeler.c4`. `moveRelationshipEnd` pins what the move
  brings into the view where a dry run of the same edit draws it, as `includeInView` does. A
  relationship drawn (connect, Add relationship…, an append) in a landscape or context view on a
  software system with containers fires `c4.edit.notice` once per modeler, with
  `notice: "relationship-above-containers"` and its own words (`modeling/levelNotice.ts`:
  "Bookshop → CRM connects the systems themselves, so Bookshop's container view won't show it.
  Draw it from a container, or use Move to a container…").
- `DocumentChangeHandler`: one command per change, whose context holds reversible text patches
  guarded by text hashes, the view before and after and the id changes, never a shape. A hash that
  does not match is a `C4HistoryMismatchError`, a bug: between imports only this handler changes
  the text. Undoing a change made in another view switches back to it inside the revert and
  selects what the change shows differently there (`modeling/changedItems.ts`), revealed once the
  host has restored or fitted the view's place; so does such a redo. The web
  app's history crosses views; in VS Code the document owns undo (`undoRedoKeys: false`) and every
  import clears the stack.
- `Reconciler.sync(scene, idChanges)` (`reconcile/`) is the one in-place diff for imports, view
  switches and commands; there is no full render. A kept id keeps its shape object, so the selection
  and an open label editor survive; an id change migrates the shape (`elementRegistry.updateId`).
  The z-order is boundaries, elements, relationships, by insertion index. Group frames (layer
  `c4-frames`) and the title block (layer `c4-title`) are drawn outside diagram-js's elements. Each
  relationship's label lies in the layer `c4-labels` above the plane (`draw/RelationshipLabels.ts`),
  as its connection's secondary graphics in the element registry: every label sits above every line,
  a click on it resolves to its own relationship where another line crosses it, every marker (hover,
  selected, dragging) reaches it, and `restoreOrder` keeps the labels in the lines' order.
  diagram-js's previews know only the primary graphics: a move's preview gets the label of each
  relationship it carries whole, and the previews of a move, a create and a resize go into the layer
  `c4-drag` right above the labels, so no label covers what is dragged. `buildScene` (`scene/`,
  service `c4Scene`, memoised per text hash and view) turns `(parse, view)` into the `Scene`
  everything draws from.
- `ViewService` (service `c4Views`, `views/`): `open(key, { cause })` switches the view and fires
  `c4.view.changed { view, previous, cause }` (`VIEW_CHANGED_EVENT`), with the causes `user`,
  `reveal`, `host`, `undo`, `redo`, `rekey` (an edit renamed the scope of the draft shown) and
  `removed` (an edit deleted the view shown). Imports never fire it. Both apps pass
  `fitOnImport: false` and fit, or restore the remembered viewbox (`views.viewboxFor(key)`), on
  that event themselves.
- `importText(text, { view })` parses first, so a rejection throws before anything is touched,
  then ends a running gesture, suspends the label editor, syncs and clears the history silently.
  `view` is renderer-only (the VS Code webview keeps its view across a re-import); a contract
  import shows the default view. `rebaseText(text)` takes a text that differs only in formatting
  or comments (`semanticallyEqual`) without a render, and returns `false`, changing nothing, for
  any other text: the store keeps the new bytes; the view, the shapes, a running gesture and an
  open label editor stay; the history goes, since its patches point at the old bytes; and
  `c4.text.rebased` (`TEXT_REBASED_EVENT`) fires, on which what shows text positions redraws (the
  inspector's "Defined on line N", an open dialog, the breadcrumb). It fires no `import.done` and
  no content change. The webview calls it first, so the store never writes stale bytes back over
  a formatter's change.
- Gestures are the template's (`gestures/Gestures.ts`: `holdAction`, `actionEnded`, `cancel`,
  `tearDownAfterHandler`), with `global-connect` among the prefixes that are no gesture, so an
  armed connect tool survives an import. A pointer create opens the name editor after its drop,
  held with `holdAction()` (`palette/CreateNameEditor.ts`), and a new relationship its description
  the same way (`label-editing/ConnectLabelEditor.ts`), Tab going on to the technology.
- Contract (`collaborative/`, notation `c4`): `getViewState()` is `{ view, x, y, width, height }` in
  this key order; `setViewState` may switch views and joins the import queue; `elements.list()`
  holds the current view's elements in document order, then its boundaries; `elements.reveal(id)`
  may switch to the first written view that shows the element; `contentBounds()` comes from the
  scene (boxes, frames, route points, label boxes and, for a label with text, its 240 × 72 reach,
  the title of fixed height and of the width the title can be drawn at most, `text/estimate.ts`),
  `undefined` for a view that draws nothing. `isModelEmpty()` drives the empty-file hint: the hint
  is about the file, not the view. The kit runs in
  [`conformance.browser.test.ts`](packages/renderer/test/browser/conformance.browser.test.ts) on the
  fixtures in `test/browser/fixtures/` (the canonical `bookshop.dsl` and `library.dsl`, written by
  the edit layer and reviewed byte by byte, and a loose and a foreign variant); a skip or an
  advisory fails it. The harness waits for the Geist faces before it creates a modeler, so no font
  relayout changes wrapped lines between two exports. `invariant.browser.test.ts` imports
  `exportText()` into a fresh instance after every step, and in a seeded fuzz, and compares ids,
  references and boxes.
- `Viewer` holds the store, engine, scene, reconciler, views and drawing without a command stack;
  `NavigatedViewer` adds zoom, pan, selection and the navigation (drill badge, Enter, U), and is
  the contract's read-only mount; `Modeler` adds editing, the read-only lock of an invalid file,
  palette, context pad, label editing, keys and gestures.

## Canvas editing

- Palette (`palette/`): Lasso (L), Hand (H), Connect (C, Lucide `workflow`), then the entries of the
  view type: Person and Software System in every view, Container and Database in container and
  component views, Component in component views. Database is a container tagged `Database`, plus
  `element "Database" { shape cylinder }` when the workspace has no style for that tag. The parent
  comes from the view's scope, never from the drop position, and when the view's `include` would
  not take the new element, the create writes `include <id>` into that view. Each creating entry
  shows the look and size its element lands in (`SceneLookup.createdStyle`: the workspace's styles
  for the kind and tags, the Database cylinder its create adds, a blank file's skeleton colours),
  and so does the create's drag preview, see-through (`frame-preview/CreatePreviewLook.ts`). The
  entries follow the view: `ViewService.refreshPalette()` calls `palette._rebuild()` whenever an
  import, a view switch or a command changes `PaletteProvider.signature()` (the view's type,
  whether it is editable, the entries' looks, so "Apply C4 colours" too). Enter or Space on an
  entry (`palette/freeSpot.ts`) takes the free area's centre, else 24 units further diagonally,
  else the visible spot nearest it, clear by 48 (then 24, then 0) of every element, label and
  frame the element does not join, and not where a frame it joins would grow over a stranger;
  with no spot in view clear by 24 (a crowded view zoomed in), the clear spot nearest it around
  the content, which the canvas pans to the middle of the free area; only with none at all, in
  view where it covers the least. Where the view draws something, the free area leaves out what
  the shell's inspector covers once the new element's selection opens it (`palette/inspectorCover.ts`:
  its `data-chrome="inspector"` island, the side panel's 12 + 288 + 24 px on the right, the bottom
  sheet's 45% up to `--cd-shell-schmal`, measured once it shows), so the name editor never opens
  under it; the first element of an empty view still goes where the hint stood, the view unmoved
  (the shell kit's `emptyFile` case).
- Move and create feedback (`frame-preview/`, `gestures/`): while a member moves, a palette create
  follows the pointer or an element is resized, every boundary and group frame the drop changes is
  drawn dashed in `--cd-ui-interaktion` where it will be, in `--cd-ui-danger` when it would run over
  an element it does not hold (the drop is allowed), and the frame as drawn fades. A frame that
  stays put shows in `--cd-ui-danger` too while the dragged or created element would land over it
  without belonging to it, since a stranger inside a frame reads as a member. Each previewed frame
  carries its caption, and a warning one a chip above it with Lucide `triangle-alert` and what it
  runs over ("Overlaps Customer"), so the warning never shows by colour alone (guide §3.3). The chip
  keeps 8px clear of the breadcrumb and the shell's `data-chrome` islands, read once when the drag
  starts, and stays in view (`frame-preview/chipPlace.ts`): above the frame's top left, else slid
  right along the top, else below the frame, else just inside a boundary's top edge (a chip wider
  than its frame stands at the frame's left); where none is clear, above the top left. Snapping is
  diagram-js's to the other elements' centres and sides, never to a boundary
  (`gestures/C4Snapping.ts`), with snap lines in `--cd-ui-kontur`; no grid. A drag that carries
  something scrolls at the canvas edge and moves again after each scroll, so the preview stays under
  the pointer (`gestures/PanAwareAutoScroll.ts`); an armed tool and a pan never scroll.
- Rules (`rules/C4Rules.ts`) answer every action a loaded module asks: `C4Modeling` registers no
  stock handler, so an action no rule answers would be refused without a word. Boundaries are
  derived frames, never parents: moving one moves its members, and nothing is ever reparented.
- Connect feedback (`rules/C4Connect.ts`, guide §10.1, §10.4): `connection.create` and
  `connection.updateWaypoints` answer `RELATIONSHIP_PREVIEW` (role `relationshipPreview`), which
  diagram-js's connection preview (loaded with the context pad) draws as the dashed line and
  chevron in `cd-c-stroke-interaktion`, docked on the target's outline; the canvas, a boundary and
  a relationship are no target (`null`, no forbidden mark). The source carries `c4-connect-source`
  while the gesture runs; diagram-js's connect markers paint `c4-feedback`, a ring around the
  element's outline drawn as its first visual child (hidden at rest, stripped from exports), so a
  marker never repaints a C4 fill. A refused A → B never writes B → A (diagram-js's reverse try),
  and its drop fires `c4.edit.refused` with the edit layer's words.
- Context pad (`context-pad/`): the appends, Connect, Edit name, Edit description, Edit technology
  (containers, components), Remove from view (not for the system of its own system context view)
  and Delete from model on an element; the edits and both deletes on an explicit relationship;
  Remove from view on an implied one; no pad on a boundary. One column like the family's, a
  separator after the appends and before the deletes, the trash neutral until hovered; a
  relationship's pad turns into a row where the column would cover an end, and an element's moves
  up or down into the canvas at its edge while it still runs beside the element. A pointer action
  on an entry hands the focus back to
  the canvas, unless the action focused something itself (an editor, a confirmation, which on
  closing gives it to the canvas too, not to the pressed entry), and a
  relationship's pad stays closed while its label editor is open. No entry switches the view: the
  shell kit's overlay case clicks every entry that is not a delete. By keyboard
  (`context-pad/PadKeyboard.ts`, Wardley Maps' pad, guide §5.5's toolbar): the pad is a
  `role="toolbar"` ("Element actions", "Relationship actions", "Selection actions") with
  `aria-orientation` and one roving tab stop, its entries `role="button"` named by their titles;
  `C4ContextPad` puts it right after the canvas `<svg>`, so Tab from the canvas reaches it before
  the breadcrumb and the shell's inspector. The arrows move through every entry across the
  separators and wrap, Home and End jump, Escape focuses the canvas and keeps the selection, Enter
  and Space (not a held key's repeats, not with Cmd, Ctrl or Alt) run the entry's `keyboard`
  action: an append is the click append with its name editor chain, Connect opens Add
  relationship… from the element (`showAddRelationship`), a delete keeps its confirmation, and an
  action that took the entry away leaves the focus on the canvas. A pad built anew under a focused
  entry (an undo, a host's import) focuses the same entry, or the canvas when it has none
  (`PAD_FOCUS_DROPPED_EVENT`). The focus ring is the palette's: `--cd-ui-fokus` 2px outside, 2px
  wide, 3px in high contrast, `Highlight` under forced colours.
- Append (`context-pad/C4Append.ts`, the family's): one entry per kind the view creates, in the
  palette's order and look ("Append person", "Append database"), adds that element with a
  relationship from the selected one as one `createElement` edit with `connectFrom`, so one undo
  step. A click places it where the view places an unplaced element connected to the source
  (`placeUnplaced`, from a dry run of the same edit: beside it, clear of every box and frame, in
  its parent's frame without that frame reaching a stranger, its line in the clear where any such
  place allows it) and pins it there, moved onto the
  source's axis where the 8-unit grid left it up to 4 units off, unless a frame would then reach
  something new (`modeling/appendPlace.ts`), so the line runs straight; a drag is
  diagram-js's create with the source (`C4Modeling.appendShape`), the relationship's line drawn
  from the source while the element follows the pointer, and it stays an append when dropped over
  another element. The new element is selected and its name editor opens; Enter there (after its
  other fields, by Tab) goes on to the relationship's description, Tab to its technology; Escape,
  a click away or another key ends the chain. The relationship comes before the include, so an
  element the view's `include *` takes through it gets no `include` line.
- Delete and Backspace are the smart delete (`planSmartDelete` in the dsl): an element or explicit
  relationship that no other written view shows, and that no dynamic step, deployment instance or
  scoped view needs, goes from the model, anything else from this view; an implied relationship
  always from the view. Shift+Delete, the pad and the inspector delete from the model, after a
  confirmation when the cascade reaches beyond the selection (descendants, other views, dynamic
  steps, deployment instances; `navigation/impact.ts`).
- Label editing (`label-editing/`): one textarea over the band of the field under the pointer
  (`elementTextLayout` gives the drawing, the editor and the hit test the same bands). Fields:
  name, description, technology, metadata, and a relationship's description and technology. E
  opens the name (a relationship's description), Tab commits and opens the next band (an empty one
  of a relationship next to the band it has), Shift+Enter breaks a description line (written as
  `\n`); `openEdit()` returns `{ elementId, text, field }`. An empty field shows its name as the
  placeholder; a note under the field says when the canvas would cut the text short. A
  double-click on a field that cannot be edited here names its reason at the band, clear of the
  open pad (an implied relationship: "Comes from A → B. Edit it there."), and a refused value
  dropped by a click away goes to the app as `c4.edit.refused`. Escape on the canvas clears the
  selection. A suspended edit whose element the imported view no longer shows stays parked until
  a view switch shows it again.
- Navigation (`navigation/`): the drill badge on a software system or container, Enter on one
  selected element and the inspector's "In views" open the view one level deeper (the first
  written one, else the draft); U and Model › Parent view go up; G and Model › Views… open the
  views dialog (a table per editable type on one set of columns, the other views, and New view… in
  its footer, which opens the New view dialog). The other dialogs are View settings… (title,
  description, Delete view…), Add existing element…, Add relationship… (the inspector's, from its
  element, and the Model menu's, both ends chosen and started on the selected elements: the
  keyboard's way to draw one), Workspace settings… and the Delete from model confirmation; a form
  dialog starts on its first field, Add existing element on its search. What Add existing element
  adds ends up selected and scrolled into the free area, zoomed out where it does not fit there
  (`navigation/reveal.ts`, also after an undo across views). All open on the
  shell's dialog, which the apps hand in with `connectDialogs(modeler, { container, openDialog })`.
  A container or component view whose scope frame holds nothing shows "No containers yet" (or
  components) and "Add one from the palette." inside the frame, in the modeler and while it is
  editable (`navigation/EmptyScopeHint.ts`): a diagram-js overlay, so never in an export, without
  pointer events, hidden while a palette create is dragged.
- Hidden relationships (`navigation/HiddenRelationshipsHint.ts`, `MoveRelationshipDialog.ts`,
  `hiddenScopeRelationships` in the schema-model's `views/hiddenRelationships.ts`): a container or
  component view counts the explicit relationships written on its scope itself whose other end E
  lies outside it, unless the view draws the same direction between an element inside the scope
  and E (or an element inside E), explicit or implied. With at least one, in the modeler, while
  the view is editable, not read-only, the dialogs are connected (`c4.dialogs.connected`) and the
  scope has a child to assign to (else the empty scope hint says to add one), a `<button>` chip
  stands on the breadcrumb's line 8px after it: Lucide `info` in `--cd-ui-info`, the info surface
  and border, "1 relationship of Bookshop isn't shown here" / "2 relationships of Bookshop aren't
  shown here"; HTML after the `<nav>`, so Tab reaches it after the path and no export draws it;
  it goes compact (icon and count, its words in `aria-label` and `title`) before a crumb is cut,
  and covered with the path. It recomputes on every import, view switch, command, rebase and lock
  change. It opens Move to a container (Move to a component in a component view):
  one or two sentences on why ("These relationships connect to Bookshop itself, so this view can't
  tell which container makes or takes the call. Assign each one to a container to show it here."),
  then per relationship a fieldset with "Bookshop → CRM" as its legend, its description and
  `[technology]`, a "Container of Bookshop" select of the scope's children in document order, and
  Assign, Done in the footer; it starts on the first select, follows the document and keeps the
  choices. Assign is one `moveRelationshipEnd` command; a refusal stays at its row as a field
  error; on success the dialog closes and the canvas selects the moved relationship alone (or the
  implied one the view draws in its place), so the inspector shows it, and reveals it with E.
- Breadcrumb (`navigation/Breadcrumbs.ts`, NavigatedViewer and Modeler): the `parentOf` chain from
  the landscape down to the view shown, "System landscape › Bookshop context › Bookshop containers ›
  API components"; a container view's parent is its system's context view, a draft when the file has
  none, so neither the path nor U skips that level. Each view above a `<button>` that opens it
  (cause `user`, drafts too) and hands the focus to the canvas, the view shown
  `aria-current="page"`, followed by "Not in the file yet" while it is a draft (the first part to
  give way when the path runs out of room); hidden at a view without a parent, like bpmn-js's. It
  redraws on `import.done`, `c4.view.changed`, `commandStack.changed` (a rename of a scope, a
  written draft) and `c4.text.rebased`. A `<nav>` in diagram-js's container after the `<svg>`
  (z-index 10, HTML, so never in an export): Tab reaches it after the canvas and its context pad,
  the shell's order before it stays. 24 high under the menu trigger on the free line (64, below a
  second-row palette 116), ending on the fit's top inset; glass like the web app's legal line. It
  ends 8px before a shell island beside it and steps aside while one covers its start (`data-chrome`
  islands of the shell's root, observed); a path too wide gives way by `fitCrumbs`: the names above,
  the current name, the levels above, the current level. No drill-up badge on a boundary: the
  breadcrumb is the one way up a pointer, a keyboard and a screen reader share. `setTrailing`
  places an element on its line right after it (the hidden relationships' chip): the path leaves
  it room, the draft note gives way first, then the element's words (`data-compact`), then the
  names; it is covered (`data-covered`) with the path, or alone where not even its compact form
  fits.
- Inspector (`inspector/`): plain DOM in the shell's `inspector` slot (`mountInspector`), with Team
  Topologies' behaviour: type, name, technology, metadata, description, tags, URL, identifier (a
  refactoring rename), "In views", the drill as a button of its own and, in VS Code, "Defined on
  line N"; the tags offer External (the tag "Existing System", where the styles use it) and the
  other styled tags; Add relationship…; a relationship's ends and fields, an implied one read-only
  ("Implied by A → B") with Select it or Open <view> of its origin; an explicit relationship with
  an end a level up (`endsWithChildren`: a software system with containers in a landscape or
  context view, a container with components in a container or component view) gets Move to a
  container… (or Move to a component…), which opens the hidden relationships' dialog for it. A
  read-only field names its reason (a constant, a bulk statement). `commitDraft()` serves the VS
  Code save flush.
- Menu (`menu/`): `c4Menu` hands the shell the Model group in this order, pinned by `menu.test.ts`:
  Views…, Parent view, Lay out automatically, Add existing element…, Add relationship…, View
  settings…, Workspace settings…, Apply C4 colours, then the shell's Legend checkbox; plus Export
  (PNG, SVG, and in the web app Export as .c4 and Export as Structurizr DSL (.dsl)) and Help. At a
  landscape Parent view is disabled, so Lay out automatically is the first canvas action of the
  group, the one the shell kit's focus hand-back runs twice; a second run changes nothing.
  `c4Shortcuts` lists the keys: the web app's File group (`fileKeys`), the canvas's own View row,
  Edit (the label editor's keys, Esc, the Delete row with what the smart delete does, the context
  pad's keys last), Tools and Navigation. "Lay out automatically" fires `c4.layout.applied`
  (`LAYOUT_APPLIED_EVENT`) after a command that changed the layout, on which both apps fit; the
  smart delete fires `c4.delete.done` (`DELETE_DONE_EVENT`) with the names of what went from the
  model and what only from the view, which `deleteDoneText` words the same for both apps. Both apps
  fit clear of the breadcrumb, 8px below it (`insetsClearOfBreadcrumb`, handed to `connectDiagramJs`
  and the free area in place of `shell.fitInsets`).
- Resize: element shapes only, at least 140 × 100 (a person 140 × 140), stored as `w,h` only while
  the size differs from the default. Bendpoints are diagram-js's: straight segments through the
  vertices, docked on the drawn outline. A press anywhere on a line, the middle of a straight
  segment too, inserts one bendpoint (`rules/C4SegmentInsert.ts` replaces diagram-js's segment
  move); a vertex dropped inside an end's box is left out, and the drag's preview leaves it out
  already (`C4ConnectionDocking`, docked as the reconciler docks); the handles at the ends are hidden
  (`rules/C4BendpointEnds.ts`), since reconnecting is not in v1, and so is the handle on a fan's
  bend (below). No copy and paste in v1.
- Lines of one pair (`layout/src/relationships.ts`): where a pair has several lines without vertices
  (a two-way pair, an explicit relationship beside the implied one, two descriptions), each bends
  once halfway across the gap (the layout's `routes`, the scene's `route`), the bends as far apart
  as a label's ground may grow (`LABEL_REACH`, 240 × 72) and a gap: its height across the pair, its
  width up and down. So the labels at the bends never meet, however long their text, and no line of
  the pair runs through another's label; an odd count keeps its middle line straight. A bend is
  drawn, never written: the scene's `vertices` stay the stored ones, and a bendpoint gesture keeps
  the points the user placed or moved and drops the bend (`withoutFanBend`, in the preview's docking
  and in `updateWaypoints`). The bend shows no handle (`c4-bendpoint-fan`), since its label sits on
  it, nor does the floating handle while it snaps to the bend; a press there still moves it, into a
  vertex of the user's, and a vertex the user placed keeps its handle. Each label slot slides along
  its route between a quarter and three quarters of the way, starting halfway (a fanned line's at
  its bend), until it clears the slots before it and every element that is not its end;
  deterministic and without text. While a connect runs, a relationship or a boundary under the
  pointer keeps the canvas's cursor.

## Drawing and design system

- `cd-tokens.generated.css`, `cd-tokens.generated.json` and `cd-canvas.css` are vendored unchanged
  (design system 1.27.0) into `packages/renderer/src/theme/`; re-copy them to update, never edit
  them. [`assets/c4.css`](packages/renderer/src/assets/c4.css) loads them in guide §10.3's order and
  reads only the `--cd-ui-*` roles and the mode-independent tokens. The dialogs' `navigation/forms.css`
  fills the primary and the destructive button with guide §8's fixed `--cd-blau` and `--cd-danger`,
  the suite's one exception (root `CLAUDE.md`). Drift tests:
  [`theme.sync.test.ts`](packages/renderer/test/theme.sync.test.ts) (the vendored files' hashes,
  `c4.css` on roles only, `ROLE_LIGHT` against the light tokens, no colour literal in the drawing),
  `apps/vscode/test/tokens.sync.test.ts` (the shell's sizes against the tokens) and
  `peer-dependencies.sync.test.ts` (the ranged peers).
- The default look is roles only, as Structurizr 6's own default is monochrome: fill
  `cd-c-fill-plot`, outline `cd-c-stroke-text`, relationships and frames `cd-c-stroke-kontur`.
  Every node with a role class also carries the role's light value as a presentation attribute
  (`ROLE_LIGHT` and `applyRole` in `draw/styles.ts`), because the export strips the classes
  (`io/saveSvg.ts`) and must stay light.
- Export (`saveSVG`, `io/saveSvg.ts`): a clone of the canvas's own `<svg>` (the shell moves the
  palette, with its icon `<svg>`s, into the same container), framed on `contentBounds(20)` (800 ×
  600 at 0,0 for a view that draws nothing). It strips what only the live canvas uses: `tabindex`,
  `role`, `aria-label` and `aria-roledescription`, diagram-js's outlines, hit areas, bendpoints,
  resize handles and selection outlines (so a selection exports the same picture as none), the
  feedback ring, the drill badge and every `cd-c-*` role class. The title block stays. The SVG has
  no ground of its own, as the family's have none, so a label ground in the canvas's ground
  (`cd-c-fill-grund`) is cut out instead of drawn: one mask on every layer below `c4-labels` (and
  one on an earlier label it overlaps), its id from what it cuts, and the rect dropped. The SVG
  then shows the page under a label as the canvas shows its ground; grounds in a boundary's fill
  or the plot white stay as drawn. The apps rasterise it on `COLORS.paper` for PNG, which looks as
  before; the VS Code webview embeds Geist as data URLs, since its CSP fetches no font.
- Colours from the workspace's styles (`background`, `stroke`, `color`, by tag order, `light`
  blocks applied) are self-set colours (guide §10.6), drawn as attributes without a class: a text
  colour that misses 4.5:1 on its fill becomes black or white, whichever contrasts more, and a
  missing stroke is derived from the fill until it reaches 3:1 on the canvas ground.
- "Apply C4 colours" writes `C4_COLOUR_STYLES`
  ([`schema-model/src/notation.ts`](packages/schema-model/src/notation.ts), between
  `// brand-lint-disable` and `// brand-lint-enable`): the classic C4 palette tuned to text 4.5:1
  and lines 3:1, none of it the interaction blue. New workspaces carry the block from the start,
  as every modeler of the suite shows its notation colours: `newWorkspaceText()` (New diagram, New
  Empty C4 Diagram, and the skeleton the first edit of a blank file writes) is the text "Apply C4
  colours" makes of an empty workspace (a blank one as well), so that entry changes nothing on it,
  and both "Insert example" paths take it for empty. The example ships with the block too.
  `packages/schema-model/test/notation-contrast.test.ts` pins the values and the derived-stroke
  rule, `notation-contrast.browser.test.ts` measures every text and line the canvas draws.
- Shapes (`draw/shapes.ts`): Box, RoundedBox, Person, Cylinder, Pipe, WebBrowser, Window, the
  mobile devices, Hexagon, Folder, Component, Ellipse, Circle, Diamond; Robot, Bucket, Terminal and
  Shell are drawn as a substitute (info `shape-substituted`). Default sizes are Structurizr's ×
  8/15 (a box 240 × 160, a person 216 × 216).
- Text (`text/`): Geist on every text node, measured on one shared 2D canvas; name 15/600, the type
  line 12 (`[Container: Kotlin]`), description 13; laid out again once the font arrives
  (`draw/FontRelayout.ts`); nothing is drawn outside its box. The type line takes up to two balanced
  lines. A relationship's label is centred on its fixed 160 × 48 slot: up to three description and
  two technology lines, balanced, on a ground that keeps the slot's width while the text fits it in
  up to 72 high and widens up to 240 for the rest (`LABEL_REACH`); only what does not fit 240 × 72
  ends in an ellipsis. A band cut short gets a hit of its own titled with the whole text
  (`c4-cut-band`), which the export drops with every hit. The ground shows what lies behind the
  label (guide §10.1, Label-Halo): `cd-c-fill-grund`, the fill of the innermost filled boundary
  under it, or the plot white where its text would lose 4.5:1 there; arrowheads are an open chevron
  in the line's stroke role.
- Boundaries are dashed frames with their caption bottom left; their hit area is the stroke and
  the caption, so a click inside reaches the members. Groups are dotted frames in `c4-frames`,
  each `data-group` its `groupKey(scopeId, path)`: `<scopeId>/<path>`, with an empty scope at
  model level, the key the scene and the layout's `geometry.groups` use too, so a model-level
  group and a system's group of one name are two frames. The
  title block (title and description, 62 high) sits in `c4-title` and is exported; a view that
  draws nothing has none. The drill badge (Lucide `zoom-in` and the child count) is part of the
  shape and stripped from exports; its hit is titled with the view it opens ("Open Bookshop
  containers (Enter)"). Icons are Lucide (`draw/lucide.ts`).
- Legend (`legend/`): one row per element look, boundary kind, the groups and relationship look of
  the view, rendered into the shell's live legend body by `connectLegend`.
- `THEMES` is `["light"]` ([`themes.ts`](packages/renderer/src/themes.ts); Node code reads
  `@miragon/c4-renderer/themes`).
- Still open: the design-system amendment for the Model entries, the drill badge, the title block,
  the open chevron, the C4 palette and the hidden relationships' chip after the breadcrumb.

## Apps

- Web app ([`apps/webapp/src/main.ts`](apps/webapp/src/main.ts)):
  `createCollaborativeModeler({ additionalModules: [shellModule], fitOnImport: false, freeArea })`,
  then `mountShell` on the `web` host with `c4Menu`, the dialogs, the inspector, the legend, the
  shortcuts dialog and `connectDiagramJs(…, { isEmpty: () => modeler.isModelEmpty() })`. File
  group: New diagram (`newWorkspaceText()`), Open… and the drop zone (`.c4`, `.dsl`, `.txt`), Show
  example ([`example/bookshop.c4`](example/bookshop.c4), imported raw). The native file is `.c4`,
  its content Structurizr DSL: Export as .c4 downloads `<workspace slug or "workspace">.c4`, Export
  as Structurizr DSL (.dsl) the same bytes as `workspace.dsl` for Structurizr's own tools. The URL
  holds the workspace (Event Storming's behaviour, `createLinkWriter` in `link.ts`): every open,
  edit and view switch writes `#mz=<deflate-raw, base64url>&v=<view>` with `replaceState` (no
  history step, no `hashchange`), the writes of a burst (a held arrow key) at most every
  `LINK_WRITE_INTERVAL_MS` (250 ms; WebKit throws on the 101st history write within 10 s) and a
  refused one again a second later. An empty workspace drops the hash. A pasted link
  (`hashchange`) replaces the workspace, or only opens the view it names when the text is the
  same; a broken one toasts and stays in the address bar until the next change. A start takes the
  link before the autosave, and a link whose text the autosave holds is a restore, without a
  toast. Share copies that URL (an empty workspace gets its hash then). The autosave keeps
  `c4-modeler.document`, `c4-modeler.view` and `c4-modeler.legend` in `localStorage`, every access
  in try/catch. A replaced workspace stays an Undo away (toast, Cmd/Ctrl+Z). Cmd/Ctrl+O opens a
  file and Cmd/Ctrl+S exports the `.c4` (Value Chain's keys, in the capture phase, since the label
  editor keeps its keys from the page), chips on Open… and Export as .c4 and in the File group of
  the shortcuts dialog. Cmd/Ctrl+S first commits what is being typed, as the webview's save flush
  does: an inspector draft keeps its field, a label hands the focus to the canvas as on Enter (a
  blur would leave it on `<body>`). `c4.delete.done` becomes an info toast with Undo ("Removed E-mail System
  from this view. It stays in the model."), withdrawn by the next change and by every import.
  `c4.edit.refused` becomes a toast at its level (`refusalToast`: info for a rule it explains,
  danger for a failed edit or a refusal without a level), `c4.edit.notice` an info toast (in the
  event's own `message` where it has one, the canvas notice's); the problems pill lists the
  parser's diagnostics, and a row reveals its element, switching views when needed. `window.app`
  is the e2e handle. Port 5182 (`dev:app`, `PORT` overrides it), Portless name `c4`.
- VS Code ([`apps/vscode`](apps/vscode)): `.c4` files open in the custom editor `c4.editor`
  (priority `default`); New Empty C4 Diagram (`c4.newDiagram`, `newWorkspaceText()`) and New C4
  Diagram from Example (`c4.newDiagramFromExample`) save a new file, `workspace.c4` by default (a
  name without `.c4` or `.dsl` gets `.c4`), also under File › New File…. VS Code takes one
  priority per editor, so `.dsl`, which belongs to other tools too, has its own view type
  `c4.dslEditor` (priority `option`, same provider and display name): it opens through Open
  Diagram to the Side, Reopen Editor With…, and C4: Use C4 Modeler for workspace.dsl
  (`c4.useForWorkspaceDsl`, also the walkthrough's last step), which writes
  `workbench.editorAssociations["workspace.dsl"] = "c4.dslEditor"` into the user settings on that
  request only. The other commands, all in category C4: Open Source to the Side
  (`c4.openSource`), Open Diagram to the Side (`c4.openDiagram`, in the title of a `.dsl` or
  `structurizr-dsl` text editor; `diagramViewTypeFor` picks the view type by extension), Go to
  View… (`c4.goToView`), and Parent View, Fit to View, Export as PNG and Export as SVG
  (`c4.parentView`, `c4.fitView`, `c4.exportPng`, `c4.exportSvg`: `WEBVIEW_COMMANDS`, posted to
  the diagram of the title button or the focused one). No keybindings. Every `when` names both
  view types. Language `structurizr-dsl` for `.c4`, `.dsl` and `workspace.dsl` (an id of its own:
  LikeC4 has `likec4`, another extension `c4` or `structurizr`), `language-configuration.json`,
  the TextMate grammar `syntaxes/structurizr-dsl.tmLanguage.json`.
  Diagnostics run `parseWorkspace` in the extension host for every open `.c4` and `.dsl` whose
  first statement is `workspace` or a directive (ACPI sources and LikeC4 models are left alone),
  whatever language it has, and for the document of every open C4 editor, source "C4 Modeler",
  code `c4.<code>`. C4: Go to View… parses in the host, lists the catalog in
  a QuickPick under the Views… dialog's headings (`VIEW_TYPE_LABELS`, pinned by `menu.sync.test.ts`)
  and posts `c4.showView`. The host bundles only `dsl` and `schema-model`, the webview
  the renderer and the shell.
- LikeC4 (`likec4.likec4-vscode`) claims `.c4` for its language `likec4` and has no custom editor
  ([`likeC4.ts`](apps/vscode/src/likeC4.ts)). With it installed, `c4.editor` hands a `.c4` file
  that is neither blank nor a Structurizr workspace to the text editor and closes, without a
  notification (opening a file never notifies, guide §13.5), and every `.c4` text document that
  opens gets the language its text calls for, whichever extension VS Code gave `.c4`; a language
  change (VS Code's close and open in one go) is left alone, so Change Language Mode sticks.
- The extension's document plumbing is the shell's `registerModelerEditor`
  ([`diagramEditor.ts`](apps/vscode/src/diagramEditor.ts); the options without `vscode` in
  `diagramEditorOptions.ts`, which the e2e page registers too). The webview
  ([`src/webview/main.ts`](apps/vscode/src/webview/main.ts)) tries `rebaseText` first, else
  re-imports in place on the current view, and keeps `{ activeView, viewportByView }` in its state,
  so a reload comes back to the view and place it left. Save flush (`saveFlush.ts`, `protocol.ts`,
  Team Topologies' protocol): before a save the host posts `c4.flush`, the webview commits an
  inspector draft and an open label edit and answers `c4.flushed`; the host waits at most
  `FLUSH_TIMEOUT_MS` (1 s) and skips autosaves. No toasts in the webview (guide §13.5): it posts
  the shell's `info` and `error` messages, which the host shows as notifications. A refused edit
  comes at the level of the web app's toast (`refusalNotification`: an info notification for a
  rule, an error for a failed edit), what Delete did as an info notification in the web app's
  words (`deleteDoneNotification`), without Undo, since the document's history owns it, and an
  edit notice as an info notification (the canvas notice in its own `message`).
  `THIRD_PARTY_NOTICES.md` is generated
  (`npm run notices -w modelers/c4/apps/vscode`: dagre and graphlib, Geist, Lucide, diagram-js) and
  checked by `notices.test.ts`.
- Icons: the C4 modeler icon of the Miragon modeler icon set (skill `miragon-brand:icon-design`,
  id `c4`), copied byte for byte from `docs/public/modeler-icons/` of Miragon/corporate-identity,
  never redrawn, recoloured, cropped or optimised here: to update one, copy it again and `cmp` it.
  The extension icon `apps/vscode/icon.png` (`png/c4-256.png`); the file icons
  `apps/vscode/media/icons/c4-light.svg` and `c4-dark.svg` (`glyph/c4-hell.svg`,
  `glyph/c4-dunkel.svg`) on the language `structurizr-dsl` only, so every `.c4`, `.dsl` and
  `workspace.dsl` file VS Code gives that language carries it, and a `.c4` LikeC4 model in `likec4`
  does not; the web app's `public/favicon.svg` (`favicon/c4.svg`) and `public/apple-touch-icon.png`
  (`png/c4-180.png`), linked from `index.html`. The start screen keeps the Miragon comet
  (`public/miragon-komet-blau.svg`). `contributions.test.ts` checks the manifest's icons and that
  the VSIX ships them, `apps/webapp/test/icons.test.ts` the links and their files, and
  `check:build` that the build carries them and the comet.
- `miragon-gmbh.c4-modeler` joins the extension pack `extensions/modeler-collection` only after its
  first release, since a pack member that is not on the Marketplace breaks installing the pack.
  Until then `test/modeler-collection.test.ts` lists `c4` in `PENDING_FIRST_PUBLISH`; the follow-up
  adds the pack entry, the walkthrough step and `media/c4.md` and empties the list.

## Commands

- `npm run c4 build` (schema-model, dsl, layout, then the renderer; the unit tests resolve them
  from `dist`, so build first) · `npm run c4 build:webapp` (then
  `npm run check:build -w modelers/c4/apps/webapp`) · `npm run c4 build:vscode` ·
  `npm run c4 package:vscode`
- `npm run c4 test` (Vitest project `unit`) · `npm run c4 test:browser` (project `browser`,
  Chromium: the renderer and the `@miragon/modeler-api` conformance kit) · `npm run c4 test:e2e`
  (the `@miragon/modeler-shell` conformance kit on the `web` and `ide` hosts; ports `E2E_PORT`,
  default 5182, and `E2E_WEBVIEW_PORT`, default 5192)
- `npm run c4 test:vscode:docker`: the packed VSIX in a real VS Code inside a Linux container.
  Never run `test:vscode` on the user's Mac (it opens a window that takes the focus).
- `npm run c4 lint` (ESLint and every tsconfig) · `npm run c4 depcruise` · `npm run c4 format`
- `npm run c4 dev:webapp`: the web app through Portless at `https://<branch>.c4.localhost`
  (Node 24.15.0 or later); `npm run c4 dev:webapp:plain` serves plain Vite on `127.0.0.1:5182`.
  `npm run c4 dev:vscode` watches the extension's bundles; `.vscode/launch.json` runs it.
- The reference runs (Java, not in CI), from `modelers/c4`: see
  [`packages/dsl/test/README.md`](packages/dsl/test/README.md) and
  [`packages/dsl/scripts/structurizr-snapshots/README.md`](packages/dsl/scripts/structurizr-snapshots/README.md).
  `UPDATE_GOLDENS=1 npx vitest run --project=unit packages/dsl/test/edit/golden.test.ts` rewrites
  the golden after-files; review the diff byte by byte.

## Tests

- Unit: schema-model (identifiers, the layout codec, catalog, membership and expressions, implied
  relationships, the hidden scope relationships and the ends that could move down, styles, the
  digest, notation contrast, a performance budget); dsl (the lexer and syntax tree with the
  mutation fuzz and linear-time guards, the builder against the reference snapshots, the edit
  goldens, `moveRelationshipEnd` per statement position, its refusals and outcomes among the
  others, smart delete, a 2 000-sequence edit fuzz that moves relationship ends too, the edit
  acceptance); layout (determinism, text independence, placement without overlap and in the clear of
  other lines in a crowded view, its frames' room from strangers, its room from a frame it does not
  belong to and its label off that frame's edge, frames, the fan of a pair's lines and the label
  slide, `relationshipRoutes.test.ts`); the renderer (menu, shortcuts, legend rows,
  the engine seam, the scene's group frames by scope, the theme, peer and pre-bundling drift, the
  breadcrumb's path, fit and stylesheet, the level of every refusal reason, the delete text, the
  warning chip's place, the hidden relationships on the example and the notice's words
  (`hiddenRelationships.test.ts`), the chip's stylesheet); the web app (example, files, icons,
  link, notices, problems, storage);
  the extension (contributions and icons, grammar, diagnostics, commands, examples, the editor of
  either file type and its save flush, LikeC4 next to it, the webview's state and messages, the
  menu mirror, notices, tokens). The dsl's edit tests read `@miragon/c4-layout` from `dist` as
  well.
- Browser (`packages/renderer/test/browser/`): the conformance kit, the gestures, reconcile
  identity, view switches, refused edits, the invariant, the drawing (label layout, contrast,
  appearance, content bounds, the export with and without a selection), interaction, context pad,
  the connect and bendpoint feedback (preview line, marks, refusals, handles, hover, label ground),
  focus and label editing around the pad (`keyboard-editing`: the focus after an entry, the editor
  of a new relationship, Escape, a confirmed default name, read-only reasons, the placeholder and
  the shortened note), the appends (`append`: the entries per view type, a click's place and frame,
  its line on the source's axis unless a frame would reach a stranger, its line clear of other boxes
  and labels in a crowded view, the one undo step, the chain to the relationship's description, a
  drag's line and drop, also over an element, the pad at the canvas's edge), the pad by keyboard
  (`pad-keyboard`: the toolbar's names and tab stop, its place after the canvas, the arrows, Home,
  End and Escape, each entry's Enter or Space, the focus over a rebuilt pad, a pointer press on a
  focusable entry, the focus ring), inspector (a rebase too), legend, dialogs, canvas keys,
  hidden-chrome keys, the palette tooltip, move and create feedback (frames, snapping, auto-scroll,
  palette looks, the keyboard create's spot, out from under a stand-in inspector and above its
  bottom sheet), layout stability and navigation (`document-navigation`: Add existing element's
  pins, selection and gap, the selection after an undo across views, the context level, the draft
  note, the empty scope hint, the frames' captions and warning chip, the chip clear of the
  breadcrumb and a stand-in island, a keyboard create in a crowded zoomed view), the shortcuts
  dialog and the breadcrumb (path, clicks, undo, import, the viewer, clearance of a stand-in shell,
  truncation), the routes of a pair's lines (`relationship-routes`: the bends no pin or bendpoint
  gesture writes, the cursor of a connect over a line or a boundary, the view title), the labels
  layer (`label-layering`: a crossing line under a label, a click, a double-click and the markers on
  it, its order and removal, a drag's preview with the labels it carries above every label, the
  fan's bend without a handle or a floating one, a selected relationship's label kept clear of the
  inspector, the export's cut-outs on a white page and on the ground), the level each place that
  refuses fires with (`refusal-levels`), the apps' feedback (`app-feedback`: the layout and
  delete events, the Model menu's Add relationship…, the fit's clearance of the breadcrumb), and
  the hidden relationships (`hidden-relationships`: the chip's count and words per view, its
  updates and undo, its place after the breadcrumb, Tab and Enter, out of the export, hidden while
  read-only, without dialogs or without a child to assign to, compact when narrow, clear of a
  stand-in island; the dialog's words, rows and choices, its note on a scope without children,
  Assign as one undo step that restores the text byte for byte with the other end placed clear and
  pinned, the relationship alone selected and revealed with it, a refusal at its row; the
  inspector's Move to a container… and Move to a component…, the landscape's implied line alone
  selected after it; the notice once per modeler and none elsewhere).
- e2e (`e2e/`): projects `webapp` and `vscode-webview` with the shell's kit, the navigation
  between views, the breadcrumb (no island overlapped at seven sizes, and the kit's `aria` and
  `overlayLayers` cases on the component view where it shows), the PNG export and the shortcuts
  key on both hosts, document sync in the webview (a formatting-only change rebased under a
  running drag, the C4 colours of a blank file's first element), the link in the address bar
  (`webapp-link.spec.ts`), the files (`.c4`, `.dsl`, both text exports), the web app's file keys,
  delete toasts and Model › Add relationship… (`webapp-app-feedback.spec.ts`), a rule's refusal as
  an info toast and an info notification and the webview's delete notifications
  (`webapp-feedback-levels.spec.ts`, `vscode/feedback-levels.spec.ts`), the context pad by
  keyboard in the web app, after the canvas and before the inspector
  (`webapp-pad-keyboard.spec.ts`), a relationship drawn on Bookshop in the landscape, its notice,
  the container view's chip and Assign in the web app (`webapp-hidden-relationships.spec.ts`), the
  notice as an info notification and the chip's Assign in the webview
  (`vscode/hidden-relationships.spec.ts`), the fit after Lay out automatically and below the
  breadcrumb on both hosts, and Share and the focus hand-back in the web app, which
  `webapp-webkit` runs in WebKit as well.
- VS Code smoke (`apps/vscode/test-smoke/`): the example as `workspace.c4`, the default edit
  (Enter on the palette's first creating entry, then Escape on the name editor) as one undo step,
  the save checked with `parseWorkspace`. The file opens in `c4.editor` by default; the driver
  associates it in the profile's settings as well.

## Conventions

- Exact pins and ranged peers:
  [`.claude/rules/package-json-fixed-versions.md`](.claude/rules/package-json-fixed-versions.md).
- The text is never rewritten as a whole: an edit splices what it owns, verifies the result and
  refuses rather than guesses. A refusal always says why.
- Styles come only from the C4 colours of a new workspace, "Apply C4 colours" and the Database
  entry; no other edit writes a colour.
- No Claude skill yet: a skill for the `c4modeler.*` layout format is planned as a plugin after the
  first release, since skill names are public and never renamed.
- The brand-lint config is the suite's root `.miragon/brand.json`; add none here. brand-lint reads
  no `.dsl` file, so the example carries no brand-lint comments.
- Contributor notes for this modeler in [`CONTRIBUTING.md`](CONTRIBUTING.md).
