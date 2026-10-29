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

import { conformanceCases } from "../src/conformance.js";
import type { Flaws } from "./reference-modeler.js";
import { CASE, harness, mounted, runCases } from "./support.js";

const appearanceCase = conformanceCases().find((c) => c.name === CASE.appearance);

function runAppearanceCase(flaws: Flaws = {}) {
  if (!appearanceCase) throw new Error(`the kit has no case "${CASE.appearance}"`);
  return appearanceCase.run(mounted(flaws));
}

afterEach(() => {
  document.documentElement.removeAttribute("data-cd-theme");
  document.documentElement.removeAttribute("data-cd-kontrast");
});

describe("the appearance case in a DOM", () => {
  test("the conforming reference, mounted, draws the request and not the page: nothing fails, skips or advises", async () => {
    await expect(runAppearanceCase()).resolves.toEqual({});
  });

  test("a modeler that lists dark and draws it fails nothing", async () => {
    await expect(runAppearanceCase({ listsDark: true })).resolves.toEqual({});
  });

  test("a modeler whose re-import draws one element more fails nothing, with dark listed or not", async () => {
    await expect(runAppearanceCase({ reimportDrawsOneMore: true })).resolves.toEqual({});
    await expect(
      runAppearanceCase({ listsDark: true, reimportDrawsOneMore: true }),
    ).resolves.toEqual({});
  });

  test("the page keeps the mode it had, also after a case that failed", async () => {
    document.documentElement.setAttribute("data-cd-theme", "light");
    await runAppearanceCase();
    expect(document.documentElement.getAttribute("data-cd-theme")).toBe("light");
    expect(document.documentElement.hasAttribute("data-cd-kontrast")).toBe(false);
    await expect(runAppearanceCase({ appearanceDoesNothing: true })).rejects.toThrow();
    expect(document.documentElement.getAttribute("data-cd-theme")).toBe("light");
    expect(document.documentElement.hasAttribute("data-cd-kontrast")).toBe(false);
  });

  test("a create() that mounts into no attachedHost() → a skip naming attachedHost()", async () => {
    const outcome = await appearanceCase?.run(harness());
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
    await expect(runAppearanceCase(flaws)).rejects.toThrow(message);
    const outcomes = await runCases(mounted(flaws), "sequential");
    expect(outcomes.filter((r) => r.failed).map((r) => r.name)).toEqual([CASE.appearance]);
  });
});
