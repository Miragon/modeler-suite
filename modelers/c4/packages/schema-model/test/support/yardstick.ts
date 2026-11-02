/**
 * A performance budget measured against the machine it runs on. A CI runner is several times
 * slower than a developer's laptop, so a budget in milliseconds either fails there or proves
 * nothing here. The yardstick sorts a seeded list of numbers: plain JavaScript that slows down with
 * the machine as the parser and the projection do, and leaves the heap almost as it found it, so it
 * doesn't slow the measured code when the two take turns. The fastest run of each counts.
 */

const VALUES = 100_000;

/** About 15 ms on an Apple M-series laptop. */
function yardstick(): number {
  let state = 1;
  const values = Array.from({ length: VALUES }, () => {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    return state;
  });
  values.sort((first, second) => first - second);
  return values[0] ?? 0;
}

/** How long `run` takes, in milliseconds. */
export function millisecondsOf(run: () => unknown): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

export interface RelativeCost {
  /** The fastest run of the measured code, in milliseconds. */
  readonly milliseconds: number;
  /** The fastest run of the yardstick, in milliseconds. */
  readonly yardstickMilliseconds: number;
  /** The measured code's cost in yardsticks: what a budget limits. */
  readonly yardsticks: number;
}

/**
 * The cost of `measure` in yardsticks. `measure` runs the code under test and returns the
 * milliseconds of the part it times (`millisecondsOf`); it and the yardstick run `warmUps` times
 * first, then `rounds` times in turns.
 */
export function costInYardsticks(
  measure: () => number,
  { warmUps = 3, rounds = 10 }: { readonly warmUps?: number; readonly rounds?: number } = {},
): RelativeCost {
  for (let warmUp = 0; warmUp < warmUps; warmUp++) {
    measure();
    yardstick();
  }
  let milliseconds = Number.POSITIVE_INFINITY;
  let yardstickMilliseconds = Number.POSITIVE_INFINITY;
  for (let round = 0; round < rounds; round++) {
    milliseconds = Math.min(milliseconds, measure());
    yardstickMilliseconds = Math.min(yardstickMilliseconds, millisecondsOf(yardstick));
  }
  return { milliseconds, yardstickMilliseconds, yardsticks: milliseconds / yardstickMilliseconds };
}

/** The measurement behind a verdict, for the message of a failed budget. */
export function describeCost(cost: RelativeCost): string {
  return `${cost.milliseconds.toFixed(1)} ms against a yardstick of ${cost.yardstickMilliseconds.toFixed(1)} ms`;
}
