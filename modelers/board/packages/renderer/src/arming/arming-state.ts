/**
 * What the parts of the arm rules at work (board-arming.ts) share: the variables of the one
 * function they were cut from, as the fields of one object.
 */
import type { ArmingHost, ArmTransition } from "./arming-api.js";
import type { Viewport } from "./types.js";

export interface Move {
  record: ArmTransition;
  started: number;
  /** what this move wrote last: the board standing anywhere else is someone else's doing */
  last: Viewport;
  frame: number;
  end(interrupted: boolean, record: ArmTransition): void;
}

export interface ArmingState {
  /** this module is writing the viewport: not a zoom to guard against */
  writing: boolean;
  move: Move | null;
  serial: number;
  records: ArmTransition[];
  /** armreturn=back: where the board stood before the arming of `nodeId` moved it */
  home: { nodeId: string; viewport: Viewport } | null;
  /** the arming a running move belongs to: a second request for the same node joins it */
  arming: { nodeId: string; settled: Promise<void> } | null;
  /** `&arm=<nodeId>` under a rule that may move the board: armed once the board and the node are measured */
  urlPending: boolean;
  /** a button is down on a press that began in the armed editor */
  pressHeld: boolean;
  /** the board's own element, while the guards are attached */
  boardElement: HTMLElement | null;
}

export function createArmingState(host: ArmingHost): ArmingState {
  const { params } = host;
  return {
    writing: false,
    move: null,
    serial: 0,
    records: [],
    home: null,
    arming: null,
    urlPending: params.arm !== null && host.isModel(params.arm) && host.armedId() !== params.arm,
    pressHeld: false,
    boardElement: null,
  };
}
