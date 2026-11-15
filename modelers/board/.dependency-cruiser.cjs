const { modelerDependencyCruiserConfig } = require("../../tooling/dependency-cruiser.cjs");

module.exports = modelerDependencyCruiserConfig(__dirname, {
  forbidden: [
    {
      name: "document-half-no-canvas",
      comment:
        "The board's document half (store, host types, arm rules) runs without a canvas: " +
        "no React, no React Flow and nothing of the canvas side.",
      severity: "error",
      from: { path: "^packages/renderer/src/(store/|host/|arming/(arm-rules|types)\\.ts)" },
      to: {
        path: [
          "node_modules/(react|react-dom|@xyflow)",
          "^packages/renderer/src/(canvas|nodes|edges|flow|gestures|parts|runtime|surface|collaborative)/",
        ],
      },
    },
    {
      name: "schema-model-no-canvas-libraries",
      comment: "The schema model is the file format alone: no React, no React Flow and no Yjs.",
      severity: "error",
      from: { path: "^packages/schema-model/" },
      to: { path: "node_modules/(react|react-dom|@xyflow|yjs)" },
    },
  ],
});
