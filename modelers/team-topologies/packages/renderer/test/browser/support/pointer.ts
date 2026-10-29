import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { Shape } from "diagram-js/lib/model/Types";
import type { Modeler } from "@miragon/team-topologies-renderer";

export interface Point {
  x: number;
  y: number;
}

const PREVIEW_SELECTOR = ".djs-drag-group, .djs-dragger, .djs-resize-overlay, .djs-lasso-overlay";

/** The mouse as diagram-js sees it: presses on an element, then moves and releases on `document`. */
export class Pointer {
  constructor(private readonly diagram: Modeler) {}

  private client(point: Point): MouseEventInit {
    const canvas = this.diagram.get<Canvas>("canvas");
    const rect = canvas.getContainer().getBoundingClientRect();
    const viewbox = canvas.viewbox();
    return {
      clientX: rect.left + (point.x - viewbox.x) * viewbox.scale,
      clientY: rect.top + (point.y - viewbox.y) * viewbox.scale,
    };
  }

  graphics(id: string): SVGElement {
    const graphics = this.diagram.get<ElementRegistry>("elementRegistry").getGraphics(id);
    if (!graphics) throw new Error(`no graphics for ${id}`);
    return graphics;
  }

  private svg(): SVGSVGElement {
    return this.diagram
      .get<Canvas>("canvas")
      .getContainer()
      .querySelector<SVGSVGElement>(":scope > svg")!;
  }

  press(target: EventTarget, at: Point, init: MouseEventInit = {}): void {
    target.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, ...this.client(at), ...init }),
    );
  }

  /** A click on chrome outside the canvas, at the centre of `target`. */
  clickOn(target: HTMLElement): void {
    target.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1, ...centreOf(target) }),
    );
  }

  /** The pointer enters an element, or the canvas itself without an id. */
  enter(id?: string): void {
    const target = id ? this.graphics(id) : this.svg();
    target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  }

  moveTo(at: Point): void {
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, ...this.client(at) }));
  }

  /** Moves over chrome outside the canvas, `offset` px from the centre of `target`. */
  moveOver(target: HTMLElement, offset: { dx: number; dy: number }): void {
    const { clientX, clientY } = centreOf(target);
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: clientX + offset.dx,
        clientY: clientY + offset.dy,
      }),
    );
  }

  releaseAt(at: Point): void {
    this.svg().dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, cancelable: true, ...this.client(at) }),
    );
  }

  /** Releases over chrome outside the canvas, at the centre of `target`. */
  releaseOver(target: HTMLElement): void {
    target.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, cancelable: true, ...centreOf(target) }),
    );
  }

  /** Escape, which ends a running drag in diagram-js (on its keyup). */
  escape(): void {
    document.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Escape", bubbles: true, cancelable: true }),
    );
  }
}

export function centreOf(target: Element): { clientX: number; clientY: number } {
  const rect = target.getBoundingClientRect();
  return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
}

export function shape(diagram: Modeler, id: string): Shape {
  const element = diagram.get<ElementRegistry>("elementRegistry").get(id);
  if (!element) throw new Error(`the diagram has no ${id}`);
  return element as Shape;
}

export function middle(element: Shape): Point {
  return { x: element.x + element.width / 2, y: element.y + element.height / 2 };
}

export function paletteEntry(container: HTMLElement, action: string): HTMLElement {
  const entry = container.querySelector<HTMLElement>(
    `.djs-palette .entry[data-action="${action}"]`,
  );
  if (!entry) throw new Error(`the palette has no ${action} entry`);
  return entry;
}

/** A drag preview of diagram-js on the canvas: a moved shape, a resize frame or a lasso. */
export function previewOf(container: HTMLElement): Element | null {
  return container.querySelector(PREVIEW_SELECTOR);
}

/** The gestures the contract kit's `startGesture` holds (packages/api README, 1.5 and 1.6). */
export type GestureKind = "move" | "create" | "createOffCanvas";

export interface HeldGesture {
  /** Releases the pointer where the gesture's preview is. */
  drop(): void;
  /** Escape. */
  cancel(): void;
}

/**
 * Holds a gesture on the online-shop sample the way a user does: a move of `team_checkout` past
 * the drag threshold, a palette create with its preview over the canvas, or the same create with
 * the pointer still over the palette.
 */
export function holdGesture(diagram: Modeler, kind: GestureKind): HeldGesture {
  const pointer = new Pointer(diagram);
  const container = diagram.get<Canvas>("canvas").getContainer();
  if (kind === "move") {
    const start = middle(shape(diagram, "team_checkout"));
    const end = { x: start.x + 60, y: start.y + 30 };
    pointer.press(pointer.graphics("team_checkout"), start);
    pointer.enter();
    pointer.moveTo({ x: start.x + 20, y: start.y + 10 });
    pointer.moveTo(end);
    return { drop: () => pointer.releaseAt(end), cancel: () => pointer.escape() };
  }
  if (kind === "create") {
    const end = { x: 1120, y: 120 };
    pointer.clickOn(paletteEntry(container, "team.platform"));
    pointer.enter();
    pointer.moveTo({ x: end.x - 40, y: end.y });
    pointer.moveTo(end);
    return { drop: () => pointer.releaseAt(end), cancel: () => pointer.escape() };
  }
  const entry = paletteEntry(container, "team.stream-aligned");
  entry.dispatchEvent(
    new DragEvent("dragstart", { bubbles: true, cancelable: true, ...centreOf(entry) }),
  );
  pointer.moveOver(entry, { dx: 12, dy: 8 });
  return { drop: () => pointer.releaseOver(entry), cancel: () => pointer.escape() };
}
