# Changelog

## [0.9.0](https://github.com/Miragon/modeler-suite/compare/modeler-shell-v0.8.0...modeler-shell-v0.9.0) (2026-10-30)


### ⚠ BREAKING CHANGES

* **shell:** @miragon/modeler-shell/testing/vscode-electron no longer exports VSCODE_SMOKE_OPT_IN_STEPS, VsCodeSmokeOptInStep or vsCodeSmokeOptIn, deprecated since 0.8.0. Use VSCODE_SMOKE_SKIPPABLE_STEPS, VsCodeSmokeSkippableStep and vsCodeSmokeSkip, which reads VSCODE_SMOKE_SKIP. The driver has not read VSCODE_SMOKE_OPT_IN since 0.8.0 and takes every step unless an option or VSCODE_SMOKE_SKIP skips it.

### Features

* **shell:** remove the deprecated opt-in names of the VS Code smoke driver ([#470](https://github.com/Miragon/modeler-suite/issues/470)) ([3503c8a](https://github.com/Miragon/modeler-suite/commit/3503c8aaccec8dd063dbb43d9498e4501bd0e206))
* **shell:** share the VS Code export save dialog and the New … from Example command ([#495](https://github.com/Miragon/modeler-suite/issues/495)) ([74a7a87](https://github.com/Miragon/modeler-suite/commit/74a7a87fc82b90fbed9afface5a6551bc06e48c8))


### Bug Fixes

* **shell:** keep an armed tool when Escape closes the menu, a popover or a dialog, and keep a disabled palette entry grey under the pointer in forced colours ([#496](https://github.com/Miragon/modeler-suite/issues/496)) ([fd92e84](https://github.com/Miragon/modeler-suite/commit/fd92e84544deee28031bedc246202f1f6a1ebdab))
* **shell:** keep the keyboard focus in the palette when it rebuilds ([#478](https://github.com/Miragon/modeler-suite/issues/478)) ([036e4ce](https://github.com/Miragon/modeler-suite/commit/036e4ce36cd4ffdc961b3ddbbf4617448bde48e6))
* **shell:** put down an armed tool only on an Escape aimed at the canvas or the palette ([#502](https://github.com/Miragon/modeler-suite/issues/502)) ([cb80b80](https://github.com/Miragon/modeler-suite/commit/cb80b807bf35a6a75bd9a081b7f31005740e1a30))
* **shell:** show a tool armed from the palette as released once Escape puts it down before the pointer moves ([036e4ce](https://github.com/Miragon/modeler-suite/commit/036e4ce36cd4ffdc961b3ddbbf4617448bde48e6))

## [0.8.0](https://github.com/Miragon/modeler-suite/compare/modeler-shell-v0.7.0...modeler-shell-v0.8.0) (2026-10-30)


### ⚠ BREAKING CHANGES

* **shell:** shell.toast() shows nothing in the embedded host and returns an inert handle, as in the IDE host, and an embedded root renders no toast stack and no live regions (guide 1.27.1, §5.2 and §9). An embedding host shows the outcome of the actions it runs (save, export, share) in its own feedback instead. The conformance kit no longer asks an embedded harness for show.toast and fails an embedded root that shows a toast.

### Features

* **shell:** check reduced motion, Reload Window and a hidden tab in the VS Code smoke driver ([#337](https://github.com/Miragon/modeler-suite/issues/337)) ([415ec3b](https://github.com/Miragon/modeler-suite/commit/415ec3b4c6343f87641efe37e082be0cddd5502d))
* **shell:** check the view and the selection after undo and redo in the VS Code smoke driver ([#272](https://github.com/Miragon/modeler-suite/issues/272)) ([52209f9](https://github.com/Miragon/modeler-suite/commit/52209f95c38978eb2edafd2edc579c3d2f3c36a2))
* **shell:** run the key, history and workbench checks of the VS Code smoke driver by default ([#369](https://github.com/Miragon/modeler-suite/issues/369)) ([08bf5ad](https://github.com/Miragon/modeler-suite/commit/08bf5ad49e990ca745bc557fed27c97fafe566d7))
* **shell:** share the VS Code document plumbing, starting with Wardley Maps ([#282](https://github.com/Miragon/modeler-suite/issues/282)) ([3caa9f3](https://github.com/Miragon/modeler-suite/commit/3caa9f38aab296027722c36f1e27e0602f1f320d))
* **shell:** show no toasts in the embedded host ([#335](https://github.com/Miragon/modeler-suite/issues/335)) ([0d2ac8f](https://github.com/Miragon/modeler-suite/commit/0d2ac8fb90fee7b57429212be479c6aa65cb2151))


### Bug Fixes

* keep a line being drawn when a key reaches the palette right after the host hid the canvas or made it inert ([#413](https://github.com/Miragon/modeler-suite/issues/413)) ([f5471e3](https://github.com/Miragon/modeler-suite/commit/f5471e3757c65576409a67613976ea05364c4e52))
* keep the palette's focus ring whole, and keep each modeler's palette styles to its own canvas ([#392](https://github.com/Miragon/modeler-suite/issues/392)) ([c620895](https://github.com/Miragon/modeler-suite/commit/c620895610885730b7650480ac1b5bd94f0bb8d8))
* leave a key to the page when the host hid the modeler, also in its context pads, editors and popovers ([#446](https://github.com/Miragon/modeler-suite/issues/446)) ([0c596f3](https://github.com/Miragon/modeler-suite/commit/0c596f3cd900af2cc3c07da7586e765e878235e0))
* **shell:** hand the focus back to the canvas after a click on Share ([#269](https://github.com/Miragon/modeler-suite/issues/269)) ([08e5e64](https://github.com/Miragon/modeler-suite/commit/08e5e6492691d7be910e632d042d427e432b3520))
* **shell:** preload each Geist subset in its own style and weight ([#299](https://github.com/Miragon/modeler-suite/issues/299)) ([d6dc0e0](https://github.com/Miragon/modeler-suite/commit/d6dc0e0211e3ebcf7cee39c2fda2c0de82a3d003))
* **shell:** read the keys step's fit only once its animation has ended ([#303](https://github.com/Miragon/modeler-suite/issues/303)) ([fbcff68](https://github.com/Miragon/modeler-suite/commit/fbcff68f8af4e898a9b738f9144f006a38bc9726))
* **shell:** size the shared dialog from its container and follow it in every host ([#309](https://github.com/Miragon/modeler-suite/issues/309)) ([dfd7d00](https://github.com/Miragon/modeler-suite/commit/dfd7d005e607483346c488d457a8a41d2095c067))

## [0.7.0](https://github.com/Miragon/modeler-suite/compare/modeler-shell-v0.6.0...modeler-shell-v0.7.0) (2026-10-28)


### ⚠ BREAKING CHANGES

* **shell:** @miragon/modeler-shell no longer exports legendStartsOpen, from ./core or the main entry; it had returned false whatever it was given since 0.5. A host removes the call and lets the shell decide the start state: it passes the state it stored as legend.open to mountShell or mountVsCodeShell (nothing on a first visit) and writes each change from legend.onToggle, so the legend starts closed at every size unless a stored state opens it.

### Features

* **shell:** add a PNG export helper that embeds Geist and fills the notation's background ([#226](https://github.com/Miragon/modeler-suite/issues/226)) ([d730b30](https://github.com/Miragon/modeler-suite/commit/d730b3089309d9bad939667271d6cbc241fec7cc))
* **shell:** check zoom and selection keys in the VS Code smoke driver ([#246](https://github.com/Miragon/modeler-suite/issues/246)) ([5f4fac9](https://github.com/Miragon/modeler-suite/commit/5f4fac9239e19d31928a96dc85254a0302474620))
* **shell:** remove the deprecated legendStartsOpen option ([#203](https://github.com/Miragon/modeler-suite/issues/203)) ([7659271](https://github.com/Miragon/modeler-suite/commit/7659271f3cfca66f9e20d864e5515f2e87c97148))


### Bug Fixes

* **shell:** centre the shared dialog over the modeler ([#250](https://github.com/Miragon/modeler-suite/issues/250)) ([90da431](https://github.com/Miragon/modeler-suite/commit/90da431ace81c4d32188438e0d637293d749b06e))

## [0.6.0](https://github.com/Miragon/modeler-suite/compare/modeler-shell-v0.5.0...modeler-shell-v0.6.0) (2026-10-25)


### Features

* **shell:** check reduced motion, forced colours and canvas overlay layers in the kit ([#146](https://github.com/Miragon/modeler-suite/issues/146)) ([26137c3](https://github.com/Miragon/modeler-suite/commit/26137c336ca2e9e0c26e0866a6dbb15499a6f456))
* **shell:** check the production webview bundle under its CSP in the kit ([#156](https://github.com/Miragon/modeler-suite/issues/156)) ([a205a0b](https://github.com/Miragon/modeler-suite/commit/a205a0b9208fbed703b8e210320f847c8b9db607))
* **shell:** report the webview's errors and fail fast when the smoke open fails ([#129](https://github.com/Miragon/modeler-suite/issues/129)) ([cdeab61](https://github.com/Miragon/modeler-suite/commit/cdeab612168cf9969cb53fd99858667961957ab7))
* **shell:** run the kit per document and check that an empty file opens at 100 % with its hint ([#157](https://github.com/Miragon/modeler-suite/issues/157)) ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))
* **shell:** treat EditContext and Monaco editors as text fields ([#137](https://github.com/Miragon/modeler-suite/issues/137)) ([ebacfca](https://github.com/Miragon/modeler-suite/commit/ebacfcacbadb6359d6acb2401486a6e9a8da5669))


### Bug Fixes

* **context-maps:** show the empty-file hint on an empty map after the web app's start screen ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))
* **event-storming:** show the empty-file hint on an empty board after the web app's start screen ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))
* **plugin:** read the new-modeler template's title line in linear time ([092350c](https://github.com/Miragon/modeler-suite/commit/092350c085eec0990932d8a33ff71a207d471b10))
* **plugin:** show the empty-file hint after "New diagram" in the new-modeler template's web app ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))
* **shell:** address the CodeQL alerts in the webview HTML, keymap and sizes ([#126](https://github.com/Miragon/modeler-suite/issues/126)) ([092350c](https://github.com/Miragon/modeler-suite/commit/092350c085eec0990932d8a33ff71a207d471b10))
* **shell:** fit once more when an open legend settles after the first fit ([#131](https://github.com/Miragon/modeler-suite/issues/131)) ([586b623](https://github.com/Miragon/modeler-suite/commit/586b62302ad361959a33554e34f0d24cdff724ac))
* **shell:** hand the focus on after a click on a toast, the start screen, the hint or the legend in WebKit ([#165](https://github.com/Miragon/modeler-suite/issues/165)) ([ee9ce11](https://github.com/Miragon/modeler-suite/commit/ee9ce113e89889e09aa1d2146b3f9e887011d10a))
* **shell:** name a shifted chip's keys for US and German in aria-keyshortcuts ([#154](https://github.com/Miragon/modeler-suite/issues/154)) ([fc2009e](https://github.com/Miragon/modeler-suite/commit/fc2009edad59315cddfa3b5c95c5b3dd05213dd1))
* **shell:** take the view off 100 % before the labelEditor case's Cmd/Ctrl+0 ([#127](https://github.com/Miragon/modeler-suite/issues/127)) ([66b9d9e](https://github.com/Miragon/modeler-suite/commit/66b9d9eb6fbc07f37ad8f50288e0d09d134a89fe))
* **team-topologies:** show the empty-file hint on an empty diagram after the web app's start screen ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))
* **value-chain:** show the empty-file hint on an empty diagram after the web app's start screen ([1fe2a53](https://github.com/Miragon/modeler-suite/commit/1fe2a53470f9401b7a29878a509511b8b77cdfe3))

## [0.5.0](https://github.com/Miragon/modeler-api/compare/modeler-shell-v0.4.1...modeler-shell-v0.5.0) (2026-10-23)


### Features

* **shell:** start the legend closed in every container ([#79](https://github.com/Miragon/modeler-api/issues/79)) ([1542838](https://github.com/Miragon/modeler-api/commit/1542838111f604f22ce654e5940601839f3aec14))

## [0.4.1](https://github.com/Miragon/modeler-api/compare/modeler-shell-v0.4.0...modeler-shell-v0.4.1) (2026-10-23)


### Bug Fixes

* **shell:** retry a theme switch VS Code did not pick up in the VS Code driver ([2376d54](https://github.com/Miragon/modeler-api/commit/2376d54bb1d7cbebcc183cc69f111cf906233aa7))
* **shell:** set extensions.autoUpdate to "off" so VS Code does not rewrite the driver's settings ([2376d54](https://github.com/Miragon/modeler-api/commit/2376d54bb1d7cbebcc183cc69f111cf906233aa7))

## [0.4.0](https://github.com/Miragon/modeler-api/compare/modeler-shell-v0.3.3...modeler-shell-v0.4.0) (2026-10-23)


### Features

* report the content bounds a host fits to (contract 1.3) and fit to them in connectDiagramJs ([#62](https://github.com/Miragon/modeler-api/issues/62)) ([3ebb72b](https://github.com/Miragon/modeler-api/commit/3ebb72bca0b39ca4a5ace3410e6c9d6b9f83bbd4))
* **shell:** check that the shell's fit, zoom and refit never commit an open label editor ([#64](https://github.com/Miragon/modeler-api/issues/64)) ([eee7840](https://github.com/Miragon/modeler-api/commit/eee7840dc7decfebcac4bbd8d163cdbfcf646dd2))
* **shell:** start the legend closed up to 440px wide and tighten the kit to the settled guide readings ([#68](https://github.com/Miragon/modeler-api/issues/68)) ([16baa0a](https://github.com/Miragon/modeler-api/commit/16baa0a9b667349d89e2b526fc42481a81c854ef))


### Bug Fixes

* **shell:** keep the menu's shortcut chip out of the item's accessible name ([#63](https://github.com/Miragon/modeler-api/issues/63)) ([22517d5](https://github.com/Miragon/modeler-api/commit/22517d5ba8151f3b28eebd122b18f0289586cf49))

## [0.3.3](https://github.com/Miragon/modeler-api/compare/modeler-shell-v0.3.2...modeler-shell-v0.3.3) (2026-10-22)


### Bug Fixes

* **shell:** let concurrent VS Code smoke runs share the download cache ([#53](https://github.com/Miragon/modeler-api/issues/53)) ([f932060](https://github.com/Miragon/modeler-api/commit/f932060bc3368eef5d6f9eca24a6b77feb63e7d8))

## [0.3.2](https://github.com/Miragon/modeler-api/compare/modeler-shell-v0.3.1...modeler-shell-v0.3.2) (2026-10-22)


### Bug Fixes

* **shell:** empty the Docker results folder in place instead of replacing it ([#32](https://github.com/Miragon/modeler-api/issues/32)) ([c1e93d0](https://github.com/Miragon/modeler-api/commit/c1e93d01719c7792eff8f9401937278bed4b3648))

## [0.3.1](https://github.com/Miragon/modeler-api/compare/modeler-shell-v0.3.0...modeler-shell-v0.3.1) (2026-10-21)


### Bug Fixes

* **shell:** wait for a complete save and run the VS Code smoke test in Docker ([#29](https://github.com/Miragon/modeler-api/issues/29)) ([41163fc](https://github.com/Miragon/modeler-api/commit/41163fc85e18d622e4d1af7d9e84115c759870d9))

## [0.3.0](https://github.com/Miragon/modeler-api/compare/modeler-shell-v0.2.2...modeler-shell-v0.3.0) (2026-10-21)


### Features

* **shell:** smoke-test a modeler's extension in a real VS Code ([f81428b](https://github.com/Miragon/modeler-api/commit/f81428bb55a7e7c18d0ba47bc2b1b348fc1c2cff))

## [0.2.2](https://github.com/Miragon/modeler-api/compare/modeler-shell-v0.2.1...modeler-shell-v0.2.2) (2026-10-21)


### Bug Fixes

* **shell:** hand the keyboard focus to the canvas after a pointer click on chrome ([#22](https://github.com/Miragon/modeler-api/issues/22)) ([7874575](https://github.com/Miragon/modeler-api/commit/7874575e0196a898e6a1b1650483b0f4c52bd615))

## [0.2.1](https://github.com/Miragon/modeler-api/compare/modeler-shell-v0.2.0...modeler-shell-v0.2.1) (2026-10-19)


### Bug Fixes

* **shell:** place a tooltip again when it grows after it is shown ([#17](https://github.com/Miragon/modeler-api/issues/17)) ([f0149e4](https://github.com/Miragon/modeler-api/commit/f0149e468b0c7aab786b081ff15c50aee082e55b))

## [0.2.0](https://github.com/Miragon/modeler-api/compare/modeler-shell-v0.1.0...modeler-shell-v0.2.0) (2026-10-19)


### Features

* **shell:** render the web-app chrome on the web host (0.2) ([#11](https://github.com/Miragon/modeler-api/issues/11)) ([e08d63a](https://github.com/Miragon/modeler-api/commit/e08d63a2c7720768622ae75c2735e62fd6c508b0))

## 0.1.0 (2026-10-19)


### Features

* **shell:** add @miragon/modeler-shell 0.1, the shared chrome around Miragon diagram-js modelers ([#8](https://github.com/Miragon/modeler-api/issues/8)) ([fde99a8](https://github.com/Miragon/modeler-api/commit/fde99a8a4ba29d66c3cf570d21ba8f0e93c02618))
