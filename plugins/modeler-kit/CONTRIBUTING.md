# Contributing to the Modeler Kit

`skills/new-modeler/` holds the skill (`SKILL.md`, `references/`), the template a new modeler starts
from (`assets/template/`, placeholders `__NOTATION__`, `__DISPLAY_NAME__`, `__EXT__`, `__REPO__`)
and the script that fills them (`scripts/new-modeler.mjs`). The folder is no release-please
component, so a change releases nothing whatever its type; use the scope `plugin`.

## No version

Neither `.claude-plugin/plugin.json` nor the marketplace entry sets `version`. Claude Code then
versions the plugin by the commit of its directory, so every merged change, including the pins
release-please rewrites, reaches installed copies on their next update. `claude plugin validate .`
warns about the missing version; that is intended.

## Pins

- The template's `@miragon/modeler-api` and `@miragon/modeler-shell` pins follow the releases: the
  shared packages' `extra-files` in the release configuration rewrite them. A new pin needs a new
  entry there.
- Third-party pins and actions move with Dependabot, whose suite entries also list the template's
  folders, so one pull request updates suite and template together. An npm major comes as one
  pull request per dependency and is never auto-merged. Dependabot never touches the `@miragon/*`
  pins and cannot check peer ranges in the template (its placeholder names are not valid package
  names).

## Drift tests

`npm run test:plugin` (part of `npm test`) runs two of them:

- `test/new-modeler-skill.test.ts` fails when the template's pins drift from the workspace or pin
  loosely, a placeholder is undocumented or unfilled, a plugin manifest or skill frontmatter is
  invalid, a link does not resolve, the skill names an identifier the packages do not export, the
  template does not type-check against the packages' current sources, the Dependabot entries or
  `CODEOWNERS` miss a template folder, or the template's CI gate (`ci-ok`, the reusable VS Code
  smoke, smoke before publish) is incomplete.
- `test/new-modeler-node-range.test.ts` fails when the template's `engines.node`, setup action,
  README or CLAUDE.md drift from the suite's Node range, or a third-party pin rejects a floor of it.
  `ovsx` and `portless` are listed exceptions.

## The template in CI

The CI job `template` packs `packages/api` and `packages/shell` from the branch, creates a modeler
from the template, installs the packs and runs its lint, depcruise, build, tests, both kits, both
app builds and the VSIX packaging. To reproduce it:

```sh
npm run build:shared
node .github/scripts/template-instance.mjs <empty folder>
```

then run the checks in that folder. A plain copy with `npm install` tests the last release, not
your change. The label `template-vscode-smoke` adds the VS Code smoke to a pull request; see
[docs/ci-and-releases.md](../../docs/ci-and-releases.md).
