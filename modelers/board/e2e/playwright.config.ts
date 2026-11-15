import { defineConfig, devices } from "@playwright/test";

// The port is overridable via E2E_PORT so parallel runs (several workspaces) don't collide.
const WEBAPP_PORT = process.env.E2E_PORT ?? "5184";
const WEBAPP_URL = `http://localhost:${WEBAPP_PORT}`;

/**
 * One project so far:
 *  - `webapp`: apps/webapp on its dev server, which bundles every package of the suite from
 *    source. `cwd: '..'` runs the command from the modeler's folder so the npm workspace resolves.
 * The VS Code webview gets its project, `vscode-webview` on port 5194, with the extension.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Spread instead of `workers: undefined`: exactOptionalPropertyTypes forbids the explicit undefined.
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "webapp",
      testMatch: "**/webapp/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: WEBAPP_URL },
    },
  ],
  webServer: [
    {
      command: `npm run dev -w apps/webapp -- --port ${WEBAPP_PORT} --strictPort`,
      cwd: "..",
      url: WEBAPP_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
});
