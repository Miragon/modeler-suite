/**
 * Shared lifecycle & DI bootstrap for every Context Maps viewer. Subclasses
 * only override `_getModules()`. The renderer
 * is framework-agnostic — mount it into any element (e.g. a VS Code webview).
 */

import Diagram from "diagram-js/lib/Diagram";
import type { ModuleDeclaration } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type { Root } from "diagram-js/lib/model/Types";
import type { ElementBounds, FreeArea } from "@miragon/modeler-api";
import { parseDocumentText, serializeDocumentText } from "@miragon/context-maps-schema-model";
import type { CmDocument } from "@miragon/context-maps-schema-model";
import { saveSVG } from "./io/saveSvg.js";
import type CmImporter from "./io/CmImporter.js";
import type CmExporter from "./io/CmExporter.js";
import type CmGestureCancel from "./gesture-cancel/CmGestureCancel.js";
import type CmLabelEditing from "./label-editing/CmLabelEditing.js";
import type CmModeling from "./modeling/CmModeling.js";
import type CmReadOnly from "./read-only/CmReadOnly.js";
import { contentBoundsOf } from "./model/contentBounds.js";
import { freeAreaInsets } from "./palette/freeArea.js";
import { ROOT_ID, type ImportWarning, type RootBusinessObject } from "./io/types.js";

/** Container margins in screen px that a host's chrome covers. */
export interface FreeRectInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CmViewerOptions {
  /** Host element. When absent, a detached <div> is created (attach later). */
  container?: HTMLElement | undefined;
  width?: number | string | undefined;
  height?: number | string | undefined;
  /** Appended to the module list (extension point). */
  additionalModules?: ModuleDeclaration[] | undefined;
  /**
   * Bind Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y to the canvas undo/redo (default true).
   * Pass false when the host owns the history (the VS Code document), so the keys reach it.
   */
  undoRedoKeys?: boolean | undefined;
  /**
   * The part of the container the host's chrome (palette row, zoom panel, legend) leaves free, under
   * its `@miragon/modeler-api` name: `{ insets }`, the margins the chrome covers, or `{ center }`,
   * the free rectangle's centre in diagram coordinates. An element created from the palette with
   * Enter or Space lands in that centre, and the fit after an import centres the content in what
   * the insets leave (guide §5.5, §5.9). Default: room for the renderer's own palette, which the
   * fit also keeps when only `center` is given.
   */
  freeArea?: FreeArea | undefined;
  /**
   * Fit the content into the view after every import (default true). Pass false when the host's
   * chrome fits the content itself, so the view changes once per import.
   */
  fitOnImport?: boolean | undefined;
}

export type EventCallback<T = unknown> = (event: T) => void;

type RootWithMeta = Root & { businessObject?: RootBusinessObject };

/**
 * diagram-js reads its zoom back rounded to three decimals: a fit below 0.0005 would read back as
 * zoom 0 and a NaN viewbox.
 */
const SMALLEST_FIT_ZOOM = 0.001;

/** Services of the Modeler that hold an edit in progress; the viewers have none of them. */
interface ContextPadPrompt {
  cancelPrompt(): void;
}

function sizeToCss(value: number | string): string {
  return typeof value === "number" ? `${value}px` : value;
}

export abstract class CmBaseViewer {
  protected abstract _getModules(): ModuleDeclaration[];

  private _diagram: Diagram | undefined;
  private readonly _container: HTMLElement;
  private readonly _options: CmViewerOptions;

  constructor(options: CmViewerOptions = {}) {
    this._options = options;
    this._container = this._createContainer(options);
  }

  private _createContainer(options: CmViewerOptions): HTMLElement {
    const container = options.container ?? document.createElement("div");
    container.classList.add("cm-djs-container");
    container.style.width = sizeToCss(options.width ?? "100%");
    container.style.height = sizeToCss(options.height ?? (options.container ? "100%" : "600px"));
    return container;
  }

  private _ensureDiagram(): Diagram {
    if (!this._diagram) {
      const modules = [...this._getModules(), ...(this._options.additionalModules ?? [])];
      this._diagram = new Diagram({
        canvas: { container: this._container },
        modules,
        cmKeyboard: { undoRedoKeys: this._options.undoRedoKeys ?? true },
        cmPalette: { freeArea: this._options.freeArea },
      });
    }
    return this._diagram;
  }

  /** Resolve a diagram-js service from the didi injector. */
  get<T>(name: string): T {
    return this._ensureDiagram().get<T>(name);
  }

  /** A service only some of the viewers have (the Modeler's editing services), else null. */
  private _optional<T>(name: string): T | null {
    return this._ensureDiagram().get<T>(name, false);
  }

  on<T = unknown>(event: string, callback: EventCallback<T>, priority = 1000): void {
    this.get<EventBus>("eventBus").on(event, priority, callback as EventCallback);
  }

  off(event: string, callback: EventCallback): void {
    this.get<EventBus>("eventBus").off(event, callback);
  }

  /**
   * Load a document into the canvas (replaces existing content). Silent: the previous document's
   * undo history goes without a `commandStack.changed`, so a host that saves on every change does
   * not write the import back. Throws before anything changes when the document cannot be drawn.
   * A gesture that runs ends first, as on Escape, and an armed palette tool stays armed
   * (`CmGestureCancel`).
   */
  importDocument(doc: CmDocument): { warnings: ImportWarning[] } {
    const diagram = this._ensureDiagram();
    const eventBus = diagram.get<EventBus>("eventBus");
    const importer = diagram.get<CmImporter>("cmImporter");
    importer.assertImportable(doc);
    this._optional<CmGestureCancel>("cmGestureCancel")?.cancelForImport();
    const labelEditing = this._optional<CmLabelEditing>("cmLabelEditing");
    // An edit in progress belongs to an element the import is about to replace: a commit after it
    // (Enter, blur) would land on a removed shape.
    labelEditing?.suspend();
    this._optional<ContextPadPrompt>("cmContextPadProvider")?.cancelPrompt();
    this._optional<PopupMenu>("popupMenu")?.close();
    importer.clear();
    const warnings = importer.import(doc);
    // The previous document's history would undo onto elements that are gone (or, by id
    // coincidence, onto re-imported ones). Only the editors have a command stack.
    this._optional<CommandStack>("commandStack")?.clear(false);
    if (this._options.fitOnImport ?? true) this._fit();
    eventBus.fire("import.done", { warnings });
    labelEditing?.resumeAfterImport();
    return { warnings };
  }

  /**
   * Load the text of a `.cm`/`.cm.json` file. Throws (and changes nothing) when the text is no
   * importable document.
   */
  importText(text: string): { warnings: ImportWarning[] } {
    const parsed = parseDocumentText(text);
    if (!parsed.ok) throw new Error(parsed.error);
    return this.importDocument(parsed.document);
  }

  /** Current canvas state as a canonical document. */
  exportDocument(): CmDocument {
    return this.get<CmExporter>("cmExporter").export();
  }

  /** Current canvas state as the canonical file text (ends in one line break). */
  exportText(): string {
    return serializeDocumentText(this.exportDocument());
  }

  /**
   * Update diagram-level metadata on the root. In an editor a title change is an undoable command
   * (`cmModeling.setTitle`); a viewer has no history and writes it directly. A locked editor
   * (`cmReadOnly`) changes nothing: its host takes no edits, and the next import would silently
   * revert the title.
   */
  setMeta(partial: Partial<RootBusinessObject>): void {
    if (partial.title === undefined) return;
    if (this._optional<CmReadOnly>("cmReadOnly")?.isReadOnly()) return;
    const root = this._documentRoot();
    if (!root?.businessObject || root.businessObject.title === partial.title) return;
    const modeling = this._optional<CmModeling>("cmModeling");
    if (modeling) modeling.setTitle(partial.title);
    else root.businessObject = { ...root.businessObject, title: partial.title };
  }

  /** Read diagram-level metadata from the root; undefined before the first import. */
  getMeta(): RootBusinessObject | undefined {
    return this._documentRoot()?.businessObject;
  }

  /** Through the registry: asking the canvas would create an implicit root before an import. */
  private _documentRoot(): RootWithMeta | undefined {
    return this.get<ElementRegistry>("elementRegistry").get(ROOT_ID) as RootWithMeta | undefined;
  }

  /** Standalone, self-contained SVG snapshot. */
  saveSVG(): { svg: string } {
    return saveSVG(this.get<Canvas>("canvas"), this.get<ElementRegistry>("elementRegistry"));
  }

  /**
   * The tight box around what the canvas draws of the map in diagram coordinates, with no margin
   * of its own: the box a host's chrome fits to (`@miragon/modeler-api` 1.3). It reads the live
   * canvas and ignores zoom and scroll; `undefined` while the map is empty.
   */
  contentBounds(): ElementBounds | undefined {
    // Before the first use and after destroy() there is no diagram, and asking for one would build
    // it on a detached container.
    if (!this._diagram) return undefined;
    return contentBoundsOf(this._diagram.get<ElementRegistry>("elementRegistry").getAll());
  }

  /**
   * Centres the content box in the container minus room for the chrome, at the largest zoom that
   * shows all of it and never above 100 % (guide §5.9); an empty map shows 100 %. The same view
   * for the same document and container (the contract's fitted view after an import). Without
   * `freeArea.insets` the room is the renderer's own palette margins: `freeArea.center` names no
   * rectangle to fit into.
   */
  private _fit(): void {
    const canvas = this.get<Canvas>("canvas");
    const { width, height } = canvas.getSize();
    if (!(width > 0 && height > 0)) return;
    const content = this.contentBounds();
    if (!content) {
      canvas.viewbox({ x: 0, y: 0, width, height });
      return;
    }
    const insets = freeAreaInsets(this._options.freeArea);
    const freeWidth = Math.max(width - insets.left - insets.right, 1);
    const freeHeight = Math.max(height - insets.top - insets.bottom, 1);
    const contentWidth = Math.max(content.width, 1);
    const contentHeight = Math.max(content.height, 1);
    const scale = Math.max(
      Math.min(freeWidth / contentWidth, freeHeight / contentHeight, 1),
      SMALLEST_FIT_ZOOM,
    );
    canvas.viewbox({
      x: content.x + contentWidth / 2 - (insets.left + freeWidth / 2) / scale,
      y: content.y + contentHeight / 2 - (insets.top + freeHeight / 2) / scale,
      width: width / scale,
      height: height / scale,
    });
  }

  /** Attach the container into `target`. */
  attachTo(target: HTMLElement): void {
    target.appendChild(this._container);
    this.get<Canvas>("canvas").resized();
  }

  /** Detach the container from the DOM, preserving state. */
  detach(): void {
    this._container.remove();
  }

  clear(): void {
    this._ensureDiagram().clear();
  }

  destroy(): void {
    if (this._diagram) {
      this._diagram.destroy();
      this._diagram = undefined;
    }
    this._container.remove();
  }

  get container(): HTMLElement {
    return this._container;
  }
}
