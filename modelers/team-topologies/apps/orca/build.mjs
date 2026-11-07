// Builds the Orca plugin into plugin/: the manifest, the icon and the editor. The bundle is not
// minified, as Orca's listing policy wants a readable plugin, and ships no sourcemap, as with it
// the plugin stays in Orca's size review (#563; #564 brings it back).
// Of zod's error messages it bundles only the English ones, the only ones the editor shows (#568).
import * as esbuild from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { editorBundle } from "team-topologies-ide-editor/esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const plugin = resolve(here, "plugin");

let zodLocalesRedirected = false;
/** @type {import('esbuild').Plugin} */
const englishZodMessagesOnly = {
  name: "english-zod-messages-only",
  setup(build) {
    build.onResolve({ filter: /^\.\.\/locales\/index\.js$/ }, ({ importer, resolveDir }) => {
      if (!/[\\/]node_modules[\\/]zod[\\/]/.test(importer)) return undefined;
      zodLocalesRedirected = true;
      return {
        path: resolve(resolveDir, "../locales/index.js"),
        namespace: "english-zod-messages",
      };
    });
    build.onLoad({ filter: /.*/, namespace: "english-zod-messages" }, ({ path }) => ({
      contents: 'export { default as en } from "./en.js";',
      resolveDir: dirname(path),
    }));
  },
};

await rm(plugin, { recursive: true, force: true });
await mkdir(resolve(plugin, "assets"), { recursive: true });
await esbuild.build({
  ...editorBundle,
  plugins: [...editorBundle.plugins, englishZodMessagesOnly],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  entryPoints: [resolve(here, "src/main.ts")],
  outfile: resolve(plugin, "editor/dist/main.js"),
  format: "esm",
  sourcemap: false,
  minify: false,
  logLevel: "warning",
});
if (!zodLocalesRedirected) {
  throw new Error("zod no longer imports ../locales/index.js: update englishZodMessagesOnly");
}
await cp(resolve(here, "editor/index.html"), resolve(plugin, "editor/index.html"));
await cp(resolve(here, "assets/icon.png"), resolve(plugin, "assets/icon.png"));
const manifest = JSON.parse(await readFile(resolve(here, "orca-plugin.json"), "utf8"));
await writeFile(resolve(plugin, "orca-plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await cp(resolve(here, "CHANGELOG.md"), resolve(plugin, "CHANGELOG.md")).catch(() => undefined);
console.log(`[team-topologies-orca] built ${plugin}`);
