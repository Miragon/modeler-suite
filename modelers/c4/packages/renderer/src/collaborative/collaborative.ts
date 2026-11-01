import {
  MODELER_API_VERSION,
  type AppearanceSurface,
  type CollaborativeModeler,
  type CollaborativeModelerOptions,
  type ElementBounds,
  type ImportResult,
  type InteractionSurface,
  type ModelerMeta,
} from "@miragon/modeler-api";
import type { ModuleDeclaration } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { ViewKey } from "@miragon/c4-schema-model";
import type { DiagramOptions, ImportOptions } from "../BaseViewer.js";
import type Gestures from "../gestures/Gestures.js";
import type ContentBounds from "../io/ContentBounds.js";
import { Modeler } from "../Modeler.js";
import { NavigatedViewer } from "../NavigatedViewer.js";
import type { C4DiagramExtras, C4ModelingMethods } from "../services.js";
import type ViewService from "../views/ViewService.js";
import { appearanceOf } from "./appearance.js";
import { elementsSurfaceOf, type DiagramElementsSurface } from "./elements.js";

/** `meta.notation`: the stable id hosts bind the notation by (Design IQ's `contractNotation`). */
export const NOTATION = "c4";

/** The contract's factory options plus the renderer's own. */
export interface CollaborativeOptions extends CollaborativeModelerOptions {
  /** Appended to the renderer's modules: the shell's `shellModule` in the apps. */
  additionalModules?: ModuleDeclaration[] | undefined;
  /** See `DiagramOptions.identifiers`: `collision-free` for hosts where peers edit one text. */
  identifiers?: "readable" | "collision-free" | undefined;
}

export type { DiagramElementsSurface };

/** `getViewState()`: the view shown and the viewbox, in this key order (the kit compares JSON). */
export interface C4ViewState {
  view: ViewKey;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The contract surface plus the wrapped diagram, for host-specific wiring (menus, exports). */
export interface CollaborativeDiagram
  extends CollaborativeModeler, Omit<C4DiagramExtras, "importText"> {
  /** `options.view` is renderer-only (the VS Code webview); a contract import shows the default view. */
  importText(text: string, options?: ImportOptions): Promise<ImportResult>;
  readonly elements: DiagramElementsSurface;
  /** Whether the user holds a gesture (contract 1.5); always false on the viewer. */
  readonly interaction: InteractionSurface;
  /** The themes the diagram draws, `THEMES`, and the host's request for one (contract 1.5). */
  readonly appearance: AppearanceSurface;
  readonly diagram: Modeler | NavigatedViewer;
  getViewState(): C4ViewState | undefined;
  /** The box of what the view draws (contract 1.3), `undefined` while it draws nothing. */
  contentBounds(): ElementBounds | undefined;
}

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The editing mount (`meta.editable: true`) of the collaborative-modeler contract. */
export function createCollaborativeModeler(
  options: CollaborativeOptions = {},
): CollaborativeDiagram {
  return collaborative(
    new Modeler({
      ...diagramOptions(options),
      freeArea: options.freeArea,
      undoRedoKeys: options.undoRedoKeys ?? true,
      identifiers: options.identifiers,
    }),
    true,
  );
}

/** The read-only mount (`meta.editable: false`): imports, exports and reveals, never edits. */
export function createCollaborativeViewer(
  options: CollaborativeOptions = {},
): CollaborativeDiagram {
  return collaborative(new NavigatedViewer(diagramOptions(options)), false);
}

function diagramOptions(options: CollaborativeOptions): DiagramOptions {
  return {
    width: "100%",
    height: "100%",
    additionalModules: options.additionalModules ?? [],
    fitOnImport: options.fitOnImport ?? true,
  };
}

function collaborative(
  diagram: Modeler | NavigatedViewer,
  editable: boolean,
): CollaborativeDiagram {
  const eventBus = diagram.get<EventBus>("eventBus");
  const canvas = diagram.get<Canvas>("canvas");
  const content = diagram.get<ContentBounds>("contentBounds");
  const views = diagram.get<ViewService>("c4Views");
  // Only the editing mount runs gestures: the viewer has no dragging.
  const gestures = diagram.getOptional<Gestures>("gestures");
  const contentListeners = new Set<() => void>();
  let destroyed = false;
  let lastExport = "";
  const selections = selectionListeners(eventBus, () => destroyed);
  const queue = actionQueue(gestures);

  const meta: ModelerMeta = { notation: NOTATION, apiVersion: MODELER_API_VERSION, editable };

  if (editable) {
    // An import clears the history without this event, so every delivery is a user's change (L3).
    // An earlier listener may destroy the modeler, which drops every listener, or unsubscribe a
    // later one during the same delivery.
    eventBus.on("commandStack.changed", () => {
      for (const listener of [...contentListeners]) {
        if (contentListeners.has(listener)) listener();
      }
    });
  }

  const elements = elementsSurfaceOf(diagram, selections, () => destroyed);

  const interaction: InteractionSurface = {
    active: () => !destroyed && (gestures?.isActive() ?? false),
    onChange(callback) {
      if (!gestures) return () => undefined;
      return gestures.onChange((active) => {
        if (!destroyed) callback(active);
      });
    },
  };

  const importNow = (text: string, options: ImportOptions): Promise<ImportResult> => {
    if (destroyed) return Promise.reject(destroyedError());
    try {
      const result = diagram.importText(text, options);
      // A listener the import called (the end of a held gesture, the clear of the selection)
      // destroyed the modeler: the import rejects, as one that waits does once the modeler is
      // destroyed.
      return destroyed ? Promise.reject(destroyedError()) : Promise.resolve(result);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };

  return {
    meta,
    elements,
    interaction,
    appearance: appearanceOf(diagram.container, () => destroyed),
    diagram,
    attachTo(host) {
      diagram.attachTo(host as HTMLElement);
    },
    /**
     * Imports at once, unless a user's action is being applied (a host importing from the change
     * listener of a drop, a keyboard create or a label commit, or from the selection listener
     * inside a delete or at a drag's start): then it waits until the action has finished, so
     * nothing the action still does finds its elements replaced, and settles after that import.
     */
    importText(text, options = {}): Promise<ImportResult> {
      return queue.run(() => importNow(text, options));
    },
    exportText() {
      // Asking a destroyed diagram would build a new one on the detached container.
      return destroyed ? lastExport : diagram.exportText();
    },
    rebaseText: (text) => !destroyed && diagram.rebaseText(text),
    isModelEmpty: () => (destroyed ? true : diagram.isModelEmpty()),
    views: {
      active: () => views.active(),
      catalog: () => views.catalog(),
      open: (key, options) => !destroyed && views.open(key, options),
      parent: () => views.parent(),
      viewboxFor: (key) => views.viewboxFor(key),
    },
    c4: editable ? modelingMethods(diagram, () => destroyed) : REFUSING_METHODS,
    onContentChanged(callback) {
      if (!editable) return () => undefined;
      contentListeners.add(callback);
      return () => contentListeners.delete(callback);
    },
    getViewState(): C4ViewState | undefined {
      if (destroyed) return undefined;
      try {
        const { x, y, width, height } = canvas.viewbox();
        const state = { view: views.active().key, x, y, width, height };
        return isViewBox(state) ? state : undefined;
      } catch {
        return undefined;
      }
    },
    /**
     * A view the state names that the document has and the canvas does not show switches first;
     * during the user's action that switch and its box wait in the import queue, and an import
     * that ran meanwhile may have removed or shown the view already. Without such a view the box
     * applies at once, and an unknown view is ignored. Nothing commits and nothing changes the
     * export (L5).
     */
    setViewState(state) {
      if (destroyed || !isViewBox(state)) return;
      const box = { x: state.x, y: state.y, width: state.width, height: state.height };
      const named = (state as { view?: unknown }).view;
      const target =
        typeof named === "string" && named !== views.active().key && views.resolves(named)
          ? named
          : undefined;
      const apply = () => {
        if (destroyed) return;
        if (target !== undefined && views.resolves(target) && views.active().key !== target) {
          views.open(target, { cause: "host" });
        }
        if (!destroyed) canvas.viewbox(box);
      };
      if (target === undefined) {
        apply();
        return;
      }
      void queue.run(() => {
        apply();
        return Promise.resolve();
      });
    },
    // No padding: a host's fit adds its own margins (the shell's fit insets).
    contentBounds: () => (destroyed ? undefined : content.contentBounds(0)),
    destroy() {
      if (destroyed) return;
      lastExport = textToKeep(diagram);
      destroyed = true;
      contentListeners.clear();
      // An import whose listener destroyed the modeler goes on to draw its document before its
      // Promise rejects: the modeler keeps that document (#415). Whatever else runs on after the
      // destroy reaches no host, so the text read above stays.
      let imported = false;
      eventBus.on("import.done", () => {
        imported = true;
      });
      const tearDown = () => {
        if (imported) lastExport = textToKeep(diagram);
        diagram.destroy();
      };
      if (selections.delivering()) queueMicrotask(tearDown);
      else if (gestures) gestures.tearDownAfterHandler(tearDown);
      else diagram.destroy();
    },
  };
}

/** The domain methods of the editing mount; after `destroy()` they run nothing. */
function modelingMethods(
  diagram: Modeler | NavigatedViewer,
  isDestroyed: () => boolean,
): C4ModelingMethods {
  const modeling = () => (isDestroyed() ? undefined : diagram.get<C4ModelingMethods>("modeling"));
  return {
    editElement: (id, fields) => modeling()?.editElement(id, fields),
    editRelationship: (key, fields) => modeling()?.editRelationship(key, fields),
    renameIdentifier: (id, identifier) => modeling()?.renameIdentifier(id, identifier),
    removeFromView: (ids, relationships) => modeling()?.removeFromView(ids, relationships),
    deleteFromModel: (ids, relationships) => modeling()?.deleteFromModel(ids, relationships),
    includeInView: (ids) => modeling()?.includeInView(ids),
    createView: (type, scopeId, title) => modeling()?.createView(type, scopeId, title),
    editView: (key, fields) => modeling()?.editView(key, fields),
    deleteView: (key) => modeling()?.deleteView(key),
    layOutAutomatically: () => modeling()?.layOutAutomatically(),
    editWorkspace: (fields) => modeling()?.editWorkspace(fields),
    applyC4Colours: () => modeling()?.applyC4Colours(),
    insertExample: (exampleText) => modeling()?.insertExample(exampleText),
  };
}

/** The viewer edits nothing. */
const REFUSING_METHODS: C4ModelingMethods = {
  editElement: () => undefined,
  editRelationship: () => undefined,
  renameIdentifier: () => undefined,
  removeFromView: () => undefined,
  deleteFromModel: () => undefined,
  includeInView: () => undefined,
  createView: () => undefined,
  editView: () => undefined,
  deleteView: () => undefined,
  layOutAutomatically: () => undefined,
  editWorkspace: () => undefined,
  applyC4Colours: () => undefined,
  insertExample: () => undefined,
};

/**
 * The imports called during a user's action, in call order: each waits for the action and for
 * the one called before it, so an earlier text never lands over a later one. A host's
 * `setViewState` that switches views joins the same queue.
 */
function actionQueue(gestures: Gestures | undefined) {
  let waiting: Promise<unknown> | undefined;
  return {
    /** Runs `step` once the user's action and every step queued before have finished. */
    run<T>(step: () => Promise<T>): Promise<T> {
      const before = waiting ?? gestures?.actionEnded();
      if (!before) return step();
      const ran = before.then(step);
      const settled = ran.then(
        () => undefined,
        () => undefined,
      );
      waiting = settled;
      void settled.then(() => {
        if (waiting === settled) waiting = undefined;
      });
      return ran;
    },
  };
}

/**
 * The host's selection listeners. The code that calls them goes on with the diagram once they have
 * returned, also when it is the host's own call: `reveal` scrolls to the node it selected, and an
 * import draws the diagram after the clear that emptied the selection. A `destroy()` from one of
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

function destroyedError(): Error {
  return new Error("The modeler was destroyed.");
}

function textToKeep(diagram: Modeler | NavigatedViewer): string {
  try {
    return diagram.exportText();
  } catch {
    return "";
  }
}

/** A view the state names is optional; the box is finite with a size. */
function isViewBox(state: unknown): state is ViewBox {
  if (typeof state !== "object" || state === null) return false;
  const { x, y, width, height } = state as Record<string, unknown>;
  const finite = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);
  return finite(x) && finite(y) && finite(width) && finite(height) && width > 0 && height > 0;
}
