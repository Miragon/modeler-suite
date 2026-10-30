/// <reference types="@vitest/browser-playwright" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Palette from "diagram-js/lib/features/palette/Palette";
import type {
  PaletteEntries,
  PaletteEntriesCallback,
} from "diagram-js/lib/features/palette/PaletteProvider";
import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { ModuleDeclaration } from "didi";
import { Modeler, isCmContext, type CmContext } from "@miragon/context-maps-renderer";
import { emptyDocument } from "@miragon/context-maps-schema-model";

/**
 * The renderer's palette rules lay out this modeler's palette and no other on the page, and so do
 * its context pad and popup menu rules; the palette follows forced colours and reduced motion. For a
 * host without the modeler shell it is the glass toolbar of guide §5.5 with its keys (#433, #436).
 */

const mounted: { modeler: Modeler; container: HTMLElement }[] = [];

afterEach(async () => {
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  document.documentElement.removeAttribute("data-cd-kontrast");
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

const TOOLBAR_SIZE = { width: 1024, height: 768 };
const FREE_AREA_CENTRE = { x: 400, y: 300 };
const ENTRY_ACTIONS = ["lasso-tool", "context.core", "context.supporting", "context.generic"];

/** A map after a focusable host control, as a page that embeds the renderer has one. */
function mountToolbar(additionalModules: ModuleDeclaration[] = []): Modeler {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `position:absolute;left:0;top:0;width:${TOOLBAR_SIZE.width}px;height:${TOOLBAR_SIZE.height}px`;
  const before = document.createElement("button");
  before.textContent = "Before the map";
  const container = document.createElement("div");
  wrapper.append(before, container);
  document.body.append(wrapper);
  const modeler = new Modeler({
    container,
    freeArea: { center: () => FREE_AREA_CENTRE },
    additionalModules,
  });
  mounted.push({ modeler, container: wrapper });
  modeler.importDocument(emptyDocument("Toolbar"));
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

function entriesOf(modeler: Modeler): HTMLElement[] {
  return [...paletteOf(modeler).querySelectorAll<HTMLElement>(".djs-palette-entries .entry")];
}

function canvasSvg(modeler: Modeler): SVGSVGElement {
  return modeler.get<Canvas>("canvas").getContainer().querySelector<SVGSVGElement>(":scope > svg")!;
}

function hostButton(modeler: Modeler): HTMLButtonElement {
  return modeler.container.parentElement!.querySelector("button")!;
}

function contexts(modeler: Modeler): CmContext[] {
  return modeler.get<ElementRegistry>("elementRegistry").filter(isCmContext) as CmContext[];
}

function pressed(modeler: Modeler): Record<string, string | null> {
  return Object.fromEntries(
    entriesOf(modeler).map((entry) => [
      entry.getAttribute("data-action"),
      entry.getAttribute("aria-pressed"),
    ]),
  );
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

function boxIn(element: Element, origin: Element): DOMRect {
  const box = element.getBoundingClientRect();
  const originBox = origin.getBoundingClientRect();
  return new DOMRect(box.left - originBox.left, box.top - originBox.top, box.width, box.height);
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

describe("the palette without the shell: glass (guide §5.5, §6, #436)", () => {
  let modeler: Modeler;

  beforeEach(() => {
    modeler = mountToolbar();
  });

  test("is the raised surface at the chrome's opacity with an 8px blur behind it", () => {
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
  });

  test("is opaque in high contrast", () => {
    modeler.container.setAttribute("data-cd-theme", "light");
    modeler.container.setAttribute("data-cd-kontrast", "hoch");

    expect(getComputedStyle(paletteOf(modeler)).backgroundColor).toBe(
      opaqueSurface(modeler.container),
    );
  });
});

describe("the palette without the shell: toolbar (guide §5.5, §5.14, #433)", () => {
  let modeler: Modeler;

  beforeEach(() => {
    modeler = mountToolbar();
  });

  test("is a toolbar named Tools, ahead of the canvas in the document and the tab order", async () => {
    const toolbar = paletteOf(modeler).querySelector(".djs-palette-entries")!;
    expect(toolbar.getAttribute("role")).toBe("toolbar");
    expect(toolbar.getAttribute("aria-label")).toBe("Tools");
    expect(
      paletteOf(modeler).compareDocumentPosition(canvasSvg(modeler)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(entriesOf(modeler).map((entry) => entry.getAttribute("role"))).toEqual(
      Array(ENTRY_ACTIONS.length).fill("button"),
    );

    hostButton(modeler).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(entryOf(modeler, "lasso-tool"));
    await userEvent.tab();
    expect(document.activeElement).toBe(canvasSvg(modeler));
  });

  test("has one tab stop that roves with ← → Home End and stays where the focus left it", async () => {
    const tabStops = () =>
      entriesOf(modeler)
        .filter((entry) => entry.tabIndex === 0)
        .map((entry) => entry.getAttribute("data-action"));
    expect(tabStops()).toEqual(["lasso-tool"]);
    expect(entriesOf(modeler).filter((entry) => entry.tabIndex === -1)).toHaveLength(
      ENTRY_ACTIONS.length - 1,
    );

    entryOf(modeler, "lasso-tool").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(entryOf(modeler, "context.core"));
    expect(tabStops()).toEqual(["context.core"]);

    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(entryOf(modeler, "context.generic"));
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(entryOf(modeler, "lasso-tool"));
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(entryOf(modeler, "context.generic"));
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(entryOf(modeler, "lasso-tool"));
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(tabStops()).toEqual(["context.supporting"]);

    canvasSvg(modeler).focus();
    expect(tabStops()).toEqual(["context.supporting"]);
  });

  test("names an entry's key for assistive technology where it has one, and none where it has none", () => {
    for (const action of ENTRY_ACTIONS) {
      expect(entryOf(modeler, action).hasAttribute("aria-keyshortcuts"), action).toBe(false);
    }

    function lassoKey(palette: Palette): void {
      palette.registerProvider({
        getPaletteEntries: (): PaletteEntriesCallback => (entries: PaletteEntries) => ({
          ...entries,
          "lasso-tool": { ...entries["lasso-tool"]!, shortcut: "l" },
        }),
      });
    }
    lassoKey.$inject = ["palette"];
    const withKey = mountToolbar([{ __init__: [lassoKey] }]);
    expect(entryOf(withKey, "lasso-tool").getAttribute("aria-keyshortcuts")).toBe("L");
  });

  test("presses the armed tool only, and none once the press on the canvas has taken it", async () => {
    expect(pressed(modeler)).toEqual({
      "lasso-tool": "false",
      "context.core": null,
      "context.supporting": null,
      "context.generic": null,
    });

    entryOf(modeler, "lasso-tool").focus();
    await userEvent.keyboard(" ");
    expect(pressed(modeler)["lasso-tool"]).toBe("true");
    expect(document.activeElement).toBe(entryOf(modeler, "lasso-tool"));

    await userEvent.click(canvasSvg(modeler), { position: { x: 500, y: 500 } });
    expect(pressed(modeler)["lasso-tool"]).toBe("false");
  });

  test("creates a context in the free area on Enter, selected and with its name editor open", async () => {
    entryOf(modeler, "context.core").focus();
    await userEvent.keyboard("{Enter}");

    const [created] = contexts(modeler);
    expect(contexts(modeler)).toHaveLength(1);
    expect([created!.x + created!.width / 2, created!.y + created!.height / 2]).toEqual([
      FREE_AREA_CENTRE.x,
      FREE_AREA_CENTRE.y,
    ]);
    expect(modeler.get<Selection>("selection").get()).toEqual([created]);
    expect(modeler.container.querySelector(".djs-direct-editing-parent")).not.toBeNull();
  });

  test("leaves Enter with a modifier and a held key's repeats alone", () => {
    const core = entryOf(modeler, "context.core");
    core.focus();
    for (const init of [{ shiftKey: true }, { ctrlKey: true }, { repeat: true }]) {
      core.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init }),
      );
    }
    expect(contexts(modeler)).toEqual([]);
  });

  test("hands the focus to the canvas after a press on the island's padding", async () => {
    entryOf(modeler, "lasso-tool").focus();
    await userEvent.click(paletteOf(modeler), { position: { x: 2, y: 20 } });

    expect(document.activeElement).toBe(canvasSvg(modeler));
  });

  test("shows the keyboard focus as a 2px --cd-ui-fokus ring 2px outside the entry", async () => {
    hostButton(modeler).focus();
    await userEvent.tab();
    const lasso = entryOf(modeler, "lasso-tool");
    const style = getComputedStyle(lasso);

    expect(lasso.matches(":focus-visible")).toBe(true);
    expect([style.outlineStyle, style.outlineWidth, style.outlineOffset]).toEqual([
      "solid",
      "2px",
      "2px",
    ]);
    expect(style.outlineColor).toBe(resolved(modeler.container, "color", "var(--cd-ui-fokus)"));
  });

  test("keeps the focus ring visible beside a hovered neighbour, which paints after it", async () => {
    entryOf(modeler, "context.core").focus();
    await userEvent.keyboard("{ArrowRight}{ArrowLeft}");
    const core = entryOf(modeler, "context.core");
    const supporting = entryOf(modeler, "context.supporting");
    expect(document.activeElement).toBe(core);
    expect(core.matches(":focus-visible")).toBe(true);
    await userEvent.hover(supporting);
    const hoverFill = resolved(modeler.container, "background-color", "var(--cd-ui-hover)");
    await vi.waitFor(() => expect(getComputedStyle(supporting).backgroundColor).toBe(hoverFill));

    const palette = paletteOf(modeler);
    const coreBox = boxIn(core, palette);
    const ring = await pixelOf(palette, coreBox.right + 3, coreBox.top + coreBox.height / 2);
    expect(ring).toEqual(rgbOf(resolved(modeler.container, "color", "var(--cd-ui-fokus)")));
  });

  test("widens the focus ring to 3px in high contrast", async () => {
    modeler.container.setAttribute("data-cd-theme", "light");
    modeler.container.setAttribute("data-cd-kontrast", "hoch");
    hostButton(modeler).focus();
    await userEvent.tab();
    const lasso = entryOf(modeler, "lasso-tool");
    const style = getComputedStyle(lasso);

    expect(lasso.matches(":focus-visible")).toBe(true);
    expect([style.outlineStyle, style.outlineWidth, style.outlineOffset]).toEqual([
      "solid",
      "3px",
      "2px",
    ]);
  });

  test("keeps the 2px ring inside a carrier in normal contrast on a high-contrast page (guide §13.3)", async () => {
    document.documentElement.setAttribute("data-cd-kontrast", "hoch");
    modeler.container.parentElement!.setAttribute("data-cd-theme", "light");
    hostButton(modeler).focus();
    await userEvent.tab();
    const style = getComputedStyle(entryOf(modeler, "lasso-tool"));

    expect([style.outlineStyle, style.outlineWidth]).toEqual(["solid", "2px"]);
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
    ...(options.asShell ? { modelerShell: ["value", { chrome: true }] } : {}),
  };
}

describe.each([
  { name: "the shell", asShell: true },
  { name: "another chrome", asShell: false },
])("a palette $name skins (data-chrome)", ({ asShell }) => {
  test("keeps none of the renderer's keys or toolbar attributes, and its place after the canvas", async () => {
    const modeler = mountToolbar([chromeModule({ asShell })]);
    const palette = paletteOf(modeler);
    expect(palette.getAttribute("data-chrome")).toBe("palette");

    expect(palette.querySelector(".djs-palette-entries")!.hasAttribute("role")).toBe(false);
    for (const entry of entriesOf(modeler)) {
      expect(entry.hasAttribute("tabindex")).toBe(false);
      expect(entry.hasAttribute("aria-pressed")).toBe(false);
      expect(entry.hasAttribute("aria-keyshortcuts")).toBe(false);
    }
    expect(
      palette.compareDocumentPosition(canvasSvg(modeler)) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();

    const core = entryOf(modeler, "context.core");
    core.tabIndex = 0;
    core.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(core);
    await userEvent.keyboard("{Enter}");
    expect(contexts(modeler)).toEqual([]);
  });
});
