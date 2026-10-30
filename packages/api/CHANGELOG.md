# Changelog

## [1.6.0](https://github.com/Miragon/modeler-suite/compare/modeler-api-v1.5.0...modeler-api-v1.6.0) (2026-10-30)


### Features

* **api:** check gestures, armed tools, pans, imports during a drop and appearance in the conformance kit ([#349](https://github.com/Miragon/modeler-suite/issues/349)) ([a553282](https://github.com/Miragon/modeler-suite/commit/a553282049804b9efb4c9a8fc5394468201f52c0))
* **api:** check in the conformance kit that a host may destroy the modeler from the selection listener that reveal() calls ([#444](https://github.com/Miragon/modeler-suite/issues/444)) ([55b1a7e](https://github.com/Miragon/modeler-suite/commit/55b1a7e7ad5154ee0bf483956f57c289a433ace8))
* **api:** check in the conformance kit that an import waits for the user's running action and for a drag's start ([#374](https://github.com/Miragon/modeler-suite/issues/374)) ([4425c98](https://github.com/Miragon/modeler-suite/commit/4425c98bbd0c362b88d750b6ce3f52cfb2e3b54c))
* **api:** check that a host may destroy the modeler from a listener an import calls, and name visibility: hidden among the ways to hide the canvas ([#451](https://github.com/Miragon/modeler-suite/issues/451)) ([043059c](https://github.com/Miragon/modeler-suite/commit/043059c5bd7f55f02897f4a447e1365844bcdec6))
* **api:** check that a pan goes on from the view a host restores after an import ([#367](https://github.com/Miragon/modeler-suite/issues/367)) ([b89914c](https://github.com/Miragon/modeler-suite/commit/b89914c7e4393e8036fd2edde1938c6722fdb67a))
* **api:** say that a host may destroy the modeler from any listener, and check it in the conformance kit ([#423](https://github.com/Miragon/modeler-suite/issues/423)) ([7234e02](https://github.com/Miragon/modeler-suite/commit/7234e02b58bb527e21b03e9e5bc75e1f99e8d00c))

## [1.5.0](https://github.com/Miragon/modeler-suite/compare/modeler-api-v1.4.0...modeler-api-v1.5.0) (2026-10-28)


### Features

* **api:** add the optional interaction and appearance surfaces ([#210](https://github.com/Miragon/modeler-suite/issues/210)) ([559b76c](https://github.com/Miragon/modeler-suite/commit/559b76c440a268c903a9904d0fee4a67782088c9))
* **api:** recommend that an accepted import first cancels a running gesture ([559b76c](https://github.com/Miragon/modeler-suite/commit/559b76c440a268c903a9904d0fee4a67782088c9))

## [1.4.0](https://github.com/Miragon/modeler-suite/compare/modeler-api-v1.3.0...modeler-api-v1.4.0) (2026-10-25)


### Features

* **api:** recommend that keys stay on the canvas, with a conformance case ([#164](https://github.com/Miragon/modeler-suite/issues/164)) ([ab21edf](https://github.com/Miragon/modeler-suite/commit/ab21edf31e37020b67ddd851c6c10adb58d0ddee))

## [1.3.0](https://github.com/Miragon/modeler-api/compare/modeler-api-v1.2.0...modeler-api-v1.3.0) (2026-10-23)


### Features

* report the content bounds a host fits to (contract 1.3) and fit to them in connectDiagramJs ([#62](https://github.com/Miragon/modeler-api/issues/62)) ([3ebb72b](https://github.com/Miragon/modeler-api/commit/3ebb72bca0b39ca4a5ace3410e6c9d6b9f83bbd4))

## [1.2.0](https://github.com/Miragon/modeler-api/compare/modeler-api-v1.1.0...modeler-api-v1.2.0) (2026-10-21)


### Features

* **api:** contract 1.2 — elements.bounds, apiVersionsCompatible from the root, no commit on a host view change, aligned factory options ([#21](https://github.com/Miragon/modeler-api/issues/21)) ([f3f4998](https://github.com/Miragon/modeler-api/commit/f3f4998386f22ae42703f91ce2c72da1e4f85a35))

## [1.1.0](https://github.com/Miragon/modeler-api/compare/modeler-api-v1.0.0...modeler-api-v1.1.0) (2026-10-19)


### Features

* **kit:** enforce round-trip ids, pre-import use and every rejection; advise collision-free ids and kept edits ([#9](https://github.com/Miragon/modeler-api/issues/9)) ([feda5b0](https://github.com/Miragon/modeler-api/commit/feda5b05a2b4302c672d36d9e2eb69bb8d8d7fb1))

## 1.0.0 (2026-10-17)


### Features

* enforce every law in the kit, viewer profile, release identity ([#3](https://github.com/Miragon/modeler-api/issues/3)) ([6571463](https://github.com/Miragon/modeler-api/commit/6571463204eba2cc0a4711e903810966f5a97a35))
* the collaborative-modeler contract and its conformance kit ([#1](https://github.com/Miragon/modeler-api/issues/1)) ([6571463](https://github.com/Miragon/modeler-api/commit/6571463204eba2cc0a4711e903810966f5a97a35))
