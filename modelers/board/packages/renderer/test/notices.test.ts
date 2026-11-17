import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THIRD_PARTY_NOTICES.md, which the build puts into the package, against what the built sheet
 * carries: every sheet that `src/assets/board.css` imports is inlined into `dist/board.css`. The
 * build itself fails for a script that would carry a third-party module and for a sheet of a
 * package the file does not name (`vite.config.ts`); this holds the texts the file quotes.
 */

const RENDERER = fileURLToPath(new URL("../", import.meta.url));
const notices = readFileSync(join(RENDERER, "THIRD_PARTY_NOTICES.md"), "utf8");
const SHEET_IMPORT = /@import\s+(?:url\(\s*)?["']([^"']+)["']/g;
const LEGAL_COMMENT = /\/\*![\s\S]*?\*\//g;

/** the sheets the build inlines, in the order it meets them */
function inlinedSheets(sheet: string, found: string[] = []): string[] {
  found.push(sheet);
  for (const [, specifier = ""] of readFileSync(sheet, "utf8").matchAll(SHEET_IMPORT)) {
    const file = specifier.startsWith(".")
      ? resolve(dirname(sheet), specifier)
      : createRequire(sheet).resolve(specifier);
    if (!found.includes(file)) inlinedSheets(file, found);
  }
  return found;
}

const sheets = inlinedSheets(join(RENDERER, "src/assets/board.css"));

/** the folder of the npm package a file lies in */
function packageFolder(file: string): string | undefined {
  const parts = file.split(sep);
  const at = parts.lastIndexOf("node_modules");
  if (at === -1) return undefined;
  return parts.slice(0, at + (parts[at + 1]?.startsWith("@") ? 3 : 2)).join(sep);
}

const packages = [...new Set(sheets.map(packageFolder))].filter(
  (folder): folder is string => folder !== undefined,
);

const tidy = (text: string): string => text.replace(/\r\n?/g, "\n").trim();

describe("the third-party notices of the package", () => {
  it("follow the sheet through its imports: the tokens, React Flow's sheet and the base", () => {
    expect(sheets.map((file) => file.slice(file.lastIndexOf(sep) + 1))).toEqual([
      "board.css",
      "cd-tokens.generated.css",
      "style.css",
      "board-base.css",
    ]);
  });

  it("name every package whose sheet goes in, and quote its licence as it is installed", () => {
    const names = packages.map(
      (folder) =>
        (JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as { name: string }).name,
    );
    expect(names).toEqual(["@xyflow/react"]);
    for (const [index, folder] of packages.entries()) {
      expect(notices).toContain(`(\`${names[index]}\`)`);
      expect(notices).toContain(tidy(readFileSync(join(folder, "LICENSE"), "utf8")));
    }
  });

  it("answer every legal comment of the inlined sheets with the holder it names", () => {
    const comments = sheets.flatMap(
      (file) => readFileSync(file, "utf8").match(LEGAL_COMMENT) ?? [],
    );
    expect(comments).toHaveLength(1);
    for (const comment of comments) {
      const holder = /Copyright \(c\) [^\n*]+/.exec(comment)?.[0]?.trim();
      expect(holder, comment).toBeDefined();
      expect(notices).toContain(`\n${holder}\n`);
      expect(comment).toContain("tailwindcss v4.3.5 (preflight.css) | MIT License");
      expect(notices).toContain("Tailwind CSS 4.3.5");
    }
  });
});
