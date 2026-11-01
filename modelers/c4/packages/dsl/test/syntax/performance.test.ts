import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCst, printCst } from "../../src/syntax/index.js";

const ORDINARY = readFileSync(
  new URL("../fixtures/structurizr/big-bank-plc.dsl", import.meta.url),
  "utf8",
);

/**
 * How many times as long as an ordinary text of the same length a hostile one may take. Measured
 * against the same parser on the same machine, the guard holds on a CI runner several times slower
 * than the laptop it was measured on: there the slowest cases (10 000 unclosed blocks, closing
 * braces or nested blocks) take 10 to 14 times as long, up to 23 on slower cores.
 */
const MAX_SLOWDOWN = 60;

/** The vendored Big Bank plc example, repeated and cut to `length` characters. */
function ordinaryText(length: number): string {
  return ORDINARY.repeat(Math.ceil(length / ORDINARY.length)).slice(0, length);
}

function roundTrip(text: string): number {
  const started = performance.now();
  const printed = printCst(parseCst(text));
  const elapsed = performance.now() - started;
  expect(printed === text).toBe(true);
  return elapsed;
}

/**
 * The fastest of five round trips of `text` and of an ordinary text as long, in turns, so a
 * garbage collection, a cold JIT or a busy machine doesn't decide the verdict.
 */
function fastestRoundTrips(text: string): { readonly hostile: number; readonly ordinary: number } {
  const ordinary = ordinaryText(text.length);
  let fastest = { hostile: Number.POSITIVE_INFINITY, ordinary: Number.POSITIVE_INFINITY };
  for (let run = 0; run < 5; run += 1) {
    fastest = {
      hostile: Math.min(fastest.hostile, roundTrip(text)),
      ordinary: Math.min(fastest.ordinary, roundTrip(ordinary)),
    };
  }
  return fastest;
}

describe("linear time on hostile input (ReDoS guards)", () => {
  it.each([
    ["100 000 spaces", " ".repeat(100_000)],
    ["a statement with 100 000 spaces inside", `person${" ".repeat(100_000)}"A"`],
    ["10 000 quotes in a row", '"'.repeat(10_000)],
    ["10 000 escaped quotes", `person "${'\\"'.repeat(10_000)}`],
    ["10 000 quoted tokens", '"x" '.repeat(10_000)],
    ["10 000 text block markers on one line", '"""'.repeat(10_000)],
    ["a text block over 10 000 lines", `description """\n${"    line\n".repeat(10_000)}    """\n`],
    ["10 000 unclosed text block lines", `description """\n${'"\n'.repeat(10_000)}`],
    ["20 000 continued lines", "a \\\n".repeat(20_000)],
    ["10 000 nested blocks", `${"a {\n".repeat(10_000)}${"}\n".repeat(10_000)}`],
    ["10 000 unclosed blocks", "a {\n".repeat(10_000)],
    ["10 000 nested block comments", `${"/*\n".repeat(10_000)}${"*/\n".repeat(10_000)}`],
    ["10 000 substitutions", "${A".repeat(10_000)],
    ["10 000 closing braces", "}\n".repeat(10_000)],
  ])(
    `reads %s in at most ${MAX_SLOWDOWN} times the time of an ordinary text as long`,
    (_name, text) => {
      const { hostile, ordinary } = fastestRoundTrips(text);
      expect(
        hostile / ordinary,
        `${hostile.toFixed(1)} ms against ${ordinary.toFixed(1)} ms for an ordinary text`,
      ).toBeLessThan(MAX_SLOWDOWN);
    },
    60_000,
  );
});
