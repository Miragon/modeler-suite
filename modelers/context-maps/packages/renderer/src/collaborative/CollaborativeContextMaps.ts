import {
  MODELER_API_VERSION,
  type AppearanceRequest,
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
import type { Element } from "diagram-js/lib/model/Types";
import { getBBox } from "diagram-js/lib/util/Elements";
import type { CmViewerOptions } from "../CmBaseViewer.js";
import type CmGestureCancel from "../gesture-cancel/CmGestureCancel.js";
import { Modeler } from "../Modeler.js";
import { NavigatedViewer } from "../NavigatedViewer.js";
import { isCmElement, type CmElement } from "../model/di-types.js";
import { CONTEXT_MAPS_THEMES } from "../theme/themes.js";

/** Stable notation id in `meta.notation` of the collaborative-modeler contract. */
export const CONTEXT_MAPS_NOTATION = "context-maps";

/**
 * The contract's factory options (`freeArea`, `fitOnImport`, `undoRedoKeys`, see
 * `CmViewerOptions`) and the renderer's own. The viewer ignores `undoRedoKeys`.
 */
export interface CollaborativeContextMapsOptions extends CollaborativeModelerOptions {
  /** Appended to the renderer's own modules (e.g. a host's chrome module). */
  additionalModules?: ModuleDeclaration[] | undefined;
}

/** The contract surface plus the wrapped diagram for host-specific wiring. */
export interface CollaborativeContextMapsModeler extends CollaborativeModeler {
  readonly elements: ElementsSurface & { bounds(id: string): ElementBounds | undefined };
  contentBounds(): ElementBounds | undefined;
  readonly interaction: InteractionSurface;
  readonly appearance: AppearanceSurface;
  readonly diagram: Modeler | NavigatedViewer;
}

interface ViewState {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The editing mount (`meta.editable: true`) of the collaborative-modeler contract: the text lane
 * is the canonical JSON of a `.cm`/`.cm.json` file (`serializeDocumentText`).
 */
export function createCollaborativeModeler(
  options: CollaborativeContextMapsOptions = {},
): CollaborativeContextMapsModeler {
  return collaborative(
    new Modeler({ ...diagramOptions(options), undoRedoKeys: options.undoRedoKeys ?? true }),
    true,
  );
}

/** The read-only mount (`meta.editable: false`): imports, exports and reveals, never edits. */
export function createCollaborativeViewer(
  options: CollaborativeContextMapsOptions = {},
): CollaborativeContextMapsModeler {
  return collaborative(new NavigatedViewer(diagramOptions(options)), false);
}

function diagramOptions(options: CollaborativeContextMapsOptions): CmViewerOptions {
  return {
    width: "100%",
    height: "100%",
    additionalModules: options.additionalModules ?? [],
    freeArea: options.freeArea,
    fitOnImport: options.fitOnImport,
  };
}

function collaborative(
  diagram: Modeler | NavigatedViewer,
  editable: boolean,
): CollaborativeContextMapsModeler {
  const eventBus = diagram.get<EventBus>("eventBus");
  const canvas = diagram.get<Canvas>("canvas");
  const elementRegistry = diagram.get<ElementRegistry>("elementRegistry");
  const selection = diagram.get<Selection>("selection");
  // Only the editor runs gestures: the viewer has no dragging, its pan runs outside of it.
  const gestures = editable ? diagram.get<CmGestureCancel>("cmGestureCancel") : undefined;
  const contentListeners = new Set<() => void>();
  let destroyed = false;
  let lastExport = "";

  const meta: ModelerMeta = {
    notation: CONTEXT_MAPS_NOTATION,
    apiVersion: MODELER_API_VERSION,
    editable,
  };

  // An import never touches the command stack (it erases the history without an event), so every
  // `commandStack.changed` is a user-visible change: element commands, the title, undo and redo.
  if (editable) {
    eventBus.on("commandStack.changed", () => {
      for (const listener of [...contentListeners]) listener();
    });
  }
  const interaction: InteractionSurface = {
    active: () => !destroyed && (gestures?.isActive() ?? false),
    onChange(callback) {
      if (!gestures || destroyed) return () => undefined;
      // Each listener on its own, so one that throws keeps no other from hearing the change. The
      // diagram's teardown cancels a running drag: its listeners hear nothing after destroy().
      const unsubscribe = gestures.onActiveChange((active) => {
        if (!destroyed) callback(active);
      });
      return () => {
        unsubscribe();
      };
    },
  };

  const appearance: AppearanceSurface = {
    themes: CONTEXT_MAPS_THEMES,
    set(request) {
      if (!destroyed) drawAppearance(diagram.container, request);
    },
  };

  /** The import itself; its body runs at once when called, up to the canvas. */
  async function importNow(text: string): Promise<ImportResult> {
    if (destroyed) throw new Error("The modeler was destroyed.");
    const { warnings } = diagram.importText(text);
    return { warnings: warnings.map((warning) => warning.message) };
  }

  const elements: CollaborativeContextMapsModeler["elements"] = {
    list: () =>
      destroyed ? [] : (elementRegistry.getAll() as unknown[]).filter(isCmElement).map(elementInfo),
    bounds(id) {
      if (destroyed) return undefined;
      const element = elementRegistry.get(id);
      return isCmElement(element) ? boundsOf(element) : undefined;
    },
    reveal(id) {
      if (destroyed) return false;
      const element = elementRegistry.get(id);
      if (!isCmElement(element)) return false;
      selection.select(element as Element);
      canvas.scrollToElement(element as Element);
      return true;
    },
    selection: () => (destroyed ? [] : elementIds(selection.get())),
    onSelection(callback) {
      const listener = (event: unknown) =>
        callback(elementIds((event as { newSelection?: unknown[] }).newSelection ?? []));
      eventBus.on("selection.changed", listener);
      return () => eventBus.off("selection.changed", listener);
    },
  };

  return {
    meta,
    elements,
    interaction,
    appearance,
    diagram,
    attachTo(host) {
      diagram.attachTo(host as HTMLElement);
    },
    importText(text): Promise<ImportResult> {
      // A host that imports from its change listener (an echo of its own change) would replace the
      // elements the user's action still works on: diagram-js's selection after a move, the type
      // menu after an append, the name editor after a keyboard create, diagram-js's drag init
      // after a press committed a label. The import waits until the action has finished.
      const actionEnded = destroyed ? undefined : gestures?.whenActionEnded();
      return actionEnded ? actionEnded.then(() => importNow(text)) : importNow(text);
    },
    exportText() {
      // Asking a destroyed diagram would build a new one on the detached container.
      if (destroyed) return lastExport;
      return diagram.exportText();
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
    contentBounds: () => (destroyed ? undefined : diagram.contentBounds()),
    destroy() {
      if (destroyed) return;
      try {
        lastExport = diagram.exportText();
      } catch {
        lastExport = "";
      }
      destroyed = true;
      contentListeners.clear();
      diagram.destroy();
    },
  };
}

/**
 * Draws the theme the host asked for where `themes` lists it, else the first, with the contrast it
 * asked for, on the root of what the renderer draws: the token roles resolve there and not in the
 * host's page (guide §13.3). The root is the diagram's container, the same before `attachTo` and
 * across every import. A request from an untyped host counts as the fallback theme at normal
 * contrast where it names nothing known.
 */
function drawAppearance(root: HTMLElement, request: AppearanceRequest | undefined): void {
  const theme = CONTEXT_MAPS_THEMES.find((listed) => listed === request?.theme);
  root.dataset.cdTheme = theme ?? CONTEXT_MAPS_THEMES[0];
  if (request?.contrast === "high") root.dataset.cdKontrast = "hoch";
  else delete root.dataset.cdKontrast;
}

function elementIds(elements: readonly unknown[]): string[] {
  return elements.filter(isCmElement).map((element) => element.id);
}

/** The shape's box, or the box around a relationship's waypoints, in diagram coordinates. */
function boundsOf(element: CmElement): ElementBounds {
  const { x, y, width, height } = getBBox(element as unknown as Element);
  return { x, y, width, height };
}

function elementInfo(element: CmElement): ElementInfo {
  return element.cmLabel ? { id: element.id, name: element.cmLabel } : { id: element.id };
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
