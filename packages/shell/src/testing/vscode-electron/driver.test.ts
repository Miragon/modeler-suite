import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import {
  fakeTestElectron,
  readInstall,
  type InstallContent,
} from "../../../test/support/test-electron.js";
import { runVsCodeSmoke, type VsCodeSmokeOptions } from "./driver.js";
import { platformKeys } from "./launch.js";
import {
  VSCODE_COLOR_THEMES,
  expectedWebviewAppearance,
  webviewBodyClasses,
  workbenchThemeClass,
} from "./themes.js";
import {
  activeEditorDirtyProbe,
  activeTextEditorProbe,
  blurProbe,
  canvasFactsProbe,
  chromeProbe,
  documentMarkedProbe,
  focusCanvasProbe,
  focusFrameProbe,
  installKeyRecorderProbe,
  installSizeRecorderProbe,
  legendOpenProbe,
  markDocumentProbe,
  settleProbe,
  takeKeyRecordsProbe,
  takeSizeRecordsProbe,
  takeViewFramesProbe,
  toggleLegendProbe,
  viewFactsProbe,
  watchViewFramesProbe,
  webviewFrameShownProbe,
  webviewMotionProbe,
  webviewThemeProbe,
  workbenchClassesProbe,
  workbenchFocusProbe,
  workbenchWebviewsProbe,
  type CanvasFacts,
  type ViewFacts,
} from "./webview.js";

const peers = vi.hoisted(() => ({
  download: (_options: { cachePath?: string | undefined }): Promise<string> => {
    throw new Error("no download set");
  },
  launch: (_options: { executablePath: string; args: string[] }): Promise<unknown> => {
    throw new Error("no launch set");
  },
}));
vi.mock("@vscode/test-electron", () => ({
  downloadAndUnzipVSCode: (options: { cachePath?: string }) => peers.download(options),
}));
vi.mock("playwright-core", () => ({
  _electron: {
    launch: (options: { executablePath: string; args: string[] }) => peers.launch(options),
  },
}));

const directory = mkdtempSync(join(tmpdir(), "modeler-shell-driver-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

async function builtExtension(): Promise<string> {
  const extensionPath = join(directory, "extension");
  await mkdir(extensionPath, { recursive: true });
  await writeFile(join(extensionPath, "extension.js"), "");
  await writeFile(
    join(extensionPath, "package.json"),
    JSON.stringify({
      name: "board",
      publisher: "miragon",
      main: "./extension.js",
      contributes: {
        customEditors: [{ viewType: "board.editor", selector: [{ filenamePattern: "*.board" }] }],
      },
    }),
  );
  return extensionPath;
}

describe("runVsCodeSmoke, resolve", () => {
  it("lets two runs resolve a VS Code that is not cached yet at once, and each starts a complete install", async () => {
    const cachePath = join(directory, "cache");
    const fake = fakeTestElectron({ pauseUnpacking: true });
    const started: InstallContent[] = [];
    peers.download = fake.download;
    peers.launch = async ({ executablePath }) => {
      started.push(await readInstall(dirname(executablePath)));
      throw new Error("no VS Code in a unit test");
    };
    const lines: string[] = [];
    const options = {
      extensionPath: await builtExtension(),
      fixture: { fileName: "plan.board", text: "board" },
      parse: () => undefined,
      cachePath,
      log: (line: string) => lines.push(line),
    };

    // The second run starts while the first one is still unpacking.
    const first = runVsCodeSmoke(options);
    await fake.paused(0);
    const second = runVsCodeSmoke(options);
    await fake.paused(1);
    fake.resume(0);
    const firstResult = await first;
    fake.resume(1);
    const secondResult = await second;

    const executablePath = join(cachePath, fake.folderName, "code");
    const installOfA: InstallContent = { code: "A", app: "A", complete: true };
    expect(fake.unpacked).toEqual(["A", "B"]);
    expect(started).toEqual([installOfA, installOfA]);
    expect(await readInstall(join(cachePath, fake.folderName))).toEqual(installOfA);
    expect(await readdir(cachePath)).toEqual([fake.folderName]);
    for (const result of [firstResult, secondResult]) {
      expect(result.executablePath).toBe(executablePath);
      expect(result.failures).toEqual(["launch: no VS Code in a unit test"]);
    }
    expect(lines).toContain(
      `resolve: another run installed ${join(cachePath, fake.folderName)} first, this run uses that one`,
    );
  });
});

const OWN_WEBVIEW =
  "vscode-webview://1p2hs8aci08/index.html?id=9ea65fea&parentId=1&extensionId=miragon.board&platform=electron";
const WORKBENCH_SCRIPT =
  "vscode-file://vscode-app/opt/vscode/resources/app/out/vs/workbench/workbench.desktop.main.js";
const OTHER_BUNDLE =
  "https://file+.vscode-resource.vscode-cdn.net/opt/vscode/resources/app/extensions/markdown-language-features/media/index.js";

/** How VS Code's webview loads a file of the extension's folder. */
function resourceUrl(folder: string, relativePath: string): string {
  return `https://file+.vscode-resource.vscode-cdn.net${pathToFileURL(join(folder, relativePath)).pathname}`;
}

function thrown(message: string, url: string): Error {
  const error = new Error(message);
  error.stack = `Error: ${message}\n    at ${url}:2:31\n    at ${url}:3:1`;
  return error;
}

function consoleError(text: string, url: string) {
  return {
    type: () => "error",
    text: () => text,
    location: () => ({ url, lineNumber: 0, columnNumber: 0 }),
  };
}

interface FakeVsCodeOptions {
  /** Whether the webview shows the shell's menu. */
  menu: boolean;
  /** What the window reports, by default once the driver first looks for the menu. */
  report?: ((window: EventEmitter) => void) | undefined;
  /** `launch`: the window reports while the workbench loads, before the open step. */
  reportAt?: "launch" | "open" | undefined;
  /** What the webview's document shows; without it the document answers no `evaluate`. */
  document?: { shapes: number; chrome?: Record<string, boolean> } | undefined;
  /** How the workbench's check for a text editor fails; it finds none without it. */
  textEditorCheckFails?: string | undefined;
  /** What VS Code writes into its extension host log at start. */
  extensionHostLog?: string | undefined;
  /** A document that is edited, saved, undone and redone; the canvas, the view and the keys follow it. */
  editing?: FakeEditing | undefined;
  /** The workbench around the editor: settings, a second editor, Reload Window. */
  workbench?: FakeWorkbench | undefined;
}

/** The part of a VS Code window that a document with a history drives. */
interface FakeEditing {
  press(chord: string, file: string): void;
  dirty(): boolean;
  canvas(): CanvasFacts;
  view(): ViewFacts;
}

/** An answer of the fake workbench; undefined leaves the probe to the rest of the fake. */
type FakeAnswer = { value: unknown } | undefined;

/** The part of a VS Code window that the workbench steps drive. */
interface FakeWorkbench {
  /** VS Code started with this profile. */
  attach(userDataDir: string): void;
  /** Whether the workbench took the key; the document gets the others. */
  press(chord: string): boolean;
  webview(probe: unknown, argument: unknown): FakeAnswer;
  page(probe: unknown, argument: unknown): FakeAnswer;
}

/**
 * A VS Code window as far as the launch and the open step reach it: Playwright's `console` and
 * `pageerror` events, the workbench with the extension's webview frame, and the webview's
 * document, which answers the driver's canvas and chrome probes until the application closes.
 */
function fakeVsCode(options: FakeVsCodeOptions) {
  const window = new EventEmitter();
  let reported = false;
  let closed = false;
  const report = (at: "launch" | "open") => {
    if (reported || (options.reportAt ?? "open") !== at) return;
    reported = true;
    options.report?.(window);
  };
  const webview = {
    first: () => webview,
    contentFrame: () => webview,
    locator: () => webview,
    isVisible: async () => {
      report("open");
      return options.menu;
    },
    evaluate: async (probe: unknown, argument?: unknown) => {
      if (closed)
        throw new Error("locator.evaluate: Target page, context or browser has been closed");
      const shown = options.document;
      if (!shown) throw new Error("the fake webview has no document");
      const answer = options.workbench?.webview(probe, argument);
      if (answer) return answer.value;
      if (options.editing) {
        if (probe === canvasFactsProbe) return options.editing.canvas();
        if (probe === viewFactsProbe) return options.editing.view();
        if (probe === focusCanvasProbe) return true;
      }
      if (probe === canvasFactsProbe) {
        return {
          shapes: shown.shapes,
          connections: 0,
          positions: Array.from({ length: shown.shapes }, () => "0,0"),
        };
      }
      if (probe === chromeProbe) return shown.chrome ?? { menu: true, palette: true, zoom: true };
      if (probe === settleProbe || probe === blurProbe || probe === installKeyRecorderProbe) {
        return undefined;
      }
      // A canvas that takes no focus ends the keys step before its first key.
      if (probe === focusCanvasProbe) return false;
      throw new Error(
        "the fake webview answers only the probes of the open step and the keys' start",
      );
    },
  };
  let workspaceFile = "";
  Object.assign(window, {
    keyboard: {
      press: async (chord: string) => {
        if (!options.workbench?.press(chord)) options.editing?.press(chord, workspaceFile);
      },
    },
    setDefaultTimeout: () => undefined,
    waitForSelector: async () => report("launch"),
    locator: () => webview,
    evaluate: async (probe: unknown, argument?: unknown) => {
      const answer = options.workbench?.page(probe, argument);
      if (answer) return answer.value;
      if (probe === workbenchWebviewsProbe) return [OWN_WEBVIEW];
      if (probe === activeTextEditorProbe) {
        if (options.textEditorCheckFails) throw new Error(options.textEditorCheckFails);
        return false;
      }
      if (probe === activeEditorDirtyProbe) return options.editing?.dirty() ?? false;
      return undefined;
    },
    screenshot: async ({ path }: { path: string }) => writeFile(path, ""),
  });
  const electron = {
    BrowserWindow: {
      getAllWindows: () => [
        { id: 1, webContents: { getZoomLevel: () => 0 }, setContentSize: () => undefined },
      ],
    },
    clipboard: { availableFormats: () => [], readText: () => "" },
  };
  const app = {
    firstWindow: async () => window,
    evaluate: async (main: (module: typeof electron, argument: unknown) => unknown, arg: unknown) =>
      main(electron, arg),
    close: async () => {
      closed = true;
    },
    process: () => ({ kill: () => true }),
  };
  peers.download = fakeTestElectron().download;
  peers.launch = async ({ args }) => {
    workspaceFile = args.at(-1)!;
    const userDataDir = args.find((arg) => arg.startsWith("--user-data-dir="))!.split("=")[1]!;
    options.workbench?.attach(userDataDir);
    if (options.extensionHostLog !== undefined) {
      const logs = join(userDataDir, "logs", "20261024T100000", "window1", "exthost");
      await mkdir(logs, { recursive: true });
      await writeFile(join(logs, "exthost.log"), options.extensionHostLog);
    }
    return app;
  };
}

async function smokeOptions(
  overrides: Partial<VsCodeSmokeOptions> = {},
): Promise<VsCodeSmokeOptions> {
  return {
    extensionPath: await builtExtension(),
    fixture: { fileName: "plan.board", text: "board" },
    parse: () => undefined,
    cachePath: join(directory, "cache-open"),
    ...overrides,
  };
}

describe("runVsCodeSmoke, open", () => {
  it(
    "fails the open step 3 s after the extension's webview threw, with the webview's errors and their stacks",
    { timeout: 30_000 },
    async () => {
      const options = await smokeOptions({
        timeoutMs: 20_000,
        screenshotDir: join(directory, "screenshots"),
      });
      // The real path, as VS Code may load the extension from it (macOS's /var is /private/var).
      const bundle = resourceUrl(realpathSync(options.extensionPath), "dist/webview.js");
      const stylesheet = resourceUrl(options.extensionPath, "dist/webview.css");
      fakeVsCode({
        menu: false,
        report: (window) => {
          window.emit(
            "console",
            consoleError(
              "%c  ERR color: #f33 Extension 'github.copilot-chat' appears in product.json",
              WORKBENCH_SCRIPT,
            ),
          );
          window.emit("pageerror", thrown("the preview cannot start", OTHER_BUNDLE));
          window.emit(
            "console",
            consoleError("Failed to load resource: net::ERR_FILE_NOT_FOUND", stylesheet),
          );
          window.emit("pageerror", thrown("board.js cannot start: no #app", bundle));
        },
      });

      const result = await runVsCodeSmoke(options);

      const screenshot = join(resolve(directory, "screenshots"), "board-open-failure.png");
      expect(result.failures).toEqual([
        [
          "open: the custom editor never showed the shell's menu, still missing 3 s after its webview threw " +
            `(1 webview frames in the workbench, 1 of miragon.board, screenshot ${screenshot}; ` +
            "keepTemporaryFiles keeps VS Code's logs); " +
            "the webview reported 1 uncaught error and 1 console error:",
          "    uncaught Error: board.js cannot start: no #app",
          `        at ${bundle}:2:31`,
          `        at ${bundle}:3:1`,
          "    console.error: Failed to load resource: net::ERR_FILE_NOT_FOUND",
          `        at ${stylesheet}:1:1`,
        ].join("\n"),
      ]);
      expect(result.timings.open).toBeGreaterThanOrEqual(3_000);
      expect(result.timings.open).toBeLessThan(10_000);
      expect(await readdir(join(directory, "screenshots"))).toEqual(["board-open-failure.png"]);
    },
  );

  it(
    "waits the whole timeout, past the grace for a throw, for a webview that only logged errors, and lists them",
    { timeout: 30_000 },
    async () => {
      const options = await smokeOptions({ timeoutMs: 4_500, keepTemporaryFiles: true });
      const bundle = resourceUrl(options.extensionPath, "dist/webview.js");
      fakeVsCode({
        menu: false,
        report: (window) =>
          window.emit(
            "console",
            consoleError(`no fixture yet Error: empty\n    at ${bundle}:7:9`, bundle),
          ),
      });
      const lines: string[] = [];

      const result = await runVsCodeSmoke({ ...options, log: (line) => lines.push(line) });

      const kept = lines.find((line) => line.startsWith("kept "))!.slice("kept ".length);
      rmSync(kept, { recursive: true, force: true });
      expect(result.failures).toEqual([
        [
          "open: the custom editor never showed the shell's menu " +
            "(1 webview frames in the workbench, 1 of miragon.board; " +
            `VS Code's logs are in ${join(kept, "user-data", "logs")}); ` +
            "the webview reported 1 console error:",
          "    console.error: no fixture yet Error: empty",
          `        at ${bundle}:7:9`,
        ].join("\n"),
      ]);
      expect(result.timings.open).toBeGreaterThanOrEqual(4_500);
    },
  );

  it(
    "keeps an error the webview threw while the workbench loaded, before the open step",
    { timeout: 30_000 },
    async () => {
      const options = await smokeOptions({ timeoutMs: 20_000 });
      const bundle = resourceUrl(options.extensionPath, "dist/webview.js");
      fakeVsCode({
        menu: false,
        reportAt: "launch",
        report: (window) => window.emit("pageerror", thrown("board.js cannot start", bundle)),
      });

      const result = await runVsCodeSmoke(options);

      expect(result.failures).toEqual([
        [
          "open: the custom editor never showed the shell's menu, still missing 3 s after its webview threw " +
            "(1 webview frames in the workbench, 1 of miragon.board; keepTemporaryFiles keeps VS Code's logs); " +
            "the webview reported 1 uncaught error:",
          "    uncaught Error: board.js cannot start",
          `        at ${bundle}:2:31`,
          `        at ${bundle}:3:1`,
        ].join("\n"),
      ]);
      expect(result.timings.open).toBeLessThan(10_000);
    },
  );

  it(
    "fails the open step 3 s after the webview threw while the menu shows but the canvas stays empty",
    { timeout: 30_000 },
    async () => {
      const options = await smokeOptions({ timeoutMs: 20_000 });
      const bundle = resourceUrl(options.extensionPath, "dist/webview.js");
      fakeVsCode({
        menu: true,
        document: { shapes: 0 },
        report: (window) => window.emit("pageerror", thrown("importBoard: no lanes", bundle)),
      });

      const result = await runVsCodeSmoke(options);

      expect(result.failures).toEqual([
        [
          "open: the canvas shows no element of the fixture 3 s after its webview threw; " +
            "the webview reported 1 uncaught error:",
          "    uncaught Error: importBoard: no lanes",
          `        at ${bundle}:2:31`,
          `        at ${bundle}:3:1`,
        ].join("\n"),
      ]);
      expect(result.timings.open).toBeGreaterThanOrEqual(3_000);
      expect(result.timings.open).toBeLessThan(10_000);
    },
  );

  it("adds the webview's errors to a missing island", async () => {
    const options = await smokeOptions();
    const bundle = resourceUrl(options.extensionPath, "dist/webview.js");
    fakeVsCode({
      menu: true,
      document: { shapes: 1, chrome: { menu: true, palette: false, zoom: true } },
      report: (window) =>
        window.emit("console", consoleError("palette: no entry for the board", bundle)),
    });

    const result = await runVsCodeSmoke({
      ...options,
      edit: async () => {
        throw new Error("the test ends after the open step");
      },
    });

    expect(result.failures.filter((failure) => failure.startsWith("open: "))).toEqual([
      [
        `open: the shell's chrome is incomplete: [data-chrome="palette"] not visible; ` +
          "the webview reported 1 console error:",
        "    console.error: palette: no entry for the board",
        `        at ${bundle}:1:1`,
      ].join("\n"),
    ]);
    expect(result.failures).toContain("edit: the test ends after the open step");
  });

  it("adds the webview's errors to a Playwright error while it waits for the menu", async () => {
    const options = await smokeOptions();
    const bundle = resourceUrl(options.extensionPath, "dist/webview.js");
    fakeVsCode({
      menu: false,
      textEditorCheckFails: "page.evaluate: Execution context was destroyed\nCall log: …",
      report: (window) => window.emit("pageerror", thrown("board.js cannot start", bundle)),
    });

    const result = await runVsCodeSmoke(options);

    expect(result.failures).toEqual([
      [
        "open: page.evaluate: Execution context was destroyed; the webview reported 1 uncaught error:",
        "    uncaught Error: board.js cannot start",
        `        at ${bundle}:2:31`,
        `        at ${bundle}:3:1`,
      ].join("\n"),
    ]);
  });

  it("still fails at once with VS Code's error when the extension did not activate", async () => {
    fakeVsCode({
      menu: false,
      extensionHostLog: [
        "2026-10-24 10:00:01.100 [error] Activating extension miragon.board failed due to an error:",
        "2026-10-24 10:00:01.100 [error] Error: Cannot find module './impl/format'",
      ].join("\n"),
    });

    const result = await runVsCodeSmoke(await smokeOptions({ timeoutMs: 20_000 }));

    expect(result.failures).toEqual([
      "open: the custom editor never showed the shell's menu: " +
        "Activating extension miragon.board failed due to an error: Error: Cannot find module './impl/format' " +
        "(1 webview frames in the workbench, 1 of miragon.board; keepTemporaryFiles keeps VS Code's logs)",
    ]);
    expect(result.timings.open).toBeLessThan(10_000);
  });

  it("adds the webview's errors to a failure after the menu showed", async () => {
    const options = await smokeOptions();
    const bundle = resourceUrl(options.extensionPath, "dist/webview.js");
    fakeVsCode({
      menu: true,
      report: (window) => window.emit("pageerror", thrown("importBoard: no lanes", bundle)),
    });

    const result = await runVsCodeSmoke({
      ...options,
      ready: async () => {
        throw new Error("the canvas shows no element of the fixture\nCall log: …");
      },
    });

    expect(result.failures).toEqual([
      [
        "open: the canvas shows no element of the fixture; the webview reported 1 uncaught error:",
        "    uncaught Error: importBoard: no lanes",
        `        at ${bundle}:2:31`,
        `        at ${bundle}:3:1`,
      ].join("\n"),
    ]);
  });
});

describe("runVsCodeSmoke, keys", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function smokeUpToKeys(overrides: Partial<VsCodeSmokeOptions> = {}) {
    fakeVsCode({ menu: true, document: { shapes: 1 } });
    return runVsCodeSmoke(
      await smokeOptions({
        edit: async () => {
          throw new Error("the test skips the edit");
        },
        colorThemes: [],
        ...overrides,
      }),
    );
  }

  it("runs the keys step after the themes when the modeler opts in", async () => {
    const result = await smokeUpToKeys({ keys: true });

    expect(result.failures).toEqual([
      "edit: the test skips the edit",
      "keys: the canvas <svg> did not take the focus",
    ]);
    expect(result.keys).toEqual({
      zoom: [],
      windowZoomLevels: { before: [0], after: [0] },
      selected: 0,
    });
    expect(Object.keys(result.timings)).toEqual([
      "resolve",
      "launch",
      "open",
      "edit",
      "themes",
      "keys",
      "close",
      "total",
    ]);
  });

  it("runs it for VSCODE_SMOKE_OPT_IN=keys, unless the modeler passes keys: false", async () => {
    vi.stubEnv("VSCODE_SMOKE_OPT_IN", "keys");

    expect((await smokeUpToKeys()).failures).toContain(
      "keys: the canvas <svg> did not take the focus",
    );
    const optedOut = await smokeUpToKeys({ keys: false });
    expect(optedOut.keys).toBeUndefined();
    expect(optedOut.timings.keys).toBeUndefined();
  });

  it("skips it by default", async () => {
    vi.stubEnv("VSCODE_SMOKE_OPT_IN", "");

    const result = await smokeUpToKeys();

    expect(result.failures).toEqual(["edit: the test skips the edit"]);
    expect(result.keys).toBeUndefined();
    expect(result.timings.keys).toBeUndefined();
  });

  it("throws before it starts VS Code for an unknown step in VSCODE_SMOKE_OPT_IN", async () => {
    vi.stubEnv("VSCODE_SMOKE_OPT_IN", "key");

    await expect(smokeUpToKeys()).rejects.toThrow(
      'runVsCodeSmoke: VSCODE_SMOKE_OPT_IN names "key", which is no opt-in step (keys, history, workbench)',
    );
  });
});

interface FakeDocumentOptions {
  /** How many document edits the edit makes; the undo and the redo move one of them per key. Default 1. */
  steps?: number | undefined;
  /** The redo key changes nothing. */
  redoDoesNothing?: boolean | undefined;
  /** The undo key changes nothing. */
  undoDoesNothing?: boolean | undefined;
  /** An import after the undo or the redo drops the selection, as a modeler that restores none would. */
  dropsSelection?: boolean | undefined;
}

/**
 * A document with the history VS Code keeps for it: the fixture's text, the edited text the edit
 * made (the texts between them, where the edit made more than one document edit, show the
 * fixture's shapes), the file on disk the save writes, and a canvas that draws one more shape for
 * the edited text. The view keeps its zoom through the imports an undo and a redo cause, and the
 * selection keeps what the canvas still draws.
 */
function fakeDocument(original: string, options: FakeDocumentOptions = {}) {
  const keys = platformKeys(process.platform);
  const steps = options.steps ?? 1;
  const edited = `${original} edited`;
  let position = 0;
  let onDisk = original;
  let scale = 0.62;
  let selected: string[] = [];
  const textAt = (index: number) =>
    index === 0 ? original : index === steps ? edited : `${original} edit ${index}`;
  const drawn = () => (position === steps ? ["a", "b", "c", "d"] : ["a", "b", "c"]);
  const importPosition = (next: number) => {
    position = next;
    const kept = new Set(drawn());
    selected = options.dropsSelection ? [] : selected.filter((id) => kept.has(id));
  };
  const editing: FakeEditing = {
    press(chord, file) {
      if (chord === keys.save) {
        onDisk = textAt(position);
        writeFileSync(file, onDisk);
      } else if (chord === keys.undo && !options.undoDoesNothing && position > 0) {
        importPosition(position - 1);
      } else if (chord === keys.redo && !options.redoDoesNothing && position < steps) {
        importPosition(position + 1);
      } else if (chord === `${keys.modifier}+Equal`) scale *= 1.35;
      else if (chord === `${keys.modifier}+Minus`) scale /= 1.35;
      else if (chord === "Shift+Digit1") scale = 0.62;
      else if (chord === `${keys.modifier}+KeyA`) selected = drawn();
    },
    dirty: () => textAt(position) !== onDisk,
    canvas: () => ({
      shapes: drawn().length,
      connections: 0,
      positions: drawn().map((_, index) => `${index * 100},0`),
    }),
    view: () => ({
      scale,
      translateX: 12,
      translateY: -8,
      elements: drawn(),
      selected: [...selected],
    }),
  };
  return {
    keys,
    editing,
    edit: async () => importPosition(steps),
    diskText: (file: string) => readFileSync(file, "utf8"),
  };
}

describe("runVsCodeSmoke, history", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function smokeEditing(
    document: ReturnType<typeof fakeDocument>,
    overrides: Partial<VsCodeSmokeOptions> = {},
    lines: string[] = [],
  ) {
    fakeVsCode({ menu: true, document: { shapes: 3 }, editing: document.editing });
    return runVsCodeSmoke(
      await smokeOptions({
        edit: document.edit,
        colorThemes: [],
        timeoutMs: 2_000,
        log: (line) => lines.push(line),
        ...overrides,
      }),
    );
  }

  it(
    "redoes and undoes the edit after the keys, and checks the zoomed view and the selection",
    { timeout: 30_000 },
    async () => {
      const document = fakeDocument("board");
      const lines: string[] = [];

      const result = await smokeEditing(document, { history: true }, lines);

      expect(result.failures).toEqual([]);
      expect(result.undone).toBe(true);
      expect(result.history).toEqual({
        before: { zoom: 84, selected: 3 },
        afterRedo: { zoom: 84, selected: 3 },
        afterUndo: { zoom: 84, selected: 3 },
      });
      expect(lines).toContain(
        "history: view 84% with 3 selected, after the redo 84% with 3 selected, after the undo 84% with 3 selected",
      );
      expect(Object.keys(result.timings)).toEqual([
        "resolve",
        "launch",
        "open",
        "edit",
        "save",
        "undo",
        "themes",
        "history",
        "close",
        "total",
      ]);
      expect(document.editing.dirty()).toBe(false);
    },
  );

  it(
    "runs it for VSCODE_SMOKE_OPT_IN=history, unless the modeler passes history: false",
    { timeout: 30_000 },
    async () => {
      vi.stubEnv("VSCODE_SMOKE_OPT_IN", "history");

      const optedIn = await smokeEditing(fakeDocument("board"));
      expect(optedIn.history?.afterUndo).toEqual({ zoom: 84, selected: 3 });

      const optedOut = await smokeEditing(fakeDocument("board"), { history: false });
      expect(optedOut.history).toBeUndefined();
      expect(optedOut.timings.history).toBeUndefined();
    },
  );

  it(
    "presses the redo and the undo key as often as the undo step does",
    { timeout: 30_000 },
    async () => {
      const document = fakeDocument("board", { steps: 3 });

      const result = await smokeEditing(document, { history: true, undoSteps: 3 });

      expect(result.failures).toEqual([]);
      expect(result.undone).toBe(true);
      expect(result.history?.afterRedo).toEqual({ zoom: 84, selected: 3 });
      expect(result.history?.afterUndo).toEqual({ zoom: 84, selected: 3 });
      expect(document.editing.dirty()).toBe(false);
    },
  );

  it("skips it by default", { timeout: 30_000 }, async () => {
    vi.stubEnv("VSCODE_SMOKE_OPT_IN", "");

    const result = await smokeEditing(fakeDocument("board"));

    expect(result.failures).toEqual([]);
    expect(result.history).toBeUndefined();
    expect(result.timings.history).toBeUndefined();
  });

  it("fails the history step with a redo that changes nothing", { timeout: 30_000 }, async () => {
    const document = fakeDocument("board", { redoDoesNothing: true });

    const result = await smokeEditing(document, { history: true });

    expect(result.failures).toEqual([
      `history: ${document.keys.redo} did not bring the edit back: the canvas shows 3 shapes and 0 connections, after the edit 4 shapes and 0 connections`,
    ]);
    expect(result.history?.afterRedo).toBeUndefined();
  });

  it("names an import that drops the selection", { timeout: 30_000 }, async () => {
    const document = fakeDocument("board", { dropsSelection: true });

    const result = await smokeEditing(document, { history: true });

    expect(result.failures).toEqual([
      `history: ${document.keys.redo} dropped the selection of a, b, c, which are still on the canvas`,
    ]);
  });

  it(
    "is skipped, and says so, when the edit never reached a saved document",
    { timeout: 30_000 },
    async () => {
      const lines: string[] = [];

      const result = await smokeEditing(
        fakeDocument("board"),
        { history: true, timeoutMs: 1_000, edit: async () => undefined },
        lines,
      );

      expect(result.failures).toEqual([
        "edit: the document did not change (its editor never turned dirty)",
      ]);
      expect(result.history).toBeUndefined();
      expect(lines).toContain(
        "history: skipped, the edit was not saved, so there was nothing to undo",
      );
    },
  );

  it(
    "is skipped, and says so, when the undo step did not bring the canvas back",
    { timeout: 30_000 },
    async () => {
      const document = fakeDocument("board", { undoDoesNothing: true });
      const lines: string[] = [];

      const result = await smokeEditing(document, { history: true, timeoutMs: 1_000 }, lines);

      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures.every((failure) => failure.startsWith("undo: "))).toBe(true);
      expect(result.history).toBeUndefined();
      expect(lines).toContain("history: skipped, the undo step did not bring the canvas back");
    },
  );
});

interface FakeWorkbenchOptions {
  /** The shell does not mirror VS Code's reduced-motion class on `<html>`. */
  noMirror?: boolean | undefined;
}

/**
 * The workbench around the fake document: it reads the profile's `settings.json` as VS Code watches
 * it (the theme and `workbench.reduceMotion` show on `.monaco-workbench` and in the webview),
 * Cmd/Ctrl+N opens an untitled text editor in front of the modeler's, which takes the keys until
 * Cmd/Ctrl+W closes it, and Cmd/Ctrl+R reloads the window: a new workbench and webview document,
 * with the document's unsaved change and the view kept.
 */
function fakeWorkbench(
  document: ReturnType<typeof fakeDocument>,
  options: FakeWorkbenchOptions = {},
) {
  const { keys, editing } = document;
  let settingsFile = "";
  let untitled: string | undefined;
  let pageMarked = false;
  let webviewMarked = false;
  let reloads = 0;
  let recording: { start: string; fitted: boolean } | undefined;

  const settings = (): Record<string, unknown> => {
    try {
      return JSON.parse(readFileSync(settingsFile, "utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  const theme = () =>
    VSCODE_COLOR_THEMES.find((entry) => entry.name === settings()["workbench.colorTheme"]) ??
    VSCODE_COLOR_THEMES[0]!;
  const reduced = () => settings()["workbench.reduceMotion"] === "on";
  const viewString = () => `${editing.view().scale}`;

  const workbench: FakeWorkbench = {
    attach(userDataDir) {
      settingsFile = join(userDataDir, "User", "settings.json");
    },
    press(chord) {
      if (chord === `${keys.modifier}+KeyR`) {
        pageMarked = false;
        webviewMarked = false;
        reloads += 1;
        return true;
      }
      if (untitled === undefined) {
        if (chord === `${keys.modifier}+KeyN`) {
          untitled = "";
          return true;
        }
        if (chord === "Shift+Digit1" && recording) recording.fitted = true;
        return false;
      }
      if (chord === "Shift+Digit1") untitled += "!";
      else if (chord === "Backspace") untitled = untitled.slice(0, -1);
      else if (chord === keys.close && untitled === "") untitled = undefined;
      return true;
    },
    webview(probe) {
      if (probe === webviewMotionProbe) {
        return { value: { body: reduced(), html: reduced() && !options.noMirror } };
      }
      if (probe === watchViewFramesProbe) {
        recording = { start: viewString(), fitted: false };
        return { value: true };
      }
      if (probe === takeViewFramesProbe) {
        const taken = recording;
        recording = undefined;
        if (!taken) return { value: [] };
        if (!taken.fitted) return { value: [taken.start] };
        const glide = reduced() ? [] : Array.from({ length: 14 }, (_, index) => `glide ${index}`);
        return { value: [taken.start, ...glide, viewString()] };
      }
      if (probe === markDocumentProbe) {
        webviewMarked = true;
        return { value: undefined };
      }
      if (probe === documentMarkedProbe) return { value: webviewMarked };
      if (probe === installSizeRecorderProbe) return { value: true };
      if (probe === takeSizeRecordsProbe || probe === takeKeyRecordsProbe) return { value: [] };
      if (probe === legendOpenProbe || probe === toggleLegendProbe) return { value: null };
      if (probe === webviewThemeProbe) {
        const shown = expectedWebviewAppearance(theme().kind, ["light"]);
        return {
          value: {
            theme: shown.theme,
            kontrast: shown.kontrast ?? null,
            bodyClasses: [...webviewBodyClasses(theme().kind)].sort(),
            switching: false,
          },
        };
      }
      return undefined;
    },
    page(probe) {
      if (probe === workbenchClassesProbe) {
        const shown = theme();
        return {
          value: [
            "monaco-workbench",
            workbenchThemeClass(shown.kind),
            `vscode-theme-${shown.id}`,
            reduced() ? "monaco-reduce-motion" : "monaco-enable-motion",
          ],
        };
      }
      if (probe === activeTextEditorProbe) return { value: untitled !== undefined };
      if (probe === activeEditorDirtyProbe) {
        return { value: untitled === undefined ? editing.dirty() : untitled !== "" };
      }
      if (probe === webviewFrameShownProbe) return { value: untitled === undefined };
      if (probe === workbenchFocusProbe) {
        const webview = untitled === undefined;
        return { value: { webview, sideBar: false, where: webview ? "webview" : "editor" } };
      }
      if (probe === focusFrameProbe) return { value: untitled === undefined };
      if (probe === markDocumentProbe) {
        pageMarked = true;
        return { value: undefined };
      }
      if (probe === documentMarkedProbe) return { value: pageMarked };
      return undefined;
    },
  };
  return { workbench, reloads: () => reloads, untitledOpen: () => untitled !== undefined };
}

describe("runVsCodeSmoke, workbench", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function smokeWorkbench(
    overrides: Partial<VsCodeSmokeOptions> = {},
    documentOptions: FakeDocumentOptions = {},
    workbenchOptions: FakeWorkbenchOptions = {},
  ) {
    const document = fakeDocument("board", documentOptions);
    const workbench = fakeWorkbench(document, workbenchOptions);
    const lines: string[] = [];
    fakeVsCode({
      menu: true,
      document: { shapes: 3 },
      editing: document.editing,
      workbench: workbench.workbench,
    });
    const result = await runVsCodeSmoke(
      await smokeOptions({
        edit: document.edit,
        colorThemes: [],
        timeoutMs: 2_000,
        log: (line) => lines.push(line),
        ...overrides,
      }),
    );
    return { result, lines, document, workbench };
  }

  it(
    "runs the motion, hidden and reload steps last, after the history, when the modeler opts in",
    { timeout: 60_000 },
    async () => {
      const { result, lines, document, workbench } = await smokeWorkbench({
        history: true,
        workbench: true,
      });

      expect(result.failures).toEqual([]);
      expect(result.motion).toEqual({ reducedFitViews: 2, enabledFitViews: 16 });
      expect(result.hidden).toEqual({
        before: { zoom: 84, selected: 3 },
        theme: "Default Dark Modern",
        sizesWhileHidden: [],
        afterReturn: { zoom: 84, selected: 3 },
      });
      expect(result.reload).toEqual({
        before: { zoom: 84, dirty: false },
        after: { zoom: 84, dirty: false },
        reducedMotionAtStart: true,
      });
      expect(Object.keys(result.timings)).toEqual([
        "resolve",
        "launch",
        "open",
        "edit",
        "save",
        "undo",
        "themes",
        "history",
        "motion",
        "hidden",
        "reload",
        "close",
        "total",
      ]);
      expect(lines).toContain("motion: a fit showed 2 views under reduced motion, 16 without");
      expect(lines).toContain(
        "reload: view 84% (saved) before, 84% (saved) after, with reduced motion at start",
      );
      expect(workbench.reloads()).toBe(1);
      expect(workbench.untitledOpen()).toBe(false);
      // The reload step saves the edit it redid before the reload, so closing VS Code asks nothing.
      expect(document.editing.dirty()).toBe(false);
    },
  );

  it(
    "runs them for VSCODE_SMOKE_OPT_IN=workbench, unless the modeler passes workbench: false",
    { timeout: 60_000 },
    async () => {
      vi.stubEnv("VSCODE_SMOKE_OPT_IN", "workbench");

      const optedIn = await smokeWorkbench();
      expect(optedIn.result.failures).toEqual([]);
      expect(optedIn.result.reload?.after?.dirty).toBe(false);

      const optedOut = await smokeWorkbench({ workbench: false });
      expect(optedOut.result.motion).toBeUndefined();
      expect(optedOut.result.timings.reload).toBeUndefined();
    },
  );

  it("skips them by default", { timeout: 30_000 }, async () => {
    vi.stubEnv("VSCODE_SMOKE_OPT_IN", "");

    const { result } = await smokeWorkbench();

    expect(result.failures).toEqual([]);
    expect(result.motion).toBeUndefined();
    expect(result.hidden).toBeUndefined();
    expect(result.reload).toBeUndefined();
  });

  it("prefixes a failure with its step", { timeout: 60_000 }, async () => {
    const { result } = await smokeWorkbench({ workbench: true }, {}, { noMirror: true });

    expect(result.failures).toEqual([
      "motion: with workbench.reduceMotion \"on\", the webview's <html> has no cd-shell-reduce-motion, the shell's mirror of vscode-reduce-motion",
      "reload: after the reload with workbench.reduceMotion \"on\", the webview's <html> has no cd-shell-reduce-motion, the shell's mirror of vscode-reduce-motion",
    ]);
  });

  it(
    "skips the reload, and says so, when the undo step did not bring the canvas back",
    { timeout: 60_000 },
    async () => {
      const { result, lines } = await smokeWorkbench(
        { workbench: true, timeoutMs: 1_000 },
        { undoDoesNothing: true },
      );

      expect(result.failures.every((failure) => failure.startsWith("undo: "))).toBe(true);
      expect(result.motion?.reducedFitViews).toBe(2);
      expect(result.hidden?.afterReturn).toBeDefined();
      expect(result.reload).toBeUndefined();
      expect(lines).toContain(
        "reload: skipped, the undo step did not bring the canvas back, so there is no edit to redo",
      );
    },
  );
});
