import Diagram from "diagram-js/lib/Diagram";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { EventBusEventCallback } from "diagram-js/lib/core/EventBus";
import type { ModuleDeclaration } from "didi";
import type { CollaborativeModelerOptions } from "@miragon/modeler-api";
import type { ParseResult } from "@miragon/c4-dsl";
import type { ViewKey } from "@miragon/c4-schema-model";
import type DocumentStore from "./document/DocumentStore.js";
import type { DocumentState } from "./document/DocumentStore.js";
import type { C4Engine } from "./engine/C4Engine.js";
import type Gestures from "./gestures/Gestures.js";
import type ContentBounds from "./io/ContentBounds.js";
import type Importer from "./io/Importer.js";
import { saveSVG } from "./io/saveSvg.js";
import type LabelEditing from "./label-editing/LabelEditing.js";
import type Reconciler from "./reconcile/Reconciler.js";
import type SceneService from "./scene/SceneService.js";
import { TEXT_REBASED_EVENT } from "./services.js";
import type ViewService from "./views/ViewService.js";

/** The contract's factory options (`freeArea`, `fitOnImport`, `undoRedoKeys`) plus the engine's. */
export interface DiagramOptions extends CollaborativeModelerOptions {
  /** Host element; without one a detached `<div>` is created (attach it with `attachTo`). */
  container?: HTMLElement | undefined;
  width?: number | string | undefined;
  height?: number | string | undefined;
  /** Appended to the renderer's own modules (a host's chrome module: the shell's `shellModule`). */
  additionalModules?: ModuleDeclaration[] | undefined;
  /**
   * What a fresh element's identifier becomes on its first name (SPEC 3.3): `collision-free`
   * adds a random suffix, for collaborative hosts where two peers may give two elements one name.
   */
  identifiers?: "readable" | "collision-free" | undefined;
}

export interface ImportOutcome {
  /** Non-fatal findings: the parser's errors and warnings that do not reject the text. */
  warnings: string[];
}

export interface ImportOptions {
  /** Renderer-only (the VS Code webview): the view to show when the text still has it. */
  readonly view?: ViewKey | undefined;
}

interface CommandStackLike {
  clear(emit?: boolean): void;
}

interface Closable {
  close(): void;
}

/** CSS class of the renderer's own root; its stylesheet scopes every rule below it. */
export const CONTAINER_CLASS = "c4-container";

/**
 * Lifecycle shared by Viewer, NavigatedViewer and Modeler. The diagram is created lazily on the
 * first `get`, so a host can mount the chrome module (`additionalModules`) first.
 */
export abstract class BaseViewer {
  protected abstract modules(): ModuleDeclaration[];

  private diagram: Diagram | undefined;
  readonly container: HTMLElement;

  constructor(private readonly options: DiagramOptions = {}) {
    this.container = options.container ?? document.createElement("div");
    this.container.classList.add(CONTAINER_CLASS);
    this.container.style.width = cssSize(options.width ?? "100%");
    this.container.style.height = cssSize(options.height ?? "100%");
  }

  get<T>(name: string): T {
    return this.ensureDiagram().get<T>(name);
  }

  getOptional<T>(name: string): T | undefined {
    return (this.ensureDiagram().get<T>(name, false) as T | null) ?? undefined;
  }

  on<T = unknown>(event: string, callback: EventBusEventCallback<T>, priority = 1000): void {
    this.get<EventBus>("eventBus").on(event, priority, callback as EventBusEventCallback<unknown>);
  }

  off<T = unknown>(event: string, callback: EventBusEventCallback<T>): void {
    this.get<EventBus>("eventBus").off(event, callback as EventBusEventCallback<unknown>);
  }

  /**
   * Parses, validates, then renders (SPEC 1.7): a text that is no document rejects before the
   * canvas, the history or the view are touched (contract L7), and a gesture the user holds runs
   * on. Silent (L1): the undo history goes without a `commandStack.changed`, an open label edit
   * is taken down without committing, and an accepted text first ends a running gesture the way
   * Escape does. It shows `options.view` when the text has it, else the default view, so a
   * contract import is a pure function of the text. Called while a drop is applied (from the
   * change listener of its command), it leaves that drop to finish. The contract's `importText`
   * waits until the user's action has finished instead, so a host imports through it.
   */
  importText(text: string, options: ImportOptions = {}): ImportOutcome {
    const parse = this.get<C4Engine>("c4Engine").parse(text);
    if (!parse.ok) {
      const rejection = parse.diagnostics.find((diagnostic) => diagnostic.rejects);
      throw new Error(
        rejection
          ? `Line ${rejection.line}: ${rejection.message}`
          : "The text is no workspace the modeler can open.",
      );
    }
    this.getOptional<Gestures>("gestures")?.cancel();
    const labelEditing = this.getOptional<LabelEditing>("labelEditing");
    labelEditing?.suspend();
    this.getOptional<Closable>("contextPad")?.close();
    const previous = this.get<DocumentStore>("c4Document").current();
    try {
      this.render(parse, options.view);
    } catch (error) {
      this.renderBack(previous);
      throw error;
    } finally {
      // Also after a failed render: a suspended edit never reopened would come back on a later
      // import instead.
      labelEditing?.resumeAfterImport();
    }
    return {
      warnings: parse.diagnostics
        .filter((diagnostic) => diagnostic.severity !== "info")
        .map((diagnostic) => `Line ${diagnostic.line}: ${diagnostic.message}`),
    };
  }

  /**
   * Takes a text that differs from the current one only in formatting or comments (SPEC 1.7):
   * the store keeps the new bytes, so the next edit does not write the old ones back, while the
   * canvas, the view and a running gesture stay as they are. The history goes, since its patches
   * point at the old text, and `c4.text.rebased` tells what shows text positions. False, and
   * nothing changed, for any other text.
   */
  rebaseText(text: string): boolean {
    const store = this.get<DocumentStore>("c4Document");
    const current = store.current();
    if (text === current.parse.text) return true;
    const parse = store.parseOf(text);
    if (!this.get<C4Engine>("c4Engine").semanticallyEqual(parse, current.parse)) return false;
    store.set({ parse, view: current.view, fresh: new Set() });
    this.getOptional<CommandStackLike>("commandStack")?.clear(false);
    this.get<EventBus>("eventBus").fire(TEXT_REBASED_EVENT, {});
    return true;
  }

  /** The accepted text byte for byte (L2, L6): the DSL is the document, never re-serialized. */
  exportText(): string {
    return this.get<DocumentStore>("c4Document").current().parse.text;
  }

  /** The model has no element (the empty-file hint), not "this view shows nothing". */
  isModelEmpty(): boolean {
    return this.get<DocumentStore>("c4Document").current().parse.workspace.elements.length === 0;
  }

  saveSVG(): { svg: string } {
    return saveSVG(this.get<Canvas>("canvas"), this.get<ContentBounds>("contentBounds"));
  }

  attachTo(host: HTMLElement): void {
    this.container.remove();
    host.append(this.container);
    this.get<Canvas>("canvas").resized();
  }

  destroy(): void {
    this.diagram?.destroy();
    this.diagram = undefined;
    this.container.remove();
  }

  private render(parse: ParseResult, requested: ViewKey | undefined): void {
    const store = this.get<DocumentStore>("c4Document");
    const catalog = this.get<C4Engine>("c4Engine").catalog(parse.workspace);
    const view =
      (requested === undefined ? undefined : catalog.resolve(requested)) ?? catalog.defaultView();
    this.get<Importer>("importer").import(() => {
      store.set({ parse, view: view.key, fresh: new Set() });
      this.get<Reconciler>("c4Reconciler").syncAndRedraw(
        this.get<SceneService>("c4Scene").current(),
      );
    });
    this.getOptional<CommandStackLike>("commandStack")?.clear(false);
    this.get<EventBus>("eventBus").fire("import.done", {});
    this.get<ViewService>("c4Views").refreshPalette();
  }

  /** After a failed render, the document from before: the failure is the one to report. */
  private renderBack(previous: DocumentState): void {
    try {
      this.render(previous.parse, previous.view);
    } catch {
      this.get<DocumentStore>("c4Document").set(previous);
    }
  }

  private ensureDiagram(): Diagram {
    this.diagram ??= new Diagram({
      canvas: { container: this.container },
      modules: [...this.modules(), ...(this.options.additionalModules ?? [])],
      palette: { freeArea: this.options.freeArea },
      diagramKeyboard: { undoRedoKeys: this.options.undoRedoKeys ?? true },
      import: { fitOnImport: this.options.fitOnImport ?? true },
      c4Modeling: { identifiers: this.options.identifiers ?? "readable" },
    });
    return this.diagram;
  }
}

function cssSize(value: number | string): string {
  return typeof value === "number" ? `${value}px` : value;
}
