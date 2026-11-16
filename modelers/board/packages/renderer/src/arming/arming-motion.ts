/**
 * The move of the arm rules at work: how long it takes, where the board stands, one viewport
 * write, and the loop that is the move. board-arming.ts says why the loop is this code's own.
 */
import { parseDuration, parseEase, sameViewport, viewportBetween } from "./arm-rules.js";
import type { ArmingHost, ArmPolicy, ArmTransition, FlowStore } from "./arming-api.js";
import type { ArmingState, Move } from "./arming-state.js";
import type { ArmAnchor, Viewport } from "./types.js";

/** how long a move takes and how it eases: the design system's tokens, read off the page */
const MOTION_TOKEN = "--cd-motion-base";
const EASE_TOKEN = "--cd-ease";
/** transitions kept for hooks.transitions() */
const KEPT = 200;

export interface ArmMotion {
  motion(): Pick<ArmPolicy, "motion" | "motionFrom">;
  viewport(): Viewport;
  finish(interruptedBy?: string): void;
  run(
    purpose: ArmTransition["purpose"],
    nodeId: string,
    by: string,
    to: Viewport,
    end: Move["end"],
    anchor?: ArmAnchor,
  ): void;
}

export function createArmMotion(
  host: ArmingHost,
  flowStore: FlowStore,
  state: ArmingState,
): ArmMotion {
  const { params } = host;
  const counters = host.counters.arm;

  const token = (name: string): string =>
    getComputedStyle(document.documentElement).getPropertyValue(name);
  const motion = (): Pick<ArmPolicy, "motion" | "motionFrom"> => {
    if (params.armmotion !== null) return { motion: params.armmotion, motionFrom: "url" };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return { motion: 0, motionFrom: "reduced-motion" };
    // a page without the token moves at once: no duration of this module's own
    return { motion: parseDuration(token(MOTION_TOKEN)) ?? 0, motionFrom: "token" };
  };

  const viewport = (): Viewport => {
    const [x, y, zoom] = flowStore.getState().transform;
    return { x, y, zoom };
  };
  /** at once: React Flow applies a viewport without a duration inside the call */
  const write = (to: Viewport): void => {
    state.writing = true;
    try {
      void flowStore.getState().panZoom?.setViewport(to);
    } finally {
      state.writing = false;
    }
  };

  // ── the move ──

  /** ends the running move where the board stands; `interruptedBy` when it did not reach its target */
  const finish = (interruptedBy?: string): void => {
    const current = state.move;
    if (!current) return;
    state.move = null;
    cancelAnimationFrame(current.frame);
    const { record } = current;
    record.running = false;
    record.interrupted = interruptedBy !== undefined;
    if (interruptedBy !== undefined) record.interruptedBy = interruptedBy;
    record.end = viewport();
    record.measuredMs = performance.now() - current.started;
    current.end(record.interrupted, record);
  };

  const run = (
    purpose: ArmTransition["purpose"],
    nodeId: string,
    by: string,
    to: Viewport,
    end: Move["end"],
    anchor?: ArmAnchor,
  ): void => {
    const from = viewport();
    const askedMs = motion().motion;
    const record: ArmTransition = {
      id: ++state.serial,
      purpose,
      nodeId,
      by,
      ...(anchor ? { anchor } : {}),
      from,
      to,
      end: from,
      askedMs,
      measuredMs: 0,
      writes: 0,
      running: true,
      interrupted: false,
      armed: false,
    };
    state.records.push(record);
    if (state.records.length > KEPT) state.records.shift();
    counters.transitions++;
    const ease = parseEase(token(EASE_TOKEN));
    const current: Move = { record, started: performance.now(), last: from, frame: 0, end };
    state.move = current;
    const step = (): void => {
      if (state.move !== current) return;
      if (!sameViewport(viewport(), current.last)) {
        finish("foreign");
        return;
      }
      const t = askedMs > 0 ? (performance.now() - current.started) / askedMs : 1;
      write(t >= 1 ? to : viewportBetween(from, to, ease(t)));
      record.writes++;
      current.last = viewport();
      if (t >= 1) finish();
      else current.frame = requestAnimationFrame(step);
    };
    // 0 ms: one write, inside this call
    if (askedMs > 0) current.frame = requestAnimationFrame(step);
    else step();
  };

  return { motion, viewport, finish, run };
}
