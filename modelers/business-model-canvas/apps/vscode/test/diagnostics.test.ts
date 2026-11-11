import { describe, expect, it } from "vitest";
import { EXAMPLE_DOCUMENT } from "business-model-canvas-ide-editor/examples";
import { documentDiagnostics, documentProblems } from "../src/diagnostics.js";

const lines = (...rows: string[]) => `${rows.join("\n")}\n`;

describe("documentProblems", () => {
  it("finds nothing in the example or in a blank file", () => {
    expect(documentProblems(EXAMPLE_DOCUMENT)).toEqual([]);
    expect(documentProblems("")).toEqual([]);
  });

  it("puts a finding on the value its path names, also among fields of the same name", () => {
    const text = lines(
      "version: 1",
      "canvas:",
      "  version: x",
      "channels:",
      "  items:",
      "    - id: x",
      "      text: Shop",
      "    - id: x",
      "      text: Fair",
    );
    expect(documentProblems(text)).toEqual([
      {
        severity: "error",
        message: 'channels.items[1].id: Duplicate sticky id "x", also at channels.items[0].',
        offset: text.lastIndexOf("id: x") + "id: ".length,
        length: 1,
      },
    ]);
  });

  it("puts a missing field on the map that lacks it, a syntax error where it is", () => {
    const missing = lines("version: 1", "channels:", "  items:", "    - text: Shop");
    const [problem] = documentProblems(missing);
    expect(problem).toMatchObject({ severity: "error", offset: missing.indexOf("text: Shop") });
    const broken = lines("version: 1", "channels: [a, b");
    expect(documentProblems(broken)).toEqual([
      expect.objectContaining({
        severity: "error",
        message: expect.stringMatching(/^The text is no YAML: /),
      }),
    ]);
  });

  it("warns at every comment, never at a # inside a text", () => {
    const text = lines(
      "# from the workshop",
      "version: 1",
      "channels:",
      "  items:",
      "    - id: shop # the web shop",
      '      text: "Shop #1"',
      "      color: '#F6C8B8'",
    );
    expect(documentProblems(text)).toEqual([
      {
        severity: "warning",
        message: "Comments are not kept when the canvas saves; write a note instead.",
        offset: 0,
        length: "# from the workshop".length,
      },
      {
        severity: "warning",
        message: "Comments are not kept when the canvas saves; write a note instead.",
        offset: text.indexOf("# the web shop"),
        length: "# the web shop".length,
      },
    ]);
  });
});

describe("documentDiagnostics", () => {
  it("marks the value, an error as an error and a warning as a warning", () => {
    const text = lines(
      "version: 1",
      "channels:",
      "  items:",
      "    - id: x",
      "      text: Shop",
      "      color: teal",
    );
    const [warning] = documentDiagnostics(text);
    expect(warning).toMatchObject({ severity: 1, source: "business-model-canvas" });
    const line = text.split("\n").findIndex((row) => row.includes("teal"));
    expect(warning!.range.start.line).toBe(line);
    expect(warning!.range.start.character).toBe(text.split("\n")[line]!.indexOf("teal"));
    const [error] = documentDiagnostics("version: 2\n");
    expect(error).toMatchObject({ severity: 0 });
  });
});
