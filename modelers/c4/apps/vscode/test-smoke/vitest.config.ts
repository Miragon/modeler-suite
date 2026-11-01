import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Apart from the unit and browser projects: it needs a display, downloads VS Code, and two runs
// at once would write into the same VS Code cache. CI runs it after building only the shared
// packages, so the modeler's own packages come from source.
export default defineConfig({
  resolve: {
    alias: {
      "@miragon/c4-schema-model": fileURLToPath(
        new URL("../../../packages/schema-model/src/index.ts", import.meta.url),
      ),
      "@miragon/c4-dsl": fileURLToPath(
        new URL("../../../packages/dsl/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    name: "vscode",
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
  },
});
