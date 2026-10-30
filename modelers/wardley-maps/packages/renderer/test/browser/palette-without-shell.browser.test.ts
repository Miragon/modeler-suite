/// <reference types="@vitest/browser-playwright" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import PaletteModule from "diagram-js/lib/features/palette";
import type { ModuleDeclaration } from "didi";
import { Modeler } from "../../src/index.js";
import type WardleyDrawTool from "../../src/draw-tool/WardleyDrawTool.js";
import "../../src/assets/wardley.css";
import diagramJsCss from "diagram-js/assets/diagram-js.css?raw";

/**
 * The renderer's own palette, for a host that mounts the map without the modeler shell: the sizes
 * of guide §5.5, the armed tool's `aria-pressed` and ring, forced colours, the tooltip of guide
 * §5.6 (#425), and the focus ring (§5.14). The palette scrolls sideways and its entries sit 2px
 * apart, so a neighbour, which paints after the entry, would cover a ring that stands outside it
 * (#397). Its place before the canvas in the tab order, the tooltip's show and hide rules and its
 * distance to the container's sides, the second row of a narrow container and the glass (#447).
 */

const HOST = { width: 1024, height: 768 };
/** Narrower than the palette's content, so it scrolls sideways. */
const NARROW_HOST = { width: 360, height: 600 };
const root = document.documentElement;

interface Mounted {
  host: HTMLDivElement;
  modeler: Modeler;
}

const mounted: Mounted[] = [];
const hostSheets: HTMLStyleElement[] = [];
const hostControls: HTMLElement[] = [];

afterEach(async () => {
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  root.removeAttribute("data-cd-theme");
  root.removeAttribute("data-cd-kontrast");
  for (const sheet of hostSheets.splice(0)) sheet.remove();
  for (const control of hostControls.splice(0)) control.remove();
  for (const { host, modeler } of mounted.splice(0)) {
    // Off the palette first: a tooltip waiting to show would show on the destroyed diagram.
    await userEvent.hover(host, {
      position: { x: host.offsetWidth - 8, y: host.offsetHeight - 8 },
    });
    modeler.destroy();
    host.remove();
  }
});

interface MountOptions {
  /** The host's top left on the page. */
  at?: { left: number; top: number };
  additionalModules?: ModuleDeclaration[];
}

async function mount(
  size = HOST,
  ModelerType = Modeler,
  { at = { left: 0, top: 0 }, additionalModules = [] }: MountOptions = {},
): Promise<Mounted> {
  await page.viewport(HOST.width, HOST.height);
  const host = document.createElement("div");
  host.style.cssText = `position: fixed; left: ${at.left}px; top: ${at.top}px; width: ${size.width}px; height: ${size.height}px;`;
  document.body.append(host);
  const modeler = new ModelerType({
    container: host,
    width: size.width,
    height: size.height,
    additionalModules,
  });
  await modeler.importDSL("title Ring");
  const result = { host, modeler };
  mounted.push(result);
  return result;
}

function paletteOf(host: HTMLElement): HTMLElement {
  const found = host.querySelector<HTMLElement>(".djs-palette.wardley-palette");
  if (!found) throw new Error("no palette");
  return found;
}

function entry(host: HTMLElement, action: string): HTMLElement {
  const found = host.querySelector<HTMLElement>(
    `.djs-palette.wardley-palette .entry[data-action="${action}"]`,
  );
  if (!found) throw new Error(`no palette entry ${action}`);
  return found;
}

function boxIn(element: Element, origin: Element): DOMRect {
  const box = element.getBoundingClientRect();
  const originBox = origin.getBoundingClientRect();
  return new DOMRect(box.left - originBox.left, box.top - originBox.top, box.width, box.height);
}

/**
 * What `property: value` computes to inside `scope`, where the roles are the map's. The probe keeps
 * its own colours under forced colours, so a system colour resolves as itself.
 */
function resolved(scope: HTMLElement, property: string, value: string): string {
  const probe = document.createElement("div");
  probe.style.forcedColorAdjust = "none";
  probe.style.setProperty(property, value);
  scope.append(probe);
  const computed = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return computed;
}

/** `rgb(r, g, b)` as its three channels. */
function rgbOf(color: string): number[] {
  return (color.match(/\d+/g) ?? []).slice(0, 3).map(Number);
}

function role(scope: HTMLElement, name: string): number[] {
  return rgbOf(resolved(scope, "color", `var(${name})`));
}

/** The colour on screen at a point of `element`, in px from its top left. */
async function pixelOf(element: HTMLElement, x: number, y: number): Promise<number[]> {
  const base64 = await page.screenshot({ element, save: false });
  const bitmap = await createImageBitmap(
    await (await fetch(`data:image/png;base64,${base64}`)).blob(),
  );
  const scale = bitmap.width / element.getBoundingClientRect().width;
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d")!;
  context.drawImage(bitmap, 0, 0);
  const data = context.getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data;
  return [data[0]!, data[1]!, data[2]!];
}

/** The fill and ring of the armed tool (guide §5.5). */
function armedLook(host: HTMLElement): string[] {
  return [
    resolved(host, "background-color", "var(--cd-ui-hover)"),
    `${resolved(host, "color", "var(--cd-ui-interaktion)")} 0px 0px 0px 2px inset`,
  ];
}

/** An entry at rest: transparent, no ring. */
const RESTING_LOOK = ["rgba(0, 0, 0, 0)", "none"];

function lookOf(target: HTMLElement): string[] {
  const style = getComputedStyle(target);
  return [style.backgroundColor, style.boxShadow];
}

/** The draw tool armed, once its entry is pressed and shows the armed tool's fill and ring. */
async function armDrawTool({ host, modeler }: Mounted): Promise<HTMLElement> {
  modeler.get<WardleyDrawTool>("wardleyDrawTool").activate();
  const draw = entry(host, "draw-tool");
  await vi.waitFor(() => {
    expect(draw.getAttribute("aria-pressed")).toBe("true");
    expect(lookOf(draw)).toEqual(armedLook(host));
  });
  return draw;
}

async function hover(host: HTMLElement, target: HTMLElement): Promise<void> {
  await userEvent.hover(target);
  const hoverFill = resolved(host, "background-color", "var(--cd-ui-hover)");
  await vi.waitFor(() => expect(getComputedStyle(target).backgroundColor).toBe(hoverFill));
}

function focusFromKeyboard(target: HTMLElement): void {
  target.focus({ focusVisible: true } as FocusOptions);
  expect(document.activeElement).toBe(target);
  expect(target.matches(":focus-visible")).toBe(true);
}

const NEIGHBOURS = {
  "a hovered": async ({ host }: Mounted) => hover(host, entry(host, "draw-tool")),
  "an armed": async (mapped: Mounted) => {
    await armDrawTool(mapped);
  },
};

/** How far a ring at the guide's usual `outline-offset: 2px` and 2px width reaches out (§8). */
const OUTSIDE_RING_REACH = 4;

describe("the palette's focus ring without the shell (#397, guide §5.14)", () => {
  it("sets the entries closer than an outside ring reaches, so that ring would lie in the neighbour", async () => {
    const { host } = await mount();
    const lasso = boxIn(entry(host, "lasso-tool"), host);
    const draw = boxIn(entry(host, "draw-tool"), host);
    expect(draw.left - lasso.right).toBeLessThan(OUTSIDE_RING_REACH);
  });

  it.each(Object.entries(NEIGHBOURS))(
    "lays the ring inside the entry, whole beside %s neighbour",
    async (_, prepare) => {
      const mapped = await mount();
      const { host } = mapped;
      await prepare(mapped);
      const lasso = entry(host, "lasso-tool");
      focusFromKeyboard(lasso);

      const box = boxIn(lasso, host);
      const neighbour = boxIn(entry(host, "draw-tool"), host);
      const middle = box.top + box.height / 2;
      expect(await pixelOf(host, box.right - 1, middle)).toEqual(role(host, "--cd-ui-fokus"));
      expect(await pixelOf(host, box.left + 1, middle)).toEqual(role(host, "--cd-ui-fokus"));
      expect(await pixelOf(host, neighbour.left + 3, middle)).toEqual(role(host, "--cd-ui-hover"));
    },
  );

  it("lays the ring 1px inside the armed tool's ring, which stays visible (guide §5.5)", async () => {
    const mapped = await mount();
    const { host } = mapped;
    const draw = await armDrawTool(mapped);
    focusFromKeyboard(draw);

    const box = boxIn(draw, host);
    const middle = box.top + box.height / 2;
    expect(await pixelOf(host, box.right - 1, middle)).toEqual(role(host, "--cd-ui-interaktion"));
    expect(await pixelOf(host, box.right - 4, middle)).toEqual(role(host, "--cd-ui-fokus"));
  });

  it.each(Object.entries(NEIGHBOURS))(
    "keeps a ring a host lays outside the entry above %s neighbour, which paints after it",
    async (_, prepare) => {
      const mapped = await mount();
      const { host } = mapped;
      host.classList.add("ring-outside");
      const hostSheet = document.createElement("style");
      hostSheet.textContent =
        ".ring-outside .djs-palette .entry:focus-visible { outline-offset: 2px; }";
      document.head.append(hostSheet);
      hostSheets.push(hostSheet);
      await prepare(mapped);
      const lasso = entry(host, "lasso-tool");
      focusFromKeyboard(lasso);
      expect(getComputedStyle(lasso).outlineOffset).toBe("2px");

      const box = boxIn(lasso, host);
      const ring = await pixelOf(host, box.right + 3, box.top + box.height / 2);
      expect(ring).toEqual(role(host, "--cd-ui-fokus"));
    },
  );

  it.each([
    ["in normal contrast", undefined, { plain: ["2px", "-2px"], armed: ["2px", "-5px"] }],
    ["in high contrast", "hoch", { plain: ["3px", "-3px"], armed: ["3px", "-6px"] }],
  ] as const)("draws the inside ring %s", async (_, kontrast, rings) => {
    root.setAttribute("data-cd-theme", "light");
    if (kontrast) root.setAttribute("data-cd-kontrast", kontrast);
    const mapped = await mount();
    const ringOf = (target: HTMLElement) => {
      focusFromKeyboard(target);
      const style = getComputedStyle(target);
      return [style.outlineWidth, style.outlineOffset];
    };
    expect(ringOf(entry(mapped.host, "lasso-tool"))).toEqual(rings.plain);
    expect(ringOf(await armDrawTool(mapped))).toEqual(rings.armed);
  });
});

describe("the palette's sizes without the shell (guide §5.5, #425)", () => {
  it("is an island 40px high at 12px from the top, centred, its entries 4px inside its edge, with shadow-1", async () => {
    const { host } = await mount();
    const palette = paletteOf(host);
    const box = boxIn(palette, host);

    expect([box.top, box.height]).toEqual([12, 40]);
    expect(Math.abs(box.left + box.width / 2 - HOST.width / 2)).toBeLessThanOrEqual(0.5);
    const entries = [...palette.querySelectorAll(".entry")].map((found) => boxIn(found, palette));
    expect(new Set(entries.map((found) => found.top))).toEqual(new Set([4]));
    expect(entries[0]!.left).toBe(4);
    expect(box.width - entries.at(-1)!.right).toBe(4);
    expect(getComputedStyle(palette).boxShadow).toBe(
      resolved(host, "box-shadow", "var(--cd-shadow-1)"),
    );
  });

  it("stays 40px high where it scrolls in a narrow container, without a visible bar (guide §5.15)", async () => {
    const { host } = await mount(NARROW_HOST);
    const palette = paletteOf(host);
    expect(palette.scrollWidth).toBeGreaterThan(palette.clientWidth);

    expect(boxIn(palette, host).height).toBe(40);
    expect(palette.clientHeight).toBe(38);
    expect(getComputedStyle(palette).scrollbarWidth).toBe("none");
    expect(getComputedStyle(palette, "::-webkit-scrollbar").display).toBe("none");
  });

  it("holds 32 × 32 entries 2px apart, with 8px, a 1px line inset 4px, and 8px between the groups", async () => {
    const { host } = await mount();
    const palette = paletteOf(host);
    const groups = [...palette.querySelectorAll<HTMLElement>(".group")];
    expect(groups.map((group) => group.dataset["group"])).toEqual([
      "tools",
      "wardley-1-blocks",
      "wardley-2-strategy",
      "wardley-3-notes",
    ]);
    const boxesOf = (group: HTMLElement) =>
      [...group.querySelectorAll(".entry")].map((found) => boxIn(found, palette));

    for (const group of groups) {
      const boxes = boxesOf(group);
      for (const box of boxes) expect([box.width, box.height]).toEqual([32, 32]);
      for (let index = 1; index < boxes.length; index++) {
        expect(boxes[index]!.left - boxes[index - 1]!.right).toBe(2);
      }
    }
    for (let index = 1; index < groups.length; index++) {
      const lastBefore = boxesOf(groups[index - 1]!).at(-1)!;
      const line = getComputedStyle(groups[index]!, "::before");
      expect([line.left, line.width, line.top, line.bottom]).toEqual(["0px", "1px", "4px", "4px"]);
      expect(line.backgroundColor).toBe(resolved(host, "background-color", "var(--cd-ui-linie)"));
      expect(boxIn(groups[index]!, palette).left - lastBefore.right).toBe(8);
      expect(boxesOf(groups[index]!)[0]!.left - lastBefore.right).toBe(17);
    }
  });
});

/** `aria-pressed` of every entry, by its action (null: none). */
function pressedStates(host: HTMLElement): Record<string, string | null> {
  return Object.fromEntries(
    [...paletteOf(host).querySelectorAll<HTMLElement>(".entry")].map((found) => [
      found.dataset["action"],
      found.getAttribute("aria-pressed"),
    ]),
  );
}

/** diagram-js clears and rebuilds every entry, as it does when a translation changes. */
function rebuildPalette({ modeler }: Mounted): void {
  modeler.get<EventBus>("eventBus").fire("i18n.changed");
}

describe("the armed tool without the shell (guide §5.5, §5.14, #425)", () => {
  it("presses the armed tool only, the lasso and the draw tool in turn", async () => {
    const mapped = await mount();
    const { host, modeler } = mapped;
    const states = pressedStates(host);
    expect(states).toMatchObject({ "lasso-tool": "false", "draw-tool": "false" });
    expect(
      Object.entries(states)
        .filter(([action]) => action.startsWith("create."))
        .map(([, state]) => state),
    ).toEqual(Array(12).fill(null));

    await userEvent.click(entry(host, "lasso-tool"));
    expect(pressedStates(host)).toMatchObject({ "lasso-tool": "true", "draw-tool": "false" });
    await vi.waitFor(() => expect(lookOf(entry(host, "lasso-tool"))).toEqual(armedLook(host)));

    await userEvent.click(entry(host, "draw-tool"));
    expect(pressedStates(host)).toMatchObject({ "lasso-tool": "false", "draw-tool": "true" });
    await vi.waitFor(() => expect(lookOf(entry(host, "lasso-tool"))).toEqual(RESTING_LOOK));

    modeler.get<WardleyDrawTool>("wardleyDrawTool").cancel();
    modeler.get<Dragging>("dragging").cancel(true);
    expect(pressedStates(host)).toMatchObject({ "lasso-tool": "false", "draw-tool": "false" });
    // The pointer still rests on the draw entry, which keeps the hover fill but loses the ring.
    await vi.waitFor(() =>
      expect(getComputedStyle(entry(host, "draw-tool")).boxShadow).toBe("none"),
    );
  });

  it("keeps the armed tool pressed, with its ring and its inner focus ring, after diagram-js rebuilt the entries", async () => {
    const mapped = await mount();
    const { host } = mapped;
    const before = await armDrawTool(mapped);

    rebuildPalette(mapped);

    const draw = entry(host, "draw-tool");
    expect(draw).not.toBe(before);
    expect(pressedStates(host)).toMatchObject({ "lasso-tool": "false", "draw-tool": "true" });
    await vi.waitFor(() => expect(lookOf(draw)).toEqual(armedLook(host)));
    focusFromKeyboard(draw);
    expect(getComputedStyle(draw).outlineOffset).toBe("-5px");
  });

  it("follows the tools that are armed and disarmed after diagram-js rebuilt the entries", async () => {
    const mapped = await mount();
    const { host, modeler } = mapped;
    await armDrawTool(mapped);
    rebuildPalette(mapped);

    modeler.get<WardleyDrawTool>("wardleyDrawTool").cancel();
    expect(pressedStates(host)).toMatchObject({ "lasso-tool": "false", "draw-tool": "false" });
    await vi.waitFor(() => expect(lookOf(entry(host, "draw-tool"))).toEqual(RESTING_LOOK));

    await userEvent.click(entry(host, "lasso-tool"));
    expect(pressedStates(host)).toMatchObject({ "lasso-tool": "true", "draw-tool": "false" });
    await vi.waitFor(() => expect(lookOf(entry(host, "lasso-tool"))).toEqual(armedLook(host)));
    modeler.get<Dragging>("dragging").cancel(true);
  });
});

/** Once the entry's 150ms transitions have run: a read before that sees where they started. */
async function afterTransitions(element: Element): Promise<void> {
  await Promise.all(element.getAnimations().map((animation) => animation.finished));
}

async function emulateForcedColours(): Promise<void> {
  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "forced-colors", value: "active" }],
  });
}

describe("the palette without the shell in forced colours (guide §5.14, #425)", () => {
  it("keeps the separators between the groups, in CanvasText", async () => {
    const { host } = await mount();
    await emulateForcedColours();

    for (const group of [...paletteOf(host).querySelectorAll(".group")].slice(1)) {
      const line = getComputedStyle(group, "::before");
      expect(line.forcedColorAdjust).toBe("none");
      expect(line.backgroundColor).toBe(resolved(host, "background-color", "CanvasText"));
    }
  });

  it("keeps the armed tool's 2px ring inside it, in Highlight on Canvas, also under the pointer", async () => {
    const mapped = await mount();
    const { host } = mapped;
    const draw = await armDrawTool(mapped);
    await emulateForcedColours();

    const expected = [
      "none",
      resolved(host, "background-color", "Canvas"),
      resolved(host, "color", "CanvasText"),
      resolved(host, "box-shadow", "inset 0 0 0 2px Highlight"),
    ];
    const forcedLook = () => {
      const style = getComputedStyle(draw);
      return [style.forcedColorAdjust, style.backgroundColor, style.color, style.boxShadow];
    };
    await afterTransitions(draw);
    expect(forcedLook()).toEqual(expected);
    await userEvent.hover(draw);
    await vi.waitFor(() => expect(draw.matches(":hover")).toBe(true));
    await afterTransitions(draw);
    expect(forcedLook()).toEqual(expected);
  });

  it("draws the focused entry's ring and the island's edge in system colours", async () => {
    const { host } = await mount();
    const palette = paletteOf(host);
    const lasso = entry(host, "lasso-tool");
    focusFromKeyboard(lasso);
    await emulateForcedColours();

    // Chromium forces outlines and borders to a system colour by itself; with that forcing off, they
    // show the stylesheet's own colours, which engines that keep author colours draw.
    palette.style.forcedColorAdjust = "none";
    expect(getComputedStyle(lasso).outlineColor).toBe(resolved(host, "outline-color", "Highlight"));
    expect(getComputedStyle(palette).borderTopColor).toBe(
      resolved(host, "border-top-color", "CanvasText"),
    );
  });
});

async function showTooltipOf(host: HTMLElement, target: HTMLElement): Promise<HTMLElement> {
  await userEvent.hover(target);
  return vi.waitFor(() => {
    const shown = host.querySelector<HTMLElement>(".djs-hover-tooltip");
    if (!shown) throw new Error("No tooltip yet.");
    return shown;
  });
}

describe("the palette tooltip without the shell (guide §5.6, #425)", () => {
  it("hangs 8px below the island, at 60px, centred on its entry, 28px high, the key 6px after the name", async () => {
    const { host } = await mount();
    const component = entry(host, "create.component");
    const tooltip = await showTooltipOf(host, component);

    const tooltipBox = boxIn(tooltip, host);
    const entryBox = boxIn(component, host);
    expect(tooltipBox.top).toBeCloseTo(boxIn(paletteOf(host), host).bottom + 8, 0);
    expect(tooltipBox.top).toBeCloseTo(60, 0);
    expect(tooltipBox.left + tooltipBox.width / 2).toBeCloseTo(
      entryBox.left + entryBox.width / 2,
      0,
    );
    expect(tooltipBox.height).toBeCloseTo(28, 0);
    const name = tooltip.querySelector(".djs-palette-tooltip-label")!;
    const key = tooltip.querySelector(".djs-palette-tooltip-shortcut")!;
    expect([name.textContent, key.textContent]).toEqual(["Component", "C"]);
    expect(key.getBoundingClientRect().left - name.getBoundingClientRect().right).toBeCloseTo(6, 0);
  });

  it("is the opaque surface of guide §5.6 with shadow-2, 13px type on a 20px line and the key chip", async () => {
    const { host } = await mount();
    const tooltip = await showTooltipOf(host, entry(host, "create.component"));
    const style = getComputedStyle(tooltip);

    expect(style.backgroundColor).toBe(
      resolved(host, "background-color", "var(--cd-ui-flaeche-hoch)"),
    );
    expect(style.color).toBe(resolved(host, "color", "var(--cd-ui-text)"));
    expect([style.borderTopStyle, style.borderTopWidth, style.borderTopColor]).toEqual([
      "solid",
      "1px",
      resolved(host, "border-top-color", "var(--cd-ui-linie)"),
    ]);
    expect(style.borderTopLeftRadius).toBe(
      resolved(host, "border-top-left-radius", "var(--cd-radius-sm)"),
    );
    expect(style.boxShadow).toBe(resolved(host, "box-shadow", "var(--cd-shadow-2)"));
    expect([style.padding, style.fontSize, style.fontWeight, style.lineHeight]).toEqual([
      "3px 8px",
      "13px",
      "400",
      "20px",
    ]);

    const chip = getComputedStyle(tooltip.querySelector(".djs-palette-tooltip-shortcut")!);
    expect(chip.fontFamily).toMatch(/^"Geist Mono Variable", "Geist Mono"/);
    expect([chip.fontSize, chip.fontWeight, chip.padding, chip.boxShadow]).toEqual([
      "13px",
      "400",
      "1px 6px",
      "none",
    ]);
    expect(chip.color).toBe(resolved(host, "color", "var(--cd-ui-text-leise)"));
    expect(chip.backgroundColor).toBe(resolved(host, "background-color", "var(--cd-ui-grund)"));
    expect([chip.borderTopWidth, chip.borderTopColor]).toEqual([
      "1px",
      resolved(host, "border-top-color", "var(--cd-ui-linie)"),
    ]);
    expect(chip.borderTopLeftRadius).toBe(
      resolved(host, "border-top-left-radius", "var(--cd-radius-sm)"),
    );
  });

  it("takes none of its text into a select-all, as no label of the chrome does (guide §5.14)", async () => {
    const { host } = await mount();
    const tooltip = await showTooltipOf(host, entry(host, "create.component"));
    const selection = document.getSelection()!;

    try {
      selection.selectAllChildren(document.body);
      expect(selection.toString()).not.toContain("Component");
      selection.selectAllChildren(tooltip);
      expect(selection.toString()).toBe("");
    } finally {
      selection.removeAllRanges();
    }
  });

  it("keeps its place when diagram-js's sheet loads again after the renderer's", async () => {
    const { host } = await mount();
    const laterSheet = document.createElement("style");
    laterSheet.textContent = diagramJsCss;
    document.head.append(laterSheet);
    hostSheets.push(laterSheet);
    const component = entry(host, "create.component");
    const tooltip = await showTooltipOf(host, component);

    const tooltipBox = boxIn(tooltip, host);
    const entryBox = boxIn(component, host);
    expect(tooltipBox.top).toBeCloseTo(60, 0);
    expect(tooltipBox.left + tooltipBox.width / 2).toBeCloseTo(
      entryBox.left + entryBox.width / 2,
      0,
    );
  });

  it("keeps its place in a modeler that lists diagram-js's palette module after the renderer's", async () => {
    class PaletteModuleLastModeler extends Modeler {
      protected override _getModules(): ModuleDeclaration[] {
        const modules = super._getModules().filter((module) => module !== PaletteModule);
        return [...modules, PaletteModule];
      }
    }
    const { host } = await mount(HOST, PaletteModuleLastModeler);
    const component = entry(host, "create.component");
    const tooltip = await showTooltipOf(host, component);

    const tooltipBox = boxIn(tooltip, host);
    const entryBox = boxIn(component, host);
    expect(tooltipBox.top).toBeCloseTo(60, 0);
    expect(tooltipBox.left + tooltipBox.width / 2).toBeCloseTo(
      entryBox.left + entryBox.width / 2,
      0,
    );
  });

  it("lets a host's own tooltip rule win over the renderer's sheet that loads after it", async () => {
    const { host } = await mount();
    host.classList.add("tooltip-host");
    const tooltip = await showTooltipOf(host, entry(host, "create.component"));
    expect(getComputedStyle(tooltip).padding).toBe("3px 8px");

    const hostSheet = document.createElement("style");
    hostSheet.textContent = ".tooltip-host .djs-hover-tooltip { padding: 1px 2px; }";
    document.head.prepend(hostSheet);
    hostSheets.push(hostSheet);
    expect(getComputedStyle(tooltip).padding).toBe("1px 2px");
  });

  it("leaves the tooltip of another diagram-js editor on the page as diagram-js draws it", async () => {
    await mount();
    const other = document.createElement("div");
    other.className = "bio-theme-parent djs-parent djs-container";
    other.innerHTML =
      '<div class="djs-hover-tooltip-container"><div class="djs-hover-tooltip djs-hover-tooltip--bottom">Task</div></div>';
    document.body.append(other);
    try {
      const style = getComputedStyle(other.querySelector(".djs-hover-tooltip")!);
      expect([style.padding, style.borderTopStyle, style.transform, style.position]).toEqual([
        "6px 10px",
        "none",
        "none",
        "fixed",
      ]);
    } finally {
      other.remove();
    }
  });
});

function canvasSvg({ modeler }: Mounted): SVGSVGElement {
  return modeler.get<Canvas>("canvas").getContainer().querySelector<SVGSVGElement>(":scope > svg")!;
}

/** A host's button in front of the map, from which Tab goes on into it. */
function buttonBefore(host: HTMLElement): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "Before the map";
  host.before(button);
  hostControls.push(button);
  return button;
}

/** A chrome that skins the palette (`data-chrome="palette"`) without being the modeler shell. */
function markPaletteAsSkinned(eventBus: EventBus): void {
  eventBus.on("palette.create", (event: { container: HTMLElement }) =>
    event.container.setAttribute("data-chrome", "palette"),
  );
}
markPaletteAsSkinned.$inject = ["eventBus"];
const ANOTHER_CHROME: ModuleDeclaration = { __init__: [markPaletteAsSkinned] };

function precedes(first: Node, second: Node): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe("the palette without the shell in the tab order (guide §5.5, §5.14, #447)", () => {
  it("comes before the canvas in the document and the tab order", async () => {
    const mapped = await mount();
    const { host } = mapped;
    expect(precedes(paletteOf(host), canvasSvg(mapped))).toBe(true);

    buttonBefore(host).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(entry(host, "lasso-tool"));
    await userEvent.tab();
    expect(document.activeElement).toBe(canvasSvg(mapped));
  });

  it("keeps a focused entry focused when diagram-js lays the palette out again", async () => {
    const mapped = await mount();
    const canvas = mapped.modeler.get<Canvas>("canvas");
    const lasso = entry(mapped.host, "lasso-tool");
    focusFromKeyboard(lasso);
    canvas.resized();
    expect(document.activeElement).toBe(lasso);

    rebuildPalette(mapped);
    const rebuilt = entry(mapped.host, "lasso-tool");
    focusFromKeyboard(rebuilt);
    canvas.resized();
    expect(document.activeElement).toBe(rebuilt);
    expect(precedes(paletteOf(mapped.host), canvasSvg(mapped))).toBe(true);
  });

  it("leaves a palette another chrome skins where diagram-js puts it", async () => {
    const mapped = await mount(HOST, Modeler, { additionalModules: [ANOTHER_CHROME] });
    expect(paletteOf(mapped.host).getAttribute("data-chrome")).toBe("palette");
    expect(precedes(canvasSvg(mapped), paletteOf(mapped.host))).toBe(true);
  });
});

function shownTooltip(host: HTMLElement): HTMLElement | null {
  return host.querySelector<HTMLElement>(".djs-hover-tooltip");
}

function shownName(host: HTMLElement): string | null | undefined {
  return shownTooltip(host)?.querySelector(".djs-palette-tooltip-label")?.textContent;
}

function pointerOver(
  target: HTMLElement,
  pointerType = "mouse",
  relatedTarget: Element | null = null,
): void {
  target.dispatchEvent(
    new PointerEvent("pointerover", { bubbles: true, pointerType, relatedTarget }),
  );
}

function pointerOut(target: HTMLElement, relatedTarget: Element): void {
  target.dispatchEvent(
    new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget }),
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** The guide's hover delay (§5.6). */
const SHOW_DELAY_MS = 300;

describe("the palette tooltip without the shell: when it shows and hides (guide §5.6, #447)", () => {
  it("shows at once on keyboard focus, follows the arrow keys and is a role=tooltip", async () => {
    const mapped = await mount();
    const { host } = mapped;
    buttonBefore(host).focus();
    await userEvent.tab();

    expect(shownName(host)).toBe("Lasso");
    expect(shownTooltip(host)!.getAttribute("role")).toBe("tooltip");
    await userEvent.keyboard("{ArrowRight}");
    expect(shownName(host)).toBe("Draw");
    expect(host.querySelectorAll(".djs-hover-tooltip")).toHaveLength(1);

    canvasSvg(mapped).focus();
    expect(shownTooltip(host)).toBeNull();
  });

  it("describes no entry whose name and aria-keyshortcuts say what it shows", async () => {
    const { host } = await mount();
    buttonBefore(host).focus();
    await userEvent.tab();

    expect(shownName(host)).toBe("Lasso");
    expect(entry(host, "lasso-tool").hasAttribute("aria-describedby")).toBe(false);
  });

  it("hides on Escape and on a click, and stays hidden while the pointer rests on the entry", async () => {
    const { host, modeler } = await mount();
    buttonBefore(host).focus();
    await userEvent.tab();
    expect(shownName(host)).toBe("Lasso");
    await userEvent.keyboard("{Escape}");
    expect(shownTooltip(host)).toBeNull();
    expect(document.activeElement).toBe(entry(host, "lasso-tool"));

    const draw = entry(host, "draw-tool");
    await showTooltipOf(host, draw);
    expect(shownName(host)).toBe("Draw");
    await userEvent.click(draw);
    expect(shownTooltip(host)).toBeNull();
    await wait(SHOW_DELAY_MS + 100);
    expect(shownTooltip(host)).toBeNull();
    modeler.get<WardleyDrawTool>("wardleyDrawTool").cancel();
  });

  // Enter and Space press the focused entry as a click does (guide §5.5), and a click hides the
  // tooltip (§5.6), as in Value Chain and the shell, whose toolbars dispatch that click.
  it.each([
    ["Enter", "lasso-tool", "{Enter}"],
    ["Space", "lasso-tool", " "],
    ["Enter", "draw-tool", "{Enter}"],
    ["Space", "draw-tool", " "],
  ] as const)(
    "hides on %s, which presses the focused %s entry, and the entry keeps the focus",
    async (_name, action, key) => {
      const { host, modeler } = await mount();
      const pressedEntry = entry(host, action);
      focusFromKeyboard(pressedEntry);
      expect(shownTooltip(host)).not.toBeNull();

      await userEvent.keyboard(key);

      expect(pressedEntry.getAttribute("aria-pressed")).toBe("true");
      expect(shownTooltip(host)).toBeNull();
      expect(document.activeElement).toBe(pressedEntry);
      modeler.get<WardleyDrawTool>("wardleyDrawTool").cancel();
      modeler.get<Dragging>("dragging").cancel(true);
    },
  );

  it.each([
    ["Enter", "{Enter}"],
    ["Space", " "],
  ] as const)(
    "hides on %s that creates an element at the free centre from a focused entry",
    async (_name, key) => {
      const { host } = await mount();
      const component = entry(host, "create.component");
      focusFromKeyboard(component);
      expect(shownName(host)).toBe("Component");
      const elementsBefore = host.querySelectorAll(".djs-shape").length;

      await userEvent.keyboard(key);

      expect(host.querySelectorAll(".djs-shape").length).toBe(elementsBefore + 1);
      expect(shownTooltip(host)).toBeNull();
    },
  );

  it.each([
    ["Enter", "{Enter}"],
    ["Space", " "],
  ] as const)(
    "hides on %s that saves the line the draw tool holds from its focused entry",
    async (_name, key) => {
      const mapped = await mount();
      const { host, modeler } = mapped;
      const drawTool = modeler.get<WardleyDrawTool>("wardleyDrawTool");
      const draw = await armDrawTool(mapped);
      const svg = canvasSvg(mapped);
      const svgBox = svg.getBoundingClientRect();
      for (const [x, y] of [
        [300, 300],
        [420, 360],
      ] as const) {
        svg.dispatchEvent(
          new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: svgBox.left + x,
            clientY: svgBox.top + y,
          }),
        );
      }
      expect(drawTool.holdsLine()).toBe(true);
      focusFromKeyboard(draw);
      expect(shownName(host)).toBe("Draw");

      await userEvent.keyboard(key);

      expect(drawTool.holdsLine()).toBe(false);
      expect(drawTool.isActive()).toBe(false);
      expect(shownTooltip(host)).toBeNull();
      expect(document.activeElement).toBe(draw);
    },
  );

  it("waits 300ms on hover, then shows a neighbour's at once", async () => {
    const { host } = await mount();
    const lasso = entry(host, "lasso-tool");
    const draw = entry(host, "draw-tool");

    const hoveredAt = performance.now();
    pointerOver(lasso);
    expect(shownTooltip(host)).toBeNull();
    const shownAt = await vi.waitFor(
      () => {
        expect(shownName(host)).toBe("Lasso");
        return performance.now();
      },
      { interval: 5 },
    );
    expect(shownAt - hoveredAt).toBeGreaterThanOrEqual(SHOW_DELAY_MS - 5);

    pointerOut(lasso, draw);
    pointerOver(draw, "mouse", lasso);
    expect(shownName(host)).toBe("Draw");
  });

  it("shows none for a tap", async () => {
    const { host } = await mount();
    const lasso = entry(host, "lasso-tool");
    // A tap's pointer events, then the mouse event the browser sends for compatibility after them.
    pointerOver(lasso, "touch");
    lasso.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await wait(SHOW_DELAY_MS + 100);

    expect(shownTooltip(host)).toBeNull();
  });
});

describe("the palette tooltip without the shell: its place (guide §5.6, #447)", () => {
  it("keeps 12px from the container's left side at the first entry and from its right side at the last", async () => {
    const { host } = await mount(NARROW_HOST);
    buttonBefore(host).focus();
    await userEvent.tab();
    expect(shownName(host)).toBe("Lasso");
    expect(boxIn(shownTooltip(host)!, host).left).toBeGreaterThanOrEqual(12 - 0.5);

    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(entry(host, "create.note"));
    expect(shownName(host)).toBe("Note");
    expect(boxIn(shownTooltip(host)!, host).right).toBeLessThanOrEqual(
      NARROW_HOST.width - 12 + 0.5,
    );
  });

  it("is at most 100% - 24px wide in a narrow container, where a long name wraps", async () => {
    const tiny = { width: 120, height: 400 };
    const { host } = await mount(tiny);
    focusFromKeyboard(entry(host, "create.townplanners"));

    expect(shownName(host)).toBe("Town Planners region");
    const box = boxIn(shownTooltip(host)!, host);
    expect(box.width).toBeLessThanOrEqual(tiny.width - 24 + 0.5);
    expect(box.left).toBeGreaterThanOrEqual(12 - 0.5);
    expect(box.right).toBeLessThanOrEqual(tiny.width - 12 + 0.5);
    expect(box.height).toBeGreaterThan(28);
  });

  it("keeps its place in a host away from the page's top left, also when diagram-js's sheet loads again", async () => {
    const { host } = await mount({ width: 800, height: 600 }, Modeler, {
      at: { left: 100, top: 50 },
    });
    const laterSheet = document.createElement("style");
    laterSheet.textContent = diagramJsCss;
    document.head.append(laterSheet);
    hostSheets.push(laterSheet);
    const component = entry(host, "create.component");
    focusFromKeyboard(component);

    const tooltipBox = boxIn(shownTooltip(host)!, host);
    const entryBox = boxIn(component, host);
    expect(tooltipBox.top).toBeCloseTo(60, 0);
    expect(tooltipBox.left + tooltipBox.width / 2).toBeCloseTo(
      entryBox.left + entryBox.width / 2,
      0,
    );
  });
});

describe("the palette without the shell in a container at most 760px wide (guide §5.15, #447)", () => {
  it("stays in the top row above 760px and moves to the second row at 760px", async () => {
    const { host } = await mount({ width: 761, height: 600 });
    expect(boxIn(paletteOf(host), host).top).toBe(12);

    host.style.width = "760px";
    const box = boxIn(paletteOf(host), host);
    expect(box.top).toBe(64);
    expect(Math.abs(box.left + box.width / 2 - 380)).toBeLessThanOrEqual(0.5);
    expect(box.height).toBe(40);
  });

  it("shows the tooltip 8px below the palette in the second row, at 112px, centred on its entry", async () => {
    const { host } = await mount({ width: 600, height: 600 });
    const component = entry(host, "create.component");
    focusFromKeyboard(component);

    const tooltipBox = boxIn(shownTooltip(host)!, host);
    const entryBox = boxIn(component, host);
    expect(tooltipBox.top).toBeCloseTo(112, 0);
    expect(tooltipBox.left + tooltipBox.width / 2).toBeCloseTo(
      entryBox.left + entryBox.width / 2,
      0,
    );
  });
});

/** The raised surface at `opacity`, in the colour space the glass mixes in. */
function surfaceAt(host: HTMLElement, opacity: string): string {
  return resolved(
    host,
    "background-color",
    `color-mix(in srgb, var(--cd-ui-flaeche-hoch) ${opacity}, transparent)`,
  );
}

describe("the palette's surface without the shell (guide §5.3, §5.5, §6, #447)", () => {
  it("is glass: the raised surface at --cd-ui-chrome-deckkraft behind an 8px blur", async () => {
    const { host } = await mount();
    const style = getComputedStyle(paletteOf(host));

    expect(style.backgroundColor).toBe(surfaceAt(host, "var(--cd-ui-chrome-deckkraft)"));
    expect(style.backgroundColor).not.toBe(surfaceAt(host, "100%"));
    expect(style.backdropFilter).toBe("blur(8px)");
  });

  it.each([
    ["on a high-contrast page", () => root],
    ["in a high-contrast container", (host: HTMLElement) => host],
  ])("is opaque %s", async (_, carrierOf: (host: HTMLElement) => HTMLElement) => {
    const { host } = await mount();
    const carrier = carrierOf(host);
    carrier.setAttribute("data-cd-theme", "light");
    carrier.setAttribute("data-cd-kontrast", "hoch");

    expect(getComputedStyle(paletteOf(host)).backgroundColor).toBe(surfaceAt(host, "100%"));
  });

  // The tokens make glass opaque in forced colours only under a `data-cd-theme`, which a host
  // without the shell need not set; the browser forces the surface's colour but keeps its alpha.
  it.each([
    ["on a page without a theme", () => undefined],
    ["on a light page", () => root],
  ])("is opaque, without the blur, in forced colours %s", async (_, carrierOf) => {
    const { host } = await mount();
    carrierOf()?.setAttribute("data-cd-theme", "light");
    await emulateForcedColours();
    const style = getComputedStyle(paletteOf(host));

    expect(rgbaOf(style.backgroundColor).alpha).toBe(1);
    expect(style.backdropFilter).toBe("none");
  });
});

function rgbaOf(color: string): { alpha: number } {
  const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
  return { alpha: channels.length > 3 ? channels[3]! : 1 };
}
