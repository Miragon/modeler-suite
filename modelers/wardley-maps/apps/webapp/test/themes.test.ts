import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WARDLEY_THEMES } from "@miragon/wardley-renderer/themes";

/** Every place a host of this modeler hands the shell the modes it may show. */
const THEME_READERS = [
  "apps/webapp/src/main.ts",
  "apps/webapp/vite.config.ts",
  "apps/vscode/src/webview/main.ts",
  "apps/vscode/src/WardleyEditorProvider.ts",
];

function themesPassedIn(path: string): string[] {
  const source = readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
  return [...source.matchAll(/\bthemes:\s*([^,}\n]+)/g)].map((match) => match[1]!.trim());
}

describe("WARDLEY_THEMES", () => {
  it("is light only, until the Miragon modelers turn dark together", () => {
    expect(WARDLEY_THEMES).toEqual(["light"]);
  });

  it.each(THEME_READERS)(
    "is the one list %s passes on: one map, one look in every host",
    (path) => {
      const lists = themesPassedIn(path);
      expect(lists.length).toBeGreaterThan(0);
      expect(new Set(lists)).toEqual(new Set(["WARDLEY_THEMES"]));
    },
  );
});
