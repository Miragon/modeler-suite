import { describe, expect, it } from "vitest";

import { platformKeys } from "./launch.js";
import {
  checkMotion,
  workbenchMotionOf,
  writeWorkbenchSetting,
  type MotionCheckOptions,
  type MotionSession,
  type ReduceMotionSetting,
} from "./motion.js";

const OPTIONS: MotionCheckOptions = {
  effectTimeoutMs: 30,
  fitAnimationMs: 0,
  graceMs: 0,
  intervalMs: 5,
};

interface FakeOptions {
  /** VS Code never shows this setting on the workbench. */
  ignoresSetting?: ReduceMotionSetting | undefined;
  /** VS Code's webview leaves `vscode-reduce-motion` off `<body>`. */
  noBodyClass?: boolean | undefined;
  /** The shell does not mirror the body class on `<html>`. */
  noMirror?: boolean | undefined;
  /** The mirror stays on `<html>` once set. */
  mirrorSticks?: boolean | undefined;
  /** The fit glides under reduced motion too. */
  glidesWhenReduced?: boolean | undefined;
  /** The zoom keys leave the zoom alone. */
  zoomKeysIgnored?: boolean | undefined;
  canvasRefusesFocus?: boolean | undefined;
}

/** A glide of 250 ms at 60 frames a second. */
const GLIDE_FRAMES = 15;

/**
 * VS Code with a modeler's webview as the motion step sees it: the setting reaches the workbench,
 * VS Code's body class and the shell's mirror, and Shift+1 fits, gliding through many views or,
 * under reduced motion, jumping.
 */
function fakeVsCode(options: FakeOptions = {}) {
  const keys = platformKeys("linux");
  const fit = 0.62;
  let scale = fit;
  let workbenchReduced = false;
  let html = false;
  let watching: string[] | undefined;
  const written: ReduceMotionSetting[] = [];
  const pressed: string[] = [];

  const session: MotionSession = {
    keys,
    press: async (chord) => {
      pressed.push(chord);
      if (chord === "Shift+Digit1") {
        const glides = !workbenchReduced || options.glidesWhenReduced;
        const steps = glides ? GLIDE_FRAMES : 1;
        const from = scale;
        for (let step = 1; step <= steps; step++) {
          scale = from + ((fit - from) * step) / steps;
          watching?.push(`${scale}`);
        }
      } else if (!options.zoomKeysIgnored && chord === `${keys.modifier}+Equal`) {
        scale *= 1.35;
      } else if (!options.zoomKeysIgnored && chord === `${keys.modifier}+Minus`) {
        scale /= 1.35;
      }
    },
    focusCanvas: async () => !options.canvasRefusesFocus,
    setReduceMotion: async (setting) => {
      written.push(setting);
      if (options.ignoresSetting === setting) return false;
      workbenchReduced = setting === "on";
      if (
        !options.noMirror &&
        !options.noBodyClass &&
        (workbenchReduced || !options.mirrorSticks)
      ) {
        html = workbenchReduced;
      }
      return true;
    },
    webviewMotion: async () => ({ body: workbenchReduced && !options.noBodyClass, html }),
    scale: async () => scale,
    watchViews: async () => {
      watching = [`${scale}`];
      return true;
    },
    takeViews: async () => {
      const views = watching ?? [];
      watching = undefined;
      return views;
    },
  };
  return { session, written, pressed, keys };
}

describe("checkMotion", () => {
  it("sees the setting reach the webview, a fit that jumps under it and one that glides without", async () => {
    const vscode = fakeVsCode();

    const { result, failures } = await checkMotion(vscode.session, OPTIONS);

    expect(failures).toEqual([]);
    expect(result).toEqual({ reducedFitViews: 2, enabledFitViews: GLIDE_FRAMES + 1 });
    expect(vscode.written).toEqual(["on", "off"]);
    expect(vscode.pressed).toEqual([
      "Control+Equal",
      "Shift+Digit1",
      "Control+Equal",
      "Shift+Digit1",
    ]);
  });

  it("fails a fit that glides under reduced motion", async () => {
    const { result, failures } = await checkMotion(
      fakeVsCode({ glidesWhenReduced: true }).session,
      OPTIONS,
    );

    expect(failures).toEqual([
      `Shift+Digit1 passed through ${GLIDE_FRAMES} views under reduced motion; an explicit fit jumps there (guide §5.9, §7)`,
    ]);
    expect(result.reducedFitViews).toBe(GLIDE_FRAMES + 1);
  });

  it("names a webview that does not mirror the setting, and one whose mirror stays", async () => {
    expect((await checkMotion(fakeVsCode({ noMirror: true }).session, OPTIONS)).failures).toEqual([
      "with workbench.reduceMotion \"on\", the webview's <html> has no cd-shell-reduce-motion, the shell's mirror of vscode-reduce-motion",
    ]);
    expect(
      (await checkMotion(fakeVsCode({ mirrorSticks: true }).session, OPTIONS)).failures,
    ).toEqual([
      "with workbench.reduceMotion \"off\", the webview's <html> still has cd-shell-reduce-motion, the shell's mirror of vscode-reduce-motion",
    ]);
  });

  it("names VS Code's webview when its body never gets the class", async () => {
    const { result, failures } = await checkMotion(
      fakeVsCode({ noBodyClass: true }).session,
      OPTIONS,
    );

    expect(failures).toEqual([
      "with workbench.reduceMotion \"on\", the webview's <body> has no vscode-reduce-motion, which VS Code's webview sets for workbench.reduceMotion",
      "with workbench.reduceMotion \"on\", the webview's <html> has no cd-shell-reduce-motion, the shell's mirror of vscode-reduce-motion",
    ]);
    expect(result.reducedFitViews).toBeUndefined();
  });

  it("fails when VS Code never applies the setting, and skips the fit it would have checked", async () => {
    const vscode = fakeVsCode({ ignoresSetting: "on" });

    const { result, failures } = await checkMotion(vscode.session, OPTIONS);

    expect(failures).toEqual([
      'VS Code did not apply workbench.reduceMotion "on": .monaco-workbench never showed reduced motion',
    ]);
    expect(result.reducedFitViews).toBeUndefined();
    expect(result.enabledFitViews).toBe(GLIDE_FRAMES + 1);
  });

  it("says so when the zoom keys left nothing for the fit to do", async () => {
    const { failures } = await checkMotion(fakeVsCode({ zoomKeysIgnored: true }).session, OPTIONS);

    expect(failures).toEqual([
      "under reduced motion, Control+Equal and Control+Minus left the zoom as it was, so Shift+Digit1 had nothing to fit",
    ]);
  });

  it("ends at once when the canvas takes no focus", async () => {
    const vscode = fakeVsCode({ canvasRefusesFocus: true });

    expect((await checkMotion(vscode.session, OPTIONS)).failures).toEqual([
      "the canvas <svg> did not take the focus",
    ]);
    expect(vscode.written).toEqual([]);
  });
});

describe("workbenchMotionOf", () => {
  it("reads both spellings of VS Code's classes", () => {
    expect(workbenchMotionOf(["monaco-workbench", "reduce-motion"])).toBe("reduced");
    expect(workbenchMotionOf(["monaco-workbench", "enable-motion"])).toBe("enabled");
    expect(workbenchMotionOf(["monaco-workbench", "monaco-reduce-motion"])).toBe("reduced");
    expect(workbenchMotionOf(["monaco-workbench", "monaco-enable-motion"])).toBe("enabled");
    expect(workbenchMotionOf(["monaco-workbench"])).toBeUndefined();
  });
});

describe("writeWorkbenchSetting", () => {
  it("writes again when VS Code missed a write, until the workbench shows it", async () => {
    let writes = 0;
    const outcome = await writeWorkbenchSetting({
      write: async () => {
        writes += 1;
      },
      applied: async () => writes >= 2,
      timeoutMs: 200,
      retryAfterMs: 20,
      intervalMs: 5,
    });

    expect(outcome).toEqual({ applied: true, writes: 2 });
  });

  it("gives up after the timeout", async () => {
    const outcome = await writeWorkbenchSetting({
      write: async () => undefined,
      applied: async () => false,
      timeoutMs: 50,
      retryAfterMs: 20,
      intervalMs: 5,
    });

    expect(outcome.applied).toBe(false);
    expect(outcome.writes).toBeGreaterThanOrEqual(2);
  });
});
