# Changelog

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
