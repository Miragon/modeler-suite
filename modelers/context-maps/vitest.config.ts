import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { fileURLToPath, URL } from "node:url";

// The packages are consumed from SOURCE (mirrors the tsconfig paths / app aliases) so no project
// needs a prior build. Three projects: `unit` keeps the default `npm test` fast and DOM-light; the
// renderer browser-integration layer runs opt-in in real Chromium via `npm run test:browser` (jsdom
// can't provide SVGElement.getBBox() / getComputedTextLength(), which the renderer relies on); and
// the packaged extension runs opt-in in a real VS Code via `npm run test:vscode`.
const alias = {
  "@miragon/context-maps-renderer": fileURLToPath(
    new URL("./packages/renderer/src/index.ts", import.meta.url),
  ),
  "@miragon/context-maps-schema-model": fileURLToPath(
    new URL("./packages/schema-model/src/index.ts", import.meta.url),
  ),
  "@miragon/context-maps-cml": fileURLToPath(
    new URL("./packages/cml/src/index.ts", import.meta.url),
  ),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          globals: true,
          environment: "jsdom",
          include: [
            "packages/*/src/**/*.{test,spec}.ts",
            "packages/*/test/**/*.{test,spec}.ts",
            "apps/*/src/**/*.{test,spec}.ts",
            "apps/*/test/**/*.{test,spec}.ts",
          ],
          exclude: ["packages/renderer/test/browser/**", "**/node_modules/**", "**/dist/**"],
          // The VS Code host imports the ambient `vscode` runtime, which only exists inside the
          // editor. Point it at a thin in-repo mock so the host logic is unit-testable.
          alias: {
            vscode: fileURLToPath(
              new URL("./apps/vscode/test/__mocks__/vscode.ts", import.meta.url),
            ),
          },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "browser",
          include: ["packages/renderer/test/browser/**/*.{test,spec}.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
      // Opt-in via `npm run test:vscode`: packs the extension and drives a real VS Code, which
      // needs a display and downloads VS Code on the first run.
      {
        resolve: { alias },
        test: {
          name: "vscode",
          environment: "node",
          include: ["apps/vscode/test-smoke/**/*.test.ts"],
          fileParallelism: false,
        },
      },
      {
        // The Orca plugin in a real Orca (`npm run test:orca`, on Linux under xvfb-run, or
        // `test:orca:docker`): it needs a display and the extracted Orca in ORCA_APP.
        test: {
          name: "orca",
          environment: "node",
          include: ["apps/orca/test-smoke/**/*.test.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
