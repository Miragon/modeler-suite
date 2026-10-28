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
