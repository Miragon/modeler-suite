import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type * as Declared from "../index.js";
import * as registry from "../src/registry.js";
import { SUITE_EDITORS } from "../src/registry.js";
import { SUITE_SUFFIXES } from "../src/suffixes.js";

/**
 * The suffix table against the files each modeler's VS Code extension opens (`customEditors` of
 * its manifest): a suffix a modeler adds or drops fails here until the table follows.
 */

const MODELERS = fileURLToPath(new URL("../../../../", import.meta.url));
const SUFFIXES_SOURCE = fileURLToPath(new URL("../src/suffixes.ts", import.meta.url));
const DECLARED_FACE = fileURLToPath(new URL("../index.d.ts", import.meta.url));

/** The notation a modeler's renderer names in `meta.notation`, where it is not the folder's name. */
const NOTATION_OF_FOLDER: Readonly<Record<string, string>> = { "wardley-maps": "wardley" };

// Left out until it is decided whether a board shows them: C4's second editor for Structurizr's
// `.dsl`, which many other tools write too, and the pictures that carry their document.
const isLeftOut = (suffix: string): boolean => suffix === ".dsl" || suffix.endsWith(".png");

interface Manifest {
  contributes?: {
    customEditors?: Array<{ selector: Array<{ filenamePattern: string }> }>;
  };
}

function manifestSuffixes(modeler: string): string[] {
  const manifest = JSON.parse(
    readFileSync(join(MODELERS, modeler, "apps/vscode/package.json"), "utf8"),
  ) as Manifest;
  return (manifest.contributes?.customEditors ?? [])
    .flatMap((editor) => editor.selector.map((selector) => selector.filenamePattern))
    .map((pattern) => {
      expect(pattern.startsWith("*."), pattern).toBe(true);
      return pattern.slice(1);
    });
}

const modelers = readdirSync(MODELERS)
  .filter((modeler) => modeler !== "board")
  .filter((modeler) => existsSync(join(MODELERS, modeler, "apps/vscode/package.json")))
  .sort();

const sorted = (values: readonly string[]): string[] => [...values].sort();

describe("SUITE_SUFFIXES", () => {
  it("has one entry per modeler of the suite that ships an editor", () => {
    expect(modelers).toHaveLength(7);
    expect(sorted(SUITE_SUFFIXES.map((entry) => entry.notation))).toEqual(
      sorted(modelers.map((modeler) => NOTATION_OF_FOLDER[modeler] ?? modeler)),
    );
  });

  it.each(modelers)("names the files the %s extension opens", (modeler) => {
    const notation = NOTATION_OF_FOLDER[modeler] ?? modeler;
    const entry = SUITE_SUFFIXES.find((one) => one.notation === notation);
    const opened = manifestSuffixes(modeler);
    expect(opened.length).toBeGreaterThan(0);
    expect(sorted(entry?.suffixes ?? [])).toEqual(sorted(opened.filter((one) => !isLeftOut(one))));
  });

  it("leaves out exactly C4's .dsl and the pictures", () => {
    const leftOut = modelers.flatMap(manifestSuffixes).filter(isLeftOut);
    expect(sorted(leftOut)).toEqual([".cm.png", ".dsl", ".tt.png", ".ttm.png"]);
  });

  it("gives every suffix once, with its dot and in lower case", () => {
    const suffixes = SUITE_SUFFIXES.flatMap((entry) => entry.suffixes);
    expect(new Set(suffixes).size).toBe(suffixes.length);
    for (const suffix of suffixes) expect(suffix).toMatch(/^\.[a-z0-9]+(\.[a-z0-9]+)*$/);
  });

  it("is plain data: its module imports nothing, so an extension host loads it in Node", () => {
    const source = readFileSync(SUFFIXES_SOURCE, "utf8");
    expect(source).not.toMatch(/^\s*import\b/m);
    expect(source).not.toMatch(/\bimport\(|\brequire\(/);
    expect(source).not.toMatch(/\bfrom\s+["']/);
  });
});

describe("SUITE_EDITORS", () => {
  it("is what index.d.ts declares, the face the board's other projects read", () => {
    // The type check of this workspace holds the types: the registry must fit the declaration.
    const declared: typeof Declared = registry;
    const names = [
      ...readFileSync(DECLARED_FACE, "utf8").matchAll(/^export declare const (\w+)/gm),
    ];
    expect(names.map((match) => match[1])).toEqual(Object.keys(declared));
    expect(Object.keys(declared)).toEqual(["SUITE_EDITORS"]);
  });

  it("is the suffix table, entry for entry", () => {
    expect(
      SUITE_EDITORS.map(({ notation, kind, suffixes }) => ({ notation, kind, suffixes })),
    ).toEqual(SUITE_SUFFIXES.map(({ notation, kind, suffixes }) => ({ notation, kind, suffixes })));
  });

  it("gives room at the left where the palette is a column, and the default elsewhere", () => {
    const withInsets = SUITE_EDITORS.filter((entry) => entry.insets !== undefined);
    expect(sorted(withInsets.map((entry) => entry.notation))).toEqual([
      "business-model-canvas",
      "c4",
    ]);
    for (const entry of withInsets) {
      expect(entry.insets).toEqual({ top: 24, right: 24, bottom: 24, left: 80 });
    }
  });
});
