/**
 * A stand-in for a modeler of the suite: the contract, a canvas service as diagram-js has one,
 * and the DOM names this package's sheet and its release act on (`.djs-container`, its svg, a
 * palette beside it, `.djs-overlay-container`). It draws real boxes that take real input, so a
 * test sees whether a preview takes input and whether the pointer math of an armed editor is
 * off. No renderer of the suite is involved, and nothing here touches the DOM before
 * `attachTo`, so a unit test drives the same modeler in Node through `commands` and `gesture`.
 *
 * Its text is one line per item, `<id> <x> <y> <name>`. A line that starts with # and an empty
 * line are comments: the modeler's own export drops them, and `standInRules` keeps them, as
 * Wardley's rules keep a map's comments.
 */
import {
  MODELER_API_VERSION,
  type CollaborativeModelerOptions,
  type ElementBounds,
} from "@miragon/modeler-api";

import type {
  EditorEntry,
  EditorModule,
  EmbeddableModeler,
  FitBox,
  Insets,
  TextRules,
} from "../../src/index.js";

export const STAND_IN = "stand-in";
/** every item is drawn as a box of this size, in diagram units */
export const ITEM = { width: 100, height: 60 };
const DRAG_THRESHOLD_PX = 4;
const SVG = "http://www.w3.org/2000/svg";

export interface Item {
  id: string;
  x: number;
  y: number;
  name: string;
}

const isComment = (line: string): boolean => line.trim() === "" || line.startsWith("#");
const lineOf = (item: Item): string => `${item.id} ${item.x} ${item.y} ${item.name}`;

function parseLine(line: string, number: number): Item {
  const match = /^(\S+) (-?\d+) (-?\d+) (.+)$/.exec(line);
  if (!match) throw new Error(`line ${number}: expected "<id> <x> <y> <name>"`);
  const [, id = "", x = "", y = "", name = ""] = match;
  return { id, x: Number(x), y: Number(y), name };
}

/** throws for a text that is no list of items; nothing is read of such a text */
export function parseItems(text: string): Item[] {
  const items: Item[] = [];
  text.split("\n").forEach((line, index) => {
    if (isComment(line)) return;
    const item = parseLine(line, index + 1);
    if (items.some((other) => other.id === item.id)) {
      throw new Error(`line ${index + 1}: the id ${item.id} is used twice`);
    }
    items.push(item);
  });
  return items;
}

/** the canonical text: the items in their order, without a comment */
export const writeItems = (items: readonly Item[]): string =>
  items.map((item) => `${lineOf(item)}\n`).join("");

/** the items written into `reconciled`: its comments and its order stay, a new item goes last */
export function patchItems(reconciled: string, items: readonly Item[]): string {
  const rest = new Map(items.map((item) => [item.id, item]));
  const lines: string[] = [];
  for (const line of reconciled.replace(/\n$/, "").split("\n")) {
    if (isComment(line)) {
      if (reconciled !== "") lines.push(line);
      continue;
    }
    const now = rest.get(line.slice(0, line.indexOf(" ")));
    if (!now) continue;
    rest.delete(now.id);
    lines.push(lineOf(now));
  }
  for (const item of rest.values()) lines.push(lineOf(item));
  return lines.map((line) => `${line}\n`).join("");
}

export interface StandInRecord {
  /** what `create()` was given */
  options: CollaborativeModelerOptions;
  /** every text `importText` accepted, in order */
  imports: string[];
  /** every text it refused */
  refused: string[];
  /** every viewbox set through the canvas service */
  viewboxes: FitBox[];
  /** every view a host set through the contract */
  viewStates: unknown[];
  focuses: number;
  relayouts: number;
  /** calls of the rules' `imported()` */
  ruleImports: number;
  /** change events fired */
  changes: number;
  destroyed: number;
}

export interface StandInModeler extends EmbeddableModeler {
  readonly diagram: { get<T>(name: string, strict?: boolean): T };
  readonly record: StandInRecord;
  /** what a person does with the editor, each one user command that fires one change event */
  readonly commands: {
    add(name: string): void;
    remove(id: string): void;
    move(id: string, dx: number, dy: number): void;
    undo(): void;
    /** a change of something the text does not hold: a change event, the same export */
    touch(): void;
  };
  /** a drag as the contract's interaction surface reports it, without a pointer */
  readonly gesture: {
    start(): void;
    /** ends it: the surface reports false first, then the drop's change event fires */
    drop(id: string, dx: number, dy: number): void;
    cancel(): void;
  };
  /** the `.djs-container` it drew into the host it was attached to */
  container(): HTMLElement | undefined;
  /** holds every import that starts from now on until `releaseImports()` */
  holdImports(): void;
  releaseImports(): void;
}

interface Drag {
  id: string;
  startX: number;
  startY: number;
  active: boolean;
}

interface Dom {
  container: HTMLDivElement;
  svg: SVGSVGElement;
  viewport: SVGGElement;
  overlays: HTMLDivElement;
  stop: Array<() => void>;
}

/** the state of one stand-in modeler, shared by its model half and its DOM half */
interface State {
  items: Item[];
  selection: string[];
  history: Item[][];
  view: { x: number; y: number; scale: number };
  dom: Dom | undefined;
  drag: Drag | undefined;
  gestureActive: boolean;
  destroyed: boolean;
  held: Promise<void> | undefined;
  releaseHeld: () => void;
  changeListeners: Set<() => void>;
  selectionListeners: Set<(ids: string[]) => void>;
  gestureListeners: Set<(active: boolean) => void>;
  record: StandInRecord;
}

function draw(state: State): void {
  const { dom } = state;
  if (!dom) return;
  const { view } = state;
  dom.viewport.setAttribute("transform", `scale(${view.scale}) translate(${-view.x} ${-view.y})`);
  dom.viewport.replaceChildren(
    ...state.items.map((item) => {
      const shape = document.createElementNS(SVG, "g");
      shape.setAttribute("class", "djs-shape");
      shape.dataset.elementId = item.id;
      if (state.selection.includes(item.id)) shape.classList.add("selected");
      const hit = document.createElementNS(SVG, "rect");
      hit.setAttribute("class", "djs-hit");
      for (const [name, value] of Object.entries({ x: item.x, y: item.y, ...ITEM })) {
        hit.setAttribute(name, String(value));
      }
      hit.setAttribute("fill", "lightgrey");
      hit.setAttribute("stroke", state.selection.includes(item.id) ? "black" : "grey");
      const label = document.createElementNS(SVG, "text");
      label.setAttribute("x", String(item.x + 8));
      label.setAttribute("y", String(item.y + 24));
      label.setAttribute("pointer-events", "none");
      label.textContent = item.name;
      shape.append(hit, label);
      return shape;
    }),
  );
  // the context pad of a selection, where diagram-js keeps its overlays
  dom.overlays.replaceChildren();
  if (state.selection.length > 0) {
    const pad = document.createElement("div");
    pad.className = "stand-in-pad";
    pad.textContent = "pad";
    dom.overlays.append(pad);
  }
}

function changed(state: State): void {
  draw(state);
  state.record.changes += 1;
  for (const listener of [...state.changeListeners]) {
    if (!state.destroyed) listener();
  }
}

function select(state: State, ids: string[]): void {
  if (ids.join("\n") === state.selection.join("\n")) return;
  state.selection = ids;
  draw(state);
  for (const listener of [...state.selectionListeners]) {
    if (!state.destroyed) listener([...ids]);
  }
}

function setGesture(state: State, active: boolean): void {
  if (state.gestureActive === active) return;
  state.gestureActive = active;
  for (const listener of [...state.gestureListeners]) {
    if (!state.destroyed) listener(active);
  }
}

/** one user command: the items before it go on the history, and one change event fires */
function command(state: State, next: Item[]): void {
  state.history.push(state.items);
  state.items = next;
  state.selection = state.selection.filter((id) => next.some((item) => item.id === id));
  changed(state);
}

function commandsOf(state: State): StandInModeler["commands"] {
  return {
    add(name) {
      let serial = state.items.length + 1;
      while (state.items.some((item) => item.id === `item_${serial}`)) serial += 1;
      const bottom = Math.max(0, ...state.items.map((item) => item.y + ITEM.height));
      command(state, [...state.items, { id: `item_${serial}`, x: 0, y: bottom + 20, name }]);
    },
    remove(id) {
      if (!state.items.some((item) => item.id === id)) return;
      command(
        state,
        state.items.filter((item) => item.id !== id),
      );
    },
    move(id, dx, dy) {
      if ((dx === 0 && dy === 0) || !state.items.some((item) => item.id === id)) return;
      command(
        state,
        state.items.map((item) =>
          item.id === id ? { ...item, x: item.x + dx, y: item.y + dy } : item,
        ),
      );
    },
    undo() {
      const before = state.history.pop();
      if (!before) return;
      state.items = before;
      state.selection = state.selection.filter((id) => before.some((item) => item.id === id));
      changed(state);
    },
    touch: () => changed(state),
  };
}

function listen<Type extends keyof GlobalEventHandlersEventMap>(
  dom: Dom,
  target: EventTarget,
  type: Type,
  listener: (event: GlobalEventHandlersEventMap[Type]) => void,
): void {
  target.addEventListener(type, listener as EventListener);
  dom.stop.push(() => target.removeEventListener(type, listener as EventListener));
}

const shapeIdAt = (target: EventTarget | null): string | undefined =>
  target instanceof Element
    ? target.closest<SVGGElement>(".djs-shape")?.dataset.elementId
    : undefined;

function bindPointer(state: State, dom: Dom, commands: StandInModeler["commands"]): void {
  const page = dom.container.ownerDocument;
  const frame = page.defaultView ?? window;
  listen(dom, dom.svg, "click", (event) => {
    const id = shapeIdAt(event.target);
    select(state, id === undefined ? [] : [id]);
  });
  listen(dom, dom.svg, "pointerdown", (event) => {
    const id = shapeIdAt(event.target);
    if (id !== undefined && event.button === 0) {
      state.drag = { id, startX: event.clientX, startY: event.clientY, active: false };
    }
  });
  listen(dom, frame, "pointermove", (event) => {
    const { drag } = state;
    if (!drag || drag.active) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (distance < DRAG_THRESHOLD_PX) return;
    drag.active = true;
    setGesture(state, true);
  });
  listen(dom, frame, "pointerup", (event) => {
    const { drag } = state;
    state.drag = undefined;
    if (!drag?.active) return;
    // client px to diagram units: the element's scale on screen times the editor's own
    const box = dom.container.getBoundingClientRect();
    const screenScale = (box.width / dom.container.clientWidth) * state.view.scale;
    setGesture(state, false);
    commands.move(
      drag.id,
      Math.round((event.clientX - drag.startX) / screenScale),
      Math.round((event.clientY - drag.startY) / screenScale),
    );
  });
  // as diagram-js does: Escape on the document ends what the pointer holds
  listen(dom, page, "keyup", (event) => {
    if (event.key !== "Escape" || !state.drag) return;
    state.drag = undefined;
    setGesture(state, false);
  });
}

function bindKeys(state: State, dom: Dom, commands: StandInModeler["commands"]): void {
  const page = dom.container.ownerDocument;
  listen(dom, dom.svg, "keydown", (event) => {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    for (const id of [...state.selection]) commands.remove(id);
  });
  // As Wardley Maps and Team Topologies do: the history keys are taken on the document, for the
  // canvas that holds the focus.
  listen(dom, page, "keydown", (event) => {
    const history = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z";
    if (!history || state.record.options.undoRedoKeys === false) return;
    if (!dom.container.contains(page.activeElement)) return;
    event.preventDefault();
    commands.undo();
  });
}

function mount(state: State, host: Element, commands: StandInModeler["commands"]): void {
  const page = host.ownerDocument;
  const container = page.createElement("div");
  container.className = "djs-container";
  container.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden";
  const svg = page.createElementNS(SVG, "svg");
  svg.setAttribute("tabindex", "0");
  svg.style.cssText = "display:block;width:100%;height:100%;outline:none";
  const viewport = page.createElementNS(SVG, "g");
  viewport.setAttribute("class", "viewport");
  svg.append(viewport);
  const palette = page.createElement("div");
  palette.className = "djs-palette";
  // with a z-index of its own, as an editor's chrome may have one
  palette.style.cssText = "position:absolute;left:8px;top:8px;z-index:100";
  const add = page.createElement("button");
  add.type = "button";
  add.textContent = "Add";
  palette.append(add);
  const overlays = page.createElement("div");
  overlays.className = "djs-overlay-container";
  overlays.style.cssText = "position:absolute;right:8px;top:8px";
  container.append(svg, palette, overlays);
  host.append(container);
  const dom: Dom = { container, svg, viewport, overlays, stop: [] };
  state.dom = dom;
  listen(dom, add, "click", () => commands.add("New"));
  bindPointer(state, dom, commands);
  bindKeys(state, dom, commands);
  draw(state);
}

function canvasOf(state: State) {
  const size = () => ({
    width: state.dom?.container.clientWidth ?? 0,
    height: state.dom?.container.clientHeight ?? 0,
  });
  return {
    getSize: size,
    viewbox(box?: FitBox) {
      if (box) {
        state.record.viewboxes.push({ ...box });
        state.view = { x: box.x, y: box.y, scale: size().width / box.width };
        draw(state);
      }
      const { x, y, scale } = state.view;
      return { x, y, width: size().width / scale, height: size().height / scale, scale };
    },
    focus() {
      state.record.focuses += 1;
      state.dom?.svg.focus({ preventScroll: true });
    },
  };
}

function boundsOf(items: readonly Item[]): ElementBounds | undefined {
  if (items.length === 0) return undefined;
  const left = Math.min(...items.map((item) => item.x));
  const top = Math.min(...items.map((item) => item.y));
  return {
    x: left,
    y: top,
    width: Math.max(...items.map((item) => item.x + ITEM.width)) - left,
    height: Math.max(...items.map((item) => item.y + ITEM.height)) - top,
  };
}

function subscribe<Listener>(listeners: Set<Listener>, listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function createStandInModeler(
  options: CollaborativeModelerOptions = {},
  notation = STAND_IN,
): StandInModeler {
  const state: State = {
    items: [],
    selection: [],
    history: [],
    view: { x: 0, y: 0, scale: 1 },
    dom: undefined,
    drag: undefined,
    gestureActive: false,
    destroyed: false,
    held: undefined,
    releaseHeld: () => undefined,
    changeListeners: new Set(),
    selectionListeners: new Set(),
    gestureListeners: new Set(),
    record: {
      options,
      imports: [],
      refused: [],
      viewboxes: [],
      viewStates: [],
      focuses: 0,
      relayouts: 0,
      ruleImports: 0,
      changes: 0,
      destroyed: 0,
    },
  };
  const commands = commandsOf(state);
  const canvas = canvasOf(state);
  return {
    meta: { notation, apiVersion: MODELER_API_VERSION, editable: true },
    record: state.record,
    commands,
    diagram: {
      get<T>(name: string, strict?: boolean): T {
        if (name === "canvas") return canvas as T;
        if (strict === false) return undefined as T;
        throw new Error(`the stand-in has no service ${name}`);
      },
    },
    gesture: {
      start: () => setGesture(state, true),
      drop(id, dx, dy) {
        setGesture(state, false);
        commands.move(id, dx, dy);
      },
      cancel: () => setGesture(state, false),
    },
    container: () => state.dom?.container,
    holdImports() {
      state.held = new Promise((resolve) => (state.releaseHeld = resolve));
    },
    releaseImports() {
      state.held = undefined;
      state.releaseHeld();
    },
    attachTo: (host) => mount(state, host, commands),
    async importText(text) {
      await state.held;
      let items: Item[];
      try {
        items = parseItems(text);
      } catch (error) {
        state.record.refused.push(text);
        throw error;
      }
      state.items = items;
      state.history = [];
      state.record.imports.push(text);
      select(
        state,
        state.selection.filter((id) => items.some((item) => item.id === id)),
      );
      draw(state);
      return { warnings: [] };
    },
    exportText: () => writeItems(state.items),
    onContentChanged: (listener) => subscribe(state.changeListeners, listener),
    getViewState: () => ({ ...state.view }),
    setViewState(view) {
      state.record.viewStates.push(view);
      state.view = { ...(view as State["view"]) };
      draw(state);
    },
    contentBounds: () => boundsOf(state.items),
    elements: {
      list: () => state.items.map((item) => ({ id: item.id, name: item.name })),
      reveal(id) {
        if (!state.items.some((item) => item.id === id)) return false;
        select(state, [id]);
        return true;
      },
      selection: () => [...state.selection],
      onSelection: (listener) => subscribe(state.selectionListeners, listener),
    },
    interaction: {
      active: () => state.gestureActive,
      onChange: (listener) => subscribe(state.gestureListeners, listener),
    },
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      state.record.destroyed += 1;
      for (const stop of state.dom?.stop ?? []) stop();
      state.dom?.container.remove();
      state.dom = undefined;
    },
  };
}

/** The stand-in's rules for its text: comments and order are kept, as a text notation's are. */
export function standInRules(modeler: EmbeddableModeler): TextRules {
  const { record } = modeler as StandInModeler;
  return {
    exported: (reconciled) => patchItems(reconciled, parseItems(modeler.exportText())),
    // throws for a text that is no list of items, as a notation's parser may
    same: (text) => writeItems(parseItems(text)) === modeler.exportText(),
    imported: () => void (record.ruleImports += 1),
  };
}

export interface StandInModule {
  readonly module: EditorModule;
  /** every modeler the module made, in the order they were made */
  readonly made: StandInModeler[];
}

export interface StandInModuleOptions {
  /** the notation the made modelers report, where it is to differ from the entry's */
  madeNotation?: string | undefined;
  /** false: the module has no rules of its own, so the adapter's defaults apply */
  rules?: boolean | undefined;
}

/** What an entry's `load()` yields for the stand-in, at hand without a load. */
export function standInModule(options: StandInModuleOptions = {}): StandInModule {
  const made: StandInModeler[] = [];
  return {
    made,
    module: {
      create(createOptions) {
        const modeler = createStandInModeler(createOptions, options.madeNotation);
        made.push(modeler);
        return modeler;
      },
      ...(options.rules === false ? {} : { text: standInRules }),
      relayout: (modeler) => void ((modeler as StandInModeler).record.relayouts += 1),
    },
  };
}

export interface StandInEditors extends StandInModule {
  readonly entry: EditorEntry;
  /** how often the entry's code was loaded */
  loads(): number;
}

export interface StandInEditorsOptions extends StandInModuleOptions {
  suffixes?: readonly string[] | undefined;
  kind?: string | undefined;
  insets?: Insets | undefined;
  /** how often `load()` rejects before it yields the module */
  failingLoads?: number | undefined;
  /** the code arrives only once this settles */
  gate?: Promise<void> | undefined;
}

/** A registry entry for the stand-in, which counts its loads and keeps what it made. */
export function standInEditors(options: StandInEditorsOptions = {}): StandInEditors {
  const { module, made } = standInModule(options);
  let loads = 0;
  return {
    module,
    made,
    loads: () => loads,
    entry: {
      notation: STAND_IN,
      kind: options.kind ?? "Stand-in",
      suffixes: options.suffixes ?? [".items"],
      ...(options.insets ? { insets: options.insets } : {}),
      async load() {
        loads += 1;
        if (loads <= (options.failingLoads ?? 0)) throw new Error("the code did not load");
        await options.gate;
        return module;
      },
    },
  };
}
