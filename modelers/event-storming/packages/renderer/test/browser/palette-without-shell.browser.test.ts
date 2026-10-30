import { afterEach, expect, test } from "vitest";
import { Modeler } from "../../src/index.js";
import "../../src/assets/event-storming.css";

/** The renderer's palette and tooltip rules lay out this modeler's palette and no other on the page. */

const mounted: { modeler: Modeler; container: HTMLElement }[] = [];

afterEach(() => {
  for (const { modeler, container } of mounted.splice(0)) {
    modeler.destroy();
    container.remove();
  }
});

test("leaves another diagram-js palette and its tooltip on the same page as diagram-js lays them out", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const modeler = new Modeler({ container, width: 1024, height: 768, fitOnImport: false });
  mounted.push({ modeler, container });
  await modeler.importDSL("title Palette");
  const own = getComputedStyle(container.querySelector(".djs-palette")!);
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
