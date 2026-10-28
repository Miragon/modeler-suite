import { defineConfig, devices } from "@playwright/test";

const WEBAPP_PORT = process.env.E2E_PORT ?? "5180";
const WEBAPP_URL = `http://localhost:${WEBAPP_PORT}`;
const WEBVIEW_PORT = process.env.E2E_WEBVIEW_PORT ?? "5190";
const WEBVIEW_URL = `http://localhost:${WEBVIEW_PORT}`;

const SHARE_SPEC = "webapp-share.spec.ts";
const FOCUS_HAND_BACK_SPEC = "webapp-focus-hand-back.spec.ts";

/**
 * Three projects:
 *  - `webapp`: @miragon/event-storming-webapp. Its dev server resolves @miragon/event-storming-*
 *    via Vite source aliases (apps/webapp/vite.config.ts), so no package build is required.
 *    `cwd: '..'` runs the command from the repo root so the npm workspace resolves.
 *  - `vscode-webview`: the VS Code webview (apps/vscode/src/webview/main.ts) inside the shell's
 *    VS Code stub, served by its own Vite test page (webview/), also from the package sources.
 *    VS Code's webviews are Chromium.
 *  - `webapp-webkit`: the web app's Share and focus hand-back specs in Safari's engine, on the
 *    `webapp` server. Share writes a ClipboardItem whose value is a promise inside the click,
 *    because Safari drops the user activation at the first `await`; and Safari gives a clicked
 *    button no focus, so a control has to hand the focus to the canvas without having held it.
 *    The shell's conformance kit stays in Chromium: its tab-order checks need a Tab that reaches
 *    buttons, which WebKit's does not by default.
 */
export default defineConfig({
  testDir: "./tests",
  snapshotPathTemplate: "{testDir}/{testFileName}-snapshots/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
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
      testMatch: [`**/${SHARE_SPEC}`, `**/${FOCUS_HAND_BACK_SPEC}`],
      use: { ...devices["Desktop Safari"], baseURL: WEBAPP_URL },
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
