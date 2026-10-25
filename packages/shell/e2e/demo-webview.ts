import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

/*
 * The demo as a production webview bundle, for the kit's `csp` case: built the way a modeler's
 * apps/vscode builds its webview (esbuild, one IIFE with its CSS, the fonts as files), together
 * with the VS Code stub's classic script from source, since this suite runs the shell unbuilt.
 */

const packageDir = fileURLToPath(new URL("..", import.meta.url));

/**
 * Where the bundle lands: `webview.js`, `webview.css` and `fonts/`. Playwright empties its output
 * directory before the global setup builds into it.
 */
export const DEMO_WEBVIEW_DIST = join(packageDir, "test-results", "demo-webview");

const STUB_SCRIPT = join(DEMO_WEBVIEW_DIST, "vscode-stub-script.js");

export async function buildDemoWebview(): Promise<void> {
  await rm(DEMO_WEBVIEW_DIST, { recursive: true, force: true });
  const browser = { bundle: true, format: "iife", platform: "browser", target: "es2022" } as const;
  await Promise.all([
    build({
      ...browser,
      entryPoints: [join(packageDir, "demo", "main.ts")],
      outfile: join(DEMO_WEBVIEW_DIST, "webview.js"),
      minify: true,
      loader: { ".woff2": "file", ".woff": "file" },
      assetNames: "fonts/[name]-[hash]",
      logLevel: "warning",
    }),
    build({
      ...browser,
      entryPoints: [join(packageDir, "src", "testing-vscode-stub-script.ts")],
      outfile: STUB_SCRIPT,
      logLevel: "warning",
    }),
  ]);
}

let stubScript: string | undefined;

/** The stub's script `openWebviewBundle` serves, as `buildDemoWebview` left it. */
export function demoStubScript(): string {
  stubScript ??= readFileSync(STUB_SCRIPT, "utf8");
  return stubScript;
}
