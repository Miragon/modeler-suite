import { defineConfig, devices } from '@playwright/test';

const WEBAPP_PORT = process.env.E2E_PORT ?? '5180';
const WEBVIEW_PORT = process.env.E2E_WEBVIEW_PORT ?? '5190';

// A regular expression, not "**/orca/**": a glob matches the absolute path, which may hold an
// "orca" folder of its own.
const ORCA_SPECS = /[\\/]tests[\\/]orca[\\/].*\.spec\.ts$/;

/**
 * One project per host: `webapp` (the web app on the `web` host), `vscode-webview` (the VS Code
 * webview inside the shell's VS Code stub, the `ide` host) and `orca-editor` (the Orca editor inside
 * the shell's Orca stub, webview/orca-test.html on the webview's server). Both dev servers resolve
 * the workspace packages from source, so no build is needed; the shell kit's `csp` case builds
 * apps/vscode and apps/orca itself. Other ports: E2E_PORT, E2E_WEBVIEW_PORT.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: { trace: 'on-first-retry' },
  projects: [
    {
      name: 'webapp',
      testIgnore: ['**/vscode/**', ORCA_SPECS],
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${WEBAPP_PORT}` },
    },
    {
      name: 'vscode-webview',
      testMatch: '**/vscode/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${WEBVIEW_PORT}` },
    },
    {
      name: 'orca-editor',
      testMatch: ORCA_SPECS,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${WEBVIEW_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npm run dev:app -w apps/webapp -- --port ${WEBAPP_PORT} --strictPort`,
      cwd: '..',
      url: `http://localhost:${WEBAPP_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:webview',
      url: `http://localhost:${WEBVIEW_PORT}/webview-test.html`,
      env: { E2E_WEBVIEW_PORT: WEBVIEW_PORT },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
