# Changelog

## [0.3.1](https://github.com/Miragon/modeler-suite/compare/event-storming-schema-model-v0.3.0...event-storming-schema-model-v0.3.1) (2026-10-30)


### Bug Fixes

* **event-storming:** leave placeholder-labelled aggregates out of the aggregates dialog ([#313](https://github.com/Miragon/modeler-suite/issues/313)) ([909e192](https://github.com/Miragon/modeler-suite/commit/909e192e2d0778d62be02703a3f301a1c7a804de))
* **event-storming:** order the Aggregates dialog's ties the same way on every machine ([#416](https://github.com/Miragon/modeler-suite/issues/416)) ([b23fbe0](https://github.com/Miragon/modeler-suite/commit/b23fbe076134959face9b23250ea6bc3461af4ce))
* **event-storming:** treat the default name of any sticky kind as a placeholder ([#323](https://github.com/Miragon/modeler-suite/issues/323)) ([27ebeb9](https://github.com/Miragon/modeler-suite/commit/27ebeb966f8b12732c82821818da1fede09346a9))
* write a shared value at each of its places in JSON, and stop with an error before its copies exhaust the memory ([#363](https://github.com/Miragon/modeler-suite/issues/363)) ([4c324b9](https://github.com/Miragon/modeler-suite/commit/4c324b96386f9739a8243d45a3a47879a26ad10f))
* write Wardley Maps and Event Storming JSON in the same order on every machine; the first save after the update may reorder a file once ([#388](https://github.com/Miragon/modeler-suite/issues/388)) ([f50e3b9](https://github.com/Miragon/modeler-suite/commit/f50e3b96759bfee8cc72244b9bf43caac87bab7a))

## [0.3.0](https://github.com/Miragon/modeler-suite/compare/event-storming-schema-model-v0.2.3...event-storming-schema-model-v0.3.0) (2026-10-28)


### Features

* **event-storming:** find the names a board spells several ways, mark them on the canvas and unify them in one undo step ([ea4e748](https://github.com/Miragon/modeler-suite/commit/ea4e7484b28fe6a46f839d47299bf42e8b03da82))
* **event-storming:** suggest labels so that the board speaks one language ([#225](https://github.com/Miragon/modeler-suite/issues/225)) ([ea4e748](https://github.com/Miragon/modeler-suite/commit/ea4e7484b28fe6a46f839d47299bf42e8b03da82))

## [0.2.3](https://github.com/Miragon/modeler-suite/compare/event-storming-schema-model-v0.2.2...event-storming-schema-model-v0.2.3) (2026-10-25)


### Bug Fixes

* **event-storming:** drop the em dashes from the board validation messages ([#144](https://github.com/Miragon/modeler-suite/issues/144)) ([bbfa51b](https://github.com/Miragon/modeler-suite/commit/bbfa51bf896357370398bf2acf58f90676df1d52))

## [0.2.2](https://github.com/Miragon/event-storming-modeler/compare/schema-model-v0.2.1...schema-model-v0.2.2) (2026-10-22)


### Bug Fixes

* keep the open board when a JSON board lies beyond ±1e38 ([#55](https://github.com/Miragon/event-storming-modeler/issues/55)) ([ad72b03](https://github.com/Miragon/event-storming-modeler/commit/ad72b03ff57b8b7614e191a224836e734b33e70a))

## [0.2.1](https://github.com/Miragon/event-storming-modeler/compare/schema-model-v0.2.0...schema-model-v0.2.1) (2026-09-22)


### Bug Fixes

* **deps:** move shared runtime deps to peerDependencies ([#22](https://github.com/Miragon/event-storming-modeler/issues/22)) ([c950b3b](https://github.com/Miragon/event-storming-modeler/commit/c950b3b285e622a2652dcb053e9f88a21d58f4dd))

## [0.2.0](https://github.com/Miragon/event-storming-modeler/compare/schema-model-v0.1.0...schema-model-v0.2.0) (2026-09-02)


### Features

* actors and hotspots can be pinned onto host stickies ([6a53170](https://github.com/Miragon/event-storming-modeler/commit/6a53170b6d320ac0ae0bea42a99bc7e12c16b90c))
* adapt the modeler from wardley maps to event storming ([be69b3c](https://github.com/Miragon/event-storming-modeler/commit/be69b3ca0a0b8c9c2e77c8107c80f2c80ac1ce88))
* event storming modeler ([4c2163e](https://github.com/Miragon/event-storming-modeler/commit/4c2163eb41a7116680deb2bb74e39fc34a84f72d))
* notes are attachable like actors and hotspots ([506330b](https://github.com/Miragon/event-storming-modeler/commit/506330bda0d6308b30c140c9eed60bcf3b6ca156))
* notes are freely resizable ([0177519](https://github.com/Miragon/event-storming-modeler/commit/0177519dd484b5b6da5b6b0ac6d791d319e4660f))
* workshop levels filter the creation surfaces ([169b18b](https://github.com/Miragon/event-storming-modeler/commit/169b18bef162f5699f7de347e9e534747f8bccee))
* WYSIWYG notes with bold/italic/bullets and per-note text alignment ([1c40eab](https://github.com/Miragon/event-storming-modeler/commit/1c40eab47043e1d278cf3ccbaf6e7da350eb2f84))


### Bug Fixes

* harden the DSL round-trip and renderer editing after adversarial review ([718b933](https://github.com/Miragon/event-storming-modeler/commit/718b933ee29f48ac18defc0c8ea999a8365779a9))
