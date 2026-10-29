/// <reference types="@vitest/browser-playwright" />
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cdp } from "vitest/browser";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import {
  Modeler,
  createCollaborativeModeler,
  type CollaborativeWardleyModeler,
} from "../../src/index.js";
import {
  isWardleyConnection,
  isWardleyShape,
  type WardleyConnection,
  type WardleyShape,
} from "../../src/model/di-types.js";
import type WardleyLabelEditing from "../../src/label-editing/WardleyLabelEditing.js";
import type WardleyLinkEditing from "../../src/link-editing/WardleyLinkEditing.js";
import { linkOf } from "../../src/link-editing/index.js";
import { diagramOf } from "./support/gesture-harness.js";
import "../../src/assets/wardley.css";

const DSL = `title Inline editors
anchor Customer [0.95, 0.45]
component Platform [0.55, 0.62]
component Hosting [0.3, 0.8]
note Remember the budget [0.30, 0.20]
Customer -> Platform
Platform +'$0.10'> Hosting`;

type Editor = "name" | "note" | "link annotation" | "flow value" | "link address";

const EDITORS: readonly Editor[] = [
  "name",
  "note",
  "link annotation",
  "flow value",
  "link address",
];

const page = document.documentElement;

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
  async press(key: "Enter" | "Escape"): Promise<void> {
    const keyCode = key === "Enter" ? 13 : 27;
    for (const type of ["rawKeyDown", "keyUp"] as const) {
      await cdp().send("Input.dispatchKeyEvent", {
        type,
        key,
        code: key,
        windowsVirtualKeyCode: keyCode,
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

describe("the inline editors of a map", () => {
  let container: HTMLElement;
  let modeler: Modeler;

  function shapeLabeled(label: string): WardleyShape {
    const shape = modeler
      .get<ElementRegistry>("elementRegistry")
      .find((element) => isWardleyShape(element) && element.wardleyLabel === label);
    if (!shape) throw new Error(`shape not found: ${label}`);
    return shape as unknown as WardleyShape;
  }

  function connectionOf(type: WardleyConnection["wardleyType"]): WardleyConnection {
    const connection = modeler
      .get<ElementRegistry>("elementRegistry")
      .find((element) => isWardleyConnection(element) && element.wardleyType === type);
    if (!connection) throw new Error(`no ${type} on the map`);
    return connection as unknown as WardleyConnection;
  }

  function openField(): HTMLInputElement | HTMLTextAreaElement | null {
    return container.querySelector(".wardley-label-input");
  }

  function open(editor: Editor): HTMLInputElement | HTMLTextAreaElement {
    const labelEditing = modeler.get<WardleyLabelEditing>("wardleyLabelEditing");
    if (editor === "name") labelEditing.activate(shapeLabeled("Platform"));
    else if (editor === "note") labelEditing.activate(shapeLabeled("Remember the budget"));
    else if (editor === "link annotation")
      labelEditing.activateConnection(connectionOf("dependency"));
    else if (editor === "flow value") labelEditing.activateConnection(connectionOf("flow"));
    else modeler.get<WardleyLinkEditing>("wardleyLinkEditing").activate(shapeLabeled("Platform"));
    const field = openField();
    if (!field) throw new Error(`the ${editor} editor did not open`);
    expect(document.activeElement).toBe(field);
    return field;
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

  describe("an input method that is composing in the link and flow editors (#254)", () => {
    const LINK_AND_FLOW_EDITORS = [
      {
        editor: "link annotation",
        composed: "要確認",
        saved: () => connectionOf("dependency").linkLabel,
        line: "Customer -> Platform; 要確認",
      },
      {
        editor: "flow value",
        composed: "百円",
        saved: () => connectionOf("flow").flowValue,
        line: "Platform +'百円'> Hosting",
      },
      {
        editor: "link address",
        composed: "./地図.wmap",
        saved: () => linkOf(shapeLabeled("Platform")),
        line: "url Platform URL [./地図.wmap]",
      },
    ] as const;

    it.each(LINK_AND_FLOW_EDITORS)(
      "leaves Enter and Escape to the composition in the $editor editor, then saves on Enter",
      async ({ editor, composed, saved, line }) => {
        const before = modeler.exportDSL();
        const savedBefore = saved();
        const field = open(editor);
        const compositionEnds: string[] = [];
        field.addEventListener("compositionend", (event) =>
          compositionEnds.push((event as CompositionEvent).data),
        );

        await inputMethod.compose("かくにん");
        await inputMethod.press("Enter");
        await inputMethod.press("Escape");
        expect(openField()).toBe(field);
        expect(field.value).toBe("かくにん");
        expect(saved()).toBe(savedBefore);

        await inputMethod.confirm(composed);
        expect(compositionEnds).toEqual([composed]);
        // Safari sends the Enter that confirmed the candidate after compositionend.
        pressKey(field, { key: "Enter", keyCode: 229 });
        expect(openField()).toBe(field);
        expect(field.value).toBe(composed);
        expect(modeler.exportDSL()).toBe(before);

        await inputMethod.press("Enter");
        expect(openField()).toBeNull();
        expect(saved()).toBe(composed);
        expect(modeler.exportDSL()).toContain(line);
      },
    );

    it.each(LINK_AND_FLOW_EDITORS)(
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

  describe("the focus ring (#256, guide §8)", () => {
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

    it.each(EDITORS)("widens the ring of the %s editor to 3px in high contrast", (editor) => {
      page.setAttribute("data-cd-kontrast", "hoch");
      const field = open(editor);
      expect(focusRing(field)).toMatchObject({ style: "solid", width: "3px", offset: "2px" });
    });

    it.each(EDITORS)(
      "draws the ring of the %s editor in Highlight in forced colours",
      async (editor) => {
        await cdp().send("Emulation.setEmulatedMedia", {
          features: [{ name: "forced-colors", value: "active" }],
        });
        const field = open(editor);
        expect(focusRing(field)).toMatchObject({ style: "solid", width: "2px" });
        expect(focusRing(field).colour).toBe(computedColour(document.body, "Highlight"));
      },
    );
  });
});

describe("the focus ring of an inline editor under a host's appearance (#256)", () => {
  const modelers: CollaborativeWardleyModeler[] = [];
  const wrappers: HTMLElement[] = [];

  afterEach(() => {
    page.removeAttribute("data-cd-theme");
    page.removeAttribute("data-cd-kontrast");
    for (const modeler of modelers.splice(0)) modeler.destroy();
    for (const wrapper of wrappers.splice(0)) wrapper.remove();
  });

  async function nameEditorOf(modeler: CollaborativeWardleyModeler): Promise<HTMLElement> {
    const host = attachedHost();
    wrappers.push(host.parentElement ?? host);
    modeler.attachTo(host);
    modelers.push(modeler);
    await modeler.importText(DSL);
    const diagram = diagramOf(modeler);
    const platform = diagram
      .get<ElementRegistry>("elementRegistry")
      .find((element) => isWardleyShape(element) && element.wardleyLabel === "Platform");
    diagram.get<WardleyLabelEditing>("wardleyLabelEditing").activate(platform as WardleyShape);
    const field = host.querySelector<HTMLElement>(".wardley-label-input");
    if (!field) throw new Error("no name editor opened");
    return field;
  }

  it("is 3px for a request of high contrast, also on a page in normal contrast", async () => {
    const modeler = createCollaborativeModeler();
    modeler.appearance.set({ theme: "light", contrast: "high" });
    const field = await nameEditorOf(modeler);
    expect(focusRing(field)).toMatchObject({ style: "solid", width: "3px", offset: "2px" });
  });

  it("stays 2px for a request of normal contrast on a high-contrast page", async () => {
    page.setAttribute("data-cd-theme", "dark");
    page.setAttribute("data-cd-kontrast", "hoch");
    const modeler = createCollaborativeModeler();
    modeler.appearance.set({ theme: "light", contrast: "normal" });
    const field = await nameEditorOf(modeler);
    expect(focusRing(field)).toMatchObject({ style: "solid", width: "2px", offset: "2px" });
  });
});
