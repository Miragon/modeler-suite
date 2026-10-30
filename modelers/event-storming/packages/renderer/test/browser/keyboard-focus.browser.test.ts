import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element } from "diagram-js/lib/model/Types";
import { Modeler } from "../../src/index.js";
import type EventStormingDrawTool from "../../src/draw-tool/EventStormingDrawTool.js";
import { isEventStormingShape, type EventStormingShape } from "../../src/model/di-types.js";
import "../../src/assets/event-storming.css";

const DSL = `title Keyboard Fixture
command Place Order [300, 300]
event Order Placed [600, 300]
line [[200, 500], [400, 560], [600, 500]]`;

/**
 * Issue #91: the board's keys act only while the canvas itself has the focus, as diagram-js 15
 * binds its keyboard. These cases run without a shell around the canvas, as an embedding host does,
 * so the renderer alone has to hand the focus back after a pointer click on its own controls.
 */
describe("Event Storming keys act only on the focused canvas (no shell)", () => {
  let container: HTMLElement;
  let pageText: HTMLElement;
  let hostButton: HTMLButtonElement;
  let hostField: HTMLInputElement;
  let modeler: Modeler;

  beforeEach(async () => {
    await page.viewport(1280, 1024);
    pageText = document.createElement("p");
    pageText.textContent = "Some page text next to the board.";
    hostButton = document.createElement("button");
    hostButton.textContent = "Host button";
    hostField = document.createElement("input");
    hostField.setAttribute("aria-label", "Host field");
    container = document.createElement("div");
    document.body.append(pageText, hostButton, hostField, container);
    modeler = new Modeler({ container, width: 1024, height: 768, fitOnImport: false });
    await modeler.importDSL(DSL);
  });

  afterEach(async () => {
    // Off the palette first: its hover tooltip would otherwise show on the destroyed diagram.
    await userEvent.hover(pageText);
    modeler.destroy();
    container.remove();
    pageText.remove();
    hostButton.remove();
    hostField.remove();
  });

  const svg = () => container.querySelector<SVGSVGElement>(".djs-container > svg")!;
  const canvasHasFocus = () => document.activeElement === svg();
  const shapes = () =>
    modeler
      .get<ElementRegistry>("elementRegistry")
      .filter((element) => isEventStormingShape(element)) as EventStormingShape[];
  const shapeLabelled = (label: string) =>
    shapes().find((shape) => shape.eventStormingLabel === label)!;
  const drawing = () => shapes().find((shape) => shape.eventStormingType === "drawing")!;
  const gfx = (shape: EventStormingShape) =>
    modeler.get<ElementRegistry>("elementRegistry").getGraphics(shape) as unknown as SVGElement;
  const select = (shape: EventStormingShape) =>
    modeler.get<Selection>("selection").select(shape as unknown as Element);
  const drawTool = () => modeler.get<EventStormingDrawTool>("eventStormingDrawTool");
  const paletteEntry = (action: string) =>
    container.querySelector<HTMLElement>(`.djs-palette .entry[data-action="${action}"]`)!;
  const padEntry = (action: string) =>
    container.querySelector<HTMLElement>(`.djs-context-pad .entry[data-action="${action}"]`)!;
  const nextTask = () => new Promise((resolve) => setTimeout(resolve, 20));
  const canvasShowsRing = () => svg().matches(":focus-visible");
  // After a keyboard focus the browser rings the next focus a script moves, unless the script
  // says otherwise, as it does before the first mouse focus on the page.
  const tabToTheHostField = async () => {
    hostButton.focus();
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(hostField);
  };

  /** The two ways a host hides a board it keeps; the focus leaves it at the next rendering update. */
  const hostHidings = [
    {
      how: "made the board inert",
      hide: () => (container.inert = true),
      show: () => (container.inert = false),
    },
    {
      how: "hid the board with display: none",
      hide: () => (container.style.display = "none"),
      show: () => container.style.removeProperty("display"),
    },
  ];

  it("deletes the selection with the canvas focused, and not after a click on page text", async () => {
    const before = shapes().length;
    await userEvent.click(gfx(shapeLabelled("Place Order")));
    expect(canvasHasFocus()).toBe(true);
    await userEvent.keyboard("{Delete}");
    expect(shapes()).toHaveLength(before - 1);

    modeler.undo();
    await userEvent.click(pageText);
    expect(document.activeElement).toBe(document.body);
    select(shapeLabelled("Place Order"));
    await userEvent.keyboard("{Backspace}");
    expect(shapes()).toHaveLength(before);
    // The undone delete waits on the stack: redo from the page must not bring it back.
    await userEvent.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(shapes()).toHaveLength(before);
  });

  // The pause a host needs while it shows something else: a hidden canvas cannot keep the focus.
  it("leaves a canvas the host hid alone", async () => {
    const before = shapes().length;
    select(shapeLabelled("Place Order"));
    const hides = [
      { hide: () => (container.inert = true), show: () => (container.inert = false) },
      {
        hide: () => (container.style.display = "none"),
        show: () => (container.style.display = ""),
      },
    ];
    for (const { hide, show } of hides) {
      svg().focus();
      expect(canvasHasFocus()).toBe(true);
      hide();
      // The browser moves the focus off a hidden element at its next rendering update.
      await expect.poll(canvasHasFocus).toBe(false);
      await userEvent.keyboard("{Delete}");
      await userEvent.keyboard("{Backspace}");
      expect(shapes()).toHaveLength(before);
      show();
    }
  });

  it.each(hostHidings)(
    "leaves a key alone that reaches the canvas before the browser moves the focus off it, once the host $how",
    ({ hide }) => {
      const placeOrder = shapeLabelled("Place Order");
      select(placeOrder);
      svg().focus();
      hide();
      expect(canvasHasFocus()).toBe(true);
      const before = modeler.exportDSL();

      for (const init of [
        { key: "Delete" },
        { key: "Backspace" },
        { key: "ArrowLeft" },
        { key: "Escape" },
        { key: "l" },
        { key: "a", metaKey: true },
        { key: "z", ctrlKey: true },
        { key: "d", ctrlKey: true },
      ]) {
        const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
        svg().dispatchEvent(event);
        expect(event.defaultPrevented, init.key).toBe(false);
      }
      expect(modeler.exportDSL()).toBe(before);
      expect(modeler.get<Selection>("selection").get()).toEqual([placeOrder]);
    },
  );

  it.each(hostHidings)(
    "leaves Enter and Escape on its draw entry to the page once the host $how",
    async ({ hide, show }) => {
      const before = shapes().length;
      drawTool().activate();
      await userEvent.click(svg(), { position: { x: 700, y: 520 } });
      await userEvent.click(svg(), { position: { x: 800, y: 580 } });
      // The shell's palette makes its entries focusable, and Enter on the draw entry keeps the focus.
      const entry = paletteEntry("draw-tool");
      entry.tabIndex = 0;
      entry.focus();
      hide();
      expect(document.activeElement).toBe(entry);

      for (const key of ["Escape", "Enter"]) {
        const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
        entry.dispatchEvent(event);
        expect(event.defaultPrevented, key).toBe(false);
      }
      expect(drawTool().isActive()).toBe(true);
      expect(shapes()).toHaveLength(before);

      show();
      const escape = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      entry.dispatchEvent(escape);
      expect(escape.defaultPrevented).toBe(true);
      expect(drawTool().isActive()).toBe(false);
      expect(shapes()).toHaveLength(before + 1);
    },
  );

  /** The draw tool holding two points, and its palette entry focused, as the shell's palette does. */
  async function drawEntryFocusedWithALine(): Promise<HTMLElement> {
    drawTool().activate();
    await userEvent.click(svg(), { position: { x: 700, y: 520 } });
    await userEvent.click(svg(), { position: { x: 800, y: 580 } });
    const entry = paletteEntry("draw-tool");
    entry.tabIndex = 0;
    entry.focus();
    return entry;
  }

  // Enter and Space act alike on a palette entry (guide §5.5); the shell's palette would take
  // Space on the draw entry, toggle the tool off and drop the line (#438).
  it.each([
    ["Enter", "Enter"],
    ["Space", " "],
  ] as const)("saves the line with %s on its draw entry", async (_name, key) => {
    const before = shapes().length;
    const entry = await drawEntryFocusedWithALine();

    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    entry.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(drawTool().isActive()).toBe(false);
    expect(shapes()).toHaveLength(before + 1);
    expect(document.activeElement).toBe(entry);
  });

  it("leaves a Space with Ctrl, Alt or Meta on its draw entry to the page, and keeps the line", async () => {
    const before = shapes().length;
    const entry = await drawEntryFocusedWithALine();

    for (const modifier of ["ctrlKey", "altKey", "metaKey"] as const) {
      const space = new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
        [modifier]: true,
      });
      entry.dispatchEvent(space);
      expect(space.defaultPrevented, modifier).toBe(false);
    }
    expect(drawTool().holdsLine()).toBe(true);
    expect(shapes()).toHaveLength(before);
  });

  it("hands the focus to the canvas after a pointer click on a palette tool", async () => {
    await userEvent.click(paletteEntry("lasso-tool"));
    expect(canvasHasFocus()).toBe(true);
    await userEvent.keyboard("{Escape}");

    const before = shapes().length;
    select(shapeLabelled("Order Placed"));
    await userEvent.keyboard("{Delete}");
    expect(shapes()).toHaveLength(before - 1);
  });

  it("cancels the draw tool with Escape after a pointer click on its entry", async () => {
    await userEvent.click(paletteEntry("draw-tool"));
    expect(drawTool().isActive()).toBe(true);
    expect(canvasHasFocus()).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(drawTool().isActive()).toBe(false);
  });

  it("focuses the canvas on the first point and leaves a host field its Enter and Escape", async () => {
    const before = shapes().length;
    drawTool().activate();
    hostField.focus();
    await userEvent.click(svg(), { position: { x: 700, y: 520 } });
    expect(canvasHasFocus()).toBe(true);
    await userEvent.click(svg(), { position: { x: 800, y: 580 } });

    hostField.focus();
    await userEvent.keyboard("{Escape}{Enter}");
    expect(drawTool().isActive()).toBe(true);
    expect(shapes()).toHaveLength(before);

    await userEvent.click(svg(), { position: { x: 900, y: 520 } });
    await userEvent.keyboard("{Enter}");
    expect(drawTool().isActive()).toBe(false);
    expect(shapes()).toHaveLength(before + 1);
  });

  it("hands the focus to the canvas after the context pad's delete, so undo follows", async () => {
    const before = shapes().length;
    await userEvent.click(gfx(shapeLabelled("Place Order")));
    await userEvent.click(padEntry("delete"));
    expect(shapes()).toHaveLength(before - 1);
    expect(canvasHasFocus()).toBe(true);
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(shapes()).toHaveLength(before);
  });

  it("hands the focus to the canvas once the context pad's connect starts", async () => {
    await userEvent.click(gfx(shapeLabelled("Place Order")));
    await userEvent.click(padEntry("connect"));
    expect(canvasHasFocus()).toBe(true);
    await userEvent.keyboard("{Escape}");
  });

  // Without a shell the entries take no focus, so a plain script focus would ring the canvas.
  describe("hands the focus over without the keyboard focus ring", () => {
    it("from a palette tool", async () => {
      await tabToTheHostField();
      await userEvent.click(paletteEntry("lasso-tool"));
      expect(canvasHasFocus()).toBe(true);
      expect(canvasShowsRing()).toBe(false);
      await userEvent.keyboard("{Escape}");
    });

    it("from the Draw entry", async () => {
      await tabToTheHostField();
      await userEvent.click(paletteEntry("draw-tool"));
      expect(canvasHasFocus()).toBe(true);
      expect(canvasShowsRing()).toBe(false);
      await userEvent.keyboard("{Escape}");
    });

    it("on a point of the draw tool", async () => {
      drawTool().activate();
      await tabToTheHostField();
      await userEvent.click(svg(), { position: { x: 700, y: 520 } });
      expect(canvasHasFocus()).toBe(true);
      expect(canvasShowsRing()).toBe(false);
      await userEvent.keyboard("{Escape}");
    });

    it("from the context pad", async () => {
      select(shapeLabelled("Place Order"));
      modeler
        .get<ContextPad>("contextPad")
        .open(shapeLabelled("Place Order") as unknown as Element);
      await tabToTheHostField();
      await userEvent.click(padEntry("delete"));
      expect(canvasHasFocus()).toBe(true);
      expect(canvasShowsRing()).toBe(false);
    });
  });

  it("hands the focus back to the canvas once a colour is picked", async () => {
    select(drawing());
    modeler.get<ContextPad>("contextPad").open(drawing() as unknown as Element);
    await userEvent.click(padEntry("color"));
    await nextTask();
    const swatch = container.querySelector<HTMLElement>(".event-storming-cp-swatch:nth-child(2)")!;
    await userEvent.click(swatch);
    await nextTask();
    expect(drawing().color).toBeDefined();
    expect(canvasHasFocus()).toBe(true);
    expect(canvasShowsRing()).toBe(false);
  });
});
