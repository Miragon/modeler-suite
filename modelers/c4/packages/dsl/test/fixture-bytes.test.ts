import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The fixtures pin bytes: CRLF, a lone CR and a byte order mark are what some tests are about.
 * With `core.autocrlf=input` git would turn CRLF into LF on commit, so `.gitattributes` marks every
 * `.dsl` file under a package's tests `-text`, and the vendored Structurizr fixtures vendored.
 */
const MODELER = resolve(import.meta.dirname, "..", "..", "..");
const VENDORED = "packages/dsl/test/fixtures/structurizr/";

function testFixtures(): string[] {
  const packages = join(MODELER, "packages");
  return readdirSync(packages).flatMap((name) => {
    const tests = join(packages, name, "test");
    let files: string[];
    try {
      files = readdirSync(tests, { recursive: true, encoding: "utf8" });
    } catch {
      return [];
    }
    return files
      .filter((file) => file.endsWith(".dsl"))
      .map((file) => relative(MODELER, join(tests, file)).split("\\").join("/"));
  });
}

function holdsBytesGitWouldChange(file: string): boolean {
  const bytes = readFileSync(join(MODELER, file));
  return bytes.includes(0x0d) || (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);
}

/** `git check-attr` per file and attribute, as git applies `.gitattributes` itself. */
function attributes(files: readonly string[], names: readonly string[]): Map<string, string> {
  const output = execFileSync("git", ["check-attr", ...names, "--", ...files], {
    cwd: MODELER,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const found = new Map<string, string>();
  for (const line of output.split("\n")) {
    const match = /^(.*): ([^:]+): (.*)$/.exec(line);
    if (match) found.set(`${match[1]} ${match[2]}`, match[3] ?? "");
  }
  return found;
}

describe("the test fixtures' bytes", () => {
  const fixtures = testFixtures();

  it("include the CRLF and byte order mark fixtures this rule is for", () => {
    const special = fixtures.filter(holdsBytesGitWouldChange);
    expect(special).toEqual(
      expect.arrayContaining([
        "packages/dsl/test/edit/golden/create-tabs-crlf.after.dsl",
        "packages/dsl/test/fixtures/structurizr/workspace-with-bom.dsl",
        "packages/renderer/test/browser/fixtures/bookshop.loose.dsl",
      ]),
    );
  });

  it("are never normalised by git: every .dsl file under a package's tests is -text", () => {
    const found = attributes(fixtures, ["text"]);
    expect(fixtures.filter((file) => found.get(`${file} text`) !== "unset")).toEqual([]);
  });

  it("mark the vendored Structurizr fixtures, and only those, as vendored", () => {
    const found = attributes(fixtures, ["linguist-vendored"]);
    const vendored = fixtures.filter((file) => found.get(`${file} linguist-vendored`) === "set");
    expect(vendored).toEqual(fixtures.filter((file) => file.startsWith(VENDORED)));
    expect(vendored.length).toBeGreaterThan(100);
  });
});
