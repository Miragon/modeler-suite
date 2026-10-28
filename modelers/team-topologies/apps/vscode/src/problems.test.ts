import { describe, expect, it } from "vitest";
import {
  MAX_NESTING_DEPTH,
  serializeDocument,
  SAMPLE_DOCUMENT,
} from "@miragon/team-topologies-schema-model";
import { documentProblems } from "./problems";

const sample = serializeDocument(SAMPLE_DOCUMENT);

function at(text: string, fragment: string): number {
  const offset = text.indexOf(fragment);
  if (offset < 0) throw new Error(`"${fragment}" is not in the text`);
  return offset;
}

describe("documentProblems", () => {
  it("finds nothing in a valid diagram or a blank file", () => {
    expect(documentProblems(sample)).toEqual([]);
    expect(documentProblems("  \n")).toEqual([]);
  });

  it("points at the place where the JSON breaks", () => {
    const broken = sample.replace('"type": "platform",', '"type": "platform"');
    const [problem, ...rest] = documentProblems(broken);
    expect(rest).toEqual([]);
    expect(problem).toMatchObject({
      severity: "error",
      message: "Not valid JSON: expected a comma.",
    });
    expect(problem!.offset).toBeGreaterThan(at(broken, '"type": "platform"'));
  });

  it("points at the value the schema rejects, and at the object that lacks a field", () => {
    const wrongMode = sample.replace('"mode": "collaboration"', '"mode": "handover"');
    const [mode] = documentProblems(wrongMode);
    expect(mode).toMatchObject({ severity: "error", offset: at(wrongMode, '"handover"') });
    expect(mode!.message).toMatch(/^interactions\[\d\]\.mode: /);

    const withoutLabel = sample.replace('"label": "Fraud Detection",\n', "");
    const [label] = documentProblems(withoutLabel);
    expect(label).toMatchObject({ severity: "error", length: 1 });
    expect(withoutLabel[label!.offset]).toBe("{");
  });

  it("names every key of a path into the known fields", () => {
    const textX = sample.replace(/"x": (\d+)/, '"x": "$1"');
    const [problem, ...rest] = documentProblems(textX);
    expect(rest).toEqual([]);
    expect(problem).toMatchObject({
      severity: "error",
      message: "nodes[0].position.x: Invalid input: expected number, received string",
      offset: at(textX, '"x": "') + '"x": '.length,
    });
  });

  it("calls colliding ids errors", () => {
    const duplicate = sample.replace('"id": "team_fraud"', '"id": "team_checkout"');
    expect(documentProblems(duplicate).map((problem) => problem.severity)).toEqual(["error"]);
  });

  it("calls an id that names a built-in object property an error, at the id", () => {
    const builtIn = sample.replace('"id": "flow_main"', '"id": "constructor"');
    expect(documentProblems(builtIn)).toEqual([
      {
        severity: "error",
        message:
          'flows[0].id: "constructor" is reserved: it names a built-in property of JavaScript objects',
        offset: at(builtIn, '"constructor"'),
        length: '"constructor"'.length,
      },
    ]);
  });

  it("points at the interaction in the file after a legacy one the migration drops", () => {
    const legacyFirst = sample
      .replace('"version": 3', '"version": 1')
      .replace(
        '"interactions": [\n',
        '"interactions": [\n    { "id": "edge_1", "mode": "collaboration", "source": "a", "target": "b" },\n',
      );
    const wrongMode = legacyFirst.replace('"mode": "facilitating"', '"mode": "handover"');
    const [problem, ...rest] = documentProblems(wrongMode);
    expect(rest).toEqual([]);
    expect(problem).toMatchObject({ severity: "error", offset: at(wrongMode, '"handover"') });
  });

  it("calls an interaction without a size an error, at the interaction", () => {
    const withoutSize = sample.replace(
      /("id": "int_platform_fulfilment",[\s\S]*?),\n\s*"size": \{[^}]*\}/,
      "$1",
    );
    expect(withoutSize).not.toBe(sample);
    const [problem, ...rest] = documentProblems(withoutSize);
    expect(rest).toEqual([]);
    expect(problem).toMatchObject({ severity: "error", length: 1 });
    expect(problem!.message).toMatch(/^interactions\[\d\]\.size: /);
  });

  it("warns about a connector the diagram drops, at its attachedTo", () => {
    const dangling = sample.replace(
      '"attachedTo": "int_checkout_fraud"',
      '"attachedTo": "nowhere"',
    );
    expect(documentProblems(dangling)).toEqual([
      {
        severity: "warning",
        message:
          'Annotation "ann_fraud_handover" is attached to "nowhere", which is not in the diagram, so its connector is dropped.',
        offset: at(dangling, '"nowhere"'),
        length: '"nowhere"'.length,
      },
    ]);
  });

  const withVendorData = (data: string): string =>
    sample.replace("{\n", `{\n  "x-vendor": ${data},\n`);
  const arraysNestedLevelsDeep = (levels: number): string =>
    "[".repeat(levels) + "]".repeat(levels);

  const tooDeep = `objects and arrays may nest at most ${MAX_NESTING_DEPTH} levels deep`;

  it("points at the first level too deep, also in a file too deep for the tree parser", () => {
    for (const levels of [MAX_NESTING_DEPTH + 100, 10_000, 100_000]) {
      const deep = withVendorData(arraysNestedLevelsDeep(levels));
      const problems = documentProblems(deep);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatchObject({
        severity: "error",
        message: `x-vendor[0][0][0]…: ${tooDeep}`,
        offset: at(deep, "[") + MAX_NESTING_DEPTH - 1,
      });
    }
  });

  it("names the field a branch too deep starts at, not each of its 100 keys", () => {
    const deepOwnField = sample.replace(
      '"id": "team_checkout",',
      `"id": "team_checkout", "x-owner": ${arraysNestedLevelsDeep(MAX_NESTING_DEPTH)},`,
    );
    const [problem, ...rest] = documentProblems(deepOwnField);
    expect(rest).toEqual([]);
    expect(problem).toMatchObject({
      message: `nodes[0].x-owner[0]…: ${tooDeep}`,
      offset: at(deepOwnField, "[[") + MAX_NESTING_DEPTH - 3,
    });
  });

  it("reports the first 100 containers too deep, each at its own bracket", () => {
    const wide = Array.from({ length: 1_000 }, () => "[]").join(", ");
    const tooDeepAtTheLast = withVendorData(
      `${"[".repeat(MAX_NESTING_DEPTH - 1)}${wide}${"]".repeat(MAX_NESTING_DEPTH - 1)}`,
    );
    const problems = documentProblems(tooDeepAtTheLast);
    const firstEmptyArray = at(tooDeepAtTheLast, "[]");
    expect(problems).toEqual(
      Array.from({ length: 100 }, (_, index) => ({
        severity: "error",
        message: `x-vendor[0][0][0]…: ${tooDeep}`,
        offset: firstEmptyArray + index * "[], ".length,
        length: "[]".length,
      })),
    );
  });

  it("lists each problem once in a file too deep for the tree parser, all at one bracket", () => {
    const threeTooDeep = `${"[".repeat(MAX_NESTING_DEPTH - 1)}[], [], []${"]".repeat(MAX_NESTING_DEPTH - 1)}`;
    const deep = sample.replace(
      "{\n",
      `{\n  "x-vendor": ${threeTooDeep},\n  "x-other": ${arraysNestedLevelsDeep(10_000)},\n`,
    );
    const firstLevelTooDeep = at(deep, "[]");
    expect(documentProblems(deep)).toEqual(
      ["x-vendor[0][0][0]…", "x-other[0][0][0]…"].map((label) => ({
        severity: "error",
        message: `${label}: ${tooDeep}`,
        offset: firstLevelTooDeep,
        length: 1,
      })),
    );
  });

  it("reads no text deeper than the tree parser's limit with the tree parser", () => {
    const levels = 10_000;
    const deepAfter = (prefix: string, opening: string): string =>
      `${prefix}${opening.repeat(levels)}${"]".repeat(levels)}`;
    for (const text of [
      deepAfter('// "\n', "["),
      deepAfter('/* " */', "["),
      deepAfter('["no closing quote\n', "["),
      deepAfter("", "[},"),
    ]) {
      const [problem, ...rest] = documentProblems(text);
      expect(rest).toEqual([]);
      expect(problem).toMatchObject({ severity: "error" });
      expect(problem!.message).toMatch(/^Not valid JSON: /);
    }
  });

  it("points at the place where the JSON breaks in a file too deep for the tree parser", () => {
    const levels = 10_000;
    const broken = withVendorData(`${"[".repeat(levels)}1 2${"]".repeat(levels)}`);
    const [problem, ...rest] = documentProblems(broken);
    expect(rest).toEqual([]);
    expect(problem).toMatchObject({ severity: "error", offset: at(broken, "1 2") + 2, length: 1 });
    expect(problem!.message).toMatch(/^Not valid JSON: /);
  });
});
