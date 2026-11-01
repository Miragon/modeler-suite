/*
 * Mounting the modeler for the interaction tests. They run on the renderer's own engine once
 * `@miragon/c4-dsl` parses and edits the fixtures; until then on the interaction engine, which
 * reads the same Structurizr DSL. The assertions read the semantic model, never the text, so they
 * hold on both.
 */
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { ModuleDeclaration } from "didi";
import type { C4Edit, EditContext } from "@miragon/c4-dsl";
import type { Workspace } from "@miragon/c4-schema-model";
import "../../../../src/assets/c4.css";
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeDiagram,
} from "../../../../src/collaborative/index.js";
import type DocumentStore from "../../../../src/document/DocumentStore.js";
import { createC4Engine, type C4Engine } from "../../../../src/engine/C4Engine.js";
import { connectDialogs } from "../../../../src/navigation/C4Dialogs.js";
import type {
  DialogChrome,
  DialogOptions,
  OpenedDialog,
} from "../../../../src/navigation/types.js";
import { createInteractionEngine } from "./engine.js";
import { BOOKSHOP } from "./fixtures.js";

const PROBE_CONTEXT: EditContext = {
  view: "Landscape",
  boxes: new Map(),
  vertices: new Map(),
  fresh: new Set(),
  identifiers: "readable",
  random: () => "abcd",
};

/** The edits the interaction tests make, each of which the renderer's engine must take. */
const PROBE_EDITS: readonly C4Edit[] = [
  { type: "updateWorkspace", fields: { name: "Probe" } },
  { type: "updateElement", id: "customer", fields: { name: "Shopper" } },
  { type: "createElement", kind: "softwareSystem", name: "Probe", center: { x: 0, y: 0 } },
  { type: "includeInView", ids: ["mail"] },
  { type: "removeFromView", ids: ["payments"], relationships: [] },
  { type: "smartDelete", ids: ["payments"], relationships: [] },
  { type: "deleteFromModel", ids: ["bookshop"], relationships: [] },
  { type: "createView", viewType: "systemContext", scopeId: "payments" },
  { type: "updateView", key: "Landscape", fields: { title: "Probe" } },
  { type: "deleteView", key: "Containers" },
  { type: "clearLayout" },
];

function rendererEngineWorks(): boolean {
  try {
    const engine = createC4Engine();
    const parse = engine.parse(BOOKSHOP);
    if (!parse.ok || parse.workspace.elements.length === 0) return false;
    return PROBE_EDITS.every((edit) => engine.applyEdit(parse, edit, PROBE_CONTEXT).ok);
  } catch {
    return false;
  }
}

/** Undefined: the renderer's own engine reads and edits the fixtures. */
const STAND_IN: (() => C4Engine) | undefined = rendererEngineWorks()
  ? undefined
  : createInteractionEngine;

function engineModules(): ModuleDeclaration[] {
  return STAND_IN ? [{ c4Engine: ["value", STAND_IN()] }] : [];
}

export interface OpenedRecord {
  readonly options: DialogOptions;
  readonly element: HTMLDialogElement;
  readonly dialog: OpenedDialog;
}

/**
 * The shell's `openShellDialog` as far as the modeler relies on it: a modal `<dialog>` in the
 * container, the title as its name, Close, Escape and the focus back where it was.
 */
export function dialogStandIn(container: HTMLElement): {
  readonly chrome: DialogChrome;
  readonly opened: OpenedRecord[];
  current(): OpenedRecord | undefined;
} {
  const opened: OpenedRecord[] = [];
  const openDialog = (options: DialogOptions): OpenedDialog => {
    const owner = container.ownerDocument;
    const before = owner.activeElement;
    const element = owner.createElement("dialog");
    element.className = `cd-shell-dialog ${options.className ?? ""}`.trim();
    const title = owner.createElement("h2");
    title.id = `dialog-title-${opened.length + 1}`;
    title.textContent = options.title;
    element.setAttribute("aria-labelledby", title.id);
    const close = owner.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    const body = owner.createElement("div");
    body.className = "cd-shell-dialog-body";
    element.append(title, close, body);
    let open = true;
    const dialog: OpenedDialog = {
      isOpen: () => open,
      close: () => {
        if (!open) return;
        open = false;
        element.close();
        element.remove();
        options.onClose?.();
        if (before instanceof HTMLElement && before.isConnected) before.focus();
        else options.focusFallback?.();
      },
    };
    close.addEventListener("click", () => dialog.close());
    element.addEventListener("cancel", (event) => {
      event.preventDefault();
      dialog.close();
    });
    options.render(body);
    container.append(element);
    element.showModal();
    opened.push({ options, element, dialog });
    return dialog;
  };
  return {
    chrome: { container, openDialog },
    opened,
    current: () => opened.filter((record) => record.dialog.isOpen()).at(-1),
  };
}

export interface Mounted {
  readonly modeler: CollaborativeDiagram;
  readonly host: HTMLElement;
  readonly dialogs: ReturnType<typeof dialogStandIn>;
}

const mounted: Mounted[] = [];

export async function mountModeler(
  text: string = BOOKSHOP,
  options: { viewer?: boolean; connectDialogs?: boolean } = {},
): Promise<Mounted> {
  const create = options.viewer ? createCollaborativeViewer : createCollaborativeModeler;
  const modeler = create({ additionalModules: engineModules() });
  const host = attachedHost();
  modeler.attachTo(host);
  const dialogs = dialogStandIn(host);
  if (options.connectDialogs !== false && !options.viewer) connectDialogs(modeler, dialogs.chrome);
  await modeler.importText(text);
  const record = { modeler, host, dialogs };
  mounted.push(record);
  return record;
}

export function destroyMounted(): void {
  for (const { modeler, host } of mounted.splice(0)) {
    modeler.destroy();
    host.parentElement?.remove();
  }
}

export function service<T>(modeler: CollaborativeDiagram, name: string): T {
  return modeler.diagram.get<T>(name);
}

export function workspaceOf(modeler: CollaborativeDiagram): Workspace {
  return service<DocumentStore>(modeler, "c4Document").current().parse.workspace;
}

export function elementNamed(modeler: CollaborativeDiagram, id: string) {
  return workspaceOf(modeler).elements.find((element) => element.id === id);
}

export function shapeOf(modeler: CollaborativeDiagram, canvasId: string) {
  const shape = service<ElementRegistry>(modeler, "elementRegistry").get(canvasId);
  if (!shape) throw new Error(`no ${canvasId} on the canvas`);
  return shape;
}

export function select(modeler: CollaborativeDiagram, ...canvasIds: string[]): void {
  service<Selection>(modeler, "selection").select(canvasIds.map((id) => shapeOf(modeler, id)));
}

export function canvasSvg(modeler: CollaborativeDiagram): SVGSVGElement {
  const svg = service<Canvas>(modeler, "canvas")
    .getContainer()
    .querySelector<SVGSVGElement>(":scope > svg");
  if (!svg) throw new Error("the canvas has no svg");
  return svg;
}

/** A keydown on the focused canvas `<svg>`; false when a listener prevented it. */
export function pressOnCanvas(modeler: CollaborativeDiagram, init: KeyboardEventInit): boolean {
  const svg = canvasSvg(modeler);
  svg.focus();
  return svg.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );
}

export function press(target: Element, key: string, init: KeyboardEventInit = {}): boolean {
  return target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
  );
}

/** Types into a field as the user does: the value, then an `input` event. */
export function typeInto(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  field.focus();
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

export function wait(milliseconds = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
