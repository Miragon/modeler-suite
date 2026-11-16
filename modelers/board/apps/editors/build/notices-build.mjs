import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { composeNotices, NOTICES_FILE } from "./notices.mjs";

/**
 * The notices of a build for the two bundlers of the board's apps: esbuild, whose metafile names
 * every file with a byte in an output (the VS Code extension), and Vite, whose plugin reads the
 * modules of the chunks, the sources of the emitted assets and what the sheets import (the web
 * app).
 */

const BUILT_TEXT = /\.(?:[cm]?js|css)$/;
// A font or a picture comes out as a file of its own and may count no byte in the script or sheet
// that names it.
const ASSET = /\.(?:woff2?|ttf|otf|eot|png|jpe?g|gif|webp|svg)$/;
// esbuild names an input a plugin loaded `<namespace>:<path>`; a drive letter is no namespace.
const NAMESPACE = /^[a-z][\w-]+:/i;
const SHEET_IMPORT = /@import\s+(?:url\(\s*)?["']([^"']+)["']/g;

/**
 * @param {string} id a module id or an input of a metafile
 * @returns {string} without the query a bundler keeps on it (`diagram-js.css?base`)
 */
const withoutQuery = (id) => id.replace(/[?#].*$/, "");

/**
 * @typedef {{
 *   outputs: Record<string, { inputs: Record<string, { bytesInOutput: number }> }>,
 * }} Metafile what this module reads of esbuild's metafile
 */

/**
 * The files an esbuild build was made of: every input with a byte in an output, and every font
 * or picture an output names.
 *
 * @param {Metafile} metafile
 * @param {string} workingDirectory the build's `absWorkingDir`, which the metafile's paths are
 *   relative to
 * @returns {string[]} absolute paths, in the metafile's order
 */
export function metafileInputs(metafile, workingDirectory) {
  /** @type {Set<string>} */
  const files = new Set();
  for (const { inputs } of Object.values(metafile.outputs)) {
    for (const [input, { bytesInOutput }] of Object.entries(inputs)) {
      const file = resolve(workingDirectory, withoutQuery(input.replace(NAMESPACE, "")));
      if ((bytesInOutput > 0 || ASSET.test(file)) && existsSync(file)) files.add(file);
    }
  }
  return [...files];
}

/**
 * Writes the notices of an esbuild build next to its bundles: `THIRD_PARTY_NOTICES.md` in
 * `outdir`, and every licence file a bundle names beside that bundle.
 *
 * @param {{
 *   product: string,
 *   outdir: string,
 *   metafiles: readonly Metafile[],
 *   workingDirectory: string,
 * }} build the metafiles of every build that writes into `outdir`
 * @returns {{ written: string[], problems: string[] }} the files written, as paths in `outdir`
 */
export function writeBundleNotices({ product, outdir, metafiles, workingDirectory }) {
  const files = metafiles.flatMap((metafile) => metafileInputs(metafile, workingDirectory));
  /** @type {Record<string, string>} */
  const outputs = {};
  for (const output of metafiles.flatMap((metafile) => Object.keys(metafile.outputs))) {
    const built = resolve(workingDirectory, output);
    if (BUILT_TEXT.test(built) && existsSync(built)) {
      outputs[relative(outdir, built).split("\\").join("/")] = readFileSync(built, "utf8");
    }
  }
  const { text, beside, problems } = composeNotices({ product, files, outputs });
  const written = { [NOTICES_FILE]: text, ...beside };
  for (const [path, content] of Object.entries(written)) {
    mkdirSync(dirname(join(outdir, path)), { recursive: true });
    writeFileSync(join(outdir, path), content);
  }
  return { written: Object.keys(written), problems };
}

/**
 * The files a sheet imports, and the ones those import. Vite inlines a sheet's `@import` into
 * the sheet, so what it brings in is no module of any chunk.
 *
 * @param {string} sheet an absolute path
 * @param {string} css
 * @param {(specifier: string, importer: string) => Promise<string | undefined>} resolveId
 * @param {Set<string>} found
 * @returns {Promise<void>}
 */
async function followImports(sheet, css, resolveId, found) {
  for (const [, specifier] of css.matchAll(SHEET_IMPORT)) {
    if (specifier === undefined || /^(?:[a-z]+:)?\/\//i.test(specifier)) continue;
    const beside = resolve(dirname(sheet), withoutQuery(specifier));
    const resolved = (await resolveId(specifier, sheet)) ?? (existsSync(beside) ? beside : "");
    const file = withoutQuery(resolved);
    if (!isAbsolute(file) || found.has(file) || !existsSync(file)) continue;
    found.add(file);
    if (file.endsWith(".css")) {
      await followImports(file, readFileSync(file, "utf8"), resolveId, found);
    }
  }
}

/**
 * A Vite plugin that puts the notices into a production build: one file at the root of the
 * output (a `.txt`, which every static host shows as text), and every licence file a chunk names
 * beside that chunk. A build whose notices are not whole fails.
 *
 * @param {{ product: string, fileName?: string | undefined }} options
 * @returns {import("vite").Plugin}
 */
export function noticesPlugin({ product, fileName = NOTICES_FILE.replace(/\.md$/, ".txt") }) {
  let root = process.cwd();
  /** @type {Set<string>} */
  const imported = new Set();
  return {
    name: "board-third-party-notices",
    apply: "build",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
    },
    async transform(code, id) {
      const sheet = withoutQuery(id);
      if (sheet.endsWith(".css") && isAbsolute(sheet)) {
        const resolveId = async (/** @type {string} */ specifier, /** @type {string} */ from) =>
          (await this.resolve(specifier, from))?.id;
        await followImports(sheet, code, resolveId, imported);
      }
      return null;
    },
    generateBundle(_options, bundle) {
      /** @type {Set<string>} */
      const files = new Set(imported);
      /** @type {Record<string, string>} */
      const outputs = {};
      for (const [path, item] of Object.entries(bundle)) {
        if (item.type === "chunk") {
          outputs[path] = item.code;
          for (const [id, { renderedLength }] of Object.entries(item.modules)) {
            const file = withoutQuery(id);
            if (isAbsolute(file) && (renderedLength > 0 || file.endsWith(".css"))) files.add(file);
          }
        } else {
          if (BUILT_TEXT.test(path) && typeof item.source === "string") outputs[path] = item.source;
          for (const original of item.originalFileNames) files.add(resolve(root, original));
        }
      }
      const { text, beside, problems } = composeNotices({
        product,
        files: [...files].filter((file) => existsSync(file)),
        outputs,
      });
      if (problems.length > 0) {
        this.error(
          `the third-party notices of this build are not whole:\n- ${problems.join("\n- ")}`,
        );
      }
      this.emitFile({ type: "asset", fileName, source: text });
      for (const [path, content] of Object.entries(beside)) {
        this.emitFile({ type: "asset", fileName: path, source: content });
      }
    },
  };
}
