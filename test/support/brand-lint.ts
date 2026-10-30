import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

/** `.miragon/brand.json`, which turns on brand-lint (miragon-brand plugin) for a repository. */
export interface BrandLintConfig {
  _comment?: string;
  ignorieren: string[];
  aus: string[];
}

/** The German copy rules an English modeler turns off (design guide §2); C5 stays on. */
export const ENGLISH_MODELER_RULES_OFF = ["A1", "A3", "A4", "A7", "A11"];

const LINTED_EXTENSIONS = new Set(
  ".md .mdx .markdown .txt .vue .html .htm .astro .css .scss .sass .less .js .mjs .cjs .ts .tsx .jsx .svg".split(
    " ",
  ),
);
const TEST_FOLDERS = new Set(["test", "test-smoke", "e2e", "fixtures", "__snapshots__"]);

/**
 * The names of a unit, browser or e2e test, wherever it lies. Each needs its own ignore pattern,
 * also before the suite has such a file, because the hook lints the first one Claude writes.
 */
export const TEST_FILE_ENDINGS = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"];

export function readBrandLintConfig(root: string): BrandLintConfig {
  return JSON.parse(readFileSync(join(root, ".miragon/brand.json"), "utf8")) as BrandLintConfig;
}

/** brand-lint reads these file types only; JSON and the rest it never sees. */
export const lintedByBrandLint = (path: string): boolean =>
  LINTED_EXTENSIONS.has(posix.extname(path).toLowerCase());

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * brand-lint's own matching (its `ignored()`, the same for the hook and the CLI), on a path
 * relative to the folder that holds `.miragon`: a pattern without `*` is a prefix, one with `*` a
 * full match in which `*` also crosses `/`, against the path or its file name.
 */
export function ignoredByBrandLint(config: BrandLintConfig, relativePath: string): boolean {
  return config.ignorieren.some((pattern) => {
    if (!pattern.includes("*")) return relativePath.startsWith(pattern.replace(/^\.\//, ""));
    const expression = new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`);
    return expression.test(relativePath) || expression.test(posix.basename(relativePath));
  });
}

/**
 * Text a tool or a third party writes, and test data that breaks the rules on purpose: what the
 * ignore list has to cover, and all it may cover besides third-party texts it names.
 */
export function writtenByToolsOrTestData(relativePath: string): boolean {
  const folders = relativePath.split("/");
  const name = folders.pop() ?? "";
  return (
    name === "CHANGELOG.md" ||
    name === "THIRD_PARTY_NOTICES.md" ||
    TEST_FILE_ENDINGS.some((ending) => name.endsWith(ending)) ||
    folders.some((folder) => TEST_FOLDERS.has(folder) || folder.endsWith("-snapshots"))
  );
}
