import { defineConfig, devices } from "@playwright/test";

const DEMO_PORT = 5181;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${DEMO_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `vite --config demo/vite.config.ts --host 127.0.0.1 --port ${DEMO_PORT} --strictPort`,
    url: `http://127.0.0.1:${DEMO_PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
