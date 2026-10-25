import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      core: "src/core.ts",
      "diagram-js": "src/diagram-js.ts",
      "vscode-extension": "src/vscode-extension.ts",
      "vscode-webview": "src/vscode-webview.ts",
      testing: "src/testing.ts",
      "testing-vscode-stub": "src/testing-vscode-stub.ts",
      "testing-vscode-electron": "src/testing-vscode-electron.ts",
      "testing-webview-bundle": "src/testing-webview-bundle.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    // openWebviewBundle finds the stub's script next to itself through import.meta.url, in CJS too
    shims: true,
    // the builds below run in parallel; cleaning their output here would race them
    clean: ["**/*", "!shell.css", "!vscode-docker.js*", "!testing-vscode-stub-script.global.js*"],
  },
  {
    entry: { shell: "src/shell.css" },
    clean: false,
  },
  {
    // the VS Code stub as one classic script, which a page under the webview CSP loads by its nonce
    entry: { "testing-vscode-stub-script": "src/testing-vscode-stub-script.ts" },
    format: ["iife"],
    platform: "browser",
    target: "es2022",
    sourcemap: true,
    clean: false,
  },
  {
    // the bin: one self-contained ESM file, its shebang kept by esbuild
    entry: { "vscode-docker": "src/testing/vscode-electron/docker-cli.ts" },
    format: ["esm"],
    platform: "node",
    sourcemap: true,
    clean: false,
  },
]);
