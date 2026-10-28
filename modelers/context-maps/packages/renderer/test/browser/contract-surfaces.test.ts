/**
 * The 1.5 surfaces of the collaborative-modeler contract (`interaction`, `appearance`) and the
 * gesture cancel of L1, checked the way the conformance kit's cases will check them
 * (`packages/api/README.md`, "Cases for the 1.5 surfaces"), with the harness fields they read:
 * `startGesture`, `armTool` and `exportImage`.
 */
import { afterEach, describe, expect, test } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type { AppearanceRequest } from "@miragon/modeler-api";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type { Shape } from "diagram-js/lib/model/Types";
import {
  CONTEXT_MAPS_THEMES,
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CmContext,
  type CmElementFactory,
  type CmLabelEditing,
  type CollaborativeContextMapsModeler,
} from "@miragon/context-maps-renderer";
import conferencePlanner from "./fixtures/conference-planner.cm?raw";
import orderFulfilment from "./fixtures/order-fulfilment.cm?raw";

const CANONICAL_TEXTS = [conferencePlanner, orderFulfilment] as const;
const INVALID_TEXT = '{ "version": 1, "title": "Half typed", "contexts": [';
const VIEW_STATE = { x: 120, y: 80, width: 640, height: 480 };

/** Free canvas of the conference planner, away from every context and relationship. */
const FREE_SPOT = { x: 150, y: 600 };
const MOVED_CONTEXT = "ctx_cfp";

type GestureKind = "move" | "create" | "createOffCanvas";
const GESTURE_KINDS: readonly GestureKind[] = ["move", "create", "createOffCanvas"];

interface HeldGesture {
  /** Releases the pointer, or clicks where the preview is. */
  drop(): void;
  /** Escape. */
  cancel(): void;
}

interface ClientPoint {
  clientX: number;
  clientY: number;
}

const teardowns: Array<() => void> = [];

afterEach(() => {
  for (const teardown of teardowns.splice(0)) teardown();
  delete document.documentElement.dataset.cdTheme;
  delete document.documentElement.dataset.cdKontrast;
});

function mounted(modeler: CollaborativeContextMapsModeler): HTMLElement {
  const host = attachedHost();
  modeler.attachTo(host);
  teardowns.push(() => {
    modeler.destroy();
    host.parentElement?.remove();
  });
  return host;
}

async function editorOn(
  text: string = CANONICAL_TEXTS[0],
): Promise<CollaborativeContextMapsModeler> {
  const modeler = createCollaborativeModeler();
  mounted(modeler);
  await modeler.importText(text);
  return modeler;
}

function windowErrors(): unknown[] {
  const errors: unknown[] = [];
  const collect = (event: ErrorEvent) => errors.push(event.error ?? event.message);
  window.addEventListener("error", collect);
  teardowns.push(() => window.removeEventListener("error", collect));
  return errors;
}

function changeCounter(modeler: CollaborativeContextMapsModeler): () => number {
  let changes = 0;
  modeler.onContentChanged(() => (changes += 1));
  return () => changes;
}

function interactionRecorder(modeler: CollaborativeContextMapsModeler): boolean[] {
  const delivered: boolean[] = [];
  modeler.interaction.onChange((active) => {
    expect(modeler.interaction.active()).toBe(active);
    delivered.push(active);
  });
  return delivered;
}

function service<T>(modeler: CollaborativeContextMapsModeler, name: string): T {
  return modeler.diagram.get<T>(name);
}

function canvasContainer(modeler: CollaborativeContextMapsModeler): HTMLElement {
  return service<Canvas>(modeler, "canvas").getContainer();
}

function clientPoint(
  modeler: CollaborativeContextMapsModeler,
  point: { x: number; y: number },
): ClientPoint {
  const canvas = service<Canvas>(modeler, "canvas");
  const viewbox = canvas.viewbox();
  const box = canvas.getContainer().getBoundingClientRect();
  return {
    clientX: box.left + (point.x - viewbox.x) * viewbox.scale,
    clientY: box.top + (point.y - viewbox.y) * viewbox.scale,
  };
}

function shifted(point: ClientPoint, right: number, down: number): ClientPoint {
  return { clientX: point.clientX + right, clientY: point.clientY + down };
}

function centreOfBox(element: Element): ClientPoint {
  const box = element.getBoundingClientRect();
  return { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
}

function pointer(
  target: EventTarget,
  type: string,
  at: ClientPoint,
  init: MouseEventInit = {},
): void {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...at, ...init }),
  );
}

function canvasSvg(modeler: CollaborativeContextMapsModeler): SVGSVGElement {
  return canvasContainer(modeler).querySelector(":scope > svg")!;
}

function hoverCanvasAt(modeler: CollaborativeContextMapsModeler, at: ClientPoint): void {
  pointer(document, "mousemove", at);
  pointer(canvasSvg(modeler), "mouseover", at);
  pointer(document, "mousemove", at);
}

function paletteEntry(modeler: CollaborativeContextMapsModeler, action: string): HTMLElement {
  const entry = canvasContainer(modeler).querySelector<HTMLElement>(
    `.djs-palette [data-action="${action}"]`,
  );
  if (!entry) throw new Error(`the palette has no "${action}" entry`);
  return entry;
}

function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
}

/** The harness field `startGesture`: a gesture held on `canonicalTexts[0]` the way a user holds it. */
function startGesture(modeler: CollaborativeContextMapsModeler, kind: GestureKind): HeldGesture {
  if (kind === "move") {
    const element = service<ElementRegistry>(modeler, "elementRegistry").get(
      MOVED_CONTEXT,
    ) as Shape;
    const start = clientPoint(modeler, {
      x: element.x + element.width / 2,
      y: element.y + element.height / 2,
    });
    const hit = service<ElementRegistry>(modeler, "elementRegistry")
      .getGraphics(MOVED_CONTEXT)
      .querySelector(".djs-hit")!;
    pointer(hit, "mousedown", start);
    pointer(document, "mousemove", shifted(start, 20, 10));
    const held = shifted(start, 40, 20);
    hoverCanvasAt(modeler, held);
    return {
      drop: () => {
        pointer(document, "mousemove", shifted(held, 10, 0));
        pointer(document, "mouseup", shifted(held, 10, 0));
      },
      cancel: pressEscape,
    };
  }
  if (kind === "create") {
    const entry = paletteEntry(modeler, "context.core");
    entry.dispatchEvent(
      new DragEvent("dragstart", { bubbles: true, cancelable: true, ...centreOfBox(entry) }),
    );
    const held = clientPoint(modeler, FREE_SPOT);
    hoverCanvasAt(modeler, held);
    return {
      drop: () => {
        pointer(document, "mousemove", shifted(held, 5, 0));
        pointer(document, "mouseup", shifted(held, 5, 0));
      },
      cancel: pressEscape,
    };
  }
  const entry = paletteEntry(modeler, "context.supporting");
  const onPalette = centreOfBox(entry);
  pointer(entry, "click", onPalette, { detail: 1 });
  pointer(document, "mousemove", shifted(onPalette, 3, 2));
  return {
    drop: () => {
      const target = clientPoint(modeler, FREE_SPOT);
      hoverCanvasAt(modeler, target);
      pointer(canvasSvg(modeler), "mousedown", target);
      pointer(document, "mouseup", target);
    },
    cancel: pressEscape,
  };
}

/** The harness field `armTool`: the palette's lasso, armed and waiting for its next press. */
function armTool(modeler: CollaborativeContextMapsModeler): void {
  const entry = paletteEntry(modeler, "lasso-tool");
  pointer(entry, "click", centreOfBox(entry), { detail: 1 });
  hoverCanvasAt(modeler, clientPoint(modeler, FREE_SPOT));
}

/** The harness field `exportImage`: the SVG export, as a host saves it. */
function exportImage(modeler: CollaborativeContextMapsModeler): string {
  return modeler.diagram.saveSVG().svg;
}

let createdContexts = 0;

function mutate(modeler: CollaborativeContextMapsModeler): void {
  createdContexts += 1;
  const context = service<CmElementFactory>(modeler, "cmElementFactory").createNewContext(
    "core",
    `Surface context ${createdContexts}`,
  );
  service<Modeling>(modeler, "modeling").createShape(
    context as unknown as Shape,
    { x: 1200, y: 900 },
    service<Canvas>(modeler, "canvas").getRootElement() as Shape,
  );
}

function undo(modeler: CollaborativeContextMapsModeler): void {
  service<CommandStack>(modeler, "commandStack").undo();
}

describe("the L1 gesture case: an accepted import cancels a running gesture", () => {
  describe.each(GESTURE_KINDS)("%s", (kind) => {
    test.each([
      { imported: "the other canonical text", index: 1 },
      { imported: "the same text again", index: 0 },
    ])("$imported", async ({ index }) => {
      const modeler = await editorOn();
      const errors = windowErrors();
      const changes = changeCounter(modeler);
      const delivered = interactionRecorder(modeler);
      const gesture = startGesture(modeler, kind);
      expect(modeler.interaction.active()).toBe(true);

      const imported = modeler.importText(CANONICAL_TEXTS[index]);
      expect(modeler.interaction.active()).toBe(false);
      expect(delivered).toEqual([true, false]);
      await imported;
      gesture.drop();

      expect(errors).toEqual([]);
      expect(changes()).toBe(0);
      expect(delivered).toEqual([true, false]);
      expect(modeler.exportText()).toBe(CANONICAL_TEXTS[index]);
      undo(modeler);
      expect(modeler.exportText()).toBe(CANONICAL_TEXTS[index]);
      mutate(modeler);
      expect(changes()).toBe(1);
    });

    test("a rejected import leaves it running", async () => {
      const modeler = await editorOn();
      const errors = windowErrors();
      const changes = changeCounter(modeler);
      const delivered = interactionRecorder(modeler);
      const gesture = startGesture(modeler, kind);

      await expect(modeler.importText(INVALID_TEXT)).rejects.toThrow();
      expect(modeler.interaction.active()).toBe(true);
      expect(delivered).toEqual([true]);
      gesture.drop();

      expect(errors).toEqual([]);
      expect(delivered).toEqual([true, false]);
      expect(changes()).toBe(1);
    });
  });
});

describe("the interaction case: active() follows every gesture", () => {
  test("false before the first import and at rest", async () => {
    const modeler = createCollaborativeModeler();
    expect(modeler.interaction.active()).toBe(false);
    mounted(modeler);
    expect(modeler.interaction.active()).toBe(false);
    await modeler.importText(CANONICAL_TEXTS[0]);
    expect(modeler.interaction.active()).toBe(false);
  });

  describe.each(GESTURE_KINDS)("%s", (kind) => {
    test.each([{ end: "drop" as const }, { end: "cancel" as const }])(
      "true while held, false after its $end, one onChange each way",
      async ({ end }) => {
        const modeler = await editorOn();
        const delivered = interactionRecorder(modeler);

        const gesture = startGesture(modeler, kind);
        expect(modeler.interaction.active()).toBe(true);
        expect(delivered).toEqual([true]);

        gesture[end]();
        expect(modeler.interaction.active()).toBe(false);
        expect(delivered).toEqual([true, false]);
      },
    );
  });

  test("an armed tool is no gesture", async () => {
    const modeler = await editorOn();
    const delivered = interactionRecorder(modeler);

    armTool(modeler);

    expect(modeler.interaction.active()).toBe(false);
    expect(delivered).toEqual([]);
  });

  test("the unsubscribe ends the delivery", async () => {
    const modeler = await editorOn();
    const delivered: boolean[] = [];
    const unsubscribe = modeler.interaction.onChange((active) => delivered.push(active));

    startGesture(modeler, "move").drop();
    unsubscribe();
    startGesture(modeler, "move").drop();

    expect(delivered).toEqual([true, false]);
  });

  test("nothing is delivered after destroy()", async () => {
    const modeler = await editorOn();
    const delivered: boolean[] = [];
    modeler.interaction.onChange((active) => delivered.push(active));
    startGesture(modeler, "move");

    modeler.destroy();

    expect(delivered).toEqual([true]);
    expect(modeler.interaction.active()).toBe(false);
  });

  test("the viewer reports no gesture", async () => {
    const viewer = createCollaborativeViewer();
    mounted(viewer);
    await viewer.importText(CANONICAL_TEXTS[0]);
    expect(viewer.interaction.active()).toBe(false);
    expect(typeof viewer.interaction.onChange(() => undefined)).toBe("function");
  });
});

/**
 * Every computed colour of what the modeler put into its host, the way the kit compares them. The
 * host element itself is the page's.
 */
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
] as const;

function computedColours(host: Element): string[] {
  return [...host.querySelectorAll("*")].map((element) => {
    const style = getComputedStyle(element);
    return COLOUR_PROPERTIES.map((property) => style.getPropertyValue(property)).join(" | ");
  });
}

function hostOf(modeler: CollaborativeContextMapsModeler): HTMLElement {
  return modeler.diagram.container.parentElement!;
}

function pageInTheOtherMode(): void {
  document.documentElement.dataset.cdTheme = "dark";
  document.documentElement.dataset.cdKontrast = "hoch";
}

const UNKNOWN_THEME = { theme: "sepia" } as unknown as AppearanceRequest;

describe("the appearance case: a theme is view state, an unlisted one falls back to themes[0]", () => {
  test("themes is light only, the same on every read, on every instance and on the viewer", () => {
    const modeler = createCollaborativeModeler();
    const another = createCollaborativeModeler();
    const viewer = createCollaborativeViewer();
    teardowns.push(() => {
      modeler.destroy();
      another.destroy();
      viewer.destroy();
    });

    expect(modeler.appearance.themes).toEqual(["light"]);
    expect(modeler.appearance.themes).toBe(CONTEXT_MAPS_THEMES);
    expect(modeler.appearance.themes).toBe(modeler.appearance.themes);
    expect(another.appearance.themes).toBe(CONTEXT_MAPS_THEMES);
    expect(viewer.appearance.themes).toBe(CONTEXT_MAPS_THEMES);
    expect(Object.isFrozen(CONTEXT_MAPS_THEMES)).toBe(true);
  });

  test("set before attachTo and the first import draws the request, and it holds across imports", async () => {
    const modeler = createCollaborativeModeler();
    expect(() => modeler.appearance.set({ theme: "dark", contrast: "high" })).not.toThrow();
    const root = modeler.diagram.container;
    expect(root.dataset.cdTheme).toBe("light");
    expect(root.dataset.cdKontrast).toBe("hoch");

    mounted(modeler);
    await modeler.importText(CANONICAL_TEXTS[0]);
    await modeler.importText(CANONICAL_TEXTS[1]);
    expect(root.dataset.cdTheme).toBe("light");
    expect(root.dataset.cdKontrast).toBe("hoch");

    modeler.appearance.set({ theme: "light" });
    expect(root.dataset.cdKontrast).toBeUndefined();
  });

  test("until the first set the modeler draws as it does without the surface", () => {
    const modeler = createCollaborativeModeler();
    teardowns.push(() => modeler.destroy());
    expect(modeler.diagram.container.dataset.cdTheme).toBeUndefined();
    expect(modeler.diagram.container.dataset.cdKontrast).toBeUndefined();
  });

  test("a request from an untyped host never throws and counts as light at normal contrast", () => {
    const modeler = createCollaborativeModeler();
    teardowns.push(() => modeler.destroy());
    const root = modeler.diagram.container;
    for (const request of [
      undefined,
      null,
      "dark",
      UNKNOWN_THEME,
      { theme: "light", contrast: "maximal" },
    ] as unknown as AppearanceRequest[]) {
      modeler.appearance.set({ theme: "light", contrast: "high" });
      expect(() => modeler.appearance.set(request)).not.toThrow();
      expect(root.dataset.cdTheme).toBe("light");
      expect(root.dataset.cdKontrast).toBeUndefined();
    }
  });

  test("no change event, byte-identical exports, the view, the selection and the history kept", async () => {
    const modeler = await editorOn();
    const changes = changeCounter(modeler);
    mutate(modeler);
    expect(changes()).toBe(1);
    modeler.elements.reveal(MOVED_CONTEXT);
    modeler.setViewState(VIEW_STATE);
    const text = modeler.exportText();
    const image = exportImage(modeler);
    const view = modeler.getViewState();
    const selection = modeler.elements.selection();

    for (const request of [
      { theme: "light" },
      { theme: "dark" },
      { theme: "light", contrast: "high" },
      { theme: "dark", contrast: "high" },
      UNKNOWN_THEME,
    ] as AppearanceRequest[]) {
      modeler.appearance.set(request);
      expect(changes()).toBe(1);
      expect(modeler.exportText()).toBe(text);
      expect(exportImage(modeler)).toBe(image);
      expect(modeler.getViewState()).toEqual(view);
      expect(modeler.elements.selection()).toEqual(selection);
    }

    undo(modeler);
    expect(modeler.exportText()).toBe(CANONICAL_TEXTS[0]);
  });

  test("a light-only modeler stays light, at the contrast asked for, on a page in the other mode", async () => {
    const modeler = await editorOn();
    const host = hostOf(modeler);

    modeler.appearance.set({ theme: "light", contrast: "normal" });
    const normal = computedColours(host);
    modeler.appearance.set({ theme: "light", contrast: "high" });
    const high = computedColours(host);
    expect(high).not.toEqual(normal);

    pageInTheOtherMode();
    for (const theme of ["dark", "sepia"]) {
      modeler.appearance.set({ theme, contrast: "normal" } as AppearanceRequest);
      expect(computedColours(host)).toEqual(normal);
      modeler.appearance.set({ theme, contrast: "high" } as AppearanceRequest);
      expect(computedColours(host)).toEqual(high);
    }
    await modeler.importText(CANONICAL_TEXTS[0]);
    expect(computedColours(host)).toEqual(high);
    modeler.appearance.set({ theme: "dark" });
    expect(computedColours(host)).toEqual(normal);
  });

  test("without a request the roles come from the page: the comparison above bites", async () => {
    const reference = await editorOn();
    reference.appearance.set({ theme: "light" });
    const light = computedColours(hostOf(reference));

    pageInTheOtherMode();
    const unrequested = await editorOn();
    expect(computedColours(hostOf(unrequested))).not.toEqual(light);
  });

  test("a set over an open label edit commits nothing and keeps it open", async () => {
    const modeler = await editorOn();
    const changes = changeCounter(modeler);
    const context = service<ElementRegistry>(modeler, "elementRegistry").get(MOVED_CONTEXT);
    service<CmLabelEditing>(modeler, "cmLabelEditing").activate(context as unknown as CmContext);
    const field = canvasContainer(modeler).querySelector<HTMLElement>(
      ".djs-direct-editing-content",
    )!;
    field.innerText = "typed, not committed";

    modeler.appearance.set({ theme: "dark", contrast: "high" });
    modeler.appearance.set({ theme: "light" });

    expect(changes()).toBe(0);
    expect(modeler.exportText()).toBe(CANONICAL_TEXTS[0]);
    expect(service<CmLabelEditing>(modeler, "cmLabelEditing").openEdit()).toEqual({
      elementId: MOVED_CONTEXT,
      text: "typed, not committed",
    });
  });

  test("the viewer has the same surface", async () => {
    const viewer = createCollaborativeViewer();
    mounted(viewer);
    await viewer.importText(CANONICAL_TEXTS[0]);
    const text = viewer.exportText();

    viewer.appearance.set({ theme: "dark", contrast: "high" });

    expect(viewer.diagram.container.dataset.cdTheme).toBe("light");
    expect(viewer.diagram.container.dataset.cdKontrast).toBe("hoch");
    expect(viewer.exportText()).toBe(text);
  });

  test("set after destroy() throws nothing", () => {
    const modeler = createCollaborativeModeler();
    modeler.destroy();
    expect(() => modeler.appearance.set({ theme: "dark" })).not.toThrow();
  });
});
