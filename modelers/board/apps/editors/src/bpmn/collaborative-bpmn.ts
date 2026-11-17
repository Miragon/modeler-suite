/**
 * `@miragon/bpmn-modeler` as a modeler of `@miragon/modeler-api`. It reads nothing of the board
 * and of the suite but the contract, so it can leave this workspace as it is: into the package of
 * the BPMN modeler, or into a package of its own that a host such as designIQ installs.
 */
import {
  MODELER_API_VERSION,
  type CollaborativeModeler,
  type CollaborativeModelerOptions,
  type ElementBounds,
  type ElementInfo,
  type ElementsSurface,
  type ImportResult,
  type InteractionSurface,
  type ModelerMeta,
} from "@miragon/modeler-api";
import { createModeler, detectEngine, type BpmnModeler, type Engine } from "@miragon/bpmn-modeler";
import { Writer } from "moddle-xml";

/** Stable notation id in `meta.notation` of the collaborative-modeler contract. */
export const BPMN_NOTATION = "bpmn";

/** What a text without platform metadata, and a blank text, is opened for. */
export const DEFAULT_ENGINE: Engine = "c7";

export interface CollaborativeBpmnOptions extends CollaborativeModelerOptions {
  /** the engine of a text without platform metadata; default `DEFAULT_ENGINE` */
  defaultEngine?: Engine | undefined;
}

/** What a host reaches of diagram-js beside the contract, as the suite's renderers offer it. */
export interface BpmnDiagram {
  get<T>(name: string, strict?: boolean): T;
}

export interface CollaborativeBpmnModeler extends CollaborativeModeler {
  readonly elements: ElementsSurface & Required<Pick<ElementsSurface, "bounds">>;
  readonly interaction: InteractionSurface;
  contentBounds(): ElementBounds | undefined;
  /** absent until the first import has made the editor: its engine comes with the text */
  readonly diagram: BpmnDiagram | undefined;
}

interface BpmnViewState {
  root?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale?: number;
}

interface Point {
  x: number;
  y: number;
}

interface DiagramElement {
  id: string;
  parent?: DiagramElement | undefined;
  children?: DiagramElement[] | undefined;
  labelTarget?: DiagramElement | undefined;
  businessObject?: { name?: unknown } | undefined;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  waypoints?: Point[] | undefined;
}

interface Canvas {
  getRootElement(): DiagramElement;
  setRootElement(root: DiagramElement): void;
  findRoot(element: DiagramElement): DiagramElement | undefined;
  scrollToElement(element: DiagramElement): void;
}

interface ElementRegistry {
  get(id: string): DiagramElement | undefined;
  getAll(): DiagramElement[];
}

interface Selection {
  get(): DiagramElement[];
  select(elements: DiagramElement | DiagramElement[] | null): void;
}

interface EventBus {
  on(event: string, priority: number, callback: (event: never) => unknown): void;
  fire(type: string, event: object): unknown;
}

interface Dragging {
  context(): { prefix?: string } | undefined;
}

interface Keyboard {
  addListener(priority: number, listener: (context: KeyboardContext) => unknown): void;
}

interface KeyboardContext {
  keyEvent: KeyboardEvent;
  stopPropagation(): void;
}

interface Moddle {
  fromXML(text: string, type: string): Promise<{ rootElement?: { diagrams?: unknown[] } }>;
}

/** A pan with the hand tool is no gesture of the contract's. */
const PAN_PREFIX = "hand";
const FIRST = 10_000;

const destroyedError = (): Error => new Error("the BPMN modeler was destroyed");

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const isHistoryKey = (event: KeyboardEvent): boolean =>
  (event.ctrlKey || event.metaKey) && ["z", "y"].includes(String(event.key).toLowerCase());

function isViewState(value: unknown): value is BpmnViewState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  const finite = (key: string) => typeof state[key] === "number" && Number.isFinite(state[key]);
  return (
    finite("x") &&
    finite("y") &&
    finite("width") &&
    finite("height") &&
    (state.scale === undefined || finite("scale")) &&
    (state.root === undefined || typeof state.root === "string")
  );
}

/** an element a person addresses: no root of a plane, no label of another element */
const isAddressable = (element: DiagramElement): boolean =>
  element.parent !== undefined && element.labelTarget === undefined;

function boxOf(element: DiagramElement): ElementBounds | undefined {
  const { x, y, width, height, waypoints } = element;
  if (waypoints && waypoints.length > 0) {
    const xs = waypoints.map((point) => point.x);
    const ys = waypoints.map((point) => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  }
  if ([x, y, width, height].every((value) => typeof value === "number")) {
    return { x: x!, y: y!, width: width!, height: height! };
  }
  return undefined;
}

function unionOf(boxes: ElementBounds[]): ElementBounds | undefined {
  if (boxes.length === 0) return undefined;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function descendantsOf(root: DiagramElement): DiagramElement[] {
  const found: DiagramElement[] = [];
  const visit = (element: DiagramElement): void => {
    for (const child of element.children ?? []) {
      found.push(child);
      visit(child);
    }
  };
  visit(root);
  return found;
}

/**
 * Bpmn-js clears the canvas before it finds out that a text has no diagram to show: such a text
 * is refused here first, so a refused import leaves the last diagram drawn (L7).
 */
async function checkDiagram(modeler: BpmnModeler, text: string): Promise<void> {
  const { rootElement } = await modeler
    .getService<Moddle>("moddle")
    .fromXML(text, "bpmn:Definitions");
  if (!rootElement?.diagrams?.length) throw new Error("no diagram to display");
}

/**
 * What bpmn-js's `saveXML({ format: true })` writes, written now: the contract's `exportText()`
 * answers at once, and `saveXML` answers a Promise. The same events go out around the same
 * writer, so the modules that order the DI or take their colours off for a save still do.
 */
function serialise(modeler: BpmnModeler): string {
  const eventBus = modeler.getService("eventBus") as unknown as EventBus;
  const loaded = modeler.getDefinitions();
  const definitions = eventBus.fire("saveXML.start", { definitions: loaded }) ?? loaded;
  let xml: string;
  try {
    const written = new Writer({ format: true }).toXML(definitions);
    const serialised = eventBus.fire("saveXML.serialized", { xml: written });
    xml = typeof serialised === "string" ? serialised : written;
  } catch (error) {
    eventBus.fire("saveXML.done", { error });
    throw error;
  }
  eventBus.fire("saveXML.done", { xml });
  return xml;
}

/** What one mounted modeler keeps, shared by the parts of the contract below. */
interface Session {
  readonly options: Required<Pick<CollaborativeBpmnOptions, "fitOnImport" | "undoRedoKeys">> & {
    defaultEngine: Engine;
  };
  readonly canvasElement: HTMLDivElement;
  readonly panelElement: HTMLDivElement;
  readonly contentListeners: Set<() => void>;
  readonly selectionListeners: Set<(ids: string[]) => void>;
  readonly interactionListeners: Set<(active: boolean) => void>;
  modeler: BpmnModeler | undefined;
  making: Promise<BpmnModeler> | undefined;
  destroyed: boolean;
  importing: boolean;
  gesture: boolean;
  /** how many deliveries to the host's listeners run: a destroy from one waits for their end */
  delivering: number;
  /** the text of the file as the canvas shows it: imported verbatim, or written after an edit */
  text: string | undefined;
  /** the canvas changed since `text` was written */
  dirty: boolean;
  imports: Promise<unknown>;
}

function openSession(options: CollaborativeBpmnOptions): Session {
  const canvasElement = document.createElement("div");
  canvasElement.className = "bpmn-collaborative__canvas";
  canvasElement.style.cssText = "position: relative; width: 100%; height: 100%;";
  // The modeler asks for a parent of its properties panel. A host of the contract has no place for
  // one, and its own chrome edits nothing of an element: the panel is made and never shown.
  const panelElement = document.createElement("div");
  panelElement.className = "bpmn-collaborative__panel";
  panelElement.hidden = true;
  return {
    options: {
      fitOnImport: options.fitOnImport ?? true,
      undoRedoKeys: options.undoRedoKeys ?? true,
      defaultEngine: options.defaultEngine ?? DEFAULT_ENGINE,
    },
    canvasElement,
    panelElement,
    contentListeners: new Set(),
    selectionListeners: new Set(),
    interactionListeners: new Set(),
    modeler: undefined,
    making: undefined,
    destroyed: false,
    importing: false,
    gesture: false,
    delivering: 0,
    text: undefined,
    dirty: false,
    imports: Promise.resolve(),
  };
}

/** Calls each listener that is still subscribed, until one of them destroys the modeler. */
function deliver<T>(session: Session, listeners: Set<(value: T) => void>, value: T): void {
  session.delivering += 1;
  try {
    for (const listener of [...listeners]) {
      if (session.destroyed) return;
      if (listeners.has(listener)) listener(value);
    }
  } finally {
    session.delivering -= 1;
  }
}

function subscribe<T>(session: Session, listeners: Set<T>, listener: T): () => void {
  if (session.destroyed) return () => undefined;
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function addressableIds(session: Session, ids: readonly string[]): string[] {
  if (!session.modeler) return [];
  const registry = session.modeler.getService<ElementRegistry>("elementRegistry");
  const result: string[] = [];
  for (const id of ids) {
    const element = registry.get(id);
    const target = element?.labelTarget ?? element;
    if (target && isAddressable(target) && !result.includes(target.id)) result.push(target.id);
  }
  return result;
}

function contentChanged(session: Session): void {
  if (session.destroyed || session.importing || !session.modeler) return;
  session.dirty = true;
  deliver(session, session.contentListeners, undefined);
}

/** the text of the canvas as it is now, written when the canvas changed since it was asked last */
function currentText(session: Session): string {
  const { modeler } = session;
  if (session.dirty && modeler && !session.destroyed) {
    try {
      session.text = serialise(modeler);
      session.dirty = false;
    } catch (error) {
      console.error("[bpmn]", error);
    }
  }
  return session.text ?? "";
}

function setGesture(session: Session, active: boolean): void {
  if (session.gesture === active) return;
  session.gesture = active;
  for (const listener of [...session.interactionListeners]) {
    if (session.destroyed) return;
    if (!session.interactionListeners.has(listener)) continue;
    try {
      listener(active);
    } catch (error) {
      // A host's listener runs inside the drag's pointer handler, and diagram-js ends a drag on an
      // error in its own events.
      console.error("[bpmn]", error);
    }
  }
}

function wire(session: Session, made: BpmnModeler): void {
  made.onCommandStackChanged(() => contentChanged(session));
  made.selection.onSelectionChanged((ids) => {
    if (!session.importing) {
      deliver(session, session.selectionListeners, addressableIds(session, ids));
    }
  });
  const eventBus = made.getService("eventBus") as unknown as EventBus;
  const dragging = made.getService<Dragging>("dragging");
  eventBus.on("drag.start", FIRST, () => {
    if (dragging.context()?.prefix !== PAN_PREFIX) setGesture(session, true);
  });
  eventBus.on("drag.cleanup", FIRST, () => setGesture(session, false));
  if (!session.options.undoRedoKeys) {
    made.getService<Keyboard>("keyboard").addListener(FIRST, (context) => {
      // Unhandled, so not prevented either: the key reaches the host that keeps the history.
      if (isHistoryKey(context.keyEvent)) context.stopPropagation();
    });
  }
}

/** The modeler is made with the first text, whose engine it is made for, and kept from then on. */
function modelerFor(session: Session, engine: Engine): Promise<BpmnModeler> {
  session.making ??= createModeler(session.canvasElement, {
    engine,
    propertiesPanel: { parent: session.panelElement },
    // a host of the contract has no place for the findings of a linter
    linting: false,
    theme: "light",
    locale: "en",
  }).then((made) => {
    if (session.destroyed) {
      made.destroy();
      throw destroyedError();
    }
    session.modeler = made;
    wire(session, made);
    return made;
  });
  return session.making;
}

const show = (made: BpmnModeler, text: string) =>
  text.trim() === "" ? made.newDiagram() : made.loadDiagram(text);

async function importNow(session: Session, incoming: string): Promise<ImportResult> {
  const blank = incoming.trim() === "";
  const { defaultEngine } = session.options;
  const engine = blank ? defaultEngine : (detectEngine(incoming) ?? defaultEngine);
  if (session.destroyed) throw destroyedError();
  const made = await modelerFor(session, engine);
  if (!blank) await checkDiagram(made, incoming);
  if (session.destroyed) throw destroyedError();
  const previous = session.text;
  const view = previous === undefined ? undefined : made.captureViewState();
  // diagram-js does not end a drag when the canvas is cleared: its drop would throw on a removed
  // shape. An accepted import cancels it first (L1), without bringing back the old selection.
  if (session.gesture) {
    made.getService<{ cancel(restore?: boolean): void }>("dragging").cancel(false);
  }
  session.importing = true;
  try {
    const result = await show(made, incoming);
    session.text = incoming;
    session.dirty = false;
    // With `fitOnImport: false` the view after an import is the host's: the modeler's own fit,
    // which waits for the canvas's first size, is settled here and never comes.
    if (!session.options.fitOnImport) made.viewport.setViewport(made.viewport.getViewport());
    return { warnings: result.warnings.map((warning) => asError(warning).message) };
  } catch (error) {
    // The text passed the check and the modeler still refused it: the diagram before it is drawn
    // again, at the cost of its history.
    if (previous !== undefined && !session.destroyed) {
      await show(made, previous).catch(() => undefined);
      if (view) made.applyViewState(view);
    }
    throw asError(error);
  } finally {
    session.importing = false;
    if (session.destroyed) made.destroy();
  }
}

function elementsOf(session: Session): CollaborativeBpmnModeler["elements"] {
  const live = (): BpmnModeler | undefined => (session.destroyed ? undefined : session.modeler);
  const find = (made: BpmnModeler, id: string): DiagramElement | undefined => {
    const element = made.getService<ElementRegistry>("elementRegistry").get(id);
    return element && isAddressable(element) ? element : undefined;
  };
  return {
    list(): ElementInfo[] {
      const made = live();
      if (!made) return [];
      return made
        .getService<ElementRegistry>("elementRegistry")
        .getAll()
        .filter(isAddressable)
        .map((element) => {
          const name = element.businessObject?.name;
          return typeof name === "string" && name !== ""
            ? { id: element.id, name }
            : { id: element.id };
        });
    },
    reveal(id) {
      const made = live();
      const element = made && find(made, id);
      if (!made || !element) return false;
      const canvas = made.getService<Canvas>("canvas");
      const root = canvas.findRoot(element);
      if (root && root !== canvas.getRootElement()) canvas.setRootElement(root);
      made.getService<Selection>("selection").select(element);
      // a selection listener of the host may have destroyed the modeler
      if (!session.destroyed) canvas.scrollToElement(element);
      return true;
    },
    selection: () => {
      const made = live();
      return made ? addressableIds(session, made.selection.getSelectedElementIds()) : [];
    },
    onSelection: (callback) =>
      subscribe(session, session.selectionListeners, (ids: string[]) => callback(ids)),
    bounds(id) {
      const made = live();
      const element = made && find(made, id);
      return element ? boxOf(element) : undefined;
    },
  };
}

function viewOf(session: Session): Pick<CollaborativeModeler, "getViewState" | "setViewState"> {
  return {
    getViewState(): BpmnViewState | undefined {
      const { modeler } = session;
      if (session.destroyed || !modeler || session.text === undefined) return undefined;
      const { x, y, width, height, scale } = modeler.viewport.getViewport();
      const root = modeler.rootElement.getRootElementId();
      const state: BpmnViewState = { x, y, width, height };
      if (scale !== undefined) state.scale = scale;
      if (root !== undefined) state.root = root;
      return isViewState(state) ? state : undefined;
    },
    setViewState(state) {
      const { modeler } = session;
      if (session.destroyed || !modeler || !isViewState(state)) return;
      if (state.root !== undefined) modeler.rootElement.setRootElementById(state.root);
      const { x, y, width, height, scale } = state;
      modeler.viewport.setViewport(
        scale === undefined ? { x, y, width, height } : { x, y, width, height, scale },
      );
    },
  };
}

function diagramOf(session: Session): BpmnDiagram | undefined {
  const made = session.modeler;
  if (session.destroyed || !made) return undefined;
  return {
    get: <T>(name: string, strict?: boolean): T => {
      try {
        return made.getService<T>(name);
      } catch (error) {
        if (strict === false) return null as T;
        throw error;
      }
    },
  };
}

function destroySession(session: Session): void {
  if (session.destroyed) return;
  // what the canvas shows stays the export of the destroyed modeler
  currentText(session);
  session.destroyed = true;
  session.contentListeners.clear();
  session.selectionListeners.clear();
  session.interactionListeners.clear();
  const { modeler } = session;
  // An import that runs keeps its modeler until it is done, then takes it down itself. The code
  // that called a listener goes on with the diagram once the listener returned: `reveal` scrolls
  // to the element it selected, a command finishes its change.
  if (modeler && !session.importing) {
    if (session.delivering > 0) queueMicrotask(() => modeler.destroy());
    else modeler.destroy();
  }
  session.canvasElement.remove();
  session.panelElement.remove();
}

/** The editing mount of the contract on `@miragon/bpmn-modeler`. */
export function createCollaborativeModeler(
  options: CollaborativeBpmnOptions = {},
): CollaborativeBpmnModeler {
  const session = openSession(options);
  const meta: ModelerMeta = {
    notation: BPMN_NOTATION,
    apiVersion: MODELER_API_VERSION,
    editable: true,
  };
  const interaction: InteractionSurface = {
    active: () => !session.destroyed && session.gesture,
    onChange: (callback) =>
      subscribe(session, session.interactionListeners, (active: boolean) => callback(active)),
  };
  return {
    meta,
    elements: elementsOf(session),
    interaction,
    get diagram() {
      return diagramOf(session);
    },
    attachTo(host) {
      host.append(session.canvasElement, session.panelElement);
    },
    importText(incoming) {
      const run = session.imports.then(
        () => importNow(session, incoming),
        () => importNow(session, incoming),
      );
      session.imports = run.catch(() => undefined);
      return run;
    },
    exportText: () => currentText(session),
    onContentChanged: (callback) => subscribe(session, session.contentListeners, () => callback()),
    ...viewOf(session),
    contentBounds() {
      const { modeler } = session;
      if (session.destroyed || !modeler || session.text === undefined) return undefined;
      const root = modeler.getService<Canvas>("canvas").getRootElement();
      return unionOf(
        descendantsOf(root)
          .map(boxOf)
          .filter((box): box is ElementBounds => box !== undefined),
      );
    },
    destroy: () => destroySession(session),
  };
}
