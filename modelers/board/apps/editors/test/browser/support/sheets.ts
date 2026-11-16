/**
 * Seven renderer sheets on one page. Each of them was written to stand alone and imports
 * diagram-js's sheet and the canvas mapping itself; side by side every later copy of that base
 * would follow an earlier renderer's own rules and override them at equal weight. Context Maps
 * is the renderer that shows it: its rule for an open context pad has the weight of the base's.
 */
import { expect, it } from "vitest";
import { commands } from "vitest/browser";
import { SUITE_EDITORS } from "../../../src/registry.js";
import { LOAD_MS, mountAlone } from "./board.js";
import { exampleOf } from "./examples.js";
import { watchPageErrors } from "./page-errors.js";

const WAIT = { timeout: 8_000, interval: 25 };

/** The renderer sheets on the page in the order they were loaded, each by its modeler's folder. */
function rendererSheets(): string[] {
  return [...document.querySelectorAll<HTMLStyleElement>("style[data-vite-dev-id]")].flatMap(
    (style) => {
      const match = /\/modelers\/([^/]+)\/packages\/renderer\/src\/assets\/[^/]+\.css$/.exec(
        style.dataset.viteDevId ?? "",
      );
      return match?.[1] && match[1] !== "board" ? [match[1]] : [];
    },
  );
}

/** How many rules of the page have exactly this selector, at any depth of layers and queries. */
function rulesWith(selector: string): number {
  const count = (rules: CSSRuleList): number =>
    [...rules].reduce(
      (sum, rule) =>
        sum +
        (rule instanceof CSSStyleRule && rule.selectorText === selector ? 1 : 0) +
        ("cssRules" in rule ? count((rule as CSSGroupingRule).cssRules) : 0),
      0,
    );
  return [...document.styleSheets].reduce((sum, sheet) => sum + count(sheet.cssRules), 0);
}

async function load(notation: string): Promise<void> {
  const entry = SUITE_EDITORS.find((one) => one.notation === notation);
  if (!entry) throw new Error(`no editor for the notation '${notation}'`);
  await entry.load();
}

/**
 * Registers the one case of a sheet test file. A page keeps every sheet it ever loaded, so each
 * order of loading needs a page of its own, and a test file is one.
 */
export function contextMapsPadCase(order: "first" | "last"): void {
  it(
    `Context Maps' open context pad is a flex row, with Context Maps loaded ${order}`,
    async () => {
      const errors = watchPageErrors();
      const others = SUITE_EDITORS.map((entry) => entry.notation).filter(
        (notation) => notation !== "context-maps",
      );
      // One after the other: a page loads a notation's sheet when its first model opens.
      for (const notation of order === "first"
        ? ["context-maps", ...others]
        : [...others, "context-maps"]) {
        await load(notation);
      }
      const sheets = rendererSheets();
      expect(sheets).toHaveLength(7);
      expect(order === "first" ? sheets[0] : sheets.at(-1)).toBe("context-maps");
      // The base is on the page once, however many renderer sheets import it.
      expect(rulesWith(".djs-context-pad.open")).toBe(1);
      expect(rulesWith(".cd-c-fill-grund")).toBe(1);

      const alone = await mountAlone("context-maps", exampleOf("context-maps").text, {
        width: 800,
        height: 508,
      });
      const hit = alone.element
        .querySelector(".djs-element.djs-shape .djs-hit")
        ?.getBoundingClientRect();
      if (!hit) throw new Error("the example shows no context");
      await commands.realInput([
        { type: "click", x: hit.left + hit.width / 2, y: hit.top + hit.height / 2 },
      ]);
      await expect
        .poll(() => alone.element.querySelectorAll(".djs-context-pad.open").length, WAIT)
        .toBe(1);
      const pad = alone.element.querySelector<HTMLElement>(".djs-context-pad.open");
      expect(pad && getComputedStyle(pad).display).toBe("flex");

      alone.destroy();
      await commands.realInput([{ type: "move", x: 1, y: 1 }]);
      const seen = errors.list();
      errors.stop();
      expect(seen).toEqual([]);
    },
    LOAD_MS,
  );
}
