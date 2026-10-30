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
import type { ModuleDeclaration } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import {
  createEmptyDocument,
  parseDocumentJSON,
  serializeDocument,
  type ValueChainDocument,
} from "@miragon/value-chain-schema-model";
import { Modeler } from "../Modeler.js";
import { NavigatedViewer } from "../NavigatedViewer.js";
import type { VcViewerOptions } from "../VcBaseViewer.js";
import { createAppearance } from "../appearance/index.js";
import type VcBounds from "../bounds/VcBounds.js";
import { GESTURE_CHANGED_EVENT, type VcGestures } from "../gesture/index.js";
import { isVcShape, type VcShape } from "../model/di-types.js";

/** Stable notation id in `meta.notation` of the collaborative-modeler contract. */
export const VALUE_CHAIN_NOTATION = "value-chain";

/** What a blank text (a file just created in the explorer) opens as. */
export const BLANK_DOCUMENT_NAME = "New value chain";

/**
 * The contract's factory options (`freeArea`, `fitOnImport`, `undoRedoKeys`, see
 * `VcViewerOptions`) plus the renderer's own. The viewer ignores the two that need editing.
 */
export interface CollaborativeValueChainOptions extends CollaborativeModelerOptions {
  /** Appended to the renderer's own modules (e.g. a host's chrome module). */
  additionalModules?: ModuleDeclaration[] | undefined;
}

/** The contract surface plus the wrapped diagram for host-specific wiring. */
export interface CollaborativeValueChainModeler extends CollaborativeModeler {
  readonly elements: ElementsSurface & Required<Pick<ElementsSurface, "bounds">>;
  /**
   * The tight box around every step, org unit and connection (waypoints included) and every label,
   * also where its text runs past its shape, in diagram coordinates, without a margin of its own;
   * undefined while the diagram has no element. The SVG export frames the same box. Labels are
   * measured once per content change, so zoom and scroll leave the box alone.
   */
  contentBounds(): ElementBounds | undefined;
  /**
   * Whether the user holds a gesture (`VcGestures.isActive()`); always false on the viewer, which
   * has none. A pan with the hand tool, with Space held or with Ctrl/Cmd and a press is no gesture.
   */
  readonly interaction: InteractionSurface;
  /** `themes` is `VALUE_CHAIN_THEMES`; `set` writes the mode on `diagram.container`. */
  readonly appearance: AppearanceSurface;
  readonly diagram: Modeler | NavigatedViewer;
}

interface ViewState {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The editing mount (`meta.editable: true`) of the collaborative-modeler contract. */
export function createCollaborativeModeler(
  options: CollaborativeValueChainOptions = {},
): CollaborativeValueChainModeler {
  return collaborative(
    new Modeler({
      ...diagramOptions(options),
      undoRedoKeys: options.undoRedoKeys ?? true,
      freeArea: options.freeArea,
    }),
    true,
  );
}

/** The read-only mount (`meta.editable: false`): imports, exports and reveals, never edits. */
export function createCollaborativeViewer(
  options: CollaborativeValueChainOptions = {},
): CollaborativeValueChainModeler {
  return collaborative(new NavigatedViewer(diagramOptions(options)), false);
}

function diagramOptions(options: CollaborativeValueChainOptions): VcViewerOptions {
  return {
    width: "100%",
    height: "100%",
    additionalModules: options.additionalModules ?? [],
    fitOnImport: options.fitOnImport ?? true,
  };
}

/** Blank text is an empty diagram; anything else must be a valid document. */
function documentOf(text: string): ValueChainDocument {
  return text.trim() === "" ? createEmptyDocument(BLANK_DOCUMENT_NAME) : parseDocumentJSON(text);
}

function collaborative(
  diagram: Modeler | NavigatedViewer,
  editable: boolean,
): CollaborativeValueChainModeler {
  const eventBus = diagram.get<EventBus>("eventBus");
  const canvas = diagram.get<Canvas>("canvas");
  const elementRegistry = diagram.get<ElementRegistry>("elementRegistry");
  const selection = diagram.get<Selection>("selection");
  const vcBounds = diagram.get<VcBounds>("vcBounds");
  const gestures = diagram.getOptional<VcGestures>("vcGestures");
  const contentListeners = new Set<() => void>();
  const interactionListeners = new Set<(active: boolean) => void>();
  let destroyed = false;
  let lastExport = "";

  const meta: ModelerMeta = {
    notation: VALUE_CHAIN_NOTATION,
    apiVersion: MODELER_API_VERSION,
    editable,
  };

  if (editable) {
    // Imports erase the history without this event, so every delivery is a user's change. An
    // earlier listener may destroy the modeler, which drops every listener, or unsubscribe a later
    // one during the same delivery.
    eventBus.on("commandStack.changed", () => {
      for (const listener of [...contentListeners]) {
        if (contentListeners.has(listener)) listener();
      }
    });
  }

  // A host's listener runs inside the drag's pointer handler: diagram-js ends a drag on an error in
  // its own events, and a throwing host must not cost the user the gesture. An earlier listener may
  // destroy the modeler or unsubscribe a later one during the same delivery.
  eventBus.on(GESTURE_CHANGED_EVENT, (event: { active: boolean }) => {
    for (const listener of [...interactionListeners]) {
      if (destroyed || !interactionListeners.has(listener)) continue;
      try {
        listener(event.active);
      } catch (error) {
        reportError(error);
      }
    }
  });

  const interaction: InteractionSurface = {
    active: () => !destroyed && (gestures?.isActive() ?? false),
    onChange(callback) {
      if (destroyed) return () => undefined;
      const listener = (active: boolean): void => callback(active);
      interactionListeners.add(listener);
      return () => interactionListeners.delete(listener);
    },
  };

  const elements: CollaborativeValueChainModeler["elements"] = {
    list: () =>
      destroyed ? [] : (elementRegistry.getAll() as unknown[]).filter(isVcShape).map(elementInfo),
    reveal(id) {
      if (destroyed) return false;
      const element = elementRegistry.get(id);
      if (!isVcShape(element)) return false;
      selection.select(element);
      canvas.scrollToElement(element);
      return true;
    },
    selection: () => (destroyed ? [] : shapeIds(selection.get())),
    onSelection(callback) {
      // The teardown cancels a running drag, which brings back the selection from before it.
      const listener = (event: unknown) => {
        if (destroyed) return;
        callback(shapeIds((event as { newSelection?: unknown[] }).newSelection ?? []));
      };
      eventBus.on("selection.changed", listener);
      return () => eventBus.off("selection.changed", listener);
    },
    bounds(id): ElementBounds | undefined {
      if (destroyed) return undefined;
      const element = elementRegistry.get(id);
      if (!isVcShape(element)) return undefined;
      const { x, y, width, height } = element;
      return { x, y, width, height };
    },
  };

  return {
    meta,
    elements,
    interaction,
    appearance: createAppearance(diagram.container, () => destroyed),
    diagram,
    attachTo(host) {
      host.appendChild(diagram.container);
      canvas.resized();
    },
    importText(text): Promise<ImportResult> {
      if (destroyed) return Promise.reject(destroyedError());
      let document: ValueChainDocument;
      try {
        document = documentOf(text);
      } catch (error) {
        return Promise.reject(asError(error));
      }
      // A host that imports from its change listener does so while the user's action that made the
      // change still runs: a drop's later listeners, or the selection and label editor of a click
      // append or a keyboard create, would meet the replaced diagram.
      return new Promise<ImportResult>((resolve, reject) => {
        const importNow = (): void => {
          if (destroyed) {
            reject(destroyedError());
            return;
          }
          try {
            const warnings = diagram.importDocument(document);
            resolve({ warnings: warnings.map((warning) => warning.message) });
          } catch (error) {
            reject(asError(error));
          }
        };
        if (gestures) gestures.afterUserAction(importNow);
        else importNow();
      });
    },
    exportText() {
      // Asking a destroyed diagram would build a new one on the detached container.
      if (destroyed) return lastExport;
      return serializeDocument(diagram.exportDocument());
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
    contentBounds(): ElementBounds | undefined {
      // A host's fit adds its own insets (contract 1.3), so no padding here.
      return destroyed ? undefined : vcBounds.contentBounds(0);
    },
    destroy() {
      if (destroyed) return;
      try {
        lastExport = serializeDocument(diagram.exportDocument());
      } catch {
        lastExport = "";
      }
      destroyed = true;
      contentListeners.clear();
      interactionListeners.clear();
      if (gestures) gestures.tearDownAfterHandler(() => diagram.destroy());
      else diagram.destroy();
    },
  };
}

function destroyedError(): Error {
  return new Error("The modeler was destroyed.");
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function shapeIds(selected: readonly unknown[]): string[] {
  return selected.filter(isVcShape).map((element) => element.id);
}

function elementInfo(element: VcShape): ElementInfo {
  return element.vcLabel ? { id: element.id, name: element.vcLabel } : { id: element.id };
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
