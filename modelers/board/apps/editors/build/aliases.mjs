import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every package of every modeler of the suite, by name, as its source. Most of them export a
 * `dist` that only a build of that modeler makes; the board's apps and tests take them from
 * `src`, so that no other modeler is built first and a change in one is live in the board.
 */

const MODELERS = fileURLToPath(new URL("../../../../", import.meta.url));

/** @typedef {{ find: string, replacement: string }} SourceAlias */

/**
 * The file a condition object of an export map hands a bundler.
 *
 * @param {unknown} value
 * @returns {string | undefined}
 */
function bundlerTarget(value) {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null) return undefined;
  const conditions = /** @type {Record<string, unknown>} */ (value);
  return bundlerTarget(conditions.import ?? conditions.default);
}

/**
 * The source file an exported file stands for: itself where the package exports its source, the
 * sheet under `src/assets` for a built sheet, the module of the same path for a built module.
 *
 * @param {string} packageRoot
 * @param {string | undefined} target
 * @returns {string | undefined}
 */
function sourceOf(packageRoot, target) {
  if (target === undefined) return undefined;
  if (target.startsWith("./src/")) return join(packageRoot, target);
  const built = /^\.\/dist\/(.+)\.(css|js)$/.exec(target);
  if (!built) return undefined;
  const source = join(
    packageRoot,
    built[2] === "css" ? `src/assets/${built[1]}.css` : `src/${built[1]}.ts`,
  );
  return existsSync(source) ? source : undefined;
}

/**
 * @param {string} packageRoot
 * @returns {SourceAlias[]}
 */
function aliasesOf(packageRoot) {
  const manifestPath = join(packageRoot, "package.json");
  const entry = join(packageRoot, "src/index.ts");
  if (!existsSync(manifestPath) || !existsSync(entry)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const subpaths = Object.entries(manifest.exports ?? {}).flatMap(([subpath, value]) => {
    if (subpath === "." || subpath === "./package.json") return [];
    const source = sourceOf(packageRoot, bundlerTarget(value));
    return source ? [{ find: `${manifest.name}/${subpath.slice(2)}`, replacement: source }] : [];
  });
  // A bundler takes the first entry whose name starts the import: a package's sheet and its other
  // subpaths stand before the package, or they would be read as files below its src/index.ts.
  return [...subpaths, { find: manifest.name, replacement: entry }];
}

/** @returns {string[]} */
function packageRoots() {
  return readdirSync(MODELERS)
    .sort()
    .map((modeler) => join(MODELERS, modeler, "packages"))
    .filter((packages) => existsSync(packages))
    .flatMap((packages) =>
      readdirSync(packages)
        .sort()
        .map((name) => join(packages, name)),
    );
}

/**
 * For Vite and Vitest (`resolve.alias`), in this order.
 *
 * @type {SourceAlias[]}
 */
export const sourceAliases = packageRoots().flatMap(aliasesOf);

/**
 * For esbuild (`alias`), which takes the longest name that starts an import.
 *
 * @type {Record<string, string>}
 */
export const esbuildAlias = Object.fromEntries(
  sourceAliases.map(({ find, replacement }) => [find, replacement]),
);
