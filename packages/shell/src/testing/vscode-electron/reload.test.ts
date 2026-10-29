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
  /** The modeler shows its legend without an entry in the menu (`menuEntry: false`). */
  legendWithoutMenuEntry?: boolean | undefined;
  /** The new webview fits instead of taking the stored view. */
  fitsAfterReload?: boolean | undefined;
  /** The new webview opens the legend as the modeler's default, not as stored. */
  forgetsLegend?: boolean | undefined;
  /** The new webview shows the fixture as VS Code opened it at start, not the saved document. */
  showsStartFixture?: boolean | undefined;
  /** VS Code calls the document changed after the reload. */
  dirtyAfterReload?: boolean | undefined;
  /** VS Code calls the document changed this long after the reload has shown the canvas. */
  dirtyLateAfterReloadMs?: number | undefined;
  /** The save key writes nothing. */
  saveDoesNothing?: boolean | undefined;
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
 * document on disk and from the settings.
 */
function fakeVsCode(options: FakeOptions = {}) {
  const keys = platformKeys("linux");
  const fit = 0.62;
  let scale = fit;
  let translate = { x: 12, y: -8 };
  let edited = false;
  let saved = false;
  let dirtyAfterReload = false;
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
      else if (chord === keys.save && !options.saveDoesNothing) saved = edited;
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
    dirty: async () => (edited && !saved) || dirtyAfterReload,
    setReduceMotion: async (setting) => {
      written.push(setting);
      reduceMotion = setting;
      motionClasses = setting === "on";
      return true;
    },
    webviewMotion: async () => ({ body: motionClasses, html: motionClasses }),
    legendOpen: async () => legend,
    toggleLegend: async () => {
      if (legend === null || options.legendWithoutMenuEntry) return null;
      return (legend = !legend);
    },
    markWebview: async () => {
      marked = true;
    },
    webviewMarked: async () => marked,
    reloadWindow: async () => {
      if (options.reloadFails) return options.reloadFails;
      if (options.keepsWebview) return undefined;
      marked = false;
      motionClasses = reduceMotion === "on" && !options.startsWithMotion;
      if (options.showsStartFixture) edited = false;
      dirtyAfterReload = options.dirtyAfterReload === true;
      const late = options.dirtyLateAfterReloadMs;
      if (late !== undefined) setTimeout(() => (dirtyAfterReload = true), late);
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
  it("sees the reload bring back the saved edit, the view and the legend under reduced motion", async () => {
    const vscode = fakeVsCode();

    const { result, failures } = await checkReload(vscode.session, OPTIONS);

    expect(failures).toEqual([]);
    expect(result).toEqual({
      before: { zoom: 84, dirty: false, legendOpen: true },
      after: { zoom: 84, dirty: false, legendOpen: true },
      reducedMotionAtStart: true,
    });
    expect(vscode.written).toEqual(["on"]);
    expect(vscode.pressed.slice(0, 3)).toEqual([
      vscode.keys.redo,
      vscode.keys.save,
      "Shift+Digit1",
    ]);
    expect(vscode.dirty()).toBe(false);
  });

  it("leaves the legend out for a modeler without one", async () => {
    const { result, failures } = await checkReload(fakeVsCode({ noLegend: true }).session, OPTIONS);

    expect(failures).toEqual([]);
    expect(result.before).toEqual({ zoom: 84, dirty: false });
    expect(result.after).toEqual({ zoom: 84, dirty: false });
  });

  it("leaves the legend out, and says so, for a legend without a menu entry", async () => {
    const { result, failures } = await checkReload(
      fakeVsCode({ legendWithoutMenuEntry: true }).session,
      OPTIONS,
    );

    expect(failures).toEqual([]);
    expect(result).toEqual({
      before: { zoom: 84, dirty: false },
      after: { zoom: 84, dirty: false },
      reducedMotionAtStart: true,
      legendWithoutMenuEntry: true,
    });
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

  it("fails a webview that shows the fixture of the start instead of the saved document", async () => {
    const { failures } = await checkReload(
      fakeVsCode({ showsStartFixture: true }).session,
      OPTIONS,
    );

    expect(failures).toEqual([
      "after the reload the canvas shows the fixture as VS Code opened it at start, not the document as saved before it (4 shapes and 1 connections)",
    ]);
  });

  it("fails a document VS Code calls changed after the reload", async () => {
    const { failures, result } = await checkReload(
      fakeVsCode({ dirtyAfterReload: true }).session,
      OPTIONS,
    );

    expect(failures).toEqual([
      "VS Code calls the document changed after the reload, though it was saved before it",
    ]);
    expect(result.after?.dirty).toBe(true);
  });

  it("fails a document VS Code calls changed a moment after the reload showed the canvas", async () => {
    const { failures, result } = await checkReload(
      fakeVsCode({ dirtyLateAfterReloadMs: 10 }).session,
      { ...OPTIONS, graceMs: 40 },
    );

    expect(failures).toEqual([
      "VS Code calls the document changed after the reload, though it was saved before it",
    ]);
    expect(result.after?.dirty).toBe(true);
  });

  it("names a save that left the redone edit unsaved", async () => {
    const { failures } = await checkReload(fakeVsCode({ saveDoesNothing: true }).session, OPTIONS);

    expect(failures).toEqual(["Control+s left the redone edit unsaved before the reload"]);
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

  it("names a redo that brought nothing back, which leaves the reload no saved edit", async () => {
    const { failures, result } = await checkReload(
      fakeVsCode({ redoDoesNothing: true }).session,
      OPTIONS,
    );

    expect(failures).toEqual([
      "Control+y did not bring the edit back (the canvas shows 3 shapes and 1 connections), so the reload had no saved edit to show",
    ]);
    expect(result.after?.dirty).toBe(false);
  });
});
