import { describe, expect, it } from "vitest";
import { codesOf, kindsOf, nodesOf, parseSound, statementsOf } from "./support/cst.js";

describe("blocks (R-DSL §2.6)", () => {
  it("opens a block only with `{` as the last token of the logical line", () => {
    const cst = parseSound(
      'workspace {\n    model {\n        a = person "A" {\n        }\n    }\n}\n',
    );
    expect(
      statementsOf(cst).map((statement) => [
        statement.tokens[0]?.value,
        statement.block?.children.length,
      ]),
    ).toEqual([
      ["workspace", 1],
      ["model", 1],
      ["person", 0],
    ]);
  });

  it("puts each block statement's range from its first line's indentation to its `}`", () => {
    const text = "workspace {\n    model {\n    }  \n}";
    const [workspace, model] = statementsOf(parseSound(text));
    expect(workspace?.range).toEqual({ start: 0, end: text.length });
    expect(text.slice(model?.range.start, model?.range.end)).toBe("    model {\n    }  ");
    expect(model?.block?.close).toMatchObject({ indent: "    ", trailing: "  " });
    expect(model?.block?.open).toEqual({ start: 22, end: 23 });
  });

  it.each([
    ['softwareSystem "A"{', ["softwareSystem", "A"]],
    ['softwareSystem "A" "{"', ["softwareSystem", "A"]],
    ["{", []],
  ])("opens a block on %j", (head, values) => {
    const [statement] = statementsOf(parseSound(`${head}\n}\n`));
    expect(statement?.block).toBeDefined();
    expect(statement?.tokens.map((token) => token.value)).toEqual(values);
  });

  it("reads a brace alone on its line as a block without tokens (a dynamic view's parallel sequence)", () => {
    const cst = parseSound("dynamic * {\n    a -> b\n    {\n        b -> c\n    }\n}\n");
    const parallel = statementsOf(cst)[2];
    expect(parallel?.tokens).toEqual([]);
    expect(parallel?.block?.children).toHaveLength(1);
  });

  it("closes on a line whose first token is `}`, whatever follows, after an assignment too", () => {
    expect(statementsOf(parseSound("a {\n} b c {\n"))[0]?.block?.close.trailing).toBe(" b c {");
    expect(statementsOf(parseSound('a {\n"}"\n'))[0]?.block).toBeDefined();
    expect(codesOf(parseSound("a {\nx = } y\n"))).toEqual([]);
  });

  it("doesn't close on `}x`", () => {
    const cst = parseSound("a {\n}x\n");
    expect(codesOf(cst)).toEqual(["unclosed-block!"]);
  });

  it("treats `model` without `{` as a one-liner, so the next `}` closes the outer block", () => {
    const cst = parseSound("workspace {\n    model\n    a = person A\n}\n}\n");
    expect(kindsOf(statementsOf(cst)[0]?.block?.children ?? [])).toEqual([
      "statement:model",
      "statement:person",
    ]);
    expect(codesOf(cst)).toEqual(["unexpected-close!"]);
  });

  it("rejects a `}` that closes no block and keeps it as a statement", () => {
    const cst = parseSound("person A\n    }\n");
    expect(kindsOf(cst.nodes)).toEqual(["statement:person", "statement:}"]);
    expect(cst.syntaxDiagnostics[0]).toMatchObject({
      code: "unexpected-close",
      severity: "error",
      rejects: true,
      line: 2,
      column: 5,
      endLine: 2,
      endColumn: 6,
      range: { start: 13, end: 14 },
      anchor: "}",
    });
  });

  it("rejects every block left open at the end and still covers every line", () => {
    const text = 'workspace {\n    model {\n        a = person "A"\n';
    const cst = parseSound(text);
    expect(codesOf(cst)).toEqual(["unclosed-block!", "unclosed-block!"]);
    expect(cst.syntaxDiagnostics.map((diagnostic) => diagnostic.anchor)).toEqual([
      "workspace {",
      "model {",
    ]);
    const [workspace, model] = statementsOf(cst);
    expect(workspace?.block?.close.range).toEqual({ start: text.length - 1, end: text.length - 1 });
    expect(model?.range.end).toBe(text.length - 1);
  });

  it("rejects an unclosed block whose head is its last line", () => {
    const cst = parseSound("workspace {");
    expect(codesOf(cst)).toEqual(["unclosed-block!"]);
    expect(statementsOf(cst)[0]?.range).toEqual({ start: 0, end: 11 });
  });

  it("keeps blank and comment lines inside the block that holds them", () => {
    const cst = parseSound("a {\n\n    // c\n    /* d */\n}\n");
    expect(kindsOf(statementsOf(cst)[0]?.block?.children ?? [])).toEqual([
      "blank",
      "lineComment",
      "blockComment",
    ]);
  });
});

describe("inline scripts (R-DSL §8.5)", () => {
  it("keeps an inline script verbatim up to the first line that, trimmed, is `}`", () => {
    const text =
      'workspace {\n    !script groovy {\n        if (x) { y() }\n        // dropped by Structurizr\n\n        z = "}"\n    }\n}\n';
    const cst = parseSound(text);
    const [script] = statementsOf(cst)[0]?.block?.children ?? [];
    expect(script).toMatchObject({ kind: "raw", directive: "!script" });
    expect(text.slice(script?.range.start, script?.range.end)).toBe(
      text.slice(12, text.lastIndexOf("    }") + 5),
    );
    expect(codesOf(cst)).toEqual([]);
  });

  it("ends the script at an indented `}` of the script's own code, as Structurizr does", () => {
    const cst = parseSound("!script javascript {\n    if (x) {\n    }\n}\n");
    expect(kindsOf(cst.nodes)).toEqual(["raw", "statement:}"]);
    expect(codesOf(cst)).toEqual(["unexpected-close!"]);
  });

  it.each(["!script KOTLIN {", "!SCRIPT ruby {", "s = !script groovy {"])(
    "reads %j as an inline script",
    (head) => {
      expect(kindsOf(parseSound(`${head}\n    x\n}\n`).nodes)).toEqual(["raw"]);
    },
  );

  it.each(["!script test.groovy {", "!script groovy", "!script python {"])(
    "reads %j as a statement",
    (head) => {
      const cst = parseSound(`${head}\n    name value\n}\n`);
      expect(kindsOf(cst.nodes)[0]).toBe("statement:!script");
    },
  );

  it("reads a `!plugin` block as statements, a `!script` inside it as a parameter", () => {
    const cst = parseSound("!plugin com.example.Plugin {\n    !script groovy {\n    }\n}\n");
    expect(nodesOf(cst).map((node) => node.kind)).toEqual(["statement", "statement"]);
  });

  it("reads an inline script whose opening line carries a trailing comment, noting the comment", () => {
    const cst = parseSound("!script groovy { // seeds the model\n    if (x) {\n}\n");
    expect(kindsOf(cst.nodes)).toEqual(["raw"]);
    expect(codesOf(cst)).toEqual(["structurizr-rejects"]);
  });

  it("rejects an inline script that never closes", () => {
    const cst = parseSound("workspace {\n    !script groovy {\n        x\n");
    expect(codesOf(cst)).toEqual(["unclosed-block!", "unclosed-block!"]);
    expect(kindsOf(statementsOf(cst)[0]?.block?.children ?? [])).toEqual(["raw"]);
  });
});
