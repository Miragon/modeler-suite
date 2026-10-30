/// <reference types="@vitest/browser-playwright" />
import { afterEach, expect, test, vi } from "vitest";
import { cdp } from "vitest/browser";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { Modeler } from "@miragon/context-maps-renderer";
import { emptyDocument } from "@miragon/context-maps-schema-model";

/**
 * The renderer's palette rules lay out this modeler's palette and no other on the page, and so do
 * its context pad and popup menu rules; the palette follows forced colours and reduced motion.
 */

const mounted: { modeler: Modeler; container: HTMLElement }[] = [];

afterEach(async () => {
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  for (const { modeler, container } of mounted.splice(0)) {
    modeler.destroy();
    container.remove();
  }
});

function mountMap(): { modeler: Modeler; container: HTMLElement } {
  const container = document.createElement("div");
  container.style.cssText = "width: 900px; height: 640px;";
  document.body.append(container);
  const modeler = new Modeler({ container });
  mounted.push({ modeler, container });
  const doc = emptyDocument("Palette");
  doc.contexts = [
    { id: "a", label: "A", position: { x: 100, y: 200 }, size: { width: 200, height: 110 } },
  ];
  modeler.importDocument(doc);
  return { modeler, container };
}

/** A system colour as the browser computes it under the media emulated now. */
function systemColour(name: string): string {
  const probe = document.createElement("span");
  probe.style.color = name;
  document.body.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

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

test("lets a host's own shadow on the palette, the context pad and the popup menu win, also in high contrast", () => {
  const host = document.createElement("div");
  host.className = "overlay-host";
  const container = document.createElement("div");
  container.style.cssText = "width: 900px; height: 640px;";
  host.append(container);
  document.body.append(host);
  const modeler = new Modeler({ container });
  mounted.push({ modeler, container: host });
  const doc = emptyDocument("Palette");
  doc.contexts = [
    { id: "a", label: "A", position: { x: 100, y: 200 }, size: { width: 200, height: 110 } },
  ];
  modeler.importDocument(doc);
  modeler
    .get<Selection>("selection")
    .select(modeler.get<ElementRegistry>("elementRegistry").get("a")!);
  container
    .querySelector('.djs-context-pad.open [data-action="subdomain-type"]')!
    .dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
  const overlays = {
    palette: container.querySelector(".djs-palette")!,
    "context pad": container.querySelector(".djs-context-pad.open")!,
    "popup menu": container.querySelector(".djs-popup")!,
  };
  const hostShadow = document.createElement("span");
  hostShadow.style.boxShadow = "var(--cd-shadow-3)";
  container.append(hostShadow);

  // Each one step more specific than the renderer's own rule for that overlay.
  const hostSheet = document.createElement("style");
  hostSheet.textContent =
    '.overlay-host .djs-palette:not([data-chrome="palette"]), .overlay-host .djs-context-pad.open, ' +
    ".overlay-host .djs-popup { box-shadow: var(--cd-shadow-3); }";
  document.head.prepend(hostSheet);
  const page = document.documentElement;
  try {
    const shadows = (): Record<string, string> =>
      Object.fromEntries(
        Object.entries(overlays).map(([overlay, element]) => [
          overlay,
          getComputedStyle(element).boxShadow,
        ]),
      );
    const theHostsShadow = Object.fromEntries(
      Object.keys(overlays).map((overlay) => [overlay, getComputedStyle(hostShadow).boxShadow]),
    );
    expect(shadows()).toEqual(theHostsShadow);
    page.setAttribute("data-cd-theme", "light");
    page.setAttribute("data-cd-kontrast", "hoch");
    expect(shadows()).toEqual(theHostsShadow);
  } finally {
    hostSheet.remove();
    page.removeAttribute("data-cd-theme");
    page.removeAttribute("data-cd-kontrast");
    modeler.get<PopupMenu>("popupMenu").close();
  }
});

test("leaves another diagram-js context pad and popup menu on the same page as diagram-js lays them out (#398)", () => {
  const { modeler, container } = mountMap();
  const context = modeler.get<ElementRegistry>("elementRegistry").get("a")!;
  modeler.get<Selection>("selection").select(context);
  const ownPad = container.querySelector<HTMLElement>(".djs-context-pad.open")!;
  expect(getComputedStyle(ownPad).flexDirection).toBe("column");
  ownPad
    .querySelector('[data-action="subdomain-type"]')!
    .dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
  const ownPopup = getComputedStyle(container.querySelector(".djs-popup")!);
  expect([ownPopup.animationName, ownPopup.borderTopLeftRadius]).toEqual(["cm-popup-in", "12px"]);
  const ownPopupShadow = ownPopup.boxShadow;
  modeler.get<PopupMenu>("popupMenu").close();

  const other = document.createElement("div");
  other.style.cssText = "position: relative; width: 600px; height: 400px;";
  other.innerHTML =
    '<div class="djs-container"><div class="djs-context-pad open"><div class="group">' +
    '<div class="entry"></div></div></div><div class="djs-popup">' +
    '<div class="djs-popup-results"></div></div></div>';
  document.body.append(other);
  try {
    const pad = getComputedStyle(other.querySelector(".djs-context-pad")!);
    expect([pad.display, pad.width, pad.paddingTop, pad.borderTopWidth, pad.boxShadow]).toEqual([
      "block",
      "72px",
      "0px",
      "0px",
      "none",
    ]);
    expect(getComputedStyle(other.querySelector(".djs-context-pad .group")!).display).toBe("block");
    const popup = getComputedStyle(other.querySelector(".djs-popup")!);
    expect([popup.animationName, popup.borderTopLeftRadius]).toEqual(["none", "0px"]);
    expect(popup.boxShadow).not.toBe(ownPopupShadow);
    expect(getComputedStyle(other.querySelector(".djs-popup-results")!).padding).toBe(
      "0px 9px 0px 0px",
    );
  } finally {
    other.remove();
  }
});

test("keeps the island's edge, the separator and the armed tool's ring in system colours under forced colours (guide §5.14)", async () => {
  const { container } = mountMap();
  const palette = container.querySelector<HTMLElement>(".djs-palette")!;
  const lasso = palette.querySelector<HTMLElement>('[data-action="lasso-tool"]')!;
  const box = lasso.getBoundingClientRect();
  lasso.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      button: 0,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    }),
  );
  expect(lasso.classList.contains("highlighted-entry")).toBe(true);

  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "forced-colors", value: "active" }],
  });
  const separator = getComputedStyle(palette.querySelector(".group + .group")!, "::before");
  const armed = getComputedStyle(lasso);
  // The entry's colour transitions run from the look before the switch.
  await vi.waitFor(() =>
    expect({
      edge: getComputedStyle(palette).borderTopColor,
      separator: separator.backgroundColor,
      "armed fill": armed.backgroundColor,
      "armed icon": armed.color,
      "armed ring": armed.boxShadow,
    }).toEqual({
      edge: systemColour("CanvasText"),
      separator: systemColour("CanvasText"),
      "armed fill": systemColour("Canvas"),
      "armed icon": systemColour("CanvasText"),
      "armed ring": `${systemColour("Highlight")} 0px 0px 0px 2px inset`,
    }),
  );
});

test("moves nothing under reduced motion: the entries keep no transition (guide §5.14, §7)", async () => {
  const { container } = mountMap();
  const entries = [...container.querySelectorAll<HTMLElement>(".djs-palette .entry")];
  expect(entries.length).toBeGreaterThan(1);
  expect(getComputedStyle(entries[0]!).transitionDuration).toBe("0.15s, 0.15s, 0.15s");

  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  for (const entry of entries) {
    const style = getComputedStyle(entry);
    expect([style.transitionProperty, style.transitionDuration]).toEqual(["none", "0s"]);
  }
});
