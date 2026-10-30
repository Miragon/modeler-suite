/// <reference types="@vitest/browser-playwright" />
import { afterEach, expect, test, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { Modeler } from "@miragon/team-topologies-renderer";
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

afterEach(async () => {
  for (const { modeler, host } of mounted.splice(0)) {
    // Off the palette first: diagram-js's tooltip would otherwise show on the destroyed diagram.
    await userEvent.hover(host, {
      position: { x: host.offsetWidth - 8, y: host.offsetHeight - 8 },
    });
    modeler.destroy();
    host.remove();
  }
});

function mount(width = HOST.width): Mounted {
  const host = document.createElement("div");
  host.style.cssText = `position: fixed; left: 0; top: 0; width: ${width}px; height: ${HOST.height}px;`;
  const container = document.createElement("div");
  host.append(container);
  document.body.append(host);
  const modeler = new Modeler({ container });
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

/** Arms the lasso tool with a click on its entry; diagram-js marks the armed tool. */
async function armLasso(container: HTMLElement): Promise<HTMLElement> {
  const lasso = entryOf(container, "lasso-tool");
  await userEvent.click(lasso);
  expect(lasso.classList.contains("highlighted-entry")).toBe(true);
  return lasso;
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

test("puts the focus ring inside the entry in a narrow container, 1px inside the armed tool's ring", async () => {
  const { container } = mount(600);
  const lasso = await armLasso(container);
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
});

test("keeps the island's edge, the separators, the focus and the armed tool's ring in forced colours", async () => {
  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "forced-colors", value: "active" }],
  });
  try {
    const { container } = mount();
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
    // The entry eases into its armed look.
    await Promise.all(lasso.getAnimations().map((animation) => animation.finished));
    const armed = getComputedStyle(lasso);
    expect(armed.boxShadow).toBe(`${highlight} 0px 0px 0px 2px inset`);
    expect(armed.backgroundColor).toBe(resolved(container, "background-color", "Canvas"));
    expect(armed.color).toBe(canvasText);
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
