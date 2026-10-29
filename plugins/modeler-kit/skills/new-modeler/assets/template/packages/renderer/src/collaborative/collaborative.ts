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
} from '@miragon/modeler-api';
import type { ModuleDeclaration } from 'didi';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type { DiagramOptions } from '../BaseViewer.js';
import type Gestures from '../gestures/Gestures.js';
import type ContentBounds from '../io/ContentBounds.js';
import { Modeler } from '../Modeler.js';
import { NavigatedViewer } from '../NavigatedViewer.js';
import { isNodeShape, type NodeShape } from '../model/di-types.js';
import { appearanceOf } from './appearance.js';

/** `meta.notation`: the stable id hosts bind the notation by (Design IQ's `contractNotation`). */
export const NOTATION = '__NOTATION__';

/** The contract's factory options plus the renderer's own. */
export interface CollaborativeOptions extends CollaborativeModelerOptions {
  /** Appended to the renderer's modules: the shell's `shellModule` in the apps. */
  additionalModules?: ModuleDeclaration[] | undefined;
}

/** The elements surface with `bounds`, which every mount of this renderer answers. */
export type DiagramElementsSurface = ElementsSurface & Required<Pick<ElementsSurface, 'bounds'>>;

/** The contract surface plus the wrapped diagram, for host-specific wiring (menus, exports). */
export interface CollaborativeDiagram extends CollaborativeModeler {
  readonly elements: DiagramElementsSurface;
  /** Whether the user holds a gesture (contract 1.5); always false on the viewer. */
  readonly interaction: InteractionSurface;
  /** The themes the diagram draws, `THEMES`, and the host's request for one (contract 1.5). */
  readonly appearance: AppearanceSurface;
  readonly diagram: Modeler | NavigatedViewer;
  /** The tight box of the nodes (contract 1.3), `undefined` on an empty canvas. */
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
  options: CollaborativeOptions = {},
): CollaborativeDiagram {
  return collaborative(
    new Modeler({
      ...diagramOptions(options),
      freeArea: options.freeArea,
      undoRedoKeys: options.undoRedoKeys ?? true,
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
    width: '100%',
    height: '100%',
    additionalModules: options.additionalModules ?? [],
    fitOnImport: options.fitOnImport ?? true,
  };
}

function collaborative(
  diagram: Modeler | NavigatedViewer,
  editable: boolean,
): CollaborativeDiagram {
  const eventBus = diagram.get<EventBus>('eventBus');
  const canvas = diagram.get<Canvas>('canvas');
  const elementRegistry = diagram.get<ElementRegistry>('elementRegistry');
  const selection = diagram.get<Selection>('selection');
  const content = diagram.get<ContentBounds>('contentBounds');
  // Only the editing mount runs gestures: the viewer has no dragging.
  const gestures = diagram.getOptional<Gestures>('gestures');
  const contentListeners = new Set<() => void>();
  let destroyed = false;
  let lastExport = '';
  // The imports called during a user's action, in call order: each waits for the action and for
  // the one called before it, so an earlier text never lands over a later one.
  let waitingImports: Promise<unknown> | undefined;

  const meta: ModelerMeta = { notation: NOTATION, apiVersion: MODELER_API_VERSION, editable };

  if (editable) {
    // An import clears the history without this event, so every delivery is a user's change (L3).
    eventBus.on('commandStack.changed', () => {
      for (const listener of [...contentListeners]) listener();
    });
  }

  const shapeOf = (id: string): NodeShape | undefined => {
    const element = elementRegistry.get(id);
    return isNodeShape(element) ? element : undefined;
  };
  const shapeIds = (elements: readonly unknown[]) =>
    elements.filter(isNodeShape).map((element) => element.id);

  const elements: DiagramElementsSurface = {
    list: () => (destroyed ? [] : (elementRegistry.filter(isNodeShape) as NodeShape[]).map(info)),
    reveal(id) {
      const shape = destroyed ? undefined : shapeOf(id);
      if (!shape) return false;
      selection.select(shape);
      canvas.scrollToElement(shape);
      return true;
    },
    selection: () => (destroyed ? [] : shapeIds(selection.get())),
    onSelection(callback) {
      const listener = (event: unknown) =>
        callback(shapeIds((event as { newSelection?: unknown[] }).newSelection ?? []));
      eventBus.on('selection.changed', listener);
      return () => eventBus.off('selection.changed', listener);
    },
    bounds(id): ElementBounds | undefined {
      const shape = destroyed ? undefined : shapeOf(id);
      return shape && { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
    },
  };

  const interaction: InteractionSurface = {
    active: () => !destroyed && (gestures?.isActive() ?? false),
    onChange(callback) {
      if (!gestures) return () => undefined;
      return gestures.onChange((active) => {
        if (!destroyed) callback(active);
      });
    },
  };

  const importNow = (text: string): Promise<ImportResult> => {
    if (destroyed) return Promise.reject(new Error('The modeler was destroyed.'));
    try {
      return Promise.resolve(diagram.importText(text));
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
    importText(text): Promise<ImportResult> {
      const before = waitingImports ?? gestures?.actionEnded();
      if (!before) return importNow(text);
      const imported = before.then(() => importNow(text));
      const settled = imported.then(
        () => undefined,
        () => undefined,
      );
      waitingImports = settled;
      void settled.then(() => {
        if (waitingImports === settled) waitingImports = undefined;
      });
      return imported;
    },
    exportText() {
      // Asking a destroyed diagram would build a new one on the detached container.
      return destroyed ? lastExport : diagram.exportText();
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
    // No padding: a host's fit adds its own margins (the shell's fit insets).
    contentBounds: () => (destroyed ? undefined : content.contentBounds(0)),
    destroy() {
      if (destroyed) return;
      try {
        lastExport = diagram.exportText();
      } catch {
        lastExport = '';
      }
      destroyed = true;
      contentListeners.clear();
      diagram.destroy();
    },
  };
}

function info(shape: NodeShape): ElementInfo {
  return shape.elementLabel ? { id: shape.id, name: shape.elementLabel } : { id: shape.id };
}

function isViewState(state: unknown): state is ViewState {
  if (typeof state !== 'object' || state === null) return false;
  const { x, y, width, height } = state as Record<string, unknown>;
  const finite = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);
  return finite(x) && finite(y) && finite(width) && finite(height) && width > 0 && height > 0;
}
