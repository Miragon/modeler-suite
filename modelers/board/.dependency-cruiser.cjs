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
      to: { path: ["^apps/", "board-suite-editors", "@miragon/board-(webapp|e2e)"] },
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
  ],
});

// The web app's build is code-split, one chunk per notation, and its chunks import each other in
// circles: built output is no source. Only the apps' own dist: a wider pattern would also hide
// the contract's dist, which dom-free-contract-types-only resolves to.
config.options.exclude = { path: "^apps/[^/]+/dist/" };

module.exports = config;
