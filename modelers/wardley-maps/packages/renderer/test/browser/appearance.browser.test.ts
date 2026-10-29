import { afterEach, describe, expect, test } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type { AppearanceRequest } from "@miragon/modeler-api";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type { Shape } from "diagram-js/lib/model/Types";
import {
  WARDLEY_THEMES,
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeWardleyModeler,
} from "../../src/index.js";
import type WardleyElementFactory from "../../src/model/WardleyElementFactory.js";
import type WardleyLabelEditing from "../../src/label-editing/WardleyLabelEditing.js";
import type { WardleyShape } from "../../src/model/di-types.js";
import { diagramOf, exportImage } from "./support/gesture-harness.js";
import teaShop from "./fixtures/tea-shop.wmap?raw";
import "../../src/assets/wardley.css";

// The `appearance` surface of contract 1.5, following the kit's planned appearance case
// (packages/api/README.md, "Cases for the 1.5 surfaces").

const mountedModelers: CollaborativeWardleyModeler[] = [];
const hostWrappers: HTMLElement[] = [];
const page = document.documentElement;

afterEach(() => {
  page.removeAttribute("data-cd-theme");
  page.removeAttribute("data-cd-kontrast");
  for (const modeler of mountedModelers.splice(0)) modeler.destroy();
  for (const wrapper of hostWrappers.splice(0)) wrapper.remove();
});

function mount(modeler: CollaborativeWardleyModeler): HTMLElement {
  const host = attachedHost();
  hostWrappers.push(host.parentElement ?? host);
  modeler.attachTo(host);
  mountedModelers.push(modeler);
  return host;
}

const VIEW_STATE = { x: 120, y: 80, width: 640, height: 480 };

/** Every request a host may send, typed or not: listed, unlisted and unknown themes and contrasts. */
const REQUESTS: readonly unknown[] = [
  { theme: "light" },
  { theme: "light", contrast: "normal" },
  { theme: "light", contrast: "high" },
  { theme: "dark" },
  { theme: "dark", contrast: "high" },
  { theme: "sepia", contrast: "high" },
  { theme: "sepia", contrast: "loud" },
  {},
  undefined,
  null,
  "dark",
];

function set(modeler: CollaborativeWardleyModeler, request: unknown): void {
  modeler.appearance.set(request as AppearanceRequest);
}

function addComponent(modeler: CollaborativeWardleyModeler): void {
  const diagram = diagramOf(modeler);
  const component = diagram
    .get<WardleyElementFactory>("wardleyElementFactory")
    .createNew("component", "Added Component");
  diagram
    .get<Modeling>("modeling")
    .createShape(
      component as unknown as Shape,
      { x: 400, y: 300 },
      diagram.get<Canvas>("canvas").getRootElement() as Shape,
    );
}

/** The map with one edit on its history, an element revealed and a panned view. */
async function editedMap(modeler: CollaborativeWardleyModeler): Promise<string> {
  await modeler.importText(teaShop);
  addComponent(modeler);
  const [first] = modeler.elements.list();
  if (!first || !modeler.elements.reveal(first.id)) throw new Error("nothing to reveal");
  modeler.setViewState(VIEW_STATE);
  return teaShop;
}

const COLOUR_PROPERTIES = /color|fill|stroke|shadow|image|scheme/;

/** The computed colours of every element the modeler drew into `host`, transitions finished. */
function colours(host: HTMLElement): string[] {
  const read = () =>
    [...host.querySelectorAll("*")].map((element) => {
      const style = getComputedStyle(element);
      const values: string[] = [];
      for (let index = 0; index < style.length; index += 1) {
        const property = style.item(index);
        if (COLOUR_PROPERTIES.test(property)) {
          values.push(`${property}: ${style.getPropertyValue(property)}`);
        }
      }
      return `${element.tagName} ${element.getAttribute("class") ?? ""} { ${values.join("; ")} }`;
    });
  read();
  for (const animation of document.getAnimations()) {
    try {
      animation.finish();
    } catch {
      animation.cancel();
    }
  }
  return read();
}

function labelField(modeler: CollaborativeWardleyModeler): HTMLTextAreaElement | null {
  return diagramOf(modeler)
    .get<Canvas>("canvas")
    .getContainer()
    .querySelector<HTMLTextAreaElement>("textarea.wardley-label-input");
}

/** The harness's `openInteraction`: types into Kettle's name editor without committing. */
function openInteraction(modeler: CollaborativeWardleyModeler): void {
  const diagram = diagramOf(modeler);
  const kettle = diagram.get<ElementRegistry>("elementRegistry").get("cmp_kettle");
  diagram.get<WardleyLabelEditing>("wardleyLabelEditing").activate(kettle as WardleyShape);
  const field = labelField(modeler);
  if (!field) throw new Error("no label editor opened");
  field.value = "typed, not committed";
}

function commitInteraction(modeler: CollaborativeWardleyModeler): void {
  labelField(modeler)?.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
  );
}

describe("appearance (the kit's appearance case)", () => {
  test("lists light only, the same on every read, every instance and the viewer", () => {
    const modeler = createCollaborativeModeler();
    const other = createCollaborativeModeler();
    const viewer = createCollaborativeViewer();
    mountedModelers.push(modeler, other, viewer);
    const { themes } = modeler.appearance;
    expect(themes).toEqual(["light"]);
    expect(new Set(themes).size).toBe(themes.length);
    expect(modeler.appearance.themes).toBe(themes);
    expect(other.appearance.themes).toBe(themes);
    expect(viewer.appearance.themes).toBe(themes);
    expect(themes).toBe(WARDLEY_THEMES);
    expect(Object.isFrozen(themes)).toBe(true);
  });

  test("takes a request before attachTo and before the first import, for the first frame", async () => {
    const modeler = createCollaborativeModeler();
    const container = diagramOf(modeler).container;
    expect(container.hasAttribute("data-cd-theme")).toBe(false);
    expect(() => set(modeler, { theme: "dark", contrast: "high" })).not.toThrow();
    mount(modeler);
    expect(() => set(modeler, { theme: "dark", contrast: "high" })).not.toThrow();
    await modeler.importText(teaShop);
    expect(container.getAttribute("data-cd-theme")).toBe("light");
    expect(container.getAttribute("data-cd-kontrast")).toBe("hoch");
  });

  test("is view state: no change event, the same exports, history, view and selection", async () => {
    const modeler = createCollaborativeModeler();
    mount(modeler);
    await editedMap(modeler);
    const commandStack = diagramOf(modeler).get<CommandStack>("commandStack");
    let changes = 0;
    modeler.onContentChanged(() => (changes += 1));
    const text = modeler.exportText();
    const image = await exportImage(modeler);
    const view = modeler.getViewState();
    const selection = modeler.elements.selection();
    expect(selection).toHaveLength(1);

    for (const request of REQUESTS) {
      expect(() => set(modeler, request)).not.toThrow();
      expect(changes).toBe(0);
      expect(modeler.exportText()).toBe(text);
      expect(await exportImage(modeler)).toBe(image);
      expect(modeler.getViewState()).toEqual(view);
      expect(modeler.elements.selection()).toEqual(selection);
      expect(commandStack.canUndo()).toBe(true);
      expect(commandStack.canRedo()).toBe(false);
    }
    commandStack.undo();
    expect(modeler.exportText()).toBe(teaShop);
    expect(commandStack.canUndo()).toBe(false);
  });

  test("stays light on a dark page, and holds the requested contrast on any page", async () => {
    const modeler = createCollaborativeModeler();
    const host = mount(modeler);
    await editedMap(modeler);
    const [fallback] = modeler.appearance.themes;
    set(modeler, { theme: fallback, contrast: "normal" });
    const normal = colours(host);
    set(modeler, { theme: fallback, contrast: "high" });
    const high = colours(host);
    expect(high).not.toEqual(normal);

    page.setAttribute("data-cd-theme", "dark");
    page.setAttribute("data-cd-kontrast", "hoch");
    for (const theme of ["dark", "sepia"]) {
      set(modeler, { theme, contrast: "normal" });
      expect(colours(host)).toEqual(normal);
      set(modeler, { theme, contrast: "high" });
      expect(colours(host)).toEqual(high);
    }

    set(modeler, { theme: "dark" });
    await modeler.importText(teaShop);
    const imported = colours(host);
    page.removeAttribute("data-cd-theme");
    page.removeAttribute("data-cd-kontrast");
    expect(colours(host)).toEqual(imported);
    set(modeler, { theme: "dark", contrast: "high" });
    const importedHigh = colours(host);
    page.setAttribute("data-cd-theme", "dark");
    expect(colours(host)).toEqual(importedHigh);
    expect(importedHigh).not.toEqual(imported);
  });

  test("commits no open label editor, and keeps it open with its typed name", async () => {
    const reference = createCollaborativeModeler();
    mount(reference);
    await reference.importText(teaShop);
    openInteraction(reference);
    commitInteraction(reference);
    const committed = reference.exportText();
    expect(committed).toContain("typed, not committed");

    const modeler = createCollaborativeModeler();
    mount(modeler);
    await modeler.importText(teaShop);
    let changes = 0;
    modeler.onContentChanged(() => (changes += 1));
    openInteraction(modeler);
    for (const request of REQUESTS) set(modeler, request);
    expect(changes).toBe(0);
    expect(modeler.exportText()).toBe(teaShop);
    const edit = diagramOf(modeler).get<WardleyLabelEditing>("wardleyLabelEditing").getActiveEdit();
    expect(edit).toMatchObject({ elementId: "cmp_kettle", value: "typed, not committed" });
    commitInteraction(modeler);
    expect(modeler.exportText()).toBe(committed);
  });

  test("on the viewer: light, and view state only", async () => {
    const viewer = createCollaborativeViewer();
    const host = mount(viewer);
    await viewer.importText(teaShop);
    const text = viewer.exportText();
    const image = await exportImage(viewer);
    set(viewer, { theme: "light" });
    const normal = colours(host);
    page.setAttribute("data-cd-theme", "dark");
    set(viewer, { theme: "dark" });
    expect(colours(host)).toEqual(normal);
    expect(viewer.exportText()).toBe(text);
    expect(await exportImage(viewer)).toBe(image);
  });

  test("does nothing after destroy()", () => {
    const modeler = createCollaborativeModeler();
    mount(modeler);
    const container = diagramOf(modeler).container;
    modeler.destroy();
    expect(() => set(modeler, { theme: "light", contrast: "high" })).not.toThrow();
    expect(container.hasAttribute("data-cd-kontrast")).toBe(false);
  });
});
