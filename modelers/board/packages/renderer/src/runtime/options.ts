import type { ArmReturn, ArmZoom, ArmedZoom, Viewport } from "../arming/types.js";

/** How whoever mounts a board sets it up. A rule that is null takes the default (exact1, disarm, stay). */
export interface BoardOptions {
  /** the first view; null: React Flow's own first fit into the board's box */
  viewport: Viewport | null;
  /** the node armed on load, through the arm rules; the contract factory passes null */
  arm: string | null;
  armzoom: ArmZoom | null;
  armedzoom: ArmedZoom | null;
  armreturn: ArmReturn | null;
  /** ms the board takes to move; null: the design token, and 0 under prefers-reduced-motion */
  armmotion: number | null;
}
