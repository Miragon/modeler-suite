const { modelerDependencyCruiserConfig } = require("../../tooling/dependency-cruiser.cjs");

module.exports = modelerDependencyCruiserConfig(__dirname, {
  forbidden: [
    {
      name: "renderer-feature-encapsulation",
      comment:
        "Within the renderer, a feature folder may reach into another feature only through the shared " +
        "core (model/di-types, draw styles/palette-icons/lucide, theme) or that feature public index.ts. New runtime " +
        "coupling into a sibling feature internals is forbidden (type-only DI wiring is exempt).",
      severity: "error",
      from: { path: "^packages/renderer/src/([^/]+)/" },
      to: {
        path: "^packages/renderer/src/[^/]+/",
        dependencyTypesNot: ["type-only"],
        pathNot: [
          "^packages/renderer/src/$1/",
          "^packages/renderer/src/[^/]+/index\\.ts$",
          "^packages/renderer/src/model/di-types\\.ts$",
          "^packages/renderer/src/draw/(styles|palette-icons|lucide)\\.ts$",
          "^packages/renderer/src/theme/",
        ],
      },
    },
  ],
});
