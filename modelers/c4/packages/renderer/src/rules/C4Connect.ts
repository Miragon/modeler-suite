import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import { EDIT_REFUSED_EVENT } from "../services.js";
import type C4Rules from "./C4Rules.js";

/** The source of a running connect, outlined like a selection (guide §10.4). */
export const CONNECT_SOURCE_MARKER = "c4-connect-source";

/** After diagram-js's Connect has asked the rules (1000), before ConnectPreview marks the hover (900). */
const AFTER_THE_RULES = 950;
/** Ahead of diagram-js's Connect, whose end listener stops the event on a refused target. */
const BEFORE_THE_CONNECT = 1500;

interface ConnectContext {
  start?: Shape;
  hover?: Element | null;
  source?: Element | null;
  target?: Element | null;
  canExecute?: unknown;
}

interface OutlineService {
  createOutline(element: Element): unknown;
}

interface ConnectEvent {
  context: ConnectContext;
  hover?: Element;
}

/**
 * The C4 side of diagram-js's connect: it marks the source while the gesture runs, keeps the
 * direction the user drew, and says why a drop on a refused target connects nothing.
 */
export default class C4Connect {
  static $inject = ["eventBus", "canvas", "c4Rules", "injector"];

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly rules: C4Rules,
    injector: Injector,
  ) {
    eventBus.on("connect.start", ({ context }: ConnectEvent) => {
      if (!context.start) return;
      // diagram-js creates an outline on the first hover or selection only, and a connect from
      // the keyboard or the API has had neither.
      injector.get<OutlineService>("outline", false)?.createOutline(context.start);
      this.canvas.addMarker(context.start, CONNECT_SOURCE_MARKER);
    });
    eventBus.on("connect.cleanup", ({ context }: ConnectEvent) => {
      if (context.start) this.canvas.removeMarker(context.start, CONNECT_SOURCE_MARKER);
    });
    // diagram-js tries the reverse direction once the drawn one is refused; a C4 relationship is
    // directed, so a refused A -> B must never write B -> A.
    eventBus.on("connect.hover", AFTER_THE_RULES, ({ context, hover }: ConnectEvent) => {
      if (hover && hover !== context.start && context.source === hover) {
        context.canExecute = false;
        context.source = null;
        context.target = null;
      }
    });
    eventBus.on("connect.end", BEFORE_THE_CONNECT, ({ context }: ConnectEvent) => {
      if (context.canExecute || !context.start || !context.hover) return;
      const refusal = this.rules.connectRefusal(context.start, context.hover);
      if (refusal) eventBus.fire(EDIT_REFUSED_EVENT, refusal);
    });
  }
}
