/// <reference types="@vitest/browser-playwright" />
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cdp } from "vitest/browser";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import {
  Modeler,
  STICKY_STYLES,
  createCollaborativeModeler,
  type CollaborativeEventStormingModeler,
} from "../../src/index.js";
import {
  isEventStormingConnection,
  isEventStormingShape,
  type EventStormingConnection,
  type EventStormingShape,
} from "../../src/model/di-types.js";
import type EventStormingLabelEditing from "../../src/label-editing/EventStormingLabelEditing.js";
import { noteMarkdownToDom } from "../../src/label-editing/note-editor-dom.js";
import "../../src/assets/event-storming.css";

const DSL = `title Inline editors
command Place Order [200, 300]
event Order Placed [440, 300]
event Order Paid [680, 300]
note Remember the budget [320, 520]
hotspot Who refunds? [680, 520]
Place Order -> Order Placed`;

type Editor = "sticky" | "note" | "arrow label";

const EDITORS: readonly Editor[] = ["sticky", "note", "arrow label"];

/** CDP's modifier bit for Ctrl, the save key the multi-line editors take with Enter. */
const CTRL = 2;

const page = document.documentElement;

/**
 * Forced colours on a dark contrast theme, as Windows' Night sky: Chromium's Canvas is then black,
 * so a band in the light field surface tells apart from one in Canvas.
 */
const DARK_FORCED_COLOURS = [
  { name: "forced-colors", value: "active" },
  { name: "prefers-color-scheme", value: "dark" },
];

function pressKey(target: EventTarget, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
}

/** An input method composing in the focused field, driven through Chromium's own IME input. */
const inputMethod = {
  async compose(text: string): Promise<void> {
    await cdp().send("Input.imeSetComposition", {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
  },
  async press(key: "Enter" | "Escape", modifiers = 0): Promise<void> {
    const keyCode = key === "Enter" ? 13 : 27;
    for (const type of ["rawKeyDown", "keyUp"] as const) {
      await cdp().send("Input.dispatchKeyEvent", {
        type,
        key,
        code: key,
        windowsVirtualKeyCode: keyCode,
        modifiers,
      });
    }
  },
  async confirm(text: string): Promise<void> {
    await cdp().send("Input.insertText", { text });
  },
};

/** A colour as the browser computes it, resolved where the editors resolve their roles. */
function computedColour(scope: HTMLElement, colour: string): string {
  const probe = document.createElement("span");
  probe.style.color = colour;
  scope.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

function focusRing(field: HTMLElement): {
  style: string;
  width: string;
  offset: string;
  colour: string;
} {
  const style = getComputedStyle(field);
  return {
    style: style.outlineStyle,
    width: style.outlineWidth,
    offset: style.outlineOffset,
    colour: style.outlineColor,
  };
}

/** A colour as the browser resolves it, read where forced colours do not replace it. */
function unforcedColour(colour: string): string {
  const probe = document.createElement("span");
  probe.style.forcedColorAdjust = "none";
  probe.style.color = colour;
  document.body.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

/** The first shadow a field draws, the solid band of its surface right outside its border. */
function surfaceBand(field: HTMLElement): string {
  const [first] = getComputedStyle(field).boxShadow.split(/,(?![^(]*\))/);
  return first?.trim() ?? "none";
}

/** The box the focus ring draws around `field`, outside its border. */
function ringBox(field: HTMLElement): { top: number; bottom: number } {
  const ring = getComputedStyle(field);
  const reach = parseFloat(ring.outlineOffset) + parseFloat(ring.outlineWidth);
  const box = field.getBoundingClientRect();
  return { top: box.top - reach, bottom: box.bottom + reach };
}

/** Lets a layout and the resize observations after it run. */
async function nextFrames(): Promise<void> {
  for (let frame = 0; frame < 2; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

describe("the inline label editors of a board", () => {
  let container: HTMLElement;
  let modeler: Modeler;

  function labelEditing(): EventStormingLabelEditing {
    return modeler.get<EventStormingLabelEditing>("eventStormingLabelEditing");
  }

  /** "Order Placed", by the id its label derives, which a rename keeps. */
  function sticky(): EventStormingShape {
    const shape = modeler.get<ElementRegistry>("elementRegistry").get("event_order_placed");
    if (!isEventStormingShape(shape)) throw new Error("no sticky Order Placed on the board");
    return shape;
  }

  function note(): EventStormingShape {
    const shape = modeler
      .get<ElementRegistry>("elementRegistry")
      .find((element) => isEventStormingShape(element) && element.eventStormingType === "note");
    if (!shape) throw new Error("no note on the board");
    return shape as unknown as EventStormingShape;
  }

  function hotspot(): EventStormingShape {
    const shape = modeler
      .get<ElementRegistry>("elementRegistry")
      .find((element) => isEventStormingShape(element) && element.eventStormingType === "hotspot");
    if (!shape) throw new Error("no hotspot on the board");
    return shape as unknown as EventStormingShape;
  }

  function arrow(): EventStormingConnection {
    const connection = modeler
      .get<ElementRegistry>("elementRegistry")
      .find((element) => isEventStormingConnection(element));
    if (!connection) throw new Error("no arrow on the board");
    return connection as unknown as EventStormingConnection;
  }

  function openField(): HTMLElement | null {
    return container.querySelector(".event-storming-label-input");
  }

  function open(editor: Editor): HTMLElement {
    if (editor === "sticky") labelEditing().activate(sticky());
    else if (editor === "note") labelEditing().activate(note());
    else labelEditing().activateConnection(arrow());
    const field = openField();
    if (!field) throw new Error(`the ${editor} editor did not open`);
    expect(document.activeElement).toBe(field);
    return field;
  }

  function typed(): string | undefined {
    return labelEditing().openEdit()?.value;
  }

  beforeEach(async () => {
    container = document.createElement("div");
    container.style.width = "1024px";
    container.style.height = "768px";
    document.body.appendChild(container);
    modeler = new Modeler({ container });
    await modeler.importDSL(DSL);
  });

  afterEach(async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
    page.removeAttribute("data-cd-kontrast");
    modeler.destroy();
    container.remove();
  });

  describe("an input method that is composing (#355)", () => {
    const COMPOSING_EDITORS = [
      {
        editor: "sticky",
        saveModifiers: CTRL,
        composed: "注文確定",
        saved: () => sticky().eventStormingLabel,
        line: "event 注文確定 [",
      },
      {
        editor: "note",
        saveModifiers: CTRL,
        composed: "予算を確認",
        saved: () => note().eventStormingLabel,
        line: "note 予算を確認 [",
      },
      {
        editor: "arrow label",
        saveModifiers: 0,
        composed: "要確認",
        saved: () => arrow().linkLabel,
        line: "Place Order -> Order Placed; 要確認",
      },
    ] as const;

    it.each(COMPOSING_EDITORS)(
      "leaves the save key and Escape to the composition in the $editor editor, then saves",
      async ({ editor, saveModifiers, composed, saved, line }) => {
        const before = modeler.exportDSL();
        const savedBefore = saved();
        const field = open(editor);
        const compositionEnds: string[] = [];
        field.addEventListener("compositionend", (event) =>
          compositionEnds.push((event as CompositionEvent).data),
        );

        await inputMethod.compose("かくにん");
        await inputMethod.press("Enter", saveModifiers);
        await inputMethod.press("Escape");
        expect(openField()).toBe(field);
        expect(typed()).toBe("かくにん");
        expect(saved()).toBe(savedBefore);

        await inputMethod.confirm(composed);
        expect(compositionEnds).toEqual([composed]);
        // Safari sends the Enter or Escape that ended the composition after compositionend.
        pressKey(field, { key: "Enter", keyCode: 229 });
        pressKey(field, { key: "Escape", keyCode: 229 });
        expect(openField()).toBe(field);
        expect(typed()).toBe(composed);
        expect(modeler.exportDSL()).toBe(before);

        await inputMethod.press("Enter", saveModifiers);
        expect(openField()).toBeNull();
        expect(saved()).toBe(composed);
        expect(modeler.exportDSL()).toContain(line);
      },
    );

    it.each(COMPOSING_EDITORS)(
      "still discards on an Escape after the composition in the $editor editor",
      async ({ editor, composed, saved }) => {
        const before = modeler.exportDSL();
        const savedBefore = saved();
        const field = open(editor);
        await inputMethod.compose("かくにん");
        await inputMethod.confirm(composed);

        await inputMethod.press("Escape");
        expect(openField()).toBeNull();
        expect(saved()).toBe(savedBefore);
        expect(modeler.exportDSL()).toBe(before);
        expect(field.isConnected).toBe(false);
      },
    );
  });

  describe("the focus ring (#356, guide §8)", () => {
    it.each(EDITORS)("shows the ring around the %s editor, next to its accent border", (editor) => {
      const field = open(editor);
      expect(focusRing(field)).toEqual({
        style: "solid",
        width: "2px",
        offset: "2px",
        colour: computedColour(container, "var(--cd-ui-fokus)"),
      });
      expect(getComputedStyle(field).borderTopColor).toBe(
        computedColour(container, "var(--cd-ui-interaktion)"),
      );
    });

    it.each(EDITORS)("keeps the field's surface between the %s editor and its ring", (editor) => {
      const field = open(editor);
      expect(surfaceBand(field)).toBe(
        `${computedColour(container, "var(--cd-ui-flaeche-hoch)")} 0px 0px 0px 2px`,
      );
    });

    it("lays the field's surface, not the fill, inside the ring where it crosses a hotspot", () => {
      modeler.get<Canvas>("canvas").zoom(1);
      const spot = hotspot();
      labelEditing().activate(spot);
      const field = openField();
      if (!field) throw new Error("the hotspot's editor did not open");
      const element = modeler.get<ElementRegistry>("elementRegistry").getGraphics(spot);
      const toScreen = (element as unknown as SVGGraphicsElement).getScreenCTM();
      if (!toScreen) throw new Error("the hotspot is not on the screen");
      const spotTop = toScreen.f;
      const spotBottom = toScreen.f + spot.height * toScreen.d;
      // The ring's top and bottom rows lie on the hotspot's fill, which the ring reaches only 1.95:1
      // against: the band of the field's surface gives the ring a neighbour it contrasts with.
      expect(ringBox(field).top).toBeGreaterThan(spotTop);
      expect(ringBox(field).bottom).toBeLessThan(spotBottom);
      expect(surfaceBand(field)).toBe(
        `${computedColour(container, "var(--cd-ui-flaeche-hoch)")} 0px 0px 0px ${focusRing(field).offset}`,
      );
    });

    it.each(EDITORS)("widens the ring of the %s editor to 3px in high contrast", (editor) => {
      page.setAttribute("data-cd-kontrast", "hoch");
      const field = open(editor);
      expect(focusRing(field)).toMatchObject({ style: "solid", width: "3px", offset: "2px" });
      expect(getComputedStyle(field).boxShadow).toBe(
        `${computedColour(container, "var(--cd-ui-flaeche-hoch)")} 0px 0px 0px 2px`,
      );
    });

    describe("in forced colours (guide §5.14)", () => {
      beforeEach(async () => {
        await cdp().send("Emulation.setEmulatedMedia", { features: DARK_FORCED_COLOURS });
      });

      function expectSystemColours(field: HTMLElement, ringWidth: string): void {
        const style = getComputedStyle(field);
        expect(style.forcedColorAdjust).toBe("none");
        expect(focusRing(field)).toEqual({
          style: "solid",
          width: ringWidth,
          offset: "2px",
          colour: unforcedColour("Highlight"),
        });
        expect(style.boxShadow).toBe(`${unforcedColour("Canvas")} 0px 0px 0px 2px`);
        expect(style.backgroundColor).toBe(unforcedColour("Canvas"));
        expect(style.color).toBe(unforcedColour("CanvasText"));
        expect(style.borderTopColor).toBe(unforcedColour("Highlight"));
        expectSelectionInHighlight(field);
      }

      /** Every editor opens with all its text selected, the first thing a user sees of it. */
      function expectSelectionInHighlight(element: Element): void {
        const selection = getComputedStyle(element, "::selection");
        expect(selection.backgroundColor).toBe(unforcedColour("Highlight"));
        expect(selection.color).toBe(unforcedColour("HighlightText"));
      }

      it.each(EDITORS)(
        "draws the %s editor in system colours, its ring in Highlight around a band of Canvas",
        (editor) => {
          expectSystemColours(open(editor), "2px");
        },
      );

      it("paints the selected text of the note editor's lines and runs in Highlight", () => {
        const field = open("note");
        noteMarkdownToDom(field, "**Remember** the budget\n- for the workshop");
        const runs = [...field.querySelectorAll("div, b")];
        expect(runs.map((run) => run.tagName)).toEqual(["DIV", "B", "DIV"]);
        for (const run of runs) expectSelectionInHighlight(run);
      });

      it("shows the arrow label's placeholder in GrayText", () => {
        const field = open("arrow label");
        expect(getComputedStyle(field, "::placeholder").color).toBe(unforcedColour("GrayText"));
      });

      it("keeps the band of Canvas inside the ring where it crosses a hotspot, whose fill stays", () => {
        modeler.get<Canvas>("canvas").zoom(1);
        const spot = hotspot();
        labelEditing().activate(spot);
        const field = openField();
        if (!field) throw new Error("the hotspot's editor did not open");
        const graphics = modeler.get<ElementRegistry>("elementRegistry").getGraphics(spot);
        const fill = graphics.querySelector("rect");
        if (!fill) throw new Error("the hotspot draws no fill");
        expect(getComputedStyle(fill).fill).toBe(unforcedColour(STICKY_STYLES.hotspot.fill));
        const toScreen = (graphics as unknown as SVGGraphicsElement).getScreenCTM();
        if (!toScreen) throw new Error("the hotspot is not on the screen");
        expect(ringBox(field).top).toBeGreaterThan(toScreen.f);
        expect(ringBox(field).bottom).toBeLessThan(toScreen.f + spot.height * toScreen.d);
        expectSystemColours(field, "2px");
      });

      it.each(EDITORS)(
        "keeps the band of Canvas around the %s editor in high contrast, with the 3px ring",
        (editor) => {
          page.setAttribute("data-cd-kontrast", "hoch");
          expectSystemColours(open(editor), "3px");
        },
      );
    });
  });

  describe("the popups of an inline editor (#356, guide §8: no floating chrome over the ring)", () => {
    for (const contrast of ["normal", "high"] as const) {
      it(`keeps the label suggestions below the sticky editor's ring in ${contrast} contrast`, () => {
        if (contrast === "high") page.setAttribute("data-cd-kontrast", "hoch");
        const field = open("sticky") as HTMLTextAreaElement;
        field.value = "Order";
        field.dispatchEvent(new Event("input"));
        const list = container.querySelector<HTMLElement>(".event-storming-label-suggestions");
        if (!list) throw new Error("the label suggestions did not open");
        expect(list.getBoundingClientRect().top).toBeGreaterThan(ringBox(field).bottom);
      });

      it(`keeps the note toolbar above the note editor's ring in ${contrast} contrast`, async () => {
        if (contrast === "high") page.setAttribute("data-cd-kontrast", "hoch");
        const editor = open("note");
        const toolbar = container.querySelector<HTMLElement>(".event-storming-note-toolbar");
        if (!toolbar) throw new Error("the note toolbar did not open");
        expect(toolbar.getBoundingClientRect().bottom).toBeLessThan(ringBox(editor).top);

        noteMarkdownToDom(editor, "Remember\nthe\nbudget\nfor\nthe\nworkshop\nand\nthe\ntravel");
        await nextFrames();
        expect(editor.getBoundingClientRect().height).toBeGreaterThan(note().height);
        expect(toolbar.getBoundingClientRect().bottom).toBeLessThan(ringBox(editor).top);
      });
    }
  });
});

describe("the focus ring of an inline label editor under a host's appearance (#356)", () => {
  const modelers: CollaborativeEventStormingModeler[] = [];
  const wrappers: HTMLElement[] = [];

  afterEach(async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
    page.removeAttribute("data-cd-theme");
    page.removeAttribute("data-cd-kontrast");
    for (const modeler of modelers.splice(0)) modeler.destroy();
    for (const wrapper of wrappers.splice(0)) wrapper.remove();
  });

  async function stickyEditorOf(modeler: CollaborativeEventStormingModeler): Promise<HTMLElement> {
    const host = attachedHost();
    wrappers.push(host.parentElement ?? host);
    modeler.attachTo(host);
    modelers.push(modeler);
    await modeler.importText(DSL);
    const sticky = modeler.diagram
      .get<ElementRegistry>("elementRegistry")
      .find((element) => isEventStormingShape(element) && element.eventStormingType === "event");
    modeler.diagram
      .get<EventStormingLabelEditing>("eventStormingLabelEditing")
      .activate(sticky as unknown as EventStormingShape);
    const field = host.querySelector<HTMLElement>(".event-storming-label-input");
    if (!field) throw new Error("no sticky editor opened");
    return field;
  }

  it("is 3px for a request of high contrast, also on a page in normal contrast", async () => {
    const modeler = createCollaborativeModeler();
    modeler.appearance.set({ theme: "light", contrast: "high" });
    const field = await stickyEditorOf(modeler);
    expect(focusRing(field)).toMatchObject({ style: "solid", width: "3px", offset: "2px" });
    expect(getComputedStyle(field).boxShadow).toBe(
      `${computedColour(field.parentElement ?? document.body, "var(--cd-ui-flaeche-hoch)")} 0px 0px 0px 2px`,
    );
  });

  it("keeps the band of Canvas for a request of high contrast in forced colours", async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: DARK_FORCED_COLOURS });
    const modeler = createCollaborativeModeler();
    modeler.appearance.set({ theme: "light", contrast: "high" });
    const field = await stickyEditorOf(modeler);
    expect(focusRing(field)).toEqual({
      style: "solid",
      width: "3px",
      offset: "2px",
      colour: unforcedColour("Highlight"),
    });
    expect(getComputedStyle(field).boxShadow).toBe(`${unforcedColour("Canvas")} 0px 0px 0px 2px`);
  });

  it("stays 2px for a request of normal contrast on a high-contrast page", async () => {
    page.setAttribute("data-cd-theme", "dark");
    page.setAttribute("data-cd-kontrast", "hoch");
    const modeler = createCollaborativeModeler();
    modeler.appearance.set({ theme: "light", contrast: "normal" });
    const field = await stickyEditorOf(modeler);
    expect(focusRing(field)).toMatchObject({ style: "solid", width: "2px", offset: "2px" });
  });
});
