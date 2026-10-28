import { describe, expect, it } from "vitest";

import {
  checkKeys,
  percentOf,
  sameWindowZoom,
  zoomEffectShown,
  zoomKeyPresses,
  type ClipboardContent,
  type KeysSession,
} from "./keys.js";
import { platformKeys } from "./launch.js";
import type { KeyRecord } from "./webview.js";

// diagram-js's ZoomScroll: ten logarithmic steps between 20 % and 400 %, snapped before each step.
const STEP = (Math.log10(4) - Math.log10(0.2)) / 10;
const step = (zoom: number, direction: 1 | -1) =>
  10 ** ((Math.round(Math.log10(zoom) / STEP) + direction) * STEP);

const SIDE_BAR = "workbench.parts.sidebar";
const WEBVIEW = "iframe.webview";
const CHROME_TEXT = "Zoom out 100% Zoom in Fit";

interface FakeVsCodeOptions {
  /** The zoom Shift+1 fits the fixture at. */
  fit?: number | undefined;
  /** The zoom before the keys; default the fit. */
  start?: number | undefined;
  /** Keys the shell or the canvas handles but still lets through to `window`. */
  leaks?: readonly string[] | undefined;
  /** Keys neither the shell nor the canvas handles. */
  ignored?: readonly string[] | undefined;
  /** The canvas takes no focus. */
  canvasRefusesFocus?: boolean | undefined;
}

/**
 * VS Code with a modeler's webview, as the keys step sees it: the shell zooms the canvas on the
 * zoom keys and stops them, the canvas selects on Cmd/Ctrl+A and copies on Cmd/Ctrl+C. A key that
 * reaches `window` goes on to VS Code, which zooms its window, focuses the side bar on Cmd/Ctrl+0,
 * selects the webview's text and copies it. Keys pressed while the side bar has the focus never
 * reach the webview.
 */
function fakeVsCode(options: FakeVsCodeOptions = {}) {
  const keys = platformKeys("linux");
  const fit = options.fit ?? 0.62;
  let zoom = options.start ?? fit;
  let records: KeyRecord[] = [];
  let selected = 0;
  let textSelection = "";
  let windowZoomLevel = 0;
  let focus = WEBVIEW;
  let clipboard: ClipboardContent = { formats: ["text/plain"], text: "before the run" };
  const pressed: string[] = [];

  const vsCodeRuns = (code: string) => {
    if (code === "Equal" || code === "NumpadAdd") windowZoomLevel += 1;
    else if (code === "Minus" || code === "NumpadSubtract") windowZoomLevel -= 1;
    else if (code === "Numpad0") windowZoomLevel = 0;
    else if (code === "Digit0") focus = SIDE_BAR;
    else if (code === "KeyA") textSelection = CHROME_TEXT;
    else if (code === "KeyC" && textSelection) {
      clipboard = { formats: ["text/plain", "text/html"], text: textSelection };
    }
  };

  /** Returns whether the shell or the canvas handled the key. */
  const webviewRuns = (code: string, shift: boolean): boolean => {
    switch (code) {
      case "Equal":
      case "NumpadAdd":
        zoom = step(zoom, 1);
        return true;
      case "Minus":
      case "NumpadSubtract":
        zoom = step(zoom, -1);
        return true;
      case "Digit0":
      case "Numpad0":
        zoom = 1;
        return true;
      case "Digit1":
        if (shift) zoom = fit;
        return shift;
      case "KeyA":
        selected = 3;
        return true;
      case "KeyC":
        return selected > 0;
      default:
        return false;
    }
  };

  const session: KeysSession = {
    keys,
    press: async (chord) => {
      pressed.push(chord);
      if (focus !== WEBVIEW) return;
      const parts = chord.split("+");
      const code = parts.pop()!;
      const handled =
        !(options.ignored ?? []).includes(chord) && webviewRuns(code, parts.includes("Shift"));
      const reachedWindow = !handled || (options.leaks ?? []).includes(chord);
      records.push({ key: "", code, handled, reachedWindow });
      if (reachedWindow) vsCodeRuns(code);
    },
    focusCanvas: async () => !options.canvasRefusesFocus,
    readout: async () => `${Math.round(zoom * 100)}%`,
    takeKeyRecords: async () => {
      const taken = records;
      records = [];
      return taken;
    },
    selectedElements: async () => selected,
    textSelection: async () => textSelection,
    workbenchFocus: async () => ({
      webview: focus === WEBVIEW,
      sideBar: focus === SIDE_BAR,
      where: focus,
    }),
    windowZoom: async () => ({ levels: [windowZoomLevel], devicePixelRatio: 1 }),
    clipboard: async () => clipboard,
  };
  return { session, pressed };
}

const OPTIONS = { effectTimeoutMs: 30, graceMs: 0, intervalMs: 5 };

describe("zoomKeyPresses", () => {
  it("presses every zoom key of guide §5.8, the numpad and Shift+1 included", () => {
    expect(zoomKeyPresses("Meta")).toEqual([
      { chord: "Meta+Digit0", effect: "actual" },
      { chord: "Meta+Equal", effect: "in" },
      { chord: "Meta+Shift+Equal", effect: "in" },
      { chord: "Meta+NumpadAdd", effect: "in" },
      { chord: "Meta+Digit0", effect: "actual" },
      { chord: "Meta+Minus", effect: "out" },
      { chord: "Meta+Shift+Minus", effect: "out" },
      { chord: "Meta+NumpadSubtract", effect: "out" },
      { chord: "Meta+Numpad0", effect: "actual" },
      { chord: "Shift+Digit1", effect: "fit" },
    ]);
  });
});

describe("percentOf", () => {
  it("reads the whole percentage of an English or a German readout", () => {
    expect(percentOf("86%")).toBe(86);
    expect(percentOf("135 %")).toBe(135);
    expect(percentOf("")).toBeUndefined();
    expect(percentOf(null)).toBeUndefined();
  });
});

describe("zoomEffectShown", () => {
  it("needs a change for zoom in and out, 100 % for Cmd/Ctrl+0 and the fit within its rounding", () => {
    expect(zoomEffectShown("in", 100, 135, 62)).toBe(true);
    expect(zoomEffectShown("in", 100, 100, 62)).toBe(false);
    expect(zoomEffectShown("out", 100, 74, 62)).toBe(true);
    expect(zoomEffectShown("out", undefined, 74, 62)).toBe(false);
    expect(zoomEffectShown("actual", 41, 100, 62)).toBe(true);
    expect(zoomEffectShown("actual", 41, 99, 62)).toBe(false);
    expect(zoomEffectShown("fit", 100, 63, 62)).toBe(true);
    expect(zoomEffectShown("fit", 100, 64, 62)).toBe(false);
    expect(zoomEffectShown("fit", 100, undefined, 62)).toBe(false);
  });
});

describe("sameWindowZoom", () => {
  it("compares every window's level and the pixel ratio", () => {
    const zoom = { levels: [0, 0], devicePixelRatio: 1 };
    expect(sameWindowZoom(zoom, { levels: [0, 0], devicePixelRatio: 1 })).toBe(true);
    expect(sameWindowZoom(zoom, { levels: [0, 1], devicePixelRatio: 1 })).toBe(false);
    expect(sameWindowZoom(zoom, { levels: [0], devicePixelRatio: 1 })).toBe(false);
    expect(sameWindowZoom(zoom, { levels: [0, 0], devicePixelRatio: 1.1 })).toBe(false);
  });
});

describe("checkKeys", () => {
  it("passes a webview that handles every key, and records each readout", async () => {
    const { session } = fakeVsCode();

    const { result, failures } = await checkKeys(session, OPTIONS);

    expect(failures).toEqual([]);
    expect(result).toEqual({
      start: 62,
      zoom: [
        { key: "Shift+Digit1", percent: 62 },
        { key: "Control+Digit0", percent: 100 },
        { key: "Control+Equal", percent: 135 },
        { key: "Control+Shift+Equal", percent: 182 },
        { key: "Control+NumpadAdd", percent: 246 },
        { key: "Control+Digit0", percent: 100 },
        { key: "Control+Minus", percent: 74 },
        { key: "Control+Shift+Minus", percent: 55 },
        { key: "Control+NumpadSubtract", percent: 41 },
        { key: "Control+Numpad0", percent: 100 },
        { key: "Shift+Digit1", percent: 62 },
      ],
      windowZoomLevels: { before: [0], after: [0] },
      selected: 3,
    });
  });

  it("comes back to the fit of the first Shift+1, not to the zoom before the keys", async () => {
    const { session } = fakeVsCode({ start: 0.5 });

    const { result, failures } = await checkKeys(session, OPTIONS);

    expect(failures).toEqual([]);
    expect(result.start).toBe(50);
    expect(result.zoom.at(0)).toEqual({ key: "Shift+Digit1", percent: 62 });
    expect(result.zoom.at(-1)).toEqual({ key: "Shift+Digit1", percent: 62 });
  });

  it("zooms in first where the readout already shows what the next key would", async () => {
    const { session, pressed } = fakeVsCode({ fit: 1 });

    const { result, failures } = await checkKeys(session, OPTIONS);

    expect(failures).toEqual([]);
    expect(pressed.slice(0, 4)).toEqual([
      "Shift+Digit1",
      "Control+Equal",
      "Control+Digit0",
      "Control+Equal",
    ]);
    expect(result.zoom.slice(-3)).toEqual([
      { key: "Control+Numpad0", percent: 100 },
      { key: "Control+Equal", percent: 135 },
      { key: "Shift+Digit1", percent: 100 },
    ]);
  });

  it("names a zoom key that reached the window and the window zoom VS Code applied for it", async () => {
    const { session } = fakeVsCode({ leaks: ["Control+Shift+Equal"] });

    const { result, failures } = await checkKeys(session, OPTIONS);

    expect(failures).toEqual([
      "Control+Shift+Equal reached the webview's window, where VS Code runs its own binding for it",
      "VS Code zoomed its window by Control+Shift+Equal: zoom level 0 and device pixel ratio 1 before the keys, " +
        "zoom level 1 and device pixel ratio 1 after",
    ]);
    expect(result.windowZoomLevels).toEqual({ before: [0], after: [1] });
  });

  it("names a Shift+1 that reached the window, the first one included", async () => {
    const { session } = fakeVsCode({ leaks: ["Shift+Digit1"] });

    const { failures } = await checkKeys(session, OPTIONS);

    expect(failures).toEqual([
      "Shift+Digit1 reached the webview's window, where VS Code runs its own binding for it",
      "Shift+Digit1 reached the webview's window, where VS Code runs its own binding for it",
    ]);
  });

  it("names a zoom key the shell ignored, which VS Code then ran", async () => {
    const { session } = fakeVsCode({ ignored: ["Control+NumpadSubtract"] });

    const { failures } = await checkKeys(session, OPTIONS);

    expect(failures).toEqual([
      "Control+NumpadSubtract reached the webview's window, where VS Code runs its own binding for it",
      "Control+NumpadSubtract did not zoom the canvas out: the readout shows 55%, 55% before",
      "VS Code zoomed its window by Control+NumpadSubtract: zoom level 0 and device pixel ratio 1 before the keys, " +
        "zoom level -1 and device pixel ratio 1 after",
    ]);
  });

  it("ends when Cmd/Ctrl+0 took VS Code's focus to the side bar, and the next key never arrived", async () => {
    const { session } = fakeVsCode({ leaks: ["Control+Digit0"] });

    const { result, failures } = await checkKeys(session, OPTIONS);

    expect(failures).toEqual([
      "Control+Digit0 reached the webview's window, where VS Code runs its own binding for it",
      "Control+Digit0 moved VS Code's focus to the side bar",
      "Control+Equal never reached the webview (VS Code's focus is on workbench.parts.sidebar)",
    ]);
    expect(result.zoom).toEqual([
      { key: "Shift+Digit1", percent: 62 },
      { key: "Control+Digit0", percent: 100 },
    ]);
    expect(result.selected).toBe(0);
  });

  it("fails a select all the canvas leaves to VS Code, and the copy of the text it selected", async () => {
    const { session } = fakeVsCode({ ignored: ["Control+KeyA"] });

    const { result, failures } = await checkKeys(session, OPTIONS);

    expect(failures).toEqual([
      "Control+KeyA selected no element of the canvas",
      `Control+KeyA selected the webview's text "${CHROME_TEXT}"`,
      `Control+KeyC on the canvas changed the clipboard, it holds "${CHROME_TEXT}" (text/plain, text/html) now`,
    ]);
    expect(result.selected).toBe(0);
  });

  it("fails select all and copy that the canvas handled but let through to VS Code", async () => {
    const { session } = fakeVsCode({ leaks: ["Control+KeyA", "Control+KeyC"] });

    const { failures } = await checkKeys(session, OPTIONS);

    expect(failures).toEqual([
      "Control+KeyA reached the webview's window after the canvas handled it, and VS Code selects the page's text with it",
      `Control+KeyA selected the webview's text "${CHROME_TEXT}"`,
      "Control+KeyC reached the webview's window after the canvas copied, and VS Code copies the page's text with it",
      `Control+KeyC on the canvas changed the clipboard, it holds "${CHROME_TEXT}" (text/plain, text/html) now`,
    ]);
  });

  it("lets a copy the canvas did not handle go on to VS Code, which copies no text", async () => {
    const { session } = fakeVsCode({ ignored: ["Control+KeyC"] });

    const { failures } = await checkKeys(session, OPTIONS);

    expect(failures).toEqual([]);
  });

  it("ends at once when the canvas takes no focus", async () => {
    const { session, pressed } = fakeVsCode({ canvasRefusesFocus: true });

    const { result, failures } = await checkKeys(session, OPTIONS);

    expect(failures).toEqual(["the canvas <svg> did not take the focus"]);
    expect(pressed).toEqual([]);
    expect(result.windowZoomLevels).toEqual({ before: [0], after: [0] });
  });
});
