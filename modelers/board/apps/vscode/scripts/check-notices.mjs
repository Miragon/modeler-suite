// Checks the third-party notices of the built extension and what the packed one holds: run after
// `npm run board package:vscode`. The bundles are measured again here, in memory, so the notices
// in dist/ and in the VSIX are held against what the build is made of and not against themselves.
//
//   node scripts/check-notices.mjs                 dist/, and board-modeler.vsix where it exists
//   node scripts/check-notices.mjs --vsix <file>   that VSIX, which must exist
import * as esbuild from "esbuild";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { metafileInputs } from "board-suite-editors/build/notices-build.mjs";
import { checkBuildNotices, noticesProblems } from "board-suite-editors/build/notices-check.mjs";
import { bundledPackages, copiedWorks, NOTICES_FILE } from "board-suite-editors/build/notices.mjs";
import { bundleOptions } from "../esbuild.config.mjs";
import { vsixProblems, zipEntries } from "./vsix.mjs";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLES = "extension/dist/";
const BUILT_TEXT = /\.(?:[cm]?js|css)$/;

/**
 * @typedef {{
 *   bundled: import("board-suite-editors/build/notices.mjs").BundledPackage[],
 *   works: import("board-suite-editors/build/notices.mjs").CopiedWork[],
 * }} Measured the packages in the two bundles and the works copied into their sources
 */

/** @returns {Promise<Measured>} */
async function measured() {
  const { host, web } = bundleOptions({ production: true });
  const files = [];
  for (const options of [host, web]) {
    const { metafile } = await esbuild.build({
      ...options,
      write: false,
      metafile: true,
      logLevel: "silent",
      absWorkingDir: app,
    });
    files.push(...metafileInputs(metafile, app));
  }
  return {
    bundled: bundledPackages(files).packages,
    works: copiedWorks(files).works.map(({ work }) => work),
  };
}

/**
 * @param {string} file
 * @param {Measured} build
 * @returns {{ problems: string[], files: number }}
 */
function checkVsix(file, { bundled, works }) {
  const { names, read } = zipEntries(readFileSync(file));
  const manifest = JSON.parse(readFileSync(resolve(app, "package.json"), "utf8"));
  const built = names
    .filter((name) => name.startsWith(BUNDLES))
    .map((name) => name.slice(BUNDLES.length));
  const notices = built.includes(NOTICES_FILE)
    ? read(`${BUNDLES}${NOTICES_FILE}`).toString("utf8")
    : undefined;
  const texts = Object.fromEntries(
    built
      .filter((name) => BUILT_TEXT.test(name))
      .map((name) => [name, read(`${BUNDLES}${name}`).toString("utf8")]),
  );
  return {
    problems: [
      ...vsixProblems(names, manifest),
      ...noticesProblems({ notices, texts, names: built, bundled, works }),
    ],
    files: names.length,
  };
}

const asked = process.argv.indexOf("--vsix");
const vsix = resolve(asked === -1 ? `${app}/board-modeler.vsix` : (process.argv[asked + 1] ?? ""));
const build = await measured();
const dist = checkBuildNotices(resolve(app, "dist"), build);
const problems = dist.problems.map((problem) => `dist: ${problem}`);
let packed = "no VSIX is packed, so only dist was read";
if (existsSync(vsix)) {
  const checked = checkVsix(vsix, build);
  problems.push(...checked.problems.map((problem) => `VSIX: ${problem}`));
  packed = `the VSIX (${checked.files} files) holds them, its papers and nothing it should leave out`;
} else if (asked !== -1) {
  problems.push(`there is no VSIX at ${vsix}`);
}

if (problems.length > 0) {
  console.error(`apps/vscode notices check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `apps/vscode notices check: ${dist.held} bundled packages and ${dist.works} copied works ` +
    `held against the ${dist.sections} sections of dist/${NOTICES_FILE}, every licence file a ` +
    `bundle names is there; ${packed}`,
);
