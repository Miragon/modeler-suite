import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  VSCODE_SMOKE_SKIPPABLE_STEPS,
  customEditorViewType,
  defaultVsCodeCachePath,
  extensionIdOf,
  isPlainFileName,
  matchesFilenamePattern,
  platformKeys,
  resolveExtensionMain,
  vsCodeEnvironment,
  vsCodeLaunchArgs,
  vsCodeSmokeSkip,
  vsCodeUserSettings,
  type ExtensionManifest,
} from "./launch.js";

const paths = {
  userDataDir: "/scratch/run/user-data",
  extensionsDir: "/scratch/run/extensions",
  workspaceDir: "/scratch/run/workspace",
  file: "/scratch/run/workspace/board.storm",
};

describe("vsCodeLaunchArgs", () => {
  const args = vsCodeLaunchArgs("/repo/apps/vscode", paths);

  it("starts VS Code the way its own test runner does, without telemetry, updates and prompts", () => {
    expect(args).toEqual(
      expect.arrayContaining([
        "--no-sandbox",
        "--disable-gpu-sandbox",
        "--disable-updates",
        "--skip-welcome",
        "--skip-release-notes",
        "--disable-workspace-trust",
        "--disable-telemetry",
        "--disable-crash-reporter",
        "--new-window",
      ]),
    );
  });

  it("runs on a throwaway profile with the modeler's extension in development mode", () => {
    expect(args).toContain("--user-data-dir=/scratch/run/user-data");
    expect(args).toContain("--extensions-dir=/scratch/run/extensions");
    expect(args).toContain("--extensionDevelopmentPath=/repo/apps/vscode");
  });

  it("opens the workspace and then the fixture in it, last", () => {
    expect(args.slice(-2)).toEqual([
      "/scratch/run/workspace",
      "/scratch/run/workspace/board.storm",
    ]);
    expect(args.filter((arg) => !arg.startsWith("--"))).toHaveLength(2);
  });
});

describe("vsCodeUserSettings", () => {
  const settings = vsCodeUserSettings({
    colorTheme: "Default Dark Modern",
    fileName: "board.storm",
    viewType: "eventStorming.boardEditor",
  });

  it("sets the color theme and associates the fixture with the custom editor", () => {
    expect(settings["workbench.colorTheme"]).toBe("Default Dark Modern");
    expect(settings["workbench.editorAssociations"]).toEqual({
      "board.storm": "eventStorming.boardEditor",
    });
  });

  it("dispatches keys by key code, so Playwright's US keys mean the same on every keyboard layout", () => {
    expect(settings["keyboard.dispatch"]).toBe("keyCode");
  });

  it("keeps the OS's mode and contrast from overriding the theme under test", () => {
    expect(settings["window.autoDetectColorScheme"]).toBe(false);
    expect(settings["window.autoDetectHighContrast"]).toBe(false);
  });

  it("turns off telemetry, updates, the start page, the chat and auto save", () => {
    expect(settings).toMatchObject({
      "telemetry.telemetryLevel": "off",
      "update.mode": "none",
      "workbench.startupEditor": "none",
      "chat.disableAIFeatures": true,
      "files.autoSave": "off",
      "files.insertFinalNewline": false,
      "files.trimTrailingWhitespace": false,
    });
  });

  it("turns off extension updates with a value VS Code does not migrate by rewriting the file", () => {
    expect(settings).toMatchObject({
      "extensions.autoCheckUpdates": false,
      "extensions.autoUpdate": "off",
    });
  });

  it("lets extra settings win", () => {
    const extra = vsCodeUserSettings({
      colorTheme: "Default Light Modern",
      fileName: "map.wmap",
      viewType: "wardley.mapEditor",
      extra: { "workbench.reduceMotion": "on", "files.autoSave": "afterDelay" },
    });
    expect(extra["workbench.reduceMotion"]).toBe("on");
    expect(extra["files.autoSave"]).toBe("afterDelay");
  });
});

describe("vsCodeEnvironment", () => {
  it("drops the variables of a surrounding VS Code and ELECTRON_RUN_AS_NODE", () => {
    expect(
      vsCodeEnvironment({
        PATH: "/usr/bin",
        HOME: "/home/ci",
        VSCODE_IPC_HOOK_CLI: "/scratch/ipc.sock",
        vscode_pid: "12",
        ELECTRON_RUN_AS_NODE: "1",
        UNSET: undefined,
      }),
    ).toEqual({ PATH: "/usr/bin", HOME: "/home/ci" });
  });

  it("keeps VSCODE_SMOKE_SKIP, which only the test process reads, away from VS Code", () => {
    expect(vsCodeEnvironment({ VSCODE_SMOKE_SKIP: "keys" })).toEqual({});
  });
});

describe("vsCodeSmokeSkip", () => {
  it("reads the steps VSCODE_SMOKE_SKIP names, by comma or space", () => {
    expect([...vsCodeSmokeSkip({ VSCODE_SMOKE_SKIP: "workbench" })]).toEqual(["workbench"]);
    expect([...vsCodeSmokeSkip({ VSCODE_SMOKE_SKIP: " keys, keys " })]).toEqual(["keys"]);
    expect([...vsCodeSmokeSkip({ VSCODE_SMOKE_SKIP: "history,workbench" })]).toEqual([
      "history",
      "workbench",
    ]);
    expect([...vsCodeSmokeSkip({ VSCODE_SMOKE_SKIP: "workbench keys" })]).toEqual([
      "workbench",
      "keys",
    ]);
    expect(VSCODE_SMOKE_SKIPPABLE_STEPS).toEqual(["keys", "history", "workbench"]);
  });

  it("is empty without the variable or with an empty one, so every step runs", () => {
    expect(vsCodeSmokeSkip({}).size).toBe(0);
    expect(vsCodeSmokeSkip({ VSCODE_SMOKE_SKIP: "" }).size).toBe(0);
    expect(vsCodeSmokeSkip({ VSCODE_SMOKE_SKIP: " , " }).size).toBe(0);
  });

  it("throws for a name that is no step it can skip, so a typo leaves no step running unnoticed", () => {
    expect(() => vsCodeSmokeSkip({ VSCODE_SMOKE_SKIP: "keys,kyes" })).toThrow(
      'runVsCodeSmoke: VSCODE_SMOKE_SKIP names "kyes", which is no step it can skip (keys, history, workbench)',
    );
    expect(() => vsCodeSmokeSkip({ VSCODE_SMOKE_SKIP: "reload themes" })).toThrow(
      'runVsCodeSmoke: VSCODE_SMOKE_SKIP names "reload", "themes", which are no steps it can skip (keys, history, workbench)',
    );
  });
});

describe("defaultVsCodeCachePath", () => {
  it("is in the OS's cache directory, outside every repository", () => {
    expect(defaultVsCodeCachePath("darwin", {}, "/home/dev")).toBe(
      join("/home/dev", "Library", "Caches", "miragon-modeler-shell", "vscode-test"),
    );
    expect(defaultVsCodeCachePath("linux", {}, "/home/ci")).toBe(
      join("/home/ci", ".cache", "miragon-modeler-shell", "vscode-test"),
    );
    expect(
      defaultVsCodeCachePath("win32", { LOCALAPPDATA: "/profiles/dev/local" }, "/home/dev"),
    ).toBe(join("/profiles/dev/local", "miragon-modeler-shell", "vscode-test"));
  });

  it("follows XDG_CACHE_HOME on Linux and falls back where a variable is empty", () => {
    expect(defaultVsCodeCachePath("linux", { XDG_CACHE_HOME: "/var/cache/ci" }, "/home/ci")).toBe(
      join("/var/cache/ci", "miragon-modeler-shell", "vscode-test"),
    );
    expect(defaultVsCodeCachePath("linux", { XDG_CACHE_HOME: "" }, "/home/ci")).toBe(
      join("/home/ci", ".cache", "miragon-modeler-shell", "vscode-test"),
    );
    expect(defaultVsCodeCachePath("win32", {}, "/home/dev")).toBe(
      join("/home/dev", "AppData", "Local", "miragon-modeler-shell", "vscode-test"),
    );
  });
});

describe("platformKeys", () => {
  it("uses Cmd on macOS, with Cmd+Shift+Z for redo", () => {
    expect(platformKeys("darwin")).toEqual({
      modifier: "Meta",
      save: "Meta+s",
      undo: "Meta+z",
      redo: "Meta+Shift+z",
      close: "Meta+w",
    });
  });

  it("uses Ctrl elsewhere, with Ctrl+Y for redo", () => {
    for (const platform of ["linux", "win32"]) {
      expect(platformKeys(platform)).toEqual({
        modifier: "Control",
        save: "Control+s",
        undo: "Control+z",
        redo: "Control+y",
        close: "Control+w",
      });
    }
  });
});

const manifest: ExtensionManifest = {
  name: "team-topologies-modeler",
  publisher: "miragon-gmbh",
  main: "./dist/extension.cjs",
  contributes: {
    customEditors: [
      {
        viewType: "teamTopologies.editor",
        selector: [{ filenamePattern: "*.tt" }, { filenamePattern: "*.ttm.json" }],
      },
      {
        viewType: "teamTopologies.pngEditor",
        selector: [{ filenamePattern: "*.tt.png" }, { filenamePattern: "*.ttm.png" }],
      },
    ],
  },
};

describe("extensionIdOf", () => {
  it("is publisher.name", () => {
    expect(extensionIdOf(manifest)).toBe("miragon-gmbh.team-topologies-modeler");
  });

  it("is undefined without a publisher", () => {
    expect(extensionIdOf({ name: "modeler" })).toBeUndefined();
  });
});

describe("matchesFilenamePattern", () => {
  it("matches the base name against a star pattern", () => {
    expect(matchesFilenamePattern("*.storm", "board.storm")).toBe(true);
    expect(matchesFilenamePattern("*.storm", "board.storm.bak")).toBe(false);
    expect(matchesFilenamePattern("*.ttm.json", "teams.ttm.json")).toBe(true);
    expect(matchesFilenamePattern("*.ttm.json", "teams.json")).toBe(false);
  });

  it("knows ?, braces and VS Code's case-insensitive matching", () => {
    expect(matchesFilenamePattern("map.?map", "map.wmap")).toBe(true);
    expect(matchesFilenamePattern("*.{wmap,owm}", "tea.owm")).toBe(true);
    expect(matchesFilenamePattern("*.{wmap,owm}", "tea.md")).toBe(false);
    expect(matchesFilenamePattern("*.WMAP", "tea.wmap")).toBe(true);
  });

  it("lets a globstar segment stand for any directories, none included, as VS Code does", () => {
    expect(matchesFilenamePattern("**/*.storm", "board.storm")).toBe(true);
    expect(matchesFilenamePattern("**/*.{wmap,owm}", "tea.wmap")).toBe(true);
    expect(matchesFilenamePattern("**/*.{wmap,owm}", "tea.md")).toBe(false);
    expect(matchesFilenamePattern("**/board.storm", "board.storm")).toBe(true);
    expect(matchesFilenamePattern("**/*.storm", "boards/q3/board.storm")).toBe(true);
    expect(matchesFilenamePattern("boards/**/*.storm", "boards/board.storm")).toBe(true);
    expect(matchesFilenamePattern("*/board.storm", "board.storm")).toBe(false);
  });

  it("takes dots and other regular-expression characters literally", () => {
    expect(matchesFilenamePattern("*.vc", "chainxvc")).toBe(false);
    expect(matchesFilenamePattern("(a)+.vc", "(a)+.vc")).toBe(true);
  });
});

describe("resolveExtensionMain", () => {
  const extensionPath = mkdtempSync(join(tmpdir(), "modeler-shell-main-"));
  mkdirSync(join(extensionPath, "out", "lib"), { recursive: true });
  writeFileSync(join(extensionPath, "package.json"), "{}");
  writeFileSync(join(extensionPath, "out", "extension.js"), "");
  writeFileSync(join(extensionPath, "out", "extension.cjs"), "");
  writeFileSync(join(extensionPath, "out", "bundle.cjs"), "");
  writeFileSync(join(extensionPath, "out", "lib", "index.js"), "");
  afterAll(() => rmSync(extensionPath, { recursive: true, force: true }));

  it("finds main as given, without its .js, and as a folder's index.js, as Node's require does", () => {
    expect(resolveExtensionMain(extensionPath, "./out/extension.cjs")).toMatch(/extension\.cjs$/);
    expect(resolveExtensionMain(extensionPath, "out/extension.js")).toMatch(/extension\.js$/);
    expect(resolveExtensionMain(extensionPath, "./out/extension")).toMatch(/extension\.js$/);
    expect(resolveExtensionMain(extensionPath, "./out/lib")).toMatch(/index\.js$/);
  });

  it("is undefined for a main that is not built, and adds no .cjs, as Node does not", () => {
    expect(resolveExtensionMain(extensionPath, "./dist/extension.cjs")).toBeUndefined();
    expect(resolveExtensionMain(extensionPath, "./out/missing")).toBeUndefined();
    expect(resolveExtensionMain(extensionPath, "./out/bundle")).toBeUndefined();
  });
});

describe("customEditorViewType", () => {
  it("is the first custom editor whose selector matches", () => {
    expect(customEditorViewType(manifest, "teams.ttm.json")).toBe("teamTopologies.editor");
    expect(customEditorViewType(manifest, "teams.tt.png")).toBe("teamTopologies.pngEditor");
  });

  it("accepts a globstar selector", () => {
    const storm: ExtensionManifest = {
      contributes: {
        customEditors: [
          { viewType: "eventStorming.boardEditor", selector: [{ filenamePattern: "**/*.storm" }] },
        ],
      },
    };
    expect(customEditorViewType(storm, "board.storm")).toBe("eventStorming.boardEditor");
  });

  it("is undefined when no editor opens the file", () => {
    expect(customEditorViewType(manifest, "notes.md")).toBeUndefined();
    expect(customEditorViewType({}, "board.storm")).toBeUndefined();
  });
});

describe("isPlainFileName", () => {
  it("takes a file name without a path or glob characters", () => {
    expect(isPlainFileName("board.storm")).toBe(true);
    expect(isPlainFileName("teams.ttm.json")).toBe(true);
    for (const name of [
      "",
      ".hidden",
      "dir/board.storm",
      "*.storm",
      "a b.storm",
      "../board.storm",
    ]) {
      expect(isPlainFileName(name)).toBe(false);
    }
  });
});
