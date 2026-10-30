import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { ModuleDeclaration } from "didi";
import { createEmptyDocument } from "@miragon/value-chain-schema-model";
import { Modeler, isVcShape, type VcShape } from "../../src/index.js";
import "../../src/assets/value-chain.css";

/**
 * The palette a host gets that mounts the renderer without the modeler shell (designIQ, any page):
 * the toolbar of guide §5.5 at the top centre, its keys and pressed tool, and the tooltip below it.
 * A palette a chrome skins (`data-chrome="palette"`) stays that chrome's alone.
 */

const CONTAINER = { width: 1024, height: 768 };
const FREE_AREA_CENTRE = { x: 400, y: 300 };
const TOOLS = ["lasso-tool", "hand-tool", "space-tool", "global-connect-tool"];
const CREATORS = ["create.step", "create.org-unit"];

interface Mounted {
  modeler: Modeler;
  wrapper: HTMLElement;
}

const mounted: Mounted[] = [];

afterEach(() => {
  for (const { modeler, wrapper } of mounted.splice(0)) {
    modeler.destroy();
    wrapper.remove();
  }
});

function mount(additionalModules: ModuleDeclaration[] = []): Modeler {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `position:absolute;left:0;top:0;width:${CONTAINER.width}px;height:${CONTAINER.height}px`;
  const before = document.createElement("button");
  before.textContent = "Before the modeler";
  const host = document.createElement("div");
  wrapper.append(before, host);
  document.body.append(wrapper);
  const modeler = new Modeler({
    container: host,
    freeArea: { center: () => FREE_AREA_CENTRE },
    additionalModules,
  });
  modeler.importDocument(createEmptyDocument("Palette"));
  mounted.push({ modeler, wrapper });
  return modeler;
}

function paletteOf(modeler: Modeler): HTMLElement {
  return modeler.container.querySelector<HTMLElement>(".djs-palette")!;
}

function entryOf(modeler: Modeler, action: string): HTMLElement {
  const found = paletteOf(modeler).querySelector<HTMLElement>(`[data-action="${action}"]`);
  if (!found) throw new Error(`no palette entry ${action}`);
  return found;
}

function entries(modeler: Modeler): HTMLElement[] {
  return [...paletteOf(modeler).querySelectorAll<HTMLElement>(".djs-palette-entries .entry")];
}

function canvasSvg(modeler: Modeler): SVGSVGElement {
  return modeler.get<Canvas>("canvas").getContainer().querySelector<SVGSVGElement>(":scope > svg")!;
}

function boxIn(element: Element, origin: Element): DOMRect {
  const box = element.getBoundingClientRect();
  const originBox = origin.getBoundingClientRect();
  return new DOMRect(box.left - originBox.left, box.top - originBox.top, box.width, box.height);
}

/** What `property: value` computes to inside `container`, where the roles are the container's. */
function resolved(container: HTMLElement, property: string, value: string): string {
  const probe = document.createElement("div");
  probe.style.setProperty(property, value);
  container.append(probe);
  const computed = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return computed;
}

/** The raised surface without glass, in the colour space the glass mix computes in. */
function opaqueSurface(container: HTMLElement): string {
  return resolved(
    container,
    "background-color",
    "color-mix(in srgb, var(--cd-ui-flaeche-hoch) 100%, transparent)",
  );
}

/** `rgb(r, g, b)` as its three channels. */
function rgbOf(color: string): number[] {
  return (color.match(/\d+/g) ?? []).slice(0, 3).map(Number);
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

function shapes(modeler: Modeler): VcShape[] {
  return modeler.get<ElementRegistry>("elementRegistry").filter(isVcShape) as VcShape[];
}

function pressed(modeler: Modeler): Record<string, string | null> {
  return Object.fromEntries(
    entries(modeler).map((entry) => [
      entry.getAttribute("data-action"),
      entry.getAttribute("aria-pressed"),
    ]),
  );
}

describe("the palette without the shell: layout (guide §5.5)", () => {
  let modeler: Modeler;

  beforeEach(() => {
    modeler = mount();
  });

  it("is the horizontal island 40px high at the top centre of the container", () => {
    const palette = paletteOf(modeler);
    const box = boxIn(palette, modeler.container);

    expect(box.top).toBe(12);
    expect(box.height).toBe(40);
    expect(Math.abs(box.left + box.width / 2 - CONTAINER.width / 2)).toBeLessThanOrEqual(0.5);
    const rows = new Set(entries(modeler).map((entry) => boxIn(entry, palette).top));
    expect([...rows]).toEqual([4]);
  });

  it("holds 32 × 32 entries 2px apart, with an 8px, 1px, 8px separator between the groups", () => {
    const palette = paletteOf(modeler);
    const [tools, creators] = [...palette.querySelectorAll<HTMLElement>(".group")];
    const toolBoxes = [...tools!.querySelectorAll(".entry")].map((entry) => boxIn(entry, palette));
    const creatorBoxes = [...creators!.querySelectorAll(".entry")].map((entry) =>
      boxIn(entry, palette),
    );

    for (const box of [...toolBoxes, ...creatorBoxes]) {
      expect([box.width, box.height]).toEqual([32, 32]);
    }
    expect(toolBoxes[0]!.left).toBe(4);
    for (const boxes of [toolBoxes, creatorBoxes]) {
      for (let index = 1; index < boxes.length; index++) {
        expect(boxes[index]!.left - boxes[index - 1]!.right).toBe(2);
      }
    }
    expect(creatorBoxes[0]!.left - toolBoxes.at(-1)!.right).toBe(17);
    const line = getComputedStyle(creators!, "::before");
    expect([line.left, line.width, line.top, line.bottom]).toEqual(["0px", "1px", "4px", "4px"]);
    expect(boxIn(creators!, palette).left - toolBoxes.at(-1)!.right).toBe(8);
    expect(line.backgroundColor).toBe(
      resolved(modeler.container, "background-color", "var(--cd-ui-linie)"),
    );
    const lastBox = creatorBoxes.at(-1)!;
    expect(boxIn(palette, palette).width - lastBox.right).toBe(4);
  });

  it("is glass with a 1px --cd-ui-linie edge, radius md and shadow-1; entries radius sm, transparent", () => {
    const palette = getComputedStyle(paletteOf(modeler));
    const container = modeler.container;

    expect(palette.backgroundColor).toBe(
      resolved(
        container,
        "background-color",
        "color-mix(in srgb, var(--cd-ui-flaeche-hoch) var(--cd-ui-chrome-deckkraft), transparent)",
      ),
    );
    expect(palette.backgroundColor).not.toBe(opaqueSurface(container));
    expect(palette.backdropFilter).toBe("blur(8px)");
    expect(palette.borderTopWidth).toBe("1px");
    expect(palette.borderTopColor).toBe(
      resolved(container, "border-top-color", "var(--cd-ui-linie)"),
    );
    expect(palette.borderTopLeftRadius).toBe(
      resolved(container, "border-top-left-radius", "var(--cd-radius-md)"),
    );
    expect(palette.boxShadow).toBe(resolved(container, "box-shadow", "var(--cd-shadow-1)"));

    const entry = getComputedStyle(entryOf(modeler, "lasso-tool"));
    expect(entry.borderTopLeftRadius).toBe(
      resolved(container, "border-top-left-radius", "var(--cd-radius-sm)"),
    );
    expect(entry.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(entry.color).toBe(resolved(container, "color", "var(--cd-ui-text)"));
  });

  it("lies above the context pad and the label editor (guide §5.13)", () => {
    expect(Number(getComputedStyle(paletteOf(modeler)).zIndex)).toBeGreaterThan(100);
  });

  it("collapses into no two-column layout in a short container", () => {
    const wrapper = modeler.container.parentElement!;
    wrapper.style.height = "200px";
    modeler.get<Canvas>("canvas").resized();
    expect(paletteOf(modeler).classList.contains("two-column")).toBe(true);

    const box = boxIn(paletteOf(modeler), modeler.container);
    expect(box.height).toBe(40);
    expect(new Set(entries(modeler).map((entry) => boxIn(entry, modeler.container).top)).size).toBe(
      1,
    );
  });

  it("gives a hovered entry the hover fill and its icon the interaction colour", async () => {
    const entry = entryOf(modeler, "hand-tool");
    await userEvent.hover(entry);

    await vi.waitFor(() => {
      expect(getComputedStyle(entry).backgroundColor).toBe(
        resolved(modeler.container, "background-color", "var(--cd-ui-hover)"),
      );
      expect(getComputedStyle(entry).color).toBe(
        resolved(modeler.container, "color", "var(--cd-ui-interaktion)"),
      );
    });
  });

  it("leaves another diagram-js palette on the same page as diagram-js lays it out", () => {
    const other = document.createElement("div");
    other.style.cssText = "position:relative;width:600px;height:400px";
    other.innerHTML =
      '<div class="djs-palette open"><div class="djs-palette-entries"><div class="group">' +
      '<div class="entry"></div></div></div></div>';
    document.body.append(other);
    try {
      const palette = getComputedStyle(other.querySelector(".djs-palette")!);
      expect([palette.top, palette.left, palette.transform, palette.zIndex]).toEqual([
        "20px",
        "20px",
        "none",
        "auto",
      ]);
      expect(getComputedStyle(other.querySelector(".entry")!).width).not.toBe("32px");
    } finally {
      other.remove();
    }
  });
});

describe("the palette without the shell: a container at most 760px wide (guide §5.15)", () => {
  let modeler: Modeler;

  beforeEach(() => {
    modeler = mount();
  });

  function resize(width: number): void {
    modeler.container.parentElement!.style.width = `${width}px`;
    modeler.get<Canvas>("canvas").resized();
  }

  it("stays in the top row above 760px and moves to the second row at 760px", () => {
    resize(761);
    expect(boxIn(paletteOf(modeler), modeler.container).top).toBe(12);

    resize(760);
    const box = boxIn(paletteOf(modeler), modeler.container);
    expect(box.top).toBe(64);
    expect(Math.abs(box.left + box.width / 2 - 380)).toBeLessThanOrEqual(0.5);
    expect(getComputedStyle(paletteOf(modeler)).overflowX).toBe("auto");
  });

  it("keeps 12px from both sides and scrolls sideways without a bar in a container narrower than it", async () => {
    resize(200);
    const palette = paletteOf(modeler);
    const box = boxIn(palette, modeler.container);

    expect(box.left).toBeCloseTo(12, 0);
    expect(box.right).toBeCloseTo(188, 0);
    expect(palette.scrollWidth).toBeGreaterThan(palette.clientWidth);
    expect(getComputedStyle(palette).scrollbarWidth).toBe("none");
    expect(box.height).toBe(40);

    entryOf(modeler, "lasso-tool").focus();
    await userEvent.keyboard("{End}");
    const last = boxIn(entryOf(modeler, "create.org-unit"), palette);
    expect(last.right).toBeLessThanOrEqual(palette.clientWidth);
  });

  it("puts the focus ring inside the entry, 1px inside the armed tool's ring", async () => {
    resize(600);
    entryOf(modeler, "lasso-tool").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(getComputedStyle(entryOf(modeler, "hand-tool")).outlineOffset).toBe("-2px");

    await userEvent.keyboard("{Enter}");
    expect(entryOf(modeler, "hand-tool").getAttribute("aria-pressed")).toBe("true");
    expect(getComputedStyle(entryOf(modeler, "hand-tool")).outlineOffset).toBe("-5px");

    modeler.container.setAttribute("data-cd-theme", "light");
    modeler.container.setAttribute("data-cd-kontrast", "hoch");
    const pressedStyle = getComputedStyle(entryOf(modeler, "hand-tool"));
    expect([pressedStyle.outlineWidth, pressedStyle.outlineOffset]).toEqual(["3px", "-6px"]);
    await userEvent.keyboard("{ArrowLeft}");
    const style = getComputedStyle(entryOf(modeler, "lasso-tool"));
    expect([style.outlineWidth, style.outlineOffset]).toEqual(["3px", "-3px"]);
  });

  it("shows the tooltip 8px below the palette in the second row, at 112px", async () => {
    resize(600);
    modeler.container.parentElement!.querySelector("button")!.focus();
    await userEvent.tab();

    const tooltip = modeler.container.querySelector<HTMLElement>(".djs-hover-tooltip");
    expect(tooltip).not.toBeNull();
    expect(boxIn(tooltip!, modeler.container).top).toBeCloseTo(112, 0);
  });
});

describe("the palette without the shell: toolbar (guide §5.5, §5.14)", () => {
  let modeler: Modeler;

  beforeEach(() => {
    modeler = mount();
  });

  it("is a toolbar named Tools, ahead of the canvas in the document and the tab order", async () => {
    const toolbar = paletteOf(modeler).querySelector(".djs-palette-entries")!;
    expect(toolbar.getAttribute("role")).toBe("toolbar");
    expect(toolbar.getAttribute("aria-label")).toBe("Tools");
    expect(
      paletteOf(modeler).compareDocumentPosition(canvasSvg(modeler)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(entries(modeler).map((entry) => entry.getAttribute("role"))).toEqual(
      Array(6).fill("button"),
    );

    modeler.container.parentElement!.querySelector("button")!.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(entryOf(modeler, "lasso-tool"));
    await userEvent.tab();
    expect(document.activeElement).toBe(canvasSvg(modeler));
  });

  it("has one tab stop that roves with ← → Home End and stays where the focus left it", async () => {
    const tabStops = () =>
      entries(modeler)
        .filter((entry) => entry.tabIndex === 0)
        .map((entry) => entry.getAttribute("data-action"));
    expect(tabStops()).toEqual(["lasso-tool"]);
    expect(entries(modeler).filter((entry) => entry.tabIndex === -1)).toHaveLength(5);

    entryOf(modeler, "lasso-tool").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(entryOf(modeler, "hand-tool"));
    expect(tabStops()).toEqual(["hand-tool"]);

    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(entryOf(modeler, "create.org-unit"));
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(entryOf(modeler, "lasso-tool"));
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(entryOf(modeler, "create.org-unit"));
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(entryOf(modeler, "lasso-tool"));
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(tabStops()).toEqual(["space-tool"]);

    canvasSvg(modeler).focus();
    expect(tabStops()).toEqual(["space-tool"]);
  });

  it("names the tools' keys for assistive technology and the creating entries none", () => {
    expect(
      TOOLS.map((action) => entryOf(modeler, action).getAttribute("aria-keyshortcuts")),
    ).toEqual(["L", "H", "S", "C"]);
    for (const action of CREATORS) {
      expect(entryOf(modeler, action).hasAttribute("aria-keyshortcuts")).toBe(false);
    }
  });

  it("presses the armed tool only, also when a key on the canvas arms it", async () => {
    expect(pressed(modeler)).toEqual({
      "lasso-tool": "false",
      "hand-tool": "false",
      "space-tool": "false",
      "global-connect-tool": "false",
      "create.step": null,
      "create.org-unit": null,
    });

    entryOf(modeler, "lasso-tool").focus();
    await userEvent.keyboard(" ");
    expect(pressed(modeler)["lasso-tool"]).toBe("true");
    expect(document.activeElement).toBe(entryOf(modeler, "lasso-tool"));

    canvasSvg(modeler).focus();
    await userEvent.keyboard("h");
    expect(pressed(modeler)).toMatchObject({ "lasso-tool": "false", "hand-tool": "true" });

    await userEvent.keyboard("{Escape}");
    expect(Object.values(pressed(modeler)).filter((value) => value === "true")).toEqual([]);
  });

  it("marks the armed tool with the hover fill and a 2px ring in the interaction colour", async () => {
    entryOf(modeler, "space-tool").focus();
    await userEvent.keyboard("{Enter}");
    const entry = entryOf(modeler, "space-tool");
    expect(entry.getAttribute("aria-pressed")).toBe("true");

    canvasSvg(modeler).focus();
    await vi.waitFor(() => {
      const style = getComputedStyle(entry);
      expect(style.backgroundColor).toBe(
        resolved(modeler.container, "background-color", "var(--cd-ui-hover)"),
      );
      expect(style.boxShadow).toBe(
        resolved(modeler.container, "box-shadow", "inset 0 0 0 2px var(--cd-ui-interaktion)"),
      );
      expect(style.color).toBe(resolved(modeler.container, "color", "var(--cd-ui-text)"));
    });
  });

  it("creates a step in the free area on Enter, selected, in edit and with the canvas focused", async () => {
    entryOf(modeler, "create.step").focus();
    await userEvent.keyboard("{Enter}");

    const [created] = shapes(modeler);
    expect(created?.vcType).toBe("step");
    expect([created!.x + created!.width / 2, created!.y + created!.height / 2]).toEqual([
      FREE_AREA_CENTRE.x,
      FREE_AREA_CENTRE.y,
    ]);
    expect(modeler.get<Selection>("selection").get()).toEqual([created]);
    expect(modeler.container.querySelector(".djs-direct-editing-parent")).not.toBeNull();
    expect(shapes(modeler)).toHaveLength(1);
  });

  it("leaves Enter with a modifier and a held key's repeats alone", () => {
    const step = entryOf(modeler, "create.step");
    step.focus();
    for (const init of [{ shiftKey: true }, { ctrlKey: true }, { repeat: true }]) {
      step.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init }),
      );
    }
    expect(shapes(modeler)).toEqual([]);
  });

  it("hands the focus to the canvas after a press on the island's padding", async () => {
    entryOf(modeler, "lasso-tool").focus();
    await userEvent.click(paletteOf(modeler), { position: { x: 2, y: 20 } });

    expect(document.activeElement).toBe(canvasSvg(modeler));
  });

  it("shows the keyboard focus as a 2px --cd-ui-fokus ring 2px outside the entry", async () => {
    modeler.container.parentElement!.querySelector("button")!.focus();
    await userEvent.tab();
    const style = getComputedStyle(entryOf(modeler, "lasso-tool"));

    expect(entryOf(modeler, "lasso-tool").matches(":focus-visible")).toBe(true);
    expect([style.outlineStyle, style.outlineWidth, style.outlineOffset]).toEqual([
      "solid",
      "2px",
      "2px",
    ]);
    expect(style.outlineColor).toBe(resolved(modeler.container, "color", "var(--cd-ui-fokus)"));
  });

  it("keeps the focus ring visible beside a pressed neighbour, which paints after it", async () => {
    entryOf(modeler, "hand-tool").focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{ArrowLeft}");
    const lasso = entryOf(modeler, "lasso-tool");
    const hand = entryOf(modeler, "hand-tool");
    expect(document.activeElement).toBe(lasso);
    expect(lasso.matches(":focus-visible")).toBe(true);
    expect(hand.getAttribute("aria-pressed")).toBe("true");
    const hoverFill = resolved(modeler.container, "background-color", "var(--cd-ui-hover)");
    await vi.waitFor(() => expect(getComputedStyle(hand).backgroundColor).toBe(hoverFill));

    const palette = paletteOf(modeler);
    const lassoBox = boxIn(lasso, palette);
    const ring = await pixelOf(palette, lassoBox.right + 3, lassoBox.top + lassoBox.height / 2);
    expect(ring).toEqual(rgbOf(resolved(modeler.container, "color", "var(--cd-ui-fokus)")));
  });

  it("drops the shadow, takes the --cd-ui-kontur edge and a 3px focus in high contrast", async () => {
    modeler.container.setAttribute("data-cd-theme", "light");
    modeler.container.setAttribute("data-cd-kontrast", "hoch");
    modeler.container.parentElement!.querySelector("button")!.focus();
    await userEvent.tab();

    const palette = getComputedStyle(paletteOf(modeler));
    expect(palette.boxShadow).toBe("none");
    expect(palette.borderTopColor).toBe(
      resolved(modeler.container, "border-top-color", "var(--cd-ui-kontur)"),
    );
    expect(palette.backgroundColor).toBe(opaqueSurface(modeler.container));
    expect(getComputedStyle(entryOf(modeler, "lasso-tool")).outlineWidth).toBe("3px");
  });
});

describe("the palette without the shell: tooltip (guide §5.6)", () => {
  let modeler: Modeler;

  beforeEach(() => {
    modeler = mount();
  });

  async function hover(action: string): Promise<{ entry: HTMLElement; tooltip: HTMLElement }> {
    const entry = entryOf(modeler, action);
    await userEvent.hover(entry);
    const tooltip = await vi.waitFor(() => {
      const shown = modeler.container.querySelector<HTMLElement>(".djs-hover-tooltip");
      if (!shown) throw new Error("No tooltip yet.");
      return shown;
    });
    return { entry, tooltip };
  }

  it("stands 8px below the palette, centred on its entry, with the name and the key chip", async () => {
    const { entry, tooltip } = await hover("hand-tool");
    const paletteBox = boxIn(paletteOf(modeler), modeler.container);
    const entryBox = boxIn(entry, modeler.container);
    const tooltipBox = boxIn(tooltip, modeler.container);

    expect(tooltipBox.top).toBeCloseTo(paletteBox.bottom + 8, 0);
    expect(tooltipBox.left + tooltipBox.width / 2).toBeCloseTo(
      entryBox.left + entryBox.width / 2,
      0,
    );
    expect(tooltip.querySelector(".djs-palette-tooltip-label")?.textContent).toBe("Hand");
    expect(tooltip.querySelector("kbd")?.textContent).toBe("H");
    expect(tooltipBox.height).toBe(28);
  });

  it("is the opaque surface of guide §5.6, with the chip in Geist Mono", async () => {
    const { tooltip } = await hover("lasso-tool");
    const style = getComputedStyle(tooltip);
    const container = modeler.container;

    expect(style.backgroundColor).toBe(
      resolved(container, "background-color", "var(--cd-ui-flaeche-hoch)"),
    );
    expect(style.borderTopColor).toBe(
      resolved(container, "border-top-color", "var(--cd-ui-linie)"),
    );
    expect(style.boxShadow).toBe(resolved(container, "box-shadow", "var(--cd-shadow-2)"));
    expect([style.fontSize, style.fontWeight, style.lineHeight, style.padding]).toEqual([
      "13px",
      "400",
      "20px",
      "3px 8px",
    ]);
    const chip = getComputedStyle(tooltip.querySelector("kbd")!);
    expect(chip.fontFamily).toMatch(/^"Geist Mono Variable"/);
    expect(chip.color).toBe(resolved(container, "color", "var(--cd-ui-text-leise)"));
  });

  it("keeps 12px from the container's side in a container narrower than the palette's place", async () => {
    const wrapper = modeler.container.parentElement!;
    wrapper.style.width = "260px";
    modeler.get<Canvas>("canvas").resized();

    const { tooltip } = await hover("lasso-tool");
    expect(boxIn(tooltip, modeler.container).left).toBeGreaterThanOrEqual(12 - 0.5);
  });

  it("throws nothing later when the modeler is destroyed while its tooltip waits to show", async () => {
    const errors: unknown[] = [];
    const collect = (event: ErrorEvent) => errors.push(event.error);
    window.addEventListener("error", collect);
    try {
      await userEvent.hover(entryOf(modeler, "hand-tool"));
      const { wrapper } = mounted.pop()!;
      modeler.destroy();
      wrapper.remove();
      await new Promise((resolve) => setTimeout(resolve, 400));
    } finally {
      window.removeEventListener("error", collect);
    }
    expect(errors).toEqual([]);
  });

  function shownTooltip(): HTMLElement | null {
    return modeler.container.querySelector<HTMLElement>(".djs-hover-tooltip");
  }

  function shownName(): string | null | undefined {
    return shownTooltip()?.querySelector(".djs-palette-tooltip-label")?.textContent;
  }

  it("shows at once on keyboard focus, follows the arrow keys and is a role=tooltip", async () => {
    modeler.container.parentElement!.querySelector("button")!.focus();
    await userEvent.tab();

    expect(shownName()).toBe("Lasso");
    expect(shownTooltip()!.getAttribute("role")).toBe("tooltip");
    await userEvent.keyboard("{ArrowRight}");
    expect(shownName()).toBe("Hand");
    expect(modeler.container.querySelectorAll(".djs-hover-tooltip")).toHaveLength(1);

    canvasSvg(modeler).focus();
    expect(shownTooltip()).toBeNull();
  });

  it("hides on Escape and on a press, and stays hidden while the pointer rests on the entry", async () => {
    modeler.container.parentElement!.querySelector("button")!.focus();
    await userEvent.tab();
    expect(shownName()).toBe("Lasso");
    await userEvent.keyboard("{Escape}");
    expect(shownTooltip()).toBeNull();
    expect(document.activeElement).toBe(entryOf(modeler, "lasso-tool"));

    const { entry } = await hover("hand-tool");
    await userEvent.click(entry);
    expect(shownTooltip()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(shownTooltip()).toBeNull();
  });

  it("waits 300ms on hover, then shows a neighbour's at once", async () => {
    await userEvent.hover(canvasSvg(modeler), { position: { x: 500, y: 500 } });
    await userEvent.hover(entryOf(modeler, "lasso-tool"));
    expect(shownTooltip()).toBeNull();
    await vi.waitFor(() => expect(shownName()).toBe("Lasso"));

    await userEvent.hover(entryOf(modeler, "hand-tool"));
    expect(shownName()).toBe("Hand");
  });

  it("shows none for touch", async () => {
    const entry = entryOf(modeler, "hand-tool");
    entry.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "touch" }));
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(shownTooltip()).toBeNull();
  });

  it("describes no entry whose name and aria-keyshortcuts say what it shows", async () => {
    modeler.container.parentElement!.querySelector("button")!.focus();
    await userEvent.tab();

    expect(shownName()).toBe("Lasso");
    expect(entryOf(modeler, "lasso-tool").hasAttribute("aria-describedby")).toBe(false);
  });
});

/** A chrome that skins the palette as the shell does, without importing the shell. */
function chromeModule(options: { asShell: boolean }): ModuleDeclaration {
  function markPalette(eventBus: EventBus): void {
    eventBus.on("palette.create", (event: { container: HTMLElement }) =>
      event.container.setAttribute("data-chrome", "palette"),
    );
  }
  markPalette.$inject = ["eventBus"];
  return {
    __init__: [markPalette],
    ...(options.asShell
      ? { modelerShell: ["value", { chrome: true }], paletteTooltip: ["value", null] }
      : {}),
  };
}

describe.each([
  { name: "the shell", asShell: true },
  { name: "another chrome", asShell: false },
])("a palette $name skins (data-chrome)", ({ asShell }) => {
  it("keeps none of the renderer's layout, keys or toolbar attributes", async () => {
    const modeler = mount([chromeModule({ asShell })]);
    const palette = paletteOf(modeler);
    expect(palette.getAttribute("data-chrome")).toBe("palette");

    const style = getComputedStyle(palette);
    expect([style.top, style.width, style.zIndex]).toEqual(["20px", "48px", "auto"]);
    expect(palette.querySelector(".djs-palette-entries")!.hasAttribute("role")).toBe(false);
    for (const entry of entries(modeler)) {
      expect(entry.hasAttribute("tabindex")).toBe(false);
      expect(entry.hasAttribute("aria-pressed")).toBe(false);
      expect(entry.hasAttribute("aria-keyshortcuts")).toBe(false);
    }
    expect(
      palette.compareDocumentPosition(canvasSvg(modeler)) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();

    const hand = entryOf(modeler, "hand-tool");
    await userEvent.hover(hand);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const tooltip = modeler.container.querySelector<HTMLElement>(".djs-hover-tooltip");
    if (asShell) {
      expect(tooltip).toBeNull();
    } else {
      expect(tooltip?.classList.contains("djs-hover-tooltip--right")).toBe(true);
      const handBox = hand.getBoundingClientRect();
      const tooltipBox = tooltip!.getBoundingClientRect();
      expect(tooltipBox.left).toBeCloseTo(handBox.right + 8, 0);
      expect(tooltipBox.top + tooltipBox.height / 2).toBeCloseTo(
        handBox.top + handBox.height / 2,
        0,
      );
    }
    await userEvent.unhover(hand);

    const step = entryOf(modeler, "create.step");
    step.tabIndex = 0;
    step.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(step);
    await userEvent.keyboard("{Enter}");
    expect(shapes(modeler)).toEqual([]);
  });
});
