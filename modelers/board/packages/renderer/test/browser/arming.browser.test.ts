/**
 * The arm rules at work, scenario by scenario (test/support/arming-scenarios.ts). Two checks per
 * scenario that do not lean on each other: what the scenario claims, written by hand beside its
 * script, and its whole trace against the text recorded while `createBoardArming` was one
 * function. The first says the rules do what the scenario's name says; the second says a split
 * of the function changed nothing else either.
 */
import { describe, expect, it } from "vitest";

import type { ArmCounters } from "../../src/arming/arming-api.js";
import {
  type Call,
  FIT_QUEUED,
  LATE_COMMIT,
  moveEnd,
  runScenario,
  type Scenario,
  SCENARIOS,
  type Trace,
  traceText,
} from "../support/arming-scenarios.js";

const NOTHING_COUNTED: ArmCounters = {
  transitions: 0,
  disarmsBeforeZoom: 0,
  disarmsAtTick: 0,
  zoomsRefused: 0,
  zoomsUndone: 0,
  armedZoomTicks: 0,
  lateDisarms: 0,
};

/** a scenario swaps the page's clock, so each runs once and never beside another */
const recorded = new Map<string, Promise<Trace>>();
function traceOf(scenario: Scenario): Promise<Trace> {
  const known = recorded.get(scenario.name);
  if (known) return known;
  const trace = runScenario(scenario);
  recorded.set(scenario.name, trace);
  return trace;
}

function expectTheClaim(scenario: Scenario, trace: Trace): void {
  const { expected } = scenario;
  expect(trace.steps.at(-1)?.state.armed ?? null).toBe(expected.armed);
  expect(trace.transitions.map(moveEnd)).toEqual(expected.moves);
  expect(trace.counters).toEqual({
    ...NOTHING_COUNTED,
    transitions: expected.moves.length,
    ...expected.counted,
  });
  if (expected.rests) expect(trace.rests).toEqual(expected.rests);
}

const sameCall = (a: Call | undefined, b: Call): boolean => JSON.stringify(a) === JSON.stringify(b);

describe("the arm rules at work", () => {
  it("names every scenario once", () => {
    const names = SCENARIOS.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain(LATE_COMMIT.name);
  });

  describe.each(SCENARIOS)("$name", (scenario) => {
    it("does what the scenario claims", async () => {
      expectTheClaim(scenario, await traceOf(scenario));
    });

    it("arms no node while the board moves", async () => {
      const { steps } = await traceOf(scenario);
      expect(steps.length).toBeGreaterThan(0);
      const armedWhileMoving = steps
        .filter(({ state }) => state.moving && state.armed !== null)
        .map(({ step }) => step);
      // only where the script itself armed a node past the rules, and there it must show
      if (scenario.armsPastTheRules) expect(armedWhileMoving).not.toEqual([]);
      else expect(armedWhileMoving).toEqual([]);
    });

    it("arms a node in the same task as the last write of its move", async () => {
      const { steps, transitions } = await traceOf(scenario);
      for (const move of transitions.filter(({ armed }) => armed)) {
        const lastWrite: Call = { call: "setViewport", to: move.to };
        const arming: Call = { call: "setArmedId", nodeId: move.nodeId };
        const inOneStep = steps.some(({ calls }) =>
          calls.some((call, at) => sameCall(call, lastWrite) && sameCall(calls[at + 1], arming)),
        );
        expect(inOneStep, `move ${move.id}`).toBe(true);
      }
      // and the rules call nothing from a microtask after it
      expect(steps.flatMap(({ later }) => later)).toEqual([]);
    });

    it("hands out its last move as the last of its moves", async () => {
      const { transitions, lastTransition } = await traceOf(scenario);
      const last = transitions.at(-1) ?? null;
      expect(lastTransition && { ...lastTransition, measuredMs: 0 }).toEqual(last);
    });
  });

  it("counts a late disarm in no scenario but the one with a fit queued", async () => {
    const late: string[] = [];
    for (const scenario of SCENARIOS) {
      const { counters } = await traceOf(scenario);
      if (counters.lateDisarms !== 0) late.push(scenario.name);
    }
    expect(late).toEqual([FIT_QUEUED]);
  });

  it("would count one: a runtime that shows the disarm late is seen by the rules' look at the page", async () => {
    // without this the 0 above could be the bench's doing: a page on which nothing is ever armed
    const trace = await runScenario(LATE_COMMIT);
    expectTheClaim(LATE_COMMIT, trace);
    expect(trace.counters.lateDisarms).toBe(1);
  });

  it("keeps the records of the last 200 moves", async () => {
    const scenario = SCENARIOS.find(({ brief }) => brief);
    expect(scenario).toBeDefined();
    if (!scenario) return;
    const { transitions, counters } = await traceOf(scenario);
    expect(counters.transitions).toBe(201);
    expect(transitions.map(({ id }) => id)).toEqual(Array.from({ length: 200 }, (_, at) => at + 2));
  });

  it("leaves every trace as it was recorded from the one function", async () => {
    const traces: Trace[] = [];
    for (const scenario of SCENARIOS) traces.push(await traceOf(scenario));
    await expect(traceText(traces)).toMatchFileSnapshot("./fixtures/arming-traces.json");
  });
});
