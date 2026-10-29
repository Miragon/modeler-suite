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

function withinTolerance(first: Position, second: Position): boolean {
  return (
    Math.abs(first[0] - second[0]) <= POSITION_TOLERANCE_PX &&
    Math.abs(first[1] - second[1]) <= POSITION_TOLERANCE_PX
  );
}

/**
 * Whether every first position can take a second one within the tolerance, each used once. A sort
 * order cannot pair them: rounding can swap two shapes of nearly the same column, and then the
 * sorted lists put different shapes side by side.
 */
function pairsOneToOne(first: readonly Position[], second: readonly Position[]): boolean {
  const partnerOf = new Map<number, number>();
  const pair = (index: number, visited: Set<number>): boolean => {
    for (let candidate = 0; candidate < second.length; candidate++) {
      if (visited.has(candidate) || !withinTolerance(first[index]!, second[candidate]!)) continue;
      visited.add(candidate);
      const taken = partnerOf.get(candidate);
      if (taken === undefined || pair(taken, visited)) {
        partnerOf.set(candidate, index);
        return true;
      }
    }
    return false;
  };
  return first.every((_, index) => pair(index, new Set()));
}

/**
 * The same shapes and connections with every shape within two pixels of one of the other canvas's.
 * A canvas read after the edit holds the positions the gesture left, one read after the document
 * came back holds those of the saved text, and the text rounds.
 */
export function similarCanvas(a: CanvasFacts, b: CanvasFacts): boolean {
  if (a.shapes !== b.shapes || a.connections !== b.connections) return false;
  if (a.positions.length !== b.positions.length) return false;
  return pairsOneToOne(a.positions.map(positionOf), b.positions.map(positionOf));
}

/**
 * Whether a canvas shows the edit again: `similarCanvas` to the edited one, or exactly the same
 * where the edit moved no shape further than the tolerance, which would let a canvas without the
 * edit pass.
 */
export function showsEdit(
  original: CanvasFacts,
  edited: CanvasFacts,
): (facts: CanvasFacts) => boolean {
  const compare = similarCanvas(original, edited) ? sameCanvas : similarCanvas;
  return (facts) => compare(facts, edited);
}

export function describeCanvas(facts: CanvasFacts): string {
  return `${facts.shapes} shapes and ${facts.connections} connections`;
}
