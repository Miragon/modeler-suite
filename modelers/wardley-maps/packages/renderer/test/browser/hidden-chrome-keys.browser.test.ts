import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element } from "diagram-js/lib/model/Types";
import {
  Modeler,
  createAxisLabelsPopover,
  createMapSizePopover,
  type PopoverHandle,
} from "../../src/index.js";
import {
  isWardleyConnection,
  isWardleyShape,
  type WardleyConnection,
  type WardleyShape,
} from "../../src/model/di-types.js";
import type WardleyColorPicker from "../../src/color-picker/WardleyColorPicker.js";
import type WardleyLabelEditing from "../../src/label-editing/WardleyLabelEditing.js";
import type WardleyLinkEditing from "../../src/link-editing/WardleyLinkEditing.js";
import { linkOf } from "../../src/link-editing/index.js";
import "../../src/assets/wardley.css";

const MAP = `title Hidden chrome
anchor Customer [0.95, 0.45]
component Kettle [0.55, 0.62]
component Power [0.3, 0.8]
Customer -> Kettle`;

/**
 * The ways a host hides a modeler it keeps. The browser moves the focus off the hidden control only
 * at its next rendering update, so each case presses its keys at the still-focused control first.
 */
const hostHidings = [
  {
    how: "made it inert",
    hide: (host: HTMLElement) => host.setAttribute("inert", ""),
    show: (host: HTMLElement) => host.removeAttribute("inert"),
  },
  {
    how: "hid it with display: none",
    hide: (host: HTMLElement) => (host.style.display = "none"),
    show: (host: HTMLElement) => host.style.removeProperty("display"),
  },
  {
    how: "hid it with visibility: hidden",
    hide: (host: HTMLElement) => host.style.setProperty("visibility", "hidden"),
    show: (host: HTMLElement) => host.style.removeProperty("visibility"),
  },
];

let root: HTMLElement | undefined;
let trigger: HTMLButtonElement | undefined;
let modeler: Modeler | undefined;
let popover: PopoverHandle | undefined;
const keysAtWindow: string[] = [];
const countKeyAtWindow = (event: KeyboardEvent) => keysAtWindow.push(event.key);

/** A chrome root with a menu trigger and the canvas, as the modeler shell lays them out. */
async function mount(): Promise<Modeler> {
  root = document.createElement("div");
  root.style.cssText = "position:relative;width:1024px;height:768px;container-type:size";
  document.body.appendChild(root);
  trigger = document.createElement("button");
  trigger.textContent = "Menu";
  root.appendChild(trigger);
  const canvas = document.createElement("div");
  canvas.style.cssText = "position:absolute;inset:0";
  root.appendChild(canvas);
  modeler = new Modeler({ container: canvas });
  await modeler.importDSL(MAP);
  window.addEventListener("keydown", countKeyAtWindow);
  return modeler;
}

afterEach(() => {
  window.removeEventListener("keydown", countKeyAtWindow);
  keysAtWindow.length = 0;
  popover?.destroy();
  modeler?.destroy();
  root?.remove();
  popover = undefined;
  modeler = undefined;
  root = undefined;
  trigger = undefined;
});

function shapeLabeled(target: Modeler, label: string): WardleyShape {
  const shape = target
    .get<ElementRegistry>("elementRegistry")
    .find((element) => isWardleyShape(element) && element.wardleyLabel === label);
  if (!shape) throw new Error(`no ${label} on the map`);
  return shape as unknown as WardleyShape;
}

function dependency(target: Modeler): WardleyConnection {
  const connection = target
    .get<ElementRegistry>("elementRegistry")
    .find((element) => isWardleyConnection(element));
  if (!connection) throw new Error("no dependency on the map");
  return connection as unknown as WardleyConnection;
}

function pressKey(target: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

/** Each key reaches the page untouched: not prevented and on to the window. */
function expectLeftToPage(target: EventTarget, keys: readonly string[]): void {
  for (const key of keys) {
    const before = keysAtWindow.length;
    expect(pressKey(target, key).defaultPrevented, key).toBe(false);
    expect(keysAtWindow.length, `${key} at the window`).toBe(before + 1);
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/**
 * Presses a real Enter at the focused button while the host hides the modeler from its keydown,
 * before any frame: the browser then still turns the key into a click on the hidden button.
 */
async function pressEnterWhileHiding(hide: () => void): Promise<void> {
  window.addEventListener("keydown", hide, { capture: true, once: true });
  await userEvent.keyboard("{Enter}");
}

async function pressEnterAt(button: HTMLButtonElement): Promise<void> {
  button.focus();
  await userEvent.keyboard("{Enter}");
}

describe("the map's own chrome on a modeler the host hides", () => {
  it.each(hostHidings)(
    "the context pad leaves its keys to the page once the host $how",
    async ({ hide, show }) => {
      const target = await mount();
      const kettle = shapeLabeled(target, "Kettle");
      target.get<Selection>("selection").select(kettle as unknown as Element);
      await nextFrame();
      const remove = target.container.querySelector<HTMLElement>(
        '.djs-context-pad.open .entry[data-action="delete"]',
      )!;
      remove.focus();
      const before = target.exportDSL();
      hide(root!);
      expect(document.activeElement).toBe(remove);

      expectLeftToPage(remove, [
        "Enter",
        " ",
        "ArrowRight",
        "ArrowLeft",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "Escape",
      ]);
      expect(target.exportDSL()).toBe(before);
      expect(document.activeElement).toBe(remove);

      show(root!);
      expect(pressKey(remove, "Enter").defaultPrevented).toBe(true);
      expect(target.exportDSL()).not.toContain("component Kettle");
    },
  );

  it.each(hostHidings)(
    "the name editor neither saves nor closes once the host $how",
    async ({ hide, show }) => {
      const target = await mount();
      target
        .get<WardleyLabelEditing>("wardleyLabelEditing")
        .activate(shapeLabeled(target, "Kettle"));
      const field = target.container.querySelector<HTMLInputElement>(".wardley-label-input")!;
      expect(document.activeElement).toBe(field);
      field.value = "Boiler";
      hide(root!);

      expectLeftToPage(field, ["Enter", "Escape"]);
      expect(field.isConnected).toBe(true);
      expect(target.exportDSL()).toContain("component Kettle");

      show(root!);
      expect(pressKey(field, "Enter").defaultPrevented).toBe(true);
      expect(field.isConnected).toBe(false);
      expect(target.exportDSL()).toContain("component Boiler");
    },
  );

  it.each(hostHidings)(
    "the link annotation editor neither saves nor closes once the host $how",
    async ({ hide, show }) => {
      const target = await mount();
      const connection = dependency(target);
      target.get<WardleyLabelEditing>("wardleyLabelEditing").activateConnection(connection);
      const field = target.container.querySelector<HTMLInputElement>(".wardley-label-input")!;
      expect(document.activeElement).toBe(field);
      field.value = "boils";
      hide(root!);

      expectLeftToPage(field, ["Enter", "Escape"]);
      expect(field.isConnected).toBe(true);
      expect(connection.linkLabel).toBeUndefined();

      show(root!);
      expect(pressKey(field, "Enter").defaultPrevented).toBe(true);
      expect(field.isConnected).toBe(false);
      expect(connection.linkLabel).toBe("boils");
    },
  );

  it.each(hostHidings)(
    "the link address editor neither saves nor closes once the host $how",
    async ({ hide, show }) => {
      const target = await mount();
      const kettle = shapeLabeled(target, "Kettle");
      target.get<WardleyLinkEditing>("wardleyLinkEditing").activate(kettle);
      const field = target.container.querySelector<HTMLInputElement>(".wardley-label-input")!;
      expect(document.activeElement).toBe(field);
      field.value = "https://example.com/kettle";
      hide(root!);

      expectLeftToPage(field, ["Enter", "Escape"]);
      expect(field.isConnected).toBe(true);
      expect(linkOf(kettle)).toBeUndefined();

      show(root!);
      expect(pressKey(field, "Enter").defaultPrevented).toBe(true);
      expect(field.isConnected).toBe(false);
      expect(linkOf(kettle)).toBe("https://example.com/kettle");
    },
  );

  it.each(hostHidings)(
    "the colour picker neither moves the focus nor closes once the host $how",
    async ({ hide, show }) => {
      const target = await mount();
      target
        .get<WardleyColorPicker>("wardleyColorPicker")
        .open(shapeLabeled(target, "Kettle"), 200, 200);
      // The picker listens for Escape on the document from the next task on.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const picker = target.container.querySelector<HTMLElement>(".wardley-color-picker")!;
      const swatches = Array.from(picker.querySelectorAll<HTMLButtonElement>("button"));
      swatches[0]!.focus();
      hide(root!);

      expectLeftToPage(swatches[0]!, ["ArrowRight", "ArrowDown", "Home", "End", "Tab", "Escape"]);
      expect(document.activeElement).toBe(swatches[0]);
      expect(picker.isConnected).toBe(true);

      show(root!);
      expect(pressKey(swatches[0]!, "ArrowRight").defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(swatches[1]);
      expect(pressKey(swatches[1]!, "Escape").defaultPrevented).toBe(true);
      expect(picker.isConnected).toBe(false);
    },
  );

  it.each(hostHidings)(
    "Enter on a swatch the browser turns into a click picks no colour once the host $how",
    async ({ hide, show }) => {
      const target = await mount();
      const kettle = shapeLabeled(target, "Kettle");
      target.get<WardleyColorPicker>("wardleyColorPicker").open(kettle, 200, 200);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const picker = target.container.querySelector<HTMLElement>(".wardley-color-picker")!;
      const swatch = picker.querySelectorAll<HTMLButtonElement>("button")[1]!;
      swatch.focus();

      await pressEnterWhileHiding(() => hide(root!));
      expect(kettle.color).toBeUndefined();
      expect(picker.isConnected).toBe(true);

      show(root!);
      await pressEnterAt(swatch);
      expect(kettle.color).toBeDefined();
      expect(picker.isConnected).toBe(false);
    },
  );

  it.each(hostHidings)(
    "the element settings menu picks nothing and passes its keys on once the host $how",
    async ({ hide, show }) => {
      const target = await mount();
      const popupMenu = target.get<PopupMenu>("popupMenu");
      popupMenu.open(
        shapeLabeled(target, "Kettle") as unknown as Element,
        "wardley-element-settings",
        { x: 200, y: 200 },
      );
      const focused = document.activeElement as HTMLElement;
      expect(focused.closest(".djs-popup")).not.toBeNull();
      // The menu selects its first entry once more after the first paint, as a user sees it.
      await nextFrame();
      pressKey(focused, "ArrowDown");
      // The menu renders its new selection (Market) a microtask later, and Enter picks that one.
      await Promise.resolve();
      const before = target.exportDSL();
      hide(root!);

      expectLeftToPage(focused, ["Enter", "x"]);
      expect(target.exportDSL()).toBe(before);
      expect(popupMenu.isOpen()).toBe(true);
      expect(document.activeElement).toBe(focused);

      show(root!);
      expect(pressKey(focused, "Enter").defaultPrevented).toBe(true);
      expect(target.exportDSL()).toContain("component Kettle [0.55, 0.62] (market)");
    },
  );

  it.each(hostHidings)(
    "Enter on the x-axis labels popover's buttons neither resets nor applies once the host $how",
    async ({ hide, show }) => {
      const target = await mount();
      popover = createAxisLabelsPopover({ root: root!, menu: { trigger: trigger! } }, target);
      popover.open();
      const panel = root!.querySelector<HTMLElement>(".wardley-axis-labels")!;
      const [first] = panel.querySelectorAll<HTMLInputElement>("input");
      const [reset, done] = panel.querySelectorAll<HTMLButtonElement>(
        ".wardley-popover-footer button",
      );
      first!.value = "Idea";
      first!.dispatchEvent(new Event("input"));

      reset!.focus();
      await pressEnterWhileHiding(() => hide(root!));
      expect(first!.value).toBe("Idea");
      show(root!);
      done!.focus();
      await pressEnterWhileHiding(() => hide(root!));
      expect(popover.isOpen()).toBe(true);
      expect(target.canUndo()).toBe(false);

      show(root!);
      await pressEnterAt(reset!);
      expect(first!.value).not.toBe("Idea");
      first!.value = "Idea";
      first!.dispatchEvent(new Event("input"));
      await pressEnterAt(done!);
      expect(popover.isOpen()).toBe(false);
      expect(target.exportDSL()).toContain("evolution Idea->");
    },
  );

  it.each(hostHidings)(
    "Enter on the map size popover's buttons neither resets nor applies once the host $how",
    async ({ hide, show }) => {
      const target = await mount();
      popover = createMapSizePopover({ root: root!, menu: { trigger: trigger! } }, target);
      popover.open();
      const panel = root!.querySelector<HTMLElement>(".wardley-map-size")!;
      const select = panel.querySelector("select")!;
      const [reset, done] = panel.querySelectorAll<HTMLButtonElement>(
        ".wardley-popover-footer button",
      );
      select.value = "large";
      select.dispatchEvent(new Event("change"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const large = target.getMapSize();
      expect(reset!.disabled).toBe(false);

      reset!.focus();
      await pressEnterWhileHiding(() => hide(root!));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(target.getMapSize()).toEqual(large);
      show(root!);
      done!.focus();
      await pressEnterWhileHiding(() => hide(root!));
      expect(popover.isOpen()).toBe(true);
      expect(target.canUndo()).toBe(false);

      show(root!);
      await pressEnterAt(reset!);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(target.getMapSize().isExplicit).toBe(false);
      select.value = "large";
      select.dispatchEvent(new Event("change"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await pressEnterAt(done!);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(popover.isOpen()).toBe(false);
      expect(target.exportDSL()).toContain("size [");
    },
  );

  it.each(hostHidings)(
    "the x-axis labels popover neither applies nor closes once the host $how",
    async ({ hide, show }) => {
      const target = await mount();
      popover = createAxisLabelsPopover({ root: root!, menu: { trigger: trigger! } }, target);
      popover.open();
      const [first] = root!.querySelectorAll<HTMLInputElement>(".wardley-axis-labels input");
      expect(document.activeElement).toBe(first);
      first!.value = "Idea";
      first!.dispatchEvent(new Event("input"));
      hide(root!);

      expectLeftToPage(first!, ["Enter", "Escape"]);
      expect(popover.isOpen()).toBe(true);
      expect(target.canUndo()).toBe(false);

      show(root!);
      expect(pressKey(first!, "Enter").defaultPrevented).toBe(true);
      expect(popover.isOpen()).toBe(false);
      expect(target.exportDSL()).toContain("evolution Idea->");
    },
  );
});
