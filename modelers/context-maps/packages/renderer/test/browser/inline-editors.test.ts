/// <reference types="@vitest/browser-playwright" />
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import type { AppearanceRequest } from "@miragon/modeler-api";
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

/**
 * diagram-js-direct-editing never calls `focus()`: its selection range moves the focus into the
 * content only inside a frame that has the focus, as it has for a user who opened the editor. So
 * every case clicks into the frame first and does not depend on a case before it.
 */
async function focusTheFrame(): Promise<void> {
  const target = document.createElement("div");
  target.style.width = "16px";
  target.style.height = "16px";
  document.body.append(target);
  await userEvent.click(target);
  target.remove();
  expect(document.hasFocus()).toBe(true);
}

/**
 * Escape on an open description editor: a destroy blurs it, which commits and restores the focus to
 * a canvas that is gone.
 */
function closeDescription(): void {
  document
    .querySelector(".cm-pad-prompt__field")
    ?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
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

  beforeEach(async () => {
    await focusTheFrame();
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
    closeDescription();
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

  describe("the description editor's ring and card (#393, guide §5.3, §8)", () => {
    function card(): HTMLElement {
      return container.querySelector<HTMLElement>(".cm-pad-prompt")!;
    }

    it("shows the 2px ring around the field and the card's shadow", () => {
      const field = openDescription("billing");
      expect(focusRing(field)).toEqual({
        style: "solid",
        width: "2px",
        offset: "2px",
        colour: computedColour(container, "var(--cd-ui-fokus)"),
      });
      expect(getComputedStyle(card()).boxShadow).not.toBe("none");
    });

    it("widens the ring to 3px and drops the card's shadow in high contrast", () => {
      page.setAttribute("data-cd-kontrast", "hoch");
      const field = openDescription("billing");
      expect(focusRing(field)).toMatchObject({ style: "solid", width: "3px", offset: "2px" });
      expect(getComputedStyle(card()).boxShadow).toBe("none");
    });

    it("keeps the ring in forced colours", async () => {
      await cdp().send("Emulation.setEmulatedMedia", {
        features: [{ name: "forced-colors", value: "active" }],
      });
      const field = openDescription("billing");
      expect(focusRing(field)).toMatchObject({ style: "solid", width: "2px" });
      expect(focusRing(field).colour).toBe(computedColour(document.body, "Highlight"));
    });
  });
});

interface Carrier {
  theme: string;
  kontrast?: "hoch";
}

interface Mode {
  page?: Carrier;
  /** A mode carrier between the page and the map's host. */
  carrier?: Carrier;
  request?: AppearanceRequest;
}

function carry(element: HTMLElement, carrier: Carrier): void {
  element.setAttribute("data-cd-theme", carrier.theme);
  if (carrier.kontrast) element.setAttribute("data-cd-kontrast", carrier.kontrast);
}

const HIGH = { width: "3px", shadow: "no shadow" };
const NORMAL = { width: "2px", shadow: "its shadow" };

/** High contrast is the nearest mode carrier's (guide §13.3), the map's container among them. */
const CARRIERS: ({ title: string; mode: Mode } & typeof HIGH)[] = [
  {
    title: "for a request of high contrast, also on a page in normal contrast",
    mode: { request: { theme: "light", contrast: "high" } },
    ...HIGH,
  },
  {
    title: "for a request of normal contrast on a high-contrast page",
    mode: {
      page: { theme: "dark", kontrast: "hoch" },
      request: { theme: "light", contrast: "normal" },
    },
    ...NORMAL,
  },
  {
    title: "inside a carrier in normal contrast between a high-contrast page and the map (#401)",
    mode: { page: { theme: "light", kontrast: "hoch" }, carrier: { theme: "light" } },
    ...NORMAL,
  },
  {
    title: "for a request of high contrast inside a carrier in normal contrast (#401)",
    mode: { carrier: { theme: "light" }, request: { theme: "light", contrast: "high" } },
    ...HIGH,
  },
];

describe("the editors under a host's appearance and the nearest mode carrier (#357, #393, #401)", () => {
  const modelers: CollaborativeContextMapsModeler[] = [];
  const wrappers: HTMLElement[] = [];

  beforeEach(focusTheFrame);

  afterEach(() => {
    page.removeAttribute("data-cd-theme");
    page.removeAttribute("data-cd-kontrast");
    closeDescription();
    for (const modeler of modelers.splice(0)) modeler.destroy();
    for (const wrapper of wrappers.splice(0)) wrapper.remove();
  });

  async function mapIn(mode: Mode): Promise<CollaborativeContextMapsModeler> {
    if (mode.page) carry(page, mode.page);
    const modeler = createCollaborativeModeler();
    if (mode.request) modeler.appearance.set(mode.request);
    const host = attachedHost();
    const wrapper = host.parentElement!;
    wrappers.push(wrapper);
    if (mode.carrier) carry(wrapper, mode.carrier);
    modeler.attachTo(host);
    modelers.push(modeler);
    await modeler.importText(serializeDocumentText(mapDocument()));
    return modeler;
  }

  function billing(modeler: CollaborativeContextMapsModeler): CmContext {
    const found = modeler.diagram.get<ElementRegistry>("elementRegistry").get("billing");
    if (!found) throw new Error("no element billing");
    return found as unknown as CmContext;
  }

  function nameEditorOf(modeler: CollaborativeContextMapsModeler): HTMLElement {
    modeler.diagram.get<CmLabelEditing>("cmLabelEditing").activate(billing(modeler));
    return editorBox(modeler.diagram.container);
  }

  function descriptionEditorOf(modeler: CollaborativeContextMapsModeler): {
    field: HTMLTextAreaElement;
    card: HTMLElement;
  } {
    const map = modeler.diagram.container;
    modeler.diagram.get<Selection>("selection").select(billing(modeler));
    map
      .querySelector('.djs-context-pad.open [data-action="description"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    const field = map.querySelector<HTMLTextAreaElement>(".cm-pad-prompt__field")!;
    expect(document.activeElement).toBe(field);
    return { field, card: map.querySelector<HTMLElement>(".cm-pad-prompt")! };
  }

  it.each(CARRIERS)("gives the name editor a $width ring $title", async ({ mode, width }) => {
    const box = nameEditorOf(await mapIn(mode));
    expect(focusRing(box)).toMatchObject({ style: "solid", width, offset: "2px" });
  });

  it.each(CARRIERS)(
    "gives the description field a $width ring and its card $shadow $title",
    async ({ mode, width, shadow }) => {
      const { field, card } = descriptionEditorOf(await mapIn(mode));
      expect(focusRing(field)).toMatchObject({ style: "solid", width, offset: "2px" });
      expect(getComputedStyle(card).boxShadow === "none").toBe(shadow === "no shadow");
    },
  );
});
