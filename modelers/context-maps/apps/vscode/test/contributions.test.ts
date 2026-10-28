// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { activate } from "../src/extension.js";
import { vscodeMock } from "./__mocks__/vscode.js";

interface Manifest {
  contributes: {
    commands: Array<{ command: string; title: string; shortTitle?: string; category: string }>;
    menus: Record<string, Array<{ command: string; when?: string; group?: string }>>;
    walkthroughs: Array<{ id: string; steps: Array<{ id: string; completionEvents: string[] }> }>;
    keybindings?: unknown;
  };
}

const manifestText = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const manifest = JSON.parse(manifestText) as Manifest;

beforeEach(() => vscodeMock.reset());

describe("the extension's contributions (guide §13.5)", () => {
  it("shows no em dash in a title or description of the manifest", () => {
    expect(manifestText).not.toContain("\u2014");
  });

  it("registers every contributed command on activation", () => {
    activate({ subscriptions: [], extensionUri: { path: "/extension" } } as never);
    expect(vscodeMock.registeredCommandIds().sort()).toEqual(
      manifest.contributes.commands.map((command) => command.command).sort(),
    );
  });

  it("offers Fit to View and the exports as commands of the category, in Title Case", () => {
    const titles = Object.fromEntries(
      manifest.contributes.commands.map((command) => [command.command, command.title]),
    );
    expect(titles).toMatchObject({
      "contextMaps.fitView": "Fit to View",
      "contextMaps.exportPng": "Export as PNG",
      "contextMaps.exportSvg": "Export as SVG",
      "contextMaps.exportJson": "Export as JSON",
      "contextMaps.exportCml": "Export as CML",
      "contextMaps.openSource": "Open Source to the Side",
      "contextMaps.openDiagram": "Open Diagram to the Side",
    });
    for (const command of manifest.contributes.commands) {
      expect(command.category).toBe("Context Maps");
    }
  });

  it("puts source and diagram side by side in the editor title's navigation", () => {
    const title = manifest.contributes.menus["editor/title"]!;
    expect(
      title.filter((entry) => entry.group === "navigation").map((entry) => entry.command),
    ).toEqual(["contextMaps.openSource", "contextMaps.openDiagram"]);
  });

  it("offers a new empty diagram, one from the example and one as PNG in the New File menu", () => {
    const shortTitles = new Map(
      manifest.contributes.commands.map((command) => [command.command, command.shortTitle]),
    );
    expect(
      manifest.contributes.menus["file/newFile"]!.map((entry) => [
        entry.command,
        entry.group,
        shortTitles.get(entry.command),
      ]),
    ).toEqual([
      ["contextMaps.newDiagram", "contextMaps@1", "Context Maps"],
      ["contextMaps.newFromExample", "contextMaps@2", "New Context Maps Diagram from Example"],
      ["contextMaps.newPngDiagram", "contextMaps@3", undefined],
    ]);
  });

  it("walks through New, Example and Source, and binds no keys of its own", () => {
    const walkthrough = manifest.contributes.walkthroughs[0]!;
    expect(walkthrough.id).toBe("getStarted");
    expect(walkthrough.steps.map((step) => step.id)).toEqual(["new", "example", "source", "learn"]);
    expect(walkthrough.steps.slice(0, 3).map((step) => step.completionEvents)).toEqual([
      ["onCommand:contextMaps.newDiagram"],
      ["onCommand:contextMaps.newFromExample"],
      ["onCommand:contextMaps.openSource"],
    ]);
    expect(manifest.contributes.keybindings).toBeUndefined();
  });
});
