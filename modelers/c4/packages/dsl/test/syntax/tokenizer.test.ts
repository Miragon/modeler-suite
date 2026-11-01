import { describe, expect, it } from "vitest";
import { escapedText } from "../../src/syntax/index.js";
import { parseSound, statementsOf, statementValues, valuesOf } from "./support/cst.js";

function only(text: string) {
  const [statement] = statementsOf(parseSound(text));
  if (!statement) {
    throw new Error(`no statement in ${JSON.stringify(text)}`);
  }
  return statement;
}

describe("the tokenizer (R-DSL §2.4)", () => {
  it.each([
    ['softwareSystem "Name" "Description"', ["softwareSystem", "Name", "Description"]],
    ['"x""y"', ["x", "y"]],
    ['foo"bar"baz', ['foo"bar"baz']],
    ['foo"bar baz"', ['foo"bar', 'baz"']],
    ['person ""', ["person", ""]],
    ['person "a \\"b\\" c"', ["person", 'a "b" c']],
    ['person "line\\nbreak"', ["person", "line\nbreak"]],
    ['person "tab\\tstays"', ["person", "tab\\tstays"]],
    ['person "C:\\" next', ["person", 'C:" next']],
    ['person "unterminated', ["person", "unterminated"]],
    ["a->b", ["a->b"]],
    ["a -> b", ["a", "->", "b"]],
    ["a\u2003b\u3000c", ["a", "b", "c"]],
    ["a\u00a0b\u2007c\u202fd", ["a\u00a0b\u2007c\u202fd"]],
    ["a\tb\u000bc\u001fd", ["a", "b", "c", "d"]],
    ["\u0000foo\u0000", ["foo"]],
    ["foo \u0000 bar", ["foo", "\u0000", "bar"]],
    ["a;b ;", ["a;b", ";"]],
  ])("splits %j into %j", (text, values) => {
    expect(statementValues(text)).toEqual([values]);
  });

  it("keeps each token's raw text, quotes included, and its source range", () => {
    const text = '    person   "A b"  x\\"y';
    const tokens = only(text).tokens;
    expect(tokens.map((token) => [token.raw, token.quoted])).toEqual([
      ["person", false],
      ['"A b"', true],
      ['x\\"y', false],
    ]);
    expect(tokens.map((token) => text.slice(token.range.start, token.range.end))).toEqual(
      tokens.map((token) => token.raw),
    );
    expect(tokens[2]?.value).toBe('x"y');
  });

  it("hands out the text before escapes resolve, for substitution in Structurizr's order", () => {
    const [, token] = only('person "a\\"${NAME}\\n"').tokens;
    expect(token?.value).toBe('a"${NAME}\n');
    expect(token && escapedText(token)).toBe('a\\"${NAME}\\n');
  });

  it.each([
    ["${NAME}", true],
    ["x-${a.b_c-1}-y", true],
    ["$NAME", false],
    ["${}", false],
    ["${a b}", false],
    ["${a", false],
  ])("marks %j as substituting: %s", (value, substitutes) => {
    expect(only(`person "${value}"`).tokens[1]?.substitutes).toBe(substitutes);
  });

  it("reads `x = …` as an assignment only with at least three tokens and `=` second", () => {
    expect(only('a = person "A"').assignee?.value).toBe("a");
    expect(valuesOf(only('a = person "A"'))).toEqual(["person", "A"]);
    expect(only("a = b").assignee?.value).toBe("a");
    expect(only("a =").assignee).toBeUndefined();
    expect(valuesOf(only("a ="))).toEqual(["a", "="]);
    expect(only('a "=" person').assignee?.value).toBe("a");
    expect(only("a=person").assignee).toBeUndefined();
  });

  it("puts the head from the first token to the last, the block's `{` included", () => {
    const text = '  a = softwareSystem "A" {\n  }';
    const statement = only(text);
    expect(text.slice(statement.head.start, statement.head.end)).toBe('a = softwareSystem "A" {');
    expect(statement.indent).toBe("  ");
  });
});
