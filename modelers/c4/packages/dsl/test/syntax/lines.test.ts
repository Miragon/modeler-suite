import { describe, expect, it } from "vitest";
import { printCst } from "../../src/syntax/index.js";
import type { Cst } from "../../src/types.js";
import { codesOf, kindsOf, parseSound, statementsOf, statementValues } from "./support/cst.js";

function lastTokenOf(text: string) {
  const statement = statementsOf(parseSound(text)).find((candidate) => candidate.tokens.length > 1);
  return { statement, token: statement?.tokens[statement.tokens.length - 1] };
}

describe("line continuation (R-DSL §2.2)", () => {
  it("joins a line ending in a backslash with the next one, its indentation cut", () => {
    const text = 'a = softwareSystem "Software \\\n            System"';
    const { statement, token } = lastTokenOf(text);
    expect(token?.value).toBe("Software System");
    expect(token?.raw).toBe('"Software \\\n            System"');
    expect(statement?.continued).toBe(true);
    expect(statement?.range).toEqual({ start: 0, end: text.length });
  });

  it("inserts no separator: `foo\\` and `bar` are one token", () => {
    expect(statementValues("person foo\\\n  bar")).toEqual([["person", "foobar"]]);
  });

  it("keeps a middle line's indentation and cuts only the last line's, as the reference does", () => {
    expect(statementValues('person "A \\\n    B \\\n    C"')).toEqual([["person", "A     B C"]]);
  });

  it("doesn't continue when a space follows the backslash", () => {
    expect(statementValues('person "A" \\ \n"next"')).toEqual([["person", "A", "\\"], ["next"]]);
  });

  it("never continues a whole-line comment", () => {
    const cst = parseSound("// a note \\\nperson A");
    expect(kindsOf(cst.nodes)).toEqual(["lineComment", "statement:person"]);
  });

  it("continues a block comment line, which then never closes", () => {
    const cst = parseSound("/* c */ \\\nperson A\n");
    expect(kindsOf(cst.nodes)).toEqual(["blockComment"]);
    expect(codesOf(cst)).toEqual(["unterminated-comment!"]);
  });

  it("appends a comment line to the statement it continues, as a trailing comment", () => {
    const [statement] = statementsOf(parseSound("person A \\\n// note"));
    expect(statement?.tokens.map((token) => token.value)).toEqual(["person", "A"]);
    expect(statement?.trailingComment).toBeDefined();
  });

  it("reads a last line ending in a backslash, and warns that Structurizr drops it", () => {
    const cst = parseSound("workspace {\n}\n  \\");
    expect(statementsOf(cst)[0]?.block?.close.range).toEqual({ start: 12, end: 13 });
    expect(codesOf(cst)).toEqual(["structurizr-rejects"]);
    expect(cst.syntaxDiagnostics[0]?.severity).toBe("warning");
  });

  it.each(["workspace {\n}\\", "!script groovy {\n    x\n}\\"])(
    "notes as an error that Structurizr, dropping the last line of %j, leaves its block open",
    (text) => {
      const cst = parseSound(text);
      expect(codesOf(cst)).toEqual(["structurizr-rejects"]);
      expect(cst.syntaxDiagnostics[0]?.severity).toBe("error");
      expect(cst.syntaxDiagnostics[0]?.line).toBe(text.split("\n").length);
    },
  );

  it("prints a copy of the tree back when the head continues past its `{` onto a blank line", () => {
    for (const text of ["a {\\\n   \n}\n", "a {\\\r\n\\\r\n\r\n  b\r\n}\r\n", "a {\\\n   \n"]) {
      const cst = parseSound(text);
      expect(statementsOf(cst)[0]?.block).toBeDefined();
      expect(printCst(JSON.parse(JSON.stringify(cst)) as Cst)).toBe(text);
    }
  });
});

describe("text blocks (R-DSL §2.2)", () => {
  it("reads the verified example: indentation from the first content line, quotes kept", () => {
    const text = 'a = softwareSystem "A" """\n    Line one "quoted"\n      indented\n    """';
    const { statement, token } = lastTokenOf(text);
    expect(token?.value).toBe('Line one "quoted"\n  indented');
    expect(token?.textBlock).toBe(true);
    expect(token?.quoted).toBe(true);
    expect(token?.raw).toBe(text.slice(text.indexOf('"""')));
    expect(statement?.endsInTextBlock).toBe(true);
    expect(statement?.continued).toBe(false);
    expect(statement?.block).toBeUndefined();
  });

  it("discards what precedes the closing marker and keeps empty lines as line breaks", () => {
    const { token } = lastTokenOf('description """\n  a\n\n  b\n  dropped"""\nperson B');
    expect(token?.value).toBe("a\n\nb");
  });

  it("swallows braces, comment markers and `}` lines", () => {
    const cst = parseSound(
      'workspace {\n    !const X """\n        root {\n        }\n        /* x\n        """\n}\n',
    );
    expect(codesOf(cst)).toEqual([]);
    expect(statementsOf(cst).map((statement) => statement.tokens[0]?.value)).toEqual([
      "workspace",
      "!const",
    ]);
    expect(statementsOf(cst)[1]?.tokens[2]?.value).toBe("root {\n}\n/* x");
  });

  it("resolves escapes after reading the content, and marks `${…}` as substituting", () => {
    const { token } = lastTokenOf('description """\n    say \\"hi\\"\\n${NAME}\n    """');
    expect(token?.value).toBe('say "hi"\n${NAME}');
    expect(token?.substitutes).toBe(true);
  });

  it("cuts a later line by the first line's indentation, as the reference does", () => {
    const { token } = lastTokenOf('description """\n    abc\nxxxxyz\n"""');
    expect(token?.value).toBe("abc\nyz");
  });

  it("notes a content line shorter than that indentation, which Structurizr fails on", () => {
    const cst = parseSound('description """\n        abc\n  x\n"""');
    expect(codesOf(cst)).toEqual(["structurizr-rejects"]);
    expect(cst.syntaxDiagnostics[0]?.line).toBe(3);
  });

  it("notes an empty text block", () => {
    const cst = parseSound('description """\n"""');
    expect(codesOf(cst)).toEqual(["structurizr-rejects"]);
    expect(statementsOf(cst)[0]?.tokens[1]?.textBlock).toBe(true);
  });

  it("rejects a text block that never closes", () => {
    const cst = parseSound('workspace {\n    description """\n        text\n        }\n');
    expect(codesOf(cst)).toEqual(["unclosed-block!", "unterminated-text-block!"]);
  });

  it("notes a whole-line comment ending in the marker, which Structurizr fails on", () => {
    const cst = parseSound('// """\nperson A');
    expect(kindsOf(cst.nodes)).toEqual(["lineComment", "statement:person"]);
    expect(codesOf(cst)).toEqual(["structurizr-rejects"]);
  });

  it("opens a text block after a continuation, keeping that line's indentation", () => {
    const { statement, token } = lastTokenOf('person \\\n    "A" """\n    text\n    """');
    expect(statement?.tokens.map((each) => each.value)).toEqual(["person", "A", "text"]);
    expect(token?.textBlock).toBe(true);
    expect(statement?.continued).toBe(true);
  });
});

describe("physical lines, line breaks and the byte order mark (R-DSL §2.1)", () => {
  it("keeps a byte order mark out of every node and every column", () => {
    const cst = parseSound("\uFEFF}\n");
    expect(cst.bom).toBe(true);
    expect(cst.nodes[0]?.range.start).toBe(1);
    expect(cst.syntaxDiagnostics[0]).toMatchObject({
      code: "unexpected-close",
      line: 1,
      column: 1,
      endColumn: 2,
    });
  });

  it("reads a byte order mark only at the start of the text as one", () => {
    expect(parseSound("person A\n\uFEFFperson B").bom).toBe(false);
    expect(statementValues("person A\n\uFEFFperson B")).toEqual([
      ["person", "A"],
      ["person", "B"],
    ]);
  });

  it.each([
    ["a\nb\n", "\n", true],
    ["a\r\nb\r\n", "\r\n", true],
    ["a\r\nb\r\nc\n", "\r\n", true],
    ["a\r\nb\nc", "\n", false],
    ["a", "\n", false],
  ])("reads the majority line break of %j", (text, lineBreak, endsWithLineBreak) => {
    const cst = parseSound(text);
    expect(cst.lineBreak).toBe(lineBreak);
    expect(cst.endsWithLineBreak).toBe(endsWithLineBreak);
  });

  it("keeps a lone carriage return inside its line, as whitespace", () => {
    const cst = parseSound("person A\rB\nperson C\r");
    expect(
      statementsOf(cst).map((statement) => statement.tokens.map((token) => token.value)),
    ).toEqual([
      ["person", "A", "B"],
      ["person", "C"],
    ]);
  });

  it.each([
    ["", []],
    ["\n", ["blank"]],
    ["   ", ["blank"]],
    ["\n\n", ["blank", "blank"]],
    ["\uFEFF", []],
    ["\uFEFF\n", ["blank"]],
  ])("reads %j as %j", (text, kinds) => {
    expect(kindsOf(parseSound(text).nodes)).toEqual(kinds);
  });

  it("notes a line of only special spaces or control characters, which Structurizr fails on", () => {
    for (const text of ["\u2003", "\u0000", "a\n\u0001\u2003\nb"]) {
      const cst = parseSound(text);
      expect(codesOf(cst)).toEqual(["structurizr-rejects"]);
      expect(kindsOf(cst.nodes)).toContain("blank");
    }
  });

  it("reads a line of only no-break or zero-width spaces as such a line, though Java's tokenizer keeps them as a token", () => {
    for (const invisible of [
      "\u00a0",
      "\u00a0\u00a0",
      "\u2007",
      "\u202f",
      "\u200b",
      "\u2060",
      "\u0085",
      "\u00a0\u0001\u00a0",
      "    \ufeff\ufeff",
    ]) {
      const cst = parseSound(`workspace {\n${invisible}  \n}\n`);
      const [workspace] = statementsOf(cst);
      expect(codesOf(cst), JSON.stringify(invisible)).toEqual(["structurizr-rejects"]);
      expect(kindsOf(workspace?.block?.children ?? [])).toEqual(["blank"]);
    }
  });

  it("keeps a no-break space that is not alone on its line, or sits in a comment, as Structurizr reads it", () => {
    expect(statementValues("properties {\n\u00a0 \u00a0\n}")).toEqual([
      ["properties"],
      ["\u00a0", "\u00a0"],
    ]);
    expect(statementValues('"\u00a0"')).toEqual([["\u00a0"]]);
    expect(codesOf(parseSound("workspace {\n/*\n\u00a0\n*/\n}\n"))).toEqual([]);
  });

  it.each([
    ["flat", "person A\n", "    "],
    ["two spaces", "workspace {\n  model {\n    a = person A\n  }\n}\n", "  "],
    ["tabs", "workspace {\n\tmodel {\n\t\ta = person A\n\t}\n}\n", "\t"],
    ["a tab after spaces", "workspace {\n  \tmodel {\n  \t}\n}\n", "  \t"],
    ["mostly four", "a {\n    b {\n      c\n    }\n    d {\n        e\n    }\n}\n", "    "],
  ])("measures the indent unit of %s", (_name, text, unit) => {
    expect(parseSound(text).indentUnit).toBe(unit);
  });
});
