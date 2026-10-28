import type { CanvasFacts } from "./webview.js";

/** The saved text rounds a position (Wardley Maps to three decimals of the plot), and the probe rounds it to whole pixels again. */
const POSITION_TOLERANCE_PX = 2;

export function sameCanvas(a: CanvasFacts, b: CanvasFacts): boolean {
  return (
    a.shapes === b.shapes &&
    a.connections === b.connections &&
    a.positions.join(";") === b.positions.join(";")
  );
}

type Position = readonly [x: number, y: number];

function positionOf(text: string): Position {
  const [x = "0", y = "0"] = text.split(",");
  return [Number(x), Number(y)];
}

function byPosition(first: Position, second: Position): number {
  return first[0] - second[0] || first[1] - second[1];
}

/**
 * The same shapes and connections with every shape within two pixels of the other canvas's. A canvas
 * read after the edit holds the positions the gesture left, one read after the document came back
 * holds those of the saved text, and the text rounds.
 */
export function similarCanvas(a: CanvasFacts, b: CanvasFacts): boolean {
  if (a.shapes !== b.shapes || a.connections !== b.connections) return false;
  const first = a.positions.map(positionOf).sort(byPosition);
  const second = b.positions.map(positionOf).sort(byPosition);
  return (
    first.length === second.length &&
    first.every(
      ([x, y], index) =>
        Math.abs(x - second[index]![0]) <= POSITION_TOLERANCE_PX &&
        Math.abs(y - second[index]![1]) <= POSITION_TOLERANCE_PX,
    )
  );
}

export function describeCanvas(facts: CanvasFacts): string {
  return `${facts.shapes} shapes and ${facts.connections} connections`;
}
