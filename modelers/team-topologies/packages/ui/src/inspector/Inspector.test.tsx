import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Modeler } from "@miragon/team-topologies-renderer";
import { InspectorSlotContent } from "./Inspector";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = (event: unknown) => void;

function fakeModeler() {
  const listeners = new Map<string, Set<Listener>>();
  let current: unknown[] = [];
  const fire = (event: string, payload: unknown = {}) =>
    listeners.get(event)?.forEach((listener) => listener(payload));

  const selection = {
    get: () => current,
    select: vi.fn((elements: unknown) => {
      current = elements == null ? [] : [elements].flat();
      fire("selection.changed", { newSelection: current });
    }),
  };
  const canvasElement = document.createElement("div");
  canvasElement.tabIndex = -1;
  canvasElement.dataset.fakeCanvas = "";
  document.body.append(canvasElement);
  const canvas = {
    focus: vi.fn(() => canvasElement.focus()),
    restoreFocus: vi.fn(() => {
      if (document.activeElement === document.body) canvasElement.focus();
    }),
    getContainer: () => document.body,
    viewbox: () => ({ x: 0, y: 0, width: 1000, height: 800, scale: 1 }),
    getGraphics: () => undefined,
    scroll: vi.fn(),
  };
  const ttModeling = {
    setTeamType: vi.fn(),
    setInteractionMode: vi.fn(),
    updateLabel: vi.fn(),
    setDescription: vi.fn(),
    setColors: vi.fn(),
    detachAnnotation: vi.fn(),
  };
  const modeling = { removeElements: vi.fn() };
  const services: Record<string, unknown> = {
    selection,
    canvas,
    ttModeling,
    modeling,
    dragging: { context: () => null },
  };

  const modeler = {
    on: (event: string, listener: Listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(listener);
    },
    off: (event: string, listener: Listener) => listeners.get(event)?.delete(listener),
    get: (name: string) => {
      if (!(name in services)) throw new Error(`unexpected service ${name}`);
      return services[name];
    },
  };
  const select = (...elements: unknown[]) => act(() => selection.select(elements));
  /** A model change the canvas reports, e.g. once a command has run. */
  const change = () => act(() => fire("elements.changed"));
  return {
    modeler: modeler as unknown as Modeler,
    select,
    change,
    selection,
    canvas,
    canvasElement,
    ttModeling,
    modeling,
  };
}

function removeFakeCanvases() {
  for (const element of document.querySelectorAll("[data-fake-canvas]")) element.remove();
}

const shape = { x: 0, y: 0, width: 120, height: 80, incoming: [], outgoing: [] };
const team = {
  ...shape,
  id: "team_a",
  ttKind: "team",
  teamType: "stream-aligned",
  ttLabel: "Checkout",
};
const interaction = { ...shape, id: "interaction_a", ttKind: "interaction", mode: "collaboration" };
const flow = { ...shape, id: "flow_a", ttKind: "flow" };
const annotation = { ...shape, id: "annotation_a", ttKind: "annotation", ttLabel: "Why" };

/**
 * A control that goes away once what it acts on is gone, with the element it shows for and the
 * model change that takes that away, as its own action or an undo would.
 */
function removableControl(name: "Reset colours" | "Detach") {
  if (name === "Reset colours") {
    const coloured: { fill?: string } & typeof team = { ...team, id: "team_b", fill: "#ffeeaa" };
    return {
      element: coloured,
      takeAway: () => {
        delete coloured.fill;
      },
    };
  }
  const attached = { ...annotation, outgoing: [] as unknown[] };
  attached.outgoing.push({ ttKind: "association", source: attached, target: team });
  return {
    element: attached,
    takeAway: () => {
      attached.outgoing.length = 0;
    },
  };
}

/** The inspector in a host's panel that the host opens and closes on the content's request. */
function Host({ modeler, readOnly }: { modeler: Modeler; readOnly?: boolean }) {
  const element = document.querySelector<HTMLElement>("[data-inspector-host]")!;
  const slot = { element, open: () => undefined, close: () => undefined };
  return <InspectorSlotContent modeler={modeler} slot={slot} readOnly={readOnly} />;
}

function typeInto(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = Object.getPrototypeOf(field) as object;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function press(target: Element, key: string, init: KeyboardEventInit = {}) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
  );
}

/** Past the microtasks in which the panel notices a removed control. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("the inspector's content", () => {
  let host: HTMLElement;
  let root: Root;

  const panel = () => host.querySelector(".tt-inspector__content");
  const header = () => host.querySelector(".tt-inspector__header")?.textContent;
  const button = (name: string) =>
    [...host.querySelectorAll("button")].find((candidate) => candidate.textContent === name);

  beforeEach(() => {
    host = document.createElement("aside");
    host.dataset.inspectorHost = "";
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    removeFakeCanvases();
    vi.restoreAllMocks();
  });

  it("shows the panel that fits the selection, and nothing without one", () => {
    const fake = fakeModeler();
    act(() => root.render(<Host modeler={fake.modeler} />));
    expect(panel()).toBeNull();

    const headers = [team, interaction, flow, annotation].map((element) => {
      fake.select(element);
      return header();
    });
    expect(headers).toEqual(["Team", "Interaction", "Flow of change", "Annotation"]);

    fake.select(team, interaction);
    expect(header()).toBe("2 elements selected");

    fake.select();
    expect(panel()).toBeNull();
  });

  it("closes on an Escape that no field used, and hands focus to the canvas", () => {
    const fake = fakeModeler();
    act(() => root.render(<Host modeler={fake.modeler} />));
    fake.select(team);

    act(() => press(host.querySelector("select") as Element, "Escape"));

    expect(fake.selection.select).toHaveBeenLastCalledWith(null);
    expect(fake.canvas.focus).toHaveBeenCalled();
    expect(panel()).toBeNull();
  });

  it("lets Escape undo a field's draft without closing the panel", () => {
    const fake = fakeModeler();
    act(() => root.render(<Host modeler={fake.modeler} />));
    fake.select(team);
    const name = host.querySelector<HTMLInputElement>('input[type="text"]');
    if (!name) throw new Error("no name field");

    act(() => typeInto(name, "Payments"));
    act(() => press(name, "Escape"));

    expect(name.value).toBe("Checkout");
    expect(panel()).not.toBeNull();
    expect(fake.selection.select).toHaveBeenCalledTimes(1);
  });

  it("commits a field's draft once, on Enter", () => {
    const fake = fakeModeler();
    act(() => root.render(<Host modeler={fake.modeler} />));
    fake.select(team);
    const name = host.querySelector<HTMLInputElement>('input[type="text"]');
    if (!name) throw new Error("no name field");

    act(() => name.focus());
    act(() => typeInto(name, "  Payments  "));
    act(() => press(name, "Enter"));

    expect(fake.ttModeling.updateLabel).toHaveBeenCalledTimes(1);
    expect(fake.ttModeling.updateLabel).toHaveBeenCalledWith(team, "Payments");
  });

  it("hands the focus to the canvas after Enter in a single-line field, not in a text area", () => {
    const fake = fakeModeler();
    act(() => root.render(<Host modeler={fake.modeler} />));
    fake.select(team);
    const name = host.querySelector<HTMLInputElement>('input[type="text"]');
    const description = host.querySelector<HTMLTextAreaElement>("textarea");
    if (!name || !description) throw new Error("no name or description field");

    act(() => description.focus());
    act(() => press(description, "Enter"));
    expect(fake.canvas.focus).not.toHaveBeenCalled();

    act(() => name.focus());
    act(() => typeInto(name, "Payments"));
    act(() => press(name, "Enter"));
    expect(fake.ttModeling.updateLabel).toHaveBeenCalledWith(team, "Payments");
    expect(fake.canvas.focus).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an interaction", interaction],
    ["a flow of change", flow],
  ])("hands the focus to the canvas after Enter in the label of %s", (_kind, element) => {
    const fake = fakeModeler();
    act(() => root.render(<Host modeler={fake.modeler} />));
    fake.select(element);
    const label = host.querySelector<HTMLInputElement>('input[type="text"]');
    if (!label) throw new Error("no label field");

    act(() => label.focus());
    act(() => typeInto(label, "Fraud rules"));
    act(() => press(label, "Enter"));

    expect(fake.ttModeling.updateLabel).toHaveBeenCalledWith(element, "Fraud rules");
    expect(fake.canvas.focus).toHaveBeenCalledTimes(1);
  });

  it("closes on Close and hands focus to the canvas", () => {
    const fake = fakeModeler();
    act(() => root.render(<Host modeler={fake.modeler} />));
    fake.select(team);

    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Close"]')?.click());

    expect(fake.selection.select).toHaveBeenLastCalledWith(null);
    expect(fake.canvas.focus).toHaveBeenCalledTimes(1);
    expect(panel()).toBeNull();
  });

  it.each([
    ["Delete team", team],
    ["Delete interaction", interaction],
    ["Delete flow of change", flow],
    ["Delete annotation", annotation],
  ])("%s removes the element and hands focus to the canvas", (name, element) => {
    const fake = fakeModeler();
    act(() => root.render(<Host modeler={fake.modeler} />));
    fake.select(element);

    act(() => button(name)?.click());

    expect(fake.modeling.removeElements).toHaveBeenCalledWith([element]);
    expect(fake.canvas.focus).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["while it composes", { isComposing: true }],
    ["after compositionend, as Safari sends it", { isComposing: false, keyCode: 229 }],
  ])("leaves an Enter or Escape that ends an IME composition to it, %s", (_when, composing) => {
    const fake = fakeModeler();
    act(() => root.render(<Host modeler={fake.modeler} />));
    fake.select(team);
    const name = host.querySelector<HTMLInputElement>('input[type="text"]');
    if (!name) throw new Error("no name field");

    act(() => name.focus());
    act(() => typeInto(name, "Payments"));
    act(() => press(name, "Enter", composing));
    act(() => press(name, "Escape", composing));

    expect(document.activeElement).toBe(name);
    expect(name.value).toBe("Payments");
    expect(fake.ttModeling.updateLabel).not.toHaveBeenCalled();
    expect(fake.canvas.focus).not.toHaveBeenCalled();
    expect(fake.selection.select).toHaveBeenCalledTimes(1);
    expect(panel()).not.toBeNull();
  });

  it("deletes a multi-selection together and hands focus to the canvas", () => {
    const fake = fakeModeler();
    act(() => root.render(<Host modeler={fake.modeler} />));
    fake.select(team, interaction, flow);

    act(() => button("Delete 3 elements")?.click());

    expect(fake.modeling.removeElements).toHaveBeenCalledWith([team, interaction, flow]);
    expect(fake.canvas.focus).toHaveBeenCalled();
  });

  it("offers to reset colours only when a team has its own", () => {
    const fake = fakeModeler();
    act(() => root.render(<Host modeler={fake.modeler} />));

    fake.select(team);
    expect(button("Reset colours")).toBeUndefined();

    const coloured = { ...team, id: "team_b", fill: "#ffeeaa" };
    fake.select(coloured);
    act(() => button("Reset colours")?.click());
    expect(fake.ttModeling.setColors).toHaveBeenCalledWith(coloured, undefined, undefined);
  });

  it("detaches an attached annotation", () => {
    const fake = fakeModeler();
    act(() => root.render(<Host modeler={fake.modeler} />));
    const attached = { ...annotation, outgoing: [] as unknown[] };
    attached.outgoing.push({ ttKind: "association", source: attached, target: team });

    fake.select(attached);
    expect(host.textContent).toContain("Attached to “Checkout”.");
    act(() => button("Detach")?.click());

    expect(fake.ttModeling.detachAnnotation).toHaveBeenCalledWith(attached);
  });

  it("disables every control but Close while read-only", () => {
    const fake = fakeModeler();
    act(() => root.render(<Host modeler={fake.modeler} readOnly />));
    fake.select(team);

    const controls = [...host.querySelectorAll<HTMLInputElement>("input, select, textarea")];
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.every((control) => control.matches(":disabled"))).toBe(true);
    expect(button("Delete team")?.matches(":disabled")).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Close"]')?.disabled).toBe(false);
  });

  it("gives the canvas the focus a removed panel field had", () => {
    const fake = fakeModeler();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    act(() => root.render(<Host modeler={fake.modeler} />));
    fake.select(team);
    act(() => host.querySelector("textarea")?.focus());

    fake.select();

    expect(document.activeElement).toBe(fake.canvasElement);
  });

  it.each([
    ["Reset colours", "that focused it, as in Chromium", true],
    ["Reset colours", "that left the focus where it was, as in Safari", false],
    ["Detach", "that focused it, as in Chromium", true],
    ["Detach", "that left the focus where it was, as in Safari", false],
  ] as const)("%s hands the focus to the canvas after a click %s", async (name, _how, focuses) => {
    const fake = fakeModeler();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    act(() => root.render(<Host modeler={fake.modeler} />));
    const { element, takeAway } = removableControl(name);
    fake.select(element);
    if (focuses) act(() => button(name)?.focus());

    act(() => button(name)?.click());
    takeAway();
    fake.change();
    await settle();

    expect(button(name)).toBeUndefined();
    expect(document.activeElement).toBe(fake.canvasElement);
  });

  it.each(["Reset colours", "Detach"] as const)(
    "gives the canvas the focus that %s had when an undo took it away",
    async (name) => {
      const fake = fakeModeler();
      vi.spyOn(document, "hasFocus").mockReturnValue(true);
      act(() => root.render(<Host modeler={fake.modeler} />));
      const { element, takeAway } = removableControl(name);
      fake.select(element);
      act(() => button(name)?.focus());

      takeAway();
      fake.change();
      await settle();

      expect(button(name)).toBeUndefined();
      expect(document.activeElement).toBe(fake.canvasElement);
    },
  );

  it("leaves the focus alone when a control goes away after the focus left it", async () => {
    const fake = fakeModeler();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    act(() => root.render(<Host modeler={fake.modeler} />));
    const { element, takeAway } = removableControl("Reset colours");

    fake.select(element);
    act(() => button("Reset colours")?.focus());
    act(() => button("Reset colours")?.blur());
    await settle();
    takeAway();
    fake.change();
    await settle();

    expect(button("Reset colours")).toBeUndefined();
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves the focus alone when this document doesn't have it", async () => {
    const fake = fakeModeler();
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    act(() => root.render(<Host modeler={fake.modeler} />));
    const { element, takeAway } = removableControl("Reset colours");
    fake.select(element);
    act(() => button("Reset colours")?.focus());

    takeAway();
    fake.change();
    await settle();
    expect(document.activeElement).toBe(document.body);

    act(() => host.querySelector("textarea")?.focus());
    fake.select();
    await settle();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("InspectorSlotContent", () => {
  let host: HTMLElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("aside");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    removeFakeCanvases();
  });

  it("opens the host's panel for a selection and closes it again", () => {
    const { modeler, select, selection } = fakeModeler();
    const slot = { element: host, open: vi.fn(), close: vi.fn() };
    act(() => root.render(<InspectorSlotContent modeler={modeler} slot={slot} />));
    expect(slot.close).toHaveBeenCalled();
    expect(host.querySelector(".tt-inspector__content")).toBeNull();

    select(team);
    expect(slot.open).toHaveBeenCalled();
    expect(host.querySelector(".tt-inspector__header")?.textContent).toBe("Team");
    expect(host.querySelector("aside")).toBeNull();

    slot.close.mockClear();
    act(() => selection.select(null));
    expect(slot.close).toHaveBeenCalled();
    expect(host.querySelector(".tt-inspector__content")).toBeNull();
  });

  it("disables the fields while the host can't save", () => {
    const { modeler, select } = fakeModeler();
    const slot = { element: host, open: vi.fn(), close: vi.fn() };
    act(() => root.render(<InspectorSlotContent modeler={modeler} slot={slot} readOnly />));
    select(team);
    expect(host.querySelector<HTMLFieldSetElement>("fieldset")?.disabled).toBe(true);
  });
});
