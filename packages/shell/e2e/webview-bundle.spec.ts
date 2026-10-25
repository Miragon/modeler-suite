import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import type { StubWindow } from "../src/testing-vscode-stub.js";
import { openWebviewBundle } from "../src/testing-webview-bundle.js";
import { demoStubScript } from "./demo-webview.js";

/*
 * openWebviewBundle in Chromium, with a bundle of its own: the stub sits ahead of the policy, as
 * VS Code's own API script does, so it records from the first stylesheet on, and the bundle still
 * runs under the policy and with the host page's body classes.
 */

type BundleWindow = StubWindow & {
  __bundle?: { body: string; stub: string; api: string };
};

const BUNDLE = `
window.__bundle = {
  body: document.body.className,
  stub: typeof window.__modelerShellVsCodeStub,
  api: typeof window.acquireVsCodeApi,
};
try { new Function("return 1")(); } catch {}
`;

test("openWebviewBundle records from the first stylesheet on, under the policy, with the body classes", async ({
  page,
}, testInfo) => {
  const dist = testInfo.outputPath("dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, "webview.css"), "body { margin: 0; }");
  writeFileSync(join(dist, "webview.js"), BUNDLE);
  await openWebviewBundle(page, {
    dist,
    title: "openWebviewBundle",
    requested: { theme: "dark" },
    themes: ["light"],
    reduceMotion: true,
    styles: ["missing.css", "webview.css"],
    stubScript: demoStubScript(),
  });
  expect(await page.evaluate(() => (window as BundleWindow).__bundle)).toEqual({
    body: "vscode-dark vscode-reduce-motion",
    stub: "object",
    api: "function",
  });
  const recorded = await page.evaluate(() => {
    const stub = (window as BundleWindow).__modelerShellVsCodeStub!;
    return {
      errors: [...stub.errors()],
      violations: stub
        .cspViolations()
        .map(({ directive, blockedURI }) => ({ directive, blockedURI })),
    };
  });
  expect(recorded).toEqual({
    errors: ["<link> failed to load https://webview.test/missing.css"],
    violations: [{ directive: "script-src", blockedURI: "eval" }],
  });
});
