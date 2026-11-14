import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parse, stringify } from "yaml";
import {
  blockOf,
  columnsOf,
  createEmptyDocument,
  titleOf,
  moveSticky,
  updateSticky,
  validateDocument,
  type CanvasDocument,
  type Sticky,
} from "@miragon/business-model-canvas-schema-model";
import {
  MAX_TEXT_LENGTH,
  parseText,
  readText,
  serializeText,
  type Diagnostic,
} from "../src/index.js";

const example = readFileSync(new URL("../../../example/miragon.bmc", import.meta.url), "utf8");

const roundTrip = (text: string) => serializeText(parseText(text).document);
/** YAML as the serializer writes it. */
const yaml = (value: unknown) => stringify(value, { indent: 2, lineWidth: 0 });
const lines = (...rows: string[]) => `${rows.join("\n")}\n`;
const withoutRange = ({ range: _range, ...finding }: Diagnostic) => finding;
const findingsOf = (text: string) => parseText(text).diagnostics.map(withoutRange);
const errorsOf = (text: string) =>
  findingsOf(text).filter((diagnostic) => diagnostic.severity === "error");
const channels = (...items: unknown[]) => yaml({ version: 1, channels: { items } });
const sticky = (id: string, extra: Partial<Sticky> = {}): Sticky => ({
  id,
  text: id,
  attributes: [],
  notes: [],
  ...extra,
});

describe("the example", () => {
  test("is canonical and parses without findings", () => {
    const { document, diagnostics } = parseText(example);
    expect(diagnostics).toEqual([]);
    expect(serializeText(document)).toBe(example);
    expect(() => validateDocument(document)).not.toThrow();
  });

  test("reads the canvas fields, blocks, colours and notes", () => {
    const { document } = parseText(example);
    expect(titleOf(document)).toBe("Miragon Modeler Suite");
    expect(blockOf(document, "value-propositions")!.items[0]).toMatchObject({ color: "peach" });
    expect(blockOf(document, "value-propositions")!.items[1]).toMatchObject({
      id: "one-look",
      notes: [{ text: "Reason to switch, or nice to have?", attributes: [] }],
    });
    expect(blockOf(document, "cost-structure")!.notes).toEqual([
      { text: "No hosting costs, everything runs locally", attributes: [] },
    ]);
  });

  test("reads the same from its JSON form, since JSON is YAML", () => {
    const asJson = JSON.stringify(parse(example), null, 2);
    expect(parseText(asJson).diagnostics).toEqual([]);
    expect(roundTrip(asJson)).toBe(example);
  });
});

describe("the other canvases of the modeler", () => {
  test.each(["docs/demo/bike-subscription.bmc"])(
    "%s is canonical and parses without findings",
    (path) => {
      const text = readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
      expect(parseText(text).diagnostics).toEqual([]);
      expect(roundTrip(text)).toBe(text);
    },
  );
});

describe("the canonical form", () => {
  test("writes the known fields in a fixed order, the others sorted after them", () => {
    const loose = lines(
      "x-root: 1",
      "channels:",
      "  items:",
      "    - x-b: true",
      "      color: sky",
      "      x-a: [1]",
      "      text: Shop",
      "      id: shop",
      "canvas: { stage: to-be, x-tool: { keep: me }, title: T }",
      "customer-segments:",
      "  items:",
      "    - { id: online, text: Online }",
      "version: 1",
    );
    expect(roundTrip(loose)).toBe(
      lines(
        "version: 1",
        "canvas:",
        "  title: T",
        "  stage: to-be",
        "  x-tool:",
        "    keep: me",
        "customer-segments:",
        "  items:",
        "    - id: online",
        "      text: Online",
        "channels:",
        "  items:",
        "    - id: shop",
        "      text: Shop",
        "      color: sky",
        "      x-a:",
        "        - 1",
        "      x-b: true",
        "x-root: 1",
      ),
    );
    expect(roundTrip(roundTrip(loose))).toBe(roundTrip(loose));
  });

  test("writes the blocks in the method's order, whatever the file's", () => {
    const document: CanvasDocument = {
      header: [],
      notes: [],
      extras: [],
      blocks: (["cost-structure", "customer-segments"] as const).map((blockId) => ({
        blockId,
        items: [],
        notes: [],
        attributes: [],
      })),
    };
    expect(serializeText(document)).toBe(
      lines("version: 1", "customer-segments: {}", "cost-structure: {}"),
    );
  });

  test("keeps any text, quoted where YAML would read it as something else", () => {
    const texts = [
      'say "hi"',
      "a\nb",
      "{id=x}",
      "#1: [MVP]",
      "Free: tier",
      "2026",
      "1.50",
      "true",
      "null",
      "- dash",
      "  spaced  ",
      "Café   😀",
    ];
    const document: CanvasDocument = {
      header: [],
      notes: [],
      extras: [],
      blocks: [
        {
          blockId: "channels",
          items: texts.map((text, index) => sticky(`s${index}`, { text })),
          notes: [],
          attributes: [],
        },
      ],
    };
    const written = serializeText(document);
    expect(parseText(written).diagnostics).toEqual([]);
    expect(parseText(written).document.blocks[0]!.items.map((item) => item.text)).toEqual(texts);
    expect(roundTrip(written)).toBe(written);
  });

  test("keeps a field named __proto__ as a field", () => {
    const text = lines(
      "version: 1",
      "channels:",
      "  items:",
      "    - id: a",
      "      text: A",
      "      __proto__:",
      "        x: 1",
    );
    const [item] = parseText(text).document.blocks[0]!.items;
    expect(item!.attributes).toEqual([{ key: "__proto__", value: { x: 1 } }]);
    expect(roundTrip(text)).toBe(text);
  });

  test("an empty canvas is an empty text, and a new one carries its title", () => {
    expect(parseText("").document).toEqual({ header: [], notes: [], blocks: [], extras: [] });
    expect(parseText("  \n").diagnostics).toEqual([]);
    expect(serializeText(createEmptyDocument("New"))).toBe(
      lines("version: 1", "canvas:", "  title: New"),
    );
  });
});

describe("the canvas fields", () => {
  test("a field the canvas does not know stays as it is, without a finding", () => {
    const text = lines(
      "version: 1",
      "canvas:",
      "  title: Shop",
      "  date: 2026-11-07",
      "  designed-by: Product team",
      "  stage: to-be",
    );
    expect(parseText(text).diagnostics).toEqual([]);
    expect(roundTrip(text)).toBe(text);
  });

  test("a title in numbers or true/false is read as it is written, and written back as text", () => {
    const { document, diagnostics } = parseText(lines("version: 1", "canvas:", "  title: 1.50"));
    expect(diagnostics).toEqual([]);
    expect(titleOf(document)).toBe("1.50");
    expect(roundTrip(lines("version: 1", "canvas:", "  title: true"))).toBe(
      lines("version: 1", "canvas:", '  title: "true"'),
    );
  });

  test("a known field that is no text is an error", () => {
    expect(errorsOf(yaml({ version: 1, canvas: { title: [2] } }))).toEqual([
      { path: ["canvas", "title"], message: "Text: title: ….", severity: "error" },
    ]);
  });

  test("the columns stand after the title, and a count the canvas does not show is an error", () => {
    const text = lines("version: 1", "canvas:", "  title: Shop", "  columns: 3");
    const { document, diagnostics } = parseText(text);
    expect(diagnostics).toEqual([]);
    expect(columnsOf(document)).toBe(3);
    expect(roundTrip(lines("version: 1", "canvas:", "  columns: 4", "  title: Shop"))).toBe(
      lines("version: 1", "canvas:", "  title: Shop", "  columns: 4"),
    );
    for (const columns of [1, 5, "3", 2.5]) {
      expect(errorsOf(yaml({ version: 1, canvas: { columns } }))).toEqual([
        {
          path: ["canvas", "columns"],
          message: "2, 3 or 4 stickies side by side: columns: 3.",
          severity: "error",
        },
      ]);
    }
  });
});

describe("blocks", () => {
  test("a field that names no building block warns and stays", () => {
    const text = yaml({ version: 1, channels: {}, "key-partner": { items: [] } });
    expect(findingsOf(text)).toEqual([
      {
        path: ["key-partner"],
        message: expect.stringContaining("No building block"),
        severity: "warning",
      },
    ]);
    expect(roundTrip(text)).toBe(text);
  });

  test("an unknown field of a block warns and stays", () => {
    const text = yaml({ version: 1, channels: { item: [] } });
    expect(findingsOf(text)[0]).toMatchObject({ path: ["channels", "item"], severity: "warning" });
    expect(roundTrip(text)).toBe(text);
  });

  test("a block or its items of another shape are errors", () => {
    expect(errorsOf(yaml({ channels: "Shop" }))[0]?.message).toMatch(/is a map/);
    expect(errorsOf(yaml({ channels: { items: {} } }))[0]).toMatchObject({
      path: ["channels", "items"],
      message: expect.stringMatching(/^A list of items/),
    });
  });
});

describe("items", () => {
  test("need an id and a text", () => {
    expect(errorsOf(channels({ text: "Shop" }))).toEqual([
      {
        path: ["channels", "items", 0],
        message: "An item needs an id as text: id: shop.",
        severity: "error",
      },
    ]);
    expect(errorsOf(channels({ id: "shop" }))).toEqual([
      {
        path: ["channels", "items", 0],
        message: "An item needs a text: text: ….",
        severity: "error",
      },
    ]);
    expect(errorsOf(channels("Shop"))[0]?.message).toMatch(/An item is a map/);
  });

  test("a duplicate or unusable id is an error at the id of each later item", () => {
    expect(errorsOf(channels({ id: "x", text: "A" }, { id: "x", text: "B" }))).toEqual([
      {
        path: ["channels", "items", 1, "id"],
        message: 'Duplicate sticky id "x", also at channels.items[0].',
        severity: "error",
      },
    ]);
    const thrice = channels({ id: "x", text: "A" }, { id: "x", text: "B" }, { id: "x", text: "C" });
    expect(errorsOf(thrice).map((error) => error.path)).toEqual([
      ["channels", "items", 1, "id"],
      ["channels", "items", 2, "id"],
    ]);
    expect(errorsOf(channels({ id: "two words", text: "A" }))[0]?.message).toMatch(/no usable id/);
    expect(errorsOf(channels({ id: ["x"], text: "A" }))[0]?.message).toMatch(/needs an id as text/);
  });

  test("a number as id or text is the text it is written as", () => {
    const text = lines("version: 1", "channels:", "  items:", "    - id: 7", "      text: 2026");
    expect(parseText(text).document.blocks[0]!.items[0]).toMatchObject({ id: "7", text: "2026" });
    expect(roundTrip(text)).toBe(
      lines("version: 1", "channels:", "  items:", '    - id: "7"', '      text: "2026"'),
    );
  });

  test("an unknown colour warns and stays", () => {
    const text = channels({ id: "shop", text: "Shop", color: "teal" });
    const { document, diagnostics } = parseText(text);
    expect(diagnostics.map((diagnostic) => diagnostic.severity)).toEqual(["warning"]);
    expect(document.blocks[0]!.items[0]!.color).toBeUndefined();
    expect(roundTrip(text)).toBe(text);
  });

  test("an item field the canvas does not know stays, without a finding", () => {
    const text = channels({ id: "shop", text: "Shop", "x-owner": "sales", "x-tags": ["online"] });
    const { document, diagnostics } = parseText(text);
    expect(diagnostics).toEqual([]);
    expect(document.blocks[0]!.items[0]!.attributes.map(({ key }) => key)).toEqual([
      "x-owner",
      "x-tags",
    ]);
    expect(roundTrip(text)).toBe(text);
  });

  test("a colour the canvas sets replaces an unknown one", () => {
    const { document } = parseText(channels({ id: "shop", text: "Shop", color: "teal" }));
    const coloured = updateSticky(document, "shop", (item) => ({ ...item, color: "sun" }));
    expect(serializeText(coloured)).toBe(channels({ id: "shop", text: "Shop", color: "sun" }));
  });

  test("an unquoted hex colour is a comment: no colour, with a hint, and none written", () => {
    const text = lines(
      "version: 1",
      "channels:",
      "  items:",
      "    - id: shop",
      "      text: Shop",
      "      color: #F6C8B8",
    );
    const { document, diagnostics } = parseText(text);
    expect(document.blocks[0]!.items[0]!.color).toBeUndefined();
    expect(diagnostics.map(withoutRange)).toContainEqual({
      path: ["channels", "items", 0, "color"],
      message: 'No colour. A hex colour needs quotes, # starts a comment: color: "#RRGGBB".',
      severity: "warning",
    });
    expect(roundTrip(text)).not.toContain("color");
  });

  test("take a palette name or a hex colour of the person's own, quoted for its #", () => {
    const text = channels({ id: "shop", text: "Shop", color: "#F6C8B8" });
    expect(text).toContain('color: "#F6C8B8"');
    expect(parseText(text).document.blocks[0]!.items[0]!.color).toBe("#F6C8B8");
    expect(roundTrip(text)).toBe(text);
  });
});

describe("notes", () => {
  test("of an item belong to it, of a block to the block, and keep their own fields", () => {
    const text = yaml({
      version: 1,
      channels: {
        items: [{ id: "shop", text: "Shop", notes: [{ text: "Costly", by: "AI" }] }],
        notes: [{ text: "No partner channel" }],
      },
    });
    const [block] = parseText(text).document.blocks;
    expect(block!.items[0]!.notes).toEqual([
      { text: "Costly", attributes: [{ key: "by", value: "AI" }] },
    ]);
    expect(block!.notes).toEqual([{ text: "No partner channel", attributes: [] }]);
    expect(roundTrip(text)).toBe(text);
  });

  test("on the canvas as a whole stand in canvas.notes, after its fields", () => {
    const text = yaml({
      version: 1,
      canvas: { title: "Shop", notes: [{ text: "Pricing open" }, { text: "Draft" }] },
    });
    const { document, diagnostics } = parseText(text);
    expect(diagnostics).toEqual([]);
    expect(document.header).toEqual([{ key: "title", value: "Shop" }]);
    expect(document.notes).toEqual([
      { text: "Pricing open", attributes: [] },
      { text: "Draft", attributes: [] },
    ]);
    expect(roundTrip(text)).toBe(text);
    expect(roundTrip(yaml({ version: 1, canvas: { notes: [{ text: "Only a note" }] } }))).toBe(
      yaml({ version: 1, canvas: { notes: [{ text: "Only a note" }] } }),
    );
  });

  test("without a text, or not in a list, are an error", () => {
    expect(errorsOf(yaml({ canvas: { notes: "Pricing" } }))).toHaveLength(1);
    expect(errorsOf(yaml({ channels: { notes: [{ by: "AI" }] } }))).toHaveLength(1);
    expect(errorsOf(yaml({ channels: { notes: { text: "x" } } }))).toHaveLength(1);
  });

  test("move with their item", () => {
    const text = channels(
      { id: "shop", text: "Shop", notes: [{ text: "Works" }] },
      { id: "fair", text: "Fair" },
    );
    const moved = moveSticky(parseText(text).document, "shop", "key-partners", 0);
    expect(blockOf(moved, "key-partners")!.items[0]!.notes).toEqual([
      { text: "Works", attributes: [] },
    ]);
  });
});

describe("values kept without being read", () => {
  test("a number the canvas cannot keep, or a nesting deeper than the limit, is an error", () => {
    expect(errorsOf(lines("channels:", "  items:", "    - { id: a, text: A, x: .inf }"))).toEqual([
      {
        path: ["channels", "items", 0, "x"],
        message: "A number the canvas cannot keep, such as .inf or .nan.",
        severity: "error",
      },
    ]);
    expect(
      errorsOf('{"channels": {"items": [{"id": "a", "text": "A", "x": 1e400}]}}'),
    ).toHaveLength(1);
    const deep = `x: ${"[".repeat(40)}${"]".repeat(40)}\n`;
    expect(errorsOf(deep)[0]!.message).toMatch(/Nests deeper than/);
    const deeper = `x: ${"[".repeat(5_000)}${"]".repeat(5_000)}\n`;
    expect(errorsOf(deeper)[0]!.message).toMatch(/Nests deeper than/);
  });

  test("an unknown colour keeps its place among the known fields", () => {
    const text = channels({
      id: "shop",
      text: "Shop",
      color: "teal",
      notes: [{ text: "Works" }],
    });
    expect(roundTrip(text)).toBe(text);
  });
});

describe("what YAML has and the format has not", () => {
  test("a comment warns at its place, a # in a text is none", () => {
    const text = lines(
      "# from the workshop",
      "version: 1",
      "channels:",
      "  items:",
      "    - id: shop # the web shop",
      '      text: "Shop #1"',
    );
    const { document, diagnostics } = parseText(text);
    expect(document.blocks[0]!.items[0]!.text).toBe("Shop #1");
    expect(diagnostics).toEqual([
      {
        path: [],
        message: "Comments are not kept when the canvas saves; write a note instead.",
        severity: "warning",
        range: [0, "# from the workshop".length],
      },
      {
        path: [],
        message: "Comments are not kept when the canvas saves; write a note instead.",
        severity: "warning",
        range: [text.indexOf("# the"), text.indexOf("# the") + "# the web shop".length],
      },
    ]);
  });

  test("anchors, aliases and tags are errors, the first one reported", () => {
    const anchored = lines(
      "version: 1",
      "channels:",
      "  items:",
      "    - &shop { id: a, text: A }",
      "    - *shop",
    );
    expect(errorsOf(anchored).map((error) => error.message)).toEqual([
      "Anchors such as &shop are no part of the format.",
    ]);
    const aliases = lines("version: 1", "a: &x 1", `b: [${Array(1000).fill("*x").join(", ")}]`);
    expect(errorsOf(aliases)).toHaveLength(1);
    expect(errorsOf(lines("version: 1", "canvas: !x { title: T }"))[0]?.message).toBe(
      "Tags such as !x are no part of the format.",
    );
    expect(errorsOf(lines("version: 1", "canvas: &c { title: T }"))[0]?.message).toMatch(/&c/);
    expect(errorsOf(lines("version: 1", "canvas:", "  title: !secret T"))[0]?.message).toBe(
      "Tags such as !secret are no part of the format.",
    );
  });

  test("a key written twice in one map is an error", () => {
    const text = lines("version: 1", "canvas:", "  title: A", "  title: B");
    const [error] = parseText(text).diagnostics;
    expect(error).toMatchObject({
      message: 'The key "title" is written twice.',
      severity: "error",
    });
    expect(error!.range[0]).toBe(text.lastIndexOf("title"));
  });

  test('so are two keys that read as one, such as 1 and "1"', () => {
    for (const [first, second] of [
      ["1", '"1"'],
      ["true", '"true"'],
      ["~", '""'],
    ]) {
      const text = lines("version: 1", "canvas:", `  ${first}: p`, `  ${second}: q`);
      expect(errorsOf(text)[0]?.message).toMatch(/is written twice/);
    }
  });

  test("a number as a key keeps its place among the foreign fields and its finding's place", () => {
    const text = lines("version: 1", "canvas:", "  title: T", "  b: 1", "  2: x", "  3: .inf");
    const [error] = parseText(text).diagnostics;
    expect(text.slice(...error!.range)).toBe(".inf");
    const kept = lines("version: 1", "canvas:", "  title: T", "  b: 1", "  2: x");
    expect(roundTrip(kept)).toBe(
      lines("version: 1", "canvas:", "  title: T", '  "2": x', "  b: 1"),
    );
    expect(roundTrip(lines("x-1: a", "1: b", "version: 1"))).toBe(
      lines("version: 1", '"1": b', "x-1: a"),
    );
  });
});

describe("texts that would cost too much", () => {
  test("a text longer than the limit is an error before anything is read", () => {
    const text = `version: 1\nx: "${"a".repeat(MAX_TEXT_LENGTH)}"\n`;
    expect(errorsOf(text)).toEqual([
      { path: [], message: "A canvas text is at most 1,048,576 characters.", severity: "error" },
    ]);
  });

  test("flow lists nested deeper than the limit are found by the lexer, quickly", () => {
    const started = performance.now();
    expect(errorsOf(`k: ${"[".repeat(MAX_TEXT_LENGTH - 10)}`)[0]?.message).toMatch(/Nests deeper/);
    expect(performance.now() - started).toBeLessThan(200);
    expect(errorsOf(`k: ${"[".repeat(33)}${"]".repeat(33)}\n`)[0]?.message).toMatch(/Nests deeper/);
  });

  test("many keys and many findings stay quick, and the findings stop at a hundred", () => {
    const keys = Array.from({ length: 20_000 }, (_, index) => `k${index}: ${index}`);
    const text = lines("version: 1", ...keys);
    const started = performance.now();
    const { diagnostics } = parseText(text);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(diagnostics).toHaveLength(100);
  });

  test("an error after a hundred warnings still makes the text no canvas", () => {
    const comments = Array.from({ length: 150 }, () => "# note");
    expect(() => readText(lines(...comments, "version: 2"))).toThrow(/reads version: 1/);
  });
});

describe("texts that are no canvas", () => {
  test("text that is no YAML is an error at its place", () => {
    const text = lines("version: 1", "channels: [a, b");
    const [error] = parseText(text).diagnostics;
    expect(error).toMatchObject({ path: [], severity: "error" });
    expect(error!.message).toMatch(/^The text is no YAML/);
    expect(error!.range[0]).toBeGreaterThan(text.indexOf("["));
  });

  test("lone carriage returns are line breaks, as YAML has them", () => {
    const text = lines("version: 1", "canvas:", "  title: T").replace(/\n/g, "\r");
    expect(parseText(text).diagnostics).toEqual([]);
    expect(roundTrip(text)).toBe(lines("version: 1", "canvas:", "  title: T"));
  });

  test("a byte order mark before the text is no mistake", () => {
    expect(parseText(`\uFEFF${example}`).diagnostics).toEqual([]);
  });

  test("a list at the root, another version or several YAML documents are errors", () => {
    expect(errorsOf("- a\n")[0]?.message).toMatch(/A canvas is a YAML map/);
    expect(errorsOf("version: 2\n")).toEqual([
      { path: ["version"], message: "The modeler reads version: 1, not 2.", severity: "error" },
    ]);
    expect(errorsOf("---\ntitle: A\n---\ntitle: B\n")).toHaveLength(1);
  });

  test("leave an empty document, and readText throws with every error", () => {
    const text = channels({ text: "A" }, { text: "B" });
    expect(parseText(text).document).toEqual({ header: [], notes: [], blocks: [], extras: [] });
    expect(() => readText(text)).toThrow(/channels\.items\[0\]: .*channels\.items\[1\]: /);
  });
});

describe("places in the text", () => {
  test("a finding covers the value its path names, a missing field the map that lacks it", () => {
    const text = lines(
      "version: 1",
      "channels:",
      "  items:",
      "    - id: shop",
      "      text: Shop",
      "      color: teal",
      "    - text: No id",
    );
    const [colour, id] = parseText(text).diagnostics;
    expect(text.slice(...colour!.range)).toBe("teal");
    expect(id!.range[0]).toBe(text.indexOf("text: No id"));
  });
});

describe("large texts", () => {
  const withinASecond = (run: () => unknown) => {
    const started = performance.now();
    run();
    expect(performance.now() - started).toBeLessThan(1000);
  };

  test("many items, with a finding at the last", () => {
    const items = Array.from({ length: 5_000 }, (_, index) => ({ id: `s${index}`, text: "Same" }));
    const text = channels(...items, { id: "last", text: "Last", color: "teal" });
    withinASecond(() => serializeText(parseText(text).document));
    expect(roundTrip(roundTrip(text))).toBe(roundTrip(text));
    expect(parseText(text).diagnostics[0]?.path).toEqual(["channels", "items", 5_000, "color"]);
  });

  test("a long text of spaces and braces", () => {
    withinASecond(() => parseText(channels({ id: "a", text: `${" {".repeat(50_000)}x` })));
  });
});
