export type { VsCodeSmokeContext, VsCodeSmokeFixture, VsCodeSmokeOptions } from "./driver.js";
export { createFromPalette, runVsCodeSmoke } from "./driver.js";
export type {
  VsCodeSmokeDockerOptions,
  VsCodeSmokeDockerResult,
  VsCodeSmokeDockerRunOptions,
} from "./docker.js";
export {
  VSCODE_SMOKE_DOCKER_PACKAGES,
  VSCODE_SMOKE_DOCKER_VOLUMES,
  runVsCodeSmokeInDocker,
  vsCodeSmokeDockerImage,
  vsCodeSmokeDockerRunArgs,
  vsCodeSmokeDockerfile,
} from "./docker.js";
export type {
  ExtensionManifest,
  PlatformKeys,
  UserSettingsOptions,
  VsCodeSmokeOptInStep,
  VsCodeSmokePaths,
} from "./launch.js";
export {
  DEFAULT_WINDOW_SIZE,
  VSCODE_SMOKE_OPT_IN_STEPS,
  customEditorViewType,
  defaultVsCodeCachePath,
  extensionIdOf,
  matchesFilenamePattern,
  platformKeys,
  resolveExtensionMain,
  vsCodeEnvironment,
  vsCodeLaunchArgs,
  vsCodeSmokeOptIn,
  vsCodeUserSettings,
} from "./launch.js";
export type {
  ChromePresence,
  VsCodeSmokeKeysResult,
  VsCodeSmokeResult,
  VsCodeSmokeStep,
  VsCodeSmokeThemeResult,
  VsCodeSmokeTimings,
} from "./result.js";
export { VSCODE_SMOKE_STEPS, formatVsCodeSmoke, screenshotFileName } from "./result.js";
export type { VsCodeColorTheme } from "./themes.js";
export {
  VSCODE_COLOR_THEMES,
  expectedWebviewAppearance,
  webviewBodyClasses,
  workbenchThemeClass,
} from "./themes.js";
