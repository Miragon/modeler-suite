import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type Dragging from 'diagram-js/lib/features/dragging/Dragging';
import { toPoint } from 'diagram-js/lib/util/Event';

/** Ahead of every other listener of the same event. */
const FIRST = 100_000;

const PAN_PREFIX = 'hand.move';

/**
 * The drags that hold no element of the diagram, so they are no gesture (contract 1.5,
 * `InteractionSurface`): a palette tool that only waits for its next press (the lasso, the hand)
 * and the pan of the hand tool, which Space held or Ctrl/Cmd and a press start as well. An import
 * leaves them running: the armed tool is still armed, and the pan goes on under the pointer. A
 * modeler that adds diagram-js's space tool or global connect tool adds their waiting drags
 * (`spaceTool.selection`, `global-connect`) here.
 */
const NO_GESTURE_PREFIXES: ReadonlySet<string> = new Set(['lasso.selection', 'hand', PAN_PREFIX]);

interface Point {
  x: number;
  y: number;
}

/** The fields of diagram-js's drag context this service reads. */
interface DragContext {
  prefix: string;
  active?: boolean;
  globalStart: Point;
  localStart: Point;
  payload: { originalEvent?: Event | null };
}

/** A drop being applied: from its `drag.end` until diagram-js cleans the drag up. */
interface Drop {
  context: DragContext;
  ended: Promise<void>;
  end(): void;
}

export type GestureListener = (active: boolean) => void;

/**
 * The user's gestures on the canvas: whether one runs (the contract's `interaction`), ending one
 * before an import replaces the elements it holds, and the drop an import has to wait for.
 *
 * A gesture starts when its drag moves past the threshold (diagram-js activates the drag, a
 * palette create at once) and ends with its drop or its cancel, when diagram-js cleans the drag
 * up: during the drop's own command, and so in the change listener a host imports from, it still
 * runs.
 */
export default class Gestures {
  static $inject = ['eventBus', 'dragging', 'canvas'];

  private gesture: DragContext | null = null;
  private drop: Drop | undefined;
  private readonly listeners = new Set<GestureListener>();

  constructor(
    eventBus: EventBus,
    private readonly dragging: Dragging,
    private readonly canvas: Canvas,
  ) {
    // The first `drag.move` comes right after diagram-js activated the drag, once no start
    // listener refused it (a refused start never sets the drag active).
    eventBus.on('drag.move', FIRST, () => this.noticeStart());
    eventBus.on('drag.end', FIRST, () => this.noticeDrop());
    // First, so a cleanup listener that throws can neither keep the gesture running nor hold
    // back the imports that wait for the drop.
    eventBus.on('drag.cleanup', FIRST, () => this.noticeEnd());
    eventBus.on('import.render.done', () => this.anchorPanToView());
    // Before diagram-js cancels a running drag on destroy: nothing is called after it.
    eventBus.on('diagram.destroy', FIRST, () => this.listeners.clear());
  }

  /** Whether a gesture runs: from its start until its drop or cancel. */
  isActive(): boolean {
    return this.gesture !== null;
  }

  /** Called with the new value each time `isActive()` changes; returns the unsubscribe. */
  onChange(listener: GestureListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Ends a running gesture the way Escape does, for an import that is about to replace the
   * elements it holds: diagram-js keeps a drag running across a cleared canvas, and its release
   * would apply a command to removed shapes and throw half-way. A press that has not reached the
   * drag threshold yet ends too. The selection is not restored, since it holds those elements as
   * well. A drag that is no gesture runs on, and so does a drop being applied: its command has
   * run, and a cancel from inside it would pull the drag out from under diagram-js's own end.
   */
  cancel(): void {
    const context = this.dragging.context() as DragContext | null;
    if (!context || NO_GESTURE_PREFIXES.has(context.prefix) || this.dropping(context)) return;
    this.dragging.cancel(false);
  }

  /**
   * While a drop is applied, a promise that resolves once it has ended; otherwise `undefined`. An
   * import waits for it, so no listener of the drop, synchronous or deferred, finds its elements
   * replaced (diagram-js's own `SelectionBehavior` throws on a moved shape the import removed).
   * The promise resolves when the drag is cleaned up, so whatever waits for it runs once the
   * drop's task is over, after `drag.ended` or `drag.canceled`.
   */
  dropEnded(): Promise<void> | undefined {
    const drop = this.drop;
    return drop && this.dropping(drop.context) ? drop.ended : undefined;
  }

  /**
   * Told apart by its drag, not by a flag: a drop whose cleanup throws keeps diagram-js from
   * announcing its end, and a flag left set would hold every later import.
   */
  private dropping(context: DragContext): boolean {
    return this.drop?.context === context && this.dragging.context() === context;
  }

  private noticeStart(): void {
    const context = this.dragging.context() as DragContext | null;
    if (this.gesture || !context?.active || NO_GESTURE_PREFIXES.has(context.prefix)) return;
    this.gesture = context;
    this.notify(true);
  }

  private noticeDrop(): void {
    const context = this.dragging.context() as DragContext | null;
    if (!context) return;
    let end = () => {};
    const ended = new Promise<void>((resolve) => (end = resolve));
    this.drop = { context, ended, end };
  }

  private noticeEnd(): void {
    const drop = this.drop;
    if (drop && this.dropping(drop.context)) drop.end();
    if (!this.gesture) return;
    this.gesture = null;
    this.notify(false);
  }

  /** A listener that throws is reported, never left to break the drag it runs inside. */
  private notify(active: boolean): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(active);
      } catch (error) {
        reportError(error);
      }
    }
  }

  /**
   * A pan keeps the diagram point it started on under the pointer, so its next move would put the
   * view from before an import back, undoing the import's fit. It starts again from the diagram
   * point that now lies under the pointer.
   */
  private anchorPanToView(): void {
    const pan = this.dragging.context() as DragContext | null;
    if (pan?.prefix !== PAN_PREFIX) return;
    const lastMove = pan.active ? pan.payload.originalEvent : undefined;
    const pointer: Point = (lastMove && toPoint(lastMove)) || pan.globalStart;
    const viewbox = this.canvas.viewbox();
    const container = this.canvas.getContainer().getBoundingClientRect();
    pan.localStart = {
      x: viewbox.x + (pointer.x - container.left) / viewbox.scale,
      y: viewbox.y + (pointer.y - container.top) / viewbox.scale,
    };
  }
}
