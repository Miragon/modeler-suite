/*
 * The conformance harness of SPEC 9.3 on the shipped stack: the real engine, drawing, palette and
 * label editor on the kit's fixtures, with the gestures it holds by real pointer events. The kit
 * run and the ported gestures tests share it.
 */
import "@fontsource-variable/geist/wght.css";
import "../../../src/assets/c4.css";
import {
  attachedHost,
  type ConformanceHarness,
  type GestureKind,
  type HeldGesture,
  type HeldPan,
} from "@miragon/modeler-api/conformance";
import type { CollaborativeModeler } from "@miragon/modeler-api";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type { Shape } from "diagram-js/lib/model/Types";
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeDiagram,
  type CollaborativeOptions,
} from "../../../src/collaborative/index.js";
import type LabelEditing from "../../../src/label-editing/LabelEditing.js";
import type { C4ElementShape } from "../../../src/scene/types.js";
import type { C4ElementFactory } from "../../../src/services.js";
import {
  BOOKSHOP,
  BOOKSHOP_FOREIGN,
  BOOKSHOP_LOOSE,
  FOREIGN_FRAGMENTS,
  INVALID_TEXTS,
  LIBRARY,
  PROBES,
} from "../fixtures/texts.js";
import { pointerOn, pressEscape, type Point } from "./pointer.js";

export const GESTURE_KINDS: readonly GestureKind[] = ["move", "create", "createOffCanvas"];

/**
 * Free canvas inside the view an import of `BOOKSHOP` fits: below its title block, outside every
 * box and label, clear of the palette. A software system created there overlaps nothing.
 */
export const FREE_SPOT: Point = { x: 300, y: 470 };

/** Right of the content of both canonical texts, outside `LIBRARY`'s boundary: where creates land. */
export const FAR_SPOT: Point = { x: 1260, y: 148 };

/** One step of the kit's pan, in screen pixels. */
const PAN_STEP = 40;

/**
 * The faces the canvas measures its text in, loaded before a modeler exists: the renderer's
 * `fonts.check` then passes, so no relayout (SPEC 6.3) changes a wrapped line during a case.
 */
export async function fontsReady(): Promise<void> {
  for (const face of ['600 15px "Geist Variable"', '400 13px "Geist Variable"']) {
    // `fonts.check` also passes for a family the page never declared, so a missing face would
    // let every case measure in the fallback font without a word.
    if ((await document.fonts.load(face)).length === 0) throw new Error(`${face} did not load`);
  }
  await document.fonts.ready;
}

const hosts: HTMLElement[] = [];

/** A host of the kit's size; `removeHarnessHosts` takes it off the page again. */
export function harnessHost(): HTMLElement {
  const host = attachedHost();
  hosts.push(host);
  return host;
}

export function removeHarnessHosts(): void {
  for (const host of hosts.splice(0)) host.parentElement?.remove();
}

/** The editing mount once the faces are loaded, attached to a host of the kit's size. */
export async function mountModeler(
  options: CollaborativeOptions = {},
): Promise<CollaborativeDiagram> {
  await fontsReady();
  const modeler = createCollaborativeModeler(options);
  modeler.attachTo(harnessHost());
  return modeler;
}

/** The read-only mount once the faces are loaded, attached. */
export async function mountViewer(
  options: CollaborativeOptions = {},
): Promise<CollaborativeDiagram> {
  await fontsReady();
  const viewer = createCollaborativeViewer(options);
  viewer.attachTo(harnessHost());
  return viewer;
}

export function diagramOf(modeler: CollaborativeModeler): CollaborativeDiagram["diagram"] {
  return (modeler as CollaborativeDiagram).diagram;
}

export function serviceOf<T>(modeler: CollaborativeModeler, name: string): T {
  return diagramOf(modeler).get<T>(name);
}

export function shapeIn(modeler: CollaborativeModeler, id: string): C4ElementShape {
  const found = serviceOf<ElementRegistry>(modeler, "elementRegistry").get(id);
  if (!found) throw new Error(`no element ${id} on the canvas`);
  return found as C4ElementShape;
}

export function labelFieldOf(modeler: CollaborativeModeler): HTMLTextAreaElement {
  const field = serviceOf<Canvas>(modeler, "canvas")
    .getContainer()
    .querySelector<HTMLTextAreaElement>("textarea.diagram-label-editor");
  if (!field) throw new Error("no label editor is open");
  return field;
}

/**
 * A software system at `at` through the stock call diagram-js's create tool makes, onto the root;
 * the C4 modeling turns it into one `createElement` edit. `undefined` when the edit was refused.
 */
export function createSystem(
  modeler: CollaborativeModeler,
  name: string,
  at: Point = FAR_SPOT,
): Shape | undefined {
  const factory = serviceOf<C4ElementFactory>(modeler, "c4ElementFactory");
  const root = serviceOf<Canvas>(modeler, "canvas").getRootElement() as Shape;
  return serviceOf<Modeling>(modeler, "modeling").createShape(
    factory.createNew("softwareSystem", name),
    at,
    root,
  ) as Shape | undefined;
}

// Shared across instances: every call creates an element of its own name, so the kit's collision
// case compares the identifiers two peers derive for DIFFERENT elements.
let mutations = 0;

/** The harness's `mutate`: a new software system "Mutation <n>" right of the content. */
export function mutate(modeler: CollaborativeModeler): void {
  mutations += 1;
  createSystem(modeler, `Mutation ${mutations}`);
}

/**
 * The kit's gestures on `BOOKSHOP`, by real pointer events: a move of `customer` past the drag
 * threshold, a palette create held over free canvas, or still over the palette. A drop lands
 * where it applies, so the create held over the palette is brought onto the canvas first.
 */
export function holdGesture(modeler: CollaborativeModeler, kind: GestureKind): HeldGesture {
  const pointer = pointerOn(diagramOf(modeler));
  if (kind === "move") {
    const shape = shapeIn(modeler, "customer");
    const start = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
    const target = { x: start.x + 60, y: start.y + 160 };
    pointer.press(serviceOf<ElementRegistry>(modeler, "elementRegistry").getGraphics(shape), start);
    pointer.moveTo({ x: start.x + 20, y: start.y + 40 });
    pointer.moveTo({ x: start.x + 40, y: start.y + 80 });
    return {
      drop() {
        pointer.hover(target);
        pointer.release(target);
      },
      cancel: pressEscape,
    };
  }
  const at = pointer.clickPalette("create.softwareSystem");
  if (kind === "create") pointer.hover(FREE_SPOT);
  else pointer.moveTo({ x: at.x + 4, y: at.y + 4 });
  return {
    drop() {
      pointer.hover(FREE_SPOT);
      pointer.release(FREE_SPOT);
    },
    cancel: pressEscape,
  };
}

/** The palette's lasso, armed and waiting for its next press over the canvas. */
export function armLasso(modeler: CollaborativeModeler): void {
  const pointer = pointerOn(diagramOf(modeler));
  const at = pointer.clickPalette("lasso-tool");
  pointer.moveTo({ x: at.x + 60, y: at.y + 60 });
}

/** A pan with the palette's hand tool, pressed on free canvas and moved one step at a time. */
export function holdPan(modeler: CollaborativeModeler): HeldPan {
  const pointer = pointerOn(diagramOf(modeler));
  const at = pointer.clickPalette("hand-tool");
  pointer.hover({ x: at.x + 60, y: at.y + 60 });
  pointer.hover(FREE_SPOT);
  const { clientX, clientY } = pointer.client(FREE_SPOT);
  let steps = 0;
  const fire = (type: string, target: EventTarget): void => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: clientX + steps * PAN_STEP,
        clientY,
      }),
    );
  };
  fire("mousedown", pointer.svg);
  steps = 1;
  fire("mousemove", document);
  return {
    move() {
      steps += 1;
      fire("mousemove", document);
    },
    drop() {
      fire("mouseup", document);
    },
  };
}

/** The input the kit's interaction cases type; the name editor writes it verbatim. */
const TYPED = "typed, not committed";

/** Every hook of the kit filled (SPEC 9.3), so a skip is a gap of this harness. */
export const harness: ConformanceHarness = {
  create: () => mountModeler(),
  createReadonly: () => mountViewer(),
  // Two DISTINCT texts, reviewed byte by byte: the undo law needs a second document.
  canonicalTexts: [BOOKSHOP, LIBRARY],
  looseTexts: [BOOKSHOP_LOOSE],
  invalidTexts: [...INVALID_TEXTS],
  foreignTexts: [{ text: BOOKSHOP_FOREIGN, mustSurvive: [...FOREIGN_FRAGMENTS] }],
  probeTexts: [...PROBES],
  viewState: { x: 120, y: 80, width: 640, height: 480 },
  mutate,
  // Every document surface outside the element command (SPEC 1.8 L3), each on a fresh import of
  // `BOOKSHOP`, whose default view is pinned and excludes `mail`.
  configMutations: [
    {
      name: "workspace name",
      run: (modeler) => {
        (modeler as CollaborativeDiagram).c4.editWorkspace({ name: "Renamed workspace" });
      },
    },
    {
      name: "workspace description",
      run: (modeler) => {
        (modeler as CollaborativeDiagram).c4.editWorkspace({ description: "Edited description" });
      },
    },
    {
      name: "view title",
      run: (modeler) => {
        const diagram = modeler as CollaborativeDiagram;
        diagram.c4.editView(diagram.views.active().key, { title: "Edited title" });
      },
    },
    {
      name: "view description",
      run: (modeler) => {
        const diagram = modeler as CollaborativeDiagram;
        diagram.c4.editView(diagram.views.active().key, { description: "Edited description" });
      },
    },
    {
      name: "Apply C4 colours",
      run: (modeler) => {
        (modeler as CollaborativeDiagram).c4.applyC4Colours();
      },
    },
    {
      name: "Lay out automatically",
      run: (modeler) => {
        (modeler as CollaborativeDiagram).c4.layOutAutomatically();
      },
    },
    {
      name: "New view",
      run: (modeler) => {
        (modeler as CollaborativeDiagram).c4.createView("systemContext", "payments");
      },
    },
    {
      name: "Delete view",
      run: (modeler) => {
        (modeler as CollaborativeDiagram).c4.deleteView("BookshopContext");
      },
    },
    {
      name: "Add existing element",
      run: (modeler) => {
        (modeler as CollaborativeDiagram).c4.includeInView(["mail"]);
      },
    },
  ],
  undo: (modeler) => serviceOf<CommandStack>(modeler, "commandStack").undo(),
  redo: (modeler) => serviceOf<CommandStack>(modeler, "commandStack").redo(),
  moveElement(modeler) {
    const [first] = (modeler as CollaborativeDiagram).elements.list();
    if (!first) throw new Error("nothing to move");
    serviceOf<Modeling>(modeler, "modeling").moveElements([shapeIn(modeler, first.id)], {
      x: 160,
      y: 120,
    });
    return first.id;
  },
  // The same input on every call: the kit compares the commit with and without a view change.
  openInteraction(modeler) {
    serviceOf<LabelEditing>(modeler, "labelEditing").activate(shapeIn(modeler, "customer"));
    const field = labelFieldOf(modeler);
    field.value = TYPED;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  },
  interactionState: (modeler) => serviceOf<LabelEditing>(modeler, "labelEditing").openEdit(),
  commitInteraction(modeler) {
    labelFieldOf(modeler).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  },
  startGesture: holdGesture,
  armTool: armLasso,
  startPan: holdPan,
  exportImage: (modeler) => diagramOf(modeler).saveSVG().svg,
  settle: () => new Promise((resolve) => setTimeout(resolve, 30)),
};
