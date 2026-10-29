import type { Appearance, ChromeIsland, Size } from "../../core/index.js";
import { describeAppearance, type VsCodeColorTheme } from "./themes.js";

/** The steps of a run, in order; `total` spans all of them. */
export const VSCODE_SMOKE_STEPS = [
  "resolve",
  "launch",
  "open",
  "edit",
  "save",
  "undo",
  "themes",
  "keys",
  "history",
  "motion",
  "hidden",
  "reload",
  "close",
] as const;

export type VsCodeSmokeStep = (typeof VSCODE_SMOKE_STEPS)[number];

/** Milliseconds per step; a step that did not run is missing. */
export type VsCodeSmokeTimings = Partial<Record<VsCodeSmokeStep | "total", number>>;

/** Whether each checked island of the shell's chrome was visible. */
export type ChromePresence = Partial<Record<ChromeIsland, boolean>>;

export interface VsCodeSmokeThemeResult {
  theme: VsCodeColorTheme;
  /** What the theme bridge has to show for the modeler's `themes`. */
  expected: Appearance;
  /** What the webview's `<html>` showed once the workbench had switched; missing when it never did. */
  observed?: Appearance | undefined;
  /** The webview's `<body>` theme classes VS Code set. */
  bodyClasses: readonly string[];
  chrome: ChromePresence;
  /** The screenshot of the window, when a `screenshotDir` was given and the theme switched. */
  screenshot?: string | undefined;
  ms: number;
  ok: boolean;
}

/** What the keys step saw (0.7). */
export interface VsCodeSmokeKeysResult {
  /** The readout before the keys, in percent. */
  start?: number | undefined;
  /**
   * Every zoom key in pressing order, with the readout it left in percent (missing without one):
   * first Shift+1, whose fit the last one has to restore.
   */
  zoom: { key: string; percent?: number | undefined }[];
  /** VS Code's window zoom level per window (`webContents.getZoomLevel()`), before and after the keys. */
  windowZoomLevels: { before: number[]; after: number[] };
  selected: number;
}

/** The zoom in percent and how many elements were selected, read at one moment of the history step. */
export interface VsCodeSmokeHistoryView {
  zoom: number;
  selected: number;
}

/** What the history step saw (0.8). */
export interface VsCodeSmokeHistoryResult {
  /** The view and selection the redo began with, after the step zoomed and selected all. */
  before?: VsCodeSmokeHistoryView | undefined;
  /** Once the redo brought the edit back; missing when it did not. */
  afterRedo?: VsCodeSmokeHistoryView | undefined;
  /** Once the undo took the edit back again; missing when it did not. */
  afterUndo?: VsCodeSmokeHistoryView | undefined;
}

/** What the motion step saw (0.8): how many views the canvas showed while Shift+1 fit it. */
export interface VsCodeSmokeMotionResult {
  /** With `workbench.reduceMotion` "on", the view before the fit included: a jump shows 2. */
  reducedFitViews?: number | undefined;
  /** With the setting "off" again, only for comparison: a glide shows many, a slow machine fewer. */
  enabledFitViews?: number | undefined;
}

/** What the hidden step saw (0.8). */
export interface VsCodeSmokeHiddenResult {
  /** The view and the selection before another editor hid the modeler's. */
  before?: VsCodeSmokeHistoryView | undefined;
  /** The color theme the step switched to while the modeler's tab was hidden. */
  theme?: string | undefined;
  /** Every size the canvas container reported while hidden; none when VS Code left it alone. */
  sizesWhileHidden: Size[];
  /** Once the tab came back; missing when it did not. */
  afterReturn?: VsCodeSmokeHistoryView | undefined;
}

/** The editor at one moment of the reload step. */
export interface VsCodeSmokeReloadView {
  /** The zoom in percent. */
  zoom: number;
  /** VS Code calls the document changed. */
  dirty: boolean;
  /** Whether the legend is open; missing for a modeler without one. */
  legendOpen?: boolean | undefined;
}

/** What the reload step saw (0.8). */
export interface VsCodeSmokeReloadResult {
  /** Right before Developer: Reload Window, once the webview had stored its state. */
  before?: VsCodeSmokeReloadView | undefined;
  /** Once the editor showed again; missing when it did not. */
  after?: VsCodeSmokeReloadView | undefined;
  /** The new webview started with reduced motion, as the setting asked; missing when not checked. */
  reducedMotionAtStart?: boolean | undefined;
}

export interface VsCodeSmokeResult {
  /** No failure. */
  ok: boolean;
  /** Every broken expectation, prefixed with its step (`save: …`). */
  failures: string[];
  /** The VS Code version that ran. */
  vscodeVersion?: string | undefined;
  executablePath?: string | undefined;
  /** `publisher.name` of the modeler's extension. */
  extensionId?: string | undefined;
  viewType?: string | undefined;
  /** The chrome once the fixture had opened. */
  chrome: ChromePresence;
  /** The text the save wrote and what `parse` returned for it. */
  saved?: { text: string; parsed: unknown } | undefined;
  /** Undo brought back the canvas and, saved again, the fixture's exact text. */
  undone: boolean;
  themes: VsCodeSmokeThemeResult[];
  /** The keys step's observations; missing when the step did not run. */
  keys?: VsCodeSmokeKeysResult | undefined;
  /** The history step's observations; missing when the step did not run. */
  history?: VsCodeSmokeHistoryResult | undefined;
  /** The motion step's observations; missing when the step did not run. */
  motion?: VsCodeSmokeMotionResult | undefined;
  /** The hidden step's observations; missing when the step did not run. */
  hidden?: VsCodeSmokeHiddenResult | undefined;
  /** The reload step's observations; missing when the step did not run. */
  reload?: VsCodeSmokeReloadResult | undefined;
  timings: VsCodeSmokeTimings;
}

/** Collects failures per step while a run goes on. */
export class SmokeFailures {
  readonly list: string[] = [];

  add(step: VsCodeSmokeStep, message: string): void {
    this.list.push(`${step}: ${message}`);
  }

  has(step: VsCodeSmokeStep): boolean {
    return this.list.some((failure) => failure.startsWith(`${step}: `));
  }
}

/** The islands of `expected` that were not visible, as a failure text; undefined when all were. */
export function missingChrome(
  expected: readonly ChromeIsland[],
  chrome: ChromePresence,
): string | undefined {
  const missing = expected.filter((island) => chrome[island] !== true);
  if (missing.length === 0) return undefined;
  return `the shell's chrome is incomplete: ${missing.map((island) => `[data-chrome="${island}"]`).join(", ")} not visible`;
}

/** Whether the webview shows `expected`, both attributes. */
export function sameAppearance(expected: Appearance, observed: Appearance | undefined): boolean {
  return (
    observed !== undefined &&
    observed.theme === expected.theme &&
    observed.kontrast === expected.kontrast
  );
}

/** The screenshot file of a theme: `<name>-<theme id>.png`. */
export function screenshotFileName(name: string, theme: VsCodeColorTheme): string {
  return `${name.replace(/[^\w.-]+/g, "-")}-${theme.id}.png`;
}

function seconds(ms: number | undefined): string {
  return ms === undefined ? "–" : `${(ms / 1000).toFixed(1)} s`;
}

function percent(value: number | undefined): string {
  return value === undefined ? "?" : `${value}%`;
}

/** One line of what the keys step saw: the readouts, the window zoom and what select all selected. */
export function describeKeys(keys: VsCodeSmokeKeysResult): string {
  const readouts = [keys.start, ...keys.zoom.map((entry) => entry.percent)]
    .map(percent)
    .join(" → ");
  const levels = (values: number[]) => (values.length > 0 ? values.join(", ") : "?");
  return (
    `zoom ${readouts}, window zoom level ${levels(keys.windowZoomLevels.before)} → ` +
    `${levels(keys.windowZoomLevels.after)}, select all selected ${keys.selected}`
  );
}

/** One line of what the history step saw: zoom and selection before the redo, after it and after the undo. */
export function describeHistory(history: VsCodeSmokeHistoryResult): string {
  const view = (entry: VsCodeSmokeHistoryView | undefined) =>
    entry ? `${entry.zoom}% with ${entry.selected} selected` : "?";
  return (
    `view ${view(history.before)}, after the redo ${view(history.afterRedo)}, ` +
    `after the undo ${view(history.afterUndo)}`
  );
}

function count(value: number | undefined): string {
  return value === undefined ? "?" : String(value);
}

/** One line of what the motion step saw: the views of a fit under reduced motion and without. */
export function describeMotion(motion: VsCodeSmokeMotionResult): string {
  return (
    `a fit showed ${count(motion.reducedFitViews)} views under reduced motion, ` +
    `${count(motion.enabledFitViews)} without`
  );
}

function sizes(list: readonly Size[]): string {
  if (list.length === 0) return "no resize";
  return `resized to ${list.map((size) => `${size.width} × ${size.height}`).join(", ")}`;
}

/** One line of what the hidden step saw: the view before, while hidden and once back. */
export function describeHidden(hidden: VsCodeSmokeHiddenResult): string {
  const view = (entry: VsCodeSmokeHistoryView | undefined) =>
    entry ? `${entry.zoom}% with ${entry.selected} selected` : "?";
  return (
    `view ${view(hidden.before)}, hidden under ${hidden.theme ?? "?"} ` +
    `(${sizes(hidden.sizesWhileHidden)}), back at ${view(hidden.afterReturn)}`
  );
}

/** One line of what the reload step saw: the editor before Developer: Reload Window and after it. */
export function describeReload(reload: VsCodeSmokeReloadResult): string {
  const view = (entry: VsCodeSmokeReloadView | undefined) => {
    if (!entry) return "?";
    const details = [entry.dirty ? "unsaved" : "saved"];
    if (entry.legendOpen !== undefined)
      details.push(`legend ${entry.legendOpen ? "open" : "closed"}`);
    return `${entry.zoom}% (${details.join(", ")})`;
  };
  const motion =
    reload.reducedMotionAtStart === undefined
      ? ""
      : `, ${reload.reducedMotionAtStart ? "with" : "without"} reduced motion at start`;
  return `view ${view(reload.before)} before, ${view(reload.after)} after${motion}`;
}

/** A few lines for the test log: version, timings, every theme and the failures. */
export function formatVsCodeSmoke(result: VsCodeSmokeResult): string {
  const head = [
    `VS Code ${result.vscodeVersion ?? "(not resolved)"}`,
    result.extensionId ?? "(unknown extension)",
    result.viewType ?? "(no custom editor)",
    result.ok
      ? "ok"
      : `${result.failures.length} failure${result.failures.length === 1 ? "" : "s"}`,
  ].join(" · ");
  const timings = [...VSCODE_SMOKE_STEPS, "total" as const]
    .filter((step) => result.timings[step] !== undefined)
    .map((step) => `${step} ${seconds(result.timings[step])}`)
    .join(" · ");
  const themes = result.themes.map(
    (entry) =>
      `  ${entry.ok ? "ok    " : "FAILED"} ${entry.theme.name}: ${describeAppearance(entry.observed)}` +
      ` (expected ${describeAppearance(entry.expected)}), ${seconds(entry.ms)}` +
      (entry.screenshot ? `, ${entry.screenshot}` : ""),
  );
  const keys = result.keys ? [`  keys: ${describeKeys(result.keys)}`] : [];
  const history = result.history ? [`  history: ${describeHistory(result.history)}`] : [];
  const motion = result.motion ? [`  motion: ${describeMotion(result.motion)}`] : [];
  const hidden = result.hidden ? [`  hidden: ${describeHidden(result.hidden)}`] : [];
  const reload = result.reload ? [`  reload: ${describeReload(result.reload)}`] : [];
  const failures = result.failures.map((failure) => `  - ${failure}`);
  return [
    head,
    timings,
    ...themes,
    ...keys,
    ...history,
    ...motion,
    ...hidden,
    ...reload,
    ...(failures.length > 0 ? ["failures:", ...failures] : []),
  ].join("\n");
}
