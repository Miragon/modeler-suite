# Miragon Modeler Kit

A Claude Code plugin for building Miragon modelers. Its skill **`new-modeler`** takes a notation
from an empty repository to a released web app and VS Code extension on
[`@miragon/modeler-api`](https://github.com/Miragon/modeler-suite/tree/main/packages/api) and
[`@miragon/modeler-shell`](https://github.com/Miragon/modeler-suite/tree/main/packages/shell):
the repository layout, the contract and its conformance kit, the shell on the `web` and `ide`
hosts, the Miragon design system, exact pins, releases and Design IQ, plus a runnable template
([`skills/new-modeler/assets/template/`](skills/new-modeler/assets/template/)) and the script that
instantiates it.

## Install

```text
/plugin marketplace add Miragon/modeler-suite
/plugin install modeler-kit@modeler-suite
```

The same marketplace serves the modelers' own plugins (`wardley-maps-modeler`,
`event-storming-modeler`, `team-topologies-modeler`). The skill loads when you ask Claude to build
or check a modeler. Without the plugin, read [`skills/new-modeler/SKILL.md`](skills/new-modeler/SKILL.md)
directly.

## Keeping it current

A drift test of the suite
([`test/new-modeler-skill.test.ts`](https://github.com/Miragon/modeler-suite/blob/main/test/new-modeler-skill.test.ts),
`npm run test:plugin`, part of `npm test`) fails when the skill or the template falls behind the
packages: the template's `@miragon/modeler-api` and
`@miragon/modeler-shell` pins against the workspace versions (release-please rewrites them on every
release), every API name the skill mentions against the packages' exports, every link, the plugin
and marketplace manifests, and a type check of the template's TypeScript against the current
sources.

A second one
([`test/new-modeler-node-range.test.ts`](https://github.com/Miragon/modeler-suite/blob/main/test/new-modeler-node-range.test.ts))
keeps the template on the suite's Node range: its `engines`, the floor its CI installs, and every
third-party pin, whose own `engines.node` must accept both floors of the range. A pin may stay
behind the version the suite installs, but never run ahead of it.

A CI job of the suite (`template` in
[`ci.yml`](https://github.com/Miragon/modeler-suite/blob/main/.github/workflows/ci.yml), see
[CI and releases](https://github.com/Miragon/modeler-suite/blob/main/docs/ci-and-releases.md))
goes further: it creates a modeler from the template with the script of this skill, installs the
shared packages from `npm pack` of the branch instead of the registry, and runs the new modeler's
lint, tests, both conformance kits, both builds and the VSIX packaging. It runs whenever this
plugin, the shared packages or the CI itself change, a release pull request included, so a kit case
the template's harness fails shows up there and not when the next modeler starts. The label
`template-vscode-smoke` adds the VS Code smoke of that modeler to a pull request.

The plugin has no `version`, neither in [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json)
nor in its marketplace entry ([`.claude-plugin/marketplace.json`](https://github.com/Miragon/modeler-suite/blob/main/.claude-plugin/marketplace.json)),
and the drift test keeps it that way. Claude Code then versions it by the commit of this
directory, so every merged change reaches an installed copy on its next update
(`/plugin marketplace update modeler-suite` in a session,
`claude plugin update modeler-kit@modeler-suite` in the shell, or the marketplace's auto-update), the pins release-please rewrites in its release
commit included. A fixed version would hold every installed copy until someone changed it.

The suite's Dependabot keeps the template's other pins and its GitHub Actions current. Its group
pull requests update the suite and the template together; an npm major comes as one pull request per
dependency that moves it in both. The drift test fails when its entries miss a folder of the
template.
