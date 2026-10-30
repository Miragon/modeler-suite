# Changelog

## [0.14.0](https://github.com/Miragon/modeler-suite/compare/wardley-vscode-v0.13.0...wardley-vscode-v0.14.0) (2026-10-30)


### Features

* **shell:** share the VS Code document plumbing, starting with Wardley Maps ([#282](https://github.com/Miragon/modeler-suite/issues/282)) ([3caa9f3](https://github.com/Miragon/modeler-suite/commit/3caa9f38aab296027722c36f1e27e0602f1f320d))
* **wardley-maps:** deprecate createShortcutsDialog and svgToPng of @miragon/wardley-renderer, removed in wardley-renderer 0.15.0 ([#258](https://github.com/Miragon/modeler-suite/issues/258)) ([596bca5](https://github.com/Miragon/modeler-suite/commit/596bca5364f700e5073bd14610b3ff4ce2d282ec))
* **wardley-maps:** export a PNG on the plot's white with Geist embedded, and warn when its labels fall back to a system font ([596bca5](https://github.com/Miragon/modeler-suite/commit/596bca5364f700e5073bd14610b3ff4ce2d282ec))
* **wardley-maps:** implement the contract's interaction and appearance surfaces ([#276](https://github.com/Miragon/modeler-suite/issues/276)) ([42a5258](https://github.com/Miragon/modeler-suite/commit/42a5258cc70b95d394b8cd8f968b04989e691468))
* **wardley-maps:** use the shell's shortcuts dialog and PNG export ([#271](https://github.com/Miragon/modeler-suite/issues/271)) ([596bca5](https://github.com/Miragon/modeler-suite/commit/596bca5364f700e5073bd14610b3ff4ce2d282ec))


### Bug Fixes

* open the source beside the diagram from the walkthrough, also after a reload ([#308](https://github.com/Miragon/modeler-suite/issues/308)) ([cc4db96](https://github.com/Miragon/modeler-suite/commit/cc4db96f54b2cd4df93e56fa6b28233cd8940d25))
* say what to do when an exported file can't be written, in every extension ([#295](https://github.com/Miragon/modeler-suite/issues/295)) ([a76a4fd](https://github.com/Miragon/modeler-suite/commit/a76a4fd536b8294ff238850da57f14113cceaa9f))
* **wardley-maps:** let an import from the change listener of a drop wait until the drop has ended ([42a5258](https://github.com/Miragon/modeler-suite/commit/42a5258cc70b95d394b8cd8f968b04989e691468))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/modeler-shell bumped from 0.7.0 to 0.8.0
    * @miragon/wardley-dsl bumped from 0.8.0 to 0.8.1
    * @miragon/wardley-renderer bumped from 0.13.0 to 0.14.0
    * @miragon/wardley-schema-model bumped from 0.6.0 to 0.6.1

## [0.13.0](https://github.com/Miragon/modeler-suite/compare/wardley-vscode-v0.12.0...wardley-vscode-v0.13.0) (2026-10-28)


### Features

* **wardley-maps:** break a label's line with Shift+Enter ([#253](https://github.com/Miragon/modeler-suite/issues/253)) ([8314e7c](https://github.com/Miragon/modeler-suite/commit/8314e7ce6283151ead8d697f7c1f0e0b84354339))


### Bug Fixes

* open the source to the side from the walkthrough in every extension ([#244](https://github.com/Miragon/modeler-suite/issues/244)) ([6325498](https://github.com/Miragon/modeler-suite/commit/632549862937500d1a73075711430959c09b5e39))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/modeler-shell bumped from 0.6.0 to 0.7.0
    * @miragon/wardley-dsl bumped from 0.7.1 to 0.8.0
    * @miragon/wardley-renderer bumped from 0.12.0 to 0.13.0

## [0.12.0](https://github.com/Miragon/modeler-suite/compare/wardley-vscode-v0.11.2...wardley-vscode-v0.12.0) (2026-10-28)


### Features

* add New … from Example to the New File menu of every extension ([#196](https://github.com/Miragon/modeler-suite/issues/196)) ([e1d5541](https://github.com/Miragon/modeler-suite/commit/e1d55415fbab56ce8e669406efab7a6ef677563d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-renderer bumped from 0.11.0 to 0.12.0

## [0.11.2](https://github.com/Miragon/modeler-suite/compare/wardley-vscode-v0.11.1...wardley-vscode-v0.11.2) (2026-10-25)


### Bug Fixes

* **wardley-maps:** deprecate MIRAGON.navy ([aa5f58f](https://github.com/Miragon/modeler-suite/commit/aa5f58f78bd4a357ea67a8b717e880630eaabf0c))
* **wardley-maps:** draw the context pad with Lucide icons ([#147](https://github.com/Miragon/modeler-suite/issues/147)) ([aa5f58f](https://github.com/Miragon/modeler-suite/commit/aa5f58f78bd4a357ea67a8b717e880630eaabf0c))
* **wardley-maps:** fill annotation markers with the plot white of every element ([aa5f58f](https://github.com/Miragon/modeler-suite/commit/aa5f58f78bd4a357ea67a8b717e880630eaabf0c))
* **wardley-maps:** write diagnostics, toasts and tooltips without em dashes ([#149](https://github.com/Miragon/modeler-suite/issues/149)) ([9ca9a2c](https://github.com/Miragon/modeler-suite/commit/9ca9a2c9671fa4039e3bae89d7e76289af7b8f17))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/modeler-shell bumped from 0.5.0 to 0.6.0
    * @miragon/wardley-dsl bumped from 0.7.0 to 0.7.1
    * @miragon/wardley-renderer bumped from 0.10.0 to 0.11.0

## [0.11.1](https://github.com/Miragon/wardley-maps-modeler/compare/vscode-v0.11.0...vscode-v0.11.1) (2026-10-23)


### Bug Fixes

* **deps:** adopt modeler-shell 0.4.1 ([#161](https://github.com/Miragon/wardley-maps-modeler/issues/161)) ([e514218](https://github.com/Miragon/wardley-maps-modeler/commit/e514218f7c7a7342d50dccd7ae573ed2d1a12e54))

## [0.11.0](https://github.com/Miragon/wardley-maps-modeler/compare/vscode-v0.10.2...vscode-v0.11.0) (2026-10-23)


### Features

* **renderer:** report content bounds (contract 1.3) and show the "?" chip on Keyboard shortcuts… ([#159](https://github.com/Miragon/wardley-maps-modeler/issues/159)) ([6d633cb](https://github.com/Miragon/wardley-maps-modeler/commit/6d633cb314a24a7911cd1b798f7669334aed4d48))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-renderer bumped from 0.9.1 to 0.10.0

## [0.10.2](https://github.com/Miragon/wardley-maps-modeler/compare/vscode-v0.10.1...vscode-v0.10.2) (2026-10-22)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-renderer bumped from 0.9.0 to 0.9.1

## [0.10.1](https://github.com/Miragon/wardley-maps-modeler/compare/vscode-v0.10.0...vscode-v0.10.1) (2026-10-21)


### Bug Fixes

* leave the pipeline out of the Tea Shop example ([#145](https://github.com/Miragon/wardley-maps-modeler/issues/145)) ([3074c12](https://github.com/Miragon/wardley-maps-modeler/commit/3074c129cdbb3afe9727a08c0545c0d7bf6a939e))

## [0.10.0](https://github.com/Miragon/wardley-maps-modeler/compare/vscode-v0.9.0...vscode-v0.10.0) (2026-10-21)


### Features

* **renderer:** implement modeler-api contract 1.2 and the Design IQ follow-ups ([#142](https://github.com/Miragon/wardley-maps-modeler/issues/142)) ([1839416](https://github.com/Miragon/wardley-maps-modeler/commit/1839416e80fea54098564d3a26d1d05c85a34547))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-renderer bumped from 0.8.0 to 0.9.0

## [0.9.0](https://github.com/Miragon/wardley-maps-modeler/compare/vscode-v0.8.0...vscode-v0.9.0) (2026-10-20)


### Features

* implement the modeler-api contract and mount the modeler shell in VS Code and the web app ([#134](https://github.com/Miragon/wardley-maps-modeler/issues/134)) ([4510c7a](https://github.com/Miragon/wardley-maps-modeler/commit/4510c7a629be826fa27ad563ff49700e4121a1f9))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.6.0 to 0.7.0
    * @miragon/wardley-renderer bumped from 0.7.0 to 0.8.0

## [0.8.0](https://github.com/Miragon/wardley-maps-modeler/compare/vscode-v0.7.0...vscode-v0.8.0) (2026-10-17)


### Features

* UX overhaul of the modeler and undoable, DSL-safe map resizing ([#131](https://github.com/Miragon/wardley-maps-modeler/issues/131)) ([4416f8f](https://github.com/Miragon/wardley-maps-modeler/commit/4416f8f8840b90f1b17ce5692b8496364b4e3dcb))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.5.3 to 0.6.0
    * @miragon/wardley-renderer bumped from 0.6.3 to 0.7.0
    * @miragon/wardley-schema-model bumped from 0.5.1 to 0.6.0

## [0.7.0](https://github.com/Miragon/wardley-maps-modeler/compare/vscode-v0.6.3...vscode-v0.7.0) (2026-10-08)


### Features

* use the Miragon modeler icon for app, favicon and VS Code file icons ([#128](https://github.com/Miragon/wardley-maps-modeler/issues/128)) ([afc7879](https://github.com/Miragon/wardley-maps-modeler/commit/afc7879eba8c1d27e660b78425e86f380d3c08bc))

## [0.6.3](https://github.com/Miragon/wardley-maps-modeler/compare/vscode-v0.6.2...vscode-v0.6.3) (2026-10-08)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.5.2 to 0.5.3
    * @miragon/wardley-renderer bumped from 0.6.2 to 0.6.3

## [0.6.2](https://github.com/Miragon/wardley-maps-modeler/compare/vscode-v0.6.1...vscode-v0.6.2) (2026-09-22)


### Bug Fixes

* **deps:** declare consumer-shared runtime libs as ranged peer dependencies ([#113](https://github.com/Miragon/wardley-maps-modeler/issues/113)) ([322523c](https://github.com/Miragon/wardley-maps-modeler/commit/322523ccf57cd3e8f4d4d235ee216400f3379ff1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.5.1 to 0.5.2
    * @miragon/wardley-renderer bumped from 0.6.1 to 0.6.2
    * @miragon/wardley-schema-model bumped from 0.5.0 to 0.5.1

## [0.6.1](https://github.com/Miragon/wardley-maps-modeler/compare/vscode-v0.6.0...vscode-v0.6.1) (2026-08-06)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.5.0 to 0.5.1
    * @miragon/wardley-renderer bumped from 0.6.0 to 0.6.1

## [0.6.0](https://github.com/Miragon/wardley-maps-modeler/compare/vscode-v0.5.0...vscode-v0.6.0) (2026-08-06)


### ⚠ BREAKING CHANGES

* drop embedded-image feature; add app tests, guardrails, per-module releases ([#90](https://github.com/Miragon/wardley-maps-modeler/issues/90))

### Code Refactoring

* drop embedded-image feature; add app tests, guardrails, per-module releases ([#90](https://github.com/Miragon/wardley-maps-modeler/issues/90)) ([e1229a3](https://github.com/Miragon/wardley-maps-modeler/commit/e1229a3bdaba6f735d01dc2e6776f3f74b1b2c79))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-renderer bumped from 0.5.0 to 0.6.0
