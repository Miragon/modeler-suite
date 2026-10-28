import { afterEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type { AppearanceRequest } from "@miragon/modeler-api";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type { Shape } from "diagram-js/lib/model/Types";
import {
  EVENT_STORMING_THEMES,
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeEventStormingModeler,
} from "../../src/index.js";
import type EventStormingElementFactory from "../../src/model/EventStormingElementFactory.js";
import type EventStormingLabelEditing from "../../src/label-editing/EventStormingLabelEditing.js";
import type { EventStormingShape } from "../../src/model/di-types.js";
import orderCheckout from "./fixtures/order-checkout.storm?raw";

const VIEW_STATE = { x: 120, y: 80, width: 640, height: 480 };

/** What the kit compares: every colour the browser computes for an element. */
const COLOUR_PROPERTIES = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "fill",
  "stroke",
  "box-shadow",
  "color-scheme",
];

const mounted: CollaborativeEventStormingModeler[] = [];
const wrappers: HTMLElement[] = [];

afterEach(() => {
  for (const modeler of mounted.splice(0)) modeler.destroy();
  for (const wrapper of wrappers.splice(0)) wrapper.remove();
  setPageMode(undefined);
});

function mount(modeler: CollaborativeEventStormingModeler): HTMLElement {
  const host = attachedHost();
  if (host.parentElement) wrappers.push(host.parentElement);
  modeler.attachTo(host);
  mounted.push(modeler);
  return host;
}

/** The mode of the page around the modeler, as a dark high-contrast host page carries it. */
function setPageMode(mode: { theme: string; kontrast?: string } | undefined): void {
  const html = document.documentElement;
  if (mode) html.setAttribute("data-cd-theme", mode.theme);
  else html.removeAttribute("data-cd-theme");
  if (mode?.kontrast) html.setAttribute("data-cd-kontrast", mode.kontrast);
  else html.removeAttribute("data-cd-kontrast");
}

function computedColours(host: Element): string[] {
  return [...host.querySelectorAll("*")].map((element) => {
    const style = getComputedStyle(element);
    const colours = COLOUR_PROPERTIES.map((property) => style.getPropertyValue(property));
    return `${element.tagName} ${element.getAttribute("class") ?? ""}: ${colours.join(" | ")}`;
  });
}

function addDomainEvent(modeler: CollaborativeEventStormingModeler): void {
  const diagram = modeler.diagram;
  const factory = diagram.get<EventStormingElementFactory>("eventStormingElementFactory");
  diagram
    .get<Modeling>("modeling")
    .createShape(
      factory.createNew("event", "Payment Captured"),
      { x: 1240, y: 700 },
      diagram.get<Canvas>("canvas").getRootElement() as Shape,
    );
}

/** The kit's state: one edit on the canonical board, a revealed element, a panned view. */
async function editedBoard(): Promise<{
  modeler: CollaborativeEventStormingModeler;
  host: HTMLElement;
  changes: () => number;
  revealed: string;
}> {
  const modeler = createCollaborativeModeler();
  const host = mount(modeler);
  await modeler.importText(orderCheckout);
  addDomainEvent(modeler);
  let changes = 0;
  modeler.onContentChanged(() => (changes += 1));
  const revealed = modeler.elements.list()[0]!.id;
  modeler.elements.reveal(revealed);
  modeler.setViewState(VIEW_STATE);
  return { modeler, host, changes: () => changes, revealed };
}

async function snapshot(modeler: CollaborativeEventStormingModeler) {
  return {
    text: modeler.exportText(),
    svg: (await modeler.diagram.saveSVG()).svg,
    view: modeler.getViewState(),
    selection: modeler.elements.selection(),
    canUndo: modeler.diagram.get<CommandStack>("commandStack").canUndo(),
    canRedo: modeler.diagram.get<CommandStack>("commandStack").canRedo(),
  };
}

describe("the appearance surface (modeler-api 1.5)", () => {
  it("lists light only, the same on every read, every instance and the viewer, before attachTo", () => {
    const modeler = createCollaborativeModeler();
    const another = createCollaborativeModeler();
    const viewer = createCollaborativeViewer();
    mounted.push(modeler, another, viewer);

    expect(EVENT_STORMING_THEMES).toEqual(["light"]);
    expect(Object.isFrozen(EVENT_STORMING_THEMES)).toBe(true);
    expect(modeler.appearance.themes).toBe(EVENT_STORMING_THEMES);
    expect(modeler.appearance.themes).toBe(modeler.appearance.themes);
    expect(another.appearance.themes).toBe(EVENT_STORMING_THEMES);
    expect(viewer.appearance.themes).toBe(EVENT_STORMING_THEMES);
  });

  it("applies a request made before attachTo and before the first import, and keeps it across imports", async () => {
    const modeler = createCollaborativeModeler();
    expect(() => modeler.appearance.set({ theme: "dark", contrast: "high" })).not.toThrow();
    expect(modeler.diagram.container.getAttribute("data-cd-theme")).toBe("light");
    expect(modeler.diagram.container.getAttribute("data-cd-kontrast")).toBe("hoch");

    mount(modeler);
    await modeler.importText(orderCheckout);
    await modeler.importText(orderCheckout);
    expect(modeler.diagram.container.getAttribute("data-cd-theme")).toBe("light");
    expect(modeler.diagram.container.getAttribute("data-cd-kontrast")).toBe("hoch");

    modeler.appearance.set({ theme: "light" });
    expect(modeler.diagram.container.hasAttribute("data-cd-kontrast")).toBe(false);
  });

  it("draws as without the surface until the first request", async () => {
    const modeler = createCollaborativeModeler();
    mount(modeler);
    await modeler.importText(orderCheckout);
    expect(modeler.diagram.container.hasAttribute("data-cd-theme")).toBe(false);
    expect(modeler.diagram.container.hasAttribute("data-cd-kontrast")).toBe(false);
  });

  it("draws high contrast the way the apps' pages ask for it, and the same when the host asks", async () => {
    const { modeler, host } = await editedBoard();
    const pad = host.querySelector(".djs-context-pad.open")!;
    const shadowed = getComputedStyle(pad).boxShadow;
    expect(shadowed).not.toBe("none");

    setPageMode({ theme: "light", kontrast: "hoch" });
    const page = computedColours(host);
    expect(getComputedStyle(pad).boxShadow).toBe("none");

    setPageMode(undefined);
    modeler.appearance.set({ theme: "light", contrast: "high" });
    expect(computedColours(host)).toEqual(page);
    modeler.appearance.set({ theme: "light" });
    expect(getComputedStyle(pad).boxShadow).toBe(shadowed);
  });

  it("takes any request without a throw, an unknown theme as light and an unknown contrast as normal", async () => {
    const modeler = createCollaborativeModeler();
    mount(modeler);
    const container = modeler.diagram.container;
    const untyped = [
      undefined,
      null,
      "dark",
      42,
      {},
      { theme: "sepia" },
      { theme: "dark", contrast: "maximum" },
      { theme: "light", contrast: null },
    ] as unknown as AppearanceRequest[];
    for (const request of untyped) {
      modeler.appearance.set({ theme: "light", contrast: "high" });
      expect(() => modeler.appearance.set(request)).not.toThrow();
      expect(container.getAttribute("data-cd-theme")).toBe("light");
      expect(container.hasAttribute("data-cd-kontrast")).toBe(false);
    }
  });

  it("is view state: no change, the same exports, view, selection and history", async () => {
    const { modeler, changes } = await editedBoard();
    const before = await snapshot(modeler);
    expect(before.canUndo).toBe(true);
    expect(before.selection).toHaveLength(1);

    const requests = [
      { theme: "light" },
      { theme: "dark" },
      { theme: "light", contrast: "high" },
      { theme: "dark", contrast: "high" },
      { theme: "sepia", contrast: "high" },
      { theme: "light", contrast: "normal" },
    ] as AppearanceRequest[];
    for (const request of requests) {
      modeler.appearance.set(request);
      expect(await snapshot(modeler)).toEqual(before);
    }
    expect(changes()).toBe(0);

    modeler.diagram.get<CommandStack>("commandStack").undo();
    expect(modeler.exportText()).toBe(orderCheckout);
  });

  it("stays light on a dark high-contrast page, with the contrast it was asked for", async () => {
    const { modeler, host, revealed } = await editedBoard();
    const reference = (contrast: "normal" | "high") => {
      setPageMode(undefined);
      modeler.appearance.set({ theme: EVENT_STORMING_THEMES[0]!, contrast });
      const colours = computedColours(host);
      setPageMode({ theme: "dark", kontrast: "hoch" });
      return colours;
    };

    const normal = reference("normal");
    const high = reference("high");
    expect(high).not.toEqual(normal);
    expect(host.querySelector(".djs-context-pad.open")).not.toBe(null);

    const unlisted = ["dark", "sepia"] as AppearanceRequest["theme"][];
    for (const theme of unlisted) {
      modeler.appearance.set({ theme, contrast: "normal" });
      expect(computedColours(host)).toEqual(normal);
      modeler.appearance.set({ theme, contrast: "high" });
      expect(computedColours(host)).toEqual(high);
    }

    // Left to the page, the roles would come out dark.
    modeler.diagram.container.removeAttribute("data-cd-theme");
    modeler.diagram.container.removeAttribute("data-cd-kontrast");
    expect(computedColours(host)).not.toEqual(normal);
    expect(computedColours(host)).not.toEqual(high);

    modeler.appearance.set({ theme: "dark", contrast: "normal" });
    await modeler.importText(modeler.exportText());
    modeler.elements.reveal(revealed);
    modeler.setViewState(VIEW_STATE);
    const reimportedNormal = computedColours(host);
    const reimportedHigh = (() => {
      modeler.appearance.set({ theme: "dark", contrast: "high" });
      return computedColours(host);
    })();
    expect(reimportedNormal).toEqual(reference("normal"));
    expect(reimportedHigh).toEqual(reference("high"));
  });

  it("keeps a label editor open with its typed text and commits nothing", async () => {
    const modeler = createCollaborativeModeler();
    mount(modeler);
    await modeler.importText(orderCheckout);
    let changes = 0;
    modeler.onContentChanged(() => (changes += 1));
    const labelEditing = modeler.diagram.get<EventStormingLabelEditing>(
      "eventStormingLabelEditing",
    );
    const sticky = modeler.diagram
      .get<{ get(id: string): unknown }>("elementRegistry")
      .get("event_order_placed") as EventStormingShape;
    labelEditing.activate(sticky);
    const field = modeler.diagram.container.querySelector<HTMLTextAreaElement>(
      "textarea.event-storming-label-textarea",
    )!;
    field.value = "typed, not committed";

    modeler.appearance.set({ theme: "dark", contrast: "high" });
    modeler.appearance.set({ theme: "light" });

    expect(changes).toBe(0);
    expect(modeler.exportText()).toBe(orderCheckout);
    expect(labelEditing.openEdit()).toEqual({
      elementId: "event_order_placed",
      value: "typed, not committed",
    });
    field.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }),
    );
    expect(changes).toBe(1);
    expect(modeler.exportText()).toContain("typed, not committed");
  });

  it("works the same on the viewer", async () => {
    const viewer = createCollaborativeViewer();
    const host = mount(viewer);
    await viewer.importText(orderCheckout);
    const svg = (await viewer.diagram.saveSVG()).svg;

    viewer.appearance.set({ theme: "light" });
    const normal = computedColours(host);
    setPageMode({ theme: "dark", kontrast: "hoch" });
    viewer.appearance.set({ theme: "dark" });

    expect(computedColours(host)).toEqual(normal);
    expect((await viewer.diagram.saveSVG()).svg).toBe(svg);
    expect(viewer.exportText()).toBe(orderCheckout);
  });
});
