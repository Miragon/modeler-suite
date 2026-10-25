import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ENGLISH_MODELER_RULES_OFF,
  ignoredByBrandLint,
  lintedByBrandLint,
  readBrandLintConfig,
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

  it("ignores CHANGELOGs, notices, tests, e2e suites, snapshots and fixtures, and nothing else", () => {
    const config = readBrandLintConfig(ROOT);
    const linted = repositoryFiles.filter(lintedByBrandLint);
    const wronglyIgnored = linted.filter(
      (file) =>
        ignoredByBrandLint(config, file) &&
        !writtenByToolsOrTestData(file) &&
        !THIRD_PARTY_TEXTS.includes(file),
    );
    const wronglyLinted = linted.filter(
      (file) =>
        !ignoredByBrandLint(config, file) &&
        (writtenByToolsOrTestData(file) || THIRD_PARTY_TEXTS.includes(file)),
    );
    expect({ wronglyIgnored, wronglyLinted }).toEqual({ wronglyIgnored: [], wronglyLinted: [] });
    expect(linted.filter((file) => file.endsWith("/CHANGELOG.md")).length).toBeGreaterThan(0);
  });

  it("names third-party texts that exist", () => {
    expect(THIRD_PARTY_TEXTS.filter((file) => !repositoryFiles.includes(file))).toEqual([]);
  });
});
