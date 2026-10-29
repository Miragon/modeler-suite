import { describe, expect, it } from "vitest";

import {
  checkHidden,
  themeWhileHidden,
  type HiddenCheckOptions,
  type HiddenSession,
} from "./hidden.js";
import { platformKeys } from "./launch.js";
import { VSCODE_COLOR_THEMES, workbenchThemeClass, type VsCodeColorTheme } from "./themes.js";
import type { CanvasFacts, ContainerSize, KeyRecord, ViewFacts } from "./webview.js";

const [LIGHT, DARK, HIGH_CONTRAST_DARK, HIGH_CONTRAST_LIGHT] = VSCODE_COLOR_THEMES as [
  VsCodeColorTheme,
  VsCodeColorTheme,
  VsCodeColorTheme,
  VsCodeColorTheme,
];

const OPTIONS: HiddenCheckOptions = {
  effectTimeoutMs: 30,
  graceMs: 0,
  intervalMs: 5,
  colorThemes: VSCODE_COLOR_THEMES,
};

const CANVAS: CanvasFacts = { shapes: 3, connections: 1, positions: ["0,0", "100,0", "200,0"] };
const ELEMENTS = ["conn-1", "shape-a", "shape-b", "shape-c"];

interface FakeOptions {
  /** The webview keeps the focus and sees the keys pressed while its tab is hidden. */
  hiddenWebviewTakesKeys?: boolean | undefined;
  /** The webview refits once its tab shows again. */
  refitsOnReturn?: boolean | undefined;
  /** VS Code builds the webview anew on return, as without `retainContextWhenHidden`. */
  rebuildsWebview?: boolean | undefined;
  /** The selection is gone on return. */
  dropsSelectionOnReturn?: boolean | undefined;
  /** The webview keeps the theme it showed while hidden. */
  missesThemeWhileHidden?: boolean | undefined;
  /** VS Code keeps showing the webview over the untitled editor. */
  webviewStaysShown?: boolean | undefined;
  /** Cmd/Ctrl+N opens nothing. */
  noNewFile?: boolean | undefined;
  /** The container reports these sizes while its tab is hidden. */
  sizesWhileHidden?: ContainerSize[] | undefined;
}

/**
 * VS Code with a modeler's editor and the untitled text editor the step opens in front of it. The
 * active editor takes the keys: the canvas zooms and fits, the text editor types and deletes. A
 * dirty untitled editor that is closed would ask to save, which the fake counts as a prompt.
 */
function fakeVsCode(options: FakeOptions = {}) {
  const keys = platformKeys("linux");
  const fit = 0.62;
  let scale = fit;
  let translate = { x: 12, y: -8 };
  let selected = ["shape-a", "shape-b"];
  let untitled: string | undefined;
  let marked = false;
  let workbenchTheme = HIGH_CONTRAST_LIGHT;
  let webviewTheme = HIGH_CONTRAST_LIGHT;
  const records: KeyRecord[] = [];
  const sizes: ContainerSize[] = [];
  let prompts = 0;

  const record = (chord: string) =>
    records.push({
      key: chord,
      code: chord.split("+").at(-1)!,
      handled: false,
      reachedWindow: true,
    });

  const showModeler = () => {
    untitled = undefined;
    if (options.rebuildsWebview) marked = false;
    if (options.refitsOnReturn) {
      scale = fit;
      translate = { x: 0, y: 0 };
    }
    if (options.dropsSelectionOnReturn) selected = [];
    if (!options.missesThemeWhileHidden) webviewTheme = workbenchTheme;
  };

  const session: HiddenSession = {
    keys,
    press: async (chord) => {
      const modelerActive = untitled === undefined;
      if (modelerActive || options.hiddenWebviewTakesKeys) record(chord);
      if (modelerActive) {
        if (chord === `${keys.modifier}+KeyN` && !options.noNewFile) untitled = "";
        else if (chord === `${keys.modifier}+Equal`) scale *= 1.35;
        else if (chord === "Shift+Digit1") scale = fit;
        return;
      }
      if (chord === "Shift+Digit1") untitled += "!";
      else if (chord === "Backspace") untitled = untitled!.slice(0, -1);
      else if (chord === keys.close) {
        if (untitled) prompts += 1;
        else showModeler();
      }
    },
    focusCanvas: async () => true,
    scale: async () => scale,
    view: async (): Promise<ViewFacts> => ({
      scale,
      translateX: translate.x,
      translateY: translate.y,
      elements: ELEMENTS,
      selected: [...selected],
    }),
    canvas: async () => CANVAS,
    startWatching: async () => {
      marked = true;
      sizes.push({ width: 900, height: 600 });
      return true;
    },
    stillMarked: async () => marked,
    takeKeys: async () => records.splice(0),
    takeSizes: async () => sizes.splice(0),
    webviewShown: async () => untitled === undefined || options.webviewStaysShown === true,
    textEditorActive: async () => untitled !== undefined,
    dirty: async () => Boolean(untitled),
    workbenchThemeType: async () => workbenchThemeClass(workbenchTheme.kind),
    switchTheme: async (theme) => {
      workbenchTheme = theme;
      if (untitled !== undefined) sizes.push(...(options.sizesWhileHidden ?? []));
      return undefined;
    },
    webviewShowsTheme: async (theme) =>
      webviewTheme === theme ? undefined : `${theme.name}: the webview shows ${webviewTheme.name}`,
  };
  return { session, keys, prompts: () => prompts, untitledOpen: () => untitled !== undefined };
}

describe("checkHidden", () => {
  it("sees the hidden editor keep its webview, its view and its selection, and take the theme on return", async () => {
    const vscode = fakeVsCode();

    const { result, failures } = await checkHidden(vscode.session, OPTIONS);

    expect(failures).toEqual([]);
    expect(result).toEqual({
      before: { zoom: 84, selected: 2 },
      theme: LIGHT.name,
      sizesWhileHidden: [],
      afterReturn: { zoom: 84, selected: 2 },
    });
    expect(vscode.prompts()).toBe(0);
    expect(vscode.untitledOpen()).toBe(false);
  });

  it("reports the sizes the canvas container reported while hidden", async () => {
    const { result, failures } = await checkHidden(
      fakeVsCode({ sizesWhileHidden: [{ width: 0, height: 0 }] }).session,
      OPTIONS,
    );

    expect(failures).toEqual([]);
    expect(result.sizesWhileHidden).toEqual([{ width: 0, height: 0 }]);
  });

  it("fails a hidden webview that takes the keys pressed in the editor in front of it", async () => {
    const { failures } = await checkHidden(
      fakeVsCode({ hiddenWebviewTakesKeys: true }).session,
      OPTIONS,
    );

    expect(failures[0]).toBe(
      "the hidden editor's webview received Digit1, pressed in the text editor in front of it",
    );
  });

  it("fails a refit and a lost selection once the tab is back", async () => {
    expect(
      (await checkHidden(fakeVsCode({ refitsOnReturn: true }).session, OPTIONS)).failures,
    ).toEqual([
      "after the tab came back, the view moved: zoom 84% at 12, -8 before, zoom 62% at 0, 0",
    ]);
    expect(
      (await checkHidden(fakeVsCode({ dropsSelectionOnReturn: true }).session, OPTIONS)).failures,
    ).toEqual(["after the tab came back, the selection lost shape-a, shape-b"]);
  });

  it("fails a webview that comes back as a new document", async () => {
    const { failures, result } = await checkHidden(
      fakeVsCode({ rebuildsWebview: true }).session,
      OPTIONS,
    );

    expect(failures).toEqual([
      "the webview came back as a new document: VS Code did not keep it while the tab was hidden (retainContextWhenHidden)",
    ]);
    expect(result.afterReturn).toBeUndefined();
  });

  it("fails a webview that does not take the theme switched while it was hidden", async () => {
    const { failures } = await checkHidden(
      fakeVsCode({ missesThemeWhileHidden: true }).session,
      OPTIONS,
    );

    expect(failures).toEqual([
      `after the tab came back, ${LIGHT.name}: the webview shows ${HIGH_CONTRAST_LIGHT.name}`,
    ]);
  });

  it("fails, and closes the untitled editor again, when VS Code keeps showing the webview over it", async () => {
    const vscode = fakeVsCode({ webviewStaysShown: true });

    const { failures } = await checkHidden(vscode.session, OPTIONS);

    expect(failures).toEqual([
      "VS Code still shows the modeler's webview with the untitled text editor in front of it",
    ]);
    expect(vscode.untitledOpen()).toBe(false);
  });

  it("names the key when no untitled editor opens", async () => {
    const { failures } = await checkHidden(fakeVsCode({ noNewFile: true }).session, OPTIONS);

    expect(failures).toEqual([
      "Control+KeyN did not open an untitled text editor in front of the modeler's editor",
    ]);
  });
});

describe("themeWhileHidden", () => {
  it("takes the first theme of another type than the workbench shows", () => {
    expect(themeWhileHidden(VSCODE_COLOR_THEMES, "vs")).toBe(DARK);
    expect(themeWhileHidden(VSCODE_COLOR_THEMES, "hc-light")).toBe(LIGHT);
    expect(themeWhileHidden([HIGH_CONTRAST_DARK], "hc-black")).toBe(LIGHT);
  });
});
