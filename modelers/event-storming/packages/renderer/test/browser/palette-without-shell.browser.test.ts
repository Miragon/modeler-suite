/// <reference types="@vitest/browser-playwright" />
import { afterEach, describe, expect, test, vi } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { Modeler } from "../../src/index.js";
import "../../src/assets/event-storming.css";

/** The renderer's palette and tooltip rules lay out this modeler's palette and no other on the page. */

const mounted: { modeler: Modeler; container: HTMLElement }[] = [];

afterEach(async () => {
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  for (const { modeler, container } of mounted.splice(0)) {
    modeler.destroy();
    container.remove();
  }
});

/** A board without the shell, its palette at the top centre of a container 1024px wide. */
async function mountBoard(height = 768): Promise<{ container: HTMLElement; palette: HTMLElement }> {
  const container = document.createElement("div");
  document.body.append(container);
  const modeler = new Modeler({ container, width: 1024, height, fitOnImport: false });
  mounted.push({ modeler, container });
  await modeler.importDSL("title Palette");
  return { container, palette: container.querySelector<HTMLElement>(".djs-palette")! };
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
    expect([tooltip.padding, tooltip.transform]).toEqual(["6px 10px", "none"]);
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
      const { container, palette } = await mountBoard(height);
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
    await vi.waitFor(() => expect(lasso.classList.contains("highlighted-entry")).toBe(true));
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
