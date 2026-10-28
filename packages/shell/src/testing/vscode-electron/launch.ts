import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import type { Size } from "../../core/index.js";

/** The directories of one smoke run, all inside one throwaway directory. */
export interface VsCodeSmokePaths {
  userDataDir: string;
  extensionsDir: string;
  workspaceDir: string;
  /** The fixture inside `workspaceDir`. */
  file: string;
}

/** The part of an extension's `package.json` the driver reads. */
export interface ExtensionManifest {
  name?: string | undefined;
  publisher?: string | undefined;
  main?: string | undefined;
  contributes?:
    | {
        customEditors?:
          | ReadonlyArray<{
              viewType?: string | undefined;
              selector?: ReadonlyArray<{ filenamePattern?: string | undefined }> | undefined;
            }>
          | undefined;
      }
    | undefined;
}

/** The keys the driver presses: the platform's command modifier with S, Z, W and the redo chord. */
export interface PlatformKeys {
  modifier: "Meta" | "Control";
  save: string;
  undo: string;
  redo: string;
  /** Closes the active editor. */
  close: string;
}

export const DEFAULT_WINDOW_SIZE: Readonly<Size> = { width: 1280, height: 800 };

/**
 * The command line: VS Code's own test runner flags (no sandbox, no GPU sandbox, no updates, no
 * welcome, release notes or trust prompt), no telemetry or crash reporter, a throwaway profile and
 * extensions directory, the modeler's extension in development mode, and the workspace with the
 * fixture opened in it.
 */
export function vsCodeLaunchArgs(extensionPath: string, paths: VsCodeSmokePaths): string[] {
  return [
    // https://github.com/microsoft/vscode/issues/84238
    "--no-sandbox",
    // https://github.com/microsoft/vscode-test/issues/221
    "--disable-gpu-sandbox",
    "--disable-updates",
    "--skip-welcome",
    "--skip-release-notes",
    "--disable-workspace-trust",
    "--disable-telemetry",
    "--disable-crash-reporter",
    "--no-cached-data",
    "--new-window",
    `--user-data-dir=${paths.userDataDir}`,
    `--extensions-dir=${paths.extensionsDir}`,
    `--extensionDevelopmentPath=${extensionPath}`,
    paths.workspaceDir,
    paths.file,
  ];
}

export interface UserSettingsOptions {
  /** `workbench.colorTheme`. */
  colorTheme: string;
  /** The fixture's file name, associated with `viewType` so it opens in the custom editor. */
  fileName: string;
  viewType: string;
  /** More settings; they win over the driver's. */
  extra?: Readonly<Record<string, unknown>> | undefined;
}

/** The user `settings.json` of a run. */
export function vsCodeUserSettings(options: UserSettingsOptions): Record<string, unknown> {
  return {
    "workbench.colorTheme": options.colorTheme,
    // whatever the editor's priority, the fixture opens in the custom editor
    "workbench.editorAssociations": { [options.fileName]: options.viewType },
    // Playwright types with the US layout; dispatching by `code` would read Cmd+Z as Cmd+Y on QWERTZ
    "keyboard.dispatch": "keyCode",
    // an OS in dark or high-contrast mode must not override the theme under test
    "window.autoDetectColorScheme": false,
    "window.autoDetectHighContrast": false,
    "window.restoreWindows": "none",
    "workbench.startupEditor": "none",
    "workbench.tips.enabled": false,
    "workbench.enableExperiments": false,
    "workbench.secondarySideBar.defaultVisibility": "hidden",
    "chat.disableAIFeatures": true,
    "telemetry.telemetryLevel": "off",
    "update.mode": "none",
    "extensions.autoCheckUpdates": false,
    // VS Code 1.125 and later migrate `false` by writing settings.json themselves, from a copy that can
    // predate the driver's last write: that put the previous theme back during the themes step
    "extensions.autoUpdate": "off",
    "extensions.ignoreRecommendations": true,
    "security.workspace.trust.enabled": false,
    "git.enabled": false,
    // the saved text must be exactly what the modeler wrote
    "files.autoSave": "off",
    "files.insertFinalNewline": false,
    "files.trimTrailingWhitespace": false,
    "files.trimFinalNewlines": false,
    ...options.extra,
  };
}

/**
 * The environment of VS Code: the test process's, without the variables of a VS Code it may itself
 * run in (with them the webview's service worker fails to register) and without
 * `ELECTRON_RUN_AS_NODE`, which would start Electron as plain Node.
 */
export function vsCodeEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined || /^VSCODE_/i.test(name) || name === "ELECTRON_RUN_AS_NODE") continue;
    result[name] = value;
  }
  return result;
}

/**
 * The steps a run takes only when asked to (0.7): new ones start here and become the default once
 * every modeler passes them in CI.
 */
export const VSCODE_SMOKE_OPT_IN_STEPS = ["keys"] as const;

export type VsCodeSmokeOptInStep = (typeof VSCODE_SMOKE_OPT_IN_STEPS)[number];

/**
 * The opt-in steps that `VSCODE_SMOKE_OPT_IN` names, separated by commas or spaces (`keys`). A CI
 * workflow opts every modeler's smoke in at once this way, without a change to the modelers' tests.
 * Throws for a name that is no opt-in step, so a typo cannot turn a step off unnoticed.
 */
export function vsCodeSmokeOptIn(
  environment: Readonly<Record<string, string | undefined>>,
): ReadonlySet<VsCodeSmokeOptInStep> {
  const names = (environment.VSCODE_SMOKE_OPT_IN ?? "").split(/[\s,]+/).filter(Boolean);
  const known: readonly string[] = VSCODE_SMOKE_OPT_IN_STEPS;
  const unknown = names.filter((name) => !known.includes(name));
  if (unknown.length > 0) {
    const which = unknown.length === 1 ? "which is no opt-in step" : "which are no opt-in steps";
    throw new Error(
      `runVsCodeSmoke: VSCODE_SMOKE_OPT_IN names ${unknown.map((name) => `"${name}"`).join(", ")}, ` +
        `${which} (${VSCODE_SMOKE_OPT_IN_STEPS.join(", ")})`,
    );
  }
  return new Set(names as VsCodeSmokeOptInStep[]);
}

/**
 * Where VS Code's downloads go without a `cachePath`: the OS's cache directory, as Playwright keeps
 * its browsers. Outside every repository, so no `eslint .`, Prettier or Git walks the unpacked VS Code
 * (about 0.9 GB per version), it survives `npm ci`, and every modeler on the machine shares it.
 */
export function defaultVsCodeCachePath(
  platform: string,
  environment: Readonly<Record<string, string | undefined>>,
  homeDirectory: string,
): string {
  const cacheDirectory =
    platform === "darwin"
      ? join(homeDirectory, "Library", "Caches")
      : platform === "win32"
        ? environment.LOCALAPPDATA || join(homeDirectory, "AppData", "Local")
        : environment.XDG_CACHE_HOME || join(homeDirectory, ".cache");
  return join(cacheDirectory, "miragon-modeler-shell", "vscode-test");
}

export function platformKeys(platform: string): PlatformKeys {
  if (platform === "darwin") {
    return {
      modifier: "Meta",
      save: "Meta+s",
      undo: "Meta+z",
      redo: "Meta+Shift+z",
      close: "Meta+w",
    };
  }
  return {
    modifier: "Control",
    save: "Control+s",
    undo: "Control+z",
    redo: "Control+y",
    close: "Control+w",
  };
}

/** `publisher.name`, the id VS Code puts into the webview's frame URL. */
export function extensionIdOf(manifest: ExtensionManifest): string | undefined {
  return manifest.publisher && manifest.name ? `${manifest.publisher}.${manifest.name}` : undefined;
}

/**
 * A VS Code `filenamePattern` (`*.storm`, `*.{wmap,owm}`) against a file name. A pattern with a `/`
 * matches the path, where a `**` segment stands for any number of directories, none included, so the
 * globstar form of `*.storm` matches `board.storm` as it does in VS Code.
 */
export function matchesFilenamePattern(pattern: string, fileName: string): boolean {
  let source = "";
  let inGroup = false;
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index]!;
    if (pattern.startsWith("**/", index)) {
      source += "(?:.*/)?";
      index += 2;
    } else if (pattern.startsWith("**", index)) {
      source += ".*";
      index += 1;
    } else if (character === "*") source += "[^/]*";
    else if (character === "?") source += "[^/]";
    else if (character === "{") {
      inGroup = true;
      source += "(?:";
    } else if (character === "}" && inGroup) {
      inGroup = false;
      source += ")";
    } else if (character === "," && inGroup) source += "|";
    else source += character.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  const target = pattern.includes("/") ? fileName : (fileName.split("/").pop() ?? fileName);
  return new RegExp(`^${source}$`, "i").test(target);
}

/**
 * The file an extension's `main` loads, found the way Node's `require` finds it (and so VS Code's
 * extension host): as given, with `.js`, `.json` or `.node`, or as a folder's `index.js`; undefined
 * when there is none.
 */
export function resolveExtensionMain(extensionPath: string, main: string): string | undefined {
  try {
    return createRequire(join(extensionPath, "package.json")).resolve(resolve(extensionPath, main));
  } catch {
    return undefined;
  }
}

/** The view type of the first custom editor whose selector matches `fileName`. */
export function customEditorViewType(
  manifest: ExtensionManifest,
  fileName: string,
): string | undefined {
  for (const editor of manifest.contributes?.customEditors ?? []) {
    const matches = (editor.selector ?? []).some(
      (selector) =>
        selector.filenamePattern !== undefined &&
        matchesFilenamePattern(selector.filenamePattern, fileName),
    );
    if (editor.viewType && matches) return editor.viewType;
  }
  return undefined;
}

/** File names the driver writes as given and uses as an `editorAssociations` glob unescaped. */
export function isPlainFileName(fileName: string): boolean {
  return /^[\w][\w.-]*$/.test(fileName);
}
