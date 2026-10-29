import { describe, expect, it } from "vitest";

import { platformKeys } from "./launch.js";
import type { ReduceMotionSetting } from "./motion.js";
import { checkReload, type ReloadCheckOptions, type ReloadSession } from "./reload.js";
import type { CanvasFacts, ViewFacts } from "./webview.js";

const ORIGINAL: CanvasFacts = { shapes: 3, connections: 1, positions: ["0,0", "100,0", "200,0"] };
const EDITED: CanvasFacts = {
  shapes: 4,
  connections: 1,
  positions: ["0,0", "100,0", "200,0", "300,0"],
};

const OPTIONS: ReloadCheckOptions = {
  edited: EDITED,
  original: ORIGINAL,
  steps: 1,
  canvasTimeoutMs: 50,
  effectTimeoutMs: 30,
  graceMs: 0,
  stateWriteMs: 0,
  fitAnimationMs: 0,
  intervalMs: 5,
};

interface FakeOptions {
  /** The modeler shows no legend. */
  noLegend?: boolean | undefined;
  /** The new webview fits instead of taking the stored view. */
  fitsAfterReload?: boolean | undefined;
  /** The new webview opens the legend as the modeler's default, not as stored. */
  forgetsLegend?: boolean | undefined;
  /** VS Code restores the file from disk, without the unsaved change. */
  losesUnsavedChange?: boolean | undefined;
  /** The new webview starts without the reduced-motion classes. */
  startsWithMotion?: boolean | undefined;
  /** Developer: Reload Window fails with this text. */
  reloadFails?: string | undefined;
  /** The reload key leaves the webview as it was. */
  keepsWebview?: boolean | undefined;
  /** The redo key changes nothing. */
  redoDoesNothing?: boolean | undefined;
}

/**
 * VS Code with a modeler's editor whose document has the edit to redo, as the reload step sees it.
 * The webview stores its view and legend; a reload builds a new webview from that state, from the
 * document VS Code backed up and from the settings.
 */
function fakeVsCode(options: FakeOptions = {}) {
  const keys = platformKeys("linux");
  const fit = 0.62;
  let scale = fit;
  let translate = { x: 12, y: -8 };
  let edited = false;
  let saved = false;
  let legend: boolean | null = options.noLegend ? null : false;
  let reduceMotion: ReduceMotionSetting | undefined;
  let marked = false;
  let motionClasses = false;
  const written: ReduceMotionSetting[] = [];
  const pressed: string[] = [];

  const session: ReloadSession = {
    keys,
    press: async (chord) => {
      pressed.push(chord);
      if (chord === keys.redo && !options.redoDoesNothing) edited = true;
      else if (chord === keys.save) saved = edited;
      else if (chord === "Shift+Digit1") {
        scale = fit;
        translate = { x: 0, y: 0 };
      } else if (chord === `${keys.modifier}+Equal`) {
        scale *= 1.35;
        translate = { x: translate.x - 30, y: translate.y - 20 };
      }
    },
    focusCanvas: async () => true,
    scale: async () => scale,
    view: async (): Promise<ViewFacts> => ({
      scale,
      translateX: translate.x,
      translateY: translate.y,
      elements: [],
      selected: [],
    }),
    canvas: async () => (edited ? EDITED : ORIGINAL),
    dirty: async () => edited && !saved,
    setReduceMotion: async (setting) => {
      written.push(setting);
      reduceMotion = setting;
      motionClasses = setting === "on";
      return true;
    },
    webviewMotion: async () => ({ body: motionClasses, html: motionClasses }),
    legendOpen: async () => legend,
    toggleLegend: async () => (legend = legend === null ? null : !legend),
    markWebview: async () => {
      marked = true;
    },
    webviewMarked: async () => marked,
    reloadWindow: async () => {
      if (options.reloadFails) return options.reloadFails;
      if (options.keepsWebview) return undefined;
      marked = false;
      motionClasses = reduceMotion === "on" && !options.startsWithMotion;
      if (options.losesUnsavedChange) edited = false;
      if (options.fitsAfterReload) {
        scale = fit;
        translate = { x: 0, y: 0 };
      }
      if (options.forgetsLegend && legend !== null) legend = false;
      return undefined;
    },
    webviewShowsWorkbenchTheme: async () => undefined,
  };
  return { session, keys, written, pressed, dirty: () => edited && !saved };
}

describe("checkReload", () => {
  it("sees the reload bring back the unsaved change, the view and the legend under reduced motion", async () => {
    const vscode = fakeVsCode();

    const { result, failures } = await checkReload(vscode.session, OPTIONS);

    expect(failures).toEqual([]);
    expect(result).toEqual({
      before: { zoom: 84, dirty: true, legendOpen: true },
      after: { zoom: 84, dirty: true, legendOpen: true },
      reducedMotionAtStart: true,
    });
    expect(vscode.written).toEqual(["on"]);
    expect(vscode.dirty()).toBe(false);
    expect(vscode.pressed.at(-1)).toBe(vscode.keys.save);
  });

  it("leaves the legend out for a modeler without one", async () => {
    const { result, failures } = await checkReload(fakeVsCode({ noLegend: true }).session, OPTIONS);

    expect(failures).toEqual([]);
    expect(result.before).toEqual({ zoom: 84, dirty: true });
    expect(result.after).toEqual({ zoom: 84, dirty: true });
  });

  it("fails a first fit that wins over the stored view", async () => {
    const { failures } = await checkReload(fakeVsCode({ fitsAfterReload: true }).session, OPTIONS);

    expect(failures).toEqual([
      "the reload did not restore the view: zoom 84% at -30, -20 before, zoom 62% at 0, 0 after, the fit: the stored view has to win over the first fit",
    ]);
  });

  it("fails a legend that is not as it was stored", async () => {
    const { failures } = await checkReload(fakeVsCode({ forgetsLegend: true }).session, OPTIONS);

    expect(failures).toEqual(["the legend is closed after the reload, it was open before"]);
  });

  it("fails a reload that loses the unsaved change", async () => {
    const { failures } = await checkReload(
      fakeVsCode({ losesUnsavedChange: true }).session,
      OPTIONS,
    );

    expect(failures).toEqual([
      "the reload lost the unsaved change: VS Code does not call the document changed any more",
      "after the reload the canvas shows 3 shapes and 1 connections, before it 4 shapes and 1 connections",
    ]);
  });

  it("fails a webview that starts without reduced motion", async () => {
    const { result, failures } = await checkReload(
      fakeVsCode({ startsWithMotion: true }).session,
      OPTIONS,
    );

    expect(result.reducedMotionAtStart).toBe(false);
    expect(failures).toEqual([
      "after the reload with workbench.reduceMotion \"on\", the webview's <body> has no vscode-reduce-motion, which VS Code's webview sets for workbench.reduceMotion",
      "after the reload with workbench.reduceMotion \"on\", the webview's <html> has no cd-shell-reduce-motion, the shell's mirror of vscode-reduce-motion",
    ]);
  });

  it("ends with the reload's own failure, and with one when nothing was reloaded", async () => {
    expect(
      (await checkReload(fakeVsCode({ reloadFails: "the menu never came back" }).session, OPTIONS))
        .failures,
    ).toEqual(["the menu never came back"]);
    expect(
      (await checkReload(fakeVsCode({ keepsWebview: true }).session, OPTIONS)).failures,
    ).toEqual([
      "Developer: Reload Window left the webview's document as it was, so it restored nothing",
    ]);
  });

  it("names a redo that brought nothing back, which leaves the reload no unsaved change", async () => {
    const { failures, result } = await checkReload(
      fakeVsCode({ redoDoesNothing: true }).session,
      OPTIONS,
    );

    expect(failures).toEqual([
      "Control+y did not bring the edit back (the canvas shows 3 shapes and 1 connections), so the reload had no unsaved change to restore",
    ]);
    expect(result.after?.dirty).toBe(false);
  });
});
