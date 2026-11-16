// Two bundles from one run:
//   1. Extension host (Node/CJS, `vscode` external, with the example folder's files as texts)
//                                                          -> dist/extension.cjs
//   2. Webview (browser/IIFE, the board and its editors)  -> dist/webview.js, dist/webview.css
//      and the font files beside them in dist/fonts
// and, written from what went into the two, dist/THIRD_PARTY_NOTICES.md with every licence file
// a bundle names beside it.
//
// Both are built from source. The board's packages export their TypeScript, and the webview
// takes the other modelers' packages from their sources too (board-suite-editors/build), so no
// modeler is built first. @miragon/modeler-shell comes from its dist in both bundles.
import * as esbuild from "esbuild";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { webviewBundle } from "board-suite-editors/build/esbuild.mjs";
import { writeBundleNotices } from "board-suite-editors/build/notices-build.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * A file's text as a module, for an import that ends in `?raw`, as Vite reads one: the unit
 * tests run the host's sources through Vite, and the files of the example folder are no
 * modules to either bundler.
 * @type {import('esbuild').Plugin}
 */
const rawText = {
  name: "raw-text",
  setup(build) {
    // In the namespace of files, so that the metafile names such a file as it names every other:
    // by its path from the working directory.
    build.onResolve({ filter: /\?raw$/ }, ({ path, resolveDir }) => ({
      path: resolve(resolveDir, path.slice(0, -"?raw".length)),
      pluginData: { raw: true },
    }));
    build.onLoad({ filter: /.*/ }, ({ path, pluginData }) =>
      pluginData?.raw === true
        ? { contents: readFileSync(path, "utf8"), loader: "text" }
        : undefined,
    );
  },
};

/**
 * The options of both bundles; `production` is the build the VSIX ships (`vscode:prepublish`).
 * @param {{ production: boolean }} mode
 * @returns {{ host: import('esbuild').BuildOptions, web: import('esbuild').BuildOptions }}
 */
export function bundleOptions({ production }) {
  /** @type {import('esbuild').BuildOptions} */
  const common = {
    bundle: true,
    sourcemap: !production,
    minify: production,
    // The shell's chunks bring bare imports that esbuild names in a warning: a warning is no
    // failed build here.
    logLevel: "info",
  };

  /** @type {import('esbuild').BuildOptions} */
  const host = {
    ...common,
    entryPoints: [resolve(here, "src/extension.ts")],
    outfile: resolve(here, "dist/extension.cjs"),
    platform: "node",
    format: "cjs",
    // VS Code 1.96 (engines) runs extensions on Node 20; the shell's createNonce needs its
    // globalThis.crypto.
    target: "node20",
    // `vscode` is only available at runtime (from the host) and must not be bundled.
    external: ["vscode"],
    // The example of "New Board from Example" is in the bundle, each of its files as a text.
    plugins: [rawText],
  };

  /** @type {import('esbuild').BuildOptions} */
  const web = {
    ...common,
    ...webviewBundle,
    entryPoints: [resolve(here, "src/webview/main.ts")],
    outfile: resolve(here, "dist/webview.js"),
    format: "iife",
  };

  return { host, web };
}

/**
 * Writes the third-party notices of what the two builds bundled into dist/, where the VSIX takes
 * them from.
 * @param {readonly import('esbuild').BuildResult[]} results built with `measured` options
 * @returns {string[]} what keeps the notices from being whole
 */
function writeNotices(results) {
  const { written, problems } = writeBundleNotices({
    product: "The Board Modeler extension for VS Code",
    outdir: resolve(here, "dist"),
    metafiles: results.flatMap(({ metafile }) => (metafile === undefined ? [] : [metafile])),
    workingDirectory: here,
  });
  console.log(`[board-vscode] notices: ${written.map((file) => `dist/${file}`).join(", ")}`);
  return problems;
}

// The bundle test imports the options; only a direct run builds. The module URL is the real path,
// argv keeps a symlinked one (macOS /tmp).
const directRun =
  process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (directRun) {
  const production = process.argv.includes("--production");
  const { host, web } = bundleOptions({ production });
  // The notices are read from the metafiles, whose paths start at the working directory.
  /** @param {import('esbuild').BuildOptions} options */
  const measured = (options) => ({ ...options, metafile: true, absWorkingDir: here });
  if (process.argv.includes("--watch")) {
    const contexts = await Promise.all([
      esbuild.context(measured(host)),
      esbuild.context(measured(web)),
    ]);
    writeNotices(await Promise.all(contexts.map((context) => context.rebuild())));
    await Promise.all(contexts.map((context) => context.watch()));
    console.log("[board-vscode] watching …");
  } else {
    const problems = writeNotices(
      await Promise.all([esbuild.build(measured(host)), esbuild.build(measured(web))]),
    );
    if (problems.length > 0) {
      console.error(
        `[board-vscode] the third-party notices are not whole:\n- ${problems.join("\n- ")}`,
      );
      // A development build goes on with a notice missing; the build of the VSIX does not.
      if (production) process.exit(1);
    }
    console.log("[board-vscode] build done");
  }
}
