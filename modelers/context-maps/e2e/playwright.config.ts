import { defineConfig, devices } from "@playwright/test";

// Ports are overridable via E2E_PORT / E2E_WEBVIEW_PORT so parallel runs (e.g. several
// workspaces, all of which default to the same ports with strictPort) don't collide.
const WEBAPP_PORT = process.env.E2E_PORT ?? "5180";
const WEBAPP_URL = `http://localhost:${WEBAPP_PORT}`;
const WEBVIEW_PORT = process.env.E2E_WEBVIEW_PORT ?? "5190";
const WEBVIEW_URL = `http://localhost:${WEBVIEW_PORT}`;
// A regular expression, not "**/orca/**": a glob matches the absolute path, which may hold an
// "orca" folder of its own.
const ORCA_SPECS = /[\\/]tests[\\/]orca[\\/].*\.spec\.ts$/;

/**
 * Three projects, one per host and engine:
 *  - `chromium` and `webkit`: @miragon/context-maps-webapp. Its dev server resolves
 *    @miragon/context-maps-* via Vite source aliases (apps/webapp/vite.config.ts), so no package
 *    build is required. Canvas interactions (drag-connect etc.) behave differently enough across
 *    engines that both are worth covering. The shell's conformance kit runs in Chromium only: its
 *    tab-order checks need a browser whose Tab reaches buttons and links, which WebKit does not by
 *    default (Safari's "Press Tab to highlight each item"). `cwd: '..'` runs the command from the
 *    repo root so the npm workspace resolves.
 *  - `vscode-webview`: the VS Code webview (apps/vscode/src/webview/main.ts) inside the shell's
 *    VS Code stub, served by its own Vite test page (webview/), also from the package sources.
 *    VS Code's webviews are Chromium.
 */
export default defineConfig({
  testDir: "./tests",
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
      name: "chromium",
      testIgnore: ["**/vscode/**", ORCA_SPECS],
      use: { ...devices["Desktop Chrome"], baseURL: WEBAPP_URL },
    },
    {
      name: "webkit",
      testIgnore: ["**/vscode/**", "**/*shell-conformance.spec.ts", ORCA_SPECS],
      use: { ...devices["Desktop Safari"], baseURL: WEBAPP_URL },
    },
    {
      name: "orca-editor",
      testMatch: ORCA_SPECS,
      use: { ...devices["Desktop Chrome"], baseURL: WEBVIEW_URL },
    },
    {
      name: "vscode-webview",
      testMatch: "**/vscode/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: WEBVIEW_URL },
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
