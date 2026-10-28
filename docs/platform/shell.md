# Modeler shell

`@miragon/modeler-shell` is the chrome every modeler shares: menu, palette skin, zoom panel, problems, legend and inspector slots, the plumbing to a VS Code webview, the web-app chrome, and the modal dialog with the "Keyboard shortcuts…" dialog on it, which also opens without a mounted shell. One implementation for every modeler and every host, so the chrome looks and behaves the same everywhere. It has no runtime dependencies.

```sh
npm i --save-exact @miragon/modeler-shell
```

- [API](https://github.com/Miragon/modeler-suite/blob/main/packages/shell/API.md): every entry point, type and rule.
- [Implementation notes](/shell/implementation-notes): diagram-js services, VS Code quirks and why things are done the way they are.
- [Package README](https://github.com/Miragon/modeler-suite/tree/main/packages/shell#readme)
