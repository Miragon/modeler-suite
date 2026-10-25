import { defineConfig } from "vitest/config";

// The repository's own checks: the modeler-kit plugin, the release config, every modeler's
// boundaries, Dependabot's auto-merge workflow and the brand-lint config. The template under
// plugins/ carries test files of its own, which run in the repository the template starts, never
// here.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
