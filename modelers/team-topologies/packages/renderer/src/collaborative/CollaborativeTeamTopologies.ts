/**
 * The Team Topologies modeler behind the collaborative-modeler contract of `@miragon/modeler-api`
 * (the laws L1 to L7 in its README): hosts such as designIQ, the VS Code webview and the web app
 * import and export the document as text, observe changes and gestures, ask for a mode and anchor
 * on element ids without knowing the renderer.
 */

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
import {
  parseDocument,
  serializeDocument,
  type TtDocument,
} from "@miragon/team-topologies-schema-model";
import type { Injector, ModuleDeclaration } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { Modeler } from "../Modeler.js";
import { NavigatedViewer } from "../NavigatedViewer.js";
import { isTtElement, type TtElement } from "../model/di-types.js";
import { appearanceSurface } from "./appearance.js";
import { trackInteraction } from "./interaction.js";
import { watchUserActions } from "./user-actions.js";

/** Stable notation id in `meta.notation` of the collaborative-modeler contract. */
export const TEAM_TOPOLOGIES_NOTATION = "team-topologies";

/**
 * The contract's factory options (`freeArea`, `fitOnImport`, `undoRedoKeys`; the viewer ignores
 * `freeArea` and `undoRedoKeys`) plus the renderer's own.
 */
export interface CollaborativeTeamTopologiesOptions extends CollaborativeModelerOptions {
  /** Appended to the renderer's own modules (e.g. a host's chrome module). */
  additionalModules?: ModuleDeclaration[] | undefined;
}

/** The elements surface with the optional `bounds` of contract 1.2, which this renderer has. */
export interface TtElementsSurface extends ElementsSurface {
  bounds(id: string): ElementBounds | undefined;
}

/**
 * The contract surface, with the optional `contentBounds` of contract 1.3 and `interaction` and
 * `appearance` of contract 1.5, which this renderer has, plus the wrapped diagram for
 * host-specific wiring.
 */
export interface CollaborativeTeamTopologiesModeler extends CollaborativeModeler {
  readonly elements: TtElementsSurface;
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

/** The editing mount (`meta.editable: true`) of the collaborative-modeler contract. */
export function createCollaborativeModeler(
  options: CollaborativeTeamTopologiesOptions = {},
): CollaborativeTeamTopologiesModeler {
  return collaborative(
    new Modeler({
      ...diagramOptions(options),
      undoRedoKeys: options.undoRedoKeys ?? true,
      freeArea: options.freeArea,
    }),
    true,
    options.fitOnImport ?? true,
  );
}

/** The read-only mount (`meta.editable: false`): imports, exports and reveals, never edits. */
export function createCollaborativeViewer(
  options: CollaborativeTeamTopologiesOptions = {},
): CollaborativeTeamTopologiesModeler {
  return collaborative(
    new NavigatedViewer(diagramOptions(options)),
    false,
    options.fitOnImport ?? true,
  );
}

function diagramOptions(options: Pick<CollaborativeTeamTopologiesOptions, "additionalModules">) {
  return { width: "100%", height: "100%", additionalModules: options.additionalModules ?? [] };
}

/**
 * The document text as the contract reads it: blank text is a new, empty diagram (a file just
 * created in an editor), anything else must be a valid document.
 */
export function parseDocumentText(text: string): TtDocument {
  const result = parseDocument(text.trim() === "" ? {} : JSON.parse(text));
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

function collaborative(
  diagram: Modeler | NavigatedViewer,
  editable: boolean,
  fitOnImport: boolean,
): CollaborativeTeamTopologiesModeler {
  const eventBus = diagram.get<EventBus>("eventBus");
  const canvas = diagram.get<Canvas>("canvas");
  const elementRegistry = diagram.get<ElementRegistry>("elementRegistry");
  const selection = diagram.get<Selection>("selection");
  const dragging =
    diagram.get<Injector>("injector").get<Dragging | null>("dragging", false) ?? null;
  const interaction = trackInteraction(eventBus, dragging);
  const userActions = watchUserActions(eventBus);
  const contentListeners = new Set<() => void>();
  let importsRunning = 0;
  let destroyed = false;
  let lastExport = "";
  const selections = selectionListeners(eventBus, () => destroyed);

  const meta: ModelerMeta = {
    notation: TEAM_TOPOLOGIES_NOTATION,
    apiVersion: MODELER_API_VERSION,
    editable,
  };

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

  const exportText = (): string => serializeDocument(diagram.exportDocument());

  const textToKeep = (): string => {
    try {
      return exportText();
    } catch {
      return "";
    }
  };

  const importNow = (document: TtDocument): ImportResult => {
    if (destroyed) throw new Error("The modeler was destroyed.");
    importsRunning += 1;
    try {
      const { warnings } = diagram.importDocument(document, { fit: fitOnImport });
      return { warnings: warnings.map((warning) => warning.message) };
    } finally {
      importsRunning -= 1;
    }
  };

  /** The imports that wait for a user action, each settled before the next one runs. */
  let waitingImports: Promise<unknown> | undefined;

  const importAfterUserAction = (document: TtDocument): Promise<ImportResult> => {
    const imported = (waitingImports ?? Promise.resolve())
      .then(() => userActions.untilNoActionRuns())
      .then(() => importNow(document));
    const settled = imported.then(
      () => undefined,
      () => undefined,
    );
    waitingImports = settled;
    void settled.then(() => {
      if (waitingImports === settled) waitingImports = undefined;
    });
    return imported;
  };

  const elements: TtElementsSurface = {
    list: () =>
      destroyed ? [] : (elementRegistry.getAll() as unknown[]).filter(isTtElement).map(elementInfo),
    reveal(id) {
      if (destroyed) return false;
      const element = elementRegistry.get(id);
      if (!isTtElement(element)) return false;
      selection.select(element);
      canvas.scrollToElement(element);
      return true;
    },
    selection: () => (destroyed ? [] : elementIds(selection.get())),
    onSelection: (callback) => selections.subscribe((selected) => callback(elementIds(selected))),
    bounds(id) {
      if (destroyed) return undefined;
      const element = elementRegistry.get(id);
      if (!isTtElement(element)) return undefined;
      const { x, y, width, height } = element;
      return { x, y, width, height };
    },
  };

  return {
    meta,
    elements,
    interaction: interaction.surface,
    appearance: appearanceSurface(diagram.container),
    diagram,
    attachTo(host) {
      diagram.attachTo(host);
    },
    async importText(text): Promise<ImportResult> {
      if (destroyed) throw new Error("The modeler was destroyed.");
      const document = parseDocumentText(text);
      if (userActions.running() || waitingImports) return importAfterUserAction(document);
      return importNow(document);
    },
    exportText() {
      // Asking a destroyed diagram would build a new one on the detached container.
      if (destroyed) return lastExport;
      return exportText();
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
      lastExport = textToKeep();
      destroyed = true;
      contentListeners.clear();
      interaction.stop();
      userActions.stop();
      if (!selections.delivering()) {
        userActions.tearDownAfterHandler(() => diagram.destroy());
        return;
      }
      // Once the code that called the selection listener has returned (#415), with the diagram it
      // left: an import's, whose Promise then resolves.
      queueMicrotask(() => {
        lastExport = textToKeep();
        diagram.destroy();
      });
    },
  };
}

/**
 * The host's selection listeners. The code that calls them goes on with the diagram once they have
 * returned, also when it is the host's own call: `reveal` scrolls to the element it selected, and
 * an import draws the diagram after the clear that emptied the selection. A `destroy()` from one
 * of them waits for that code (`delivering`).
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

/** Connectors are not addressable: their ids derive from the annotation and are never stored. */
function elementIds(elements: readonly unknown[]): string[] {
  return elements.filter(isTtElement).map((element) => element.id);
}

/** A team's, interaction's or flow's label; an annotation's text. */
function elementInfo(element: TtElement): ElementInfo {
  const name = element.ttLabel;
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
