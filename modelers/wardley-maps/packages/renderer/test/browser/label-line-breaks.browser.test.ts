import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import { Modeler } from "../../src/index.js";
import { isWardleyShape, type WardleyShape } from "../../src/model/di-types.js";
import {
  LABEL_LINE_HEIGHT,
  anchorLabelSlot,
  componentLabelSlot,
} from "../../src/draw/label-layout.js";
import type WardleyLabelEditing from "../../src/label-editing/WardleyLabelEditing.js";
import "../../src/assets/wardley.css";

const DSL = `title Line breaks
anchor Customer\\nPortal [0.95, 0.45]
component Platform [0.55, 0.62]
component Payment\\nGateway [0.4, 0.3] (buy)
note Remember the budget [0.30, 0.20]
Customer\\nPortal -> Platform
Platform -> Payment\\nGateway`;

const SHIFT_ENTER = "{Shift>}{Enter}{/Shift}";

describe("Line breaks in names (real browser DOM)", () => {
  let container: HTMLElement;
  let modeler: Modeler;

  function shapeLabeled(label: string): WardleyShape {
    const shape = modeler
      .get<ElementRegistry>("elementRegistry")
      .find((el) => isWardleyShape(el) && el.wardleyLabel === label);
    if (!shape) throw new Error(`shape not found: ${label}`);
    return shape as unknown as WardleyShape;
  }

  function open(label: string): HTMLTextAreaElement {
    modeler.get<WardleyLabelEditing>("wardleyLabelEditing").activate(shapeLabeled(label));
    const field = document.querySelector<HTMLTextAreaElement>("textarea.wardley-label-input");
    if (!field) throw new Error("no label editor opened");
    return field;
  }

  function lineHeightOf(field: HTMLTextAreaElement): number {
    return Number.parseFloat(getComputedStyle(field).lineHeight);
  }

  function caretToEnd(field: HTMLTextAreaElement): void {
    field.setSelectionRange(field.value.length, field.value.length);
  }

  function nameText(label: string): SVGTextElement {
    const gfx = modeler.get<Canvas>("canvas").getGraphics(shapeLabeled(label));
    return gfx.querySelector<SVGTextElement>(".wardley-name-label")!;
  }

  function lineBaselines(text: SVGTextElement): number[] {
    const rows = [...text.querySelectorAll("tspan")];
    return rows.length
      ? rows.map((row) => Number(row.getAttribute("y")))
      : [Number(text.getAttribute("y"))];
  }

  beforeEach(async () => {
    container = document.createElement("div");
    container.style.width = "1024px";
    container.style.height = "768px";
    document.body.appendChild(container);
    modeler = new Modeler({ container });
    await modeler.importDSL(DSL);
  });

  afterEach(() => {
    modeler.destroy();
    container.remove();
  });

  describe("the editor", () => {
    it("is a textarea for a name, as it is for a note", () => {
      for (const label of ["Platform", "Customer\nPortal", "Remember the budget"]) {
        const field = open(label);
        expect(field.tagName).toBe("TEXTAREA");
        expect(field.value).toBe(label);
        field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }
    });

    it("breaks the line on Shift+Enter, keeps the focus and the caret, and grows with the lines", async () => {
      const field = open("Platform");
      const oneLine = field.getBoundingClientRect();
      caretToEnd(field);

      await userEvent.keyboard(SHIFT_ENTER);
      expect(field.value).toBe("Platform\n");
      await userEvent.keyboard("Core");

      expect(document.activeElement).toBe(field);
      expect(field.value).toBe("Platform\nCore");
      expect(field.selectionStart).toBe(field.value.length);
      expect(field.selectionEnd).toBe(field.value.length);
      expect(field.scrollTop).toBe(0);
      const twoLines = field.getBoundingClientRect();
      expect(twoLines.height).toBeCloseTo(oneLine.height + lineHeightOf(field), 1);
      expect(twoLines.top + twoLines.height / 2).toBeCloseTo(oneLine.top + oneLine.height / 2, 0);
      expect(shapeLabeled("Platform").wardleyLabel).toBe("Platform");
      expect(field.matches(":focus-visible")).toBe(true);
      expect(getComputedStyle(field).outlineStyle).toBe("none");
    });

    it("saves the lines on Enter", async () => {
      const field = open("Platform");
      caretToEnd(field);
      await userEvent.keyboard(`${SHIFT_ENTER}Core{Enter}`);

      expect(document.querySelector(".wardley-label-input")).toBeNull();
      expect(shapeLabeled("Platform\nCore")).toBeDefined();
      expect(modeler.exportDSL()).toContain("component Platform\\nCore [0.55, 0.62]");
      expect(modeler.exportDSL()).toContain("Customer\\nPortal -> Platform\\nCore");
    });

    it("discards the lines on Escape", async () => {
      const field = open("Platform");
      caretToEnd(field);
      await userEvent.keyboard(`${SHIFT_ENTER}Core{Escape}`);

      expect(document.querySelector(".wardley-label-input")).toBeNull();
      expect(shapeLabeled("Platform").wardleyLabel).toBe("Platform");
      expect(modeler.exportDSL()).toContain("component Platform [0.55, 0.62]");
    });

    it("keeps the line breaks of pasted text", async () => {
      const field = open("Platform");
      field.select();
      document.execCommand("insertText", false, "Pasted\nin three\nlines");
      expect(field.value).toBe("Pasted\nin three\nlines");
      const threeLines = field.getBoundingClientRect().height;
      expect(threeLines).toBeGreaterThan(3 * lineHeightOf(field));

      await userEvent.keyboard("{Enter}");
      expect(modeler.exportDSL()).toContain("component Pasted\\nin three\\nlines [0.55, 0.62]");
    });

    it("trims the breaks around the name and keeps the name for an empty one", async () => {
      const field = open("Platform");
      field.select();
      document.execCommand("insertText", false, "\n\nCore\nSystem\n\n");
      await userEvent.keyboard("{Enter}");
      expect(shapeLabeled("Core\nSystem")).toBeDefined();

      const again = open("Core\nSystem");
      again.select();
      document.execCommand("insertText", false, "\n\n");
      await userEvent.keyboard("{Enter}");
      expect(shapeLabeled("Core\nSystem")).toBeDefined();
      expect(document.querySelector(".wardley-label-input")).toBeNull();
    });

    it("keeps a line break in the name when focus leaves", async () => {
      const field = open("Platform");
      caretToEnd(field);
      await userEvent.keyboard(`${SHIFT_ENTER}Core`);
      field.blur();
      expect(shapeLabeled("Platform\nCore")).toBeDefined();
    });

    it("refuses a taken name with line breaks on Enter and shows the error", async () => {
      const field = open("Platform");
      field.select();
      document.execCommand("insertText", false, "Customer\nPortal");
      await userEvent.keyboard("{Enter}");

      expect(document.querySelector("textarea.wardley-label-input")).toBe(field);
      expect(field.classList.contains("wardley-label-input--error")).toBe(true);
      expect(shapeLabeled("Platform").wardleyLabel).toBe("Platform");
    });

    it("sits over a label of several lines", () => {
      const label = nameText("Payment\nGateway");
      const labelBox = label.getBoundingClientRect();
      const field = open("Payment\nGateway");
      const fieldBox = field.getBoundingClientRect();

      expect(getComputedStyle(label).visibility).toBe("hidden");
      expect(fieldBox.left).toBeLessThanOrEqual(labelBox.left);
      expect(fieldBox.right).toBeGreaterThanOrEqual(labelBox.right);
      expect(fieldBox.top).toBeLessThanOrEqual(labelBox.top + 2);
      expect(fieldBox.bottom).toBeGreaterThanOrEqual(labelBox.bottom - 2);
    });

    it("keeps notes as they were: Enter breaks, Cmd or Ctrl+Enter saves", async () => {
      const field = open("Remember the budget");
      caretToEnd(field);
      await userEvent.keyboard("{Enter}twice");
      expect(document.activeElement).toBe(field);
      expect(field.value).toBe("Remember the budget\ntwice");

      await userEvent.keyboard("{Control>}{Enter}{/Control}");
      expect(document.querySelector(".wardley-label-input")).toBeNull();
      expect(shapeLabeled("Remember the budget\ntwice")).toBeDefined();
    });
  });

  describe("the label", () => {
    it("draws every line of a name, as tspans of one text", () => {
      const text = nameText("Payment\nGateway");
      const rows = [...text.querySelectorAll("tspan")];
      expect(rows.map((row) => row.textContent)).toEqual(["Payment", "Gateway"]);
      expect(rows.map((row) => row.getAttribute("x"))).toEqual(
        rows.map(() => text.getAttribute("x")),
      );
      const [first, second] = lineBaselines(text);
      expect(second! - first!).toBe(LABEL_LINE_HEIGHT);
    });

    it("centres the lines of a component name on the slot of a single line", () => {
      const shape = shapeLabeled("Payment\nGateway");
      const [first, second] = lineBaselines(nameText("Payment\nGateway"));
      expect((first! + second!) / 2).toBe(shape.height / 2 + componentLabelSlot().y);
    });

    it("keeps the last line of an anchor's name on the slot above its icon", () => {
      const shape = shapeLabeled("Customer\nPortal");
      const lines = lineBaselines(nameText("Customer\nPortal"));
      expect(lines).toHaveLength(2);
      expect(lines[1]).toBe(shape.height / 2 + anchorLabelSlot().y);
    });

    it("writes the sourcing method under the last line", () => {
      const gfx = modeler.get<Canvas>("canvas").getGraphics(shapeLabeled("Payment\nGateway"));
      const method = [...gfx.querySelectorAll("text")].find((text) => text.textContent === "buy")!;
      const lines = [...nameText("Payment\nGateway").querySelectorAll("tspan")];
      expect(method.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        lines[1]!.getBoundingClientRect().bottom - 4,
      );
    });

    it("draws a name of one line as before: a text without tspans", () => {
      expect(nameText("Platform").querySelector("tspan")).toBeNull();
      expect(nameText("Platform").textContent).toBe("Platform");
    });
  });
});
