import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCst, printCst } from "../../src/syntax/index.js";
import { cstProblems } from "./support/invariants.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures", "structurizr");

/** The one fixture Structurizr tests in another encoding; every other one is UTF-8. */
const LATIN_1 = new Set(["iso-8859.dsl"]);

function dslFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      return dslFiles(path);
    }
    return entry.name.endsWith(".dsl") ? [path] : [];
  });
}

const FILES = dslFiles(FIXTURES)
  .map((path) => relative(FIXTURES, path))
  .sort();

function read(file: string): { bytes: Buffer; text: string; encoding: BufferEncoding } {
  const bytes = readFileSync(join(FIXTURES, file));
  const encoding: BufferEncoding = LATIN_1.has(file) ? "latin1" : "utf8";
  return { bytes, text: bytes.toString(encoding), encoding };
}

describe("the vendored Structurizr fixtures", () => {
  it("are all 107 .dsl files of structurizr-dsl/src/test/resources/dsl at e3a736a9", () => {
    expect(FILES).toHaveLength(107);
    expect(FILES).toContain("big-bank-plc.dsl");
    expect(FILES).toContain("big-bank-plc/model/internet-banking-system/details.dsl");
  });

  it.each(FILES)("%s prints back byte for byte", (file) => {
    const { bytes, text, encoding } = read(file);
    expect(Buffer.from(printCst(parseCst(text)), encoding).equals(bytes)).toBe(true);
  });

  it.each(FILES)("%s parses into a sound tree", (file) => {
    const { text } = read(file);
    expect(cstProblems(text, parseCst(text))).toEqual([]);
  });

  it.each(FILES)("%s prints back from a copy of its tree, too", (file) => {
    const { text } = read(file);
    expect(printCst(structuredClone(parseCst(text))) === text).toBe(true);
  });

  it("reads the BOM fixture's byte order mark as such", () => {
    const cst = parseCst(read("workspace-with-bom.dsl").text);
    expect(cst.bom).toBe(true);
    expect(cst.nodes[0]?.kind).toBe("statement");
  });

  it("flags a syntax error only in multi-line-with-error.dsl, whose trailing comment Structurizr refuses", () => {
    const withErrors = FILES.filter((file) =>
      parseCst(read(file).text).syntaxDiagnostics.some(
        (diagnostic) => diagnostic.severity === "error",
      ),
    );
    expect(withErrors).toEqual(["multi-line-with-error.dsl"]);
  });
});
