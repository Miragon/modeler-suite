import { describeCanvas, showsEdit, similarCanvas } from "./canvas-facts.js";
import { sameView } from "./history.js";
import type { PlatformKeys } from "./launch.js";
import { missedMotion, zoomAway, type ReduceMotionSetting } from "./motion.js";
import type { VsCodeSmokeReloadResult } from "./result.js";
import { delay, pollUntil, pollUntilSettled } from "./wait.js";
import type { CanvasFacts, ViewFacts, WebviewMotion } from "./webview.js";

/** diagram-js rounds a zoom to three decimals. */
const SCALE_TOLERANCE = 0.001;

/** What the reload step reads and does in a running VS Code. */
export interface ReloadSession {
  keys: PlatformKeys;
  /** A Playwright chord, its key last as a `KeyboardEvent.code` (`Shift+Digit1`) or a letter (`Control+y`). */
  press(chord: string): Promise<void>;
  /** Clears the webview's text selection and focuses the canvas `<svg>`; whether it holds the focus then. */
  focusCanvas(): Promise<boolean>;
  /** The canvas's zoom, the scale of the viewport's matrix. */
  scale(): Promise<number>;
  view(): Promise<ViewFacts>;
  canvas(): Promise<CanvasFacts>;
  /** The active editor has unsaved changes. */
  dirty(): Promise<boolean>;
  /** Writes `workbench.reduceMotion` and waits for the workbench to show it; whether it did. */
  setReduceMotion(setting: ReduceMotionSetting): Promise<boolean>;
  webviewMotion(): Promise<WebviewMotion>;
  /** Whether the shell's legend is open; null without one. */
  legendOpen(): Promise<boolean | null>;
  /** Toggles the legend through its menu entry; its state then, null without a legend or entry. */
  toggleLegend(): Promise<boolean | null>;
  /** Marks the webview's document, so that a new one shows. */
  markWebview(): Promise<void>;
  webviewMarked(): Promise<boolean>;
  /**
   * Runs Developer: Reload Window and waits until the modeler's editor shows its canvas again; why
   * the window did not reload or the editor did not come back, or undefined.
   */
  reloadWindow(): Promise<string | undefined>;
  /** Waits until the webview shows the theme the workbench shows; why it does not, or undefined. */
  webviewShowsWorkbenchTheme(): Promise<string | undefined>;
}

export interface ReloadCheckOptions {
  /** The canvas as the edit left it, which the redo brings back before the reload. */
  edited: CanvasFacts;
  /** The canvas as the fixture shows it. */
  original: CanvasFacts;
  /** How many document edits the edit made: the redo presses its key that often. */
  steps: number;
  /** How long the canvas may take to show what a document change or the reload did to it. */
  canvasTimeoutMs: number;
  /** How long a key may take to show its effect, and the webview to follow a setting. */
  effectTimeoutMs: number;
  /** How long the restored view has to hold, since a late fit may follow the first import. */
  graceMs: number;
  /** How long the webview gets to store its view and legend (`persistView` writes 250 ms after the view rests). */
  stateWriteMs: number;
  /** How long a fit animates (`FIT_ANIMATION_MS`). */
  fitAnimationMs: number;
  intervalMs: number;
}

function describeView(view: ViewFacts): string {
  return `zoom ${Math.round(view.scale * 100)}% at ${Math.round(view.translateX)}, ${Math.round(view.translateY)}`;
}

function legendState(open: boolean): string {
  return open ? "open" : "closed";
}

/**
 * The reload step (0.8): Developer: Reload Window brings the modeler's editor back as it was.
 * Before the reload the step turns `workbench.reduceMotion` on, redoes the edit and saves it, so
 * that the document differs from the one VS Code opened at start, fits, zooms away from the fit and
 * toggles the legend where there is one, then gives the webview `stateWriteMs` to store the view
 * and the legend (`vscode.setState`). After the reload the webview has to be a new document that
 * starts under reduced motion, the document has to be as saved (the canvas shows the edit, and VS
 * Code does not call it changed once `graceMs` has passed), the view has to be the stored one and
 * not the first fit, held for `graceMs`, the legend has to be as it was (unless it has no menu entry
 * to toggle it with), and the webview has to show the workbench's theme.
 * The edit is saved rather than left unsaved because a smoke run is an extension development host,
 * for which VS Code keeps no backups: an unsaved change cannot survive the reload there.
 */
export async function checkReload(
  session: ReloadSession,
  options: ReloadCheckOptions,
): Promise<{ result: VsCodeSmokeReloadResult; failures: string[] }> {
  const failures: string[] = [];
  const result: VsCodeSmokeReloadResult = {};
  const { modifier, redo, save } = session.keys;

  if (!(await session.focusCanvas())) {
    failures.push("the canvas <svg> did not take the focus");
    return { result, failures };
  }

  const reducedMotion = await session.setReduceMotion("on");
  if (!reducedMotion) {
    failures.push(
      'VS Code did not apply workbench.reduceMotion "on" before the reload, so the reduced motion at start was not checked',
    );
  }

  const redoLabel = options.steps > 1 ? `${redo} ${options.steps} times` : redo;
  for (let step = 0; step < options.steps; step++) await session.press(redo);
  const redone = await pollUntil(
    () => session.canvas(),
    showsEdit(options.original, options.edited),
    options.canvasTimeoutMs,
    options.intervalMs,
  );
  if (!redone.met) {
    failures.push(
      `${redoLabel} did not bring the edit back (the canvas shows ${describeCanvas(redone.value)}), so the reload had no saved edit to show`,
    );
  } else {
    const changed = await pollUntil(
      () => session.dirty(),
      (dirty) => dirty,
      options.effectTimeoutMs,
      options.intervalMs,
    );
    if (!changed.met) {
      failures.push(`${redoLabel} did not change the document, so the reload had no edit to show`);
    } else {
      await session.press(save);
      const clean = await pollUntil(
        () => session.dirty(),
        (dirty) => !dirty,
        options.canvasTimeoutMs,
        options.intervalMs,
      );
      if (!clean.met) failures.push(`${save} left the redone edit unsaved before the reload`);
    }
  }

  await session.press("Shift+Digit1");
  // Read once a fit that glides (reduced motion missed) has ended, not on its way.
  await delay(options.fitAnimationMs);
  const fitScale = (
    await pollUntilSettled(() => session.scale(), options.effectTimeoutMs, options.intervalMs)
  ).value;
  if (!(await zoomAway(session, options))) {
    failures.push(
      `${modifier}+Equal and ${modifier}+Minus left the zoom at the fit, so a fit after the reload would not show`,
    );
  }

  let legendExpected: boolean | undefined;
  const legendBefore = await session.legendOpen();
  if (legendBefore !== null) {
    const toggled = await session.toggleLegend();
    // A legend without its menu entry (`menuEntry: false`) is the modeler's choice, not a failure.
    if (toggled === null) result.legendWithoutMenuEntry = true;
    else if (toggled === legendBefore) {
      failures.push(
        `the legend's menu entry left the legend ${legendState(legendBefore)}, so its stored state was not checked`,
      );
    } else legendExpected = toggled;
  }

  await delay(options.stateWriteMs);
  const before = await session.view();
  const canvasBefore = await session.canvas();
  const dirtyBefore = await session.dirty();
  result.before = {
    zoom: Math.round(before.scale * 100),
    dirty: dirtyBefore,
    ...(legendExpected === undefined ? {} : { legendOpen: legendExpected }),
  };

  await session.markWebview();
  // The legend's menu entry took the focus; the reload key goes through the canvas, as a user's.
  await session.focusCanvas();
  const notReloaded = await session.reloadWindow();
  if (notReloaded) {
    failures.push(notReloaded);
    return { result, failures };
  }
  if (await session.webviewMarked()) {
    failures.push(
      "Developer: Reload Window left the webview's document as it was, so it restored nothing",
    );
    return { result, failures };
  }

  if (reducedMotion) {
    const motion = await pollUntil(
      () => session.webviewMotion(),
      (shown) => shown.body && shown.html,
      options.effectTimeoutMs,
      options.intervalMs,
    );
    result.reducedMotionAtStart = motion.met;
    failures.push(
      ...missedMotion(motion.value, true, 'after the reload with workbench.reduceMotion "on"'),
    );
  }

  const restoredCanvas = await pollUntil(
    () => session.canvas(),
    (facts) => similarCanvas(facts, canvasBefore),
    options.canvasTimeoutMs,
    options.intervalMs,
  );
  if (!restoredCanvas.met) {
    const shown = similarCanvas(restoredCanvas.value, options.original)
      ? "the fixture as VS Code opened it at start"
      : describeCanvas(restoredCanvas.value);
    failures.push(
      `after the reload the canvas shows ${shown}, not the document as saved before it (${describeCanvas(canvasBefore)})`,
    );
  }

  const restoredView = await pollUntil(
    () => session.view(),
    (view) => sameView(before, view),
    options.effectTimeoutMs,
    options.intervalMs,
  );
  await delay(options.graceMs);
  const after = restoredView.met ? await session.view() : restoredView.value;
  // Read after the grace, or a webview that echoes its first import back as an edit would pass.
  const dirtyAfter = await session.dirty();
  if (dirtyAfter && !dirtyBefore) {
    failures.push(
      "VS Code calls the document changed after the reload, though it was saved before it",
    );
  }
  if (!sameView(before, after)) {
    const fitted =
      Math.abs(after.scale - fitScale) <= SCALE_TOLERANCE
        ? ", the fit: the stored view has to win over the first fit"
        : "";
    failures.push(
      `the reload did not restore the view: ${describeView(before)} before, ${describeView(after)} after${fitted}`,
    );
  }

  let legendAfter: boolean | null = null;
  if (legendExpected !== undefined) {
    legendAfter = await session.legendOpen();
    if (legendAfter === null) failures.push("the legend is gone after the reload");
    else if (legendAfter !== legendExpected) {
      failures.push(
        `the legend is ${legendState(legendAfter)} after the reload, it was ${legendState(legendExpected)} before`,
      );
    }
  }

  const missedTheme = await session.webviewShowsWorkbenchTheme();
  if (missedTheme) failures.push(`after the reload, ${missedTheme}`);

  result.after = {
    zoom: Math.round(after.scale * 100),
    dirty: dirtyAfter,
    ...(legendAfter === null ? {} : { legendOpen: legendAfter }),
  };
  return { result, failures };
}
