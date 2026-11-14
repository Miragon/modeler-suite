# CLAUDE.md

TypeScript modeler for the Business Model Canvas (Strategyzer AG, CC BY-SA 3.0), built on
[diagram-js](https://github.com/bpmn-io/diagram-js) (MIT) and styled by the Miragon design system.
The file is a `.bmc` text in YAML: `version`, `canvas` (the title and the notes on the canvas as
a whole) and one field per building block holding its `items` (the stickies) and `notes`. Its
renderer started from the new-modeler template's
(`plugins/modeler-kit/skills/new-modeler/assets/template/packages/renderer`), its apps from Value
Chain's ([`modelers/value-chain`](../value-chain/CLAUDE.md)).

This modeler is `modelers/business-model-canvas` in the Miragon modeler suite. The suite's
[`CLAUDE.md`](../../CLAUDE.md) holds the rules for every modeler (setup, commands, commits and
signing, exact pins, releases, the design system, the contract and shell boundaries); this file
adds what is special to the canvas. Run its scripts from the repository root as
`npm run business-model-canvas <script>`, or as `npm run <script>` inside
`modelers/business-model-canvas`.

## Packages

Every workspace is `private`: the modeler publishes nothing to npm. The packages export their
TypeScript source (`"exports": { ".": "./src/index.ts" }`), have no `dist`, and `build` is a type
check; the three apps bundle them from source.

| Package                                       | Purpose                                                                         | DOM |
| --------------------------------------------- | ------------------------------------------------------------------------------- | --- |
| `@miragon/business-model-canvas-schema-model` | Blocks, stickies, notes, Zod validation, pure edits, the layout, tape colours   | no  |
| `@miragon/business-model-canvas-dsl`          | The `.bmc` parser with diagnostics and the canonical serializer                 | no  |
| `@miragon/business-model-canvas-renderer`     | diagram-js viewer and modeler, contract factories, dialogs, legend, CSS         | yes |
| `apps/ide-editor`                             | The canvas as an IDE editor, mounted by `apps/vscode` and `apps/orca`           | yes |
| `apps/vscode`                                 | VS Code extension: custom editor `businessModelCanvas.canvasEditor` for `*.bmc` | yes |
| `apps/orca`                                   | Orca plugin `business-model-canvas-modeler`: the same editor for `.bmc`         | yes |
| `apps/webapp`                                 | Vite web app on the shell's web host                                            | yes |
| `e2e`                                         | Playwright: web app, VS Code webview and Orca editor (shell kit in each)        | yes |

**DOM boundary (P1):** `schema-model` and `dsl` (`modelerSuite.domFreePackages` in
`package.json`) never import diagram-js or DOM libraries and never use `window` / `document`.
ESLint and dependency-cruiser enforce it through the presets in `tooling/`, and they keep
`@miragon/modeler-shell` out of every package. The DOM-free packages take only types from
`@miragon/modeler-api`.

## The `.bmc` format (`packages/dsl`)

The rules of the format (fields, colours, notes, every diagnostic, the canonical form) are in the
[`bmc-dsl` skill](plugins/business-model-canvas-modeler/skills/bmc-dsl/SKILL.md), whose `bmc`
examples `packages/dsl/test/skills.test.ts` parses; a change of the parser updates the skill. What
the code adds:

- YAML through the `yaml` library (2.9.1, core schema). `parseText` never throws (an error leaves
  an empty document), `readText` throws on an error, `serializeText` is a fixpoint of `parseText`.
  `validateDocument` (schema-model) checks a document that comes as an object, not as text
  (`importDocument`, the exporter).
- Where the fields land: the `canvas` map in `CanvasDocument.header` (the title as text, read with
  `titleOf` and set with `withTitle`; any other field with its value) and `CanvasDocument.notes`;
  root fields that name no block (`isBlockId`) in `extras`; the unknown fields of a block, a sticky
  and a note in their `attributes`. An unknown colour stays a sticky attribute until the canvas
  sets a known one. The known fields of each map, in the order the file writes them, are
  `ROOT_FIELDS`, `CANVAS_FIELDS`, `BLOCK_FIELDS`, `STICKY_FIELDS` and `NOTE_FIELDS` in
  `src/fields.ts`.
- `Reader` in `parse.ts` walks the YAML tree and collects the diagnostics. `Reader.textOf` reads a
  scalar's source, so a number or `true`/`false` in a text field stays as written (`title: 1.50`
  stays "1.50"); the serializer writes it back quoted. A text reports a hundred findings at most
  (`MAX_FINDINGS`), and of anchors, aliases, tags and repeated keys only the first.
- Unique keys: the YAML reader runs with `uniqueKeys: false`, and a key written twice, also `1:`
  and `"1":` that `toJS` would merge, is found per map with a set; paths find their node through a
  key index per map.
- Nesting limit: a text longer than `MAX_TEXT_LENGTH` (1,048,576 characters, also the web app's cap
  for a share link) and flow lists or maps nested deeper than `MAX_NESTING_DEPTH` (32;
  `flowNestsTooDeep`, a pass of the lexer) are errors before the YAML reader runs. A kept value
  nested deeper is an error too, and a text that overflows the YAML reader's stack gives the same
  message. A lone carriage return is a line break.
- Ranges: every diagnostic carries a `JsonPath` into the file (`describeDiagnostic` writes it as
  `channels.items[2].id: …`), as Team Topologies' issues do, and a `range` of offsets into the
  text: the value at the path, or the first mark of the map that lacks a missing field. A finding
  of the text as a whole (a syntax error, an anchor, a comment) has the path `[]` and its own
  range. `apps/vscode/src/diagnostics.ts` turns the range into the Problems view's range.
- Comments: `commentsOf` finds each one in the YAML token tree (a `#` inside a quoted text is
  none). Opening a file does not rewrite it; the first canvas edit does, from the document.
- Ordering: the serializer builds a YAML `Document` (two spaces, `lineWidth: 0`, a final line
  break), the blocks in `METHOD_ORDER`, every map as a `Map` with its known fields in the order of
  `src/fields.ts` and the others sorted by name after them, so a key such as `"2"` keeps its place
  and a field named `__proto__` stays a field. An unknown colour keeps its place among the known
  fields; empty lists are left out.
- Ids follow `isUsableStickyId`: names of `Object.prototype` are never ids, since diagram-js keeps
  elements in a plain object. A sticky the canvas creates gets the element factory's random id.
- The VS Code extension bundles `yaml`; its language `bmc` has a grammar that includes
  `source.yaml` and, on purpose, no comment toggle in `language-configuration.json`, since a
  comment does not survive the next canvas edit.

## Renderer architecture

- Class chain `BaseViewer` → `Viewer` → `NavigatedViewer` → `Modeler`, one feature per folder with
  an `index.ts` that exports a didi module. `collaborative/`, `gestures/`, `read-only/`,
  `palette/`, `label-editing/`, `keyboard/`, `menu/` and `theme/` come from the template.
- **The document lives on the root.** `io/DocumentRoot` creates the root `diagram:root` with an
  empty document at `diagram.init`, so an edit before the first import lands in a document too;
  `Importer` replaces its document and adds one `StickyShape` per sticky at its layout slot;
  `Exporter` returns the root's document, validated. Shapes carry `sticky` and `blockId` only as
  a mirror for drawing.
- **Every edit is one document update.** `modeling/CanvasModeling` builds the next document with
  the pure edits of `schema-model` (`insertSticky`, `moveSticky`, `removeSticky`, `updateSticky`,
  `withTitle`) and runs `canvas.updateDocument` (`UpdateDocumentHandler`): it swaps the
  root's document, lays every sticky out again from it and keeps the old document and positions
  for the revert, so a drop and its reflow are one undo step. `modeling/StickyBehavior`, a
  `CommandInterceptor`, turns diagram-js's own commands into such updates in the same command:
  `elements.move` places the moved stickies in the canvas's order at the slot under the first
  one's centre, `shape.create` inserts the new sticky there or at the slot its `hints.slot` names
  ("add after" in the pad), `shape.delete` removes it. A sticky under the pointer is never a
  parent: the hover is redirected to the root. No block gives a sticky a colour: a new or moved
  sticky keeps the `color` it has. `CanvasModeling.setColor` sets or clears it, `setTitle` sets the
  title and `setNotes(scope, notes)` the notes of one place.
- `modeling/placement.ts`: `placementAt(document, ids, point)` takes `blockAt` (the block under
  the point as the canvas shows it, else the nearest) and `slotAt` (before the sticky whose left
  half is under the point) from the current layout, then counts out the dropped stickies before
  that slot for the `index` among the others. `drop-feedback/InsertionFeedback` shows the target
  block and an insertion line at the `slot` while a sticky is dragged or created.
- `canvas-frame/CanvasFrame` draws the background layer below the elements from the layout: a
  white sheet (`--cd-ui-plot`, radius 28, a soft shadow) with the nine blocks on it as rounded
  fields in `--cd-ui-grund` (radius 20, 6 inside their cells, no edge, no icon), the title per
  block, the hint of an empty block (`hints.ts`, Miragon's own words, class `bmc-hint`), the header
  band above the sheet (the title alone, 22/700 with class `bmc-canvas-title`, "Untitled canvas"
  in quiet text without one) and the attribution line `ATTRIBUTION`. Block notes are not drawn in
  the block: they sit behind the marker at the end of its heading (`notes-panel/`). It draws again
  on every `elements.changed`. `saveSVG` removes `.bmc-hint` and the drop feedback, never the
  attribution. The web app hides the layer behind its start card (`bmc-start` on the canvas
  container).
- `layoutCanvas(document)` lives in `schema-model` (`layout.ts`; the renderer's `io/layoutOf` caches
  it per document object): fixed sticky size (152 × 92, gap 12, 18 from the cell's edge), two
  columns in the top blocks, more in the bottom halves; a block that overflows grows its whole row,
  both halves of a stacked column grow together, and every block floors at two rows of stickies
  under its heading (`TWO_ROWS`, for the stacked halves and the bottom row alike). The header band
  is `HEADER_BAND_HEIGHT` (56). Notes take no room in the layout. A block fills from the top left
  under its heading, as on the poster, so a sticky never moves when another one is added after it.
- `io/ContentBounds`: `contentBounds()` (the contract's, what the shell fits and what `saveSVG`
  frames) is the frame with header and footer and every sticky, also on a canvas without stickies,
  so an empty canvas starts at its full size and every export shows all nine blocks and the
  attribution.
- No empty-file hint: both hosts mount the shell without one (`emptyHint` left out in the web app,
  `undefined` in `apps/ide-editor`), since every empty block carries its own hint. The three shell
  kit specs pass `emptyHint: "none"` and `firstElement: "slot"`: the sticky that Enter on the
  palette places in the free area's centre flows into its slot. They open the notes panel as the
  shell's inspector (`e2e/tests/support/notes-panel.ts`).
- `draw/StickyRenderer` draws every sticky as white paper (`COLORS.plot`), radius 3, no edge, a
  two-layer paper shadow set as an attribute so exports carry it. Every sticky has one strip of
  tape across its top edge, without an edge: its `color` (`tapeColor`, class `bmc-tape`), or plain
  `--cd-ui-linie` (class `bmc-tape-plain`, decorative, no meaning) without one; a colour is tape,
  never paper. Every sticky leans the same `STICKY_LEAN` (−1°, rising from bottom left to top
  right), a `rotate` on its `.djs-visual`, so the selection outline, hit area and layout stay
  square; its tape adds `TAPE.tilt`. Text 13px/500 in ink (`draw/text.ts`): a text that does not
  fit is set a pixel smaller at a time down to 11px, a word wider than the sticky breaks with a
  hyphen (at a hyphen it has, else between two consonants or before a consonant between vowels),
  and what still does not fit ends in an ellipsis. Every sticky's text sits in the same band under
  its tape (`TEXT_BAND`), so a colour never resizes it. A sticky with notes has its bottom
  right corner folded down (`NOTE_FOLD`, a `kontur` edge). The canvas has no native `<title>`:
  `draw/StickyTooltip` shows the notes card (`notes-panel/notesCard.ts`, the same card as the
  markers') on a truncated or noted sticky that is not selected: the full text, then the texts of
  up to three notes, each after the same grey dot (`NOTE_DOT`), and how many more
  (`notesCardHtml(title, notes)`). `saveSVG` writes `<title>`s into the export from
  `data-bmc-description` (`stickyDescription`: the full text and the notes), on the canvas ground,
  so the header and the attribution stay readable on a dark page. tiny-svg writes fills and
  strokes as inline styles, so a CSS rule that overrides one needs `!important`.
- `context-pad/`: the family's pad on a selected sticky: add a sticky after it (label editor
  open), edit, "Colour" (`ColorPopupProvider`, popup `bmc-color`: the eight `TAPE_COLORS` with
  their tape, a check on the current one, and "No colour" when the sticky has one), "Notes" (the
  notes panel on this sticky, a new note open when it has none; only when the host registered the
  panel) and delete; nothing under the read-only lock, which also closes an open popup.
  `HostLauncher` (service `hostLauncher`) is the way to the host's chrome:
  `registerCanvasTitle` / `hasCanvasTitle` / `openCanvasTitle`, which `canvasModelActions`
  connects to the dialog, and `registerNotes` / `hasNotes` / `openNotes`, which `connectNotes`
  connects to the notes panel. The current entry of a popup carries `bmc-popup-active` (accent and
  a check); the popup has the family's radius and shadow.
- `keyboard/`: Alt+↑/↓ moves the selected sticky within its block and, at its edge, into the
  block above or below; Alt+←/→ to the end of the block beside it, as the canvas shows the blocks
  (`neighbourBlock` in `layout.ts`, `CanvasModeling.moveByKey`); nothing under the lock.
  diagram-js's arrow-key move of the selection is not loaded, a pixel move means nothing on a
  flowing layout. A sticky placed from the palette opens its label editor, as one added by the
  keyboard or the pad.
- `menu/`: the Model group "Canvas title…" (id `canvas-title`, the dialog "Canvas title" with one
  field "Title", on the shell's dialog, typed structurally as `ChromeDialog` / `ChromeDialogOptions`
  in `dialogs/form.ts`, connected in `menu/modelActions.ts`) and the checkbox "Notes"
  (`DiagramNotesToggle`, which opens and closes the notes panel, usable on a read-only canvas too),
  next to the shell's legend toggle; Export and Help as in the template. The shortcuts dialog lists
  "Show or hide notes" (N). `legend/` is static: `renderLegend(body)` writes its one row, "Has
  notes" with the folded corner, into the shell's legend body, called once by both apps. It names no
  colour.
- `notes-panel/`: the one place where notes are read and written, in the shell's inspector
  (`inspector: { label: "Notes" }`), wired by `connectNotes(shell.inspector, diagram)` in both
  apps (`apps/webapp/src/main.ts`, `apps/ide-editor/src/editor.ts`). `NoteMarkers` puts a comment
  marker after the canvas title (the whole canvas) and at the right end of every block heading:
  HTML over the canvas, so no export carries it; a place without notes shows a quiet icon, one
  with notes the icon and their count, and hovering shows the notes card. The markers hide below
  50 % zoom; on a read-only canvas only places with notes keep one. The panel opens from a
  marker, from the pad's "Notes", from the Model menu's "Notes" and with N (a document listener
  that leaves fields, dialogs and menus alone). `NotesPanel` shows one place at a time
  (`NotesScope`: canvas, block or sticky). Its head reads "Notes" and, under it in quiet text
  (`.bmc-panel-place`), the place: "Whole canvas", the block's title or "Sticky: <text>". A marker
  or the selection of one sticky changes the place; there is no picker. It follows the one
  selected sticky unless a note is half written, and has "Add note". Each note is one row: the
  grey dot (`NOTE_DOT` in `glyph.ts`), the text field and the bin. A text is written when the
  field is left or on Enter, each change one undo step (`CanvasModeling.setNotes`); a text
  cleared and left comes back, only the bin removes a note, and a new empty note stays open until
  it has a text or is discarded. A read-only canvas shows the notes without controls.
- `canvas-header/HeaderEditing` (Modeler only): an HTML button over the header's title, with a
  contour on hover (class `bmc-header-title`); a click opens "Canvas title"
  (`HostLauncher.openCanvasTitle`). No export carries the button, and there is none under the
  read-only lock, without a host that registers the dialog, or behind the web app's start card.
- `collaborative/` implements `@miragon/modeler-api` (`createCollaborativeModeler` /
  `createCollaborativeViewer`, notation `business-model-canvas`); `themes.ts` is `['light']`.
  `collaborative/merge.ts` is the notation's `ModelTextMerge` (`mergeCanvasText`), which Orca
  calls when an agent writes the file under unsaved edits: the `canvas` fields field by field, the
  blocks by building block, a block's items by id, its notes by their text and own fields and its
  other fields by name, the notes on the canvas as a whole by their text and own fields too. Two
  changes of one of them, a change against a removal and a sticky both sides moved to different
  blocks throw a `MergeConflictError` that names them: a sticky by its id, a block by its field, a
  canvas field as `canvas.<field>`, a note as `<block>.note:…` or `canvas.note:…`. Every item
  carries its id, so nothing is matched by text. `test/merge.test.ts` and the merge kit in
  `conformance.browser.test.ts` (fixtures in `test/support/merge-fixtures.ts`) check it.

## Notation colours

`TAPE_COLORS` in `schema-model/src/notation.ts` are eight tape colours, Sky first (blue leads), each
with a `name` (lower case, what `color` writes, `colorName`) and a `tape`. `isKnownColor` accepts a
palette name or a hex colour, `tapeColor` gives the tape a `color` shows (the palette's, or the
person's own hex as it is). The canvas has no official colours, so they are tuned, not copied, and
what a colour means is the team's to decide: a customer segment, a theme, an owner. No sticky gets a
colour on its own. Every tape holds 3:1 on the white paper and the ground, the tapes stay apart for
deuteranopia, protanopia and tritanopia, each by ΔE76 above 10 (Machado's simulation), and light and
dark tapes alternate in the palette's order, so neighbours differ in lightness too;
`packages/renderer/test/notation-contrast.test.ts` checks all of it. The literals sit between
`// brand-lint-disable` and `// brand-lint-enable`. A document writes a colour only as a sticky's
`color`, never the default of its place. Notes have no colour: every note shows the same quiet dot,
`--cd-ui-kontur` (`COLORS.outline`) with an ink edge (`NOTE_DOT` in `notes-panel/glyph.ts`).

## Tests

- `npm run business-model-canvas test`: the DSL round trip and passthrough
  (`packages/dsl/test/round-trip.test.ts`), every `bmc` example of the skills
  (`packages/dsl/test/skills.test.ts`), the model's edits, colours and layout
  (`packages/schema-model/test/`), the menu, the token drift (`theme.sync.test.ts`) and the
  notation contrast (`packages/renderer/test/`), plus the apps' unit tests.
- `npm run business-model-canvas test:browser`: Chromium. `conformance.browser.test.ts` runs the
  contract's kit on the fixtures in `test/browser/fixtures/`, a skip or an advisory fails; its
  `moveElement` moves `order` from Value Propositions to Key Partners, since a move inside its slot
  changes nothing. `canvas.browser.test.ts` covers drops between blocks, undo, a new sticky without
  a colour, delete, Alt+arrows, the Canvas title dialog, one tape on white paper, the legend, the
  context pad, the colour popup and the export's `<title>`s. `notes.browser.test.ts` covers the
  markers (one per place, the count, read-only, not in an export) and the panel (a new note, undo,
  the kept empty note, a cleared text, the bin, one place at a time and its name under the title,
  following the selection, `canvas.notes`); `header.browser.test.ts` the header's title (its one
  button, Canvas title on a click, the title as the header's one field, the button kept out of
  exports, nothing under read-only). The gesture, key, appearance and content-bounds suites come
  from the template, the gesture suite with the slot positions of the top-left layout.
  `single-copy.test.ts` keeps one copy of `zod`, `diagram-js`, `didi` and `tiny-svg` under this
  modeler in the lockfile, the job ranged peers do in the published modelers. The renderer imports
  `didi` for its types only, so the bundles carry the copy diagram-js brings, as in every modeler
  of the suite.
- `npm run business-model-canvas test:e2e`: Playwright in `e2e/`, projects `webapp` (port
  `E2E_PORT`, default 5183), `webapp-webkit` (Share and focus hand-back in WebKit),
  `vscode-webview` and `orca-editor` (both on `E2E_WEBVIEW_PORT`, default 5193): the shell's kits on
  each host, the document both ways in VS Code and Orca, the export round trip, open file, and
  `webapp-canvas.spec.ts` (drag between blocks with its insertion line, the legend's one row, Canvas
  title, the `.bmc` download, the attribution once under the canvas and not in the legal line, a
  note on a block and on the whole canvas from their markers).
- `npm run business-model-canvas test:vscode:docker` and `test:orca:docker`: the packed extension
  and the plugin in a real VS Code and Orca in a Linux container. Never `test:vscode` on macOS.

## Commands

- `npm run business-model-canvas build` (type check) · `build:webapp` · `build:vscode` ·
  `package:vscode` · `build:orca` (the plugin into `apps/orca/plugin/`: the editor of
  `apps/ide-editor` on `orcaEditorHost` with `mergeCanvasText`, see the suite's
  [`CONTRIBUTING.md`](../../CONTRIBUTING.md#orca-plugins))
- `npm run business-model-canvas dev:webapp`: the web app in plain Vite at http://localhost:5183;
  the e2e webview page runs on 5193 (`E2E_WEBVIEW_PORT`)
- `npm run check:build -w modelers/business-model-canvas/apps/webapp`: after `build:webapp`, checks
  the head markup, the renderer's stylesheet with the vendored tokens and the licence comments the
  production bundle must carry. The web app imports the stylesheet itself
  (`@miragon/business-model-canvas-renderer/assets/business-model-canvas.css`): the renderer
  marks only its CSS as having side effects, so Rollup leaves out the import inside its barrel,
  which esbuild (VS Code, Orca) keeps.
- `npm run business-model-canvas lint` (ESLint and type check) · `depcruise` · `format`

## Conventions

- Pins are exact everywhere, without ranged peers: nothing is published, so no host dedupes these
  packages (see `.claude/rules/package-json-fixed-versions.md`).
- The VS Code extension is `miragon-gmbh.business-model-canvas-modeler`, its custom editor
  `businessModelCanvas.canvasEditor`, its language `bmc`.
- The app icon is the Miragon Komet on blue for now: the Miragon modeler icon set has no Business
  Model Canvas icon yet. A new one is designed in Miragon/corporate-identity, then copied in
  unchanged (skill `miragon-brand:icon-design`).
- The attribution line is part of every canvas and every export; never make it optional. The
  official icons and the guiding questions of the canvas are not used; the Value Proposition
  Canvas is out of scope.
- Conventional Commits with the scope `business-model-canvas`.
- Write comments only for constraints the code cannot express itself.
