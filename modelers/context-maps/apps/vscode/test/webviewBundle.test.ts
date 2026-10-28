// @vitest-environment node
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, type BuildOptions } from "esbuild";
import { describe, expect, it } from "vitest";

const appDirectory = fileURLToPath(new URL("..", import.meta.url));

/** The webview bundle `vscode:prepublish` puts into the VSIX, built in memory. */
async function buildShippedWebviewBundle() {
  // A computed specifier: the config is plain JS without types, and esbuild needs Node, not Vite.
  const configUrl = pathToFileURL(join(appDirectory, "esbuild.config.mjs")).href;
  const { webviewOptions } = (await import(/* @vite-ignore */ configUrl)) as {
    webviewOptions(production: boolean): BuildOptions;
  };
  const result = await build({ ...webviewOptions(true), write: false, logLevel: "silent" });
  return result.outputFiles ?? [];
}

describe("the webview bundle in the VSIX", () => {
  it("carries the five Geist subsets of the PNG export as data: URLs, next to the font files of the stylesheet", async () => {
    const outputs = await buildShippedWebviewBundle();
    const script = outputs.find((output) => output.path.endsWith("webview.js"));
    const fontFiles = outputs.filter((output) => output.path.endsWith(".woff2"));

    expect(script).toBeDefined();
    expect(script!.text.match(/data:font\/woff2;base64,/g)).toHaveLength(5);
    // The page's own text still loads Geist from files, which the CSP's font-src allows.
    expect(fontFiles.length).toBeGreaterThan(5);
    expect(dirname(fontFiles[0]!.path)).toMatch(/fonts$/);
  }, 60_000);
});
