const { modelerDependencyCruiserConfig } = require("../../tooling/dependency-cruiser.cjs");

const config = modelerDependencyCruiserConfig(__dirname, {
  forbidden: [
    {
      name: "document-half-no-canvas",
      comment:
        "The board's document half (store, host types, arm rules) runs without a canvas: " +
        "no React, no React Flow and nothing of the layers after it (the runtime, to which the " +
        "rest of arming/ and geometry.ts belong, the canvas and the contract).",
      severity: "error",
      from: { path: "^packages/renderer/src/(store/|host/|arming/(arm-rules|types)\\.ts)" },
      to: {
        path: [
          "node_modules/(react|react-dom|@xyflow)",
          "^packages/renderer/src/(canvas|nodes|edges|flow|gestures|parts|runtime|surface|collaborative)/",
          "^packages/renderer/src/arming/",
          "^packages/renderer/src/geometry\\.ts$",
        ],
        pathNot: "^packages/renderer/src/arming/(arm-rules|types)\\.ts$",
      },
    },
    {
      name: "schema-model-no-canvas-libraries",
      comment: "The schema model is the file format alone: no React, no React Flow and no Yjs.",
      severity: "error",
      from: { path: "^packages/schema-model/" },
      to: { path: "node_modules/(react|react-dom|@xyflow|yjs)" },
    },
    {
      name: "packages-no-other-modeler",
      comment:
        "The board knows no editor. One workspace depends on the other modelers of the suite, " +
        "apps/editors: no package of the board and no other app imports one of their packages, " +
        "by its name or by a relative path into its folder.",
      severity: "error",
      from: { path: "^(packages|apps)/", pathNot: "^apps/editors/" },
      // The second pattern is a sibling of modelers/board as the cruiser names it from here
      // (../wardley-maps/packages/...). What lies further up starts with ../../ and is not meant:
      // the root's node_modules and the shared packages.
      to: { path: ["@miragon/(?!board-|modeler-api|modeler-shell)", "^\\.\\./[^./]"] },
    },
    {
      name: "packages-no-apps",
      comment:
        "A package is what every host of a board shares: none imports an app workspace, or " +
        "apps/editors would bring the seven renderers in behind packages-no-other-modeler.",
      severity: "error",
      from: { path: "^packages/" },
      to: {
        path: [
          "^apps/",
          "board-(suite-editors|ide-editor|modeler)(/|$)",
          "@miragon/board-(webapp|e2e)",
        ],
      },
    },
    {
      name: "host-no-editor-libraries",
      comment:
        "The host package mounts whatever modeler of the contract a registry entry hands it and " +
        "shares no library with the board: no diagram-js, no React and no React Flow in its " +
        "sources, not as a type either.",
      severity: "error",
      from: { path: "^packages/host/src/" },
      to: { path: "node_modules/(diagram-js|react|react-dom|@xyflow)/" },
    },
    {
      name: "files-no-canvas-libraries",
      comment:
        "The files package is the port, the protocol and the path rules alone, and runs in an " +
        "extension host too: no React, no React Flow, no Yjs, and nothing of the board's " +
        "renderer or its host package.",
      severity: "error",
      from: { path: "^packages/files/" },
      to: {
        path: [
          "node_modules/(react|react-dom|@xyflow|yjs)",
          "@miragon/board-(renderer|host)",
          "^packages/(renderer|host)/",
        ],
      },
    },
    {
      name: "ide-editor-no-suite-editors",
      comment:
        "The board inside the shell is handed its editors. No source of apps/ide-editor imports " +
        "apps/editors, through which the seven renderers of the suite would come in; its tests " +
        "may take an editor from there.",
      severity: "error",
      from: { path: "^apps/ide-editor/src/" },
      to: { path: ["^apps/editors/", "board-suite-editors(/|$)"] },
    },
    {
      name: "vscode-host-no-page-code",
      comment:
        "The extension host is every source of apps/vscode outside src/webview and runs in Node, " +
        "where no page is: no React, no React Flow, no Yjs, no diagram-js and no DOM library, " +
        "not the board's renderer or its host package, none of the shell's entries for a page, " +
        "nothing of apps/ide-editor, and of apps/editors the suffix table alone. Only " +
        "src/webview is a page.",
      severity: "error",
      from: { path: "^apps/vscode/src/", pathNot: "^apps/vscode/src/webview/" },
      to: {
        path: [
          "node_modules/(react|react-dom|@xyflow|yjs|diagram-js|tiny-svg|min-dom|lucide-react|dompurify|markdown-it)/",
          "@miragon/board-(renderer|host)(/|$)",
          "^packages/(renderer|host)/",
          // The shell by the file an entry resolves to, and by the specifier where the shell
          // was not built. Its entries vscode/extension and core are the host's.
          "@miragon/modeler-shell/dist/(index|ide|diagram-js|export|vscode-webview|orca-webview|shell)\\.",
          "^@miragon/modeler-shell(/(ide|diagram-js|export|vscode/webview|orca/webview|shell\\.css))?$",
          "^apps/ide-editor/",
          "board-ide-editor(/|$)",
          "^apps/editors/(?!src/suffixes\\.ts$)",
          "board-suite-editors/(?!(src/)?suffixes(\\.ts)?$)",
          "board-suite-editors$",
        ],
      },
    },
  ],
});

// The web app's build is code-split, one chunk per notation, and its chunks import each other in
// circles: built output is no source, and neither are the extension's two bundles. Only the apps'
// own dist: a wider pattern would also hide the contract's dist, which
// dom-free-contract-types-only resolves to.
config.options.exclude = { path: "^apps/[^/]+/dist/" };

module.exports = config;
