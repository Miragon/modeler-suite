import { fileURLToPath } from "node:url";
import { defineConfig, defineProject } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { sourceAliases } from "./apps/editors/build/aliases.mjs";
import { cssBaseAliases } from "./apps/editors/build/css-base.mjs";
import { prebundle } from "./apps/editors/build/prebundle.mjs";
import { realInput } from "./test-support/real-input.ts";

// The other modelers from their sources, so that none of them is built first, and their shared
// sheet base emptied inside each renderer sheet: a page loads it once (board-suite-editors/base).
const alias = [...cssBaseAliases, ...sourceAliases];

// The extension host imports the ambient `vscode` module, which exists only inside the editor.
// The unit project reads a mock in its place, the same module a test imports by its path, so a
// listener the host registers and an event a test fires share one state.
const vscodeMock = {
  find: /^vscode$/,
  replacement: fileURLToPath(new URL("./apps/vscode/test/__mocks__/vscode.ts", import.meta.url)),
};

/**
 * The browser project, exported so that a config for a machine where Chromium must keep its
 * sandbox can spread it and replace the provider alone (the guide's Commands section): the two
 * then run the same files with the same aliases, pre-bundle list, window and commands.
 */
export const browserProject = defineProject({
  resolve: { alias },
  // Pre-bundled up front: discovered during the run, Vite would reload the page mid-suite.
  optimizeDeps: {
    include: [...prebundle, "@miragon/modeler-api/conformance"],
  },
  test: {
    name: "browser",
    include: [
      "packages/renderer/test/browser/**/*.test.{ts,tsx}",
      "packages/host/test/browser/**/*.test.{ts,tsx}",
      "apps/*/test/browser/**/*.test.{ts,tsx}",
    ],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      // A desktop window: Vitest's own default is 414 x 896, where only the narrow branch
      // of the sheet's breakpoint (760 px) is laid out. styles.browser.test.ts narrows the
      // frame for that one
      viewport: { width: 1280, height: 800 },
      instances: [{ browser: "chromium" }],
      commands: { realInput },
    },
  },
});

// Two projects so the default `npm test` stays fast and node-only, while the canvas runs in real
// Chromium via `npm run test:browser`: React Flow measures its nodes, which jsdom cannot.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: [...alias, vscodeMock] },
        test: {
          name: "unit",
          environment: "node",
          include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
          exclude: ["packages/*/test/browser/**", "apps/*/test/browser/**", "**/node_modules/**"],
        },
      },
      browserProject,
    ],
  },
});
