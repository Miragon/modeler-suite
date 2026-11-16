/**
 * The two production builds the bench measures, made by every run from the tree as it is, into
 * the bench's own folder: nothing is written into `apps/webapp/dist` or `apps/vscode/dist`.
 */
import { rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { build as viteBuild, normalizePath, type Plugin } from "vite";
import { bundleOptions } from "../../apps/vscode/esbuild.config.mjs";
import { OUT, REPOSITORY_GLOBAL } from "./settings.js";

const WEBAPP = fileURLToPath(new URL("../../apps/webapp/", import.meta.url));
const EXAMPLE_MODULE = normalizePath(join(WEBAPP, "src/example.ts"));

export const WEBAPP_BUILD = join(OUT, "webapp");
export const WEBVIEW_BUILD = join(OUT, "webview");

// The web app reads its repository from the example folder when it is built. The bench's build
// reads it from the page instead, so that one build shows every generated board: the one module
// of the app that differs, with the same export.
const REPOSITORY_FROM_PAGE = `
const given = globalThis.${REPOSITORY_GLOBAL};
if (!given) throw new Error("The bench build of the web app was opened without a repository.");
const picture = (text) => ({ bytes: new TextEncoder().encode(text), mime: "image/svg+xml" });
export const EXAMPLE = {
  board: given.board,
  files: Object.fromEntries(
    Object.entries(given.files).map(([path, text]) => [
      path,
      path.endsWith(".svg") ? picture(text) : text,
    ]),
  ),
};
`;

const repositoryFromPage = (): Plugin => ({
  name: "board-bench-repository",
  enforce: "pre",
  load: (id) => (id.split("?")[0] === EXAMPLE_MODULE ? REPOSITORY_FROM_PAGE : undefined),
});

/** apps/webapp with its own Vite config, built for production. */
export async function buildWebapp(): Promise<void> {
  await viteBuild({
    root: WEBAPP,
    configFile: join(WEBAPP, "vite.config.ts"),
    logLevel: "warn",
    plugins: [repositoryFromPage()],
    build: { outDir: WEBAPP_BUILD, emptyOutDir: true },
  });
}

/** The extension's webview bundle with the options of the build the VSIX ships. */
export async function buildWebview(): Promise<void> {
  rmSync(WEBVIEW_BUILD, { recursive: true, force: true });
  await esbuild.build({
    ...bundleOptions({ production: true }).web,
    outfile: join(WEBVIEW_BUILD, "webview.js"),
    // the shell's chunks bring bare imports that esbuild names in a warning, as in every build
    logLevel: "error",
  });
}

export default async function buildBoth(): Promise<void> {
  await buildWebapp();
  await buildWebview();
}
