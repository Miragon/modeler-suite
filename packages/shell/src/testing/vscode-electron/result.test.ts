import { describe, expect, it } from "vitest";

import {
  SmokeFailures,
  VSCODE_SMOKE_STEPS,
  formatVsCodeSmoke,
  missingChrome,
  sameAppearance,
  screenshotFileName,
  type VsCodeSmokeResult,
} from "./result.js";
import { VSCODE_COLOR_THEMES } from "./themes.js";

const [light, dark, highContrastDark] = VSCODE_COLOR_THEMES as [
  (typeof VSCODE_COLOR_THEMES)[number],
  (typeof VSCODE_COLOR_THEMES)[number],
  (typeof VSCODE_COLOR_THEMES)[number],
];

describe("SmokeFailures", () => {
  it("prefixes every failure with its step", () => {
    const failures = new SmokeFailures();
    failures.add("save", "Meta+s wrote nothing to disk");
    expect(failures.list).toEqual(["save: Meta+s wrote nothing to disk"]);
    expect(failures.has("save")).toBe(true);
    expect(failures.has("undo")).toBe(false);
  });
});

describe("VSCODE_SMOKE_STEPS", () => {
  it("are the steps in the order a run takes them", () => {
    expect(VSCODE_SMOKE_STEPS).toEqual([
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
    ]);
  });
});

describe("missingChrome", () => {
  it("is undefined when every expected island is visible", () => {
    expect(
      missingChrome(["menu", "zoom"], { menu: true, zoom: true, palette: false }),
    ).toBeUndefined();
  });

  it("names the islands that are missing or hidden", () => {
    expect(missingChrome(["menu", "palette", "zoom"], { menu: true, palette: false })).toBe(
      `the shell's chrome is incomplete: [data-chrome="palette"], [data-chrome="zoom"] not visible`,
    );
  });
});

describe("sameAppearance", () => {
  it("compares both attributes", () => {
    expect(sameAppearance({ theme: "light" }, { theme: "light" })).toBe(true);
    expect(sameAppearance({ theme: "light", kontrast: "hoch" }, { theme: "light" })).toBe(false);
    expect(sameAppearance({ theme: "light" }, { theme: "dark" })).toBe(false);
    expect(sameAppearance({ theme: "light" }, undefined)).toBe(false);
  });
});

describe("screenshotFileName", () => {
  it("is <name>-<theme id>.png, with a name safe for every file system", () => {
    expect(screenshotFileName("wardley", highContrastDark)).toBe("wardley-high-contrast-dark.png");
    expect(screenshotFileName("@miragon/event storming", light)).toBe(
      "-miragon-event-storming-light.png",
    );
  });
});

function result(overrides: Partial<VsCodeSmokeResult> = {}): VsCodeSmokeResult {
  return {
    ok: true,
    failures: [],
    vscodeVersion: "1.143.0",
    executablePath: "/cache/Code",
    extensionId: "miragon-gmbh.wardley-mapping-modeler",
    viewType: "wardley.mapEditor",
    chrome: { menu: true, palette: true, zoom: true },
    saved: { text: "component A [0.5, 0.5]", parsed: {} },
    undone: true,
    themes: [
      {
        theme: light,
        expected: { theme: "light" },
        observed: { theme: "light" },
        bodyClasses: ["vscode-light"],
        chrome: { menu: true },
        screenshot: "/shots/wardley-light.png",
        ms: 412,
        ok: true,
      },
    ],
    timings: {
      resolve: 310,
      launch: 1620,
      open: 980,
      edit: 640,
      save: 230,
      undo: 560,
      themes: 412,
      total: 4900,
    },
    ...overrides,
  };
}

describe("formatVsCodeSmoke", () => {
  it("lists version, extension, timings and every theme", () => {
    expect(formatVsCodeSmoke(result()).split("\n")).toEqual([
      "VS Code 1.143.0 · miragon-gmbh.wardley-mapping-modeler · wardley.mapEditor · ok",
      "resolve 0.3 s · launch 1.6 s · open 1.0 s · edit 0.6 s · save 0.2 s · undo 0.6 s · themes 0.4 s · total 4.9 s",
      "  ok     Default Light Modern: light (expected light), 0.4 s, /shots/wardley-light.png",
    ]);
  });

  it("ends with the failures and marks a failed theme", () => {
    const text = formatVsCodeSmoke(
      result({
        ok: false,
        failures: [
          "themes: Default Dark Modern: the webview shows dark, the theme bridge has to show light",
        ],
        themes: [
          {
            theme: dark,
            expected: { theme: "light" },
            observed: { theme: "dark" },
            bodyClasses: ["vscode-dark"],
            chrome: {},
            ms: 30_050,
            ok: false,
          },
        ],
        timings: { resolve: 300, total: 31_000 },
      }),
    );
    expect(text.split("\n")).toEqual([
      "VS Code 1.143.0 · miragon-gmbh.wardley-mapping-modeler · wardley.mapEditor · 1 failure",
      "resolve 0.3 s · total 31.0 s",
      "  FAILED Default Dark Modern: dark (expected light), 30.1 s",
      "failures:",
      "  - themes: Default Dark Modern: the webview shows dark, the theme bridge has to show light",
    ]);
  });

  it("adds a line for the keys step: the readouts, the window zoom and the selection", () => {
    const text = formatVsCodeSmoke(
      result({
        keys: {
          start: 62,
          zoom: [
            { key: "Control+Digit0", percent: 100 },
            { key: "Control+Equal", percent: 135 },
            { key: "Shift+Digit1" },
          ],
          windowZoomLevels: { before: [0], after: [0] },
          selected: 7,
        },
        timings: { themes: 412, keys: 3_210, total: 8_200 },
      }),
    );
    expect(text.split("\n").slice(1)).toEqual([
      "themes 0.4 s · keys 3.2 s · total 8.2 s",
      "  ok     Default Light Modern: light (expected light), 0.4 s, /shots/wardley-light.png",
      "  keys: zoom 62% → 100% → 135% → ?, window zoom level 0 → 0, select all selected 7",
    ]);
  });

  it("adds a line for the history step: the view and the selection before the redo, after it and after the undo", () => {
    const text = formatVsCodeSmoke(
      result({
        history: {
          before: { zoom: 84, selected: 7 },
          afterRedo: { zoom: 84, selected: 7 },
        },
        timings: { keys: 3_210, history: 2_400, total: 8_200 },
      }),
    );
    expect(text.split("\n").slice(1)).toEqual([
      "keys 3.2 s · history 2.4 s · total 8.2 s",
      "  ok     Default Light Modern: light (expected light), 0.4 s, /shots/wardley-light.png",
      "  history: view 84% with 7 selected, after the redo 84% with 7 selected, after the undo ?",
    ]);
  });

  it("adds a line for each workbench step: the fit's views, the hidden tab and the reload", () => {
    const text = formatVsCodeSmoke(
      result({
        motion: { reducedFitViews: 2, enabledFitViews: 14 },
        hidden: {
          before: { zoom: 135, selected: 3 },
          theme: "Default Light Modern",
          sizesWhileHidden: [],
          afterReturn: { zoom: 135, selected: 3 },
        },
        reload: {
          before: { zoom: 84, dirty: true, legendOpen: true },
          after: { zoom: 84, dirty: true, legendOpen: true },
          reducedMotionAtStart: true,
        },
        timings: { motion: 2_100, hidden: 3_300, reload: 6_400, total: 12_000 },
      }),
    );
    expect(text.split("\n").slice(1)).toEqual([
      "motion 2.1 s · hidden 3.3 s · reload 6.4 s · total 12.0 s",
      "  ok     Default Light Modern: light (expected light), 0.4 s, /shots/wardley-light.png",
      "  motion: a fit showed 2 views under reduced motion, 14 without",
      "  hidden: view 135% with 3 selected, hidden under Default Light Modern (no resize), back at 135% with 3 selected",
      "  reload: view 84% (unsaved, legend open) before, 84% (unsaved, legend open) after, with reduced motion at start",
    ]);
  });

  it("names what the workbench steps did not see, and the sizes a hidden tab reported", () => {
    const text = formatVsCodeSmoke(
      result({
        motion: { reducedFitViews: 9 },
        hidden: { sizesWhileHidden: [{ width: 0, height: 0 }] },
        reload: { before: { zoom: 62, dirty: false } },
        timings: { total: 12_000 },
      }),
    );
    expect(text.split("\n").slice(3)).toEqual([
      "  motion: a fit showed 9 views under reduced motion, ? without",
      "  hidden: view ?, hidden under ? (resized to 0 × 0), back at ?",
      "  reload: view 62% (saved) before, ? after",
    ]);
  });

  it("says what is unknown when VS Code never resolved", () => {
    const text = formatVsCodeSmoke(
      result({
        ok: false,
        failures: ["resolve: getaddrinfo ENOTFOUND update.code.visualstudio.com", "launch: x"],
        vscodeVersion: undefined,
        themes: [],
        timings: { resolve: 50, total: 60 },
      }),
    );
    expect(text.split("\n")[0]).toBe(
      "VS Code (not resolved) · miragon-gmbh.wardley-mapping-modeler · wardley.mapEditor · 2 failures",
    );
  });
});
