import { describe, expect, it } from "vitest";
import {
  INVALID_STATUS_DELAY_MS,
  PALETTE_CLEARANCE,
  TOOLTIP_DELAY_MS,
  decidePaletteRow,
  placeTooltip,
} from "./layout.js";
import type { Bounds, Size } from "./types.js";

describe("constants", () => {
  it("match guide §5.6, §5.12 and §5.15", () => {
    expect(PALETTE_CLEARANCE).toBe(16);
    expect(TOOLTIP_DELAY_MS).toBe(300);
    expect(INVALID_STATUS_DELAY_MS).toBe(800);
  });
});

describe("decidePaletteRow (guide §5.15)", () => {
  const MENU_RIGHT = 12 + 40;

  it("puts the palette in the second row up to 760px width", () => {
    expect(
      decidePaletteRow({ containerWidth: 760, paletteWidth: 100, menuRight: MENU_RIGHT }),
    ).toBe("second-row");
    expect(
      decidePaletteRow({ containerWidth: 420, paletteWidth: 100, menuRight: MENU_RIGHT }),
    ).toBe("second-row");
    expect(
      decidePaletteRow({ containerWidth: 761, paletteWidth: 100, menuRight: MENU_RIGHT }),
    ).toBe("top");
  });

  it("keeps at least 16px to the menu trigger", () => {
    // (1000 − 864) / 2 = 68 = 52 + 16
    expect(
      decidePaletteRow({ containerWidth: 1000, paletteWidth: 864, menuRight: MENU_RIGHT }),
    ).toBe("top");
    expect(
      decidePaletteRow({ containerWidth: 1000, paletteWidth: 865, menuRight: MENU_RIGHT }),
    ).toBe("second-row");
  });

  it("keeps at least 16px to the primary action", () => {
    // (1000 + 768) / 2 = 884 = 900 − 16
    const input = { containerWidth: 1000, menuRight: MENU_RIGHT, primaryLeft: 900 };
    expect(decidePaletteRow({ ...input, paletteWidth: 768 })).toBe("top");
    expect(decidePaletteRow({ ...input, paletteWidth: 769 })).toBe("second-row");
  });

  it("checks the side of the primary action only where there is one", () => {
    expect(
      decidePaletteRow({ containerWidth: 1000, paletteWidth: 800, menuRight: MENU_RIGHT }),
    ).toBe("top");
  });
});

describe("placeTooltip (guide §5.6)", () => {
  const container: Size = { width: 1280, height: 900 };
  const tooltip: Size = { width: 120, height: 28 };
  const topRowPalette: Bounds = { x: 500, y: 12, width: 280, height: 40 };
  const secondRowPalette: Bounds = { x: 24, y: 64, width: 360, height: 40 };
  const zoomPanel: Bounds = { x: 1280 - 12 - 173, y: 900 - 12 - 40, width: 173, height: 40 };
  const entry = (island: Bounds, offset: number): Bounds => ({
    x: island.x + offset,
    y: island.y + 4,
    width: 32,
    height: 32,
  });

  it("stands below the top row at top 60, centred on its entry", () => {
    const anchor = entry(topRowPalette, 100);
    expect(placeTooltip({ anchor, island: topRowPalette, tooltip, container })).toEqual({
      x: anchor.x + 16 - 60,
      y: 60,
    });
  });

  it("stands below the second row at top 112", () => {
    const anchor = entry(secondRowPalette, 200);
    expect(
      placeTooltip({
        anchor,
        island: secondRowPalette,
        tooltip,
        container: { width: 420, height: 700 },
      }).y,
    ).toBe(112);
  });

  it("stands above the bottom row, ending at bottom 60", () => {
    const anchor = entry(zoomPanel, 40);
    const position = placeTooltip({ anchor, island: zoomPanel, tooltip, container });
    expect(container.height - (position.y + tooltip.height)).toBe(60);
    expect(position.x).toBe(anchor.x + 16 - 60);
  });

  it("stands above a card in the lower half, 8px above it", () => {
    const legend: Bounds = { x: 12, y: 500, width: 220, height: 388 };
    const close = { x: 196, y: 508, width: 28, height: 28 };
    expect(placeTooltip({ anchor: close, island: legend, tooltip, container }).y).toBe(
      500 - 8 - 28,
    );
  });

  it("keeps 12px to the left edge", () => {
    const menu: Bounds = { x: 12, y: 12, width: 40, height: 40 };
    expect(placeTooltip({ anchor: menu, island: menu, tooltip, container })).toEqual({
      x: 12,
      y: 60,
    });
  });

  it("keeps 12px to the right edge", () => {
    const fit = entry(zoomPanel, 173 - 3 - 32);
    const position = placeTooltip({ anchor: fit, island: zoomPanel, tooltip, container });
    expect(position.x + tooltip.width).toBe(container.width - 12);
  });

  it("keeps the left edge when the tooltip is wider than the container allows", () => {
    const narrow = { width: 200, height: 700 };
    const island: Bounds = { x: 12, y: 12, width: 40, height: 40 };
    expect(
      placeTooltip({
        anchor: island,
        island,
        tooltip: { width: 190, height: 28 },
        container: narrow,
      }).x,
    ).toBe(12);
  });
});
