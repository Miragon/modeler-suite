import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { BOARD_VIEW_TYPE } from "../src/boardEditorOptions.js";

const APP = fileURLToPath(new URL("../", import.meta.url));
const read = (file: string): string => readFileSync(join(APP, file), "utf8");

interface Manifest {
  name: string;
  publisher: string;
  private: boolean;
  preview: boolean;
  main: string;
  engines: { vscode: string };
  activationEvents: string[];
  contributes: {
    customEditors: Array<{
      viewType: string;
      displayName: string;
      selector: Array<{ filenamePattern: string }>;
      priority: string;
    }>;
  };
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
}

const manifest = JSON.parse(read("package.json")) as Manifest;

describe("the extension's manifest", () => {
  test("contributes one custom editor, for *.board, under the view type the host registers", () => {
    expect(manifest.contributes.customEditors).toEqual([
      {
        viewType: BOARD_VIEW_TYPE,
        displayName: "Board",
        selector: [{ filenamePattern: "*.board" }],
        priority: "default",
      },
    ]);
    expect(manifest.activationEvents).toEqual([`onCustomEditor:${BOARD_VIEW_TYPE}`]);
  });

  test("carries the working names of a preview that is not published from here", () => {
    expect(manifest).toMatchObject({
      name: "board-modeler",
      publisher: "miragon-gmbh",
      private: true,
      preview: true,
      main: "./dist/extension.cjs",
    });
  });

  test("types the host against the oldest VS Code it runs in", () => {
    // vsce refuses a package whose @types/vscode is newer than the engines floor
    expect(manifest.engines.vscode).toBe(`^${manifest.devDependencies["@types/vscode"]}`);
  });

  test("builds, watches and packs with the scripts the board's workspace calls", () => {
    expect(manifest.scripts).toMatchObject({
      build: "node esbuild.config.mjs",
      watch: "node esbuild.config.mjs --watch",
      "vscode:prepublish": "node esbuild.config.mjs --production",
      package: "vsce package --no-dependencies -o board-modeler.vsix",
    });
  });
});

describe("what the VSIX leaves out and what it must have", () => {
  const ignored = read(".vscodeignore")
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"));

  test("leaves out the sources, the tests, node_modules and the build tooling", () => {
    expect(ignored).toEqual(
      expect.arrayContaining([
        "src/**",
        "test/**",
        "test-smoke/**",
        "node_modules/**",
        "esbuild.config.mjs",
        "tsconfig.json",
        "**/*.map",
      ]),
    );
  });

  test("does not leave out the bundles, the fonts, the README or the LICENSE", () => {
    for (const line of ignored) {
      expect(line).not.toMatch(/^(dist|README|LICENSE|package\.json)/i);
    }
    expect(readdirSync(APP)).toEqual(expect.arrayContaining(["README.md", "LICENSE"]));
    expect(read("LICENSE")).toMatch(/^MIT License/);
  });
});
