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
