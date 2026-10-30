# Changelog

## [0.5.1](https://github.com/Miragon/modeler-suite/compare/context-maps-schema-model-v0.5.0...context-maps-schema-model-v0.5.1) (2026-10-30)


### Bug Fixes

* write a shared value at each of its places in JSON, and stop with an error before its copies exhaust the memory ([#363](https://github.com/Miragon/modeler-suite/issues/363)) ([4c324b9](https://github.com/Miragon/modeler-suite/commit/4c324b96386f9739a8243d45a3a47879a26ad10f))

## [0.5.0](https://github.com/Miragon/modeler-suite/compare/context-maps-schema-model-v0.4.1...context-maps-schema-model-v0.5.0) (2026-10-28)


### ⚠ BREAKING CHANGES

* **context-maps:** MARK_TEXT_COLOR is removed from @miragon/context-maps-schema-model. Write black or white on each role chip instead, whichever has more contrast on its MARK_COLORS fill, as @miragon/context-maps-renderer has done since 0.6.1 (black on PL and CF, white on OHS and ACL).
* **context-maps:** parseDocument and parseDocumentText refuse a document whose objects and arrays nest more than MAX_NESTING_DEPTH (100) levels deep, with an issue at the first level too deep of each branch (the first 100 of them), instead of opening a file the canvas cannot save from about 2,000 levels on. Keep the whole document, the values of foreign keys included, within MAX_NESTING_DEPTH levels, the document counting as the first.

### Features

* **context-maps:** remove MARK_TEXT_COLOR and refuse documents nested more than 100 levels deep ([#191](https://github.com/Miragon/modeler-suite/issues/191)) ([feee62a](https://github.com/Miragon/modeler-suite/commit/feee62ac62bff6a835a53630ddbf978e8cb8c8cf))


### Bug Fixes

* **context-maps:** refuse documents nested more than 100 levels deep ([feee62a](https://github.com/Miragon/modeler-suite/commit/feee62ac62bff6a835a53630ddbf978e8cb8c8cf))

## [0.4.1](https://github.com/Miragon/modeler-suite/compare/context-maps-schema-model-v0.4.0...context-maps-schema-model-v0.4.1) (2026-10-25)


### Bug Fixes

* **context-maps:** draw the canvas in the design guide's tokens, with a Lucide team glyph ([#142](https://github.com/Miragon/modeler-suite/issues/142)) ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **context-maps:** give every notation text 4.5:1 and every notation line 3:1 contrast ([#155](https://github.com/Miragon/modeler-suite/issues/155)) ([6b83c8c](https://github.com/Miragon/modeler-suite/commit/6b83c8cc2245a7ca956f295efed07653e93946bc))
* **context-maps:** keep the description prompt under the palette ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **context-maps:** no em dashes in tooltips, validation messages, the sample title and the walkthrough ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **context-maps:** ship the licence of the Material star and hand with the extension and the web app ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **context-maps:** write a context's name black or white, whichever reads better on its fill ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))

## [0.4.0](https://github.com/Miragon/context-maps-modeler/compare/schema-model-v0.3.0...schema-model-v0.4.0) (2026-10-21)


### Features

* implement contract 1.2 of @miragon/modeler-api with modeler-shell 0.2.2 and refuse ids the canvas cannot draw ([#70](https://github.com/Miragon/context-maps-modeler/issues/70)) ([8136ccb](https://github.com/Miragon/context-maps-modeler/commit/8136ccbe280e3068c4074ad4fb0ab65fc7aca701))

## [0.3.0](https://github.com/Miragon/context-maps-modeler/compare/schema-model-v0.2.1...schema-model-v0.3.0) (2026-10-19)


### Features

* run Context Maps on @miragon/modeler-api and @miragon/modeler-shell in VS Code and the web app ([#64](https://github.com/Miragon/context-maps-modeler/issues/64)) ([be9a0e3](https://github.com/Miragon/context-maps-modeler/commit/be9a0e3616600712fa68aebefaaf6695df2159b3))

## [0.2.1](https://github.com/Miragon/context-maps-modeler/compare/schema-model-v0.2.0...schema-model-v0.2.1) (2026-09-22)


### Bug Fixes

* **deps:** align shared runtime deps with peerDependencies convention ([#49](https://github.com/Miragon/context-maps-modeler/issues/49)) ([b3aba28](https://github.com/Miragon/context-maps-modeler/commit/b3aba28a72d37992645cd85d5b7fd67f63f78a4f))

## [0.2.0](https://github.com/Miragon/context-maps-modeler/compare/schema-model-v0.1.0...schema-model-v0.2.0) (2026-09-02)


### Features

* **renderer:** ship context pad, notation legend and palette tools ([#41](https://github.com/Miragon/context-maps-modeler/issues/41)) ([cdcd1d6](https://github.com/Miragon/context-maps-modeler/commit/cdcd1d650df73db106fedb5e072d526ca511f17a))

## [0.1.0](https://github.com/Miragon/context-maps-modeler/compare/schema-model-v0.0.1...schema-model-v0.1.0) (2026-08-10)


### Features

* model pretty context maps ([c4ba93e](https://github.com/Miragon/context-maps-modeler/commit/c4ba93e2e4a411917aec491644314a9f7455231a))


### Bug Fixes

* modelling issues ([#4](https://github.com/Miragon/context-maps-modeler/issues/4)) ([af2c585](https://github.com/Miragon/context-maps-modeler/commit/af2c585633264418ba4463302fd5e8dd18c41904))

## Changelog
