# Miragon modeler suite

[![CI](https://github.com/Miragon/modeler-suite/actions/workflows/ci.yml/badge.svg)](https://github.com/Miragon/modeler-suite/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/Miragon/modeler-suite)](LICENSE)

**Strategy and architecture diagrams as plain text, right next to your code.**

Six modelers for the notations teams use to think about their business and their systems:
Wardley Maps, Event Storming, Team Topologies, Context Maps, Value Chain and the C4 model. Each
one runs in the browser and in VS Code.

[Documentation](https://miragon.github.io/modeler-suite/) ·
[Extension pack](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.miragon-modeler-collection) ·
[Issues](https://github.com/Miragon/modeler-suite/issues)

![The web apps of Wardley Maps, Event Storming, Team Topologies, Context Maps and Value Chain open their built-in examples one after another](docs/assets/demo.gif)

## Why we built this

A Wardley Map on a whiteboard photo or a team topology in a slide deck goes stale the day after the
workshop. Nobody can review it, nobody can see what changed, and nobody finds it again.

So every modeler stores its diagram as a small text file. It lives in your repository, shows up as
a readable diff in a pull request and evolves with the code it describes. You edit it on a canvas,
in a text editor, or let your AI assistant write it.

## The modelers

| Modeler                                               | Files                                                 | Web app                                                                          | VS Code extension                                                                                                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Wardley Maps](modelers/wardley-maps/README.md)       | `.wmap`, `.owm` (OWM text DSL)                        | [wardley-maps.modeler.miragon.io](https://wardley-maps.modeler.miragon.io)       | [Marketplace](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.wardley-mapping-modeler) · [Open VSX](https://open-vsx.org/extension/miragon-gmbh/wardley-mapping-modeler) |
| [Event Storming](modelers/event-storming/README.md)   | `.storm` (line DSL)                                   | [event-storming.modeler.miragon.io](https://event-storming.modeler.miragon.io)   | [Marketplace](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.event-storming-modeler) · [Open VSX](https://open-vsx.org/extension/miragon-gmbh/event-storming-modeler)   |
| [Team Topologies](modelers/team-topologies/README.md) | `.tt`, `.ttm.json`, editable `*.tt.png`               | [team-topologies.modeler.miragon.io](https://team-topologies.modeler.miragon.io) | [Marketplace](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.team-topologies-modeler) · [Open VSX](https://open-vsx.org/extension/miragon-gmbh/team-topologies-modeler) |
| [Context Maps](modelers/context-maps/README.md)       | `.cm`, `.cm.json`, editable `*.cm.png`; `.cml` in/out | [context-maps.modeler.miragon.io](https://context-maps.modeler.miragon.io)       | [Marketplace](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.context-maps-modeler) · [Open VSX](https://open-vsx.org/extension/miragon-gmbh/context-maps-modeler)       |
| [Value Chain](modelers/value-chain/README.md)         | `.vc`, `.vc.json`                                     | no public deployment yet                                                         | [Marketplace](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.value-chain-modeler)                                                                                       |
| [C4 model](modelers/c4/README.md)                     | `.c4`, `.dsl` (Structurizr DSL)                       | [c4.modeler.miragon.io](https://c4.modeler.miragon.io)                           | [Marketplace](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.c4-modeler) · [Open VSX](https://open-vsx.org/extension/miragon-gmbh/c4-modeler)                           |

Each modeler's README covers its features, its file format and how to embed it in your own app
with its npm packages.

The C4 Modeler is compatible with Structurizr DSL: it opens a Structurizr `workspace.dsl` as it is
and keeps it a file Structurizr opens. Structurizr is a product of Structurizr Limited; this
project is not affiliated with or endorsed by Structurizr Limited.

### Try it in 30 seconds

> Open one of the web apps above and start from its built-in example. Or install the
> [Miragon Modeler Collection](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.miragon-modeler-collection)
> in VS Code and open any of the files above: the modeler opens as a custom editor.

## With your AI assistant

The Claude Code plugins teach Claude the methods and the file formats, so it can draft a map from
a strategic question or review a board with feedback notes in the file:

```text
/plugin marketplace add Miragon/modeler-suite
/plugin install wardley-maps-modeler@modeler-suite
/plugin install event-storming-modeler@modeler-suite
/plugin install team-topologies-modeler@modeler-suite
```

## Contributing

Found a bug or have an idea? Please [open an issue](https://github.com/Miragon/modeler-suite/issues/new).
We currently don't accept pull requests from outside the team. To run a modeler locally:

```sh
npm ci
npm run build:shared
npm run wardley-maps dev:webapp:plain  # http://127.0.0.1:5180
```

The repository layout, setup, tests and conventions are in [CONTRIBUTING.md](CONTRIBUTING.md).
Want to build a modeler for another notation? The `modeler-kit` plugin starts one from a runnable
template.

## Support

Questions, ideas or commercial support? Write to [info@miragon.io](mailto:info@miragon.io) or open
an [issue](https://github.com/Miragon/modeler-suite/issues).

## License

Distributed under the [MIT License](LICENSE).
