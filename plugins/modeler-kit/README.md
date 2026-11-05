# Miragon Modeler Kit

A Claude Code plugin that helps you build a new Miragon modeler: a diagram editor for your own
notation that runs in the browser and in VS Code. Ask Claude to "build a modeler for my notation"
and its skill **`new-modeler`** guides you from an empty repository to a released web app and
VS Code extension, starting from a ready-to-run template.

## Install

```text
/plugin marketplace add Miragon/modeler-suite
/plugin install modeler-kit@modeler-suite
```

The skill loads when you ask Claude to build or check a modeler. Without the plugin, read
[`skills/new-modeler/SKILL.md`](skills/new-modeler/SKILL.md) directly.

## Learn more

- The template: [`skills/new-modeler/assets/template/`](skills/new-modeler/assets/template/)
- How the kit is kept current and tested: [CONTRIBUTING.md](CONTRIBUTING.md)
