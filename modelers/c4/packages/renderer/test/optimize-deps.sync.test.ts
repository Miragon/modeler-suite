/*
 * The browser project pre-bundles every third-party module the renderer and its browser tests
 * load: a module Vite only finds while the tests run makes it re-optimize and reload a running
 * test file. The list in `vitest.config.ts` has to follow the imports.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modelerRoot = new URL("../../../", import.meta.url);

/** What the browser tests load: the renderer and its tests from source, the other packages too. */
const SCANNED = [
  "packages/renderer/src/",
  "packages/renderer/test/browser/",
  "packages/layout/src/",
  "packages/dsl/src/",
  "packages/schema-model/src/",
];

function sourceFiles(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
    if (entry.isDirectory()) return sourceFiles(url);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [url] : [];
  });
}

/** Specifiers of the imports that stay at run time (`verbatimModuleSyntax` keeps them all). */
function runtimeImports(source: string): string[] {
  const statements = source.matchAll(
    /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:([^"';]*?)\s+from\s+)?"([^"]+)"/g,
  );
  return [...statements].flatMap(([, typeOnly, clause, specifier]) => {
    if (typeOnly !== undefined || specifier === undefined) return [];
    const names = /^\{([^}]*)\}$/.exec(clause?.trim() ?? "")?.[1];
    const onlyTypes =
      names !== undefined &&
      names
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== "")
        .every((name) => name.startsWith("type "));
    return onlyTypes ? [] : [specifier];
  });
}

/** A third-party module Vite pre-bundles: no workspace package, test runner, stylesheet or asset. */
function isPrebundled(specifier: string): boolean {
  return (
    !specifier.startsWith(".") &&
    !specifier.startsWith("node:") &&
    !specifier.startsWith("@miragon/") &&
    !/^vitest(\/|$)/.test(specifier) &&
    !specifier.includes("?") &&
    !specifier.endsWith(".css")
  );
}

function importedModules(): string[] {
  const specifiers = SCANNED.flatMap((directory) =>
    sourceFiles(new URL(directory, modelerRoot)).flatMap((file) =>
      runtimeImports(readFileSync(file, "utf8")),
    ),
  );
  return [...new Set(specifiers.filter(isPrebundled))].sort();
}

function browserOptimizeDepsInclude(): string[] {
  const config = readFileSync(new URL("vitest.config.ts", modelerRoot), "utf8");
  const list = /optimizeDeps:\s*\{\s*include:\s*\[([^\]]*)\]/.exec(config)?.[1];
  if (list === undefined) return [];
  return [...list.matchAll(/"([^"]+)"/g)].map(([, specifier]) => specifier!);
}

describe("the browser project's pre-bundled modules", () => {
  it("are exactly the third-party modules the browser tests load", () => {
    const imported = importedModules();
    expect(imported).toContain("diagram-js/lib/features/context-pad");
    expect(imported).toContain("diagram-js/lib/features/global-connect");
    expect([...browserOptimizeDepsInclude()].sort()).toEqual(imported);
  });
});
