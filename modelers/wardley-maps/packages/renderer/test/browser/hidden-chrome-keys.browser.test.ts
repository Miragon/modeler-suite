import { afterEach, describe, expect, it } from "vitest";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element } from "diagram-js/lib/model/Types";
import { Modeler, createAxisLabelsPopover, type PopoverHandle } from "../../src/index.js";
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
