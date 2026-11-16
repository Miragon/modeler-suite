import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The reach of the board's own dependency-cruiser rule `document-half-no-canvas`. The rule names
 * paths, so a file it does not name is a file the document half may import unseen: every source
 * file of the renderer is either of the document half (the rule's `from`), of a later layer (its
 * `to`), or one of the few that belong to no layer. `npm run board depcruise` then says whether
 * an import crosses the line; this test says whether the line is drawn around every file.
 */
interface Rule {
  name: string;
  from: { path: string };
  to: { path: string[]; pathNot?: string | undefined };
}

const require = createRequire(import.meta.url);
const { forbidden } = require("../../../.dependency-cruiser.cjs") as { forbidden: Rule[] };
const rule = forbidden.find((candidate) => candidate.name === "document-half-no-canvas")!;

const SOURCES = fileURLToPath(new URL("../src/", import.meta.url));
const files = readdirSync(SOURCES, { recursive: true, encoding: "utf8" })
  .map((file) => `packages/renderer/src/${file.replaceAll("\\", "/")}`)
  .filter((file) => /\.tsx?$/.test(file))
  .sort();

/** The entry, which imports every layer, and the module declaration for `*.css`. */
const IN_NO_LAYER = ["packages/renderer/src/css.d.ts", "packages/renderer/src/index.ts"];

const inDocumentHalf = (file: string): boolean => new RegExp(rule.from.path).test(file);
const forbiddenTarget = (file: string): boolean =>
  rule.to.path.some((path) => new RegExp(path).test(file)) &&
  !(rule.to.pathNot !== undefined && new RegExp(rule.to.pathNot).test(file));

describe("document-half-no-canvas draws its line around every source file", () => {
  it("finds the sources and the rule", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(rule).toBeDefined();
  });

  it("the document half is the store, the host types and the arm rules", () => {
    expect(files.filter(inDocumentHalf)).toEqual([
      "packages/renderer/src/arming/arm-rules.ts",
      "packages/renderer/src/arming/types.ts",
      "packages/renderer/src/host/defaults.ts",
      "packages/renderer/src/host/types.ts",
      "packages/renderer/src/store/actions.ts",
      "packages/renderer/src/store/board-store.ts",
      "packages/renderer/src/store/document.ts",
    ]);
  });

  it("no file of the document half is a forbidden target itself", () => {
    expect(files.filter((file) => inDocumentHalf(file) && forbiddenTarget(file))).toEqual([]);
  });

  it("every other file is one the document half must not import", () => {
    const unseen = files.filter((file) => !inDocumentHalf(file) && !forbiddenTarget(file));
    expect(unseen).toEqual(IN_NO_LAYER);
  });
});
