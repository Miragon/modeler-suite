import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: [
            "src/core/**/*.test.ts",
            "src/testing/vscode-electron/**/*.test.ts",
            "test/**/*.test.ts",
          ],
        },
      },
      {
        test: {
          name: "dom",
          environment: "happy-dom",
          include: [
            "src/dom/**/*.test.ts",
            "src/diagram-js/**/*.test.ts",
            "src/vscode/**/*.test.ts",
            "src/testing/**/*.test.ts",
          ],
          exclude: [...configDefaults.exclude, "src/testing/vscode-electron/**"],
        },
      },
      {
        // happy-dom neither loads an SVG as an image nor draws on a canvas, and the font loading
        // the PNG export works around differs between Chromium and WebKit.
        test: {
          name: "browser",
          include: ["src/export/**/*.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }, { browser: "webkit" }],
          },
        },
      },
    ],
  },
});
