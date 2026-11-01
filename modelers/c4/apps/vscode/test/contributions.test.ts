import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import {
  GO_TO_VIEW_COMMAND,
  NEW_DIAGRAM_COMMAND,
  NEW_DIAGRAM_FROM_EXAMPLE_COMMAND,
  OPEN_DIAGRAM_COMMAND,
  OPEN_SOURCE_COMMAND,
  USE_FOR_WORKSPACE_DSL_COMMAND,
  WEBVIEW_COMMANDS,
} from "../src/commands.js";
import { EXAMPLE_NEEDS_EMPTY_FILE } from "../src/diagramEditor.js";
import { DIAGRAM_VIEW_TYPE, DSL_DIAGRAM_VIEW_TYPE } from "../src/diagramEditorOptions.js";
import { activate } from "../src/extension.js";
import { FakeUri, fakeVsCode } from "./fakeVsCode.js";

vi.mock("vscode", async () => (await import("./fakeVsCode.js")).vscodeModule);

interface CommandContribution {
  command: string;
  title: string;
  shortTitle?: string;
  category?: string;
  icon?: string;
}
interface MenuContribution {
  command: string;
  when?: string;
  group?: string;
}
interface WalkthroughStep {
  id: string;
  description: string;
  media: { markdown: string };
  completionEvents: string[];
}

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("package.json")) as {
  name: string;
  displayName: string;
  description: string;
  publisher: string;
  icon?: string;
  activationEvents: string[];
  contributes: {
    languages: Array<{ id: string; icon?: { light: string; dark: string } }>;
    commands: CommandContribution[];
    menus: Record<string, MenuContribution[]>;
    customEditors: Array<{
      viewType: string;
      displayName: string;
      selector: Array<{ filenamePattern: string }>;
      priority: string;
    }>;
    keybindings?: unknown;
    walkthroughs: Array<{ id: string; steps: WalkthroughStep[] }>;
  };
};
const { contributes } = manifest;
const commandById = new Map(contributes.commands.map((command) => [command.command, command]));
const ON_DIAGRAM = "activeCustomEditorId == c4.editor || activeCustomEditorId == c4.dslEditor";
// A .c4 text that LikeC4 reads (language `likec4`) is no Structurizr workspace: no diagram for it.
const ON_SOURCE =
  "(resourceExtname == .dsl || editorLangId == structurizr-dsl) && activeCustomEditorId != c4.editor && activeCustomEditorId != c4.dslEditor";
const WEBVIEW_COMMAND_IDS: readonly string[] = Object.values(WEBVIEW_COMMANDS);
const iconPaths = [
  manifest.icon,
  ...contributes.languages.flatMap(({ icon }) => (icon ? [icon.light, icon.dark] : [])),
].flatMap((path) => (path === undefined ? [] : [path.replace(/^\.\//, "")]));

/** A PNG's signature and the size its IHDR chunk, always the first, gives. */
function pngHeader(path: string): [string, number, number] {
  const png = readFileSync(new URL(`../${path}`, import.meta.url));
  return [png.toString("latin1", 1, 4), png.readUInt32BE(16), png.readUInt32BE(20)];
}

describe("the extension", () => {
  it("is the C4 Modeler of Miragon", () => {
    expect([manifest.publisher, manifest.name, manifest.displayName]).toEqual([
      "miragon-gmbh",
      "c4-modeler",
      "C4 Modeler",
    ]);
  });

  // A .c4 file is the C4 Modeler's own; .dsl is also Structurizr's own tools', ACPI's and several
  // extensions' (SPEC 8.2). VS Code takes one priority per editor, so .dsl has an editor of its own.
  it("opens a .c4 file in the C4 Modeler, and a .dsl file only when asked", () => {
    expect(contributes.customEditors).toEqual([
      {
        viewType: DIAGRAM_VIEW_TYPE,
        displayName: "C4 Modeler",
        selector: [{ filenamePattern: "*.c4" }],
        priority: "default",
      },
      {
        viewType: DSL_DIAGRAM_VIEW_TYPE,
        displayName: "C4 Modeler",
        selector: [{ filenamePattern: "*.dsl" }],
        priority: "option",
      },
    ]);
  });

  it("activates for both editors, the language and a folder with a .c4 file or a workspace.dsl", () => {
    expect(manifest.activationEvents).toEqual([
      `onCustomEditor:${DIAGRAM_VIEW_TYPE}`,
      `onCustomEditor:${DSL_DIAGRAM_VIEW_TYPE}`,
      "onLanguage:structurizr-dsl",
      "workspaceContains:**/*.c4",
      "workspaceContains:**/workspace.dsl",
    ]);
  });

  it("describes itself with both file extensions", () => {
    expect(manifest.description).toBe(
      "View and edit C4 model diagrams directly in VS Code, backed by plain-text Structurizr DSL files (.c4, .dsl).",
    );
  });
});

describe("package.json contributions", () => {
  // Guide §13.5: New (empty) and New from example as commands, in file/newFile and the walkthrough.
  it("offers a new empty diagram, then a new diagram from the example, in the New File menu", () => {
    expect(
      (contributes.menus["file/newFile"] ?? []).map((entry) => {
        const command = commandById.get(entry.command);
        return [entry.command, entry.group, command?.shortTitle ?? command?.title];
      }),
    ).toEqual([
      [NEW_DIAGRAM_COMMAND, "c4@1", "C4 Diagram"],
      [NEW_DIAGRAM_FROM_EXAMPLE_COMMAND, "c4@2", "New C4 Diagram from Example"],
    ]);
  });

  it("titles the commands in Title Case in the C4 category (SPEC 8.2)", () => {
    expect(
      contributes.commands.map((command) => [command.command, command.category, command.title]),
    ).toEqual([
      [NEW_DIAGRAM_COMMAND, "C4", "New Empty C4 Diagram"],
      [NEW_DIAGRAM_FROM_EXAMPLE_COMMAND, "C4", "New C4 Diagram from Example"],
      [OPEN_SOURCE_COMMAND, "C4", "Open Source to the Side"],
      [OPEN_DIAGRAM_COMMAND, "C4", "Open Diagram to the Side"],
      [GO_TO_VIEW_COMMAND, "C4", "Go to View…"],
      [WEBVIEW_COMMANDS.parentView, "C4", "Parent View"],
      [WEBVIEW_COMMANDS.fitView, "C4", "Fit to View"],
      [WEBVIEW_COMMANDS.exportPng, "C4", "Export as PNG"],
      [WEBVIEW_COMMANDS.exportSvg, "C4", "Export as SVG"],
      [USE_FOR_WORKSPACE_DSL_COMMAND, "C4", "Use C4 Modeler for workspace.dsl"],
    ]);
  });

  it("offers the source beside a diagram and the diagram beside a workspace's text, with Codicons", () => {
    expect(commandById.get(OPEN_SOURCE_COMMAND)?.icon).toBe("$(go-to-file)");
    expect(commandById.get(OPEN_DIAGRAM_COMMAND)?.icon).toBe("$(open-preview)");
    const navigation = (contributes.menus["editor/title"] ?? []).filter(
      (entry) => entry.group === "navigation",
    );
    expect(navigation).toEqual([
      { command: OPEN_SOURCE_COMMAND, when: ON_DIAGRAM, group: "navigation" },
      { command: OPEN_DIAGRAM_COMMAND, when: ON_SOURCE, group: "navigation" },
    ]);
  });

  it("puts fit, then the exports with PNG first, in the editor title's menu of a diagram", () => {
    const overflow = (contributes.menus["editor/title"] ?? []).filter(
      (entry) => entry.group !== "navigation",
    );
    expect(overflow).toEqual([
      { command: WEBVIEW_COMMANDS.fitView, when: ON_DIAGRAM, group: "c4@1" },
      { command: WEBVIEW_COMMANDS.exportPng, when: ON_DIAGRAM, group: "c4@2" },
      { command: WEBVIEW_COMMANDS.exportSvg, when: ON_DIAGRAM, group: "c4@3" },
    ]);
  });

  it("shows the diagram's commands in the Command Palette only while a diagram is focused", () => {
    const palette = new Map(
      (contributes.menus.commandPalette ?? []).map((entry) => [entry.command, entry.when]),
    );
    for (const id of [OPEN_SOURCE_COMMAND, GO_TO_VIEW_COMMAND, ...WEBVIEW_COMMAND_IDS]) {
      expect(palette.get(id), id).toBe(ON_DIAGRAM);
    }
    expect(palette.get(OPEN_DIAGRAM_COMMAND)).toBe(ON_SOURCE);
    for (const id of [
      NEW_DIAGRAM_COMMAND,
      NEW_DIAGRAM_FROM_EXAMPLE_COMMAND,
      USE_FOR_WORKSPACE_DSL_COMMAND,
    ]) {
      expect(palette.has(id), id).toBe(false);
    }
  });

  it("walks through new, example, drawing, the layout, the source and workspace.dsl", () => {
    const [walkthrough] = contributes.walkthroughs;
    expect(walkthrough?.id).toBe("getStarted");
    expect((walkthrough?.steps ?? []).map((step) => [step.id, step.completionEvents])).toEqual([
      ["new", [`onCommand:${NEW_DIAGRAM_COMMAND}`]],
      ["example", [`onCommand:${NEW_DIAGRAM_FROM_EXAMPLE_COMMAND}`]],
      ["draw", ["onStepSelected"]],
      ["layout", ["onStepSelected"]],
      ["source", [`onCommand:${OPEN_SOURCE_COMMAND}`]],
      ["default", [`onCommand:${USE_FOR_WORKSPACE_DSL_COMMAND}`]],
    ]);
  });

  it("names the file a new diagram gets a .c4 file in the walkthrough as well", () => {
    const [walkthrough] = contributes.walkthroughs;
    const step = (id: string) => walkthrough?.steps.find((candidate) => candidate.id === id);
    expect(step("new")?.description).toContain("a .c4 file");
    expect(read("media/walkthrough/new.md")).toContain("`workspace.c4`");
    expect(step("default")?.description).toContain(".c4 files open in the C4 Modeler");
  });

  it("links only declared commands and existing media from the walkthrough", () => {
    for (const step of contributes.walkthroughs.flatMap((walkthrough) => walkthrough.steps)) {
      const media = new URL(`../${step.media.markdown}`, import.meta.url);
      expect(existsSync(media), step.media.markdown).toBe(true);
      const markdown = readFileSync(media, "utf8");
      for (const [, command] of `${step.description}\n${markdown}`.matchAll(
        /\(command:([^)]+)\)/g,
      )) {
        expect(commandById.has(command!), `${step.id}: ${command}`).toBe(true);
      }
    }
  });

  // The suite's pattern (Value Chain, the new-modeler template): id and title name the diagram.
  it("names the new-file commands after the diagram they create, as the other modelers do", () => {
    expect([NEW_DIAGRAM_COMMAND, NEW_DIAGRAM_FROM_EXAMPLE_COMMAND]).toEqual([
      "c4.newDiagram",
      "c4.newDiagramFromExample",
    ]);
    const [walkthrough] = contributes.walkthroughs;
    const step = (id: string) => walkthrough?.steps.find((candidate) => candidate.id === id);
    expect(step("new")?.description).toContain("[Create empty diagram](command:c4.newDiagram)");
    expect(step("example")?.description).toContain(
      "[Create diagram from example](command:c4.newDiagramFromExample)",
    );
    expect(EXAMPLE_NEEDS_EMPTY_FILE).toContain(
      `Run ${commandById.get(NEW_DIAGRAM_FROM_EXAMPLE_COMMAND)?.title} instead.`,
    );
  });

  it("names every command in the walkthrough and the README as VS Code shows it", () => {
    const titles = new Set(contributes.commands.map((command) => command.title));
    const newFileLabels = new Set(
      (contributes.menus["file/newFile"] ?? []).map((entry) => {
        const command = commandById.get(entry.command);
        return command?.shortTitle ?? command?.title;
      }),
    );
    const text = [
      ...contributes.walkthroughs
        .flatMap((walkthrough) => walkthrough.steps)
        .flatMap((step) => [step.description, read(step.media.markdown)]),
      read("README.md"),
    ].join("\n");
    const inCommandPalette = [...text.matchAll(/\*\*C4: ([^*]+)\*\*/g)].map(([, title]) => title!);
    const inNewFile = [...text.matchAll(/\*\*File › New File… › ([^*]+)\*\*/g)].map(
      ([, label]) => label!,
    );

    expect(inCommandPalette).toContain("New Empty C4 Diagram");
    expect(inNewFile).toEqual(["C4 Diagram", "New C4 Diagram from Example"]);
    for (const title of inCommandPalette) expect(titles.has(title), title).toBe(true);
    for (const label of inNewFile) expect(newFileLabels.has(label), label).toBe(true);
  });

  it("references only declared commands in menus", () => {
    for (const entries of Object.values(contributes.menus)) {
      for (const entry of entries) expect(commandById.has(entry.command), entry.command).toBe(true);
    }
  });

  it("contributes no keybindings: the canvas keys apply while the webview has focus", () => {
    expect(contributes.keybindings).toBeUndefined();
  });

  it("carries the C4 modeler icon as a 256 px PNG", () => {
    expect(manifest.icon).toBe("icon.png");
    expect(pngHeader("icon.png")).toEqual(["PNG", 256, 256]);
  });

  // An icon on a language VS Code or another extension owns would mark every file of that language.
  it("gives the C4 file icon, light and dark, to its own language only", () => {
    expect(contributes.languages.map(({ id, icon }) => [id, icon])).toEqual([
      [
        "structurizr-dsl",
        { light: "./media/icons/c4-light.svg", dark: "./media/icons/c4-dark.svg" },
      ],
    ]);
    for (const path of ["media/icons/c4-light.svg", "media/icons/c4-dark.svg"]) {
      expect(read(path), path).toMatch(/^<svg [^>]*viewBox="0 0 24 24"/);
    }
  });
});

describe("the VSIX", () => {
  const ignored = read(".vscodeignore")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(
      (glob) =>
        new RegExp(
          `^${glob
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*\*\//g, "(?:.*/)?")
            .replace(/\*\*/g, ".*")
            .replace(/(?<!\.)\*/g, "[^/]*")}$`,
        ),
    );
  const isIgnored = (path: string) => ignored.some((pattern) => pattern.test(path));

  it.each([
    "dist/extension.cjs",
    "dist/webview.js",
    "THIRD_PARTY_NOTICES.md",
    "syntaxes/structurizr-dsl.tmLanguage.json",
    "language-configuration.json",
    "media/walkthrough/new.md",
    "README.md",
    "LICENSE",
  ])("ships %s", (path) => {
    expect(isIgnored(path)).toBe(false);
  });

  it.each([
    "src/extension.ts",
    "test/contributions.test.ts",
    "scripts/third-party-notices.mjs",
    "esbuild.config.mjs",
    "dist/extension.cjs.map",
  ])("leaves %s out", (path) => {
    expect(isIgnored(path)).toBe(true);
  });

  it("ships every icon the manifest names", () => {
    expect(iconPaths).toEqual(["icon.png", "media/icons/c4-light.svg", "media/icons/c4-dark.svg"]);
    for (const path of iconPaths) {
      expect(existsSync(new URL(`../${path}`, import.meta.url)), path).toBe(true);
      expect(isIgnored(path), path).toBe(false);
    }
  });
});

describe("every command the extension registers", () => {
  const subscriptions: Array<{ dispose(): unknown }> = [];

  beforeEach(() => {
    fakeVsCode.reset();
    activate({
      extensionUri: FakeUri.file("/extension"),
      subscriptions,
    } as unknown as vscode.ExtensionContext);
  });
  afterEach(() => {
    for (const subscription of subscriptions.splice(0)) subscription.dispose();
  });

  it("is contributed, and every contributed command is registered", () => {
    expect(fakeVsCode.registeredCommandIds().sort()).toEqual([...commandById.keys()].sort());
  });
});
