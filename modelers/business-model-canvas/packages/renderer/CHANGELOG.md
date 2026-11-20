# Changelog

## [0.3.0](https://github.com/Miragon/modeler-suite/compare/business-model-canvas-renderer-v0.2.0...business-model-canvas-renderer-v0.3.0) (2026-11-20)


### ⚠ BREAKING CHANGES

* **api:** @miragon/modeler-api/conformance no longer exports apiVersionsCompatible; import it from @miragon/modeler-api. Hosts match on the major, so a host on modeler-api 1.x refuses every modeler built against 2.x until it moves its own pin to 2.x.

### Features

* **api:** add mergeItemsByOccurrence for lists without ids ([748ac54](https://github.com/Miragon/modeler-suite/commit/748ac54ffebeefc86994e720ec13bbed0de1af4c))
* **api:** name the merge kit's cases after their laws, M1 to M5 ([748ac54](https://github.com/Miragon/modeler-suite/commit/748ac54ffebeefc86994e720ec13bbed0de1af4c))
* **api:** stop re-exporting apiVersionsCompatible from /conformance ([#676](https://github.com/Miragon/modeler-suite/issues/676)) ([748ac54](https://github.com/Miragon/modeler-suite/commit/748ac54ffebeefc86994e720ec13bbed0de1af4c))


### Bug Fixes

* **api:** keep both sides' changes in a text too large for the line table ([748ac54](https://github.com/Miragon/modeler-suite/commit/748ac54ffebeefc86994e720ec13bbed0de1af4c))
* **api:** merge a large rewrite by its trivial cases ([748ac54](https://github.com/Miragon/modeler-suite/commit/748ac54ffebeefc86994e720ec13bbed0de1af4c))
* **api:** report a fresh viewer's non-finite view state as such, not as a throw of getViewState ([748ac54](https://github.com/Miragon/modeler-suite/commit/748ac54ffebeefc86994e720ec13bbed0de1af4c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/business-model-canvas-dsl bumped from 0.2.0 to 0.3.0
    * @miragon/modeler-api bumped from 1.7.0 to 2.0.0

## [0.2.0](https://github.com/Miragon/modeler-suite/compare/business-model-canvas-renderer-v0.1.0...business-model-canvas-renderer-v0.2.0) (2026-11-14)


### Features

* **business-model-canvas:** fit long sticky texts, and stick every sticky on with tape ([#623](https://github.com/Miragon/modeler-suite/issues/623)) ([4c68949](https://github.com/Miragon/modeler-suite/commit/4c68949354d2de395621eccb05dcde42e7930295))
* **business-model-canvas:** set how many stickies stand side by side in the top row ([#624](https://github.com/Miragon/modeler-suite/issues/624)) ([ee397aa](https://github.com/Miragon/modeler-suite/commit/ee397aa987436b6320ddbf47e458486d8ef04f46))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/business-model-canvas-dsl bumped from 0.1.0 to 0.2.0
    * @miragon/business-model-canvas-schema-model bumped from 0.1.0 to 0.2.0

## 0.1.0 (2026-11-11)


### Features

* **business-model-canvas:** add the Business Model Canvas modeler ([#605](https://github.com/Miragon/modeler-suite/issues/605)) ([6292e84](https://github.com/Miragon/modeler-suite/commit/6292e84f20c8a9f26ebde3e435bf3b93c30ffbc7)), closes [#539](https://github.com/Miragon/modeler-suite/issues/539)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/business-model-canvas-dsl bumped from 0.0.0 to 0.1.0
    * @miragon/business-model-canvas-schema-model bumped from 0.0.0 to 0.1.0
