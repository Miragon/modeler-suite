# Changelog

## [0.8.1](https://github.com/Miragon/modeler-suite/compare/value-chain-renderer-v0.8.0...value-chain-renderer-v0.8.1) (2026-10-28)


### Bug Fixes

* re-vendor cd-canvas.css of design guide 1.27.0 in the five renderers ([#255](https://github.com/Miragon/modeler-suite/issues/255)) ([9f412c0](https://github.com/Miragon/modeler-suite/commit/9f412c0018ba8ecc82838e4dac71bf09e2a20795))
* **value-chain:** cancel a running drag or palette create when a text is imported ([#204](https://github.com/Miragon/modeler-suite/issues/204)) ([691e164](https://github.com/Miragon/modeler-suite/commit/691e164057934ee633b9222f139effa0bf19591c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/modeler-api bumped from 1.4.0 to 1.5.0
    * @miragon/value-chain-schema-model bumped from 0.7.1 to 0.7.2

## [0.8.0](https://github.com/Miragon/modeler-suite/compare/value-chain-renderer-v0.7.2...value-chain-renderer-v0.8.0) (2026-10-28)


### ⚠ BREAKING CHANGES

* **value-chain:** Modeler, Viewer, NavigatedViewer, createCollaborativeModeler and createCollaborativeViewer no longer accept freeRectCenter (VcViewerOptions and CollaborativeValueChainOptions no longer declare it), and VcPaletteConfig no longer has it. Pass freeArea: { center } instead, for example freeArea: { center: () => viewport.freeRectCenter() }.

### Features

* **value-chain:** remove the deprecated freeRectCenter palette option ([#182](https://github.com/Miragon/modeler-suite/issues/182)) ([c41e5b6](https://github.com/Miragon/modeler-suite/commit/c41e5b65466a1e1db1dab0ceaca1e296d63772e6))

## [0.7.2](https://github.com/Miragon/modeler-suite/compare/value-chain-renderer-v0.7.1...value-chain-renderer-v0.7.2) (2026-10-25)


### Bug Fixes

* **value-chain:** fill shapes with palette and status colours, labels in black or white ([#134](https://github.com/Miragon/modeler-suite/issues/134)) ([8b521de](https://github.com/Miragon/modeler-suite/commit/8b521dea195d0e81a97ec4619329803cf76c9b89))
* **value-chain:** include overflowing label text in contentBounds() and the SVG export ([#124](https://github.com/Miragon/modeler-suite/issues/124)) ([05fa444](https://github.com/Miragon/modeler-suite/commit/05fa444d5736d7466eebc5ae872760b5e70e8d72))
* **value-chain:** leave handled keys alone and refocus the canvas after a palette or pad click ([#140](https://github.com/Miragon/modeler-suite/issues/140)) ([cdec359](https://github.com/Miragon/modeler-suite/commit/cdec359a21c867e7131a07957d164a2a783a756d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/modeler-api bumped from 1.3.0 to 1.4.0

## [0.7.1](https://github.com/Miragon/value-chain-modeler/compare/renderer-v0.7.0...renderer-v0.7.1) (2026-10-23)


### Miscellaneous Chores

* **renderer:** Synchronize value-chain versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-schema-model bumped from 0.7.0 to 0.7.1

## [0.7.0](https://github.com/Miragon/value-chain-modeler/compare/renderer-v0.6.1...renderer-v0.7.0) (2026-10-23)


### Features

* **renderer:** report the content bounds a host fits to (modeler-api 1.3) and adopt modeler-shell 0.4 ([#49](https://github.com/Miragon/value-chain-modeler/issues/49)) ([d19cdee](https://github.com/Miragon/value-chain-modeler/commit/d19cdeed3f0efe7d6f459a1c2bd67551e3432d5c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-schema-model bumped from 0.6.1 to 0.7.0

## [0.6.1](https://github.com/Miragon/value-chain-modeler/compare/renderer-v0.6.0...renderer-v0.6.1) (2026-10-21)


### Miscellaneous Chores

* **renderer:** Synchronize value-chain versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-schema-model bumped from 0.6.0 to 0.6.1

## [0.6.0](https://github.com/Miragon/value-chain-modeler/compare/renderer-v0.5.0...renderer-v0.6.0) (2026-10-21)


### Features

* share the runtime libs as peer dependencies, bound nesting depth, implement modeler-api 1.2 ([#31](https://github.com/Miragon/value-chain-modeler/issues/31)) ([7492c36](https://github.com/Miragon/value-chain-modeler/commit/7492c36e939a952173628d0fe8bf150db328a4fd))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-schema-model bumped from 0.5.0 to 0.6.0

## [0.5.0](https://github.com/Miragon/value-chain-modeler/compare/renderer-v0.4.0...renderer-v0.5.0) (2026-10-19)


### Features

* adopt @miragon/modeler-api and @miragon/modeler-shell in VS Code and the web app ([#28](https://github.com/Miragon/value-chain-modeler/issues/28)) ([a8eda83](https://github.com/Miragon/value-chain-modeler/commit/a8eda83e8a216a184c9f02f4f8d25d22292ed1a8))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-schema-model bumped from 0.4.0 to 0.5.0

## [0.4.0](https://github.com/Miragon/value-chain-modeler/compare/renderer-v0.3.0...renderer-v0.4.0) (2026-10-10)


### Miscellaneous Chores

* **renderer:** Synchronize value-chain versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-schema-model bumped from 0.3.0 to 0.4.0

## [0.3.0](https://github.com/Miragon/value-chain-modeler/compare/renderer-v0.2.0...renderer-v0.3.0) (2026-10-08)


### Miscellaneous Chores

* **renderer:** Synchronize value-chain versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-schema-model bumped from 0.2.0 to 0.3.0

## [0.2.0](https://github.com/Miragon/value-chain-modeler/compare/renderer-v0.1.0...renderer-v0.2.0) (2026-10-08)


### Miscellaneous Chores

* **renderer:** Synchronize value-chain versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-schema-model bumped from 0.1.0 to 0.2.0

## [0.1.0](https://github.com/Miragon/value-chain-modeler/compare/renderer-v0.0.1...renderer-v0.1.0) (2026-10-08)


### Features

* **renderer:** diagram-js based value chain modeler ([46352d0](https://github.com/Miragon/value-chain-modeler/commit/46352d0202dca421fcd2d06ec5b19b4003bd7217))
* value chain modeler — monorepo with renderer, webapp, VS Code extension, e2e and CI ([9983f71](https://github.com/Miragon/value-chain-modeler/commit/9983f710d333b5d8849f0ddc1066428b09311838))


### Bug Fixes

* **renderer:** kink-free column trunk and regenerated example routes ([04ddb1d](https://github.com/Miragon/value-chain-modeler/commit/04ddb1d627c0164c1a68ca49a52b5117542ed93e))
* **renderer:** larger context pad icons in a three-column grid ([320188e](https://github.com/Miragon/value-chain-modeler/commit/320188e3fe91edcd91bcbee3583047071cab383d))
* **renderer:** larger context pad icons in a three-column grid ([dfc10ec](https://github.com/Miragon/value-chain-modeler/commit/dfc10ec2a00baa92012eadcc894bb6ca0e99c01b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-schema-model bumped from 0.0.1 to 0.1.0
