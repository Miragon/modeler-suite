# Changelog

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
