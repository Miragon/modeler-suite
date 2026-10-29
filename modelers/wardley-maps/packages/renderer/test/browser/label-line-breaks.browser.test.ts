import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import { Modeler } from "../../src/index.js";
import { isWardleyShape, type WardleyShape } from "../../src/model/di-types.js";
import {
  LABEL_LINE_HEIGHT,
  anchorLabelSlot,
  componentLabelSlot,
} from "../../src/draw/label-layout.js";
import { FONT } from "../../src/draw/styles.js";
import type WardleyLabelEditing from "../../src/label-editing/WardleyLabelEditing.js";
import type WardleyModeling from "../../src/modeling/WardleyModeling.js";
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

  function shapeOfType(type: WardleyShape["wardleyType"], label: string): WardleyShape {
    const shape = modeler
      .get<ElementRegistry>("elementRegistry")
      .find((el) => isWardleyShape(el) && el.wardleyType === type && el.wardleyLabel === label);
    if (!shape) throw new Error(`${type} not found: ${label}`);
    return shape as unknown as WardleyShape;
  }

  const componentLabeled = (label: string) => shapeOfType("component", label);
  const pipelineLabeled = (label: string) => shapeOfType("pipeline", label);

  function canvasGraphics(shape: WardleyShape): SVGElement {
    return modeler.get<Canvas>("canvas").getGraphics(shape);
  }

  function nameText(label: string): SVGTextElement {
    return canvasGraphics(shapeLabeled(label)).querySelector<SVGTextElement>(
      ".wardley-name-label",
    )!;
  }

  function componentText(label: string): SVGTextElement {
    return canvasGraphics(componentLabeled(label)).querySelector<SVGTextElement>(
      ".wardley-name-label",
    )!;
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
      const accent = document.createElement("div");
      accent.style.borderColor = "var(--cd-ui-interaktion)";
      container.appendChild(accent);
      expect(getComputedStyle(field).borderTopColor).toBe(getComputedStyle(accent).borderTopColor);
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

    it("leaves Enter and Escape to an input method that is composing", () => {
      const field = open("Platform");
      field.value = "Plat";
      const keys: KeyboardEventInit[] = [
        { key: "Enter", isComposing: true },
        { key: "Enter", isComposing: false, keyCode: 229 },
        { key: "Escape", isComposing: true },
      ];
      for (const key of keys) {
        field.dispatchEvent(new KeyboardEvent("keydown", { ...key, bubbles: true }));
        expect(document.querySelector("textarea.wardley-label-input")).toBe(field);
        expect(field.value).toBe("Plat");
      }
      expect(shapeLabeled("Platform").wardleyLabel).toBe("Platform");

      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      expect(document.querySelector(".wardley-label-input")).toBeNull();
      expect(shapeLabeled("Plat")).toBeDefined();
    });

    it("writes a backslash before n in a name as a look-alike, so the name survives a reload", async () => {
      const field = open("Platform");
      field.select();
      await userEvent.keyboard("C:\\new{Enter}");

      expect(shapeLabeled("C:∖new")).toBeDefined();
      const text = modeler.exportDSL();
      expect(text).toContain("component C:∖new [0.55, 0.62]");
      await modeler.importDSL(text);
      expect(shapeLabeled("C:∖new")).toBeDefined();
      expect(modeler.exportDSL()).toBe(text);
    });

    it("keeps a typed backslash before n apart from the same name with a line break", async () => {
      const field = open("Platform");
      field.select();
      await userEvent.keyboard("Customer\\nPortal{Enter}");

      expect(document.querySelector(".wardley-label-input")).toBeNull();
      const text = modeler.exportDSL();
      expect(text).toContain("anchor Customer\\nPortal [0.95, 0.45]");
      expect(text).toContain("component Customer∖nPortal [0.55, 0.62]");
      await modeler.importDSL(text);
      expect(shapeLabeled("Customer\nPortal").wardleyType).toBe("anchor");
      expect(shapeLabeled("Customer∖nPortal").wardleyType).toBe("component");
      expect(modeler.exportDSL()).toBe(text);
    });

    it("leaves a backslash before n in a note as it is", async () => {
      const field = open("Remember the budget");
      field.select();
      await userEvent.keyboard("C:\\new{Control>}{Enter}{/Control}");
      expect(shapeLabeled("C:\\new").wardleyType).toBe("note");
    });

    const WITH_PIPELINE = `${DSL}
pipeline Platform [0.45, 0.8]
{
  component Basic\\nPlan [0.5]
}`;

    it.each([
      ["a component", DSL, "component", "Platform", "centered"],
      ["an anchor", DSL, "anchor", "Customer\nPortal", "up"],
      ["an evolving component", `${DSL}\nevolve Platform 0.8`, "component", "Platform", "up"],
      ["the anchor component of a pipeline", WITH_PIPELINE, "component", "Platform", "up"],
      ["a pipeline's member", WITH_PIPELINE, "component", "Basic\nPlan", "down"],
    ] as const)(
      "grows the editor of %s the way its saved label grows",
      async (_kind, text, type, label, growth) => {
        await modeler.importDSL(text);
        // At 100 % the field's line pitch is the label's; zoomed out, the field keeps a legible font.
        modeler.get<Canvas>("canvas").zoom(1);
        const labelBox = (name: string) =>
          canvasGraphics(shapeOfType(type, name))
            .querySelector(".wardley-name-label")!
            .getBoundingClientRect();
        const labelBefore = labelBox(label);
        modeler.get<WardleyLabelEditing>("wardleyLabelEditing").activate(shapeOfType(type, label));
        const field = document.querySelector<HTMLTextAreaElement>("textarea.wardley-label-input")!;
        const fieldBefore = field.getBoundingClientRect();
        caretToEnd(field);
        const keptEdge = (box: DOMRect) =>
          growth === "up" ? box.bottom : growth === "down" ? box.top : box.top + box.height / 2;

        await userEvent.keyboard(`${SHIFT_ENTER}Hub`);
        const fieldAfter = field.getBoundingClientRect();
        expect(fieldAfter.height).toBeCloseTo(fieldBefore.height + lineHeightOf(field), 1);
        expect(keptEdge(fieldAfter)).toBeCloseTo(keptEdge(fieldBefore), 1);

        await userEvent.keyboard("{Enter}");
        const labelAfter = labelBox(`${label}\nHub`);
        expect(
          Math.abs(labelAfter.top - fieldAfter.top - (labelBefore.top - fieldBefore.top)),
        ).toBeLessThan(1);
        expect(
          Math.abs(
            labelAfter.bottom - fieldAfter.bottom - (labelBefore.bottom - fieldBefore.bottom),
          ),
        ).toBeLessThan(1);
      },
    );

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

    it("keeps every line of an evolving component's name clear of the evolve arrow", async () => {
      await modeler.importDSL(`title Evolving
component Two\\nLines [0.4, 0.2] (buy)
evolve Two\\nLines 0.8
component Three\\nLines\\nHere [0.7, 0.2]
evolve Three\\nLines\\nHere 0.8`);

      for (const name of ["Two\nLines", "Three\nLines\nHere"]) {
        const shape = shapeLabeled(name);
        const arrowY = shape.height / 2;
        const lines = lineBaselines(nameText(name));
        expect(lines).toHaveLength(name.split("\n").length);
        for (const baseline of lines) {
          const glyphTop = baseline - 0.75 * FONT.label;
          expect(arrowY < glyphTop || arrowY > baseline, `${name}: line at ${baseline}`).toBe(true);
        }
        expect(lines.at(-1)).toBe(arrowY + componentLabelSlot().y);
      }
    });

    it("keeps the sourcing method of an evolving component under the arrow", async () => {
      await modeler.importDSL(`title Evolving
component Two\\nLines [0.4, 0.2] (buy)
evolve Two\\nLines 0.8`);
      const shape = shapeLabeled("Two\nLines");
      const gfx = modeler.get<Canvas>("canvas").getGraphics(shape);
      const method = [...gfx.querySelectorAll("text")].find((text) => text.textContent === "buy")!;
      expect(Number(method.getAttribute("y"))).toBeGreaterThan(shape.height / 2);
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

    it("keeps every line of a pipeline's anchor component and members off the box's top edge", async () => {
      await modeler.importDSL(`title Pipeline
component Kettle\\nSystem [0.43, 0.6]
pipeline Kettle\\nSystem [0.25, 0.92]
{
  component Campfire\\nKettle [0.3]
  component Electric\\nKettle\\nModel [0.82] (buy)
}`);
      const pipeline = pipelineLabeled("Kettle\nSystem");
      for (const name of ["Kettle\nSystem", "Campfire\nKettle", "Electric\nKettle\nModel"]) {
        const shape = componentLabeled(name);
        const edgeY = pipeline.y - shape.y;
        const lines = lineBaselines(componentText(name));
        expect(lines).toHaveLength(name.split("\n").length);
        for (const baseline of lines) {
          const glyphTop = baseline - 0.75 * FONT.label;
          expect(edgeY < glyphTop || edgeY > baseline, `${name}: line at ${baseline}`).toBe(true);
        }
      }

      const anchor = componentLabeled("Kettle\nSystem");
      expect(pipeline.y).toBe(anchor.y + anchor.height / 2);
      const anchorLines = lineBaselines(componentText("Kettle\nSystem"));
      expect(anchorLines.at(-1)).toBe(anchor.height / 2 + componentLabelSlot().y);

      const member = componentLabeled("Campfire\nKettle");
      const memberLines = lineBaselines(componentText("Campfire\nKettle"));
      expect(memberLines[0]).toBe(member.height / 2 + componentLabelSlot().y);
      expect(memberLines.at(-1)!).toBeLessThan(pipeline.y + pipeline.height - member.y);
    });

    it("redraws a component's lines when a pipeline takes or gives up its name", async () => {
      await modeler.importDSL(`title Pairing
component Kettle\\nSystem [0.43, 0.6]
pipeline Boiler [0.25, 0.92] (y 0.3)`);
      const component = componentLabeled("Kettle\nSystem");
      const slotY = component.height / 2 + componentLabelSlot().y;
      const centred = [slotY - LABEL_LINE_HEIGHT / 2, slotY + LABEL_LINE_HEIGHT / 2];
      const upward = [slotY - LABEL_LINE_HEIGHT, slotY];
      const baselines = () => lineBaselines(componentText("Kettle\nSystem"));
      expect(baselines()).toEqual(centred);

      const pipeline = pipelineLabeled("Boiler");
      modeler.get<WardleyModeling>("wardleyModeling").updateLabel(pipeline, "Kettle\nSystem");
      expect(baselines()).toEqual(upward);
      const commandStack = modeler.get<CommandStack>("commandStack");
      commandStack.undo();
      expect(baselines()).toEqual(centred);
      commandStack.redo();
      expect(baselines()).toEqual(upward);

      modeler.get<Modeling>("modeling").removeShape(pipeline);
      expect(baselines()).toEqual(centred);
      commandStack.undo();
      expect(baselines()).toEqual(upward);
    });

    it("draws a name of one line as before: a text without tspans", () => {
      expect(nameText("Platform").querySelector("tspan")).toBeNull();
      expect(nameText("Platform").textContent).toBe("Platform");
    });
  });
});
