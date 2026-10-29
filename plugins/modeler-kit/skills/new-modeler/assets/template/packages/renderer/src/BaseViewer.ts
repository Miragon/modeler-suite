import Diagram from 'diagram-js/lib/Diagram';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { EventBusEventCallback } from 'diagram-js/lib/core/EventBus';
import type { ModuleDeclaration } from 'didi';
import type { CollaborativeModelerOptions } from '@miragon/modeler-api';
import { parseText, serializeText } from '@miragon/__NOTATION__-dsl';
import { validateDocument, type DiagramDocument } from '@miragon/__NOTATION__-schema-model';
import type Gestures from './gestures/Gestures.js';
import type ContentBounds from './io/ContentBounds.js';
import type Exporter from './io/Exporter.js';
import type Importer from './io/Importer.js';
import { saveSVG } from './io/saveSvg.js';
import type LabelEditing from './label-editing/LabelEditing.js';

/** The contract's factory options (`freeArea`, `fitOnImport`, `undoRedoKeys`) plus the engine's. */
export interface DiagramOptions extends CollaborativeModelerOptions {
  /** Host element; without one a detached `<div>` is created (attach it with `attachTo`). */
  container?: HTMLElement | undefined;
  width?: number | string | undefined;
  height?: number | string | undefined;
  /** Appended to the renderer's own modules (a host's chrome module: the shell's `shellModule`). */
  additionalModules?: ModuleDeclaration[] | undefined;
}

export interface ImportOutcome {
  /** Non-fatal findings: lines kept as they are, which the canvas does not show. */
  warnings: string[];
}

interface CommandStackLike {
  clear(emit?: boolean): void;
}

/** CSS class of the renderer's own root; its stylesheet scopes every rule below it. */
export const CONTAINER_CLASS = '__NOTATION__-container';

/**
 * Lifecycle shared by Viewer, NavigatedViewer and Modeler. The diagram is created lazily on the
 * first `get`, so a host can mount the chrome module (`additionalModules`) first.
 */
export abstract class BaseViewer {
  protected abstract modules(): ModuleDeclaration[];

  private diagram: Diagram | undefined;
  readonly container: HTMLElement;

  constructor(private readonly options: DiagramOptions = {}) {
    this.container = options.container ?? document.createElement('div');
    this.container.classList.add(CONTAINER_CLASS);
    this.container.style.width = cssSize(options.width ?? '100%');
    this.container.style.height = cssSize(options.height ?? '100%');
  }

  get<T>(name: string): T {
    return this.ensureDiagram().get<T>(name);
  }

  getOptional<T>(name: string): T | undefined {
    return (this.ensureDiagram().get<T>(name, false) as T | null) ?? undefined;
  }

  on<T = unknown>(event: string, callback: EventBusEventCallback<T>, priority = 1000): void {
    this.get<EventBus>('eventBus').on(event, priority, callback as EventBusEventCallback<unknown>);
  }

  off<T = unknown>(event: string, callback: EventBusEventCallback<T>): void {
    this.get<EventBus>('eventBus').off(event, callback as EventBusEventCallback<unknown>);
  }

  /**
   * Parses, validates, then renders: a text that is no document rejects before the canvas is
   * touched (contract L7), and a gesture the user holds runs on. Silent (L1): the undo history
   * goes without a `commandStack.changed`, an open label edit is taken down without committing,
   * and an accepted text first ends a running gesture the way Escape does. Called while a drop is
   * applied (from the change listener of its command), it leaves that drop to finish; the
   * contract's `importText` waits until the user's action has finished instead.
   */
  importText(text: string): ImportOutcome {
    const { document, diagnostics } = parseText(text);
    this.importDocument(document);
    return { warnings: diagnostics.map((finding) => `Line ${finding.line}: ${finding.message}`) };
  }

  /** The canonical text of the canvas (L2), total after every successful import (L6). */
  exportText(): string {
    return serializeText(this.exportDocument());
  }

  importDocument(document: DiagramDocument): void {
    const valid = validateDocument(document);
    this.getOptional<Gestures>('gestures')?.cancel();
    const labelEditing = this.getOptional<LabelEditing>('labelEditing');
    labelEditing?.suspend();
    const previous = this.exportDocument();
    try {
      this.render(valid);
    } catch (error) {
      this.render(previous);
      throw error;
    } finally {
      // Also after a failed render: a suspended edit never reopened would come back on a later
      // import instead.
      labelEditing?.resumeAfterImport();
    }
  }

  exportDocument(): DiagramDocument {
    return this.get<Exporter>('exporter').export();
  }

  saveSVG(): { svg: string } {
    return saveSVG(this.get<Canvas>('canvas'), this.get<ContentBounds>('contentBounds'));
  }

  attachTo(host: HTMLElement): void {
    this.container.remove();
    host.append(this.container);
    this.get<Canvas>('canvas').resized();
  }

  destroy(): void {
    this.diagram?.destroy();
    this.diagram = undefined;
    this.container.remove();
  }

  private render(document: DiagramDocument): void {
    this.get<Importer>('importer').import(document);
    this.getOptional<CommandStackLike>('commandStack')?.clear(false);
    this.get<EventBus>('eventBus').fire('import.done', {});
  }

  private ensureDiagram(): Diagram {
    this.diagram ??= new Diagram({
      canvas: { container: this.container },
      modules: [...this.modules(), ...(this.options.additionalModules ?? [])],
      palette: { freeArea: this.options.freeArea },
      diagramKeyboard: { undoRedoKeys: this.options.undoRedoKeys ?? true },
      import: { fitOnImport: this.options.fitOnImport ?? true },
    });
    return this.diagram;
  }
}

function cssSize(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value;
}
