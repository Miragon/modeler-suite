import { describe, expect, it } from "vitest";
import {
  MAX_NESTING_DEPTH,
  SAMPLE_DOCUMENT,
  serializeDocumentText,
} from "@miragon/context-maps-schema-model";
import { mapProblems, problemCounts } from "../src/problems.js";

const sample = serializeDocumentText(SAMPLE_DOCUMENT);
const tooDeep = `objects and arrays may nest at most ${MAX_NESTING_DEPTH} levels deep`;
const farBeyondTheTreeParser = 50_000;

function textOf(text: string, problem: { start: number; end: number }): string {
  return text.slice(problem.start, problem.end);
}

const title = `"title": ${JSON.stringify(SAMPLE_DOCUMENT.title)}`;

function deepValue(levels: number): string {
  return `${'[{"a":'.repeat(levels / 2)}0${"}]".repeat(levels / 2)}`;
}

/**
 * The part of {@link deepValue} from its first container beyond the limit: the document is the
 * first level and the value the second, so the value's bracket number MAX_NESTING_DEPTH opens
 * it, an object in an array.
 */
function beyondTheLimit(levels: number): string {
  const pairs = (levels - MAX_NESTING_DEPTH) / 2;
  return `{"a":${'[{"a":'.repeat(pairs)}0${"}]".repeat(pairs)}}`;
}

function withForeignKeys(text: string, values: Record<string, string>, after = ""): string {
  const members = Object.entries(values).map(([key, value]) => `"${key}": ${value},`);
  return text.replace('"version": 1', `${members.join("\n  ")}${after}\n  "version": 1`);
}

function withDeepForeignKey(text: string, levels: number, after = ""): string {
  return withForeignKeys(text, { "x-deep": deepValue(levels) }, after);
}

describe("mapProblems", () => {
  it("finds nothing in the example or in an empty file", () => {
    expect(mapProblems(sample)).toEqual([]);
    expect(mapProblems("")).toEqual([]);
  });

  it("reports a JSON syntax error at its position", () => {
    const text = '{ "version": 1, "title": }';
    const [problem] = mapProblems(text);
    expect(problem).toMatchObject({
      severity: "error",
      message: "Not valid JSON: value expected.",
    });
    expect(problem!.start).toBe(text.indexOf("}"));
  });

  it("points a structural error at the offending property", () => {
    const text = sample.replace('"x": 340', '"x": "left"');
    const [problem] = mapProblems(text);
    expect(problem!.severity).toBe("error");
    expect(problem!.message).toMatch(/^contexts\.1\.position\.x: /);
    expect(textOf(text, problem!)).toBe('"x": "left"');
  });

  it("puts a semantic finding on the relationship's object", () => {
    const text = sample.replace(
      '"pattern": "customer-supplier",\n      "upstreamRoles": [\n        "PL"\n      ],',
      '"pattern": "customer-supplier",\n      "upstreamRoles": [\n        "OHS"\n      ],',
    );
    const problems = mapProblems(text);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ severity: "error", rule: "generic-vs-custom-service" });
    const object = textOf(text, problems[0]!);
    expect(object.startsWith("{")).toBe(true);
    expect(object).toContain('"id": "rel_evaluation_schedule"');
    expect(object.endsWith("}")).toBe(true);
  });

  it("reports warnings as warnings and counts the errors among them", () => {
    const text = sample.replace(
      '"pattern": "customer-supplier",\n      "upstreamRoles": [\n        "PL"\n      ],',
      '"pattern": "customer-supplier",\n      "downstreamRoles": [\n        "ACL"\n      ],',
    );
    const problems = mapProblems(text);
    expect(problems.map((problem) => problem.severity)).toEqual(["warning"]);
    expect(problemCounts(problems)).toEqual({ count: 1, errors: 0 });
  });

  it("names an id the canvas keeps for itself at that id", () => {
    const text = sample.replace('"id": "ctx_cfp"', '"id": "cm-root"');
    const problems = mapProblems(text);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.message).toMatch(/^contexts\.\d+\.id: the id "cm-root" is reserved/);
    expect(textOf(text, problems[0]!)).toBe('"id": "cm-root"');
  });

  it("names an id that names a built-in object property at that id", () => {
    const text = sample.replace('"id": "rel_evaluation_schedule"', '"id": "constructor"');
    const problems = mapProblems(text);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.message).toMatch(
      /^relationships\.\d+\.id: the id "constructor" is reserved: it names a built-in property/,
    );
    expect(textOf(text, problems[0]!)).toBe('"id": "constructor"');
  });

  it("puts a duplicate id on its copy, next to the other structural errors", () => {
    const text = sample
      .replace('"id": "ctx_cfp"', '"id": "ctx_auth"')
      .replace('"x": 340', '"x": "left"');
    const problems = mapProblems(text);
    expect(problems.map((problem) => problem.message)).toEqual([
      expect.stringMatching(/^contexts\.1\.position\.x: /),
      expect.stringMatching(/^contexts\.1\.id: duplicate id "ctx_auth"/),
    ]);
    const copy = text.indexOf('"id": "ctx_auth"', text.indexOf('"id": "ctx_auth"') + 1);
    expect(problems[1]!.start).toBe(copy);
    expect(textOf(text, problems[1]!)).toBe('"id": "ctx_auth"');
  });

  it("puts a duplicate id on the later copy when the relationships come first", () => {
    const { version, title, contexts, relationships } = structuredClone(SAMPLE_DOCUMENT);
    const repeated = relationships[0]!.id;
    contexts[0]!.id = repeated;
    const text = JSON.stringify({ version, title, relationships, contexts }, null, 2);
    const problems = mapProblems(text);
    expect(problems.map((problem) => problem.message)).toEqual([
      `contexts.0.id: duplicate id "${repeated}"; ids must be unique across contexts and relationships`,
    ]);
    const copy = text.lastIndexOf(`"id": "${repeated}"`);
    expect(copy).toBeGreaterThan(text.indexOf(`"id": "${repeated}"`));
    expect(problems[0]!.start).toBe(copy);
  });

  it("marks the first container beyond the limit, also in a text too deep for the tree parser", () => {
    for (const levels of [MAX_NESTING_DEPTH + 50, farBeyondTheTreeParser]) {
      const text = withDeepForeignKey(sample, levels);
      const problems = mapProblems(text);
      expect(problems).toHaveLength(1);
      expect(problemCounts(problems)).toEqual({ count: 1, errors: 1 });
      const [problem] = problems;
      expect(problem!.message.startsWith("x-deep.0.a.0.a.")).toBe(true);
      expect(problem!.message.endsWith(`: ${tooDeep}`)).toBe(true);
      expect(textOf(text, problem!)).toBe(beyondTheLimit(levels));
    }
  });

  it("marks an object member beyond the limit from its key, with or without the tree", () => {
    const starts = [MAX_NESTING_DEPTH + 50, farBeyondTheTreeParser].map((levels) => {
      const objects = `${'{"a":'.repeat(levels)}0${"}".repeat(levels)}`;
      const text = withForeignKeys(sample, { "x-deep": objects });
      const [problem, ...rest] = mapProblems(text);
      expect(rest).toEqual([]);
      const beyond = levels - MAX_NESTING_DEPTH + 1;
      expect(textOf(text, problem!)).toBe(`"a":${'{"a":'.repeat(beyond)}0${"}".repeat(beyond)}`);
      return problem!.start;
    });
    expect(starts[1]).toBe(starts[0]);
  });

  it("marks each nesting issue of a text too deep for the tree parser at its own container", () => {
    const inside = "[".repeat(MAX_NESTING_DEPTH - 1);
    const escapedB = "x-\\u0062";
    const text = withForeignKeys(sample, {
      "x-a": deepValue(farBeyondTheTreeParser),
      "x-note": JSON.stringify('a "]}" b \\'),
      [escapedB]: deepValue(farBeyondTheTreeParser),
      "x-wide": `${inside}[], {}, [0]${"]".repeat(inside.length)}`,
    });
    const problems = mapProblems(text);
    expect(problems.map(({ message }) => message.split(".")[0])).toEqual([
      "x-a",
      "x-b",
      "x-wide",
      "x-wide",
      "x-wide",
    ]);
    expect(problems.map((problem) => textOf(text, problem))).toEqual([
      beyondTheLimit(farBeyondTheTreeParser),
      beyondTheLimit(farBeyondTheTreeParser),
      "[]",
      "{}",
      "[0]",
    ]);
    const [a, b, wide] = problems.map(({ start }) => start);
    expect(a).toBeGreaterThan(text.indexOf('"x-a"'));
    expect(a).toBeLessThan(text.indexOf('"x-note"'));
    expect(b).toBeGreaterThan(text.indexOf(`"${escapedB}"`));
    expect(b).toBeLessThan(text.indexOf('"x-wide"'));
    expect(wide).toBeGreaterThan(text.indexOf('"x-wide"'));
  });

  it("marks the other structural errors of a text too deep for the tree parser where a tree would", () => {
    const newer = withDeepForeignKey(sample, farBeyondTheTreeParser).replace(
      '"version": 1',
      '"version": 2',
    );
    const [version, ...rest] = mapProblems(newer);
    expect(rest).toEqual([]);
    expect(version!.message).toMatch(/^version: 2 is newer than this modeler reads/);
    expect(textOf(newer, version!)).toBe('"version": 2');

    const text = withDeepForeignKey(
      sample.replace('"x": 340', '"x": "left"'),
      farBeyondTheTreeParser,
    );
    const problems = mapProblems(text);
    expect(problems.map(({ message }) => message.split(".")[0])).toEqual(["x-deep", "contexts"]);
    expect(problems.map((problem) => textOf(text, problem))).toEqual([
      beyondTheLimit(farBeyondTheTreeParser),
      '"x": "left"',
    ]);
  });

  it("reports a JSON error of a text too deep for the tree parser where V8 names its position", () => {
    const broken = withDeepForeignKey(
      sample.replace('"x": 340', '"x" 340'),
      farBeyondTheTreeParser,
    );
    for (const text of [broken, `\uFEFF${broken}`]) {
      const [problem, ...rest] = mapProblems(text);
      expect(rest).toEqual([]);
      expect(problem!.message).toMatch(/^not valid JSON: Expected ':' after property name/);
      expect(textOf(text, problem!)).toBe("3");
      expect(text.slice(problem!.start)).toMatch(/^340,/);
    }
  });

  it("reports a JSON error of a text too deep for the tree parser at the start of the file when V8 names no position", () => {
    const text = withDeepForeignKey(sample.replace('"x": 340', '"x": '), farBeyondTheTreeParser);
    const [problem, ...rest] = mapProblems(text);
    expect(rest).toEqual([]);
    expect(problem!.message).toMatch(/^not valid JSON: Unexpected token/);
    expect(textOf(text, problem!)).toBe("{");
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
      const [problem, ...rest] = mapProblems(text);
      expect(rest).toEqual([]);
      expect(problem).toMatchObject({ severity: "error" });
      expect(problem!.message).toMatch(/^not valid JSON: /);
    }
  });

  it("finds a JSON error behind a comment, a string cut short or a stray bracket in a deep text", () => {
    const deepAfterTitle = sample.replace(
      title,
      `${title},\n  "x-deep": ${deepValue(farBeyondTheTreeParser)}`,
    );
    const cutShort = deepAfterTitle.replace(title, title.slice(0, -1));
    const [string, ...afterString] = mapProblems(cutShort);
    expect(afterString).toEqual([]);
    expect(string!.message).toMatch(/^not valid JSON: Bad control character in string literal/);
    expect(string!.start).toBe(cutShort.indexOf("\n", cutShort.indexOf(title.slice(0, -1))));

    const commented = deepAfterTitle.replace('"x-deep"', '// a "quote\n  "x-deep"');
    const [comment, ...afterComment] = mapProblems(commented);
    expect(afterComment).toEqual([]);
    expect(comment!.message).toMatch(/^not valid JSON: /);
    expect(textOf(commented, comment!)).toBe("/");

    const unmatched = `{"a": ${"[},".repeat(farBeyondTheTreeParser)}]}`;
    const [bracket, ...afterBracket] = mapProblems(unmatched);
    expect(afterBracket).toEqual([]);
    expect(bracket!.message).toMatch(/^not valid JSON: Unexpected token/);
    expect(bracket!.start).toBe(0);
  });

  it("puts a semantic finding of a text too deep for the tree parser at the start of the file", () => {
    const withWarning = sample.replace(
      '"pattern": "customer-supplier",\n      "upstreamRoles": [\n        "PL"\n      ],',
      '"pattern": "customer-supplier",\n      "downstreamRoles": [\n        "ACL"\n      ],',
    );
    const overridden = withDeepForeignKey(withWarning, farBeyondTheTreeParser, ' "x-deep": 1,');
    const problems = mapProblems(overridden);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ severity: "warning", start: 0, end: 1 });
  });

  it("reads brackets inside strings as text when it measures the nesting", () => {
    const text = sample
      .replace(
        '"version": 1',
        `"x-note": "${'[{\\"'.repeat(farBeyondTheTreeParser)}",\n  "version": 1`,
      )
      .replace('"x": 340', '"x": "left"');
    const problems = mapProblems(text);
    expect(problems).toHaveLength(1);
    expect(textOf(text, problems[0]!)).toBe('"x": "left"');
  });
});
