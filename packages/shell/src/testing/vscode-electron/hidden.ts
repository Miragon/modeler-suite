import { describeCanvas, sameCanvas } from "./canvas-facts.js";
import { sameView, selectionChange } from "./history.js";
import type { PlatformKeys } from "./launch.js";
import { zoomAway } from "./motion.js";
import type { VsCodeSmokeHiddenResult, VsCodeSmokeHistoryView } from "./result.js";
import { VSCODE_COLOR_THEMES, workbenchThemeClass, type VsCodeColorTheme } from "./themes.js";
import { delay, pollUntil } from "./wait.js";
import type { CanvasFacts, ContainerSize, KeyRecord, ViewFacts } from "./webview.js";

/** Pressed while the modeler's tab is hidden: a canvas key (the fit) that types `!` into a text editor. */
export const HIDDEN_KEY = "Shift+Digit1";

/** What the hidden step reads and does in a running VS Code. */
export interface HiddenSession {
  keys: PlatformKeys;
  /** A Playwright chord, its key last as a `KeyboardEvent.code` (`Shift+Digit1`). */
  press(chord: string): Promise<void>;
  /** Clears the webview's text selection and focuses the canvas `<svg>`; whether it holds the focus then. */
  focusCanvas(): Promise<boolean>;
  /** The canvas's zoom, the scale of the viewport's matrix. */
  scale(): Promise<number>;
  view(): Promise<ViewFacts>;
  canvas(): Promise<CanvasFacts>;
  /**
   * Marks the webview's document and records its keys and the sizes of its canvas container from
   * now on; false when the webview has no canvas container.
   */
  startWatching(): Promise<boolean>;
  /** The webview's document still carries the mark: VS Code kept it while the tab was hidden. */
  stillMarked(): Promise<boolean>;
  takeKeys(): Promise<KeyRecord[]>;
  takeSizes(): Promise<ContainerSize[]>;
  /** The workbench shows the modeler's webview frame. */
  webviewShown(): Promise<boolean>;
  /** The active editor is a text editor. */
  textEditorActive(): Promise<boolean>;
  /** The active editor has unsaved changes. */
  dirty(): Promise<boolean>;
  /** The theme type `.monaco-workbench` shows (`vs`, `vs-dark`, `hc-black`, `hc-light`). */
  workbenchThemeType(): Promise<string | undefined>;
  /** Switches the workbench to `theme`; why it did not, or undefined. */
  switchTheme(theme: VsCodeColorTheme): Promise<string | undefined>;
  /** Waits until the webview shows `theme`; why it does not, or undefined. */
  webviewShowsTheme(theme: VsCodeColorTheme): Promise<string | undefined>;
}

export interface HiddenCheckOptions {
  /** How long VS Code may take to switch the tabs, and a key to show its effect. */
  effectTimeoutMs: number;
  /** How long the view has to hold after the tab came back, and a key gets to arrive. */
  graceMs: number;
  intervalMs: number;
  /** Where the theme switched to while the tab is hidden comes from: the first of another type than the one shown. */
  colorThemes: readonly VsCodeColorTheme[];
}

/** The first of `candidates`, then of VS Code's default themes, whose type the workbench does not show. */
export function themeWhileHidden(
  candidates: readonly VsCodeColorTheme[],
  shownType: string | undefined,
): VsCodeColorTheme {
  return [...candidates, ...VSCODE_COLOR_THEMES].find(
    (theme) => workbenchThemeClass(theme.kind) !== shownType,
  )!;
}

function summarize(view: ViewFacts): VsCodeSmokeHistoryView {
  return { zoom: Math.round(view.scale * 100), selected: view.selected.length };
}

function describeView(view: ViewFacts): string {
  return `zoom ${Math.round(view.scale * 100)}% at ${Math.round(view.translateX)}, ${Math.round(view.translateY)}`;
}

function describeKeys(records: readonly KeyRecord[]): string {
  return [...new Set(records.map((record) => record.code || record.key))].join(", ");
}

function keptView(before: ViewFacts, now: ViewFacts): boolean {
  const { lost, gained } = selectionChange(before, now);
  return sameView(before, now) && lost.length === 0 && gained.length === 0;
}

/** What differs between the view and selection `before` and `now`, as failure texts. */
function viewDifferences(before: ViewFacts, now: ViewFacts, when: string): string[] {
  const failures: string[] = [];
  if (!sameView(before, now)) {
    failures.push(`${when}, the view moved: ${describeView(before)} before, ${describeView(now)}`);
  }
  const { lost, gained } = selectionChange(before, now);
  if (lost.length > 0) failures.push(`${when}, the selection lost ${lost.join(", ")}`);
  if (gained.length > 0) failures.push(`${when}, the selection gained ${gained.join(", ")}`);
  return failures;
}

/**
 * Empties the untitled text editor the step typed into, so that it closes without asking to save
 * (an untitled file without text is no change), and closes it. Whether it closed.
 */
async function closeUntitled(
  session: HiddenSession,
  options: HiddenCheckOptions,
  failures: string[],
): Promise<boolean> {
  for (const chord of ["Backspace", session.keys.undo]) {
    if (!(await session.dirty())) break;
    await session.press(chord);
    await pollUntil(
      () => session.dirty(),
      (dirty) => !dirty,
      options.effectTimeoutMs,
      options.intervalMs,
    );
  }
  if (await session.dirty()) {
    failures.push(
      "the untitled text editor kept the typed text, so the step left it open instead of answering a save prompt",
    );
    return false;
  }
  await session.press(session.keys.close);
  return true;
}

/**
 * The hidden step (0.8): a modeler's editor in a background tab keeps its webview (the extension
 * registers it with `retainContextWhenHidden`), takes no key while hidden and comes back as it was.
 * The step zooms away from the fit, so that a refit would show, selects every element, so that a
 * dropped selection would show, and opens a new untitled text file in the same group
 * (Cmd/Ctrl+N). While the modeler's tab is hidden it presses Shift+1, which has to reach the text
 * editor and not the webview, and switches the color theme. Once the untitled editor is closed
 * again, the webview has to be the same document, with the same canvas, view and
 * selection, held for `graceMs`, and has to show the theme switched while it was hidden. The sizes
 * the canvas container reported while hidden (none in VS Code 1.96 and 1.144, which keep the size,
 * or 0 × 0) are in the result.
 */
export async function checkHidden(
  session: HiddenSession,
  options: HiddenCheckOptions,
): Promise<{ result: VsCodeSmokeHiddenResult; failures: string[] }> {
  const failures: string[] = [];
  const result: VsCodeSmokeHiddenResult = { sizesWhileHidden: [] };
  const { modifier } = session.keys;

  if (!(await session.focusCanvas())) {
    failures.push("the canvas <svg> did not take the focus");
    return { result, failures };
  }
  if (!(await zoomAway(session, options))) {
    failures.push(
      `${modifier}+Equal and ${modifier}+Minus left the zoom as it was, so a refit after the tab came back would not show`,
    );
  }
  const selectAll = `${modifier}+KeyA`;
  await session.press(selectAll);
  const selected = await pollUntil(
    () => session.view(),
    (view) => view.selected.length > 0,
    options.effectTimeoutMs,
    options.intervalMs,
  );
  if (!selected.met) {
    failures.push(
      `${selectAll} selected no element of the canvas, so the hidden tab had no selection to keep`,
    );
  }
  if (!(await session.startWatching())) {
    failures.push("the webview has no canvas container to watch");
    return { result, failures };
  }
  // The recorder's first report is the container's current size.
  await delay(options.graceMs);
  await session.takeSizes();
  const before = await session.view();
  const canvasBefore = await session.canvas();
  result.before = summarize(before);

  const newFile = `${modifier}+KeyN`;
  await session.press(newFile);
  const hidden = await pollUntil(
    async () => (await session.textEditorActive()) && !(await session.webviewShown()),
    (done) => done,
    options.effectTimeoutMs,
    options.intervalMs,
  );
  if (!hidden.met) {
    const opened = await session.textEditorActive();
    failures.push(
      opened
        ? "VS Code still shows the modeler's webview with the untitled text editor in front of it"
        : `${newFile} did not open an untitled text editor in front of the modeler's editor`,
    );
    if (opened) await closeUntitled(session, options, failures);
    return { result, failures };
  }
  // The webview had the focus, so it saw the key that opened the text editor.
  await session.takeKeys();

  await session.press(HIDDEN_KEY);
  const typed = await pollUntil(
    () => session.dirty(),
    (dirty) => dirty,
    options.effectTimeoutMs,
    options.intervalMs,
  );
  await delay(options.graceMs);
  const received = await session.takeKeys();
  if (received.length > 0) {
    failures.push(
      `the hidden editor's webview received ${describeKeys(received)}, pressed in the text editor in front of it`,
    );
  } else if (!typed.met) {
    failures.push(
      `${HIDDEN_KEY} reached neither the untitled text editor nor the hidden webview, so whether the webview takes keys while hidden was not seen`,
    );
  }

  const theme = themeWhileHidden(options.colorThemes, await session.workbenchThemeType());
  result.theme = theme.name;
  const missedSwitch = await session.switchTheme(theme);
  if (missedSwitch) failures.push(`while the tab was hidden, ${missedSwitch}`);

  await delay(options.graceMs);
  failures.push(...viewDifferences(before, await session.view(), "while the tab was hidden"));
  result.sizesWhileHidden = await session.takeSizes();

  if (!(await closeUntitled(session, options, failures))) return { result, failures };
  const back = await pollUntil(
    async () => !(await session.textEditorActive()) && (await session.webviewShown()),
    (done) => done,
    options.effectTimeoutMs,
    options.intervalMs,
  );
  if (!back.met) {
    failures.push("the modeler's editor did not come back once the untitled text editor closed");
    return { result, failures };
  }
  if (!(await session.stillMarked())) {
    failures.push(
      "the webview came back as a new document: VS Code did not keep it while the tab was hidden (retainContextWhenHidden)",
    );
    return { result, failures };
  }

  const settled = await pollUntil(
    () => session.view(),
    (view) => keptView(before, view),
    options.effectTimeoutMs,
    options.intervalMs,
  );
  await delay(options.graceMs);
  const after = settled.met ? await session.view() : settled.value;
  failures.push(...viewDifferences(before, after, "after the tab came back"));
  result.afterReturn = summarize(after);

  const canvasAfter = await session.canvas();
  if (!sameCanvas(canvasAfter, canvasBefore)) {
    failures.push(
      `after the tab came back, the canvas shows ${describeCanvas(canvasAfter)}, before it was hidden ${describeCanvas(canvasBefore)}`,
    );
  }
  const missedTheme = missedSwitch ? undefined : await session.webviewShowsTheme(theme);
  if (missedTheme) failures.push(`after the tab came back, ${missedTheme}`);
  return { result, failures };
}
