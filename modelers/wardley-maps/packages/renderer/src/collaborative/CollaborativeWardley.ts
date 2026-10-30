import {
  MODELER_API_VERSION,
  type AppearanceSurface,
  type CollaborativeModeler,
  type CollaborativeModelerOptions,
  type ElementBounds,
  type ElementInfo,
  type ElementsSurface,
  type ImportResult,
  type InteractionSurface,
  type ModelerMeta,
} from "@miragon/modeler-api";
import { readBackIds, serializeDSL } from "@miragon/wardley-dsl";
import type { ModuleDeclaration } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element } from "diagram-js/lib/model/Types";
import { Modeler } from "../Modeler.js";
import { NavigatedViewer } from "../NavigatedViewer.js";
import type { WardleyViewerOptions } from "../WardleyBaseViewer.js";
import { WARDLEY_THEMES } from "../appearance/index.js";
import { restoreEditorState, setAsideEditorState, type EditorState } from "../editor-state.js";
import {
  INTERACTION_CHANGED,
  type InteractionChangedEvent,
  type WardleyInteraction,
} from "../interaction/index.js";
import type { LivePreview } from "../live-preview/index.js";
import { isWardleyShape, type WardleyShape } from "../model/di-types.js";
import type { PanConstraint } from "../pan-constraint/index.js";

/** Stable notation id in `meta.notation` of the collaborative-modeler contract. */
export const WARDLEY_NOTATION = "wardley";

/**
 * The contract's factory options (`freeArea`, `fitOnImport`, `undoRedoKeys`, see
 * `WardleyViewerOptions`) plus the renderer's own. The viewer ignores `undoRedoKeys`.
 */
export interface CollaborativeWardleyOptions extends CollaborativeModelerOptions {
  /** Appended to the renderer's own modules (e.g. a host's chrome module). */
  additionalModules?: ModuleDeclaration[] | undefined;
}

/** The contract's element surface, with the optional `bounds` of contract 1.2 always present. */
export interface WardleyElementsSurface extends ElementsSurface {
  bounds(id: string): ElementBounds | undefined;
}

/**
 * The contract surface, with the optional `contentBounds` of contract 1.3 and `interaction` and
 * `appearance` of contract 1.5 always present, plus the wrapped diagram for host-specific wiring.
 */
export interface CollaborativeWardleyModeler extends CollaborativeModeler {
  readonly elements: WardleyElementsSurface;
  readonly interaction: InteractionSurface;
  readonly appearance: AppearanceSurface;
  readonly diagram: Modeler | NavigatedViewer;
  contentBounds(): ElementBounds | undefined;
}

interface ViewState {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The named elements: components, anchors, pipelines, submaps and accelerators. Their names are
 * unique on a map, so the id the document derives from a name survives edits to other elements.
 * Notes, annotations, regions and drawings may repeat their text, number or kind, and the parser
 * tells repeats apart by line order, so their ids would move to another element.
 */
const ADDRESSABLE_TYPES: ReadonlySet<string> = new Set([
  "component",
  "anchor",
  "pipeline",
  "submap",
  "accelerator",
]);

function isAddressable(element: unknown): element is WardleyShape {
  return isWardleyShape(element) && ADDRESSABLE_TYPES.has(element.wardleyType);
}

/** The editing mount (`meta.editable: true`) of the collaborative-modeler contract. */
export function createCollaborativeModeler(
  options: CollaborativeWardleyOptions = {},
): CollaborativeWardleyModeler {
  return collaborative(
    new Modeler({
      ...diagramOptions(options),
      undoRedoKeys: options.undoRedoKeys,
    }),
    true,
  );
}

/** The read-only mount (`meta.editable: false`): imports, exports and reveals, never edits. */
export function createCollaborativeViewer(
  options: CollaborativeWardleyOptions = {},
): CollaborativeWardleyModeler {
  return collaborative(new NavigatedViewer(diagramOptions(options)), false);
}

function diagramOptions(options: CollaborativeWardleyOptions): WardleyViewerOptions {
  return {
    width: "100%",
    height: "100%",
    additionalModules: options.additionalModules ?? [],
    freeArea: options.freeArea,
    fitOnImport: options.fitOnImport,
  };
}

/**
 * The document ids of the canvas's elements and back, read once per content change: an element
 * created or renamed on the canvas keeps its canvas id until the text is read again.
 */
function documentIds(diagram: Modeler | NavigatedViewer, eventBus: EventBus) {
  let byCanvasId: Map<string, string> | undefined;
  let byDocumentId: Map<string, string> | undefined;
  eventBus.on(
    ["elements.changed", "import.done", "diagram.clear", "commandStack.changed"],
    () => (byCanvasId = byDocumentId = undefined),
  );
  const read = () => {
    if (!byCanvasId) {
      try {
        byCanvasId = readBackIds(diagram.exportMap());
      } catch {
        byCanvasId = new Map();
      }
      byDocumentId = new Map([...byCanvasId].map(([canvasId, id]) => [id, canvasId]));
    }
    return { byCanvasId, byDocumentId: byDocumentId! };
  };
  return {
    of: (canvasId: string) => read().byCanvasId.get(canvasId) ?? canvasId,
    canvasIdOf: (documentId: string) => read().byDocumentId.get(documentId) ?? documentId,
  };
}

/**
 * The contract's `interaction`, read from the Modeler's `wardleyInteraction`; a viewer has no
 * editing gesture and reports none. `afterUserAction` is the service's wait for the user's running
 * action.
 */
function interactionOf(diagram: Modeler | NavigatedViewer, editable: boolean) {
  const service = editable ? diagram.get<WardleyInteraction>("wardleyInteraction") : undefined;
  const listeners = new Set<(active: boolean) => void>();
  let destroyed = false;
  // The event fires inside diagram-js's drag handling: a host listener that throws there would
  // cancel the user's drag and keep the listeners after it from hearing of the change.
  diagram.get<EventBus>("eventBus").on(INTERACTION_CHANGED, (event: InteractionChangedEvent) => {
    for (const listener of [...listeners]) {
      // An earlier listener may have destroyed the modeler, which drops every listener, or
      // unsubscribed this one during the same delivery.
      if (!listeners.has(listener)) continue;
      try {
        listener(event.active);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  });
  const surface: InteractionSurface = {
    active: () => !destroyed && service?.isActive() === true,
    onChange(callback) {
      if (destroyed) return () => undefined;
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
  return {
    surface,
    afterUserAction: (): Promise<void> | undefined =>
      destroyed ? undefined : service?.afterUserAction(),
    /** Ends every delivery. */
    stop() {
      destroyed = true;
      listeners.clear();
    },
    /** Runs `teardown` at once, or after the handler of the user's input that runs. */
    tearDownAfterHandler(teardown: () => void) {
      if (service) service.tearDownAfterHandler(teardown);
      else teardown();
    },
  };
}

/**
 * The host's selection listeners. The code that calls them goes on with the map once they have
 * returned, also when it is the host's own call: `reveal` scrolls to the element it selected, and
 * an import draws the map after the clear that emptied the selection. A `destroy()` from one of
 * them waits for that code (`delivering`).
 */
function selectionListeners(eventBus: EventBus, isDestroyed: () => boolean) {
  let deliveries = 0;
  return {
    delivering: (): boolean => deliveries > 0,
    subscribe(callback: (selected: unknown[]) => void): () => void {
      // The teardown cancels a running drag, which brings back the selection from before it.
      // diagram-js's event bus still calls a listener that an earlier one unsubscribed during the
      // same delivery after unsubscribing itself.
      let subscribed = true;
      const listener = (event: unknown) => {
        if (isDestroyed() || !subscribed) return;
        deliveries += 1;
        try {
          callback((event as { newSelection?: unknown[] }).newSelection ?? []);
        } finally {
          deliveries -= 1;
        }
      };
      eventBus.on("selection.changed", listener);
      return () => {
        subscribed = false;
        eventBus.off("selection.changed", listener);
      };
    },
  };
}

/**
 * The contract's `appearance`: written onto the container the map is drawn in, so the design tokens
 * resolve their roles there and not from the page around it. View state only: the map, its
 * exports, its history and the view are left as they are.
 */
function appearanceOf(root: HTMLElement, isDestroyed: () => boolean): AppearanceSurface {
  return {
    themes: WARDLEY_THEMES,
    set(request) {
      if (isDestroyed()) return;
      // A host without the contract's types may send anything: it counts as an unlisted theme and
      // as normal contrast.
      const { theme, contrast } = (
        typeof request === "object" && request !== null ? request : {}
      ) as { theme?: unknown; contrast?: unknown };
      const drawn = WARDLEY_THEMES.find((listed) => listed === theme) ?? WARDLEY_THEMES[0];
      root.setAttribute("data-cd-theme", drawn);
      if (contrast === "high") root.setAttribute("data-cd-kontrast", "hoch");
      else root.removeAttribute("data-cd-kontrast");
    },
  };
}

/**
 * The wait of each import: behind the imports that waited before it, then until each user action
 * still running by then has finished; `undefined` when there is nothing to wait for. A wait rejects
 * once the modeler has been destroyed meanwhile.
 */
function importTurns(
  afterUserAction: () => Promise<void> | undefined,
  isDestroyed: () => boolean,
): () => Promise<void> | undefined {
  let lastWaiting: Promise<void> | undefined;
  const wait = async (ahead: Promise<void> | undefined, action: Promise<void> | undefined) => {
    if (ahead) await ahead.catch(() => undefined);
    for (; ; action = afterUserAction()) {
      if (isDestroyed()) throw destroyedError();
      if (!action) return;
      await action;
    }
  };
  return () => {
    const ahead = lastWaiting;
    const action = afterUserAction();
    if (!ahead && !action) return undefined;
    const turn = wait(ahead, action);
    lastWaiting = turn;
    const taken = () => {
      if (lastWaiting === turn) lastWaiting = undefined;
    };
    turn.then(taken, taken);
    return turn;
  };
}

function collaborative(
  diagram: Modeler | NavigatedViewer,
  editable: boolean,
): CollaborativeWardleyModeler {
  const eventBus = diagram.get<EventBus>("eventBus");
  const canvas = diagram.get<Canvas>("canvas");
  const elementRegistry = diagram.get<ElementRegistry>("elementRegistry");
  const selection = diagram.get<Selection>("selection");
  const panConstraint = diagram.get<PanConstraint>("panConstraint");
  const ids = documentIds(diagram, eventBus);
  const livePreview = editable ? diagram.get<LivePreview>("wardleyLivePreview") : undefined;
  const interaction = interactionOf(diagram, editable);
  const contentListeners = new Set<() => void>();
  let importsRunning = 0;
  let imported = false;
  let destroyed = false;
  let lastExport = "";
  const selections = selectionListeners(eventBus, () => destroyed);
  const untilItsTurn = importTurns(interaction.afterUserAction, () => destroyed);

  const meta: ModelerMeta = {
    notation: WARDLEY_NOTATION,
    apiVersion: MODELER_API_VERSION,
    editable,
  };

  // The command stack is the one channel of every user-visible change, config edits included;
  // an import clears it, which is housekeeping, not a change (L1, L3).
  if (editable) {
    eventBus.on("commandStack.changed", () => {
      if (importsRunning > 0) return;
      // An earlier listener may destroy the modeler, which drops every listener, or unsubscribe a
      // later one during the same delivery.
      for (const listener of [...contentListeners]) {
        if (contentListeners.has(listener)) listener();
      }
    });
  }

  const documentIdsOf = (elements: readonly unknown[]): string[] =>
    elements.filter(isAddressable).map((element) => ids.of(element.id));

  const elementInfo = (element: WardleyShape): ElementInfo => {
    const id = ids.of(element.id);
    return element.wardleyLabel ? { id, name: element.wardleyLabel } : { id };
  };

  /** The element `list()` reports under `id`, read from the live canvas. */
  const listedElement = (id: string): WardleyShape | undefined => {
    if (destroyed) return undefined;
    const element: unknown = elementRegistry.get(ids.canvasIdOf(id));
    return isAddressable(element) && ids.of(element.id) === id ? element : undefined;
  };

  const elements: WardleyElementsSurface = {
    list: () =>
      destroyed
        ? []
        : (elementRegistry.getAll() as unknown[]).filter(isAddressable).map(elementInfo),
    reveal(id) {
      if (destroyed) return false;
      const element = elementRegistry.get(ids.canvasIdOf(id));
      if (!isAddressable(element)) return false;
      selection.select(element as unknown as Element);
      canvas.scrollToElement(element as unknown as Element);
      return true;
    },
    selection: () => (destroyed ? [] : documentIdsOf(selection.get())),
    onSelection: (callback) =>
      selections.subscribe((selected) => callback(documentIdsOf(selected))),
    bounds(id) {
      const element = listedElement(id);
      if (!element) return undefined;
      const { x, y, width, height } = element;
      return { x, y, width, height };
    },
  };

  // Never a live preview: a host saves the export at any moment, also while the user drags the plot
  // corner, an evolve target or a label.
  const committedText = (): string => {
    const committed = livePreview?.committedMap();
    return committed ? serializeDSL(committed) : diagram.exportDSL();
  };

  async function importText(text: string): Promise<ImportResult> {
    if (destroyed) throw destroyedError();
    // A host that echoes its own change back through its store imports from the change listener,
    // while the user's action still runs: a create goes on to select its element and open its name
    // editor, a press that saved a name goes on to start its drag, and a drop's later steps, also
    // those it defers by a task, hold the shapes the import would replace. So the import waits
    // until the action has finished, and after the imports that waited before it.
    const turn = untilItsTurn();
    if (turn) await turn;
    importsRunning += 1;
    // An open label editor neither commits during the import nor loses what was typed (L1): it
    // is taken down and reopened on the element with the same id.
    const editorState: EditorState | undefined =
      editable && imported ? setAsideEditorState(diagram as Modeler) : undefined;
    try {
      const { warnings } = await diagram.importDSL(text);
      imported = true;
      // Reading a destroyed map would build a new one on the detached container.
      if (editorState && !destroyed) restoreEditorState(diagram as Modeler, editorState);
      // A listener the import called (the end of a held gesture, the clear of the selection, the
      // selection it brings back) destroyed the modeler: the import rejects, as one that waits
      // does once the modeler is destroyed.
      if (destroyed) throw destroyedError();
      return { warnings: warnings.map((warning) => warning.message) };
    } catch (error) {
      if (editorState && !destroyed)
        restoreEditorState(diagram as Modeler, editorState, { importRejected: true });
      throw error;
    } finally {
      importsRunning -= 1;
    }
  }

  return {
    meta,
    elements,
    interaction: interaction.surface,
    appearance: appearanceOf(diagram.container, () => destroyed),
    diagram,
    attachTo(host) {
      diagram.attachTo(host as HTMLElement);
    },
    importText,
    exportText() {
      // Asking a destroyed diagram would build a new one on the detached container.
      if (destroyed) return lastExport;
      return committedText();
    },
    onContentChanged(callback) {
      if (!editable) return () => undefined;
      contentListeners.add(callback);
      return () => contentListeners.delete(callback);
    },
    getViewState(): ViewState | undefined {
      if (destroyed) return undefined;
      try {
        const { x, y, width, height } = canvas.viewbox();
        const state = { x, y, width, height };
        return isViewState(state) ? state : undefined;
      } catch {
        return undefined;
      }
    },
    setViewState(state) {
      if (destroyed || !isViewState(state)) return;
      canvas.viewbox({ x: state.x, y: state.y, width: state.width, height: state.height });
    },
    // Every map draws its plot, also one without elements, so there is always a box to fit (before
    // the first import the default plot's). A host fits to the box the pan constraint keeps in view.
    contentBounds() {
      if (destroyed) return undefined;
      const { x, y, width, height } = panConstraint.contentBounds();
      return { x, y, width, height };
    },
    destroy() {
      if (destroyed) return;
      lastExport = textToKeep(committedText);
      destroyed = true;
      contentListeners.clear();
      interaction.stop();
      // An import whose listener destroyed the modeler goes on to draw its map before its Promise
      // rejects: the modeler keeps that map (#415). Whatever else runs on after the destroy
      // reaches no host, so the text read above stays.
      let imported = false;
      eventBus.on("import.done", () => {
        imported = true;
      });
      const tearDown = () => {
        if (imported) lastExport = textToKeep(committedText);
        diagram.destroy();
      };
      if (selections.delivering()) queueMicrotask(tearDown);
      else interaction.tearDownAfterHandler(tearDown);
    },
  };
}

function destroyedError(): Error {
  return new Error("The modeler was destroyed.");
}

function textToKeep(committedText: () => string): string {
  try {
    return committedText();
  } catch {
    return "";
  }
}

function isViewState(state: unknown): state is ViewState {
  if (typeof state !== "object" || state === null) return false;
  const { x, y, width, height } = state as Record<string, unknown>;
  return (
    isFiniteNumber(x) &&
    isFiniteNumber(y) &&
    isFiniteNumber(width) &&
    isFiniteNumber(height) &&
    width > 0 &&
    height > 0
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
