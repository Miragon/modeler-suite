---
name: new-modeler
description: Build a new Miragon modeler end to end, or bring an existing diagram-js modeler onto the Miragon modeler platform - one notation per repository with a DOM-free schema-model and text DSL, a diagram-js renderer that implements the @miragon/modeler-api contract (conformance kit in the browser tests), a web app and a VS Code custom editor on @miragon/modeler-shell (shell conformance kit in e2e), the Miragon design system, exact pins with ranged peers, release-please with npm trusted publishing and the VS Code Marketplace and Open VSX. Use when the user wants to start a modeler for a new notation, scaffold a modeler repository from the template, check a modeler repository against the platform conventions, upgrade one to a new contract or shell release, or prepare a renderer for Design IQ.
---

# Build a Miragon modeler

A Miragon modeler is one notation in one repository: a plain-text file is the source of truth, a
diagram-js renderer shows and edits it, and two apps put the renderer in front of users, a web app
and a VS Code custom editor. Two shared packages keep the family uniform:
[`@miragon/modeler-api`][api] (the collaborative-modeler contract every host binds, with its
conformance kit) and [`@miragon/modeler-shell`][shell] (the chrome around the canvas, with its
conformance kit). Five modelers follow this recipe, all in
[Miragon/modeler-suite](https://github.com/Miragon/modeler-suite) next to the two packages; read
the one closest to your notation:

| Modeler                            | Closest when your notation …                                              |
| ---------------------------------- | ------------------------------------------------------------------------- |
| [`modelers/event-storming`][es]    | has a line DSL and stickies; the pilot, nearest to the template           |
| [`modelers/value-chain`][vc]       | is small and stored as JSON; uses diagram-js-direct-editing               |
| [`modelers/team-topologies`][tt]   | has a legend, an inspector and a JSON format; one release component       |
| [`modelers/context-maps`][cm]      | imports and exports a foreign format (Context Mapper CML) next to its own |
| [`modelers/wardley-maps`][wardley] | has a fixed plot (axes, stages), notes and a large DSL; the most complete |

## Start from the template

[`assets/template/`](assets/template/) is a minimal, runnable modeler for a toy notation (labelled
nodes in a line DSL). Once the design-system files are copied in (step 1 of
[After copying](#after-copying)), it builds, passes both conformance kits on the `web` and `ide`
hosts and packages a VSIX. Copy it with the script, which fills every placeholder and refuses a
non-empty target:

```sh
node ${CLAUDE_PLUGIN_ROOT}/skills/new-modeler/scripts/new-modeler.mjs ../capability-map-modeler \
  --notation capability-map --name "Capability Map" --ext capmap --repo capability-map-modeler
```

(Outside the plugin, run [`scripts/new-modeler.mjs`](scripts/new-modeler.mjs) from this skill's
directory.)

| Placeholder        | Option       | Example                  | Becomes                                                                                     |
| ------------------ | ------------ | ------------------------ | ------------------------------------------------------------------------------------------- |
| `__NOTATION__`     | `--notation` | `capability-map`         | package names `@miragon/<notation>-*`, `meta.notation`, CSS prefix, VS Code ids, file names |
| `__DISPLAY_NAME__` | `--name`     | `Capability Map`         | titles, the app name `<Name> Modeler`, the VS Code display name                             |
| `__EXT__`          | `--ext`      | `capmap`                 | the file extension, without the dot                                                         |
| `__REPO__`         | `--repo`     | `capability-map-modeler` | `github.com/Miragon/<repo>`, the VS Code extension name, the VSIX file                      |

The template's `@miragon/modeler-api` and `@miragon/modeler-shell` pins are the current releases
(release-please rewrites them in this repository on every release); its third-party pins are the
ones Wardley Maps and Event Storming run on (plus `ovsx`, pinned so the Open VSX publish runs a
known version), and the new repository's Dependabot moves them on.

### After copying

1. **Design-system files** (see [design system](references/design-system.md#vendor-the-files)): copy
   `cd-tokens.generated.css`, `cd-tokens.generated.json` and `cd-canvas.css` unchanged from the
   `miragon-brand:modeler-tool-design` skill into `packages/renderer/src/theme/` (the two CSS files
   get the vendoring header line), and `miragon-komet-blau.svg` from the `miragon-brand:corporate-design`
   skill (`assets/logo/`) into `apps/webapp/public/`.
2. **Icons**: the notation's modeler icon from the `miragon-brand:icon-design` skill
   (`assets/modeler-icons/`; a new notation gets one there first) as
   `apps/webapp/public/favicon.svg`, and as `apps/vscode/icon.png` with `"icon": "icon.png"` in
   `apps/vscode/package.json` (the Marketplace needs it).
3. `git init`, then `npm install` (writes the lockfile CI's `npm ci` needs),
   `npx playwright install chromium` and `npm run format` (the placeholders changed line lengths).
4. Run every check once: `npm run lint`, `npm run format:check`, `npm run depcruise`,
   `npm run build`, `npm test`, `npm run test:browser`, `npm run test:e2e`, `npm run build:webapp`,
   `npm run build:vscode` and `npm run test:vscode:docker`, once as it is and once with
   `VSCODE_VERSION=1.96.0` (the `engines.vscode` floor). It runs the built extension in a real VS
   Code inside a Linux container, so no window opens and takes the focus; it needs Docker, and its
   first run builds the image and downloads VS Code. All green before the first commit, which is
   signed (`git commit -S -m "feat: …"`).
5. **GitHub**: the environments `npm` and `vscode-marketplace`, the secrets `VSCE_PUBLISH` and
   `OVSX_PUBLISH` (in `vscode-marketplace`), the release-please app (`RELEASE_PLEASE_APP_CLIENT_ID`,
   `RELEASE_PLEASE_APP_PRIVATE_KEY`; Dependabot's auto-merge uses it too), required signed commits,
   and `ci-ok` (the CI gate) and `validate-pr-title` as the only required checks on `main`, once
   `ci-ok` has run there (see [repository](references/repository.md#the-merge-gate)). A public
   repository also needs an Actions policy that allows `pull_request_target` for
   `dependabot-automerge.yml` (see [repository](references/repository.md#dependabot)). The first
   release of every npm package is published by hand once, see
   [releases](references/releases.md#first-release-of-a-package).
6. Replace the toy notation, test by test: the grammar in `packages/dsl`, the model in
   `packages/schema-model`, shapes and tools in `packages/renderer`, the fixtures of the
   conformance test, the examples of both apps.

## Build it in this order

1. **Model and text format, DOM-free.** A lossless round trip: the serializer is a fixpoint of its
   parser, unknown lines and fields survive, element ids are written into the text. See
   [repository](references/repository.md#the-dom-boundary) and
   [contract](references/contract.md#what-the-laws-mean-for-a-renderer).
2. **Renderer and contract.** The renderer exports `createCollaborativeModeler` and
   `createCollaborativeViewer`; the conformance kit runs in `npm run test:browser` with every hook
   filled, so a skip or an advisory fails. See [contract](references/contract.md).
3. **Apps on the shell.** The web app on the `web` host, the VS Code webview on the `ide` host,
   both through the contract factory; the shell's kit runs in `e2e` against both, and a smoke test
   opens the built extension in a real VS Code. See [shell](references/shell.md).
4. **Design system.** Vendored tokens in a cascade layer, roles only, light until the joint
   dark-mode release. See [design system](references/design-system.md).
5. **Releases.** One release-please component per package, npm trusted publishing, VSIX to the
   Marketplace and Open VSX. See [releases](references/releases.md).
6. **Design IQ.** What a renderer must hold for Design IQ to embed it. See
   [Design IQ](references/design-iq.md).

## Done when

- CI is green, which `ci-ok` sums up: lint, format, depcruise, pin check, unit tests,
  `test:browser` with zero skips and zero advisories of the contract kit, `test:e2e` with both
  shell kits, the production webview bundle under the webview CSP included, the web app's
  `check:build`, and the VS Code smoke test on the newest stable VS Code and the `engines.vscode`
  floor.
- `npm run test:vscode:docker` passes on the newest stable VS Code and the `engines.vscode` floor:
  edit, save, undo and VS Code's four default themes in a real VS Code
  ([shell](references/shell.md#the-vs-code-smoke-test)).
- The renderer's `meta.apiVersion` is the pinned `MODELER_API_VERSION`, the factories accept the
  1.2 options `freeArea`, `fitOnImport` and `undoRedoKeys`, and both mounts report
  `contentBounds()` (1.3), which the apps and Design IQ fit to.
- Neither app has chrome of its own: menu, palette skin, zoom, keys, problems, status, empty state
  and toasts come from the shell, and the menu content comes from the renderer.
- A VSIX packages (`npx vsce package --no-dependencies`) and `npm publish --dry-run` packs every
  library with `dist` only.
- `CLAUDE.md` describes the notation's packages, its DSL and anything the template did not have.

The contract and the shell document their API in their own READMEs ([api], [shell],
[shell API][shell-api], [implementation notes][notes]); this skill tells you what to build and
where it bites, and links there for every signature.

[api]: https://github.com/Miragon/modeler-suite/blob/main/packages/api/README.md
[shell]: https://github.com/Miragon/modeler-suite/blob/main/packages/shell/README.md
[shell-api]: https://github.com/Miragon/modeler-suite/blob/main/packages/shell/API.md
[notes]: https://github.com/Miragon/modeler-suite/blob/main/docs/shell/implementation-notes.md
[es]: https://github.com/Miragon/modeler-suite/tree/main/modelers/event-storming
[vc]: https://github.com/Miragon/modeler-suite/tree/main/modelers/value-chain
[tt]: https://github.com/Miragon/modeler-suite/tree/main/modelers/team-topologies
[cm]: https://github.com/Miragon/modeler-suite/tree/main/modelers/context-maps
[wardley]: https://github.com/Miragon/modeler-suite/tree/main/modelers/wardley-maps
