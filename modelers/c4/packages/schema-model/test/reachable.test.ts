import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCES = resolve(import.meta.dirname, "..", "src");
const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g;

/** The modules `src/index.ts` reaches through relative imports, as paths relative to `src`. */
function reachableModules(): Set<string> {
  const reached = new Set<string>();
  const pending = [join(SOURCES, "index.ts")];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (reached.has(file)) continue;
    reached.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(RELATIVE_IMPORT)) {
      const specifier = match[1] ?? "";
      pending.push(resolve(dirname(file), specifier.replace(/\.js$/, ".ts")));
    }
  }
  return new Set([...reached].map((file) => relative(SOURCES, file)));
}

describe("the package's sources", () => {
  it("are all reached from the entry point, so the build ships no dead module", () => {
    const modules = readdirSync(SOURCES, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".ts"))
      .sort();
    const reached = reachableModules();
    expect(modules.filter((file) => !reached.has(file))).toEqual([]);
  });
});
