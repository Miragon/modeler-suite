import { test } from "@playwright/test";
import { benchPlace } from "./boards.js";
import { WEBVIEW_BUILD } from "./build.js";
import { installExtension } from "./extension-stand-in.js";
import { serveWebview, type Served } from "./serve.js";
import { WEBVIEW_PORT } from "./settings.js";

/**
 * The extension's webview bundle as the VSIX ships it, under the document and the policy the
 * extension writes, with a stand-in for the extension in the page.
 */
let served: Served | undefined;
test.beforeAll(async () => {
  served = await serveWebview(WEBVIEW_BUILD, WEBVIEW_PORT);
});
test.afterAll(async () => {
  await served?.close();
});

benchPlace({
  name: "webview",
  async prepare(context, { board, files }) {
    await context.addInitScript(installExtension, { board, files });
  },
  async open(page) {
    await page.goto(`http://127.0.0.1:${WEBVIEW_PORT}/`, { waitUntil: "commit" });
  },
});
