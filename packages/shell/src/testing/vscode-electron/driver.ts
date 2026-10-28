import { rmSync } from "node:fs";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { ProgressReport, ProgressReporter } from "@vscode/test-electron";
import type { ElectronApplication, FrameLocator, Page } from "playwright-core";
import {
  FIT_ANIMATION_MS,
  type Appearance,
  type ChromeIsland,
  type Size,
  type Theme,
} from "../../core/index.js";
import { resolveInSharedCache } from "./cache.js";
import { describeCanvas, sameCanvas } from "./canvas-facts.js";
import { checkHistory, type HistorySession } from "./history.js";
import { checkKeys, type KeysSession } from "./keys.js";
import {
  DEFAULT_WINDOW_SIZE,
  customEditorViewType,
  defaultVsCodeCachePath,
  extensionIdOf,
  isPlainFileName,
  platformKeys,
  resolveExtensionMain,
  vsCodeEnvironment,
  vsCodeLaunchArgs,
  vsCodeSmokeOptIn,
  vsCodeUserSettings,
  type ExtensionManifest,
  type PlatformKeys,
  type VsCodeSmokePaths,
} from "./launch.js";
import { extensionActivationFailures } from "./logs.js";
import {
  SmokeFailures,
  describeHistory,
  describeKeys,
  missingChrome,
  sameAppearance,
  screenshotFileName,
  type ChromePresence,
  type VsCodeSmokeResult,
  type VsCodeSmokeStep,
  type VsCodeSmokeThemeResult,
} from "./result.js";
import { readSaveOnceClean } from "./save.js";
import {
  missedThemeSwitch,
  switchWorkbenchTheme,
  workbenchThemeKey,
  type WorkbenchThemeSwitch,
} from "./theme-switch.js";
import {
  VSCODE_COLOR_THEMES,
  WEBVIEW_THEME_BODY_CLASSES,
  describeAppearance,
  expectedWebviewAppearance,
  webviewBodyClasses,
  type VsCodeColorTheme,
} from "./themes.js";
import {
  describeWebviewErrors,
  watchWebviewErrors,
  type WebviewErrorWatch,
  type WebviewOwner,
} from "./webview-errors.js";
import { delay, pollUntil as pollEvery } from "./wait.js";
import {
  activeEditorDirtyProbe,
  activeTextEditorProbe,
  blurProbe,
  canvasFactsProbe,
  chromeProbe,
  devicePixelRatioProbe,
  focusCanvasProbe,
  focusCreatingEntryProbe,
  installKeyRecorderProbe,
  selectedElementsProbe,
  settleProbe,
  takeKeyRecordsProbe,
  textSelectionProbe,
  viewFactsProbe,
  webviewThemeProbe,
  workbenchClassesProbe,
  workbenchFocusProbe,
  workbenchWebviewsProbe,
  zoomReadoutProbe,
  type CanvasFacts,
  type WebviewThemeFacts,
} from "./webview.js";

/** The file the smoke test opens, written into a fresh workspace. */
export interface VsCodeSmokeFixture {
  /** A plain file name (`board.storm`); it also keys `workbench.editorAssociations`. */
  fileName: string;
  /** The document; it shows at least one element. */
  text: string;
}

/** What `edit` and `ready` get to drive VS Code. */
export interface VsCodeSmokeContext {
  /** The VS Code window. */
  page: Page;
  /** The modeler's webview document, inside VS Code's two webview frames. */
  webview: FrameLocator;
  /** The platform's save, undo and redo chords. */
  keys: PlatformKeys;
  /** The timeout of every wait. */
  timeoutMs: number;
}

export interface VsCodeSmokeOptions {
  /** The modeler's built extension folder (with its `package.json`), passed as `--extensionDevelopmentPath`. */
  extensionPath: string;
  fixture: VsCodeSmokeFixture;
  /** The modeler's parser: throws (or rejects) when the saved text is not a valid document. */
  parse: (text: string) => unknown;
  /**
   * Changes the document through the canvas, the way a user does, and leaves no label editor
   * open. Default `createFromPalette`: Enter on the first creating palette entry, then Escape.
   */
  edit?: ((context: VsCodeSmokeContext) => Promise<void>) | undefined;
  /** Resolves once the opened fixture is ready for the edit; default: the canvas shows a shape. */
  ready?: ((context: VsCodeSmokeContext) => Promise<void>) | undefined;
  /**
   * How many undo steps take the edit back; default 1 (one canvas change is one document edit). The
   * history step presses the redo key as often, and then the undo key again.
   */
  undoSteps?: number | undefined;
  /** The modes the modeler declares, as its extension passes them to the theme bridge; default `["light"]`. */
  themes?: readonly Theme[] | undefined;
  /** The VS Code themes to switch through, the first one also at start; default `VSCODE_COLOR_THEMES`. */
  colorThemes?: readonly VsCodeColorTheme[] | undefined;
  /** Islands that must be visible after opening and under every theme; default menu, palette and zoom. */
  chrome?: readonly ChromeIsland[] | undefined;
  /** Where to write `<name>-<theme id>.png`; no screenshots without it. */
  screenshotDir?: string | undefined;
  /** The screenshots' prefix; default the extension's `name`. */
  name?: string | undefined;
  /** The custom editor; default the first one whose selector matches the fixture's file name. */
  viewType?: string | undefined;
  /** `stable`, `insiders` or `1.96.0`; default the newest stable release that satisfies `engines.vscode`. */
  vscodeVersion?: string | undefined;
  /**
   * Where `@vscode/test-electron` keeps its downloads, which runs may share at the same time; default
   * `defaultVsCodeCachePath`, in the OS's cache directory.
   */
  cachePath?: string | undefined;
  /** The window's content size; default 1280 × 800. */
  windowSize?: Size | undefined;
  /** The timeout of every single wait; default 30 s. */
  timeoutMs?: number | undefined;
  /** More user settings, merged over the driver's. */
  settings?: Readonly<Record<string, unknown>> | undefined;
  /** Progress lines (download, steps); default silent. */
  log?: ((line: string) => void) | undefined;
  /** Keeps the throwaway profile, workspace and VS Code logs, and logs where they are. */
  keepTemporaryFiles?: boolean | undefined;
  /**
   * Runs the keys step (0.7): the zoom keys, Shift+1, Cmd/Ctrl+A and C on the canvas, with VS Code's
   * window zoom, focus and clipboard checked. Opt-in while it is new; without the option,
   * `VSCODE_SMOKE_OPT_IN=keys` in the environment turns it on.
   */
  keys?: boolean | undefined;
  /**
   * Runs the history step (0.8): after the keys, the redo of the edit and the undo that takes it back
   * again leave the zoomed view and the selection of every element alone. Opt-in while it is new;
   * without the option, `VSCODE_SMOKE_OPT_IN=history` in the environment turns it on.
   */
  history?: boolean | undefined;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const CLOSE_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 100;
const REOPEN_INTERVAL_MS = 2_000;
const LOG_READ_INTERVAL_MS = 1_000;
/** How long a saved text the parser rejects has to stay unchanged before the save step fails. */
const SAVE_SETTLE_MS = 1_000;
/** How long the menu, or the canvas's first shape, may still take after the extension's webview threw. */
const UNCAUGHT_ERROR_GRACE_MS = 3_000;
/** How long a key may take until the canvas shows what it did, at most `timeoutMs`. */
const KEY_EFFECT_TIMEOUT_MS = 5_000;
/** VS Code acts on a key the webview forwards through two `postMessage` hops. */
const KEY_GRACE_MS = 300;
/** A late refit or restore after an import moves the view within this time. */
const VIEW_SETTLE_MS = 500;
const DEFAULT_CHROME: readonly ChromeIsland[] = ["menu", "palette", "zoom"];
/** Names the screenshot of a webview that never showed, next to the theme screenshots. */
const OPEN_FAILURE: VsCodeColorTheme = { id: "open-failure", name: "", kind: 1 };

interface Peers {
  launch(options: {
    executablePath: string;
    args: string[];
    env: Record<string, string>;
    timeout: number;
  }): Promise<ElectronApplication>;
  download(options: {
    version?: string;
    cachePath?: string;
    extensionDevelopmentPath: string;
    reporter: ProgressReporter;
  }): Promise<string>;
}

// Lazy, so loading the entry needs no peer yet and a missing one gets an actionable message.
async function loadPeers(): Promise<Peers> {
  try {
    const [playwright, testElectron] = await Promise.all([
      import("playwright-core"),
      import("@vscode/test-electron"),
    ]);
    return {
      launch: (options) => playwright._electron.launch(options),
      download: (options) => testElectron.downloadAndUnzipVSCode(options),
    };
  } catch (error) {
    throw new Error(
      "@miragon/modeler-shell/testing/vscode-electron needs its optional peer dependencies: " +
        "npm i -D --save-exact playwright-core @vscode/test-electron",
      { cause: error },
    );
  }
}

/** A failure the driver words itself keeps all its lines; Playwright's errors keep their first. */
class StepFailure extends Error {}

function messageOf(error: unknown): string {
  if (error instanceof StepFailure) return error.message;
  return (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "";
}

function elapsed(since: number): number {
  return Math.round(performance.now() - since);
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

function pollUntil<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs: number,
): Promise<{ value: T; met: boolean }> {
  return pollEvery(read, done, timeoutMs, POLL_INTERVAL_MS);
}

function appearanceOf(facts: WebviewThemeFacts): Appearance | undefined {
  if (facts.theme !== "light" && facts.theme !== "dark") return undefined;
  return facts.kontrast === "hoch"
    ? { theme: facts.theme, kontrast: "hoch" }
    : { theme: facts.theme };
}

async function readManifest(extensionPath: string): Promise<ExtensionManifest> {
  const file = join(extensionPath, "package.json");
  try {
    return JSON.parse(await readFile(file, "utf8")) as ExtensionManifest;
  } catch (error) {
    throw new Error(`runVsCodeSmoke: cannot read the extension manifest ${file}`, { cause: error });
  }
}

/**
 * The default `edit`: Enter on the first creating palette entry (the shell places the element in
 * the free area and selects it), then Escape for a label editor the creation opened.
 */
export async function createFromPalette(context: VsCodeSmokeContext): Promise<void> {
  const html = context.webview.locator("html");
  const before = await html.evaluate(canvasFactsProbe);
  const action = await html.evaluate(focusCreatingEntryProbe);
  if (!action) throw new Error("the palette has no enabled entry that creates an element");
  await context.page.keyboard.press("Enter");
  const created = await pollUntil(
    () => html.evaluate(canvasFactsProbe),
    (facts) => facts.shapes > before.shapes,
    context.timeoutMs,
  );
  if (!created.met) throw new Error(`Enter on the palette entry "${action}" added no element`);
  await context.page.keyboard.press("Escape");
}

async function defaultReady(context: VsCodeSmokeContext): Promise<void> {
  const shown = await pollUntil(
    () => context.webview.locator("html").evaluate(canvasFactsProbe),
    (facts) => facts.shapes > 0,
    context.timeoutMs,
  );
  if (!shown.met) throw new Error("the canvas shows no element of the fixture");
}

async function settle(context: VsCodeSmokeContext): Promise<void> {
  await context.webview.locator("html").evaluate(settleProbe);
  await context.page.evaluate(settleProbe);
}

async function closeApplication(app: ElectronApplication): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const closed = await Promise.race([
    app.close().then(
      () => true,
      () => true,
    ),
    new Promise<false>((done) => (timer = setTimeout(() => done(false), CLOSE_TIMEOUT_MS))),
  ]);
  clearTimeout(timer);
  // A modal dialog left by a failed step blocks a graceful quit.
  if (!closed) app.process().kill("SIGKILL");
}

/**
 * Starts a real VS Code with the modeler's built extension, opens `fixture` in its custom editor,
 * and checks the shell's chrome, an edit through the canvas, save, undo, and the theme bridge under
 * every color theme, with a screenshot per theme; opted in, also the zoom and selection keys and the
 * view and selection across a redo and an undo. A failed check never throws: it is in `failures`.
 * Throws for unusable options (no manifest, no matching custom editor, an unbuilt extension, a file
 * name with a path, an unknown step in `VSCODE_SMOKE_OPT_IN`) and when the optional peers are
 * missing.
 */
export async function runVsCodeSmoke(options: VsCodeSmokeOptions): Promise<VsCodeSmokeResult> {
  const started = performance.now();
  const log = options.log ?? (() => undefined);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const islands = options.chrome ?? DEFAULT_CHROME;
  const themes = options.themes ?? ["light"];
  const colorThemes = options.colorThemes ?? VSCODE_COLOR_THEMES;
  const keys = options.keys ?? vsCodeSmokeOptIn(process.env).has("keys");
  const history = options.history ?? vsCodeSmokeOptIn(process.env).has("history");
  const { fileName } = options.fixture;
  if (!isPlainFileName(fileName)) {
    throw new Error(`runVsCodeSmoke: the fixture needs a plain file name, not "${fileName}"`);
  }

  const extensionPath = resolve(options.extensionPath);
  const manifest = await readManifest(extensionPath);
  const viewType = options.viewType ?? customEditorViewType(manifest, fileName);
  if (!viewType)
    throw new Error(`runVsCodeSmoke: no custom editor of ${extensionPath} opens ${fileName}`);
  if (manifest.main && !resolveExtensionMain(extensionPath, manifest.main)) {
    throw new Error(
      `runVsCodeSmoke: the extension is not built, ${join(extensionPath, manifest.main)} is missing`,
    );
  }
  const extensionId = extensionIdOf(manifest);
  const peers = await loadPeers();
  // The webview's resource URLs name the folder VS Code loaded, which may be the real path.
  const realExtensionPath = await realpath(extensionPath).catch(() => extensionPath);
  const webviewOwner: WebviewOwner = {
    extensionId,
    extensionFolders: [...new Set([extensionPath, realExtensionPath])],
  };

  const failures = new SmokeFailures();
  const result: VsCodeSmokeResult = {
    ok: false,
    failures: failures.list,
    extensionId,
    viewType,
    chrome: {},
    undone: false,
    themes: [],
    timings: {},
  };
  /** Runs and times one step; a throw becomes the step's failure and the result `undefined`. */
  const step = async <T>(name: VsCodeSmokeStep, run: () => Promise<T>): Promise<T | undefined> => {
    const since = performance.now();
    log(`${name} …`);
    try {
      return await run();
    } catch (error) {
      failures.add(name, messageOf(error));
      return undefined;
    } finally {
      result.timings[name] = elapsed(since);
    }
  };

  const executablePath = await step("resolve", async () => {
    let lastTenth = -1;
    const reporter: ProgressReporter = {
      report(report: ProgressReport) {
        const stage = String(report.stage);
        if (stage === "resolvedVersion" && "version" in report)
          result.vscodeVersion = report.version;
        if (stage === "downloading" && "bytesSoFar" in report && report.totalBytes > 0) {
          const tenth = Math.floor((report.bytesSoFar / report.totalBytes) * 10);
          if (tenth !== lastTenth)
            log(`resolve: downloading VS Code, ${(lastTenth = tenth) * 10} %`);
        }
      },
      error(error: unknown) {
        log(`resolve: ${messageOf(error)}`);
      },
    };
    const path = await resolveInSharedCache({
      cachePath: resolve(
        options.cachePath ?? defaultVsCodeCachePath(process.platform, process.env, homedir()),
      ),
      download: (cachePath) =>
        peers.download({
          ...(options.vscodeVersion ? { version: options.vscodeVersion } : {}),
          cachePath,
          extensionDevelopmentPath: extensionPath,
          reporter,
        }),
      log: (line) => log(`resolve: ${line}`),
    });
    log(`resolve: VS Code ${result.vscodeVersion ?? "?"} at ${path}`);
    if (!(await exists(path))) {
      throw new Error(
        `VS Code's executable ${path} does not exist (on macOS, VS Code 1.110 and later need @vscode/test-electron 3.1.0 or later)`,
      );
    }
    return path;
  });
  result.executablePath = executablePath;

  if (executablePath) {
    const root = await mkdtemp(join(tmpdir(), "modeler-shell-vscode-"));
    // Synchronous, and on exit too: Playwright answers Ctrl+C by closing VS Code and calling
    // process.exit, which skips `finally` or cuts an asynchronous removal short.
    const removeTemporaryFiles = () =>
      rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    if (!options.keepTemporaryFiles) process.once("exit", removeTemporaryFiles);
    const launched: { app?: ElectronApplication } = {};
    try {
      await runSession({
        options,
        peers,
        step,
        failures,
        result,
        log,
        launched,
        executablePath,
        extensionPath,
        extensionId,
        webviewOwner,
        viewType,
        islands,
        themes,
        colorThemes,
        keys,
        history,
        timeoutMs,
        name: options.name ?? manifest.name ?? "modeler",
        paths: {
          userDataDir: join(root, "user-data"),
          extensionsDir: join(root, "extensions"),
          workspaceDir: join(root, "workspace"),
          file: join(root, "workspace", fileName),
        },
      });
    } finally {
      const app = launched.app;
      if (app) await step("close", () => closeApplication(app));
      process.off("exit", removeTemporaryFiles);
      if (options.keepTemporaryFiles) log(`kept ${root}`);
      else removeTemporaryFiles();
    }
  }

  result.timings.total = elapsed(started);
  result.ok = failures.list.length === 0;
  return result;
}

/** One run's settled inputs, and where the launch step leaves the application for the cleanup. */
interface SessionRun {
  options: VsCodeSmokeOptions;
  peers: Peers;
  step: <T>(name: VsCodeSmokeStep, run: () => Promise<T>) => Promise<T | undefined>;
  failures: SmokeFailures;
  result: VsCodeSmokeResult;
  log: (line: string) => void;
  launched: { app?: ElectronApplication };
  executablePath: string;
  extensionPath: string;
  extensionId: string | undefined;
  webviewOwner: WebviewOwner;
  viewType: string;
  islands: readonly ChromeIsland[];
  themes: readonly Theme[];
  colorThemes: readonly VsCodeColorTheme[];
  keys: boolean;
  history: boolean;
  timeoutMs: number;
  name: string;
  paths: VsCodeSmokePaths;
}

async function runSession(run: SessionRun): Promise<void> {
  const { options, step, failures, result, log, paths, timeoutMs, islands } = run;
  const original = options.fixture.text;
  const settingsFile = join(paths.userDataDir, "User", "settings.json");
  const writeSettings = (colorTheme: string) =>
    writeFile(
      settingsFile,
      JSON.stringify(
        vsCodeUserSettings({
          colorTheme,
          fileName: options.fixture.fileName,
          viewType: run.viewType,
          extra: options.settings,
        }),
        null,
        2,
      ),
    );
  const readDisk = () => readFile(paths.file, "utf8");

  await mkdir(join(paths.userDataDir, "User"), { recursive: true });
  await mkdir(paths.extensionsDir, { recursive: true });
  await mkdir(paths.workspaceDir, { recursive: true });
  await writeFile(paths.file, original);
  await writeSettings((run.colorThemes[0] ?? VSCODE_COLOR_THEMES[0]!).name);

  let webviewErrors: WebviewErrorWatch | undefined;
  const context = await step("launch", async (): Promise<VsCodeSmokeContext> => {
    const app = await run.peers.launch({
      executablePath: run.executablePath,
      args: vsCodeLaunchArgs(run.extensionPath, paths),
      env: vsCodeEnvironment(process.env),
      timeout: timeoutMs,
    });
    run.launched.app = app;
    const page = await app.firstWindow({ timeout: timeoutMs });
    // from the first window on: the webview can throw before the open step starts
    webviewErrors = watchWebviewErrors(page, run.webviewOwner);
    // an `edit` of the modeler's own waits as long as the driver does
    page.setDefaultTimeout(timeoutMs);
    await page.waitForSelector(".monaco-workbench", { timeout: timeoutMs });
    const size = options.windowSize ?? DEFAULT_WINDOW_SIZE;
    await app.evaluate(({ BrowserWindow }, { width, height }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(width, height);
    }, size);
    // The workbench may show other webviews; the outer frame's URL names the owning extension.
    const id = run.extensionId;
    const frame = id
      ? page.locator(
          `iframe.webview[src*="extensionId=${id}&" i], iframe.webview[src$="extensionId=${id}" i]`,
        )
      : page.locator("iframe.webview");
    const webview = frame.first().contentFrame().locator("iframe#active-frame").contentFrame();
    return { page, webview, keys: platformKeys(process.platform), timeoutMs };
  });
  if (!context || !webviewErrors) return;
  const errors = webviewErrors;

  const html = context.webview.locator("html");
  const canvasFacts = () => html.evaluate(canvasFactsProbe);
  const dirty = () => context.page.evaluate(activeEditorDirtyProbe);

  const before = await step("open", async () => {
    try {
      const shown = await showCustomEditor(context, run, errors);
      if (shown !== "shown") throw new StepFailure(await openFailure(context, run, errors, shown));
      await readyUnlessThrown(context, options.ready ?? defaultReady, errors);
      await settle(context);
      result.chrome = await html.evaluate(chromeProbe, islands);
      const missing = missingChrome(islands, result.chrome);
      if (missing) failures.add("open", withWebviewErrors(missing, errors));
      const facts = await canvasFacts();
      log(`open: ${run.viewType} shows ${describeCanvas(facts)}`);
      return facts;
    } catch (error) {
      if (error instanceof StepFailure) throw error;
      throw new StepFailure(withWebviewErrors(messageOf(error), errors));
    } finally {
      errors.stop();
    }
  });
  if (!before) return;

  const edited = await step("edit", async () => {
    await (options.edit ?? createFromPalette)(context);
    const changed = await pollUntil(dirty, (value) => value, timeoutMs);
    if (!changed.met)
      throw new Error("the document did not change (its editor never turned dirty)");
    return true;
  });

  const saved =
    edited &&
    (await step("save", async () => {
      await context.page.keyboard.press(context.keys.save);
      const { clean, diskTimeoutMs, written } = await readSaveOnceClean({
        dirty,
        file: paths.file,
        previous: original,
        parse: options.parse,
        timeoutMs,
        intervalMs: POLL_INTERVAL_MS,
        settleMs: SAVE_SETTLE_MS,
      });
      if (written.status === "unchanged")
        throw new Error(`${context.keys.save} wrote nothing to disk`);
      if (!clean) failures.add("save", "the editor is still dirty after the save");
      if (written.status === "unsettled") {
        throw new Error(`the file was still changing ${diskTimeoutMs} ms after the save`);
      }
      if (written.status === "unparseable") {
        throw new Error(
          `the saved text does not parse: ${messageOf(written.error)} ` +
            `(${Buffer.byteLength(written.text)} bytes on disk, unchanged for ${written.unchangedMs} ms)`,
        );
      }
      log(
        `save: ${Buffer.byteLength(written.text)} bytes on disk, read complete after ${written.waitedMs} ms`,
      );
      result.saved = { text: written.text, parsed: written.parsed };
      return true;
    }));

  // What the history step's redo has to bring back, read before the undo takes it away.
  let editedCanvas: CanvasFacts | undefined;
  if (saved) {
    await step("undo", async () => {
      if (run.history) editedCanvas = await canvasFacts();
      for (let index = 0; index < (options.undoSteps ?? 1); index++) {
        await context.page.keyboard.press(context.keys.undo);
      }
      const restored = await pollUntil(
        canvasFacts,
        (facts) => sameCanvas(facts, before),
        timeoutMs,
      );
      if (!restored.met) {
        failures.add(
          "undo",
          `${context.keys.undo} did not bring the canvas back: it shows ${describeCanvas(restored.value)}, ` +
            `before the edit ${describeCanvas(before)}`,
        );
      }
      await pollUntil(dirty, (value) => value, timeoutMs);
      await context.page.keyboard.press(context.keys.save);
      const reverted = await pollUntil(readDisk, (text) => text === original, timeoutMs);
      if (!reverted.met) {
        throw new Error(
          `${context.keys.undo} and ${context.keys.save} did not restore the fixture's text`,
        );
      }
      result.undone = restored.met;
    });
  }

  await step("themes", async () => {
    // The keyboard edit leaves the canvas focused; its focus ring would show in every screenshot.
    await html.evaluate(blurProbe);
    const shownThemes = new Map<string, string>();
    for (const theme of run.colorThemes) {
      const checked = await checkTheme(context, theme, {
        themes: run.themes,
        islands,
        timeoutMs,
        writeSettings,
        shownThemes,
        log: (line) => log(`themes: ${line}`),
        screenshotDir: options.screenshotDir,
        name: run.name,
      });
      result.themes.push(checked.result);
      for (const failure of checked.failures) failures.add("themes", failure);
      const workbench = checked.workbench.switched
        ? `switched in ${checked.workbench.ms} ms`
        : "never switched";
      log(
        `themes: ${theme.name}, the workbench ${workbench}, the webview shows ${describeAppearance(checked.result.observed)}`,
      );
    }
  });

  const app = run.launched.app;
  if (run.keys && app) {
    // After the themes, so the zoom and the selection it leaves are in no screenshot.
    await step("keys", async () => {
      const checked = await checkKeys(keysSession(context, app), {
        effectTimeoutMs: Math.min(KEY_EFFECT_TIMEOUT_MS, timeoutMs),
        graceMs: KEY_GRACE_MS,
        intervalMs: POLL_INTERVAL_MS,
        fitAnimationMs: FIT_ANIMATION_MS,
      });
      result.keys = checked.result;
      for (const failure of checked.failures) failures.add("keys", failure);
      log(`keys: ${describeKeys(checked.result)}`);
    });
  }

  if (run.history && result.undone && editedCanvas) {
    const edited = editedCanvas;
    // Last, so the zoom and the selection it leaves are in no screenshot, and after the keys, which
    // leave nothing in the document that would end the redo history.
    await step("history", async () => {
      const checked = await checkHistory(historySession(context), {
        edited,
        original: before,
        steps: options.undoSteps ?? 1,
        canvasTimeoutMs: timeoutMs,
        effectTimeoutMs: Math.min(KEY_EFFECT_TIMEOUT_MS, timeoutMs),
        graceMs: VIEW_SETTLE_MS,
        intervalMs: POLL_INTERVAL_MS,
      });
      result.history = checked.result;
      for (const failure of checked.failures) failures.add("history", failure);
      log(`history: ${describeHistory(checked.result)}`);
    });
  } else if (run.history) {
    log(
      saved
        ? "history: skipped, the undo step did not bring the canvas back"
        : "history: skipped, the edit was not saved, so there was nothing to undo",
    );
  }
}

/** The history step's reads and presses in the running VS Code (see `checkHistory`). */
function historySession(context: VsCodeSmokeContext): HistorySession {
  const html = context.webview.locator("html");
  return {
    keys: context.keys,
    press: (chord) => context.page.keyboard.press(chord),
    focusCanvas: () => html.evaluate(focusCanvasProbe),
    canvas: () => html.evaluate(canvasFactsProbe),
    view: () => html.evaluate(viewFactsProbe),
    dirty: () => context.page.evaluate(activeEditorDirtyProbe),
  };
}

/** What the keys step reads of Electron's main-process module; Electron's own types are no peer. */
interface ElectronMain {
  BrowserWindow: {
    getAllWindows(): { id: number; webContents: { getZoomLevel(): number } }[];
  };
  clipboard: { availableFormats(): string[]; readText(): string };
}

/** The keys step's reads and presses in the running VS Code (see `checkKeys`). */
function keysSession(context: VsCodeSmokeContext, app: ElectronApplication): KeysSession {
  const html = context.webview.locator("html");
  return {
    keys: context.keys,
    press: (chord) => context.page.keyboard.press(chord),
    focusCanvas: async () => {
      await html.evaluate(installKeyRecorderProbe);
      return html.evaluate(focusCanvasProbe);
    },
    readout: () => html.evaluate(zoomReadoutProbe),
    takeKeyRecords: () => html.evaluate(takeKeyRecordsProbe),
    selectedElements: () => html.evaluate(selectedElementsProbe),
    textSelection: () => html.evaluate(textSelectionProbe),
    workbenchFocus: () => context.page.evaluate(workbenchFocusProbe),
    windowZoom: async () => ({
      // VS Code zooms its window with webFrame.setZoomLevel, which the sandboxed workbench page
      // cannot read back; the main process can, and the page's pixel ratio follows the zoom.
      levels: await app.evaluate(({ BrowserWindow }: ElectronMain) =>
        BrowserWindow.getAllWindows()
          .sort((first, second) => first.id - second.id)
          .map((window) => window.webContents.getZoomLevel()),
      ),
      devicePixelRatio: await context.page.evaluate(devicePixelRatioProbe),
    }),
    clipboard: () =>
      app.evaluate(({ clipboard }: ElectronMain) => ({
        formats: clipboard.availableFormats(),
        text: clipboard.readText(),
      })),
  };
}

/** `missing`: after `timeoutMs` or a failed activation; `threw`: the extension's webview threw. */
type MenuOutcome = "shown" | "missing" | "threw";

/**
 * Waits for the shell's menu in the webview. A file VS Code opens at start can resolve before the
 * development extension's custom editor is registered (seen on the first start of a fresh
 * download): it then shows as text. The driver closes it and opens it again from the Explorer,
 * where `workbench.editorAssociations` picks the custom editor once it is registered, and retries
 * until it is. Gives up at once when the extension failed to activate (its editor is then never
 * registered), and `UNCAUGHT_ERROR_GRACE_MS` after the extension's webview threw an uncaught error
 * while its menu is still missing.
 */
async function showCustomEditor(
  context: VsCodeSmokeContext,
  run: SessionRun,
  errors: WebviewErrorWatch,
): Promise<MenuOutcome> {
  const menu = context.webview.locator('[data-chrome="menu"]');
  const deadline = performance.now() + run.timeoutMs;
  let reopenedAt = Number.NEGATIVE_INFINITY;
  let logsReadAt = Number.NEGATIVE_INFINITY;
  while (performance.now() < deadline) {
    if (await menu.isVisible()) return "shown";
    const threwAt = errors.uncaught.first[0]?.at;
    if (threwAt !== undefined && performance.now() - threwAt >= UNCAUGHT_ERROR_GRACE_MS) {
      return "threw";
    }
    if (performance.now() - logsReadAt > LOG_READ_INTERVAL_MS) {
      logsReadAt = performance.now();
      if ((await activationFailures(run)).length > 0) return "missing";
    }
    const retry = performance.now() - reopenedAt > REOPEN_INTERVAL_MS;
    if (retry && (await context.page.evaluate(activeTextEditorProbe))) {
      reopenedAt = performance.now();
      run.log(
        `open: VS Code shows ${run.options.fixture.fileName} as text, reopening it from the Explorer`,
      );
      await context.page.keyboard.press(context.keys.close);
      await context.page
        .locator(".explorer-folders-view")
        .getByText(run.options.fixture.fileName, { exact: true })
        .first()
        .click();
    }
    await delay(POLL_INTERVAL_MS);
  }
  return (await menu.isVisible()) ? "shown" : "missing";
}

/**
 * The activation failures of the modeler's extension in VS Code's extension host logs, read while
 * the temporary profile still exists.
 */
async function activationFailures(run: SessionRun): Promise<string[]> {
  const id = run.extensionId;
  if (!id) return [];
  const logsDir = join(run.paths.userDataDir, "logs");
  const files = await readdir(logsDir, { recursive: true }).catch((): string[] => []);
  const logs = await Promise.all(
    files
      .filter((file) => basename(file) === "exthost.log")
      .map((file) => readFile(join(logsDir, file), "utf8").catch(() => "")),
  );
  return logs.flatMap((log) => extensionActivationFailures(log, id));
}

/**
 * Runs `ready`, and fails `UNCAUGHT_ERROR_GRACE_MS` after the extension's webview threw an
 * uncaught error while the canvas still shows no shape: the modelers mount the shell's menu before
 * the document arrives, so a webview that throws while importing it passes `showCustomEditor` and
 * would leave `ready` waiting for `timeoutMs`. The grace also counts from the start of `ready`,
 * which gives an error thrown before the menu showed the same time to recover.
 */
async function readyUnlessThrown(
  context: VsCodeSmokeContext,
  ready: (context: VsCodeSmokeContext) => Promise<void>,
  errors: WebviewErrorWatch,
): Promise<void> {
  const html = context.webview.locator("html");
  const startedAt = performance.now();
  let finished = false;
  const readied = ready(context).finally(() => {
    finished = true;
  });
  const abandoned = (async () => {
    while (!finished) {
      const threwAt = errors.uncaught.first[0]?.at;
      const since = threwAt === undefined ? undefined : Math.max(threwAt, startedAt);
      if (since !== undefined && performance.now() - since >= UNCAUGHT_ERROR_GRACE_MS) {
        const facts = await html.evaluate(canvasFactsProbe).catch(() => undefined);
        if (!finished && facts?.shapes === 0) {
          throw new Error(
            `the canvas shows no element of the fixture ${UNCAUGHT_ERROR_GRACE_MS / 1000} s after its webview threw`,
          );
        }
      }
      await delay(POLL_INTERVAL_MS);
    }
  })();
  await Promise.race([readied, abandoned]);
}

/** `text`, followed by the errors the extension's webview reported, when there were any. */
function withWebviewErrors(text: string, errors: WebviewErrorWatch): string {
  const reported = describeWebviewErrors(errors);
  return reported ? `${text}; ${reported}` : text;
}

/**
 * Why the webview did not show: the extension's activation error from VS Code's extension host log,
 * or that its webview threw, which webview frames the workbench has (a run that never opened leaves
 * no other trace), a screenshot of the window when there is a `screenshotDir`, where VS Code's logs
 * are, and the uncaught and console errors of the webview with their stacks, which are in none of
 * VS Code's logs.
 */
async function openFailure(
  context: VsCodeSmokeContext,
  run: SessionRun,
  errors: WebviewErrorWatch,
  outcome: Exclude<MenuOutcome, "shown">,
): Promise<string> {
  const sources = await context.page.evaluate(workbenchWebviewsProbe).catch((): string[] => []);
  const id = run.extensionId?.toLowerCase();
  const own = id
    ? sources.filter((source) => source.toLowerCase().includes(`extensionid=${id}`))
    : sources;
  let screenshot = "";
  if (run.options.screenshotDir) {
    await mkdir(run.options.screenshotDir, { recursive: true });
    const path = join(
      resolve(run.options.screenshotDir),
      screenshotFileName(run.name, OPEN_FAILURE),
    );
    screenshot = await context.page.screenshot({ path, scale: "css" }).then(
      () => `, screenshot ${path}`,
      () => "",
    );
  }
  const failed = await activationFailures(run);
  const causes =
    failed.length > 0
      ? `: ${failed.join("; ")}`
      : outcome === "threw"
        ? `, still missing ${UNCAUGHT_ERROR_GRACE_MS / 1000} s after its webview threw`
        : "";
  const logs = run.options.keepTemporaryFiles
    ? `VS Code's logs are in ${join(run.paths.userDataDir, "logs")}`
    : "keepTemporaryFiles keeps VS Code's logs";
  return withWebviewErrors(
    `the custom editor never showed the shell's menu${causes} ` +
      `(${sources.length} webview frames in the workbench, ${own.length} of ${run.extensionId ?? "the extension"}${screenshot}; ${logs})`,
    errors,
  );
}

interface ThemeCheckOptions {
  themes: readonly Theme[];
  islands: readonly ChromeIsland[];
  timeoutMs: number;
  writeSettings: (colorTheme: string) => Promise<void>;
  /** The themes the workbench showed so far in the run, to name the one it shows when a switch fails. */
  shownThemes: Map<string, string>;
  log: (line: string) => void;
  screenshotDir: string | undefined;
  name: string;
}

async function checkTheme(
  context: VsCodeSmokeContext,
  theme: VsCodeColorTheme,
  options: ThemeCheckOptions,
): Promise<{
  result: VsCodeSmokeThemeResult;
  failures: string[];
  workbench: WorkbenchThemeSwitch;
}> {
  const since = performance.now();
  const failures: string[] = [];
  const html = context.webview.locator("html");
  const expected = expectedWebviewAppearance(theme.kind, options.themes);
  const bodyClasses = [...webviewBodyClasses(theme.kind)].sort().join(" ");

  // VS Code watches its settings file: the theme changes the way a user's setting change does.
  const workbench = await switchWorkbenchTheme({
    theme,
    writeSettings: options.writeSettings,
    readWorkbench: () => context.page.evaluate(workbenchClassesProbe),
    timeoutMs: options.timeoutMs,
    intervalMs: POLL_INTERVAL_MS,
    names: options.shownThemes,
    log: options.log,
  });
  let facts: WebviewThemeFacts | undefined;
  if (!workbench.switched) {
    failures.push(missedThemeSwitch(theme, workbench, options.shownThemes));
  } else {
    options.shownThemes.set(workbenchThemeKey(workbench.shown), theme.name);
    const shown = await pollUntil(
      () => html.evaluate(webviewThemeProbe, WEBVIEW_THEME_BODY_CLASSES),
      (value) =>
        value.bodyClasses.join(" ") === bodyClasses &&
        !value.switching &&
        sameAppearance(expected, appearanceOf(value)),
      options.timeoutMs,
    );
    facts = shown.value;
    if (facts.bodyClasses.join(" ") !== bodyClasses) {
      failures.push(
        `${theme.name}: the webview's body has "${facts.bodyClasses.join(" ")}", VS Code's classes are "${bodyClasses}"`,
      );
    } else if (!sameAppearance(expected, appearanceOf(facts))) {
      failures.push(
        `${theme.name}: the webview shows ${describeAppearance(appearanceOf(facts))}, ` +
          `the theme bridge has to show ${describeAppearance(expected)}`,
      );
    }
  }
  await settle(context);
  const chrome: ChromePresence = await html.evaluate(chromeProbe, options.islands);
  const missing = missingChrome(options.islands, chrome);
  if (missing) failures.push(`${theme.name}: ${missing}`);

  let screenshot: string | undefined;
  if (options.screenshotDir && workbench.switched) {
    await mkdir(options.screenshotDir, { recursive: true });
    screenshot = join(resolve(options.screenshotDir), screenshotFileName(options.name, theme));
    // CSS pixels: the same image size on a Retina Mac and on a CI runner
    await context.page.screenshot({ path: screenshot, scale: "css" });
  }
  return {
    result: {
      theme,
      expected,
      observed: facts ? appearanceOf(facts) : undefined,
      bodyClasses: facts?.bodyClasses ?? [],
      chrome,
      screenshot,
      ms: elapsed(since),
      ok: failures.length === 0,
    },
    failures,
    workbench,
  };
}
