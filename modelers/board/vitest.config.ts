import { defineConfig } from "vitest/config";

// One project so far: the DOM-free model runs in Node. The renderer's browser project (the
// contract's conformance kit in Chromium) joins with the renderer.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["packages/*/test/**/*.test.ts"],
          exclude: ["**/node_modules/**"],
        },
      },
    ],
  },
});
