import { MAX_JUMP_VIEWS } from "../media-checks.js";
import type { PlatformKeys } from "./launch.js";
import type { VsCodeSmokeMotionResult } from "./result.js";
import { delay, pollUntil, pollUntilSettled } from "./wait.js";
import type { WebviewMotion } from "./webview.js";

/** The values of `workbench.reduceMotion` the driver writes; VS Code's default is `auto`. */
export type ReduceMotionSetting = "on" | "off";

/** What `.monaco-workbench` shows of VS Code's reduced motion. */
export type WorkbenchMotion = "reduced" | "enabled";

/**
 * VS Code's own reading of `workbench.reduceMotion`, from the classes of `.monaco-workbench`:
 * `reduce-motion` or `enable-motion` in VS Code 1.96, `monaco-reduce-motion` or
 * `monaco-enable-motion` in later releases; undefined with neither.
 */
export function workbenchMotionOf(classes: readonly string[]): WorkbenchMotion | undefined {
  const present = new Set(classes);
  if (present.has("monaco-reduce-motion") || present.has("reduce-motion")) return "reduced";
  if (present.has("monaco-enable-motion") || present.has("enable-motion")) return "enabled";
  return undefined;
}

export function workbenchMotionFor(setting: ReduceMotionSetting): WorkbenchMotion {
  return setting === "on" ? "reduced" : "enabled";
}

export interface SettingWriteOptions {
  /** Writes the setting into the profile's `settings.json`. */
  write(): Promise<void>;
  /** Whether the workbench shows the setting. */
  applied(): Promise<boolean>;
  /** The whole wait, every write included. */
  timeoutMs: number;
  /** How long VS Code gets to notice one write before the next. */
  retryAfterMs: number;
  intervalMs: number;
}

/**
 * Writes a setting and waits for the workbench to show it. VS Code notices the write through its
 * file watcher, which now and then misses one (the themes step sees that too), so a write that
 * shows nothing after `retryAfterMs` is written again, until `timeoutMs`.
 */
export async function writeWorkbenchSetting(
  options: SettingWriteOptions,
): Promise<{ applied: boolean; writes: number }> {
  const deadline = performance.now() + options.timeoutMs;
  let writes = 0;
  for (;;) {
    await options.write();
    writes += 1;
    const waitMs = Math.max(0, Math.min(options.retryAfterMs, deadline - performance.now()));
    const shown = await pollUntil(
      options.applied,
      (applied) => applied,
      waitMs,
      options.intervalMs,
    );
    if (shown.met) return { applied: true, writes };
    if (performance.now() >= deadline) return { applied: false, writes };
  }
}

/** What the motion step reads and does in a running VS Code. */
export interface MotionSession {
  keys: PlatformKeys;
  /** A Playwright chord, its key last as a `KeyboardEvent.code` (`Shift+Digit1`). */
  press(chord: string): Promise<void>;
  /** Clears the webview's text selection and focuses the canvas `<svg>`; whether it holds the focus then. */
  focusCanvas(): Promise<boolean>;
  /** Writes `workbench.reduceMotion` and waits for the workbench to show it; whether it did. */
  setReduceMotion(setting: ReduceMotionSetting): Promise<boolean>;
  webviewMotion(): Promise<WebviewMotion>;
  /** The canvas's zoom, the scale of the viewport's matrix. */
  scale(): Promise<number>;
  /** Starts recording the views the canvas shows, frame by frame; false without a canvas. */
  watchViews(): Promise<boolean>;
  /** Stops the recording: the views it saw, the one it started on first. */
  takeViews(): Promise<string[]>;
}

export interface MotionCheckOptions {
  /** How long the webview may take to follow the setting, and a key to show its effect. */
  effectTimeoutMs: number;
  /** How long a fit animates (`FIT_ANIMATION_MS`). */
  fitAnimationMs: number;
  /** How long a key may take to reach the webview. */
  graceMs: number;
  intervalMs: number;
}

/** diagram-js rounds a zoom to three decimals. */
const SCALE_TOLERANCE = 0.001;

/** The body class of VS Code's webview for `workbench.reduceMotion`. */
export const REDUCE_MOTION_BODY_CLASS = "vscode-reduce-motion";

function showsMotion(motion: WebviewMotion, reduced: boolean): boolean {
  return motion.body === reduced && motion.html === reduced;
}

/** Why the webview does not show `reduced`: VS Code's body class, the shell's mirror, or both. */
export function missedMotion(motion: WebviewMotion, reduced: boolean, when: string): string[] {
  const failures: string[] = [];
  const has = (present: boolean) => (present ? "still has" : "has no");
  if (motion.body !== reduced) {
    failures.push(
      `${when}, the webview's <body> ${has(motion.body)} ${REDUCE_MOTION_BODY_CLASS}, which VS Code's webview sets for workbench.reduceMotion`,
    );
  }
  if (motion.html !== reduced) {
    failures.push(
      `${when}, the webview's <html> ${has(motion.html)} cd-shell-reduce-motion, the shell's mirror of ${REDUCE_MOTION_BODY_CLASS}`,
    );
  }
  return failures;
}

/**
 * Zooms the canvas away from where it is (Cmd/Ctrl+=, or Cmd/Ctrl+- where it cannot zoom in
 * further) and waits until the zoom holds still, so that a fit after it has somewhere to go;
 * whether the zoom changed.
 */
export async function zoomAway(
  session: Pick<MotionSession, "keys" | "press" | "scale">,
  options: Pick<MotionCheckOptions, "effectTimeoutMs" | "intervalMs">,
): Promise<boolean> {
  const { modifier } = session.keys;
  const start = await session.scale();
  for (const chord of [`${modifier}+Equal`, `${modifier}+Minus`]) {
    await session.press(chord);
    const moved = await pollUntil(
      () => session.scale(),
      (scale) => Math.abs(scale - start) > SCALE_TOLERANCE,
      options.effectTimeoutMs,
      options.intervalMs,
    );
    if (moved.met) {
      await pollUntilSettled(() => session.scale(), options.effectTimeoutMs, options.intervalMs);
      return true;
    }
  }
  return false;
}

/**
 * Zooms away, then presses Shift+1 while the views are recorded; the views of the fit, or why
 * there was nothing to see.
 */
async function recordFit(
  session: MotionSession,
  options: MotionCheckOptions,
): Promise<{ views: string[] } | { failure: string }> {
  const { modifier } = session.keys;
  if (!(await zoomAway(session, options))) {
    return {
      failure: `${modifier}+Equal and ${modifier}+Minus left the zoom as it was, so Shift+Digit1 had nothing to fit`,
    };
  }
  if (!(await session.watchViews())) return { failure: "the canvas has no viewport to watch" };
  await session.press("Shift+Digit1");
  // A glide lasts the animation; its last frames have arrived by the end of a second one.
  await delay(options.graceMs + 2 * options.fitAnimationMs);
  const views = await session.takeViews();
  if (views.length < 2) {
    return {
      failure: "Shift+Digit1 left the view as it was, so whether the fit jumps was not seen",
    };
  }
  return { views };
}

/**
 * The motion step (0.8): VS Code's `workbench.reduceMotion` reaches the modeler. With the setting
 * "on", the workbench shows it, VS Code's webview puts `vscode-reduce-motion` on `<body>` and the
 * shell mirrors it as `cd-shell-reduce-motion` on `<html>`, and an explicit fit (Shift+1) jumps
 * instead of gliding (guide §5.9, §7). With the setting "off" again, both classes go. The views of
 * a fit without reduced motion are counted for comparison, not checked: a slow machine may draw
 * few frames of a glide.
 */
export async function checkMotion(
  session: MotionSession,
  options: MotionCheckOptions,
): Promise<{ result: VsCodeSmokeMotionResult; failures: string[] }> {
  const failures: string[] = [];
  const result: VsCodeSmokeMotionResult = {};

  if (!(await session.focusCanvas())) {
    failures.push("the canvas <svg> did not take the focus");
    return { result, failures };
  }

  const follow = async (setting: ReduceMotionSetting): Promise<boolean> => {
    if (!(await session.setReduceMotion(setting))) {
      failures.push(
        `VS Code did not apply workbench.reduceMotion "${setting}": .monaco-workbench never showed ${workbenchMotionFor(setting)} motion`,
      );
      return false;
    }
    const reduced = setting === "on";
    const shown = await pollUntil(
      () => session.webviewMotion(),
      (motion) => showsMotion(motion, reduced),
      options.effectTimeoutMs,
      options.intervalMs,
    );
    failures.push(
      ...missedMotion(shown.value, reduced, `with workbench.reduceMotion "${setting}"`),
    );
    return shown.met;
  };

  if (await follow("on")) {
    const fit = await recordFit(session, options);
    if ("failure" in fit) failures.push(`under reduced motion, ${fit.failure}`);
    else {
      result.reducedFitViews = fit.views.length;
      if (fit.views.length > MAX_JUMP_VIEWS) {
        failures.push(
          `Shift+Digit1 passed through ${fit.views.length - 1} views under reduced motion; an explicit fit jumps there (guide §5.9, §7)`,
        );
      }
    }
  }

  if (await follow("off")) {
    const fit = await recordFit(session, options);
    if (!("failure" in fit)) result.enabledFitViews = fit.views.length;
  }
  return { result, failures };
}
