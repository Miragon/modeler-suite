import type { ModuleDeclaration } from "didi";
import SnappingModule from "diagram-js/lib/features/snapping";
import CreateMoveSnapping from "diagram-js/lib/features/snapping/CreateMoveSnapping";
import ResizeSnapping from "diagram-js/lib/features/snapping/ResizeSnapping";
import { isBoundaryShape } from "../scene/types.js";

type SnapTargets = ReturnType<CreateMoveSnapping["getSnapTargets"]>;

/**
 * A boundary is a frame derived from its members (SPEC 4.3): it moves when they move, so its centre
 * and edges are no line to align an element with, least of all while the element is one of them.
 */
function withoutBoundaries(targets: SnapTargets): SnapTargets {
  return targets.filter((target) => !isBoundaryShape(target));
}

/** diagram-js's snapping of a move or create to the centres of the other elements. */
export class C4CreateMoveSnapping extends CreateMoveSnapping {
  override getSnapTargets(shape: unknown, target: unknown): SnapTargets {
    return withoutBoundaries(super.getSnapTargets(shape, target));
  }
}

/** diagram-js's snapping of a resized side to the sides of the other elements. */
export class C4ResizeSnapping extends ResizeSnapping {
  override getSnapTargets(shape: unknown, target: unknown): SnapTargets {
    return withoutBoundaries(super.getSnapTargets(shape, target));
  }
}

/** Value Chain's snapping with snap lines (`--cd-ui-kontur`, cd-canvas.css), without a grid. */
export const snappingModule: ModuleDeclaration = {
  __depends__: [SnappingModule],
  createMoveSnapping: ["type", C4CreateMoveSnapping],
  resizeSnapping: ["type", C4ResizeSnapping],
};
