import { test } from "@playwright/test";
import { benchPlace } from "./boards.js";
import { WEBAPP_BUILD } from "./build.js";
import { serveWebapp, type Served } from "./serve.js";
import { REPOSITORY_GLOBAL, WEBAPP_PORT } from "./settings.js";

/**
 * The web app's production build. `?reset` opens the example, which in this build is the
 * generated repository, fitted and with nothing kept of an earlier load.
 */
let served: Served | undefined;
test.beforeAll(async () => {
  served = await serveWebapp(WEBAPP_BUILD, WEBAPP_PORT);
});
test.afterAll(async () => {
  await served?.close();
});

benchPlace({
  name: "webapp",
  async prepare(context, { board, files }) {
    await context.addInitScript(
      ([name, repository]) => {
        (window as unknown as Record<string, unknown>)[name] = repository;
      },
      [REPOSITORY_GLOBAL, { board, files }] as const,
    );
  },
  async open(page) {
    await page.goto(`http://127.0.0.1:${WEBAPP_PORT}/?reset`, { waitUntil: "commit" });
  },
});
