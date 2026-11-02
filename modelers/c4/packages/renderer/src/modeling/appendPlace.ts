import type { Box, ElementId, Point } from "@miragon/c4-schema-model";
import type { Scene } from "../scene/types.js";
import { centreOf } from "./geometry.js";

/** Half the layout's 8-unit grid: the most a slot beside a neighbour lies off its axis. */
const OFF_AXIS = 4;

/**
 * The centre of `placed` moved onto the axis of `source` beside which the layout put it: its grid
 * leaves a box up to 4 units off (a person's half height of 108 is not on it), and the line
 * between the two would run slanted. Undefined when it is on the axis already or not beside it.
 */
export function centreOnSourceAxis(placed: Box, source: Box): Point | undefined {
  const centre = centreOf(placed);
  const axis = centreOf(source);
  const sharesRow = placed.y < source.y + source.height && source.y < placed.y + placed.height;
  const sharesColumn = placed.x < source.x + source.width && source.x < placed.x + placed.width;
  const offY = axis.y - centre.y;
  const offX = axis.x - centre.x;
  if (sharesRow && offY !== 0 && Math.abs(offY) <= OFF_AXIS) return { x: centre.x, y: axis.y };
  if (sharesColumn && offX !== 0 && Math.abs(offX) <= OFF_AXIS) return { x: axis.x, y: centre.y };
  return undefined;
}

/**
 * Whether no boundary or group frame of `after` reaches an element or a frame that it did not reach
 * in `before`: the layout lets a placed box grow its frames only so far. `appended` holds the new
 * element's identifier in either scene, which its own frames hold in both.
 */
export function reachesNothingNew(
  before: Scene,
  after: Scene,
  appended: readonly ElementId[],
): boolean {
  const framesBefore = framesOf(before);
  const framesAfter = framesOf(after);
  for (const [key, frame] of framesAfter) {
    const earlier = framesBefore.get(key);
    if (!earlier) return false;
    const reachedBefore = reachOf(key, earlier, before, framesBefore, appended);
    for (const reached of reachOf(key, frame, after, framesAfter, appended)) {
      if (!reachedBefore.has(reached)) return false;
    }
  }
  return true;
}

function framesOf(scene: Scene): Map<string, Box> {
  const frames = new Map<string, Box>();
  for (const boundary of scene.boundaries) frames.set(`boundary ${boundary.id}`, boundary.box);
  for (const group of scene.groups) frames.set(`group ${group.key}`, group.box);
  return frames;
}

function reachOf(
  key: string,
  frame: Box,
  scene: Scene,
  frames: ReadonlyMap<string, Box>,
  appended: readonly ElementId[],
): Set<string> {
  const reached = new Set<string>();
  for (const [id, box] of scene.boxes) {
    if (!appended.includes(id) && overlaps(frame, box)) reached.add(`element ${id}`);
  }
  for (const [other, box] of frames) {
    if (other !== key && overlaps(frame, box)) reached.add(other);
  }
  return reached;
}

function overlaps(first: Box, second: Box): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}
