# __DISPLAY_NAME__ Modeler

View and edit __DISPLAY_NAME__ diagrams as plain-text `.__EXT__` files: a web app, a VS Code
extension and an Orca plugin on one diagram-js renderer, part of the Miragon modeler family.

| Package                                                       | Purpose                                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| [`@miragon/__NOTATION__-schema-model`](packages/schema-model) | the data model, validation, the empty document (DOM-free)             |
| [`@miragon/__NOTATION__-dsl`](packages/dsl)                   | `.__EXT__` text ↔ model, lossless round trip (DOM-free)               |
| [`@miragon/__NOTATION__-renderer`](packages/renderer)         | viewer and modeler on diagram-js, implementing `@miragon/modeler-api` |
| [`apps/webapp`](apps/webapp)                                  | the web app, on `@miragon/modeler-shell`                              |
| [`apps/ide-editor`](apps/ide-editor)                          | the editor the VS Code extension and the Orca plugin both mount       |
| [`apps/vscode`](apps/vscode)                                  | the VS Code custom editor for `.__EXT__`                              |
| [`apps/orca`](apps/orca)                                      | the Orca custom editor for `.__EXT__`                                 |

## Development

Requires Node `^22.22.2 || >=24.15.0` and npm. CI runs the floor, Node 22.22.2.

```sh
npm ci
npm run build          # the packages (the tests resolve them from dist)
npm test               # unit tests
npm run test:browser   # the renderer in Chromium, with the modeler-api conformance kit
npm run test:e2e       # Playwright: web app, VS Code webview and Orca editor, with the shell kit
npm run test:vscode:docker   # the extension in a real VS Code, in Docker (no window on the host)
npm run test:orca:docker     # the plugin in a real Orca, in Docker (no window on the host)
npm run lint           # ESLint and every tsconfig
npm run dev:webapp     # the web app through Portless, at a named .localhost URL
npm run dev:webapp:plain     # the web app on plain Vite, http://127.0.0.1:5180
```

`npm run dev:webapp` (and `npm run dev`) runs [Portless](https://portless.sh), which needs Node
24.15.0 or later; on Node 22, use `npm run dev:webapp:plain`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for commits, releases and the checks CI runs.

## License

MIT
