# Changelog

## [0.8.0](https://github.com/Miragon/modeler-suite/compare/event-storming-renderer-v0.7.0...event-storming-renderer-v0.8.0) (2026-10-30)


### Features

* **event-storming:** deprecate createShortcutsDialog and its types of event-storming-renderer, removed in event-storming-renderer 0.9.0 ([#262](https://github.com/Miragon/modeler-suite/issues/262)) ([2f9d328](https://github.com/Miragon/modeler-suite/commit/2f9d328a6882ed2b6d534db8c6f16890b4793e10))
* **event-storming:** implement the contract's interaction and appearance surfaces ([#281](https://github.com/Miragon/modeler-suite/issues/281)) ([59a0dd9](https://github.com/Miragon/modeler-suite/commit/59a0dd962ec70582745183d6d6dc857b11f446b5))
* **event-storming:** use the shell's shortcuts dialog and PNG export ([#270](https://github.com/Miragon/modeler-suite/issues/270)) ([2f9d328](https://github.com/Miragon/modeler-suite/commit/2f9d328a6882ed2b6d534db8c6f16890b4793e10))


### Bug Fixes

* **event-storming:** end a drag cleanly when an import comes from the selection listener at its start ([#342](https://github.com/Miragon/modeler-suite/issues/342)) ([700350a](https://github.com/Miragon/modeler-suite/commit/700350ab8bd022c05d073970b88574cd95eeaf17))
* **event-storming:** end a line being drawn, without a drawing, when a board is imported ([ebd7cea](https://github.com/Miragon/modeler-suite/commit/ebd7cea600f86320a35a3d0d91f9a5cdbd1bab58))
* **event-storming:** give the palette the guide's sizes and its rules for forced colours and reduced motion ([#430](https://github.com/Miragon/modeler-suite/issues/430)) ([0a43243](https://github.com/Miragon/modeler-suite/commit/0a4324318b9ad4116d6ab65e9bc8eeebc7f85adf))
* **event-storming:** keep a drawing selected when an undo, a redo or another command ends the drag of one of its points ([#412](https://github.com/Miragon/modeler-suite/issues/412)) ([674e05b](https://github.com/Miragon/modeler-suite/commit/674e05b6c678881de1e7e1c0154deb3b98e59921))
* **event-storming:** keep an undo or a redo made while a point of a drawing is dragged: the drag ends there without a change, and the release no longer writes the drawing back over it ([40961cd](https://github.com/Miragon/modeler-suite/commit/40961cd0c0830e2ac08c6aca9c0e4a01ce0ffac2))
* **event-storming:** keep the label editors open while an input method composes, and show their focus ring ([#389](https://github.com/Miragon/modeler-suite/issues/389)) ([146e62d](https://github.com/Miragon/modeler-suite/commit/146e62dbc3b58a22fe20b1d8b531786a0d907ea8))
* **event-storming:** keep the label editors' focus ring visible on a sticky in Windows contrast themes ([#411](https://github.com/Miragon/modeler-suite/issues/411)) ([775ed5e](https://github.com/Miragon/modeler-suite/commit/775ed5ef31ddec801761a2d68f38deedb8514751))
* **event-storming:** leave placeholder-labelled aggregates out of the aggregates dialog ([#313](https://github.com/Miragon/modeler-suite/issues/313)) ([909e192](https://github.com/Miragon/modeler-suite/commit/909e192e2d0778d62be02703a3f301a1c7a804de))
* **event-storming:** let an import called during a drop wait until the drop has ended ([59a0dd9](https://github.com/Miragon/modeler-suite/commit/59a0dd962ec70582745183d6d6dc857b11f446b5))
* **event-storming:** let an import wait until the user's action has finished ([#315](https://github.com/Miragon/modeler-suite/issues/315)) ([58b1c5d](https://github.com/Miragon/modeler-suite/commit/58b1c5dc0707a745b21747f0d2bce55118eb538d))
* **event-storming:** let Escape end a drawing's point drag, and start no lasso, sticky or paste next to a line being drawn ([#366](https://github.com/Miragon/modeler-suite/issues/366)) ([ebd7cea](https://github.com/Miragon/modeler-suite/commit/ebd7cea600f86320a35a3d0d91f9a5cdbd1bab58))
* **event-storming:** report an edit made while an import waits for the annotation font ([59a0dd9](https://github.com/Miragon/modeler-suite/commit/59a0dd962ec70582745183d6d6dc857b11f446b5))
* **event-storming:** survive an import from the change listener while a drag starts ([#304](https://github.com/Miragon/modeler-suite/issues/304)) ([f789c39](https://github.com/Miragon/modeler-suite/commit/f789c39d4bdc74ffd9c86c1d0659cfc3c2a2fc84))
* **event-storming:** treat the default name of any sticky kind as a placeholder ([#323](https://github.com/Miragon/modeler-suite/issues/323)) ([27ebeb9](https://github.com/Miragon/modeler-suite/commit/27ebeb966f8b12732c82821818da1fede09346a9))
* finish an import and keep the imported document when a host destroys the modeler from a listener the import triggers ([d962f54](https://github.com/Miragon/modeler-suite/commit/d962f54216c01f28639ec3253f3d7c580e22f728))
* keep the arrow keys, the single-key tools, paste and duplicate from acting while a point of a drawing is dragged ([#391](https://github.com/Miragon/modeler-suite/issues/391)) ([40961cd](https://github.com/Miragon/modeler-suite/commit/40961cd0c0830e2ac08c6aca9c0e4a01ce0ffac2))
* keep the palette's focus ring whole, and keep each modeler's palette styles to its own canvas ([#392](https://github.com/Miragon/modeler-suite/issues/392)) ([c620895](https://github.com/Miragon/modeler-suite/commit/c620895610885730b7650480ac1b5bd94f0bb8d8))
* leave a key to the page when the host hid the canvas, also before the browser moves the focus away ([#424](https://github.com/Miragon/modeler-suite/issues/424)) ([aa03583](https://github.com/Miragon/modeler-suite/commit/aa035831d1a388df4305c54aafc33b7f1641360e))
* leave a key to the page when the host hid the modeler, also in its context pads, editors and popovers ([#446](https://github.com/Miragon/modeler-suite/issues/446)) ([0c596f3](https://github.com/Miragon/modeler-suite/commit/0c596f3cd900af2cc3c07da7586e765e878235e0))
* leave a key to the page when the host made the canvas inert, also before the browser moves the focus away ([#390](https://github.com/Miragon/modeler-suite/issues/390)) ([694e9fd](https://github.com/Miragon/modeler-suite/commit/694e9fd8aff1eb562300343e4acf147f5a183340))
* let a host destroy the modeler from a listener that an import calls ([#443](https://github.com/Miragon/modeler-suite/issues/443)) ([ec807d3](https://github.com/Miragon/modeler-suite/commit/ec807d303d907c73fed9d50044be85719d7469d0))
* let a host destroy the modeler from any listener when the user drops, presses Escape or creates an element ([#396](https://github.com/Miragon/modeler-suite/issues/396)) ([572a753](https://github.com/Miragon/modeler-suite/commit/572a7537504999fee59a29f3251cc7f4d4a6f85e))
* let a host destroy the modeler from the selection listener that reveal() triggers ([#426](https://github.com/Miragon/modeler-suite/issues/426)) ([d962f54](https://github.com/Miragon/modeler-suite/commit/d962f54216c01f28639ec3253f3d7c580e22f728))
* let a host destroy the modeler from the selection listener when the user starts a drag ([#370](https://github.com/Miragon/modeler-suite/issues/370)) ([b2f03e7](https://github.com/Miragon/modeler-suite/commit/b2f03e7faeb01377cb246553c97067eeaaad49a9))
* let a host destroy the modeler while the pointer rests on a palette entry ([#414](https://github.com/Miragon/modeler-suite/issues/414)) ([94b9c89](https://github.com/Miragon/modeler-suite/commit/94b9c895d12fea430d96a89c7f7472f36df1812b))
* save the line being drawn with Space on the Draw entry, and in Wardley Maps keep a drawing selected when an undo, a redo or another command ends the drag of one of its points ([#442](https://github.com/Miragon/modeler-suite/issues/442)) ([5bf0daf](https://github.com/Miragon/modeler-suite/commit/5bf0dafd9340cddee9e40c1d235d27e78fd920b9))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/event-storming-dsl bumped from 0.3.3 to 0.3.4
    * @miragon/event-storming-schema-model bumped from 0.3.0 to 0.3.1
    * @miragon/modeler-api bumped from 1.5.0 to 1.6.0

## [0.7.0](https://github.com/Miragon/modeler-suite/compare/event-storming-renderer-v0.6.0...event-storming-renderer-v0.7.0) (2026-10-28)


### Features

* **event-storming:** find the names a board spells several ways, mark them on the canvas and unify them in one undo step ([ea4e748](https://github.com/Miragon/modeler-suite/commit/ea4e7484b28fe6a46f839d47299bf42e8b03da82))
* **event-storming:** suggest labels so that the board speaks one language ([#225](https://github.com/Miragon/modeler-suite/issues/225)) ([ea4e748](https://github.com/Miragon/modeler-suite/commit/ea4e7484b28fe6a46f839d47299bf42e8b03da82))


### Bug Fixes

* **event-storming:** cancel a running drag or palette create when a text is imported ([#211](https://github.com/Miragon/modeler-suite/issues/211)) ([c950225](https://github.com/Miragon/modeler-suite/commit/c950225bb1393f11150f6b390b5adcc9acb65afc))
* **event-storming:** survive an import from the change listener during a drop ([#241](https://github.com/Miragon/modeler-suite/issues/241)) ([8002bf7](https://github.com/Miragon/modeler-suite/commit/8002bf78cdbec4f76a63c1183dabe2f202475c19))
* re-vendor cd-canvas.css of design guide 1.27.0 in the five renderers ([#255](https://github.com/Miragon/modeler-suite/issues/255)) ([9f412c0](https://github.com/Miragon/modeler-suite/commit/9f412c0018ba8ecc82838e4dac71bf09e2a20795))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/event-storming-dsl bumped from 0.3.2 to 0.3.3
    * @miragon/event-storming-schema-model bumped from 0.2.3 to 0.3.0
    * @miragon/modeler-api bumped from 1.4.0 to 1.5.0

## [0.6.0](https://github.com/Miragon/modeler-suite/compare/event-storming-renderer-v0.5.1...event-storming-renderer-v0.6.0) (2026-10-28)


### ⚠ BREAKING CHANGES

* **event-storming:** the renderer no longer accepts the deprecated `freeRectInsets` option of `Modeler` and the viewers, of `createCollaborativeModeler` / `createCollaborativeViewer` and of the palette config; pass `freeArea: { insets }`, the `@miragon/modeler-api` factory option, instead.
* **event-storming:** `MIRAGON.navy` is removed from the renderer's `MIRAGON` palette; the design system has no navy surface and nothing in the modeler draws it, so read colours from the design system's `--cd-*` tokens or the remaining `MIRAGON` keys instead.
* **event-storming:** the renderer no longer exports `iconMarkup` and the 16 Material Icons paths (`ICON_PERSON`, `ICON_EDIT`, `ICON_DELETE`, `ICON_UNDO`, `ICON_REDO`, `ICON_DATA_OBJECT`, `ICON_CODE`, `ICON_DOWNLOAD`, `ICON_SHARE`, `ICON_FOLDER_OPEN`, `ICON_IMAGE`, `ICON_NEW`, `ICON_MENU`, `ICON_ADD`, `ICON_FIT`, `ICON_EYE`); take chrome icons from `@miragon/modeler-shell` instead (its Lucide `iconMarkup` and icon names).

### Features

* **event-storming:** remove freeRectInsets, MIRAGON.navy and the Material ICON_* exports ([#186](https://github.com/Miragon/modeler-suite/issues/186)) ([69efb47](https://github.com/Miragon/modeler-suite/commit/69efb47eadf4416826d4093ce747c0d4bc6dfc16))
* **event-storming:** remove MIRAGON.navy from the renderer's theme palette ([69efb47](https://github.com/Miragon/modeler-suite/commit/69efb47eadf4416826d4093ce747c0d4bc6dfc16))
* **event-storming:** remove the Material ICON_* and iconMarkup exports ([69efb47](https://github.com/Miragon/modeler-suite/commit/69efb47eadf4416826d4093ce747c0d4bc6dfc16))


### Bug Fixes

* **event-storming:** leave Enter and Escape on the host's controls while a draw tool is armed ([#189](https://github.com/Miragon/modeler-suite/issues/189)) ([a5f49af](https://github.com/Miragon/modeler-suite/commit/a5f49afdde8f944333279f7a58f9fca5d1447e47))

## [0.5.1](https://github.com/Miragon/modeler-suite/compare/event-storming-renderer-v0.5.0...event-storming-renderer-v0.5.1) (2026-10-25)


### Bug Fixes

* **event-storming:** darken the sticky and note borders to 3:1 on the canvas ground, each in its own hue ([d1bd6c3](https://github.com/Miragon/modeler-suite/commit/d1bd6c32730e0827319adfdb3e17e23452ec288c))
* **event-storming:** deprecate MIRAGON.navy, which no part of the modeler draws ([d1bd6c3](https://github.com/Miragon/modeler-suite/commit/d1bd6c32730e0827319adfdb3e17e23452ec288c))
* **event-storming:** draw the canvas in the design guide's greys and contrasts ([#143](https://github.com/Miragon/modeler-suite/issues/143)) ([d1bd6c3](https://github.com/Miragon/modeler-suite/commit/d1bd6c32730e0827319adfdb3e17e23452ec288c))
* **event-storming:** take board keys only from the focused canvas ([#138](https://github.com/Miragon/modeler-suite/issues/138)) ([9d280a7](https://github.com/Miragon/modeler-suite/commit/9d280a721054d9ab009d764dd66ded911c8c20bf))
* **event-storming:** write sticky text in black or white, whichever reads better on a fill the user sets ([d1bd6c3](https://github.com/Miragon/modeler-suite/commit/d1bd6c32730e0827319adfdb3e17e23452ec288c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/event-storming-dsl bumped from 0.3.1 to 0.3.2
    * @miragon/event-storming-schema-model bumped from 0.2.2 to 0.2.3
    * @miragon/modeler-api bumped from 1.3.0 to 1.4.0

## [0.5.0](https://github.com/Miragon/event-storming-modeler/compare/renderer-v0.4.1...renderer-v0.5.0) (2026-10-23)


### Features

* **renderer:** report the board's content bounds (modeler-api 1.3); the apps fit to them with modeler-shell 0.4.0 ([#60](https://github.com/Miragon/event-storming-modeler/issues/60)) ([d4b1689](https://github.com/Miragon/event-storming-modeler/commit/d4b168964d67d09f52c162b5cc89fb8064733b48))

## [0.4.1](https://github.com/Miragon/event-storming-modeler/compare/renderer-v0.4.0...renderer-v0.4.1) (2026-10-22)


### Bug Fixes

* keep the open board when a JSON board lies beyond ±1e38 ([#55](https://github.com/Miragon/event-storming-modeler/issues/55)) ([ad72b03](https://github.com/Miragon/event-storming-modeler/commit/ad72b03ff57b8b7614e191a224836e734b33e70a))
* **renderer:** accept didi 12 in the didi peer range ([#53](https://github.com/Miragon/event-storming-modeler/issues/53)) ([c4037a0](https://github.com/Miragon/event-storming-modeler/commit/c4037a0898cbe4cb84e3a63e0102576ee198400e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/event-storming-dsl bumped from 0.3.0 to 0.3.1
    * @miragon/event-storming-schema-model bumped from 0.2.1 to 0.2.2

## [0.4.0](https://github.com/Miragon/event-storming-modeler/compare/renderer-v0.3.0...renderer-v0.4.0) (2026-10-21)


### Features

* give new stickies random ids and implement modeler-api contract 1.2 ([#41](https://github.com/Miragon/event-storming-modeler/issues/41)) ([6fe94e7](https://github.com/Miragon/event-storming-modeler/commit/6fe94e7adfe2df27f07658093ef4ac1c5c13e94b))

## [0.3.0](https://github.com/Miragon/event-storming-modeler/compare/renderer-v0.2.2...renderer-v0.3.0) (2026-10-19)


### Features

* implement the modeler-api contract and mount the modeler shell in VS Code ([#38](https://github.com/Miragon/event-storming-modeler/issues/38)) ([b15f652](https://github.com/Miragon/event-storming-modeler/commit/b15f6520949705d14ec054ed5df9548d6d2a5d22))
* **webapp:** move the web app onto the shared modeler shell's web chrome ([#39](https://github.com/Miragon/event-storming-modeler/issues/39)) ([03e9792](https://github.com/Miragon/event-storming-modeler/commit/03e979247fc84111a03b111d6ff260f2db558bb2))


### Bug Fixes

* **vscode:** keep the webview chrome light in dark VS Code themes ([#35](https://github.com/Miragon/event-storming-modeler/issues/35)) ([438e913](https://github.com/Miragon/event-storming-modeler/commit/438e9135d30bdff70b22377784a53b4cdfa0c02f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/event-storming-dsl bumped from 0.2.2 to 0.3.0

## [0.2.2](https://github.com/Miragon/event-storming-modeler/compare/renderer-v0.2.1...renderer-v0.2.2) (2026-09-22)


### Bug Fixes

* **deps:** move shared runtime deps to peerDependencies ([#22](https://github.com/Miragon/event-storming-modeler/issues/22)) ([c950b3b](https://github.com/Miragon/event-storming-modeler/commit/c950b3b285e622a2652dcb053e9f88a21d58f4dd))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/event-storming-dsl bumped from 0.2.1 to 0.2.2
    * @miragon/event-storming-schema-model bumped from 0.2.0 to 0.2.1

## [0.2.1](https://github.com/Miragon/event-storming-modeler/compare/renderer-v0.2.0...renderer-v0.2.1) (2026-09-04)


### Bug Fixes

* **renderer:** hang palette tooltips below the entry ([#11](https://github.com/Miragon/event-storming-modeler/issues/11)) ([20f3ccb](https://github.com/Miragon/event-storming-modeler/commit/20f3ccbffe7b8ebf0473cdd78afede2448c59fd1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/event-storming-dsl bumped from 0.2.0 to 0.2.1

## [0.2.0](https://github.com/Miragon/event-storming-modeler/compare/renderer-v0.1.0...renderer-v0.2.0) (2026-09-02)


### Features

* actors and hotspots can be pinned onto host stickies ([6a53170](https://github.com/Miragon/event-storming-modeler/commit/6a53170b6d320ac0ae0bea42a99bc7e12c16b90c))
* adapt the modeler from wardley maps to event storming ([be69b3c](https://github.com/Miragon/event-storming-modeler/commit/be69b3ca0a0b8c9c2e77c8107c80f2c80ac1ce88))
* context-pad append drags a blank sticky and opens the type chooser ([6213634](https://github.com/Miragon/event-storming-modeler/commit/62136348e4a6f0e4852c83edd809f821e8ae9f8f))
* duplicate sticky labels via internal element ids ([b2a89ae](https://github.com/Miragon/event-storming-modeler/commit/b2a89ae48bdee06f474eda3915c0f0ea2fbe35f0))
* event storming modeler ([4c2163e](https://github.com/Miragon/event-storming-modeler/commit/4c2163eb41a7116680deb2bb74e39fc34a84f72d))
* notes are attachable like actors and hotspots ([506330b](https://github.com/Miragon/event-storming-modeler/commit/506330bda0d6308b30c140c9eed60bcf3b6ca156))
* notes are freely resizable ([0177519](https://github.com/Miragon/event-storming-modeler/commit/0177519dd484b5b6da5b6b0ac6d791d319e4660f))
* **renderer:** offer event, command and aggregate as typed append choices ([b83c7dc](https://github.com/Miragon/event-storming-modeler/commit/b83c7dcadda4bd377fd1576014453a81b395d050))
* **renderer:** size the note sticky like an aggregate by default ([#8](https://github.com/Miragon/event-storming-modeler/issues/8)) ([f83bd60](https://github.com/Miragon/event-storming-modeler/commit/f83bd6096dc33e13575ef328ccf8cf0b12f7f37f))
* **renderer:** soft drop shadow makes stickies read as paper ([b0ded83](https://github.com/Miragon/event-storming-modeler/commit/b0ded831acbd8f20dd840dda2e5cdc8d42786b4e))
* **renderer:** stickies get sharp corners ([7819345](https://github.com/Miragon/event-storming-modeler/commit/7819345d5c6d24318d9f98b99cc9dffb9d476dfe))
* toggleable type captions at the bottom of every sticky ([c35b5cc](https://github.com/Miragon/event-storming-modeler/commit/c35b5ccf3074d0e6b8e296fc1c304b3b46baf6b4))
* workshop levels filter the creation surfaces ([169b18b](https://github.com/Miragon/event-storming-modeler/commit/169b18bef162f5699f7de347e9e534747f8bccee))
* WYSIWYG notes with bold/italic/bullets and per-note text alignment ([1c40eab](https://github.com/Miragon/event-storming-modeler/commit/1c40eab47043e1d278cf3ccbaf6e7da350eb2f84))


### Bug Fixes

* harden the DSL round-trip and renderer editing after adversarial review ([718b933](https://github.com/Miragon/event-storming-modeler/commit/718b933ee29f48ac18defc0c8ea999a8365779a9))
* **renderer:** click-to-place append no longer loses the blank sticky ([ca61268](https://github.com/Miragon/event-storming-modeler/commit/ca6126843af693ca53ea0409b2d077f953d8b5c1))
* **renderer:** context pad and palette hover tint instead of turning transparent ([269544b](https://github.com/Miragon/event-storming-modeler/commit/269544b78f2b297e85d52a669da6e638b82da475))
* **renderer:** drop the color picker from sticky and note context pads ([0bdc97c](https://github.com/Miragon/event-storming-modeler/commit/0bdc97c43ef7f5e07f8864da813849b7a34af7e1))
* **renderer:** policy and external system use the large block format ([8f45fc8](https://github.com/Miragon/event-storming-modeler/commit/8f45fc8588ea3602f49bd54aee8b087f92a12f38))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/event-storming-dsl bumped from 0.1.0 to 0.2.0
    * @miragon/event-storming-schema-model bumped from 0.1.0 to 0.2.0

## Changelog

Project started at 0.1.0, based on the wardley-maps-modeler codebase.
