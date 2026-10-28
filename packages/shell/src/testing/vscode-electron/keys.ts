import type { PlatformKeys } from "./launch.js";
import type { VsCodeSmokeKeysResult } from "./result.js";
import { delay, pollUntil } from "./wait.js";
import type { KeyRecord, WorkbenchFocus } from "./webview.js";

/** VS Code's window zoom: Electron's zoom level of every window and the workbench's pixel ratio. */
export interface WindowZoom {
  levels: number[];
  devicePixelRatio: number;
}

export interface ClipboardContent {
  formats: string[];
  text: string;
}

/** What the keys step reads and does in a running VS Code. */
export interface KeysSession {
  keys: PlatformKeys;
  /** A Playwright chord, its key last as a `KeyboardEvent.code` (`Control+Shift+Equal`). */
  press(chord: string): Promise<void>;
  /** Starts recording the webview's keys, clears its text selection and focuses the canvas. */
  focusCanvas(): Promise<boolean>;
  readout(): Promise<string | null>;
  takeKeyRecords(): Promise<KeyRecord[]>;
  selectedElements(): Promise<number>;
  textSelection(): Promise<string>;
  workbenchFocus(): Promise<WorkbenchFocus>;
  windowZoom(): Promise<WindowZoom>;
  clipboard(): Promise<ClipboardContent>;
}

export interface KeysCheckOptions {
  /** How long a key may take to arrive in the webview, and then until the canvas shows its effect. */
  effectTimeoutMs: number;
  /** How long VS Code gets after a key to act on it, had it reached the workbench. */
  graceMs: number;
  intervalMs: number;
}

/** What a zoom key has to do to the readout: zoom in, zoom out, show 100 % or the fit. */
export type ZoomEffect = "in" | "out" | "actual" | "fit";

export interface ZoomKeyPress {
  chord: string;
  effect: ZoomEffect;
}

/**
 * The zoom keys of guide §5.8 and §13.5 after a first Shift+1, in an order where each one changes
 * the readout: 100 %, three ways to zoom in, 100 % again, three ways to zoom out, 100 % from the
 * numpad, then the fit. Every variant VS Code binds to its own window zoom or to the side bar is
 * among them.
 */
export function zoomKeyPresses(modifier: PlatformKeys["modifier"]): ZoomKeyPress[] {
  return [
    { chord: `${modifier}+Digit0`, effect: "actual" },
    { chord: `${modifier}+Equal`, effect: "in" },
    { chord: `${modifier}+Shift+Equal`, effect: "in" },
    { chord: `${modifier}+NumpadAdd`, effect: "in" },
    { chord: `${modifier}+Digit0`, effect: "actual" },
    { chord: `${modifier}+Minus`, effect: "out" },
    { chord: `${modifier}+Shift+Minus`, effect: "out" },
    { chord: `${modifier}+NumpadSubtract`, effect: "out" },
    { chord: `${modifier}+Numpad0`, effect: "actual" },
    { chord: "Shift+Digit1", effect: "fit" },
  ];
}

/** The whole percentage of a readout ("86%", German "86 %"); undefined without one. */
export function percentOf(readout: string | null | undefined): number | undefined {
  const digits = /\d+/.exec(readout ?? "");
  return digits ? Number(digits[0]) : undefined;
}

/** The readout a key must show, for the keys that go to a fixed zoom. */
function targetOf(effect: ZoomEffect, fit: number): number | undefined {
  if (effect === "actual") return 100;
  return effect === "fit" ? fit : undefined;
}

/** Whether the readout `now` shows `effect` after `previous`; the fit may differ by its rounding. */
export function zoomEffectShown(
  effect: ZoomEffect,
  previous: number | undefined,
  now: number | undefined,
  fit: number,
): boolean {
  if (now === undefined) return false;
  switch (effect) {
    case "in":
      return previous !== undefined && now > previous;
    case "out":
      return previous !== undefined && now < previous;
    case "actual":
      return now === 100;
    case "fit":
      return Math.abs(now - fit) <= 1;
  }
}

function shown(percent: number | undefined): string {
  return percent === undefined ? "no readout" : `${percent}%`;
}

function missedZoomEffect(
  { chord, effect }: ZoomKeyPress,
  previous: number | undefined,
  now: number | undefined,
  fit: number,
): string {
  const readout = `the readout shows ${shown(now)}`;
  switch (effect) {
    case "in":
    case "out":
      return `${chord} did not zoom the canvas ${effect}: ${readout}, ${shown(previous)} before`;
    case "actual":
      return `${chord} did not zoom the canvas to 100%: ${readout}`;
    case "fit":
      return `${chord} did not fit the canvas: ${readout}, the first Shift+Digit1 fit it at ${fit}%`;
  }
}

export function sameWindowZoom(before: WindowZoom, after: WindowZoom): boolean {
  return (
    before.devicePixelRatio === after.devicePixelRatio &&
    before.levels.length === after.levels.length &&
    before.levels.every((level, index) => level === after.levels[index])
  );
}

function describeWindowZoom({ levels, devicePixelRatio }: WindowZoom): string {
  return `zoom level ${levels.join(", ") || "?"} and device pixel ratio ${devicePixelRatio}`;
}

function excerpt(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
}

function sameClipboard(before: ClipboardContent, after: ClipboardContent): boolean {
  return before.text === after.text && before.formats.join("\n") === after.formats.join("\n");
}

/** The last record of the key `chord` presses; its `code` is the chord's last part. */
function recordOf(records: readonly KeyRecord[], chord: string): KeyRecord | undefined {
  const code = chord.split("+").pop();
  return records.filter((record) => record.code === code).pop();
}

/**
 * The keys step (0.7): with the focus on the canvas, the zoom keys and Shift+1 change the readout as
 * guide §5.8 says, none of them reaches the webview's `window` (where VS Code forwards every key to
 * its own bindings), VS Code's window zoom stays as it was and Cmd/Ctrl+0 leaves the side bar alone.
 * Then Cmd/Ctrl+A selects the canvas's elements and no text, and Cmd/Ctrl+C leaves the clipboard
 * alone; a key the canvas handled does not reach `window` either. A key that never reaches the
 * webview ends the step, since every later one would fail the same way.
 */
export async function checkKeys(
  session: KeysSession,
  options: KeysCheckOptions,
): Promise<{ result: VsCodeSmokeKeysResult; failures: string[] }> {
  const failures: string[] = [];
  const result: VsCodeSmokeKeysResult = {
    zoom: [],
    windowZoomLevels: { before: [], after: [] },
    selected: 0,
  };
  const finish = async () => {
    result.windowZoomLevels.after = (await session.windowZoom()).levels;
    return { result, failures };
  };
  const { modifier } = session.keys;

  const windowZoomBefore = await session.windowZoom();
  result.windowZoomLevels.before = windowZoomBefore.levels;
  if (!(await session.focusCanvas())) {
    failures.push("the canvas <svg> did not take the focus");
    return finish();
  }
  const focusBefore = await session.workbenchFocus();
  await session.takeKeyRecords();
  const start = percentOf(await session.readout());
  result.start = start;
  if (start === undefined) {
    failures.push("the zoom panel shows no readout");
    return finish();
  }

  const reachedWindow = (chord: string) =>
    `${chord} reached the webview's window, where VS Code runs its own binding for it`;

  /** Presses `chord` and returns its record; undefined, and a failure, when it never arrived. */
  const press = async (chord: string): Promise<KeyRecord | undefined> => {
    await session.press(chord);
    const records: KeyRecord[] = [];
    const arrived = await pollUntil(
      async () => {
        records.push(...(await session.takeKeyRecords()));
        return recordOf(records, chord);
      },
      (record) => record !== undefined,
      options.effectTimeoutMs,
      options.intervalMs,
    );
    if (arrived.value) return arrived.value;
    const { webview, where } = await session.workbenchFocus();
    failures.push(
      `${chord} never reached the webview (VS Code's focus is on ${webview ? "the webview" : where})`,
    );
    return undefined;
  };

  let windowZoomed = false;
  const checkWindowZoom = async (chord: string) => {
    if (windowZoomed) return;
    const now = await session.windowZoom();
    if (sameWindowZoom(windowZoomBefore, now)) return;
    windowZoomed = true;
    failures.push(
      `VS Code zoomed its window by ${chord}: ${describeWindowZoom(windowZoomBefore)} before the keys, ` +
        `${describeWindowZoom(now)} after`,
    );
  };

  // The fit the last Shift+1 has to come back to, taken here: an inspector or a legend that opened
  // since the fixture's first fit moves it.
  const fitChord = "Shift+Digit1";
  const fitRecord = await press(fitChord);
  if (!fitRecord) return finish();
  if (fitRecord.reachedWindow) failures.push(reachedWindow(fitChord));
  await delay(options.graceMs);
  const fit = percentOf(await session.readout()) ?? start;
  result.zoom.push({ key: fitChord, percent: fit });
  await checkWindowZoom(fitChord);

  let current: number | undefined = fit;
  const zoomKey = async (zoomPress: ZoomKeyPress): Promise<boolean> => {
    const { chord, effect } = zoomPress;
    const previous = current;
    const record = await press(chord);
    if (!record) return false;
    if (record.reachedWindow) failures.push(reachedWindow(chord));
    const readout = await pollUntil(
      async () => percentOf(await session.readout()),
      (now) => zoomEffectShown(effect, previous, now, fit),
      options.effectTimeoutMs,
      options.intervalMs,
    );
    current = readout.value;
    result.zoom.push({ key: chord, percent: readout.value });
    if (!readout.met) failures.push(missedZoomEffect(zoomPress, previous, readout.value, fit));
    await delay(options.graceMs);
    await checkWindowZoom(chord);
    if (chord === `${modifier}+Digit0`) {
      const after = await session.workbenchFocus();
      if (after.sideBar) failures.push(`${chord} moved VS Code's focus to the side bar`);
      else if (after.where !== focusBefore.where) {
        failures.push(`${chord} moved VS Code's focus from ${focusBefore.where} to ${after.where}`);
      }
    }
    return true;
  };

  for (const zoomPress of zoomKeyPresses(modifier)) {
    // A key whose target the readout already shows proves nothing: zoom in first.
    const target = targetOf(zoomPress.effect, fit);
    const nudge: ZoomKeyPress = { chord: `${modifier}+Equal`, effect: "in" };
    if (target !== undefined && current === target && !(await zoomKey(nudge))) return finish();
    if (!(await zoomKey(zoomPress))) return finish();
  }

  const selectAll = `${modifier}+KeyA`;
  const selectAllRecord = await press(selectAll);
  if (!selectAllRecord) return finish();
  if (selectAllRecord.handled === true && selectAllRecord.reachedWindow) {
    failures.push(
      `${selectAll} reached the webview's window after the canvas handled it, and VS Code selects the page's text with it`,
    );
  }
  const selected = await pollUntil(
    () => session.selectedElements(),
    (count) => count > 0,
    options.effectTimeoutMs,
    options.intervalMs,
  );
  result.selected = selected.value;
  if (!selected.met) failures.push(`${selectAll} selected no element of the canvas`);
  await delay(options.graceMs);
  const text = await session.textSelection();
  if (text.trim()) failures.push(`${selectAll} selected the webview's text "${excerpt(text)}"`);

  const copy = `${modifier}+KeyC`;
  const clipboardBefore = await session.clipboard();
  const copyRecord = await press(copy);
  if (!copyRecord) return finish();
  if (copyRecord.handled === true && copyRecord.reachedWindow) {
    failures.push(
      `${copy} reached the webview's window after the canvas copied, and VS Code copies the page's text with it`,
    );
  }
  await delay(options.graceMs);
  const clipboardAfter = await session.clipboard();
  if (!sameClipboard(clipboardBefore, clipboardAfter)) {
    const formats = clipboardAfter.formats.join(", ") || "no format";
    failures.push(
      `${copy} on the canvas changed the clipboard, it holds "${excerpt(clipboardAfter.text)}" (${formats}) now`,
    );
  }
  return finish();
}
