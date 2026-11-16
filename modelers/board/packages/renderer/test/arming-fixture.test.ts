/**
 * The recorded traces of the arm rules as a file (browser/fixtures/arming-traces.json). The test
 * that holds the rules against them (browser/arming.browser.test.ts) imports the file and so
 * fails without it, but it runs in a browser. This one says the same in the project that runs on
 * every machine, and holds the file to the form `traceText` writes: with that, the browser
 * test's comparison with the imported value is a comparison of bytes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FIXTURE = new URL("./browser/fixtures/arming-traces.json", import.meta.url);
/** the scenarios of support/arming-scenarios.ts, which loads in a browser only */
const SCENARIOS = 73;
/** what `traceText` writes for every scenario */
const PARTS = ["policy", "starts", "steps", "rests", "counters", "transitions", "lastTransition"];

describe("the recorded traces of the arm rules", () => {
  // read by each test: a missing file fails both, by its name
  const read = (): string => readFileSync(FIXTURE, "utf8");

  it("are in the repository, one trace per scenario", () => {
    const traces = JSON.parse(read()) as Record<string, Record<string, unknown>>;
    expect(Object.keys(traces)).toHaveLength(SCENARIOS);
    for (const [name, trace] of Object.entries(traces)) {
      expect(Object.keys(trace), name).toEqual(expect.arrayContaining(PARTS));
      expect(trace.steps, name).not.toEqual([]);
    }
  });

  it("are written as traceText writes them: two spaces, one newline at the end", () => {
    const text = read();
    const asWritten = `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
    expect(text === asWritten, "arming-traces.json is not in the form traceText writes").toBe(true);
  });
});
