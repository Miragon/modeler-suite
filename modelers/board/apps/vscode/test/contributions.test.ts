import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { BOARD_SETTINGS, SAVE_MODELS_SETTING } from "../src/boardEditor.js";
import { BOARD_VIEW_TYPE } from "../src/boardEditorOptions.js";
import {
  NEW_BOARD_COMMAND,
  NEW_BOARD_FROM_EXAMPLE_COMMAND,
  OPEN_SOURCE_COMMAND,
} from "../src/commands.js";

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
    commands: Array<{
      command: string;
      title: string;
      category: string;
      shortTitle?: string;
      icon?: string;
    }>;
    menus: Record<string, Array<{ command: string; when?: string; group?: string }>>;
    keybindings?: unknown;
    configuration: {
      title: string;
      properties: Record<
        string,
        { type: string; default: unknown; scope: string; markdownDescription: string }
      >;
    };
    walkthroughs: Array<{
      id: string;
      title: string;
      description: string;
      steps: Array<{
        id: string;
        title: string;
        description: string;
        media: { markdown: string };
        completionEvents: string[];
      }>;
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

describe("the extension's commands", () => {
  const { commands, menus } = manifest.contributes;
  const byId = new Map(commands.map((command) => [command.command, command]));
  const ON_BOARD = `activeCustomEditorId == ${BOARD_VIEW_TYPE}`;

  test("are the three the host registers, each under the name the code has for it, in the Board category", () => {
    expect(commands.map((command) => command.command)).toEqual([
      NEW_BOARD_COMMAND,
      NEW_BOARD_FROM_EXAMPLE_COMMAND,
      OPEN_SOURCE_COMMAND,
    ]);
    expect(commands.map((command) => command.title)).toEqual([
      "New Empty Board",
      "New Board from Example",
      "Open Source to the Side",
    ]);
    for (const command of commands) expect(command.category).toBe("Board");
  });

  test("offer a new empty board, then one from the example, in the New File menu", () => {
    expect(
      (menus["file/newFile"] ?? []).map((entry) => {
        const command = byId.get(entry.command);
        return [entry.command, entry.group, command?.shortTitle ?? command?.title];
      }),
    ).toEqual([
      [NEW_BOARD_COMMAND, "board@1", "Board"],
      [NEW_BOARD_FROM_EXAMPLE_COMMAND, "board@2", "New Board from Example"],
    ]);
  });

  // Guide §13.5: the source beside the canvas from the editor's title, with a Codicon.
  test("offer the source beside a board from the board's title and, while a board has the focus, from the Command Palette", () => {
    expect(byId.get(OPEN_SOURCE_COMMAND)?.icon).toBe("$(go-to-file)");
    expect(menus["editor/title"]).toEqual([
      { command: OPEN_SOURCE_COMMAND, when: ON_BOARD, group: "navigation" },
    ]);
    expect(menus.commandPalette).toEqual([{ command: OPEN_SOURCE_COMMAND, when: ON_BOARD }]);
  });

  test("name only declared commands in the menus, and no keybinding: the board's keys apply while its webview has the focus", () => {
    for (const entries of Object.values(menus)) {
      for (const entry of entries) expect(byId.has(entry.command), entry.command).toBe(true);
    }
    expect(manifest.contributes.keybindings).toBeUndefined();
  });
});

describe("the extension's setting", () => {
  const { configuration } = manifest.contributes;
  const key = `${BOARD_SETTINGS}.${SAVE_MODELS_SETTING}`;

  test("is the one the host reads, named in the suite's way, and off unless a person turns it on", () => {
    expect(key).toBe("miragon.board.saveModelsWithBoard");
    expect(Object.keys(configuration.properties)).toEqual([key]);
    expect(configuration.properties[key]).toMatchObject({
      type: "boolean",
      default: false,
      scope: "resource",
    });
    expect(configuration.title).toBe("Board");
  });

  test("says what is saved and when: the models edited on the board, a model whole, on a person's own save and never by auto save", () => {
    const description = configuration.properties[key]?.markdownDescription ?? "";
    expect(description).toMatch(/^When you save a board, also save the models you edited on it\./);
    expect(description).toContain("never by auto save");
    expect(description).toContain("what you changed in its own editor is saved with it");
    expect(description).toContain("changed on disk");
  });

  test("says which models stay unsaved: one whose file was removed, one reverted since, one from before a reload", () => {
    const description = configuration.properties[key]?.markdownDescription ?? "";
    expect(description).toContain("its file was removed");
    expect(description).toContain("you reverted it since the board changed it");
    expect(description).toContain("VS Code was reloaded since");
  });
});

describe("the extension's walkthrough", () => {
  const [walkthrough] = manifest.contributes.walkthroughs;
  const steps = walkthrough?.steps ?? [];
  const declared = new Set(manifest.contributes.commands.map((command) => command.command));

  test("is one, Get Started, of the board's four steps: open a board, add a model, edit it in place, save", () => {
    expect(manifest.contributes.walkthroughs).toHaveLength(1);
    expect(walkthrough).toMatchObject({ id: "getStarted", title: "Get Started with the Board" });
    expect(steps.map((step) => [step.id, step.title])).toEqual([
      ["open", "Open a board"],
      ["add", "Add a model from the picker"],
      ["edit", "Edit it in place"],
      ["save", "Save"],
    ]);
  });

  test("is done step by step: the first by either New Board command, the others when a person looks at them", () => {
    expect(steps.map((step) => step.completionEvents)).toEqual([
      [`onCommand:${NEW_BOARD_COMMAND}`, `onCommand:${NEW_BOARD_FROM_EXAMPLE_COMMAND}`],
      ["onStepSelected"],
      ["onStepSelected"],
      ["onStepSelected"],
    ]);
  });

  test("links only to commands the extension declares, and to the setting it contributes", () => {
    const links = steps.flatMap((step) =>
      [...step.description.matchAll(/\]\(command:([^)?]+)(?:\?([^)]*))?\)/g)].map((match) => ({
        command: match[1] ?? "",
        argument: match[2] === undefined ? undefined : decodeURIComponent(match[2]),
      })),
    );
    expect(links).toEqual([
      { command: NEW_BOARD_COMMAND, argument: undefined },
      { command: NEW_BOARD_FROM_EXAMPLE_COMMAND, argument: undefined },
      {
        command: "workbench.action.openSettings",
        argument: JSON.stringify([`${BOARD_SETTINGS}.${SAVE_MODELS_SETTING}`]),
      },
    ]);
    for (const { command } of links.slice(0, 2)) expect(declared.has(command)).toBe(true);
  });

  test("has a page for every step, which the VSIX takes along", () => {
    const ignored = read(".vscodeignore")
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("#"));
    expect(ignored.filter((line) => /media|\*\.md|^\*\*$/.test(line))).toEqual([]);
    for (const step of steps) {
      expect(step.media.markdown).toBe(`media/walkthrough/${step.id}.md`);
      expect(existsSync(join(APP, step.media.markdown)), step.media.markdown).toBe(true);
      expect(read(step.media.markdown)).toMatch(/^# /);
    }
    expect(readdirSync(join(APP, "media/walkthrough")).sort()).toEqual(
      steps.map((step) => `${step.id}.md`).sort(),
    );
  });

  test("names the setting and the commands on its pages as the manifest has them", () => {
    expect(read("media/walkthrough/save.md")).toContain(
      `\`${BOARD_SETTINGS}.${SAVE_MODELS_SETTING}\``,
    );
    const open = read("media/walkthrough/open.md");
    for (const command of manifest.contributes.commands) {
      expect(open, command.title).toContain(command.title);
    }
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
