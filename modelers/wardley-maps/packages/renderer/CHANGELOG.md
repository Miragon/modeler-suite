# Changelog

## [0.14.0](https://github.com/Miragon/modeler-suite/compare/wardley-renderer-v0.13.0...wardley-renderer-v0.14.0) (2026-10-30)


### Features

* **wardley-maps:** deprecate createShortcutsDialog and svgToPng of @miragon/wardley-renderer, removed in wardley-renderer 0.15.0 ([#258](https://github.com/Miragon/modeler-suite/issues/258)) ([596bca5](https://github.com/Miragon/modeler-suite/commit/596bca5364f700e5073bd14610b3ff4ce2d282ec))
* **wardley-maps:** export a PNG on the plot's white with Geist embedded, and warn when its labels fall back to a system font ([596bca5](https://github.com/Miragon/modeler-suite/commit/596bca5364f700e5073bd14610b3ff4ce2d282ec))
* **wardley-maps:** implement the contract's interaction and appearance surfaces ([#276](https://github.com/Miragon/modeler-suite/issues/276)) ([42a5258](https://github.com/Miragon/modeler-suite/commit/42a5258cc70b95d394b8cd8f968b04989e691468))
* **wardley-maps:** use the shell's shortcuts dialog and PNG export ([#271](https://github.com/Miragon/modeler-suite/issues/271)) ([596bca5](https://github.com/Miragon/modeler-suite/commit/596bca5364f700e5073bd14610b3ff4ce2d282ec))


### Bug Fixes

* **event-storming:** keep an undo or a redo made while a point of a drawing is dragged: the drag ends there without a change, and the release no longer writes the drawing back over it ([40961cd](https://github.com/Miragon/modeler-suite/commit/40961cd0c0830e2ac08c6aca9c0e4a01ce0ffac2))
* finish an import and keep the imported document when a host destroys the modeler from a listener the import triggers ([d962f54](https://github.com/Miragon/modeler-suite/commit/d962f54216c01f28639ec3253f3d7c580e22f728))
* keep a line being drawn when a key reaches the palette right after the host hid the canvas or made it inert ([#413](https://github.com/Miragon/modeler-suite/issues/413)) ([f5471e3](https://github.com/Miragon/modeler-suite/commit/f5471e3757c65576409a67613976ea05364c4e52))
* keep the arrow keys, the single-key tools, paste and duplicate from acting while a point of a drawing is dragged ([#391](https://github.com/Miragon/modeler-suite/issues/391)) ([40961cd](https://github.com/Miragon/modeler-suite/commit/40961cd0c0830e2ac08c6aca9c0e4a01ce0ffac2))
* leave a key to the page when the host hid the canvas, also before the browser moves the focus away ([#424](https://github.com/Miragon/modeler-suite/issues/424)) ([aa03583](https://github.com/Miragon/modeler-suite/commit/aa035831d1a388df4305c54aafc33b7f1641360e))
* leave a key to the page when the host hid the modeler, also in its context pads, editors and popovers ([#446](https://github.com/Miragon/modeler-suite/issues/446)) ([0c596f3](https://github.com/Miragon/modeler-suite/commit/0c596f3cd900af2cc3c07da7586e765e878235e0))
* leave a key to the page when the host made the canvas inert, also before the browser moves the focus away ([#390](https://github.com/Miragon/modeler-suite/issues/390)) ([694e9fd](https://github.com/Miragon/modeler-suite/commit/694e9fd8aff1eb562300343e4acf147f5a183340))
* let a host destroy the modeler from a listener that an import calls ([#443](https://github.com/Miragon/modeler-suite/issues/443)) ([ec807d3](https://github.com/Miragon/modeler-suite/commit/ec807d303d907c73fed9d50044be85719d7469d0))
* let a host destroy the modeler from any listener when the user drops, presses Escape or creates an element ([#396](https://github.com/Miragon/modeler-suite/issues/396)) ([572a753](https://github.com/Miragon/modeler-suite/commit/572a7537504999fee59a29f3251cc7f4d4a6f85e))
* let a host destroy the modeler from the selection listener that reveal() triggers ([#426](https://github.com/Miragon/modeler-suite/issues/426)) ([d962f54](https://github.com/Miragon/modeler-suite/commit/d962f54216c01f28639ec3253f3d7c580e22f728))
* let a host destroy the modeler from the selection listener when the user starts a drag ([#370](https://github.com/Miragon/modeler-suite/issues/370)) ([b2f03e7](https://github.com/Miragon/modeler-suite/commit/b2f03e7faeb01377cb246553c97067eeaaad49a9))
* let a host destroy the modeler while the pointer rests on a palette entry ([#414](https://github.com/Miragon/modeler-suite/issues/414)) ([94b9c89](https://github.com/Miragon/modeler-suite/commit/94b9c895d12fea430d96a89c7f7472f36df1812b))
* save the line being drawn with Space on the Draw entry, and in Wardley Maps keep a drawing selected when an undo, a redo or another command ends the drag of one of its points ([#442](https://github.com/Miragon/modeler-suite/issues/442)) ([5bf0daf](https://github.com/Miragon/modeler-suite/commit/5bf0dafd9340cddee9e40c1d235d27e78fd920b9))
* **wardley-maps:** draw multi-line names clear of pipeline edges and save a typed backslash-n as text ([#307](https://github.com/Miragon/modeler-suite/issues/307)) ([15bd9cb](https://github.com/Miragon/modeler-suite/commit/15bd9cb66d887691d53db6357cb31555d9f1354c))
* **wardley-maps:** end a point drag on any command, and let an import from the change listener wait for the edit ([#306](https://github.com/Miragon/modeler-suite/issues/306)) ([465d3c7](https://github.com/Miragon/modeler-suite/commit/465d3c7eed8bff1dbfc9b01d05efa827d599717d))
* **wardley-maps:** give the palette and its tooltip the guide's sizes, forced-colours rules and pressed state ([#441](https://github.com/Miragon/modeler-suite/issues/441)) ([5a6d257](https://github.com/Miragon/modeler-suite/commit/5a6d257b981b3399f36d2f23508b0ec505a93819))
* **wardley-maps:** keep a dragged evolve target or label out of the exported text until it is released ([#360](https://github.com/Miragon/modeler-suite/issues/360)) ([0dfae07](https://github.com/Miragon/modeler-suite/commit/0dfae07dd3690696519763f37df928b6c3858965))
* **wardley-maps:** keep IME composition in the link and flow editors, and show a focus ring on every inline editor ([#362](https://github.com/Miragon/modeler-suite/issues/362)) ([90275dc](https://github.com/Miragon/modeler-suite/commit/90275dc2675c19e4b4bfda900ff94849aa6e9d68))
* **wardley-maps:** keep the axis popover open while an input method composes, and show no shadows and 3px focus rings in high contrast ([#387](https://github.com/Miragon/modeler-suite/issues/387)) ([75a4f30](https://github.com/Miragon/modeler-suite/commit/75a4f30b789e457062c2a6764ce190c811d46886))
* **wardley-maps:** keep the palette's focus ring whole and visible, and keep the title dialog and single-key tools from acting on an input method's or a point drag's keys ([#421](https://github.com/Miragon/modeler-suite/issues/421)) ([8f311ba](https://github.com/Miragon/modeler-suite/commit/8f311ba9e8eec2700752aff9dbc9385d50b8ff3f))
* **wardley-maps:** let an import from the change listener of a drop wait until the drop has ended ([42a5258](https://github.com/Miragon/modeler-suite/commit/42a5258cc70b95d394b8cd8f968b04989e691468))
* **wardley-maps:** let an import wait until the user's action has finished ([#334](https://github.com/Miragon/modeler-suite/issues/334)) ([a64dd0e](https://github.com/Miragon/modeler-suite/commit/a64dd0ef9530171d142872265326ba2ffb91fd7e))
* **wardley-maps:** let Escape end the evolve and point drags, and keep other keys out of a line being drawn ([#354](https://github.com/Miragon/modeler-suite/issues/354)) ([9ad646b](https://github.com/Miragon/modeler-suite/commit/9ad646bd26db12449f7ed4f0782b2726509f78b3))
* **wardley-maps:** outline the palette tooltip in high contrast and leave other editors' tooltips alone ([#408](https://github.com/Miragon/modeler-suite/issues/408)) ([2fa7ac9](https://github.com/Miragon/modeler-suite/commit/2fa7ac949fe7fc33fb59a4ffa9b52af131ee9967))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/modeler-api bumped from 1.5.0 to 1.6.0
    * @miragon/wardley-dsl bumped from 0.8.0 to 0.8.1
    * @miragon/wardley-schema-model bumped from 0.6.0 to 0.6.1

## [0.13.0](https://github.com/Miragon/modeler-suite/compare/wardley-renderer-v0.12.0...wardley-renderer-v0.13.0) (2026-10-28)


### Features

* **wardley-maps:** break a label's line with Shift+Enter ([#253](https://github.com/Miragon/modeler-suite/issues/253)) ([8314e7c](https://github.com/Miragon/modeler-suite/commit/8314e7ce6283151ead8d697f7c1f0e0b84354339))


### Bug Fixes

* re-vendor cd-canvas.css of design guide 1.27.0 in the five renderers ([#255](https://github.com/Miragon/modeler-suite/issues/255)) ([9f412c0](https://github.com/Miragon/modeler-suite/commit/9f412c0018ba8ecc82838e4dac71bf09e2a20795))
* **wardley-maps:** survive an import during a drop and keep armed tools armed ([#245](https://github.com/Miragon/modeler-suite/issues/245)) ([8dbbc71](https://github.com/Miragon/modeler-suite/commit/8dbbc71a4e0c0235662708d34b550d05d252ad99))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/modeler-api bumped from 1.4.0 to 1.5.0
    * @miragon/wardley-dsl bumped from 0.7.1 to 0.8.0

## [0.12.0](https://github.com/Miragon/modeler-suite/compare/wardley-renderer-v0.11.0...wardley-renderer-v0.12.0) (2026-10-28)


### ⚠ BREAKING CHANGES

* **wardley-maps:** The viewers and both collaborative factories of the Wardley renderer no longer take the `freeRectInsets` option, deprecated since 0.9.0. Pass `freeArea: { insets }` instead, the option name of contract 1.2.
* **wardley-maps:** The viewers and both collaborative factories of the Wardley renderer no longer take the `keyboard: { undoRedo }` option, deprecated since 0.9.0. Pass `undoRedoKeys` instead.
* **wardley-maps:** The Wardley renderer no longer exports the 16 Material `ICON_*` chrome icons and `iconMarkup`, deprecated since 0.8.0. Take a host's chrome icons from the modeler shell instead: `ICONS` with its `iconMarkup` and `iconElement` (Lucide).
* **wardley-maps:** `MIRAGON` of the Wardley renderer no longer has the key `navy`, deprecated since 0.11.0. The design system has no navy surface (guide §3.1), so there is no replacement colour: draw dark surfaces from the design system's `--cd-ui-*` roles instead.

### Features

* **wardley-maps:** remove the deprecated keyboard undoRedo option of the renderer ([ecd79e7](https://github.com/Miragon/modeler-suite/commit/ecd79e750232d36163611590de600b39346be5f6))
* **wardley-maps:** remove the deprecated Material icon exports of the renderer ([ecd79e7](https://github.com/Miragon/modeler-suite/commit/ecd79e750232d36163611590de600b39346be5f6))
* **wardley-maps:** remove the deprecated MIRAGON.navy of the renderer ([ecd79e7](https://github.com/Miragon/modeler-suite/commit/ecd79e750232d36163611590de600b39346be5f6))
* **wardley-maps:** remove the deprecated renderer options, ICON_* exports and MIRAGON.navy ([#187](https://github.com/Miragon/modeler-suite/issues/187)) ([ecd79e7](https://github.com/Miragon/modeler-suite/commit/ecd79e750232d36163611590de600b39346be5f6))


### Bug Fixes

* **wardley-maps:** leave Enter and Escape on the host's controls while a draw tool is armed ([#188](https://github.com/Miragon/modeler-suite/issues/188)) ([f392f0c](https://github.com/Miragon/modeler-suite/commit/f392f0c5ea6ed4d29efce469a90599c00a79c7c6))

## [0.11.0](https://github.com/Miragon/modeler-suite/compare/wardley-renderer-v0.10.0...wardley-renderer-v0.11.0) (2026-10-25)


### ⚠ BREAKING CHANGES

* **wardley-maps:** Wardley Maps' canvas acts on keys only while its `<svg>` has the focus. Cmd/Ctrl+Z, Cmd/Ctrl+Y and the single-key tools C, U, N, P, L and A no longer act from a focused host button, and no key acts while the page itself (`<body>`) has the focus, for example before the first click on the canvas or after a click on page text. A host that hides the canvas without destroying it makes it `inert`.

### Bug Fixes

* **wardley-maps:** deprecate MIRAGON.navy ([aa5f58f](https://github.com/Miragon/modeler-suite/commit/aa5f58f78bd4a357ea67a8b717e880630eaabf0c))
* **wardley-maps:** draw the context pad with Lucide icons ([#147](https://github.com/Miragon/modeler-suite/issues/147)) ([aa5f58f](https://github.com/Miragon/modeler-suite/commit/aa5f58f78bd4a357ea67a8b717e880630eaabf0c))
* **wardley-maps:** fill annotation markers with the plot white of every element ([aa5f58f](https://github.com/Miragon/modeler-suite/commit/aa5f58f78bd4a357ea67a8b717e880630eaabf0c))
* **wardley-maps:** keep the caret in a link editor reopened by an import ([#121](https://github.com/Miragon/modeler-suite/issues/121)) ([5116b15](https://github.com/Miragon/modeler-suite/commit/5116b15738f23e8b6cec5d094e42d465710574bf))
* **wardley-maps:** take canvas keys only from the focused canvas ([#136](https://github.com/Miragon/modeler-suite/issues/136)) ([209a412](https://github.com/Miragon/modeler-suite/commit/209a412378d3e82f94f3040ae43abe90a8b17a1d))
* **wardley-maps:** write diagnostics, toasts and tooltips without em dashes ([#149](https://github.com/Miragon/modeler-suite/issues/149)) ([9ca9a2c](https://github.com/Miragon/modeler-suite/commit/9ca9a2c9671fa4039e3bae89d7e76289af7b8f17))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/modeler-api bumped from 1.3.0 to 1.4.0
    * @miragon/wardley-dsl bumped from 0.7.0 to 0.7.1

## [0.10.0](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.9.1...renderer-v0.10.0) (2026-10-23)


### Features

* **renderer:** report content bounds (contract 1.3) and show the "?" chip on Keyboard shortcuts… ([#159](https://github.com/Miragon/wardley-maps-modeler/issues/159)) ([6d633cb](https://github.com/Miragon/wardley-maps-modeler/commit/6d633cb314a24a7911cd1b798f7669334aed4d48))

## [0.9.1](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.9.0...renderer-v0.9.1) (2026-10-22)


### Bug Fixes

* **renderer:** accept didi 12 as a peer dependency ([#155](https://github.com/Miragon/wardley-maps-modeler/issues/155)) ([b6576e0](https://github.com/Miragon/wardley-maps-modeler/commit/b6576e0fd871288833eccd8cc42990285d53f9d8))

## [0.9.0](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.8.0...renderer-v0.9.0) (2026-10-21)


### Features

* **renderer:** implement modeler-api contract 1.2 and the Design IQ follow-ups ([#142](https://github.com/Miragon/wardley-maps-modeler/issues/142)) ([1839416](https://github.com/Miragon/wardley-maps-modeler/commit/1839416e80fea54098564d3a26d1d05c85a34547))

## [0.8.0](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.7.0...renderer-v0.8.0) (2026-10-20)


### Features

* implement the modeler-api contract and mount the modeler shell in VS Code and the web app ([#134](https://github.com/Miragon/wardley-maps-modeler/issues/134)) ([4510c7a](https://github.com/Miragon/wardley-maps-modeler/commit/4510c7a629be826fa27ad563ff49700e4121a1f9))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.6.0 to 0.7.0

## [0.7.0](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.6.3...renderer-v0.7.0) (2026-10-17)


### Features

* UX overhaul of the modeler and undoable, DSL-safe map resizing ([#131](https://github.com/Miragon/wardley-maps-modeler/issues/131)) ([4416f8f](https://github.com/Miragon/wardley-maps-modeler/commit/4416f8f8840b90f1b17ce5692b8496364b4e3dcb))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.5.3 to 0.6.0
    * @miragon/wardley-schema-model bumped from 0.5.1 to 0.6.0

## [0.6.3](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.6.2...renderer-v0.6.3) (2026-10-08)


### Bug Fixes

* **dsl:** never throw, keep round-trips stable and report what the parser drops ([#121](https://github.com/Miragon/wardley-maps-modeler/issues/121)) ([dbf52c2](https://github.com/Miragon/wardley-maps-modeler/commit/dbf52c281eb38a2747032ed175833f1e9a827acb))
* **renderer:** keep connection hit areas behind nodes and on the drawn line ([#127](https://github.com/Miragon/wardley-maps-modeler/issues/127)) ([e849899](https://github.com/Miragon/wardley-maps-modeler/commit/e84989939586e5703372847b200f7e5b4eb43ec6))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.5.2 to 0.5.3

## [0.6.2](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.6.1...renderer-v0.6.2) (2026-09-22)


### Bug Fixes

* **deps:** declare consumer-shared runtime libs as ranged peer dependencies ([#113](https://github.com/Miragon/wardley-maps-modeler/issues/113)) ([322523c](https://github.com/Miragon/wardley-maps-modeler/commit/322523ccf57cd3e8f4d4d235ee216400f3379ff1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.5.1 to 0.5.2
    * @miragon/wardley-schema-model bumped from 0.5.0 to 0.5.1

## [0.6.1](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.6.0...renderer-v0.6.1) (2026-08-06)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.5.0 to 0.5.1

## [0.6.0](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.5.0...renderer-v0.6.0) (2026-08-06)


### ⚠ BREAKING CHANGES

* drop embedded-image feature; add app tests, guardrails, per-module releases ([#90](https://github.com/Miragon/wardley-maps-modeler/issues/90))

### Code Refactoring

* drop embedded-image feature; add app tests, guardrails, per-module releases ([#90](https://github.com/Miragon/wardley-maps-modeler/issues/90)) ([e1229a3](https://github.com/Miragon/wardley-maps-modeler/commit/e1229a3bdaba6f735d01dc2e6776f3f74b1b2c79))
