# The suite's editors on a board

A part of the board's guide, moved here from [`CLAUDE.md`](../CLAUDE.md) as it was written. That
file keeps what every change needs and names
[every part's document](../CLAUDE.md#the-parts-and-their-documents).
What is found out or changed in `apps/editors`, the notices of a build among it, is written here.

## The suite's editors (`apps/editors`)

`board-suite-editors` is the one workspace of the board that imports another modeler, and
`packages-no-other-modeler` keeps it so (the open decision is under [Packages](../CLAUDE.md#packages)).

- **The registry.** `SUITE_EDITORS` has one entry per notation, in the order of
  `SUITE_SUFFIXES`: wardley (`.wmap`, `.owm`), event-storming (`.storm`), team-topologies (`.tt`,
  `.ttm.json`), context-maps (`.cm`, `.cm.json`), value-chain (`.vc`, `.vc.json`), c4 (`.c4`),
  business-model-canvas (`.bmc`). `notation` is the renderer's `meta.notation`. C4's `.dsl` and
  the `.png` editors are left out until it is decided whether a board shows them;
  `suffixes.sync.test.ts` holds the table against the `customEditors` of the seven extension
  manifests, so a suffix a modeler adds fails there. Each `load()` is a literal dynamic import of
  `src/notations/<notation>.ts`, so a bundler makes a chunk per notation and a board without a
  Wardley map never loads the Wardley renderer. C4 and Business Model Canvas carry insets of 24,
  24, 24 and 80 px at the left, where their palette is a column; the others take the host's
  default with 64 px at the top. The left inset is a choice seen in two screenshots, not a
  measurement.
- **The declared face.** The workspace's `.` export has a `types` condition, the hand-written
  `index.d.ts`, before its source. The board's strict project and the apps read the declaration
  and never follow into another modeler's source under their own flags (checked:
  `tsc -p tsconfig.json --listFiles` names no file of another modeler); a bundler takes
  `src/registry.ts`. `apps/editors` has its own tsconfig with the weakest renderer's flags and
  one path per entry of `build/aliases.mjs` (`aliases.sync.test.ts`), and
  `npx tsc -p apps/editors/tsconfig.json` (`npm run typecheck -w apps/editors`, in the
  board's `typecheck` chain) is the one check of the notation modules against the other
  modelers' sources and of the declaration against the registry. No other modeler has to be
  built for it. The condition covers `.` only: `./base` is read as source, so an app that
  imports it declares `*.css` and `*.css?base` among its own modules (`apps/webapp/src/css.d.ts`
  does).
- **A notation module** exports `create` (the renderer's `createCollaborativeModeler`), `text`
  (the notation's text rules) and, for C4, `relayout`, and imports the renderer's sheet by name.
  The rules are each modeler's own, as its ide-editor (C4: its webview) has them, written again
  on the packages' public exports and not imported from the other modelers' apps: a change of a
  modeler's rule there has to be made here as well. Wardley Maps patches the file's own text
  (`patchDSL` with the map the text was last written from), so comments and the order of the
  lines stay. Value Chain and Business Model Canvas hand back the file's own text while the
  canvas shows the same model. Team Topologies, Context Maps and Event Storming write what the
  modeler exports, so the first edit of a file that is not in the modeler's canonical form also
  writes whatever the two forms differ in. For the example files a review measured how much that
  is: the first edit of `sample.cm` differs from the file by the edit and one newline at its
  end, that of `order-checkout.storm` by the edit and two blank lines that are dropped (4
  changed lines of 24), and `sample.tt` keeps its formatting and order. Event Storming also
  writes references anew when an element is renamed or removed (`#agg_order` as `Order`): the
  modeler's own rules, written as they are. C4 hands back its text byte for byte and takes a
  text that differs only in formatting or comments with `rebaseText`, which empties its history.
- **The build helpers (`build/`)**, for Vite, Vitest and esbuild. `aliases.mjs` reads the folders
  under `modelers/*/packages` and maps each package name to its `src/index.ts`, every exported
  subpath of a package before the package (39 entries over 27 packages), so that no other modeler
  is built first. `prebundle.mjs` names every third-party module those sources load (82), for
  `optimizeDeps.include`: a dependency Vite meets only when a notation loads would reload the page
  in the middle of a run or of an edit. `css-base.mjs` is under
  [Stylesheet and theme files](renderer.md#stylesheet-and-theme-files). A new package under any modeler's
  `packages/` adds an alias, and `apps/editors/tsconfig.json` then needs the matching path, or
  `aliases.sync.test.ts` fails for a change made in another modeler.
- **`webviewBundle` (`build/esbuild.mjs`)** is the set of esbuild options the VS Code webview is
  bundled with: every package of the suite from its source (`esbuildAlias`), the base-once plugin,
  the automatic JSX runtime, React's production build in a watch build too
  (`process.env.NODE_ENV`), and the font files beside the bundle under `fonts/`. The caller adds
  its entry, its output and `format: "iife"`. It sets no `tsconfigRaw` on purpose: esbuild then
  reads the tsconfig next to each source file, so every modeler's sources are compiled as in that
  modeler's own bundle and in strict mode, as the modules they are in the browser tests. With a
  `tsconfigRaw` the same build came out with 788 fewer `"use strict"` directives and otherwise the
  same bytes, and Team Topologies and Context Maps would be compiled under another
  `verbatimModuleSyntax` than their own. `test/webview-bundle.test.ts` builds a page that loads the
  fonts, the board and the seven notations through the registry in memory, and holds: one script
  without a dynamic import left, one sheet with diagram-js's base rule and the canvas mapping once
  and before every renderer's own rules, the font files as files, no warning; eight single edits of
  the helper fail it. A build that imports the shell prints esbuild's `ignored-bare-import` warning
  for the shell's own chunks (four in a webview bundle, one in a host bundle), as every modeler's
  does: a warning is no failed build there.
- **The notices (`build/notices.mjs`, `notices-build.mjs`, `notices-check.mjs`).** A build of the
  board carries the seven renderers and whatever they bundle, so its third-party notices are no
  list kept by hand and no committed file, where the seven other modelers commit
  `apps/vscode/THIRD_PARTY_NOTICES.md` and regenerate it with `npm run notices`: the build writes
  them from the files that went into it. `composeNotices({ product, files, outputs })` takes the
  absolute paths a bundler names and gives the text, the licence files to write beside a bundle,
  and what is wrong. A file belongs to the last `node_modules/<name>` on its path (so
  `preact/hooks` is preact) or, outside `node_modules`, to the nearest workspace of the suite.
  Every package of npm gets a section `## name version (licence)` with every licence, notice and
  copying file of its folder; the workspaces of the suite stand in one last section under the
  LICENSE they share, without versions, so a release changes nothing. Three things no bundler sees
  are said in the module: `INLINED_BY_UPSTREAM` (dagre's published build has graphlib inside),
  `COPIED_WORKS` (Lucide, Material Icons and Tailwind's preflight, each found by a mark in the
  bundled sources of the suite, with the legal comments those sources carry) and `SHIPPED_LICENCES`
  (0BSD, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, MIT, OFL-1.1: what the bundles hold today
  plus 0BSD. Nothing in the suite names an allowed list and CI's dependency review runs with its
  defaults, so this list is the board's own and the owner's to confirm). A package offered under
  several licences is taken under the first one on the list, and its section says so (DOMPurify,
  `MPL-2.0 OR Apache-2.0`: Apache-2.0). `writeBundleNotices` is esbuild's way (the metafile: every
  input with a byte in an output, and every font), `noticesPlugin` Vite's (the modules of the
  chunks, the sources of the emitted assets, and what the sheets import, which Vite inlines and
  names nowhere). The two texts under `build/licences/` are the Apache License as Context Maps
  keeps it and the LICENSE of tailwindcss 4.3.5, the version `board-base.css` names. The root's
  `.miragon/brand.json` and `test/brand-lint-config.test.ts` name both as third-party text, so
  brand-lint does not read them as the suite's copy.
- **What stops a production build** of the extension or of the web app, each with a line that
  names it: a bundled package under a licence that is not on the list, or without a licence file; a
  legal comment (`/*!`, `@license`, `@preserve`) in a bundled source of the suite that no entry of
  `COPIED_WORKS` answers; a licence file that a bundle names and that lies beside no bundled file.
  The C4 chunk keeps dagre's comment "For license information please see
  dagre.esm.js.LEGAL.txt", so that file is written beside the script that names it. The third
  reason reaches the other modelers: a renderer that adds such a comment for a new copied work
  fails the board's builds until `COPIED_WORKS` has an entry for it (a mark, a sentence, and its
  licence text: an installed package of the same work, or a file under `build/licences/`). With the
  path rule of CI that shows in the pull request that adds it ([Commands](../CLAUDE.md#commands)).
- **The check (`build/notices-check.mjs`).**
  `checkBuildNotices(directory, { fileName, bundled, works })` reads a build and fails for three
  reasons: a script or sheet names a licence file the build does not hold beside it; a package
  that is in the build, or a work that is copied into one of its sources, has no section; or a
  section, a bundled package or a copied work stands under a licence that is not on the list or
  not its own. Which packages and which copied works are in the build is evidence the caller
  brings and never the notices themselves. The extension's check measures its two production
  bundles again in memory, which names every input, a sheet and a font among them. The web app's
  reads the build's source maps, and for the copied works the sources of the suite those maps
  name, so a work that a source names in a plain comment, which no bundle keeps, is found. Maps
  name scripts only: the web app's check holds no package that brings only a sheet or a font and
  no work that is copied into a sheet (the two Geist packages and Tailwind's preflight). Those
  are held when the build is made, not afterwards. A build without maps and without a measurement
  does not pass. Both checks are in CI's chain: the web app's in its `check:build`, the
  extension's behind `package:vscode`.
- **Named for the owner, and not in the notices.** The Business Model Canvas layout is CC BY-SA
  3.0 (Strategyzer AG): its renderer draws the attribution on every canvas and the extension's
  README names it, and the notices have no section for it, as Business Model Canvas's own have
  none. `path-intersection` (MIT) ships a NOTICE that its code is derived from Snap.svg (Adobe,
  Apache-2.0), which the board's notices quote. Three renderers say in a plain comment, not a
  legal one, that they carry copied icon geometry (Event Storming and Team Topologies for Lucide,
  Wardley Maps for its Material Icons paths): the marks of `COPIED_WORKS` find them by the words of
  those comments. Without a kept test: the direct run of the extension's `esbuild.config.mjs` and
  of `scripts/check-notices.mjs` as wholes (their parts are tested, and both were run on real and
  on tampered builds), a source map with a `sourceRoot`, an unquoted `@import url(...)`, and
  Windows paths. 41 single edits of the generator, its two bundler ways, the check and the VSIX
  reader were tried by the part that built them: each fails at least one test.
- **Without a test:** a notation's first fit at any size but 800 x 508 and 420 x 508; the left
  inset of C4 and Business Model Canvas against a narrow node; a label editor, a popup or a held
  drag open at Done or at a zoom; an edit by the palette or the context pad; a change from outside
  while armed for any notation but Value Chain, and a text from outside that the modeler refuses; a
  second node on one file for any notation but Wardley Maps, and an edit in the second that the
  first follows; a moved file that two nodes show; more than seven model nodes on one board; a
  device pixel ratio other than 1; any browser but Chromium; touch. The text rules run on the real
  renderers only for the write of a delete (all seven) and of a move (Wardley);
  `text-rules.test.ts` runs them in Node on stand-in modelers with each notation's real parser and
  serialiser, since no renderer of the suite mounts outside a browser.
- **Run once by a review, with Playwright and not as kept tests**, and each held: a label editor
  that is open at Done commits and is written, for all seven; two Wardley nodes on one file follow
  each other in both directions, and Control + Z in the armed one undoes in both; a change from
  outside while C4 is armed is imported with the view kept and nothing written back; a text from
  outside that C4 refuses shows the line with C4's reason, leaves the last canvas, takes no input
  and writes nothing, and the next valid text repairs it; a moved file that two nodes show is two
  changes of the board; the previews and the arming at a device pixel ratio of 1.25 and 2.

## Tests of this part

The two projects and their rules are under [Tests](../CLAUDE.md#tests). This part's files:

- `npm run board test`, the unit project:
  - `apps/editors/test` (9 files, 144 tests): `suffixes.sync` (the table against the manifests,
    the registry against the table and against `index.d.ts`), `aliases.sync`, `base.sync`,
    `text-rules`, `zod-jitless`, `build-helpers` (two of its tests are Vite builds in memory),
    `webview-bundle` (one esbuild build in memory), `cruise-rules` and `notices` (56 tests: the
    generator on trees the test writes, on a real page of the board with the seven notations built
    in memory with esbuild, on a build on disk and in two Vite builds; the check's three reasons,
    a copied work among them, also one that a source names only in a plain comment).
    The notices tests write their trees into the OS temp folder and remove them.
- `npm run board test:browser`, the browser project:
  - `apps/editors/test/browser` (4 files, 62 tests): `real-editors` (58, the battery under
    [Real editors, as measured](renderer.md#real-editors-as-measured)), the two sheet files and
    `page-errors` (the watch itself). Nine of the battery's tests came with the fourth increment,
    under "seven model nodes whose folder is renamed": one folder move takes all seven along,
    each keeps its modeler, its view and its text in the element the board made for the new path
    and loads no module again, and Wardley Maps takes a real drag under the new path, is renamed
    while armed, stays armed and takes the next drag. Its `support/` folder has `mountBoard` (a
    board on a memory backend with the registry, whose `files` is the port the board's host
    stands on and whose `engine(nodeId)` finds a node's element again after a move),
    `mountAlone`, `shownChrome`, `shownView` and `watchPageErrors`, which a later browser test
    may import by relative path.
