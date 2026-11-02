import { describe, expect, it } from "vitest";
import { parseWorkspace } from "@miragon/c4-dsl";
import type { Diagnostic } from "@miragon/c4-schema-model";
import { openedWithProblemsText, problemItems } from "../src/problems.js";

function diagnostic(
  fields: Partial<Diagnostic> & Pick<Diagnostic, "severity" | "line">,
): Diagnostic {
  return {
    code: "unknown-statement",
    message: "Couldn't read this statement.",
    range: { start: 0, end: 0 },
    column: 1,
    endLine: fields.line,
    endColumn: 1,
    rejects: false,
    anchor: "",
    ...fields,
  };
}

const TEXT = [
  "workspace {",
  "    model {",
  '        a = softwareSystem "A" "A system whose description runs on for quite a while longer than a row"',
  "        b -> a",
  "    }",
  "}",
].join("\n");

describe("problemItems", () => {
  it("lists errors first, then warnings, each in the order of the text, and leaves infos out", () => {
    const items = problemItems(
      [
        diagnostic({ severity: "warning", line: 4, message: "W4" }),
        diagnostic({ severity: "info", line: 1, message: "I1" }),
        diagnostic({ severity: "error", line: 4, message: "E4" }),
        diagnostic({ severity: "error", line: 2, message: "E2" }),
      ],
      TEXT,
      () => true,
    );
    expect(items.map((item) => [item.severity, item.message])).toEqual([
      ["error", "E2"],
      ["error", "E4"],
      ["warning", "W4"],
    ]);
  });

  it("places a row by its line and statement, cut to the row's width", () => {
    const [third, fourth] = problemItems(
      [diagnostic({ severity: "warning", line: 4 }), diagnostic({ severity: "warning", line: 3 })],
      TEXT,
      () => true,
    );
    expect(third?.location).toBe(
      'Line 3 · a = softwareSystem "A" "A system whose description runs on…',
    );
    expect(fourth?.location).toBe("Line 4 · b -> a");
    expect(problemItems([diagnostic({ severity: "error", line: 9 })], TEXT, () => true)[0]).toEqual(
      expect.objectContaining({ location: "Line 9" }),
    );
  });

  it("keeps an element only where a view can reveal it, so a click on the row shows it", () => {
    const items = problemItems(
      [
        diagnostic({ severity: "warning", line: 3, elementId: "a" }),
        diagnostic({ severity: "warning", line: 4, elementId: "hidden" }),
      ],
      TEXT,
      (id) => id === "a",
    );
    expect(items[0]?.elementId).toBe("a");
    expect(items[1]).not.toHaveProperty("elementId");
  });

  it("reads the parser's own findings: an unresolved reference is a compatibility error", () => {
    const parse = parseWorkspace(`${TEXT}\n`);
    const items = problemItems(parse.diagnostics, parse.text, () => false);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toEqual(
      expect.objectContaining({ severity: "error", location: "Line 4 · b -> a" }),
    );
  });
});

describe("openedWithProblemsText", () => {
  it("counts errors and warnings and names the pill (guide §9)", () => {
    const error = { severity: "error" as const, message: "E" };
    const warning = { severity: "warning" as const, message: "W" };
    expect(openedWithProblemsText([warning], "1 problem")).toBe(
      "Opened with 1 warning. Details under “1 problem” bottom left.",
    );
    expect(openedWithProblemsText([error, error, warning], "3 problems")).toBe(
      "Opened with 2 errors and 1 warning. Details under “3 problems” bottom left.",
    );
  });
});
