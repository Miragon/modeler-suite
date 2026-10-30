import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ENGLISH_MODELER_RULES_OFF,
  ignoredByBrandLint,
  lintedByBrandLint,
  readBrandLintConfig,
  TEST_FILE_ENDINGS,
  writtenByToolsOrTestData,
} from "./support/brand-lint";

/**
 * The suite's one brand-lint config. The miragon-brand plugin's hook takes the nearest
 * `.miragon/brand.json` and never merges, so a second one under modelers/ would silently replace
 * these rules for that modeler, and an ignore pattern that matches too much silences sources.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TEMPLATE_CONFIG =
  "plugins/modeler-kit/skills/new-modeler/assets/template/.miragon/brand.json";
/** Third-party text copied unchanged into a folder the patterns do not cover. */
const THIRD_PARTY_TEXTS = ["modelers/context-maps/apps/vscode/scripts/apache-2.0.txt"];
/** The Miragon docs kit, vendored unchanged and checked at its source in Miragon/corporate-identity. */
const VENDORED_DOCS_KIT = "docs/.vitepress/miragon/";

function vendoredOrThirdParty(file: string): boolean {
  return THIRD_PARTY_TEXTS.includes(file) || file.startsWith(VENDORED_DOCS_KIT);
}

const repositoryFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: ROOT, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

describe("the suite's brand-lint config", () => {
  it("is the only one, at the root, next to the one the new-modeler template ships", () => {
    expect(repositoryFiles.filter((file) => file.endsWith(".miragon/brand.json")).sort()).toEqual(
      [".miragon/brand.json", TEMPLATE_CONFIG].sort(),
    );
  });

  it("turns off exactly the German copy rules, so C5 and A2 stay on (guide §2)", () => {
    expect([...readBrandLintConfig(ROOT).aus].sort()).toEqual(
      [...ENGLISH_MODELER_RULES_OFF].sort(),
    );
  });

  it("ignores CHANGELOGs, notices, the docs kit, tests, e2e suites, snapshots and fixtures, and nothing else", () => {
    const config = readBrandLintConfig(ROOT);
    const linted = repositoryFiles.filter(lintedByBrandLint);
    const wronglyIgnored = linted.filter(
      (file) =>
        ignoredByBrandLint(config, file) &&
        !writtenByToolsOrTestData(file) &&
        !vendoredOrThirdParty(file),
    );
    const wronglyLinted = linted.filter(
      (file) =>
        !ignoredByBrandLint(config, file) &&
        (writtenByToolsOrTestData(file) || vendoredOrThirdParty(file)),
    );
    expect({ wronglyIgnored, wronglyLinted }).toEqual({ wronglyIgnored: [], wronglyLinted: [] });
    expect(linted.filter((file) => file.endsWith("/CHANGELOG.md")).length).toBeGreaterThan(0);
  });

  it("ignores a test file of every name form, also one the suite does not have yet", () => {
    const config = readBrandLintConfig(ROOT);
    const testFilesOutsideTestFolders = TEST_FILE_ENDINGS.flatMap((ending) => [
      `Probe${ending}`,
      `modelers/any-modeler/packages/any-package/src/Probe${ending}`,
    ]);
    const wronglyLinted = testFilesOutsideTestFolders.filter(
      (file) => !ignoredByBrandLint(config, file),
    );
    expect(wronglyLinted).toEqual([]);
  });

  it("names third-party texts that exist", () => {
    expect(THIRD_PARTY_TEXTS.filter((file) => !repositoryFiles.includes(file))).toEqual([]);
  });
});
