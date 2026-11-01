import { describe, expect, it } from "vitest";
import { codesOf, kindsOf, parseSound, statementsOf } from "./support/cst.js";

describe("comments (R-DSL §2.3 and the quirks of §17)", () => {
  it.each([
    ["// a comment", "lineComment"],
    ["    # a comment", "lineComment"],
    ["#comment", "lineComment"],
    ["/* one line */", "blockComment"],
    ["  /**/", "blockComment"],
    ["/*/", "blockComment"],
  ])("reads %j as a %s", (text, kind) => {
    expect(kindsOf(parseSound(text).nodes)).toEqual([kind]);
  });

  it("reads `#` inside a line as text", () => {
    const [statement] = statementsOf(parseSound("background #ffffff"));
    expect(statement?.tokens.map((token) => token.value)).toEqual(["background", "#ffffff"]);
  });

  it("reads a block comment over several lines as one node", () => {
    const text = "workspace {\n    /*\n      a = person A\n      }\n    */\n}\n";
    const cst = parseSound(text);
    const children = statementsOf(cst)[0]?.block?.children ?? [];
    expect(kindsOf(children)).toEqual(["blockComment"]);
    expect(text.slice(children[0]?.range.start, children[0]?.range.end)).toBe(
      "    /*\n      a = person A\n      }\n    */",
    );
  });

  it("opens a comment that never closes on `/* a */ b = …`", () => {
    const cst = parseSound('/* a */ b = softwareSystem "B"\nworkspace {\n}\n');
    expect(kindsOf(cst.nodes)).toEqual(["blockComment"]);
    expect(codesOf(cst)).toEqual(["unterminated-comment!"]);
  });

  it("doesn't close on `end */ b = …`", () => {
    const cst = parseSound("/*\nend */ b = x\n*/\nperson A\n");
    expect(kindsOf(cst.nodes)).toEqual(["blockComment", "statement:person"]);
  });

  it("doesn't close on a whole-line comment that ends in `*/`", () => {
    const cst = parseSound("/*\n// end */\n*/\nperson A\n");
    expect(kindsOf(cst.nodes)).toEqual(["blockComment", "statement:person"]);
  });

  it("nests a block comment opened inside another one", () => {
    const cst = parseSound("/*\n/* inner\n*/\nstill a comment\n*/\nperson A\n");
    expect(kindsOf(cst.nodes)).toEqual(["blockComment", "statement:person"]);
    expect(cst.nodes[0]?.range).toEqual({ start: 0, end: 33 });
  });

  it("doesn't nest a one-line block comment inside another one", () => {
    const cst = parseSound("/*\n/* inner */\n*/\nperson A\n");
    expect(kindsOf(cst.nodes)).toEqual(["blockComment", "statement:person"]);
  });

  it("opens a block comment after an assignment, as the reference does", () => {
    const cst = parseSound("x = /* note\nperson A\n*/\n");
    expect(kindsOf(cst.nodes)).toEqual(["blockComment"]);
  });

  it("notes an identifier Structurizr checks inside a block comment", () => {
    const cst = parseSound("/*\nfoo.bar = x\n*/\n");
    expect(codesOf(cst)).toEqual(["structurizr-rejects"]);
    expect(cst.syntaxDiagnostics[0]?.message).toContain("“foo.bar”");
    expect(codesOf(parseSound("/*\nfoo_bar-1 = x\n*/\n"))).toEqual([]);
  });

  it.each([
    ['x = softwareSystem "A" // the shop', ["softwareSystem", "A"], "// the shop"],
    ['x = softwareSystem "A" /* c */', ["softwareSystem", "A"], "/* c */"],
    ['softwareSystem "A" /* open', ["softwareSystem", "A"], "/* open"],
  ])(
    "reads the trailing comment of %j apart, as Structurizr rejects it",
    (text, values, comment) => {
      const cst = parseSound(text);
      const [statement] = statementsOf(cst);
      expect(statement?.tokens.map((token) => token.value)).toEqual(values);
      const range = statement?.trailingComment;
      expect(range && text.slice(range.start, range.end)).toBe(comment);
      expect(codesOf(cst)).toEqual(["structurizr-rejects"]);
      expect(cst.syntaxDiagnostics[0]?.rejects).toBe(false);
    },
  );

  it("opens the block of a statement whose `{` a trailing comment follows", () => {
    const cst = parseSound('s = softwareSystem "A" { // the shop\n    c = container "C"\n}\n');
    const [statement] = statementsOf(cst);
    expect(statement?.block?.children).toHaveLength(1);
    expect(statement?.trailingComment).toBeDefined();
    expect(codesOf(cst)).toEqual(["structurizr-rejects"]);
  });

  it("runs a trailing comment to the end of the line, a `{` after it included", () => {
    const text = 's = softwareSystem "A" {\n    tags "t" // c {\n}\n';
    const cst = parseSound(text);
    const [system, tags] = statementsOf(cst);
    expect(system?.block?.children).toHaveLength(1);
    expect(tags?.block).toBeUndefined();
    const range = tags?.trailingComment;
    expect(range && text.slice(range.start, range.end)).toBe("// c {");
    expect(codesOf(cst)).toEqual(["structurizr-rejects"]);
  });

  it("reads a quoted `//` as a value", () => {
    const [statement] = statementsOf(parseSound('url "//example.com"'));
    expect(statement?.trailingComment).toBeUndefined();
    expect(statement?.tokens[1]?.value).toBe("//example.com");
  });

  it("keeps the text after a closing brace, comment or not", () => {
    const cst = parseSound("workspace {\n}   // done\n");
    expect(statementsOf(cst)[0]?.block?.close).toEqual({
      range: { start: 12, end: 23 },
      indent: "",
      trailing: "   // done",
    });
    expect(codesOf(cst)).toEqual([]);
  });
});
