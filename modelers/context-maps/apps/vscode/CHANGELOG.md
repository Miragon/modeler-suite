# Changelog

## [0.10.0](https://github.com/Miragon/modeler-suite/compare/context-maps-vscode-v0.9.1...context-maps-vscode-v0.10.0) (2026-10-28)


### Features

* add New … from Example to the New File menu of every extension ([#196](https://github.com/Miragon/modeler-suite/issues/196)) ([e1d5541](https://github.com/Miragon/modeler-suite/commit/e1d55415fbab56ce8e669406efab7a6ef677563d))


### Bug Fixes

* **context-maps:** replace the map chunk of a .cm.png instead of adding a second one ([#192](https://github.com/Miragon/modeler-suite/issues/192)) ([efca56c](https://github.com/Miragon/modeler-suite/commit/efca56cdd2f3076e773beef3ce337f1175de68b1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-cml bumped from 0.1.6 to 0.1.7
    * @miragon/context-maps-renderer bumped from 0.6.1 to 0.7.0
    * @miragon/context-maps-schema-model bumped from 0.4.1 to 0.5.0

## [0.9.1](https://github.com/Miragon/modeler-suite/compare/context-maps-vscode-v0.9.0...context-maps-vscode-v0.9.1) (2026-10-25)


### Bug Fixes

* **context-maps:** draw the canvas in the design guide's tokens, with a Lucide team glyph ([#142](https://github.com/Miragon/modeler-suite/issues/142)) ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **context-maps:** keep the description prompt under the palette ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **context-maps:** no em dashes in tooltips, validation messages, the sample title and the walkthrough ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **context-maps:** ship the licence of the Material star and hand with the extension and the web app ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))
* **context-maps:** write a context's name black or white, whichever reads better on its fill ([3ed7813](https://github.com/Miragon/modeler-suite/commit/3ed781315b92d44cd6385fa16d50beede2e30515))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-cml bumped from 0.1.5 to 0.1.6
    * @miragon/context-maps-renderer bumped from 0.6.0 to 0.6.1
    * @miragon/context-maps-schema-model bumped from 0.4.0 to 0.4.1
    * @miragon/modeler-shell bumped from 0.5.0 to 0.6.0

## [0.9.0](https://github.com/Miragon/context-maps-modeler/compare/vscode-v0.8.1...vscode-v0.9.0) (2026-10-23)


### Features

* **renderer:** start the legend card closed on every canvas size ([#95](https://github.com/Miragon/context-maps-modeler/issues/95)) ([52b1ce3](https://github.com/Miragon/context-maps-modeler/commit/52b1ce3fb2f51ff97e819fbb3b15352a70b1e809))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-renderer bumped from 0.5.0 to 0.6.0

## [0.8.1](https://github.com/Miragon/context-maps-modeler/compare/vscode-v0.8.0...vscode-v0.8.1) (2026-10-23)


### Bug Fixes

* **deps:** adopt modeler-shell 0.4.1, whose VS Code driver retries a missed theme switch ([#93](https://github.com/Miragon/context-maps-modeler/issues/93)) ([e4a20cb](https://github.com/Miragon/context-maps-modeler/commit/e4a20cb6d44bd9fcb4bfc3754570b8bc093aadea))

## [0.8.0](https://github.com/Miragon/context-maps-modeler/compare/vscode-v0.7.2...vscode-v0.8.0) (2026-10-23)


### Features

* **renderer:** report the content bounds a host fits to (contract 1.3); apps adopt modeler-shell 0.4.0 ([#91](https://github.com/Miragon/context-maps-modeler/issues/91)) ([f515215](https://github.com/Miragon/context-maps-modeler/commit/f515215618f7544e6945d72ca1e43f9795b799f1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-renderer bumped from 0.4.1 to 0.5.0

## [0.7.2](https://github.com/Miragon/context-maps-modeler/compare/vscode-v0.7.1...vscode-v0.7.2) (2026-10-22)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-renderer bumped from 0.4.0 to 0.4.1

## [0.7.1](https://github.com/Miragon/context-maps-modeler/compare/vscode-v0.7.0...vscode-v0.7.1) (2026-10-21)


### Bug Fixes

* **vscode:** bundle jsonc-parser's ESM build so the extension activates again ([#73](https://github.com/Miragon/context-maps-modeler/issues/73)) ([55d8dad](https://github.com/Miragon/context-maps-modeler/commit/55d8dad0ab584eb1aadb41507c8e764ce3830d9f))

## [0.7.0](https://github.com/Miragon/context-maps-modeler/compare/vscode-v0.6.0...vscode-v0.7.0) (2026-10-21)


### Features

* implement contract 1.2 of @miragon/modeler-api with modeler-shell 0.2.2 and refuse ids the canvas cannot draw ([#70](https://github.com/Miragon/context-maps-modeler/issues/70)) ([8136ccb](https://github.com/Miragon/context-maps-modeler/commit/8136ccbe280e3068c4074ad4fb0ab65fc7aca701))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-cml bumped from 0.1.4 to 0.1.5
    * @miragon/context-maps-renderer bumped from 0.3.0 to 0.4.0
    * @miragon/context-maps-schema-model bumped from 0.3.0 to 0.4.0

## [0.6.0](https://github.com/Miragon/context-maps-modeler/compare/vscode-v0.5.0...vscode-v0.6.0) (2026-10-19)


### Features

* run Context Maps on @miragon/modeler-api and @miragon/modeler-shell in VS Code and the web app ([#64](https://github.com/Miragon/context-maps-modeler/issues/64)) ([be9a0e3](https://github.com/Miragon/context-maps-modeler/commit/be9a0e3616600712fa68aebefaaf6695df2159b3))


### Bug Fixes

* **vscode:** keep the webview chrome light in dark VS Code themes ([#61](https://github.com/Miragon/context-maps-modeler/issues/61)) ([63dd5f1](https://github.com/Miragon/context-maps-modeler/commit/63dd5f16ec536ca6d201b72cb3aa990d056b13b6))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-cml bumped from 0.1.3 to 0.1.4
    * @miragon/context-maps-renderer bumped from 0.2.1 to 0.3.0
    * @miragon/context-maps-schema-model bumped from 0.2.1 to 0.3.0

## [0.5.0](https://github.com/Miragon/context-maps-modeler/compare/vscode-v0.4.0...vscode-v0.5.0) (2026-10-10)


### Features

* **vscode:** file icon for *.cm.json ([#57](https://github.com/Miragon/context-maps-modeler/issues/57)) ([e6c9f58](https://github.com/Miragon/context-maps-modeler/commit/e6c9f58bab9c6f53ac651ab0315a199c1ae9f83c))
* **vscode:** one language with JSON highlighting for *.cm and *.cm.json ([#59](https://github.com/Miragon/context-maps-modeler/issues/59)) ([dd50bdc](https://github.com/Miragon/context-maps-modeler/commit/dd50bdc8e37f8be8c187868ac94c744a6f09ff3d))

## [0.4.0](https://github.com/Miragon/context-maps-modeler/compare/vscode-v0.3.1...vscode-v0.4.0) (2026-10-08)


### Features

* use the Miragon modeler icon for app, favicon and file icons ([#55](https://github.com/Miragon/context-maps-modeler/issues/55)) ([3e4bb14](https://github.com/Miragon/context-maps-modeler/commit/3e4bb1443ce9ccfc12a139746ca8e80b368fefa5))

## [0.3.1](https://github.com/Miragon/context-maps-modeler/compare/vscode-v0.3.0...vscode-v0.3.1) (2026-09-22)


### Bug Fixes

* **deps:** align shared runtime deps with peerDependencies convention ([#49](https://github.com/Miragon/context-maps-modeler/issues/49)) ([b3aba28](https://github.com/Miragon/context-maps-modeler/commit/b3aba28a72d37992645cd85d5b7fd67f63f78a4f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-cml bumped from 0.1.2 to 0.1.3
    * @miragon/context-maps-renderer bumped from 0.2.0 to 0.2.1
    * @miragon/context-maps-schema-model bumped from 0.2.0 to 0.2.1

## [0.3.0](https://github.com/Miragon/context-maps-modeler/compare/vscode-v0.2.0...vscode-v0.3.0) (2026-09-02)


### Features

* **renderer:** ship context pad, notation legend and palette tools ([#41](https://github.com/Miragon/context-maps-modeler/issues/41)) ([cdcd1d6](https://github.com/Miragon/context-maps-modeler/commit/cdcd1d650df73db106fedb5e072d526ca511f17a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-cml bumped from 0.1.1 to 0.1.2
    * @miragon/context-maps-renderer bumped from 0.1.0 to 0.2.0
    * @miragon/context-maps-schema-model bumped from 0.1.0 to 0.2.0

## [0.2.0](https://github.com/Miragon/context-maps-modeler/compare/vscode-v0.1.0...vscode-v0.2.0) (2026-08-12)


### Features

* add vs-code plugin panel and legend ([#34](https://github.com/Miragon/context-maps-modeler/issues/34)) ([acadb76](https://github.com/Miragon/context-maps-modeler/commit/acadb7678a5ba9d2c50ecee5fd4b6899e93ceb24))

## [0.1.0](https://github.com/Miragon/context-maps-modeler/compare/vscode-v0.0.1...vscode-v0.1.0) (2026-08-10)


### Features

* adopt Miragon corporate identity ([#23](https://github.com/Miragon/context-maps-modeler/issues/23)) ([2f22053](https://github.com/Miragon/context-maps-modeler/commit/2f220530f37e79e81a729f8956d9fa72a9d91e69))
* model pretty context maps ([c4ba93e](https://github.com/Miragon/context-maps-modeler/commit/c4ba93e2e4a411917aec491644314a9f7455231a))
* show a starting page when no diagram is present ([#24](https://github.com/Miragon/context-maps-modeler/issues/24)) ([d69e677](https://github.com/Miragon/context-maps-modeler/commit/d69e677992e29322273fe18f83e31f1a2ed7d5c2))


### Bug Fixes

* modelling issues ([#4](https://github.com/Miragon/context-maps-modeler/issues/4)) ([af2c585](https://github.com/Miragon/context-maps-modeler/commit/af2c585633264418ba4463302fd5e8dd18c41904))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/context-maps-renderer bumped from 0.0.1 to 0.1.0
    * @miragon/context-maps-schema-model bumped from 0.0.1 to 0.1.0

## Changelog
