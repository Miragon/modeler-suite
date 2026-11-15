import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bySuffix } from "@miragon/board-files";
import { SUITE_EDITORS } from "board-suite-editors";
import { describe, expect, test } from "vitest";

import { BOARD_FILES_RULE, MODEL_SUFFIXES } from "../src/boardEditorOptions.js";

/**
 * What the webview half must keep, read from its sources, and the one list the two halves of
 * the extension have each on their own: the page takes its editors from the suite's registry,
 * the extension host serves a text by the suffix table, as plain data.
 */

const WEBVIEW = fileURLToPath(new URL("../src/webview/", import.meta.url));

/** the code of a file without its comments, which may name what the code must not do */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const SOURCES = readdirSync(WEBVIEW)
  .filter((name) => name.endsWith(".ts"))
  .sort()
  .map((name) => ({ file: name, code: codeOf(join(WEBVIEW, name)) }));
const MAIN = SOURCES.find(({ file }) => file === "main.ts")?.code ?? "";

/** the specifiers a source imports, in the order it imports them */
const imported = (code: string): string[] =>
  [...code.matchAll(/^import\s+(?:[^"]*?\sfrom\s+)?"([^"]+)";/gm)].map(([, specifier]) =>
    String(specifier),
  );

describe("the sources of the webview", () => {
  test("are the entry, the files channel and the aim of a paste", () => {
    expect(SOURCES.map(({ file }) => file)).toEqual(["channel.ts", "main.ts", "paste.ts"]);
  });

  test("never acquire VS Code's API themselves: the shell's editor host does, once", () => {
    expect(SOURCES.filter(({ code }) => /acquireVsCodeApi/.test(code))).toEqual([]);
    expect(MAIN.match(/vsCodeEditorHost\(/g)).toHaveLength(1);
  });

  test("load zod without eval first, then the sheets in the page's order, then code", () => {
    expect(imported(MAIN).slice(0, 7)).toEqual([
      "board-suite-editors/zod-jitless",
      "@fontsource-variable/geist/wght.css",
      "@fontsource-variable/geist-mono/wght.css",
      "@miragon/modeler-shell/shell.css",
      "@miragon/board-renderer/assets/board.css",
      "board-suite-editors/base",
      "board-ide-editor/app.css",
    ]);
    // no sheet after the first module of code: its place in the bundle's sheet would move
    expect(
      imported(MAIN)
        .slice(7)
        .filter((specifier) => /\.css$|\/base$/.test(specifier)),
    ).toEqual([]);
  });

  test("hand the board the suite's editors, and keep an armed editor's undo keys with it", () => {
    expect(MAIN).toMatch(/import \{ SUITE_EDITORS \} from "board-suite-editors";/);
    expect(MAIN).toMatch(/editors: SUITE_EDITORS,/);
    expect(MAIN).toMatch(/containHistoryKeys: true,/);
  });

  test("wait for no answer of the extension before the board is mounted: nothing is awaited at the top", () => {
    const beforeTheMount = MAIN.slice(0, MAIN.indexOf("mountBoardEditor(host"));
    expect(beforeTheMount).not.toMatch(/\bawait\b|\.then\(/);
  });
});

describe("what is a model, in the page and in the extension host", () => {
  const ofTheRegistry = SUITE_EDITORS.flatMap((entry) => entry.suffixes);

  test("is one list: the suffixes the page has an editor for are the ones the host serves a text of", () => {
    expect(ofTheRegistry.length).toBeGreaterThan(0);
    expect(MODEL_SUFFIXES).toEqual(ofTheRegistry);
  });

  test("is one rule: a file the page mounts an editor for is a model to the files server, and no other file is", () => {
    const names = [
      ...ofTheRegistry.map((suffix) => `models/a${suffix}`),
      ...ofTheRegistry.map((suffix) => `models/A${suffix.toUpperCase()}`),
      "models/a.json",
      "models/a.board",
      "models/a.dsl",
      "models/a.owm.bak",
      "readme.md",
      "assets/a.png",
      ...ofTheRegistry,
    ];
    for (const name of names) {
      const hasEditor = bySuffix(SUITE_EDITORS, name) !== undefined;
      expect(BOARD_FILES_RULE.model(name), name).toBe(hasEditor);
    }
    expect(names.filter((name) => BOARD_FILES_RULE.model(name))).toHaveLength(
      2 * ofTheRegistry.length,
    );
  });
});
