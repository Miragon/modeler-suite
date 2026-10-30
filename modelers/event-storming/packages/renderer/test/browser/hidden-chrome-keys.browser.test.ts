import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import { Modeler } from "../../src/index.js";
import {
  isEventStormingConnection,
  isEventStormingShape,
  type EventStormingConnection,
  type EventStormingShape,
} from "../../src/model/di-types.js";
import type EventStormingColorPicker from "../../src/color-picker/EventStormingColorPicker.js";
import type EventStormingLabelEditing from "../../src/label-editing/EventStormingLabelEditing.js";
import "../../src/assets/event-storming.css";

const DSL = `title Hidden chrome
command Place Order [200, 300]
event Order Placed [440, 300]
note Remember the budget [320, 520]
Place Order -> Order Placed`;

/**
 * The ways a host hides a board it keeps. The browser moves the focus off the hidden control only
 * at its next rendering update, so each case presses its keys at the still-focused control first.
 */
const hostHidings = [
  {
    how: "made it inert",
    hide: (host: HTMLElement) => (host.inert = true),
    show: (host: HTMLElement) => (host.inert = false),
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

describe("the board's own chrome on a board the host hides", () => {
  let host: HTMLElement;
  let modeler: Modeler;
  const keysAtWindow: string[] = [];
  const countKeyAtWindow = (event: KeyboardEvent) => keysAtWindow.push(event.key);

  beforeEach(async () => {
    host = document.createElement("div");
    const container = document.createElement("div");
    container.style.width = "1024px";
    container.style.height = "768px";
    host.appendChild(container);
    document.body.appendChild(host);
    modeler = new Modeler({ container });
    await modeler.importDSL(DSL);
    window.addEventListener("keydown", countKeyAtWindow);
  });

  afterEach(() => {
    window.removeEventListener("keydown", countKeyAtWindow);
    keysAtWindow.length = 0;
    modeler.destroy();
    host.remove();
  });

  function labelEditing(): EventStormingLabelEditing {
    return modeler.get<EventStormingLabelEditing>("eventStormingLabelEditing");
  }

  function shapeOfType(type: string): EventStormingShape {
    const shape = modeler
      .get<ElementRegistry>("elementRegistry")
      .find((element) => isEventStormingShape(element) && element.eventStormingType === type);
    if (!shape) throw new Error(`no ${type} on the board`);
    return shape as unknown as EventStormingShape;
  }

  function arrow(): EventStormingConnection {
    const connection = modeler
      .get<ElementRegistry>("elementRegistry")
      .find((element) => isEventStormingConnection(element));
    if (!connection) throw new Error("no arrow on the board");
    return connection as unknown as EventStormingConnection;
  }

  function openField(): HTMLElement {
    const field = host.querySelector<HTMLElement>(".event-storming-label-input");
    if (!field) throw new Error("no label editor open");
    expect(document.activeElement).toBe(field);
    return field;
  }

  function pressKey(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  /** Each key reaches the page untouched: not prevented and on to the window. */
  function expectLeftToPage(target: EventTarget, keys: readonly KeyboardEventInit[]): void {
    for (const init of keys) {
      const before = keysAtWindow.length;
      const name = `${init.ctrlKey ? "Ctrl+" : ""}${init.key}`;
      expect(pressKey(target, init).defaultPrevented, name).toBe(false);
      expect(keysAtWindow.length, `${name} at the window`).toBe(before + 1);
    }
  }

  it.each(hostHidings)(
    "the sticky editor neither saves nor closes once the host $how",
    ({ hide, show }) => {
      labelEditing().activate(shapeOfType("event"));
      const field = openField() as HTMLTextAreaElement;
      field.value = "Order Shipped";
      hide(host);

      expectLeftToPage(field, [
        { key: "Enter", ctrlKey: true },
        { key: "Escape" },
        { key: "ArrowDown" },
      ]);
      expect(field.isConnected).toBe(true);
      expect(modeler.exportDSL()).toContain("event Order Placed");

      show(host);
      expect(pressKey(field, { key: "Enter", ctrlKey: true }).defaultPrevented).toBe(true);
      expect(field.isConnected).toBe(false);
      expect(modeler.exportDSL()).toContain("event Order Shipped");
    },
  );

  it.each(hostHidings)(
    "the note editor neither saves, formats nor closes once the host $how",
    ({ hide, show }) => {
      labelEditing().activate(shapeOfType("note"));
      const editor = openField();
      hide(host);

      expectLeftToPage(editor, [
        { key: "Enter", ctrlKey: true },
        { key: "b", ctrlKey: true },
        { key: "Escape" },
      ]);
      expect(editor.isConnected).toBe(true);

      show(host);
      expect(pressKey(editor, { key: "Escape" }).defaultPrevented).toBe(true);
      expect(editor.isConnected).toBe(false);
    },
  );

  it.each(hostHidings)(
    "the arrow label editor neither saves nor closes once the host $how",
    ({ hide, show }) => {
      labelEditing().activateConnection(arrow());
      const field = openField() as HTMLInputElement;
      field.value = "always";
      hide(host);

      expectLeftToPage(field, [{ key: "Enter" }, { key: "Escape" }]);
      expect(field.isConnected).toBe(true);
      expect(arrow().linkLabel).toBeUndefined();

      show(host);
      expect(pressKey(field, { key: "Enter" }).defaultPrevented).toBe(true);
      expect(field.isConnected).toBe(false);
      expect(arrow().linkLabel).toBe("always");
    },
  );

  it.each(hostHidings)(
    "the colour picker stays open on Escape once the host $how",
    async ({ hide, show }) => {
      modeler
        .get<EventStormingColorPicker>("eventStormingColorPicker")
        .open(shapeOfType("event"), 200, 200);
      // The picker listens for Escape on the document from the next task on.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const picker = host.querySelector<HTMLElement>(".event-storming-color-picker")!;
      const swatch = picker.querySelector<HTMLButtonElement>("button")!;
      swatch.focus();
      hide(host);

      expectLeftToPage(swatch, [{ key: "Escape" }]);
      expect(picker.isConnected).toBe(true);

      show(host);
      pressKey(swatch, { key: "Escape" });
      expect(picker.isConnected).toBe(false);
    },
  );
});
