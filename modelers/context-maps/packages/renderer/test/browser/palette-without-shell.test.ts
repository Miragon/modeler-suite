/// <reference types="@vitest/browser-playwright" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Palette from "diagram-js/lib/features/palette/Palette";
import type {
  PaletteEntries,
  PaletteEntriesCallback,
} from "diagram-js/lib/features/palette/PaletteProvider";
import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type ToolManager from "diagram-js/lib/features/tool-manager/ToolManager";
import type { ModuleDeclaration } from "didi";
import {
  Modeler,
  READ_ONLY_CHANGED_EVENT,
  isCmContext,
  type CmContext,
  type CmReadOnly,
} from "@miragon/context-maps-renderer";
import { emptyDocument } from "@miragon/context-maps-schema-model";

/**
 * The renderer's palette rules lay out this modeler's palette and no other on the page, and so do
 * its context pad and popup menu rules; the palette follows forced colours and reduced motion. For a
 * host without the modeler shell it is the glass toolbar of guide §5.5 with its keys (#433, #436),
 * one row on a short canvas too (#511), the tooltip of guide §5.6 below it (#457), the lasso
 * pressed only while it is armed (#458, #462) and the marks of the read-only lock, at once or after
 * the delay a host gives it (guide §13.5, #463, #484).
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
/** Too narrow for the tooltips of the outer entries to stand centred on them. */
const NARROW_WIDTH = 180;

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

/** A host's provider that gives the lasso the key L. */
function lassoKeyModule(): ModuleDeclaration {
  function lassoKey(palette: Palette): void {
    palette.registerProvider({
      getPaletteEntries: (): PaletteEntriesCallback => (entries: PaletteEntries) => ({
        ...entries,
        "lasso-tool": { ...entries["lasso-tool"]!, shortcut: "l" },
      }),
    });
  }
  lassoKey.$inject = ["palette"];
  return { __init__: [lassoKey] };
}

const LONG_TITLE = "Generic subdomain: bought, licensed or reused off the shelf without any change";

/** A host's provider that gives the generic subdomain a title too long for one line. */
function longTitleModule(): ModuleDeclaration {
  function longTitle(palette: Palette): void {
    palette.registerProvider({
      getPaletteEntries: (): PaletteEntriesCallback => (entries: PaletteEntries) => ({
        ...entries,
        "context.generic": { ...entries["context.generic"]!, title: LONG_TITLE },
      }),
    });
  }
  longTitle.$inject = ["palette"];
  return { __init__: [longTitle] };
}

/** A host's provider with an entry of its own, which counts its clicks. */
function hostEntryModule(clicks: { count: number }): ModuleDeclaration {
  function hostEntry(palette: Palette): void {
    palette.registerProvider({
      getPaletteEntries: (): PaletteEntries => ({
        "host.note": {
          group: "host",
          title: "Note",
          html: '<div class="entry"></div>',
          action: { click: () => void clicks.count++ },
        },
      }),
    });
  }
  hostEntry.$inject = ["palette"];
  return { __init__: [hostEntry] };
}

/** A host's hand tool beside the lasso, armed the way diagram-js's `HandTool.activateHand` arms it. */
function handToolModule(): ModuleDeclaration {
  function handEntry(palette: Palette, toolManager: ToolManager, dragging: Dragging): void {
    toolManager.registerTool("hand", { tool: "hand" });
    palette.registerProvider({
      getPaletteEntries: (): PaletteEntries => ({
        "hand-tool": {
          group: "tools",
          title: "Hand",
          html: '<div class="entry"></div>',
          action: {
            click: (event: Event) =>
              dragging.init(event as MouseEvent, "hand", {
                trapClick: false,
                data: { context: {} },
              }),
          },
        },
      }),
    });
  }
  handEntry.$inject = ["palette", "toolManager", "dragging"];
  return { __init__: [handEntry] };
}

function lockCanvas(modeler: Modeler, locked: boolean): void {
  modeler.get<CmReadOnly>("cmReadOnly").setReadOnly(locked);
}

function disabled(modeler: Modeler): Record<string, string | null> {
  return Object.fromEntries(
    entriesOf(modeler).map((entry) => [
      entry.getAttribute("data-action"),
      entry.getAttribute("aria-disabled"),
    ]),
  );
}

/** The lasso entry's pressed state and highlight, and the drag that holds the tool armed. */
function lassoState(modeler: Modeler): [string | null, boolean, boolean, string | null] {
  const lasso = entryOf(modeler, "lasso-tool");
  return [
    lasso.getAttribute("aria-pressed"),
    lasso.classList.contains("highlighted-entry"),
    modeler.get<ToolManager>("toolManager").isActive("lasso") === true,
    modeler.get<Dragging>("dragging").context()?.prefix ?? null,
  ];
}

const LASSO_ARMED: ReturnType<typeof lassoState> = ["true", true, true, "lasso.selection"];
const LASSO_DOWN: ReturnType<typeof lassoState> = ["false", false, false, null];

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

describe("the palette without the shell: a short canvas (guide §5.5, #511)", () => {
  /** Lower than the 4 × 46px + 50px diagram-js's vertical palette needs for the four entries. */
  const SHORT_HEIGHT = 220;

  function mountShortMap(): Modeler {
    const host = document.createElement("div");
    host.className = "palette-host";
    const container = document.createElement("div");
    container.style.cssText = `width: 900px; height: ${SHORT_HEIGHT}px;`;
    host.append(container);
    document.body.append(host);
    const modeler = new Modeler({ container });
    mounted.push({ modeler, container: host });
    modeler.importDocument(emptyDocument("Short"));
    return modeler;
  }

  test("holds every entry inside the island where diagram-js collapses the palette into two columns", () => {
    const modeler = mountShortMap();
    const palette = paletteOf(modeler);
    expect(palette.classList.contains("two-column")).toBe(true);

    const island = palette.getBoundingClientRect();
    const outside = entriesOf(modeler)
      .filter((entry) => {
        const box = entry.getBoundingClientRect();
        return (
          box.left < island.left ||
          box.right > island.right ||
          box.top < island.top ||
          box.bottom > island.bottom
        );
      })
      .map((entry) => entry.dataset.action);
    expect(outside).toEqual([]);
    expect(island.height).toBe(40);
  });

  test("lets a host's own width on the collapsed palette win over the renderer's sheet", () => {
    const palette = paletteOf(mountShortMap());
    const hostSheet = document.createElement("style");
    hostSheet.textContent =
      '.palette-host .djs-palette:not([data-chrome="palette"]).two-column.open { width: 300px; }';
    document.head.prepend(hostSheet);
    try {
      expect(getComputedStyle(palette).width).toBe("300px");
    } finally {
      hostSheet.remove();
    }
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

    const withKey = mountToolbar([lassoKeyModule()]);
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

  test("puts the armed lasso down on a second Space or Enter and on Escape, so it is pressed only while armed (#462)", async () => {
    const lasso = entryOf(modeler, "lasso-tool");
    lasso.focus();

    await userEvent.keyboard(" ");
    expect(lassoState(modeler)).toEqual(LASSO_ARMED);
    await userEvent.keyboard(" ");
    expect(lassoState(modeler)).toEqual(LASSO_DOWN);
    expect(document.activeElement).toBe(lasso);

    await userEvent.keyboard("{Enter}");
    expect(lassoState(modeler)).toEqual(LASSO_ARMED);
    await userEvent.keyboard("{Escape}");
    expect(lassoState(modeler)).toEqual(LASSO_DOWN);

    await userEvent.keyboard("{Enter}");
    expect(lassoState(modeler)).toEqual(LASSO_ARMED);
  });

  test("puts the lasso armed by Space down once Escape on the canvas cancels it before the pointer moves (#458)", async () => {
    entryOf(modeler, "lasso-tool").focus();
    await userEvent.keyboard(" ");
    expect(lassoState(modeler)).toEqual(LASSO_ARMED);

    canvasSvg(modeler).focus();
    await userEvent.keyboard("{Escape}");
    expect(lassoState(modeler)).toEqual(LASSO_DOWN);
  });

  test("puts the lasso armed by a click down once Escape cancels it before the pointer moves (#458)", async () => {
    await userEvent.click(entryOf(modeler, "lasso-tool"));
    expect(lassoState(modeler)).toEqual(LASSO_ARMED);
    expect(document.activeElement).toBe(canvasSvg(modeler));

    await userEvent.keyboard("{Escape}");
    expect(lassoState(modeler)).toEqual(LASSO_DOWN);

    await userEvent.click(entryOf(modeler, "lasso-tool"));
    expect(lassoState(modeler)).toEqual(LASSO_ARMED);
  });

  test("switches from the armed lasso to a host's hand tool and back, one tool pressed at a time (#458)", async () => {
    const withHand = mountToolbar([handToolModule()]);
    const toolManager = withHand.get<ToolManager>("toolManager");
    const pressedTools = () =>
      Object.entries(pressed(withHand))
        .filter(([, state]) => state === "true")
        .map(([action]) => action);

    entryOf(withHand, "lasso-tool").focus();
    await userEvent.keyboard(" ");
    expect(pressedTools()).toEqual(["lasso-tool"]);

    await userEvent.keyboard("{ArrowRight} ");
    expect(document.activeElement).toBe(entryOf(withHand, "hand-tool"));
    expect(pressedTools()).toEqual(["hand-tool"]);
    expect(toolManager.isActive("hand")).toBe(true);
    expect(withHand.get<Dragging>("dragging").context()?.prefix).toBe("hand");

    await userEvent.keyboard("{ArrowLeft} ");
    expect(pressedTools()).toEqual(["lasso-tool"]);
    expect(toolManager.isActive("lasso")).toBe(true);
    expect(withHand.get<Dragging>("dragging").context()?.prefix).toBe("lasso.selection");
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

describe("the palette without the shell: tooltip (guide §5.6, #457)", () => {
  let modeler: Modeler;

  beforeEach(async () => {
    // A pointer resting on an entry from an earlier case would show its tooltip at once.
    await userEvent.hover(document.body, { position: { x: 1, y: 1 } });
    modeler = mountToolbar();
  });

  function shownTooltip(within: Modeler = modeler): HTMLElement | null {
    return within.container.querySelector<HTMLElement>(".djs-hover-tooltip");
  }

  function shownName(within: Modeler = modeler): string | null | undefined {
    return shownTooltip(within)?.querySelector(".djs-palette-tooltip-label")?.textContent;
  }

  async function hover(
    action: string,
    within: Modeler = modeler,
  ): Promise<{ entry: HTMLElement; tooltip: HTMLElement }> {
    const entry = entryOf(within, action);
    await userEvent.hover(entry);
    const tooltip = await vi.waitFor(() => {
      const shown = shownTooltip(within);
      if (!shown) throw new Error("No tooltip yet.");
      return shown;
    });
    return { entry, tooltip };
  }

  test("stands 8px below the palette, centred on its entry, with the entry's name", async () => {
    const { entry, tooltip } = await hover("context.supporting");
    const paletteBox = boxIn(paletteOf(modeler), modeler.container);
    const entryBox = boxIn(entry, modeler.container);
    const tooltipBox = boxIn(tooltip, modeler.container);

    expect(tooltipBox.top).toBeCloseTo(paletteBox.bottom + 8, 0);
    expect(tooltipBox.left + tooltipBox.width / 2).toBeCloseTo(
      entryBox.left + entryBox.width / 2,
      0,
    );
    expect(shownName()).toBe("Supporting subdomain");
    expect(tooltip.querySelector("kbd")).toBeNull();
    expect(tooltipBox.height).toBe(28);
  });

  test("is the opaque surface of guide §5.6, with a key as a Geist Mono chip", async () => {
    const withKey = mountToolbar([lassoKeyModule()]);
    const { tooltip } = await hover("lasso-tool", withKey);
    const style = getComputedStyle(tooltip);
    const container = withKey.container;

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
    const chip = tooltip.querySelector("kbd")!;
    expect(chip.textContent).toBe("l");
    expect(getComputedStyle(chip).fontFamily).toMatch(/^"Geist Mono Variable"/);
    expect(getComputedStyle(chip).color).toBe(
      resolved(container, "color", "var(--cd-ui-text-leise)"),
    );
    expect(boxIn(tooltip, container).height).toBe(28);
  });

  test("keeps 12px from the container's left and right sides, shifted off its entry's centre", async () => {
    const wrapper = modeler.container.parentElement!;
    wrapper.style.width = `${NARROW_WIDTH}px`;
    modeler.get<Canvas>("canvas").resized();

    const lasso = await hover("lasso-tool");
    const lassoBox = boxIn(lasso.tooltip, modeler.container);
    expect(lassoBox.left).toBeCloseTo(12, 0);
    expect(lassoBox.left + lassoBox.width / 2).toBeGreaterThan(
      boxIn(lasso.entry, modeler.container).left + lasso.entry.offsetWidth / 2,
    );

    const generic = await hover("context.generic");
    const genericBox = boxIn(generic.tooltip, modeler.container);
    expect(shownName()).toBe("Generic subdomain");
    expect(genericBox.right).toBeCloseTo(NARROW_WIDTH - 12, 0);
    expect(genericBox.width).toBeLessThanOrEqual(NARROW_WIDTH - 24);
  });

  test("is at most min(280px, 100% - 24px) wide with its padding and edge, and keeps 12px from both sides when its title wraps", async () => {
    const withLongTitle = mountToolbar([longTitleModule()]);
    const wide = await hover("context.generic", withLongTitle);
    expect(shownName(withLongTitle)).toBe(LONG_TITLE);
    expect(boxIn(wide.tooltip, withLongTitle.container).width).toBeCloseTo(280, 0);
    await userEvent.unhover(wide.entry);
    await vi.waitFor(() => expect(shownTooltip(withLongTitle)).toBeNull());

    withLongTitle.container.parentElement!.style.width = `${NARROW_WIDTH}px`;
    withLongTitle.get<Canvas>("canvas").resized();
    const narrow = await hover("context.generic", withLongTitle);
    const narrowBox = boxIn(narrow.tooltip, withLongTitle.container);
    expect(narrowBox.width).toBeCloseTo(NARROW_WIDTH - 24, 0);
    expect(narrowBox.left).toBeCloseTo(12, 0);
    expect(narrowBox.right).toBeCloseTo(NARROW_WIDTH - 12, 0);
  });

  test("cannot be selected, as no label of the chrome can (guide §5.14)", async () => {
    hostButton(modeler).focus();
    await userEvent.tab();
    const style = getComputedStyle(shownTooltip()!);

    expect(shownName()).toBe("Lasso");
    expect([style.userSelect, style.webkitUserSelect]).toEqual(["none", "none"]);
  });

  test("throws nothing later when the modeler is destroyed while its tooltip waits to show", async () => {
    const errors: unknown[] = [];
    const collect = (event: ErrorEvent) => errors.push(event.error);
    window.addEventListener("error", collect);
    try {
      await userEvent.hover(entryOf(modeler, "context.core"));
      const { container } = mounted.pop()!;
      modeler.destroy();
      container.remove();
      await new Promise((resolve) => setTimeout(resolve, 400));
    } finally {
      window.removeEventListener("error", collect);
    }
    expect(errors).toEqual([]);
  });

  test("shows at once on keyboard focus, follows the arrow keys and is a role=tooltip", async () => {
    hostButton(modeler).focus();
    await userEvent.tab();

    expect(shownName()).toBe("Lasso");
    expect(shownTooltip()!.getAttribute("role")).toBe("tooltip");
    await userEvent.keyboard("{ArrowRight}");
    expect(shownName()).toBe("Core domain");
    expect(modeler.container.querySelectorAll(".djs-hover-tooltip")).toHaveLength(1);

    canvasSvg(modeler).focus();
    expect(shownTooltip()).toBeNull();
  });

  test("hides on Escape and on a press, and stays hidden while the pointer rests on the entry", async () => {
    hostButton(modeler).focus();
    await userEvent.tab();
    expect(shownName()).toBe("Lasso");
    await userEvent.keyboard("{Escape}");
    expect(shownTooltip()).toBeNull();
    expect(document.activeElement).toBe(entryOf(modeler, "lasso-tool"));

    const { entry } = await hover("context.core");
    await userEvent.click(entry);
    expect(shownTooltip()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(shownTooltip()).toBeNull();
  });

  test("waits 300ms on hover, then shows a neighbour's at once", async () => {
    await userEvent.hover(canvasSvg(modeler), { position: { x: 500, y: 500 } });
    await userEvent.hover(entryOf(modeler, "context.core"));
    expect(shownTooltip()).toBeNull();
    await vi.waitFor(() => expect(shownName()).toBe("Core domain"));

    await userEvent.hover(entryOf(modeler, "context.supporting"));
    expect(shownName()).toBe("Supporting subdomain");
  });

  test("shows none for touch", async () => {
    const entry = entryOf(modeler, "context.core");
    entry.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "touch" }));
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(shownTooltip()).toBeNull();
  });

  test("describes no entry whose name says what it shows", async () => {
    hostButton(modeler).focus();
    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}");

    expect(shownName()).toBe("Core domain");
    for (const entry of entriesOf(modeler)) {
      expect(entry.hasAttribute("aria-describedby"), entry.dataset.action).toBe(false);
    }
  });
});

describe("the palette without the shell: read-only lock (guide §13.5, #463)", () => {
  let modeler: Modeler;

  beforeEach(() => {
    modeler = mountToolbar([handToolModule()]);
  });

  const UNLOCKED = {
    "lasso-tool": null,
    "hand-tool": null,
    "context.core": null,
    "context.supporting": null,
    "context.generic": null,
  };
  const LOCKED = {
    ...UNLOCKED,
    "context.core": "true",
    "context.supporting": "true",
    "context.generic": "true",
  };

  test("marks every entry but Lasso and Hand aria-disabled, also after a rebuild, and no more once it ends", () => {
    expect(disabled(modeler)).toEqual(UNLOCKED);

    lockCanvas(modeler, true);
    expect(disabled(modeler)).toEqual(LOCKED);

    const before = entryOf(modeler, "context.core");
    modeler.get<Palette>("palette").registerProvider({ getPaletteEntries: () => ({}) });
    expect(entryOf(modeler, "context.core")).not.toBe(before);
    expect(disabled(modeler)).toEqual(LOCKED);

    lockCanvas(modeler, false);
    expect(disabled(modeler)).toEqual(UNLOCKED);
  });

  test("keeps a disabled entry in the roving tab order, where it shows its tooltip and Enter creates nothing", async () => {
    lockCanvas(modeler, true);
    entryOf(modeler, "hand-tool").focus();
    await userEvent.keyboard("{ArrowRight}");

    const core = entryOf(modeler, "context.core");
    expect(document.activeElement).toBe(core);
    expect(core.tabIndex).toBe(0);
    expect(
      modeler.container.querySelector(".djs-hover-tooltip .djs-palette-tooltip-label")?.textContent,
    ).toBe("Core domain");
    await userEvent.keyboard("{Enter}");
    expect(contexts(modeler)).toEqual([]);
  });

  test("lets a pointer's click or drag on a disabled entry, a host's included, do nothing, while Lasso and Hand still arm", async () => {
    const clicks = { count: 0 };
    const withHostEntry = mountToolbar([handToolModule(), hostEntryModule(clicks)]);
    const dragging = withHostEntry.get<Dragging>("dragging");
    const createPreview = () => [
      dragging.context()?.prefix ?? null,
      withHostEntry.container.querySelectorAll(".djs-drag-group").length,
    ];
    lockCanvas(withHostEntry, true);
    expect(disabled(withHostEntry)["host.note"]).toBe("true");

    await userEvent.click(entryOf(withHostEntry, "context.core"), { force: true });
    await userEvent.hover(canvasSvg(withHostEntry), { position: { x: 500, y: 500 } });
    expect(createPreview()).toEqual([null, 0]);
    expect(document.activeElement).not.toBe(canvasSvg(withHostEntry));

    const dragstart = new DragEvent("dragstart", { bubbles: true, cancelable: true });
    entryOf(withHostEntry, "context.supporting").dispatchEvent(dragstart);
    expect(dragstart.defaultPrevented).toBe(true);
    expect(createPreview()).toEqual([null, 0]);

    await userEvent.click(entryOf(withHostEntry, "host.note"), { force: true });
    expect(clicks.count).toBe(0);
    expect(contexts(withHostEntry)).toEqual([]);

    await userEvent.click(entryOf(withHostEntry, "hand-tool"));
    expect(dragging.context()?.prefix).toBe("hand");
    await userEvent.click(entryOf(withHostEntry, "lasso-tool"));
    expect(lassoState(withHostEntry)).toEqual(LASSO_ARMED);

    lockCanvas(withHostEntry, false);
    await userEvent.click(entryOf(withHostEntry, "host.note"));
    expect(clicks.count).toBe(1);
  });

  test("draws a disabled entry's icon in --cd-ui-text-leise and its preview grey, never by opacity, without hover", async () => {
    const core = () => entryOf(modeler, "context.core");
    const look = (entry: HTMLElement) => {
      const style = getComputedStyle(entry);
      const preview = getComputedStyle(entry.firstElementChild!);
      return {
        colour: style.color,
        fill: style.backgroundColor,
        cursor: style.cursor,
        opacity: [style.opacity, preview.opacity],
        filter: preview.filter,
      };
    };
    const text = resolved(modeler.container, "color", "var(--cd-ui-text)");
    const quiet = resolved(modeler.container, "color", "var(--cd-ui-text-leise)");
    const transparent = "rgba(0, 0, 0, 0)";
    expect(look(core())).toEqual({
      colour: text,
      fill: transparent,
      cursor: "default",
      opacity: ["1", "1"],
      filter: "none",
    });

    lockCanvas(modeler, true);
    const lockedLook = {
      colour: quiet,
      fill: transparent,
      cursor: "not-allowed",
      opacity: ["1", "1"],
      filter: "grayscale(1)",
    };
    await vi.waitFor(() => expect(look(core())).toEqual(lockedLook));
    await userEvent.hover(core());
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(look(core())).toEqual(lockedLook);

    expect(look(entryOf(modeler, "lasso-tool"))).toMatchObject({ colour: text, filter: "none" });
  });

  test("draws a disabled entry in GrayText under forced colours, also under the pointer (guide §5.14)", async () => {
    lockCanvas(modeler, true);
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "forced-colors", value: "active" }],
    });
    const colour = (action: string) => getComputedStyle(entryOf(modeler, action)).color;

    await vi.waitFor(() => expect(colour("context.supporting")).toBe(systemColour("GrayText")));
    await userEvent.hover(entryOf(modeler, "context.core"));
    await vi.waitFor(() => expect(colour("context.core")).toBe(systemColour("GrayText")));
  });

  test("leaves a host entry's own aria-disabled in place once the lock ends", () => {
    function hostEntry(palette: Palette): void {
      palette.registerProvider({
        getPaletteEntries: (): PaletteEntries => ({
          "host.waiting": {
            group: "host",
            title: "Waiting",
            html: '<div class="entry" aria-disabled="true"></div>',
            action: { click: () => undefined },
          },
        }),
      });
    }
    hostEntry.$inject = ["palette"];
    const withHostEntry = mountToolbar([{ __init__: [hostEntry] }]);

    lockCanvas(withHostEntry, true);
    lockCanvas(withHostEntry, false);
    expect(disabled(withHostEntry)["host.waiting"]).toBe("true");
    expect(disabled(withHostEntry)["context.core"]).toBeNull();
  });

  test("shows the marks after the delay a host gives, while the lock refuses from the start, and takes them off at once (#484)", () => {
    const clicks = { count: 0 };
    const withHostEntry = mountToolbar([handToolModule(), hostEntryModule(clicks)]);
    const readOnly = withHostEntry.get<CmReadOnly>("cmReadOnly");
    const dragging = withHostEntry.get<Dragging>("dragging");
    const announced: { readOnly: boolean; shown: boolean }[] = [];
    withHostEntry.on<{ readOnly: boolean; shown: boolean }>(READ_ONLY_CHANGED_EVENT, (event) => {
      announced.push({ readOnly: event.readOnly, shown: event.shown });
    });
    const unlocked = { ...UNLOCKED, "host.note": null };
    const locked = { ...LOCKED, "host.note": "true" };
    const enterOn = (action: string) =>
      entryOf(withHostEntry, action).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      readOnly.setReadOnly(true, { delayMs: 800 });
      vi.advanceTimersByTime(400);
      readOnly.setReadOnly(true, { delayMs: 800 });
      vi.advanceTimersByTime(399);
      expect([readOnly.isReadOnly(), readOnly.isReadOnlyShown(), disabled(withHostEntry)]).toEqual([
        true,
        false,
        unlocked,
      ]);
      enterOn("context.core");
      enterOn("host.note");
      expect([contexts(withHostEntry), clicks.count, dragging.context()?.prefix ?? null]).toEqual([
        [],
        0,
        null,
      ]);

      vi.advanceTimersByTime(1);
      expect([readOnly.isReadOnlyShown(), disabled(withHostEntry)]).toEqual([true, locked]);
      readOnly.setReadOnly(false);
      expect([readOnly.isReadOnlyShown(), disabled(withHostEntry)]).toEqual([false, unlocked]);
      expect(announced).toEqual([
        { readOnly: true, shown: false },
        { readOnly: true, shown: true },
        { readOnly: false, shown: false },
      ]);

      readOnly.setReadOnly(true, { delayMs: 800 });
      readOnly.setReadOnly(false);
      vi.advanceTimersByTime(800);
      expect([readOnly.isReadOnly(), readOnly.isReadOnlyShown(), disabled(withHostEntry)]).toEqual([
        false,
        false,
        unlocked,
      ]);
      enterOn("host.note");
      expect(clicks.count).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("keeps the marks of a lock without a delay when a later call gives one (#484)", () => {
    const readOnly = modeler.get<CmReadOnly>("cmReadOnly");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      readOnly.setReadOnly(true);
      readOnly.setReadOnly(true, { delayMs: 800 });
      expect([readOnly.isReadOnlyShown(), disabled(modeler)]).toEqual([true, LOCKED]);
      vi.advanceTimersByTime(800);
      expect([readOnly.isReadOnlyShown(), disabled(modeler)]).toEqual([true, LOCKED]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("shows no marks once the map is destroyed during the delay (#484)", () => {
    const readOnly = modeler.get<CmReadOnly>("cmReadOnly");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      readOnly.setReadOnly(true, { delayMs: 800 });
      modeler.destroy();
      vi.advanceTimersByTime(800);
      expect([readOnly.isReadOnly(), readOnly.isReadOnlyShown()]).toEqual([true, false]);
    } finally {
      vi.useRealTimers();
    }
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

  test(`${asShell ? "shows no tooltip of the renderer" : "shows the tooltip right of its entry, where diagram-js puts it"} (#457)`, async () => {
    const modeler = mountToolbar([chromeModule({ asShell })]);
    const core = entryOf(modeler, "context.core");
    await userEvent.hover(core);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const tooltip = modeler.container.querySelector<HTMLElement>(".djs-hover-tooltip");
    if (asShell) {
      expect(tooltip).toBeNull();
    } else {
      expect(tooltip?.classList.contains("djs-hover-tooltip--right")).toBe(true);
      const coreBox = core.getBoundingClientRect();
      const tooltipBox = tooltip!.getBoundingClientRect();
      expect(tooltipBox.left).toBeCloseTo(coreBox.right + 8, 0);
      expect(tooltipBox.top + tooltipBox.height / 2).toBeCloseTo(
        coreBox.top + coreBox.height / 2,
        0,
      );
    }
    await userEvent.unhover(core);
  });

  test("puts the armed lasso down on the second click the chrome sends for Enter or Space, and on Escape (#458, #462)", () => {
    const modeler = mountToolbar([chromeModule({ asShell })]);
    const toolManager = modeler.get<ToolManager>("toolManager");
    const dragging = modeler.get<Dragging>("dragging");
    const state = () => [
      toolManager.isActive("lasso") === true,
      dragging.context()?.prefix ?? null,
    ];
    const keyboardClick = () =>
      entryOf(modeler, "lasso-tool").dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );

    keyboardClick();
    expect(state()).toEqual([true, "lasso.selection"]);
    keyboardClick();
    expect(state()).toEqual([false, null]);

    keyboardClick();
    expect(state()).toEqual([true, "lasso.selection"]);
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
    expect(state()).toEqual([false, null]);
    expect(entryOf(modeler, "lasso-tool").classList.contains("highlighted-entry")).toBe(false);
  });

  test("leaves the read-only marks to the chrome (#463)", () => {
    const modeler = mountToolbar([chromeModule({ asShell })]);
    lockCanvas(modeler, true);

    for (const entry of entriesOf(modeler)) {
      expect(entry.hasAttribute("aria-disabled"), entry.dataset.action).toBe(false);
    }
  });
});
