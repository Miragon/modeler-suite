/// <reference types="@vitest/browser-playwright" />
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cdp } from "vitest/browser";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import {
  Modeler,
  createCollaborativeModeler,
  type CmContext,
  type CmElement,
  type CmLabelEditing,
  type CollaborativeContextMapsModeler,
} from "@miragon/context-maps-renderer";
import {
  emptyDocument,
  serializeDocumentText,
  type CmDocument,
} from "@miragon/context-maps-schema-model";

function mapDocument(): CmDocument {
  const doc = emptyDocument("Inline editors");
  doc.contexts = [
    {
      id: "billing",
      label: "Billing",
      team: "Finance Team",
      position: { x: 100, y: 200 },
      size: { width: 200, height: 110 },
    },
    {
      id: "shipping",
      label: "Shipping",
      position: { x: 600, y: 200 },
      size: { width: 200, height: 110 },
    },
  ];
  doc.relationships = [
    { id: "invoices", from: "billing", to: "shipping", pattern: "customer-supplier" },
  ];
  return doc;
}

type Editor = "context name" | "team" | "relationship name";

const EDITORS: readonly Editor[] = ["context name", "team", "relationship name"];

const page = document.documentElement;

/** Chrome DevTools Protocol's bit for the Ctrl key in `Input.dispatchKeyEvent`. */
const CTRL = 2;

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

function focusRing(box: HTMLElement): {
  style: string;
  width: string;
  offset: string;
  colour: string;
} {
  const style = getComputedStyle(box);
  return {
    style: style.outlineStyle,
    width: style.outlineWidth,
    offset: style.outlineOffset,
    colour: style.outlineColor,
  };
}

/** The text box of the open name or team editor, once its content has the focus. */
function editorBox(scope: HTMLElement): HTMLElement {
  const box = scope.querySelector<HTMLElement>(".djs-direct-editing-parent");
  const content = box?.querySelector<HTMLElement>(".djs-direct-editing-content");
  if (!box || !content) throw new Error("no name or team editor opened");
  expect(document.activeElement).toBe(content);
  return box;
}

describe("the inline editors of a map", () => {
  let container: HTMLElement;
  let modeler: Modeler;

  function element(id: string): CmElement {
    const found = modeler.get<ElementRegistry>("elementRegistry").get(id);
    if (!found) throw new Error(`no element ${id}`);
    return found as unknown as CmElement;
  }

  function open(editor: Editor): HTMLElement {
    const labelEditing = modeler.get<CmLabelEditing>("cmLabelEditing");
    if (editor === "context name") labelEditing.activate(element("billing"));
    else if (editor === "team") labelEditing.activateTeam(element("billing") as CmContext);
    else labelEditing.activate(element("invoices"));
    return editorBox(container);
  }

  function promptField(): HTMLTextAreaElement | null {
    return container.querySelector<HTMLTextAreaElement>(".cm-pad-prompt__field");
  }

  function openDescription(id: string): HTMLTextAreaElement {
    modeler.get<Selection>("selection").select(element(id));
    const entry = container.querySelector('.djs-context-pad.open [data-action="description"]');
    if (!entry) throw new Error("no description entry in the context pad");
    entry.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    const field = promptField();
    if (!field) throw new Error("the description editor did not open");
    expect(document.activeElement).toBe(field);
    return field;
  }

  function description(id: string): string | undefined {
    return modeler.exportDocument().contexts.find((context) => context.id === id)?.description;
  }

  beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "1024px";
    container.style.height = "768px";
    document.body.appendChild(container);
    modeler = new Modeler({ container });
    modeler.importDocument(mapDocument());
  });

  afterEach(async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
    page.removeAttribute("data-cd-kontrast");
    modeler.destroy();
    container.remove();
  });

  describe("an input method that is composing in the description editor (#358)", () => {
    it("leaves Escape and Cmd/Ctrl+Enter to the composition, then saves on Cmd/Ctrl+Enter", async () => {
      const field = openDescription("shipping");
      const compositionEnds: string[] = [];
      field.addEventListener("compositionend", (event) =>
        compositionEnds.push((event as CompositionEvent).data),
      );

      await inputMethod.compose("はいそう");
      await inputMethod.press("Escape");
      await inputMethod.press("Enter", CTRL);
      expect(promptField()).toBe(field);
      expect(field.value).toBe("はいそう");
      expect(description("shipping")).toBeUndefined();

      await inputMethod.confirm("配送");
      expect(compositionEnds).toEqual(["配送"]);
      // Safari sends the key that confirmed or cancelled the candidate after compositionend.
      pressKey(field, { key: "Enter", keyCode: 229, ctrlKey: true });
      pressKey(field, { key: "Escape", keyCode: 229 });
      expect(promptField()).toBe(field);
      expect(field.value).toBe("配送");
      expect(description("shipping")).toBeUndefined();

      await inputMethod.press("Enter", CTRL);
      expect(promptField()).toBeNull();
      expect(description("shipping")).toBe("配送");
    });

    it("still discards on an Escape after the composition", async () => {
      const before = modeler.exportDocument();
      const field = openDescription("shipping");
      await inputMethod.compose("はいそう");
      await inputMethod.confirm("配送");

      await inputMethod.press("Escape");
      expect(promptField()).toBeNull();
      expect(field.isConnected).toBe(false);
      expect(modeler.exportDocument()).toEqual(before);
    });
  });

  describe("the focus ring of the name and team editor (#357, guide §8)", () => {
    it.each(EDITORS)(
      "shows the ring around the %s editor, next to its dashed accent border",
      (editor) => {
        const box = open(editor);
        expect(focusRing(box)).toEqual({
          style: "solid",
          width: "2px",
          offset: "2px",
          colour: computedColour(container, "var(--cd-ui-fokus)"),
        });
        const border = getComputedStyle(box);
        expect(border.borderTopStyle).toBe("dashed");
        expect(border.borderTopColor).toBe(computedColour(container, "var(--cd-ui-interaktion)"));
      },
    );

    it.each(EDITORS)("widens the ring of the %s editor to 3px in high contrast", (editor) => {
      page.setAttribute("data-cd-kontrast", "hoch");
      const box = open(editor);
      expect(focusRing(box)).toMatchObject({ style: "solid", width: "3px", offset: "2px" });
    });

    // Chromium forces every outline to Highlight under forced colours by itself, so these cases
    // show that the ring survives there, not the stylesheet's own Highlight for other engines.
    it.each(EDITORS)("keeps the ring of the %s editor in forced colours", async (editor) => {
      await cdp().send("Emulation.setEmulatedMedia", {
        features: [{ name: "forced-colors", value: "active" }],
      });
      const box = open(editor);
      expect(focusRing(box)).toMatchObject({ style: "solid", width: "2px" });
      expect(focusRing(box).colour).toBe(computedColour(document.body, "Highlight"));
    });
  });
});

describe("the focus ring of the name editor under a host's appearance (#357)", () => {
  const modelers: CollaborativeContextMapsModeler[] = [];
  const wrappers: HTMLElement[] = [];

  afterEach(() => {
    page.removeAttribute("data-cd-theme");
    page.removeAttribute("data-cd-kontrast");
    for (const modeler of modelers.splice(0)) modeler.destroy();
    for (const wrapper of wrappers.splice(0)) wrapper.remove();
  });

  async function nameEditorOf(modeler: CollaborativeContextMapsModeler): Promise<HTMLElement> {
    const host = attachedHost();
    wrappers.push(host.parentElement ?? host);
    modeler.attachTo(host);
    modelers.push(modeler);
    await modeler.importText(serializeDocumentText(mapDocument()));
    const billing = modeler.diagram.get<ElementRegistry>("elementRegistry").get("billing");
    modeler.diagram.get<CmLabelEditing>("cmLabelEditing").activate(billing as unknown as CmContext);
    return editorBox(host);
  }

  it("is 3px for a request of high contrast, also on a page in normal contrast", async () => {
    const modeler = createCollaborativeModeler();
    modeler.appearance.set({ theme: "light", contrast: "high" });
    const box = await nameEditorOf(modeler);
    expect(focusRing(box)).toMatchObject({ style: "solid", width: "3px", offset: "2px" });
  });

  it("stays 2px for a request of normal contrast on a high-contrast page", async () => {
    page.setAttribute("data-cd-theme", "dark");
    page.setAttribute("data-cd-kontrast", "hoch");
    const modeler = createCollaborativeModeler();
    modeler.appearance.set({ theme: "light", contrast: "normal" });
    const box = await nameEditorOf(modeler);
    expect(focusRing(box)).toMatchObject({ style: "solid", width: "2px", offset: "2px" });
  });
});
