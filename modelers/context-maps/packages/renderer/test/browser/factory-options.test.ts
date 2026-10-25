import { afterEach, expect, test } from "vitest";
import { MODELER_API_VERSION } from "@miragon/modeler-api";
import {
  Modeler,
  createCollaborativeModeler,
  createCollaborativeViewer,
  isCmContext,
} from "@miragon/context-maps-renderer";
import type { CmContext, CmLabelEditing, CmViewerOptions } from "@miragon/context-maps-renderer";
import { SAMPLE_DOCUMENT, serializeDocumentText } from "@miragon/context-maps-schema-model";

interface Viewbox {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

interface CanvasLike {
  viewbox(box?: { x: number; y: number; width: number; height: number }): Viewbox;
}

const wrappers: HTMLElement[] = [];

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.remove();
});

function host(): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:absolute;left:0;top:0;width:900px;height:640px";
  const container = document.createElement("div");
  wrapper.append(container);
  document.body.appendChild(wrapper);
  wrappers.push(wrapper);
  return container;
}

function mountModeler(options: CmViewerOptions = {}): Modeler {
  const modeler = new Modeler({ container: host(), ...options });
  modeler.importDocument(SAMPLE_DOCUMENT);
  return modeler;
}

/** Enter on the palette's core-domain entry; the id of the context it created. */
function createByKeyboard(modeler: Modeler): CmContext {
  const registry = modeler.get<{ getAll(): unknown[] }>("elementRegistry");
  const before = new Set(registry.getAll());
  modeler.container
    .querySelector<HTMLElement>('.djs-palette [data-action="context.core"]')!
    .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
  const created = registry
    .getAll()
    .filter((element) => !before.has(element) && isCmContext(element));
  expect(created).toHaveLength(1);
  modeler.get<CmLabelEditing>("cmLabelEditing").cancel();
  return created[0] as CmContext;
}

function screenCentre(modeler: Modeler, shape: CmContext): { x: number; y: number } {
  const viewbox = modeler.get<CanvasLike>("canvas").viewbox();
  return {
    x: (shape.x + shape.width / 2 - viewbox.x) * viewbox.scale,
    y: (shape.y + shape.height / 2 - viewbox.y) * viewbox.scale,
  };
}

const INSETS = { top: 88, right: 24, bottom: 64, left: 24 };

test("freeArea.insets places a keyboard-created context and fits like freeRectInsets", () => {
  const aligned = mountModeler({ freeArea: { insets: () => INSETS } });
  const deprecated = mountModeler({ freeRectInsets: () => INSETS });
  try {
    const viewboxOf = (modeler: Modeler) => modeler.get<CanvasLike>("canvas").viewbox();
    expect(viewboxOf(aligned)).toEqual(viewboxOf(deprecated));
    const centre = screenCentre(aligned, createByKeyboard(aligned));
    expect(centre.x).toBeCloseTo((900 - 24 - 24) / 2 + 24, 0);
    expect(centre.y).toBeCloseTo((640 - 88 - 64) / 2 + 88, 0);
  } finally {
    aligned.destroy();
    deprecated.destroy();
  }
});

test("freeArea wins over freeRectInsets when a host passes both", () => {
  const modeler = mountModeler({
    freeArea: { insets: () => INSETS },
    freeRectInsets: () => ({ top: 0, right: 400, bottom: 0, left: 0 }),
  });
  try {
    const centre = screenCentre(modeler, createByKeyboard(modeler));
    expect(centre.x).toBeCloseTo((900 - 24 - 24) / 2 + 24, 0);
  } finally {
    modeler.destroy();
  }
});

test("freeArea.center places a keyboard-created context at that diagram point", () => {
  const point = { x: 1234, y: 567 };
  const modeler = mountModeler({ freeArea: { center: () => point } });
  try {
    const shape = createByKeyboard(modeler);
    expect(shape.x + shape.width / 2).toBeCloseTo(point.x, 0);
    expect(shape.y + shape.height / 2).toBeCloseTo(point.y, 0);
    expect(point).toEqual({ x: 1234, y: 567 });
    const next = createByKeyboard(modeler);
    expect(next.x - shape.x).toBe(24);
  } finally {
    modeler.destroy();
  }
});

test("given only freeArea.center, the fit after an import is the fit without the option", () => {
  const centreOnly = mountModeler({ freeArea: { center: () => ({ x: 1234, y: 567 }) } });
  const withoutOption = mountModeler();
  try {
    const viewboxOf = (modeler: Modeler) => modeler.get<CanvasLike>("canvas").viewbox();
    expect(viewboxOf(centreOnly)).toEqual(viewboxOf(withoutOption));
  } finally {
    centreOnly.destroy();
    withoutOption.destroy();
  }
});

test("fitOnImport: false leaves the view to the host; the default fits every import", () => {
  const view = { x: -500, y: -400, width: 450, height: 320 };
  const fitted = mountModeler();
  const hostFits = mountModeler({ fitOnImport: false });
  try {
    for (const modeler of [fitted, hostFits]) {
      modeler.get<CanvasLike>("canvas").viewbox(view);
      modeler.importDocument(SAMPLE_DOCUMENT);
    }
    const kept = hostFits.get<CanvasLike>("canvas").viewbox();
    expect(kept.x).toBeCloseTo(view.x, 3);
    expect(kept.scale).toBeCloseTo(2, 3);
    expect(fitted.get<CanvasLike>("canvas").viewbox().x).not.toBeCloseTo(view.x, 0);
  } finally {
    fitted.destroy();
    hostFits.destroy();
  }
});

test("the contract factories take the aligned options; the viewer ignores undoRedoKeys", async () => {
  const modeler = createCollaborativeModeler({
    fitOnImport: false,
    freeArea: { insets: () => INSETS },
  });
  const viewer = createCollaborativeViewer({ undoRedoKeys: false, fitOnImport: false });
  try {
    for (const mount of [modeler, viewer]) {
      mount.attachTo(host());
      mount.setViewState({ x: -500, y: -400, width: 450, height: 320 });
      const set = mount.getViewState();
      await mount.importText(serializeDocumentText(SAMPLE_DOCUMENT));
      expect(mount.getViewState()).toEqual(set);
    }
    expect(modeler.meta.apiVersion).toBe(MODELER_API_VERSION);
  } finally {
    modeler.destroy();
    viewer.destroy();
  }
});

test("elements.bounds reads the live canvas: contexts, relationship waypoints, unknown ids", async () => {
  const modeler = createCollaborativeModeler();
  modeler.attachTo(host());
  const document = structuredClone(SAMPLE_DOCUMENT);
  document.relationships.push({
    id: "rel_unplaced",
    from: "ctx_auth",
    to: "ctx_gone",
    pattern: "partnership",
  });
  await modeler.importText(serializeDocumentText(document));
  const { elements } = modeler;
  const context = SAMPLE_DOCUMENT.contexts.find((candidate) => candidate.id === "ctx_cfp")!;
  expect(elements.bounds("ctx_cfp")).toEqual({ ...context.position, ...context.size });

  const waypoints = modeler.diagram
    .get<{ get(id: string): { waypoints: Array<{ x: number; y: number }> } }>("elementRegistry")
    .get("rel_auth_cfp").waypoints;
  const xs = waypoints.map((point) => point.x);
  const ys = waypoints.map((point) => point.y);
  expect(elements.bounds("rel_auth_cfp")).toEqual({
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  });

  expect(elements.bounds("rel_unplaced")).toBeUndefined();
  expect(elements.bounds("cm-root")).toBeUndefined();
  expect(elements.bounds("constructor")).toBeUndefined();
  modeler.destroy();
  expect(elements.bounds("ctx_cfp")).toBeUndefined();
});
