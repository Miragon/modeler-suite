/// <reference types="@vitest/browser-playwright" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Modeler } from "../../src/index.js";
import type WardleyDrawTool from "../../src/draw-tool/WardleyDrawTool.js";
import "../../src/assets/wardley.css";

/**
 * The focus ring of the renderer's own palette, for a host that mounts the map without the modeler
 * shell (guide §5.5, §5.14). The palette scrolls sideways and its entries sit edge to edge, so a
 * neighbour, which paints after the entry, would cover a ring that stands outside it (#397).
 */

const HOST = { width: 1024, height: 768 };
const root = document.documentElement;

interface Mounted {
  host: HTMLDivElement;
  modeler: Modeler;
}

const mounted: Mounted[] = [];
const hostSheets: HTMLStyleElement[] = [];

afterEach(async () => {
  root.removeAttribute("data-cd-theme");
  root.removeAttribute("data-cd-kontrast");
  for (const sheet of hostSheets.splice(0)) sheet.remove();
  for (const { host, modeler } of mounted.splice(0)) {
    // Off the palette first: diagram-js's tooltip would otherwise show on the destroyed diagram.
    await userEvent.hover(host, {
      position: { x: host.offsetWidth - 8, y: host.offsetHeight - 8 },
    });
    modeler.destroy();
    host.remove();
  }
});

async function mount(): Promise<Mounted> {
  await page.viewport(HOST.width, HOST.height);
  const host = document.createElement("div");
  host.style.cssText = `position: fixed; left: 0; top: 0; width: ${HOST.width}px; height: ${HOST.height}px;`;
  document.body.append(host);
  const modeler = new Modeler({ container: host, width: HOST.width, height: HOST.height });
  await modeler.importDSL("title Ring");
  const result = { host, modeler };
  mounted.push(result);
  return result;
}

function entry(host: HTMLElement, action: string): HTMLElement {
  const found = host.querySelector<HTMLElement>(
    `.djs-palette.wardley-palette .entry[data-action="${action}"]`,
  );
  if (!found) throw new Error(`no palette entry ${action}`);
  return found;
}

function boxIn(element: Element, origin: Element): DOMRect {
  const box = element.getBoundingClientRect();
  const originBox = origin.getBoundingClientRect();
  return new DOMRect(box.left - originBox.left, box.top - originBox.top, box.width, box.height);
}

/** What `property: value` computes to inside `scope`, where the roles are the map's. */
function resolved(scope: HTMLElement, property: string, value: string): string {
  const probe = document.createElement("div");
  probe.style.setProperty(property, value);
  scope.append(probe);
  const computed = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return computed;
}

/** `rgb(r, g, b)` as its three channels. */
function rgbOf(color: string): number[] {
  return (color.match(/\d+/g) ?? []).slice(0, 3).map(Number);
}

function role(scope: HTMLElement, name: string): number[] {
  return rgbOf(resolved(scope, "color", `var(${name})`));
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

/** The draw tool armed, once its entry shows the active tool's fill and ring (guide §5.5). */
async function armDrawTool({ host, modeler }: Mounted): Promise<HTMLElement> {
  modeler.get<WardleyDrawTool>("wardleyDrawTool").activate();
  const draw = entry(host, "draw-tool");
  const hoverFill = resolved(host, "background-color", "var(--cd-ui-hover)");
  const ring = `${resolved(host, "color", "var(--cd-ui-interaktion)")} 0px 0px 0px 2px inset`;
  await vi.waitFor(() => {
    expect(draw.classList.contains("highlighted-entry")).toBe(true);
    const style = getComputedStyle(draw);
    expect([style.backgroundColor, style.boxShadow]).toEqual([hoverFill, ring]);
  });
  return draw;
}

async function hover(host: HTMLElement, target: HTMLElement): Promise<void> {
  await userEvent.hover(target);
  const hoverFill = resolved(host, "background-color", "var(--cd-ui-hover)");
  await vi.waitFor(() => expect(getComputedStyle(target).backgroundColor).toBe(hoverFill));
}

function focusFromKeyboard(target: HTMLElement): void {
  target.focus({ focusVisible: true } as FocusOptions);
  expect(document.activeElement).toBe(target);
  expect(target.matches(":focus-visible")).toBe(true);
}

const NEIGHBOURS = {
  "a hovered": async ({ host }: Mounted) => hover(host, entry(host, "draw-tool")),
  "an armed": async (mapped: Mounted) => {
    await armDrawTool(mapped);
  },
};

describe("the palette's focus ring without the shell (#397, guide §5.14)", () => {
  it("leaves the entries edge to edge, so a ring outside one would lie in its neighbour", async () => {
    const { host } = await mount();
    const lasso = boxIn(entry(host, "lasso-tool"), host);
    const draw = boxIn(entry(host, "draw-tool"), host);
    expect(draw.left - lasso.right).toBe(0);
  });

  it.each(Object.entries(NEIGHBOURS))(
    "lays the ring inside the entry, whole beside %s neighbour",
    async (_, prepare) => {
      const mapped = await mount();
      const { host } = mapped;
      await prepare(mapped);
      const lasso = entry(host, "lasso-tool");
      focusFromKeyboard(lasso);

      const box = boxIn(lasso, host);
      const middle = box.top + box.height / 2;
      expect(await pixelOf(host, box.right - 1, middle)).toEqual(role(host, "--cd-ui-fokus"));
      expect(await pixelOf(host, box.left + 1, middle)).toEqual(role(host, "--cd-ui-fokus"));
      expect(await pixelOf(host, box.right + 3, middle)).toEqual(role(host, "--cd-ui-hover"));
    },
  );

  it("lays the ring 1px inside the armed tool's ring, which stays visible (guide §5.5)", async () => {
    const mapped = await mount();
    const { host } = mapped;
    const draw = await armDrawTool(mapped);
    focusFromKeyboard(draw);

    const box = boxIn(draw, host);
    const middle = box.top + box.height / 2;
    expect(await pixelOf(host, box.right - 1, middle)).toEqual(role(host, "--cd-ui-interaktion"));
    expect(await pixelOf(host, box.right - 4, middle)).toEqual(role(host, "--cd-ui-fokus"));
  });

  it.each(Object.entries(NEIGHBOURS))(
    "keeps a ring a host lays outside the entry above %s neighbour, which paints after it",
    async (_, prepare) => {
      const mapped = await mount();
      const { host } = mapped;
      host.classList.add("ring-outside");
      const hostSheet = document.createElement("style");
      hostSheet.textContent =
        ".ring-outside .djs-palette .entry:focus-visible { outline-offset: 2px; }";
      document.head.append(hostSheet);
      hostSheets.push(hostSheet);
      await prepare(mapped);
      const lasso = entry(host, "lasso-tool");
      focusFromKeyboard(lasso);
      expect(getComputedStyle(lasso).outlineOffset).toBe("2px");

      const box = boxIn(lasso, host);
      const ring = await pixelOf(host, box.right + 3, box.top + box.height / 2);
      expect(ring).toEqual(role(host, "--cd-ui-fokus"));
    },
  );

  it.each([
    ["in normal contrast", undefined, { plain: ["2px", "-2px"], armed: ["2px", "-5px"] }],
    ["in high contrast", "hoch", { plain: ["3px", "-3px"], armed: ["3px", "-6px"] }],
  ] as const)("draws the inside ring %s", async (_, kontrast, rings) => {
    root.setAttribute("data-cd-theme", "light");
    if (kontrast) root.setAttribute("data-cd-kontrast", kontrast);
    const mapped = await mount();
    const ringOf = (target: HTMLElement) => {
      focusFromKeyboard(target);
      const style = getComputedStyle(target);
      return [style.outlineWidth, style.outlineOffset];
    };
    expect(ringOf(entry(mapped.host, "lasso-tool"))).toEqual(rings.plain);
    expect(ringOf(await armDrawTool(mapped))).toEqual(rings.armed);
  });
});
