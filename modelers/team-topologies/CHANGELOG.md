# Changelog

## [0.16.0](https://github.com/Miragon/modeler-suite/compare/team-topologies-v0.15.1...team-topologies-v0.16.0) (2026-10-30)


### ⚠ BREAKING CHANGES

* **team-topologies:** saveSVG() no longer draws a white sheet (rect.tt-export-paper) behind the diagram, so an exported SVG is transparent like the other notations' exports. A host that embeds the SVG on a coloured or dark background lays its own background under it; a PNG takes the guide's §10.7 background from the shell's svgToPng.

### Features

* **team-topologies:** deprecate createShortcutsDialog and the Geist helpers of team-topologies-renderer, removed in team-topologies 0.17.0 ([07a069c](https://github.com/Miragon/modeler-suite/commit/07a069c17ef66a4add377e03955767d7e14c5c0c))
* **team-topologies:** draw the template contours below 3:1 on an underlay in high contrast ([beb60d1](https://github.com/Miragon/modeler-suite/commit/beb60d1807cb6af98c7587afe8e30387c912a532))
* **team-topologies:** implement the contract's interaction and appearance surfaces ([#278](https://github.com/Miragon/modeler-suite/issues/278)) ([beb60d1](https://github.com/Miragon/modeler-suite/commit/beb60d1807cb6af98c7587afe8e30387c912a532))
* **team-topologies:** sync the diagram with its file through the modeler shell ([#333](https://github.com/Miragon/modeler-suite/issues/333)) ([bfff410](https://github.com/Miragon/modeler-suite/commit/bfff4104c61c7637e0a839613a021baa2a9d0f2d))
* **team-topologies:** use the shell's shortcuts dialog and PNG export, and drop the export sheet ([#267](https://github.com/Miragon/modeler-suite/issues/267)) ([07a069c](https://github.com/Miragon/modeler-suite/commit/07a069c17ef66a4add377e03955767d7e14c5c0c))


### Bug Fixes

* finish an import and keep the imported document when a host destroys the modeler from a listener the import triggers ([d962f54](https://github.com/Miragon/modeler-suite/commit/d962f54216c01f28639ec3253f3d7c580e22f728))
* keep the palette's focus ring whole, and keep each modeler's palette styles to its own canvas ([#392](https://github.com/Miragon/modeler-suite/issues/392)) ([c620895](https://github.com/Miragon/modeler-suite/commit/c620895610885730b7650480ac1b5bd94f0bb8d8))
* leave a key to the page when the host hid the canvas, also before the browser moves the focus away ([#424](https://github.com/Miragon/modeler-suite/issues/424)) ([aa03583](https://github.com/Miragon/modeler-suite/commit/aa035831d1a388df4305c54aafc33b7f1641360e))
* leave a key to the page when the host hid the modeler, also in its context pads, editors and popovers ([#446](https://github.com/Miragon/modeler-suite/issues/446)) ([0c596f3](https://github.com/Miragon/modeler-suite/commit/0c596f3cd900af2cc3c07da7586e765e878235e0))
* let a host destroy the modeler from a listener that an import calls ([#443](https://github.com/Miragon/modeler-suite/issues/443)) ([ec807d3](https://github.com/Miragon/modeler-suite/commit/ec807d303d907c73fed9d50044be85719d7469d0))
* let a host destroy the modeler from any listener when the user drops, presses Escape or creates an element ([#396](https://github.com/Miragon/modeler-suite/issues/396)) ([572a753](https://github.com/Miragon/modeler-suite/commit/572a7537504999fee59a29f3251cc7f4d4a6f85e))
* let a host destroy the modeler from the selection listener that reveal() triggers ([#426](https://github.com/Miragon/modeler-suite/issues/426)) ([d962f54](https://github.com/Miragon/modeler-suite/commit/d962f54216c01f28639ec3253f3d7c580e22f728))
* let a host destroy the modeler from the selection listener when the user starts a drag ([#370](https://github.com/Miragon/modeler-suite/issues/370)) ([b2f03e7](https://github.com/Miragon/modeler-suite/commit/b2f03e7faeb01377cb246553c97067eeaaad49a9))
* let a host destroy the modeler while the pointer rests on a palette entry ([#414](https://github.com/Miragon/modeler-suite/issues/414)) ([94b9c89](https://github.com/Miragon/modeler-suite/commit/94b9c895d12fea430d96a89c7f7472f36df1812b))
* open the source beside the diagram from the walkthrough, also after a reload ([#308](https://github.com/Miragon/modeler-suite/issues/308)) ([cc4db96](https://github.com/Miragon/modeler-suite/commit/cc4db96f54b2cd4df93e56fa6b28233cd8940d25))
* say what to do when an exported file can't be written, in every extension ([#295](https://github.com/Miragon/modeler-suite/issues/295)) ([a76a4fd](https://github.com/Miragon/modeler-suite/commit/a76a4fd536b8294ff238850da57f14113cceaa9f))
* **team-topologies:** draw no white sheet behind an exported diagram, so an SVG is transparent and a PNG fills the guide's background ([07a069c](https://github.com/Miragon/modeler-suite/commit/07a069c17ef66a4add377e03955767d7e14c5c0c))
* **team-topologies:** draw the palette's focus ring by the guide in high contrast, in a narrow canvas and in forced colours ([#431](https://github.com/Miragon/modeler-suite/issues/431)) ([855e50a](https://github.com/Miragon/modeler-suite/commit/855e50aed9a3ba7dfa8121b6d728877d4eab56dd))
* **team-topologies:** drop the shadow of the palette's tooltip in high contrast ([855e50a](https://github.com/Miragon/modeler-suite/commit/855e50aed9a3ba7dfa8121b6d728877d4eab56dd))
* **team-topologies:** end a drag cleanly when an import comes from the selection listener at its start ([#343](https://github.com/Miragon/modeler-suite/issues/343)) ([10cdc58](https://github.com/Miragon/modeler-suite/commit/10cdc58ec99038cac2ddebe75282c03b46fceae7))
* **team-topologies:** keep the shadows and the 2px focus rings where a host asks for normal contrast on a high-contrast page ([855e50a](https://github.com/Miragon/modeler-suite/commit/855e50aed9a3ba7dfa8121b6d728877d4eab56dd))
* **team-topologies:** let an import made during a drop wait until the drop has ended ([beb60d1](https://github.com/Miragon/modeler-suite/commit/beb60d1807cb6af98c7587afe8e30387c912a532))
* **team-topologies:** let an import wait until the user's action has finished ([#316](https://github.com/Miragon/modeler-suite/issues/316)) ([4fa091a](https://github.com/Miragon/modeler-suite/commit/4fa091a0d106d601eb0dfda455a906234ff73236))
* write a shared value at each of its places in JSON, and stop with an error before its copies exhaust the memory ([#363](https://github.com/Miragon/modeler-suite/issues/363)) ([4c324b9](https://github.com/Miragon/modeler-suite/commit/4c324b96386f9739a8243d45a3a47879a26ad10f))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @miragon/modeler-shell bumped from 0.7.0 to 0.8.0

## [0.15.1](https://github.com/Miragon/modeler-suite/compare/team-topologies-v0.15.0...team-topologies-v0.15.1) (2026-10-28)


### Bug Fixes

* open the source to the side from the walkthrough in every extension ([#244](https://github.com/Miragon/modeler-suite/issues/244)) ([6325498](https://github.com/Miragon/modeler-suite/commit/632549862937500d1a73075711430959c09b5e39))
* re-vendor cd-canvas.css of design guide 1.27.0 in the five renderers ([#255](https://github.com/Miragon/modeler-suite/issues/255)) ([9f412c0](https://github.com/Miragon/modeler-suite/commit/9f412c0018ba8ecc82838e4dac71bf09e2a20795))
* **team-topologies:** bound the nesting check's memory and issues ([#224](https://github.com/Miragon/modeler-suite/issues/224)) ([2881f98](https://github.com/Miragon/modeler-suite/commit/2881f986284c1b15bafd2509ba49374af3c25989))
* **team-topologies:** cancel a running drag or palette create when a text is imported ([#205](https://github.com/Miragon/modeler-suite/issues/205)) ([ba6dc21](https://github.com/Miragon/modeler-suite/commit/ba6dc21f8abeec4c8eda1aceb340bd923a545e73))
* **team-topologies:** keep the Problems view from overflowing the stack on deep text after a comment, a broken string or a closing bracket of the other kind ([2881f98](https://github.com/Miragon/modeler-suite/commit/2881f986284c1b15bafd2509ba49374af3c25989))
* **team-topologies:** name a nesting issue by the first four keys of its path in the Problems view ([2881f98](https://github.com/Miragon/modeler-suite/commit/2881f986284c1b15bafd2509ba49374af3c25989))
* **team-topologies:** replace the diagram chunk of a .tt.png instead of adding a second one ([#209](https://github.com/Miragon/modeler-suite/issues/209)) ([45a32b2](https://github.com/Miragon/modeler-suite/commit/45a32b26872de8ddeba04225417ad87332273d7d))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @miragon/modeler-shell bumped from 0.6.0 to 0.7.0

## [0.15.0](https://github.com/Miragon/modeler-suite/compare/team-topologies-v0.14.0...team-topologies-v0.15.0) (2026-10-28)


### ⚠ BREAKING CHANGES

* **team-topologies:** TtViewerOptions, CollaborativeTeamTopologiesOptions and TtPaletteConfig no longer take freeRectCenter, deprecated since 0.12; pass freeArea: { center } instead, which already won when a host passed both.
* **team-topologies:** the renderer no longer exports ICON_MENU, ICON_PLUS, ICON_MINUS, ICON_MAXIMIZE, ICON_DOWNLOAD and ICON_X; take the icons of a host's chrome from @miragon/modeler-shell (its ICONS and iconMarkup have menu, plus, minus, maximize and x) and Lucide's download from lucide-static. The canvas icons and iconMarkup stay.
* **team-topologies:** Viewer, NavigatedViewer and Modeler no longer have fitToView(); importDocument fits the diagram unless it gets fit: false, a host on the modeler shell fits through the shell's viewport, and any other host fits on demand with get("canvas").zoom("fit-viewport"), which keeps the undo history that a second import resets but leaves no strip free under the palette.
* **team-topologies:** Viewer, NavigatedViewer and Modeler no longer have setMeta(); a Modeler renames the diagram with get("ttModeling").setTitle(title), one undo step, and a Viewer or NavigatedViewer, which has no ttModeling, takes a new title with importDocument({ ...exportDocument(), title }, { fit: false }); getMeta() still reads the title.
* **team-topologies:** parseDocument refuses a document whose objects and arrays nest more than 100 levels deep (MAX_NESTING_DEPTH, the document counting as the first level), with an issue at the first level too deep; keep the data of unknown fields shallower than that.

### Features

* add New … from Example to the New File menu of every extension ([#196](https://github.com/Miragon/modeler-suite/issues/196)) ([e1d5541](https://github.com/Miragon/modeler-suite/commit/e1d55415fbab56ce8e669406efab7a6ef677563d))
* **team-topologies:** remove fitToView from the viewers ([8207974](https://github.com/Miragon/modeler-suite/commit/82079743e93801d17567881bc2926c14133fa64e))
* **team-topologies:** remove setMeta from the viewers ([8207974](https://github.com/Miragon/modeler-suite/commit/82079743e93801d17567881bc2926c14133fa64e))
* **team-topologies:** remove the deprecated palette field, host-chrome icons, fitToView and setMeta, and limit document depth ([#194](https://github.com/Miragon/modeler-suite/issues/194)) ([8207974](https://github.com/Miragon/modeler-suite/commit/82079743e93801d17567881bc2926c14133fa64e))
* **team-topologies:** stop exporting the host-chrome icons from the renderer ([8207974](https://github.com/Miragon/modeler-suite/commit/82079743e93801d17567881bc2926c14133fa64e))


### Bug Fixes

* **team-topologies:** refuse documents nested more than 100 levels deep ([8207974](https://github.com/Miragon/modeler-suite/commit/82079743e93801d17567881bc2926c14133fa64e))
* **team-topologies:** report files too deep for the JSON tree parser in the Problems view ([8207974](https://github.com/Miragon/modeler-suite/commit/82079743e93801d17567881bc2926c14133fa64e))

## [0.14.0](https://github.com/Miragon/modeler-suite/compare/team-topologies-v0.13.2...team-topologies-v0.14.0) (2026-10-25)


### Features

* **shell:** check the production webview bundle under its CSP in the kit ([#156](https://github.com/Miragon/modeler-suite/issues/156)) ([a205a0b](https://github.com/Miragon/modeler-suite/commit/a205a0b9208fbed703b8e210320f847c8b9db607))
* **shell:** run the kit per document and check that an empty file opens at 100 % with its hint ([#157](https://github.com/Miragon/modeler-suite/issues/157)) ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))
* **shell:** treat EditContext and Monaco editors as text fields ([#137](https://github.com/Miragon/modeler-suite/issues/137)) ([ebacfca](https://github.com/Miragon/modeler-suite/commit/ebacfcacbadb6359d6acb2401486a6e9a8da5669))
* **team-topologies:** export menu content, legend rows and dialogs from the renderer ([#128](https://github.com/Miragon/modeler-suite/issues/128)) ([116cdfe](https://github.com/Miragon/modeler-suite/commit/116cdfeba484b029bfc263c8cc4e63239cb6ceeb))


### Bug Fixes

* **context-maps:** show the empty-file hint on an empty map after the web app's start screen ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))
* **event-storming:** show the empty-file hint on an empty board after the web app's start screen ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))
* **plugin:** show the empty-file hint after "New diagram" in the new-modeler template's web app ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))
* **shell:** name a shifted chip's keys for US and German in aria-keyshortcuts ([#154](https://github.com/Miragon/modeler-suite/issues/154)) ([fc2009e](https://github.com/Miragon/modeler-suite/commit/fc2009edad59315cddfa3b5c95c5b3dd05213dd1))
* **team-topologies:** draw the interaction fills opaque and the palette tooltip in the guide's look ([#150](https://github.com/Miragon/modeler-suite/issues/150)) ([2308a20](https://github.com/Miragon/modeler-suite/commit/2308a20a2258e29412c064082d68c70435cc45f1))
* **team-topologies:** drop the em dashes from the tt-format checker's report ([#152](https://github.com/Miragon/modeler-suite/issues/152)) ([6e56192](https://github.com/Miragon/modeler-suite/commit/6e56192f0669988cbc86f1ea17589f8997d08432))
* **team-topologies:** frame label text past its shape in SVG and PNG exports ([#123](https://github.com/Miragon/modeler-suite/issues/123)) ([9cecff4](https://github.com/Miragon/modeler-suite/commit/9cecff41499ad3c77d910a203b000d2c6154768e))
* **team-topologies:** show palette tooltips at their entry and keep the context pad in the free area ([#130](https://github.com/Miragon/modeler-suite/issues/130)) ([6718bc2](https://github.com/Miragon/modeler-suite/commit/6718bc24bb978e9b75a34c7fd1f32eed60aa6510))
* **team-topologies:** show the empty-file hint on an empty diagram after the web app's start screen ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))
* **team-topologies:** take canvas keys only from the focused canvas ([#141](https://github.com/Miragon/modeler-suite/issues/141)) ([24127e5](https://github.com/Miragon/modeler-suite/commit/24127e57fa6521f493ceb572698aaa98d69cbdf0))
* **value-chain:** show the empty-file hint on an empty diagram after the web app's start screen ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @miragon/modeler-shell bumped from 0.5.0 to 0.6.0

## [0.13.2](https://github.com/Miragon/team-topologies-modeler/compare/v0.13.1...v0.13.2) (2026-10-24)


### Bug Fixes

* **deps:** adopt modeler-shell 0.5.0, whose legend starts closed ([#156](https://github.com/Miragon/team-topologies-modeler/issues/156)) ([737ae5a](https://github.com/Miragon/team-topologies-modeler/commit/737ae5a0524732de976514d6fec2ae012cd84d12))

## [0.13.1](https://github.com/Miragon/team-topologies-modeler/compare/v0.13.0...v0.13.1) (2026-10-23)


### Bug Fixes

* **deps:** adopt modeler-shell 0.4.1 for a VS Code smoke that retries a missed theme switch ([#154](https://github.com/Miragon/team-topologies-modeler/issues/154)) ([71d1b31](https://github.com/Miragon/team-topologies-modeler/commit/71d1b31f24ebf6fe3f3ba03d4dc9747f23de9150))

## [0.13.0](https://github.com/Miragon/team-topologies-modeler/compare/v0.12.0...v0.13.0) (2026-10-23)


### Features

* **renderer:** report the content bounds a host fits to and adopt modeler-shell 0.4.0 ([#151](https://github.com/Miragon/team-topologies-modeler/issues/151)) ([3603dfb](https://github.com/Miragon/team-topologies-modeler/commit/3603dfb467da0a2e6ee9ae65598bd5d52e5a0d83))

## [0.12.0](https://github.com/Miragon/team-topologies-modeler/compare/v0.11.2...v0.12.0) (2026-10-21)


### ⚠ BREAKING CHANGES

* parseDocument and documentIdProblems refuse ids that name a built-in property of JavaScript objects (constructor, toString, __proto__, hasOwnProperty, valueOf, ...).
* **schema-model:** parseDocument refuses a version 2 or 3 document with an interaction that has no position or size instead of dropping that interaction.

### Features

* explain the notation in the legend, tighten document checks and implement modeler-api 1.2 ([#129](https://github.com/Miragon/team-topologies-modeler/issues/129)) ([bb58b61](https://github.com/Miragon/team-topologies-modeler/commit/bb58b612429efb451bdbe51695282b0365c587ab))

## [0.11.2](https://github.com/Miragon/team-topologies-modeler/compare/v0.11.1...v0.11.2) (2026-10-20)


### Bug Fixes

* **renderer:** ship the design tokens in a cascade layer so a host's own tokens win ([#126](https://github.com/Miragon/team-topologies-modeler/issues/126)) ([05dd296](https://github.com/Miragon/team-topologies-modeler/commit/05dd296b167f098f651580706ef87c55a797049a))

## [0.11.1](https://github.com/Miragon/team-topologies-modeler/compare/v0.11.0...v0.11.1) (2026-10-20)


### Bug Fixes

* **vscode:** bundle jsonc-parser's ESM build so the extension activates again ([#123](https://github.com/Miragon/team-topologies-modeler/issues/123)) ([748a2ec](https://github.com/Miragon/team-topologies-modeler/commit/748a2ecea4ed3e57ec6bea761bfcf903ac0640ab))

## [0.11.0](https://github.com/Miragon/team-topologies-modeler/compare/v0.10.1...v0.11.0) (2026-10-20)


### ⚠ BREAKING CHANGES

* parseDocument keeps unknown fields instead of stripping them and rejects duplicate and reserved ids; serializeDocument(doc) ends with "\n".
* **renderer:** the canvas no longer binds +, -, Shift+0 and Shift+1; importDocument fires no commandStack.changed, rejects colliding ids and takes { fit }; palette entries are no tab stops and react to a click with detail 0 instead of keydown; the canvas svg has no role="group".

### Features

* adopt @miragon/modeler-api and @miragon/modeler-shell in VS Code and the web app ([#122](https://github.com/Miragon/team-topologies-modeler/issues/122)) ([72cbf24](https://github.com/Miragon/team-topologies-modeler/commit/72cbf247ea64c71d09add4ae113213e12857ba2a))
* Miragon design system UI/UX overhaul, VS Code inspector and stacked-lane layout ([#118](https://github.com/Miragon/team-topologies-modeler/issues/118)) ([60e1ec6](https://github.com/Miragon/team-topologies-modeler/commit/60e1ec67982bad6c23dec29d8a3cb8fd17a46fa3))
* **plugin:** ship the Team Topologies skills as a Claude Code plugin ([#109](https://github.com/Miragon/team-topologies-modeler/issues/109)) ([98bc278](https://github.com/Miragon/team-topologies-modeler/commit/98bc2781b6a77c52baa1a27beedfdbf21f3916bc))
* **plugin:** teach stacked stream-aligned lanes in the Team Topologies skills ([60e1ec6](https://github.com/Miragon/team-topologies-modeler/commit/60e1ec67982bad6c23dec29d8a3cb8fd17a46fa3))
* **renderer:** apply the Miragon design system and make the canvas keyboard-accessible ([60e1ec6](https://github.com/Miragon/team-topologies-modeler/commit/60e1ec67982bad6c23dec29d8a3cb8fd17a46fa3))
* **schema-model:** lay out the example with stacked stream-aligned lanes ([60e1ec6](https://github.com/Miragon/team-topologies-modeler/commit/60e1ec67982bad6c23dec29d8a3cb8fd17a46fa3))
* **ui:** add a private package with the inspector and legend shared by both apps ([60e1ec6](https://github.com/Miragon/team-topologies-modeler/commit/60e1ec67982bad6c23dec29d8a3cb8fd17a46fa3))
* **vscode:** add the inspector and a legend toggle to the custom editor ([60e1ec6](https://github.com/Miragon/team-topologies-modeler/commit/60e1ec67982bad6c23dec29d8a3cb8fd17a46fa3))
* **webapp:** redesign the editor chrome and guard against losing a diagram ([60e1ec6](https://github.com/Miragon/team-topologies-modeler/commit/60e1ec67982bad6c23dec29d8a3cb8fd17a46fa3))


### Bug Fixes

* **ci:** sign Claude's dependency-repair commits ([#116](https://github.com/Miragon/team-topologies-modeler/issues/116)) ([1f389ea](https://github.com/Miragon/team-topologies-modeler/commit/1f389ea9787b831039f858bc840f567605258e31))
* **ci:** skip npm ci before the Claude dependency repair ([#115](https://github.com/Miragon/team-topologies-modeler/issues/115)) ([00dbadf](https://github.com/Miragon/team-topologies-modeler/commit/00dbadf05a64fe7075f9cb2236c666ec4fea0ebe))
* **renderer:** only emit Lucide elements and attributes from iconMarkup ([#119](https://github.com/Miragon/team-topologies-modeler/issues/119)) ([ef29878](https://github.com/Miragon/team-topologies-modeler/commit/ef298784566f7735f901c4c28a84a1da18d0070b))


### Reverts

* **ci:** drop commit signing for Claude's dependency repair ([#117](https://github.com/Miragon/team-topologies-modeler/issues/117)) ([313a213](https://github.com/Miragon/team-topologies-modeler/commit/313a213d9cc99097e9922f8518e4f6023d9020e3))

## [0.10.1](https://github.com/Miragon/team-topologies-modeler/compare/v0.10.0...v0.10.1) (2026-10-10)


### Bug Fixes

* **vscode:** one JSON language for *.tt and *.ttm.json ([#107](https://github.com/Miragon/team-topologies-modeler/issues/107)) ([14331f1](https://github.com/Miragon/team-topologies-modeler/commit/14331f122e01a9af81bb5b03e5deabc7e86cea00))

## [0.10.0](https://github.com/Miragon/team-topologies-modeler/compare/v0.9.0...v0.10.0) (2026-10-10)


### Features

* **vscode:** file icon for *.ttm.json ([#105](https://github.com/Miragon/team-topologies-modeler/issues/105)) ([e63b177](https://github.com/Miragon/team-topologies-modeler/commit/e63b1770f756d8b8e38db9ea3b56fd5cc6be83dc))

## [0.9.0](https://github.com/Miragon/team-topologies-modeler/compare/v0.8.0...v0.9.0) (2026-10-08)


### Features

* use the Team Topologies modeler icon for app, favicon and .tt files ([#101](https://github.com/Miragon/team-topologies-modeler/issues/101)) ([6aa6016](https://github.com/Miragon/team-topologies-modeler/commit/6aa60163982e0db0e877c2f504e3e3df8a16261e))

## [0.8.0](https://github.com/Miragon/team-topologies-modeler/compare/v0.7.1...v0.8.0) (2026-09-28)


### ⚠ BREAKING CHANGES

* DOCUMENT_VERSION is 3 and TtDocument has a required `annotations` array (v1/v2 documents migrate on parse; an empty list is not serialised, so re-saving a v2 file only changes its version). isTtElement() now matches shapes only; annotation connectors are TtAssociation.

### Features

* multi-selection, text annotations and in-place label editing ([#94](https://github.com/Miragon/team-topologies-modeler/issues/94)) ([533e49a](https://github.com/Miragon/team-topologies-modeler/commit/533e49a113dcea50315b98def48afaf28364b880))

## [0.7.1](https://github.com/Miragon/team-topologies-modeler/compare/v0.7.0...v0.7.1) (2026-09-22)


### Bug Fixes

* **deps:** publish shared runtime libs as ranged peerDependencies ([#88](https://github.com/Miragon/team-topologies-modeler/issues/88)) ([90f1aa5](https://github.com/Miragon/team-topologies-modeler/commit/90f1aa56a74310bf5d63261929e3c9541d75b7eb))

## [0.7.0](https://github.com/Miragon/team-topologies-modeler/compare/v0.6.0...v0.7.0) (2026-09-18)


### Features

* **webapp:** left-align legal footer and add dynamic copyright ([#57](https://github.com/Miragon/team-topologies-modeler/issues/57)) ([069620c](https://github.com/Miragon/team-topologies-modeler/commit/069620c3c7589d641ee82f35dea7ba27e8edf238))

## [0.6.0](https://github.com/Miragon/team-topologies-modeler/compare/v0.5.0...v0.6.0) (2026-07-17)


### Features

* adopt Miragon corporate identity ([#52](https://github.com/Miragon/team-topologies-modeler/issues/52)) ([900be13](https://github.com/Miragon/team-topologies-modeler/commit/900be13fdba1377789d66f27f7cd260fb3888b49))
* **renderer:** add copy & paste of elements ([#56](https://github.com/Miragon/team-topologies-modeler/issues/56)) ([b9b13a3](https://github.com/Miragon/team-topologies-modeler/commit/b9b13a3b754c6314f258c086952d18f0004c57bc))

## [0.5.0](https://github.com/Miragon/team-topologies-modeler/compare/v0.4.0...v0.5.0) (2026-07-09)


### Features

* **webapp:** add empty-state welcome card and start empty ([#47](https://github.com/Miragon/team-topologies-modeler/issues/47)) ([3376b87](https://github.com/Miragon/team-topologies-modeler/commit/3376b87120bc34a3e668d5ee9c8885f720580e66))

## [0.4.0](https://github.com/Miragon/team-topologies-modeler/compare/v0.3.1...v0.4.0) (2026-07-07)


### Features

* **dev:** adopt documented Portless setup for worktree-aware dev URLs ([#31](https://github.com/Miragon/team-topologies-modeler/issues/31)) ([2155439](https://github.com/Miragon/team-topologies-modeler/commit/2155439858dea3af7023cf2cf0156a1b071fdabc))
* **vscode:** add Get Started walkthrough and align README with Miragon Modeler reference ([#41](https://github.com/Miragon/team-topologies-modeler/issues/41)) ([a4afbad](https://github.com/Miragon/team-topologies-modeler/commit/a4afbad61606a87fa77fedac6448c9a2130e9794))

## [0.3.1](https://github.com/Miragon/team-topologies-modeler/compare/v0.3.0...v0.3.1) (2026-06-22)


### Bug Fixes

* README badges + repository URL casing for npm provenance (0.3.1) ([#27](https://github.com/Miragon/team-topologies-modeler/issues/27)) ([9a09a36](https://github.com/Miragon/team-topologies-modeler/commit/9a09a36b5308156a8d5dfd9b1a39870e48785790))

## [0.3.0](https://github.com/Miragon/team-topologies-modeler/compare/v0.2.0...v0.3.0) (2026-06-22)


### Features

* setup vs-code plugin ([#2](https://github.com/Miragon/team-topologies-modeler/issues/2)) ([91f8103](https://github.com/Miragon/team-topologies-modeler/commit/91f81036b9079ddab129db0c92a548ca167e8a94))
* **webapp:** legal notice footer + Portless named dev URL ([#16](https://github.com/Miragon/team-topologies-modeler/issues/16)) ([77f7ab4](https://github.com/Miragon/team-topologies-modeler/commit/77f7ab431d59c64fcc4105e8d6eb96113b4c8402))


### Bug Fixes

* **deps:** clear all npm audit advisories + Miragon favicon ([#21](https://github.com/Miragon/team-topologies-modeler/issues/21)) ([bf1d090](https://github.com/Miragon/team-topologies-modeler/commit/bf1d090074201de690aa924a6f75b72b09f8306c))
* **deps:** clear all npm audit advisories + Miragon favicon ([#21](https://github.com/Miragon/team-topologies-modeler/issues/21)) ([7095661](https://github.com/Miragon/team-topologies-modeler/commit/70956619aa2e157d76bdbf591b97db56b6000ee5))
* stop elements gluing together and unify the platform team border ([#13](https://github.com/Miragon/team-topologies-modeler/issues/13)) ([10ff90f](https://github.com/Miragon/team-topologies-modeler/commit/10ff90f6e71034e1368691668d7d42a91abb0eb8))
