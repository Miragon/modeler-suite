import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sourceAliases } from "./aliases.mjs";

/**
 * Every third-party module the modelers' packages and the editors' own modules load, read from
 * their sources. Vite pre-bundles
 * a dependency when it first meets it and then reloads the page; with the modelers taken from
 * source it meets most of them only when a notation loads, in the middle of a test run or of
 * somebody's edit. Named up front, they are bundled before the first page.
 */

const STATIC_IMPORT = /(?:^|\n)\s*(import|export)\s+(type\s+)?([^;]*?\sfrom\s+)?"([^"]+)"/g;
const DYNAMIC_IMPORT = /\bimport\(\s*"([^"]+)"\s*\)/g;
const SKIPPED_FOLDERS = new Set(["node_modules", "test", "dist"]);

// The JSX transform adds these two; no source file names them.
const JSX_RUNTIMES = ["react/jsx-runtime", "react/jsx-dev-runtime"];

/**
 * @param {string} specifier
 * @returns {boolean}
 */
function isThirdParty(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) {
    return false;
  }
  if (specifier.endsWith(".css") || specifier.includes("?")) return false;
  return !sourceAliases.some(({ find }) => specifier === find || specifier.startsWith(`${find}/`));
}

/**
 * @param {string} folder
 * @param {Set<string>} found
 */
function collect(folder, found) {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) {
      if (!SKIPPED_FOLDERS.has(name)) collect(path, found);
    } else if (/\.tsx?$/.test(name) && !/\.(test|d)\.tsx?$/.test(name)) {
      const text = readFileSync(path, "utf8");
      for (const [, , typeOnly, , specifier] of text.matchAll(STATIC_IMPORT)) {
        if (!typeOnly && specifier) found.add(specifier);
      }
      for (const [, specifier] of text.matchAll(DYNAMIC_IMPORT)) {
        if (specifier) found.add(specifier);
      }
      if (name.endsWith(".tsx")) for (const runtime of JSX_RUNTIMES) found.add(runtime);
    }
  }
}

// The editors' own modules, for what they take from npm and not from a modeler of the suite
// (`@miragon/bpmn-modeler`).
const EDITORS_SOURCE = fileURLToPath(new URL("../src", import.meta.url));

/** @returns {string[]} */
function thirdPartyImports() {
  /** @type {Set<string>} */
  const found = new Set();
  for (const { replacement } of sourceAliases) {
    if (replacement.endsWith("/src/index.ts")) collect(dirname(replacement), found);
  }
  collect(EDITORS_SOURCE, found);
  return [...found].filter(isThirdParty).sort();
}

/**
 * For Vite and Vitest (`optimizeDeps.include`).
 *
 * @type {string[]}
 */
export const prebundle = thirdPartyImports();
