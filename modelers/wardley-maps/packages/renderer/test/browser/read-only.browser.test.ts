import { afterEach, describe, expect, it, vi } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type Palette from "diagram-js/lib/features/palette/Palette";
import type Rules from "diagram-js/lib/features/rules/Rules";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element } from "diagram-js/lib/model/Types";
import {
  Modeler,
  READ_ONLY_CHANGED,
  type WardleyReadOnly,
  type WardleyReadOnlyChangedEvent,
} from "../../src/index.js";
import { isWardleyShape, type WardleyShape } from "../../src/model/di-types.js";
import type WardleyLabelEditing from "../../src/label-editing/WardleyLabelEditing.js";
import type WardleyColorPicker from "../../src/color-picker/WardleyColorPicker.js";
import type WardleyDrawTool from "../../src/draw-tool/WardleyDrawTool.js";
import "../../src/assets/wardley.css";

const MAP = `title Locked
component Kettle [0.43, 0.35]
component Power [0.1, 0.71]
Kettle -> Power`;

let container: HTMLElement | undefined;
let modeler: Modeler | undefined;

async function mount(): Promise<Modeler> {
  container = document.createElement("div");
  document.body.appendChild(container);
  modeler = new Modeler({ container, width: 1024, height: 768 });
  await modeler.importDSL(MAP);
  return modeler;
}

afterEach(() => {
  modeler?.destroy();
  container?.remove();
  modeler = undefined;
  container = undefined;
});

function shape(target: Modeler, label: string): WardleyShape {
  const found = target
    .get<ElementRegistry>("elementRegistry")
    .find((element) => isWardleyShape(element) && element.wardleyLabel === label);
  if (!found) throw new Error(`no shape ${label}`);
  return found as unknown as WardleyShape;
}

function lock(target: Modeler, readOnly = true): void {
  target.get<WardleyReadOnly>("wardleyReadOnly").setReadOnly(readOnly);
}

function readOnlyOf(target: Modeler): WardleyReadOnly {
  return target.get<WardleyReadOnly>("wardleyReadOnly");
}

function exploreLock(target: Modeler, locked = true): void {
  readOnlyOf(target).setExploreLock(locked);
}

function moveContextOf(target: Modeler): { shapes: Element[]; delta: { x: number; y: number } } {
  return { shapes: [shape(target, "Kettle") as unknown as Element], delta: { x: 10, y: 0 } };
}

function movesAllowed(target: Modeler): boolean {
  return target.get<Rules>("rules").allowed("elements.move", moveContextOf(target)) !== false;
}

function lockEvents(target: Modeler): WardleyReadOnlyChangedEvent[] {
  const events: WardleyReadOnlyChangedEvent[] = [];
  target.on(READ_ONLY_CHANGED, (event: WardleyReadOnlyChangedEvent) => {
    events.push({ readOnly: event.readOnly, shown: event.shown, reasons: [...event.reasons] });
  });
  return events;
}

function press(target: Modeler, key: string, modifiers: KeyboardEventInit = {}): void {
  const svg = target
    .get<Canvas>("canvas")
    .getContainer()
    .querySelector<SVGSVGElement>(":scope > svg")!;
  svg.focus();
  svg.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...modifiers }));
}

describe("the read-only lock of a canvas (guide §13.5)", () => {
  it("vetoes every edit rule and lifts the veto when unlocked", async () => {
    const target = await mount();
    const rules = target.get<Rules>("rules");
    const kettle = shape(target, "Kettle") as unknown as Element;
    const power = shape(target, "Power") as unknown as Element;
    const moveContext = { shapes: [kettle], delta: { x: 10, y: 0 } };
    expect(rules.allowed("elements.move", moveContext)).not.toBe(false);

    lock(target);
    expect(rules.allowed("elements.move", moveContext)).toBe(false);
    expect(rules.allowed("connection.start", { source: power })).toBe(false);
    expect(rules.allowed("elements.delete", { elements: [kettle] })).toBe(false);

    lock(target, false);
    expect(rules.allowed("elements.move", moveContext)).not.toBe(false);
  });

  it("offers no context pad and no label editor", async () => {
    const target = await mount();
    lock(target);
    target.get<Selection>("selection").select(shape(target, "Kettle") as unknown as Element);
    expect(target.container.querySelectorAll(".djs-context-pad .entry")).toHaveLength(0);
    target.get<WardleyLabelEditing>("wardleyLabelEditing").activate(shape(target, "Kettle"));
    expect(target.container.querySelector(".wardley-label-input")).toBeNull();
    target.get<WardleyColorPicker>("wardleyColorPicker").open(shape(target, "Kettle"), 100, 100);
    expect(target.container.querySelector(".wardley-color-picker")).toBeNull();
    target.get<WardleyDrawTool>("wardleyDrawTool").activate();
    expect(target.get<WardleyDrawTool>("wardleyDrawTool").isActive()).toBe(false);
  });

  it("keeps the map against the edit keys, but selects all", async () => {
    const target = await mount();
    const before = target.exportDSL();
    lock(target);
    target.get<Selection>("selection").select(shape(target, "Kettle") as unknown as Element);
    press(target, "Delete");
    press(target, "Backspace");
    press(target, "ArrowRight");
    press(target, "c");
    press(target, "d", { ctrlKey: true });
    press(target, "v", { ctrlKey: true });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(target.exportDSL()).toBe(before);

    press(target, "a", { ctrlKey: true });
    expect(target.get<Selection>("selection").get().length).toBeGreaterThanOrEqual(3);
  });

  it("takes an open label editor down without saving it", async () => {
    const target = await mount();
    const before = target.exportDSL();
    target.get<WardleyLabelEditing>("wardleyLabelEditing").activate(shape(target, "Kettle"));
    const field = target.container.querySelector<HTMLTextAreaElement>(".wardley-label-input")!;
    field.value = "Typed, not saved";
    lock(target);
    expect(target.container.querySelector(".wardley-label-input")).toBeNull();
    expect(target.exportDSL()).toBe(before);
  });

  it("marks the container, so the handles hide", async () => {
    const target = await mount();
    lock(target);
    expect(target.container.classList.contains("wardley-read-only")).toBe(true);
    const resize = target.container.querySelector(".layer-wardley-map-resize")!;
    expect(getComputedStyle(resize).display).toBe("none");
    lock(target, false);
    expect(target.container.classList.contains("wardley-read-only")).toBe(false);
  });
});

describe("the reasons of the lock: the document and explore mode", () => {
  it("keeps the explore lock through the host's setReadOnly(false) of a valid import", async () => {
    const target = await mount();
    exploreLock(target);
    lock(target, false);
    expect(readOnlyOf(target).isLockedBy("explore")).toBe(true);
    expect(readOnlyOf(target).isReadOnly()).toBe(true);
    expect(movesAllowed(target)).toBe(false);

    lock(target);
    lock(target, false);
    expect(readOnlyOf(target).isLockedBy("explore")).toBe(true);
    expect(movesAllowed(target)).toBe(false);

    exploreLock(target, false);
    expect(readOnlyOf(target).isReadOnly()).toBe(false);
    expect(movesAllowed(target)).toBe(true);
  });

  it("keeps the document lock, its marks and its class when explore mode ends", async () => {
    const target = await mount();
    lock(target);
    exploreLock(target);
    exploreLock(target, false);
    const readOnly = readOnlyOf(target);
    expect(readOnly.isLockedBy("document")).toBe(true);
    expect(readOnly.isLockedBy("explore")).toBe(false);
    expect(readOnly.isReadOnly()).toBe(true);
    expect(readOnly.isReadOnlyShown()).toBe(true);
    expect(target.container.classList.contains("wardley-read-only")).toBe(true);
    expect(movesAllowed(target)).toBe(false);
  });

  it("is read-only while any reason holds", async () => {
    const target = await mount();
    const readOnly = readOnlyOf(target);
    const state = () => [
      readOnly.isLockedBy("document"),
      readOnly.isLockedBy("explore"),
      readOnly.isReadOnly(),
    ];
    expect(state()).toEqual([false, false, false]);
    exploreLock(target);
    expect(state()).toEqual([false, true, true]);
    lock(target);
    expect(state()).toEqual([true, true, true]);
    exploreLock(target, false);
    expect(state()).toEqual([true, false, true]);
    lock(target, false);
    expect(state()).toEqual([false, false, false]);
    expect(movesAllowed(target)).toBe(true);
  });

  it("shows only the document lock: the explore lock marks neither the container nor the palette", async () => {
    const target = await mount();
    const readOnly = readOnlyOf(target);
    const markedEntries = () =>
      target.container.querySelectorAll('.djs-palette .entry[aria-disabled="true"]').length;
    exploreLock(target);
    expect(readOnly.isReadOnlyShown()).toBe(false);
    expect(target.container.classList.contains("wardley-read-only")).toBe(false);
    expect(markedEntries()).toBe(0);

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      readOnly.setReadOnly(true, { delayMs: 800 });
      vi.advanceTimersByTime(799);
      expect(readOnly.isReadOnlyShown()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(readOnly.isReadOnlyShown()).toBe(true);
      expect(markedEntries()).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
    lock(target, false);
    expect(readOnly.isReadOnlyShown()).toBe(false);
    expect(markedEntries()).toBe(0);
  });

  it("vetoes the palette's entries without the shell for the document lock only", async () => {
    const target = await mount();
    const clicks: string[] = [];
    target.get<Palette>("palette").registerProvider({
      getPaletteEntries: () => ({
        "host.count": {
          group: "host",
          title: "Host entry",
          html: '<div class="entry">H</div>',
          action: { click: () => clicks.push("host.count") },
        },
      }),
    });
    const click = () =>
      target.container
        .querySelector<HTMLElement>('.djs-palette .entry[data-action="host.count"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    exploreLock(target);
    click();
    expect(clicks).toEqual(["host.count"]);
    lock(target);
    click();
    expect(clicks).toEqual(["host.count"]);
    lock(target, false);
    click();
    expect(clicks).toEqual(["host.count", "host.count"]);
  });

  it("ends what is open when explore mode locks an unlocked canvas", async () => {
    const target = await mount();
    const before = target.exportDSL();
    target.get<WardleyLabelEditing>("wardleyLabelEditing").activate(shape(target, "Kettle"));
    const field = target.container.querySelector<HTMLTextAreaElement>(".wardley-label-input")!;
    field.value = "Typed, not saved";
    exploreLock(target);
    expect(target.container.querySelector(".wardley-label-input")).toBeNull();
    expect(target.exportDSL()).toBe(before);
    target.get<WardleyDrawTool>("wardleyDrawTool").activate();
    expect(target.get<WardleyDrawTool>("wardleyDrawTool").isActive()).toBe(false);
  });

  it("hides the context pad under the document lock, but not while exploring", async () => {
    const target = await mount();
    lock(target);
    target.get<ContextPad>("contextPad").open(shape(target, "Kettle") as unknown as Element);
    const pad = target.container.querySelector(".djs-context-pad.open")!;
    expect(getComputedStyle(pad).display).toBe("none");
    target.container.classList.add("wardley-exploring");
    expect(getComputedStyle(pad).display).not.toBe("none");
  });

  it("fires a change with its reasons whenever a reason comes or goes, and none for a repeat", async () => {
    const target = await mount();
    const events = lockEvents(target);
    exploreLock(target);
    exploreLock(target);
    lock(target);
    lock(target);
    lock(target, false);
    lock(target, false);
    exploreLock(target, false);
    exploreLock(target, false);
    expect(events).toEqual([
      { readOnly: true, shown: false, reasons: ["explore"] },
      { readOnly: true, shown: true, reasons: ["document", "explore"] },
      { readOnly: true, shown: false, reasons: ["explore"] },
      { readOnly: false, shown: false, reasons: [] },
    ]);
  });

  it("names the reasons of a document lock alone, as before with readOnly and shown", async () => {
    const target = await mount();
    const events = lockEvents(target);
    lock(target);
    exploreLock(target);
    exploreLock(target, false);
    lock(target, false);
    expect(events).toEqual([
      { readOnly: true, shown: true, reasons: ["document"] },
      { readOnly: true, shown: true, reasons: ["document", "explore"] },
      { readOnly: true, shown: true, reasons: ["document"] },
      { readOnly: false, shown: false, reasons: [] },
    ]);
  });
});
