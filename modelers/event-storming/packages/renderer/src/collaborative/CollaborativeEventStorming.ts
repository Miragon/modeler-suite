import {
  MODELER_API_VERSION,
  type AppearanceSurface,
  type AppearanceTheme,
  type CollaborativeModeler,
  type CollaborativeModelerOptions,
  type ElementBounds,
  type ElementInfo,
  type ElementsSurface,
  type ImportResult,
  type InteractionSurface,
  type ModelerMeta,
} from "@miragon/modeler-api";
import type { Injector, ModuleDeclaration } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { Modeler } from "../Modeler.js";
import { NavigatedViewer } from "../NavigatedViewer.js";
import { importWarningText } from "../io/index.js";
import type { EventStormingViewerOptions } from "../EventStormingBaseViewer.js";
import { isSticky, type EventStormingShape } from "../model/di-types.js";
import type { EventStormingGestures } from "../gesture/index.js";
import { EVENT_STORMING_THEMES } from "../theme/index.js";

/** Stable notation id in `meta.notation` of the collaborative-modeler contract. */
export const EVENT_STORMING_NOTATION = "event-storming";

/**
 * The modeler-api factory options (`freeArea`, `fitOnImport`, `undoRedoKeys`) plus the renderer's
 * own. The viewer takes the same object and ignores what only editing uses (`undoRedoKeys`,
 * `freeArea`).
 */
export interface CollaborativeEventStormingOptions extends CollaborativeModelerOptions {
  /** Appended to the renderer's own modules (e.g. a host's chrome module). */
  additionalModules?: ModuleDeclaration[] | undefined;
}

/** The elements surface with `bounds`, which every Event Storming mount answers. */
export type EventStormingElementsSurface = ElementsSurface &
  Required<Pick<ElementsSurface, "bounds">>;

/** The contract surface plus the wrapped diagram for host-specific wiring. */
export interface CollaborativeEventStormingModeler extends CollaborativeModeler {
  /**
   * The tight box around what the board draws, arrow annotations and a hotspot's tilt included;
   * `undefined` while it has no element (contract 1.3).
   */
  contentBounds(): ElementBounds | undefined;
  readonly elements: EventStormingElementsSurface;
  /**
   * Whether the user holds a gesture on the board (contract 1.5): a move, resize, connect or lasso
   * drag, a create or an append from its first preview on (also while it is still over the
   * palette), a paste, and a drawing's point drag. An armed palette tool and a pan are none. On the
   * viewer always false.
   */
  readonly interaction: InteractionSurface;
  /**
   * The modes the board draws (`EVENT_STORMING_THEMES`) and the host's request for one (contract
   * 1.5): written as `data-cd-theme` and `data-cd-kontrast="hoch"` on the renderer's container,
   * view state only.
   */
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
 * Only stickies are addressable: their ids survive a save and re-open (the DSL writes them back).
 * Notes, drawings and arrows have no id in the text — theirs derive from their text or their
 * position and would move to another element on the next import.
 */
type AddressableElement = EventStormingShape;

/** The editing mount (`meta.editable: true`) of the collaborative-modeler contract. */
export function createCollaborativeModeler(
  options: CollaborativeEventStormingOptions = {},
): CollaborativeEventStormingModeler {
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
  options: CollaborativeEventStormingOptions = {},
): CollaborativeEventStormingModeler {
  return collaborative(new NavigatedViewer(diagramOptions(options)), false);
}

function diagramOptions(
  options: Pick<CollaborativeEventStormingOptions, "additionalModules" | "fitOnImport">,
): EventStormingViewerOptions {
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
): CollaborativeEventStormingModeler {
  const eventBus = diagram.get<EventBus>("eventBus");
  const canvas = diagram.get<Canvas>("canvas");
  const elementRegistry = diagram.get<ElementRegistry>("elementRegistry");
  const selection = diagram.get<Selection>("selection");
  const gestures = diagram
    .get<Injector>("injector")
    .get<EventStormingGestures | null>("eventStormingGestures", false);
  const contentListeners = new Set<() => void>();
  const interactionListeners = new Set<(active: boolean) => void>();
  let importsRunning = 0;
  let destroyed = false;
  let lastExport = "";

  const meta: ModelerMeta = {
    notation: EVENT_STORMING_NOTATION,
    apiVersion: MODELER_API_VERSION,
    editable,
  };

  if (editable) {
    eventBus.on("commandStack.changed", () => {
      if (importsRunning > 0) return;
      for (const listener of [...contentListeners]) listener();
    });
  }

  const elements: EventStormingElementsSurface = {
    list: () =>
      destroyed
        ? []
        : (elementRegistry.getAll() as unknown[])
            .filter(isAddressable)
            .map((element) => elementInfo(element)),
    reveal(id) {
      if (destroyed) return false;
      const element = elementRegistry.get(id);
      if (!isAddressable(element)) return false;
      selection.select(element);
      canvas.scrollToElement(element);
      return true;
    },
    selection: () => (destroyed ? [] : addressableIds(selection.get())),
    onSelection(callback) {
      const listener = (event: unknown) =>
        callback(addressableIds((event as { newSelection?: unknown[] }).newSelection ?? []));
      eventBus.on("selection.changed", listener);
      return () => eventBus.off("selection.changed", listener);
    },
    bounds(id) {
      if (destroyed) return undefined;
      const element = elementRegistry.get(id);
      return isAddressable(element) ? elementBounds(element) : undefined;
    },
  };

  gestures?.onChange((active) => {
    if (destroyed) return;
    for (const listener of [...interactionListeners]) listener(active);
  });

  const interaction: InteractionSurface = {
    active: () => !destroyed && (gestures?.isActive() ?? false),
    onChange(callback) {
      interactionListeners.add(callback);
      return () => {
        interactionListeners.delete(callback);
      };
    },
  };

  const appearance: AppearanceSurface = {
    themes: EVENT_STORMING_THEMES,
    set(request) {
      if (destroyed) return;
      const { theme, highContrast } = requestedAppearance(request);
      const container = diagram.container;
      container.setAttribute("data-cd-theme", theme);
      if (highContrast) container.setAttribute("data-cd-kontrast", "hoch");
      else container.removeAttribute("data-cd-kontrast");
    },
  };

  return {
    meta,
    elements,
    interaction,
    appearance,
    diagram,
    attachTo(host) {
      diagram.attachTo(host);
    },
    async importText(text): Promise<ImportResult> {
      if (destroyed) throw new Error("The modeler was destroyed.");
      importsRunning += 1;
      try {
        const { warnings } = await diagram.importDSL(text);
        return { warnings: warnings.map(importWarningText) };
      } finally {
        importsRunning -= 1;
      }
    },
    exportText() {
      // Asking a destroyed diagram would build a new one on the detached container.
      if (destroyed) return lastExport;
      return diagram.exportDSL();
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
    contentBounds() {
      return diagram.contentBounds();
    },
    destroy() {
      if (destroyed) return;
      try {
        lastExport = diagram.exportDSL();
      } catch {
        lastExport = "";
      }
      destroyed = true;
      contentListeners.clear();
      interactionListeners.clear();
      diagram.destroy();
    },
  };
}

/**
 * The theme the board draws for a request: the requested one when the board can draw it, else the
 * first it can. An untyped host may send anything, so nothing here throws.
 */
function requestedAppearance(request: unknown): { theme: AppearanceTheme; highContrast: boolean } {
  const fields = typeof request === "object" && request !== null ? request : {};
  const theme = "theme" in fields ? fields.theme : undefined;
  const contrast = "contrast" in fields ? fields.contrast : undefined;
  const listed = EVENT_STORMING_THEMES.find((drawable) => drawable === theme);
  return {
    theme: listed ?? EVENT_STORMING_THEMES[0] ?? "light",
    highContrast: contrast === "high",
  };
}

function isAddressable(element: unknown): element is AddressableElement {
  return isSticky(element);
}

function addressableIds(elements: readonly unknown[]): string[] {
  return elements.filter(isAddressable).map((element) => element.id);
}

/** The sticky's own box in diagram coordinates, read from the live shape. */
function elementBounds(element: AddressableElement): ElementBounds {
  return { x: element.x, y: element.y, width: element.width, height: element.height };
}

function elementInfo(element: AddressableElement): ElementInfo {
  const name = element.eventStormingLabel;
  return name ? { id: element.id, name } : { id: element.id };
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
