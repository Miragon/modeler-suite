import { defineConfig, devices } from "@playwright/test";

// Ports are overridable so parallel runs (several workspaces, all defaulting to the same ports with
// strictPort) don't collide. The defaults keep CI unchanged.
const WEBAPP_PORT = process.env.E2E_PORT ?? "5180";
const WEBAPP_URL = `http://localhost:${WEBAPP_PORT}`;
const WEBVIEW_PORT = process.env.E2E_WEBVIEW_PORT ?? "5190";
const WEBVIEW_URL = `http://localhost:${WEBVIEW_PORT}`;

const FOCUS_HAND_BACK_SPEC = "focus-hand-back.spec.ts";

/**
 * Two projects, one per host:
 *  - `webapp`: @miragon/team-topologies-webapp. Its dev server resolves @miragon/team-topologies-*
 *    via Vite source aliases (apps/webapp/vite.config.ts), so no package build is required.
 *    `cwd: '..'` runs the command from the repo root so the npm workspace resolves.
 *  - `vscode-webview`: the VS Code webview (apps/vscode/src/webview/main.ts) inside the modeler
 *    shell's VS Code stub, served by its own Vite test page (webview/), also from the sources.
 *
 * Both hosts run the focus hand-back cases in WebKit too (`webapp-webkit`, `vscode-webview-webkit`):
 * Safari, and vscode.dev in Safari, do not focus a button on a click, so there a control has to
 * hand the focus to the canvas without ever having held it.
 */
export default defineConfig({
  testDir: "./tests",
  // Platform-neutral snapshot path (no `-{platform}`/`-{projectName}` suffix) so a
  // single committed baseline is valid on both a macOS dev machine and Linux CI.
  snapshotPathTemplate: "{testDir}/__snapshots__/{testFileName}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Serialize on CI for determinism; omit locally so Playwright auto-picks worker count.
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "webapp",
      testIgnore: "**/vscode/**",
      use: { ...devices["Desktop Chrome"], baseURL: WEBAPP_URL },
    },
    {
      name: "vscode-webview",
      testMatch: "**/vscode/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: WEBVIEW_URL },
    },
    {
      name: "webapp-webkit",
      testMatch: `**/${FOCUS_HAND_BACK_SPEC}`,
      testIgnore: "**/vscode/**",
      use: { ...devices["Desktop Safari"], baseURL: WEBAPP_URL },
    },
    {
      name: "vscode-webview-webkit",
      testMatch: `**/vscode/${FOCUS_HAND_BACK_SPEC}`,
      use: { ...devices["Desktop Safari"], baseURL: WEBVIEW_URL },
    },
  ],
  webServer: [
    {
      command: `npm run dev:app -w apps/webapp -- --port ${WEBAPP_PORT} --strictPort`,
      cwd: "..",
      url: WEBAPP_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    {
      command: "npm run dev:webview",
      url: `${WEBVIEW_URL}/webview-test.html`,
      env: { E2E_WEBVIEW_PORT: WEBVIEW_PORT },
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
});
