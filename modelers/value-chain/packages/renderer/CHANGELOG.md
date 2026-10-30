# Changelog

## [0.9.0](https://github.com/Miragon/modeler-suite/compare/value-chain-renderer-v0.8.1...value-chain-renderer-v0.9.0) (2026-10-30)


### Features

* **value-chain:** deprecate createShortcutsDialog and svgToPng of value-chain-renderer, removed in value-chain-renderer 0.10.0 ([f7ee57f](https://github.com/Miragon/modeler-suite/commit/f7ee57f2d6baf027d8a07f4d9b202f611b9abb21))
* **value-chain:** export the PNG on the canvas ground #F9F7F7 instead of white, set its labels in Geist, and warn when Geist couldn't be embedded ([f7ee57f](https://github.com/Miragon/modeler-suite/commit/f7ee57f2d6baf027d8a07f4d9b202f611b9abb21))
* **value-chain:** implement the contract's interaction and appearance surfaces ([#275](https://github.com/Miragon/modeler-suite/issues/275)) ([c9e91eb](https://github.com/Miragon/modeler-suite/commit/c9e91ebefc50e360cf09b0d7711327c434b6d8c4))
* **value-chain:** use the shell's shortcuts dialog and PNG export ([#265](https://github.com/Miragon/modeler-suite/issues/265)) ([f7ee57f](https://github.com/Miragon/modeler-suite/commit/f7ee57f2d6baf027d8a07f4d9b202f611b9abb21))


### Bug Fixes

* finish an import and keep the imported document when a host destroys the modeler from a listener the import triggers ([d962f54](https://github.com/Miragon/modeler-suite/commit/d962f54216c01f28639ec3253f3d7c580e22f728))
* leave a key to the page when the host hid the canvas, also before the browser moves the focus away ([#424](https://github.com/Miragon/modeler-suite/issues/424)) ([aa03583](https://github.com/Miragon/modeler-suite/commit/aa035831d1a388df4305c54aafc33b7f1641360e))
* leave a key to the page when the host hid the modeler, also in its context pads, editors and popovers ([#446](https://github.com/Miragon/modeler-suite/issues/446)) ([0c596f3](https://github.com/Miragon/modeler-suite/commit/0c596f3cd900af2cc3c07da7586e765e878235e0))
* leave a key to the page when the host made the canvas inert, also before the browser moves the focus away ([#390](https://github.com/Miragon/modeler-suite/issues/390)) ([694e9fd](https://github.com/Miragon/modeler-suite/commit/694e9fd8aff1eb562300343e4acf147f5a183340))
* let a host destroy the modeler from a listener that an import calls ([#443](https://github.com/Miragon/modeler-suite/issues/443)) ([ec807d3](https://github.com/Miragon/modeler-suite/commit/ec807d303d907c73fed9d50044be85719d7469d0))
* let a host destroy the modeler from any listener when the user drops, presses Escape or creates an element ([#396](https://github.com/Miragon/modeler-suite/issues/396)) ([572a753](https://github.com/Miragon/modeler-suite/commit/572a7537504999fee59a29f3251cc7f4d4a6f85e))
* let a host destroy the modeler from the selection listener that reveal() triggers ([#426](https://github.com/Miragon/modeler-suite/issues/426)) ([d962f54](https://github.com/Miragon/modeler-suite/commit/d962f54216c01f28639ec3253f3d7c580e22f728))
* let a host destroy the modeler from the selection listener when the user starts a drag ([#370](https://github.com/Miragon/modeler-suite/issues/370)) ([b2f03e7](https://github.com/Miragon/modeler-suite/commit/b2f03e7faeb01377cb246553c97067eeaaad49a9))
* let a host destroy the modeler while the pointer rests on a palette entry ([#414](https://github.com/Miragon/modeler-suite/issues/414)) ([94b9c89](https://github.com/Miragon/modeler-suite/commit/94b9c895d12fea430d96a89c7f7472f36df1812b))
* **value-chain:** copy, cut, paste and duplicate the selection with Cmd/Ctrl+C, X, V and D ([#361](https://github.com/Miragon/modeler-suite/issues/361)) ([0cf7f41](https://github.com/Miragon/modeler-suite/commit/0cf7f41d688be56839e579d2813daac80234655d))
* **value-chain:** end a drag cleanly when an import comes from the selection listener at its start ([#339](https://github.com/Miragon/modeler-suite/issues/339)) ([8dbef6a](https://github.com/Miragon/modeler-suite/commit/8dbef6a8fdafeb2e75292dcab04283131cc1915b))
* **value-chain:** follow the nearest appearance in high contrast, also when a host asks for normal contrast inside a high-contrast page ([#429](https://github.com/Miragon/modeler-suite/issues/429)) ([9def4d9](https://github.com/Miragon/modeler-suite/commit/9def4d9863dfe8570ac6f2948367fdcafa4a544e))
* **value-chain:** keep a hand-tool pan running when a text is imported ([#263](https://github.com/Miragon/modeler-suite/issues/263)) ([1146a23](https://github.com/Miragon/modeler-suite/commit/1146a231dd7a4319f4ad7626485920c8960b2381))
* **value-chain:** keep the selection a pan holds when a text is imported ([#293](https://github.com/Miragon/modeler-suite/issues/293)) ([d295919](https://github.com/Miragon/modeler-suite/commit/d295919d97fa9d7f082f9a2834bf0492e32d71a0))
* **value-chain:** keep the view a host restores after an import while the user pans ([#353](https://github.com/Miragon/modeler-suite/issues/353)) ([74657e2](https://github.com/Miragon/modeler-suite/commit/74657e2bab481bb2a085582883d6f54619eb3950))
* **value-chain:** lay out the palette for a host that mounts the renderer without the shell ([#368](https://github.com/Miragon/modeler-suite/issues/368)) ([67800d6](https://github.com/Miragon/modeler-suite/commit/67800d61126aaca3ffac98177b3b42557156aaa2))
* **value-chain:** let an import from the change listener of a drop wait until the drop has ended ([c9e91eb](https://github.com/Miragon/modeler-suite/commit/c9e91ebefc50e360cf09b0d7711327c434b6d8c4))
* **value-chain:** let an import wait until the user's action has finished ([#319](https://github.com/Miragon/modeler-suite/issues/319)) ([a780b17](https://github.com/Miragon/modeler-suite/commit/a780b17cf1b83855fa12bd3c64586ade25311db8))
* **value-chain:** let clear() from the change listener of a drop wait until the drop has ended ([c9e91eb](https://github.com/Miragon/modeler-suite/commit/c9e91ebefc50e360cf09b0d7711327c434b6d8c4))
* **value-chain:** open an append's label editor only on a shape the diagram still holds ([#297](https://github.com/Miragon/modeler-suite/issues/297)) ([0d0b125](https://github.com/Miragon/modeler-suite/commit/0d0b1252fb6fe391b0eed14bcbbabf1361c302ae))
* **value-chain:** show the label editor's focus ring and call the space tool "Space" ([#385](https://github.com/Miragon/modeler-suite/issues/385)) ([ba3313a](https://github.com/Miragon/modeler-suite/commit/ba3313a40b930f2a0c8514bcdbaddfc60548adbd))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/modeler-api bumped from 1.5.0 to 1.6.0
    * @miragon/value-chain-schema-model bumped from 0.7.2 to 0.7.3

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
