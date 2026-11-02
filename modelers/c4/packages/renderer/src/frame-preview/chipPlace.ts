import type { Box, Point, Size } from "@miragon/c4-schema-model";

/** What a warning chip keeps clear of, in diagram units. */
export interface ChipSurroundings {
  /** The host's chrome over the canvas (the breadcrumb, the shell's islands), grown by a gap. */
  readonly chrome: readonly Box[];
  /** The part of the canvas that shows. */
  readonly visible: Box;
}

export interface ChipFrame {
  readonly box: Box;
  /** A boundary's caption sits at its bottom, so the chip may go just inside its top edge. */
  readonly roomInside: boolean;
}

/**
 * The top left of a frame's warning chip: above the frame's top left, else slid right along the
 * top past the chrome over it, else below the frame, else just inside its top edge, each as far
 * right as the frame reaches (a chip wider than its frame may only stand at the frame's left);
 * the first spot that shows and that no chrome covers, since HTML chrome draws over the canvas.
 * Without surroundings, or where no spot is clear, above the top left.
 */
export function chipPlace(
  frame: ChipFrame,
  size: Size,
  offset: number,
  surroundings: ChipSurroundings | undefined,
): Point {
  const { box } = frame;
  const above = { x: box.x, y: box.y - size.height - offset };
  if (!surroundings) return above;
  const rows = [
    { start: box.x, y: above.y },
    { start: box.x, y: box.y + box.height + offset },
    ...(frame.roomInside ? [{ start: box.x + offset, y: box.y + offset }] : []),
  ];
  for (const row of rows) {
    const spot = clearSpotInRow(row.start, row.y, box.x + box.width, size, surroundings);
    if (spot) return spot;
  }
  return above;
}

function clearSpotInRow(
  start: number,
  y: number,
  end: number,
  size: Size,
  { chrome, visible }: ChipSurroundings,
): Point | undefined {
  if (y < visible.y || y + size.height > visible.y + visible.height) return undefined;
  const limit = Math.min(Math.max(end, start + size.width), visible.x + visible.width);
  let x = Math.max(start, visible.x);
  for (let step = 0; step <= chrome.length; step++) {
    if (x + size.width > limit) return undefined;
    const chip = { x, y, ...size };
    const covering = chrome.filter((box) => overlaps(chip, box));
    if (covering.length === 0) return { x, y };
    x = Math.max(...covering.map((box) => box.x + box.width));
  }
  return undefined;
}

function overlaps(first: Box, second: Box): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}
