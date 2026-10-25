# Contributing to the Context Maps Modeler

Thanks for helping improve the Context Maps Modeler. It lives in `modelers/context-maps` of the
Miragon modeler suite: setup, the scripts, the pre-commit hook, the commit and pull-request
conventions and how to report an issue are in the suite's [`CONTRIBUTING.md`](../../CONTRIBUTING.md),
CI and releases in [docs/ci-and-releases.md](../../docs/ci-and-releases.md). This file adds what is
special to this modeler. Agent-oriented notes live in [`CLAUDE.md`](CLAUDE.md).

## Inner loop

From the repository root (or with `npm run <script>` inside `modelers/context-maps`):

```bash
npm run build:shared           # once, and after changing packages/api or packages/shell
npm run context-maps test      # vitest run (unit; the packages come from source)
npm run context-maps lint      # eslint . + type-check (what the pre-commit hook runs for this modeler)
npm run context-maps build     # builds packages/* (only needed to publish the libs)
```

Useful extras: `npm run context-maps dev:webapp`, `npm run context-maps dev:vscode`,
`npm run context-maps depcruise` (module-graph check), `npm run context-maps format` (Prettier).

### Named local URL via Portless

`npm run context-maps dev:webapp` (and `npm run context-maps dev`) serves the webapp through
[Portless](https://portless.sh) at a stable, named `.localhost` URL instead of a Vite port
(needs **Node ≥ 24.15**). Config lives in [`apps/webapp/portless.json`](apps/webapp/portless.json)
(`{ "name": "context-maps-modeler", "script": "dev:app" }`): `dev:webapp` runs `portless`, which
reads that config and starts the real Vite server (the `dev:app` script) behind the proxy.
`dev:app` binds `--host 127.0.0.1` (Portless can't proxy the IPv6 `::1` that `localhost` resolves
to on macOS) and `--port ${PORT}` (the ephemeral port Portless injects), and `vite.config.ts` sets
`allowedHosts: ['.localhost']` so Vite accepts the proxied Host header.

The URL is `http://<worktree>.context-maps-modeler.localhost:8080` in a linked worktree and
`http://context-maps-modeler.localhost:8080` in the main checkout. No setup beyond `npm ci` is
needed: `dev:webapp` sets `PORTLESS_HTTPS=0 PORTLESS_PORT=8080`, so Portless serves plain **HTTP on
the non-privileged port 8080** and auto-starts its proxy on first run: **no `sudo`, no CA trust,
no `portless service install`**. That is what lets Conductor's non-TTY Run button start the webapp
unattended. (Portless's _default_ is an HTTPS daemon on privileged port 443, which would need
`sudo`; this modeler deliberately avoids that.)

Prefer a plain Vite server with no proxy? `npm run context-maps dev:webapp:plain` runs Vite
directly on `:5181` and needs none of the above.

## Browser & e2e tests

`npm run context-maps test:browser` (Vitest browser mode) runs the renderer's integration tests and
the `@miragon/modeler-api` conformance kit in Chromium. `npm run context-maps test:e2e` (Playwright,
in `e2e/`) has three projects:

| Project          | What                                                                  | Server, port                              |
| ---------------- | --------------------------------------------------------------------- | ----------------------------------------- |
| `chromium`       | the web app, with the shell's kit on the web host                     | `apps/webapp` dev server, `E2E_PORT` 5180 |
| `webkit`         | the web app in Safari's engine (without the kit, see below)           | the same                                  |
| `vscode-webview` | the VS Code webview in the shell's VS Code stub, with the shell's kit | `e2e/webview/`, `E2E_WEBVIEW_PORT` 5190   |

Run one project with `npm run context-maps test:e2e -- --project=vscode-webview`; set both ports
when another checkout already uses the defaults
(`E2E_PORT=6201 E2E_WEBVIEW_PORT=6211 npm run context-maps test:e2e`). In the `vscode-webview`
project the kit's `csp` case builds the production webview bundle and walks it behind the real
webview CSP. The shell's kit skips WebKit: its tab-order checks need a browser whose Tab reaches
buttons and links, which WebKit does not do by default. After `npm run context-maps build:webapp`,
`npm run check:build -w modelers/context-maps/apps/webapp` checks that the production `index.html`
carries the mode markup and the bundle keeps the shell's Lucide licence comment. Locally, run
`npx playwright install chromium webkit` once.

## VS Code smoke test

`npm run context-maps test:vscode` (Vitest project `vscode`, not part of `npm test`) checks what
only a real VS Code shows, with the shell's driver `@miragon/modeler-shell/testing/vscode-electron`;
how it works for every modeler, locally and in Docker, is in the suite's
[`CONTRIBUTING.md`](../../CONTRIBUTING.md#tests). It packs the extension as the release does
(`vsce package --no-dependencies`, which runs `vscode:prepublish`), unpacks the VSIX outside the
repository and starts VS Code with it on a throwaway profile. There it opens
`apps/vscode/test-smoke/fixtures/ordering.cm` in the custom editor, creates a context through the
palette's keyboard path and saves: the file has to parse (`parseDocumentText`), hold one more
context and be canonical JSON. Then it undoes (canvas and file are the fixture again) and switches
through VS Code's four default themes, with one screenshot per theme in `test-results/vscode-smoke/`
(gitignored). A run takes about 5 s once VS Code is downloaded. No build first: the test packs the
extension itself.

```bash
npm run context-maps test:vscode:docker                                 # in Docker, no window: the local way
npm run context-maps test:vscode:docker -- --env VSCODE_VERSION=1.96.0  # here the engines.vscode floor
npm run context-maps test:vscode:docker -- --env VSCODE_SMOKE_KEEP=1    # brings VS Code's logs back
npm run context-maps test:vscode                                        # on the host, with a window
```

Packing in your checkout (`test:vscode` on the host) rebuilds `apps/vscode/dist` in production
mode, so run `npm run context-maps build:vscode` (or `dev:vscode`) afterwards for a debug build; the
Docker run packs its own copy. The VSIX is unpacked with `unzip` (macOS and Ubuntu have it).
`VSCODE_SMOKE_VSIX` names a packed VSIX to test instead (a path relative to the repository root
works too); the release smokes the VSIX it is about to upload that way.

The test retries nothing. The shell's driver (since 0.3.2) reads the saved file only after the
editor tab has turned clean, which VS Code does once its write has resolved, and only when two reads
100 ms apart agree; a text the parser rejects is read again until it has stayed the same for 1 s. A
broken save therefore fails with what went wrong ("Meta+s wrote nothing to disk", "the editor is
still dirty after the save", "the saved text does not parse: …"; `Control+s` on Linux), and an
extension that saves an empty file fails with "the extension saved an empty file". The driver's
failures are a soft assertion: the test's own checks of the saved map run after them, so a failure
in another step, such as a theme that never switched, cannot hide a broken save. A theme switch VS
Code did not pick up needs no retry here either: the driver (since 0.4.1) writes the setting again,
then detours through another theme and back, all within one timeout, and only then fails, naming
the theme requested and the one VS Code shows.

## Design tokens

The design system's files in `packages/renderer/src/theme/` (`cd-tokens.generated.css`,
`cd-tokens.generated.json`, `cd-canvas.css`) are copied unchanged from the
`miragon-brand:modeler-tool-design` skill's `assets/`. To update them, copy the new release's files
over the old ones, then update the hashes and the release in
`packages/renderer/test/theme.sync.test.ts`, `MIRAGON` in `theme/palette.ts` where a value changed,
and run `npm run context-maps test`. Never edit the files by hand, and keep Prettier away from them
(the suite's `.prettierignore` lists them).

## Monorepo map & the DOM boundary (P1)

| Package                              | Purpose                                                         | DOM      |
| ------------------------------------ | --------------------------------------------------------------- | -------- |
| `@miragon/context-maps-schema-model` | Types, notation spec, Zod validation, serialization             | DOM-free |
| `@miragon/context-maps-cml`          | Context Mapper CML parser and serializer                        | DOM-free |
| `@miragon/context-maps-renderer`     | diagram-js bootstrap, renderer, viewer, import/export, contract | DOM      |
| `apps/webapp`                        | Vite demo editor on the modeler shell                           | DOM      |
| `apps/vscode`                        | VS Code custom editors for `.cm`/`.cm.json` and `*.cm.png`      | DOM      |

**P1, the DOM boundary:** the DOM-free packages (`schema-model`, `cml`) must **never** import
`diagram-js`/DOM libraries (`tiny-svg`, `min-dom`) or use the DOM (`window`/`document`). This is
enforced twice, by ESLint (`no-restricted-imports`/`no-restricted-globals`) **and** by
dependency-cruiser, so a violating import fails `npm run context-maps lint` and
`npm run context-maps depcruise`. The same two checks keep `@miragon/modeler-shell` out of every
package (only the apps mount the chrome) and let the DOM-free packages take only types from
`@miragon/modeler-api`.

Also keep JSON serialization deterministic.

## Pull requests

- Make sure the local gates are green: `npm run context-maps lint`, `npm run context-maps test`,
  `npm run context-maps depcruise`, `npm run context-maps build`.
- Commit scope `context-maps`, e.g. `feat(context-maps): add an OHS/PL integration-role decorator`,
  `fix(context-maps): keep colours on the migration round-trip`.
