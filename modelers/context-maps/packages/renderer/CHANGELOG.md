# Changelog

## [0.9.1](https://github.com/Miragon/modeler-suite/compare/context-maps-renderer-v0.9.0...context-maps-renderer-v0.9.1) (2026-10-31)


### Bug Fixes

* **context-maps:** keep every tool inside the palette on a short canvas ([#512](https://github.com/Miragon/modeler-suite/issues/512)) ([8406332](https://github.com/Miragon/modeler-suite/commit/840633224750b9cd216ce30a50f5e8e20cb0026b))

## [0.9.0](https://github.com/Miragon/modeler-suite/compare/context-maps-renderer-v0.8.0...context-maps-renderer-v0.9.0) (2026-10-30)


### ⚠ BREAKING CHANGES

* **context-maps:** @miragon/context-maps-renderer no longer exports createShortcutsDialog, ShortcutsDialog or ShortcutsDialogChrome, and its stylesheet has no .cm-shortcuts rules. A host shows the groups of contextMapShortcuts(chrome, options) with shell.showShortcutsDialog(groups) of @miragon/modeler-shell, or with its standalone showShortcutsDialog(groups, { container }) when it has no mounted shell.

### Features

* **context-maps:** remove the deprecated keyboard shortcuts dialog of the renderer ([#466](https://github.com/Miragon/modeler-suite/issues/466)) ([30fcf93](https://github.com/Miragon/modeler-suite/commit/30fcf9370aa4ba52a906657a551be40b5c27917d))


### Bug Fixes

* **context-maps:** give the palette without the shell a keyboard path and glass, and close the description editor without a commit when the modeler is destroyed ([#452](https://github.com/Miragon/modeler-suite/issues/452)) ([4f26ecb](https://github.com/Miragon/modeler-suite/commit/4f26ecbc20cf102f1d87b2f998a3c18662a98724))
* **context-maps:** give the palette without the shell the guide's tooltip, keep its tools' pressed state true, and mark the entries the read-only lock disables ([#473](https://github.com/Miragon/modeler-suite/issues/473)) ([8bb6d05](https://github.com/Miragon/modeler-suite/commit/8bb6d056360ac6c606878d54cd5d94eeedac5ff1))
* **context-maps:** let a host without the shell delay the palette's read-only marks ([#488](https://github.com/Miragon/modeler-suite/issues/488)) ([3753485](https://github.com/Miragon/modeler-suite/commit/37534855d3bd620166bfed7d0ecb0f998d645c3c))
* **context-maps:** put the armed lasso down with Enter or Space, and show it as pressed only while it is armed, also in the web app and VS Code ([8bb6d05](https://github.com/Miragon/modeler-suite/commit/8bb6d056360ac6c606878d54cd5d94eeedac5ff1))

## [0.8.0](https://github.com/Miragon/modeler-suite/compare/context-maps-renderer-v0.7.1...context-maps-renderer-v0.8.0) (2026-10-30)


### Features

* **context-maps:** deprecate createShortcutsDialog of context-maps-renderer, removed in context-maps-renderer 0.9.0 ([7237c9d](https://github.com/Miragon/modeler-suite/commit/7237c9d6ba47860ac76c3087c81fb633518b7075))
* **context-maps:** implement the contract's interaction and appearance surfaces ([#277](https://github.com/Miragon/modeler-suite/issues/277)) ([00babd9](https://github.com/Miragon/modeler-suite/commit/00babd98158f6980226b7fb1de84ae30083788dd))
* **context-maps:** use the shell's shortcuts dialog and PNG export ([#268](https://github.com/Miragon/modeler-suite/issues/268)) ([7237c9d](https://github.com/Miragon/modeler-suite/commit/7237c9d6ba47860ac76c3087c81fb633518b7075))


### Bug Fixes

* **context-maps:** draw the canvas overlays and the palette by the guide in high contrast, forced colours and reduced motion, and keep the context pad and popup menu styles to the map ([#432](https://github.com/Miragon/modeler-suite/issues/432)) ([a8a17cf](https://github.com/Miragon/modeler-suite/commit/a8a17cf0e795511c54c9f6f619aeab654c0bc0a4))
* **context-maps:** end a running drag when the canvas is cleared ([00babd9](https://github.com/Miragon/modeler-suite/commit/00babd98158f6980226b7fb1de84ae30083788dd))
* **context-maps:** let an import from a listener wait until the command or drag start that fired it has finished ([#344](https://github.com/Miragon/modeler-suite/issues/344)) ([970a85c](https://github.com/Miragon/modeler-suite/commit/970a85cd3b8a5b873810bf5972571d2757d08e21))
* **context-maps:** let an import from the change listener of a drop wait until the drop has ended ([00babd9](https://github.com/Miragon/modeler-suite/commit/00babd98158f6980226b7fb1de84ae30083788dd))
* **context-maps:** show the name editor's focus ring and keep the description editor open while an input method composes ([#386](https://github.com/Miragon/modeler-suite/issues/386)) ([ad8947b](https://github.com/Miragon/modeler-suite/commit/ad8947b0e4ebb29f8b6fddb198b316062b0864f5))
* finish an import and keep the imported document when a host destroys the modeler from a listener the import triggers ([d962f54](https://github.com/Miragon/modeler-suite/commit/d962f54216c01f28639ec3253f3d7c580e22f728))
* keep the palette's focus ring whole, and keep each modeler's palette styles to its own canvas ([#392](https://github.com/Miragon/modeler-suite/issues/392)) ([c620895](https://github.com/Miragon/modeler-suite/commit/c620895610885730b7650480ac1b5bd94f0bb8d8))
* leave a key to the page when the host hid the canvas, also before the browser moves the focus away ([#424](https://github.com/Miragon/modeler-suite/issues/424)) ([aa03583](https://github.com/Miragon/modeler-suite/commit/aa035831d1a388df4305c54aafc33b7f1641360e))
* leave a key to the page when the host hid the modeler, also in its context pads, editors and popovers ([#446](https://github.com/Miragon/modeler-suite/issues/446)) ([0c596f3](https://github.com/Miragon/modeler-suite/commit/0c596f3cd900af2cc3c07da7586e765e878235e0))
* leave a key to the page when the host made the canvas inert, also before the browser moves the focus away ([#390](https://github.com/Miragon/modeler-suite/issues/390)) ([694e9fd](https://github.com/Miragon/modeler-suite/commit/694e9fd8aff1eb562300343e4acf147f5a183340))
* let a host destroy the modeler from a listener that an import calls ([#443](https://github.com/Miragon/modeler-suite/issues/443)) ([ec807d3](https://github.com/Miragon/modeler-suite/commit/ec807d303d907c73fed9d50044be85719d7469d0))
* let a host destroy the modeler from any listener when the user drops, presses Escape or creates an element ([#396](https://github.com/Miragon/modeler-suite/issues/396)) ([572a753](https://github.com/Miragon/modeler-suite/commit/572a7537504999fee59a29f3251cc7f4d4a6f85e))
* let a host destroy the modeler from the selection listener that reveal() triggers ([#426](https://github.com/Miragon/modeler-suite/issues/426)) ([d962f54](https://github.com/Miragon/modeler-suite/commit/d962f54216c01f28639ec3253f3d7c580e22f728))
* let a host destroy the modeler from the selection listener when the user starts a drag ([#370](https://github.com/Miragon/modeler-suite/issues/370)) ([b2f03e7](https://github.com/Miragon/modeler-suite/commit/b2f03e7faeb01377cb246553c97067eeaaad49a9))
* let a host destroy the modeler while the pointer rests on a palette entry ([#414](https://github.com/Miragon/modeler-suite/issues/414)) ([94b9c89](https://github.com/Miragon/modeler-suite/commit/94b9c895d12fea430d96a89c7f7472f36df1812b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-schema-model bumped from 0.5.0 to 0.5.1
    * @miragon/modeler-api bumped from 1.5.0 to 1.6.0

## [0.7.1](https://github.com/Miragon/modeler-suite/compare/context-maps-renderer-v0.7.0...context-maps-renderer-v0.7.1) (2026-10-28)


### Bug Fixes

* **context-maps:** cancel a running drag or palette create when a text is imported ([#206](https://github.com/Miragon/modeler-suite/issues/206)) ([5fb36bb](https://github.com/Miragon/modeler-suite/commit/5fb36bb38d4dd49d2c6cb0250ede66dedeebf070))
* re-vendor cd-canvas.css of design guide 1.27.0 in the five renderers ([#255](https://github.com/Miragon/modeler-suite/issues/255)) ([9f412c0](https://github.com/Miragon/modeler-suite/commit/9f412c0018ba8ecc82838e4dac71bf09e2a20795))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/modeler-api bumped from 1.4.0 to 1.5.0

## [0.7.0](https://github.com/Miragon/modeler-suite/compare/context-maps-renderer-v0.6.1...context-maps-renderer-v0.7.0) (2026-10-28)


### ⚠ BREAKING CHANGES

* **context-maps:** CmPaletteConfig, the diagram config cmPalette, has freeArea (the host's FreeArea of @miragon/modeler-api, as given) instead of freeRectInsets and freeRectCenter; read config.cmPalette.freeArea.insets() or config.cmPalette.freeArea.center() instead. Without insets, keyboard creation keeps the room of the renderer's own palette, also in a diagram composed from cmPaletteModule without a cmPalette config.
* **context-maps:** Modeler, Viewer, NavigatedViewer, createCollaborativeModeler and createCollaborativeViewer no longer take freeRectInsets; pass freeArea: { insets } instead.

### Features

* **context-maps:** remove the deprecated freeRectInsets option ([dab5b03](https://github.com/Miragon/modeler-suite/commit/dab5b03ac2571baa9d0fcaa4cc85f30d8c033cb3))
* **context-maps:** rename the palette config's freeRectInsets and freeRectCenter to freeArea ([#185](https://github.com/Miragon/modeler-suite/issues/185)) ([dab5b03](https://github.com/Miragon/modeler-suite/commit/dab5b03ac2571baa9d0fcaa4cc85f30d8c033cb3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-schema-model bumped from 0.4.1 to 0.5.0

## [0.6.1](https://github.com/Miragon/modeler-suite/compare/context-maps-renderer-v0.6.0...context-maps-renderer-v0.6.1) (2026-10-25)


### Bug Fixes

* **context-maps:** build the palette glyphs from escaped values only ([#166](https://github.com/Miragon/modeler-suite/issues/166)) ([9362103](https://github.com/Miragon/modeler-suite/commit/93621034df4c1f81ee6b1bcf6df5bd68f1b43bcb))
* **context-maps:** draw the canvas in the design guide's tokens, with a Lucide team glyph ([#142](https://github.com/Miragon/modeler-suite/issues/142)) ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **context-maps:** give every notation text 4.5:1 and every notation line 3:1 contrast ([#155](https://github.com/Miragon/modeler-suite/issues/155)) ([6b83c8c](https://github.com/Miragon/modeler-suite/commit/6b83c8cc2245a7ca956f295efed07653e93946bc))
* **context-maps:** keep the description prompt under the palette ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **context-maps:** no em dashes in tooltips, validation messages, the sample title and the walkthrough ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **context-maps:** ship the licence of the Material star and hand with the extension and the web app ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **context-maps:** take canvas keys only from the focused canvas ([#133](https://github.com/Miragon/modeler-suite/issues/133)) ([f045f5a](https://github.com/Miragon/modeler-suite/commit/f045f5a6a38ec0659ee730059894e3059cb38c6f))
* **context-maps:** write a context's name black or white, whichever reads better on its fill ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-schema-model bumped from 0.4.0 to 0.4.1
    * @miragon/modeler-api bumped from 1.3.0 to 1.4.0

## [0.6.0](https://github.com/Miragon/context-maps-modeler/compare/renderer-v0.5.0...renderer-v0.6.0) (2026-10-23)


### Features

* **renderer:** start the legend card closed on every canvas size ([#95](https://github.com/Miragon/context-maps-modeler/issues/95)) ([52b1ce3](https://github.com/Miragon/context-maps-modeler/commit/52b1ce3fb2f51ff97e819fbb3b15352a70b1e809))

## [0.5.0](https://github.com/Miragon/context-maps-modeler/compare/renderer-v0.4.1...renderer-v0.5.0) (2026-10-23)


### Features

* **renderer:** report the content bounds a host fits to (contract 1.3); apps adopt modeler-shell 0.4.0 ([#91](https://github.com/Miragon/context-maps-modeler/issues/91)) ([f515215](https://github.com/Miragon/context-maps-modeler/commit/f515215618f7544e6945d72ca1e43f9795b799f1))

## [0.4.1](https://github.com/Miragon/context-maps-modeler/compare/renderer-v0.4.0...renderer-v0.4.1) (2026-10-22)


### Bug Fixes

* **renderer:** accept didi 12 in the peer range ([#84](https://github.com/Miragon/context-maps-modeler/issues/84)) ([b1d5ed2](https://github.com/Miragon/context-maps-modeler/commit/b1d5ed2ac6b556625b3d0e4a0f3fedee91dcb7b3))

## [0.4.0](https://github.com/Miragon/context-maps-modeler/compare/renderer-v0.3.0...renderer-v0.4.0) (2026-10-21)


### Features

* implement contract 1.2 of @miragon/modeler-api with modeler-shell 0.2.2 and refuse ids the canvas cannot draw ([#70](https://github.com/Miragon/context-maps-modeler/issues/70)) ([8136ccb](https://github.com/Miragon/context-maps-modeler/commit/8136ccbe280e3068c4074ad4fb0ab65fc7aca701))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-schema-model bumped from 0.3.0 to 0.4.0

## [0.3.0](https://github.com/Miragon/context-maps-modeler/compare/renderer-v0.2.1...renderer-v0.3.0) (2026-10-19)


### Features

* run Context Maps on @miragon/modeler-api and @miragon/modeler-shell in VS Code and the web app ([#64](https://github.com/Miragon/context-maps-modeler/issues/64)) ([be9a0e3](https://github.com/Miragon/context-maps-modeler/commit/be9a0e3616600712fa68aebefaaf6695df2159b3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-schema-model bumped from 0.2.1 to 0.3.0

## [0.2.1](https://github.com/Miragon/context-maps-modeler/compare/renderer-v0.2.0...renderer-v0.2.1) (2026-09-22)


### Bug Fixes

* **deps:** align shared runtime deps with peerDependencies convention ([#49](https://github.com/Miragon/context-maps-modeler/issues/49)) ([b3aba28](https://github.com/Miragon/context-maps-modeler/commit/b3aba28a72d37992645cd85d5b7fd67f63f78a4f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-schema-model bumped from 0.2.0 to 0.2.1

## [0.2.0](https://github.com/Miragon/context-maps-modeler/compare/renderer-v0.1.0...renderer-v0.2.0) (2026-09-02)


### Features

* **renderer:** ship context pad, notation legend and palette tools ([#41](https://github.com/Miragon/context-maps-modeler/issues/41)) ([cdcd1d6](https://github.com/Miragon/context-maps-modeler/commit/cdcd1d650df73db106fedb5e072d526ca511f17a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-schema-model bumped from 0.1.0 to 0.2.0

## [0.1.0](https://github.com/Miragon/context-maps-modeler/compare/renderer-v0.0.1...renderer-v0.1.0) (2026-08-10)


### Features

* adopt Miragon corporate identity ([#23](https://github.com/Miragon/context-maps-modeler/issues/23)) ([2f22053](https://github.com/Miragon/context-maps-modeler/commit/2f220530f37e79e81a729f8956d9fa72a9d91e69))
* model pretty context maps ([c4ba93e](https://github.com/Miragon/context-maps-modeler/commit/c4ba93e2e4a411917aec491644314a9f7455231a))


### Bug Fixes

* draw line between components ([#6](https://github.com/Miragon/context-maps-modeler/issues/6)) ([b11d2b4](https://github.com/Miragon/context-maps-modeler/commit/b11d2b4779df9d73608e85de98bb890408b14313))
* modelling issues ([#4](https://github.com/Miragon/context-maps-modeler/issues/4)) ([af2c585](https://github.com/Miragon/context-maps-modeler/commit/af2c585633264418ba4463302fd5e8dd18c41904))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-schema-model bumped from 0.0.1 to 0.1.0

## Changelog
