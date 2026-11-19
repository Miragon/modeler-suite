// @vitest-environment jsdom
/**
 * The appearance case compares the computed colours of what the modeler draws, so its DOM half runs
 * here, in jsdom, against the reference modeler mounted into attachedHost(): its colours resolve
 * from the page's `data-cd-theme` and `data-cd-kontrast` until `appearance.set` writes its own on
 * the root, as a renderer on the Miragon design tokens does. Each variant that leaves the page's
 * mode through fails exactly the appearance case, the page's own mode comes back after the case,
 * and a modeler mounted into no attachedHost() is reported as a skip.
 */
import { afterEach, describe, expect, test } from "vitest";

import type { Flaws } from "./reference-modeler.js";
import { CASE, harness, kitOutcome, mounted, runCase } from "./support.js";

afterEach(() => {
  document.documentElement.removeAttribute("data-cd-theme");
  document.documentElement.removeAttribute("data-cd-kontrast");
});

describe("the appearance case in a DOM", () => {
  test("the conforming reference, mounted, draws the request and not the page: nothing fails, skips or advises", async () => {
    await expect(runCase(CASE.appearance, mounted())).resolves.toEqual({});
  });

  test("a modeler that lists dark and draws it fails nothing", async () => {
    await expect(runCase(CASE.appearance, mounted({ listsDark: true }))).resolves.toEqual({});
  });

  test("a modeler whose re-import draws one element more fails nothing, with dark listed or not", async () => {
    await expect(
      runCase(CASE.appearance, mounted({ reimportDrawsOneMore: true })),
    ).resolves.toEqual({});
    await expect(
      runCase(CASE.appearance, mounted({ listsDark: true, reimportDrawsOneMore: true })),
    ).resolves.toEqual({});
  });

  test("the page keeps the mode it had, also after a case that failed", async () => {
    document.documentElement.setAttribute("data-cd-theme", "light");
    await runCase(CASE.appearance, mounted());
    expect(document.documentElement.getAttribute("data-cd-theme")).toBe("light");
    expect(document.documentElement.hasAttribute("data-cd-kontrast")).toBe(false);
    await expect(
      runCase(CASE.appearance, mounted({ appearanceDoesNothing: true })),
    ).rejects.toThrow();
    expect(document.documentElement.getAttribute("data-cd-theme")).toBe("light");
    expect(document.documentElement.hasAttribute("data-cd-kontrast")).toBe(false);
  });

  test("a create() that mounts into no attachedHost() → a skip naming attachedHost()", async () => {
    const outcome = await runCase(CASE.appearance, harness());
    expect(outcome?.skipped).toMatch(/^create\(\) mounted the modeler into no attachedHost\(\)/);
  });
});

describe("variants that leave the page's mode through fail exactly the appearance case", () => {
  test.each<[string, Flaws, RegExp]>([
    [
      "a set that does nothing and leaves the roles to the page",
      { appearanceDoesNothing: true },
      /after appearance\.set\(\{ theme: "dark", contrast: "normal" \}\) on a page in the other mode .* drew other colours than for appearance\.set\(\{ theme: "light", contrast: "normal" \}\)/,
    ],
    [
      "a light-only modeler that draws dark when dark is requested",
      { appearanceDrawsUnlistedTheme: true },
      /after appearance\.set\(\{ theme: "dark", contrast: "normal" \}\) on a page in the other mode/,
    ],
    [
      "a request for normal contrast that lets the page's high contrast through",
      { appearanceKeepsPageContrast: true },
      /has outline-color rgb\(255, 255, 255\), the reference/,
    ],
    [
      "an import that forgets the request",
      { appearanceForgottenOnImport: true },
      /and a re-import on a page in the other mode/,
    ],
    [
      "a modeler that lists dark and draws light for it",
      { listsDarkDrawsLight: true },
      /appearance\.themes lists "dark", but appearance\.set\(\{ theme: "dark" \}\) drew the colours of "light"/,
    ],
    [
      "a modeler that lists dark and draws light for it, its re-import drawing one element more",
      { listsDarkDrawsLight: true, reimportDrawsOneMore: true },
      /appearance\.themes lists "dark", but appearance\.set\(\{ theme: "dark" \}\) drew the colours of "light"/,
    ],
  ])("%s", async (_variant, flaws, message) => {
    await expect(runCase(CASE.appearance, mounted(flaws))).rejects.toThrow(message);
    const { failing } = await kitOutcome(mounted(flaws), "sequential");
    expect(failing).toEqual([CASE.appearance]);
  });
});
