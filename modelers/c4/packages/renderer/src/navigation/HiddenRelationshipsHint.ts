import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Injector } from "didi";
import { childElements, hiddenScopeRelationships } from "@miragon/c4-schema-model";
import type DocumentStore from "../document/DocumentStore.js";
import { INFO_NODES, LUCIDE_STROKE_WIDTH } from "../draw/lucide.js";
import type { C4Engine } from "../engine/C4Engine.js";
import { READ_ONLY_CHANGED_EVENT } from "../read-only/ReadOnly.js";
import { TEXT_REBASED_EVENT, VIEW_CHANGED_EVENT, type C4Views } from "../services.js";
import type Breadcrumbs from "./Breadcrumbs.js";
import { DIALOGS_CONNECTED_EVENT, type default as C4Dialogs } from "./C4Dialogs.js";
import "./hiddenRelationships.css";

export const HIDDEN_RELATIONSHIPS_CLASS = "c4-hidden-relationships";

const UPDATE_EVENTS = [
  "import.done",
  VIEW_CHANGED_EVENT,
  "commandStack.changed",
  TEXT_REBASED_EVENT,
  READ_ONLY_CHANGED_EVENT,
  DIALOGS_CONNECTED_EVENT,
];

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const ICON_SIZE = 16;

interface EditLock {
  isReadOnly(): boolean;
}

/** "1 relationship of Bookshop isn't shown here", "2 relationships of Bookshop aren't shown here". */
export function hiddenRelationshipsText(count: number, scopeName: string): string {
  return count === 1
    ? `1 relationship of ${scopeName} isn't shown here`
    : `${count} relationships of ${scopeName} aren't shown here`;
}

/**
 * A chip after the breadcrumb of a container or component view when relationships written on its
 * scope itself can't be drawn there (`hiddenScopeRelationships`) while the scope has a child to
 * assign them to: a line drawn on a system in the landscape vanishes a level down, and nothing
 * else says why. It opens the dialog that assigns
 * them to a container or component. A button, so Tab reaches it after the path; HTML in the
 * diagram's container, so no export draws it; on the free line, which the fit keeps clear.
 */
export default class HiddenRelationshipsHint {
  static $inject = ["eventBus", "canvas", "c4Breadcrumbs", "injector"];

  readonly element: HTMLButtonElement;
  private readonly label: HTMLSpanElement;
  private readonly count: HTMLSpanElement;
  private shown = "";

  constructor(
    eventBus: EventBus,
    canvas: Canvas,
    private readonly breadcrumbs: Breadcrumbs,
    private readonly injector: Injector,
  ) {
    const owner = canvas.getContainer().ownerDocument;
    this.element = owner.createElement("button");
    this.element.type = "button";
    this.element.className = HIDDEN_RELATIONSHIPS_CLASS;
    this.element.hidden = true;
    this.element.setAttribute("aria-haspopup", "dialog");
    this.label = owner.createElement("span");
    this.label.className = `${HIDDEN_RELATIONSHIPS_CLASS}-text`;
    this.count = owner.createElement("span");
    this.count.className = `${HIDDEN_RELATIONSHIPS_CLASS}-count`;
    this.count.setAttribute("aria-hidden", "true");
    this.element.append(icon(owner), this.label, this.count);
    this.element.addEventListener("click", () => {
      this.injector.get<C4Dialogs>("c4Dialogs", false)?.showHiddenRelationships();
    });
    breadcrumbs.setTrailing(this.element);
    eventBus.on(UPDATE_EVENTS, () => this.update());
    eventBus.on("diagram.destroy", () => {
      breadcrumbs.setTrailing(undefined);
      this.element.remove();
    });
  }

  /** The chip's words while it shows, else undefined. */
  text(): string | undefined {
    return this.element.hidden ? undefined : (this.label.textContent ?? undefined);
  }

  update(): void {
    const text = this.target();
    const signature = text ?? "";
    if (signature === this.shown) return;
    this.shown = signature;
    this.element.hidden = text === undefined;
    this.label.textContent = text ?? "";
    this.count.textContent = text === undefined ? "" : (/^\d+/.exec(text)?.[0] ?? "");
    // The compact chip shows only the count, so its name and tooltip carry the words.
    if (text === undefined) {
      this.element.removeAttribute("aria-label");
      this.element.removeAttribute("title");
    } else {
      this.element.setAttribute("aria-label", text);
      this.element.title = text;
    }
    this.breadcrumbs.relayout();
  }

  private target(): string | undefined {
    if (this.injector.get<EditLock>("readOnly", false)?.isReadOnly()) return undefined;
    if (!this.injector.get<C4Dialogs>("c4Dialogs", false)?.isConnected()) return undefined;
    const view = this.injector.get<C4Views>("c4Views").active();
    if (!view.editable || view.scopeId === undefined) return undefined;
    const { workspace } = this.injector.get<DocumentStore>("c4Document").current().parse;
    // With no child to assign them to, the chip would lead nowhere; the empty scope's own hint
    // says to add one first.
    if (childElements(workspace, view.scopeId).length === 0) return undefined;
    const members = this.injector.get<C4Engine>("c4Engine").members(workspace, view);
    const hidden = hiddenScopeRelationships(workspace, view, members);
    if (hidden.length === 0) return undefined;
    const scope = workspace.elements.find((element) => element.id === view.scopeId);
    return hiddenRelationshipsText(hidden.length, scope?.name ?? view.scopeId);
  }
}

function icon(owner: Document): SVGSVGElement {
  const svg = owner.createElementNS(SVG_NAMESPACE, "svg");
  for (const [name, value] of Object.entries({
    class: `${HIDDEN_RELATIONSHIPS_CLASS}-icon`,
    width: String(ICON_SIZE),
    height: String(ICON_SIZE),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": String(LUCIDE_STROKE_WIDTH),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  })) {
    svg.setAttribute(name, value);
  }
  for (const [tag, attributes] of INFO_NODES) {
    const node = owner.createElementNS(SVG_NAMESPACE, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    svg.append(node);
  }
  return svg;
}
