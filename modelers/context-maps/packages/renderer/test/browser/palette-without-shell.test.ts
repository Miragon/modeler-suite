import { afterEach, expect, test } from "vitest";
import { Modeler } from "@miragon/context-maps-renderer";
import { emptyDocument } from "@miragon/context-maps-schema-model";

/** The renderer's palette rules lay out this modeler's palette and no other on the page. */

const mounted: { modeler: Modeler; container: HTMLElement }[] = [];

afterEach(() => {
  for (const { modeler, container } of mounted.splice(0)) {
    modeler.destroy();
    container.remove();
  }
});

test("leaves another diagram-js palette on the same page as diagram-js lays it out", () => {
  const container = document.createElement("div");
  container.style.cssText = "width: 900px; height: 640px;";
  document.body.append(container);
  const modeler = new Modeler({ container });
  mounted.push({ modeler, container });
  modeler.importDocument(emptyDocument("Palette"));
  const own = getComputedStyle(container.querySelector(".djs-palette")!);
  expect([own.top, own.zIndex]).toEqual(["12px", "110"]);

  const other = document.createElement("div");
  other.style.cssText = "position: relative; width: 600px; height: 400px;";
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
    expect(getComputedStyle(other.querySelector(".entry")!).width).toBe("46px");
  } finally {
    other.remove();
  }
});

test("lets a host's own rule on the palette win over the renderer's sheet that loads after it", () => {
  const host = document.createElement("div");
  host.className = "palette-host";
  const container = document.createElement("div");
  container.style.cssText = "width: 900px; height: 640px;";
  host.append(container);
  document.body.append(host);
  const modeler = new Modeler({ container });
  mounted.push({ modeler, container: host });
  modeler.importDocument(emptyDocument("Palette"));
  const palette = container.querySelector(".djs-palette")!;
  expect(getComputedStyle(palette).top).toBe("12px");

  const hostSheet = document.createElement("style");
  hostSheet.textContent = '.palette-host .djs-palette:not([data-chrome="palette"]) { top: 30px; }';
  document.head.prepend(hostSheet);
  try {
    expect(getComputedStyle(palette).top).toBe("30px");
  } finally {
    hostSheet.remove();
  }
});
