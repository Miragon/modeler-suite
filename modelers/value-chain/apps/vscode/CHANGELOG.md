# Changelog

## [0.9.0](https://github.com/Miragon/modeler-suite/compare/value-chain-vscode-v0.8.1...value-chain-vscode-v0.9.0) (2026-10-30)


### Features

* **value-chain:** deprecate createShortcutsDialog and svgToPng of value-chain-renderer, removed in value-chain-renderer 0.10.0 ([f7ee57f](https://github.com/Miragon/modeler-suite/commit/f7ee57f2d6baf027d8a07f4d9b202f611b9abb21))
* **value-chain:** export the PNG on the canvas ground #F9F7F7 instead of white, set its labels in Geist, and warn when Geist couldn't be embedded ([f7ee57f](https://github.com/Miragon/modeler-suite/commit/f7ee57f2d6baf027d8a07f4d9b202f611b9abb21))
* **value-chain:** implement the contract's interaction and appearance surfaces ([#275](https://github.com/Miragon/modeler-suite/issues/275)) ([c9e91eb](https://github.com/Miragon/modeler-suite/commit/c9e91ebefc50e360cf09b0d7711327c434b6d8c4))
* **value-chain:** sync the diagram with its file through the modeler shell and take back an edit VS Code refuses ([#329](https://github.com/Miragon/modeler-suite/issues/329)) ([3d93f42](https://github.com/Miragon/modeler-suite/commit/3d93f42d37b8240b5cc33034be15f28317346324))
* **value-chain:** use the shell's shortcuts dialog and PNG export ([#265](https://github.com/Miragon/modeler-suite/issues/265)) ([f7ee57f](https://github.com/Miragon/modeler-suite/commit/f7ee57f2d6baf027d8a07f4d9b202f611b9abb21))


### Bug Fixes

* open the source beside the diagram from the walkthrough, also after a reload ([#308](https://github.com/Miragon/modeler-suite/issues/308)) ([cc4db96](https://github.com/Miragon/modeler-suite/commit/cc4db96f54b2cd4df93e56fa6b28233cd8940d25))
* say what to do when an exported file can't be written, in every extension ([#295](https://github.com/Miragon/modeler-suite/issues/295)) ([a76a4fd](https://github.com/Miragon/modeler-suite/commit/a76a4fd536b8294ff238850da57f14113cceaa9f))
* **value-chain:** let an import from the change listener of a drop wait until the drop has ended ([c9e91eb](https://github.com/Miragon/modeler-suite/commit/c9e91ebefc50e360cf09b0d7711327c434b6d8c4))
* **value-chain:** let clear() from the change listener of a drop wait until the drop has ended ([c9e91eb](https://github.com/Miragon/modeler-suite/commit/c9e91ebefc50e360cf09b0d7711327c434b6d8c4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/modeler-shell bumped from 0.7.0 to 0.8.0
    * @miragon/value-chain-renderer bumped from 0.8.1 to 0.9.0
    * @miragon/value-chain-schema-model bumped from 0.7.2 to 0.7.3

## [0.8.1](https://github.com/Miragon/modeler-suite/compare/value-chain-vscode-v0.8.0...value-chain-vscode-v0.8.1) (2026-10-28)


### Bug Fixes

* open the source to the side from the walkthrough in every extension ([#244](https://github.com/Miragon/modeler-suite/issues/244)) ([6325498](https://github.com/Miragon/modeler-suite/commit/632549862937500d1a73075711430959c09b5e39))
* **value-chain:** guard the Problems view's tree parser against deep text after comments and strings ([#239](https://github.com/Miragon/modeler-suite/issues/239)) ([4bc4de3](https://github.com/Miragon/modeler-suite/commit/4bc4de36ad09587f99ae85e39ae64c94756aa5f9))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/modeler-shell bumped from 0.6.0 to 0.7.0
    * @miragon/value-chain-renderer bumped from 0.8.0 to 0.8.1
    * @miragon/value-chain-schema-model bumped from 0.7.1 to 0.7.2

## [0.8.0](https://github.com/Miragon/modeler-suite/compare/value-chain-vscode-v0.7.2...value-chain-vscode-v0.8.0) (2026-10-28)


### Features

* add New … from Example to the New File menu of every extension ([#196](https://github.com/Miragon/modeler-suite/issues/196)) ([e1d5541](https://github.com/Miragon/modeler-suite/commit/e1d55415fbab56ce8e669406efab7a6ef677563d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-renderer bumped from 0.7.2 to 0.8.0

## [0.7.2](https://github.com/Miragon/modeler-suite/compare/value-chain-vscode-v0.7.1...value-chain-vscode-v0.7.2) (2026-10-25)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/modeler-shell bumped from 0.5.0 to 0.6.0
    * @miragon/value-chain-renderer bumped from 0.7.1 to 0.7.2

## [0.7.1](https://github.com/Miragon/value-chain-modeler/compare/vscode-v0.7.0...vscode-v0.7.1) (2026-10-23)


### Bug Fixes

* **deps:** adopt modeler-shell 0.4.1, whose VS Code driver retries a missed theme switch ([#52](https://github.com/Miragon/value-chain-modeler/issues/52)) ([0bfba64](https://github.com/Miragon/value-chain-modeler/commit/0bfba640b193bea799faf2415d007f02084b9f5c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-renderer bumped from 0.7.0 to 0.7.1
    * @miragon/value-chain-schema-model bumped from 0.7.0 to 0.7.1

## [0.7.0](https://github.com/Miragon/value-chain-modeler/compare/vscode-v0.6.1...vscode-v0.7.0) (2026-10-23)


### Features

* **renderer:** report the content bounds a host fits to (modeler-api 1.3) and adopt modeler-shell 0.4 ([#49](https://github.com/Miragon/value-chain-modeler/issues/49)) ([d19cdee](https://github.com/Miragon/value-chain-modeler/commit/d19cdeed3f0efe7d6f459a1c2bd67551e3432d5c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-renderer bumped from 0.6.1 to 0.7.0
    * @miragon/value-chain-schema-model bumped from 0.6.1 to 0.7.0

## [0.6.1](https://github.com/Miragon/value-chain-modeler/compare/vscode-v0.6.0...vscode-v0.6.1) (2026-10-21)


### Bug Fixes

* **vscode:** bundle jsonc-parser's ESM build so the extension activates again ([#33](https://github.com/Miragon/value-chain-modeler/issues/33)) ([d416882](https://github.com/Miragon/value-chain-modeler/commit/d416882d441862f342764d3d54adf93241f53559))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-renderer bumped from 0.6.0 to 0.6.1
    * @miragon/value-chain-schema-model bumped from 0.6.0 to 0.6.1

## [0.6.0](https://github.com/Miragon/value-chain-modeler/compare/vscode-v0.5.0...vscode-v0.6.0) (2026-10-21)


### Features

* share the runtime libs as peer dependencies, bound nesting depth, implement modeler-api 1.2 ([#31](https://github.com/Miragon/value-chain-modeler/issues/31)) ([7492c36](https://github.com/Miragon/value-chain-modeler/commit/7492c36e939a952173628d0fe8bf150db328a4fd))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-renderer bumped from 0.5.0 to 0.6.0
    * @miragon/value-chain-schema-model bumped from 0.5.0 to 0.6.0

## [0.5.0](https://github.com/Miragon/value-chain-modeler/compare/vscode-v0.4.0...vscode-v0.5.0) (2026-10-19)


### Features

* adopt @miragon/modeler-api and @miragon/modeler-shell in VS Code and the web app ([#28](https://github.com/Miragon/value-chain-modeler/issues/28)) ([a8eda83](https://github.com/Miragon/value-chain-modeler/commit/a8eda83e8a216a184c9f02f4f8d25d22292ed1a8))


### Bug Fixes

* **vscode:** keep the webview chrome light in dark VS Code themes ([#26](https://github.com/Miragon/value-chain-modeler/issues/26)) ([59bb0ae](https://github.com/Miragon/value-chain-modeler/commit/59bb0ae5d95d23b780e63c298c760a95b3d2962b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-renderer bumped from 0.4.0 to 0.5.0
    * @miragon/value-chain-schema-model bumped from 0.4.0 to 0.5.0

## [0.4.0](https://github.com/Miragon/value-chain-modeler/compare/vscode-v0.3.0...vscode-v0.4.0) (2026-10-10)


### Features

* **vscode:** file icon for *.vc and *.vc.json ([#23](https://github.com/Miragon/value-chain-modeler/issues/23)) ([18dfc6e](https://github.com/Miragon/value-chain-modeler/commit/18dfc6e0f4589735b2dcd42d10438c46e2aca9cb))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-renderer bumped from 0.3.0 to 0.4.0
    * @miragon/value-chain-schema-model bumped from 0.3.0 to 0.4.0

## [0.3.0](https://github.com/Miragon/value-chain-modeler/compare/vscode-v0.2.0...vscode-v0.3.0) (2026-10-08)


### Features

* Miragon modeler icon for the value chain modeler ([#20](https://github.com/Miragon/value-chain-modeler/issues/20)) ([f6d1a88](https://github.com/Miragon/value-chain-modeler/commit/f6d1a88a03ca36970d6753f73722fa5ab8bdc215))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-renderer bumped from 0.2.0 to 0.3.0
    * @miragon/value-chain-schema-model bumped from 0.2.0 to 0.3.0

## [0.2.0](https://github.com/Miragon/value-chain-modeler/compare/vscode-v0.1.0...vscode-v0.2.0) (2026-10-08)


### Features

* Miragon green front arrow in the logo ([d1f7d0c](https://github.com/Miragon/value-chain-modeler/commit/d1f7d0c57c18f32613834424c82837ccab4def4d))
* support *.vc files alongside *.vc.json ([4e97d1e](https://github.com/Miragon/value-chain-modeler/commit/4e97d1ef2e325811bfe4173884d775a85daa0a0e))


### Bug Fixes

* open blank documents as an empty diagram ([3e7d871](https://github.com/Miragon/value-chain-modeler/commit/3e7d87182d4ecc2c9eb59eb2abad6a9a9500cea5))
* open blank documents as an empty diagram; support *.vc; green logo arrow ([2c5679d](https://github.com/Miragon/value-chain-modeler/commit/2c5679d937e9100735b8dcd829e4d0397e88e215))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-renderer bumped from 0.1.0 to 0.2.0
    * @miragon/value-chain-schema-model bumped from 0.1.0 to 0.2.0

## [0.1.0](https://github.com/Miragon/value-chain-modeler/compare/vscode-v0.0.1...vscode-v0.1.0) (2026-10-08)


### Features

* value chain modeler — monorepo with renderer, webapp, VS Code extension, e2e and CI ([9983f71](https://github.com/Miragon/value-chain-modeler/commit/9983f710d333b5d8849f0ddc1066428b09311838))
* **vscode:** VS Code custom editor for *.vc.json ([4e12cd0](https://github.com/Miragon/value-chain-modeler/commit/4e12cd03a01094ac1067ba83c99d6aa8457e0ebd))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/value-chain-renderer bumped from 0.0.1 to 0.1.0
    * @miragon/value-chain-schema-model bumped from 0.0.1 to 0.1.0

## Changelog
