import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Apart from the unit and browser projects: it needs a display, downloads VS Code, and two runs
// at once would write into the same VS Code cache.
export default defineConfig({
  // The board's published packages export their dist; the paths of the board's tsconfig take
  // them from their sources, so the smoke runs without a build of them.
  resolve: { tsconfigPaths: true },
  test: {
    name: "vscode",
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
  },
});
