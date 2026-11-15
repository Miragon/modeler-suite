/**
 * The order of a board's nodes, back to front, as one string per node (`z`): a fractional index.
 * A node brought to the front or put between two others gets a key between theirs, without
 * touching any other node. Two people who put a node at the same place at the same time get
 * different elements with keys that still sort the same way everywhere: ties go by element id.
 */

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
const digitOf = (key: string, at: number, missing: number): number =>
  at < key.length ? DIGITS.indexOf(key.charAt(at)) : missing;

/**
 * A key strictly between `a` and `b` in plain string order. Without `a`: before `b`; without `b`:
 * after `a`; without both: a first key. Throws when `a` does not sort before `b`, or when no key
 * lies between them (a bound that ends in the lowest digit, which this function never produces).
 */
export function fractionalIndexBetween(a?: string, b?: string): string {
  const low = a ?? "";
  const high = b ?? "";
  if (high !== "" && low >= high) {
    throw new Error(`fractional index bounds out of order: '${low}' >= '${high}'`);
  }
  let result = "";
  for (let at = 0; ; at++) {
    if (high !== "" && at >= high.length) {
      throw new Error(`no key exists between '${low}' and '${high}'`);
    }
    const lowDigit = digitOf(low, at, 0);
    const highDigit = digitOf(high, at, DIGITS.length);
    // room for a digit between the two at this position
    if (highDigit - lowDigit > 1) {
      return result + DIGITS.charAt(Math.floor((lowDigit + highDigit) / 2));
    }
    result += DIGITS.charAt(lowDigit);
    if (highDigit - lowDigit === 1) return result + afterRest(low, at + 1);
  }
}

/**
 * The tail of a key that follows `low` from position `from` on and stays below everything that
 * starts with the next digit up: `low`'s own digits until one leaves room above it, then a digit
 * halfway up from there.
 */
function afterRest(low: string, from: number): string {
  for (let at = from; ; at++) {
    const digit = digitOf(low, at, 0);
    if (digit < DIGITS.length - 1) {
      return low.slice(from, at) + DIGITS.charAt(Math.floor((digit + DIGITS.length) / 2));
    }
  }
}
