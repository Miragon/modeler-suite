/// <reference types="@vitest/browser-playwright" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { page as browserPage } from "vitest/browser";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element as DiagramElement } from "diagram-js/lib/model/Types";
import { createCollaborativeModeler, type CollaborativeWardleyModeler } from "../../src/index.js";
import type { WardleyShape } from "../../src/model/di-types.js";
import { POPUP_PROVIDER_ID } from "../../src/popup/index.js";
import type WardleyColorPicker from "../../src/color-picker/WardleyColorPicker.js";
import { canvasSvgOf, diagramOf } from "./support/gesture-harness.js";
import teaShop from "./fixtures/tea-shop.wmap?raw";
import "../../src/assets/wardley.css";

// The surfaces and focus rings of the canvas chrome in high contrast (guide §5.3, §5.14, §6, §12):
// no shadow, a 3px ring, under the nearest mode carrier (guide §10.2). The popovers and dialogs are
// in map-menu.browser.test.ts, the inline editors in inline-editors.browser.test.ts.

const page = document.documentElement;
const modelers: CollaborativeWardleyModeler[] = [];
const wrappers: HTMLElement[] = [];

afterEach(() => {
  page.removeAttribute("data-cd-theme");
  page.removeAttribute("data-cd-kontrast");
  for (const modeler of modelers.splice(0)) modeler.destroy();
  for (const wrapper of wrappers.splice(0)) wrapper.remove();
});

interface Mode {
  page?: { theme: string; kontrast?: string };
  request?: { theme: "light"; contrast: "normal" | "high" };
}

async function mapIn(mode: Mode): Promise<CollaborativeWardleyModeler> {
  if (mode.page) {
    page.setAttribute("data-cd-theme", mode.page.theme);
    if (mode.page.kontrast) page.setAttribute("data-cd-kontrast", mode.page.kontrast);
  }
  const modeler = createCollaborativeModeler();
  if (mode.request) modeler.appearance.set(mode.request);
  const host = attachedHost();
  wrappers.push(host.parentElement ?? host);
  modeler.attachTo(host);
  modelers.push(modeler);
  await modeler.importText(teaShop);
  return modeler;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function kettleOf(modeler: CollaborativeWardleyModeler): WardleyShape {
  const kettle = diagramOf(modeler).get<ElementRegistry>("elementRegistry").get("cmp_kettle");
  if (!kettle) throw new Error("no Kettle on the map");
  return kettle as unknown as WardleyShape;
}

function within<T extends HTMLElement>(scope: ParentNode, selector: string): T {
  const found = scope.querySelector<T>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
}

async function openContextPad(modeler: CollaborativeWardleyModeler): Promise<HTMLElement> {
  const diagram = diagramOf(modeler);
  diagram.get<Selection>("selection").select(kettleOf(modeler) as unknown as DiagramElement);
  await nextFrame();
  return within(diagram.container, ".djs-context-pad.open");
}

async function openSettingsPopup(modeler: CollaborativeWardleyModeler): Promise<HTMLElement> {
  const diagram = diagramOf(modeler);
  diagram
    .get<PopupMenu>("popupMenu")
    .open(kettleOf(modeler) as unknown as DiagramElement, POPUP_PROVIDER_ID, { x: 300, y: 120 });
  await nextFrame();
  return within(diagram.container, ".djs-popup.wardley-element-settings");
}

function closeSettingsPopup(modeler: CollaborativeWardleyModeler): void {
  diagramOf(modeler).get<PopupMenu>("popupMenu").close();
}

function openColourPicker(modeler: CollaborativeWardleyModeler): HTMLElement {
  const diagram = diagramOf(modeler);
  diagram.get<WardleyColorPicker>("wardleyColorPicker").open(kettleOf(modeler), 200, 200);
  return within(diagram.container, ".wardley-color-picker");
}

function closeColourPicker(modeler: CollaborativeWardleyModeler): void {
  diagramOf(modeler).get<WardleyColorPicker>("wardleyColorPicker").close();
}

function paletteOf(modeler: CollaborativeWardleyModeler): HTMLElement {
  return within(diagramOf(modeler).container, ".djs-palette.wardley-palette");
}

/** diagram-js shows the palette's tooltip a moment after the pointer enters an entry. */
async function showPaletteTooltip(modeler: CollaborativeWardleyModeler): Promise<HTMLElement> {
  const entry = within(paletteOf(modeler), '.entry[data-action="create.component"]');
  entry.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
  return vi.waitFor(() => within(diagramOf(modeler).container, ".djs-hover-tooltip"));
}

interface Edge {
  style: string;
  width: string;
  color: string;
}

function edgeOf(surface: HTMLElement): Edge {
  const style = getComputedStyle(surface);
  return { style: style.borderTopStyle, width: style.borderTopWidth, color: style.borderTopColor };
}

/** The colour a role resolves to where the surface lies, under its nearest mode carrier. */
function roleColourAt(surface: HTMLElement, role: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${role})`;
  surface.after(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

/** A tooltip of another diagram-js editor on the same page, outside every map. */
function foreignTooltip(): HTMLElement {
  const diagramContainer = document.createElement("div");
  diagramContainer.className = "bio-theme-parent djs-parent djs-container";
  const mount = document.createElement("div");
  mount.className = "djs-hover-tooltip-container";
  const tooltip = document.createElement("div");
  tooltip.className = "djs-hover-tooltip djs-hover-tooltip--right";
  tooltip.textContent = "Create task";
  mount.append(tooltip);
  diagramContainer.append(mount);
  document.body.append(diagramContainer);
  wrappers.push(diagramContainer);
  return tooltip;
}

/** The shadow of every surface the chrome lays over the canvas, each open in turn. */
async function shadowsOf(modeler: CollaborativeWardleyModeler): Promise<Record<string, string>> {
  const shadowOf = (surface: HTMLElement) => getComputedStyle(surface).boxShadow;
  const shadows: Record<string, string> = {
    "context pad": shadowOf(await openContextPad(modeler)),
    palette: shadowOf(paletteOf(modeler)),
    "palette tooltip": shadowOf(await showPaletteTooltip(modeler)),
  };
  shadows["settings popup"] = shadowOf(await openSettingsPopup(modeler));
  closeSettingsPopup(modeler);
  shadows["colour picker"] = shadowOf(openColourPicker(modeler));
  closeColourPicker(modeler);
  return shadows;
}

interface Ring {
  width: string;
  offset: string;
}

function ringOf(focused: HTMLElement | SVGElement, drawnOn: Element = focused): Ring {
  expect(document.activeElement).toBe(focused);
  expect(focused.matches(":focus-visible")).toBe(true);
  const style = getComputedStyle(drawnOn);
  expect(style.outlineStyle).toBe("solid");
  return { width: style.outlineWidth, offset: style.outlineOffset };
}

function focusFromKeyboard(target: HTMLElement | SVGElement): void {
  target.focus({ focusVisible: true } as FocusOptions);
}

function boxIn(element: Element, origin: Element): DOMRect {
  const box = element.getBoundingClientRect();
  const originBox = origin.getBoundingClientRect();
  return new DOMRect(box.left - originBox.left, box.top - originBox.top, box.width, box.height);
}

/** `element` as drawn on screen: the colour at a point in px from its top left. */
async function drawnColours(element: HTMLElement): Promise<(x: number, y: number) => number[]> {
  const base64 = await browserPage.screenshot({ element, save: false });
  const bitmap = await createImageBitmap(
    await (await fetch(`data:image/png;base64,${base64}`)).blob(),
  );
  const scale = bitmap.width / element.getBoundingClientRect().width;
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d")!;
  context.drawImage(bitmap, 0, 0);
  return (x, y) => {
    const data = context.getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data;
    return [data[0]!, data[1]!, data[2]!];
  };
}

/** The WCAG contrast ratio of two sRGB colours. */
function contrast(first: number[], second: number[]): number {
  const channel = (value: number) => {
    const share = value / 255;
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([red = 0, green = 0, blue = 0]: number[]) =>
    0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

/** The keyboard focus ring of each focusable part of the canvas chrome, focused in turn. */
async function focusRingsOf(modeler: CollaborativeWardleyModeler): Promise<Record<string, Ring>> {
  const rings: Record<string, Ring> = {};
  const padEntry = within<HTMLElement>(await openContextPad(modeler), ".entry");
  focusFromKeyboard(padEntry);
  rings["context pad entry"] = ringOf(padEntry);

  const paletteEntry = within<HTMLElement>(paletteOf(modeler), ".entry");
  focusFromKeyboard(paletteEntry);
  rings["palette entry"] = ringOf(paletteEntry);

  const popup = await openSettingsPopup(modeler);
  const results = within<HTMLElement>(popup, ".djs-popup-results");
  focusFromKeyboard(results);
  rings["settings popup"] = ringOf(results, popup);
  closeSettingsPopup(modeler);

  const picker = openColourPicker(modeler);
  const activeSwatch = within<HTMLElement>(picker, "button.wardley-cp-active");
  focusFromKeyboard(activeSwatch);
  rings["active colour swatch"] = ringOf(activeSwatch);
  const swatch = within<HTMLElement>(picker, "button:not(.wardley-cp-active)");
  focusFromKeyboard(swatch);
  rings["colour swatch"] = ringOf(swatch);
  closeColourPicker(modeler);

  const canvas = canvasSvgOf(modeler);
  focusFromKeyboard(canvas);
  rings.canvas = ringOf(canvas);
  return rings;
}

const SURFACES = ["context pad", "palette", "palette tooltip", "settings popup", "colour picker"];

const NORMAL_RINGS: Record<string, Ring> = {
  "context pad entry": { width: "2px", offset: "2px" },
  "palette entry": { width: "2px", offset: "-2px" },
  "settings popup": { width: "2px", offset: "2px" },
  "active colour swatch": { width: "2px", offset: "5px" },
  "colour swatch": { width: "2px", offset: "2px" },
  canvas: { width: "2px", offset: "-2px" },
};

const HIGH_CONTRAST_RINGS: Record<string, Ring> = {
  "context pad entry": { width: "3px", offset: "2px" },
  "palette entry": { width: "3px", offset: "-3px" },
  "settings popup": { width: "3px", offset: "2px" },
  "active colour swatch": { width: "3px", offset: "5px" },
  "colour swatch": { width: "3px", offset: "2px" },
  canvas: { width: "3px", offset: "-3px" },
};

const HIGH_CONTRAST: Record<string, Mode> = {
  "on a high-contrast page": { page: { theme: "light", kontrast: "hoch" } },
  "for a host's request of high contrast on a page in normal contrast": {
    page: { theme: "light" },
    request: { theme: "light", contrast: "high" },
  },
};

const NORMAL_CONTRAST: Record<string, Mode> = {
  "on a page in normal contrast": { page: { theme: "light" } },
  "for a host's request of normal contrast on a high-contrast page": {
    page: { theme: "dark", kontrast: "hoch" },
    request: { theme: "light", contrast: "normal" },
  },
};

describe("the canvas chrome in high contrast (guide §5.3, §5.14, §6)", () => {
  it.each(Object.entries(NORMAL_CONTRAST))("keeps every shadow %s", async (_, mode) => {
    const shadows = await shadowsOf(await mapIn(mode));
    expect(Object.keys(shadows).sort()).toEqual([...SURFACES].sort());
    for (const surface of SURFACES) expect(shadows[surface], surface).not.toBe("none");
  });

  it.each(Object.entries(HIGH_CONTRAST))("drops every shadow %s", async (_, mode) => {
    const shadows = await shadowsOf(await mapIn(mode));
    expect(shadows).toEqual(Object.fromEntries(SURFACES.map((surface) => [surface, "none"])));
  });

  it.each(Object.entries(NORMAL_CONTRAST))("keeps the 2px focus rings %s", async (_, mode) => {
    expect(await focusRingsOf(await mapIn(mode))).toEqual(NORMAL_RINGS);
  });

  it.each(Object.entries(HIGH_CONTRAST))(
    "widens the focus rings to 3px, inside at -3px, %s",
    async (_, mode) => {
      expect(await focusRingsOf(await mapIn(mode))).toEqual(HIGH_CONTRAST_RINGS);
    },
  );

  it.each(Object.entries({ ...NORMAL_CONTRAST, ...HIGH_CONTRAST }))(
    "outlines the palette tooltip with the line role (guide §5.6) %s",
    async (_, mode) => {
      const tooltip = await showPaletteTooltip(await mapIn(mode));
      const lineColour = roleColourAt(tooltip, "--cd-ui-linie");
      expect(edgeOf(tooltip)).toEqual({ style: "solid", width: "1px", color: lineColour });
      expect(lineColour).not.toBe(getComputedStyle(tooltip).backgroundColor);
    },
  );

  // The chosen colour's state ring lay under the focus ring, in nearly the same blue, so the focus
  // on the swatch the picker focuses first could not be seen (guide §5.5, §8, §12).
  it.each(Object.entries({ ...NORMAL_CONTRAST, ...HIGH_CONTRAST }))(
    "shows the focus on the chosen colour's swatch around its state ring, clear of the neighbours and the picker's edge (#407) %s",
    async (_, mode) => {
      const picker = openColourPicker(await mapIn(mode));
      const active = within<HTMLElement>(picker, "button.wardley-cp-active");
      focusFromKeyboard(active);
      const ring = ringOf(active);
      const reach = parseFloat(ring.offset) + parseFloat(ring.width);
      const pickerStyle = getComputedStyle(picker);
      for (const room of [
        pickerStyle.columnGap,
        pickerStyle.rowGap,
        pickerStyle.paddingTop,
        pickerStyle.paddingLeft,
      ]) {
        expect(reach).toBeLessThan(parseFloat(room));
      }
      const focused = await drawnColours(picker);
      active.blur();
      expect(picker.isConnected).toBe(true);
      const unfocused = await drawnColours(picker);

      const swatchBox = boxIn(active, picker);
      const ringMiddle = parseFloat(ring.offset) + parseFloat(ring.width) / 2;
      const centre = {
        x: swatchBox.left + swatchBox.width / 2,
        y: swatchBox.top + swatchBox.height / 2,
      };
      const onTheRing = [
        [swatchBox.left - ringMiddle, centre.y],
        [swatchBox.right + ringMiddle, centre.y],
        [centre.x, swatchBox.top - ringMiddle],
        [centre.x, swatchBox.bottom + ringMiddle],
      ] as const;
      for (const [x, y] of onTheRing) {
        expect(contrast(focused(x, y), unfocused(x, y))).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it("leaves the tooltip of another editor on a high-contrast page as diagram-js draws it", async () => {
    const tooltip = await showPaletteTooltip(await mapIn({ page: { theme: "light" } }));
    const otherTooltip = foreignTooltip();
    const diagramJsShadow = getComputedStyle(otherTooltip).boxShadow;
    expect(diagramJsShadow).not.toBe("none");

    page.setAttribute("data-cd-kontrast", "hoch");

    expect(getComputedStyle(tooltip).boxShadow).toBe("none");
    expect(getComputedStyle(otherTooltip).boxShadow).toBe(diagramJsShadow);
    expect(edgeOf(otherTooltip).style).toBe("none");
  });
});
