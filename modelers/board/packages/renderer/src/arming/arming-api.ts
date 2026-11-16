/**
 * What the arm rules at work share with the rest of the board: the records they keep (the policy
 * of a node, a move of the board, the counters, the state) and the two sides of the arming
 * module, what it needs and what it offers. Types only.
 */
import type { Point } from "@miragon/board-schema-model";
import type { ReactFlowState } from "@xyflow/react";
import type { BoardOptions } from "../runtime/options.js";
import type { ArmAnchor, ArmReturn, ArmZoom, ArmedZoom, Viewport } from "./types.js";

/** the rules in effect for one node */
export interface ArmPolicy {
  armzoom: ArmZoom;
  armedzoom: ArmedZoom;
  armreturn: ArmReturn;
  /** which of the three whoever mounted the board gave; the others are the default */
  fromUrl: Array<"armzoom" | "armedzoom" | "armreturn">;
  /** ms a transition takes right now */
  motion: number;
  /** where `motion` comes from: `&armmotion=`, else prefers-reduced-motion (0), else the design token */
  motionFrom: "url" | "reduced-motion" | "token";
  /** px between the armed node and the edge of the box it is brought into */
  margin: number;
  /** a board zoom this close to 1 is taken for 1 */
  tolerance: number;
}

/** one move of the board made by the arm rules */
export interface ArmTransition {
  /** counts from 1 */
  id: number;
  /** arm: the board moves, then the node is armed. return: the board goes back after a disarm (armreturn=back) */
  purpose: "arm" | "return";
  /** the node the move belongs to */
  nodeId: string;
  /** what asked for it: pointer, button, hook or url for an arming; done, pane or hook for a return */
  by: string;
  /** purpose arm: the kind of anchor the node was placed by, for every move of that arming (the first and a second look) */
  anchor?: ArmAnchor | undefined;
  from: Viewport;
  to: Viewport;
  /** where the board stood when the move ended: `to`, unless it was interrupted */
  end: Viewport;
  /** the duration asked for, ms (0: one write, at once) */
  askedMs: number;
  /** from the start to the last write or to the interruption, ms */
  measuredMs: number;
  /** viewport writes made */
  writes: number;
  running: boolean;
  interrupted: boolean;
  /** wheel, pointer, key, arm (another arming), disarm, foreign (something else moved the board) or gone (the node is no more) */
  interruptedBy?: string | undefined;
  /** purpose arm, not interrupted: the node was armed right after the last write */
  armed: boolean;
}

export interface ArmCounters {
  /** moves of the board the arm rules started */
  transitions: number;
  /** armedzoom=disarm, a zoom seen coming (wheel, pinch, the toolbar): the node was a preview BEFORE the first zoom tick */
  disarmsBeforeZoom: number;
  /** armedzoom=disarm, a zoom not seen coming (a script's setViewport): the node was disarmed inside the first tick */
  disarmsAtTick: number;
  /** zooms the board refused: armedzoom=lock, or a press held in the armed editor under disarm */
  zoomsRefused: number;
  /** of zoomsRefused: zooms that were not seen coming and were undone inside their first tick */
  zoomsUndone: number;
  /** zoom ticks that passed while a node stayed armed: every tick under free, none under disarm and lock */
  armedZoomTicks: number;
  /** a disarm that had to be synchronous and was not through in the DOM when the zoom went on: 0 */
  lateDisarms: number;
}

export interface ArmState {
  /** the node that is armed, as the board's runtime has it */
  armed: string | null;
  /** a transition of the arm rules runs */
  moving: boolean;
  /** the node the running transition will arm */
  target: string | null;
  /** `&arm=<nodeId>` has not been through the rule yet */
  urlPending: boolean;
}

/** what asked: an arming (pointer, button, hook, url) or a disarm (done, pane, hook, other) */
export interface ArmBy {
  source: "pointer" | "button" | "hook" | "url" | "done" | "pane" | "other";
  /**
   * A pointer gesture armed the node: where, in client px. The zoom changes about that point, and
   * a node longer than the board's box keeps it under the pointer. Without it the anchor is the
   * node's centre, and such a node starts at the margin
   */
  point?: Point | undefined;
}

/** what the arm rules need of React Flow's store */
export interface FlowStore {
  getState(): ReactFlowState;
  subscribe(listener: (state: ReactFlowState, previous: ReactFlowState) => void): () => void;
}

/** what the arm rules need of the board's runtime; BoardRuntime fits it structurally */
export interface ArmingHost {
  readonly params: BoardOptions;
  isModel(nodeId: string): boolean;
  armedId(): string | null;
  /** the armed node as such, no rule: listeners run, React follows */
  setArmedId(nodeId: string | null): void;
  /** the surface's first import is through (true or false), undefined before */
  mounted(nodeId: string): boolean | undefined;
  readonly counters: { arm: ArmCounters };
  /** whose a key is while the board moves (BoardParts.inputScope) */
  readonly inputScope: "board" | "page";
}

export interface BoardArming {
  policy(nodeId: string): ArmPolicy;
  /** arms a model node, or none, through its rules; resolves when the board rests again (armed, or interrupted) */
  arm(nodeId: string | null, by?: ArmBy): Promise<void>;
  /**
   * The board's own controls are about to zoom (`changes`: the zoom will differ). True: go on, and
   * under `disarm` the armed node is a preview by now. False: refused (`lock`, a held press).
   */
  beforeZoom(changes: boolean): boolean;
  state(): ArmState;
  lastTransition(): ArmTransition | null;
  transitions(): ArmTransition[];
  whenRest(): Promise<void>;
  /** the viewport watch and the URL's arm; once, from the provider. Returns the undo */
  watch(): () => void;
  /** wheel, press and key listeners for the board's own element. Returns the undo */
  attach(container: HTMLElement): () => void;
}
