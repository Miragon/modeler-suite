import { defineConfig, devices } from "@playwright/test";

// Ports are overridable so parallel runs (several worktrees, all defaulting to the same ports with
// strictPort) don't collide. The defaults keep CI unchanged.
const WEBAPP_PORT = process.env.E2E_PORT ?? "5182";
const WEBAPP_URL = `http://localhost:${WEBAPP_PORT}`;
const WEBVIEW_PORT = process.env.E2E_WEBVIEW_PORT ?? "5192";
const WEBVIEW_URL = `http://localhost:${WEBVIEW_PORT}`;

const SHARE_SPEC = "webapp-share.spec.ts";
const FOCUS_HAND_BACK_SPEC = "webapp-focus-hand-back.spec.ts";

/**
 * Three projects:
 *  - `webapp`: the web app on the `web` host. Its dev server resolves the workspace packages from
 *    source (apps/webapp/vite.config.ts), so no build is needed; `cwd: ".."` runs the command from
 *    the modeler's folder so the npm workspace resolves.
 *  - `vscode-webview`: the VS Code webview (apps/vscode/src/webview/main.ts) inside the shell's
 *    VS Code stub, the `ide` host, served by its own Vite test page (webview/), also from the
 *    sources; the shell kit's `csp` case builds apps/vscode for production itself. VS Code's
 *    webviews are Chromium.
 *  - `webapp-webkit`: the web app's Share and focus hand-back specs in Safari's engine, on the
 *    `webapp` server. Share writes a ClipboardItem whose value is a promise inside the click,
 *    because Safari drops the user activation at the first `await`; and Safari gives a clicked
 *    button no focus, so a control has to hand the focus to the canvas without having held it.
 *    The shell's conformance kit stays in Chromium: its tab-order checks need a Tab that reaches
 *    buttons, which WebKit's does not by default.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: { trace: "on-first-retry" },
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
      timeout: 120_000,
    },
    {
      command: "npm run dev:webview",
      url: `${WEBVIEW_URL}/webview-test.html`,
      env: { E2E_WEBVIEW_PORT: WEBVIEW_PORT },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
