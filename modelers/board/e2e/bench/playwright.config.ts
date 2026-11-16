import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { chromiumSandbox, OUT, WINDOW } from "./settings.js";

/**
 * The bench: the board with many models in Chromium, measured and never asserted against a
 * budget. It is no part of `npm run board test:e2e` and of no job of CI: `npm run board bench`
 * runs it, one place after the other and one board after the other, on a machine that does
 * nothing else. `settings.ts` names the variables a run takes.
 *
 * Two places, each built for production by the run itself (`build.ts`):
 *  - `webapp`: apps/webapp as Vite builds it, with the generated repository in the place of the
 *    example folder.
 *  - `webview`: the extension's webview bundle as the VSIX ships it, behind the document and the
 *    policy the extension writes, with a stand-in for the extension in the page.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "*.bench.ts",
  outputDir: join(OUT, "playwright"),
  globalSetup: "./build.ts",
  globalTeardown: "./summary.ts",
  // one run at a time: a second one would take the first one's processor time
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // a board is measured for as long as its runs take
  timeout: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    viewport: WINDOW,
    launchOptions: { chromiumSandbox: chromiumSandbox() },
  },
  projects: [
    { name: "webapp", testMatch: "webapp.bench.ts" },
    { name: "webview", testMatch: "webview.bench.ts" },
  ],
});
