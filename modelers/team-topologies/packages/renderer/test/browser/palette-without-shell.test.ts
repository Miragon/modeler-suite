/// <reference types="@vitest/browser-playwright" />
import { afterEach, describe, expect, test, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Palette from "diagram-js/lib/features/palette/Palette";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type ToolManager from "diagram-js/lib/features/tool-manager/ToolManager";
import type { PaletteEntries } from "diagram-js/lib/features/palette/PaletteProvider";
import type { ModuleDeclaration } from "didi";
import { Modeler, type TtReadOnly } from "@miragon/team-topologies-renderer";
import { emptyDocument } from "@miragon/team-topologies-schema-model";

/**
 * The renderer's own palette, for a host that mounts it without the modeler shell (guide §5.5,
 * §5.14), and its rules' reach: they lay out this modeler's palette and no other on the page.
 */

const HOST = { width: 1024, height: 768 };

interface Mounted {
  host: HTMLDivElement;
  container: HTMLDivElement;
  modeler: Modeler;
}

const mounted: Mounted[] = [];
const cleanups: Array<() => void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const { modeler, host } of mounted.splice(0)) {
    // Off the palette first: diagram-js's tooltip would otherwise show on the destroyed diagram.
    await userEvent.hover(host, {
      position: { x: host.offsetWidth - 8, y: host.offsetHeight - 8 },
    });
    modeler.destroy();
    host.remove();
  }
});

function mount(width = HOST.width, additionalModules: ModuleDeclaration[] = []): Mounted {
  const host = document.createElement("div");
  host.style.cssText = `position: fixed; left: 0; top: 0; width: ${width}px; height: ${HOST.height}px;`;
  const container = document.createElement("div");
  host.append(container);
  document.body.append(host);
  const modeler = new Modeler({ container, additionalModules });
  modeler.importDocument(emptyDocument("Palette"));
  const result = { host, container, modeler };
  mounted.push(result);
  return result;
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

function paletteOf(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>(".djs-palette")!;
}

function entries(container: HTMLElement): HTMLElement[] {
  return [...paletteOf(container).querySelectorAll<HTMLElement>(".djs-palette-entries .entry")];
}

function actions(container: HTMLElement): string[] {
  return entries(container).map((entry) => entry.getAttribute("data-action")!);
}

function canvasSvg(modeler: Modeler): SVGSVGElement {
  return modeler.get<Canvas>("canvas").getContainer().querySelector<SVGSVGElement>(":scope > svg")!;
}

/** A control of the page in front of the modeler, where Tab starts. */
function buttonBefore(host: HTMLElement): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "Before the modeler";
  host.before(button);
  cleanups.push(() => button.remove());
  return button;
}

function entryOf(container: HTMLElement, action: string): HTMLElement {
  const entry = container.querySelector<HTMLElement>(`.djs-palette [data-action="${action}"]`);
  if (!entry) throw new Error(`no palette entry ${action}`);
  return entry;
}

/** Focuses `entry` as the keyboard would, so that its focus ring shows. */
async function focusFromKeyboard(entry: HTMLElement): Promise<void> {
  entry.tabIndex = 0;
  entry.focus();
  await userEvent.keyboard("{Shift}");
  expect(entry.matches(":focus-visible")).toBe(true);
}

/** Arms the lasso tool with a click on its entry, which the toolbar then presses. */
async function armLasso(container: HTMLElement): Promise<HTMLElement> {
  const lasso = entryOf(container, "lasso-tool");
  await userEvent.click(lasso);
  expect(lasso.getAttribute("aria-pressed")).toBe("true");
  return lasso;
}

/**
 * Has diagram-js build the entries again, as a host's late provider does. diagram-js then marks the
 * armed tool in the entries it found first, which are gone.
 */
function rebuildEntries(modeler: Modeler): void {
  modeler.get<Palette>("palette").registerProvider({ getPaletteEntries: () => ({}) });
}

/** The entry's look once its transitions have ended. */
async function settledStyle(entry: HTMLElement): Promise<CSSStyleDeclaration> {
  await Promise.all(entry.getAnimations().map((animation) => animation.finished));
  return getComputedStyle(entry);
}

function highContrast(container: HTMLElement): void {
  container.setAttribute("data-cd-theme", "light");
  container.setAttribute("data-cd-kontrast", "hoch");
}

test("keeps the focus ring visible beside a hovered neighbour, which paints after it", async () => {
  await page.viewport(HOST.width, HOST.height);
  const { host, container } = mount();
  const [focused, neighbour] = [
    ...container.querySelectorAll<HTMLElement>(
      '.djs-palette .group[data-group="tt-1-teams"] .entry',
    ),
  ];
  expect(boxIn(neighbour!, host).left - boxIn(focused!, host).right).toBe(2);

  await userEvent.hover(neighbour!);
  const hoverFill = resolved(container, "background-color", "var(--cd-ui-hover)");
  await vi.waitFor(() => expect(getComputedStyle(neighbour!).backgroundColor).toBe(hoverFill));
  focused!.tabIndex = 0;
  focused!.focus();
  await userEvent.keyboard("{Shift}");
  expect(focused!.matches(":focus-visible")).toBe(true);
  expect(getComputedStyle(focused!).outlineOffset).toBe("2px");

  const box = boxIn(focused!, host);
  const ring = await pixelOf(host, box.right + 3, box.top + box.height / 2);
  expect(ring).toEqual(rgbOf(resolved(container, "color", "var(--cd-ui-fokus)")));
});

test("drops the shadows of the palette and its tooltip and widens the focus ring to 3px in high contrast", async () => {
  const { container } = mount();
  highContrast(container);
  const entry = entryOf(container, "team.platform");
  await focusFromKeyboard(entry);

  expect(getComputedStyle(container.querySelector(".djs-palette")!).boxShadow).toBe("none");
  const style = getComputedStyle(entry);
  expect([style.outlineStyle, style.outlineWidth, style.outlineOffset]).toEqual([
    "solid",
    "3px",
    "2px",
  ]);

  await userEvent.hover(entry);
  const tooltip = await vi.waitFor(() => {
    const shown = container.querySelector<HTMLElement>(".djs-hover-tooltip");
    if (!shown) throw new Error("No tooltip yet.");
    return shown;
  });
  expect(getComputedStyle(tooltip).boxShadow).toBe("none");
});

test.each([
  { name: "as built", rebuilt: false },
  { name: "after a rebuild of the entries", rebuilt: true },
])(
  "puts the focus ring inside the entry in a narrow container, 1px inside the armed tool's ring, $name",
  async ({ rebuilt }) => {
    const { container, modeler } = mount(600);
    await armLasso(container);
    if (rebuilt) rebuildEntries(modeler);
    const lasso = entryOf(container, "lasso-tool");
    const team = entryOf(container, "team.platform");

    await focusFromKeyboard(team);
    expect(getComputedStyle(team).outlineOffset).toBe("-2px");
    await focusFromKeyboard(lasso);
    expect(getComputedStyle(lasso).outlineOffset).toBe("-5px");

    highContrast(container);
    const armed = getComputedStyle(lasso);
    expect([armed.outlineWidth, armed.outlineOffset]).toEqual(["3px", "-6px"]);
    await focusFromKeyboard(team);
    const focused = getComputedStyle(team);
    expect([focused.outlineWidth, focused.outlineOffset]).toEqual(["3px", "-3px"]);
  },
);

test("keeps the island's edge, the separators, the focus and the armed tool's ring in forced colours", async () => {
  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "forced-colors", value: "active" }],
  });
  try {
    const { container, modeler } = mount();
    const lasso = await armLasso(container);
    const team = entryOf(container, "team.platform");
    await focusFromKeyboard(team);
    const canvasText = resolved(container, "color", "CanvasText");
    const highlight = resolved(container, "color", "Highlight");

    expect(getComputedStyle(container.querySelector(".djs-palette")!).borderTopColor).toBe(
      canvasText,
    );
    const separator = getComputedStyle(
      container.querySelector('.djs-palette .group[data-group="tt-1-teams"]')!,
      "::before",
    );
    expect([separator.width, separator.backgroundColor]).toEqual(["1px", canvasText]);
    expect(getComputedStyle(team).outlineColor).toBe(highlight);
    const armedLook = (style: CSSStyleDeclaration) => [
      style.boxShadow,
      style.backgroundColor,
      style.color,
    ];
    const ringed = [
      `${highlight} 0px 0px 0px 2px inset`,
      resolved(container, "background-color", "Canvas"),
      canvasText,
    ];
    expect(armedLook(await settledStyle(lasso))).toEqual(ringed);

    rebuildEntries(modeler);
    expect(armedLook(await settledStyle(entryOf(container, "lasso-tool")))).toEqual(ringed);
  } finally {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  }
});

test("leaves another diagram-js palette on the same page as diagram-js lays it out", () => {
  const { container } = mount();
  expect(getComputedStyle(container.querySelector(".djs-palette")!).top).toBe("12px");

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
  const { host, container } = mount(600);
  host.classList.add("palette-host");
  const palette = container.querySelector(".djs-palette")!;
  expect(getComputedStyle(palette).top).toBe("64px");

  // designIQ keeps the palette at the top of a narrow canvas, which has no host chrome above it.
  const hostSheet = document.createElement("style");
  hostSheet.textContent = '.palette-host .djs-palette:not([data-chrome="palette"]) { top: 12px; }';
  document.head.prepend(hostSheet);
  try {
    expect(getComputedStyle(palette).top).toBe("12px");
  } finally {
    hostSheet.remove();
  }
});

test("lets a host's own focus ring on the palette win in high contrast too", async () => {
  const hostSheet = document.createElement("style");
  hostSheet.textContent =
    '.palette-host .djs-palette:not([data-chrome="palette"]) .entry:focus-visible { outline-width: 4px; outline-offset: 1px; }';
  document.head.prepend(hostSheet);
  try {
    for (const width of [HOST.width, 600]) {
      const { host, container } = mount(width);
      host.classList.add("palette-host");
      const entry = entryOf(container, "team.platform");
      await focusFromKeyboard(entry);
      const ring = (): string[] => {
        const style = getComputedStyle(entry);
        return [style.outlineWidth, style.outlineOffset];
      };

      expect(ring()).toEqual(["4px", "1px"]);
      highContrast(container);
      expect(ring()).toEqual(["4px", "1px"]);
    }
  } finally {
    hostSheet.remove();
  }
});

describe("the island is glass (guide §5.3, §6)", () => {
  function glassIn(container: HTMLElement): string {
    return resolved(
      container,
      "background-color",
      "color-mix(in srgb, var(--cd-ui-flaeche-hoch) var(--cd-ui-chrome-deckkraft), transparent)",
    );
  }

  test("lets the canvas show through --cd-ui-flaeche-hoch at --cd-ui-chrome-deckkraft, under an 8px blur", () => {
    const { container } = mount();
    const palette = getComputedStyle(paletteOf(container));

    expect(palette.backgroundColor).toBe(glassIn(container));
    expect(palette.backgroundColor).not.toBe(opaqueSurface(container));
    expect(palette.backdropFilter).toBe("blur(8px)");
  });

  test("is opaque in high contrast, and glass again under a normal-contrast carrier on a high-contrast page", () => {
    const { host, container } = mount();
    highContrast(container);
    expect(getComputedStyle(paletteOf(container)).backgroundColor).toBe(opaqueSurface(container));

    container.removeAttribute("data-cd-theme");
    container.removeAttribute("data-cd-kontrast");
    const page = document.documentElement;
    page.setAttribute("data-cd-kontrast", "hoch");
    cleanups.push(() => page.removeAttribute("data-cd-kontrast"));
    expect(getComputedStyle(paletteOf(container)).backgroundColor).toBe(opaqueSurface(container));
    host.setAttribute("data-cd-theme", "light");
    expect(getComputedStyle(paletteOf(container)).backgroundColor).toBe(glassIn(container));
    expect(glassIn(container)).not.toBe(opaqueSurface(container));
  });
});

describe("the palette is a toolbar (guide §5.5, §5.14)", () => {
  test("named Tools, with button entries, ahead of the canvas in the document and the tab order", async () => {
    const { host, container, modeler } = mount();
    const toolbar = paletteOf(container).querySelector(".djs-palette-entries")!;
    expect(toolbar.getAttribute("role")).toBe("toolbar");
    expect(toolbar.getAttribute("aria-label")).toBe("Tools");
    expect(entries(container).every((entry) => entry.getAttribute("role") === "button")).toBe(true);
    expect(
      paletteOf(container).compareDocumentPosition(canvasSvg(modeler)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    buttonBefore(host).focus();
    await userEvent.tab();
    const lasso = entryOf(container, "lasso-tool");
    expect(document.activeElement).toBe(lasso);
    expect(lasso.matches(":focus-visible")).toBe(true);
    const ring = getComputedStyle(lasso);
    expect([ring.outlineStyle, ring.outlineWidth, ring.outlineOffset]).toEqual([
      "solid",
      "2px",
      "2px",
    ]);
    await userEvent.tab();
    expect(document.activeElement).toBe(canvasSvg(modeler));
  });

  test("has one tab stop that roves with ← → Home End and stays where the focus left it", async () => {
    const { container, modeler } = mount();
    const all = actions(container);
    const tabStops = () =>
      entries(container)
        .filter((entry) => entry.tabIndex === 0)
        .map((entry) => entry.getAttribute("data-action"));
    expect(tabStops()).toEqual(["lasso-tool"]);
    expect(entries(container).filter((entry) => entry.tabIndex === -1)).toHaveLength(
      all.length - 1,
    );

    entryOf(container, "lasso-tool").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(entryOf(container, all[1]!));
    expect(tabStops()).toEqual([all[1]]);

    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(entryOf(container, "annotation"));
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(entryOf(container, "lasso-tool"));
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(entryOf(container, "annotation"));
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(entryOf(container, "lasso-tool"));
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(tabStops()).toEqual([all[2]]);

    canvasSvg(modeler).focus();
    expect(tabStops()).toEqual([all[2]]);
  });

  test("presses the armed lasso only, and releases it once its drag on the canvas has selected", async () => {
    const { container, modeler } = mount();
    const pressed = () =>
      Object.fromEntries(
        entries(container).map((entry) => [
          entry.getAttribute("data-action"),
          entry.getAttribute("aria-pressed"),
        ]),
      );
    const released = Object.fromEntries(
      actions(container).map((action) => [action, action === "lasso-tool" ? "false" : null]),
    );
    expect(pressed()).toEqual(released);

    const lasso = entryOf(container, "lasso-tool");
    lasso.focus();
    await userEvent.keyboard(" ");
    expect(pressed()).toEqual({ ...released, "lasso-tool": "true" });
    expect(document.activeElement).toBe(lasso);

    const svg = canvasSvg(modeler);
    const box = svg.getBoundingClientRect();
    for (const [type, x] of [
      ["mousemove", 300],
      ["mousemove", 400],
      ["mouseup", 400],
    ] as const) {
      svg.dispatchEvent(
        new MouseEvent(type, { bubbles: true, clientX: box.left + x, clientY: box.top + 300 }),
      );
    }
    expect(pressed()).toEqual(released);
  });

  test("releases the armed lasso on a second Enter or Space and on Escape, so it is pressed only while armed", async () => {
    const { container, modeler } = mount();
    const dragging = modeler.get<Dragging>("dragging");
    const lasso = entryOf(container, "lasso-tool");
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

  // diagram-js keeps a tool active on a cancel that looks like a click on the palette, and until
  // the pointer moves, the armed lasso's drag still carries the click that armed it (#458).
  test.each([
    { by: "a pointer's click", arm: (lasso: HTMLElement) => userEvent.click(lasso) },
    {
      by: "Space, with the focus then on the canvas",
      arm: async (lasso: HTMLElement, modeler: Modeler) => {
        lasso.focus();
        await userEvent.keyboard(" ");
        canvasSvg(modeler).focus();
      },
    },
  ])(
    "puts the lasso armed by $by down on Escape before the pointer moves, pressed and highlighted no more",
    async ({ arm }) => {
      const { container, modeler } = mount();
      const toolManager = modeler.get<ToolManager>("toolManager");
      const dragging = modeler.get<Dragging>("dragging");
      const lasso = entryOf(container, "lasso-tool");
      const state = () => ({
        active: toolManager.isActive("lasso"),
        drag: dragging.context()?.prefix ?? null,
        pressed: lasso.getAttribute("aria-pressed"),
        highlighted: lasso.classList.contains("highlighted-entry"),
      });

      await arm(lasso, modeler);
      expect(state()).toEqual({
        active: true,
        drag: "lasso.selection",
        pressed: "true",
        highlighted: true,
      });
      await userEvent.keyboard("{Escape}");
      expect(state()).toEqual({ active: false, drag: null, pressed: "false", highlighted: false });
    },
  );

  test("rings the armed tool also once a host's provider has rebuilt the entries", async () => {
    const { host, container, modeler } = mount();
    const ring = `${resolved(container, "color", "var(--cd-ui-interaktion)")} 0px 0px 0px 2px inset`;
    const text = resolved(container, "color", "var(--cd-ui-text)");
    await armLasso(container);
    await userEvent.hover(host, {
      position: { x: host.offsetWidth - 8, y: host.offsetHeight - 8 },
    });
    const before = await settledStyle(entryOf(container, "lasso-tool"));
    expect([before.boxShadow, before.color]).toEqual([ring, text]);

    rebuildEntries(modeler);
    const lasso = entryOf(container, "lasso-tool");
    expect(lasso.classList.contains("highlighted-entry")).toBe(false);
    expect(lasso.getAttribute("aria-pressed")).toBe("true");
    const after = await settledStyle(lasso);
    expect([after.boxShadow, after.color]).toEqual([ring, text]);
    expect(after.backgroundColor).toBe(
      resolved(container, "background-color", "var(--cd-ui-hover)"),
    );
  });

  test("creates a team on Enter in the free area, once, selected and in its label editor", async () => {
    const { container, modeler } = mount();
    entryOf(container, "team.platform").focus();
    await userEvent.keyboard("{Enter}");

    const nodes = modeler.exportDocument().nodes;
    expect(nodes).toEqual([expect.objectContaining({ type: "platform" })]);
    expect(
      modeler
        .get<Selection>("selection")
        .get()
        .map((element) => element.id),
    ).toEqual([nodes[0]!.id]);
    expect(document.activeElement).toBe(container.querySelector("textarea.tt-label-editor"));
  });

  test("leaves Enter with a modifier and a held key's repeats alone", () => {
    const { container, modeler } = mount();
    const team = entryOf(container, "team.platform");
    team.focus();
    for (const init of [{ shiftKey: true }, { ctrlKey: true }, { repeat: true }]) {
      team.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init }),
      );
    }
    expect(modeler.exportDocument().nodes).toEqual([]);
  });

  test("hands the focus to the canvas after a press on the island's padding", async () => {
    const { container, modeler } = mount();
    entryOf(container, "lasso-tool").focus();
    await userEvent.click(paletteOf(container), { position: { x: 2, y: 20 } });

    expect(document.activeElement).toBe(canvasSvg(modeler));
  });

  test("names a single key of an entry for assistive technology, and its own entries none", () => {
    class HostPaletteProvider {
      static $inject = ["palette"];
      constructor(palette: Palette) {
        palette.registerProvider(this);
      }
      getPaletteEntries(): PaletteEntries {
        const entry = (title: string, shortcut: string) => ({
          group: "host",
          title,
          shortcut,
          action: { click: () => undefined },
        });
        return { "host.note": entry("Note", "n"), "host.export": entry("Export", "Ctrl+E") };
      }
    }
    const { container } = mount(HOST.width, [
      { __init__: ["hostPaletteProvider"], hostPaletteProvider: ["type", HostPaletteProvider] },
    ]);

    expect(
      Object.fromEntries(
        entries(container).map((entry) => [
          entry.getAttribute("data-action"),
          entry.getAttribute("aria-keyshortcuts"),
        ]),
      ),
    ).toEqual(
      Object.fromEntries(
        actions(container).map((action) => [action, action === "host.note" ? "N" : null]),
      ),
    );
  });
});

function shownTooltip(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(".djs-hover-tooltip");
}

function shownName(container: HTMLElement): string | null | undefined {
  return shownTooltip(container)?.querySelector(".djs-palette-tooltip-label")?.textContent;
}

function titleOf(modeler: Modeler, action: string): string | undefined {
  return modeler.get<Palette>("palette").getEntries()[action]?.title;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe("the palette's tooltip (guide §5.6)", () => {
  test("names the lasso Lasso, the guide's shared term, in its entry and its tooltip", async () => {
    const { host, container } = mount();
    expect(entryOf(container, "lasso-tool").getAttribute("aria-label")).toBe("Lasso");

    buttonBefore(host).focus();
    await userEvent.tab();
    expect(shownName(container)).toBe("Lasso");
  });

  test("shows at once on keyboard focus, follows the arrow keys and is a role=tooltip", async () => {
    const { host, container, modeler } = mount();
    buttonBefore(host).focus();
    await userEvent.tab();

    expect(shownName(container)).toBe("Lasso");
    expect(shownTooltip(container)?.getAttribute("role")).toBe("tooltip");
    await userEvent.keyboard("{ArrowRight}");
    expect(shownName(container)).toBe(titleOf(modeler, actions(container)[1]!));
    expect(container.querySelectorAll(".djs-hover-tooltip")).toHaveLength(1);

    canvasSvg(modeler).focus();
    expect(shownTooltip(container)).toBeNull();
  });

  test("hides on Escape and on a press, and stays hidden while the pointer rests on the entry", async () => {
    const { host, container } = mount();
    buttonBefore(host).focus();
    await userEvent.tab();
    const lasso = entryOf(container, "lasso-tool");
    expect(shownName(container)).toBe("Lasso");
    await userEvent.keyboard("{Escape}");
    expect(shownTooltip(container)).toBeNull();
    expect(document.activeElement).toBe(lasso);

    await userEvent.hover(lasso);
    await vi.waitFor(() => expect(shownName(container)).toBe("Lasso"));
    await userEvent.click(lasso);
    expect(shownTooltip(container)).toBeNull();
    await wait(400);
    expect(shownTooltip(container)).toBeNull();
    await userEvent.keyboard("{Escape}");
  });

  test("waits 300ms on hover, then shows a neighbour's at once", async () => {
    const { host, container, modeler } = mount();
    await userEvent.hover(host, { position: { x: 500, y: 500 } });
    await userEvent.hover(entryOf(container, "team.platform"));
    expect(shownTooltip(container)).toBeNull();
    await vi.waitFor(() => expect(shownName(container)).toBe(titleOf(modeler, "team.platform")));

    const neighbour = actions(container)[actions(container).indexOf("team.platform") + 1]!;
    await userEvent.hover(entryOf(container, neighbour));
    expect(shownName(container)).toBe(titleOf(modeler, neighbour));
  });

  // A tap brings the touch's pointerover and then the mouse events a browser fires for
  // compatibility, so a tooltip shown on mouseover would show for a tap.
  test("shows none for touch", async () => {
    const { container } = mount();
    const entry = entryOf(container, "team.platform");
    entry.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "touch" }));
    entry.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    entry.dispatchEvent(new MouseEvent("mouseenter"));
    await wait(400);

    expect(shownTooltip(container)).toBeNull();
  });

  test("describes an entry only when it says more than the entry's name and key names", async () => {
    class HostPaletteProvider {
      static $inject = ["palette"];
      constructor(palette: Palette) {
        palette.registerProvider(this);
      }
      getPaletteEntries(): PaletteEntries {
        const entry = (title: string, shortcut: string) => ({
          group: "host",
          title,
          shortcut,
          action: { click: () => undefined },
        });
        return { "host.note": entry("Note", "n"), "host.export": entry("Export", "Ctrl+E") };
      }
    }
    const { host, container } = mount(HOST.width, [
      { __init__: ["hostPaletteProvider"], hostPaletteProvider: ["type", HostPaletteProvider] },
    ]);
    buttonBefore(host).focus();
    await userEvent.tab();
    const describedBy = (action: string) =>
      entryOf(container, action).getAttribute("aria-describedby");

    expect(describedBy("lasso-tool")).toBeNull();
    await userEvent.keyboard("{End}{ArrowLeft}");
    expect(shownName(container)).toBe("Note");
    expect(describedBy("host.note")).toBeNull();
    await userEvent.keyboard("{ArrowRight}");
    expect(describedBy("host.export")).toBe(shownTooltip(container)!.id);
    await userEvent.keyboard("{ArrowLeft}");
    expect(describedBy("host.export")).toBeNull();
  });

  test("throws nothing later when the modeler is destroyed while its tooltip waits to show", async () => {
    const { modeler, host, container } = mount();
    const errors: unknown[] = [];
    const collect = (event: ErrorEvent) => errors.push(event.error);
    window.addEventListener("error", collect);
    try {
      await userEvent.hover(entryOf(container, "team.platform"));
      mounted.splice(
        mounted.findIndex((each) => each.modeler === modeler),
        1,
      );
      modeler.destroy();
      host.remove();
      await wait(400);
    } finally {
      window.removeEventListener("error", collect);
    }
    expect(errors).toEqual([]);
  });
});

describe("the read-only lock marks the entries it disables (guide §13.5)", () => {
  function lock(modeler: Modeler, locked: boolean): void {
    modeler.get<TtReadOnly>("ttReadOnly").setReadOnly(locked);
  }

  function disabledMarks(container: HTMLElement): Record<string, string | null> {
    return Object.fromEntries(
      entries(container).map((entry) => [
        entry.getAttribute("data-action"),
        entry.getAttribute("aria-disabled"),
      ]),
    );
  }

  function marksOnAllBut(container: HTMLElement, value: string | null, active: string) {
    return Object.fromEntries(
      actions(container).map((action) => [action, action === active ? null : value]),
    );
  }

  test("marks every entry but the lasso aria-disabled, also after a rebuild, and drops the marks with the lock", () => {
    const { container, modeler } = mount();
    expect(disabledMarks(container)).toEqual(marksOnAllBut(container, null, "lasso-tool"));

    lock(modeler, true);
    expect(disabledMarks(container)).toEqual(marksOnAllBut(container, "true", "lasso-tool"));
    rebuildEntries(modeler);
    expect(disabledMarks(container)).toEqual(marksOnAllBut(container, "true", "lasso-tool"));

    lock(modeler, false);
    expect(disabledMarks(container)).toEqual(marksOnAllBut(container, null, "lasso-tool"));
  });

  test("keeps a host entry's own aria-disabled once the lock ends", () => {
    class HostPaletteProvider {
      static $inject = ["palette"];
      constructor(palette: Palette) {
        palette.registerProvider(this);
      }
      getPaletteEntries(): PaletteEntries {
        return {
          "host.soon": {
            group: "host",
            title: "Coming soon",
            html: '<div class="entry" aria-disabled="true"></div>',
            action: { click: () => undefined },
          },
        };
      }
    }
    const { container, modeler } = mount(HOST.width, [
      { __init__: ["hostPaletteProvider"], hostPaletteProvider: ["type", HostPaletteProvider] },
    ]);
    lock(modeler, true);
    lock(modeler, false);

    expect(entryOf(container, "host.soon").getAttribute("aria-disabled")).toBe("true");
    expect(entryOf(container, "team.platform").hasAttribute("aria-disabled")).toBe(false);
  });

  test("keeps a disabled entry focusable with its tooltip, and lets neither the keys nor the pointer create, while the lasso still arms", async () => {
    const { host, container, modeler } = mount();
    const dragging = modeler.get<Dragging>("dragging");
    lock(modeler, true);
    buttonBefore(host).focus();
    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}");
    const second = actions(container)[1]!;
    expect(document.activeElement).toBe(entryOf(container, second));
    expect(shownName(container)).toBe(titleOf(modeler, second));

    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    const team = entryOf(container, "team.platform");
    // Playwright waits for an aria-disabled element to become enabled before it clicks.
    await userEvent.click(team, { force: true });
    expect(dragging.context()?.prefix ?? null).toBeNull();
    const dragStart = new DragEvent("dragstart", { bubbles: true, cancelable: true });
    team.dispatchEvent(dragStart);
    expect(dragStart.defaultPrevented).toBe(true);
    expect(dragging.context()?.prefix ?? null).toBeNull();
    expect(modeler.exportDocument().nodes).toEqual([]);

    const lasso = entryOf(container, "lasso-tool");
    lasso.focus();
    await userEvent.keyboard(" ");
    expect([lasso.getAttribute("aria-pressed"), dragging.context()?.prefix]).toEqual([
      "true",
      "lasso.selection",
    ]);
    await userEvent.keyboard("{Escape}");
  });

  test("draws a disabled entry without a hover, in --cd-ui-text-leise and its preview grey, never by opacity", async () => {
    const { container, modeler } = mount();
    lock(modeler, true);
    const team = entryOf(container, "team.platform");
    await userEvent.hover(team);
    const style = await settledStyle(team);

    expect([style.backgroundColor, style.color, style.cursor, style.opacity]).toEqual([
      "rgba(0, 0, 0, 0)",
      resolved(container, "color", "var(--cd-ui-text-leise)"),
      "not-allowed",
      "1",
    ]);
    const preview = getComputedStyle(team.querySelector("svg")!);
    expect([preview.filter, preview.opacity]).toEqual(["grayscale(1)", "1"]);

    const lasso = entryOf(container, "lasso-tool");
    await userEvent.hover(lasso);
    const active = await settledStyle(lasso);
    expect([active.backgroundColor, active.color]).toEqual([
      resolved(container, "background-color", "var(--cd-ui-hover)"),
      resolved(container, "color", "var(--cd-ui-interaktion)"),
    ]);
    expect(active.cursor).not.toBe("not-allowed");
    expect(getComputedStyle(lasso.querySelector("svg")!).filter).toBe("none");
  });

  test("draws a disabled entry in GrayText in forced colours", async () => {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "forced-colors", value: "active" }],
    });
    try {
      const { container, modeler } = mount();
      lock(modeler, true);

      const grayText = resolved(container, "color", "GrayText");

      expect((await settledStyle(entryOf(container, "team.platform"))).color).toBe(grayText);
      expect((await settledStyle(entryOf(container, "lasso-tool"))).color).not.toBe(grayText);
    } finally {
      await cdp().send("Emulation.setEmulatedMedia", { features: [] });
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
  test("keeps none of the renderer's toolbar attributes, keys or place in the tab order", async () => {
    const { container, modeler } = mount(HOST.width, [chromeModule({ asShell })]);
    const palette = paletteOf(container);
    expect(palette.getAttribute("data-chrome")).toBe("palette");

    expect(palette.querySelector(".djs-palette-entries")!.hasAttribute("role")).toBe(false);
    for (const entry of entries(container)) {
      expect(entry.hasAttribute("tabindex")).toBe(false);
      expect(entry.hasAttribute("aria-pressed")).toBe(false);
      expect(entry.hasAttribute("aria-keyshortcuts")).toBe(false);
    }
    expect(
      palette.compareDocumentPosition(canvasSvg(modeler)) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();

    const team = entryOf(container, "team.platform");
    team.tabIndex = 0;
    team.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(team);
    await userEvent.keyboard("{Enter}");
    expect(modeler.exportDocument().nodes).toEqual([]);
  });

  test("leaves the read-only marks and the veto on its entries to the chrome", () => {
    const { container, modeler } = mount(HOST.width, [chromeModule({ asShell })]);
    const dragging = modeler.get<Dragging>("dragging");
    modeler.get<TtReadOnly>("ttReadOnly").setReadOnly(true);

    for (const entry of entries(container)) {
      expect(entry.hasAttribute("aria-disabled")).toBe(false);
    }
    entryOf(container, "team.platform").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    expect(dragging.context()?.prefix).toBe("create");
    dragging.cancel(false);
  });

  test("puts the armed lasso down on the second click the chrome sends for Enter or Space", () => {
    const { container, modeler } = mount(HOST.width, [chromeModule({ asShell })]);
    const toolManager = modeler.get<ToolManager>("toolManager");
    const dragging = modeler.get<Dragging>("dragging");
    const state = () => [toolManager.isActive("lasso"), dragging.context()?.prefix ?? null];
    const keyboardClick = () =>
      entryOf(container, "lasso-tool").dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );

    keyboardClick();
    expect(state()).toEqual([true, "lasso.selection"]);
    keyboardClick();
    expect(state()).toEqual([false, null]);
  });
});
