/// <reference types="@vitest/browser-playwright" />
import { afterEach, describe, expect, test, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type ToolManager from "diagram-js/lib/features/tool-manager/ToolManager";
import type { ModuleDeclaration } from "didi";
import { Modeler } from "../../src/index.js";
import type EventStormingDrawTool from "../../src/draw-tool/EventStormingDrawTool.js";
import { isEventStormingShape, type EventStormingShape } from "../../src/model/di-types.js";
import type EventStormingModeling from "../../src/modeling/EventStormingModeling.js";
import type EventStormingReadOnly from "../../src/read-only/EventStormingReadOnly.js";
import { READ_ONLY_CHANGED_EVENT } from "../../src/read-only/index.js";
import "../../src/assets/event-storming.css";

/**
 * The palette a host gets that mounts the renderer without the modeler shell (designIQ, any page):
 * the toolbar of guide §5.5 at the top centre, its keys and pressed tools, and the tooltip below
 * it. The renderer's palette and tooltip rules lay out this modeler's palette and no other on the
 * page, and a palette a chrome skins (`data-chrome="palette"`) stays that chrome's alone.
 */

const FREE_AREA_CENTRE = { x: 400, y: 300 };
/** The entries of a board at the default level, "design", in the palette's order. */
const ENTRIES = [
  "lasso-tool",
  "draw-tool",
  "create.event",
  "create.command",
  "create.actor",
  "create.aggregate",
  "create.policy",
  "create.readmodel",
  "create.external",
  "create.hotspot",
  "create.note",
];

interface Board {
  modeler: Modeler;
  container: HTMLElement;
  palette: HTMLElement;
  /** A host's button in front of the board in the tab order. */
  before: HTMLButtonElement;
}

const mounted: { modeler: Modeler; container: HTMLElement }[] = [];

afterEach(async () => {
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  document.documentElement.removeAttribute("data-cd-kontrast");
  for (const { modeler, container } of mounted.splice(0)) {
    modeler.destroy();
    container.remove();
  }
});

/** A board without the shell, its palette at the top centre of a container 1024px wide. */
async function mountBoard(
  options: { width?: number; height?: number; additionalModules?: ModuleDeclaration[] } = {},
): Promise<Board> {
  const wrapper = document.createElement("div");
  const before = document.createElement("button");
  before.textContent = "Before the board";
  const container = document.createElement("div");
  wrapper.append(before, container);
  document.body.append(wrapper);
  const modeler = new Modeler({
    container,
    width: options.width ?? 1024,
    height: options.height ?? 768,
    fitOnImport: false,
    freeArea: { center: () => FREE_AREA_CENTRE },
    additionalModules: options.additionalModules ?? [],
  });
  mounted.push({ modeler, container: wrapper });
  await modeler.importDSL("title Palette");
  // The pointer of an earlier case may rest where an entry of this board lies, which would hover it.
  await userEvent.hover(before);
  return {
    modeler,
    container,
    palette: container.querySelector<HTMLElement>(".djs-palette")!,
    before,
  };
}

function canvasSvg(container: HTMLElement): SVGSVGElement {
  return container.querySelector<SVGSVGElement>(".djs-container > svg")!;
}

function paletteEntries(palette: HTMLElement): HTMLElement[] {
  return [...palette.querySelectorAll<HTMLElement>(".djs-palette-entries .entry")];
}

function stickies(modeler: Modeler): EventStormingShape[] {
  return modeler
    .get<ElementRegistry>("elementRegistry")
    .filter(isEventStormingShape) as EventStormingShape[];
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

function entryOf(palette: HTMLElement, action: string): HTMLElement {
  const found = palette.querySelector<HTMLElement>(`.entry[data-action="${action}"]`);
  if (!found) throw new Error(`no palette entry ${action}`);
  return found;
}

function boxIn(element: Element, origin: Element): DOMRect {
  const box = element.getBoundingClientRect();
  const originBox = origin.getBoundingClientRect();
  return new DOMRect(box.left - originBox.left, box.top - originBox.top, box.width, box.height);
}

/**
 * What `property: value` computes to inside `container`, where the roles are the container's. The
 * probe keeps its own colours under forced colours, so a system colour resolves as itself.
 */
function resolved(container: HTMLElement, property: string, value: string): string {
  const probe = document.createElement("div");
  probe.style.forcedColorAdjust = "none";
  probe.style.setProperty(property, value);
  container.append(probe);
  const computed = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return computed;
}

/** The element's look once its transitions have ended. */
async function settled(element: HTMLElement): Promise<CSSStyleDeclaration> {
  await Promise.all(element.getAnimations().map((animation) => animation.finished));
  return getComputedStyle(element);
}

async function emulateMedia(name: "forced-colors" | "prefers-reduced-motion", value: string) {
  await cdp().send("Emulation.setEmulatedMedia", { features: [{ name, value }] });
}

test("leaves another diagram-js palette and its tooltip on the same page as diagram-js lays them out", async () => {
  const { palette: ownPalette } = await mountBoard();
  const own = getComputedStyle(ownPalette);
  expect([own.top, own.zIndex]).toEqual(["12px", "110"]);

  const other = document.createElement("div");
  other.style.cssText = "position: relative; width: 600px; height: 400px;";
  other.innerHTML =
    '<div class="djs-palette open"><div class="djs-palette-entries"><div class="group">' +
    '<div class="entry"></div></div></div></div>' +
    '<div class="djs-hover-tooltip djs-hover-tooltip--bottom">Tooltip</div>';
  document.body.append(other);
  try {
    const palette = getComputedStyle(other.querySelector(".djs-palette")!);
    expect([palette.top, palette.left, palette.transform, palette.zIndex]).toEqual([
      "20px",
      "20px",
      "none",
      "auto",
    ]);
    expect(getComputedStyle(other.querySelector(".entry")!).width).toBe("46px");
    const tooltip = getComputedStyle(other.querySelector(".djs-hover-tooltip")!);
    expect([tooltip.padding, tooltip.transform, tooltip.position, tooltip.whiteSpace]).toEqual([
      "6px 10px",
      "none",
      "fixed",
      "nowrap",
    ]);
  } finally {
    other.remove();
  }
});

test("lets a host's own rules on the palette and its tooltip win over the renderer's sheet that loads after it", async () => {
  const host = document.createElement("div");
  host.className = "palette-host";
  const container = document.createElement("div");
  host.append(container);
  document.body.append(host);
  const modeler = new Modeler({ container, width: 1024, height: 768, fitOnImport: false });
  mounted.push({ modeler, container: host });
  await modeler.importDSL("title Palette");
  const palette = container.querySelector(".djs-palette")!;
  const tooltip = document.createElement("div");
  tooltip.className = "djs-hover-tooltip djs-hover-tooltip--bottom";
  container.querySelector(".djs-container")!.append(tooltip);
  expect([getComputedStyle(palette).top, getComputedStyle(tooltip).padding]).toEqual([
    "12px",
    "3px 8px",
  ]);

  const hostSheet = document.createElement("style");
  hostSheet.textContent =
    '.palette-host .djs-palette:not([data-chrome="palette"]) { top: 30px; }' +
    ".palette-host .djs-hover-tooltip { padding: 1px 2px; }";
  document.head.prepend(hostSheet);
  try {
    expect([getComputedStyle(palette).top, getComputedStyle(tooltip).padding]).toEqual([
      "30px",
      "1px 2px",
    ]);
  } finally {
    hostSheet.remove();
  }
});

describe("the palette without the shell: the sizes of guide §5.5", () => {
  // diagram-js collapses the palette of a board lower than 46px per entry plus 50px into two
  // columns 94px wide, which its vertical palette needs and the horizontal island does not.
  test.for([
    { board: "a board", height: 768, twoColumn: false },
    { board: "a board too low for diagram-js's vertical palette", height: 360, twoColumn: true },
  ])(
    "is an island 40px high at 12px from the top, its entries 4px inside its edge, on $board",
    async ({ height, twoColumn }) => {
      const { container, palette } = await mountBoard({ height });
      expect(palette.classList.contains("two-column")).toBe(twoColumn);
      const box = boxIn(palette, container);

      expect([box.top, box.height]).toEqual([12, 40]);
      expect(Math.abs(box.left + box.width / 2 - 512)).toBeLessThanOrEqual(0.5);
      const entries = [...palette.querySelectorAll(".entry")].map((entry) => boxIn(entry, palette));
      expect(new Set(entries.map((entry) => entry.top))).toEqual(new Set([4]));
      expect(entries[0]!.left).toBe(4);
      expect(box.width - entries.at(-1)!.right).toBe(4);
    },
  );

  test("holds 32 × 32 entries 2px apart, with 8px, a 1px line inset 4px, and 8px between the groups", async () => {
    const { container, palette } = await mountBoard();
    const groups = [...palette.querySelectorAll<HTMLElement>(".group")];
    expect(groups.length).toBeGreaterThan(1);
    const boxesOf = (group: HTMLElement) =>
      [...group.querySelectorAll(".entry")].map((entry) => boxIn(entry, palette));

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
      expect(line.backgroundColor).toBe(
        resolved(container, "background-color", "var(--cd-ui-linie)"),
      );
      expect(boxIn(groups[index]!, palette).left - lastBefore.right).toBe(8);
      expect(boxesOf(groups[index]!)[0]!.left - lastBefore.right).toBe(17);
    }
  });

  test("hangs the tooltip 8px below the island, at 60px, centred on its entry, the key 6px after the name", async () => {
    const { container, palette } = await mountBoard();
    const entry = entryOf(palette, "create.event");
    await userEvent.hover(entry);

    const tooltip = await vi.waitFor(() => {
      const shown = container.querySelector<HTMLElement>(".djs-hover-tooltip");
      if (!shown) throw new Error("No tooltip yet.");
      return shown;
    });
    const tooltipBox = boxIn(tooltip, container);
    const entryBox = boxIn(entry, container);
    expect(tooltipBox.top).toBeCloseTo(boxIn(palette, container).bottom + 8, 0);
    expect(tooltipBox.top).toBeCloseTo(60, 0);
    expect(tooltipBox.left + tooltipBox.width / 2).toBeCloseTo(
      entryBox.left + entryBox.width / 2,
      0,
    );
    const name = tooltip.querySelector(".djs-palette-tooltip-label")!.getBoundingClientRect();
    const key = tooltip.querySelector(".djs-palette-tooltip-shortcut")!.getBoundingClientRect();
    expect(key.left - name.right).toBeCloseTo(6, 0);
    await userEvent.unhover(entry);
  });
});

describe("the palette without the shell: a container at most 760px wide (guide §5.15)", () => {
  function resize(board: Board, width: number): void {
    board.container.style.width = `${width}px`;
    board.modeler.get<Canvas>("canvas").resized();
  }

  function canvasScroll(container: HTMLElement): number[] {
    const canvasContainer = container.querySelector<HTMLElement>(".djs-container")!;
    return [canvasContainer.scrollLeft, canvasContainer.scrollTop];
  }

  /** The entry's box in the palette's visible part, whose left edge is 0. */
  function visibleIn(entry: HTMLElement, palette: HTMLElement): { left: number; right: number } {
    const box = boxIn(entry, palette);
    return { left: box.left - palette.clientLeft, right: box.right - palette.clientLeft };
  }

  test("stays in the top row above 760px and moves to the second row, at 64px, at 760px", async () => {
    const board = await mountBoard({ width: 761 });
    expect(boxIn(board.palette, board.container).top).toBe(12);

    resize(board, 760);
    const box = boxIn(board.palette, board.container);
    expect([box.top, box.height]).toEqual([64, 40]);
    expect(Math.abs(box.left + box.width / 2 - 380)).toBeLessThanOrEqual(0.5);
    expect(getComputedStyle(board.palette).overflowX).toBe("auto");
  });

  // The palette is 425px wide at the level "design".
  test("keeps 12px from both sides of a container narrower than it and scrolls sideways without a bar, the keyboard focus in view", async () => {
    const { container, palette } = await mountBoard({ width: 430 });
    const box = boxIn(palette, container);
    expect([box.left, box.right, box.height]).toEqual([12, 418, 40]);
    expect(palette.scrollWidth).toBeGreaterThan(palette.clientWidth);
    expect(getComputedStyle(palette).scrollbarWidth).toBe("none");
    for (const entry of paletteEntries(palette)) {
      expect(entry.getBoundingClientRect().width).toBe(32);
    }

    entryOf(palette, "lasso-tool").focus();
    await userEvent.keyboard("{End}");
    const note = entryOf(palette, "create.note");
    expect(document.activeElement).toBe(note);
    expect(palette.scrollLeft).toBeGreaterThan(0);
    expect(visibleIn(note, palette).right).toBeCloseTo(palette.clientWidth - 3, 0);
    expect(canvasScroll(container)).toEqual([0, 0]);

    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(entryOf(palette, "lasso-tool"));
    expect(visibleIn(entryOf(palette, "lasso-tool"), palette).left).toBeCloseTo(3, 0);
    expect(canvasScroll(container)).toEqual([0, 0]);
  });

  // The removal of the focused entry scrolls the palette back to its start, and the focus would come
  // back on an entry that still lies in view there: the palette would jump under the user.
  test("keeps the palette scrolled where it was when an import rebuilds the entries under the keyboard focus", async () => {
    const { modeler, palette, before } = await mountBoard({ width: 300 });
    before.focus();
    await userEvent.tab();
    await userEvent.keyboard("{End}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    expect(document.activeElement).toBe(entryOf(palette, "create.policy"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const scrolled = palette.scrollLeft;
    expect(scrolled).toBeGreaterThan(0);

    await modeler.importDSL("title Palette\nevent Remote [200, 300]");
    expect(document.activeElement).toBe(entryOf(palette, "create.policy"));
    expect(palette.scrollLeft).toBe(scrolled);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(palette.scrollLeft).toBe(scrolled);
  });

  test("puts the focus ring inside the entry, 1px inside the armed tool's ring", async () => {
    const { palette } = await mountBoard({ width: 600 });
    const ring = (action: string) => {
      const style = getComputedStyle(entryOf(palette, action));
      return [style.outlineWidth, style.outlineOffset];
    };
    entryOf(palette, "lasso-tool").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(ring("draw-tool")).toEqual(["2px", "-2px"]);

    await userEvent.keyboard("{Enter}");
    expect(entryOf(palette, "draw-tool").getAttribute("aria-pressed")).toBe("true");
    expect(ring("draw-tool")).toEqual(["2px", "-5px"]);
  });

  test("keeps the 3px ring of high contrast 1px deeper, from the nearest carrier of the mode", async () => {
    const { container, palette } = await mountBoard({ width: 600 });
    const carrier = container.parentElement!;
    const ring = (action: string) => {
      const style = getComputedStyle(entryOf(palette, action));
      return [style.outlineWidth, style.outlineOffset];
    };
    entryOf(palette, "lasso-tool").focus();
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{Enter}");
    container.setAttribute("data-cd-theme", "light");
    container.setAttribute("data-cd-kontrast", "hoch");
    expect(ring("draw-tool")).toEqual(["3px", "-6px"]);
    await userEvent.keyboard("{ArrowLeft}");
    expect(ring("lasso-tool")).toEqual(["3px", "-3px"]);

    container.removeAttribute("data-cd-kontrast");
    document.documentElement.setAttribute("data-cd-kontrast", "hoch");
    expect(ring("lasso-tool")).toEqual(["2px", "-2px"]);
    container.removeAttribute("data-cd-theme");
    carrier.setAttribute("data-cd-theme", "light");
    carrier.setAttribute("data-cd-kontrast", "hoch");
    document.documentElement.removeAttribute("data-cd-kontrast");
    expect(ring("lasso-tool")).toEqual(["3px", "-3px"]);
  });

  // 64px, the 40px island and 8px. At 430px the palette has scrolled to show the last entry.
  test.for([{ width: 760 }, { width: 430 }])(
    "hangs the tooltip at 112px in a container $width px wide, centred on its entry",
    async ({ width }) => {
      const { container, palette, before } = await mountBoard({ width });
      before.focus();
      await userEvent.tab();
      await userEvent.keyboard("{End}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}");
      const policy = entryOf(palette, "create.policy");
      expect(document.activeElement).toBe(policy);

      const tooltip = container.querySelector<HTMLElement>(".djs-hover-tooltip");
      expect(tooltip?.textContent).toBe("Policy");
      const tooltipBox = boxIn(tooltip!, container);
      const entryBox = boxIn(policy, container);
      expect(tooltipBox.top).toBeCloseTo(112, 0);
      expect(tooltipBox.left + tooltipBox.width / 2).toBeCloseTo(
        entryBox.left + entryBox.width / 2,
        0,
      );
    },
  );

  // A trackpad or Shift and the wheel scroll the palette under a tooltip the keyboard focus shows.
  test("takes the tooltip along when the palette scrolls, and away once its entry has left the view", async () => {
    const { container, palette, before } = await mountBoard({ width: 300 });
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const centreOf = (element: HTMLElement) => {
      const box = boxIn(element, container);
      return box.left + box.width / 2;
    };
    before.focus();
    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    const event = entryOf(palette, "create.event");
    expect(document.activeElement).toBe(event);
    const tooltip = container.querySelector<HTMLElement>(".djs-hover-tooltip")!;
    expect(tooltip.textContent).toContain("Domain event");
    const shownAt = centreOf(tooltip);
    expect(shownAt).toBeCloseTo(centreOf(event), 0);

    palette.scrollLeft = 24;
    await nextFrame();
    await nextFrame();
    expect(palette.scrollLeft).toBe(24);
    expect(tooltip.isConnected).toBe(true);
    expect(centreOf(tooltip)).toBeCloseTo(shownAt - 24, 0);
    expect(centreOf(tooltip)).toBeCloseTo(centreOf(event), 0);

    palette.scrollLeft = palette.scrollWidth;
    await nextFrame();
    await nextFrame();
    expect(boxIn(event, palette).right).toBeLessThanOrEqual(palette.clientLeft);
    expect(container.querySelector(".djs-hover-tooltip")).toBeNull();
    expect(event.hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("the palette without the shell: forced colours (guide §5.14)", () => {
  test("keeps the separator between the groups, in CanvasText", async () => {
    const { container, palette } = await mountBoard();
    await emulateMedia("forced-colors", "active");

    const line = getComputedStyle(palette.querySelectorAll(".group")[1]!, "::before");
    expect(line.forcedColorAdjust).toBe("none");
    expect(line.backgroundColor).toBe(resolved(container, "background-color", "CanvasText"));
  });

  test("keeps the armed tool's 2px ring inside it, in Highlight on Canvas", async () => {
    const { container, palette } = await mountBoard();
    const lasso = entryOf(palette, "lasso-tool");
    await userEvent.click(lasso);
    await vi.waitFor(() => expect(lasso.getAttribute("aria-pressed")).toBe("true"));
    await emulateMedia("forced-colors", "active");

    await vi.waitFor(() => {
      const style = getComputedStyle(lasso);
      expect(style.forcedColorAdjust).toBe("none");
      expect(style.backgroundColor).toBe(resolved(container, "background-color", "Canvas"));
      expect(style.color).toBe(resolved(container, "color", "CanvasText"));
      expect(style.boxShadow).toBe(resolved(container, "box-shadow", "inset 0 0 0 2px Highlight"));
    });
  });

  test("draws the focused entry's ring and the island's edge in system colours", async () => {
    const { container, palette } = await mountBoard();
    const entry = entryOf(palette, "create.event");
    entry.tabIndex = -1;
    entry.focus({ focusVisible: true });
    expect(entry.matches(":focus-visible")).toBe(true);
    await emulateMedia("forced-colors", "active");

    // Chromium forces outlines and borders to a system colour by itself; with that forcing off, they
    // show the stylesheet's own colours, which engines that keep author colours draw.
    palette.style.forcedColorAdjust = "none";
    expect(getComputedStyle(entry).outlineColor).toBe(
      resolved(container, "outline-color", "Highlight"),
    );
    expect(getComputedStyle(palette).borderTopColor).toBe(
      resolved(container, "border-top-color", "CanvasText"),
    );
  });
});

describe("the palette without the shell: reduced motion (guide §5.14, §7)", () => {
  test("switches the entries' transitions off", async () => {
    const { palette } = await mountBoard();
    const entry = entryOf(palette, "create.event");
    expect(getComputedStyle(entry).transitionDuration).not.toBe("0s");

    await emulateMedia("prefers-reduced-motion", "reduce");
    const style = getComputedStyle(entry);
    expect([style.transitionProperty, style.transitionDuration]).toEqual(["none", "0s"]);
  });
});

describe("the palette without the shell: glass (guide §5.3, §5.5, §6)", () => {
  test("is the raised surface at --cd-ui-chrome-deckkraft over an 8px blur, not opaque", async () => {
    const { container, palette } = await mountBoard();
    const style = getComputedStyle(palette);

    expect(style.backgroundColor).toBe(
      resolved(
        container,
        "background-color",
        "color-mix(in srgb, var(--cd-ui-flaeche-hoch) var(--cd-ui-chrome-deckkraft), transparent)",
      ),
    );
    expect(style.backgroundColor).not.toBe(opaqueSurface(container));
    expect(style.backdropFilter).toBe("blur(8px)");
  });

  test("turns opaque in high contrast, on the page and on the board's own carrier", async () => {
    const { container, palette } = await mountBoard();
    document.documentElement.setAttribute("data-cd-kontrast", "hoch");
    expect(getComputedStyle(palette).backgroundColor).toBe(opaqueSurface(container));

    document.documentElement.removeAttribute("data-cd-kontrast");
    container.setAttribute("data-cd-theme", "light");
    container.setAttribute("data-cd-kontrast", "hoch");
    expect(getComputedStyle(palette).backgroundColor).toBe(opaqueSurface(container));
  });

  test("stays glass in a carrier in normal contrast on a high-contrast page", async () => {
    const { container, palette } = await mountBoard();
    document.documentElement.setAttribute("data-cd-kontrast", "hoch");
    container.setAttribute("data-cd-theme", "light");

    expect(getComputedStyle(palette).backgroundColor).not.toBe(opaqueSurface(container));
  });
});

describe("the palette without the shell: toolbar (guide §5.5, §5.14)", () => {
  function tabStops(palette: HTMLElement): (string | null)[] {
    return paletteEntries(palette)
      .filter((entry) => entry.tabIndex === 0)
      .map((entry) => entry.getAttribute("data-action"));
  }

  function pressed(palette: HTMLElement): Record<string, string | null> {
    return Object.fromEntries(
      paletteEntries(palette).map((entry) => [
        entry.getAttribute("data-action"),
        entry.getAttribute("aria-pressed"),
      ]),
    );
  }

  test("is a toolbar named Tools, ahead of the canvas in the document and the tab order", async () => {
    const { container, palette, before } = await mountBoard();
    const toolbar = palette.querySelector(".djs-palette-entries")!;
    expect(toolbar.getAttribute("role")).toBe("toolbar");
    expect(toolbar.getAttribute("aria-label")).toBe("Tools");
    expect(
      palette.compareDocumentPosition(canvasSvg(container)) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(paletteEntries(palette).map((entry) => entry.getAttribute("data-action"))).toEqual(
      ENTRIES,
    );
    expect(paletteEntries(palette).map((entry) => entry.getAttribute("role"))).toEqual(
      ENTRIES.map(() => "button"),
    );

    before.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(entryOf(palette, "lasso-tool"));
    await userEvent.tab();
    expect(document.activeElement).toBe(canvasSvg(container));
  });

  test("has one tab stop that roves with ← → Home End and stays where the focus left it", async () => {
    const { container, palette } = await mountBoard();
    expect(tabStops(palette)).toEqual(["lasso-tool"]);
    expect(paletteEntries(palette).filter((entry) => entry.tabIndex === -1)).toHaveLength(
      ENTRIES.length - 1,
    );

    entryOf(palette, "lasso-tool").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(entryOf(palette, "draw-tool"));
    expect(tabStops(palette)).toEqual(["draw-tool"]);

    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(entryOf(palette, "create.note"));
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(entryOf(palette, "lasso-tool"));
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(entryOf(palette, "create.note"));
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(entryOf(palette, "lasso-tool"));
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(tabStops(palette)).toEqual(["create.event"]);

    canvasSvg(container).focus();
    expect(tabStops(palette)).toEqual(["create.event"]);
  });

  test("keeps one tab stop when a level switch rebuilds the entries", async () => {
    const { modeler, palette } = await mountBoard();
    entryOf(palette, "lasso-tool").focus();
    await userEvent.keyboard("{End}");
    expect(tabStops(palette)).toEqual(["create.note"]);

    await modeler.importDSL("title Palette\nlevel big-picture");
    expect(paletteEntries(palette)).toHaveLength(7);
    expect(tabStops(palette)).toEqual(["create.note"]);
    expect(paletteEntries(palette).filter((entry) => entry.tabIndex === -1)).toHaveLength(6);
  });

  // diagram-js removes every entry on a rebuild, the focused one too, and the focus would fall to
  // <body>: a host that imports each remote change would throw a keyboard user out of the toolbar.
  test("keeps the keyboard focus on its entry when an import, a level switch or its undo rebuilds the entries", async () => {
    const { modeler, palette, before } = await mountBoard();
    before.focus();
    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    const focused = entryOf(palette, "create.event");
    expect(document.activeElement).toBe(focused);

    await modeler.importDSL("title Palette\nevent Remote [200, 300]");
    expect(focused.isConnected).toBe(false);
    expect(document.activeElement).toBe(entryOf(palette, "create.event"));
    expect(tabStops(palette)).toEqual(["create.event"]);

    modeler.get<EventStormingModeling>("eventStormingModeling").setLevel("big-picture");
    expect(paletteEntries(palette)).toHaveLength(7);
    expect(document.activeElement).toBe(entryOf(palette, "create.event"));

    modeler.get<CommandStack>("commandStack").undo();
    expect(paletteEntries(palette)).toHaveLength(ENTRIES.length);
    expect(document.activeElement).toBe(entryOf(palette, "create.event"));
    expect(tabStops(palette)).toEqual(["create.event"]);
  });

  test("moves the keyboard focus to the tab stop when a level switch removes its entry, and pulls no focus into the toolbar", async () => {
    const { modeler, container, palette, before } = await mountBoard();
    before.focus();
    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(document.activeElement).toBe(entryOf(palette, "create.aggregate"));

    modeler.get<EventStormingModeling>("eventStormingModeling").setLevel("big-picture");
    expect(palette.querySelector('[data-action="create.aggregate"]')).toBeNull();
    expect(tabStops(palette)).toEqual(["lasso-tool"]);
    expect(document.activeElement).toBe(entryOf(palette, "lasso-tool"));

    (document.activeElement as HTMLElement).blur();
    await modeler.importDSL("title Palette\nlevel big-picture\nevent Remote [200, 300]");
    expect(document.activeElement).toBe(document.body);

    canvasSvg(container).focus();
    await modeler.importDSL("title Palette");
    expect(document.activeElement).toBe(canvasSvg(container));
  });

  test("names the keys of the lasso, the domain event and the command, and of no other entry", async () => {
    const { palette } = await mountBoard();
    expect(
      Object.fromEntries(
        paletteEntries(palette)
          .filter((entry) => entry.hasAttribute("aria-keyshortcuts"))
          .map((entry) => [
            entry.getAttribute("data-action"),
            entry.getAttribute("aria-keyshortcuts"),
          ]),
      ),
    ).toEqual({ "lasso-tool": "L", "create.event": "E", "create.command": "C" });
  });

  test("presses the armed tool only, also when a key on the canvas arms it", async () => {
    const { container, palette } = await mountBoard();
    expect(pressed(palette)).toEqual({
      ...Object.fromEntries(ENTRIES.map((action) => [action, null])),
      "lasso-tool": "false",
      "draw-tool": "false",
    });

    entryOf(palette, "draw-tool").focus();
    await userEvent.keyboard(" ");
    expect(pressed(palette)).toMatchObject({ "lasso-tool": "false", "draw-tool": "true" });
    expect(document.activeElement).toBe(entryOf(palette, "draw-tool"));

    await userEvent.keyboard("{Enter}");
    expect(pressed(palette)).toMatchObject({ "lasso-tool": "false", "draw-tool": "false" });

    canvasSvg(container).focus();
    await userEvent.keyboard("l");
    expect(pressed(palette)).toMatchObject({ "lasso-tool": "true", "draw-tool": "false" });
  });

  // diagram-js releases the lasso on a cancel only once the pointer moved its drag, and arms it
  // again for a second click without a press, while the pointer rests (#462).
  test("releases the armed lasso on a second Enter or Space and on Escape, so it is pressed only while armed", async () => {
    const { modeler, palette } = await mountBoard();
    const dragging = modeler.get<Dragging>("dragging");
    const lasso = entryOf(palette, "lasso-tool");
    const state = () => [lasso.getAttribute("aria-pressed"), dragging.context()?.prefix ?? null];
    lasso.focus();

    await userEvent.keyboard(" ");
    expect(state()).toEqual(["true", "lasso.selection"]);
    await userEvent.keyboard(" ");
    expect(state()).toEqual(["false", null]);
    expect(document.activeElement).toBe(lasso);

    await userEvent.keyboard("{Enter}");
    expect(state()).toEqual(["true", "lasso.selection"]);
    await userEvent.keyboard("{Escape}");
    expect(state()).toEqual(["false", null]);

    await userEvent.keyboard("{Enter}");
    expect(state()).toEqual(["true", "lasso.selection"]);
  });

  test("arms the lasso again, pressed, on a second click with the pointer", async () => {
    const { modeler, palette } = await mountBoard();
    const dragging = modeler.get<Dragging>("dragging");
    const lasso = entryOf(palette, "lasso-tool");
    const state = () => [lasso.getAttribute("aria-pressed"), dragging.context()?.prefix ?? null];

    await userEvent.click(lasso);
    expect(state()).toEqual(["true", "lasso.selection"]);
    await userEvent.click(lasso);
    expect(state()).toEqual(["true", "lasso.selection"]);
  });

  // A pointer's press on another entry ends the lasso's waiting drag; Enter and Space press nothing.
  test("puts the armed lasso down when Enter arms the draw tool, so Enter on the lasso arms it again", async () => {
    const { modeler, palette } = await mountBoard();
    const dragging = modeler.get<Dragging>("dragging");
    const drawTool = modeler.get<EventStormingDrawTool>("eventStormingDrawTool");
    const state = () => [
      pressed(palette)["lasso-tool"],
      pressed(palette)["draw-tool"],
      dragging.context()?.prefix ?? null,
      drawTool.isActive(),
    ];
    entryOf(palette, "lasso-tool").focus();

    await userEvent.keyboard("{Enter}");
    expect(state()).toEqual(["true", "false", "lasso.selection", false]);
    await userEvent.keyboard("{ArrowRight}{Enter}");
    expect(state()).toEqual(["false", "true", null, true]);
    expect(modeler.get<ToolManager>("toolManager").isActive("lasso")).toBe(false);

    await userEvent.keyboard("{ArrowLeft}{Enter}");
    expect(state()).toEqual(["true", "false", "lasso.selection", false]);
  });

  test("puts the armed lasso down when Enter places a sticky", async () => {
    const { modeler, palette } = await mountBoard();
    const dragging = modeler.get<Dragging>("dragging");
    entryOf(palette, "lasso-tool").focus();
    await userEvent.keyboard("{Enter}");
    expect(dragging.context()?.prefix).toBe("lasso.selection");

    entryOf(palette, "create.event").focus();
    await userEvent.keyboard("{Enter}");
    expect(stickies(modeler)).toHaveLength(1);
    expect(dragging.context()).toBeNull();
    expect(pressed(palette)["lasso-tool"]).toBe("false");
  });

  // diagram-js marks the armed tool with `highlighted-entry` in the tools group it found at the
  // first tool change, which a rebuild (each import, each level switch) leaves detached.
  test("rings the armed tool after an import rebuilt the entries, also in forced colours", async () => {
    const { modeler, container, palette } = await mountBoard();
    canvasSvg(container).focus();
    await userEvent.keyboard("l");
    await userEvent.keyboard("{Escape}");
    expect(pressed(palette)).toMatchObject({ "lasso-tool": "false" });

    await modeler.importDSL("title Palette\nevent Remote [200, 300]");
    canvasSvg(container).focus();
    await userEvent.keyboard("l");
    const lasso = entryOf(palette, "lasso-tool");
    expect(lasso.getAttribute("aria-pressed")).toBe("true");
    await vi.waitFor(() => {
      const armed = getComputedStyle(lasso);
      expect(armed.backgroundColor).toBe(
        resolved(container, "background-color", "var(--cd-ui-hover)"),
      );
      expect(armed.boxShadow).toBe(
        resolved(container, "box-shadow", "inset 0 0 0 2px var(--cd-ui-interaktion)"),
      );
      expect(armed.color).toBe(resolved(container, "color", "var(--cd-ui-text)"));
    });

    await emulateMedia("forced-colors", "active");
    await vi.waitFor(() => {
      const style = getComputedStyle(lasso);
      expect(style.backgroundColor).toBe(resolved(container, "background-color", "Canvas"));
      expect(style.boxShadow).toBe(resolved(container, "box-shadow", "inset 0 0 0 2px Highlight"));
    });
  });

  test("creates a domain event in the free area on Enter, selected and in edit", async () => {
    const { modeler, container, palette } = await mountBoard();
    entryOf(palette, "create.event").focus();
    await userEvent.keyboard("{Enter}");

    const [created] = stickies(modeler);
    expect(created?.eventStormingType).toBe("event");
    expect([created!.x + created!.width / 2, created!.y + created!.height / 2]).toEqual([
      FREE_AREA_CENTRE.x,
      FREE_AREA_CENTRE.y,
    ]);
    expect(modeler.get<Selection>("selection").get()).toEqual([created]);
    expect(container.querySelector(".event-storming-label-input")).not.toBeNull();
    expect(stickies(modeler)).toHaveLength(1);
  });

  // A keyboard create places its sticky through modeling, which the lock's rules do not see.
  test("creates nothing and arms no draw tool while the board is read-only, from the keys or the pointer", async () => {
    const { modeler, palette } = await mountBoard();
    modeler.get<EventStormingReadOnly>("eventStormingReadOnly").setReadOnly(true);
    const drawTool = modeler.get<EventStormingDrawTool>("eventStormingDrawTool");

    entryOf(palette, "create.event").focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(stickies(modeler)).toEqual([]);
    expect(document.activeElement).toBe(entryOf(palette, "create.event"));

    entryOf(palette, "draw-tool").focus();
    await userEvent.keyboard(" ");
    expect(drawTool.isActive()).toBe(false);
    // Playwright refuses to click an aria-disabled entry, which a pointer still reaches.
    await userEvent.click(entryOf(palette, "draw-tool"), { force: true });
    expect(drawTool.isActive()).toBe(false);
    expect(pressed(palette)).toMatchObject({ "draw-tool": "false" });

    entryOf(palette, "lasso-tool").focus();
    await userEvent.keyboard("{Enter}");
    expect(pressed(palette)).toMatchObject({ "lasso-tool": "true" });
  });

  describe("marks the entries the read-only lock disables (guide §13.5, #463)", () => {
    function disabled(palette: HTMLElement): Record<string, string | null> {
      return Object.fromEntries(
        paletteEntries(palette).map((entry) => [
          entry.getAttribute("data-action"),
          entry.getAttribute("aria-disabled"),
        ]),
      );
    }

    function locked(actions: readonly string[]): Record<string, string | null> {
      return Object.fromEntries(
        actions.map((action) => [action, action === "lasso-tool" ? null : "true"]),
      );
    }

    test("as aria-disabled, every entry but the lasso, again after each rebuild and none once unlocked", async () => {
      const { modeler, palette } = await mountBoard();
      const readOnly = modeler.get<EventStormingReadOnly>("eventStormingReadOnly");
      expect(Object.values(disabled(palette))).toEqual(ENTRIES.map(() => null));

      readOnly.setReadOnly(true);
      expect(disabled(palette)).toEqual(locked(ENTRIES));

      await modeler.importDSL("title Palette\nevent Remote [200, 300]");
      expect(disabled(palette)).toEqual(locked(ENTRIES));
      modeler.get<EventStormingModeling>("eventStormingModeling").setLevel("big-picture");
      expect(paletteEntries(palette)).toHaveLength(7);
      expect(disabled(palette)).toEqual(
        locked(paletteEntries(palette).map((entry) => entry.getAttribute("data-action")!)),
      );

      readOnly.setReadOnly(false);
      expect(Object.values(disabled(palette))).toEqual(paletteEntries(palette).map(() => null));
    });

    // Guide §13.5 shows the lock of an invalid import only after 800ms without a valid one, so
    // typing in a text editor beside the canvas does not flicker; the lock holds from the start.
    test("after the delay a host gives, while the lock refuses from the start, and takes them off at once (#484)", async () => {
      const { modeler, palette } = await mountBoard();
      const readOnly = modeler.get<EventStormingReadOnly>("eventStormingReadOnly");
      const drawTool = modeler.get<EventStormingDrawTool>("eventStormingDrawTool");
      const unmarked = ENTRIES.map(() => null);
      const pressEnter = (action: string) =>
        entryOf(palette, action).dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
        );
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        readOnly.setReadOnly(true, { delayMs: 800 });
        vi.advanceTimersByTime(400);
        readOnly.setReadOnly(true, { delayMs: 800 });
        vi.advanceTimersByTime(399);
        expect([readOnly.isReadOnly(), readOnly.isReadOnlyShown()]).toEqual([true, false]);
        expect(Object.values(disabled(palette))).toEqual(unmarked);
        pressEnter("create.event");
        pressEnter("draw-tool");
        expect(stickies(modeler)).toEqual([]);
        expect(drawTool.isActive()).toBe(false);

        vi.advanceTimersByTime(1);
        expect(readOnly.isReadOnlyShown()).toBe(true);
        expect(disabled(palette)).toEqual(locked(ENTRIES));
        readOnly.setReadOnly(false);
        expect(readOnly.isReadOnlyShown()).toBe(false);
        expect(Object.values(disabled(palette))).toEqual(unmarked);

        readOnly.setReadOnly(true, { delayMs: 800 });
        readOnly.setReadOnly(false);
        vi.advanceTimersByTime(800);
        expect([readOnly.isReadOnly(), readOnly.isReadOnlyShown()]).toEqual([false, false]);
        expect(Object.values(disabled(palette))).toEqual(unmarked);
        pressEnter("draw-tool");
        expect(drawTool.isActive()).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    test("at once without a delay, also when a later call gives one", async () => {
      const { modeler, palette } = await mountBoard();
      const readOnly = modeler.get<EventStormingReadOnly>("eventStormingReadOnly");
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        readOnly.setReadOnly(true);
        expect(disabled(palette)).toEqual(locked(ENTRIES));
        readOnly.setReadOnly(true, { delayMs: 800 });
        expect(readOnly.isReadOnlyShown()).toBe(true);
        expect(disabled(palette)).toEqual(locked(ENTRIES));
        vi.advanceTimersByTime(800);
        expect(disabled(palette)).toEqual(locked(ENTRIES));
      } finally {
        vi.useRealTimers();
      }
    });

    test("announces the lock at once and its marks once they show, and nothing after a destroy", async () => {
      const { modeler } = await mountBoard();
      const readOnly = modeler.get<EventStormingReadOnly>("eventStormingReadOnly");
      const changes: [boolean, boolean][] = [];
      modeler
        .get<EventBus>("eventBus")
        .on(READ_ONLY_CHANGED_EVENT, (event: { readOnly: boolean; shown: boolean }) => {
          changes.push([event.readOnly, event.shown]);
        });
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        readOnly.setReadOnly(true, { delayMs: 800 });
        vi.advanceTimersByTime(800);
        readOnly.setReadOnly(false);
        expect(changes).toEqual([
          [true, false],
          [true, true],
          [false, false],
        ]);

        changes.length = 0;
        readOnly.setReadOnly(true, { delayMs: 800 });
        modeler.destroy();
        vi.advanceTimersByTime(800);
        expect(changes).toEqual([[true, false]]);
        expect(readOnly.isReadOnlyShown()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    test("keeps them in the tab order and the arrow keys' path", async () => {
      const { modeler, palette } = await mountBoard();
      modeler.get<EventStormingReadOnly>("eventStormingReadOnly").setReadOnly(true);
      entryOf(palette, "lasso-tool").focus();
      await userEvent.keyboard("{ArrowRight}");

      const draw = entryOf(palette, "draw-tool");
      expect(document.activeElement).toBe(draw);
      expect(draw.tabIndex).toBe(0);
      expect(draw.matches(":focus-visible")).toBe(true);
    });

    test("draws the tool icons in --cd-ui-text-leise and the sticky previews grey, never by opacity, and without a hover", async () => {
      const { modeler, container, palette } = await mountBoard();
      modeler.get<EventStormingReadOnly>("eventStormingReadOnly").setReadOnly(true);
      const lasso = entryOf(palette, "lasso-tool");
      const draw = entryOf(palette, "draw-tool");
      const event = entryOf(palette, "create.event");
      const quiet = resolved(container, "color", "var(--cd-ui-text-leise)");

      expect((await settled(lasso)).color).toBe(resolved(container, "color", "var(--cd-ui-text)"));
      expect((await settled(draw)).color).toBe(quiet);
      expect(getComputedStyle(event.firstElementChild!).filter).toBe("grayscale(1)");
      expect(getComputedStyle(lasso.firstElementChild!).filter).toBe("none");
      for (const entry of [draw, event]) {
        expect(getComputedStyle(entry).opacity).toBe("1");
        expect(getComputedStyle(entry.firstElementChild!).opacity).toBe("1");
        expect(getComputedStyle(entry).cursor).toBe("not-allowed");
      }

      await userEvent.hover(draw);
      await vi.waitFor(async () => {
        const style = await settled(draw);
        expect([style.backgroundColor, style.color]).toEqual(["rgba(0, 0, 0, 0)", quiet]);
      });
      await userEvent.hover(lasso);
      await vi.waitFor(async () => {
        expect((await settled(lasso)).backgroundColor).toBe(
          resolved(container, "background-color", "var(--cd-ui-hover)"),
        );
      });
    });

    // Chromium keeps a system colour the stylesheet sets and forces any other to CanvasText, which
    // the muted role turns into: the hover rule without forced colours is the more specific one.
    test("draws the disabled tool icons in GrayText in forced colours, also under the pointer", async () => {
      const { modeler, container, palette } = await mountBoard();
      modeler.get<EventStormingReadOnly>("eventStormingReadOnly").setReadOnly(true);
      await emulateMedia("forced-colors", "active");
      const draw = entryOf(palette, "draw-tool");
      const grayText = resolved(container, "color", "GrayText");
      expect(grayText).not.toBe(resolved(container, "color", "CanvasText"));

      expect((await settled(draw)).color).toBe(grayText);
      await userEvent.hover(draw);
      await vi.waitFor(async () => {
        expect(draw.matches(":hover")).toBe(true);
        expect((await settled(draw)).color).toBe(grayText);
      });
    });
  });

  test("leaves Enter with a modifier and a held key's repeats alone", async () => {
    const { modeler, palette } = await mountBoard();
    const event = entryOf(palette, "create.event");
    event.focus();
    for (const init of [
      { shiftKey: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { repeat: true },
    ]) {
      const key = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
        ...init,
      });
      event.dispatchEvent(key);
      expect(key.defaultPrevented, JSON.stringify(init)).toBe(!!init.repeat);
    }
    expect(stickies(modeler)).toEqual([]);
  });

  test("hands the focus to the canvas after a press on the island's padding", async () => {
    const { container, palette } = await mountBoard();
    entryOf(palette, "lasso-tool").focus();
    await userEvent.click(palette, { position: { x: 2, y: 20 } });

    expect(document.activeElement).toBe(canvasSvg(container));
    expect(canvasSvg(container).matches(":focus-visible")).toBe(false);
  });

  // The browser scrolls the canvas container to show a focused entry past its edge, and diagram-js
  // maps the pointer as if it never scrolled. A narrow container scrolls the palette instead, but
  // one lower than the palette's row still cuts the palette off at its bottom.
  test.for([
    { row: "top row", width: 1024, height: 40 },
    { row: "second row", width: 300, height: 90 },
  ])(
    "keeps the board in place when the keyboard reaches an entry in a container lower than the palette's $row",
    async ({ width, height }) => {
      const { container, palette, before } = await mountBoard({ width, height });
      const canvasContainer = container.querySelector<HTMLElement>(".djs-container")!;
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      before.focus();
      await userEvent.tab();
      entryOf(palette, "lasso-tool").dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }),
      );
      expect(document.activeElement).toBe(entryOf(palette, "create.note"));
      expect([canvasContainer.scrollLeft, canvasContainer.scrollTop]).toEqual([0, 0]);
      await nextFrame();
      expect([canvasContainer.scrollLeft, canvasContainer.scrollTop]).toEqual([0, 0]);

      before.focus();
      await userEvent.tab();
      expect(document.activeElement).toBe(entryOf(palette, "create.note"));
      await vi.waitFor(() =>
        expect([canvasContainer.scrollLeft, canvasContainer.scrollTop]).toEqual([0, 0]),
      );
      await nextFrame();
      await nextFrame();
      expect([canvasContainer.scrollLeft, canvasContainer.scrollTop]).toEqual([0, 0]);
    },
  );

  test("shows the keyboard focus as a 2px --cd-ui-fokus ring 2px outside the entry, none for a press", async () => {
    const { container, palette, before } = await mountBoard();
    before.focus();
    await userEvent.tab();
    const lasso = entryOf(palette, "lasso-tool");
    const style = getComputedStyle(lasso);

    expect(lasso.matches(":focus-visible")).toBe(true);
    expect([style.outlineStyle, style.outlineWidth, style.outlineOffset]).toEqual([
      "solid",
      "2px",
      "2px",
    ]);
    expect(style.outlineColor).toBe(resolved(container, "color", "var(--cd-ui-fokus)"));

    const draw = entryOf(palette, "draw-tool");
    draw.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    draw.focus({ focusVisible: false });
    expect(getComputedStyle(draw).outlineStyle).toBe("none");
  });

  // The armed tool's own ring, in --cd-ui-interaktion, lies on the same 2px as the focus ring. The
  // island is 425px wide, so an odd container width puts it, and both rings, on whole pixels.
  test("keeps the focus ring visible beside an armed neighbour, which paints after it", async () => {
    const { container, palette } = await mountBoard({ width: 1023 });
    const lasso = entryOf(palette, "lasso-tool");
    const draw = entryOf(palette, "draw-tool");
    draw.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(lasso);
    expect(lasso.matches(":focus-visible")).toBe(true);
    expect(draw.getAttribute("aria-pressed")).toBe("true");
    const hoverFill = resolved(container, "background-color", "var(--cd-ui-hover)");
    await vi.waitFor(() => expect(getComputedStyle(draw).backgroundColor).toBe(hoverFill));

    const lassoBox = boxIn(lasso, palette);
    const ring = await pixelOf(palette, lassoBox.right + 3, lassoBox.top + lassoBox.height / 2);
    expect(ring).toEqual(rgbOf(resolved(container, "color", "var(--cd-ui-fokus)")));
  });

  test("widens the focus ring to 3px in high contrast, on the page and on the board's own carrier", async () => {
    const { container, palette, before } = await mountBoard();
    before.focus();
    await userEvent.tab();
    const lasso = entryOf(palette, "lasso-tool");
    expect(document.activeElement).toBe(lasso);
    expect(lasso.matches(":focus-visible")).toBe(true);
    expect([getComputedStyle(lasso).outlineStyle, getComputedStyle(lasso).outlineWidth]).toEqual([
      "solid",
      "2px",
    ]);

    document.documentElement.setAttribute("data-cd-kontrast", "hoch");
    expect(getComputedStyle(lasso).outlineWidth).toBe("3px");
    document.documentElement.removeAttribute("data-cd-kontrast");
    container.setAttribute("data-cd-theme", "light");
    container.setAttribute("data-cd-kontrast", "hoch");
    expect(getComputedStyle(lasso).outlineWidth).toBe("3px");
  });

  test("keeps the 2px ring in a carrier in normal contrast on a high-contrast page", async () => {
    const { container, palette, before } = await mountBoard();
    document.documentElement.setAttribute("data-cd-kontrast", "hoch");
    container.setAttribute("data-cd-theme", "light");
    before.focus();
    await userEvent.tab();

    expect(getComputedStyle(entryOf(palette, "lasso-tool")).outlineWidth).toBe("2px");
  });
});

describe("the palette without the shell: tooltip (guide §5.6)", () => {
  function shownTooltip(container: HTMLElement): HTMLElement | null {
    return container.querySelector<HTMLElement>(".djs-hover-tooltip");
  }

  function shownName(container: HTMLElement): string | null | undefined {
    return shownTooltip(container)?.querySelector(".djs-palette-tooltip-label")?.textContent;
  }

  /** The keyboard focus on the palette's first entry, then `keys`, from a fresh board. */
  async function focusFromTheKeyboard(board: Board, keys = ""): Promise<HTMLElement> {
    board.before.focus();
    await userEvent.tab();
    if (keys) await userEvent.keyboard(keys);
    const tooltip = shownTooltip(board.container);
    if (!tooltip) throw new Error("No tooltip on keyboard focus.");
    return tooltip;
  }

  test("shows at once on keyboard focus, follows the arrow keys and is a role=tooltip", async () => {
    const board = await mountBoard();
    const { container } = board;
    const tooltip = await focusFromTheKeyboard(board);

    expect(shownName(container)).toBe("Lasso");
    expect(tooltip.getAttribute("role")).toBe("tooltip");
    await userEvent.keyboard("{ArrowRight}");
    expect(shownName(container)).toBe("Draw");
    expect(container.querySelectorAll(".djs-hover-tooltip")).toHaveLength(1);

    canvasSvg(container).focus();
    expect(shownTooltip(container)).toBeNull();
  });

  test("hides on Escape and on a press, and stays hidden while the pointer rests on the entry", async () => {
    const board = await mountBoard();
    const { container, palette } = board;
    await focusFromTheKeyboard(board);
    expect(shownName(container)).toBe("Lasso");
    await userEvent.keyboard("{Escape}");
    expect(shownTooltip(container)).toBeNull();
    expect(document.activeElement).toBe(entryOf(palette, "lasso-tool"));

    const command = entryOf(palette, "create.command");
    await userEvent.hover(command);
    await vi.waitFor(() => expect(shownName(container)).toBe("Command"));
    await userEvent.click(command);
    expect(shownTooltip(container)).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(shownTooltip(container)).toBeNull();
  });

  test("waits 300ms on hover, then shows a neighbour's at once", async () => {
    const { container, palette } = await mountBoard();
    await userEvent.hover(canvasSvg(container), { position: { x: 500, y: 500 } });
    await userEvent.hover(entryOf(palette, "create.event"));
    expect(shownTooltip(container)).toBeNull();
    await vi.waitFor(() => expect(shownName(container)).toBe("Domain event"));

    await userEvent.hover(entryOf(palette, "create.command"));
    expect(shownName(container)).toBe("Command");
  });

  // A tap brings the touch's pointerover and then the mouse events a browser fires for
  // compatibility, so a tooltip shown on mouseover would show for a tap.
  test("shows none for touch", async () => {
    const { container, palette } = await mountBoard();
    const entry = entryOf(palette, "create.event");
    entry.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "touch" }));
    entry.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    entry.dispatchEvent(new MouseEvent("mouseenter"));
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(shownTooltip(container)).toBeNull();
  });

  test("describes no entry whose name and aria-keyshortcuts say what it shows", async () => {
    const board = await mountBoard();
    await focusFromTheKeyboard(board);

    expect(shownName(board.container)).toBe("Lasso");
    expect(entryOf(board.palette, "lasso-tool").hasAttribute("aria-describedby")).toBe(false);
  });

  // In a container 430px wide the palette (425px at the level "design") reaches within 3px of its
  // sides, so a tooltip centred on an outer entry would come closer than 12px or pass them.
  test.for([
    { side: "left", keys: "", name: "Lasso" },
    { side: "right", keys: "{End}", name: "Note" },
  ])(
    "keeps 12px from the container's $side side, shifted off the centre of its entry",
    async ({ side, keys, name }) => {
      const board = await mountBoard({ width: 430 });
      const tooltip = await focusFromTheKeyboard(board, keys);
      expect(shownName(board.container)).toBe(name);
      const tooltipBox = boxIn(tooltip, board.container);
      const entryBox = boxIn(document.activeElement!, board.container);
      const centred = entryBox.left + entryBox.width / 2;

      if (side === "left") {
        expect(centred - tooltipBox.width / 2).toBeLessThan(12);
        expect(tooltipBox.left).toBeCloseTo(12, 0);
      } else {
        expect(centred + tooltipBox.width / 2).toBeGreaterThan(430 - 12);
        expect(tooltipBox.right).toBeCloseTo(430 - 12, 0);
      }
      expect(tooltipBox.top).toBeCloseTo(boxIn(board.palette, board.container).bottom + 8, 0);
    },
  );

  test("is at most the container less 12px on either side wide, and wraps its name", async () => {
    const board = await mountBoard({ width: 120 });
    const tooltip = await focusFromTheKeyboard(board, "{End}{ArrowLeft}{ArrowLeft}");
    expect(shownName(board.container)).toBe("External system");
    const tooltipBox = boxIn(tooltip, board.container);

    expect(tooltipBox.width).toBeLessThanOrEqual(120 - 24);
    expect(tooltipBox.left).toBeGreaterThanOrEqual(12 - 0.5);
    expect(tooltipBox.right).toBeLessThanOrEqual(120 - 12 + 0.5);
    expect(tooltipBox.height).toBeGreaterThan(28);
    expect(getComputedStyle(tooltip).maxWidth).toBe("min(280px, 100% - 24px)");
  });

  test("throws nothing later when the modeler is destroyed while its tooltip waits to show", async () => {
    const { modeler, palette } = await mountBoard();
    const errors: unknown[] = [];
    const collect = (event: ErrorEvent) => errors.push(event.error);
    window.addEventListener("error", collect);
    try {
      await userEvent.hover(entryOf(palette, "create.event"));
      const { container: wrapper } = mounted.pop()!;
      modeler.destroy();
      wrapper.remove();
      await new Promise((resolve) => setTimeout(resolve, 400));
    } finally {
      window.removeEventListener("error", collect);
    }
    expect(errors).toEqual([]);
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
  test("keeps none of the renderer's layout, keys or toolbar attributes", async () => {
    const { modeler, container, palette } = await mountBoard({
      additionalModules: [chromeModule({ asShell })],
    });
    expect(palette.getAttribute("data-chrome")).toBe("palette");

    const style = getComputedStyle(palette);
    expect([style.top, style.width, style.zIndex]).toEqual(["20px", "48px", "auto"]);
    expect(palette.querySelector(".djs-palette-entries")!.hasAttribute("role")).toBe(false);
    for (const entry of paletteEntries(palette)) {
      expect(entry.hasAttribute("tabindex")).toBe(false);
      expect(entry.hasAttribute("aria-pressed")).toBe(false);
      expect(entry.hasAttribute("aria-keyshortcuts")).toBe(false);
    }
    expect(
      palette.compareDocumentPosition(canvasSvg(container)) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();

    const draw = entryOf(palette, "draw-tool");
    await userEvent.hover(draw);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const tooltip = container.querySelector<HTMLElement>(".djs-hover-tooltip");
    if (asShell) {
      expect(tooltip).toBeNull();
    } else {
      expect(tooltip?.classList.contains("djs-hover-tooltip--right")).toBe(true);
      const drawBox = draw.getBoundingClientRect();
      const tooltipBox = tooltip!.getBoundingClientRect();
      expect(tooltipBox.left).toBeCloseTo(drawBox.right + 8, 0);
      expect(tooltipBox.top + tooltipBox.height / 2).toBeCloseTo(
        drawBox.top + drawBox.height / 2,
        0,
      );
    }
    await userEvent.unhover(draw);

    const event = entryOf(palette, "create.event");
    event.tabIndex = 0;
    event.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(event);
    await userEvent.keyboard("{Enter}");
    expect(stickies(modeler)).toEqual([]);
  });

  test("leaves the marks of the read-only lock to the chrome", async () => {
    const { modeler, palette } = await mountBoard({
      additionalModules: [chromeModule({ asShell })],
    });
    modeler.get<EventStormingReadOnly>("eventStormingReadOnly").setReadOnly(true);
    await modeler.importDSL("title Palette\nevent Remote [200, 300]");

    expect(paletteEntries(palette).filter((entry) => entry.hasAttribute("aria-disabled"))).toEqual(
      [],
    );
  });

  // The chrome sends a click without a press (`detail` 0) for Enter or Space on an entry.
  test("puts the armed lasso down on the second click the chrome sends for Enter or Space, and on Escape", async () => {
    const { modeler, palette, before } = await mountBoard({
      additionalModules: [chromeModule({ asShell })],
    });
    const toolManager = modeler.get<ToolManager>("toolManager");
    const dragging = modeler.get<Dragging>("dragging");
    const state = () => [toolManager.isActive("lasso"), dragging.context()?.prefix ?? null];
    const keyboardClick = () =>
      entryOf(palette, "lasso-tool").dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );

    keyboardClick();
    expect(state()).toEqual([true, "lasso.selection"]);
    keyboardClick();
    expect(state()).toEqual([false, null]);

    keyboardClick();
    expect(state()).toEqual([true, "lasso.selection"]);
    before.focus();
    await userEvent.keyboard("{Escape}");
    expect(state()).toEqual([false, null]);
  });

  test("puts the armed lasso down when the chrome's click without a press arms the draw tool", async () => {
    const { modeler, palette } = await mountBoard({
      additionalModules: [chromeModule({ asShell })],
    });
    const toolManager = modeler.get<ToolManager>("toolManager");
    const dragging = modeler.get<Dragging>("dragging");
    const drawTool = modeler.get<EventStormingDrawTool>("eventStormingDrawTool");
    const keyboardClick = (action: string) =>
      entryOf(palette, action).dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );

    keyboardClick("lasso-tool");
    keyboardClick("draw-tool");
    expect([
      toolManager.isActive("lasso"),
      dragging.context() ?? null,
      drawTool.isActive(),
    ]).toEqual([false, null, true]);
  });
});
