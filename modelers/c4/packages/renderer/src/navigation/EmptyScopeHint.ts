import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Overlays from "diagram-js/lib/features/overlays/Overlays";
import type { Element } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import type { ViewEntry } from "@miragon/c4-schema-model";
import type DocumentStore from "../document/DocumentStore.js";
import type { C4Engine } from "../engine/C4Engine.js";
import { READ_ONLY_CHANGED_EVENT } from "../read-only/ReadOnly.js";
import { boundaryCanvasId } from "../reconcile/Reconciler.js";
import { TEXT_REBASED_EVENT, VIEW_CHANGED_EVENT, type C4Views } from "../services.js";
import { BOUNDARY_CAPTION } from "../text/typography.js";
import "./emptyScopeHint.css";

export const EMPTY_SCOPE_HINT_CLASS = "c4-empty-scope-hint";
const OVERLAY_TYPE = "c4-empty-scope-hint";

const UPDATE_EVENTS = [
  "import.done",
  VIEW_CHANGED_EVENT,
  "commandStack.changed",
  TEXT_REBASED_EVENT,
  READ_ONLY_CHANGED_EVENT,
];

/** What a container or component view lacks, by the kind the palette adds there. */
const LACKING: Partial<Record<ViewEntry["type"], string>> = {
  container: "No containers yet",
  component: "No components yet",
};

export const EMPTY_SCOPE_HINT_ACTION = "Add one from the palette.";

interface EditLock {
  isReadOnly(): boolean;
}

/**
 * A quiet hint inside the scope's frame of a container or component view that shows nothing of
 * it yet, as a drill-down into a system without containers lands: a frame alone does not say what
 * to do next. It is a diagram-js overlay, HTML above the canvas `<svg>`, so no export draws it; it
 * takes no pointer, so a palette create drops through it, and it hides while one is dragged.
 */
export default class EmptyScopeHint {
  static $inject = ["eventBus", "canvas", "overlays", "elementRegistry", "injector"];

  private shown: string | undefined;
  private overlayId: string | undefined;
  private html: HTMLElement | undefined;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly overlays: Overlays,
    private readonly elementRegistry: ElementRegistry,
    private readonly injector: Injector,
  ) {
    eventBus.on(UPDATE_EVENTS, () => this.update());
    eventBus.on("create.start", () => this.setDragging(true));
    eventBus.on("create.cleanup", () => this.setDragging(false));
    eventBus.on(["diagram.clear", "diagram.destroy"], () => this.remove());
  }

  /** The hint's text where it shows, else undefined. */
  text(): string | undefined {
    return this.html?.textContent ?? undefined;
  }

  update(): void {
    const target = this.target();
    const signature = target && JSON.stringify(target);
    if (signature === this.shown) return;
    this.remove();
    if (!target) return;
    const shape = this.elementRegistry.get(target.canvasId) as Element | undefined;
    if (!shape) return;
    const owner = this.canvas.getContainer().ownerDocument;
    const html = owner.createElement("div");
    html.className = EMPTY_SCOPE_HINT_CLASS;
    html.style.width = `${target.width}px`;
    html.style.height = `${target.height}px`;
    const title = owner.createElement("p");
    title.className = `${EMPTY_SCOPE_HINT_CLASS}-title`;
    title.textContent = target.lacking;
    const action = owner.createElement("p");
    action.className = `${EMPTY_SCOPE_HINT_CLASS}-action`;
    action.textContent = EMPTY_SCOPE_HINT_ACTION;
    html.append(title, action);
    this.overlayId = this.overlays.add(shape, OVERLAY_TYPE, {
      position: { top: 0, left: 0 },
      html,
    });
    this.html = html;
    this.shown = signature;
  }

  private target():
    { canvasId: string; lacking: string; width: number; height: number } | undefined {
    if (this.injector.get<EditLock>("readOnly", false)?.isReadOnly()) return undefined;
    const views = this.injector.get<C4Views>("c4Views");
    const view = views.active();
    const lacking = LACKING[view.type];
    if (!view.editable || view.scopeId === undefined || lacking === undefined) return undefined;
    const { workspace } = this.injector.get<DocumentStore>("c4Document").current().parse;
    const members = this.injector.get<C4Engine>("c4Engine").members(workspace, view);
    const scope = members.boundaries.find((boundary) => boundary.elementId === view.scopeId);
    const holdsAnything =
      scope === undefined ||
      scope.members.length > 0 ||
      members.boundaries.some((boundary) => boundary.parentId === view.scopeId);
    if (holdsAnything) return undefined;
    const canvasId = boundaryCanvasId(view.scopeId);
    const shape = this.elementRegistry.get(canvasId) as
      { width: number; height: number } | undefined;
    if (!shape) return undefined;
    return {
      canvasId,
      lacking,
      width: shape.width,
      height: Math.max(0, shape.height - BOUNDARY_CAPTION.band),
    };
  }

  private setDragging(dragging: boolean): void {
    this.html?.toggleAttribute("data-dragging", dragging);
  }

  private remove(): void {
    if (this.overlayId !== undefined) this.overlays.remove(this.overlayId);
    this.overlayId = undefined;
    this.html = undefined;
    this.shown = undefined;
  }
}
